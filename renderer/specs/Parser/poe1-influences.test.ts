import { beforeEach, describe, expect, it } from "vitest";
import { CLIENT_STRINGS, init, ITEM_BY_REF } from "@/assets/data";
import { ItemInfluence, parseClipboard } from "@/parser";
import { ModifierType } from "@/parser/modifiers";
import { readListingInfluences } from "@/parser/item-influences";
import { createPresets } from "@/web/price-check/filters/create-presets";
import { buildFilterSections } from "@/web/price-check/filters/filter-sections";
import { createTradeRequest } from "@/web/price-check/trade/pathofexile-trade";
import { iconSearchQuery, matchingTradeIcon } from "@/web/background/ImageFetcher";
import { iconHasInfluenceBackdrop, itemIconKey, plainItemIconUrl, sameItemIconArt } from "@ipc/item-icons";
import { createTestCreateOptions } from "@specs/helper";
import { setupTests } from "@specs/vitest.setup";

const gloves = `Item Class: Gloves
Rarity: Rare
Horror Fingers
Wyvernscale Gauntlets
--------
Quality: +20% (augmented)
Armour: 626 (augmented)
Evasion Rating: 626 (augmented)
--------
Requirements:
Level: 84
Str: 98
Dex: 155
Int: 159
--------
Sockets: W-R-W-R
--------
Item Level: 85
--------
{ Searing Exarch Implicit Modifier (Greater) — Elemental, Fire, Ailment }
Ignites you inflict spread to other Enemies within 1.3 metres
{ Eater of Worlds Implicit Modifier (Lesser) }
Inflict Fire Exposure on Hit, applying -11% to Fire Resistance
(Fire Exposure subtracts from Fire Resistance for 4 seconds)
--------
{ Prefix Modifier "Athlete's" (Tier: 1) — Life }
+127(115-129) to maximum Life
{ Prefix Modifier "Mammoth's" (Tier: 1) — Defences, Armour, Evasion }
39(39-42)% increased Armour and Evasion
16(16-17)% increased Stun and Block Recovery
{ Prefix Modifier "Hero's" (Tier: 2) — Defences, Armour, Evasion }
83(80-91)% increased Armour and Evasion
{ Suffix Modifier "of Tzteosh" (Tier: 1) — Elemental, Fire, Resistance }
+46(46-48)% to Fire Resistance
{ Suffix Modifier "of the Jaguar" (Tier: 4) — Attribute }
+42(38-42) to Dexterity
{ Master Crafted Suffix Modifier "of Craft" (Rank: 3) — Elemental, Fire, Cold, Resistance }
+19(17-20)% to Fire and Cold Resistances
Searing Exarch Item
Eater of Worlds Item`;
const footer = "Searing Exarch Item\nEater of Worlds Item";
const eldritch = [ItemInfluence.SearingExarch, ItemInfluence.EaterOfWorlds];
const parse = (text: string) => parseClipboard(text)._unsafeUnwrap();

describe("PoE1 equipment influences", () => {
  beforeEach(async () => {
    setupTests({ game: "poe1" });
    await init("en", "poe1");
  });

  it("keeps both item markers out of the craft and exposes independent trade filters", () => {
    const item = parse(gloves.replace(/\n/g, "\r\n"));
    expect(item.influences).toEqual(eldritch);
    expect(item.unknownModifiers).toEqual([]);
    const craft = item.newMods.find(mod => mod.info.type === ModifierType.Crafted);
    expect(craft?.stats).toHaveLength(1);
    expect(craft?.stats[0].stat.ref).toMatch(/Fire and Cold Resistance/);
    expect(item.newMods.filter(mod => mod.info.type === ModifierType.Implicit)).toHaveLength(2);
    const { active, presets } = createPresets(item, { ...createTestCreateOptions(), includeSourceModifiers: true });
    const { filters, stats } = presets.find(p => p.id === active)!;
    const sections = buildFilterSections(item, filters, stats, true, key => key);
    expect(sections.find(s => s.id === "influence")?.rows.map(row => row.key)).toEqual(eldritch.map(v => "influence-" + v));
    expect(sections.find(s => s.id === "group-implicit")?.rows).toHaveLength(2);
    expect(sections.find(s => s.id === "group-crafted")?.rows).toHaveLength(1);
    expect(sections.some(s => s.id === "unavailable")).toBe(false);

    const query = () => createTradeRequest(filters, stats, item).query.filters.misc_filters?.filters;
    for (const flag of filters.influences!) flag.disabled = false;
    expect(query()).toMatchObject({ searing_item: { option: "true" }, tangled_item: { option: "true" } });
    filters.influences![0].disabled = true;
    expect(query()?.searing_item).toBeUndefined();
    expect(query()?.tangled_item?.option).toBe("true");
    filters.influences![1].disabled = true;
    expect(query()?.tangled_item).toBeUndefined();
  });

  it("reads advanced headers without a footer and deduplicates split or repeated markers", () => {
    expect(parse(gloves.replace("\n" + footer, "")).influences).toEqual(eldritch);
    const split = gloves.replace(footer, "--------\nSearing Exarch Item\n--------\nEater of Worlds Item\nSearing Exarch Item");
    expect(parse(split).influences).toEqual(eldritch);
    const basic = gloves.split("{ Searing Exarch")[0] + "+127 to maximum Life\nHunter Item\n--------\nShaper Item\nCorrupted";
    const legacy = parse(basic);
    expect(legacy.influences).toEqual([ItemInfluence.Hunter, ItemInfluence.Shaper]);
    expect(legacy.isCorrupted).toBe(true);
    expect(legacy.unknownModifiers).toEqual([]);
    expect(parse(gloves.split("{ Searing Exarch")[0] + "+127 to maximum Life").influences).toEqual([]);
  });

  it.each([
    ["ru", "Предмет Пламенного экзарха", "Предмет Пожирателя миров"],
    ["ko", "작열의 총주교 아이템", "세계 포식자 아이템"],
    ["cmn-Hant", "卓烙總督物品", "吞噬天地物品"],
  ])("recognizes official %s clipboard markers without an advanced header", async (lang, exarch, eater) => {
    await init(lang, "poe1");
    const base = ITEM_BY_REF("ITEM", "Wyvernscale Gauntlets")![0];
    const item = parse([CLIENT_STRINGS.ITEM_CLASS + "Gloves", CLIENT_STRINGS.RARITY + CLIENT_STRINGS.RARITY_NORMAL,
      base.name, "--------", exarch, eater].join("\n"));
    expect(item.influences).toEqual(eldritch);
    expect(item.unknownModifiers).toEqual([]);
  });

  it("matches the base silhouette through an influence backdrop and rejects different sprites or scales", () => {
    const url = (asset: object) => "https://web.poecdn.com/gen/image/" +
      btoa(JSON.stringify([25, 14, asset])).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_") + "/hash/icon.png";
    const gloves = { f: "2DItems/Armours/Gloves/GlovesStrDex3", w: 2, h: 2, scale: 1 };
    const decorated = url({ ...gloves, shaper: true });
    expect(sameItemIconArt(url(gloves), decorated)).toBe(true);
    expect(iconHasInfluenceBackdrop(url(gloves))).toBe(false);
    for (const key of ["shaper", "elder", "searing", "tangled"]) {
      expect(iconHasInfluenceBackdrop(url({ ...gloves, [key]: true }))).toBe(true);
      expect(iconHasInfluenceBackdrop(url({ ...gloves, [key]: false }))).toBe(false);
    }
    expect(iconHasInfluenceBackdrop("/images/404.png")).toBe(false);
    expect(plainItemIconUrl(decorated)).toBe("https://web.poecdn.com/image/Art/2DItems/Armours/Gloves/GlovesStrDex3.png?w=2&h=2&scale=1");
    expect(plainItemIconUrl(url({ ...gloves, realm: "poe2" }))).toBeUndefined();
    expect(plainItemIconUrl(url({ ...gloves, f: "2DItems/../OtherArt" }))).toBeUndefined();
    expect(sameItemIconArt(url({ ...gloves, f: "OtherArt" }), decorated)).toBe(false);
    expect(sameItemIconArt(url({ ...gloves, scale: 2 }), decorated)).toBe(false);
    expect(sameItemIconArt(url({ ...gloves, realm: "poe2" }), decorated)).toBe(false);
    expect(sameItemIconArt("/images/404.png", decorated)).toBe(false);
  });

  it("uses only official art with the same base and full set of influence flags", () => {
    const base = "Wyvernscale Gauntlets";
    const icon = "https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQXJtb3Vycy9HbG92ZXMvR2xvdmVzU3RyRGV4MyIsInciOjIsImgiOjIsInNjYWxlIjoxLCJzZWFyaW5nIjp0cnVlLCJ0YW5nbGVkIjp0cnVlfV0/2932c6be17/GlovesStrDex3.png";
    const listed = { baseType: base, frameType: 2, icon, searing: true, tangled: true };
    expect(readListingInfluences(listed)).toEqual(eldritch);
    expect(matchingTradeIcon(listed, "ITEM", [base], [...eldritch].reverse())).toBe(icon);
    expect(matchingTradeIcon(listed, "ITEM", [base])).toBeUndefined();
    expect(matchingTradeIcon(listed, "ITEM", [base], [ItemInfluence.SearingExarch])).toBeUndefined();
    expect(matchingTradeIcon(listed, "ITEM", ["Imperial Staff"], eldritch)).toBeUndefined();
    expect(matchingTradeIcon({ ...listed, icon: "https://example.com/gauntlets.png" }, "ITEM", [base], eldritch)).toBeUndefined();
    expect(readListingInfluences({ shaper: true, influences: { shaper: true, hunter: true } })).toEqual([ItemInfluence.Shaper, ItemInfluence.Hunter]);
    expect(itemIconKey("poe1", "ITEM", base, eldritch)).toBe(itemIconKey("poe1", "ITEM", base, [...eldritch].reverse()));
    expect(itemIconKey("poe1", "ITEM", base, eldritch)).not.toBe(itemIconKey("poe1", "ITEM", base));
    expect(iconSearchQuery(base, "ITEM", [ItemInfluence.SearingExarch])).toMatchObject({
      filters: { misc_filters: { filters: { searing_item: { option: "true" }, tangled_item: { option: "false" } } } },
    });
    expect(iconSearchQuery("Imperial Staff", "ITEM", [ItemInfluence.Hunter]).stats[0]).toEqual({
      type: "and", filters: [{ id: "pseudo.pseudo_has_hunter_influence" }],
    });
  });
});
