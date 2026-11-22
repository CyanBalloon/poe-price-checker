import type { BaseType } from "./interfaces";

export type CatalogueItem = Pick<BaseType, "namespace" | "name"> & { icon?: string };

const searchableNamespaces = new Set(["ITEM", "GEM", "UNIQUE", "DIVINATION_CARD", "CAPTURED_BEAST"]);

export function catalogueItem({ namespace, name, icon }: CatalogueItem): BaseType {
  return { namespace, name, refName: name, icon: icon || "%NOT_FOUND%", tags: [] };
}

export function buildCatalogue(local: Iterable<BaseType>, extra: CatalogueItem[], exchangeNames: string[]) {
  const entries = new Map<string, BaseType>();
  const exchange = new Set(exchangeNames);
  for (const item of local) {
    if (!searchableNamespaces.has(item.namespace)) continue;
    if (item.exchangeable) exchange.add(item.refName);
    const key = item.namespace + ":" + item.refName;
    if (!entries.has(key)) entries.set(key, item);
  }
  for (const item of extra) {
    const key = item.namespace + ":" + item.name;
    if (!entries.has(key)) entries.set(key, catalogueItem(item));
  }
  // Some newly exchangeable bases precede the next localized parser data release.
  const knownNames = new Set(Array.from(entries.values(), item => item.refName));
  for (const name of exchangeNames) {
    if (!knownNames.has(name)) entries.set("ITEM:" + name, catalogueItem({ namespace: "ITEM", name }));
  }
  return { entries, exchange };
}

function normalize(name: string) {
  return name.trim().toLowerCase().replace(/['’‘]/g, "").replace(/\s+/g, " ");
}

export function indexCatalogue(items: Iterable<BaseType>) {
  return Array.from(items, item => ({
    item, name: normalize(item.name), refName: normalize(item.refName),
  }));
}

export function searchCatalogue(index: ReturnType<typeof indexCatalogue>, input: string) {
  const query = normalize(input);
  if (query.length < 3) return [];
  const words = query.split(" ");
  const matches: Array<{ rank: number; item: BaseType }> = [];
  for (const { item, name, refName } of index) {
    if (!words.every(word => name.includes(word)) && !words.every(word => refName.includes(word))) continue;
    const rank = name === query || refName === query ? 0 : name.startsWith(query) || refName.startsWith(query) ? 1 : 2;
    matches.push({ rank, item });
  }
  return matches.sort((a, b) => a.rank - b.rank || a.item.name.localeCompare(b.item.name))
    .slice(0, 50).map(match => match.item);
}
