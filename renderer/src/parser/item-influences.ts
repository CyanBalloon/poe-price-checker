import { ItemInfluence } from "./ParsedItem";

export const itemInfluences = [
  { value: ItemInfluence.Shaper, key: "shaper", marker: "INFLUENCE_SHAPER" },
  { value: ItemInfluence.Elder, key: "elder", marker: "INFLUENCE_ELDER" },
  { value: ItemInfluence.Crusader, key: "crusader", marker: "INFLUENCE_CRUSADER" },
  { value: ItemInfluence.Hunter, key: "hunter", marker: "INFLUENCE_HUNTER" },
  { value: ItemInfluence.Redeemer, key: "redeemer", marker: "INFLUENCE_REDEEMER" },
  { value: ItemInfluence.Warlord, key: "warlord", marker: "INFLUENCE_WARLORD" },
  { value: ItemInfluence.SearingExarch, key: "searing", marker: "INFLUENCE_SEARING" },
  { value: ItemInfluence.EaterOfWorlds, key: "tangled", marker: "INFLUENCE_TANGLED" },
] as const;

type InfluenceFlags = Partial<Record<typeof itemInfluences[number]["key"], boolean>>;
export type ListingInfluences = InfluenceFlags & { influences?: InfluenceFlags };

// The trade API puts Eldritch flags on the item and Conqueror flags in influences.
export function readListingInfluences(item: ListingInfluences): ItemInfluence[] {
  return itemInfluences.filter(({ key }) => item[key] === true || item.influences?.[key] === true)
    .map(({ value }) => value);
}
