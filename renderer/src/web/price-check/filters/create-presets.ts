import { createFilters } from "./create-item-filters";
import {
  createExactStatFilters,
  calculatedStatToFilter,
  initUiModFilters,
} from "./create-stat-filters";
import { sumStatsByModType } from "@/parser/modifiers";
import { ItemCategory, ItemRarity, ParsedItem } from "@/parser";
import type { FilterPreset } from "./interfaces";
import { PriceCheckWidget } from "@/web/overlay/widgets";
import { hasCraftingValue, likelyFinishedItem } from "./common";
import { AppConfig } from "@/web/Config";
import { isMapInfluenceId } from "@/parser/poe1-map";
import { groupModifierFilters } from "./modifier-groups";

const ROMAN_NUMERALS = ["I", "II", "III", "IV", "V"];

export function createPresets(
  item: ParsedItem,
  opts: {
    league: string;
    currency: string | undefined;
    listingType:
      | "securable"
      | "any"
      | "online"
      | "available"
      | "onlineleague"
      | undefined;
    collapseListings: "app" | "api";
    activateStockFilter: boolean;
    searchStatRange: number;
    useEn: boolean;
    defaultAllSelected: boolean;
    includeSourceModifiers?: boolean;
    autoFillEmptyAugmentSockets: PriceCheckWidget["autoFillEmptyRuneSockets"];
  },
): { presets: FilterPreset[]; active: string } {
  const result = (() => {
    if (item.category === ItemCategory.Map && AppConfig()?.game === "poe1") {
      const stats = item.statsByType.map(calc => {
        const filter = calculatedStatToFilter(calc, opts.searchStatRange, item);
        filter.disabled = !(opts.defaultAllSelected || filter.tradeId.some(isMapInfluenceId));
        return filter;
      }).filter(filter => filter.tradeId.length);
      const id = "filters.preset_exact";
      return { active: id, presets: [{ id, filters: createFilters(item, { ...opts, exact: false }), stats }] };
    }
    if (item.info.refName === "Expedition Logbook" && item.logbookAreaMods?.length) {
      return {
        active: ROMAN_NUMERALS[0],
        presets: item.logbookAreaMods.map<FilterPreset>((area, idx) => ({
          id: ROMAN_NUMERALS[idx],
          filters: createFilters(item, { ...opts, exact: true }),
          stats: createExactStatFilters(item, sumStatsByModType(area), opts),
        })),
      };
    }

    if (
      (!item.info.craftable && item.rarity !== ItemRarity.Unique) ||
      item.isUnidentified ||
      item.rarity === ItemRarity.Normal ||
      (item.category === ItemCategory.Flask &&
        item.rarity !== ItemRarity.Unique) ||
      (item.category === ItemCategory.Relic &&
        item.rarity !== ItemRarity.Unique) ||
      item.category === ItemCategory.Tincture ||
      item.category === ItemCategory.MemoryLine ||
      item.category === ItemCategory.Invitation ||
      item.category === ItemCategory.HeistContract ||
      item.category === ItemCategory.HeistBlueprint ||
      item.category === ItemCategory.Sentinel ||
      item.category === ItemCategory.Tablet ||
      (item.category === ItemCategory.Currency && item.trials?.numberOfTrials)
    ) {
      return {
        active: "filters.preset_exact",
        presets: [
          {
            id: "filters.preset_exact",
            filters: createFilters(item, { ...opts, exact: true }),
            stats: createExactStatFilters(item, item.statsByType, opts),
          },
        ],
      };
    }

    const pseudoPreset: FilterPreset = {
      id: "filters.preset_pseudo",
      filters: createFilters(item, { ...opts, exact: false }),
      stats: initUiModFilters(item, opts),
    };

    if ((likelyFinishedItem(item) || !hasCraftingValue(item)) && item.rarity !== ItemRarity.Magic) {
      return { active: pseudoPreset.id, presets: [pseudoPreset] };
    }

    const baseItemPreset: FilterPreset = {
      id: "filters.preset_base_item",
      filters: createFilters(item, { ...opts, exact: true }),
      stats: createExactStatFilters(item, item.statsByType, opts),
    };

    return {
      active: item.rarity === ItemRarity.Magic ? baseItemPreset.id : pseudoPreset.id,
      presets: [pseudoPreset, baseItemPreset],
    };
  })();

  if (opts.includeSourceModifiers) {
    for (const [index, preset] of result.presets.entries()) {
      const area = item.logbookAreaMods?.[index];
      const copiedStats = area ? sumStatsByModType(area) : item.statsByType;
      const represented = new Set(preset.stats.flatMap(filter => filter.sources
        .filter(source => source.stat.stat.ref === filter.statRef).map(source => source.stat)));
      const identity = (filter: (typeof preset.stats)[number]) =>
        JSON.stringify([filter.tradeId, filter.option?.value]);
      const existing = new Set(preset.stats.map(identity));
      for (const calc of copiedStats) {
        if (calc.sources.every(source => represented.has(source.stat))) continue;
        const filter = calculatedStatToFilter(calc, opts.searchStatRange, item);
        const key = identity(filter);
        if (!filter.tradeId.length || existing.has(key)) continue;
        // Offer the original roll without changing the active preset's trade request.
        preset.stats.push({ ...filter, disabled: true, allModsOnly: true });
        existing.add(key);
      }
    }
  }

  if (item.category === ItemCategory.Currency && item.info.refName !== "Chronicle of Atzoatl") {
    for (const preset of result.presets) {
      for (const stat of preset.stats) {
        stat.disabled = true;
      }
    }
  } else if (!opts.defaultAllSelected) {
    for (const preset of result.presets) {
      const implicits = groupModifierFilters(preset.stats, item.rarity).find(group => group.label === "Implicit");
      for (const stat of implicits?.filters ?? []) {
        stat.disabled = true;
      }
    }
  }

  return result;
}
