import { parseClipboard } from "@/parser";
import { AppConfig } from "@/web/Config";
import { init, switchGameData, itemCatalogue, CLIENT_STRINGS, ITEM_BY_REF, TRADE_TAG_TO_REF } from "@/assets/data/index";
import { indexCatalogue, searchCatalogue } from "@/assets/data/item-catalogue";
import { exchangeItem } from "@/web/item-search/exchange-item";
import { getDetailsId } from "@/web/price-check/trends/getDetailsId";
import { UncutSkillGem } from "./items";
import { describe, expect, it, beforeAll, vi } from "vitest";
import { setupTests } from "@specs/vitest.setup";
import { Host } from "@/web/background/IPC";
import { usePoeninja } from "@/web/background/Prices";
import { useLeagues } from "@/web/background/Leagues";
import { loadPoe1Prices, poe1PriceKey } from "@/web/background/Poe1Prices";
import { createFilters } from "@/web/price-check/filters/create-item-filters";
import { createExactStatFilters, initUiModFilters } from "@/web/price-check/filters/create-stat-filters";
import { groupModifierFilters } from "@/web/price-check/filters/modifier-groups";
import { createPresets } from "@/web/price-check/filters/create-presets";
import { createTradeRequest, requestTradeResultList } from "@/web/price-check/trade/pathofexile-trade";
import { RateLimiter } from "@/web/price-check/trade/RateLimiter";
import { apiToSatisfySearch } from "@/web/price-check/trade/common";
import { currencyIcon } from "@/web/ui/currency-icons";
import { matchingTradeIcon } from "@/web/background/ImageFetcher";
import { itemIconKey, legacyItemIcon } from "@ipc/item-icons";
import { selectGame } from "@/web/background/Game";

const itemText = `Item Class: Boots
Rarity: Rare
Pandemonium Track
Clasped Boots
--------
Evasion Rating: 75 (augmented)
Energy Shield: 16 (augmented)
--------
Requirements:
Level: 57
Dex: 27
Int: 27
--------
Sockets: B 
--------
Item Level: 85
--------
{ Prefix Modifier "Unworldly" (Tier: 5) — Defences, Evasion, Energy Shield }
48(43-55)% increased Evasion and Energy Shield
{ Prefix Modifier "Stout" (Tier: 5) — Life }
+56(55-69) to maximum Life
{ Suffix Modifier "of the Lightning" (Tier: 2) — Elemental, Lightning, Resistance }
+44(42-45)% to Lightning Resistance
{ Suffix Modifier "of the Magma" (Tier: 2) — Elemental, Fire, Resistance }
+44(42-45)% to Fire Resistance
{ Suffix Modifier "of the Ice" (Tier: 2) — Elemental, Cold, Resistance }
+44(42-45)% to Cold Resistance`;

describe("POE1 Parser", () => {
  beforeAll(async () => {
    setupTests({ game: "poe1" });
    await init("en", "poe1");
  });

  const options = {
    league: "Standard",
    currency: undefined,
    listingType: undefined,
    collapseListings: "app",
    activateStockFilter: true,
    autoFillEmptyAugmentSockets: false,
    exact: true,
    useEn: true,
  } as const;

  it("price checks a Foulborn unique with its replacement modifier selected", () => {
    const text = `Item Class: Claws
Rarity: Unique
Foulborn Hand of Wisdom and Action
Imperial Claw
--------
Claw
Physical Damage: 25-65
Critical Strike Chance: 7.00%
Attacks per Second: 1.60
Weapon Range: 1.1 metres
--------
Requirements:
Level: 68
Dex: 131
Int: 95
--------
Sockets: W R
--------
Item Level: 85
--------
{ Implicit Modifier — Life, Attack }
Grants 46 Life per Enemy Hit
--------
{ Unique Modifier — Damage, Elemental, Lightning, Attack }
Adds 1 to 12 Lightning Damage to Attacks with this Weapon per 10 Intelligence
{ Unique Modifier — Attack, Speed }
1% increased Attack Speed per 25 Dexterity
{ Unique Modifier — Attribute }
11(8-12)% increased Intelligence
{ Unique Modifier — Attribute }
9(8-12)% increased Dexterity
{ Foulborn Unique Modifier — Attribute }
9(8-12)% increased Strength
--------
She thinks and we act.
She acts and we think.
Fragments of the whole that washes clean the skies.`;
    const item = parseClipboard(text)._unsafeUnwrap();
    expect(item).toMatchObject({
      name: "Foulborn Hand of Wisdom and Action",
      isFoulborn: true,
      info: { refName: "Hand of Wisdom and Action", unique: { base: "Imperial Claw" } },
      unknownModifiers: [],
    });
    expect(getDetailsId(item)).toBeUndefined();
    const { presets: [preset] } = createPresets(item, { ...options, searchStatRange: 10, defaultAllSelected: false });
    expect(preset.stats.find(stat => stat.statRef === "#% increased Strength")).toMatchObject({
      tag: "mutated", disabled: false, roll: { value: 9 },
    });
    const groups = groupModifierFilters(preset.stats, item.rarity);
    const foulborn = groups.find(group => group.label === "Foulborn modifiers");
    expect(foulborn?.filters.map(filter => filter.statRef)).toEqual(["#% increased Strength"]);
    expect(foulborn?.filters.filter(filter => !filter.disabled)).toHaveLength(1);
    const regular = groups.find(group => group.label === "Unique modifiers");
    expect(regular?.filters.map(filter => filter.statRef)).toContain("#% increased Dexterity");
    const { query } = createTradeRequest(preset.filters, preset.stats, item);
    expect(query.name).toBe("Hand of Wisdom and Action");
    expect(query.filters.misc_filters?.filters.mutated).toEqual({ option: "true" });
    expect(query.stats[0].filters).toContainEqual(expect.objectContaining({ id: "explicit.stat_734614379" }));

    const ordinary = parseClipboard(text.replace("Foulborn Hand", "Hand")
      .replace("{ Foulborn Unique Modifier — Attribute }\n9(8-12)% increased Strength\n", ""))._unsafeUnwrap();
    expect(ordinary.isFoulborn).toBeUndefined();
    expect(createTradeRequest(createFilters(ordinary, options), [], ordinary).query.filters.misc_filters?.filters.mutated).toBeUndefined();
    const ordinaryFilters = initUiModFilters(ordinary, { searchStatRange: 10, defaultAllSelected: false });
    expect(groupModifierFilters(ordinaryFilters, ordinary.rarity).some(group => group.label === "Foulborn modifiers")).toBe(false);
  });

  it("offers both Marble Amulet uniques and checks the selected unidentified Bonemeld", () => {
    const rawText = [
      "Item Class: Amulets", "Rarity: Unique", "Marble Amulet", "--------",
      "Item Level: 85", "--------", "{ Implicit Modifier — Life }",
      "Regenerate 1.78(1.4-2)% of Life per second", "--------", "Unidentified",
    ].join("\r\n");
    const parsed = parseClipboard(rawText)._unsafeUnwrap();
    expect(parsed).toMatchObject({ isUnidentified: true, itemLevel: 85, info: { namespace: "ITEM", refName: "Marble Amulet" } });
    expect(parsed.newMods[0].stats[0].roll?.value).toBe(1.78);
    const matches = itemCatalogue.value.uniquesByBase.get(parsed.info.refName)!;
    expect([...matches.keys()].sort()).toEqual(["Bloodgrip", "Bonemeld"]);
    expect(matches.get("Bloodgrip")!.icon).not.toBe(matches.get("Bonemeld")!.icon);
    const selected = { ...parsed, info: matches.get("Bonemeld")! };
    expect(getDetailsId(selected)).toEqual({ ns: "UNIQUE", name: "Bonemeld", variant: "Marble Amulet" });
    const query = createTradeRequest(createFilters(selected, options), [], selected).query;
    expect(query.name).toBe("Bonemeld");
    expect(query.filters.misc_filters?.filters.identified?.option).toBe("false");
  });

  it("indexes alternate bases separately and includes uniques from the trade catalogue", () => {
    const lookup = itemCatalogue.value.uniquesByBase;
    expect(lookup.get("Coral Amulet")?.get("Bloodgrip")?.unique?.base).toBe("Coral Amulet");
    expect(lookup.get("Unset Ring")?.get("Angler's Plait")?.unique?.base).toBe("Unset Ring");
    expect(lookup.get("Marble Amulet")?.has("Angler's Plait")).toBe(false);
  });

  it("recognizes the localized PoE1 unidentified marker and resolves the translated base", async () => {
    await switchGameData("poe1", "ru");
    try {
      const base = ITEM_BY_REF("ITEM", "Marble Amulet")![0];
      const text = [CLIENT_STRINGS.ITEM_CLASS + "Амулеты", CLIENT_STRINGS.RARITY + CLIENT_STRINGS.RARITY_UNIQUE,
        base.name, "--------", String(CLIENT_STRINGS.UNIDENTIFIED)].join("\n");
      const item = parseClipboard(text)._unsafeUnwrap();
      expect(item.isUnidentified).toBe(true);
      expect(itemCatalogue.value.uniquesByBase.get(item.info.refName)?.get("Bonemeld")?.name).toBe(ITEM_BY_REF("UNIQUE", "Bonemeld")![0].name);
    } finally {
      await switchGameData("poe1", "en");
    }
  });

  function visceraClipboard(name: string, slot: string, mod: string, advanced = true) {
    return [
      "Item Class: Viscera\n" + name, slot, "Item Level: 83",
      (advanced ? "{ Implicit Modifier }\n" : "") + mod,
      "Take this to the Wickerman in a town or hideout to attach it.",
    ].join("\n--------\n");
  }

  it.each([
    ["Flaming Furnace", "Torso", "16(15-20)% chance to inflict Fire Exposure on Hit\n(Fire Exposure applies -10% to Fire Resistance for 4 seconds)", 16, 15, 20, "implicit.stat_3602667353", "Flaming Furnace"],
    ["Greater Defaced Bust", "Head", "98(75-100)% chance to gain an Endurance Charge when you Stun an Enemy with a Melee Hit", 98, 75, 100, "implicit.stat_4067960074", "Defaced Bust"],
  ] as const)("price checks the copied roll on %s", (name, slot, text, value, min, max, id, base) => {
    const item = parseClipboard(visceraClipboard(name, slot, text))._unsafeUnwrap();
    expect(item.category).toBe("Viscera");
    expect(item.rarity).toBeUndefined();
    expect(item.itemLevel).toBe(83);
    expect(item.unknownModifiers).toEqual([]);
    expect(item.newMods[0].stats[0].roll).toMatchObject({ value, min, max });
    expect(getDetailsId(item)).toEqual({ ns: "ITEM", name, variant: item.info.viscera!.implicits[0].variant });
    const stats = createExactStatFilters(item, item.statsByType, { searchStatRange: 0, defaultAllSelected: false });
    expect(groupModifierFilters(stats, item.rarity).find(group => group.label === "Implicit")?.filters[0])
      .toMatchObject({ tradeId: [id], disabled: false, roll: { value } });
    const query = createTradeRequest(createFilters(item, options), stats, item).query;
    expect(query.type).toBe(base);
    expect(query.term).toBe(name === base ? undefined : name);
    expect(query.stats[0].filters.some(filter => filter.id === id)).toBe(true);
  });

  it("recognizes every bundled Viscera and its implicit options with plain clipboard text", () => {
    const catalogue = [...itemCatalogue.value.entries.values()].filter(item => item.viscera);
    expect(new Set(catalogue.map(item => item.viscera!.base)).size).toBe(164);
    expect(catalogue).toHaveLength(426);
    const failures: string[] = [];
    for (const entry of catalogue) {
      for (const implicit of entry.viscera!.implicits) {
        const rolled = implicit.text.replace(/\((-?\d+(?:\.\d+)?)–-?\d+(?:\.\d+)?\)/g, "$1");
        const item = parseClipboard(visceraClipboard(entry.name, entry.viscera!.slot, rolled, false)).unwrapOr(null);
        if (item?.info.refName !== entry.refName || item.unknownModifiers.length || !item.statsByType.length ||
          item.statsByType.some(stat => stat.type !== "implicit" || !stat.stat.trade.ids.implicit?.length) ||
          getDetailsId(item)?.variant !== implicit.variant) {
          failures.push(entry.name + " / " + rolled);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("matches the market variant for a guaranteed Endurance Charge roll", () => {
    const text = "Gain an Endurance Charge when you Stun an Enemy with a Melee Hit";
    const item = parseClipboard(visceraClipboard("Greater Defaced Bust", "Head", text))._unsafeUnwrap();
    expect(getDetailsId(item, [{ text, variant: text }])?.variant).toBe(text);
    expect(item.statsByType[0].stat.trade.ids.implicit).toEqual(["implicit.stat_4067960074"]);
  });

  it("resolves localized Viscera, including two heads with the same Russian name", async () => {
    try {
      for (const language of ["ru", "ko", "cmn-Hant"]) {
        await switchGameData("poe1", language);
        const names = language === "ru" ? ["Greater Defaced Bust", "Bandit Witch's Head", "Witch's Head"] : ["Greater Defaced Bust"];
        for (const name of names) {
          const entry = ITEM_BY_REF("ITEM", name)![0];
          const { slot, implicits } = entry.viscera!;
          const roll = implicits[0].text.replace(/\((-?\d+(?:\.\d+)?)[–~-]-?\d+(?:\.\d+)?\)/g, "$1");
          const text = [CLIENT_STRINGS.ITEM_CLASS + "Viscera\n" + entry.name, slot, CLIENT_STRINGS.ITEM_LEVEL + "83", roll].join("\n--------\n");
          const item = parseClipboard(text)._unsafeUnwrap();
          expect(item.info.refName).toBe(name);
          expect(item.unknownModifiers).toEqual([]);
          expect(getDetailsId(item)?.variant).toBe(implicits[0].variant);
        }
      }
    } finally {
      await switchGameData("poe1", "en");
    }
  });

  it("searches the 3.30 catalogue before prices arrive and ranks exact names first", () => {
    const index = indexCatalogue(itemCatalogue.value.entries.values());
    for (const [query, expected] of [
      ["hunters exalted orb", "Hunter's Exalted Orb"],
      [" ducat   Merrick’s ", "Merrick's Ducat"],
      ["flaming goat hoof", "Flaming Goat Hoof"],
      ["chart (abyssal plain)", "Chart (Abyssal Plain)"],
      ["chaos orb", "Chaos Orb"],
    ]) {
      const matches = searchCatalogue(index, query);
      expect(matches[0]?.refName).toBe(expected);
      expect(matches.filter(item => item.refName === expected)).toHaveLength(1);
    }
    expect(searchCatalogue(index, "or")).toEqual([]);
    expect(searchCatalogue(index, "orb")).toHaveLength(50);
  });

  it("routes copied currency, fragments and cards using exchange membership", () => {
    for (const [itemClass, rarity, name] of [
      ["Stackable Currency", "Currency", "Hunter's Exalted Orb"],
      ["Stackable Currency", "Currency", "Merrick's Ducat"],
      ["Map Fragments", "Normal", "Sacrifice at Dusk"],
      ["Divination Cards", "Divination Card", "A Chilling Wind"],
    ]) {
      const parsed = parseClipboard(["Item Class: " + itemClass, "Rarity: " + rarity, name, "--------", "Stack Size: 1/10"].join("\n"))._unsafeUnwrap();
      expect(exchangeItem(parsed)?.refName).toBe(name);
    }
    expect(exchangeItem(parseClipboard(itemText)._unsafeUnwrap())).toBeUndefined();
  });

  it("uses localized catalogue names and switches to PoE2 exchange gem levels", async () => {
    try {
      await switchGameData("poe1", "ru");
      const name = ITEM_BY_REF("ITEM", "Hunter's Exalted Orb")![0].name;
      expect(name).not.toBe("Hunter's Exalted Orb");
      expect(searchCatalogue(indexCatalogue(itemCatalogue.value.entries.values()), name)[0]?.refName).toBe("Hunter's Exalted Orb");
      await switchGameData("poe2", "en");
      AppConfig().game = "poe2";
      expect(itemCatalogue.value.exchange.has("Merrick's Ducat")).toBe(false);
      expect(exchangeItem(parseClipboard(UncutSkillGem.rawText)._unsafeUnwrap())?.refName).toBe("Uncut Skill Gem (Level 19)");
    } finally {
      AppConfig().game = "poe1";
      await switchGameData("poe1", "en");
    }
  });

  it("parses gear, advanced modifiers, and PoE 1 pseudo stats", () => {
    const item = parseClipboard(itemText).unwrapOr(null);
    expect(item?.info.refName).toBe("Clasped Boots");
    expect(item?.statsByType).toHaveLength(5);
    expect(item?.requires).toEqual({ level: 57, str: 0, dex: 27, int: 27 });
    expect(item?.augmentSockets).toBeUndefined();
    const stats = initUiModFilters(item!, { searchStatRange: 10, defaultAllSelected: false });
    expect(stats.some((stat) => stat.tradeId.includes("pseudo.pseudo_total_elemental_resistance"))).toBe(true);
  });

  it("selects tier 1 prefixes and suffixes in both presets, including stats with pseudo totals", () => {
    const gear = itemText
      .replace('"Stout" (Tier: 5)', '"Stout" (Tier: 1)')
      .replace('"of the Magma" (Tier: 2)', '"of the Magma" (Tier: 1)');
    const item = parseClipboard(gear)._unsafeUnwrap();
    const opts = { searchStatRange: 10, defaultAllSelected: false, includeSourceModifiers: true };
    for (const stats of [initUiModFilters(item, opts), createExactStatFilters(item, item.statsByType, opts)]) {
      const groups = groupModifierFilters(stats, item.rarity);
      const life = groups.find(group => group.label === "Prefix")?.filters.find(filter => filter.statRef === "+# to maximum Life");
      const fire = groups.find(group => group.label === "Suffix")?.filters.find(filter => filter.statRef === "+#% to Fire Resistance");
      expect(life?.disabled).toBe(false);
      expect(fire?.disabled).toBe(false);
      const query = createTradeRequest(createFilters(item, options), stats, item).query;
      const enabledIds = query.stats.filter(group => !group.disabled)
        .flatMap(group => group.filters.filter(filter => !filter.disabled).map(filter => filter.id));
      expect(enabledIds).toEqual(expect.arrayContaining([life!.tradeId[0], fire!.tradeId[0]]));
      expect(stats.some(filter => !filter.disabled && filter.statRef === "+#% to Cold Resistance")).toBe(false);
    }
  });

  it("orders equipment properties and affixes while keeping the initial search intact", () => {
    const item = parseClipboard(itemText.replace('{ Prefix Modifier "Unworldly"',
      '21% increased Elemental Damage (implicit)\n--------\n{ Prefix Modifier "Unworldly"'))._unsafeUnwrap();
    const opts = { searchStatRange: 10, defaultAllSelected: false };
    const initial = initUiModFilters(item, opts);
    const filters = initUiModFilters(item, { ...opts, includeSourceModifiers: true });
    const groups = groupModifierFilters(filters, item.rarity);
    expect(groups.map(group => group.label)).toEqual(["Pseudo stats", "Base", "Implicit", "Prefix", "Suffix"]);
    expect(groups[1].filters.map(filter => filter.statRef)).toContain("Evasion Rating: #");
    expect(groups[3].filters.map(filter => filter.statRef)).toContain("+# to maximum Life");
    expect(groups[4].filters.map(filter => filter.statRef)).toEqual([
      "+#% to Lightning Resistance", "+#% to Fire Resistance", "+#% to Cold Resistance",
    ]);
    const selectedIds = (stats: typeof filters) => stats.filter(stat => !stat.disabled).flatMap(stat => stat.tradeId);
    expect(selectedIds(filters)).toEqual(selectedIds(initial));
    const itemFilters = createFilters(item, options);
    const activeTradeStats = (stats: typeof filters) => createTradeRequest(itemFilters, stats, item).query.stats
      .filter(group => !group.disabled).flatMap(group => group.filters.filter(filter => !filter.disabled));
    expect(activeTradeStats(filters)).toEqual(activeTradeStats(initial));
    const fire = groups[4].filters.find(filter => filter.statRef === "+#% to Fire Resistance")!;
    fire.disabled = false;
    expect(selectedIds(filters)).toContain(fire.tradeId[0]);
    expect(activeTradeStats(filters).map(filter => filter.id)).toContain(fire.tradeId[0]);

    const plain = parseClipboard(itemText.replace(/^\{[^\n]+\}\n/gm, "").replace(/\([\d-]+\)/g, ""))._unsafeUnwrap();
    const plainGroups = groupModifierFilters(initUiModFilters(plain, { ...opts, includeSourceModifiers: true }), plain.rarity);
    expect(plainGroups.map(group => group.label)).toContain("Explicit modifiers");
    expect(plainGroups.map(group => group.label)).not.toContain("Prefix");
  });

  it.each([
    ["plain copy", "+20 to maximum Life (crafted)", "+# to maximum Life", undefined],
    ["master-crafted prefix", '{ Master Crafted Prefix Modifier "Haku\'s" (Rank: 1) — Life }\n+20 to maximum Life', "+# to maximum Life", "prefix"],
    ["master-crafted suffix", '{ Master Crafted Suffix Modifier "of Craft" (Rank: 1) — Resistance }\n+20% to Fire Resistance', "+#% to Fire Resistance", "suffix"],
    ["crafted prefix", '{ Crafted Prefix Modifier "Haku\'s" (Rank: 1) — Life }\n+20 to maximum Life', "+# to maximum Life", "prefix"],
  ])("shows the actual craft in its own group for a %s", (_label, craft, statRef, generation) => {
    const base = itemText.split('{ Prefix Modifier "Unworldly"')[0];
    const item = parseClipboard(base + "+44% to Cold Resistance\n--------\n" + craft)._unsafeUnwrap();
    const opts = { searchStatRange: 10, defaultAllSelected: false, includeSourceModifiers: true };
    const crafted = item.statsByType.find(stat => stat.type === "crafted");
    expect(crafted?.sources[0].modifier.info.generation).toBe(generation);
    const stats = initUiModFilters(item, opts);
    const groups = groupModifierFilters(stats, item.rarity);
    const craftFilters = groups.find(group => group.label === "Crafted")?.filters;
    expect(craftFilters?.map(filter => filter.statRef)).toEqual([statRef]);
    expect(craftFilters![0].tradeId[0]).toMatch(/^crafted\./);
    expect(groups.find(group => group.label === "Explicit modifiers")?.filters.map(filter => filter.statRef))
      .toEqual(["+#% to Cold Resistance"]);
    const exact = createExactStatFilters(item, item.statsByType, opts);
    expect(groupModifierFilters(exact, item.rarity).find(group => group.label === "Crafted")?.filters[0])
      .toMatchObject({ statRef, disabled: true });
  });

  it.each([
    ["+20 to maximum Life (fractured)", "+# to maximum Life"],
    ['{ Fractured Prefix Modifier "Stout" (Tier: 5) — Life }\n+56(55-69) to maximum Life', "+# to maximum Life"],
    ['{ Fractured Suffix Modifier "of the Magma" (Tier: 2) — Resistance }\n+44(42-45)% to Fire Resistance', "+#% to Fire Resistance"],
  ])("groups a confirmed fracture once in both presets: %s", (fracture, statRef) => {
    const base = itemText.split('{ Prefix Modifier "Unworldly"')[0];
    const item = parseClipboard(base + "+44% to Cold Resistance\n+20% to Lightning Resistance (crafted)\n--------\n" + fracture)._unsafeUnwrap();
    const opts = { searchStatRange: 10, defaultAllSelected: false, includeSourceModifiers: true };
    for (const stats of [initUiModFilters(item, opts), createExactStatFilters(item, item.statsByType, opts)]) {
      const groups = groupModifierFilters(stats.filter(filter => !filter.hidden || !filter.disabled), item.rarity);
      const rows = groups.find(group => group.label === "Fractured")?.filters;
      expect(rows?.map(filter => filter.statRef)).toEqual([statRef]);
      expect(rows![0].tradeId[0]).toMatch(/^fractured\./);
      expect(stats.filter(filter => filter.statRef === statRef)).toHaveLength(1);
      expect(groups.find(group => group.label === "Crafted")?.filters.map(filter => filter.statRef))
        .toEqual(["+#% to Lightning Resistance"]);
    }
  });

  it("does not infer a fractured group from an item flag", () => {
    const item = { ...parseClipboard(itemText)._unsafeUnwrap(), isFractured: true };
    const opts = { searchStatRange: 10, defaultAllSelected: false, includeSourceModifiers: true };
    for (const stats of [initUiModFilters(item, opts), createExactStatFilters(item, item.statsByType, opts)]) {
      expect(groupModifierFilters(stats, item.rarity).some(group => group.label === "Fractured")).toBe(false);
    }
  });

  it("keeps PoE 1 requirements and unique flavour text out of modifier warnings", () => {
    const ringText = [
      "Item Class: Rings", "Rarity: Unique", "Polaric Devastation", "Opal Ring",
      "--------",
      "Requirements:", "Level: 80",
      "--------",
      "Item Level: 81",
      "--------",
      "21% increased Elemental Damage (implicit)",
      "--------",
      "25% increased Global Critical Strike Chance",
      "--------",
      "Those that escaped the annihilating light",
      "sank eternally into crushing darkness.",
      "--------",
      "Corrupted",
    ].join("\n");

    const ring = parseClipboard(ringText)._unsafeUnwrap();
    expect(ring.info.refName).toBe("Polaric Devastation");
    expect(ring.requires?.level).toBe(80);
    expect(ring.statsByType).toHaveLength(2);
    expect(ring.unknownModifiers).toEqual([]);
    const filters = initUiModFilters(ring, { searchStatRange: 10, defaultAllSelected: false });
    expect(groupModifierFilters(filters, ring.rarity).map(group => group.label))
      .toEqual(["Implicit", "Unique modifiers"]);

    const ringWithUnknownModifier = parseClipboard(
      ringText.replace("25% increased Global Critical Strike Chance", [
        "{ Unique Modifier }",
        "Unrecognized modifier from a future patch",
      ].join("\n")),
    )._unsafeUnwrap();
    expect(ringWithUnknownModifier.unknownModifiers.map((mod) => mod.text))
      .toEqual(["Unrecognized modifier from a future patch"]);
  });

  it("builds linked socket, item level, and influence filters", () => {
    const gear = itemText.replace("Sockets: B ", "Sockets: B-B-B-W-R G") + "\n--------\nShaper Item";
    const item = parseClipboard(gear)._unsafeUnwrap();
    expect(item.gemSockets).toEqual({ number: 6, linked: 5, white: 1 });
    const filters = createFilters(item, options);
    expect(filters.whiteSockets).toEqual({ value: 1, disabled: true });
    expect(filters.itemLevel).toBeDefined();
    filters.itemLevel = { value: item.itemLevel!, disabled: false };
    const request = createTradeRequest(filters, [], item);
    expect(request.query.filters).toMatchObject({
      misc_filters: { filters: { ilvl: { min: 85 } } },
      socket_filters: { filters: { links: { min: 5 } } },
    });
    expect(request.query.filters).not.toHaveProperty("socket_filters.filters.sockets");
    expect(request.query.stats[0].filters.map(({ id }) => id)).toContain("pseudo.pseudo_has_shaper_influence");

    filters.whiteSockets!.disabled = false;
    expect(createTradeRequest(filters, [], item).query.filters)
      .toHaveProperty("socket_filters.filters.sockets.w", 1);
  });

  it("parses map tiers in nameplates and adds PoE 1 map filters", () => {
    const item = parseClipboard("Item Class: Maps\nRarity: Normal\nMap (Tier 16)\n--------\nItem Level: 83")._unsafeUnwrap();
    expect(item.mapTier).toBe(16);
    const request = createTradeRequest(createFilters(item, options), [], item);
    expect(request.query.type).toEqual({ option: "Map", discriminator: "map" });
    expect(request.query.filters.map_filters?.filters).toMatchObject({
      map_tier: { min: 16, max: 16 },
      map_blighted: { option: "false" },
    });
  });

  it("prices a Tier 16 Planar Challenge by its rewards and influence, with optional affixes", () => {
    const item = parseClipboard([
      "Item Class: Maps", "Rarity: Rare", "Planar Challenge", "Map (Tier 16)", "--------",
      "Monster Level: 83", "Atlas Drops: +84% (augmented)", "Item Rarity: +51% (augmented)",
      "Monster Pack Size: +32% (augmented)", "More Maps: +35% (augmented)", "--------",
      "Item Level: 83", "--------", "{ Implicit Modifier }",
      "Area is Influenced by the Originator's Memories", "--------",
      '{ Prefix Modifier "Abundant" (Tier: 1) }', "41% increased number of Rare Monsters",
      '{ Suffix Modifier "of Frenzy" (Tier: 1) }', "Monsters have +1 to Maximum Frenzy Charges",
    ].join("\r\n"))._unsafeUnwrap();
    const { presets: [preset] } = createPresets(item, { ...options, searchStatRange: 10, defaultAllSelected: false });
    expect(item).toMatchObject({ mapTier: 16, areaLevel: 83, itemLevel: 83 });
    expect(item.unknownModifiers).toEqual([]);
    expect(apiToSatisfySearch(item, preset.stats, preset.filters)).toBe("trade");
    expect(exchangeItem(item)).toBeUndefined();
    const groups = groupModifierFilters(preset.stats, item.rarity);
    expect(groups.map(group => group.label)).toEqual(["Map influence", "Prefix", "Suffix"]);
    expect(preset.stats.filter(stat => !stat.disabled).map(stat => stat.tradeId[0])).toEqual(["implicit.stat_2696470877"]);
    const request = () => createTradeRequest(preset.filters, preset.stats, item).query;
    const query = request();
    expect(query.filters.map_filters?.filters).toMatchObject({
      map_tier: { min: 16, max: 16 }, map_bonus: { min: 84 }, map_iir: { min: 51 }, map_packsize: { min: 32 },
    });
    expect(query.filters.map_filters?.filters).not.toHaveProperty("area_level");
    expect(query.stats[0].filters.filter(stat => !stat.disabled)).toEqual([
      expect.objectContaining({ id: "pseudo.pseudo_map_more_map_drops", value: { min: 35 } }),
      expect.objectContaining({ id: "implicit.stat_2696470877" }),
    ]);
    preset.filters.mapRewards!.find(reward => reward.key === "MAP_MORE_MAPS")!.disabled = true;
    preset.filters.mapRewards!.find(reward => reward.key === "MAP_ATLAS_DROPS")!.value = 70;
    groups[1].filters[0].disabled = false;
    expect(request().filters.map_filters?.filters.map_bonus).toEqual({ min: 70 });
    expect(request().stats[0].filters.filter(stat => !stat.disabled).map(stat => stat.id))
      .toEqual(["implicit.stat_2696470877", "explicit.stat_3126771445"]);
  });

  it("prices the copied corrupted Empyrean Abyss without selecting its T1 affixes", () => {
    const item = parseClipboard(`Item Class: Maps
Rarity: Rare
Empyrean Abyss
Map (Tier 16)
--------
Atlas Drops: +49% (augmented)
Item Rarity: +29% (augmented)
Monster Pack Size: +19% (augmented)
--------
Item Level: 85
--------
Monster Level: 83
--------
{ Prefix Modifier "Mirrored" (Tier: 1) — Damage, Elemental }
Rare Monsters have Elemental Thorns reflecting 1500 Elemental Damage
{ Prefix Modifier "Multifarious" (Tier: 1) }
Area has increased monster variety — Unscalable Value
{ Prefix Modifier "Fleet" (Tier: 1) — Attack, Caster, Speed }
26(25-30)% increased Monster Movement Speed
40(35-45)% increased Monster Attack Speed
45(35-45)% increased Monster Cast Speed
{ Suffix Modifier "of Carnage" (Tier: 1) }
Monsters Maim on Hit with Attacks
(Maimed enemies have 30% reduced Movement Speed)
--------
Travel to a Map of this tier or lower by using this in a personal Map Device. Maps can only be used once.
--------
Corrupted`)._unsafeUnwrap();
    expect(item).toMatchObject({ mapTier: 16, itemLevel: 85, areaLevel: 83, isCorrupted: true });
    expect(item.unknownModifiers).toEqual([]);
    const { presets: [preset] } = createPresets(item, { ...options, searchStatRange: 10, defaultAllSelected: false });
    const groups = groupModifierFilters(preset.stats, item.rarity);
    expect(groups.map(group => group.label)).toEqual(["Prefix", "Suffix"]);
    expect(new Set(preset.stats.flatMap(stat => stat.sources.map(source => source.modifier.info.name))))
      .toEqual(new Set(["Mirrored", "Multifarious", "Fleet", "of Carnage"]));
    const query = createTradeRequest(preset.filters, preset.stats, item).query;
    expect(query.filters.map_filters?.filters).toMatchObject({
      map_tier: { min: 16, max: 16 }, map_bonus: { min: 49 }, map_iir: { min: 29 }, map_packsize: { min: 19 },
    });
    expect(query.stats.flatMap(group => group.filters.filter(stat => !stat.disabled))).toEqual([]);
    expect(query.filters.map_filters?.filters).not.toHaveProperty("area_level");
    expect(query.filters.misc_filters?.filters ?? {}).not.toHaveProperty("ilvl");
  });

  it("keeps legacy quantity separate from Atlas Drops and preserves individual reward and influence types", () => {
    const item = parseClipboard([
      "Item Class: Maps", "Rarity: Normal", "Map (Tier 16)", "--------", "Item Quantity: +80%",
      "More Currency: +90%", "--------", "More Scarabs: +40%", "More Divination Cards: +30%",
      "--------", "Area is influenced by The Elder", "Map is occupied by The Purifier",
    ].join("\n"))._unsafeUnwrap();
    const { presets: [preset] } = createPresets(item, { ...options, searchStatRange: 10, defaultAllSelected: false });
    const query = createTradeRequest(preset.filters, preset.stats, item).query;
    expect(query.filters.map_filters?.filters.map_iiq).toEqual({ min: 80 });
    expect(query.filters.map_filters?.filters).not.toHaveProperty("map_bonus");
    expect(query.stats[0].filters.filter(stat => !stat.disabled)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "pseudo.pseudo_map_more_currency_drops", value: { min: 90 } }),
      expect.objectContaining({ id: "pseudo.pseudo_map_more_scarab_drops", value: { min: 40 } }),
      expect.objectContaining({ id: "pseudo.pseudo_map_more_card_drops", value: { min: 30 } }),
      expect.objectContaining({ id: "implicit.stat_1792283443|2" }),
      expect.objectContaining({ id: "implicit.stat_3624393862|4" }),
    ]));
  });

  it("uses the gem level and quality without support sockets", () => {
    const item = parseClipboard("Item Class: Skill Gems\nRarity: Gem\nFireball\n--------\nLevel: 21 (Max)\nQuality: +20%\n--------\nCorrupted")._unsafeUnwrap();
    expect(item.gemLevel).toBe(21);
    const request = createTradeRequest(createFilters(item, options), [], item);
    expect(request.query.filters.misc_filters?.filters).toMatchObject({
      gem_level: { min: 21 }, quality: { min: 20 }, corrupted: { option: "true" },
    });
  });

  it("selects bulk exchange for PoE 1 currency", () => {
    const item = parseClipboard("Item Class: Stackable Currency\nRarity: Currency\nOrb of Fusing\n--------\nStack Size: 15/20")._unsafeUnwrap();
    expect(item.stackSize?.value).toBe(15);
    expect(apiToSatisfySearch(item, [], createFilters(item, options))).toBe("bulk");
    expect(TRADE_TAG_TO_REF.get("fusing")).toBe("Orb of Fusing");
  });

  it("sends searches to the correct API and isolates same-league results", async () => {
    const item = parseClipboard(itemText)._unsafeUnwrap();
    const body = createTradeRequest(createFilters(item, options), [], item);
    const proxy = vi.mocked(Host.proxy);
    const wait = vi.spyOn(RateLimiter, "waitMulti").mockResolvedValue();
    proxy.mockResolvedValueOnce(new Response(JSON.stringify({ id: "poe1", result: [], total: 0 })));
    proxy.mockResolvedValueOnce(new Response(JSON.stringify({ id: "poe2", result: [], total: 0 })));
    expect((await requestTradeResultList(body, "Hardcore Example")).id).toBe("poe1");
    AppConfig().game = "poe2";
    try {
      expect((await requestTradeResultList(body, "Hardcore Example")).id).toBe("poe2");
      expect(proxy).toHaveBeenCalledWith("www.pathofexile.com/api/trade/search/Hardcore%20Example", expect.anything());
      expect(proxy).toHaveBeenCalledWith("www.pathofexile.com/api/trade2/search/Hardcore%20Example", expect.anything());
    } finally {
      AppConfig().game = "poe1";
      wait.mockRestore();
    }
  });

  it("restores game-specific data and league preferences", async () => {
    const proxy = vi.mocked(Host.proxy);
    const respond = (id: string) => new Response(JSON.stringify({ result: [{ id, text: id }] }));
    proxy.mockImplementation(async (url) => {
      if (String(url).endsWith("trade/data/leagues")) return respond("PoE 1 League");
      if (String(url).endsWith("trade2/data/leagues")) return respond("PoE 2 League");
      return new Response(JSON.stringify({ result: [] }));
    });
    AppConfig().leagueId = "PoE 1 League";
    AppConfig().leagueByGame = { poe2: "PoE 2 League" };
    try {
      expect(await selectGame("poe2")).toBe(true);
      expect(AppConfig().leagueId).toBe("PoE 2 League");
      expect(ITEM_BY_REF("ITEM", "Orb of Fusing")).toBeUndefined();
      expect(await selectGame("poe1")).toBe(true);
      expect(AppConfig().leagueId).toBe("PoE 1 League");
      expect(ITEM_BY_REF("ITEM", "Orb of Fusing")?.[0].tradeTag).toBe("fusing");
      expect(await switchGameData("poe1", "de")).toBe(true);
      expect(parseClipboard(itemText).isOk()).toBe(true);
    } finally {
      proxy.mockRestore();
    }
  });

  it("isolates original artwork and legacy icon caches across games", async () => {
    const poe1Icon = ITEM_BY_REF("ITEM", "Chaos Orb")![0].icon!;
    expect(currencyIcon("c")).toBe("/images/poe1/chaos.png");
    expect(legacyItemIcon(poe1Icon, "poe1")).toBe(poe1Icon);
    expect(legacyItemIcon(poe1Icon, "poe2")).toBeUndefined();
    expect(itemIconKey("poe1", "ITEM", "Chaos Orb")).not.toBe(itemIconKey("poe2", "ITEM", "Chaos Orb"));
    expect(itemIconKey("poe1", "ITEM", "Fireball")).not.toBe(itemIconKey("poe1", "GEM", "Fireball"));
    try {
      await switchGameData("poe2", "en");
      AppConfig().game = "poe2";
      const poe2Icon = ITEM_BY_REF("ITEM", "Chaos Orb")![0].icon!;
      expect(poe2Icon).not.toBe(poe1Icon);
      expect(currencyIcon("chaos")).toBe("/images/poe2/chaos.png");
      expect(legacyItemIcon(poe2Icon, "poe2")).toBe(poe2Icon);
      expect(legacyItemIcon(poe2Icon, "poe1")).toBeUndefined();
    } finally {
      await switchGameData("poe1", "en");
      AppConfig().game = "poe1";
    }
  });

  it("keeps relaxed trade matches from supplying artwork for a different item", () => {
    const listing = { frameType: 3, baseType: "Opal Ring", name: "Polaric Devastation", icon: "/polaric.png" };
    expect(matchingTradeIcon(listing, "UNIQUE", ["Polaric Devastation"])).toBe(listing.icon);
    expect(matchingTradeIcon(listing, "UNIQUE", ["Circle of Fear"])).toBeUndefined();
    expect(matchingTradeIcon(listing, "ITEM", ["Opal Ring"])).toBeUndefined();
    expect(matchingTradeIcon({ ...listing, frameType: 2 }, "ITEM", ["Opal Ring"])).toBe(listing.icon);
  });

  it("loads localized PoE 1 names and properties", async () => {
    expect(await switchGameData("poe1", "ru")).toBe(true);
    try {
      const item = parseClipboard("Класс предмета: Камни умений\nРедкость: Камень\nОгненный шар\n--------\nУровень: 20")._unsafeUnwrap();
      expect(item.info.refName).toBe("Fireball");
      expect(item.gemLevel).toBe(20);
    } finally {
      await switchGameData("poe1", "en");
    }
  });

  it("uses raw chaos values for PoE1 estimates, ranges, and seller equivalents", async () => {
    const proxy = vi.mocked(Host.proxy);
    proxy.mockImplementation(async (url) => {
      if (String(url).endsWith("/data/leagues")) {
        return new Response(JSON.stringify({ result: [{ id: "Standard", text: "Standard" }] }));
      }
      const currency = String(url).endsWith("type=Currency");
      const lines = currency ? [
        { currencyTypeName: "Divine Orb", chaosEquivalent: 150, detailsId: "divine-orb" },
        { currencyTypeName: "Exalted Orb", chaosEquivalent: 12, detailsId: "exalted-orb" },
      ] : [];
      return new Response(JSON.stringify({ lines, core: { primary: "chaos", rates: {} } }));
    });
    try {
      await useLeagues().load();
      const prices = usePoeninja();
      await prices.forceLoad();
      expect(prices.xchgRateCurrency.value?.id).toBe("chaos");
      expect(prices.findPriceByQuery({ ns: "ITEM", name: "Divine Orb" })?.primaryValue).toBe(150);
      const display = (value: number | [number, number]) => prices.displayPrice(prices.autoCurrency(value));
      expect(display(149.99).primary.currency).toBe("chaos");
      expect(display(149.99).chaosEquivalent).toBeUndefined();
      expect(display(150).primary).toEqual({ min: 1, max: 1, currency: "div" });
      expect(display(370).primary.min).toBeCloseTo(2.4667);
      expect(display(370).chaosEquivalent?.min).toBe(370);
      expect(display([120, 180]).primary.currency).toBe("chaos");
      expect(display([150, 300]).primary).toEqual({ min: 1, max: 2, currency: "div" });
      expect(prices.autoCurrency([0.4, 370])).toEqual({ min: 0.4, max: 370, currency: "chaos" });
      expect(prices.cachedCurrencyByQuery({ ns: "ITEM", name: "Divine Orb" }, 3))
        .toEqual({ min: 450, max: 450, currency: "chaos" });
    } finally {
      proxy.mockRestore();
    }
  });

  it("reads PoE 1 stash prices in chaos and indexes gem variants", async () => {
    const proxy = vi.mocked(Host.proxy);
    proxy.mockImplementation(async (url) => {
      const request = new URL("https://" + url);
      expect(request.searchParams.get("league")).toBe("Hardcore Example");
      const category = request.searchParams.get("type");
      if (request.pathname.includes("/exchange/") && (category === "Currency" || category === "Ducat")) {
        const name = category === "Currency" ? "Hunter's Exalted Orb" : "Merrick's Ducat";
        return new Response(JSON.stringify({
          core: { primary: "divine", rates: { chaos: 150 } },
          items: [{ id: "short-id", name, detailsId: "market-details" }],
          lines: [{ id: "short-id", primaryValue: 2 }],
        }));
      }
      const lines = category === "Currency"
        ? [{ currencyTypeName: "Divine Orb", chaosEquivalent: 150, detailsId: "divine-orb" }]
        : category === "SkillGem"
          ? [{ name: "Fireball", gemLevel: 21, gemQuality: 20, corrupted: true, chaosValue: 75, detailsId: "fireball-21-20c" }]
          : [];
      return new Response(JSON.stringify({ lines, core: { primary: "chaos", rates: {} }, items: [] }));
    });
    try {
      const { prices } = await loadPoe1Prices("Hardcore Example", new AbortController().signal);
      for (const [name, category] of [["Hunter's Exalted Orb", "currency"], ["Merrick's Ducat", "ducats"]]) {
        expect(prices.get(poe1PriceKey({ ns: "ITEM", name }))).toMatchObject({
          chaos: 300, cx: true, url: "https://poe.ninja/poe1/economy/examplehc/" + category + "/market-details",
        });
      }
      expect(prices.get(poe1PriceKey({ ns: "ITEM", name: "Divine Orb" }))?.chaos).toBe(150);
      expect(prices.get(poe1PriceKey({ ns: "GEM", name: "Fireball", variant: "21/20c" }))).toMatchObject({
        chaos: 75,
        url: "https://poe.ninja/poe1/economy/examplehc/skill-gems/fireball-21-20c",
      });
    } finally {
      proxy.mockRestore();
    }
  });
});
