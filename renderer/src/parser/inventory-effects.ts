import { catalogueInventoryFlags, conquerorSprite, listingFoilVariation } from "@ipc/item-icons";
import type { BaseType } from "@/assets/data";
import { ItemInfluence, type ParsedItem } from "./ParsedItem";
import { ItemCategory } from "./meta";
import { identityEffects, type IdentityEffect } from "./inventory-identities";

const visualInfluences: Partial<Record<IdentityEffect, ItemInfluence>> = {
  Crusader: ItemInfluence.Crusader, Hunter: ItemInfluence.Hunter, Warlord: ItemInfluence.Warlord, Redeemer: ItemInfluence.Redeemer,
  Shaper: ItemInfluence.Shaper, Elder: ItemInfluence.Elder, CleansingFire: ItemInfluence.SearingExarch, Tangled: ItemInfluence.EaterOfWorlds,
};
function identity(icon?: string) {
  const sprite = icon && conquerorSprite(icon);
  return sprite ? identityEffects[sprite.key] ?? [] : [];
}
export function intrinsicInfluences(icon: string) {
  return identity(icon).flatMap(effect => visualInfluences[effect] ?? []);
}

export interface InventoryFlags {
  fractured?: boolean;
  synthesised?: boolean;
  replica?: boolean;
  mutated?: boolean;
  memoryItem?: boolean;
  vestigial?: boolean;
  foreseeing?: boolean;
  viscera?: boolean;
  trarthan?: boolean;
  foilVariation?: number;
  scourged?: { tier?: number; progress?: number; total?: number; isMap?: boolean };
}

export type InventoryEffect = "fractured" | "synthesised" | "replica" | "foulborn" | "memory" |
  "vestigial" | "foreseeing" | "viscera" | "foil" | "supporter-foil" | "celestial-foil" | "scourged" | "trarthan";

export function catalogueInventory(item: Pick<BaseType, "refName" | "namespace" | "icon" | "viscera">): InventoryFlags {
  const art = catalogueInventoryFlags(item.icon);
  const native = identity(item.icon);
  return {
    synthesised: (item.namespace === "UNIQUE" && art.synthesised) || native.includes("Synthetic"),
    memoryItem: native.includes("ZanaPetals"),
    replica: item.namespace === "UNIQUE" && item.refName.startsWith("Replica "),
    viscera: Boolean(item.viscera) || art.viscera,
    trarthan: item.namespace === "GEM" && item.refName.endsWith(" of Trarthus"),
  };
}

export function clipboardInventory(item: ParsedItem): InventoryFlags {
  const catalogue = catalogueInventory(item.info);
  const isMap = item.category === ItemCategory.Map;
  const tier = item.scourgeTier === "max" ? (isMap ? 10 : 3) : item.scourgeTier;
  return {
    ...catalogue, fractured: item.isFractured, synthesised: item.isSynthesised || catalogue.synthesised,
    mutated: item.isFoulborn, vestigial: item.isVestigial, memoryItem: (item.memoryStrands ?? 0) > 0 || catalogue.memoryItem,
    foreseeing: item.isForeseeing, foilVariation: item.foilVariation,
    scourged: tier ? { tier, isMap } : undefined,
  };
}

export function listingInventory(item: InventoryFlags & { icon: string; frameType?: number; frameTypeId?: string }, gemName?: string): InventoryFlags {
  // Only a specific listing's signed icon describes a foil variation. A catalogue
  // icon can come from a foil or Foulborn copy of an otherwise ordinary unique.
  const supporter = item.frameType === 10 || item.frameTypeId === "SupporterFoil";
  const foil = item.frameType === 9 || item.frameTypeId === "Foil";
  const native = identity(item.icon);
  return {
    fractured: item.fractured, synthesised: item.synthesised || native.includes("Synthetic"), replica: item.replica,
    mutated: item.mutated, vestigial: item.vestigial, memoryItem: item.memoryItem || native.includes("ZanaPetals"),
    foreseeing: item.foreseeing,
    scourged: item.scourged && { ...item.scourged, isMap: conquerorSprite(item.icon)?.key.startsWith("2ditems/maps/") },
    foilVariation: item.foilVariation ?? ((foil || supporter) ? listingFoilVariation(item.icon) ?? (foil ? 0 : undefined) : undefined),
    viscera: catalogueInventoryFlags(item.icon).viscera,
    trarthan: gemName?.endsWith(" of Trarthus"),
  };
}

export function inventoryEffects(flags: InventoryFlags): InventoryEffect[] {
  const effects: InventoryEffect[] = [];
  if (flags.viscera) effects.push("viscera");
  if (flags.fractured) effects.push("fractured");
  if (flags.foilVariation === 0) effects.push("foil");
  if (flags.foilVariation != null && Number.isInteger(flags.foilVariation)) {
    if (flags.foilVariation >= 1 && flags.foilVariation <= 6) effects.push("supporter-foil");
    if (flags.foilVariation >= 7 && flags.foilVariation <= 12) effects.push("celestial-foil");
  }
  if (flags.synthesised) effects.push("synthesised");
  if (flags.replica) effects.push("replica");
  if (flags.trarthan) effects.push("trarthan");
  if (flags.vestigial) effects.push("vestigial");
  if (flags.scourged?.tier && flags.scourged.tier > 0) effects.push("scourged");
  if (flags.mutated) effects.push("foulborn");
  if (flags.foreseeing) effects.push("foreseeing");
  if (flags.memoryItem) effects.push("memory");
  return effects;
}
