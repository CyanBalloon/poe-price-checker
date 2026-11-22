<template>
  <div v-if="isStandalone" class="w-full h-full flex flex-col text-gray-200 pointer-events-auto bg-transparent">
    <div class="grow layout-column min-h-0">
      <button v-if="item?.isErr() || showUnidentifiedResolver || !isLeagueSelected" type="button" class="ui-button self-start" @click="$emit('paste-item')">Paste item</button>
      <template v-if="item?.isErr()">
        <ui-error-box class="m-4">
          <template #name>{{ t(item.error.name) }}</template>
          <template #actions>
            <reload-trade-data :item-text="item.error.rawText" :pos="checkPosition" />
          </template>
          <p>{{ t(item.error.message) }}</p>
        </ui-error-box>
        <details class="ui-surface p-3">
          <summary class="cursor-pointer text-[var(--muted)]">Copied item text</summary>
          <pre class="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs">{{ item.error.rawText }}</pre>
        </details>
      </template>
      <template v-else-if="item?.isOk()">
        <unidentified-resolver
          :item="item.value"
          @identify="handleIdentification($event)"
        />
        <background-info v-if="!isLeagueSelected" />
        <checked-item
          v-else-if="!showUnidentifiedResolver"
          :key="leagueId"
          :item="item.value"
          :advanced-check="advancedCheck"
          :rebuild-key="rebuildKey"
          @paste-item="$emit('paste-item')"
          @item-editor-selection="handleItemEditorSelection"
        />
      </template>
    </div>
  </div>
  <div
    v-else
    style="top: 0; left: 0; height: 100%; width: 100%; position: absolute"
    class="flex grow h-full pointer-events-none"
    :class="{
      'flex-row': clickPosition === 'stash',
      'flex-row-reverse': clickPosition === 'inventory',
    }"
  >
    <div
      v-if="!isBrowserShown"
      class="layout-column shrink-0"
      style="width: var(--game-panel)"
    >
      <div
        class="flex"
        :class="{
          'flex-row': clickPosition === 'inventory',
          'flex-row-reverse': clickPosition === 'stash',
        }"
      >
        <item-editor
          v-if="itemEditorAvailable && !openItemEditorAbove && item?.isOk()"
          class="pointer-events-auto"
          :item="item.value"
          :click-position="clickPosition"
          :item-editor-options="itemEditorOptions"
        />
      </div>
    </div>
    <div
      id="price-window"
      class="layout-column shrink-0 text-gray-200 pointer-events-auto"
      style="width: 28.75rem"
    >
      <item-editor
        v-if="
          itemEditorAvailable &&
          (isBrowserShown || openItemEditorAbove) &&
          item?.isOk()
        "
        class="pointer-events-auto"
        :item="item.value"
        :click-position="clickPosition"
        :item-editor-options="itemEditorOptions"
      />
      <AppTitleBar
        @close="closePriceCheck"
        @click="openLeagueSelection"
        :title="title"
      >
        <div class="flex items-center gap-x-2 pl-2">
          <ui-popover
            v-if="stableOrbCost && xchgRateCurrency?.id"
            trigger="click"
            boundary="#price-window"
          >
            <template #target>
              <button class="flex items-center gap-x-1">
                <i class="fas fa-exchange-alt text-gray-500" /> {{ stableOrbCost }}
              </button>
            </template>
            <template #content>
              <item-quick-price
                class="text-base"
                :price="{
                  min: stableOrbCost,
                  max: stableOrbCost,
                  currency: xchgRateCurrency.id,
                }"
                :item-img="currencyIcon('divine')"
              />
              <div v-for="i in 9" :key="i">
                <div class="pl-1">
                  {{ i / 10 }} div ⇒ {{ Math.round((stableOrbCost * i) / 10) }}
                  {{ xchgRateCurrency.abbrev }}
                </div>
              </div>
            </template>
          </ui-popover>

          <div v-if="!isPoe1 && chaosToExalt" class="flex items-center gap-x-1 text-gray-500 text-[11px] cursor-default" title="Chaos to Exalt ratio">
            <img :src="currencyIcon('chaos')" class="w-5 h-5 object-contain" />
            <i class="fas fa-arrow-right text-[8px] text-gray-600" />
            <span class="text-gray-400 font-semibold">{{ chaosToExalt.toFixed(1) }}</span>
            <img :src="currencyIcon('exalted')" class="w-5 h-5 object-contain" />
          </div>
          <div v-else-if="isPoe1 && chaosToDivine" class="flex items-center gap-x-1 text-gray-500 text-[11px] cursor-default" title="Chaos Orbs per Divine Orb">
            <img :src="currencyIcon('divine')" class="w-5 h-5 object-contain" />
            <i class="fas fa-arrow-right text-[8px] text-gray-600" />
            <span class="text-gray-400 font-semibold">{{ chaosToDivine.toFixed(1) }}</span>
            <img :src="currencyIcon('chaos')" class="w-5 h-5 object-contain" />
          </div>

          <div v-if="!isPoe1 && annulToExalt" class="flex items-center gap-x-1 text-gray-500 text-[11px] cursor-default" title="Annulment to Exalt ratio">
            <img :src="currencyIcon('annul')" class="w-5 h-5 object-contain" />
            <i class="fas fa-arrow-right text-[8px] text-gray-600" />
            <span class="text-gray-400 font-semibold">{{ annulToExalt.toFixed(1) }}</span>
            <img :src="currencyIcon('exalted')" class="w-5 h-5 object-contain" />
          </div>
          <div v-else-if="isPoe1 && annulInChaos" class="flex items-center gap-x-1 text-gray-500 text-[11px] cursor-default" title="Chaos Orbs per Orb of Annulment">
            <img :src="currencyIcon('annul')" class="w-5 h-5 object-contain" />
            <i class="fas fa-arrow-right text-[8px] text-gray-600" />
            <span class="text-gray-400 font-semibold">{{ annulInChaos.toFixed(1) }}</span>
            <img :src="currencyIcon('chaos')" class="w-5 h-5 object-contain" />
          </div>

          <i v-else-if="xchgRateLoading()" class="fas fa-dna fa-spin px-2 text-xs" />
        </div>
      </AppTitleBar>
      <div class="grow layout-column min-h-0 bg-gray-800">
        <background-info />
        <check-position-circle
          v-if="showCheckPos"
          :position="checkPosition"
          style="z-index: -1"
        />
        <template v-if="item?.isErr()">
          <ui-error-box class="m-4">
            <template #name>{{ t(item.error.name) }}</template>
            <template #actions
              ><reload-trade-data
                :item-text="item.error.rawText"
                :pos="checkPosition"
            /></template>
            <p>{{ t(item.error.message) }}</p>
          </ui-error-box>
          <pre class="bg-gray-900 rounded m-4 overflow-x-hidden p-2">{{
            item.error.rawText
          }}</pre>
        </template>
        <template v-else-if="item?.isOk()">
          <unidentified-resolver
            :item="item.value"
            @identify="handleIdentification($event)"
          />
          <checked-item
            v-if="isLeagueSelected && !showUnidentifiedResolver"
            :item="item.value"
            :advanced-check="advancedCheck"
            :rebuild-key="rebuildKey"
            @item-editor-selection="handleItemEditorSelection"
          />
        </template>

      </div>
    </div>
    <webview
      v-if="isBrowserShown"
      ref="iframeEl"
      class="pointer-events-auto flex-1"
      width="100%"
      height="100%"
    />
    <div v-else class="layout-column flex-1 min-w-0">
      <div
        class="flex"
        :class="{
          'flex-row': clickPosition === 'stash',
          'flex-row-reverse': clickPosition === 'inventory',
        }"
      >
        <related-items
          v-if="item?.isOk()"
          class="pointer-events-auto"
          :item="item.value"
          :click-position="clickPosition"
        />
        <rate-limiter-state class="pointer-events-auto" />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import {
  defineComponent,
  inject,
  PropType,
  shallowRef,
  watch,
  computed,
  nextTick,
  provide,
  ref,
} from "vue";
import { Result, ok, err } from "neverthrow";
import { useI18n } from "vue-i18n";
import UiErrorBox from "@/web/ui/UiErrorBox.vue";
import UiPopover from "@/web/ui/Popover.vue";
import CheckedItem from "./CheckedItem.vue";
import BackgroundInfo from "./BackgroundInfo.vue";
import { MainProcess, Host } from "@/web/background/IPC";
import { usePoeninja } from "../background/Prices";
import { useLeagues } from "@/web/background/Leagues";
import { AppConfig } from "@/web/Config";
import { ItemCategory, ItemRarity, parseClipboard, ParsedItem } from "@/parser";
import RelatedItems from "./related-items/RelatedItems.vue";
import { selectGame } from "@/web/background/Game";
import RateLimiterState from "./trade/RateLimiterState.vue";
import UnidentifiedResolver from "./unidentified-resolver/UnidentifiedResolver.vue";
import CheckPositionCircle from "./CheckPositionCircle.vue";
import AppTitleBar from "@/web/ui/AppTitlebar.vue";
import ItemQuickPrice from "@/web/ui/ItemQuickPrice.vue";
import {
  PriceCheckWidget,
  WidgetManager,
  WidgetSpec,
} from "../overlay/interfaces";
import ItemEditor from "./filters/ItemEditor.vue";
import {
  loadUltraLateItems,
  setLocalAugmentFilter,
} from "@/assets/data";
import { ItemEditorType } from "@/parser/meta";
import { getItemEditorType } from "./filters/util";
import ReloadTradeData from "./fallback/ReloadTradeData.vue";
import { currencyIcon } from "@/web/ui/currency-icons";

type ParseError = {
  name: string;
  message: string;
  rawText: ParsedItem["rawText"];
};

export default defineComponent({
  emits: ["paste-item"],
  widget: {
    type: "price-check",
    instances: "single",
    initInstance: (): PriceCheckWidget => {
      return {
        wmId: 0,
        wmType: "price-check",
        wmTitle: "",
        wmWants: "hide",
        wmZorder: "exclusive",
        wmFlags: ["hide-on-blur", "menu::skip"],
        showRateLimitState: false,
        apiLatencySeconds: 2,
        collapseListings: "api",
        smartInitialSearch: true,
        lockedInitialSearch: true,
        activateStockFilter: false,
        builtinBrowser: false,
        hotkey: "D",
        hotkeyHold: "Ctrl",
        hotkeyLocked: "Ctrl + Alt + D",
        showSeller: false,
        searchStatRange: 10,
        showCursor: true,
        requestPricePrediction: false,
        rememberCurrency: false,
        // New Settings EE2
        defaultAllSelected: false,
        itemHoverTooltip: "keybind",
        autoFillEmptyRuneSockets: false,
        alwaysShowTier: false,
        openItemEditorAbove: false,
        coreCurrency: "exalted",
        currencyVolume: "both",
        rememberListingType: false,
      };
    },
  } satisfies WidgetSpec,
  components: {
    AppTitleBar,
    CheckedItem,
    UnidentifiedResolver,
    BackgroundInfo,
    RelatedItems,
    ItemEditor,
    RateLimiterState,
    CheckPositionCircle,
    ItemQuickPrice,
    UiErrorBox,
    UiPopover,
    ReloadTradeData,
  },
  props: {
    config: {
      type: Object as PropType<PriceCheckWidget>,
      required: true,
    },
  },
  setup(props) {
    const leagueId = computed(() => AppConfig().leagueId);

    watch(
      // FIXME: check if this is working as intended
      () => leagueId.value,
      () => {
        const augmentFilter = () => true;
        setLocalAugmentFilter(augmentFilter);
        loadUltraLateItems(augmentFilter);
      },
      { immediate: true },
    );

    const wm = inject<WidgetManager>("wm")!;
    const isStandalone = computed(() => {
      const params = new URLSearchParams(window.location.search);
      return params.get("mode") === "standalone";
    });
    const {
      xchgRate,
      xchgRateCurrency,
      initialLoading: xchgRateLoading,
      queuePricesFetch,
      chaosToExalt,
      annulToExalt,
      chaosToDivine,
      annulInChaos,
    } = usePoeninja();

    nextTick(() => {
      props.config.wmWants = "hide";
      props.config.wmFlags = ["hide-on-blur", "menu::skip"];
    });

    const item = shallowRef<null | Result<ParsedItem, ParseError>>(null);
    watch(() => AppConfig().game, () => {
      item.value = null;
      wm.hide(props.config.wmId);
    });
    const rebuildKey = shallowRef(2);
    const advancedCheck = shallowRef(false);
    const checkPosition = shallowRef({ x: 1, y: 1 });
    const itemEditorOptions = ref<
      { editing: boolean; value: string; disabled: boolean } | undefined
    >({
      editing: false,
      value: "None",
      disabled: true,
    });

    MainProcess.onEvent("MAIN->CLIENT::item-text", async (e) => {
      if (e.target !== "price-check") return;
      if (isStandalone.value && !(e as { isManual?: boolean }).isManual) return;
      performance.mark("price-check-event");

      if (e.activeGame && !await selectGame(e.activeGame)) return;

      const parsedTemp = e.item ? ok(e.item as ParsedItem) : parseClipboard(e.clipboard);
      if (parsedTemp.isOk()) {
        const itemTemp = parsedTemp.value;
        const isLineageSupport = itemTemp.category === ItemCategory.Gem && (itemTemp.info.icon?.includes('/Lineage') ?? false);
        const isUnidentifiedUnique = itemTemp.isUnidentified && itemTemp.rarity === ItemRarity.Unique;
        const isListingsDisabled = 
          (itemTemp.category === ItemCategory.Currency ||
          isLineageSupport ||
          itemTemp.info.tradeTag != null) && !isUnidentifiedUnique;

        if (AppConfig().game === "poe2" && isListingsDisabled && !isStandalone.value) {
          const searchWidget = wm.widgets.value.find(w => w.wmType === 'item-search');
          if (searchWidget) {
            wm.show(searchWidget.wmId);
            nextTick(() => {
              window.dispatchEvent(new CustomEvent("add-search-item", { detail: itemTemp }));
            });
            wm.hide(props.config.wmId);
            return;
          }
        }
      }

      if (Host.isElectron && !e.focusOverlay && !isStandalone.value) {
        // everything in CSS pixels
        // Tracking area removed as overlay mode is deprecated
      }
      closeBrowser();
      wm.show(props.config.wmId);
      checkPosition.value = e.position;
      advancedCheck.value = e.focusOverlay;
      performance.mark("price-check-start-handling-item");
      item.value = handleItemPaste({
        clipboard: e.clipboard,
        item: e.item as ParsedItem,
      });

      if (item.value.isOk()) {
        queuePricesFetch();
      }
      performance.mark("price-check-event-end");
    });

    function handleItemPaste(e: { clipboard: string; item: ParsedItem }) {
      const newItem = (e.item ? ok(e.item) : parseClipboard(e.clipboard))
        .andThen((item) =>
          AppConfig().game === "poe2" &&
          item.rarity !== ItemRarity.Unique &&
          (item.category === ItemCategory.HeistContract || item.category === ItemCategory.Sentinel)
            ? err("item.unknown")
            : ok(item),
        )
        .mapErr((err) => ({
          name: `${err}`,
          message: `${err}_help`,
          rawText: e.clipboard + "\n\nDEBUG INFO: " + String(err),
        }));
      performance.mark("price-check-parse-end");
      return newItem;
    }

    function handleIdentification(identified: ParsedItem) {
      item.value = ok(identified);
    }

    watch(
      () => props.config.wmWants,
      (state) => {
        if (state === "hide") {
          closeBrowser();
        }
      },
    );

    const leagues = useLeagues();
    const title = computed(
      () => leagues.selectedId.value || "PoE Price Checker",
    );
    const stableOrbCost = computed(() =>
      xchgRate.value ? Math.round(xchgRate.value) : null,
    );
    const isBrowserShown = computed(() =>
      props.config.wmFlags.includes("has-browser"),
    );
    const showCheckPos = computed(
      () => wm.active.value && props.config.showCursor,
    );
    const isLeagueSelected = computed(() => Boolean(leagues.selectedId.value));
    const clickPosition = computed(() => {
      if (isBrowserShown.value) {
        return "inventory";
      } else {
        return checkPosition.value.x > window.screenX + window.innerWidth / 2
          ? "inventory"
          : "stash";
        // or {chat, vendor, center of screen}
      }
    });

    watch(isBrowserShown, (isShown) => {
      if (isShown) {
        wm.setFlag(props.config.wmId, "hide-on-blur", false);
        wm.setFlag(props.config.wmId, "invisible-on-blur", true);
      } else {
        wm.setFlag(props.config.wmId, "invisible-on-blur", false);
        wm.setFlag(props.config.wmId, "hide-on-blur", true);
      }
    });

    function closePriceCheck() {
      wm.hide(props.config.wmId);
    }

    function openLeagueSelection() {
      const settings = wm.widgets.value.find((w) => w.wmType === "settings")!;
      wm.setFlag(settings.wmId, `settings::widget=${props.config.wmId}`, true);
      wm.show(settings.wmId);
    }

    const iframeEl = shallowRef<HTMLIFrameElement | null>(null);

    function showBrowser(url: string) {
      if (isStandalone.value || !iframeEl.value) {
        window.open(url, "_blank");
        return;
      }
      wm.setFlag(props.config.wmId, "has-browser", true);
      nextTick(() => {
        if (iframeEl.value) {
          iframeEl.value.src = url;
        }
      });
    }

    function closeBrowser() {
      wm.setFlag(props.config.wmId, "has-browser", false);
    }

    provide<(url: string) => void>("builtin-browser", showBrowser);

    const { t } = useI18n();

    return {
      currencyIcon,
      t,
      isPoe1: computed(() => AppConfig().game === "poe1"),
      isStandalone,
      clickPosition,
      isBrowserShown,
      iframeEl,
      closePriceCheck,
      title,
      stableOrbCost,
      xchgRateCurrency,
      xchgRateLoading,
      chaosToExalt,
      annulToExalt,
      chaosToDivine,
      annulInChaos,
      showCheckPos,
      checkPosition,
      item,
      advancedCheck,
      handleIdentification,
      isLeagueSelected,
      leagueId,
      openLeagueSelection,
      rebuildKey,
      showUnidentifiedResolver: computed(() => {
        if (!item.value?.isOk()) return false;
        const parsed = item.value.value;
        return parsed.rarity === ItemRarity.Unique && parsed.isUnidentified && !parsed.info.unique;
      }),
      itemEditorAvailable: computed(() => {
        if (!item.value?.isOk()) return false;
        return getItemEditorType(item.value.value) !== ItemEditorType.None;
      }),
      handleItemEditorSelection: (
        val:
          | {
              editing: boolean;
              value: string;
              disabled: boolean;
            }
          | undefined,
      ) => (itemEditorOptions.value = val),
      itemEditorOptions,
      openItemEditorAbove: computed(() => props.config.openItemEditorAbove),
    };
  },
});
</script>
