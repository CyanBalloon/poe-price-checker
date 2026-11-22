<template>
  <div class="trade-app trade-shell" :data-game="gameMode" :class="{ 'trade-app--ember': emberTheme }">
    <div class="trade-workspace">
      <header class="trade-toolbar">
        <div class="trade-brand"><span>PoE </span>Price Checker</div>
        <nav class="trade-navigation" aria-label="Workspace">
          <button v-for="tab in tabs" :key="tab.id" type="button" class="trade-nav-button"
            :aria-current="activeTab === tab.id ? 'page' : undefined" :aria-label="tab.name" @click="activeTab = tab.id">{{ tab.name }}</button>
        </nav>
        <div class="toolbar-market">
          <div class="trade-context">
            <select aria-label="Game" title="Game" :value="gameMode" @change="changeGame">
              <option v-for="game in games" :key="game.id" :value="game.id">{{ game.label }}</option>
            </select>
            <select v-model="selectedLeague" :disabled="leagueLoading || !tradeLeagues.length" aria-label="League" title="League">
              <option value="" disabled>{{ leagueLoading ? 'Loading leagues…' : 'Select league' }}</option>
              <option v-if="unlistedLeague" :value="selectedLeague">{{ selectedLeague }}</option>
              <option v-for="league in tradeLeagues" :key="league.id" :value="league.id">{{ league.text }}</option>
            </select>
            <button v-if="leagueError" type="button" class="ui-icon-button" aria-label="Retry loading leagues" @click="reloadLeagues()">
              <i class="fa-solid fa-rotate-right" aria-hidden="true"></i>
            </button>
          </div>
          <div class="toolbar-quote" :title="divineQuote ? '1 Divine Orb ≈ ' + divineQuote.amount + ' ' + divineQuote.currency : 'Divine Orb exchange rate for the selected league'">
            <span class="sr-only">Exchange rate</span>
            <span v-if="divineQuote" class="toolbar-quote-value">
              1 <img :src="currencyIcon('divine')" alt="Divine Orb" />
              <span class="quote-equals">≈</span>
              {{ divineQuote.amount }} <img :src="divineQuote.icon" :alt="divineQuote.currency" />
            </span>
            <span v-else class="toolbar-quote-status">{{ isNinjaLoading ? 'Loading rate…' : 'Rate unavailable' }}</span>
          </div>
        </div>
        <div class="toolbar-actions">
          <button v-if="isElectron" type="button" class="trade-account" :title="isLoggedIn ? 'Sign out of Path of Exile' : 'Sign in to Path of Exile'" @click="handleLoginClick">
            <i class="fa-regular fa-user" aria-hidden="true"></i>
            <span>{{ isLoggedIn ? 'Sign out' : 'Sign in' }}</span>
          </button>
          <button type="button" class="trade-settings-button" title="Settings" aria-label="Settings"
            :aria-current="activeTab === 'settings' ? 'page' : undefined" @click="activeTab = 'settings'">
            <i class="fa-solid fa-gear" aria-hidden="true"></i>
          </button>
        </div>
      </header>

      <p v-if="gameSwitchError" role="alert" class="ui-alert trade-alert">{{ gameSwitchError }}</p>
      <p v-else-if="leagueError" role="alert" class="ui-alert trade-alert">Couldn’t load leagues. Use the retry button beside the league selector.</p>

      <main class="trade-main" :class="{
        'trade-main--welcome': activeTab === 'price-check' && showWelcome,
        'trade-main--price-check': activeTab === 'price-check' && hasActivePriceCheck,
        'trade-main--item-search': activeTab === 'search',
      }">
        <section v-show="activeTab === 'price-check'" class="trade-view trade-price" :class="{ 'trade-price--welcome': showWelcome }" aria-label="Price Check">
          <div v-if="showWelcome" class="watch-welcome">
            <div class="watch-coast" aria-hidden="true"></div>
            <div class="watch-copy">
              <h1>Welcome back, exile.</h1>
              <p>Copy an item in {{ gameMode === 'poe1' ? 'Path of Exile' : 'Path of Exile 2' }} to check its price.</p>
              <button v-if="isPasteCollapsed" type="button" class="ui-button watch-paste" @click="pasteWelcomeItem">
                <i class="fa-regular fa-clipboard" aria-hidden="true"></i> Paste item
              </button>
              <small v-if="priceCheckHotkey !== 'None'">In game <kbd class="ui-kbd">{{ priceCheckHotkey }}</kbd></small>
            </div>
          </div>
          <form v-show="!isPasteCollapsed" class="price-composer" @submit.prevent="handleManualPaste">
            <div class="composer-heading">
              <label for="trade-item-clipboard">Item clipboard</label>
              <button type="button" class="ui-icon-button" aria-label="Close clipboard" @click="isPasteCollapsed = true"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
            </div>
            <textarea
              id="trade-item-clipboard"
              ref="clipboardField"
              v-model="manualItemText"
              placeholder="Paste the item text copied from the game"
              spellcheck="false"
              rows="3"
              @keydown.enter.exact.prevent="handleManualPaste"
            ></textarea>
            <div class="price-composer-footer">
              <span><kbd class="ui-kbd">Enter</kbd> to check</span>
              <button type="submit" class="ui-button ui-button--primary" :disabled="!manualItemText.trim()">
                <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                Check item
              </button>
            </div>
          </form>

          <div v-show="hasActivePriceCheck" class="price-results">
            <component :is="priceCheckComponent" :config="priceCheckWidgetConfig" @paste-item="openClipboard" />
          </div>
        </section>

        <section v-show="activeTab === 'search'" class="trade-view" aria-label="Item Search">
          <component v-if="itemSearchWidgetConfig" :is="itemSearchComponent" :config="itemSearchWidgetConfig" />
        </section>

        <section v-if="activeTab === 'settings' && settingsWidgetConfig" class="trade-view" aria-label="Settings">
          <component :is="settingsComponent" :config="settingsWidgetConfig">
            <template #rates>
              <div class="market-rates">
                <span v-if="divineQuote" class="trade-rate" :title="divineQuote.currency + ' per Divine Orb'">
                  <img :src="currencyIcon('divine')" alt="1 Divine Orb" />
                  <span aria-hidden="true">≈</span>
                  <strong>{{ divineQuote.amount }}</strong>
                  <img :src="divineQuote.icon" :alt="divineQuote.currency" />
                </span>
                <span v-if="gameMode === 'poe1' && annulInChaos" class="trade-rate trade-rate--secondary" title="Chaos Orbs per Orb of Annulment">
                  <img :src="currencyIcon('annul')" alt="1 Orb of Annulment" />
                  <span aria-hidden="true">≈</span>
                  <strong>{{ Number(annulInChaos.toFixed(2)) }}</strong>
                  <img :src="currencyIcon('chaos')" alt="Chaos Orbs" />
                </span>
                <span v-else-if="gameMode === 'poe2' && annulToExalt" class="trade-rate trade-rate--secondary" title="Exalted Orbs per Orb of Annulment">
                  <img :src="currencyIcon('annul')" alt="1 Orb of Annulment" />
                  <span aria-hidden="true">≈</span>
                  <strong>{{ Number(annulToExalt.toFixed(2)) }}</strong>
                  <img :src="currencyIcon('exalted')" alt="Exalted Orbs" />
                </span>
                <button type="button" class="ui-icon-button trade-refresh" :disabled="isNinjaLoading || !selectedLeague" title="Refresh market prices" aria-label="Refresh market prices" @click="forceLoad()">
                  <i class="fa-solid fa-rotate-right" :class="{ 'fa-spin': isNinjaLoading }" aria-hidden="true"></i>
                </button>
              </div>
            </template>
            <template #application>
              <div class="application-actions">
                <span>PoE Price Checker v{{ version }}</span>
                <span role="status">{{ updateControl.status }}</span>
                <button v-if="updateControl.action" type="button" class="ui-button" @click="runUpdate">{{ updateControl.label }}</button>
              </div>
            </template>
          </component>
        </section>
      </main>
    </div>

    <dialog v-if="showDestroyWarning || showDestroyConfirm" ref="destroyDialog" class="trade-dialog" aria-labelledby="destroy-dialog-title" @cancel.prevent="closeDestroyDialog">
      <div class="trade-dialog-icon"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></div>
      <h2 id="destroy-dialog-title">{{ showDestroyWarning ? 'Equipped item protected' : 'Enable the destroy hotkey?' }}</h2>
      <p v-if="showDestroyWarning">This item appears to be equipped.</p>
      <p v-else><kbd class="ui-kbd">Ctrl + Alt + MMB</kbd> will destroy the item under your cursor during this session.</p>
      <div class="trade-dialog-actions">
        <button type="button" class="ui-button" autofocus @click="closeDestroyDialog">{{ showDestroyWarning ? 'Close' : 'Cancel' }}</button>
        <button v-if="!showDestroyWarning" type="button" class="ui-button ui-button--danger" @click="respondDestroyConfirm(true)">Enable for this session</button>
      </div>
    </dialog>
  </div>
</template>

<script lang="ts">
import {
  defineComponent,
  ref,
  computed,
  provide,
  shallowRef,
  watch,
  onMounted,
  onUnmounted,
  nextTick
} from "vue";
import { registry } from "../overlay/widget-registry.js";
import { ItemRarity, parseClipboard } from "@/parser";
import { exchangeItem } from "../item-search/exchange-item";
import { selectGame } from "@/web/background/Game";
import type { GameVersion } from "@ipc/types";
import { useUpdateControl } from "@/web/settings/updates";
import { AppConfig, saveConfig, pushHostConfig } from "@/web/Config";
import { Host } from "@/web/background/IPC";
import { useLeagues } from "@/web/background/Leagues";
import { usePoeninja } from "@/web/background/Prices";
import { useClientLog } from "@/web/client-log/client-log";
import type { WidgetManager } from "../overlay/interfaces";
import type * as widget from "@/web/overlay/widgets";
import { currencyIcon, currencyLabel } from "@/web/ui/currency-icons";

export default defineComponent({
  setup() {
    // Run core background services
    const {
      xchgRate,
      xchgRateCurrency,
      forceLoad,
      isLoading: isNinjaLoading,
      annulToExalt,
      chaosToDivine,
      annulInChaos,
    } = usePoeninja();
    const leagues = useLeagues();
    leagues.load();
    const { handleLine } = useClientLog();

    const tradeLeagues = leagues.list;
    const selectedLeague = computed({
      get: () => leagues.selectedId.value ?? "",
      set: (id: string) => {
        leagues.selectedId.value = id || undefined;
        saveConfig();
      },
    });
    const unlistedLeague = computed(() =>
      Boolean(selectedLeague.value && !tradeLeagues.value.some(({ id }) => id === selectedLeague.value)),
    );
    const games: Array<{ id: GameVersion; label: string; title: string }> = [
      { id: "poe1", label: "PoE 1", title: "Path of Exile 1" },
      { id: "poe2", label: "PoE 2", title: "Path of Exile 2" },
    ];
    const emberTheme = computed(() => AppConfig().theme === "dark-fantasy");
    const gameMode = computed(() => AppConfig().game);
    const divineQuote = computed(() => {
      const poe1 = gameMode.value === "poe1";
      const rate = poe1 ? chaosToDivine.value : xchgRate.value;
      const currency = poe1 ? "chaos" : xchgRateCurrency.value?.id;
      if (!currency || !rate || rate <= 0 || !Number.isFinite(rate)) return;
      return {
        amount: rate.toLocaleString(undefined, { maximumFractionDigits: rate < 10 ? 2 : 0 }),
        icon: currencyIcon(currency),
        currency: currencyLabel(currency, rate),
      };
    });
    const gameSwitchError = ref("");
    async function toggleGame(game: GameVersion) {
      gameSwitchError.value = "";
      try {
        return await selectGame(game);
      } catch (error) {
        gameSwitchError.value = String(error);
        return false;
      }
    }

    // Game log parsing queue
    const lineQueue: string[] = [];
    let processing = false;
    Host.onEvent("MAIN->CLIENT::game-log", (e) => {
      lineQueue.push(...e.lines);
      processQueue();
    });
    function processQueue() {
      if (processing) return;
      processing = true;
      while (lineQueue.length) {
        handleLine(lineQueue.shift()!);
      }
      processing = false;
    }

    const showDestroyConfirm = ref(false);

    Host.onEvent("MAIN->CLIENT::confirm-destroy-action", () => {
      showDestroyConfirm.value = true;
    });

    function respondDestroyConfirm(activate: boolean) {
      Host.sendEvent({
        name: "CLIENT->MAIN::confirm-destroy-response",
        payload: { activate },
      });
      showDestroyConfirm.value = false;
    }

    const showDestroyWarning = ref(false);

    Host.onEvent("MAIN->CLIENT::show-destroy-warning", () => {
      showDestroyWarning.value = true;
    });

    Host.onEvent("MAIN->CLIENT::item-text", async (e) => {
      if (e.isManual || e.target !== "price-check") return;
      if (e.activeGame && !await toggleGame(e.activeGame)) return;
      checkItemText(e.clipboard, true);
    });

    const destroyDialog = ref<HTMLDialogElement>();
    watch(destroyDialog, (dialog) => dialog?.showModal(), { flush: "post" });
    function closeDestroyDialog() {
      if (showDestroyWarning.value) showDestroyWarning.value = false;
      else respondDestroyConfirm(false);
    }

    // Tabs setup
    const activeTab = ref("price-check");

    const handleTabChange = (e: Event) => {
      const targetTab = (e as CustomEvent).detail;
      if (targetTab) {
        activeTab.value = targetTab;
      }
    };
    window.addEventListener("change-tab", handleTabChange);
    onUnmounted(() => {
      window.removeEventListener("change-tab", handleTabChange);
    });
    const tabs = [
      { id: "price-check", name: "Price Check", icon: "fa-solid fa-scale-balanced" },
      { id: "search", name: "Item Search", icon: "fa-solid fa-magnifying-glass" },
    ];

    const version = Host.version;
    const { control: updateControl, run: runUpdate } = useUpdateControl();

    // Manual input parsing
    const manualItemText = ref("");
    const isPasteCollapsed = ref(true);
    const clipboardField = ref<HTMLTextAreaElement>();
    function openClipboard() {
      isPasteCollapsed.value = false;
      nextTick(() => clipboardField.value?.focus());
    }
    async function pasteWelcomeItem() {
      openClipboard();
      // Manual paste stays available if Windows or the browser cannot read the clipboard.
      let text: string | undefined;
      try { text = await navigator.clipboard?.readText(); } catch { return; }
      if (!text || manualItemText.value || isPasteCollapsed.value ||
          activeTab.value !== "price-check" || !showWelcome.value) return;
      if (parseClipboard(text).isOk()) {
        manualItemText.value = text;
        handleManualPaste();
      }
    }
    async function changeGame(event: Event) {
      const field = event.target as HTMLSelectElement;
      await toggleGame(field.value as GameVersion);
      field.value = gameMode.value;
    }
    function handleManualPaste() {
      const text = manualItemText.value.trim();
      if (!text) return;
      checkItemText(text);
    }

    function checkItemText(text: string, fromHotkey = false) {
      const item = parseClipboard(text).unwrapOr(null);
      manualItemText.value = "";
      isPasteCollapsed.value = true;
      const uniqueShortcut = fromHotkey && gameMode.value === "poe2" && item?.rarity === ItemRarity.Unique && !item.isUnidentified;
      if (item && itemSearchWidgetConfig.value && (exchangeItem(item) || uniqueShortcut)) {
        activeTab.value = "search";
        nextTick(() => window.dispatchEvent(new CustomEvent("add-search-item", { detail: item })));
        return;
      }
      activeTab.value = "price-check";
      Host.selfDispatch({
        name: "MAIN->CLIENT::item-text",
        payload: {
          target: "price-check",
          clipboard: text,
          position: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
          focusOverlay: true,
          isManual: true,
          activeGame: AppConfig().game,
          item: item ?? undefined,
        },
      });

    }

    // Widget Configurations
    const priceCheckWidgetConfig = computed(() => AppConfig("price-check")!);
    const itemSearchWidgetConfig = computed(() => AppConfig("item-search")!);
    const settingsWidgetConfig = computed(() => AppConfig("settings")!);

    // Check if price-check is open/showing
    const hasActivePriceCheck = computed(() => {
      return priceCheckWidgetConfig.value && priceCheckWidgetConfig.value.wmWants === "show";
    });

    const showWelcome = computed(() => !hasActivePriceCheck.value);

    // Auto-focus tab to Price Check when items are parsed/searched
    watch(hasActivePriceCheck, (isActive) => {
      if (isActive) {
        activeTab.value = "price-check";
        isPasteCollapsed.value = true;
      }
    });

    // Get Components from Registry
    const priceCheckComponent = computed(() => registry.getWidgetComponent("price-check"));
    const itemSearchComponent = computed(() => registry.getWidgetComponent("item-search"));
    const settingsComponent = computed(() => registry.getWidgetComponent("settings"));

    // Provide custom WidgetManager to avoid overlay positioning or auto-hiding
    const size = shallowRef({
      width: window.innerWidth,
      height: window.innerHeight,
    });
    window.addEventListener("resize", () => {
      size.value = {
        width: window.innerWidth,
        height: window.innerHeight,
      };
    });

    function show(wmId: number) {
      const w = AppConfig().widgets.find((_) => _.wmId === wmId);
      if (w) w.wmWants = "show";
    }

    function hide(wmId: number) {
      const w = AppConfig().widgets.find((_) => _.wmId === wmId);
      if (w) w.wmWants = "hide";
    }

    function remove(wmId: number) {
      AppConfig().widgets = AppConfig().widgets.filter((_) => _.wmId !== wmId);
    }

    function setFlag(wmId: number, flag: string, state: boolean) {
      const widget = AppConfig().widgets.find((_) => _.wmId === wmId);
      if (!widget) return false;
      const hasFlag = widget.wmFlags.includes(flag);
      if (state === false && hasFlag === true) {
        widget.wmFlags = widget.wmFlags.filter((_) => _ !== flag);
        return true;
      }
      if (state === true && hasFlag === false) {
        widget.wmFlags.push(flag);
        return true;
      }
      return false;
    }

    provide<WidgetManager>("wm", {
      poePanelWidth: computed(() => 0),
      size,
      active: computed(() => true), // Always active in standalone mode
      widgets: computed(() => AppConfig().widgets),
      show,
      hide,
      remove,
      bringToTop() {},
      create() {},
      setFlag,
    });

    const isLoggedIn = computed(() => Host.isLoggedIn.value);
    const isElectron = computed(() => Host.isElectron);

    function handleLoginClick() {
      if (Host.isLoggedIn.value) {
        Host.sendEvent({
          name: "CLIENT->MAIN::user-action",
          payload: { action: "poe-logout" }
        });
      } else {
        Host.sendEvent({
          name: "CLIENT->MAIN::user-action",
          payload: { action: "poe-login" }
        });
      }
    }

    const priceCheckHotkey = computed(() => {
      const pc = priceCheckWidgetConfig.value as widget.PriceCheckWidget;
      if (!pc) return "Ctrl + D";
      const hold = pc.hotkeyHold;
      const key = pc.hotkey;
      if (!key) return "None";
      return hold && hold !== "None" ? `${hold} + ${key}` : key;
    });

    onMounted(() => {
      nextTick(() => {
        pushHostConfig();
      });
    });

    return {
      currencyIcon,
      activeTab,
      tabs,
      version,
      manualItemText,
      handleManualPaste,
      isPasteCollapsed,
      priceCheckWidgetConfig,
      itemSearchWidgetConfig,
      settingsWidgetConfig,
      hasActivePriceCheck,
      showWelcome,
      pasteWelcomeItem,
      priceCheckComponent,
      itemSearchComponent,
      settingsComponent,
      divineQuote,
      annulToExalt,
      annulInChaos,
      forceLoad,
      isNinjaLoading,
      tradeLeagues,
      selectedLeague,
      unlistedLeague,
      leagueLoading: leagues.isLoading,
      leagueError: leagues.error,
      reloadLeagues: leagues.load,
      games,
      emberTheme,
      gameMode,
      gameSwitchError,
      changeGame,
      clipboardField,
      openClipboard,
      updateControl,
      runUpdate,
      priceCheckHotkey,
      isLoggedIn,
      isElectron,
      handleLoginClick,
      showDestroyConfirm,
      respondDestroyConfirm,
      showDestroyWarning,
      destroyDialog,
      closeDestroyDialog,
    };
  },
});
</script>

<style scoped src="./standalone.css"></style>
