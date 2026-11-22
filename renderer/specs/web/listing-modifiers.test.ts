import { describe, expect, it } from "vitest";
import { listingModifierFilters } from "@/web/price-check/trade/listing-modifiers";

describe("Open trade listing modifiers", () => {
  it("matches structured map lines by hash even when the metadata is in another order", () => {
    const item = {
      explicitMods: [
        { hash: "stat.explicit.stat_1890519597", description: "23% increased Monster Damage" },
        { hash: "stat.explicit.stat_3126771445", description: "41% increased number of Rare Monsters" },
      ],
      implicitMods: [{ hash: "stat.implicit.stat_2696470877", description: "Area is Influenced by the Originator's Memories" }],
      extended: { hashes: { explicit: [["explicit.stat_3126771445", [3]], ["explicit.stat_1890519597", [1]]] } },
    };
    expect(listingModifierFilters(item, false)).toEqual([
      { id: "explicit.stat_1890519597", value: { min: 23, max: 23 } },
      { id: "explicit.stat_3126771445", value: { min: 41, max: 41 } },
      { id: "implicit.stat_2696470877" },
    ]);
  });

  it("keeps legacy text, unrolled properties and missing modifier data usable", () => {
    const item = { explicitMods: ["+52 to maximum Life"], extended: { hashes: {
      explicit: [["explicit.stat_3299347043", [0]]], implicit: [["implicit.stat_2696470877", [0]]],
    } } };
    expect(listingModifierFilters(item, true)).toEqual([
      { id: "explicit.stat_3299347043", value: { min: 52 } }, { id: "implicit.stat_2696470877" },
    ]);
    expect(listingModifierFilters({}, false)).toEqual([]);
  });
});
