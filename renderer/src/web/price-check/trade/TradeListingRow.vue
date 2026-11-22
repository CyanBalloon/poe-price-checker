<template>
  <div class="listing-row" @mouseenter="onMouseEnter" @mouseleave="onMouseLeave">
    <div class="listing-value">
      <div>
        <core-currency-img :currency="res.priceCurrency" />
        <strong class="ui-value">{{ res.priceAmount }}</strong>
        <span>{{ currencyLabel(res.priceCurrency, res.priceAmount) }}</span>
        <small v-if="res.listedTimes > 2" :title="res.listedTimes + ' matching listings'">×{{ res.listedTimes }}</small>
      </div>
      <small v-if="res.normalizedPrice && res.normalizedPriceCurrency && res.priceCurrency !== res.normalizedPriceCurrency.id && !(res.priceCurrency === 'divine' && res.normalizedPriceCurrency.id === 'div')">
        ≈ {{ res.normalizedPrice }} {{ res.normalizedPriceCurrency.abbrev }}
      </small>
    </div>

    <div class="listing-attributes">
      <span v-if="res.displayItem.mapTier">Tier <b>{{ res.displayItem.mapTier }}</b></span>
      <span v-if="res.displayItem.atlasDrops">Atlas Drops <b>{{ res.displayItem.atlasDrops }}</b></span>
      <span v-if="filters.itemLevel && res.itemLevel">iLvl <b>{{ res.itemLevel }}</b></span>
      <span v-if="item.stackSize && res.stackSize != null">Stock <b>{{ res.stackSize }}</b></span>
      <span v-if="item.category === ItemCategory.Gem && res.gemSockets != null">Sockets <b>{{ res.gemSockets }}</b></span>
      <span v-if="res.quality != null && ((quality && !quality.disabled) || item.category === ItemCategory.Gem)">Quality <b>{{ formatQuality(res.quality) }}</b></span>
      <span v-if="item.category === ItemCategory.Gem || item.category === ItemCategory.UncutGem">Level <b>{{ res.level }}</b></span>
    </div>

    <div class="listing-seller">
      <span v-if="showSeller !== false">
        <i class="listing-status" :data-status="res.accountStatus" :title="res.accountStatus"></i>
        {{ showSeller === 'ign' ? res.ign : res.accountName }}
      </span>
      <small>
        {{ res.relativeDate }}
        <span v-if="res.isMine">· Yours</span>
        <span v-if="res.inDemand">· In demand</span>
        <span v-if="res.gone">· Gone</span>
      </small>
    </div>

    <button type="button" class="ui-button listing-link" title="Open listing search" aria-label="Open listing search" :disabled="opening" :aria-busy="opening" @click.stop="openTradeLink">
      <span>{{ opening ? "Opening…" : "Open trade" }}</span><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
    </button>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType, inject, Ref } from "vue";
import { PricingResult } from "./pathofexile-trade";
import { ParsedItem, ItemCategory } from "@/parser";
import { ItemFilters } from "../filters/interfaces";
import { PriceCheckWidget } from "@/web/overlay/interfaces";
import CoreCurrencyImg from "@/web/ui/CoreCurrencyImg.vue";
import { currencyLabel } from "@/web/ui/currency-icons";

interface HoveredListingState {
  res: PricingResult;
  mouseY: number;
}

export default defineComponent({
  name: "TradeListingRow",
  components: { CoreCurrencyImg },
  props: {
    opening: Boolean,
    res: {
      type: Object as PropType<PricingResult & { listedTimes: number }>,
      required: true,
    },
    item: {
      type: Object as PropType<ParsedItem>,
      required: true,
    },
    filters: {
      type: Object as PropType<ItemFilters>,
      required: true,
    },
    quality: {
      type: Object as PropType<ItemFilters["quality"]>,
      default: undefined,
    },
    showSeller: {
      type: String as PropType<PriceCheckWidget["showSeller"]>,
      required: true,
    },
  },
  emits: ["open-link"],
  setup(props, { emit }) {
    const hoveredListing = inject<Ref<HoveredListingState | null>>("hovered-listing");

    function onMouseEnter(e: MouseEvent) {
      if (hoveredListing) {
        hoveredListing.value = {
          res: props.res,
          mouseY: e.clientY,
        };
      }
    }

    function onMouseLeave() {
      if (hoveredListing) {
        hoveredListing.value = null;
      }
    }

    function formatQuality(val: string | number | undefined) {
      if (val == null) return "";
      let s = String(val);
      if (!s.startsWith("+")) s = "+" + s;
      if (!s.endsWith("%")) s = s + "%";
      return s;
    }

    function openTradeLink() {
      emit("open-link", props.res);
    }

    return {
      onMouseEnter,
      onMouseLeave,
      currencyLabel,
      openTradeLink,
      formatQuality,
      ItemCategory,
    };
  },
});
</script>
