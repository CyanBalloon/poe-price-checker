<template>
  <div v-if="isStandalone" class="workbench-listing-options">
    <select v-model="filters.trade.listingType" aria-label="Listing availability">
      <template v-if="api === 'trade'">
        <option value="available">{{ t("Instant or Online") }}</option>
        <option value="securable">{{ t("Instant") }}</option>
      </template>
      <option v-else value="onlineleague">{{ t(":in_league_toggle") }}</option>
      <option value="online">{{ t("Online") }}</option>
      <option value="any">{{ t(":offline_toggle") }}</option>
    </select>
    <details class="listing-options-more" @keydown.esc="closeOptions" @focusout="leaveOptions">
      <summary class="ui-icon-button" aria-label="More listing options" title="More listing options"><i class="fa-solid fa-sliders" aria-hidden="true"></i></summary>
      <div class="listing-options-fields">
        <label>League<select v-model="filters.trade.league">
          <option v-if="filters.trade.league && !tradeLeagues.some(l => l.id === filters.trade.league)" :value="filters.trade.league">{{ filters.trade.league }}</option>
          <option v-for="league in tradeLeagues" :key="league.id" :value="league.id">{{ league.id }}</option>
        </select></label>
        <template v-if="byTime">
          <label>Listed<select v-model="filters.trade.listed">
            <option :value="undefined">{{ t(":listed_any_time") }}</option>
            <option v-for="age in listingAges" :key="age" :value="age">{{ t(":listed_" + age) }}</option>
          </select></label>
          <label>Price currency<select v-model="filters.trade.currency">
            <option :value="undefined">{{ t(":currency_any") }}</option>
            <option value="exalted">{{ t(":currency_only_exalted") }}</option>
            <option value="chaos">{{ t(":currency_only_chaos") }}</option>
            <option value="divine">{{ t(":currency_only_div") }}</option>
            <option value="exalted_divine">{{ t(":currency_exalted_div") }}</option>
          </select></label>
        </template>
      </div>
    </details>
  </div>
  <ui-popover v-else
    :delay="[80, null]"
    placement="bottom-start"
    boundary="#price-window"
  >
    <template #target>
      <button
        class="ui-button truncate"
        :class="showWarning() ? 'text-orange-500' : 'text-gray-500'"
      >
        <span
          ><i class="fas fa-history"></i>
          {{
            t(
              filters.trade.listingType === "securable"
                ? "Instant"
                : filters.trade.listingType === "any"
                  ? "Offline"
                  : "Online",
            )
          }}</span
        >
        <span v-if="showLeagueName()">, {{ filters.trade.league }}</span>
      </button>
    </template>
    <template #content>
      <div class="flex gap-x-8 p-2 bg-gray-800 text-gray-400">
        <div class="flex flex-col gap-y-1">
          <template v-if="api === 'trade'">
            <ui-radio v-model="filters.trade.listingType" value="available">{{
              t("Instant or Online")
            }}</ui-radio>
            <ui-radio v-model="filters.trade.listingType" value="securable">{{
              t("Instant")
            }}</ui-radio>
            <ui-radio v-model="filters.trade.listingType" value="online">{{
              t("Online")
            }}</ui-radio>
            <ui-radio v-model="filters.trade.listingType" value="any">{{
              t(":offline_toggle")
            }}</ui-radio>
          </template>
          <template v-else>
            <ui-radio
              v-model="filters.trade.listingType"
              value="onlineleague"
              >{{ t(":in_league_toggle") }}</ui-radio
            >
            <ui-radio v-model="filters.trade.listingType" value="online">{{
              t("Online")
            }}</ui-radio>
            <ui-radio v-model="filters.trade.listingType" value="any">{{
              t(":offline_toggle")
            }}</ui-radio>
          </template>
          <template v-if="byTime">
            <ui-radio
              v-model="filters.trade.listed"
              :value="undefined"
              class="mt-3"
              >{{ t(":listed_any_time") }}</ui-radio
            >
            <ui-radio v-model="filters.trade.listed" value="1day">{{
              t(":listed_1day")
            }}</ui-radio>
            <ui-radio v-model="filters.trade.listed" value="3days">{{
              t(":listed_3days")
            }}</ui-radio>
            <ui-radio v-model="filters.trade.listed" value="1week">{{
              t(":listed_1week")
            }}</ui-radio>
            <ui-radio v-model="filters.trade.listed" value="2weeks">{{
              t(":listed_2weeks")
            }}</ui-radio>
            <ui-radio v-model="filters.trade.listed" value="1month">{{
              t(":listed_1month")
            }}</ui-radio>
            <ui-radio v-model="filters.trade.listed" value="2months">{{
              t(":listed_2months")
            }}</ui-radio>
          </template>
        </div>
        <div class="flex flex-col gap-y-1">
          <ui-radio
            v-for="league of tradeLeagues"
            :key="league.id"
            v-model="filters.trade.league"
            :value="league.id"
            >{{ league.id }}</ui-radio
          >
          <template v-if="byTime">
            <ui-radio
              class="mt-3"
              v-model="filters.trade.currency"
              :value="undefined"
              >{{ t(":currency_any") }}</ui-radio
            >
            <ui-radio v-model="filters.trade.currency" value="exalted">{{
              t(":currency_only_exalted")
            }}</ui-radio>
            <ui-radio v-model="filters.trade.currency" value="chaos">{{
              t(":currency_only_chaos")
            }}</ui-radio>
            <ui-radio v-model="filters.trade.currency" value="divine">{{
              t(":currency_only_div")
            }}</ui-radio>
            <ui-radio v-model="filters.trade.currency" value="exalted_divine">{{
              t(":currency_exalted_div")
            }}</ui-radio>
          </template>
        </div>
      </div>
    </template>
  </ui-popover>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { useI18nNs } from "@/web/i18n";
import UiRadio from "@/web/ui/UiRadio.vue";
import UiToggle from "@/web/ui/UiToggle.vue";
import UiPopover from "@/web/ui/Popover.vue";
import type { ItemFilters } from "../filters/interfaces";
import { useLeagues } from "@/web/background/Leagues";

export default defineComponent({
  components: { UiRadio, UiToggle, UiPopover },
  props: {
    filters: {
      type: Object as PropType<ItemFilters>,
      required: true,
    },
    byTime: {
      type: Boolean,
      default: false,
    },
    api: {
      type: String as PropType<"trade" | "bulk">,
      required: true,
    },
  },
  setup(props) {
    const leagues = useLeagues();
    const { t } = useI18nNs("online_filter");

    return {
      t,
      isStandalone: new URLSearchParams(window.location.search).get("mode") === "standalone",
      listingAges: ["1day", "3days", "1week", "2weeks", "1month", "2months"],
      closeOptions(event: KeyboardEvent) {
        const details = event.currentTarget as HTMLDetailsElement;
        if (CSS.supports("selector(select:open)") && details.querySelector("select:open")) return;
        event.stopPropagation();
        event.preventDefault();
        details.open = false;
        details.querySelector("summary")?.focus();
      },
      leaveOptions(event: FocusEvent) {
        const details = event.currentTarget as HTMLDetailsElement;
        if (event.relatedTarget instanceof Node && !details.contains(event.relatedTarget)) details.open = false;
      },
      tradeLeagues: leagues.list,
      showLeagueName: () =>
        leagues.selectedId.value !== props.filters.trade.league,
      showWarning: () =>
        Boolean(
          (props.filters.trade.listed &&
            ["1day", "3days", "1week"].includes(props.filters.trade.listed)) ||
            props.filters.trade.currency,
        ),
      onOfflineUpdate(offline: boolean) {
        const { filters } = props;
        filters.trade.offline = offline;
        if (props.byTime) {
          filters.trade.listed = offline ? "2months" : undefined;
        }
      },
      inputFocus(e: FocusEvent) {
        const target = e.target as HTMLInputElement;
        target.select();
      },
    };
  },
});
</script>

<style lang="postcss" module>
.input {
  @apply text-center;
  @apply bg-transparent;
  @apply text-gray-300;
  @apply select-all;

  &:hover,
  &:focus {
    @apply bg-gray-700;
    @apply -my-px border-t border-b border-gray-500;
  }

  &::placeholder {
    @apply text-gray-400;
  }

  &:focus {
    cursor: none;
  }
}
</style>

<style scoped>
.workbench-listing-options { display: flex; align-items: center; gap: 0.2rem; }
.workbench-listing-options > select { max-width: 12rem; }
.listing-options-more { position: relative; }
.listing-options-more summary { cursor: pointer; list-style: none; }
.listing-options-more summary::-webkit-details-marker { display: none; }
.listing-options-more[open] summary { color: var(--accent); }
.listing-options-fields { position: absolute; right: 0; z-index: 3; width: min(18rem, 80vw); padding: 1rem; border-radius: 0.45rem; background: var(--surface); box-shadow: 0 0.5rem 1.7rem #0007; }
.listing-options-fields label { display: grid; grid-template-columns: 5.5rem minmax(0, 1fr); align-items: center; gap: 0.55rem; }
.listing-options-fields label + label { margin-top: 0.5rem; }
</style>
