<template>
  <div class="p-2 flex flex-col h-full items-center">
    <div class="flex flex-col items-center p-2 mb-4">
      <img class="w-12 h-12" src="/images/jeweler.png" />
      <p class="text-base">PoE Price Checker</p>
      <p class="">{{ t("app.version", [version]) }}</p>
      <div class="flex gap-2">
        <a
          class="border-b"
          href="https://github.com/CyanBalloon/poe-price-checker/releases"
          target="_blank"
          >{{ t("app.release_notes") }}</a
        >
        <a
          class="border-b"
          href="https://github.com/CyanBalloon/poe-price-checker/issues"
          target="_blank"
          >{{ t("app.report_bug") }}</a
        >
      </div>
    </div>
    <div
      class="border border-gray-600 rounded p-2 whitespace-nowrap min-w-min w-72"
    >
      <p role="status">{{ control.status }}</p>
      <button v-if="control.action" @click="run" class="btn w-full mt-1">
        {{ control.label }}
      </button>
    </div>
    <div class="text-center mt-auto py-8">
      <p>
        {{ t("app.contact_me") }} <br /><span
          class="font-sans text-gray-500 select-all"
          >&lt;@340233612064718851&gt;</span
        >
      </p>
      <ul class="flex gap-4">
        <li>
          <img class="rounded inline" src="/images/dc_reddit.png" />
          <a
            class="border-b"
            href="https://old.reddit.com/r/pathofexile2"
            target="_blank"
            >r/pathofexile</a
          >
        </li>
        <li>
          <img class="rounded inline" src="/images/discord.png" />
          <a
            class="border-b"
            href="https://discord.gg/pathofexile"
            target="_blank"
            >pathofexile</a
          >
        </li>
      </ul>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { useI18n } from "vue-i18n";
import { Host } from "@/web/background/IPC";
import { useUpdateControl } from "./updates";

export default defineComponent({
  name: "settings.about",
  inheritAttrs: false,
  setup() {
    const { t } = useI18n();
    return { t, version: Host.version, ...useUpdateControl() };
  },
});
</script>
