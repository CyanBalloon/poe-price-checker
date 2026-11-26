<template>
  <div v-if="noUniqueSelection && isStandalone" class="checked-workspace">
    <section class="checked-item-summary" aria-label="Item and market estimate">
      <div class="checked-summary-main">
        <div class="checked-identity" :data-rarity="item.rarity">
          <div class="checked-art">
            <ui-item-img :icon="item.info.icon" :item-name="item.info.refName" :namespace="item.info.namespace" :influences="item.influences" :parsed-item="item" alt="" />
            <item-influence-symbols :influences="item.influences" />
          </div>
          <div class="checked-identity-text">
            <h2>{{ item.rarity === ItemRarity.Rare || item.isFoulborn ? item.name || item.info.name : item.info.name }}</h2>

            <div class="checked-item-meta">
              <span v-if="summaryBase">{{ summaryBase }}</span>
              <span v-else-if="item.rarity">{{ item.rarity }}</span>
              <span v-if="!summaryBase && item.category && String(item.category) !== String(item.rarity)">{{ item.category }}</span>
              <span v-if="item.itemLevel" title="Item level">Item level {{ item.itemLevel }}</span>
              <span v-if="item.gemLevel">Level {{ item.gemLevel }}</span>
              <span v-if="item.quality">{{ item.quality }}% Quality</span>
              <span v-if="item.isCorrupted" class="checked-corrupted">Corrupted</span>
            </div>
          </div>
          <button type="button" class="ui-button checked-paste" @click="$emit('paste-item')">
            <i class="fa-regular fa-clipboard" aria-hidden="true"></i> Paste item
          </button>
        </div>
        <price-trend :item="item" :filters="itemFilters" summary />
      </div>
      <stack-value :filters="itemFilters" :item="item" class="checked-stacks" />
    </section>

    <div v-if="!isListingsDisabled" class="workbench-comparison">
      <section class="checked-filters" aria-label="Search filters">
        <button v-if="compact" class="compact-filter-toggle" type="button" aria-controls="workbench-filters"
          :aria-expanded="compactFiltersOpen" @click="compactFiltersOpen = !compactFiltersOpen">
          <strong>Filters</strong><span v-if="selectedStats">{{ selectedStats }} selected</span>
          <i class="fa-solid" :class="compactFiltersOpen ? 'fa-chevron-up' : 'fa-chevron-down'" aria-hidden="true"></i>
        </button>
        <div id="workbench-filters" v-show="!compact || compactFiltersOpen">
          <filters-block ref="filtersComponent" :filters="itemFilters" :stats="itemStats" :item="item"
            :presets="presets" :rebuild-key="rebuildKey" @preset="selectPreset" @submit="applySearch" />
        </div>
        <button v-if="!compact || compactFiltersOpen || !doSearch" type="button" class="ui-button ui-button--primary checked-search-button" :disabled="doSearch" @click="applySearch">
          {{ appliedFilters ? 'Apply filters' : 'Search listings' }}
        </button>
      </section>
      <section class="checked-results" aria-label="Listing results">
        <header class="workbench-results-head">
          <h2>{{ tradeAPI === 'bulk' ? 'Bulk listings' : 'Trade listings' }}</h2>
          <trade-links v-if="tradeAPI === 'trade'" :get-link="makeTradeLink" />
        </header>
        <template v-if="appliedFilters">
          <trade-listing v-if="tradeAPI === 'trade'" ref="tradeService" :filters="appliedFilters" :stats="appliedStats" :item="item" />
          <trade-bulk v-else ref="tradeService" :filters="appliedFilters" :item="item" />
          <p v-if="!doSearch" class="workbench-status" role="status">Showing listings for the last applied filters.</p>
        </template>
        <p v-else class="workbench-status">Search listings to compare prices for this item.</p>
      </section>
    </div>
    <p v-else class="checked-estimate-only">Use Item Search to look up this item type.</p>
  </div>

  <div v-else-if="noUniqueSelection" class="p-4 layout-column min-h-0 flex-1">
    <!-- <price-prediction v-if="showPredictedPrice" class="mb-4" :item="item" /> -->
    <!-- <price-trend v-else :item="item" :filters="itemFilters" /> -->
    <price-trend :item="item" :filters="itemFilters" />
    <filters-block
      v-if="!isListingsDisabled"
      ref="filtersComponent"
      :filters="itemFilters"
      :stats="itemStats"
      :item="item"
      :presets="presets"
      @preset="selectPreset"
      @submit="doSearch = true"
      :rebuild-key="rebuildKey"
    />
    <div v-if="isListingsDisabled" class="p-4 text-center text-xs text-gray-500">
      Live listings are disabled for this item type. Worth is shown above.
    </div>
    <template v-else>
      <trade-listing
        v-if="tradeAPI === 'trade' && doSearch"
        ref="tradeService"
        :filters="itemFilters"
        :stats="itemStats"
        :item="item"
      />
      <trade-bulk
        v-if="tradeAPI === 'bulk' && doSearch"
        ref="tradeService"
        :filters="itemFilters"
        :item="item"
      />
      <div v-if="!doSearch" class="flex justify-between items-center">
        <div class="flex w-40" @mouseenter="handleSearchMouseenter">
          <button class="btn" @click="doSearch = true" style="min-width: 5rem">
            {{ t("Search") }}
          </button>
        </div>
        <div class="flex flex-row gap-1">
          <trade-links v-if="tradeAPI === 'trade'" :get-link="makeTradeLink" />
        </div>
      </div>
    </template>
    <stack-value :filters="itemFilters" :item="item" />
    <div v-if="showSupportLinks" class="mt-auto border border-dashed p-2">
      <!-- <div class="mb-1">
        {{ t("Support development on") }}
        <a
          href="https://patreon.com/awakened_poe_trade"
          class="inline-flex align-middle animate__animated animate__fadeInRight"
          target="_blank"
          ><img class="inline h-5" src="/images/Patreon.svg"
        /></a>
      </div> -->
      <i18n-t keypath="app.thanks_3rd_party" tag="div">
        <a
          href="https://poe.ninja/support"
          target="_blank"
          class="bg-gray-900 px-1 rounded"
          >poe.ninja</a
        >
      </i18n-t>
    </div>
    <tip v-else-if="showTip" :selected="showTip" />
  </div>


  <transition name="fade">
    <div 
      v-if="hoveredListing && widget.itemHoverTooltip !== 'off'" 
      :class="[
        'fixed z-[100] bg-[var(--surface)] rounded-lg shadow-2xl p-3 pointer-events-none max-w-sm backdrop-blur-md',
        hoveredListing.mouseY < screenHeight / 2 ? 'bottom-6 left-1/2 -translate-x-1/2' : 'top-6 left-1/2 -translate-x-1/2'
      ]"
    >
      <div class="overflow-auto">
        <tooltip-item :result="hoveredListing.res" />
      </div>
    </div>
  </transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

<script lang="ts">
import { getCategoryToTradeId } from "./trade/trade-constants";
import {
  defineComponent,
  PropType,
  watch,
  ref,
  shallowRef,
  nextTick,
  computed,
  ComponentPublicInstance,
  provide,
  onMounted,
  onUnmounted,
} from "vue";
import { useMediaQuery } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import { ItemRarity, ItemCategory, ParsedItem } from "@/parser";
import TradeListing from "./trade/TradeListing.vue";
import TradeBulk from "./trade/TradeBulk.vue";
import TradeLinks from "./trade/TradeLinks.vue";
import { apiToSatisfySearch, getTradeEndpoint, getTradeEndpointPath, getTradeUrlSegment } from "./trade/common";
import PriceTrend from "./trends/PriceTrend.vue";
import FiltersBlock from "./filters/FiltersBlock.vue";
import { createPresets } from "./filters/create-presets";
import PricePrediction from "./price-prediction/PricePrediction.vue";
import StackValue from "./stack-value/StackValue.vue";
import Tip from "../help/Tip.vue";
import TooltipItem from "./trade/TooltipItem.vue";
import {
  createTradeRequest,
  PricingResult,
} from "./trade/pathofexile-trade";
import { AppConfig, TipsFrequency } from "@/web/Config";
import { FilterPreset, ItemFilters, StatFilter } from "./filters/interfaces";
import { PriceCheckWidget } from "../overlay/interfaces";
import { useLeagues } from "@/web/background/Leagues";
import { randomTip, TIP_FREQUENCY_MAP } from "../help/tips";
import UiItemImg from "@/web/ui/UiItemImg.vue";
import ItemInfluenceSymbols from "@/web/ui/ItemInfluenceSymbols.vue";

let _showSupportLinksCounter = 0;
let _showTipCounter = 15;

export default defineComponent({
  name: "CheckedItem",
  emits: ["item-editor-selection", "paste-item"],
  components: {
    PricePrediction,
    TradeListing,
    TradeBulk,
    TradeLinks,
    PriceTrend,
    UiItemImg,
    ItemInfluenceSymbols,
    FiltersBlock,

    StackValue,
    Tip,
    TooltipItem,
  },
  props: {
    item: {
      type: Object as PropType<ParsedItem>,
      required: true,
    },
    advancedCheck: {
      type: Boolean,
      required: true,
    },
    rebuildKey: {
      type: Number,
      required: true,
    },
  },
  setup(props, ctx) {
    const widget = computed(() => AppConfig<PriceCheckWidget>("price-check")!);
    const hoveredListing = ref<{ res: PricingResult; mouseY: number } | null>(null);
    provide("hovered-listing", hoveredListing);

    const screenHeight = ref(window.innerHeight);
    function handleResize() {
      screenHeight.value = window.innerHeight;
    }
    const isLineageSupport = computed(() => {
      return props.item.category === ItemCategory.Gem && (props.item.info.icon?.includes('/Lineage') ?? false);
    });

    const isListingsDisabled = computed(() => {
      return AppConfig().game === "poe2" && (
        props.item.category === ItemCategory.Currency ||
        isLineageSupport.value ||
        props.item.info.tradeTag != null
      );
    });

    onMounted(() => {
      window.addEventListener("resize", handleResize);
    });
    onUnmounted(() => {
      window.removeEventListener("resize", handleResize);
    });

    const leagues = useLeagues();
    const isStandalone = computed(() => {
      const params = new URLSearchParams(window.location.search);
      return params.get("mode") === "standalone";
    });

    const presets = ref<{ active: string; presets: FilterPreset[] }>(null!);
    const itemFilters = computed(
      () =>
        presets.value.presets.find(
          (preset) => preset.id === presets.value.active,
        )!.filters,
    );
    const itemStats = computed(
      () =>
        presets.value.presets.find(
          (preset) => preset.id === presets.value.active,
        )!.stats,
    );
    const compact = useMediaQuery("(max-width: 49rem)");
    const compactFiltersOpen = ref(false);
    const selectedStats = computed(() => itemStats.value.filter(stat => !stat.disabled).length);
    const appliedFilters = shallowRef<ItemFilters | null>(null);
    const appliedStats = shallowRef<StatFilter[]>([]);
    function applySearch() {
      doSearch.value = true;
    }

    const summaryBase = computed(() => {
      const { item } = props;
      const base = item.baseType || item.info.unique?.base;
      return base !== item.info.name ? base : undefined;
    });
    const doSearch = ref(false);
    const tradeAPI = ref<"trade" | "bulk">("bulk");

    // TradeListing.vue OR TradeBulk.vue
    const tradeService = ref<{ execSearch(): void } | null>(null);
    // FiltersBlock.vue
    const filtersComponent = ref<ComponentPublicInstance>(null!);

    watch(
      () => props.item,
      (item, prevItem) => {
        performance.mark("checked-item-item-changed");
        compactFiltersOpen.value = false;
        hoveredListing.value = null;
        appliedFilters.value = null;
        appliedStats.value = [];
        const prevCurrency =
          presets.value != null ? itemFilters.value.trade.currency : undefined;
        const prevListingType =
          presets.value != null
            ? itemFilters.value.trade.listingType
            : undefined;

        presets.value = createPresets(item, {
          includeSourceModifiers: true,
          league: leagues.selectedId.value!,
          collapseListings: widget.value.collapseListings,
          activateStockFilter: widget.value.activateStockFilter,
          searchStatRange: widget.value.searchStatRange,
          useEn:
            (AppConfig().language === "cmn-Hant" &&
              AppConfig().realm === "pc-ggg") ||
            AppConfig().preferredTradeSite === "www",
          currency:
            widget.value.rememberCurrency ||
            (prevItem &&
              item.info.namespace === prevItem.info.namespace &&
              item.info.refName === prevItem.info.refName)
              ? prevCurrency
              : undefined,
          listingType: widget.value.rememberListingType
            ? prevListingType
            : undefined,
          defaultAllSelected: widget.value.defaultAllSelected,
          autoFillEmptyAugmentSockets: widget.value.autoFillEmptyRuneSockets,
        });

        if (
          (!props.advancedCheck && !widget.value.smartInitialSearch) ||
          (props.advancedCheck && !widget.value.lockedInitialSearch)
        ) {
          doSearch.value = false;
        } else {
          doSearch.value = Boolean(
            item.rarity === ItemRarity.Unique ||
              item.category === ItemCategory.Map ||
              item.category === ItemCategory.HeistBlueprint ||
              item.category === ItemCategory.SanctumRelic ||
              item.category === ItemCategory.Charm ||
              !getCategoryToTradeId().has(item.category!) ||
              item.isUnidentified ||
              item.isVeiled ||
              (item.rarity === ItemRarity.Magic && presets.value.active === "filters.preset_base_item")
          );
        }

        tradeAPI.value = apiToSatisfySearch(
          props.item,
          itemStats.value,
          itemFilters.value,
        );

        if (tradeAPI.value === "bulk") {
          itemFilters.value.trade.listingType = "online";
        }

        performance.mark("checked-item-switch-item-end");
      },
      { immediate: true },
    );

    watch(
      () => [props.item, doSearch.value],
      () => {
        if (doSearch.value === false) return;

        tradeAPI.value = apiToSatisfySearch(
          props.item,
          itemStats.value,
          itemFilters.value,
        );

        if (isStandalone.value && !isListingsDisabled.value) {
          // Keep the displayed query independent of edits until the user applies them.
          const filters: ItemFilters = JSON.parse(JSON.stringify(itemFilters.value));
          filters.trade = itemFilters.value.trade;
          appliedFilters.value = filters;
          appliedStats.value = JSON.parse(JSON.stringify(itemStats.value));
        }

        // NOTE: child `trade-xxx` component renders/receives props on nextTick
        nextTick(() => {
          if (tradeService.value) {
            tradeService.value.execSearch();
          }
        });
      },
      { deep: false, immediate: true },
    );

    let previousItem = props.item;
    watch(
      () => {
        const criteria = { ...itemFilters.value, trade: undefined };
        return [itemStats.value, criteria];
      },
      () => {
        if (props.item === previousItem) doSearch.value = false;
        previousItem = props.item;
      },
      { deep: true },
    );

    // Availability, league, and currency refine the displayed results independently of draft modifiers.
    watch(
      () => [props.item, JSON.stringify((appliedFilters.value ?? itemFilters.value).trade)] as const,
      ([item, trade], [oldItem, oldTrade]) => {
        if (item !== oldItem || trade === oldTrade) return;
        if (tradeService.value) tradeService.value.execSearch();
        else doSearch.value = true;
      },
    );

    const noUniqueSelection = computed(() => {
      return true;
    });

    function handleSearchMouseenter(e: MouseEvent) {
      if (
        (filtersComponent.value.$el as HTMLElement).contains(
          e.relatedTarget as HTMLElement,
        )
      ) {
        doSearch.value = true;

        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }
    }

    const showSupportLinks = ref(false);
    const showTip = ref(0);
    watch(
      () => [props.item, doSearch.value],
      ([cItem, cInteracted], [pItem]) => {
        if (
          _showSupportLinksCounter >= 13 &&
          (!cInteracted || tradeAPI.value === "bulk")
        ) {
          showSupportLinks.value = true;
          _showSupportLinksCounter = 0;
        } else {
          showSupportLinks.value = false;
          if (
            AppConfig().tipsFrequency !== TipsFrequency.Never &&
            (AppConfig().tipsFrequency === TipsFrequency.Always ||
              _showTipCounter >=
                TIP_FREQUENCY_MAP[AppConfig().tipsFrequency]) &&
            !cInteracted
          ) {
            _showTipCounter = 0;
            showTip.value = randomTip();
          } else {
            showTip.value = 0;
            if (cItem !== pItem) {
              _showTipCounter += 1;
            }
          }

          if (cItem !== pItem) {
            _showSupportLinksCounter += 1;
          }
        }
      },
    );

    watch(
      () => itemFilters.value.itemEditorSelection,
      (val) => {
        ctx.emit("item-editor-selection", val);
      },
      { deep: true },
    );

    const { t } = useI18n();

    return {
      t,
      isStandalone,
      isListingsDisabled,
      ItemCategory,
      itemFilters,
      itemStats,
      doSearch,
      tradeAPI,
      tradeService,
      filtersComponent,
      showTip,
      noUniqueSelection,
      handleSearchMouseenter,
      showSupportLinks,
      compact,
      compactFiltersOpen,
      selectedStats,
      appliedFilters,
      appliedStats,
      applySearch,
      summaryBase,
      ItemRarity,
      hoveredListing,
      screenHeight,
      widget,
      presets: computed(() =>
        presets.value.presets.map((preset) => ({
          id: preset.id,
          active: preset.id === presets.value.active,
        })),
      ),
      selectPreset(id: string) {
        presets.value.active = id;
      },
      makeTradeLink() {
        const filters = appliedFilters.value ?? itemFilters.value;
        const stats = appliedFilters.value ? appliedStats.value : itemStats.value;
        return `https://${getTradeEndpoint()}/${getTradeEndpointPath()}/search/${getTradeUrlSegment()}${encodeURIComponent(filters.trade.league)}?q=${encodeURIComponent(JSON.stringify(createTradeRequest(filters, stats, props.item)))}`;
      },
    };
  },
});
</script>

<style scoped>
.checked-workspace {
  --workbench-columns: minmax(0, 1fr) minmax(0, 1.08fr);
  --workbench-gap: clamp(1.7rem, 3.7vw, 3.6rem);
  display: grid; gap: clamp(1.35rem, 2.2vw, 2rem);
}
.checked-item-summary { min-width: 0; }
.checked-summary-main { display: grid; grid-template-columns: var(--workbench-columns); align-items: center; gap: 1.2rem var(--workbench-gap); }
.checked-identity { container: identity / inline-size; display: grid; grid-template-columns: fit-content(32%) minmax(0, 1fr) auto; align-items: center; gap: .6rem clamp(.75rem, 1.4vw, 1.3rem); min-width: 0; }
.checked-art { min-width: 0; max-width: 100%; overflow: auto; }
.checked-identity-text { min-width: 0; overflow-wrap: anywhere; }
.checked-identity h2 { color: var(--ink); font: 500 clamp(1.8rem, 3.4vw, 3rem)/1.1 var(--display); letter-spacing: -0.02em; }
.checked-item-meta { display: flex; flex-wrap: wrap; gap: 0.35rem 0.7rem; margin-top: 0.4rem; color: var(--muted); font-size: 1rem; }
.checked-item-meta span + span::before { margin-right: 0.7rem; color: var(--quiet); content: "·"; }
.checked-corrupted { color: var(--danger); }
.trade-app .checked-paste { justify-self: end; white-space: nowrap; border: 1px solid #7e8b925e; color: var(--muted); }
.trade-app .checked-paste:hover { border-color: var(--accent); color: var(--ink); }
.checked-stacks { margin-top: 1rem; }
.workbench-comparison { display: grid; grid-template-columns: var(--workbench-columns); align-items: start; gap: var(--workbench-gap); }
.compact-filter-toggle { width: 100%; display: flex; align-items: center; gap: 0.6rem; min-height: 2.8rem; color: var(--ink); }
.compact-filter-toggle span, .compact-filter-toggle i { color: var(--muted); font-size: 0.8rem; }
.compact-filter-toggle i { margin-left: auto; }
.checked-filters, .checked-results { min-width: 0; }
.checked-results { container: listing-panel / inline-size; }
.workbench-results-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 0.5rem; }
.workbench-results-head h2 { font: 500 clamp(1.55rem, 2.4vw, 2.15rem)/1.25 var(--display); }
.trade-app .checked-search-button { width: 100%; min-height: 2.65rem; margin-top: .68rem; border: 1px solid #4e97a3; background: #195563; color: #effcfe; font-size: .91rem; }
.trade-app .checked-search-button:enabled:hover { background: #206d79; color: #fff; }
.trade-app .checked-search-button:disabled { border-color: #36545b; background: #233a41; color: #a5b7bb; opacity: 1; }
.workbench-status, .checked-estimate-only { color: var(--muted); margin-block: 0.8rem; }
@container identity (max-width: 27rem) {
  .checked-art { grid-row: 1 / span 2; }
  .checked-identity-text, .trade-app .checked-paste { grid-column: 2 / -1; }
  .trade-app .checked-paste { justify-self: start; }
}
@media (max-width: 49rem) {
  .checked-workspace { --workbench-columns: minmax(0, 1fr); --workbench-gap: 2rem; }
}
</style>
