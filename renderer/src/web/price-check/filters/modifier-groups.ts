import { ItemRarity } from "@/parser/ParsedItem";
import { ModifierType } from "@/parser/modifiers";
import { FilterTag, type StatFilter } from "./interfaces";
import { isMapInfluenceId } from "@/parser/poe1-map";

const groupOrder = [
  "Map influence", "Pseudo stats", "Base", "Implicit", "Prefix", "Suffix", "Fractured", "Crafted",
  "Foulborn modifiers", "Unique modifiers", "Explicit modifiers",
  "Enchantments", "Socketed augments", "Skills", "Scourge", "Sanctum", "Necropolis",
] as const;
type ModifierGroup = (typeof groupOrder)[number];

function groupFor(filter: StatFilter, rarity: ItemRarity | undefined): ModifierGroup {
  if (filter.tradeId.some(isMapInfluenceId)) return "Map influence";
  if (filter.tag === FilterTag.Property) return "Base";
  if (filter.tag === FilterTag.Pseudo) return "Pseudo stats";

  const sources = filter.sources.map(source => source.modifier.info);
  if (sources.some(source => source.isFoulborn)) return "Foulborn modifiers";
  const sourceType = sources.length && sources.every(source => source.type === sources[0].type)
    ? sources[0].type : undefined;
  if (sourceType === ModifierType.Fractured) return "Fractured";
  if (sourceType === ModifierType.Crafted || filter.tag === FilterTag.Crafted) return "Crafted";
  const generation = sources.length && sources.every(source => source.generation === sources[0].generation)
    ? sources[0].generation : undefined;

  if (generation === "eldritch" || generation === "corrupted" || sourceType === ModifierType.Implicit ||
      [FilterTag.Implicit, FilterTag.Eldritch, FilterTag.Synthesised].includes(filter.tag)) return "Implicit";
  if (generation === "prefix") return "Prefix";
  if (generation === "suffix") return "Suffix";

  switch (sourceType ?? filter.tag) {
    case ModifierType.Enchant: return "Enchantments";
    case FilterTag.Corrupted: return "Implicit";
    case ModifierType.Augment:
    case ModifierType.AddedAugment: return "Socketed augments";
    case ModifierType.Skill:
    case ModifierType.Imbued: return "Skills";
    case ModifierType.Scourge: return "Scourge";
    case ModifierType.Sanctum: return "Sanctum";
    case ModifierType.Necropolis: return "Necropolis";
    case ModifierType.Pseudo: return "Pseudo stats";
    default: return rarity === ItemRarity.Unique ? "Unique modifiers" : "Explicit modifiers";
  }
}

export function groupModifierFilters(filters: readonly StatFilter[], rarity: ItemRarity | undefined) {
  const groups = new Map<ModifierGroup, StatFilter[]>();
  for (const filter of filters) {
    const label = groupFor(filter, rarity);
    const group = groups.get(label);
    if (group) group.push(filter);
    else groups.set(label, [filter]);
  }
  return groupOrder.filter(label => groups.has(label)).map(label => ({ label, filters: groups.get(label)! }));
}
