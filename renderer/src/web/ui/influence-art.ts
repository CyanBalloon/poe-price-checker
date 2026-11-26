import { ItemInfluence } from "@/parser/ParsedItem";

export const influenceArtOrder = [
  ItemInfluence.Shaper, ItemInfluence.Elder, ItemInfluence.Crusader, ItemInfluence.Redeemer,
  ItemInfluence.Hunter, ItemInfluence.Warlord, ItemInfluence.SearingExarch, ItemInfluence.EaterOfWorlds,
] as const;

export type RimInfluence = ItemInfluence.Hunter | ItemInfluence.Crusader | ItemInfluence.Redeemer | ItemInfluence.Warlord;
export function isRimInfluence(value: ItemInfluence): value is RimInfluence {
  return [ItemInfluence.Hunter, ItemInfluence.Crusader, ItemInfluence.Redeemer, ItemInfluence.Warlord].includes(value);
}
export function elderArtSize(width: number, height: number) {
  const ratio = height / Math.max(1, width);
  if (ratio >= 3.5) return "1x4";
  if (ratio >= 2.5) return "1x3";
  if (ratio >= 1.75) return "2x4";
  return ratio >= 1.25 ? "2x3" : "2x2";
}
