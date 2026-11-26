<template>
  <influenced-item-art
    v-if="effectSource.revision && (effects.length || appearance) && silhouette"
    :key="effectSource.revision"
    :influences="effects"
    :appearance="appearance"
    :src="realIcon"
    :silhouette="silhouette"
    :class="{ 'overflow-hidden': overflowHidden }"
    @error="restoreFallback"
    @silhouette-error="skipSilhouette"
  />
  <influence-highlight v-else-if="effects.length" :src="realIcon" :influences="effects"
    :class="{ 'overflow-hidden': overflowHidden }" @error="restoreFallback" />
  <img
    v-else
    :src="realIcon"
    @error="restoreFallback"
    alt=""
    class="item-art"
    :class="{ 'overflow-hidden': overflowHidden }"
  />
</template>

<script lang="ts">
import { computed, defineComponent, ref, watch, type PropType } from "vue";
import { iconHasInfluenceBackdrop, itemIconBackdropFlags, plainItemIconUrl, sameItemIconArt, visceraSpriteUrl } from "@ipc/item-icons";
import { effectSource, refreshEffects } from "./inventory/local-effects";
import InfluenceHighlight from "./InfluenceHighlight.vue";
import InfluencedItemArt from "./InfluencedItemArt.vue";
import type { ItemInfluence } from "@/parser";
import { readListingInfluences } from "@/parser/item-influences";
import { catalogueInventory, clipboardInventory, intrinsicInfluences, inventoryEffects, type InventoryFlags } from "@/parser/inventory-effects";
import type { ParsedItem } from "@/parser";
import { getDynamicIcon } from "@/web/background/ImageFetcher";
import { AppConfig } from "@/web/Config";

export default defineComponent({
  components: { InfluencedItemArt, InfluenceHighlight },
  props: {
    icon: {
      type: String,
      required: true,
    },
    baseIcon: String,
    itemName: {
      type: String,
      required: false,
    },
    namespace: {
      type: String,
      required: false,
    },
    influences: Array as PropType<readonly ItemInfluence[]>,
    parsedItem: Object as PropType<ParsedItem>,
    inventory: Object as PropType<InventoryFlags>,
    overflowHidden: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    const fallback = computed(() => {
      if (!props.icon || props.icon === "%NOT_FOUND%") return "/images/404.png";
      return AppConfig()?.game === "poe1" ? visceraSpriteUrl(props.icon) ?? props.icon : props.icon;
    });
    const realIcon = ref(fallback.value);
    const animationsEnabled = computed(() => AppConfig()?.game === "poe1" && AppConfig().poe1ItemAnimations !== false);
    const appearance = computed(() => {
      if (!animationsEnabled.value || realIcon.value === "/images/404.png") return;
      const flags = props.inventory ?? (props.parsedItem ? clipboardInventory(props.parsedItem) :
        catalogueInventory({ refName: props.itemName ?? "", namespace: props.namespace === "UNIQUE" ? "UNIQUE" : props.namespace === "GEM" ? "GEM" : "ITEM", icon: realIcon.value }));
      return inventoryEffects(flags).length ? flags : undefined;
    });
    const effects = computed(() => {
      if (!animationsEnabled.value || realIcon.value === "/images/404.png") return [];
      const instance = props.influences ?? (props.namespace === "UNIQUE" ? readListingInfluences(itemIconBackdropFlags(realIcon.value)) : []);
      // Currency and fragments can carry a fixed visual without having a searchable equipment influence.
      return [...new Set([...instance, ...intrinsicInfluences(realIcon.value)])];
    });

    watch([realIcon, appearance, effects], () => { if (appearance.value || effects.value.length) return refreshEffects(); }, { immediate: true });
    const failedIcons = new Set<string>();
    const failedSilhouettes = ref<string[]>([]);
    const silhouette = computed(() => {
      if (appearance.value) {
        const plain = plainItemIconUrl(realIcon.value) ?? visceraSpriteUrl(realIcon.value);
        if (plain && !failedSilhouettes.value.includes(plain)) return plain;
      }
      if (!effects.value.length || !iconHasInfluenceBackdrop(realIcon.value)) return realIcon.value;
      const base = props.baseIcon ?? fallback.value;
      if (!failedSilhouettes.value.includes(base) && !iconHasInfluenceBackdrop(base) && sameItemIconArt(base, realIcon.value)) return base;
      const plain = plainItemIconUrl(realIcon.value);
      return plain && !failedSilhouettes.value.includes(plain) ? plain : undefined;
    });
    function skipSilhouette(url: string) {
      failedSilhouettes.value.push(url);
    }

    watch(
      () => [fallback.value, props.itemName, props.namespace, AppConfig()?.game, props.influences] as const,
      async ([base, name, namespace, game, influences], _, onInvalidate) => {
        let current = true;
        onInvalidate(() => { current = false; });
        failedIcons.clear();
        failedSilhouettes.value = [];
        realIcon.value = base;
        const flags = game === "poe1" ? influences ?? [] : [];
        if (!game || !name || !namespace || (base !== "/images/404.png" && !flags.length)) return;
        const fetched = await getDynamicIcon(name, namespace, flags);
        if (current && fetched) realIcon.value = fetched;
      },
      { immediate: true },
    );
    async function restoreFallback() {
      if ((appearance.value || effects.value.length) && !effectSource.value.revision) {
        const icon = realIcon.value;
        await refreshEffects();
        if (icon !== realIcon.value || effectSource.value.revision) return;
      }
      if (realIcon.value === "/images/404.png") return;
      failedIcons.add(realIcon.value);
      realIcon.value = [fallback.value, props.icon].find(icon =>
        icon && icon !== "%NOT_FOUND%" && !failedIcons.has(icon)) ?? "/images/404.png";
    }
    return { realIcon, effectSource, silhouette, restoreFallback, skipSilhouette, effects, appearance };
  }
});
</script>
