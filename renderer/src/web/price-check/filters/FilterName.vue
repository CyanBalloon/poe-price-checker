<template>
  <div v-if="isStandalone" class="search-criteria">
    <div class="search-criteria-match">
      <span>Match</span>
      <button
        v-if="filters.searchRelaxed"
        type="button"
        class="ui-button"
        title="Switch between matching the item and its category"
        @click="toggleAccuracy"
      >
        {{ label }}
        <i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i>
      </button>
      <strong v-else>{{ label }}</strong>
    </div>
    <div class="search-criteria-options">
      <label>
        <span>Rarity</span>
        <select v-model="currentRarity">
          <option value="any">Any</option>
          <option value="normal">Normal</option>
          <option value="magic">Magic</option>
          <option value="rare">Rare</option>
          <option value="unique">Unique</option>
          <option value="nonunique">Non-Unique</option>
        </select>
      </label>
      <label v-if="filters.corrupted && !isMap" class="corruption-filter">
        <input type="checkbox" v-model="corrupted" />
        <span>Corrupted</span>
      </label>
    </div>
  </div>

  <div v-else class="filter-name">
    <button
      v-if="!isListingsDisabled"
      class="px-2 rounded border overflow-hidden text-ellipsis"
      :class="{
        'border-gray-500': showAsActive,
        'border-gray-900': !showAsActive,
      }"
      @click="toggleAccuracy"
    >
      {{ label }}
    </button>
    <button
      v-if="filters.corrupted"
      class="px-2"
      @click="corrupted = !corrupted"
    >
      <span v-if="corrupted" class="text-red-500">{{
        t("item.corrupted")
      }}</span>
      <span v-else class="text-gray-600">{{ t("item.not_corrupted") }}</span>
    </button>
  </div>
</template>

<script lang="ts">
import { AppConfig } from "@/web/Config";
import { getCategoryToTradeId } from "../trade/trade-constants";
import { defineComponent, PropType, computed } from "vue";
import { useI18n } from "vue-i18n";
import { ParsedItem, ItemCategory } from "@/parser";
import type { ItemFilters } from "./interfaces";


export default defineComponent({
  name: "FilterName",
  props: {
    filters: {
      type: Object as PropType<ItemFilters>,
      required: true,
    },
    item: {
      type: Object as PropType<ParsedItem>,
      required: true,
    },
  },
  setup(props) {
    const { t } = useI18n();

    const isStandalone = computed(() => {
      const params = new URLSearchParams(window.location.search);
      return params.get("mode") === "standalone";
    });

    const isListingsDisabled = computed(() => {
      if (AppConfig().game === "poe1") return false;
      const { category, info } = props.item;
      return category === ItemCategory.Currency ||
        (category === ItemCategory.Gem && info.icon?.includes("/Lineage")) ||
        info.tradeTag != null;
    });

    const currentRarity = computed({
      get() {
        return props.filters.rarity?.value || 'any';
      },
      set(val) {
        if (!props.filters.rarity) {
          props.filters.rarity = { value: val };
        } else {
          props.filters.rarity.value = val;
        }
      }
    });

    const label = computed(() => {
      const { filters } = props;
      const activeSearch =
        filters.searchRelaxed && !filters.searchRelaxed.disabled
          ? filters.searchRelaxed
          : filters.searchExact;

      if (activeSearch.name) {
        return activeSearch.name;
      }
      if (activeSearch.baseType) {
        return activeSearch.baseType;
      }
      if (activeSearch.category) {
        const tradeId = getCategoryToTradeId().get(activeSearch.category)!;
        return t("item_category.prop", [
          t(`item_category.${tradeId.replace(".", "_")}`),
        ]);
      }

      return "??? Report if you see this text";
    });

    const showAsActive = computed(() => {
      const { filters } = props;
      return filters.searchRelaxed?.disabled;
    });

    function toggleAccuracy() {
      const { filters } = props;
      if (filters.searchRelaxed) {
        filters.searchRelaxed.disabled = !filters.searchRelaxed.disabled;
      }
    }

    const corrupted = computed<boolean>({
      get() {
        return props.filters.corrupted!.value;
      },
      set(value) {
        props.filters.corrupted!.value = value;
      },
    });

    return {
      t,
      isStandalone,
      isMap: computed(() => props.item.category === ItemCategory.Map),
      isListingsDisabled,
      currentRarity,
      label,
      showAsActive,
      toggleAccuracy,
      corrupted,
    };
  },
});
</script>

<style lang="postcss">
.filter-name {
  @apply bg-gray-900 mb-2 rounded;
  line-height: 1.25rem;
  display: flex;
  justify-content: space-between;
  white-space: nowrap;
}
</style>


<style scoped>
.search-criteria {
  display: grid;
  gap: 0.55rem;
  margin-bottom: 0.75rem;
  color: var(--muted);
  font-size: 0.76rem;
}

.search-criteria-match,
.search-criteria-options,
.search-criteria-options label {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.55rem;
}

.search-criteria-match {
  justify-content: space-between;
}

.search-criteria-match strong {
  color: var(--ink);
  font-weight: 600;
}

.search-criteria-options select {
  padding: 0.3rem 0.4rem;
  border: 1px solid var(--line);
  border-radius: 0.35rem;
  background: var(--page);
  color: var(--ink);
}

.search-criteria .ui-button {
  min-height: 1.85rem;
  padding-block: 0.25rem;
  font-size: 0.73rem;
}

.search-criteria-options { display: grid; }
.search-criteria-options label { justify-content: space-between; min-height: 2rem; }
.search-criteria-options .corruption-filter { justify-content: start; cursor: pointer; }
.corruption-filter input { width: 1rem; height: 1rem; accent-color: var(--accent); }
</style>
