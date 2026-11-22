<template>
  <section :class="{ 'map-properties': standalone }">
    <h3 v-if="standalone">Map details</h3>
    <filter-btn-numeric v-if="filters.mapTier" :standalone="standalone" :filter="filters.mapTier" :name="CLIENT_STRINGS.MAP_TIER_PROPERTY ?? 'Map Tier'" />
    <filter-btn-numeric v-if="filters.areaLevel" :standalone="standalone" :filter="filters.areaLevel" :name="CLIENT_STRINGS.MAP_MONSTER_LEVEL ?? 'Monster Level'" />
    <h4 v-if="standalone && filters.mapRewards?.length">Drop bonuses <span>Minimum</span></h4>
    <filter-btn-numeric v-for="reward in filters.mapRewards" :key="reward.key" :standalone="standalone"
      :filter="reward" :name="reward.label.replace(/[:：]$/, '') + ' (%)'" />
    <filter-btn-logical v-for="influence in filters.influences" :key="influence.value" :standalone="standalone"
      :filter="influence" :text="influence.value" :img="`/images/influence-${influence.value}.png`" />
  </section>
</template>

<script setup lang="ts">
import { CLIENT_STRINGS } from "@/assets/data";
import type { ItemFilters } from "./interfaces";
import FilterBtnNumeric from "./FilterBtnNumeric.vue";
import FilterBtnLogical from "./FilterBtnLogical.vue";

defineProps<{ filters: ItemFilters; standalone?: boolean }>();
</script>

<style scoped>
.map-properties { display: grid; }
h3 { color: var(--ink); font-size: .88rem; font-weight: 600; }
h4 { display: flex; justify-content: space-between; margin-top: .75rem; font-size: .82rem; }
h4 span { color: var(--quiet); font-weight: 400; }
</style>
