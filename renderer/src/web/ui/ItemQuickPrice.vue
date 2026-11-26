<template>
  <div class="flex items-center gap-x-1">
    <slot name="item">
      <div v-if="resolvedItemImg" class="flex flex-col items-center justify-center shrink-0">
        <ui-item-img 
          :icon="resolvedItemImg"
          :item-name="itemBase?.refName"
          :namespace="itemBase?.namespace"
          :influences="influences"
          :parsed-item="parsedItem"
          overflow-hidden 
        />
        <item-influence-symbols :influences="influences" />
      </div>
    </slot>
    <i class="fas fa-arrow-right text-gray-600 px-1 text-sm"></i>
    <div>
      <div class="flex items-center gap-x-1">
        <div class="whitespace-nowrap overflow-hidden">
          <span v-if="approx && !isRange" class="text-gray-600 font-sans">~ </span>
          <span :class="{ [$style.golden]: isValuable, 'px-1': minText === '?' }">{{
            minText
          }}</span>
          <span v-if="isRange" class="text-gray-600 font-sans"> ~ </span>
          <span v-if="isRange" :class="{ [$style.golden]: isValuable }">{{
            maxText
          }}</span>
          <span
            v-if="!currencyText && price"
            class="font-sans"
            :class="{ [$style.golden]: isValuable }"
          >
            ×</span
          >
          <span v-else-if="formatted" :class="{ [$style.golden]: isValuable }"
            >&nbsp;{{ formatted.primary.currency }}</span
          >
        </div>
        <core-currency-img v-if="!currencyText && formatted" :currency="formatted.primary.currency" />
        <div v-if="AppConfig().game === 'poe2' && price?.currency === 'div' && exaltedRate" class="flex items-center whitespace-nowrap text-gray-400 text-xs">
          <span class="opacity-70">({{ Math.round(price.min * exaltedRate) }}</span>
          <img :src="currencyIcon('exalted')" class="item-art inline-block mx-0.5" alt="" />
          <span class="opacity-70">)</span>
        </div>
      </div>
      <div v-if="formatted?.chaosEquivalent" class="text-xs text-gray-400">
        ≈ {{ formatChaosOrDivineAmount(formatted.chaosEquivalent.min) }}<template v-if="formatted.chaosEquivalent.min !== formatted.chaosEquivalent.max">–{{ formatChaosOrDivineAmount(formatted.chaosEquivalent.max) }}</template> chaos
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import type { ItemInfluence, ParsedItem } from "@/parser";
import ItemInfluenceSymbols from "./ItemInfluenceSymbols.vue";
import { defineComponent, computed, PropType } from "vue";
import { displayRounding, usePoeninja, formatChaosOrDivineAmount } from "../background/Prices";
import { ITEM_BY_REF, BaseType } from "@/assets/data";
import { AppConfig } from "@/web/Config";
import UiItemImg from "./UiItemImg.vue";
import CoreCurrencyImg from "./CoreCurrencyImg.vue";
import { currencyIcon } from "@/web/ui/currency-icons";

export default defineComponent({
  components: {
    UiItemImg,
    ItemInfluenceSymbols,
    CoreCurrencyImg,
  },
  props: {
    price: {
      type: Object as PropType<{
        min: number;
        max: number;
        currency: string;
      }>,
      default: undefined,
    },
    approx: {
      type: Boolean,
      default: false,
    },
    fraction: {
      type: Boolean,
      default: false,
    },
    influences: Array as PropType<readonly ItemInfluence[]>,
    parsedItem: Object as PropType<ParsedItem>,
    itemImg: {
      type: String,
      default: undefined,
    },
    currencyText: {
      type: Boolean,
      default: false,
    },
    itemBase: {
      type: Object as PropType<BaseType>,
      default: undefined,
    },
  },
  setup(props) {
    const { exaltedRate, displayPrice } = usePoeninja();
    const formatted = computed(() => props.price && displayPrice(props.price));
    const format = (value: number) => AppConfig().game === "poe1" ? formatChaosOrDivineAmount(value) : displayRounding(value, props.fraction);
    const minText = computed(() =>
      formatted.value ? format(formatted.value.primary.min) : "?",
    );
    const maxText = computed(() =>
      formatted.value ? format(formatted.value.primary.max) : "?",
    );

    return {
      minText,
      maxText,
      resolvedItemImg: computed(() => {
        if (props.itemImg || props.itemBase) return props.itemImg || props.itemBase?.icon || "%NOT_FOUND%";
        return ITEM_BY_REF("ITEM", "Scroll of Wisdom")?.[0]?.icon;
      }),
      exaltedRate,
      formatted,
      formatChaosOrDivineAmount,
      currencyIcon,
      AppConfig,
      isRange: computed(() => {
        return minText.value !== maxText.value;
      }),
      isValuable: computed(() => {
        return formatted.value?.primary.currency === "div";
      }),
    };
  },
});
</script>

<style module>
.golden {
  color: #e4c29a;
}
</style>
