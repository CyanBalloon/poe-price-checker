import { toRaw } from "vue";
import { ItemCategory, type ParsedItem } from "@/parser";
import { CLIENT_STRINGS } from "@/assets/data";
import { IncursionRoom } from "@/parser/ParsedItem";
import { isMapInfluenceId } from "@/parser/poe1-map";
import { FilterTag, INTERNAL_TRADE_IDS, ItemIsElementalModifier, type StatFilter } from "./interfaces";

export function selectedFirst(filters: readonly StatFilter[]) {
  const selected: StatFilter[] = [];
  const remaining: StatFilter[] = [];
  for (const filter of filters) {
    if (filter.tradeId.length && !filter.disabled) selected.push(filter);
    else remaining.push(filter);
  }
  return [...selected, ...remaining];
}

// The parser keeps raw source objects; Vue wraps the active preset's copies in reactive proxies.
export function unavailableModifierText(item: ParsedItem, filters: readonly StatFilter[]) {
  const represented = new Set(filters.flatMap(filter => filter.sources.map(source => toRaw(source.stat))));
  const labels = new Set(item.unknownModifiers.map(mod => mod.text));
  for (const mod of item.newMods) {
    for (const stat of mod.stats) {
      if (represented.has(toRaw(stat))) continue;
      let index = 0;
      labels.add(stat.translation.string.replace(/[+-]?#/g, () => String(stat.roll?.values?.[index++] ?? stat.roll?.value ?? "…")));
    }
  }
  return [...labels];
}

export function modifierBoundsMode(filter: StatFilter) {
  if (!filter.roll || filter.oils || filter.tradeId.every(id => id.startsWith("{empty}") ||
    (id.startsWith("{empty_if_100}") && filter.roll?.value === 100))) return "presence";
  if (filter.tradeId[0]?.startsWith("item.map_")) return "min";
  if (filter.statRef === "Only affects Passives in # Ring") return "exact";
  return "range";
}

export function searchBounds(min: unknown, max: unknown, unit = "") {
  if (typeof min === "number" && typeof max === "number") {
    return min === max ? `= ${min}${unit}` : `${min}–${max}${unit}`;
  }
  if (typeof min === "number") return `≥ ${min}${unit}`;
  if (typeof max === "number") return `≤ ${max}${unit}`;
  return "";
}

function propertyValue(filter: StatFilter, item: ParsedItem) {
  const speed = item.weaponAS ?? 0;
  switch (filter.tradeId[0]) {
    case "item.armour": return item.armourAR;
    case "item.evasion_rating": return item.armourEV;
    case "item.energy_shield": return item.armourES;
    case "item.physical_dps": return (item.weaponPHYSICAL ?? 0) * speed;
    case "item.total_dps": return ((item.weaponPHYSICAL ?? 0) + (item.weaponELEMENTAL ?? 0)) * speed;
    case "item.elemental_dps": {
      const damage = [item.weaponELEMENTAL, item.weaponFIRE, item.weaponCOLD, item.weaponLIGHTNING];
      return (damage[filter.option?.value ?? ItemIsElementalModifier.Any] ?? 0) * speed;
    }
    case "item.crit": return item.weaponCRIT;
    case "item.aps": return item.weaponAS;
    case "item.spirit": return item.weaponSPIRIT;
    case "item.reload_time": return item.weaponRELOAD;
    case "item.block": return item.armourBLOCK;
    case "item.runic_ward": return item.armourRW;
    default: return filter.roll?.value;
  }
}

function propertyLabel(text: string, values: readonly number[]) {
  const damage = /^Adds # to # (.+)$/i.exec(text);
  if (damage) return "Added " + damage[1];
  // Remove a leading roll or a trailing property value. Preserve quantities inside a sentence.
  const short = text.replace(/^[+#-]*#%?\s+(?:to\s+)?/i, "").replace(/\s*[:：]\s*[+#-]*#%?$/, "");
  let index = 0;
  const label = short.replace(/#/g, () => String(values[index++] ?? "…")).trim();
  return label.charAt(0).toLocaleUpperCase() + label.slice(1);
}

export function modifierComparison(filter: StatFilter, item: ParsedItem, text = filter.text) {
  const id = filter.tradeId[0];
  const raw = text.trim();
  if (filter.tradeId.some(isMapInfluenceId)) {
    const influence = raw.replace(/^(?:Area is influenced by |Map is occupied by |Map contains )/i, "");
    return {
      label: id.startsWith("implicit.stat_3624393862") ? "Map guardian" : "Map influence",
      onItem: influence.replace(/^the (?=Originator)/i, ""),
      search: filter.disabled ? "Optional" : "Exact match",
    };
  }
  if (id?.startsWith("pseudo.pseudo_temple_")) {
    const room = filter.sources[0]?.stat.roll?.option ?? filter.sources[0]?.contributes?.value;
    return {
      label: raw.replace(/^.*?[:：]\s*/, ""), onItem: room === IncursionRoom.Obstructed ? "Obstructed" : "Open",
      search: filter.disabled ? "Any" : "Open room",
    };
  }

  const roll = filter.roll;
  const unit = /#[%％]/.test(raw) || (filter.tag === FilterTag.Property && /#[%％]/.test(filter.statRef)) ? "%" : "";
  const source = filter.sources.length === 1 && filter.statRef === filter.sources[0].stat.stat.ref
    ? filter.sources[0] : undefined;
  const sourceRoll = source?.stat.roll;
  const copied = filter.tag === FilterTag.Property ? propertyValue(filter, item)
    : sourceRoll && roll && !filter.option ? sourceRoll.value * (source.stat.translation.negate ? -1 : 1) : roll?.value;
  const pair = sourceRoll?.values;
  const values = pair ?? (copied == null ? [] : [Number(copied.toFixed(2))]);
  const separator = /#\s+(?:to|à)\s+#/.test(raw) ? "–" : " / ";
  let onItem = pair ? pair.join(separator) + unit : values.length ? values[0] + unit : "Present";
  // Trade sums identical affixes. Keep each copied contribution legible in the item column.
  if (filter.sources.length > 1 && filter.sources.every(s => s.stat.stat.ref === filter.statRef && s.stat.roll)) {
    onItem = filter.sources.map(({ stat }) => {
      const sourceRoll = stat.roll!;
      return (sourceRoll.values?.join(separator) ?? sourceRoll.value * (stat.translation.negate ? -1 : 1)) + unit;
    }).join(" + ");
  }
  const mode = modifierBoundsMode(filter);
  const upper = mode === "min" ? undefined : mode === "exact" ? roll?.min : roll?.max;
  const bounds = mode === "presence" ? "" : searchBounds(roll?.min, upper, unit);
  const condition = bounds ? (pair ? "Avg " + bounds : bounds)
    : filter.tag === FilterTag.Property ? "Any" : "Exact match";
  return { label: propertyLabel(raw, values), onItem, search: filter.disabled ? "Any" : condition };
}

export function displayModifier(filter: StatFilter, item: ParsedItem, t: (key: string, values?: string[]) => string) {
  const id = filter.tradeId[0];
  let text = INTERNAL_TRADE_IDS.includes(id) ? t(id, ["#", "#"]) : filter.text;
  if (id === "item.has_empty_modifier" && filter.option) {
    text = ["Empty affixes", "Empty prefixes", "Empty suffixes"][filter.option.value];
  }
  if (id === "item.elemental_dps" && filter.option?.value) {
    text = ["Elemental DPS", "Fire DPS", "Cold DPS", "Lightning DPS"][filter.option.value];
  }
  if (item.category === ItemCategory.Jewel && item.info.refName.startsWith("Time-Lost")) {
    for (const template of [CLIENT_STRINGS.TIMELESS_SMALL_PASSIVES, CLIENT_STRINGS.TIMELESS_NOTABLE_PASSIVES]) {
      const match = new RegExp("^" + template.replace("{0}", "(.*)") + "$").exec(text);
      if (match) { text = match[1]; break; }
    }
  } else if (text.startsWith(CLIENT_STRINGS.GRANTS_SKILL)) {
    text = text.slice(CLIENT_STRINGS.GRANTS_SKILL.length);
  }
  return modifierComparison(filter, item, text);
}
