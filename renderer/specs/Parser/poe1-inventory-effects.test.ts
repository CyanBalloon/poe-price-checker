import { beforeEach, describe, expect, it } from "vitest";
import { init, ITEM_BY_REF } from "@/assets/data";
import { parseClipboard } from "@/parser";
import { catalogueInventory, clipboardInventory, intrinsicInfluences, inventoryEffects, listingInventory } from "@/parser/inventory-effects";
import { setupTests } from "@specs/vitest.setup";

const ring = "Item Class: Rings\nRarity: Rare\nEntropy Grip\nPaua Ring\n--------\nItem Level: 85";
const circle = "Item Class: Rings\nRarity: Unique\nCircle of Fear\nSapphire Ring\n--------\nItem Level: 85";
const parse = (clipboard: string) => parseClipboard(clipboard)._unsafeUnwrap();
const catalogue = (unique: string) => ITEM_BY_REF("UNIQUE", unique)![0];

describe("PoE1 inventory appearance", () => {
  beforeEach(async () => {
    setupTests({ game: "poe1" });
    await init("en", "poe1");
  });

  it("recognises Synthesis with either spelling of the base and with an inherent catalogue flag", () => {
    for (const text of [circle, circle + "\n--------\nSynthesised Item", circle.replace("Sapphire Ring", "Synthesised Sapphire Ring")]) {
      expect(inventoryEffects(clipboardInventory(parse(text)))).toEqual(["synthesised"]);
    }
    for (const name of ["Circle of Fear", "Nebulis", "Storm's Gift", "Rational Doctrine"]) {
      expect(inventoryEffects(catalogueInventory(catalogue(name)))).toEqual(["synthesised"]);
    }
  });

  it("removes item markers from stat text and preserves independent combinations", () => {
    const item = parse(ring + "\nMemory Strands: 47\n--------\n+32 to maximum Life\nFractured Item\nHunter Item");
    expect(item.memoryStrands).toBe(47);
    expect(item.unknownModifiers).toEqual([]);
    expect(item.influences).toEqual(["Hunter"]);
    expect(inventoryEffects(clipboardInventory(item))).toEqual(["fractured", "memory"]);
    expect(clipboardInventory(parse(ring + "\nMemory Strands: 0")).memoryItem).toBe(false);
    expect(parse(ring + "\n--------\n10% increased chance for Equipment Items dropped in your Maps to have Memory Strands").memoryStrands).toBeUndefined();
  });

  it("maps the native foil labels and avoids inventing colours for unknown variants", () => {
    for (const [label, variation, effect] of [["Foil Unique", 0, "foil"], ["Foil Unique (Verdant)", 2, "supporter-foil"],
      ["Foil Unique (Celestial Amethyst)", 12, "celestial-foil"]] as const) {
      const item = parse(circle + "\n--------\n" + label);
      expect(item.foilVariation).toBe(variation);
      expect(inventoryEffects(clipboardInventory(item))).toContain(effect);
    }
    expect(parse(circle + "\n--------\nFoil Unique (Unknown)").foilVariation).toBeUndefined();
    expect(inventoryEffects(listingInventory({ icon: "", frameTypeId: "SupporterFoil" }))).toEqual([]);
    expect(inventoryEffects(listingInventory({ icon: "", frameType: 10, foilVariation: 14 }))).toEqual([]);
  });

  it("distinguishes instance effects from the catalogue copy used to supply an image", () => {
    for (const name of ["Midnight Bargain", "Relic of the Pact", "Mageblood", "The Blue Nightmare"]) {
      expect(inventoryEffects(catalogueInventory(catalogue(name)))).toEqual([]);
    }
    const replica = catalogue("Replica Dreamfeather");
    expect(inventoryEffects(catalogueInventory(replica))).toEqual(["replica"]);
    const sword = { icon: replica.icon, memoryItem: true, foreseeing: true };
    expect(inventoryEffects(listingInventory(sword))).toEqual(["foreseeing", "memory"]);
    expect(inventoryEffects(listingInventory({ icon: "", frameType: 9 }))).toEqual(["foil"]);
    expect(inventoryEffects(listingInventory({ icon: "", mutated: true }))).toEqual(["foulborn"]);
  });

  it("reads Hinekora's Lock on equipment and the Vestigial base prefix", () => {
    expect(inventoryEffects(clipboardInventory(parse(ring + "\n--------\nHinekora's Lock")))).toEqual(["foreseeing"]);
    const lock = parse("Item Class: Stackable Currency\nRarity: Currency\nHinekora's Lock\n--------\nStack Size: 1/10");
    expect(inventoryEffects(clipboardInventory(lock))).toEqual([]);
    const gloves = "Item Class: Gloves\nRarity: Rare\nWoe Clutches\nVestigial Goliath Gauntlets\n--------\nItem Level: 85";
    expect(inventoryEffects(clipboardInventory(parse(gloves)))).toEqual(["vestigial"]);
    expect(clipboardInventory(parse(ring + "\n--------\nScourged (Tier 2)")).scourged?.tier).toBe(2);
  });

  it("uses intrinsic client sprite assignments without changing the item's trade filters", () => {
    const orb = ITEM_BY_REF("ITEM", "Orb of Remembrance")![0];
    const gem = ITEM_BY_REF("GEM", "Bladefall of Trarthus")![0];
    expect(inventoryEffects(catalogueInventory(orb))).toEqual(["memory"]);
    expect(inventoryEffects(listingInventory({ icon: orb.icon }))).toEqual(["memory"]);
    expect(inventoryEffects(catalogueInventory(gem))).toEqual(["trarthan"]);
    expect(inventoryEffects(catalogueInventory(ITEM_BY_REF("GEM", "Bladefall")![0]))).toEqual([]);
    const hunter = parse("Item Class: Stackable Currency\nRarity: Currency\nHunter's Exalted Orb\n--------\nStack Size: 1/10");
    expect(hunter.influences).toEqual([]);
    expect(intrinsicInfluences(hunter.info.icon)).toEqual(["Hunter"]);
  });
});
