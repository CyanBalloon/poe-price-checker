<template>
  <img v-if="icon" :src="icon" :alt="alt" class="currency-art" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { currencyIcon } from "./currency-icons";

const props = withDefaults(defineProps<{ currency: string; alt?: string }>(), {
  alt: "",
});
const icon = computed(() => currencyIcon(props.currency));
</script>

<style scoped>
.currency-art {
  flex: none;
  object-fit: contain;
}
</style>
