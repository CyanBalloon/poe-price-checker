<template>
  <div class="filter-number-field" :class="{ 'is-active': active }" :title="itemValue == null ? name : 'On item ' + itemValue">
    <span v-if="prefix" aria-hidden="true">{{ prefix }}</span>
    <input ref="input" type="number" :step="step ?? 1" :value="value ?? ''" :aria-label="name" placeholder="Any"
      @focus="select" @input="edit" @blur="restore" @mousewheel.stop />
    <span v-if="unit" aria-hidden="true">{{ unit }}</span>
    <div class="filter-stepper">
      <button type="button" tabindex="-1" :aria-label="'Increase ' + name" :title="'Increase ' + name"
        @mousedown.prevent @click="stepBy(1)"><i class="fas fa-caret-up" aria-hidden="true" /></button>
      <button type="button" tabindex="-1" :aria-label="'Decrease ' + name" :title="'Decrease ' + name"
        @mousedown.prevent @click="stepBy(-1)"><i class="fas fa-caret-down" aria-hidden="true" /></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{ name: string; value?: number | ""; active: boolean; step?: number; prefix?: string; unit?: string; itemValue?: string }>();
const emit = defineEmits<{ (event: "edit", value: number | undefined): void }>();
const input = ref<HTMLInputElement>();
function select(event: FocusEvent) { (event.target as HTMLInputElement).select(); }
function edit() {
  const field = input.value!;
  if (Number.isFinite(field.valueAsNumber)) emit("edit", field.valueAsNumber);
  else if (!field.validity.badInput) emit("edit", undefined);
}
function stepBy(steps: number) {
  const field = input.value!;
  field.focus();
  field.stepUp(steps);
  edit();
}
function restore() { input.value!.value = String(props.value ?? ""); }
</script>
