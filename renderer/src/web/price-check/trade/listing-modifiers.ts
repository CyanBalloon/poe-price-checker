import { parseAffixStrings } from "@/parser/Parser";
import type { PricingResult, TradeModLine, TradeRequest } from "./pathofexile-trade";

type RawItem = NonNullable<PricingResult["rawResult"]>["item"];
type ListingItem = Pick<RawItem, Extract<keyof RawItem, `${string}Mods` | "extended">>;
type TradeStat = TradeRequest["query"]["stats"][number]["filters"][number];

/** Current trade listings carry the stat ID on the line. Older replies index a separate hash table. */
export function listingModifierFilters(item: ListingItem, unique: boolean): TradeStat[] {
  const stats = new Map<string, TradeStat>();
  const linesByDomain: Record<string, TradeModLine[] | undefined> = {
    explicit: item.explicitMods, implicit: item.implicitMods, crafted: item.craftedMods,
    fractured: item.fracturedMods, enchant: item.enchantMods, rune: item.runeMods,
    desecrated: item.desecratedMods, mutated: item.mutatedMods, pseudo: item.pseudoMods,
  };
  const hashes = item.extended?.hashes ?? {};
  for (const [domain, lines] of Object.entries(linesByDomain)) {
    for (const [index, line] of (lines ?? []).entries()) {
      const id = (typeof line === "object" ? line?.hash?.replace(/^stat\./, "") : undefined) ?? hashes[domain]?.[index]?.[0];
      if (typeof id !== "string" || !id) continue;
      const text = parseAffixStrings(typeof line === "string" ? line : line?.description);
      const rolls = text.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
      const filter: TradeStat = { id };
      if (rolls?.length) {
        const [min, max = min] = rolls;
        filter.value = unique ? { min } : { min, max: Math.max(min, max) };
      }
      stats.set(id, filter);
    }
  }

  for (const entries of Object.values(hashes)) {
    for (const [id] of entries) {
      if (typeof id === "string" && id && !stats.has(id)) stats.set(id, { id });
    }
  }
  for (const mods of Object.values(item.extended?.mods ?? {})) {
    for (const mod of mods) {
      for (const mag of mod.magnitudes ?? []) {
        if (!mag.hash || stats.has(mag.hash)) continue;
        const min = parseFloat(mag.min);
        const max = parseFloat(mag.max);
        stats.set(mag.hash, { id: mag.hash, value: {
          min: Number.isFinite(min) ? min : undefined,
          max: !unique && Number.isFinite(max) ? max : undefined,
        } });
      }
    }
  }
  return [...stats.values()];
}
