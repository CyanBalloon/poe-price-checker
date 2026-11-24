<template>
  <influenced-item-art
    v-if="effects.length"
    :influences="effects"
    :src="previewIcon"
    :class="{ 'overflow-hidden': overflowHidden }"
    @error="restoreFallback"
  />
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
import { iconHasInfluenceBackdrop, itemIconBackdropFlags, sameItemIconArt } from "@ipc/item-icons";
import InfluencedItemArt from "./InfluencedItemArt.vue";
import type { ItemInfluence } from "@/parser";
import { readListingInfluences } from "@/parser/item-influences";
import { getDynamicIcon } from "@/web/background/ImageFetcher";
import { AppConfig } from "@/web/Config";

export default defineComponent({
  components: { InfluencedItemArt },
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
    overflowHidden: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    const fallback = computed(() => props.icon && props.icon !== "%NOT_FOUND%" ? props.icon : "/images/404.png");
    const realIcon = ref(fallback.value);
    const effects = computed(() => {
      if (AppConfig()?.game !== "poe1" || realIcon.value === "/images/404.png") return [];
      if (props.influences) return props.influences;
      // Catalogued uniques can carry inherent influence in their official art descriptor.
      return props.namespace === "UNIQUE" ? readListingInfluences(itemIconBackdropFlags(realIcon.value)) : [];
    });

    const previewIcon = computed(() => {
      const base = props.baseIcon ?? fallback.value;
      return effects.value.length && iconHasInfluenceBackdrop(realIcon.value) &&
        !iconHasInfluenceBackdrop(base) && sameItemIconArt(base, realIcon.value) ? base : realIcon.value;
    });

    watch(
      () => [fallback.value, props.itemName, props.namespace, AppConfig()?.game, props.influences] as const,
      async ([base, name, namespace, game, influences], _, onInvalidate) => {
        let current = true;
        onInvalidate(() => { current = false; });
        realIcon.value = base;
        const flags = game === "poe1" ? influences ?? [] : [];
        if (!game || !name || !namespace || (base !== "/images/404.png" && !flags.length)) return;
        const fetched = await getDynamicIcon(name, namespace, flags);
        if (current && fetched) realIcon.value = fetched;
      },
      { immediate: true },
    );
    function restoreFallback() {
      if (realIcon.value === "/images/404.png") return;
      realIcon.value = realIcon.value === fallback.value ? "/images/404.png" : fallback.value;
    }
    return { realIcon, previewIcon, restoreFallback, effects };
  }
});
</script>
