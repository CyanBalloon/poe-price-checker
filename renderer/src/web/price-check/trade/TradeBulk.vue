<template>
  <div v-if="!error && isStandalone" class="listing-view">
    <header class="listing-toolbar">
      <div class="listing-currencies" aria-label="Quote currency" role="group">
        <button
          v-for="currency in currencies"
          :key="currency.id"
          type="button"
          :aria-pressed="selectedCurr === currency.id"
          :aria-label="currency.name"
          :title="currency.name"
          @click="selectedCurr = currency.id"
        >
          <img :src="currencyIcon(currency.currency)" alt="" />
          <span>{{ result?.[currency.id].listed.value?.total ?? '…' }}</span>
        </button>
      </div>
      <online-filter :filters="filters" api="bulk" />
    </header>
    <div v-if="result && !selectedResults.length" class="ui-empty">
      <i class="fa-solid fa-coins" aria-hidden="true"></i>
      <strong>No offers for this currency</strong>
      <p>Try another quote currency or a lower minimum stock.</p>
    </div>
    <div v-else class="listing-rows">
      <template v-for="(res, idx) in selectedResults">
        <div v-if="!res" :key="'placeholder-' + idx" class="listing-skeleton" aria-hidden="true"></div>
        <trade-bulk-row
          v-else
          :key="res.id"
          :res="res"
          :selected-curr="selectedCurr"
          :show-seller="showSeller"
          @open-link="openTradeLink"
        />
      </template>
    </div>
  </div>

  <div v-else-if="!error" class="layout-column min-h-0" style="height: auto">
    <!-- @TODO: fix "Matched" text jumping (min-height: 22px) -->
    <div
      class="mb-2 flex pl-2 justify-between items-baseline"
      style="min-height: 1.375rem"
    >
      <div class="flex items-center text-gray-500">
        <span class="mr-1">{{ t(":matched") }}</span>
        <span v-if="!result" class="text-gray-600">...</span>
        <div v-else class="flex items-center">
          <button
            class="btn flex items-center mr-1"
            :style="{
              background:
                selectedCurr !== 'xchgExalted' ? 'transparent' : undefined,
            }"
            @click="selectedCurr = 'xchgExalted'"
          >
            <img :src="currencyIcon('exalted')" class="trade-bulk-currency-icon" />
            <span>{{ result.xchgExalted.listed.value?.total ?? "?" }}</span>
          </button>
          <button
            class="btn flex items-center mr-1"
            :style="{
              background:
                selectedCurr !== 'xchgChaos' ? 'transparent' : undefined,
            }"
            @click="selectedCurr = 'xchgChaos'"
          >
            <img :src="currencyIcon('chaos')" class="trade-bulk-currency-icon" />
            <span>{{ result.xchgChaos.listed.value?.total ?? "?" }}</span>
          </button>
          <button
            class="btn flex items-center mr-1"
            :style="{
              background:
                selectedCurr !== 'xchgStable' ? 'transparent' : undefined,
            }"
            @click="selectedCurr = 'xchgStable'"
          >
            <img :src="currencyIcon('divine')" class="trade-bulk-currency-icon" />
            <span>{{ result.xchgStable.listed.value?.total ?? "?" }}</span>
          </button>
          <span class="ml-1"
            ><online-filter :filters="filters" api="bulk"
          /></span>
        </div>
      </div>
      <trade-links v-if="result" :get-link="makeTradeLink" />
    </div>
    <div class="layout-column overflow-y-auto overflow-x-hidden">
      <table class="table-stripped w-full">
        <thead>
          <tr class="text-left">
            <th class="trade-table-heading">
              <div class="px-2">{{ t(":price") }}</div>
            </th>
            <th class="trade-table-heading">
              <div
                class="pl-1 pr-2 flex text-xs"
                style="line-height: 1.3125rem"
              >
                <span class="w-8 inline-block text-right -ml-px mr-px">{{
                  selectedCurr === "xchgExalted"
                    ? "exalt"
                    : selectedCurr === "xchgChaos"
                      ? "chaos"
                      : "div"
                }}</span
                ><span>{{ "\u2009" }}/{{ "\u2009" }}</span
                ><span class="w-8 inline-block">{{ t(":bulk") }}</span>
              </div>
            </th>
            <th class="trade-table-heading">
              <div class="px-1">{{ t(":stock") }}</div>
            </th>
            <th class="trade-table-heading">
              <div class="px-1">{{ t(":fulfill") }}</div>
            </th>
            <th class="trade-table-heading" :class="{ 'w-full': !showSeller }">
              <div class="pr-2 pl-4">
                <span class="ml-1" style="padding-left: 0.375rem">{{
                  t(":listed")
                }}</span>
              </div>
            </th>
            <th v-if="showSeller" class="trade-table-heading w-full">
              <div class="px-2">{{ t(":seller") }}</div>
            </th>
          </tr>
        </thead>
        <tbody style="overflow: scroll">
          <template v-for="(result, idx) in selectedResults">
            <tr v-if="!result" :key="idx">
              <td colspan="100" class="text-transparent">***</td>
            </tr>
            <tr v-else :key="result.id">
              <td class="px-2">
                {{
                  Number((result.exchangeAmount / result.itemAmount).toFixed(4))
                }}
              </td>
              <td class="pl-1 whitespace-nowrap">
                <span class="w-8 inline-block text-right">{{
                  result.exchangeAmount
                }}</span
                ><span>{{ "\u2009" }}/{{ "\u2009" }}</span
                ><span class="w-8 inline-block">{{ result.itemAmount }}</span>
              </td>
              <td class="px-1 text-right">{{ result.stock }}</td>
              <td class="px-1 text-right">
                <i
                  v-if="result.stock < result.itemAmount"
                  class="fas fa-exclamation-triangle mr-1 text-gray-500"
                ></i
                >{{ Math.floor(result.stock / result.itemAmount) }}
              </td>
              <td class="pr-2 pl-4 whitespace-nowrap">
                <div class="inline-flex items-center">
                  <div
                    class="account-status"
                    :class="result.accountStatus"
                  ></div>
                  <div class="ml-1 font-sans text-xs">
                    {{ result.relativeDate }}
                  </div>
                </div>
                <span
                  v-if="!showSeller && result.isMine"
                  class="rounded px-1 text-gray-800 bg-gray-400 ml-1"
                  >{{ t("You") }}</span
                >
              </td>
              <td v-if="showSeller" class="px-2 whitespace-nowrap">
                <span
                  v-if="result.isMine"
                  class="rounded px-1 text-gray-800 bg-gray-400"
                  >{{ t("You") }}</span
                >
                <span v-else class="font-sans text-xs">{{
                  showSeller === "ign" ? result.ign : result.accountName
                }}</span>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
  <ui-error-box class="mb-4" v-else>
    <template #name>{{ t(":error") }}</template>
    <p>Error: {{ error }}</p>
    <template #actions>
      <button class="btn" @click="execSearch">{{ t("Retry") }}</button>
      <button class="btn" @click="openTradeLink">{{ t("Browser") }}</button>
    </template>
  </ui-error-box>
</template>

<script lang="ts">
import {
  defineComponent,
  PropType,
  computed,
  watch,
  shallowRef,
  inject,
} from "vue";
import { useI18nNs } from "@/web/i18n";
import UiErrorBox from "@/web/ui/UiErrorBox.vue";
import { createTradeRequest } from "./pathofexile-bulk";
import { getTradeEndpoint, getTradeEndpointPath, getTradeUrlSegment } from "./common";
import { AppConfig } from "@/web/Config";
import { currencyIcon } from "@/web/ui/currency-icons";
import { ItemFilters } from "../filters/interfaces";
import { ParsedItem } from "@/parser";
import { PriceCheckWidget } from "@/web/overlay/interfaces";
import { artificialSlowdown } from "./artificial-slowdown";
import OnlineFilter from "./OnlineFilter.vue";
import TradeLinks from "./TradeLinks.vue";
import TradeBulkRow from "./TradeBulkRow.vue";
import { Host } from "@/web/background/IPC";
import { useBulkApi } from "./bulk-api";

const slowdown = artificialSlowdown(900);

export default defineComponent({
  components: { OnlineFilter, TradeLinks, UiErrorBox, TradeBulkRow },
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
    const widget = computed(() => AppConfig<PriceCheckWidget>("price-check")!);
    const isStandalone = computed(() => {
      const params = new URLSearchParams(window.location.search);
      return params.get("mode") === "standalone";
    });
    const { error, result, search } = useBulkApi();

    const showBrowser = inject<(url: string) => void>("builtin-browser")!;

    const currencies = [
      { id: "xchgExalted", name: "Exalted Orb", currency: "exalted" },
      { id: "xchgChaos", name: "Chaos Orb", currency: "chaos" },
      { id: "xchgStable", name: "Divine Orb", currency: "divine" },
    ] as const;

    const useExalts = computed(() => widget.value.coreCurrency === "exalted");

    const selectedCurr = shallowRef<"xchgExalted" | "xchgChaos" | "xchgStable">(
      // only does this check on first load, otherwise will use last used currency
      widget.value.coreCurrency === "exalted" ? "xchgExalted" : "xchgChaos",
    );

    watch(
      () => props.item,
      (item) => {
        if (AppConfig().game === "poe1") {
          selectedCurr.value = item.info.refName === "Chaos Orb" ? "xchgStable" : "xchgChaos";
        }
        slowdown.reset(item);
      },
      { immediate: true },
    );

    const selectedResults = computed(() => {
      if (!slowdown.isReady.value || !result.value) {
        return Array(8);
      }

      const listed = result.value[selectedCurr.value].listedLazy.value;
      if (isStandalone.value) {
        return listed;
      }
      if (listed.length === 0) {
        return [];
      }
      const arr = Array(8);
      arr.splice(0, listed.length, ...listed);
      return arr;
    });

    watch(result, () => {
      if (AppConfig().game === "poe1") return;
      // TODO: If we start having more than just ex & c, this is not scalable
      const stableTotal = result.value?.xchgStable.listed.value?.total;
      const exaltedTotal = result.value?.xchgExalted.listed.value?.total;
      const chaosTotal = result.value?.xchgChaos.listed.value?.total;

      if (stableTotal == null) {
        selectedCurr.value = useExalts.value ? "xchgExalted" : "xchgChaos";
      } else if (exaltedTotal == null) {
        selectedCurr.value = "xchgStable";
      } else if (chaosTotal == null) {
        selectedCurr.value = "xchgStable";
      } else {
        if (useExalts.value) {
          selectedCurr.value =
            stableTotal > exaltedTotal ? "xchgStable" : "xchgExalted";
        } else {
          selectedCurr.value =
            stableTotal > chaosTotal ? "xchgStable" : "xchgChaos";
        }
      }
    });

    function makeTradeLink(_have?: string[]) {
      const have =
        _have ??
        (selectedCurr.value === "xchgStable"
          ? ["divine"]
          : selectedCurr.value === "xchgExalted"
            ? ["exalted"]
            : ["chaos"]);
      const httpPostBody = createTradeRequest(props.filters, props.item, have);
      const httpGetQuery = { exchange: httpPostBody.query };
      return `https://${getTradeEndpoint()}/${getTradeEndpointPath()}/exchange/${getTradeUrlSegment()}${encodeURIComponent(props.filters.trade.league)}?q=${encodeURIComponent(JSON.stringify(httpGetQuery))}`;
    }

    const { t } = useI18nNs("trade_result");

    return {
      currencyIcon,
      t,
      isStandalone,
      error,
      result,
      selectedResults,
      selectedCurr,
      currencies: computed(() => AppConfig().game === "poe1"
        ? [currencies[1], currencies[2], currencies[0]].filter(currency => currency.name !== props.item.info.refName)
        : currencies),
      execSearch: () => {
        search(props.item, props.filters);
      },
      showSeller: computed(() => widget.value.showSeller),
      makeTradeLink,
      openTradeLink() {
        if (widget.value.builtinBrowser && Host.isElectron) {
          showBrowser(makeTradeLink());
        } else {
          window.open(makeTradeLink());
        }
      },
    };
  },
});
</script>

<style lang="postcss">
.trade-bulk-currency-icon {
  flex: none;
}

.trade-table-heading {
  @apply whitespace-nowrap;
}
</style>
