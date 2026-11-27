<template>
  <div class="trade-settings">
    <app-title-bar v-if="!isStandalone" :title="t('settings.title')" @close="close" />
    <header class="view-heading">
      <h1>Settings</h1>
    </header>

    <section class="settings-group settings-application" aria-labelledby="settings-app-title">
      <h2 id="settings-app-title">Application</h2>
      <slot name="application" />
      <div class="settings-row">
        <span><strong id="settings-updates-label">Automatic updates</strong><small>Download updates in the background. Restart when you’re ready.</small></span>
        <button type="button" role="switch" class="settings-switch" aria-labelledby="settings-updates-label" :aria-checked="autoUpdater" @click="autoUpdater = !autoUpdater"></button>
      </div>
    </section>

    <div class="settings-columns">
      <section class="settings-group" aria-labelledby="settings-appearance-title">
        <h2 id="settings-appearance-title">Appearance</h2>
        <div class="settings-rows">
          <label class="settings-row">
            <strong>Theme</strong>
            <select v-model="theme">
              <option value="default">Graphite</option>
              <option value="dark-fantasy">Ember</option>
            </select>
          </label>
          <local-effects-setting v-if="isPoe1" v-model="poe1ItemAnimations" />
        </div>
      </section>

      <section class="settings-group" aria-labelledby="settings-market-title">
        <h2 id="settings-market-title">Game &amp; trade</h2>
        <div class="settings-rows">
          <label class="settings-row">
            <span><strong>Game language</strong><small>Match your copied item text.</small></span>
            <select v-model="language">
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
          <div v-if="isPoe1" class="settings-row"><strong>Base currency</strong><span>Chaos Orb</span></div>
          <label v-else-if="preferredCurrency" class="settings-row">
            <span><strong>Preferred currency</strong><small>Use this currency for market estimates when available.</small></span>
            <select v-model="preferredCurrency">
              <option value="chaos">Chaos Orb</option>
              <option value="exalted">Exalted Orb</option>
            </select>
          </label>
          <form class="settings-row settings-private-league" @submit.prevent="selectPrivateLeague">
            <label for="settings-private-league"><strong>Private league</strong></label>
            <div>
              <input id="settings-private-league" v-model="privateLeague" autocomplete="off" placeholder="My league (PL12345)" />
              <button type="submit" class="ui-button" :disabled="!privateLeagueValid">Use league</button>
            </div>
          </form>
          <div v-if="$slots.rates" class="settings-rates"><strong>Exchange rates</strong><slot name="rates" /></div>
        </div>
      </section>
    </div>

    <section class="settings-group" aria-labelledby="settings-shortcuts-title">
      <h2 id="settings-shortcuts-title">Shortcuts</h2>
      <div class="settings-shortcuts">
        <div>
          <settings-hotkey v-for="hotkey in hotkeys" :key="hotkey.translationKey" :schema="hotkey" class="settings-hotkey-row" />
        </div>
        <div>
          <div v-if="supportsAutoClicker" class="settings-row">
            <span><strong id="settings-auto-clicker-label">Auto-clicker</strong><small id="settings-auto-clicker-help">Hold Ctrl and the right mouse button to repeat left clicks in game. Release either to stop.</small></span>
            <button type="button" role="switch" class="settings-switch" aria-labelledby="settings-auto-clicker-label" aria-describedby="settings-auto-clicker-help" :aria-checked="autoClickerEnabled" @click="toggleAutoClicker"></button>
          </div>
          <div class="settings-row">
            <span><strong id="settings-destroy-label">Destroy item hotkey</strong><small>Allow Ctrl + Alt + middle click after confirming for the session.</small></span>
            <button type="button" role="switch" class="settings-switch" aria-labelledby="settings-destroy-label" :aria-checked="destroyHotkeyEnabled" @click="destroyHotkeyEnabled = !destroyHotkeyEnabled"></button>
          </div>
        </div>
      </div>
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
import LocalEffectsSetting from "./LocalEffectsSetting.vue";
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
  components: { AppTitleBar, SettingsHotkey, LocalEffectsSetting },
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
      poe1ItemAnimations: computed({
        get: () => AppConfig().poe1ItemAnimations !== false,
        set: value => { AppConfig().poe1ItemAnimations = value; saveConfig(); },
      }),
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
.trade-settings { width: min(100%, 65rem); margin-inline: auto; color: var(--ink); }
.trade-settings .view-heading { margin: 0 0 1.5rem; }
.trade-settings .view-heading h1 { font: 500 clamp(2rem, 3.8vw, 2.9rem)/1.05 var(--display); }
.settings-group { min-width: 0; }
.settings-group h2 { margin: 0 0 .35rem; color: var(--ink); font: 500 1.45rem/1.3 var(--display); }
.settings-application { padding: 1.15rem clamp(1rem, 2.5vw, 1.7rem) .9rem; border-radius: .85rem;
  background: linear-gradient(105deg, color-mix(in srgb, var(--raised) 88%, transparent), color-mix(in srgb, var(--surface) 62%, transparent)); }
.settings-columns, .settings-shortcuts { display: grid; gap: 1.5rem clamp(1.75rem, 4vw, 3.5rem); }
.settings-columns { margin-block: 1.6rem 1.4rem; }
.settings-columns .settings-group > h2, .settings-columns + .settings-group > h2 {
  padding-bottom: .55rem; border-bottom: 1px solid var(--line); }
.trade-settings :deep(.settings-row), .settings-hotkey-row { display: flex; align-items: center;
  justify-content: space-between; gap: .6rem 1rem; min-width: 0; min-height: 3rem; padding-block: .5rem; }
.trade-settings :deep(.settings-row strong), .settings-rates > strong, .settings-hotkey-row :deep(label) {
  font-size: .93rem; font-weight: 600; color: var(--ink); line-height: 1.4; }
.trade-settings :deep(.settings-row small), .settings-note { display: block; margin-top: .15rem; color: var(--muted); font-size: .8rem; line-height: 1.45; }
.settings-note { color: var(--accent); margin-bottom: .55rem; }
.settings-row select { width: 9rem; max-width: 52%; }
.trade-settings :deep(.settings-switch) { display: block; position: relative; flex: 0 0 2.55rem; height: 1.45rem;
  border: 1px solid var(--line-strong); border-radius: 2rem; background: var(--raised); }
.trade-settings :deep(.settings-switch::after) { content: ""; position: absolute; top: 50%; left: .18rem; width: .94rem;
  height: .94rem; transform: translateY(-50%); border-radius: 50%; background: var(--muted); }
.trade-settings :deep(.settings-switch[aria-checked="true"]) { border-color: var(--accent); background: var(--accent-wash); }
.trade-settings :deep(.settings-switch[aria-checked="true"]::after) { left: 1.23rem; background: var(--accent); }
.trade-settings :deep(:focus-visible) { outline: 2px solid var(--accent); outline-offset: 3px; }
.settings-private-league { flex-wrap: wrap; }
.settings-private-league > div { display: flex; align-items: center; flex: 1 1 auto; justify-content: end; gap: .4rem; }
.settings-private-league input { min-width: 0; width: 10.5rem; padding: .42rem .65rem; border: 1px solid var(--line);
  border-radius: .45rem; background: var(--surface); color: var(--ink); font-size: .85rem; }
.settings-rates { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .3rem .85rem; padding-top: .55rem; }
.settings-hotkey-row :deep(button) { min-height: 1.8rem; }
@media (min-width: 58rem) {
  .settings-columns, .settings-shortcuts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 57.99rem) {
  .settings-shortcuts { gap: 0; }
}
@media (max-width: 32rem) {
  .settings-private-league > div { justify-content: start; flex-basis: 100%; }
  .settings-private-league input { flex: 1; }
  .settings-hotkey-row { flex-wrap: wrap; }
}
</style>
