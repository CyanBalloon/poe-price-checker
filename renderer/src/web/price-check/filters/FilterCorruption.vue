<template>
  <div v-if="filters.corrupted" class="criteria-row">
    <label class="criteria-property">
      <input type="checkbox" :checked="condition !== 'any'" @change="condition = condition === 'any' ? String(item.isCorrupted) : 'any'" />
      <span>Corruption</span>
    </label>
    <select v-model="condition" aria-label="Search for corruption" :title="item.isCorrupted ? 'On item Corrupted' : 'On item Uncorrupted'" class="criteria-target" :class="{ 'is-active': condition !== 'any' }">
      <option value="any">Any</option>
      <option value="true">Corrupted</option>
      <option value="false">Uncorrupted</option>
    </select>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ParsedItem } from "@/parser";
import type { ItemFilters } from "./interfaces";
import { corruptionCondition } from "./filter-sections";

const props = defineProps<{ item: ParsedItem; filters: ItemFilters; isPoe1: boolean }>();
const condition = computed({
  get: () => corruptionCondition(props.filters, props.isPoe1),
  set(value: string) {
    const filter = props.filters.corrupted!;
    filter.disabled = value === "any";
    if (!filter.disabled) {
      filter.value = value === "true";
      filter.exact = true;
      if (props.filters.sanctified) props.filters.sanctified.disabled = true;
    }
  },
});
</script>
