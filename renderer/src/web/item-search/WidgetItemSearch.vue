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
        <div v-for="item in starred" :key="item.info.refName + (item.discr || '')" class="item-search-row">
          <div class="item-search-art">
            <ui-item-img :icon="item.info.icon || '%NOT_FOUND%'" :item-name="item.info.refName" :namespace="item.info.namespace" />
          </div>
          <div class="item-search-copy">
            <strong :class="{ 'item-search-unique': isUnique(item) }">{{ item.info.name }}</strong>
            <small>{{ item.discr ? t(item.discr) : itemKind(item.info) }}</small>
          </div>
          <div class="item-search-price">
            <strong v-if="item.display" class="ui-value">{{ formatPrice(item.display.primary) }}</strong>
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
          @click="selectItem(item, { unique: item.unique ? true : undefined })"
        >
          <span class="item-search-art">
            <ui-item-img :icon="item.icon || '%NOT_FOUND%'" :item-name="item.refName" :namespace="item.namespace" />
          </span>
          <span class="item-search-copy">
            <strong :class="{ 'item-search-unique': item.unique }">{{ item.name }}</strong>
            <small>{{ item.unique?.base || itemKind(item) }}</small>
          </span>
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
        </button>
      </div>
    </section>

    <div v-else-if="searchValue.trim() || !starred.length" class="ui-empty item-search-empty" role="status">
      <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
      <p v-if="isMarketLoading">Loading market data…</p>
      <p v-else-if="searchValue.trim().length < 3">Type at least three characters to search.</p>
      <p v-else>No matching items.</p>
    </div>
  </div>
</template>

<script lang="ts">
import { getDetailsId } from "@/web/price-check/trends/getDetailsId";
import { ref } from "vue";
import type { GameVersion } from "@ipc/types";
import { distance } from "fastest-levenshtein";
import {
  BaseType,
  ITEM_BY_REF,
  ITEM_BY_TRANSLATED,
  CLIENT_STRINGS as _$,
  GEM_NS_NAMES,
} from "@/assets/data";
import { CurrencyValue } from "@/web/background/Prices";
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
  info: BaseType;
  discr?: string;
  chaos?: number;
  price?: CurrencyValue;
  ninjaUrl?: string;
  rawItem?: ParsedItem;
}

function useSelectedItems() {
  const byGame = ref<Record<GameVersion, SelectedItem[]>>({ poe1: [], poe2: [] });
  const items = computed({
    get: () => byGame.value[AppConfig().game],
    set: (value) => { byGame.value[AppConfig().game] = value; },
  });

  function addItem(newItem: SelectedItem) {
    if (
      items.value.some(
        (item) =>
          item.info.name === newItem.info.name && item.discr === newItem.discr,
      )
    )
      return false;

    if (items.value.length < 5) {
      items.value.push(newItem);
      items.value.sort((a, b) => {
        return (b.chaos ?? 0) - (a.chaos ?? 0);
      });
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
import { shallowRef, computed, nextTick, onMounted, onUnmounted } from "vue";
import { useI18nNs } from "@/web/i18n";
import { usePoeninja, formatChaosOrDivineAmount } from "@/web/background/Prices";
import { Host } from "@/web/background/IPC";
import { ItemRarity } from "@/parser/ParsedItem";
import { ParsedItem } from "@/parser";
import { AppConfig } from "@/web/Config";

import UiItemImg from "@/web/ui/UiItemImg.vue";

const props = defineProps<{
  config: ItemSearchWidget;
}>();

const { t } = useI18nNs("item_search");
const { findPriceByQuery, autoCurrency, displayPrice, queuePricesFetch, exaltedRate, searchNinjaItems, isLoading: isMarketLoading } = usePoeninja();

const showTimeout = shallowRef<{ reset: () => void } | null>(null);

nextTick(() => {
  props.config.wmFlags = ["invisible-on-blur"];
});

const searchValue = shallowRef("");
const { items, addItem, clearItems } = useSelectedItems();
const starred = computed(() => items.value.map(item => ({
  ...item,
  display: item.price ? displayPrice(item.price) : undefined,
})));

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
  opts?: { unique?: true; withTimeout?: true; rawItem?: ParsedItem },
) {
  queuePricesFetch();

  let price: ReturnType<typeof findPriceByQuery>;
  if (opts?.rawItem && AppConfig().game === "poe1") {
    const details = getDetailsId(opts.rawItem);
    price = details ? findPriceByQuery(details) : null;
  } else if (AppConfig().game === "poe1") {
    const match = searchNinjaItems(item.refName).find((entry) =>
      entry.name === item.refName && entry.ns === item.namespace,
    );
    price = findPriceByQuery(match ?? { ns: item.namespace, name: item.refName });
  } else if (opts?.unique) {
    price = findPriceByQuery({
      ns: item.namespace,
      name: item.refName,
      variant: item.unique!.base,
    });
  } else {
    price = findPriceByQuery({
      ns: item.namespace,
      name: item.refName,
    });
  }
  const isAdded = addItem({
    info: item,
    chaos: price?.primaryValue,
    price: price != null ? autoCurrency(price.primaryValue) : undefined,
    ninjaUrl: price?.url,
    rawItem: opts?.rawItem,
  });
  if (isAdded && opts?.withTimeout) {
    showTimeout.value?.reset();
    props.config.wmFlags = [];
  }
  searchValue.value = "";
}

const results = computed(() => {
  const ninjaResults = searchNinjaItems(searchValue.value.trim());
  if (ninjaResults.length === 0 && searchValue.value.length >= 3) return [];
  if (ninjaResults.length === 0) return false;

  return ninjaResults.map((res) => {
    let localNs = res.ns;
    if (localNs === "SkillGem") localNs = "GEM";
    if (localNs === "UniqueWeapon" || localNs === "UniqueArmour" || localNs === "UniqueAccessory" || localNs === "UniqueFlask" || localNs === "UniqueJewel") localNs = "UNIQUE";
    
    let localMatches = ITEM_BY_REF(localNs as BaseType["namespace"], res.name);
    if (!localMatches || localMatches.length === 0) {
      localMatches = ITEM_BY_TRANSLATED("ITEM", res.name);
    }
    const localItem = localMatches?.[0];
    if (localItem) return localItem;
    return {
      name: res.name,
      refName: res.name,
      namespace: res.ns,
      icon: "",
    } as BaseType;
  });
});

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
    selectItem(parsedItem.info, {
      unique: parsedItem.rarity === ItemRarity.Unique ? true : undefined,
      rawItem: parsedItem,
    });
  };
  window.addEventListener("add-search-item", handleAddSearchItem);
  onUnmounted(() => {
    window.removeEventListener("add-search-item", handleAddSearchItem);
  });
});
</script>

<style scoped>
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
