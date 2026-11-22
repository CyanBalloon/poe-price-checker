<template>
  <div :class="standalone ? 'property-list' : 'flex flex-wrap items-center gap-2 pb-3'">
    <filter-btn-numeric
      :standalone="standalone"
      v-if="filters.socketNumber"
      :filter="filters.socketNumber"
      :name="t('item.gem_sockets')"
    />
    <filter-btn-numeric
      :standalone="standalone"
      v-if="filters.linkedSockets"
      :filter="filters.linkedSockets"
      :name="t('item.linked_sockets')"
    />
    <filter-btn-numeric
      :standalone="standalone"
      v-if="filters.mapTier"
      :filter="filters.mapTier"
      :name="t('item.map_tier')"
    />
    <filter-btn-numeric
      :standalone="standalone"
      v-if="filters.awardedAscendancyPoints"
      :filter="filters.awardedAscendancyPoints"
      :name="t('item.ascendancy_points')"
    />
    <filter-btn-numeric
      :standalone="standalone"
      v-if="filters.areaLevel"
      :filter="filters.areaLevel"
      :name="t('item.area_level')"
    />
    <filter-btn-numeric
      :standalone="standalone"
      v-if="filters.heistWingsRevealed"
      :filter="filters.heistWingsRevealed"
      :name="t('item.heist_wings_revealed')"
    />
    <filter-btn-numeric
      :standalone="standalone"
      v-if="filters.sentinelCharge"
      :filter="filters.sentinelCharge"
      :name="t('item.sentinel_charge')"
    />
    <filter-btn-logical
      :standalone="standalone"
      v-if="filters.mapBlighted?.value"
      readonly
      :filter="{ disabled: false }"
      :text="filters.mapBlighted.value"
    />
    <filter-btn-logical
      :standalone="standalone"
      v-if="filters.rarity?.value === 'magic' && !standalone"
      readonly
      :filter="{ disabled: false }"
      text="Magic"
    />
    <filter-btn-logical
      :standalone="standalone"
      v-if="filters.rarity?.value === 'normal' && !standalone"
      readonly
      :filter="{ disabled: false }"
      text="Normal"
    />
    <filter-btn-logical
      :standalone="standalone"
      v-if="filters.discriminator?.value"
      readonly
      :filter="{ disabled: false }"
      :text="filters.discriminator.value"
    />
    <filter-btn-numeric
      :standalone="standalone"
      v-if="filters.itemLevel"
      :filter="filters.itemLevel"
      :name="t('item.item_level')"
    />
    <filter-btn-numeric
      :standalone="standalone"
      v-if="filters.requires?.level"
      :filter="filters.requires?.level"
      :name="t('item.requires_level')"
    />
    <filter-btn-numeric
      :standalone="standalone"
      v-if="filters.stackSize"
      :filter="filters.stackSize"
      :name="t('item.stock')"
    />
    <filter-btn-numeric
      :standalone="standalone"
      v-if="filters.whiteSockets"
      :filter="filters.whiteSockets"
      :name="t('item.white_sockets')"
    />
    <filter-btn-numeric
      :standalone="standalone"
      v-if="filters.augmentSockets"
      :filter="filters.augmentSockets"
      :name="t('item.augment_sockets')"
    />
    <filter-btn-numeric
      :standalone="standalone"
      v-if="filters.gemLevel"
      :filter="filters.gemLevel"
      :name="t('item.gem_level')"
    />
    <filter-btn-numeric
      :standalone="standalone"
      v-if="filters.quality"
      :filter="filters.quality"
      :name="t('item.quality')"
    />
    <template v-if="filters.influences && isPoe1">
      <filter-btn-logical
      :standalone="standalone"
        v-for="influence of filters.influences"
        :key="influence.value"
        :filter="influence"
        :text="influence.value"
        :img="`/images/influence-${influence.value}.png`"
      />
    </template>
    <!-- Implicitly should only be tier or plain unid from create-item-filters -->
    <filter-btn-numeric
      :standalone="standalone"
      v-if="filters.unidentifiedTier"
      :filter="filters.unidentifiedTier"
      :name="t('item.unidentified_tier')"
    />
    <filter-btn-logical
      :standalone="standalone"
      v-else-if="filters.unidentified"
      :filter="filters.unidentified"
      :text="t('item.unidentified')"
    />
    <filter-btn-logical
      :standalone="standalone"
      v-if="filters.veiled"
      :filter="filters.veiled"
      :text="t('item.veiled')"
    />
    <filter-btn-logical
      :standalone="standalone"
      v-if="filters.foil"
      :filter="filters.foil"
      :text="t('item.foil_unique')"
    />
    <filter-btn-logical
      :standalone="standalone"
      v-if="filters.mirrored"
      active
      :filter="filters.mirrored"
      :text="
        t(filters.mirrored.disabled ? 'item.not_mirrored' : 'item.mirrored')
      "
    />
    <filter-btn-logical
      :standalone="standalone"
      v-if="filters.sanctified"
      active
      :filter="filters.sanctified"
      :text="
        t(
          filters.sanctified.disabled
            ? 'item.not_sanctified'
            : 'item.sanctified',
        )
      "
    />
    <filter-btn-logical
      :standalone="standalone"
      v-if="filters.ultimatumHint"
      :filter="filters.ultimatumHint"
      :text="t(`item.${filters.ultimatumHint.value.toLowerCase()}`)"
    />
    <slot />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { ItemFilters } from "./interfaces";
import FilterBtnNumeric from "./FilterBtnNumeric.vue";
import FilterBtnLogical from "./FilterBtnLogical.vue";

defineProps<{ filters: ItemFilters; isPoe1: boolean; standalone?: boolean }>();
const { t } = useI18n();
</script>

<style scoped>
.property-list { display: grid; }
</style>
