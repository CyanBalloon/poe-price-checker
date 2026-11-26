<template>
  <span ref="element" class="influenced-item-art">
    <span v-for="influence in layers" :key="influence" :data-influence="influence"
      class="influence-highlight" :class="{ 'is-moving': animate }"
      :style="{ color: colours[influence] }" aria-hidden="true" />
    <img :src="src" alt="" class="item-art" v-bind="$attrs" @error="$emit('error', $event)" />
  </span>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useDocumentVisibility, useElementVisibility, useMediaQuery } from "@vueuse/core";
import { ItemInfluence } from "@/parser/ParsedItem";
import { influenceArtOrder } from "./influence-art";

const props = defineProps<{ src: string; influences: readonly ItemInfluence[] }>();
defineEmits(["error"]);

const colours: Record<ItemInfluence, string> = {
  [ItemInfluence.Shaper]: "#7c73dd",
  [ItemInfluence.Elder]: "#d3a0bb",
  [ItemInfluence.Crusader]: "#6392f5",
  [ItemInfluence.Redeemer]: "#a5e9f0",
  [ItemInfluence.Hunter]: "#a1ce65",
  [ItemInfluence.Warlord]: "#ecb054",
  [ItemInfluence.SearingExarch]: "#f46352",
  [ItemInfluence.EaterOfWorlds]: "#48c0ba",
};

const element = ref<HTMLElement>();
const onScreen = useElementVisibility(element);
const visibility = useDocumentVisibility();
const motion = useMediaQuery("(prefers-reduced-motion: no-preference)");
const animate = computed(() => onScreen.value && visibility.value === "visible" && motion.value);
const layers = computed(() => influenceArtOrder.filter(influence => props.influences.includes(influence)));
</script>

<script lang="ts">
export default { inheritAttrs: false };
</script>

<style scoped>
.influenced-item-art { position: relative; display: inline-grid; isolation: isolate; vertical-align: middle; }
.item-art { position: relative; }
.influence-highlight {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(ellipse closest-side, currentColor 0%, transparent 100%);
  opacity: .3;
  animation: highlight-breathe 3s ease-in-out infinite alternate paused;
}
.influence-highlight.is-moving { animation-play-state: running; }
.influence-highlight:nth-child(even) { animation-delay: -1.5s; }
@keyframes highlight-breathe { to { opacity: .58; } }
</style>
