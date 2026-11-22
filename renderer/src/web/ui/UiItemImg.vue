<template>
  <img
    :src="realIcon"
    alt=""
    class="item-art"
    :class="{ 'overflow-hidden': overflowHidden }"
  />
</template>

<script lang="ts">
import { defineComponent, ref, watch } from "vue";
import { getDynamicIcon } from "@/web/background/ImageFetcher";
import { AppConfig } from "@/web/Config";

export default defineComponent({
  props: {
    icon: {
      type: String,
      required: true,
    },
    itemName: {
      type: String,
      required: false,
    },
    namespace: {
      type: String,
      required: false,
    },
    overflowHidden: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    const realIcon = ref(props.icon === '%NOT_FOUND%' || props.icon === '' ? '/images/404.png' : props.icon);

    watch(
      () => [props.icon, props.itemName, props.namespace, AppConfig()?.game] as const,
      async ([icon, name, namespace], _, onInvalidate) => {
        let current = true;
        onInvalidate(() => { current = false; });
        if (icon && icon !== "%NOT_FOUND%") {
          realIcon.value = icon;
          return;
        }
        realIcon.value = "/images/404.png";
        if (name && namespace) {
          const fetched = await getDynamicIcon(name, namespace);
          if (current && fetched) realIcon.value = fetched;
        }
      },
      { immediate: true },
    );
    return { realIcon };
  }
});
</script>
