import type { BaseType, GameVersion } from "@/assets/data/interfaces";
import { Host } from "./IPC";

const SECONDS_PER_HOUR = 3600;
const CHAOS_ID = "Metadata/Items/Currency/CurrencyRerollRare";
const DIVINE_ID = "Metadata/Items/Currency/CurrencyModValues";
type ExchangeIds = Record<string, readonly string[]>;

interface ExchangeMarket {
  league: string;
  market_pair: string[];
  volume_traded: Record<string, number>;
}

interface ExchangeDigest {
  next_change_id: number;
  markets: ExchangeMarket[];
}

interface ExchangeItem {
  ns: BaseType["namespace"];
  name: string;
}

interface ExchangeQuote extends ExchangeItem {
  cx: true;
  variant?: never;
  primaryValue: number;
  exchangeHour: number;
  url: string;
}

export interface ExchangePrices {
  prices: Map<string, ExchangeQuote>;
  items: Map<string, ExchangeItem>;
}

export function exchangeKey({ ns, name }: { ns: string; name: string }) {
  return ns + ":" + name;
}

function digestEndpoint(game: GameVersion, hour: number) {
  const realm = game === "poe2" ? "poe2/" : "";
  return `web.poecdn.com/api/currency-exchange/${realm}${hour}`;
}

interface ExchangePair {
  item: string;
  itemVolume: number;
  quoteVolume: number;
}

function ratesFromPairs(pairs: Map<string, ExchangePair[]>, base: string) {
  if (!pairs.has(base)) return new Map<string, number>();

  const rates = new Map([[base, 1]]);
  let frontier = new Map([[base, { price: 1, turnover: Infinity }]]);
  // Prefer a direct pair. For equally short routes, use the one with greater
  // traded value at its least liquid step, measured in the same base currency.
  while (frontier.size) {
    const next = new Map<string, { price: number; turnover: number }>();
    for (const [quote, { price, turnover }] of frontier) {
      for (const pair of pairs.get(quote) ?? []) {
        if (rates.has(pair.item)) continue;
        const value = price * (pair.quoteVolume / pair.itemVolume);
        const volume = Math.min(turnover, price * pair.quoteVolume);
        if (Number.isFinite(value) && value > 0 && volume > (next.get(pair.item)?.turnover ?? 0)) {
          next.set(pair.item, { price: value, turnover: volume });
        }
      }
    }
    for (const [id, rate] of next) rates.set(id, rate.price);
    frontier = next;
  }
  return rates;
}

function addHour({ prices, items }: ExchangePrices, itemIds: ExchangeIds, game: GameVersion, league: string, hour: number, markets: ExchangeMarket[]) {
  const pairs = new Map<string, ExchangePair[]>();
  const tradedItems = new Map<string, ExchangeItem>();
  function addPair(quote: string, pair: ExchangePair) {
    const neighbors = pairs.get(quote) ?? [];
    neighbors.push(pair);
    pairs.set(quote, neighbors);
  }
  for (const market of markets) {
    if (market.league !== league || market.market_pair.length !== 2) continue;
    const [a, b] = market.market_pair;
    for (const id of [a, b]) {
      if (tradedItems.has(id)) continue;
      const match = itemIds[id];
      if (!match) continue;
      const [name, namespace = "ITEM"] = match;
      const item = { name, ns: namespace as ExchangeItem["ns"] };
      items.set(exchangeKey(item), item);
      tradedItems.set(id, item);
    }
    const aVolume = market.volume_traded[a];
    const bVolume = market.volume_traded[b];
    if (!Number.isFinite(aVolume) || !Number.isFinite(bVolume) || aVolume <= 0 || bVolume <= 0) continue;
    addPair(a, { item: b, itemVolume: bVolume, quoteVolume: aVolume });
    addPair(b, { item: a, itemVolume: aVolume, quoteVolume: bVolume });
  }

  const base = game === "poe1" ? CHAOS_ID : DIVINE_ID;
  const url = "https://" + digestEndpoint(game, hour);
  for (const [id, primaryValue] of ratesFromPairs(pairs, base)) {
    const item = tradedItems.get(id);
    if (!item) continue;
    const key = exchangeKey(item);
    if (!prices.has(key)) prices.set(key, { ...item, primaryValue, cx: true, exchangeHour: hour, url });
  }
}

const completedHours = new Map<string, ExchangeMarket[]>();

export async function loadCurrencyExchange(game: GameVersion, league: string, signal: AbortSignal): Promise<ExchangePrices> {
  const result: ExchangePrices = { prices: new Map(), items: new Map() };
  const { default: itemIds } = await (game === "poe1"
    ? import("@/assets/data/exchange-ids-poe1.json")
    : import("@/assets/data/exchange-ids-poe2.json"));
  const currentHour = Math.floor(Date.now() / 1000 / SECONDS_PER_HOUR) * SECONDS_PER_HOUR;
  const hours = [currentHour - SECONDS_PER_HOUR, currentHour - 2 * SECONDS_PER_HOUR];
  for (const endpoint of completedHours.keys()) {
    if (!hours.some(hour => endpoint.endsWith("/" + hour))) completedHours.delete(endpoint);
  }

  let rateLimited = false;
  // Use the previous digest for items that did not trade in the most recent hour.
  for (const hour of hours) {
    if (signal.aborted) break;
    const endpoint = digestEndpoint(game, hour);
    let markets = completedHours.get(endpoint);
    if (!markets) {
      if (rateLimited) continue;
      try {
        const response = await Host.proxy(endpoint, { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) });
        if (response.status === 429) {
          rateLimited = true;
          continue;
        }
        if (!response.ok) continue;
        const digest: ExchangeDigest = await response.json();
        if (signal.aborted || !Array.isArray(digest.markets)) continue;
        markets = digest.markets.map(market => ({
          league: market.league,
          market_pair: market.market_pair,
          volume_traded: market.volume_traded,
        }));
        if (digest.next_change_id > hour) completedHours.set(endpoint, markets);
      } catch (error) {
        if (!signal.aborted) console.warn("Currency Exchange digest unavailable", error);
        continue;
      }
    }
    addHour(result, itemIds, game, league, hour, markets);
  }
  return result;
}
