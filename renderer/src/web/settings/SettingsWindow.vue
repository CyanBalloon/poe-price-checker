<template>
  <div class="trade-settings">
    <app-title-bar v-if="!isStandalone" :title="t('settings.title')" @close="close" />
    <header class="view-heading">
      <h1>Settings</h1>
    </header>

    <section class="settings-group" aria-labelledby="settings-general-title">
      <h2 id="settings-general-title">General</h2>
      <div class="settings-rows">
        <label class="settings-row">
          <span><strong>Theme</strong><small>Choose the workspace palette.</small></span>
          <select v-model="theme" class="ui-select">
            <option value="default">Graphite</option>
            <option value="dark-fantasy">Ember</option>
          </select>
        </label>
        <label class="settings-row">
          <span><strong>Game language</strong><small>Match the language of the item text you copy.</small></span>
          <select v-model="language" class="ui-select">
            <option value="en">English</option>
            <option value="ru">Русский</option>
            <option value="cmn-Hant">正體中文</option>
            <option value="ko">한국어</option>
            <option value="ja">日本語</option>
            <option value="de">Deutsch</option>
            <option value="es">Español</option>
            <option value="pt">Português (Brasil)</option>
            <option value="fr">Français</option>
          </select>
        </label>
        <p v-if="poe1EnglishFallback" class="settings-note" role="status">PoE 1 uses English item data for this language.</p>
        <div class="settings-row">
          <span><strong id="settings-updates-label">Automatic updates</strong><small>Check for updates and download them in the background. Restart when you’re ready.</small></span>
          <button type="button" role="switch" class="settings-switch" aria-labelledby="settings-updates-label" :aria-checked="autoUpdater" @click="autoUpdater = !autoUpdater"></button>
        </div>
      </div>
    </section>

    <section class="settings-group" aria-labelledby="settings-market-title">
      <h2 id="settings-market-title">Trade</h2>
      <div class="settings-rows">
        <div v-if="isPoe1" class="settings-row"><strong>Base currency</strong><span>Chaos Orb</span></div>
        <label v-else-if="preferredCurrency" class="settings-row">
          <span><strong>Preferred currency</strong><small>Use this currency for market estimates when available.</small></span>
          <select v-model="preferredCurrency" class="ui-select">
            <option value="chaos">Chaos Orb</option>
            <option value="exalted">Exalted Orb</option>
          </select>
        </label>
        <form class="settings-row settings-private-league" @submit.prevent="selectPrivateLeague">
          <label for="settings-private-league"><strong>Private league</strong><small>Enter the league name and its number.</small></label>
          <div>
            <input id="settings-private-league" v-model="privateLeague" autocomplete="off" placeholder="My league (PL12345)" />
            <button type="submit" class="ui-button" :disabled="!privateLeagueValid">Use league</button>
          </div>
        </form>
      </div>
    </section>

    <section v-if="$slots.rates" class="settings-group">
      <h2>Exchange rates</h2><slot name="rates" />
    </section>

    <section class="settings-group" aria-labelledby="settings-shortcuts-title">
      <h2 id="settings-shortcuts-title">Shortcuts</h2>
      <div class="settings-rows">
        <settings-hotkey v-for="hotkey in hotkeys" :key="hotkey.translationKey" :schema="hotkey" class="settings-hotkey-row" />
        <div v-if="supportsAutoClicker" class="settings-row">
          <span><strong id="settings-auto-clicker-label">Auto-clicker</strong><small id="settings-auto-clicker-help">Hold Ctrl and the right mouse button to repeat left clicks in game. Release either to stop.</small></span>
          <button type="button" role="switch" class="settings-switch" aria-labelledby="settings-auto-clicker-label" aria-describedby="settings-auto-clicker-help" :aria-checked="autoClickerEnabled" @click="toggleAutoClicker"></button>
        </div>
        <div class="settings-row">
          <span><strong id="settings-destroy-label">Destroy item hotkey</strong><small>Allow Ctrl + Alt + middle click after confirming for the session.</small></span>
          <button type="button" role="switch" class="settings-switch" aria-labelledby="settings-destroy-label" :aria-checked="destroyHotkeyEnabled" @click="destroyHotkeyEnabled = !destroyHotkeyEnabled"></button>
        </div>
      </div>
    </section>
    <section v-if="$slots.application" class="settings-group">
      <h2>Application</h2><slot name="application" />
    </section>
    <dialog ref="autoClickerDialog" class="trade-dialog" aria-labelledby="auto-clicker-title" aria-describedby="auto-clicker-warning">
      <h2 id="auto-clicker-title">Enable the auto-clicker?</h2>
      <p id="auto-clicker-warning">Repeating clicks from a single input may violate the Path of Exile Terms of Use and put your account at risk.</p>
      <p><a href="https://www.pathofexile.com/legal/terms-of-use-and-privacy-policy" target="_blank" rel="noopener noreferrer">Read the Terms of Use</a></p>
      <div class="trade-dialog-actions">
        <button type="button" class="ui-button" autofocus @click="autoClickerDialog?.close()">Keep off</button>
        <button type="button" class="ui-button ui-button--danger" @click="enableAutoClicker">Enable auto-clicker</button>
      </div>
    </dialog>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, inject, ref, type PropType } from "vue";
import { useI18n } from "vue-i18n";
import { POE1_LANGUAGES } from "@/assets/data";
import { AppConfig, pushHostConfig, saveConfig } from "@/web/Config";
import { Host } from "@/web/background/IPC";
import { useLeagues } from "@/web/background/Leagues";
import type { Widget, WidgetManager, WidgetSpec } from "@/web/overlay/interfaces";
import type { PriceCheckWidget } from "@/web/overlay/widgets";
import AppTitleBar from "@/web/ui/AppTitlebar.vue";
import SettingsHotkey, { type HotkeySchema } from "./SettingsHotkey.vue";

export default defineComponent({
  widget: {
    type: "settings",
    instances: "single",
    initInstance: () => ({
      wmId: 0,
      wmType: "settings",
      wmTitle: "{icon=fa-cog}",
      wmWants: "hide",
      wmZorder: "exclusive",
      wmFlags: ["invisible-on-blur", "ignore-ui-visibility"],
    }),
  } satisfies WidgetSpec,
  components: { AppTitleBar, SettingsHotkey },
  props: {
    config: {
      type: Object as PropType<Widget>,
      required: true,
    },
  },
  setup(props) {
    const { t } = useI18n();
    const wm = inject<WidgetManager>("wm")!;
    const leagues = useLeagues();
    const isStandalone = new URLSearchParams(window.location.search).get("mode") === "standalone";
    const privateLeague = ref("");
    const privateLeagueValid = computed(() => /^.+ \(PL\d+\)$/.test(privateLeague.value.trim()));
    const priceCheck = computed(() => AppConfig<PriceCheckWidget>("price-check"));

    function persist() {
      saveConfig();
      pushHostConfig();
    }

    function preference<T extends object, K extends keyof T>(getObject: () => T, key: K) {
      return computed({
        get: () => getObject()[key],
        set(value) {
          getObject()[key] = value;
          persist();
        },
      });
    }

    const autoClickerEnabled = preference(() => AppConfig(), "autoClickerEnabled");
    const autoClickerDialog = ref<HTMLDialogElement>();
    function toggleAutoClicker() {
      if (autoClickerEnabled.value) autoClickerEnabled.value = false;
      else autoClickerDialog.value?.showModal();
    }
    function enableAutoClicker() {
      autoClickerEnabled.value = true;
      autoClickerDialog.value?.close();
    }

    const hotkeys = computed<HotkeySchema[]>(() => {
      const out: HotkeySchema[] = [];
      const check = priceCheck.value;
      const hideout = AppConfig().commands.find((command) => command.text === "/hideout");
      if (check) {
        out.push({
          translationKey: "Price Check",
          config: {
            modKey: preference(() => check, "hotkeyHold"),
            nonModKey: preference(() => check, "hotkey"),
          },
        });
      }
      if (hideout) {
        out.push({
          translationKey: "Go To Hideout",
          config: preference(() => hideout, "hotkey"),
        });
      }
      return out;
    });

    function selectPrivateLeague() {
      if (!privateLeagueValid.value) return;
      leagues.selectedId.value = privateLeague.value.trim();
      saveConfig();
      privateLeague.value = "";
    }

    return {
      t,
      theme: preference(() => AppConfig(), "theme"),
      language: preference(() => AppConfig(), "language"),
      autoUpdater: preference(() => AppConfig(), "autoUpdater"),
      destroyHotkeyEnabled: preference(() => AppConfig(), "destroyHotkeyEnabled"),
      supportsAutoClicker: Host.supportsAutoClicker,
      autoClickerEnabled,
      autoClickerDialog,
      toggleAutoClicker,
      enableAutoClicker,
      isPoe1: computed(() => AppConfig().game === "poe1"),
      preferredCurrency: computed({
        get: () => priceCheck.value?.coreCurrency,
        set(value) {
          if (!priceCheck.value || !value) return;
          priceCheck.value.coreCurrency = value;
          saveConfig();
        },
      }),
      poe1EnglishFallback: computed(() => AppConfig().game === "poe1" && !POE1_LANGUAGES.has(AppConfig().language)),
      hotkeys,
      privateLeague,
      privateLeagueValid,
      selectPrivateLeague,
      isStandalone,
      close: () => wm.hide(props.config.wmId),
    };
  },
});
</script>

<style scoped>
.trade-settings {
  max-width: 65rem;
  margin: 0 auto;
}

.settings-group + .settings-group {
  margin-top: 1.45rem;
}

.settings-group h2 {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 2rem;
  margin-bottom: 0.45rem;
  color: var(--ink);
  font: 500 1.4rem/1.3 var(--display);
}

.settings-group h2 i {
  width: 1rem;
  color: var(--accent);
  text-align: center;
}

.settings-row,
.settings-hotkey-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  min-height: 3.7rem;
  padding: 0.65rem 0;
}

@media (min-width: 49rem) {
  .settings-group { display: grid; grid-template-columns: 11rem minmax(0, 1fr); align-items: baseline; gap: 2rem; }
}
.settings-group { border-top: 1px solid var(--line); padding-block: 1rem; }


.settings-row strong,
.settings-row small {
  display: block;
}

.settings-row strong {
  color: var(--ink);
  font-weight: 600;
}

.settings-row small {
  margin-top: 0.16rem;
  color: var(--quiet);
  font-size: 0.75rem;
}

.settings-row select {
  min-width: 8.4rem;
}

.settings-switch {
  position: relative;
  width: 2.55rem;
  height: 1.42rem;
  border: 1px solid var(--line-strong);
  border-radius: 1rem;
  background: var(--raised);
}

.settings-switch::after {
  position: absolute;
  top: 0.16rem;
  left: 0.17rem;
  width: 0.97rem;
  height: 0.97rem;
  border-radius: 50%;
  background: var(--muted);
  content: "";
}

.settings-switch[aria-checked="true"] {
  border-color: var(--accent);
  background: var(--accent-wash);
}

.settings-switch[aria-checked="true"]::after {
  left: 1.21rem;
  background: var(--accent);
}

.settings-note {
  padding: 0.5rem 0.9rem;
  color: var(--accent);
  font-size: 0.75rem;
}

.settings-private-league > div {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.settings-private-league input {
  min-height: 2.25rem;
  padding: 0.35rem 0.55rem;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  background: var(--page);
  color: var(--ink);
  font-size: 0.8125rem;
}
</style>
