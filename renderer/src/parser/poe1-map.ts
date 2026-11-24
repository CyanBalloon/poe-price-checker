import type { TranslationDict } from "@/assets/data/interfaces";
import type { ParsedItem } from "./ParsedItem";
import { ItemCategory } from "./meta";

export const mapRewardFields = {
  MAP_ATLAS_DROPS: "map_bonus",
  MAP_ITEM_QUANTITY: "map_iiq",
  MAP_ITEM_RARITY: "map_iir",
  MAP_MONSTER_PACK_SIZE: "map_packsize",
  MAP_MORE_MAPS: "pseudo.pseudo_map_more_map_drops",
  MAP_MORE_SCARABS: "pseudo.pseudo_map_more_scarab_drops",
  MAP_MORE_CURRENCY: "pseudo.pseudo_map_more_currency_drops",
  MAP_MORE_DIVINATION_CARDS: "pseudo.pseudo_map_more_card_drops",
} as const;
export type MapReward = keyof typeof mapRewardFields;
export const mapRewardKeys = Object.keys(mapRewardFields) as MapReward[];

const elderOrShaper = "implicit.stat_1792283443";
const elderGuardian = "implicit.stat_3624393862";
const conquerorCitadel = "implicit.stat_2563183002";
const originator = "implicit.stat_2696470877";

export const mapInfluenceExclusions = [
  elderOrShaper + "|1", elderOrShaper + "|2",
  conquerorCitadel + "|1", conquerorCitadel + "|2",
  conquerorCitadel + "|3", conquerorCitadel + "|4",
  originator,
] as const;

const mapInfluenceIds = new Set([elderOrShaper, elderGuardian, conquerorCitadel, originator]);

export function readMapProperties(item: ParsedItem, sections: string[][], strings: TranslationDict) {
  if (item.category !== ItemCategory.Map || !(strings.MAP_TIER instanceof RegExp)) return;
  const remaining = sections.map(section => section.filter(line => {
    const split = line.match(/^([^:：]+)[:：]\s*([+-]?\d+)(?=%|\s|$)/u);
    if (!split) return true;
    const label = split[1].trim();
    const value = Number(split[2]);
    const matches = (prefix?: string) => prefix?.replace(/[:：]\s*$/u, "").trim() === label;
    const reward = mapRewardKeys.find(key => matches(strings[key]));
    if (reward) {
      (item.mapRewards ??= {})[reward] = value;
    } else if (matches(strings.MAP_MONSTER_LEVEL) || matches(strings.AREA_LEVEL)) {
      item.areaLevel = value;
    } else if (matches(strings.MAP_TIER_PROPERTY)) {
      item.mapTier = value;
    } else {
      return true;
    }
    return false;
  }));
  sections.splice(0, sections.length, ...remaining.filter(section => section.length));
}

export function isMapInfluenceId(id: string) {
  return mapInfluenceIds.has(id.split("|", 1)[0]);
}
