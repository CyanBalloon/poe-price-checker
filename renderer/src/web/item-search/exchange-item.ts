import { itemCatalogue, type BaseType } from "@/assets/data";
import { ItemCategory, ItemRarity, type ParsedItem } from "@/parser";
import { usePoeninja } from "@/web/background/Prices";

/** Exchange eligibility comes from game item data, even when a league has no quote. */
export function exchangeItem(item: ParsedItem): BaseType | undefined {
  if (item.rarity === ItemRarity.Unique && item.isUnidentified) return;
  const { entries, exchange } = itemCatalogue.value;
  let name = item.info.refName;
  if (item.category === ItemCategory.UncutGem && item.gemLevel && !name.includes(" (Level ")) {
    name += " (Level " + item.gemLevel + ")";
  }
  if (!exchange.has(name) && !usePoeninja().findPriceByQuery({ ns: item.info.namespace, name })?.cx) return;
  return entries.get(item.info.namespace + ":" + name) ?? item.info;
}
