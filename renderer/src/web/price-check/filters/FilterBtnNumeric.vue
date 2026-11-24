<template>
  <div class="criteria-row numeric-criterion">
    <label class="criteria-property">
      <input type="checkbox" :checked="!filter.disabled" @change="filter.disabled = !filter.disabled" />
      <span>{{ name }}</span>
    </label>
    <div class="filter-number-fields">
      <filter-number-field :value="filter.value" :name="name + ' ' + operatorLabel" :unit="unit" :item-value="copied"
        :prefix="minimumColumn ? undefined : operatorSymbol" :active="!filter.disabled" @edit="setValue" />
      <filter-number-field v-if="'max' in filter" :value="filter.max" :name="name + ' maximum'" :unit="unit"
        prefix="≤" :active="!filter.disabled && filter.max != null" @edit="setMaximum" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { FilterNumeric } from "./interfaces";
import FilterNumberField from "./FilterNumberField.vue";
const props = defineProps<{ name: string; filter: FilterNumeric; operator: "min" | "max" | "exact"; unit: string; itemValue?: number; minimumColumn?: boolean }>();
const operatorLabel = computed(() => ({ min: "minimum", max: "maximum", exact: "exact value" })[props.operator]);
const operatorSymbol = computed(() => ({ min: "≥", max: "≤", exact: "=" })[props.operator]);
const copied = computed(() => props.itemValue == null ? undefined : props.itemValue + props.unit);
function setValue(value?: number) {
  props.filter.disabled = value == null;
  if (value != null) props.filter.value = value;
}
function setMaximum(value?: number) {
  props.filter.max = value;
  if (value != null) props.filter.disabled = false;
}
</script>
