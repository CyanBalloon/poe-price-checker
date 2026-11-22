<template>
  <div v-if="updateReady" class="bg-gray-900 mt-2 mx-4 rounded py-1 px-2">
    <p>{{ control.status }}</p>
    <button class="btn" @click="run">{{ control.label }}</button>
  </div>
  <div v-if="leagues.isLoading.value" class="pt-2 px-4">
    <i class="fas fa-info-circle text-gray-600"></i>
    {{ t("app.leagues_loading") }}
  </div>
  <ui-error-box class="mx-4 mt-4" v-else-if="leagues.error.value">
    <template #name>{{ t("app.leagues_failed") }}</template>
    <p>{{ t("app.leagues_failed_help") }}</p>
    <template #actions>
      <button class="btn" @click="leagues.load">{{ t("Retry") }}</button>
      <button class="btn" @click="openCaptcha">{{ t("Browser") }}</button>
    </template>
  </ui-error-box>
</template>

<script setup lang="ts">
import { computed, inject } from "vue";
import { useI18n } from "vue-i18n";
import { useLeagues } from "@/web/background/Leagues";
import { useUpdateControl } from "@/web/settings/updates";
import { Host } from "@/web/background/IPC";
import { poeWebApi } from "@/web/Config";
import { getTradeEndpointPath } from "./trade/common";

import UiErrorBox from "@/web/ui/UiErrorBox.vue";

const showBrowser = inject<(url: string) => void>("builtin-browser")!;

const { t } = useI18n();

const { control, run } = useUpdateControl();
const updateReady = computed(() => ["update-available", "update-downloaded"].includes(Host.updateInfo.value.state));

const leagues = useLeagues();

function openCaptcha() {
  showBrowser(`https://${poeWebApi()}/api/${getTradeEndpointPath()}/data/leagues`);
}
</script>
