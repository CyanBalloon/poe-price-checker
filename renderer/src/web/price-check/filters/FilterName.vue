<template>
  <div>
    <div class="criteria-row">
      <span class="criteria-property">Match</span>
      <button v-if="filters.searchRelaxed" type="button" class="criteria-target is-active"
        aria-label="Switch between matching the item and its category" :title="item.baseType || item.info.name" @click="toggleAccuracy">
        <span>{{ label }}</span><i class="fas fa-arrows-rotate" aria-hidden="true" />
      </button>
      <span v-else class="criteria-value is-active">{{ label }}</span>
    </div>
    <div class="criteria-row">
      <span class="criteria-property">Rarity</span>
      <select v-model="currentRarity" aria-label="Search for rarity" :title="item.rarity" class="criteria-target" :class="{ 'is-active': currentRarity !== 'any' }">
        <option value="any">Any</option>
        <option value="normal">Normal</option>
        <option value="magic">Magic</option>
        <option value="rare">Rare</option>
        <option value="unique">Unique</option>
        <option value="nonunique">Non-Unique</option>
      </select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { ParsedItem } from "@/parser";
import { getCategoryToTradeId } from "../trade/trade-constants";
import type { ItemFilters } from "./interfaces";

const props = defineProps<{ filters: ItemFilters; item: ParsedItem }>();
const { t } = useI18n();
const currentRarity = computed({
  get: () => props.filters.rarity?.value ?? "any",
  set(value: string) { props.filters.rarity = { value }; },
});
const label = computed(() => {
  const { searchExact, searchRelaxed } = props.filters;
  const search = searchRelaxed && !searchRelaxed.disabled ? searchRelaxed : searchExact;
  if (search.name || search.baseType) return search.name || search.baseType;
  const tradeId = search.category && getCategoryToTradeId().get(search.category);
  return tradeId ? t("item_category.prop", [t("item_category." + tradeId.replace(".", "_"))]) : search.term ?? "Any";
});

function toggleAccuracy() {
  const relaxed = props.filters.searchRelaxed;
  if (relaxed) relaxed.disabled = !relaxed.disabled;
}
</script>
