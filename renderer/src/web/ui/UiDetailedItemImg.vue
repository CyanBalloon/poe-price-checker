<template>
  <div
    v-if="icon"
    :class="$style['icon-container']"
  >
    <ui-item-img :icon="icon" />
    <div
      v-if="sockets && sockets.length > 0"
      class="absolute inset-0 flex items-center justify-center"
    >
      <div
        :class="[
          $style['socket-grid'],
          $style[
            'socket-cols-' +
              (sockets.length < itemWidth ? sockets.length : itemWidth)
          ],
        ]"
      >
        <div
          v-for="socket in sockets"
          class="bg-no-repeat bg-center"
          :class="[$style['t-' + socket.type + '-' + (socket.item ?? 'empty')], $style['socket-' + socket.type]]"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import UiItemImg from "./UiItemImg.vue";

export default defineComponent({
  components: {
    UiItemImg,
  },
  props: {
    icon: {
      type: String,
      required: true,
    },
    itemWidth: {
      type: Number,
      default: 1,
    },
    itemHeight: {
      type: Number,
      default: 1,
    },
    sockets: {
      type: Array as () => { type: string; item?: string }[] | undefined,
      default: undefined,
    },
  },
});
</script>

<style lang="postcss" module>
.socket-R,
.socket-G,
.socket-B,
.socket-W,
.socket-A,
.socket-DV {
  width: 1.375rem;
  height: 1.375rem;
  margin: 0.3125rem;
  border: 2px solid var(--socket-color);
  border-radius: 50%;
  background-color: #0b0d15;
  box-shadow: 0 0 0 1px #0b0d15;
}

.socket-R { --socket-color: #c95c4e; }
.socket-G { --socket-color: #6eb376; }
.socket-B { --socket-color: #5f9acf; }
.socket-W { --socket-color: #e2dfd7; }
.socket-A { --socket-color: #5bb7be; }
.socket-DV { --socket-color: #b180d6; }

.icon-container { position: relative; display: inline-grid; width: max-content; }
.socket-rune, .socket-jewel { width: 62px; height: 62px; }

.socket-grid {
  @apply grid;
}
.socket-cols-1 {
  @apply grid-cols-1;
}
.socket-cols-2 {
  @apply grid-cols-2;
}
.socket-cols-3 {
  @apply grid-cols-3;
}

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
