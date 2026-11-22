import { itemIconKey, legacyItemIcon } from "@ipc/item-icons";
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
  resolve: (url: string | null) => void;
}

const queue: FetchRequest[] = [];
let isProcessing = false;

function saveCache() {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

export async function getDynamicIcon(itemName: string, namespace: string): Promise<string | null> {
  const { game } = AppConfig();
  const key = itemIconKey(game, namespace, itemName);
  const cached = cache[key] ?? legacyItemIcon(cache[itemName], game);
  if (cached) return cached === "404" ? null : cached;

  return new Promise((resolve) => {
    // Avoid duplicate queue entries
    const existing = queue.find((request) => request.key === key);
    if (existing) {
      const oldResolve = existing.resolve;
      existing.resolve = (url) => {
        oldResolve(url);
        resolve(url);
      };
    } else {
      queue.push({ key, game, itemName, namespace, resolve });
      processQueue();
    }
  });
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
        saveCache();
        req.resolve(url);
      } else {
        // Cache misses as "404" so we don't spam the API for impossible items
        cache[req.key] = "404";
        // Do NOT saveCache() for 404s, so it tries again on next app start
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

async function fetchIconFromTradeApi({ game, itemName, namespace }: FetchRequest): Promise<string | null> {
  const tradeApi = "www.pathofexile.com/api/" + getTradeEndpointPath(game);
  const query: Record<string, unknown> = {
    status: { option: "any" },
    stats: [{ type: "and", filters: [] }]
  };

  if (namespace === "UNIQUE") {
    query.name = itemName;
  } else {
    query.type = itemName;
  }

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
    const icon = matchingTradeIcon(result.item, namespace, [itemName]);
    if (icon) return icon;
  }
  return null;
}

export function matchingTradeIcon(
  item: { icon?: string; name?: string; baseType?: string; typeLine?: string; frameType?: number } | undefined,
  namespace: string,
  names: string[],
) {
  if (!item?.icon || item.icon === "%NOT_FOUND%") return;
  const unique = namespace === "UNIQUE";
  if (!unique && item.frameType === 3) return;
  const candidates = unique ? [item.name] : [item.baseType, item.typeLine];
  if (candidates.some(name => name && names.includes(name))) return item.icon;
}
