<template>
  <label v-if="standalone" class="property-choice">
    <input v-if="!readonly" type="checkbox" :checked="!filter.disabled" @change="toggle" />
    <img v-if="img" :src="img" alt="" />
    {{ t(text) }}
  </label>
  <button
    v-else type="button"
    :class="[
      $style.btn,
      { [$style.active]: active != null ? active : !filter.disabled },
    ]"
    @click="toggle"
  >
    <img v-if="img" :src="img" class="w-5 h-5" />
    <span class="pl-1">{{ t(text) }}</span>
    <i
      v-if="collapse"
      class="pl-2 text-xs text-gray-400"
      :class="filter.disabled ? 'fas fa-chevron-down' : 'fas fa-chevron-up'"
    />
  </button>
</template>

<script setup lang="ts">
import { type PropType } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps({
  standalone: Boolean,
  filter: {
    type: Object as PropType<{ disabled: boolean }>, // will be mutated directly, instead of emit
    required: true,
  },
  text: { type: String, required: true },
  img: { type: String, default: undefined },
  readonly: { type: Boolean, default: undefined },
  active: { type: Boolean, default: undefined },
  collapse: { type: Boolean, default: undefined },
});

const { t } = useI18n();

function toggle() {
  const { filter, readonly } = props;
  if (!readonly) {
    filter.disabled = !filter.disabled;
  }
}
</script>

<style lang="postcss" module>
.btn {
  @apply bg-gray-900 rounded;
  @apply border border-transparent;
  @apply pl-1 pr-2;
  line-height: 1.25rem;
  display: flex;
  align-items: center;

  &.active {
    @apply border-gray-500;
  }
}
</style>

<style scoped>
.property-choice { display: flex; align-items: center; gap: 0.6rem; min-height: 2.45rem; border-top: 1px solid var(--line); font-size: 0.81rem; color: var(--muted); }
.property-choice input { accent-color: var(--accent); width: 0.95rem; height: 0.95rem; }
.property-choice img { width: 1.2rem; height: 1.2rem; }
</style>
