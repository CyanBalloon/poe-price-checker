import { parseClipboard } from "@/parser";
import { AppConfig } from "@/web/Config";
import { init, switchGameData, ITEM_BY_REF, TRADE_TAG_TO_REF } from "@/assets/data/index";
import { describe, expect, it, beforeAll, vi } from "vitest";
import { setupTests } from "@specs/vitest.setup";
import { Host } from "@/web/background/IPC";
import { usePoeninja } from "@/web/background/Prices";
import { useLeagues } from "@/web/background/Leagues";
import { loadPoe1Prices, poe1PriceKey } from "@/web/background/Poe1Prices";
import { createFilters } from "@/web/price-check/filters/create-item-filters";
import { createExactStatFilters, initUiModFilters } from "@/web/price-check/filters/create-stat-filters";
import { groupModifierFilters } from "@/web/price-check/filters/modifier-groups";
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

  it("parses gear, advanced modifiers, and PoE 1 pseudo stats", () => {
    const item = parseClipboard(itemText).unwrapOr(null);
    expect(item?.info.refName).toBe("Clasped Boots");
    expect(item?.statsByType).toHaveLength(5);
    expect(item?.requires).toEqual({ level: 57, str: 0, dex: 27, int: 27 });
    expect(item?.augmentSockets).toBeUndefined();
    const stats = initUiModFilters(item!, { searchStatRange: 10, defaultAllSelected: false });
    expect(stats.some((stat) => stat.tradeId.includes("pseudo.pseudo_total_elemental_resistance"))).toBe(true);
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
    expect(filters.itemLevel).toBeDefined();
    filters.itemLevel = { value: item.itemLevel!, disabled: false };
    const request = createTradeRequest(filters, [], item);
    expect(request.query.filters).toMatchObject({
      misc_filters: { filters: { ilvl: { min: 85 } } },
      socket_filters: { filters: { links: { min: 5 }, sockets: { w: 1 } } },
    });
    expect(request.query.stats[0].filters.map(({ id }) => id)).toContain("pseudo.pseudo_has_shaper_influence");
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
      const lines = category === "Currency"
        ? [{ currencyTypeName: "Divine Orb", chaosEquivalent: 150, detailsId: "divine-orb" }]
        : category === "SkillGem"
          ? [{ name: "Fireball", gemLevel: 21, gemQuality: 20, corrupted: true, chaosValue: 75, detailsId: "fireball-21-20c" }]
          : [];
      return new Response(JSON.stringify({ lines, core: { primary: "chaos", rates: {} }, items: [] }));
    });
    try {
      const { prices } = await loadPoe1Prices("Hardcore Example", new AbortController().signal);
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
