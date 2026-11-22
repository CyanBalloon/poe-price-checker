import type { BaseType } from "./interfaces";

export type CatalogueItem = Pick<BaseType, "namespace" | "name"> & { icon?: string };
export interface UniqueBaseEntry {
  name: string;
  base: string;
  icon?: string;
  tradeDisc?: string;
  parentBase?: string;
  category?: NonNullable<BaseType["craftable"]>["category"];
}

const searchableNamespaces = new Set(["ITEM", "GEM", "UNIQUE", "DIVINATION_CARD", "CAPTURED_BEAST"]);

export function catalogueItem({ namespace, name, icon }: CatalogueItem): BaseType {
  return { namespace, name, refName: name, icon: icon || "%NOT_FOUND%", tags: [] };
}

export function buildCatalogue(local: Iterable<BaseType>, extra: CatalogueItem[], exchangeNames: string[], uniqueExtras: UniqueBaseEntry[] = []) {
  const entries = new Map<string, BaseType>();
  const exchange = new Set(exchangeNames);
  const visceraByName = new Map<string, BaseType[]>();
  const uniquesByBase = new Map<string, Map<string, BaseType>>();
  const supplementalBases = new Map<string, BaseType[]>();

  function indexUnique(item: BaseType) {
    if (!item.unique) return;
    const base = item.unique.base;
    const candidates = uniquesByBase.get(base) ?? new Map<string, BaseType>();
    const previous = candidates.get(item.refName);
    if (!previous || !previous.icon || previous.icon === "%NOT_FOUND%") candidates.set(item.refName, item);
    uniquesByBase.set(base, candidates);
  }

  for (const item of local) {
    if (!searchableNamespaces.has(item.namespace)) continue;
    indexUnique(item);
    if (item.exchangeable) exchange.add(item.refName);
    if (item.viscera) {
      const equivalents = visceraByName.get(item.name) ?? [];
      equivalents.push(item);
      visceraByName.set(item.name, equivalents);
    }
    const key = item.namespace + ":" + item.refName;
    if (!entries.has(key)) entries.set(key, item);
  }
  for (const row of uniqueExtras) {
    const key = "UNIQUE:" + row.name;
    const exact = uniquesByBase.get(row.base)?.get(row.name);
    const known = exact ?? entries.get(key);
    const item: BaseType = {
      ...(exact ?? catalogueItem({ namespace: "UNIQUE", name: row.name })),
      name: known?.name ?? row.name,
      icon: row.icon || known?.icon || "%NOT_FOUND%",
      unique: { ...exact?.unique, base: row.base },
      tradeDisc: row.tradeDisc ?? exact?.tradeDisc,
    };
    indexUnique(item);
    if (!known || (known === exact && (!known.icon || known.icon === "%NOT_FOUND%"))) entries.set(key, item);
    if (!entries.has("ITEM:" + row.base) && (row.parentBase || row.category)) {
      const parent = row.parentBase ? entries.get("ITEM:" + row.parentBase) : undefined;
      const base: BaseType = {
        ...(parent ?? catalogueItem({ namespace: "ITEM", name: row.base })),
        name: row.base,
        refName: row.base,
        craftable: parent?.craftable ?? (row.category && { category: row.category }),
      };
      entries.set("ITEM:" + row.base, base);
      supplementalBases.set(row.base, [base]);
    }
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
  return { entries, exchange, visceraByName, uniquesByBase, supplementalBases };
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
