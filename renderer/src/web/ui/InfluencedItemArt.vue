<template>
  <span ref="element" class="influenced-item-art">
    <img :src="localBase || src" alt="" class="item-art" :class="{ separated }" v-bind="$attrs" @load="measure" @error="baseFailed" />
    <svg v-if="baked && mask" class="item-cutout" :class="{ ready: separated }"
      width="100%" height="100%" aria-hidden="true" focusable="false">
      <defs>
        <mask :id="id + '-shape'" style="mask-type: alpha">
          <image :key="src + '|' + mask" :href="mask" width="100%" height="100%" preserveAspectRatio="none"
            @load="maskLoaded" @error="maskFailed" />
        </mask>
      </defs>
      <image :href="src" width="100%" height="100%" :mask="'url(#' + id + '-shape)'" />
    </svg>
    <influence-backdrop v-for="(influence, index) in backdrops" :key="influence"
      :id-prefix="id + '-backdrop-' + index" :influence="influence" :art="localBase || mask" :size="size" :animate="animate"
      :data-influence="influence" />
    <inventory-item-art v-if="appearance || rims.length" :art="mask" :src="src" :flags="appearance ?? emptyFlags" :rims="rims" :size="size"
      :active="active" :animate="animate" />
  </span>
</template>

<script lang="ts">
import { computed, defineComponent, ref, watch, type PropType } from "vue";
import { useDocumentVisibility, useElementVisibility, useMediaQuery } from "@vueuse/core";
import { effectSource } from "./inventory/local-effects";
import { localBaseIcon } from "./inventory/textures";
import { conquerorSprite, inventoryGridSize, iconHasInfluenceBackdrop } from "@ipc/item-icons";
import type { ItemInfluence } from "@/parser/ParsedItem";
import { influenceArtOrder, isRimInfluence } from "./influence-art";
import InfluenceBackdrop from "./InfluenceBackdrop.vue";
import InventoryItemArt from "./InventoryItemArt.vue";
import type { InventoryFlags } from "@/parser/inventory-effects";

let nextArtId = 0;

export default defineComponent({
  components: { InfluenceBackdrop, InventoryItemArt },
  inheritAttrs: false,
  emits: ["error", "silhouette-error"],
  props: {
    src: { type: String, required: true },
    silhouette: { type: String, required: true },
    influences: { type: Array as PropType<readonly ItemInfluence[]>, required: true },
    appearance: Object as PropType<InventoryFlags>,
  },
  setup(props, { emit }) {
    const id = "poe-influence-" + ++nextArtId;
    const element = ref<HTMLElement>();
    const onScreen = useElementVisibility(element);
    const visibility = useDocumentVisibility();
    const motion = useMediaQuery("(prefers-reduced-motion: no-preference)");
    const active = computed(() => onScreen.value && visibility.value === "visible");
    const animate = computed(() => active.value && motion.value);
    const size = ref({ width: 94, height: 94 });
    const localBase = ref("");
    let request = 0;
    watch(() => props.src, (_, __, cleanup) => {
      request++;
      localBase.value = "";
      cleanup(() => { request++; if (localBase.value) URL.revokeObjectURL(localBase.value); });
    }, { immediate: true });
    async function baseFailed(event: Event) {
      const serial = ++request;
      const sprite = conquerorSprite(props.silhouette);
      const revision = effectSource.value.revision;
      if (!sprite || !revision || localBase.value) { emit("error", event); return; }
      try {
        const blob = await localBaseIcon(revision, sprite.key, inventoryGridSize(props.src));
        if (serial === request) localBase.value = URL.createObjectURL(blob);
      } catch { if (serial === request) emit("error", event); }
    }
    const baked = computed(() => !localBase.value && iconHasInfluenceBackdrop(props.src));
    const loaded = ref("");
    watch(() => [props.src, props.silhouette], () => {
      loaded.value = "";
    }, { flush: "sync" });

    // Signed trade art determines the item's size and colour. A clean copy supplies only its alpha.
    const mask = computed(() => props.silhouette);
    const separated = computed(() => baked.value && Boolean(mask.value) && loaded.value === mask.value);
    const layers = computed(() => baked.value && !separated.value ? [] :
      influenceArtOrder.filter(influence => props.influences.includes(influence)));

    function measure(event: Event) {
      const img = event.currentTarget as HTMLImageElement;
      size.value = { width: img.naturalWidth, height: img.naturalHeight };
    }

    function maskLoaded(event: Event) {
      const url = (event.currentTarget as SVGImageElement).getAttribute("href");
      if (url === mask.value) loaded.value = url;
    }

    function maskFailed(event: Event) {
      const url = (event.currentTarget as SVGImageElement).getAttribute("href");
      if (url === mask.value) {
        loaded.value = "";
        emit("silhouette-error", url);
      }
    }

    const rims = computed(() => layers.value.filter(isRimInfluence));
    const backdrops = computed(() => layers.value.filter(influence => !isRimInfluence(influence)));

    return { localBase, baseFailed, emptyFlags: {} as InventoryFlags, element, id, size, baked, mask, separated, rims, backdrops, active, animate, measure, maskLoaded, maskFailed };
  },
});
</script>

<style scoped>
.influenced-item-art { position: relative; display: inline-grid; isolation: isolate; vertical-align: middle; }
.item-art { position: relative; z-index: 1; }
.item-art.separated { visibility: hidden; }
.item-cutout { position: absolute; inset: 0; z-index: 1; visibility: hidden; pointer-events: none; }
.item-cutout.ready { visibility: visible; }
/* The composited frame already contains the item. Switch both layers in the
   same DOM state, including when Vue reuses a preview for the next item. */
.influenced-item-art:has(> [data-renderer="shader"], > [data-renderer="cache"]) > :is(.item-art, .item-cutout) {
  visibility: hidden;
}
</style>
