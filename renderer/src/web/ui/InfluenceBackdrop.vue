<template>
  <svg class="influence-backdrop" :class="{ 'eater-light': eater }" width="100%" height="100%"
    :viewBox="elder ? '0 0 100 100' : undefined" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <template v-if="influence === ItemInfluence.Shaper">
      <defs>
        <pattern :id="idPrefix + '-sky'" patternUnits="userSpaceOnUse" width="256" height="256">
          <image :href="asset('shaper-sky')" width="256" height="256" />
        </pattern>
        <filter :id="idPrefix + '-wind'" x="-6%" y="-6%" width="112%" height="112%" color-interpolation-filters="sRGB">
          <feImage :href="asset('shaper-distortion')" width="100%" height="100%" preserveAspectRatio="none" result="wind" />
          <feDisplacementMap in="SourceGraphic" in2="wind" xChannelSelector="R" yChannelSelector="G" scale="3">
            <animate v-if="animate" attributeName="scale" values="3;7;3" dur="6.4s" repeatCount="indefinite" />
          </feDisplacementMap>
        </filter>
        <mask :id="idPrefix + '-cloud'" style="mask-type: alpha">
          <image :href="asset('shaper-mask')" width="100%" height="100%" preserveAspectRatio="none" :filter="url('wind')">
            <animateTransform v-if="animate" attributeName="transform" type="translate" values="0 0;.85 .6;0 0"
              dur="5.3s" repeatCount="indefinite" />
          </image>
        </mask>
      </defs>
      <g :mask="url('cloud')">
        <g>
          <animateTransform v-if="animate" attributeName="transform" type="translate"
            from="0 0" to="-256 0" dur="49s" repeatCount="indefinite" />
          <g>
            <animateTransform v-if="animate" attributeName="transform" type="translate"
              from="0 0" to="0 -256" dur="83s" repeatCount="indefinite" />
            <rect :width="size.width + 256" :height="size.height + 256" :fill="url('sky')" />
          </g>
        </g>
      </g>
    </template>

    <template v-else-if="elder">
      <g v-for="layer in [2, 1]" :key="layer">
        <defs>
          <mask :id="idPrefix + '-fixed-' + layer" style="mask-type: luminance">
            <rect width="100" height="100" fill="white" />
            <image :href="tentacle(layer, '-flex')" width="100" height="100" preserveAspectRatio="none" />
          </mask>
          <mask :id="idPrefix + '-flex-' + layer" style="mask-type: alpha">
            <image :href="tentacle(layer, '-flex')" width="100" height="100" preserveAspectRatio="none" />
          </mask>
        </defs>
        <image :href="tentacle(layer)" width="100" height="100" preserveAspectRatio="none" :mask="url('fixed-' + layer)" />
        <g :mask="url('flex-' + layer)">
          <image :href="tentacle(layer)" width="100" height="100" preserveAspectRatio="none">
            <animateTransform v-if="animate" attributeName="transform" type="rotate"
              :values="layer === 1 ? '-1.8 50 42;2.4 50 42;-1.8 50 42' : '2.1 52 62;-2.7 52 62;2.1 52 62'"
              calcMode="spline" keyTimes="0;.5;1" keySplines=".42 0 .58 1;.42 0 .58 1"
              :dur="layer === 1 ? '4.3s' : '5.7s'" repeatCount="indefinite" />
          </image>
        </g>
      </g>
    </template>

    <template v-else>
      <defs>
        <mask :id="idPrefix + '-item'" style="mask-type: alpha">
          <image :href="art" width="100%" height="100%" preserveAspectRatio="none" />
        </mask>
        <filter :id="idPrefix + '-reach'" x="-20%" y="-20%" width="140%" height="140%">
          <feMorphology in="SourceAlpha" operator="dilate" radius="2.5" />
          <feGaussianBlur stdDeviation="2" />
        </filter>
        <mask :id="idPrefix + '-halo'" style="mask-type: alpha">
          <image :href="art" width="100%" height="100%" preserveAspectRatio="none" :filter="url('reach')" />
        </mask>
        <filter :id="idPrefix + '-edge'" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
          <feMorphology in="SourceAlpha" operator="dilate" radius="1" result="edge" />
          <feComposite in="edge" in2="SourceAlpha" operator="out" result="outside" />
          <feFlood :flood-color="eater ? '#48cbdf' : '#ef3852'" />
          <feComposite in2="outside" operator="in" />
        </filter>
        <template v-if="eater">
          <pattern :id="idPrefix + '-current'" width="188" height="188" patternUnits="userSpaceOnUse">
            <image :href="asset('eater-current')" width="188" height="188" />
          </pattern>
          <radialGradient v-for="(radius, index) in ['34%', '75%']" :id="idPrefix + '-ring-' + index" :key="radius" :r="radius">
            <stop offset=".55" stop-color="white" stop-opacity="0" />
            <stop offset=".83" stop-color="white" />
            <stop offset="1" stop-color="white" stop-opacity="0" />
            <animate v-if="animate" attributeName="r" values="3%;100%" dur="9s"
              :begin="index ? '-6.5s' : '-2s'" repeatCount="indefinite" />
          </radialGradient>
          <mask :id="idPrefix + '-wave'" style="mask-type: alpha">
            <rect width="100%" height="100%" :fill="url('ring-0')" />
            <rect width="100%" height="100%" :fill="url('ring-1')" />
          </mask>
        </template>
      </defs>
      <template v-if="eater">
        <g :mask="url('halo')">
          <g :fill="url('current')">
            <rect width="100%" height="100%" opacity=".12" />
            <rect width="100%" height="100%" :mask="url('wave')" opacity=".55" />
          </g>
        </g>
        <rect width="100%" height="100%" :mask="url('item')" :fill="url('current')" opacity=".12" />
      </template>
      <template v-else>
        <image :href="asset('exarch-heat')" width="100%" height="100%" preserveAspectRatio="none" opacity=".83">
          <animateTransform v-if="animate" attributeName="transform" type="translate"
            values="0 0;1.5 -2.4;-.8 -1.2;0 0" dur="4.7s" repeatCount="indefinite" />
          <animate v-if="animate" attributeName="opacity" values=".83;.64;.95;.83" dur="3.4s" repeatCount="indefinite" />
        </image>
        <rect width="100%" height="100%" :mask="url('halo')" fill="#a61620" opacity=".22">
          <animate v-if="animate" attributeName="opacity" values=".22;.38;.22" dur="3.7s" repeatCount="indefinite" />
        </rect>
      </template>
      <image :href="art" width="100%" height="100%" preserveAspectRatio="none" :filter="url('edge')" :opacity="eater ? .22 : .27" />
    </template>
  </svg>
</template>

<script lang="ts">
import { computed, defineComponent, shallowRef, watch, type PropType } from "vue";
import { ItemInfluence } from "@/parser/ParsedItem";
import { effectSource, resource } from "./inventory/local-effects";
import { elderArtSize } from "./influence-art";

// Inventory textures from Art/2DArt/UIEffects. The Elder flex maps weight the movement of each arm.


export default defineComponent({
  props: {
    influence: { type: String as PropType<ItemInfluence>, required: true },
    idPrefix: { type: String, required: true },
    art: { type: String, required: true },
    size: { type: Object as PropType<{ width: number; height: number }>, required: true },
    animate: Boolean,
  },
  setup(props) {
    const elder = computed(() => props.influence === ItemInfluence.Elder);
    const eater = computed(() => props.influence === ItemInfluence.EaterOfWorlds);
    const sizeKey = computed(() => elderArtSize(props.size.width, props.size.height));
    const urls = shallowRef<Record<string, string>>({});
    watch([() => props.influence, sizeKey, () => effectSource.value.revision], async ([influence, shape, revision], _, cleanup) => {
      let active = true;
      const loaded: Record<string, string> = {};
      cleanup(() => { active = false; Object.values(loaded).forEach(url => URL.revokeObjectURL(url)); });
      urls.value = {};
      if (!revision) return;
      const names = influence === ItemInfluence.Elder ? [1, 2].flatMap(layer => ["", "-flex"].map(suffix => `elder-${shape}-${layer}${suffix}`)) :
        influence === ItemInfluence.Shaper ? ["shaper-sky", "shaper-mask", "shaper-distortion"] :
        [influence === ItemInfluence.EaterOfWorlds ? "eater-current" : "exarch-heat"];
      await Promise.all(names.map(async name => {
        try {
          const bytes = await resource(revision, "backdrop/" + name);
          if (active) loaded[name] = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
        } catch { /* Display the item's ordinary art when this material is unavailable. */ }
      }));
      if (active) urls.value = loaded;
    }, { immediate: true });
    const asset = (name: string) => urls.value[name];
    const tentacle = (layer: number, suffix = "") => asset(`elder-${sizeKey.value}-${layer}${suffix}`);
    const url = (name: string) => `url(#${props.idPrefix}-${name})`;
    return { asset, url, tentacle, ItemInfluence, elder, eater };
  },
});
</script>

<style scoped>
.influence-backdrop { position: absolute; inset: 0; pointer-events: none; }
.eater-light { z-index: 2; }
</style>
