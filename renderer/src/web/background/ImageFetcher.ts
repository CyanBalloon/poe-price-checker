import { itemIconKey, legacyItemIcon } from "@ipc/item-icons";
import { ItemInfluence } from "@/parser/ParsedItem";
import { itemInfluences, readListingInfluences, type ListingInfluences } from "@/parser/item-influences";
import { Host } from "./IPC";
import { AppConfig } from "@/web/Config";
import type { GameVersion } from "@ipc/types";
import { getTradeEndpointPath } from "@/web/price-check/trade/common";

const CACHE_KEY = "exchanged-dynamic-icons";
let cache: Record<string, string> = {};
try {
  cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  // Clear out any previously saved 404s from permanent storage
  let needsSave = false;
  for (const key of Object.keys(cache)) {
    if (cache[key] === "404") {
      Reflect.deleteProperty(cache, key);
      needsSave = true;
    }
  }
  if (needsSave) {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  }
} catch {
  cache = {};
}

interface FetchRequest {
  key: string;
  game: GameVersion;
  itemName: string;
  namespace: string;
  influences: readonly ItemInfluence[];
  resolve: (url: string | null) => void;
}

const queue: FetchRequest[] = [];
const pending = new Map<string, Promise<string | null>>();
const retryAfter = new Map<string, number>();
let isProcessing = false;

function saveCache() {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

export async function getDynamicIcon(itemName: string, namespace: string, influences: readonly ItemInfluence[] = []): Promise<string | null> {
  const { game } = AppConfig();
  const flags = game === "poe1" ? influences : [];
  const key = itemIconKey(game, namespace, itemName, flags);
  const cached = cache[key] ?? (!flags.length ? legacyItemIcon(cache[itemName], game) : undefined);
  if (cached) return cached === "404" ? null : cached;
  if ((retryAfter.get(key) ?? 0) > Date.now()) return null;

  const previous = pending.get(key);
  if (previous) return previous;
  const result = new Promise<string | null>(resolve => {
    queue.push({ key, game, itemName, namespace, influences: flags, resolve });
    processQueue();
  });
  pending.set(key, result);
  try {
    return await result;
  } finally {
    pending.delete(key);
  }
}

async function processQueue() {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;

  while (queue.length > 0) {
    const req = queue.shift()!;
    
    // Check if another request fetched it while it was in queue
    if (cache[req.key]) {
      req.resolve(cache[req.key] === "404" ? null : cache[req.key]);
      continue;
    }

    try {
      const url = await fetchIconFromTradeApi(req);
      if (url) {
        cache[req.key] = url;
        retryAfter.delete(req.key);
        saveCache();
        req.resolve(url);
      } else {
        if (req.influences.length) retryAfter.set(req.key, Date.now() + 60_000);
        else cache[req.key] = "404";
        req.resolve(null);
      }
    } catch (e) {
      console.warn("Dynamic image fetch failed for", req.itemName, e);
      req.resolve(null);
    }

    // Wait 1.5 seconds between requests to avoid strict rate limits
    if (queue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  isProcessing = false;
}

export function iconSearchQuery(itemName: string, namespace: string, influences: readonly ItemInfluence[]) {
  const identity = namespace === "UNIQUE" ? { name: itemName } : { type: itemName };
  const status = { option: "any" };
  if (!influences.length) return { ...identity, status, stats: [{ type: "and", filters: [] }] };

  const required: Array<{ id: string }> = [];
  const excluded: Array<{ id: string }> = [];
  for (const { value, key } of itemInfluences) {
    if (key === "searing" || key === "tangled") continue;
    const group = influences.includes(value) ? required : excluded;
    group.push({ id: "pseudo.pseudo_has_" + key + "_influence" });
  }
  const stats = [{ type: "and", filters: required }];
  if (excluded.length) stats.push({ type: "not", filters: excluded });
  return { ...identity, status, stats, filters: {
    type_filters: { filters: { rarity: { option: namespace === "UNIQUE" ? "unique" : "nonunique" } } },
    misc_filters: { filters: {
      searing_item: { option: String(influences.includes(ItemInfluence.SearingExarch)) },
      tangled_item: { option: String(influences.includes(ItemInfluence.EaterOfWorlds)) },
    } },
  } };
}

async function fetchIconFromTradeApi({ game, itemName, namespace, influences }: FetchRequest): Promise<string | null> {
  const tradeApi = "www.pathofexile.com/api/" + getTradeEndpointPath(game);
  const query = iconSearchQuery(itemName, namespace, influences);

  const payload = {
    query,
    sort: { price: "asc" }
  };

  const searchRes = await Host.proxy(`${tradeApi}/search/${game === "poe1" ? "" : "poe2/"}Standard`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "PoePriceChecker/1.1"
    },
    body: JSON.stringify(payload)
  });

  if (!searchRes.ok) {
    if (searchRes.status === 429) {
      console.warn("Trade API rate limit hit!");
      // Sleep extra if rate limited
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    return null;
  }

  const searchData = await searchRes.json();
  if (!searchData.result || searchData.result.length === 0) {
    return null;
  }

  const fetchIds = searchData.result.slice(0, 5).join(",");
  const queryId = searchData.id;

  const fetchRes = await Host.proxy(`${tradeApi}/fetch/${fetchIds}?query=${queryId}`, {
    method: "GET",
    headers: {
      "User-Agent": "PoePriceChecker/1.1"
    }
  });

  if (!fetchRes.ok) return null;

  const fetchData = await fetchRes.json();
  for (const result of fetchData.result ?? []) {
    const icon = matchingTradeIcon(result.item, namespace, [itemName], influences);
    if (icon) return icon;
  }
  return null;
}

export function matchingTradeIcon(
  item: (ListingInfluences & { icon?: string; name?: string; baseType?: string; typeLine?: string; frameType?: number }) | undefined,
  namespace: string,
  names: string[],
  expected: readonly ItemInfluence[] = [],
) {
  if (!item?.icon || item.icon === "%NOT_FOUND%") return;
  const actual = readListingInfluences(item);
  if (actual.length !== expected.length || !actual.every(flag => expected.includes(flag))) return;
  if (expected.length && !item.icon.startsWith("https://web.poecdn.com/")) return;
  const unique = namespace === "UNIQUE";
  if (!unique && item.frameType === 3) return;
  const candidates = unique ? [item.name] : [item.baseType, item.typeLine];
  if (candidates.some(name => name && names.includes(name))) return item.icon;
}
