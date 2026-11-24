<template>
  <div :class="{ 'filter-editor': isStandalone, 'filter-editor--properties-only': isStandalone && !hasStats }">
    <poe1-map-properties v-if="isStandalone && filters.mapRewards" standalone :filters="filters" />
    <label v-if="isStandalone && mapCorruption !== undefined" class="map-corruption">
      <span>Corruption</span>
      <select v-model="mapCorruption" class="ui-select">
        <option value="false">Uncorrupted</option>
        <option value="true">Corrupted</option>
        <option value="any">Any</option>
      </select>
    </label>
    <item-filter-properties v-if="!isStandalone" :filters="filters" :is-poe1="isPoe1">
        <filter-btn-logical
          v-if="hasStats"
          :collapse="statsVisibility.disabled"
          :filter="statsVisibility"
          :active="totalSelectedMods > 0"
          :text="
            totalSelectedMods > 0
              ? t('filters.selected_some', [totalSelectedMods, stats.length])
              : t('filters.selected_none')
          "
        />
    </item-filter-properties>
    <!-- Handled parse error -->
    <div
      v-if="!statsVisibility.disabled && hasStats"
      :class="isStandalone ? 'modifier-list' : ['mb-4', presets.length > 1 ? 'mt-1' : 'mt-4']"
    >
      <div class="flex" v-if="presets.length > 1 && !isStandalone">
        <div class="w-5 border-b border-gray-700" />
        <div
          class="flex divide-x border-gray-700 border-t border-l border-r rounded-t overflow-hidden"
        >
          <button
            v-for="preset in presets"
            :class="[$style.presetBtn, { [$style.active]: preset.active }]"
            @click="selectPreset(preset.id)"
          >
            {{ t(preset.id) }}
          </button>
        </div>
        <div class="flex-1 border-b border-gray-700" />
      </div>
      <header v-if="isStandalone" class="filter-section-head">
        <h3>Modifiers</h3>
        <span v-if="modifierGroups.some(group => group.filters.some(stat => stat.roll && !stat.oils))">Search range</span>
      </header>
      <form @submit.prevent="handleStatsSubmit">
        <template v-for="group in modifierGroups" :key="group.label">
          <h4 v-if="isStandalone" class="modifier-group-title">
            <button type="button" :aria-expanded="!foldedGroups.has(group.label)" @click="toggleGroup(group.label)">
              <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
              <span>{{ group.label }}</span>
              <small>{{ group.selectedCount }} selected</small>
            </button>
            <input
              type="checkbox"
              class="modifier-group-select"
              :aria-label="'Select all in ' + group.label"
              :title="'Select or clear all modifiers in ' + group.label"
              :checked="group.selectedCount === group.allFilters.length"
              :indeterminate.prop="group.selectedCount > 0 && group.selectedCount < group.allFilters.length"
              @change="setGroupSelection(group.allFilters, group.selectedCount !== group.allFilters.length)"
            />
          </h4>
          <div v-show="!isStandalone || !foldedGroups.has(group.label)">
            <filter-modifier
              v-for="filter in group.filters"
              :key="filter.tag + '/' + filter.statRef + '/' + filter.text"
              :filter="filter"
              :item="item"
              :show-sources="isStandalone || showFilterSources"
              :expanded="expandedFilter === filter"
              @edit="expandedFilter = expandedFilter === filter ? null : filter"
              @submit="handleStatsSubmit"
            />
          </div>
        </template>
        <div
          v-if="!filteredStats.length && !showUnknownMods && (!isStandalone || !stats.length)"
          class="border-b border-gray-700 py-2"
        >
          {{ t("filters.empty") }}
        </div>
        <details v-if="showUnknownMods && isStandalone" class="unrecognized-mods">
          <summary>Unrecognized modifiers ({{ item.unknownModifiers.length }})</summary>
          <ul>
            <li v-for="(stat, index) in item.unknownModifiers" :key="index">{{ stat.text }}</li>
          </ul>
          <reload-trade-data :item-text="item.rawText" />
        </details>
        <template v-else-if="showUnknownMods">
          <unknown-modifier
            v-for="stat of item.unknownModifiers"
            :key="stat.type + '/' + stat.text"
            :stat="stat"
            :item-text="item.rawText"
          />
        </template>
        <template v-if="showMissingFracturedWarning">
          <div class="py-2 border-b border-gray-700 flex flex-col">
            <div class="pb-1 flex items-baseline">
              <i
                class="w-5 shrink-0 fas fa-exclamation-triangle text-orange-400"
              ></i>
              <div
                class="search-text mr-1 relative flex min-w-0"
                style="line-height: 1rem"
              >
                {{ t("Unable to determine fractured stat") }}
              </div>
            </div>
            <div class="ml-5 text-xs leading-none">
              <span class="text-gray-600"
                >{{ t("filters.tag_explicit") }} &mdash;
              </span>
              <a
                target="_blank"
                href="https://www.pathofexile.com/forum/view-thread/3891367"
                class="text-orange-400 underline hidden"
                >Bug Report</a
              >
            </div>
          </div>
        </template>
        <input type="submit" class="hidden" />
      </form>
      <div v-if="isStandalone && (extraMods || showHidden || hasConvertibleResistances || originalStats)" class="modifier-list-actions">
        <button v-if="extraMods || showHidden" type="button" :aria-expanded="showHidden" @click="showHidden = !showHidden">
          <i class="fa-solid" :class="showHidden ? 'fa-chevron-up' : 'fa-chevron-down'" aria-hidden="true"></i>
          {{ showHidden ? 'Show fewer modifiers' : 'Show ' + extraMods + (extraMods === 1 ? ' more modifier' : ' more modifiers') }}
        </button>
        <button v-if="hasConvertibleResistances || originalStats" type="button" @click="toggleResistancesConversion">
          {{ originalStats ? 'Use exact resistances' : 'Combine resistances' }}
        </button>
      </div>
      <div v-else-if="!isStandalone"
        class="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-[var(--line)] select-none">
        <button
          type="button"
          v-if="!isStandalone"
          @click="statsVisibility.disabled = !statsVisibility.disabled"
          class="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#171924]/60 hover:bg-[#202336] border border-[#272a3b]/40 hover:border-violet-500/40 rounded-xl text-[10px] font-semibold text-gray-400 hover:text-white transition-all shadow-sm cursor-pointer shrink-0"
        >
          <i class="fas text-[9px] text-violet-400" :class="statsVisibility.disabled ? 'fa-chevron-down' : 'fa-chevron-up'"></i>
          <span>{{ t("filters.collapse") }}</span>
        </button>

        <button
          v-if="stats.some((stat) => stat.hidden)"
          type="button"
          @click="showHidden = !showHidden"
          class="flex items-center gap-1.5 px-3 py-1.5 border rounded-xl text-[10px] font-semibold transition-all shadow-sm cursor-pointer shrink-0"
          :class="showHidden 
            ? 'bg-violet-500/10 text-violet-400 border-violet-500/30 hover:bg-violet-500/20' 
            : 'bg-[#171924]/60 text-gray-400 border-[#272a3b]/40 hover:bg-[#202336] hover:text-white'"
        >
          <i class="fas text-[9px]" :class="[showHidden ? 'fa-eye text-violet-400' : 'fa-eye-slash text-gray-500']"></i>
          <span>{{ t(hiddenLabel) }}</span>
        </button>

        <button
          v-if="hasConvertibleResistances || originalStats"
          type="button"
          @click="toggleResistancesConversion"
          class="flex items-center gap-1.5 px-3 py-1.5 bg-[#171924]/60 hover:bg-[#202336] border border-[#272a3b]/40 hover:border-violet-500/40 rounded-xl text-[10px] font-semibold text-gray-400 hover:text-white transition-all shadow-sm cursor-pointer shrink-0"
        >
          <i class="fas fa-exchange-alt text-[9px] text-violet-400"></i>
          <span>{{ originalStats ? 'Use exact resistances' : 'Convert Resistances' }}</span>
        </button>

        <button
                    type="button"
          @click="showFilterSources = !showFilterSources"
          class="ml-auto flex items-center gap-1.5 px-3 py-1.5 border rounded-xl text-[10px] font-semibold transition-all shadow-sm cursor-pointer shrink-0"
          :class="showFilterSources 
            ? 'bg-violet-500/10 text-violet-400 border-violet-500/30 hover:bg-violet-500/20' 
            : 'bg-[#171924]/60 text-gray-400 border-[#272a3b]/40 hover:bg-[#202336] hover:text-white'"
        >
          <i class="fas fa-info-circle text-[9px]" :class="showFilterSources ? 'text-violet-400' : 'text-gray-500'"></i>
          <span>{{ t("filters.mods_toggle") }}</span>
        </button>
      </div>
    </div>
    <details v-if="isStandalone" :key="item.rawText" class="item-properties" :open="!hasStats">
      <summary>Item properties <i class="fa-solid fa-chevron-down" aria-hidden="true"></i></summary>
      <div class="item-properties-content">
        <slot name="search-criteria" />
        <item-filter-properties standalone :filters="filters" :is-poe1="isPoe1" />
      </div>
    </details>
  </div>
</template>

<script lang="ts">
import {
  defineComponent,
  watch,
  shallowRef,
  ref,
  shallowReactive,
  computed,
  PropType,
} from "vue";
import { useI18n } from "vue-i18n";
import { AppConfig } from "@/web/Config";
import FilterModifier from "./FilterModifier.vue";
import ItemFilterProperties from "./ItemFilterProperties.vue";
import Poe1MapProperties from "./Poe1MapProperties.vue";
import FilterBtnLogical from "./FilterBtnLogical.vue";
import UnknownModifier from "./UnknownModifier.vue";
import ReloadTradeData from "../fallback/ReloadTradeData.vue";
import { ItemFilters, StatFilter, FilterTag } from "./interfaces";
import { groupModifierFilters } from "./modifier-groups";
import { ParsedItem, ItemRarity, ItemCategory } from "@/parser";
import { STAT_BY_REF } from "@/assets/data";
import { ModifierType } from "@/parser/modifiers";
import { PriceCheckWidget } from "@/web/overlay/widgets";

const initiallyFoldedGroups = ["Pseudo stats", "Base", "Implicit"];

export default defineComponent({
  name: "FiltersBlock",
  emits: ["submit", "preset"],
  components: {
    FilterModifier,
    ItemFilterProperties,
    Poe1MapProperties,
    FilterBtnLogical,
    UnknownModifier,
    ReloadTradeData,
  },
  props: {
    presets: {
      type: Array as PropType<Array<{ id: string; active: boolean }>>,
      required: true,
    },
    filters: {
      type: Object as PropType<ItemFilters>,
      required: true,
    },
    stats: {
      type: Array as PropType<StatFilter[]>,
      required: true,
    },
    item: {
      type: Object as PropType<ParsedItem>,
      required: true,
    },
  },
  setup(props, ctx) {
    const statsVisibility = shallowReactive({ disabled: false });
    const showHidden = shallowRef(false);
    const expandedFilter = shallowRef<StatFilter | null>(null);
    const foldedGroups = ref(new Set<string>());
    function toggleGroup(label: string) {
      if (foldedGroups.value.has(label)) foldedGroups.value.delete(label);
      else foldedGroups.value.add(label);
    }
    function setGroupSelection(filters: readonly StatFilter[], selected: boolean) {
      for (const filter of filters) filter.disabled = !selected;
    }
    const showFilterSources = shallowRef(false);
    const isStandalone = computed(() => {
      const params = new URLSearchParams(window.location.search);
      return params.get("mode") === "standalone";
    });
    const mapCorruption = computed({
      get() {
        const filter = props.filters.corrupted;
        if (props.item.category !== ItemCategory.Map || !filter) return;
        return filter.disabled ? "any" : String(filter.value);
      },
      set(value) {
        const filter = props.filters.corrupted;
        if (!filter) return;
        filter.disabled = value === "any";
        if (!filter.disabled) filter.value = value === "true";
      },
    });

    const originalStats = shallowRef<StatFilter[] | null>(null);
    const filteredStats = computed(() => {
      if (isStandalone.value) {
        return showHidden.value ? props.stats : props.stats.filter(stat => !stat.hidden || !stat.disabled);
      }
      return props.stats.filter(stat => Boolean(stat.hidden) === showHidden.value);
    });
    const modifierGroups = computed(() => {
      if (!isStandalone.value) {
        return [{ label: "", filters: filteredStats.value, allFilters: filteredStats.value, selectedCount: 0 }];
      }
      const visible = new Set(filteredStats.value);
      return groupModifierFilters(props.stats, props.item.rarity).map(({ label, filters }) => ({
        label,
        // Groups made up entirely of optional filters are revealed by expanding the group.
        filters: filters.every(filter => filter.hidden) ? filters : filters.filter(filter => visible.has(filter)),
        allFilters: filters,
        selectedCount: filters.filter(filter => !filter.disabled).length,
      }));
    });
    const extraMods = computed(() => modifierGroups.value.reduce(
      (count, group) => count + group.allFilters.length - group.filters.length, 0,
    ));

    watch(
      () => props.stats,
      () => {
        expandedFilter.value = null;
        originalStats.value = null;
      }
    );

    watch(
      () => props.item,
      () => {
        foldedGroups.value = new Set(props.item.category === ItemCategory.Map && AppConfig()?.game === "poe1"
          ? [...initiallyFoldedGroups, "Prefix", "Suffix", "Explicit modifiers"]
          : initiallyFoldedGroups);
        showHidden.value = false;
        statsVisibility.disabled = false;
        originalStats.value = null;
      },
      { immediate: true },
    );

    const showUnknownMods = computed(
      () =>
        props.item.unknownModifiers.length &&
        props.item.category !== ItemCategory.Sentinel &&
        !(
          props.item.category === ItemCategory.Map &&
          props.item.rarity === ItemRarity.Unique
        ),
    );
    // For handling filling augments
    // watch(
    //   () => props.filters.itemEditorSelection?.value,
    //   (selected, prev) => {
    //     const normalCase = selected !== prev && props.filters.tempAugmentStorage;
    //     if (normalCase && selected !== undefined) {
    //       // If last wasn't empty
    //       if (
    //         prev !== "None" &&
    //         props.filters.tempAugmentStorage &&
    //         props.filters.tempAugmentStorage.length > 0
    //       ) {
    //         // Remove current augment
    //         handleRemoveItemEdits(
    //           props.stats,
    //           props.item,
    //           props.filters.tempAugmentStorage!,
    //         );
    //       }
    //       // If we didn't choose empty
    //       if (selected !== "None") {
    //         // add new augment
    //         handleApplyItemEdits(
    //           props.stats,
    //           props.item,
    //           props.filters.tempAugmentStorage!,
    //           selected,
    //         );
    //       }
    //     }
    //   },
    // );

    const { t } = useI18n();

    const RESISTANCES_MAP: Record<string, { eleMultiplier?: number; chaosMultiplier?: number }> = {
      "#% to Fire Resistance": { eleMultiplier: 1 },
      "#% to Cold Resistance": { eleMultiplier: 1 },
      "#% to Lightning Resistance": { eleMultiplier: 1 },
      "#% to Chaos Resistance": { chaosMultiplier: 1 },
      "#% to all Elemental Resistances": { eleMultiplier: 3 },
      "#% to All Resistances": { eleMultiplier: 3, chaosMultiplier: 1 },
      "#% to Fire and Lightning Resistances": { eleMultiplier: 2 },
      "#% to Fire and Cold Resistances": { eleMultiplier: 2 },
      "#% to Cold and Lightning Resistances": { eleMultiplier: 2 },
      "#% to Fire and Chaos Resistances": { eleMultiplier: 1, chaosMultiplier: 1 },
      "#% to Cold and Chaos Resistances": { eleMultiplier: 1, chaosMultiplier: 1 },
      "#% to Lightning and Chaos Resistances": { eleMultiplier: 1, chaosMultiplier: 1 },
      "#% total Elemental Resistance": { eleMultiplier: 1 },
      "#% total to Chaos Resistance": { chaosMultiplier: 1 }
    };

    const hasConvertibleResistances = computed(() => {
      return props.stats.some(
        (stat) =>
          stat.statRef in RESISTANCES_MAP &&
          stat.statRef !== "#% total Elemental Resistance" &&
          stat.statRef !== "#% total to Chaos Resistance" &&
          stat.tag !== FilterTag.Augment &&
          stat.tag !== FilterTag.AddedAugment
      );
    });

    const convertResistances = () => {
      let totalEleVal = 0;
      let totalChaosVal = 0;
      const range = AppConfig<PriceCheckWidget>("price-check")?.searchStatRange ?? 10;

      const nextStats: StatFilter[] = [];
      const sourcesForEle: StatFilter["sources"] = [];
      const sourcesForChaos: StatFilter["sources"] = [];
      const processedModifiers = new Set<unknown>();

      for (const stat of props.stats) {
        if (stat.tag === FilterTag.Augment || stat.tag === FilterTag.AddedAugment) {
          nextStats.push(stat);
          continue;
        }

        const mapping = RESISTANCES_MAP[stat.statRef];
        if (mapping) {
          const hasAlreadyProcessedSource = stat.sources && stat.sources.some(source => processedModifiers.has(source.modifier));
          if (hasAlreadyProcessedSource) {
            continue;
          }

          if (stat.sources) {
            for (const source of stat.sources) {
              processedModifiers.add(source.modifier);
            }
          }

          const val = stat.roll ? stat.roll.value : 0;
          if (mapping.eleMultiplier) {
            totalEleVal += val * mapping.eleMultiplier;
            if (stat.sources) {
              sourcesForEle.push(...stat.sources);
            }
          }
          if (mapping.chaosMultiplier) {
            totalChaosVal += val * mapping.chaosMultiplier;
            if (stat.sources) {
              sourcesForChaos.push(...stat.sources);
            }
          }
        } else {
          nextStats.push(stat);
        }
      }

      if (totalEleVal !== 0) {
        const eleMin = Math.max(0, Math.floor(totalEleVal * (1 - range / 100)));
        const eleMax = Math.max(0, Math.ceil(totalEleVal * (1 + range / 100)));

        const totalEleStat = STAT_BY_REF("#% total Elemental Resistance");
        const eleText = totalEleStat
          ? totalEleStat.matchers[0].string
          : "#% total Elemental Resistance";

        const eleFilter: StatFilter = {
          tradeId: ["pseudo.custom_weighted_elemental_resistance"],
          statRef: "#% total Elemental Resistance",
          text: eleText.trim() + " (Weighted)",
          tag: FilterTag.Pseudo,
          sources: sourcesForEle,
          roll: {
            value: totalEleVal,
            min: eleMin,
            max: undefined,
            default: {
              min: eleMin,
              max: eleMax
            },
            dp: false,
            isNegated: false
          },
          disabled: false
        };
        nextStats.push(eleFilter);
      }

      if (totalChaosVal !== 0) {
        const chaosMin = Math.max(0, Math.floor(totalChaosVal * (1 - range / 100)));
        const chaosMax = Math.max(0, Math.ceil(totalChaosVal * (1 + range / 100)));

        const totalChaosStat = STAT_BY_REF("#% total to Chaos Resistance");
        const chaosText = totalChaosStat
          ? totalChaosStat.matchers[0].string
          : "#% total to Chaos Resistance";

        const chaosFilter: StatFilter = {
          tradeId: ["pseudo.custom_weighted_chaos_resistance"],
          statRef: "#% total to Chaos Resistance",
          text: chaosText.trim() + " (Weighted)",
          tag: FilterTag.Pseudo,
          sources: sourcesForChaos,
          roll: {
            value: totalChaosVal,
            min: chaosMin,
            max: undefined,
            default: {
              min: chaosMin,
              max: chaosMax
            },
            dp: false,
            isNegated: false
          },
          disabled: false
        };
        nextStats.push(chaosFilter);
      }

      originalStats.value = [...props.stats];
      props.stats.splice(0, props.stats.length, ...nextStats);
    };

    const toggleResistancesConversion = () => {
      if (originalStats.value) {
        props.stats.splice(0, props.stats.length, ...originalStats.value);
        originalStats.value = null;
      } else {
        convertResistances();
      }
    };

    return {
      isPoe1: computed(() => AppConfig().game === "poe1"),
      t,
      isStandalone,
      mapCorruption,
      statsVisibility,
      showHidden,
      expandedFilter,
      foldedGroups,
      toggleGroup,
      setGroupSelection,
      extraMods,
      showFilterSources,
      hasConvertibleResistances,
      convertResistances,
      originalStats,
      toggleResistancesConversion,
      totalSelectedMods: computed(() => {
        return props.stats.filter((stat) => !stat.disabled).length;
      }),
      filteredStats,
      modifierGroups,
      showUnknownMods,
      hasStats: computed(
        () =>
          props.stats.length ||
          (showUnknownMods.value && (isStandalone.value || props.item.rarity === ItemRarity.Unique)) ||
          props.presets.length > 1,
      ),
      handleStatsSubmit() {
        ctx.emit("submit");
      },
      selectPreset(id: string) {
        ctx.emit("preset", id);
      },
      hiddenLabel: computed(() => {
        if (
          props.item.category === ItemCategory.Map ||
          props.item.category === ItemCategory.Waystone
        ) {
          return t("filters.hidden_explicit_toggle");
        } else {
          return t("filters.hidden_toggle");
        }
      }),
      showMissingFracturedWarning: computed(() => {
        return (
          // is fractured
          props.item.isFractured &&
          // on base item preset
          props.presets.some(
            (p) => p.id === "filters.preset_base_item" && p.active,
          ) &&
          // but item itself has no fractured mods
          !props.item.statsByType.some(
            (calc) => calc.type === ModifierType.Fractured,
          )
        );
      }),
    };
  },
});
</script>

<style lang="postcss" module>
.presetBtn {
  @apply border-gray-700 bg-gray-800;
  @apply px-2;
  min-width: 3rem;

  &:hover {
    @apply bg-gray-700;
  }

  &.active {
    background: linear-gradient(
      to bottom,
      theme("colors.gray.900"),
      theme("colors.gray.800")
    );
  }
}
</style>


<style scoped>
.filter-editor { display: grid; gap: 1rem; }
.map-corruption { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; font-size: 0.85rem; }
.modifier-list { min-width: 0; }
.filter-section-head, .item-properties summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  color: var(--ink);
  font-size: 0.88rem;
  font-weight: 600;
}
.filter-section-head { align-items: baseline; margin-bottom: 0.8rem; }
.modifier-group-title { display: flex; align-items: center; gap: 0.45rem; margin: 0.65rem 0 0.15rem; padding-inline-end: 0.35rem; }
.modifier-group-title:first-child { margin-top: 0; }
.modifier-group-title button { display: flex; flex: 1; align-items: center; gap: 0.55rem; min-width: 0; min-height: 2.2rem; padding-inline: 0.35rem; border-radius: 0.4rem; color: var(--ink); font-size: 0.87rem; font-weight: 600; text-align: left; }
.modifier-group-title button:hover { background: var(--surface); }
.modifier-group-select { flex: none; width: 1rem; height: 1rem; accent-color: var(--accent); cursor: pointer; }
.modifier-group-title i { color: var(--quiet); font-size: 0.62rem; }
.modifier-group-title [aria-expanded="false"] i { transform: rotate(-90deg); }
.modifier-group-title small { margin-left: auto; color: var(--quiet); font-size: 0.75rem; font-weight: 400; font-variant-numeric: tabular-nums; }
.filter-section-head h3 { font: 500 clamp(1.55rem, 2.4vw, 2.15rem)/1.25 var(--display); }
.filter-section-head span { color: var(--quiet); font-size: 0.76rem; font-weight: 450; }
.item-properties { min-width: 0; border-top: 1px solid var(--line); }
.item-properties summary {
  min-height: 2.6rem;
  cursor: pointer;
  list-style: none;
}
.item-properties summary i, .modifier-list-actions i { font-size: 0.64rem; color: var(--quiet); }
.item-properties[open] summary i { transform: rotate(180deg); }
.item-properties-content { padding: 0.3rem 0 0.65rem; }
.modifier-list-actions { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.35rem; margin-top: 0.45rem; }
.modifier-list-actions button { display: inline-flex; align-items: center; gap: 0.5rem; min-height: 2.25rem; color: var(--muted); font-size: 0.78rem; }
.modifier-list-actions button:hover { color: var(--ink); }

.unrecognized-mods {
  margin-top: 0.65rem;
  padding-block: 0.5rem;
  color: var(--muted);
  font-size: 0.76rem;
}

.unrecognized-mods summary {
  cursor: pointer;
}

.unrecognized-mods ul {
  margin-block: 0.6rem;
  padding-left: 1rem;
  list-style: disc;
  overflow-wrap: anywhere;
}
</style>
