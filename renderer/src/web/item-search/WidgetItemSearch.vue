<template>
  <div class="item-search">
    <header class="view-heading">
      <h1>Item Search</h1>
    </header>

    <div class="item-search-workspace">
      <div class="item-search-picker">
        <label class="item-search-field">
          <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
          <input
            ref="searchInput"
            v-model="searchValue"
            type="search"
            placeholder="Search items by name"
            aria-label="Search items by name"
            autocomplete="off"
            spellcheck="false"
          />
        </label>

        <section v-if="results.length" aria-labelledby="search-matches-title">
          <h2 id="search-matches-title" class="item-search-matches-title">Matches</h2>
          <div class="item-search-matches">
            <button
              v-for="item in results"
              :key="itemKey(item)"
              type="button"
              class="item-search-match"
              :aria-pressed="selectedKeys.has(itemKey(item))"
              @click="toggleMatch(item)"
            >
              <span class="item-search-art">
                <ui-item-img :icon="item.icon || '%NOT_FOUND%'" :item-name="item.refName" :namespace="item.namespace" />
              </span>
              <span class="item-search-copy">
                <strong :class="{ 'item-search-unique': item.unique }">{{ item.name }}</strong>
                <small v-if="item.viscera">Viscera · {{ item.viscera.slot }}</small>
                <small v-else-if="item.unique">{{ item.unique.base }}</small>
              </span>
              <span class="item-search-match-action" aria-hidden="true">
                <i class="fa-solid" :class="selectedKeys.has(itemKey(item)) ? 'fa-check' : 'fa-plus'"></i>
              </span>
            </button>
          </div>
        </section>

        <p v-else-if="searchValue.trim()" class="item-search-status" role="status">
          <template v-if="searchValue.trim().length < 3">Type at least three characters to search.</template>
          <template v-else-if="isMarketLoading">Loading market data…</template>
          <template v-else>No matching items.</template>
        </p>
      </div>

      <section class="item-search-compare" aria-labelledby="selected-items-title">
        <header class="item-search-section-header">
          <h2 id="selected-items-title">Selected items</h2>
          <button v-if="starred.length" type="button" class="ui-button" @click="clearSelectedItems">Clear</button>
        </header>

        <p v-if="!starred.length" class="item-search-status" role="status">Add items from your search to compare prices.</p>
        <div v-else class="item-search-list">
          <div v-for="item in starred" :key="itemKey(item.info)" ref="selectedRows"
            :data-name="item.info.refName" :data-namespace="item.info.namespace" class="item-search-row" tabindex="-1">
            <div class="item-search-art">
              <ui-item-img :icon="item.info.icon || '%NOT_FOUND%'" :item-name="item.info.refName"
                :namespace="item.info.namespace" :influences="item.rawItem?.influences" />
            </div>
            <div class="item-search-copy">
              <strong :class="{ 'item-search-unique': isUnique(item) }">{{ item.info.name }}</strong>
              <template v-if="item.info.viscera">
                <small>Viscera · {{ item.info.viscera.slot }}</small>
                <select v-if="item.implicits.length > 1" class="ui-select viscera-select" :aria-label="'Implicit modifier for ' + item.info.name"
                  :value="item.implicit?.variant || ''" @change="selectImplicit(item.info, $event)">
                  <option value="" disabled>Choose an implicit modifier</option>
                  <option v-for="implicit in item.implicits" :key="implicit.variant" :value="implicit.variant">{{ implicit.text }}</option>
                </select>
                <small v-if="item.implicit" class="viscera-implicit"><span>Implicit · </span>{{ item.implicit.text }}</small>
              </template>
              <small v-else-if="item.rawItem?.isUnidentified && item.info.unique">{{ t("item.unidentified") }} · {{ ITEM_BY_REF("ITEM", item.info.unique.base)?.[0]?.name || item.info.unique.base }}</small>
              <small v-else>{{ item.variant || itemKind(item.info) }}</small>
              <button v-if="isUnique(item) && (item.rawItem || item.info.unique)" class="item-search-listings" type="button" @click="triggerPriceCheck(item)">
                {{ item.rawItem && !item.rawItem.isUnidentified ? 'Check rolls' : 'Check listings' }}
              </button>
            </div>
            <div class="item-search-price">
              <strong v-if="item.display" class="item-search-amount" :title="currencyLabel(item.display.primary.currency)">
                <core-currency-img
                  :currency="item.display.primary.currency"
                  :alt="currencyLabel(item.display.primary.currency, item.display.primary.min)"
                  class="item-search-orb"
                />
                {{ formatAmount(item.display.primary) }}
              </strong>
              <small v-else-if="isMarketLoading">Loading price…</small>
              <small v-else-if="item.implicits.length > 1 && !item.implicit">Varies by implicit</small>
              <small v-else-if="item.onExchange">No recent exchange price</small>
              <small v-else>No estimate</small>
              <small v-if="item.equivalent" class="item-search-amount" :title="currencyLabel(item.equivalent.currency)">
                <span aria-label="Approximately">≈</span>
                <core-currency-img
                  :currency="item.equivalent.currency"
                  :alt="currencyLabel(item.equivalent.currency, item.equivalent.min)"
                  class="item-search-orb item-search-orb--secondary"
                />
                {{ formatAmount(item.equivalent) }}
              </small>
            </div>
            <a v-if="item.priceUrl" :href="item.priceUrl" target="_blank" rel="noopener noreferrer" class="item-search-source-link"
              :aria-label="item.exchangeHour ? 'View Currency Exchange data' : 'Open on poe.ninja'"
              :title="item.exchangeHour ? 'View Currency Exchange data · ' + new Date(item.exchangeHour * 1000).toLocaleString() : 'Open on poe.ninja'">
              <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
            </a>
          </div>
        </div>

        <p v-if="starred.some(item => item.exchangeHour)" class="item-search-source">
          <span aria-hidden="true"></span> Currency Exchange · hourly
        </p>
      </section>
    </div>
  </div>
</template>

<script lang="ts">
import { getDetailsId } from "@/web/price-check/trends/getDetailsId";
import { ref, computed } from "vue";
import { AppConfig } from "@/web/Config";
import type { GameVersion } from "@ipc/types";
import { distance } from "fastest-levenshtein";
import {
  BaseType,
  ITEM_BY_REF,
  ITEM_BY_TRANSLATED,
  itemCatalogue,
  CLIENT_STRINGS as _$,
  GEM_NS_NAMES,
} from "@/assets/data";
import { CurrencyValue } from "@/web/background/Prices";
import { catalogueItem, indexCatalogue, searchCatalogue } from "@/assets/data/item-catalogue";
import { exchangeItem } from "./exchange-item";
import type { WidgetSpec } from "../overlay/interfaces";
import { ItemSearchWidget } from "./widget.js";

export default {
  widget: {
    type: "item-search",
    instances: "single",
    initInstance: (): ItemSearchWidget => {
      return {
        wmId: 0,
        wmType: "item-search",
        wmTitle: "{icon=fa-search}",
        wmWants: "hide",
        wmZorder: null,
        wmFlags: ["invisible-on-blur"],
        anchor: {
          pos: "tl",
          x: 10,
          y: 20,
        },
        ocrGemsKey: null,
      };
    },
  } satisfies WidgetSpec,
};

interface SelectedItem {
  implicitVariant?: string;
  info: BaseType;
  rawItem?: ParsedItem;
}

function itemKey(item: BaseType) {
  return item.namespace + ":" + item.refName;
}

function useSelectedItems() {
  const byGame = ref<Record<GameVersion, SelectedItem[]>>({ poe1: [], poe2: [] });
  const items = computed({
    get: () => byGame.value[AppConfig().game],
    set: (value) => { byGame.value[AppConfig().game] = value; },
  });

  function addItem(newItem: SelectedItem) {
    const previous = items.value.findIndex(item => itemKey(item.info) === itemKey(newItem.info));
    if (previous !== -1) {
      if (newItem.rawItem) items.value[previous] = newItem;
      return false;
    }

    items.value.push(newItem);
    return true;
  }

  function removeItem(info: BaseType) {
    const key = itemKey(info);
    items.value = items.value.filter(item => itemKey(item.info) !== key);
  }

  function clearItems() {
    items.value = [];
  }

  return { items, addItem, removeItem, clearItems };
}



function fuzzyFindHeistGem(badStr: string) {
  badStr = badStr.toLowerCase();

  const qualities = [
    ["Anomalous", _$.QUALITY_ANOMALOUS.toString().slice(2, -2)],
    ["Divergent", _$.QUALITY_DIVERGENT.toString().slice(2, -2)],
    ["Phantasmal", _$.QUALITY_PHANTASMAL.toString().slice(2, -2)],
  ];

  let bestMatch: { name: string; altQuality: string };
  let minDist = Infinity;
  for (const name of GEM_NS_NAMES()) {
    for (const [altQuality, reStr] of qualities) {
      const exactStr = reStr.replace("(.*)", name).toLowerCase();
      if (Math.abs(exactStr.length - badStr.length) > 5) {
        continue;
      }

      const dist = distance(badStr, exactStr);
      if (dist < minDist) {
        bestMatch = { name, altQuality };
        if (dist === 0) return bestMatch;
        minDist = dist;
      }
    }
  }
  return bestMatch!;
}
</script>

<script setup lang="ts">
import { shallowRef, nextTick, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { usePoeninja, formatChaosOrDivineAmount } from "@/web/background/Prices";
import { Host } from "@/web/background/IPC";
import { ParsedItem } from "@/parser";

import UiItemImg from "@/web/ui/UiItemImg.vue";
import CoreCurrencyImg from "@/web/ui/CoreCurrencyImg.vue";
import { currencyLabel } from "@/web/ui/currency-icons";

const props = defineProps<{
  config: ItemSearchWidget;
}>();
const { t } = useI18n();

const { findPriceByQuery, findCataloguePrice, isExchangeListed, marketItems, visceraImplicits,
  autoCurrency, displayPrice, queuePricesFetch, exaltedRate, isLoading: isMarketLoading } = usePoeninja();

const showTimeout = shallowRef<{ reset: () => void } | null>(null);

nextTick(() => {
  props.config.wmFlags = ["invisible-on-blur"];
});

const searchValue = shallowRef("");
const searchInput = shallowRef<HTMLInputElement>();
const { items, addItem, removeItem, clearItems } = useSelectedItems();
const selectedKeys = computed(() => new Set(items.value.map(item => itemKey(item.info))));
const selectedRows = ref<HTMLElement[]>([]);
const starred = computed(() => items.value.map(item => {
  const { info, rawItem } = item;
  const query = { ns: info.namespace, name: info.refName };
  const implicits = [...(info.viscera?.implicits ?? [])];
  if (info.viscera) {
    for (const extra of visceraImplicits(info.refName)) {
      if (!implicits.some(implicit => implicit.variant === extra.variant)) implicits.push(extra);
    }
  }
  const implicit = implicits.length === 1 ? implicits[0] : implicits.find(option => option.variant === item.implicitVariant);
  let quote;
  if (AppConfig().game === "poe1" && rawItem) {
    const details = getDetailsId(rawItem, implicits);
    quote = details && findPriceByQuery(details);
  } else if (info.viscera) {
    quote = implicit && findPriceByQuery({ ...query, variant: implicit.variant });
  } else if (AppConfig().game === "poe2" && info.unique) {
    quote = findPriceByQuery({ ...query, variant: info.unique.base });
  } else {
    quote = findCataloguePrice(query);
  }
  const price = quote ? autoCurrency(quote.primaryValue) : undefined;
  const display = price && displayPrice(price);
  const equivalent = display?.chaosEquivalent ?? (
    AppConfig().game === "poe2" && price?.currency === "div" && exaltedRate.value
      ? { currency: "exalted" as const, min: price.min * exaltedRate.value }
      : undefined
  );
  return { ...item, implicits, implicit, display, equivalent, variant: quote?.variant,
    onExchange: isExchangeListed(query),
    priceUrl: quote?.url, exchangeHour: quote && "exchangeHour" in quote ? quote.exchangeHour : undefined,
    value: quote?.primaryValue ?? 0 };
}).sort((a, b) => b.value - a.value));

function selectImplicit(info: BaseType, event: Event) {
  const selected = items.value.find(item => itemKey(item.info) === itemKey(info));
  if (selected) selected.implicitVariant = (event.target as HTMLSelectElement).value;
}

function isUnique(item: SelectedItem) {
  const ns = item.info.namespace;
  return ns === 'UNIQUE' || ns.startsWith('Unique') || item.info.unique != null;
}

function triggerPriceCheck(item: SelectedItem) {
  let clipboardText = "";
  if (item.rawItem) {
    clipboardText = item.rawItem.rawText;
  } else {
    const base = item.info.unique && ITEM_BY_REF("ITEM", item.info.unique.base)?.[0];
    if (!base) return;
    clipboardText = [
      _$.ITEM_CLASS + (base.craftable?.category ?? "Equipment"),
      _$.RARITY + _$.RARITY_UNIQUE,
      item.info.name,
      base.name,
    ].join("\n");
  }

  Host.selfDispatch({
    name: "MAIN->CLIENT::item-text",
    payload: {
      target: "price-check",
      clipboard: clipboardText,
      position: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
      focusOverlay: false,
      isManual: true,
      item: item.rawItem,
    }
  });

  window.dispatchEvent(new CustomEvent("change-tab", { detail: "price-check" }));
}

Host.onEvent("MAIN->CLIENT::ocr-text", (e) => {
  if (e.target !== "heist-gems") return;

  for (const para of e.paragraphs) {
    const res = fuzzyFindHeistGem(para);
    selectItem(ITEM_BY_TRANSLATED("GEM", res.name)![0], {
      withTimeout: true,
    });
  }
});

function selectItem(
  item: BaseType,
  opts?: { withTimeout?: true; rawItem?: ParsedItem },
) {
  queuePricesFetch();

  const isAdded = addItem({
    info: item,
    implicitVariant: item.viscera?.implicits.length === 1 ? item.viscera.implicits[0].variant : undefined,
    rawItem: opts?.rawItem,
  });
  if (isAdded && opts?.withTimeout) {
    showTimeout.value?.reset();
    props.config.wmFlags = [];
  }
}

function toggleMatch(item: BaseType) {
  if (selectedKeys.value.has(itemKey(item))) {
    removeItem(item);
  } else {
    selectItem(item);
  }
}

const searchIndex = computed(() => {
  const catalogue = itemCatalogue.value;
  const available = new Map<string, BaseType>();
  for (const [key, item] of catalogue.entries) {
    if (AppConfig().game === "poe1" || catalogue.exchange.has(item.refName)) available.set(key, item);
  }
  for (const { ns, name } of marketItems.value) {
    const namespace = (ns === "SkillGem" ? "GEM" : ns.startsWith("Unique") ? "UNIQUE" : ns) as BaseType["namespace"];
    const key = namespace + ":" + name;
    if (!available.has(key)) available.set(key, catalogue.entries.get(key) ?? catalogueItem({ namespace, name }));
  }
  return indexCatalogue(available.values());
});
const results = computed(() => searchCatalogue(searchIndex.value, searchValue.value));

function clearSelectedItems() {
  clearItems();
  props.config.wmFlags = ["invisible-on-blur"];
  searchInput.value?.focus();
}


function itemKind(item: BaseType) {
  if (item.unique || item.namespace === "UNIQUE") return "Unique";
  if (item.namespace === "GEM") return "Gem";
  if (item.namespace === "DIVINATION_CARD") return "Divination card";
  if (item.namespace === "CAPTURED_BEAST") return "Captured beast";
  return item.craftable?.category || (item.tradeTag ? "Trade item" : "Base item");
}

function formatAmount(price: Pick<CurrencyValue, "currency" | "min">) {
  const amount = price.currency === "exalted" && price.min >= 1 ? Math.round(price.min) : price.min;
  return formatChaosOrDivineAmount(amount);
}


onMounted(() => {
  const handleAddSearchItem = (e: Event) => {
    const parsedItem = (e as CustomEvent).detail as ParsedItem;
    if (!parsedItem) return;
    selectItem(exchangeItem(parsedItem) ?? parsedItem.info, { rawItem: parsedItem });
    if (parsedItem.isUnidentified && parsedItem.info.unique) {
      nextTick(() => selectedRows.value.find(row => row.dataset.namespace === "UNIQUE" &&
        row.dataset.name === parsedItem.info.refName)?.focus());
    }
  };
  window.addEventListener("add-search-item", handleAddSearchItem);
  onUnmounted(() => {
    window.removeEventListener("add-search-item", handleAddSearchItem);
  });
});
</script>

<style scoped>
.item-search {
  width: 100%;
  max-width: 66rem;
  margin-inline: auto;
  container-type: inline-size;
}

.item-search-workspace {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.6fr);
  align-items: start;
  gap: clamp(1rem, 2.4vw, 1.6rem);
}

.item-search-picker,
.item-search-compare {
  min-width: 0;
}

.item-search-field {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding-inline: 0.95rem;
  border-radius: 0.55rem;
  background: var(--raised);
  color: var(--muted);
}

.item-search-field:focus-within {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.item-search-field input {
  flex: 1;
  min-width: 0;
  min-height: 3rem;
  background: transparent;
  color: var(--ink);
  font-size: 1rem;
}

.item-search-field input:focus-visible { outline: 0; }
.item-search-field input::placeholder { color: var(--quiet); }

.item-search-matches-title {
  margin: 0.95rem 0 0.4rem;
  padding-inline: 0.2rem;
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: 600;
}

.item-search-matches {
  display: grid;
  gap: 0.2rem;
  max-block-size: min(30rem, 54dvh);
  overflow: auto;
  padding: 0.15rem 0.2rem;
  scrollbar-color: var(--line-strong) transparent;
  scrollbar-width: thin;
}

.item-search-match, .item-search-row {
  display: grid;
  grid-template-columns: minmax(3rem, max-content) minmax(0, 1fr) max-content;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
  min-height: 3.6rem;
}

.item-search-match {
  width: 100%;
  padding: 0.2rem 0.45rem;
  border-radius: 0.55rem;
  text-align: start;
}

.item-search-match:hover { background: var(--raised); }

.item-search-match:focus-visible,
.item-search-row:focus-visible {
  outline-offset: -2px;
  border-radius: 0.4rem;
}

.item-search-match[aria-pressed="true"] { background: var(--accent-wash); }

.item-search-match-action, .item-search-source-link {
  display: grid;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 0.4rem;
  font-size: 0.78rem;
}

.item-search-match-action { background: var(--surface); color: var(--muted); }
.item-search-match[aria-pressed="true"] .item-search-match-action { background: transparent; color: var(--accent); }

.item-search-compare {
  padding: 0.8rem clamp(0.7rem, 1.5vw, 1.2rem) 0.95rem;
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--surface) 93%, transparent);
}

.item-search-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  min-height: 2.25rem;
  margin-bottom: 0.25rem;
}

.item-search-section-header h2 { font: 400 1.48rem/1.2 var(--display); }

.item-search-row {
  grid-template-columns: minmax(3rem, max-content) minmax(0, 1fr) max-content 1.75rem;
  min-height: 4rem;
  padding-block: 0.4rem;
}

.item-search-row + .item-search-row { border-top: 1px solid var(--line); }
.item-search-source-link { grid-column: 4; color: var(--quiet); }
.item-search-source-link:hover { background: var(--hover); color: var(--ink); }

.item-search-art {
  display: flex;
  max-inline-size: clamp(64px, 12cqi, 10rem);
  overflow: auto;
  scrollbar-width: thin;
}

.item-search-art :deep(img) { margin-inline: auto; }

.item-search-copy {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
  overflow-wrap: anywhere;
}

.item-search-copy strong {
  color: var(--ink);
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.3;
}

.item-search-match .item-search-copy strong { font-size: 0.9rem; }
.item-search-copy small, .item-search-price small { color: var(--quiet); font-size: 0.8rem; }
.item-search-copy .item-search-unique { color: #e6ae79; }

.item-search-listings {
  justify-self: start;
  min-height: 1.6rem;
  color: var(--accent);
  font-size: 0.8rem;
  text-align: start;
}

.item-search-listings:hover { text-decoration: underline; }

.item-search-price {
  display: grid;
  justify-items: end;
  gap: 0.1rem;
  max-inline-size: 8.5rem;
  text-align: end;
  font-variant-numeric: tabular-nums;
}

.item-search-amount {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  white-space: nowrap;
}

strong.item-search-amount {
  color: #f0d3a5;
  font-size: 1.18rem;
  font-weight: 650;
}

.item-search .item-search-orb { width: 1.65rem !important; height: 1.65rem !important; }
.item-search .item-search-orb--secondary { width: 1.1rem !important; height: 1.1rem !important; }

.item-search-status,
.item-search-source {
  color: var(--muted);
  font-size: 0.85rem;
}

.item-search-status { padding: 0.7rem 0.15rem 0.35rem; }

.item-search-source {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.75rem 0 0;
  font-size: 0.75rem;
}

.item-search-source > span {
  width: 0.3rem;
  height: 0.3rem;
  border-radius: 50%;
  background: #d6a773;
}

.viscera-select { max-width: 100%; margin-top: 0.25rem; }
.item-search-copy .viscera-implicit { color: var(--ink); white-space: pre-line; }
.viscera-implicit span { color: var(--muted); }

@container (max-width: 45rem) {
  .item-search-workspace { grid-template-columns: minmax(0, 1fr); }
  .item-search-matches { max-block-size: min(16rem, 36dvh); }
}

@container (max-width: 24rem) {
  .item-search-row {
    grid-template-columns: minmax(3rem, max-content) minmax(0, 1fr) max-content 1.65rem;
    column-gap: 0.4rem;
  }
  .item-search-art { max-inline-size: max(64px, 25cqi); }
  .item-search-source-link { width: 1.65rem; }
  .item-search-price { max-inline-size: 6rem; }
  strong.item-search-amount { font-size: 1.05rem; }
}
</style>
