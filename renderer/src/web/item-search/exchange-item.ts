import { itemCatalogue, type BaseType } from "@/assets/data";
import { ItemCategory, ItemRarity, type ParsedItem } from "@/parser";
import { usePoeninja } from "@/web/background/Prices";
import { AppConfig } from "@/web/Config";

/** Exchange eligibility comes from game item data, even when a league has no quote. */
export function exchangeItem(item: ParsedItem): BaseType | undefined {
  if (item.category === ItemCategory.Map && AppConfig()?.game === "poe1") return;
  if (item.rarity === ItemRarity.Unique && item.isUnidentified) return;
  const { entries } = itemCatalogue.value;
  let name = item.info.refName;
  if (item.category === ItemCategory.UncutGem && item.gemLevel && !name.includes(" (Level ")) {
    name += " (Level " + item.gemLevel + ")";
  }
  if (!usePoeninja().isExchangeListed({ ns: item.info.namespace, name })) return;
  return entries.get(item.info.namespace + ":" + name) ?? item.info;
}
