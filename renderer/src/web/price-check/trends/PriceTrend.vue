<template>
  <section v-if="summary" class="summary-estimate" aria-label="Market estimate">
    <div class="summary-estimate-label">{{ isValuableBasetype ? 'Base item estimate' : 'Market estimate' }}</div>
    <template v-if="priceData">
      <div class="summary-estimate-value">
        <core-currency-img :currency="priceData.price.currency" />
        <strong>{{ summaryValue }} {{ currencyLabel(priceData.price.currency, priceData.price.max) }}</strong>
      </div>
      <div class="summary-estimate-meta">
        <span v-if="equivalent">≈ {{ equivalent.amount.toLocaleString() }} {{ currencyLabel(equivalent.currency, equivalent.amount) }}</span>
        <button type="button" class="summary-estimate-source" @click="openNinja">
          poe.ninja <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
        </button>
      </div>
    </template>
    <p v-else class="summary-estimate-unavailable">No estimate available</p>
  </section>
  <div v-else-if="priceData" class="market-estimate">
    <div
      v-if="!isValuableBasetype && !slowdown.isReady.value"
      class="flex flex-1 justify-center"
    >
      <div><i class="fas fa-dna fa-spin text-gray-600"></i></div>
      <i18n-t keypath="trade_result.getting_price" class="pl-2">
        <span class="text-gray-600">{{ t(":getting_price_from") }}</span>
      </i18n-t>
    </div>
    <template v-else>
      <item-quick-price
        class="text-base"
        :price="priceData.rawPrice"
        :fraction="filters.stackSize != null"
        :item-img="item.info.icon"
        :item-base="item.info"
      >
        <template #item v-if="isValuableBasetype">
          <span class="text-gray-400">{{ t(":base_item") }}</span>
        </template>
      </item-quick-price>
      <button
        @click="openNinja"
        class="ui-button"
      >
        <i class="fas fa-external-link-alt text-[10px] text-gray-400"></i>
        <span>Open on poe.ninja</span>
      </button>
    </template>
  </div>
  <div
    v-else-if="!item.info.craftable"
    class="market-estimate"
  >
    <item-quick-price
      class="text-base"
      currency-text
      :item-img="item.info.icon"
      :item-base="item.info"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType, computed, watch } from "vue";
import { useI18nNs } from "@/web/i18n";
import {
  usePoeninja, displayRounding, formatChaosOrDivineAmount,
} from "@/web/background/Prices";
import { isValuableBasetype, getDetailsId } from "./getDetailsId";
import { AppConfig } from "@/web/Config";
import { currencyLabel } from "@/web/ui/currency-icons";
import CoreCurrencyImg from "@/web/ui/CoreCurrencyImg.vue";
import ItemQuickPrice from "@/web/ui/ItemQuickPrice.vue";
import { ParsedItem, ItemCategory } from "@/parser";
import { artificialSlowdown } from "../trade/artificial-slowdown";
import { ItemFilters } from "../filters/interfaces";

const slowdown = artificialSlowdown(800);

export default defineComponent({
  components: {
    ItemQuickPrice,
    CoreCurrencyImg,
  },
  props: {
    summary: Boolean,
    item: {
      type: Object as PropType<ParsedItem>,
      required: true,
    },
    filters: {
      type: Object as PropType<ItemFilters>,
      required: true,
    },
  },
  setup(props) {
    const { t } = useI18nNs("trade_result");
    const { findPriceByQuery, autoCurrency, displayPrice, exaltedRate, visceraImplicits } = usePoeninja();

    watch(
      () => props.item,
      (item) => {
        slowdown.reset(item);
      },
      { immediate: true },
    );

    const priceData = computed(() => {
      const detailsId = getDetailsId(props.item, props.item.info.viscera ? visceraImplicits(props.item.info.refName) : undefined);
      const entry = detailsId && findPriceByQuery(detailsId);
      if (!entry) return;
      const isCurrency = props.item.category === ItemCategory.Currency;
      const price = autoCurrency(
        entry.primaryValue,
        props.item.info.refName === "Divine Orb" || isCurrency,
        isCurrency && AppConfig().game === "poe2" ? "exalted" : undefined,
      );

      const { primary, chaosEquivalent } = displayPrice(price);
      return {
        price: primary,
        rawPrice: price,
        chaosEquivalent,
        url: entry.url,
      };
    });

    return {
      t,
      priceData,
      currencyLabel,
      summaryValue: computed(() => {
        const price = priceData.value?.price;
        if (!price) return;
        const fraction = props.filters.stackSize != null;
        const format = (value: number) => AppConfig().game === "poe1" ? formatChaosOrDivineAmount(value) : displayRounding(value, fraction);
        const min = format(price.min);
        const max = format(price.max);
        return min === max ? min : min + "–" + max;
      }),
      equivalent: computed(() => {
        const price = priceData.value?.price;
        if (!price || price.min !== price.max) return;
        const chaos = priceData.value?.chaosEquivalent;
        if (chaos) return { amount: chaos.min, currency: "chaos" };
        if (AppConfig().game === "poe2" && price.currency === "div" && exaltedRate.value) {
          return { amount: Math.round(price.min * exaltedRate.value), currency: "exalted" };
        }
      }),
      openNinja() {
        window.open(priceData.value!.url);
      },
      isValuableBasetype: computed(() => {
        return isValuableBasetype(props.item);
      }),
      slowdown,
    };
  },
});
</script>

<style scoped>
.summary-estimate { min-width: 0; }
.summary-estimate-label { color: var(--quiet); font-size: 0.78rem; }
.summary-estimate-value { display: flex; align-items: center; gap: 0.65rem; }
.summary-estimate-value strong { color: var(--ink); font: 500 clamp(1.55rem, 2.5vw, 2.4rem)/1.2 var(--display); font-variant-numeric: tabular-nums; }
.summary-estimate-meta { display: flex; align-items: baseline; gap: 0.85rem; color: var(--muted); }
.summary-estimate-source { color: var(--quiet); font-size: 0.75rem; }
.summary-estimate-source:hover { color: var(--accent); }
.summary-estimate-unavailable { margin-top: 0.45rem; color: var(--muted); }
.market-estimate { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.6rem; padding-bottom: 0.55rem; }
</style>
