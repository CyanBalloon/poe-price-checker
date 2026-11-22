<template>
  <div class="item-search">
    <header class="view-heading">
      <h1>Item Search</h1>
    </header>

    <label class="item-search-field">
      <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
      <input
        v-model="searchValue"
        type="search"
        placeholder="Search items by name"
        aria-label="Search items by name"
        autocomplete="off"
        spellcheck="false"
      />
    </label>

    <section v-if="starred.length" class="item-search-section" aria-labelledby="selected-items-title">
      <header class="item-search-section-header">
        <h2 id="selected-items-title">Selected items</h2>
        <button type="button" class="ui-button" @click="clearSelectedItems">Clear</button>
      </header>
      <div class="item-search-list">
        <div v-for="item in starred" :key="item.info.namespace + ':' + item.info.refName" class="item-search-row">
          <div class="item-search-art">
            <ui-item-img :icon="item.info.icon || '%NOT_FOUND%'" :item-name="item.info.refName" :namespace="item.info.namespace" />
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
            <small v-else>{{ item.variant || itemKind(item.info) }}</small>
          </div>
          <div class="item-search-price">
            <strong v-if="item.display" class="ui-value">{{ formatPrice(item.display.primary) }}</strong>
            <small v-else-if="isMarketLoading">Loading price…</small>
            <small v-else-if="item.implicits.length > 1 && !item.implicit">Varies by implicit</small>
            <small v-else>No estimate</small>
            <small v-if="item.display?.chaosEquivalent">≈ {{ formatPrice(item.display.chaosEquivalent) }}</small>
            <small v-if="item.price?.currency === 'div' && AppConfig().game === 'poe2' && exaltedRate">{{ Math.round(item.price.min * exaltedRate) }} ex</small>
          </div>
          <div class="item-search-actions">
            <button v-if="isUnique(item) && (item.rawItem || item.info.unique)" class="ui-button" type="button" @click="triggerPriceCheck(item)">
              {{ item.rawItem ? 'Check rolls' : 'Check listings' }}
            </button>
            <a v-if="item.ninjaUrl" :href="item.ninjaUrl" target="_blank" rel="noopener noreferrer" class="ui-icon-button" aria-label="Open on poe.ninja" title="Open on poe.ninja">
              <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
            </a>
          </div>
        </div>
      </div>
    </section>

    <section v-if="results && results.length" class="item-search-section" aria-labelledby="search-matches-title">
      <header class="item-search-section-header">
        <h2 id="search-matches-title">Matches</h2>
      </header>
      <div class="item-search-matches">
        <button
          v-for="item in results"
          :key="item.namespace + ':' + item.refName"
          type="button"
          class="item-search-row"
          @click="selectItem(item)"
        >
          <span class="item-search-art">
            <ui-item-img :icon="item.icon || '%NOT_FOUND%'" :item-name="item.refName" :namespace="item.namespace" />
          </span>
          <span class="item-search-copy">
            <strong :class="{ 'item-search-unique': item.unique }">{{ item.name }}</strong>
            <small v-if="item.viscera">Viscera · {{ item.viscera.slot }}</small>
            <small v-else>{{ item.unique?.base || itemKind(item) }}</small>
          </span>
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
        </button>
      </div>
    </section>

    <div v-else-if="searchValue.trim() || !starred.length" class="ui-empty item-search-empty" role="status">
      <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
      <p v-if="searchValue.trim().length < 3">Type at least three characters to search.</p>
      <p v-else-if="isMarketLoading && AppConfig().game === 'poe2'">Loading market data…</p>
      <p v-else>No matching items.</p>
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

function useSelectedItems() {
  const byGame = ref<Record<GameVersion, SelectedItem[]>>({ poe1: [], poe2: [] });
  const items = computed({
    get: () => byGame.value[AppConfig().game],
    set: (value) => { byGame.value[AppConfig().game] = value; },
  });

  function addItem(newItem: SelectedItem) {
    const previous = items.value.findIndex(item => item.info.namespace === newItem.info.namespace
      && item.info.refName === newItem.info.refName);
    if (previous !== -1) {
      if (newItem.rawItem) items.value[previous] = newItem;
      return false;
    }

    if (items.value.length < 5) {
      items.value.push(newItem);
    } else {
      items.value = [newItem];
    }
    return true;
  }

  function clearItems() {
    items.value = [];
  }

  return { items, addItem, clearItems };
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
import { usePoeninja, formatChaosOrDivineAmount } from "@/web/background/Prices";
import { Host } from "@/web/background/IPC";
import { ParsedItem } from "@/parser";

import UiItemImg from "@/web/ui/UiItemImg.vue";

const props = defineProps<{
  config: ItemSearchWidget;
}>();

const { findPriceByQuery, findCataloguePrice, marketItems, visceraImplicits, autoCurrency, displayPrice, queuePricesFetch, exaltedRate, isLoading: isMarketLoading } = usePoeninja();

const showTimeout = shallowRef<{ reset: () => void } | null>(null);

nextTick(() => {
  props.config.wmFlags = ["invisible-on-blur"];
});

const searchValue = shallowRef("");
const { items, addItem, clearItems } = useSelectedItems();
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
    const details = getDetailsId(rawItem);
    quote = details && findPriceByQuery(details);
  } else if (info.viscera) {
    quote = implicit && findPriceByQuery({ ...query, variant: implicit.variant });
  } else if (AppConfig().game === "poe2" && info.unique) {
    quote = findPriceByQuery({ ...query, variant: info.unique.base });
  } else {
    quote = findCataloguePrice(query);
  }
  const price = quote ? autoCurrency(quote.primaryValue) : undefined;
  return { ...item, implicits, implicit, price, display: price && displayPrice(price), variant: quote?.variant,
    ninjaUrl: quote?.url, value: quote?.primaryValue ?? 0 };
}).sort((a, b) => b.value - a.value));

function selectImplicit(info: BaseType, event: Event) {
  const selected = items.value.find(item => item.info.refName === info.refName && item.info.namespace === info.namespace);
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
    rawItem: opts?.rawItem,
  });
  if (isAdded && opts?.withTimeout) {
    showTimeout.value?.reset();
    props.config.wmFlags = [];
  }
  searchValue.value = "";
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
}


function itemKind(item: BaseType) {
  if (item.unique || item.namespace === "UNIQUE") return "Unique";
  if (item.namespace === "GEM") return "Gem";
  if (item.namespace === "DIVINATION_CARD") return "Divination card";
  if (item.namespace === "CAPTURED_BEAST") return "Captured beast";
  return item.craftable?.category || (item.tradeTag ? "Trade item" : "Base item");
}

function formatPrice(price?: CurrencyValue) {
  if (!price) return "";
  if (price.currency === "chaos") return formatChaosOrDivineAmount(price.min) + " chaos";
  if (price.currency === "div") {
    return `${Number(price.min.toFixed(2))} div`;
  }
  return `${Math.round(price.min)} ${price.currency}`;
}


onMounted(() => {
  const handleAddSearchItem = (e: Event) => {
    const parsedItem = (e as CustomEvent).detail as ParsedItem;
    if (!parsedItem) return;
    selectItem(exchangeItem(parsedItem) ?? parsedItem.info, { rawItem: parsedItem });
  };
  window.addEventListener("add-search-item", handleAddSearchItem);
  onUnmounted(() => {
    window.removeEventListener("add-search-item", handleAddSearchItem);
  });
});
</script>

<style scoped>
.viscera-select { max-width: 100%; margin-top: 0.4rem; }
.item-search-copy .viscera-implicit { color: var(--ink); white-space: pre-line; }
.viscera-implicit span { color: var(--muted); }
.item-search { max-width: 66rem; margin: 0 auto; }
.item-search-field { display: flex; align-items: center; gap: 0.8rem; padding: 0 1rem; border-radius: 0.45rem; background: var(--surface); color: var(--muted); }
.item-search-field:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
.item-search-field input { min-width: 0; flex: 1; min-height: 3.15rem; background: transparent; color: var(--ink); font-size: 1rem; }
.item-search-field input:focus-visible { outline: 0; }
.item-search-field input::placeholder { color: var(--quiet); }
.item-search-section { margin-top: 2rem; }
.item-search-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem; }
.item-search-section-header h2 { font: 500 1.5rem/1.25 var(--display); }
.item-search-list, .item-search-matches { display: grid; min-width: 0; }
.item-search-matches { grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr)); gap: 0 2rem; }
.item-search-row { display: flex; align-items: center; min-width: 0; gap: 0.8rem; padding: 0.6rem 0.4rem; text-align: left; }
.item-search-art { display: flex; flex: none; min-width: 3.2rem; max-width: 48%; overflow: auto; }
.item-search-art :deep(img) { margin-inline: auto; }
.item-search-copy, .item-search-price { display: grid; min-width: 0; gap: 0.25rem; }
.item-search-copy { flex: 1; overflow-wrap: anywhere; }
.item-search-copy strong { color: var(--ink); font-size: 1rem; font-weight: 550; }
.item-search-copy small, .item-search-price small { color: var(--quiet); font-size: 0.8rem; }
.item-search-copy .item-search-unique { color: #e6ae79; }
.item-search-price { text-align: right; font-variant-numeric: tabular-nums; }
.item-search-actions { display: flex; align-items: center; }
.item-search-matches button:hover { background: var(--surface); }
.item-search-matches i { color: var(--accent); }
.item-search-empty { min-height: 7rem; }
@media (max-width: 42rem) {
  .item-search-list .item-search-row { flex-wrap: wrap; }
  .item-search-actions { margin-left: auto; }
}
</style>
