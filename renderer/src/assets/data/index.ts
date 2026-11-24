import { itemIconKey, legacyItemIcon } from "@ipc/item-icons";
import fnv1a from "@sindresorhus/fnv1a";
import type {
  BaseType,
  DropEntry,
  GameVersion,
  AugmentDataByAugment,
  AugmentDataByTradeId,
  Stat,
  StatMatcher,
  TranslationDict,
} from "./interfaces";
import { loadClientStrings, loadPoe1ClientStrings } from "../client-string-loader";
import { useTradeData } from "@/web/background/TradeData";
import { ItemCategory } from "@/parser/meta";
import { ItemRarity } from "@/parser/ParsedItem";
import { Host } from "@/web/background/IPC";
import { reactive, shallowRef } from "vue";
import { buildCatalogue, type CatalogueItem, type UniqueBaseEntry } from "./item-catalogue";

export * from "./interfaces";

export let ITEM_DROP: DropEntry[];
export let CLIENT_STRINGS: TranslationDict;
export let CLIENT_STRINGS_REF: TranslationDict;
export let APP_PATRONS: Array<{ from: string; months: number; style: number }>;
export let AUGMENT_DATA_BY_AUGMENT: AugmentDataByAugment;
export let AUGMENT_DATA_BY_TRADE_ID: AugmentDataByTradeId;

export let AUGMENT_LIST: BaseType[];
export const HIGH_VALUE_AUGMENTS_HARDCODED = new Set<string>([]);

export let ITEM_BY_TRANSLATED: (
  ns: BaseType["namespace"],
  name: string,
) => BaseType[] | undefined = () => undefined;
export let ITEM_BY_REF: (
  ns: BaseType["namespace"],
  name: string,
) => BaseType[] | undefined = () => undefined;
export let ITEMS_ITERATOR: (
  includes: string,
  andIncludes?: string[],
) => Generator<BaseType> = function* () {};

export let GEM_NS_NAMES: () => Generator<string> = function* () {};
export let UNIQUE_NS_NAMES: () => Generator<string> = function* () {};
export let ITEM_NS_NAMES: () => Generator<string> = function* () {};

export let TRADE_TAG_TO_REF = new Map<string, string>();
export const itemCatalogue = shallowRef(buildCatalogue([], [], []));

export let STAT_BY_MATCH_STR: (
  name: string,
  type?: string,
) => { matcher: StatMatcher; stat: Stat } | undefined = () => undefined;
export let STAT_BY_REF: (name: string) => Stat | undefined = () => undefined;
export let STATS_ITERATOR: (
  includes: string,
  andIncludes?: string[],
) => Generator<Stat> = function* () {};

let localAugmentFilter: (
  value: BaseType,
  index: number,
  array: BaseType[],
) => unknown | undefined = () => undefined;

export let TRADE_ITEM_BY_REF: (
  itemQuery: {
    baseType?: string;
    name?: string;
    rarity?: ItemRarity;
    category?: ItemCategory;
  },
  forceCraftable?: boolean,
) => BaseType[] | undefined = () => undefined;

export let TRADE_STAT_BY_STAT_ID: (tradeId: string) => boolean = () => false;
export let TRADE_STAT_BY_MATCH_STR: (
  name: string,
) => { [type: string]: string[] } | undefined = () => undefined;

function dataBinarySearch(
  data: Uint32Array,
  value: number,
  rowOffset: number,
  rowSize: number,
) {
  let left = 0;
  let right = data.length / rowSize - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const midValue = data[mid * rowSize + rowOffset];
    if (midValue < value) {
      left = mid + 1;
    } else if (midValue > value) {
      right = mid - 1;
    } else {
      return mid;
    }
  }
  return -1;
}

function ndjsonFindLines<T>(ndjson: string) {
  // it's preferable that passed `searchString` has good entropy
  return function* (
    searchString: string,
    andIncludes: string[] = [],
  ): Generator<T> {
    let start = 0;
    while (start < ndjson.length) {
      const matchPos = ndjson.indexOf(searchString, start);
      if (matchPos === -1) break;
      // works for first line too (-1 + 1 = 0)
      start = ndjson.lastIndexOf("\n", matchPos) + 1;
      const nextLine = ndjson.indexOf("\n", matchPos);
      const end = nextLine === -1 ? ndjson.length : nextLine;
      const jsonLine = ndjson.slice(start, end);
      if (andIncludes.every((str) => jsonLine.includes(str))) {
        yield JSON.parse(jsonLine) as T;
      }
      start = end + 1;
    }
  };
}

function itemNamesFromLines(items: Generator<BaseType>) {
  let cached = "";
  return function* (): Generator<string> {
    if (!cached.length) {
      for (const item of items) {
        cached += item.name + "\n";
      }
    }

    let start = 0;
    while (start !== cached.length) {
      const end = cached.indexOf("\n", start);
      yield cached.slice(start, end);
      start = end + 1;
    }
  };
}

async function fetchData(path: string) {
  const response = await fetch(import.meta.env.BASE_URL + path);
  if (!response.ok) throw new Error("Could not load game data: " + path);
  return response;
}

function withItemIcon(item: BaseType, game: GameVersion) {
  if (!item.icon || item.icon === "%NOT_FOUND%") {
    const cached = CUSTOM_ICONS[itemIconKey(game, item.namespace, item.refName)] ??
      legacyItemIcon(CUSTOM_ICONS[item.refName], game);
    if (cached) item.icon = cached;
  }
  return item;
}

async function loadItems(directory: string, game: GameVersion) {
  const [ndjson, nameIndex, refIndex] = await Promise.all([
    fetchData(directory + "/items.ndjson").then((r) => r.text()),
    fetchData(directory + "/items-name.index.bin").then((r) => r.arrayBuffer()),
    fetchData(directory + "/items-ref.index.bin").then((r) => r.arrayBuffer()),
  ]);
  const INDEX_WIDTH = 2;
  const indexNames = new Uint32Array(nameIndex);
  const indexRefNames = new Uint32Array(refIndex);

  function commonFind(index: Uint32Array, prop: "name" | "refName") {
    return function (
      ns: BaseType["namespace"],
      name: string,
    ): BaseType[] | undefined {
      let start = dataBinarySearch(
        index,
        Number(fnv1a(`${ns}::${name}`, { size: 32 })),
        0,
        INDEX_WIDTH,
      );
      if (start === -1) return undefined;
      start = index[start * INDEX_WIDTH + 1];
      const out: BaseType[] = [];
      while (start < ndjson.length) {
        const nextLine = ndjson.indexOf("\n", start);
        const end = nextLine === -1 ? ndjson.length : nextLine;
        const record = JSON.parse(ndjson.slice(start, end)) as BaseType;
        if (record.namespace === ns && record[prop] === name) {
          out.push(withItemIcon(record, game));
          if (!record.disc && !record.unique) break;
        } else {
          break;
        }
        start = end + 1;
      }
      return out;
    };
  }

  const itemLines = ndjsonFindLines<BaseType>(ndjson);
  function* items(search: string, includes?: string[]) {
    for (const item of itemLines(search, includes)) yield withItemIcon(item, game);
  }
  const names = (namespace: BaseType["namespace"]) => itemNamesFromLines(
    (function* () {
      for (const item of items(JSON.stringify(namespace), ['"namespace"'])) {
        if (item.namespace === namespace) yield item;
      }
    })(),
  );
  const tradeTagToRef = new Map<string, string>();
  for (const item of items('"tradeTag":')) {
    tradeTagToRef.set(item.tradeTag!, item.refName);
  }

  return {
    itemByTranslated: commonFind(indexNames, "name"),
    itemByRef: commonFind(indexRefNames, "refName"),
    items,
    gemNames: names("GEM"),
    uniqueNames: names("UNIQUE"),
    itemNames: names("ITEM"),
    tradeTagToRef,
  };
}

function mergeStats(stats: Stat[]): Stat {
  if (stats.length === 1) return stats[0];
  const merged: Stat = {
    ...stats[0],
    matchers: [],
    trade: {
      ids: {},
    },
  };
  const seenMatchers = new Set<string>();
  for (const s of stats) {
    if (s.trade.inverted !== undefined) merged.trade.inverted = s.trade.inverted;
    if (s.trade.option !== undefined) merged.trade.option = s.trade.option;
    
    if (s.matchers) {
      for (const m of s.matchers) {
        if (!seenMatchers.has(m.string)) {
          seenMatchers.add(m.string);
          merged.matchers.push(m);
        }
      }
    }
    
    if (s.trade.ids) {
      for (const [type, ids] of Object.entries(s.trade.ids)) {
        if (!merged.trade.ids[type]) {
          merged.trade.ids[type] = [];
        }
        for (const id of ids) {
          if (!merged.trade.ids[type].includes(id)) {
            merged.trade.ids[type].push(id);
          }
        }
      }
    }
  }
  return merged;
}

type StatLine = Stat | { stats: Stat[] };

function unpackStats(line: StatLine): Stat[] {
  return "stats" in line ? line.stats : [line];
}

async function loadStats(directory: string) {
  const [ndjson, refIndex, matcherIndex] = await Promise.all([
    fetchData(directory + "/stats.ndjson").then((r) => r.text()),
    fetchData(directory + "/stats-ref.index.bin").then((r) => r.arrayBuffer()),
    fetchData(directory + "/stats-matcher.index.bin").then((r) => r.arrayBuffer()),
  ]);
  const indexRef = new Uint32Array(refIndex);
  const indexMatcher = new Uint32Array(matcherIndex);
  const indexWidth = 2;

  function* findStats(index: Uint32Array, value: string) {
    const hash = Number(fnv1a(value, { size: 32 }));
    let row = dataBinarySearch(index, hash, 0, indexWidth);
    if (row === -1) return;
    while (row > 0 && index[(row - 1) * indexWidth] === hash) row--;

    let previous = -1;
    while (row < index.length / indexWidth && index[row * indexWidth] === hash) {
      const start = index[row * indexWidth + 1];
      if (start !== previous) {
        const end = ndjson.indexOf("\n", start);
        yield* unpackStats(JSON.parse(ndjson.slice(start, end === -1 ? undefined : end)));
        previous = start;
      }
      row++;
    }
  }

  const statLines = ndjsonFindLines<StatLine>(ndjson);
  return {
    byRef(ref: string) {
      const stats = Array.from(findStats(indexRef, ref)).filter((stat) => stat.ref === ref);
      return stats.length ? mergeStats(stats) : undefined;
    },
    byMatcher(text: string, type?: string) {
      const matches = [];
      for (const stat of findStats(indexMatcher, text)) {
        const matcher = stat.matchers.find((m) => m.string === text || m.advanced === text);
        if (matcher) matches.push({ stat, matcher });
      }
      const typed = type ? matches.filter(({ stat }) => stat.trade.ids[type]?.length) : [];
      const resolved = typed.length ? typed : matches;
      if (resolved.length) {
        return { stat: mergeStats(resolved.map(({ stat }) => stat)), matcher: resolved[0].matcher };
      }
    },
    *iterator(includes: string, andIncludes?: string[]) {
      for (const line of statLines(includes, andIncludes)) yield* unpackStats(line);
    },
  };
}

// assertion, to avoid regressions in stats.ndjson
const DELAYED_STAT_VALIDATION = new Set<string>();
export function stat(text: string) {
  DELAYED_STAT_VALIDATION.add(text);
  return text;
}

export const CUSTOM_ICONS: Record<string, string> = reactive({});

export async function init(lang: string, game: GameVersion = "poe2") {
  APP_PATRONS = await (await fetchData("data/patrons.json")).json();
  try {
    const response = await fetch("/custom-icons");
    Object.assign(CUSTOM_ICONS, await response.json());
  } catch (e) {
    console.error("Failed to load custom icons:", e);
  }

  Host.onEvent("MAIN->CLIENT::custom-icon-added", (payload) => {
    CUSTOM_ICONS[itemIconKey(payload.game, payload.namespace, payload.refName)] = payload.iconUrl;
  });

  await switchGameData(game, lang);
  await useTradeData().load(true, game);

  let failed = false;
  const missing = [];

  for (const text of DELAYED_STAT_VALIDATION) {
    if (STAT_BY_REF(text) == null) {
      // throw new Error(`Cannot find stat: ${text}`);
      missing.push(text);
      failed = true;
    }
  }
  if (failed) {
    // throw new Error(
    //   `Cannot find stat${missing.length > 1 ? "s" : ""}: ${missing.join("\n")}`,
    // );
    console.log(
      "Cannot find stat" + (missing.length > 1 ? "s" : "") + missing.join("\n"),
    );
  }
  DELAYED_STAT_VALIDATION.clear();
}

export function setLocalAugmentFilter(
  filter: (value: BaseType, index: number, array: BaseType[]) => unknown,
) {
  localAugmentFilter = filter;
}

export const POE1_LANGUAGES = new Set(["en", "ru", "cmn-Hant", "ko"]);

let activeGame: GameVersion = "poe2";
let activeLanguage = "";
let dataRequest = 0;
const pendingData = new Map<string, ReturnType<typeof loadGameData>>();

async function loadGameData(game: GameVersion, language: string) {
  const root = game === "poe1" ? "poe1-data" : "data";
  const directory = root + "/" + language;
  async function clientStrings(lang: string): Promise<TranslationDict> {
    const base = await loadClientStrings(lang);
    return game === "poe1" ? { ...base, ...await loadPoe1ClientStrings(lang) } : base;
  }
  const [strings, refStrings, items, stats, drops, extra, exchangeNames, uniqueExtras] = await Promise.all([
    clientStrings(language),
    clientStrings("en"),
    loadItems(directory, game),
    loadStats(directory),
    fetchData(root + "/item-drop.json").then((r) => r.json() as Promise<DropEntry[]>),
    game === "poe1" ? fetchData(root + "/search-items.json").then(r => r.json() as Promise<CatalogueItem[]>) : [],
    fetchData(root + (game === "poe1" ? "/exchange-extra.json" : "/exchange-items.json"))
      .then(r => r.json() as Promise<string[]>),
    fetchData(root + "/unique-items.json").then(r => r.json() as Promise<UniqueBaseEntry[]>),
  ]);
  const catalogue = buildCatalogue(items.items('"namespace"'), extra, exchangeNames, uniqueExtras);
  return { strings, refStrings, items, stats, drops, catalogue };
}

export function loadForLang(lang: string) {
  return switchGameData(activeGame, lang);
}

export async function switchGameData(game: GameVersion, lang: string) {
  const request = ++dataRequest;
  const language = game === "poe1" && !POE1_LANGUAGES.has(lang) ? "en" : lang;
  if (activeGame === game && activeLanguage === language) return true;

  const key = game + "/" + language;
  let pending = pendingData.get(key);
  if (!pending) {
    pending = loadGameData(game, language).finally(() => pendingData.delete(key));
    pendingData.set(key, pending);
  }
  const { strings, refStrings, items, stats, drops, catalogue } = await pending;
  if (request !== dataRequest) return false;

  CLIENT_STRINGS = strings;
  CLIENT_STRINGS_REF = refStrings;
  ITEM_BY_TRANSLATED = (ns, name) => items.itemByTranslated(ns, name) ??
    (ns === "ITEM" ? catalogue.supplementalBases.get(name) : undefined);
  ITEM_BY_REF = (ns, name) => items.itemByRef(ns, name) ??
    (ns === "ITEM" ? catalogue.supplementalBases.get(name) : undefined);
  ITEMS_ITERATOR = items.items;
  GEM_NS_NAMES = items.gemNames;
  UNIQUE_NS_NAMES = items.uniqueNames;
  ITEM_NS_NAMES = items.itemNames;
  TRADE_TAG_TO_REF = items.tradeTagToRef;
  itemCatalogue.value = catalogue;
  STAT_BY_MATCH_STR = stats.byMatcher;
  STAT_BY_REF = stats.byRef;
  STATS_ITERATOR = stats.iterator;
  ITEM_DROP = drops;
  activeGame = game;
  activeLanguage = language;
  loadUltraLateItems(localAugmentFilter);
  bindTradeData(game);
  return true;
}

export function loadUltraLateItems(
  augmentFilter: (value: BaseType, index: number, array: BaseType[]) => unknown,
) {
  const a = Array.from(ITEMS_ITERATOR('"craftable": {"category": "SoulCore"}'));
  const b = a.filter((r) => r.augment && r.augment.some((s) => s.tradeId));
  const c = b.map((r) => ({
    ...r,
    augment: r.augment!.filter((s) => s.tradeId),
  }));
  const d = c.filter(augmentFilter);

  AUGMENT_LIST = d;

  AUGMENT_DATA_BY_AUGMENT = augmentsToLookup(AUGMENT_LIST);

  AUGMENT_DATA_BY_TRADE_ID = augmentsToLookupTradeId(AUGMENT_LIST);
}

function augmentsToLookup(augmentList: BaseType[]): AugmentDataByAugment {
  const augmentDataByAugment: AugmentDataByAugment = {};

  for (const augment of augmentList) {
    if (!augment.augment) continue;
    for (const augmentStat of augment.augment) {
      const { categories, string: text, values, tradeId } = augmentStat;
      if (!tradeId) continue;
      if (!augmentDataByAugment[augment.refName]) {
        augmentDataByAugment[augment.refName] = [];
      }
      augmentDataByAugment[augment.refName].push({
        augment: augment.name,
        refName: augment.refName,
        baseStat: text,
        values,
        id: tradeId[0],
        categories,
        icon: augment.icon,
      });
    }
  }

  return augmentDataByAugment;
}

function augmentsToLookupTradeId(
  augmentList: BaseType[],
): AugmentDataByTradeId {
  const augmentDataByAugment: AugmentDataByTradeId = {};

  for (const augment of augmentList) {
    if (!augment.augment) continue;
    for (const augmentStat of augment.augment) {
      const { categories, string: text, values, tradeId } = augmentStat;
      if (!tradeId) continue;
      if (!augmentDataByAugment[tradeId[0]]) {
        augmentDataByAugment[tradeId[0]] = [];
      }
      augmentDataByAugment[tradeId[0]].push({
        augment: augment.name,
        baseStat: text,
        values,
        id: tradeId[0],
        categories,
        icon: augment.icon,
      });
    }
  }

  return augmentDataByAugment;
}

function bindTradeData(game: GameVersion) {
  const trade = useTradeData().forGame(game);

  TRADE_ITEM_BY_REF = function (
    itemQuery: {
      baseType?: string;
      name?: string;
      rarity?: ItemRarity;
      category?: ItemCategory;
    },
    forceCraftable?: boolean,
  ): BaseType[] | undefined {
    trade.expressInterest();

    const items = trade.tradeItemData.value;

    let base: BaseType | undefined;
    const { baseType, name, rarity, category } = itemQuery;

    const exchangeName = baseType ?? name;
    if (exchangeName && itemCatalogue.value.exchange.has(exchangeName)) {
      const namespace = category === ItemCategory.Gem ? "GEM" : category === ItemCategory.DivinationCard ? "DIVINATION_CARD" : "ITEM";
      const known = itemCatalogue.value.entries.get(namespace + ":" + exchangeName);
      if (known) return [withItemIcon(known, game)];
    }
    if (category === ItemCategory.Gem) {
      if (name && items.has(name)) {
        base = {
          name: name,
          refName: name,
          namespace: "GEM",
          icon: "%NOT_FOUND%",
          tags: [],
          gem: {},
        };
      }
    } else if (rarity === ItemRarity.Unique) {
      if (name && items.has(`${name} ${baseType}`)) {
        base = {
          name: name,
          refName: name,
          namespace: "UNIQUE",
          icon: "%NOT_FOUND%",
          tags: [],
          unique: {
            base: baseType!,
          },
        };
      }
    } else if (!baseType) {
      if (name && items.has(name)) {
        // TODO: currency works without tradeTag, just ninja only, see if that is fine
        const craftable = category
          ? { category }
          : forceCraftable
            ? { category: name as ItemCategory }
            : undefined;

        base = {
          name: name,
          refName: name,
          namespace: "ITEM",
          icon: "%NOT_FOUND%",
          tags: [],
          craftable,
        };
      }
    } else {
      if (items.has(baseType)) {
        base = {
          name: baseType,
          refName: baseType,
          namespace: "ITEM",
          icon: "%NOT_FOUND%",
          tags: [],
          craftable: { category: ItemCategory.Unknown },
        };
      }
    }

    return base ? [withItemIcon(base, game)] : undefined;
  };

  TRADE_STAT_BY_STAT_ID = function (tradeId: string) {
    trade.expressInterest();

    return trade.tradeStatDataSet.value.has(tradeId);
  };

  TRADE_STAT_BY_MATCH_STR = function (name: string) {
    trade.expressInterest();

    const statData = trade.tradeStatData.value;

    const stat = statData.get(name);
    if (!stat) return;

    // never going to write to these, just need to satisfy type
    return stat as {
      [x: string]: string[];
    };
  };
}

// Disable since this is export for tests
// eslint-disable-next-line @typescript-eslint/naming-convention
export const __testExports = {
  augmentsToLookup,
};
