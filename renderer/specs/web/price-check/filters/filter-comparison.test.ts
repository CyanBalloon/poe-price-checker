import { reactive } from "vue";
import { beforeAll, describe, expect, it } from "vitest";
import { init } from "@/assets/data";
import { parseClipboard } from "@/parser";
import { ModifierType } from "@/parser/modifiers";
import { createPresets } from "@/web/price-check/filters/create-presets";
import { calculatedStatToFilter } from "@/web/price-check/filters/create-stat-filters";
import { modifierComparison, searchBounds, selectedFirst, unavailableModifierText } from "@/web/price-check/filters/filter-comparison";
import { FilterTag } from "@/web/price-check/filters/interfaces";
import { createTradeRequest } from "@/web/price-check/trade/pathofexile-trade";
import { createTestCreateOptions, createTestStatFilter } from "@specs/helper";
import { HighDamageRareItem, RareWithImplicit } from "@specs/Parser/items";
import { setupTests } from "@specs/vitest.setup";

describe("Item vs. Search", () => {
  beforeAll(async () => {
    setupTests({ game: "poe2" });
    await init("en", "poe2");
  });

  it("keeps the preset order within each selection state and edits the original filters", () => {
    const a = { ...createTestStatFilter(), tradeId: ["a"], disabled: true, hidden: "optional" };
    const b = { ...createTestStatFilter(), tradeId: ["b"] };
    const c = { ...createTestStatFilter(), tradeId: ["c"] };
    const unavailable = createTestStatFilter();
    const preset = [a, b, unavailable, c];
    expect(selectedFirst(preset)).toEqual([b, c, a, unavailable]);
    selectedFirst(preset)[1].disabled = true;
    expect(selectedFirst(preset)).toEqual([b, a, unavailable, c]);
    expect(preset).toEqual([a, b, unavailable, c]);
  });

  it("does not repeat a recognized clipboard line as unavailable in a reactive preset", () => {
    const item = parseClipboard(RareWithImplicit.rawText)._unsafeUnwrap();
    const { active, presets } = createPresets(item, { ...createTestCreateOptions(), includeSourceModifiers: true });
    const filters = reactive(presets.find(p => p.id === active)!.stats);
    expect(unavailableModifierText(item, filters)).toEqual([]);
    item.unknownModifiers.push({ text: "Uncatalogued modifier", type: ModifierType.Explicit });
    expect(unavailableModifierText(item, filters)).toEqual(["Uncatalogued modifier"]);
  });

  it("shows both copied damage rolls while searching by their editable average", () => {
    const item = parseClipboard(HighDamageRareItem.rawText)._unsafeUnwrap();
    const calc = item.statsByType.find(stat => stat.stat.ref === "Adds # to # Physical Damage")!;
    const filter = calculatedStatToFilter(calc, 10, item);
    filter.disabled = false;
    filter.roll!.min = 70;
    filter.roll!.max = undefined;
    expect(modifierComparison(filter, item)).toMatchObject({ onItem: "54–94", search: "Avg ≥ 70" });
    filter.disabled = true;
    expect(modifierComparison(filter, item)).toMatchObject({ onItem: "54–94", search: "Any" });
  });

  it("shows both affix contributions when trade sums their values", () => {
    const item = parseClipboard(HighDamageRareItem.rawText)._unsafeUnwrap();
    const calc = item.statsByType.find(stat => stat.stat.ref === "#% increased Physical Damage" && stat.sources.length === 2)!;
    expect(modifierComparison(calculatedStatToFilter(calc, 10, item), item).onItem).toBe("173% + 78%");
  });

  it("keeps the copied defence independent of quality projections and search bounds", () => {
    const item = parseClipboard(RareWithImplicit.rawText)._unsafeUnwrap();
    item.armourAR = 174;
    const filter = { ...createTestStatFilter(), tag: FilterTag.Property, tradeId: ["item.armour"], text: "Armour: #",
      roll: { value: 201, min: 199, max: undefined, default: { min: 198, max: 204 }, dp: false, isNegated: false } };
    expect(modifierComparison(filter, item)).toEqual({ label: "Armour", onItem: "174", search: "≥ 199" });
    expect(searchBounds(undefined, 0, "%")).toBe("≤ 0%");
    expect(searchBounds(16, 16)).toBe("= 16");
    expect(searchBounds(5, 8)).toBe("5–8");
  });

  it("offers modifiers omitted by the base preset without adding them to its request until selected", () => {
    const item = parseClipboard(RareWithImplicit.rawText.trimEnd() + '\n{ Prefix Modifier "Healthy" (Tier: 4) — Life }\n+55(51-58) to maximum Life')._unsafeUnwrap();
    const opts = createTestCreateOptions();
    const base = (include: boolean) => createPresets(item, { ...opts, includeSourceModifiers: include })
      .presets.find(p => p.id === "filters.preset_base_item")!;
    const original = base(false);
    const full = base(true);
    const query = () => createTradeRequest(full.filters, full.stats, item).query;
    expect(query()).toEqual(createTradeRequest(original.filters, original.stats, item).query);
    const extra = full.stats.find(f => f.allModsOnly && f.statRef === "# to Strength")!;
    expect(extra.disabled).toBe(true);
    extra.disabled = false;
    expect(selectedFirst(full.stats)).toContain(extra);
    expect(query().stats[0].filters).toContainEqual(expect.objectContaining({ id: extra.tradeId[0], disabled: false }));
  });
});
