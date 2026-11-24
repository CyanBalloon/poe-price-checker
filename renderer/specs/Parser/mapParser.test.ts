import { __testExports, parseClipboard } from "@/parser/Parser";
import { beforeEach, describe, expect, it } from "vitest";
import { setupTests } from "@specs/vitest.setup";
import { RareMap, RareMapFakeAllProps, TestItem } from "./items";
import { init } from "@/assets/data";
import { ParsedItem } from "@/parser/ParsedItem";
import { createTestCreateOptions } from "@specs/helper";
import { createFilters } from "@/web/price-check/filters/create-item-filters";
import { createTradeRequest } from "@/web/price-check/trade/pathofexile-trade";

describe("parseMap", () => {
  beforeEach(async () => {
    setupTests();
    await init("en");
  });
  it("matches the waystone's corruption and supports searching for either state or both", () => {
    const item = parseClipboard(RareMap.rawText.trimEnd() + "\n--------\nCorrupted")._unsafeUnwrap();
    const filters = createFilters(item, createTestCreateOptions());
    const request = () => createTradeRequest(filters, [], item).query;
    const corruption = () => request().filters.misc_filters?.filters.corrupted;

    expect(item.isCorrupted).toBe(true);
    expect(request().stats.some(group => group.type === "not")).toBe(false);
    expect(corruption()).toEqual({ option: "true" });
    filters.corrupted!.value = false;
    expect(corruption()).toEqual({ option: "false" });
    filters.corrupted!.disabled = true;
    expect(corruption()).toBeUndefined();
  });
  it.each([
    [RareMap.rawText, RareMap.mapTier],
    [RareMapFakeAllProps.rawText, RareMapFakeAllProps.mapTier],
  ])(
    "%#. Each mod section is recognized",
    (rawText: string, mapTier: number | undefined) => {
      const sections = __testExports.itemTextToSections(rawText);
      const parsedItem = {} as ParsedItem;
      const res = __testExports.parseWaystone(sections[1], parsedItem);
      expect(res).toBe("SECTION_PARSED");
      expect(parsedItem.mapTier).toBe(mapTier);
    },
  );
  it.each([
    [RareMap.rawText, RareMap],
    [RareMapFakeAllProps.rawText, RareMapFakeAllProps],
  ])(
    "%#. Each mod section adds correct count to newMods",
    (rawText: string, testItem: TestItem) => {
      const sections = __testExports.itemTextToSections(rawText);
      const parsedItem = {} as ParsedItem;

      const res = __testExports.parseWaystone(sections[1], parsedItem);
      expect(res).toBe("SECTION_PARSED");
      expect(parsedItem.mapPackSize).toBe(testItem.mapPackSize);
      expect(parsedItem.mapItemRarity).toBe(testItem.mapItemRarity);
      expect(parsedItem.mapRevives).toBe(testItem.mapRevives);
      expect(parsedItem.mapDropChance).toBe(testItem.mapDropChance);
      expect(parsedItem.mapMagicMonsters).toBe(testItem.mapMagicMonsters);
      expect(parsedItem.mapRareMonsters).toBe(testItem.mapRareMonsters);
    },
  );
});
