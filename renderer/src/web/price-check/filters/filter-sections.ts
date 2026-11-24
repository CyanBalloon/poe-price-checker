import { CLIENT_STRINGS } from "@/assets/data";
import { influenceSymbolUrl } from "@/web/ui/influence-symbols";
import { ItemCategory, type ParsedItem } from "@/parser";
import { isMapInfluenceId } from "@/parser/poe1-map";
import { ascendancyPointsByAreaLevel } from "./create-item-filters";
import { displayModifier, searchBounds, selectedFirst, unavailableModifierText } from "./filter-comparison";
import { groupModifierFilters } from "./modifier-groups";
import type { FilterNumeric, ItemFilters, StatFilter } from "./interfaces";

type Translate = (key: string, values?: string[]) => string;
type Operator = "min" | "max" | "exact";
type Toggle = { disabled: boolean };

export type FilterRow =
  | { kind: "numeric"; key: string; name: string; filter: FilterNumeric; itemValue?: number; unit: string; operator: Operator }
  | { kind: "modifier"; key: string; filter: StatFilter; display: ReturnType<typeof displayModifier> }
  | { kind: "choice"; key: string; text: string; filter?: Toggle; itemValue?: string; img?: string; search?: string; inactive?: string; unavailable?: boolean }
  | { kind: "corruption"; key: string; condition: string }
  | { kind: "scope"; key: string; rarity?: string }
  | { kind: "unavailable"; key: string; text: string };

export interface FilterSection {
  id: string;
  label: string;
  rows: FilterRow[];
}

export function corruptionCondition(filters: ItemFilters, isPoe1: boolean) {
  const filter = filters.corrupted;
  if (!filter || filter.disabled || (filters.sanctified && !filters.sanctified.disabled)) return "any";
  return !isPoe1 && filter.value && !filter.exact ? "any" : String(filter.value);
}

export function activeLabel(row: FilterRow): string | undefined {
  switch (row.kind) {
    case "numeric": {
      if (row.filter.disabled) return;
      const { value, max } = row.filter;
      const bounds = row.operator === "exact" ? value + row.unit :
        searchBounds(row.operator === "min" ? value : undefined, row.operator === "max" ? value : max, row.unit);
      return row.name + " " + bounds;
    }
    case "modifier": {
      if (!row.filter.tradeId.length || row.filter.disabled || row.display.search === "Any") return;
      if (row.filter.tradeId.some(isMapInfluenceId)) return row.display.onItem;
      return row.display.search === "Exact match" ? row.display.label : row.display.label + " " + row.display.search;
    }
    case "corruption": return row.condition === "any" ? undefined : row.condition === "true" ? "Corrupted" : "Uncorrupted";
    case "choice": {
      if (row.unavailable) return;
      if (row.filter?.disabled) return row.inactive && row.inactive !== "Any" ? row.inactive : undefined;
      if (row.search === "Any") return;
      return row.search && row.search !== "Exact match" ? row.search : row.itemValue || row.text;
    }
    case "scope": return row.rarity && !["any", "nonunique"].includes(row.rarity) ? "Rarity · " + row.rarity : undefined;
  }
}

export function initialSection(sections: readonly FilterSection[]) {
  const drops = sections.find(section => section.id === "drops");
  if (drops) return drops.id;
  if (sections.some(section => section.id === "map")) {
    const influence = sections.find(section => section.id === "influence" && section.rows.some(row => row.kind === "modifier" || (row.kind === "choice" && row.filter)));
    return influence?.id ?? "map";
  }
  for (const id of ["rooms", "gem"]) {
    if (sections.some(section => section.id === id)) return id;
  }
  const affixes = sections.filter(section => section.id.startsWith("group-") && !["Pseudo stats", "Base", "Implicit"].includes(section.label));
  return (affixes.find(section => section.rows.some(row => activeLabel(row))) ?? affixes[0])?.id ??
    sections.find(section => section.id === "influence")?.id ?? "properties";
}

export function buildFilterSections(item: ParsedItem, filters: ItemFilters, stats: readonly StatFilter[], isPoe1: boolean, t: Translate): FilterSection[] {
  const isMap = item.category === ItemCategory.Map || item.category === ItemCategory.Waystone;
  const map: FilterRow[] = [];
  const drops: FilterRow[] = [];
  const influence: FilterRow[] = [];
  const gem: FilterRow[] = [];
  const rooms: FilterRow[] = [];
  const properties: FilterRow[] = [{ kind: "scope", key: "scope", rarity: filters.rarity?.value }];
  function numeric(rows: FilterRow[], key: string, name: string, filter?: FilterNumeric, itemValue?: number, operator: Operator = "min", unit = "") {
    if (!filter) return;
    const label = name.startsWith("item.") ? t(name) : name;
    rows.push({ kind: "numeric", key, name: label.trim().replace(/[:：]$/, ""), filter, itemValue, operator, unit });
  }
  const details = isMap ? map : properties;
  const tierName = isMap && !isPoe1 ? CLIENT_STRINGS.WAYSTONE_TIER : CLIENT_STRINGS.MAP_TIER_PROPERTY;
  numeric(details, "map-tier", tierName || "item.map_tier", filters.mapTier, item.mapTier, "exact");
  numeric(details, "area-level", (isMap && CLIENT_STRINGS.MAP_MONSTER_LEVEL) || "item.area_level",
    filters.areaLevel, item.areaLevel, filters.awardedAscendancyPoints ? "max" : "min");
  if (filters.corrupted) details.push({ kind: "corruption", key: "corruption", condition: corruptionCondition(filters, isPoe1) });
  for (const reward of filters.mapRewards ?? []) {
    numeric(drops, reward.key, reward.label, reward, item.mapRewards?.[reward.key], "min", "%");
  }
  for (const flag of isPoe1 ? filters.influences ?? [] : []) {
    influence.push({ kind: "choice", key: "influence-" + flag.value,
      text: flag.value + " influence", filter: flag, img: influenceSymbolUrl[flag.value] });
  }

  numeric(properties, "item-level", "item.item_level", filters.itemLevel, item.itemLevel);
  numeric(properties, "requires-level", "item.requires_level", filters.requires?.level, item.requires?.level, "max");
  const gemDetails = item.category === ItemCategory.Gem ? gem : properties;
  numeric(gemDetails, "quality", "item.quality", filters.quality, item.quality ?? 0, "min", "%");
  numeric(gemDetails, "gem-level", "item.gem_level", filters.gemLevel, item.gemLevel);
  numeric(gemDetails, "sockets", "item.gem_sockets", filters.socketNumber, item.gemSockets?.number);
  if (isPoe1) {
    numeric(properties, "links", "item.linked_sockets", filters.linkedSockets, item.gemSockets?.linked ?? 0);
    numeric(properties, "white-sockets", "item.white_sockets", filters.whiteSockets, item.gemSockets?.white);
  }
  numeric(properties, "augments", "item.augment_sockets", filters.augmentSockets, item.augmentSockets?.current);
  numeric(properties, "stock", "item.stock", filters.stackSize, item.stackSize?.value);
  if (filters.awardedAscendancyPoints) numeric(properties, "ascendancy", "item.ascendancy_points", filters.awardedAscendancyPoints,
    ascendancyPointsByAreaLevel(item.info.refName, item.areaLevel!));
  numeric(properties, "unidentified-tier", "item.unidentified_tier", filters.unidentifiedTier, item.unidentifiedTier);
  if (filters.unidentified && !filters.unidentifiedTier) properties.push({ kind: "choice", key: "unidentified", text: t("item.unidentified"), filter: filters.unidentified });
  if (filters.veiled) properties.push({ kind: "choice", key: "veiled", text: t("item.veiled"), filter: filters.veiled });
  if (filters.foil) properties.push({ kind: "choice", key: "foil", text: t("item.foil_unique"), filter: filters.foil });
  if (filters.mirrored) properties.push({ kind: "choice", key: "mirrored", text: "Allow mirrored", filter: filters.mirrored,
    itemValue: item.isMirrored ? "Mirrored" : "Unmirrored", search: "Any", inactive: "Unmirrored" });
  if (filters.sanctified) properties.push({ kind: "choice", key: "sanctified", text: "Allow sanctified", filter: filters.sanctified,
    itemValue: item.isSanctified ? "Sanctified" : "Unsanctified", search: "Any", inactive: "Unsanctified" });
  if (filters.ultimatumHint) properties.push({ kind: "choice", key: "ultimatum", text: "Ultimatum hint", filter: filters.ultimatumHint,
    itemValue: t("item." + filters.ultimatumHint.value.toLowerCase()) });
  if (filters.mapBlighted?.value) properties.push({ kind: "choice", key: "blight", text: "Blight", itemValue: filters.mapBlighted.value });
  if (filters.discriminator?.value) properties.push({ kind: "choice", key: "variant", text: "Variant", itemValue: filters.discriminator.value });
  if (filters.heistWingsRevealed) properties.push({ kind: "choice", key: "wings", text: t("item.heist_wings_revealed").replace(/[:：]\s*$/, ""),
    itemValue: String(item.heist?.wingsRevealed), unavailable: true });
  if (filters.sentinelCharge) properties.push({ kind: "choice", key: "charge", text: t("item.sentinel_charge").replace(/[:：]\s*$/, ""),
    itemValue: String(item.sentinelCharge), unavailable: true });

  const rows = new Map<StatFilter, Extract<FilterRow, { kind: "modifier" }>>();
  const grouped: StatFilter[] = [];
  for (const [index, filter] of stats.entries()) {
    const row = { kind: "modifier" as const, key: "mod-" + index, filter, display: displayModifier(filter, item, t) };
    rows.set(filter, row);
    if (filter.tradeId.some(id => id.startsWith("pseudo.pseudo_temple_"))) rooms.push(row);
    else if (isMap && filter.tradeId.some(isMapInfluenceId)) influence.push(row);
    else if (isMap && filter.tradeId[0] === "item.map_revives") map.push(row);
    else if (isMap && filter.tradeId[0]?.startsWith("item.map_")) drops.push(row);
    else grouped.push(filter);
  }
  if (isMap && isPoe1 && !influence.some(row => row.kind === "modifier")) {
    influence.push({ kind: "choice", key: "no-map-influence", text: "Map influence", search: "Uninfluenced" });
  }
  const unavailable: FilterRow[] = unavailableModifierText(item, stats).map((text, index) => ({ kind: "unavailable", key: "unavailable-" + index, text }));
  const groups = groupModifierFilters(grouped, item.rarity).map(group => ({
    id: "group-" + group.label.toLowerCase().replace(/ /g, "-"), label: group.label, rows: group.filters.map(filter => rows.get(filter)!),
  }));
  return [
    { id: "all", label: "View all mods", rows: [...selectedFirst(stats).map(filter => rows.get(filter)!), ...unavailable] },
    { id: "map", label: isPoe1 ? "Map details" : "Waystone details", rows: map },
    { id: "drops", label: "Drop bonuses", rows: drops },
    { id: "influence", label: isMap ? "Map influence" : "Influence", rows: influence },
    { id: "rooms", label: "Temple rooms", rows: rooms },
    { id: "gem", label: "Gem details", rows: gem },
    ...groups,
    { id: "unavailable", label: "Unavailable mods", rows: unavailable },
    { id: "properties", label: "Item properties", rows: properties },
  ].filter(section => section.rows.length);
}
