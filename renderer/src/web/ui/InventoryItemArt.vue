<template>
  <span class="inventory-art" :data-effects="effects.join(',')" :data-renderer="mode">
    <canvas v-show="!still || displayedStill !== still" ref="canvas" :width="size.width" :height="size.height"
      :data-mipmaps="mipmaps" aria-hidden="true" />
    <img v-if="still" v-show="displayedStill === still" :src="still" alt="" aria-hidden="true" @load="showStill" />
  </span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { conquerorSprite, inventoryGridSize } from "@ipc/item-icons";
import { inventoryEffects, type InventoryFlags } from "@/parser/inventory-effects";
import type { RimInfluence } from "./influence-art";
import { effectSource } from "./inventory/local-effects";
import { previewFrames } from "./inventory/frames";
import { openInventoryArt } from "./inventory/render";

const props = defineProps<{
  art: string; src: string; flags: InventoryFlags; rims: readonly RimInfluence[];
  size: { width: number; height: number }; active: boolean; animate: boolean;
}>();
const canvas = ref<HTMLCanvasElement>();
const still = ref("");
const displayedStill = ref("");
const mode = ref<"loading" | "cache" | "shader" | "fallback">("loading");
const mipmaps = ref<"client" | "generated">();
const effects = computed(() => inventoryEffects(props.flags));
const moving = computed(() => props.animate && (props.rims.length > 0 || effects.value.some(e => e !== "vestigial")));

function showStill(event: Event) {
  if ((event.currentTarget as HTMLImageElement).getAttribute("src") === still.value) displayedStill.value = still.value;
}

watch([canvas, () => props.art, () => props.src, () => props.flags, () => props.rims, () => props.active,
  () => props.size.width, () => props.size.height, moving, () => effectSource.value.revision], async (
  [target, art, src, flags, rims, active, width, height, animate, revision], _, cleanup,
) => {
  const abort = new AbortController();
  let frame = 0;
  cleanup(() => { cancelAnimationFrame(frame); abort.abort(); });
  still.value = ""; displayedStill.value = ""; mode.value = "loading"; mipmaps.value = undefined;
  if (!active || !target || !revision) return;
  const output = target.getContext("2d");
  const sprite = conquerorSprite(art);
  if (!output || !sprite) { mode.value = "fallback"; return; }
  output.clearRect(0, 0, width, height);
  const grid = inventoryGridSize(src);
  let hash = 0;
  for (const char of sprite.key) hash = Math.imul(hash, 31) + char.charCodeAt(0) | 0;
  const passes = effects.value;
  const rimOnly = !passes.length && rims.length > 0;
  const phase = rimOnly ? (hash >>> 0) % 600 / 60 : 0;
  const seed = rimOnly ? 0 : (hash >>> 0) % 1000 / 1000;
  let cached: Awaited<ReturnType<typeof previewFrames>>;
  let scene: Awaited<ReturnType<typeof openInventoryArt>> | undefined;
  function draw(now: number) {
    if (abort.signal.aborted) return;
    try {
      if (scene) {
        scene.draw(phase + (animate ? now / 1000 : 1.25), seed);
        cached?.capture(target!, now);
      } else if (cached?.ready) {
        cached.paint(output!, now);
      } else return;
      mode.value = scene ? "shader" : "cache";
      if (animate) frame = requestAnimationFrame(draw);
      else still.value = target!.toDataURL("image/png");
    } catch { mode.value = "fallback"; }
  }
  try {
    cached = await previewFrames(revision, [sprite.key, flags, rims, grid], width, height, animate, abort.signal).catch(() => undefined);
    if (abort.signal.aborted) return;
    if (cached?.ready) {
      draw(performance.now());
      if (!animate) return;
    }
    scene = await openInventoryArt(revision, target, sprite, flags, passes, rims, grid, abort.signal);
    if (abort.signal.aborted) return;
    mipmaps.value = scene.authored ? "client" : "generated";
    cancelAnimationFrame(frame);
    draw(performance.now());
  } catch {
    if (!abort.signal.aborted && !cached?.ready) { mode.value = "fallback"; }
  }
}, { flush: "post", immediate: true });
</script>

<style scoped>
.inventory-art, canvas, img { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.inventory-art { z-index: 1; visibility: hidden; }
.inventory-art[data-renderer="shader"], .inventory-art[data-renderer="cache"] { visibility: visible; }
</style>
