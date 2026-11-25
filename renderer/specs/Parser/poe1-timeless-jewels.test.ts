import { beforeAll, describe, expect, it } from "vitest";
import { init, switchGameData } from "@/assets/data";
import { parseClipboard } from "@/parser";
import { ModifierType } from "@/parser/modifiers";
import { tryParseTranslation } from "@/parser/stat-translations";
import { joinTimelessSeedLines } from "@/parser/timeless-jewel";
import { createPresets } from "@/web/price-check/filters/create-presets";
import { modifierComparison } from "@/web/price-check/filters/filter-comparison";
import { createTradeRequest } from "@/web/price-check/trade/pathofexile-trade";
import { setupTests } from "@specs/vitest.setup";

const options = {
  league: "Standard", currency: undefined, listingType: undefined, collapseListings: "app",
  activateStockFilter: true, autoFillEmptyAugmentSockets: false, useEn: true,
  searchStatRange: 25, defaultAllSelected: false, includeSourceModifiers: true,
} as const;

const elegantHubris = `Item Class: Jewels
Rarity: Unique
Elegant Hubris
Timeless Jewel
--------
Limited to: 1 Historic
Radius: Large
--------
Item Level: 84
--------
{ Unique Modifier }
Commissioned 134800(2000-160000) coins to commemorate Caspiro(...)
Passives in radius are Conquered by the Eternal Empire
(Conquered Passive Skills cannot be modified by other Jewels)
Historic — Unscalable Value
--------
They believed themselves better than the past, but that confidence brought about nightmare.
--------
Place into an allocated Jewel Socket on the Passive Skill Tree. Right click to remove from the Socket.`;

function priceCheck(clipboard: string) {
  const item = parseClipboard(clipboard)._unsafeUnwrap();
  const { presets, active } = createPresets(item, options);
  const preset = presets.find(preset => preset.id === active)!;
  const query = () => createTradeRequest(preset.filters, preset.stats, item).query;
  return { item, preset, query };
}

describe("PoE1 Timeless Jewel seeds", () => {
  beforeAll(async () => {
    setupTests({ game: "poe1" });
    await init("en", "poe1");
  });

  it("price checks the copied Elegant Hubris by its exact 134800 Caspiro seed", () => {
    const { item, preset, query } = priceCheck(elegantHubris);
    expect(item.unknownModifiers).toEqual([]);
    const seed = preset.stats.find(stat => stat.tradeId.includes("explicit.pseudo_timeless_jewel_caspiro"))!;
    expect(seed).toBeDefined();
    expect(seed).toMatchObject({
      disabled: false,
      roll: { value: 134800, min: 134800, max: 134800, default: { min: 134800, max: 134800 } },
    });
    expect(modifierComparison(seed, item)).toEqual({ label: "Jewel seed · Caspiro", onItem: "134800", search: "= 134800" });
    expect(query().name).toBe("Elegant Hubris");
    expect(query().stats[0].filters.filter(stat => !stat.disabled)).toEqual([
      expect.objectContaining({ id: "explicit.pseudo_timeless_jewel_caspiro", value: { min: 134800, max: 134800 } }),
    ]);
    seed.disabled = true;
    expect(query().stats[0].filters.filter(stat => !stat.disabled)).toEqual([]);
  });

  const families = [
    ["Elegant Hubris", "Timeless Jewel", "Commissioned # coins to commemorate @", "Eternal Empire", 134800, ["Cadiro", "Caspiro", "Victario", "Chitus"]],
    ["Glorious Vanity", "Timeless Jewel", "Bathed in the blood of # sacrificed in the name of @", "Vaal", 4007, ["Ahuana", "Doryani", "Xibaqua", "Zerphi"]],
    ["Lethal Pride", "Timeless Jewel", "Commanded leadership over # warriors under @", "Karui", 15493, ["Akoya", "Kaom", "Rakiata", "Kiloava"]],
    ["Brutal Restraint", "Timeless Jewel", "Denoted service of # dekhara in the akhara of @", "Maraketh", 5581, ["Asenath", "Balbala", "Nasima", "Deshret"]],
    ["Militant Faith", "Timeless Jewel", "Carved to glorify # new faithful converted by High Templar @", "Templars", 7413, ["Avarius", "Dominus", "Maxarius", "Venarius"]],
    ["Heroic Tragedy", "Timeless Jewel", "Remembrancing # songworthy deeds by the line of @", "Kalguur", 7635, ["Medved", "Uhtred", "Vorana"]],
    ["Reclaimed Malevolence", "Assembled Eye Jewel", "Binding # souls to phylacteries to sustain @", "Abyssal", 2084, ["Zorath"]],
    ["Destructive Aspiration", "Ghastly Eye Jewel", "Subjugating # souls in the thrall of @", "Abyssal", 5498, ["Amanamu"]],
    ["Baleful Dominion", "Hypnotic Eye Jewel", "Subjugating # souls in the thrall of @", "Abyssal", 518, ["Kurgal"]],
    ["Festering Vengeance", "Murderous Eye Jewel", "Subjugating # souls in the thrall of @", "Abyssal", 1570, ["Tecrod"]],
    ["Extinguishing Grasp", "Searching Eye Jewel", "Subjugating # souls in the thrall of @", "Abyssal", 5001, ["Ulaman"]],
  ] as const;

  it.each(families)("matches the rolled number and named figure on %s in basic and advanced copies", (name, base, text, faction, value, figures) => {
    const caption = faction === "Abyssal" ? "Passives affected" : "Passives in radius";
    const itemClass = faction === "Abyssal" ? "Abyss Jewels" : "Jewels";
    for (const figure of figures) {
      for (const advanced of [false, true]) {
        const line = text.replace("#", String(value)).replace("@", figure + (advanced ? "(…)" : ""));
        const mod = (advanced ? "{ Unique Modifier }\n" : "") + line + "\n" + caption + " are Conquered by the " + faction;
        const { item, query } = priceCheck(`Item Class: ${itemClass}\nRarity: Unique\n${name}\n${base}\n--------\nItem Level: 84\n--------\n${mod}\nHistoric`);
        expect(item.unknownModifiers, figure).toEqual([]);
        expect(query().stats[0].filters.filter(stat => !stat.disabled), figure).toEqual([
          expect.objectContaining({ id: "explicit.pseudo_timeless_jewel_" + figure.toLowerCase(), value: { min: value, max: value } }),
        ]);
      }
    }
  });

  it("accepts expanded advanced descriptions and a seed without its explanatory line", () => {
    for (const text of [
      elegantHubris.replace("Caspiro(...)", "Caspiro(Cadiro-Victario)"),
      elegantHubris.replace("134800(2000-160000)", "134800(134800)"),
      elegantHubris.replace("Passives in radius are Conquered by the Eternal Empire\n", ""),
    ]) {
      const { query } = priceCheck(text);
      expect(query().stats[0].filters).toContainEqual(expect.objectContaining({
        id: "explicit.pseudo_timeless_jewel_caspiro", disabled: false, value: { min: 134800, max: 134800 },
      }));
    }
  });

  it("preserves Militant Faith's separate Devotion mods and does not invent a missing seed", () => {
    const text = `Item Class: Jewels
Rarity: Unique
Militant Faith
Timeless Jewel
--------
{ Unique Modifier }
Carved to glorify 7413 new faithful converted by High Templar Dominus(...)
4% increased Area Damage per 10 Devotion
Historic`;
    const { item, preset } = priceCheck(text);
    expect(item.unknownModifiers).toEqual([]);
    expect(preset.stats.find(stat => stat.tradeId.includes("explicit.stat_1724614884"))?.roll?.value).toBe(4);
    expect(priceCheck(text.replace("7413", "(2000-10000)")).preset.stats
      .some(stat => stat.tradeId.includes("explicit.pseudo_timeless_jewel_dominus"))).toBe(false);
  });

  it("uses the active language when the figure precedes the seed", async () => {
    await switchGameData("poe1", "ko");
    try {
      const lines = joinTimelessSeedLines([
        "카스피로(...)를 기념하기 위해 제작한 주화 134800(2000-160000)개",
        "반경 내 패시브 스킬은 영원한 제국의 지배를 받음",
      ]);
      expect(lines).toHaveLength(1);
      const stat = tryParseTranslation({ string: lines[0], unscalable: false }, ModifierType.Explicit, undefined);
      expect(stat?.stat.trade.ids.explicit).toEqual(["explicit.pseudo_timeless_jewel_caspiro"]);
      expect(stat?.roll?.value).toBe(134800);
    } finally {
      await switchGameData("poe1", "en");
    }
  });
});
