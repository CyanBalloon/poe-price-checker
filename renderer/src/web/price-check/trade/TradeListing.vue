<template>
  <div v-if="!error && isStandalone" class="listing-view">
    <header class="listing-toolbar">
      <span aria-live="polite">{{ list ? list.total + (list.inexact ? '+' : '') + ' matched' : 'Searching listings…' }}</span>
      <online-filter v-if="list" :by-time="true" :filters="filters" api="trade" />
    </header>
    <div v-if="list && !list.total" class="ui-empty">
      <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
      <strong>No matching listings</strong>
      <p>Try broadening your filters.</p>
    </div>
    <div v-else class="listing-rows">
      <div v-if="list?.total" class="listing-columns" aria-hidden="true">
        <span>Price</span><span>Item details</span><span>Listed</span>
      </div>
      <template v-for="(res, idx) in groupedResults">
        <div v-if="!res" :key="'placeholder-' + idx" class="listing-skeleton" aria-hidden="true"></div>
        <trade-listing-row
          v-else
          :key="res.id"
          :res="res"
          :item="item"
          :filters="filters"
          :quality="filters.quality"
          :show-seller="showSeller"
          @open-link="openExactTradeLink(res)"
        />
      </template>
    </div>
    <div v-if="isLikelyPriceFixed" class="ui-alert listing-warning">
      <span>{{ t(":likely_price_fixed") }}</span>
      <button type="button" class="ui-button" @click="execFilterExaltDivine">{{ t(":filter_exalt_divine") }}</button>
    </div>
  </div>

  <div v-else-if="!error" class="layout-column min-h-0" style="height: auto">
    <div class="mb-2 flex pl-2">
      <div class="flex items-baseline text-gray-500 mr-2">
        <span class="mr-1">{{ t(":matched") }}</span>
        <span v-if="!list" class="text-gray-600">...</span>
        <span v-else>{{ list.total }}{{ list.inexact ? "+" : "" }}</span>
      </div>
      <online-filter
        v-if="list"
        :by-time="true"
        :filters="filters"
        api="trade"
      />
      <div class="flex-1"></div>
      <trade-links v-if="list" :get-link="makeTradeLink" />
    </div>

    <div class="layout-column overflow-y-auto overflow-x-hidden">
      <table class="table-stripped w-full">
        <thead>
          <tr class="text-left">
            <th class="trade-table-heading">
              <div class="px-2">{{ t(":price") }}</div>
            </th>
            <th v-if="item.stackSize" class="trade-table-heading">
              <div class="px-2">{{ t(":stock") }}</div>
            </th>
            <th v-if="filters.itemLevel" class="trade-table-heading">
              <div class="px-2">{{ t(":item_level") }}</div>
            </th>
            <th
              v-if="
                item.category === ItemCategory.Gem ||
                item.category === ItemCategory.UncutGem
              "
              class="trade-table-heading"
            >
              <div class="px-2">{{ t(":gem_level") }}</div>
            </th>
            <th
              v-if="item.category === ItemCategory.Gem"
              class="trade-table-heading"
            >
              <div class="px-2">{{ t(":gem_sockets") }}</div>
            </th>
            <th
              v-if="
                (filters.quality && !filters.quality.disabled) ||
                item.category === ItemCategory.Gem
              "
              class="trade-table-heading"
            >
              <div class="px-2">{{ t(":quality") }}</div>
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
          <template v-for="(result, idx) in groupedResults">
            <tr v-if="!result" :key="idx">
              <td colspan="100" class="text-transparent">***</td>
            </tr>
            <trade-item
              v-else
              :key="result.id"
              :result="result"
              :item="item"
              :show-seller="showSeller"
              :item-level="filters.itemLevel"
              :quality="filters.quality"
            />
          </template>
        </tbody>
      </table>
      <div
        v-if="isLikelyPriceFixed"
        class="p-2 border-2 border-gray-600 rounded mt-2"
      >
        <div class="flex text-gray-400 leading-none">
          <div class="mt-1">
            {{ t(":likely_price_fixed") }}
          </div>
          <div class="flex-1" />
          <div class="pl-2">
            <button class="btn" @click="execFilterExaltDivine">
              {{ t(":filter_exalt_divine") }}
              <i class="fas fa-history text-xs" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <ui-error-box v-else>
    <template #name>{{ t(":error") }}</template>
    <p>Error: {{ error }}</p>
    <div v-if="error && errorFix" class="border p-1 rounded">
      {{ errorFix }}
    </div>
    <template #actions>
      <button v-if="!isLoggedIn && isComplexQueryError" class="btn text-green-400 border border-green-500/20 hover:bg-green-500/10" @click="handleLoginClick">{{ t("Login") }}</button>
      <button class="btn" @click="execSearch">{{ t("Retry") }}</button>
      <button class="btn" @click="openTradeLink">{{ t("Browser") }}</button>
    </template>
  </ui-error-box>
</template>

<script lang="ts">
import {
  defineComponent,
  computed,
  watch,
  PropType,
  inject,
  ref,
  onMounted,
  onUnmounted,
} from "vue";
import { useI18nNs } from "@/web/i18n";
import { Host } from "@/web/background/IPC";
import UiPopover from "@/web/ui/Popover.vue";
import UiErrorBox from "@/web/ui/UiErrorBox.vue";
import { createTradeRequest, type PricingResult } from "./pathofexile-trade";
import { getTradeEndpoint, getTradeEndpointPath, getTradeUrlSegment } from "./common";
import { AppConfig } from "@/web/Config";
import { PriceCheckWidget } from "@/web/overlay/interfaces";
import { ItemFilters, StatFilter, ItemHasEmptyModifier } from "../filters/interfaces";
import { ItemCategory, ParsedItem } from "@/parser";
import { artificialSlowdown } from "./artificial-slowdown";
import OnlineFilter from "./OnlineFilter.vue";
import TradeLinks from "./TradeLinks.vue";
import TradeItem from "./TradeItem.vue";
import TradeListingRow from "./TradeListingRow.vue";
import { useTradeApi } from "./trade-api";

const slowdown = artificialSlowdown(900);

const SHOW_RESULTS = 20;

export default defineComponent({
  components: { OnlineFilter, TradeLinks, TradeItem, UiErrorBox, UiPopover, TradeListingRow },
  props: {
    filters: {
      type: Object as PropType<ItemFilters>,
      required: true,
    },
    stats: {
      type: Array as PropType<StatFilter[]>,
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
    watch(
      () => props.item,
      (item) => {
        slowdown.reset(item);
      },
      { immediate: true },
    );

    const { error, searchResult, groupedResults, search } = useTradeApi();

    const showBrowser = inject<(url: string) => void>("builtin-browser")!;

    const { t } = useI18nNs("trade_result");

    function makeTradeLink() {
      return searchResult.value
        ? `https://${getTradeEndpoint()}/${getTradeEndpointPath()}/search/${getTradeUrlSegment()}${encodeURIComponent(props.filters.trade.league)}/${searchResult.value.id}`
        : `https://${getTradeEndpoint()}/${getTradeEndpointPath()}/search/${getTradeUrlSegment()}${encodeURIComponent(props.filters.trade.league)}?q=${encodeURIComponent(JSON.stringify(createTradeRequest(props.filters, props.stats, props.item)))}`;
    }

    // Shift Key Detection
    const isShiftPressed = ref(false);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        isShiftPressed.value = true;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        isShiftPressed.value = false;
      }
    };

    onMounted(() => {
      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);
    });

    onUnmounted(() => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    });

    return {
      t,
      isStandalone,
      list: searchResult,
      groupedResults: computed(() => {
        if (!slowdown.isReady.value || !searchResult.value) {
          return Array<undefined>(SHOW_RESULTS);
        } else if (isStandalone.value) {
          return groupedResults.value;
        } else {
          if (groupedResults.value.length === 0) {
            return [];
          }
          return [
            ...groupedResults.value,
            ...(groupedResults.value.length < SHOW_RESULTS
              ? Array<undefined>(SHOW_RESULTS - groupedResults.value.length)
              : []),
          ];
        }
      }),
      execSearch: () => {
        search(props.filters, props.stats, props.item);
      },
      execFilterExaltDivine: () => {
        props.filters.trade.currency = "exalted_divine";
      },
      error,
      errorFix: computed(() => {
        console.log(error.value);
        if (error.value?.startsWith("Query is too complex.")) {
          return t(":fix_complex_query");
        }

        return undefined;
      }),
      showSeller: computed(() => widget.value.showSeller),
      isLoggedIn: computed(() => Host.isLoggedIn.value),
      isComplexQueryError: computed(() => Boolean(error.value?.startsWith("Query is too complex."))),
      handleLoginClick() {
        Host.sendEvent({
          name: "CLIENT->MAIN::user-action",
          payload: { action: "poe-login" }
        });
      },
      makeTradeLink,
      openTradeLink() {
        showBrowser(makeTradeLink());
      },
      openExactTradeLink(res: PricingResult & { listedTimes: number }) {
        const raw = res.rawResult;
        if (!raw) return;
        const poe1 = AppConfig().game === "poe1";

        const query: {
          status: { option: string };
          stats: Array<{
            type: string;
            value?: { min?: number; max?: number };
            filters: Array<{ id: string; value?: { min?: number; max?: number } }>;
          }>;
          filters: {
            type_filters?: {
              filters: {
                rarity?: { option: string };
                ilvl?: { min?: number; max?: number };
              };
            };
            misc_filters?: {
              filters: {
                corrupted?: { option: string };
                gem_sockets?: { min?: number };
                ilvl?: { min?: number; max?: number };
              };
            };
            socket_filters?: {
              filters: {
                links?: { min: number };
                sockets?: { min: number; w?: number };
              };
            };
          };
          name?: string;
          type?: string;
        } = {
          status: {
            option: props.filters.trade.listingType || "securable"
          },
          stats: [{ type: "and", filters: [] }],
          filters: {}
        };

        const frameType = raw.item.frameType;

        // Name and Type
        if (frameType === 3) { // Unique
          if (raw.item.name) query.name = raw.item.name;
          if (raw.item.typeLine) query.type = raw.item.typeLine;
        } else { // Normal, Magic, Rare
          query.type = raw.item.baseType || props.filters.searchExact.baseTypeTrade || props.filters.searchExact.baseType || raw.item.typeLine;
        }

        // Rarity Filter
        const rarityMap: Record<number, string> = {
          0: "normal",
          1: "magic",
          2: "rare",
          3: "unique"
        };
        const rarityOption = frameType == null ? undefined : rarityMap[frameType];
        if (rarityOption) {
          query.filters.type_filters = {
            filters: {
              rarity: { option: rarityOption }
            }
          };
        }

        if (typeof raw.item.ilvl === "number") {
          const group = poe1 ? "misc_filters" : "type_filters";
          query.filters[group] ??= { filters: {} };
          query.filters[group].filters.ilvl = { min: raw.item.ilvl, max: raw.item.ilvl };
        }

        // Corruption
        if (typeof raw.item.corrupted === "boolean") {
          if (!query.filters.misc_filters) {
            query.filters.misc_filters = { filters: {} };
          }
          query.filters.misc_filters!.filters.corrupted = {
            option: String(raw.item.corrupted)
          };
        }

        if (poe1 && raw.item.sockets?.length) {
          const groups = new Map<number, number>();
          let white = 0;
          for (const socket of raw.item.sockets) {
            groups.set(socket.group, (groups.get(socket.group) ?? 0) + 1);
            if (socket.sColour === "W") white++;
          }
          const linked = Math.max(...groups.values());
          query.filters.socket_filters = {
            filters: {
              links: { min: linked },
              sockets: { min: raw.item.sockets.length, w: white || undefined },
            },
          };
        } else if (raw.item.gemSockets?.length) {
          query.filters.misc_filters ??= { filters: {} };
          query.filters.misc_filters.filters.gem_sockets = { min: raw.item.gemSockets.length };
        }

        // Exact mods values (min/max rolls matching the item exactly)
        const qAnd = query.stats[0];
        const addedIds = new Set<string>();

        const isUnique = frameType === 3;

        const parseModValues = (text: string): number[] => {
          const matches = text.match(/-?\d+(?:\.\d+)?/g);
          return matches ? matches.map(Number) : [];
        };

        if (raw.item.extended) {
          if (raw.item.extended.hashes) {
            const hashes = raw.item.extended.hashes;
            for (const key in hashes) {
              if (Array.isArray(hashes[key])) {
                const modsArray = (raw.item as unknown as Record<string, unknown>)[`${key}Mods`];
                const hashList = hashes[key];
                for (let i = 0; i < hashList.length; i++) {
                  const entry = hashList[i];
                  const statId = entry[0];
                  if (typeof statId !== "string" || !statId) continue;

                  const filterEntry: { id: string; value?: { min?: number; max?: number } } = { id: statId };

                  if (Array.isArray(modsArray) && modsArray[i]) {
                    const modText = modsArray[i] as string;
                    const rolls = parseModValues(modText);
                    if (rolls.length === 1) {
                      filterEntry.value = isUnique
                        ? { min: rolls[0] }
                        : { min: rolls[0], max: rolls[0] };
                    } else if (rolls.length >= 2) {
                      filterEntry.value = isUnique
                        ? { min: rolls[0] }
                        : { min: rolls[0], max: rolls[1] };
                    }
                  }

                  qAnd.filters.push(filterEntry);
                  addedIds.add(statId);
                }
              }
            }
          }

          if (raw.item.extended.mods) {
            const mods = raw.item.extended.mods;
            for (const key in mods) {
              if (Array.isArray(mods[key])) {
                for (const mod of mods[key]) {
                  if (mod.magnitudes) {
                    for (const mag of mod.magnitudes) {
                      if (mag.hash && !addedIds.has(mag.hash)) {
                        const filterEntry: { id: string; value?: { min?: number; max?: number } } = { id: mag.hash };
                        const minVal = parseFloat(mag.min);
                        const maxVal = parseFloat(mag.max);
                        if (!isNaN(minVal) || !isNaN(maxVal)) {
                          filterEntry.value = isUnique
                            ? { min: !isNaN(minVal) ? minVal : undefined }
                            : {
                                min: !isNaN(minVal) ? minVal : undefined,
                                max: !isNaN(maxVal) ? maxVal : undefined
                              };
                        }
                        qAnd.filters.push(filterEntry);
                        addedIds.add(mag.hash);
                      }
                    }
                  }
                }
              }
            }
          }
        }

        // If there's an enabled "item.has_empty_modifier" in props.stats, add it to query.stats
        const emptyMod = props.stats.find(s => s.tradeId[0] === "item.has_empty_modifier" && !s.disabled);
        if (emptyMod) {
          const optionValue = emptyMod.option!.value;
          const targetId = optionValue === ItemHasEmptyModifier.Prefix
            ? "pseudo.pseudo_number_of_empty_prefix_mods"
            : optionValue === ItemHasEmptyModifier.Suffix
              ? "pseudo.pseudo_number_of_empty_suffix_mods"
              : "pseudo.pseudo_number_of_empty_affix_mods";

          const emptyRoll = emptyMod.roll!;
          const sign = emptyRoll.tradeInvert ? -1 : 1;
          const minVal = typeof emptyRoll.min === "number" ? emptyRoll.min * sign : undefined;
          const maxVal = typeof emptyRoll.max === "number" ? emptyRoll.max * sign : undefined;
          const rollValue = !emptyRoll.tradeInvert ? { min: minVal, max: maxVal } : { min: maxVal, max: minVal };

          query.stats.push({
            type: "count",
            value: { min: 1, max: 1 },
            filters: [
              {
                id: targetId,
                value: rollValue
              }
            ]
          });
        }

        const body = {
          query,
          sort: { price: "asc" }
        };

        const exactUrl = `https://${getTradeEndpoint()}/${getTradeEndpointPath()}/search/${getTradeUrlSegment()}${encodeURIComponent(props.filters.trade.league)}?q=${encodeURIComponent(JSON.stringify(body))}`;
        showBrowser(exactUrl);
      },
      // Shift key state and methods
      isShiftPressed,
      ItemCategory,
      isLikelyPriceFixed: computed(() => {
        // if it isn't filling listings it probably is fine
        if (groupedResults.value.length <= 15) {
          return false;
        }
        const commonCurrencyPrices = groupedResults.value.filter((res) => {
          return (
            // is a common currency
            /chaos|exalted|divine/i.test(res.priceCurrency) ||
            // is a common very low value currency (but not enhanced versions)
            res.priceCurrency === "aug" ||
            res.priceCurrency === "regal" ||
            res.priceCurrency === "transmute"
          );
        });
        if (commonCurrencyPrices.length < 5) {
          return true;
        }

        return false;
      }),
    };
  },
});
</script>

<style lang="postcss">
.trade-table-heading {
  @apply sticky top-0;
  @apply bg-gray-800;
  @apply p-0 m-0;
  @apply whitespace-nowrap;

  & > div {
    @apply border-b border-gray-700;
  }
}

.account-status {
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 100%;

  &.instantBuyout {
    /* */
  }

  &.online {
    @apply bg-pink-400;
  }

  &.offline {
    @apply bg-red-600;
  }

  &.afk {
    @apply bg-orange-500;
  }

  &.rank-2 {
    @apply bg-blue-600;
  }

  &.rank-3 {
    @apply bg-yellow-600;
  }
}
</style>
