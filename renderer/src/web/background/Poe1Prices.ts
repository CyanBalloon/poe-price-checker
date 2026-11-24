import { Host } from "./IPC";
import { itemCatalogue } from "@/assets/data";
import type { VisceraImplicit } from "@/assets/data/interfaces";
import { exchangeKey, loadCurrencyExchange } from "./CurrencyExchange";

const STASH_CATEGORIES = [
  ["Currency", "ITEM", "currency"],
  ["Fragment", "ITEM", "fragments"],
  ["SkillGem", "GEM", "skill-gems"],
  ["Wombgift", "ITEM", "wombgifts"],
  ["Viscera", "ITEM", "viscera"],
  ["Corpse", "ITEM", "corpses"],
  ["Incubator", "ITEM", "incubators"],
  ["BaseType", "ITEM", "base-types"],
  ["Map", "ITEM", "maps"],
  ["BlightedMap", "ITEM", "blighted-maps"],
  ["BlightRavagedMap", "ITEM", "blight-ravaged-maps"],
  ["Invitation", "ITEM", "invitations"],
  ["UniqueMap", "UNIQUE", "unique-maps"],
  ["UniqueJewel", "UNIQUE", "unique-jewels"],
  ["UniqueFlask", "UNIQUE", "unique-flasks"],
  ["UniqueWeapon", "UNIQUE", "unique-weapons"],
  ["UniqueArmour", "UNIQUE", "unique-armours"],
  ["UniqueAccessory", "UNIQUE", "unique-accessories"],
  ["UniqueTincture", "UNIQUE", "unique-tinctures"],
  ["UniqueRelic", "UNIQUE", "unique-relics"],
] as const;

interface Sparkline {
  totalChange: number;
  data: Array<number | null>;
}

interface StashLine {
  implicitModifiers?: Array<{ text: string }>;
  name?: string;
  currencyTypeName?: string;
  detailsId: string;
  chaosValue?: number;
  chaosEquivalent?: number;
  baseType?: string;
  variant?: string;
  gemLevel?: number;
  gemQuality?: number;
  corrupted?: boolean;
  mapTier?: number;
  links?: number;
  sparkline?: Sparkline;
  paySparkLine?: Sparkline;
  receiveSparkLine?: Sparkline;
}

interface PriceKey {
  ns: string;
  name: string;
  variant?: string;
}

interface StashPrice extends PriceKey {
  cx: boolean;
  chaos: number;
  url: string;
  sparkline: Sparkline;
  exchangeHour?: number;
}

const EMPTY_SPARKLINE: Sparkline = { totalChange: 0, data: [] };

export function poe1PriceKey({ ns, name, variant }: PriceKey) {
  return JSON.stringify([ns, name, variant]);
}

function stashVariant(type: string, line: StashLine) {
  if (type === "SkillGem") {
    return String(line.gemLevel ?? 1) + (line.gemQuality ? "/" + line.gemQuality : "") + (line.corrupted ? "c" : "");
  }
  if (type === "Map" || type === "BlightedMap" || type === "BlightRavagedMap") {
    return line.mapTier ? "T" + line.mapTier : undefined;
  }
  if (type.startsWith("Unique")) {
    const base = type === "UniqueFlask" || type === "UniqueMap" ? undefined : line.baseType;
    return [line.variant, base, line.links ? line.links + "L" : undefined].filter(Boolean).join(", ") || undefined;
  }
  return line.variant;
}

export async function loadPoe1Prices(league: string, signal: AbortSignal, includeStash = true) {
  const base = "poe.ninja/poe1/api/economy/";
  const leagueSlug = league.startsWith("Hardcore ")
    ? league.slice("Hardcore ".length).toLowerCase().replace(/\s+/g, "") + "hc"
    : league.toLowerCase().replace(/\s+/g, "");
  const site = "https://poe.ninja/poe1/economy/" + leagueSlug + "/";
  const prices = new Map<string, StashPrice>();
  const names = new Map<string, PriceKey>();
  const visceraImplicits = new Map<string, VisceraImplicit[]>();
  const exchangePromise = loadCurrencyExchange("poe1", league, signal);
  const stashSignal = AbortSignal.any([signal, AbortSignal.timeout(12000)]);
  function add(entry: StashPrice) {
    prices.set(poe1PriceKey(entry), entry);
    const { ns, name, variant } = entry;
    const key = poe1PriceKey({ ns, name });
    if (!names.has(key) || !variant) names.set(key, { ns, name, variant });
  }

  async function overview<T>(path: string, type: string): Promise<T> {
    const params = new URLSearchParams({ league, type });
    const response = await Host.proxy(base + path + "?" + params, { signal: stashSignal });
    if (!response.ok) throw new Error("poe.ninja returned " + response.status + " for " + type);
    return response.json();
  }

  const tasks = (includeStash ? STASH_CATEGORIES : []).map(([type, ns, category]) => async () => {
    const group = type === "Currency" || type === "Fragment" ? "currency" : "item";
    const { lines } = await overview<{ lines: StashLine[] }>("stash/current/" + group + "/overview", type);
    for (const line of lines) {
      const name = line.name ?? line.currencyTypeName;
      const chaos = line.chaosValue ?? line.chaosEquivalent;
      if (!name || chaos == null || !Number.isFinite(chaos)) continue;
      if (itemCatalogue.value.exchange.has(name)) continue;
      if (type === "Viscera" && line.variant && line.implicitModifiers?.length) {
        const variants = visceraImplicits.get(name) ?? [];
        if (!variants.some(implicit => implicit.variant === line.variant)) {
          variants.push({ text: line.implicitModifiers.map(mod => mod.text).join("\n"), variant: line.variant });
          visceraImplicits.set(name, variants);
        }
      }
      add({
        ns, name, chaos, cx: false, variant: stashVariant(type, line),
        url: site + category + "/" + line.detailsId,
        sparkline: line.sparkline ?? line.receiveSparkLine ?? line.paySparkLine ?? EMPTY_SPARKLINE,
      });
    }
  });

  const batchSize = 4;
  for (let i = 0; i < tasks.length; i += batchSize) {
    if (stashSignal.aborted) break;
    const results = await Promise.allSettled(tasks.slice(i, i + batchSize).map((task) => task()));
    if (!signal.aborted) {
      for (const result of results) {
        if (result.status === "rejected") console.warn(result.reason);
      }
    }
  }
  const exchange = await exchangePromise;
  for (const [key, price] of prices) {
    if (exchange.items.has(exchangeKey(price))) prices.delete(key);
  }
  for (const item of exchange.items.values()) names.set(poe1PriceKey(item), item);
  for (const quote of exchange.prices.values()) {
    add({ ...quote, chaos: quote.primaryValue, sparkline: EMPTY_SPARKLINE });
  }
  return { prices, names, visceraImplicits, exchange };
}
