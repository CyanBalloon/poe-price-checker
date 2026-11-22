<template>
  <div :class="standalone ? 'property-field' : [$style.btn, { [$style.active]: !filter.disabled }]">
    <label v-if="standalone" class="property-toggle">
      <input type="checkbox" :checked="!filter.disabled" @change="filter.disabled = !filter.disabled">
      {{ name.trim().replace(/[:：]$/, '') }}
    </label>
    <button v-else type="button" @click="filter.disabled = !filter.disabled" class="pl-2">
      {{ name }}
    </button>
    <input
      :class="standalone ? 'property-value' : $style.input"
      step="any"
      type="number"
      :aria-label="name + ' minimum'"
      v-model.number="inputMin"
      @focus="inputFocus"
      @blur="inputMinBlur"
      @mousewheel.stop
      :style="{ width: `${1.2 + Math.max(String(inputMin).length, 2)}ch` }"
    />
    <template v-if="'max' in filter">
      <span>–</span>
      <input
        :class="standalone ? 'property-value' : $style.input"
        step="any"
        type="number"
        :aria-label="name + ' maximum'"
        v-model.number="inputMax"
        @focus="inputFocus"
        @mousewheel.stop
        :style="{ width: `${1.2 + Math.max(String(inputMax).length, 2)}ch` }"
        placeholder="…"
      />
    </template>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType, computed, ref, watch } from "vue";
import { FilterNumeric } from "./interfaces";

export default defineComponent({
  emits: [], // mutates filter
  props: {
    standalone: Boolean,
    filter: {
      type: Object as PropType<FilterNumeric>,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    const _inputMin = ref<number | "">("");
    watch(
      () => props.filter,
      (filter) => {
        _inputMin.value = filter.value;
      },
      { immediate: true },
    );

    const _inputMax = ref<number | "">("");
    watch(
      () => props.filter,
      (filter) => {
        _inputMax.value = filter.max ?? "";
      },
      { immediate: true },
    );

    return {
      inputMin: computed<number | "">({
        get() {
          return _inputMin.value;
        },
        set(value) {
          _inputMin.value = value;
          if (typeof value === "number") {
            props.filter.disabled = false;
            props.filter.value = value;
          } else {
            props.filter.value = 0;
          }
        },
      }),
      inputMax: computed<number | "">({
        get() {
          return _inputMax.value;
        },
        set(value) {
          _inputMax.value = value;
          if (typeof value === "number") {
            props.filter.disabled = false;
            props.filter.max = value;
          } else {
            props.filter.max = undefined;
          }
        },
      }),
      inputFocus(e: FocusEvent) {
        const target = e.target as HTMLInputElement;
        target.select();
        if (!props.standalone) props.filter.disabled = false;
      },
      inputMinBlur() {
        if (typeof _inputMin.value !== "number") {
          _inputMin.value = 0;
          props.filter.disabled = true;
        }
      },
    };
  },
});
</script>

<style lang="postcss" module>
.btn {
  @apply bg-gray-900 rounded;
  @apply border border-transparent;
  @apply pr-1;
  line-height: 1.25rem;

  &.active {
    @apply border-gray-500;
  }
}

.input {
  @apply text-center;
  @apply bg-transparent;
  @apply text-gray-300;
  @apply select-all;

  &:hover,
  &:focus {
    @apply bg-gray-700;
    @apply -my-px border-t border-b border-gray-500;
  }

  &::placeholder {
    @apply text-gray-400;
  }

  &:focus {
    cursor: none;
  }
}
</style>

<style scoped>
.property-field { display: flex; align-items: center; gap: 0.4rem; min-height: 2.45rem; border-top: 1px solid var(--line); }
.property-toggle { flex: 1; display: flex; align-items: center; gap: 0.6rem; color: var(--muted); font-size: 0.81rem; cursor: pointer; }
.property-toggle input { accent-color: var(--accent); width: 0.95rem; height: 0.95rem; }
.property-value {
  min-width: 3rem;
  max-width: 5rem;
  padding: 0.24rem;
  border: 1px solid var(--line);
  border-radius: 0.3rem;
  background: var(--page);
  color: var(--ink);
  text-align: center;
  font-size: 0.8rem;
}
</style>
