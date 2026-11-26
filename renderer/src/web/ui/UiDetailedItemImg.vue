<template>
  <div
    v-if="icon"
    :class="[$style['icon-container'], { [$style['socketed-art']]: isPoe1 && socketLayout.length }]"
  >
    <ui-item-img :icon="icon" :base-icon="baseIcon" :influences="influences" :inventory="inventory" />
    <div
      v-if="socketLayout.length"
      class="absolute inset-0 flex items-center justify-center pointer-events-none"
      aria-hidden="true"
    >
      <div
        :class="[$style['socket-grid'], {
          [$style['linked-grid']]: isPoe1,
          [$style['sprite-grid']]: isPoe1 && socketSprite,
        }]"
        :style="isPoe1 && socketSprite ? { '--socket-sprite': socketSprite } : undefined"
      >
        <div
          v-for="({ socket, row, column, link }, index) in socketLayout"
          :key="index"
          :class="$style['socket-cell']"
          :style="{ gridRow: row, gridColumn: column }"
        >
          <span v-if="link" :class="[$style['socket-link'], $style['link-' + link]]" />
          <span class="bg-no-repeat bg-center" :class="[
            $style['t-' + socket.type + '-' + (socket.item ?? 'empty')],
            $style['socket-' + socket.type],
            { [$style['gem-socket']]: isPoe1 },
          ]" />
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, shallowRef, watch, type PropType } from "vue";
import type { ItemInfluence } from "@/parser";
import type { InventoryFlags } from "@/parser/inventory-effects";
import { AppConfig } from "@/web/Config";
import type { DisplayItem } from "@/web/price-check/trade/pathofexile-trade";
import UiItemImg from "./UiItemImg.vue";
import { layoutItemSockets } from "./item-socket-layout";

// The versioned URL is published in GGG's PoE1 item stylesheet.
const spriteUrl = import.meta.env.VITE_POE1_SOCKET_SPRITE ||
  "https://web.poecdn.com/protected/image/gen/socket.png?v=1795108256244&key=mf1B3nj-F9flN8KRLcBQ8A";
const socketSprite = shallowRef("");
let loadingSprite = false;
let retryAfter = 0;

function loadSocketSprite() {
  if (socketSprite.value || loadingSprite || Date.now() < retryAfter) return;
  loadingSprite = true;
  const image = new Image();
  const useFallback = () => {
    loadingSprite = false;
    retryAfter = Date.now() + 60_000;
  };
  image.onerror = useFallback;
  image.onload = () => {
    if (image.naturalWidth !== 213 || image.naturalHeight !== 175) return useFallback();
    socketSprite.value = `url(${JSON.stringify(image.src)})`;
    loadingSprite = false;
  };
  image.src = spriteUrl;
}

export default defineComponent({
  components: {
    UiItemImg,
  },
  props: {
    icon: {
      type: String,
      required: true,
    },
    baseIcon: String,
    influences: Array as PropType<readonly ItemInfluence[]>,
    inventory: Object as PropType<InventoryFlags>,
    itemWidth: {
      type: Number,
      default: 1,
    },
    sockets: {
      type: Array as PropType<DisplayItem["sockets"]>,
      default: () => [],
    },
  },
  setup(props) {
    const isPoe1 = computed(() => AppConfig()?.game === "poe1");
    const socketLayout = computed(() => layoutItemSockets(props.sockets, props.itemWidth, isPoe1.value));
    watch([isPoe1, () => props.icon, () => props.sockets], ([poe1, icon, sockets]) => {
      if (poe1 && icon && sockets.length) loadSocketSprite();
    }, { immediate: true });
    return { isPoe1, socketLayout, socketSprite };
  },
});
</script>

<style lang="postcss" module>
.socket-grid { display: grid; }
.socket-cell { position: relative; display: grid; place-items: center; }
.linked-grid {
  --socket-pitch: 2.13rem;
  isolation: isolate;
  grid-auto-columns: var(--socket-pitch);
  grid-auto-rows: var(--socket-pitch);
}
.gem-socket {
  position: relative;
  z-index: 1;
  width: 1.65rem;
  height: 1.65rem;
  border: 1px solid #31291c;
  border-radius: 50%;
  background:
    radial-gradient(circle at 50% 58%, #15110b 24%, #2b2113 42%, #0e0b08 47%, transparent 50%),
    conic-gradient(from 45deg, #504538, #29231c, var(--socket-color, #a39b87) 57%, #696052 73%, var(--socket-color, #a39b87) 90%, #504538);
  box-shadow: inset 0 1px 1px #e5d8b88a, inset 0 -2px 2px #0b0807, 0 1px 3px #080604;
}
.socket-link {
  position: absolute;
  z-index: 0;
  width: var(--socket-pitch);
  height: 0.52rem;
  top: 50%;
  left: 50%;
  border-radius: 0.19rem;
  background: linear-gradient(180deg, #382718, #bb925a 32%, #785333 47%, #382719 70%, #785638);
  box-shadow: 0 0 2px 1px #130c05;
  transform-origin: 0 50%;
}
.link-right { transform: translateY(-50%); }
.link-left { transform: translateY(-50%) rotate(180deg); }
.link-down { transform: translateY(-50%) rotate(90deg); }
.socket-link::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0.45rem;
  height: 0.45rem;
  border: 1px solid #a58150;
  background: linear-gradient(135deg, #b68b53, #4d3521 62%);
  transform: translate(-50%, -50%) rotate(45deg);
}

.socket-R { --socket-color: #ce5b48; --rim-position: -140px -35px; }
.socket-G { --socket-color: #8eb851; --rim-position: -70px -105px; }
.socket-B { --socket-color: #579acb; --rim-position: -105px -35px; }
.socket-W { --socket-color: #cec8b6; --rim-position: -140px -70px; }
.socket-A { --socket-color: #62adad; --rim-position: -35px -70px; }
.socket-DV { --socket-color: #af7cd3; --rim-position: -105px -70px; }

/* Native PoE1 inventory coordinates. Each link overlays both adjacent rims. */
.sprite-grid { --socket-pitch: 47.4645px; }
.sprite-grid .gem-socket, .sprite-grid .socket-link {
  border: 0;
  border-radius: 0;
  box-shadow: none;
  background: var(--socket-sprite) no-repeat;
}
.sprite-grid .gem-socket {
  width: 35px;
  height: 35px;
  z-index: auto;
  background-position: var(--rim-position, -140px -70px);
}
.sprite-grid .socket-link {
  z-index: 1;
  width: 38px;
  height: 15px;
  background-position: -175px 0;
  transform: translate(-50%, -50%);
}
.sprite-grid .link-right { left: 100%; }
.sprite-grid .link-left { left: 0; }
.sprite-grid .link-down {
  top: 100%;
  width: 15px;
  height: 38px;
  background-position: -175px -15px;
}
.sprite-grid .socket-link::after { content: none; }

.icon-container { position: relative; display: inline-grid; width: max-content; }
.socketed-art {
  background: radial-gradient(ellipse at center, #0b0a08b3 15%, #0a09084d 56%, transparent 76%);
}
.socket-rune, .socket-jewel { width: 62px; height: 62px; }

.t-rune-empty {
  @apply bg-[url('/images/augments/empty-socket.png')];
}
.t-rune-rune {
  @apply bg-[url('/images/augments/rune.png')];
}
.t-rune-soulcore {
  @apply bg-[url('/images/augments/soulcore.png')];
}
.t-rune-sacredtalisman {
  @apply bg-[url('/images/augments/sacredtalisman.png')];
}
.t-rune-primaltalisman {
  @apply bg-[url('/images/augments/primaltalisman.png')];
}
.t-rune-vividtalisman {
  @apply bg-[url('/images/augments/vividtalisman.png')];
}
.t-rune-wildtalisman {
  @apply bg-[url('/images/augments/wildtalisman.png')];
}
.t-jewel-empty {
  @apply bg-[url('/images/augments/empty-jewel.png')];
}
.t-jewel-blue {
  @apply bg-[url('/images/augments/blue.png')];
}
.t-jewel-red {
  @apply bg-[url('/images/augments/red.png')];
}
.t-jewel-green {
  @apply bg-[url('/images/augments/green.png')];
}
</style>
