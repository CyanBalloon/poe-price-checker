<template>
  <div class="criteria-row">
    <label class="criteria-property">
      <input v-if="filter" type="checkbox" :checked="!filter.disabled" @change="filter.disabled = !filter.disabled" />
      <i v-else-if="!unavailable" class="fas fa-check filter-fixed" aria-hidden="true" />
      <img v-if="img" :src="img" alt="" @error="($event.target as HTMLImageElement).hidden = true" />
      <span>{{ text }}<small v-if="filter && itemValue && search !== 'Exact match'">On item {{ itemValue }}</small></span>
    </label>
    <span class="criteria-value">{{ value }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
const props = withDefaults(defineProps<{
  text: string; filter?: { disabled: boolean }; img?: string; itemValue?: string;
  search?: string; inactive?: string; unavailable?: boolean;
}>(), { search: "Exact match", inactive: "Any" });
const value = computed(() => {
  if (props.filter?.disabled) return props.inactive;
  if (props.unavailable) return props.itemValue ?? "Unavailable";
  return props.search === "Exact match" && props.itemValue ? props.itemValue : props.search;
});
</script>
