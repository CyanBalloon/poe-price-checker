<template>
  <div v-if="ordered.length && AppConfig()?.game === 'poe1'" class="item-influence-symbols">
    <img v-for="influence in ordered" :key="influence" :src="influenceSymbolUrl[influence]"
      :alt="influence + ' influence'" :title="influence + ' influence'" width="27" height="27"
      @error="hideMissing" />
  </div>
</template>

<script setup lang="ts">
import type { ItemInfluence } from "@/parser";
import { computed } from "vue";
import { influenceArtOrder } from "./influence-art";
import { AppConfig } from "@/web/Config";
import { influenceSymbolUrl } from "./influence-symbols";

const props = defineProps<{ influences?: readonly ItemInfluence[] }>();
const ordered = computed(() => influenceArtOrder.filter(influence => props.influences?.includes(influence)));
function hideMissing(event: Event) { (event.target as HTMLImageElement).hidden = true; }
</script>

<style scoped>
.item-influence-symbols { display: flex; justify-content: center; gap: .15rem; margin-top: .2rem; }
.item-influence-symbols img { flex: none; width: 27px; height: 27px; }
</style>
