<template>
  <form class="criteria-board" @submit.prevent="$emit('submit')">
    <div class="filter-layout">
      <aside class="filter-rail">
        <div class="filter-rail-heading">
          <h3>Filters</h3>
          <div v-if="presets.length > 1" class="criteria-presets" role="group" aria-label="Filter preset">
            <button v-for="preset in presets" :key="preset.id" type="button" :aria-pressed="preset.active" @click="$emit('preset', preset.id)">
              {{ t(preset.id) }}
            </button>
          </div>
        </div>
        <div ref="tabList" class="filter-sections" role="tablist" aria-label="Filter sections" :aria-orientation="horizontal ? 'horizontal' : 'vertical'" @keydown="navigateTabs">
          <button v-for="section in sections" :key="section.id" :id="tabId(section.id)" type="button" role="tab"
            class="filter-tab" :class="{ 'filter-tab--all': section.id === 'all' }" :data-section="section.id"
            :aria-controls="panelId" :aria-selected="current.id === section.id" :tabindex="current.id === section.id ? 0 : -1"
            @click="chooseSection(section.id)">
            <i v-if="section.id === 'all'" class="fas fa-list-ul" aria-hidden="true" />
            <span>{{ section.label }}</span>
            <span v-if="section.id !== 'all' && (section.id !== 'properties' || section.active.length)" class="section-badge"
              :aria-label="section.active.length + ' selected'">{{ section.active.length }}</span>
          </button>
        </div>
      </aside>

      <section :id="panelId" ref="panel" class="filter-pane" role="tabpanel" :aria-labelledby="tabId(current.id)" tabindex="-1">
        <header class="filter-pane-heading">
          <h3>{{ current.id === 'all' ? 'All mods' : current.label }}</h3>
          <label v-if="selectable.length" class="section-select">
            <input type="checkbox" :aria-label="'Select all in ' + current.label" :checked="sectionChecked === selectable.length"
              :indeterminate.prop="sectionChecked > 0 && sectionChecked < selectable.length"
              @change="setSectionSelection(sectionChecked !== selectable.length)" />
            <span>Select all</span>
          </label>
          <span v-else-if="current.id === 'all'" class="section-total">{{ current.active.length }} selected</span>
        </header>
        <div ref="paneBody" class="filter-pane-body">
          <div v-if="current.id === 'drops'" class="filter-column-hint">Minimum</div>
          <div class="filter-rows" :class="{ 'criteria-flat': current.id === 'all' }">
            <div v-for="row in current.rows" :key="row.key" :data-filter-row="row.key">
              <filter-btn-numeric v-if="row.kind === 'numeric'" :name="row.name" :filter="row.filter" :item-value="row.itemValue"
                :operator="row.operator" :unit="row.unit" :minimum-column="current.id === 'drops'" />
              <filter-modifier v-else-if="row.kind === 'modifier'" :filter="row.filter" :item="item" :display="row.display"
                :expanded="expandedFilter === row.filter" :inline-minimum="current.id === 'drops'" @edit="toggleEditor(row.filter)" />
              <filter-btn-logical v-else-if="row.kind === 'choice'" :text="row.text" :filter="row.filter" :img="row.img"
                :item-value="row.itemValue" :search="row.search" :inactive="row.inactive" :unavailable="row.unavailable" />
              <filter-corruption v-else-if="row.kind === 'corruption'" :filters="filters" :item="item" :is-poe1="isPoe1" />
              <filter-name v-else-if="row.kind === 'scope'" :filters="filters" :item="item" />
              <filter-btn-logical v-else :text="row.text" unavailable />
            </div>
          </div>
          <button v-if="showResistanceAction" type="button" class="criteria-link" @click="toggleResistancesConversion">
            {{ originalStats ? 'Use exact resistances' : 'Combine resistances' }}
          </button>
          <reload-trade-data v-if="(current.id === 'unavailable' || current.id === 'all') && item.unknownModifiers.length" :item-text="item.rawText" />
          <p v-if="showMissingFracturedWarning && (current.id === 'properties' || current.id === 'all')" class="criteria-notice">{{ t("Unable to determine fractured stat") }}</p>
          <div v-if="current.id !== 'all' && otherActive.length" class="other-active">
            <h4>Other active filters</h4>
            <button v-for="entry in visibleSummary" :key="entry.section + '/' + entry.key" type="button" class="active-filter-link"
              :title="'Edit in ' + entry.sectionLabel" @click="jumpToFilter(entry.section, entry.key)">
              <i class="fas fa-check" aria-hidden="true" /><span>{{ entry.text }}</span>
            </button>
            <button v-if="otherActive.length > summaryLimit" type="button" class="criteria-link" :aria-expanded="showFullSummary"
              @click="showFullSummary = !showFullSummary">{{ showFullSummary ? 'Show fewer' : 'Show ' + (otherActive.length - summaryLimit) + ' more' }}</button>
          </div>
        </div>
      </section>
    </div>
    <button class="sr-only" tabindex="-1" type="submit">{{ t("Search") }}</button>
  </form>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, ref, shallowRef, watch } from "vue";
import { useResizeObserver } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import { AppConfig } from "@/web/Config";
import { type ParsedItem } from "@/parser";
import { ModifierType } from "@/parser/modifiers";
import { STAT_BY_REF } from "@/assets/data";
import type { PriceCheckWidget } from "@/web/overlay/widgets";
import { FilterTag, type ItemFilters, type StatFilter } from "./interfaces";
import { activeLabel, buildFilterSections, initialSection } from "./filter-sections";
import FilterName from "./FilterName.vue";
import FilterModifier from "./FilterModifier.vue";
import FilterBtnNumeric from "./FilterBtnNumeric.vue";
import FilterBtnLogical from "./FilterBtnLogical.vue";
import FilterCorruption from "./FilterCorruption.vue";
import ReloadTradeData from "../fallback/ReloadTradeData.vue";

const props = defineProps<{ presets: Array<{ id: string; active: boolean }>; filters: ItemFilters; stats: StatFilter[]; item: ParsedItem }>();
defineEmits<{ (event: "submit"): void; (event: "preset", id: string): void }>();
const { t } = useI18n();
const isPoe1 = computed(() => AppConfig().game === "poe1");
const panelId = "item-filters-" + getCurrentInstance()!.uid;
const tabId = (section: string) => panelId + "-" + section;
const tabList = ref<HTMLElement>();
const panel = ref<HTMLElement>();
const paneBody = ref<HTMLElement>();
const horizontal = ref(false);
useResizeObserver(tabList, () => {
  if (tabList.value) horizontal.value = getComputedStyle(tabList.value).flexDirection === "row";
});

const sections = computed(() => buildFilterSections(props.item, props.filters, props.stats, isPoe1.value, (key, values) =>
  values ? t(key, values) : t(key)).map(section => ({
    ...section,
    active: section.rows.flatMap(row => {
      const text = activeLabel(row);
      return text ? [{ key: row.key, text, section: section.id, sectionLabel: section.label }] : [];
    }),
  })));
const sectionId = ref("");
const current = computed(() => sections.value.find(section => section.id === sectionId.value) ?? sections.value[0]);
watch([() => props.item, sections], ([item, choices], previous) => {
  if (item !== previous?.[0] || !choices.some(section => section.id === sectionId.value)) {
    sectionId.value = initialSection(choices);
  }
}, { immediate: true });

const expandedFilter = shallowRef<StatFilter | null>(null);
const originalStats = shallowRef<StatFilter[] | null>(null);
const showFullSummary = ref(false);
const summaryLimit = 4;
watch(() => props.stats, () => {
  expandedFilter.value = null;
  originalStats.value = null;
});
watch([sectionId, () => props.item], () => {
  expandedFilter.value = null;
  showFullSummary.value = false;
  if (paneBody.value) paneBody.value.scrollTop = 0;
});
watch(() => current.value.rows.map(row => row.key).join("/"), async () => {
  const focused = document.activeElement;
  if (current.value.id !== "all" || !(focused instanceof HTMLElement) || !paneBody.value?.contains(focused)) return;
  await nextTick();
  if (focused.isConnected && document.activeElement === document.body) focused.focus({ preventScroll: true });
});

const otherActive = computed(() => sections.value.filter(section => section.id !== current.value.id && section.id !== "all").flatMap(section => section.active));
const visibleSummary = computed(() => showFullSummary.value ? otherActive.value : otherActive.value.slice(0, summaryLimit));
const selectable = computed(() => {
  if (!current.value.id.startsWith("group-") && !["influence", "rooms", "drops"].includes(current.value.id)) return [];
  return current.value.rows.flatMap<{ disabled: boolean }>(row => {
    if (row.kind === "modifier" && row.filter.tradeId.length) return [row.filter];
    if (row.kind === "numeric") return [row.filter];
    if (row.kind === "choice" && row.filter) return [row.filter];
    return [];
  });
});
const sectionChecked = computed(() => selectable.value.filter(filter => !filter.disabled).length);
function setSectionSelection(selected: boolean) {
  for (const filter of selectable.value) filter.disabled = !selected;
}
function toggleEditor(filter: StatFilter) {
  expandedFilter.value = expandedFilter.value === filter ? null : filter;
}
function chooseSection(id: string) {
  sectionId.value = id;
}
function navigateTabs(event: KeyboardEvent) {
  const tabs = sections.value;
  const index = tabs.findIndex(section => section.id === current.value.id);
  const next = horizontal.value ? "ArrowRight" : "ArrowDown";
  const back = horizontal.value ? "ArrowLeft" : "ArrowUp";
  let target: number;
  if (event.key === next) target = (index + 1) % tabs.length;
  else if (event.key === back) target = (index + tabs.length - 1) % tabs.length;
  else if (event.key === "Home") target = 0;
  else if (event.key === "End") target = tabs.length - 1;
  else return;
  event.preventDefault();
  chooseSection(tabs[target].id);
  document.getElementById(tabId(tabs[target].id))?.focus();
}
async function jumpToFilter(section: string, key: string) {
  chooseSection(section);
  await nextTick();
  const row = paneBody.value?.querySelector<HTMLElement>('[data-filter-row="' + CSS.escape(key) + '"]');
  (row?.querySelector<HTMLElement>("input:enabled, select:enabled, button:enabled") ?? panel.value)?.focus();
}

const showMissingFracturedWarning = computed(() => props.item.isFractured &&
  props.presets.some(preset => preset.id === "filters.preset_base_item" && preset.active) &&
  !props.item.statsByType.some(calc => calc.type === ModifierType.Fractured));
const showResistanceAction = computed(() => (hasConvertibleResistances.value || originalStats.value) &&
  (current.value.id === "all" || current.value.rows.some(row => row.kind === "modifier" && row.filter.statRef in RESISTANCES_MAP)));

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
  nextStats.push(...props.stats.filter(stat => stat.statRef in RESISTANCES_MAP && !nextStats.includes(stat) &&
    stat.tag !== FilterTag.Pseudo && stat.tag !== FilterTag.Property).map(stat => ({ ...stat, disabled: true, allModsOnly: true })));
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

</script>

<style src="./filter-sections.css"></style>
