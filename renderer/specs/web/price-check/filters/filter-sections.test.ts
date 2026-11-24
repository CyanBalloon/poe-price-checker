import { describe, expect, it } from "vitest";
import { init } from "@/assets/data";
import { parseClipboard } from "@/parser";
import { createPresets } from "@/web/price-check/filters/create-presets";
import { activeLabel, buildFilterSections, initialSection } from "@/web/price-check/filters/filter-sections";
import { createTradeRequest } from "@/web/price-check/trade/pathofexile-trade";
import { createTestCreateOptions } from "@specs/helper";
import { RareMap, RareWithImplicit } from "@specs/Parser/items";
import { setupTests } from "@specs/vitest.setup";

async function navigate(text: string, game: "poe1" | "poe2") {
  setupTests({ game });
  await init("en", game);
  const item = parseClipboard(text)._unsafeUnwrap();
  const { active, presets } = createPresets(item, { ...createTestCreateOptions(), includeSourceModifiers: true });
  const preset = presets.find(p => p.id === active)!;
  const sections = () => buildFilterSections(item, preset.filters, preset.stats, game === "poe1", key => key);
  return { sections, query: () => createTradeRequest(preset.filters, preset.stats, item).query };
}

describe("Filter section navigator", () => {
  it("opens PoE1 map rewards and counts tier, corruption and influence in their own sections", async () => {
    const { sections, query } = await navigate([
      "Item Class: Maps", "Rarity: Rare", "Iron Toil", "Map (Tier 16)", "--------", "Monster Level: 83",
      "Atlas Drops: +104% (augmented)", "Item Rarity: +61% (augmented)", "Monster Pack Size: +40% (augmented)",
      "--------", "Item Level: 83", "--------", "{ Implicit Modifier }", "Area is Influenced by the Originator's Memories",
      "--------", "Corrupted",
    ].join("\n"), "poe1");
    const groups = sections();
    expect(groups[0]?.id).toBe("all");
    expect(initialSection(groups)).toBe("drops");
    const activeIn = (id: string) => groups.find(s => s.id === id)!.rows.map(activeLabel).filter(Boolean);
    expect(activeIn("map")).toEqual(["Map Tier 16", "Corrupted"]);
    expect(activeIn("influence")).toEqual(["Originator's Memories"]);
    expect(activeIn("drops")).toHaveLength(3);
    const atlas = groups.find(s => s.id === "drops")!.rows[0];
    if (atlas.kind !== "numeric") throw new Error("Expected editable Atlas Drops");
    atlas.filter.value = 80;
    expect(query().filters.map_filters?.filters.map_bonus?.min).toBe(80);
    expect(atlas.itemValue).toBe(104);
  });

  it("routes PoE2 waystone revives into details and percentages into drop bonuses", async () => {
    const { sections } = await navigate(RareMap.rawText, "poe2");
    const groups = sections();
    expect(groups[0]?.id).toBe("all");
    expect(initialSection(groups)).toBe("drops");
    const idsIn = (section: string) => groups.find(s => s.id === section)!.rows.flatMap(row => row.kind === "modifier" ? row.filter.tradeId : []);
    expect(idsIn("map")).toContain("item.map_revives");
    expect(idsIn("drops")).toContain("item.map_drop_chance");
    expect(groups.some(s => s.id === "influence")).toBe(false);
  });

  it("uses affix navigation for equipment and shares selected filters with its flat list", async () => {
    const { sections } = await navigate(RareWithImplicit.rawText, "poe2");
    const groups = sections();
    expect(groups[0]?.id).toBe("all");
    expect(initialSection(groups)).toMatch(/^group-(prefix|suffix)$/);
    expect(groups.map(s => s.label)).toEqual(expect.arrayContaining(["Implicit", "Prefix", "Suffix", "Item properties", "View all mods"]));
    expect(groups.some(s => ["map", "drops", "influence", "rooms", "gem"].includes(s.id))).toBe(false);
    const strength = groups.find(s => s.label === "Suffix")!.rows.find(row => row.kind === "modifier" && row.filter.statRef === "# to Strength");
    if (strength?.kind !== "modifier") throw new Error("Expected the copied Strength suffix");
    strength.filter.disabled = false;
    const all = sections().find(s => s.id === "all")!.rows;
    const checks = all.map(row => row.kind === "modifier" && !row.filter.disabled);
    expect(checks).toEqual([...checks].sort((a, b) => Number(b) - Number(a)));
    expect(all.some(row => row.kind === "modifier" && row.filter === strength.filter)).toBe(true);
  });

  it("opens the room filters on a Chronicle and gem levels on a skill gem", async () => {
    const temple = await navigate(["Item Class: Misc Map Items", "Rarity: Currency", "Chronicle of Atzoatl", "--------",
      "Area Level: 83", "--------", "Open Rooms:", "Atlas of Worlds (Tier 3)", "Obstructed Rooms:", "Apex of Atzoatl"].join("\n"), "poe1");
    expect(initialSection(temple.sections())).toBe("rooms");
    expect(temple.sections().find(s => s.id === "rooms")!.rows.map(activeLabel)).toContain("Apex of Atzoatl Open room");
    const gem = await navigate("Item Class: Skill Gems\nRarity: Gem\nRighteous Fire\n--------\nSpell, AoE, Fire\nLevel: 20 (Max)\nQuality: +20%", "poe1");
    expect(initialSection(gem.sections())).toBe("gem");
    expect(gem.sections().find(s => s.id === "gem")!.rows.some(row => row.key === "gem-level")).toBe(true);
  });
});
