<template>
  <div class="listing-row">
    <div class="listing-value">
      <div>
        <core-currency-img :currency="quoteCurrency" />
        <strong class="ui-value">{{ Number((res.exchangeAmount / res.itemAmount).toFixed(4)) }}</strong>
        <span>{{ currencyLabel(quoteCurrency, res.exchangeAmount / res.itemAmount) }} / item</span>
      </div>
      <small>{{ res.exchangeAmount }} for {{ res.itemAmount }} items</small>
    </div>
    <div class="listing-attributes">
      <span>Stock <b>{{ res.stock }}</b></span>
      <span title="Times this offer can be fulfilled">Trades <b>{{ Math.floor(res.stock / res.itemAmount) }}</b></span>
    </div>
    <div class="listing-seller">
      <span v-if="showSeller !== false">
        <i class="listing-status" :data-status="res.accountStatus" :title="res.accountStatus"></i>
        {{ showSeller === 'ign' ? res.ign : res.accountName }}
      </span>
      <small>{{ res.relativeDate }}<span v-if="res.isMine"> · Yours</span></small>
    </div>
    <button type="button" class="ui-button listing-link" title="Open bulk exchange" aria-label="Open bulk exchange" @click.stop="openTradeLink">
      <span>Open trade</span><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
    </button>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, PropType } from "vue";
import { PricingResult } from "./pathofexile-bulk";
import { PriceCheckWidget } from "@/web/overlay/interfaces";
import CoreCurrencyImg from "@/web/ui/CoreCurrencyImg.vue";
import { currencyLabel } from "@/web/ui/currency-icons";

const quoteCurrencies = {
  xchgExalted: "exalted",
  xchgChaos: "chaos",
  xchgStable: "divine",
} as const;

export default defineComponent({
  name: "TradeBulkRow",
  components: { CoreCurrencyImg },
  props: {
    res: {
      type: Object as PropType<PricingResult>,
      required: true,
    },
    selectedCurr: {
      type: String as PropType<keyof typeof quoteCurrencies>,
      required: true,
    },
    showSeller: {
      type: String as PropType<PriceCheckWidget["showSeller"]>,
      required: true,
    },
  },
  emits: ["open-link"],
  setup(props, { emit }) {
    function openTradeLink() {
      emit("open-link");
    }

    return {
      currencyLabel,
      quoteCurrency: computed(() => quoteCurrencies[props.selectedCurr]),
      openTradeLink,
    };
  },
});
</script>
