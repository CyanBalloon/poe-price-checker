<template>
  <section class="unique-picker" aria-labelledby="unique-base-title">
    <header>
      <small>{{ t("item.unidentified") }}</small>
      <h1 id="unique-base-title">{{ item.info.name }}</h1>
      <p>{{ candidates.length ? t("item.choose_unique") : t("item.no_matching_uniques") }}</p>
    </header>
    <div class="unique-options">
      <button v-for="candidate in candidates" :key="candidate.refName" type="button"
        class="unique-option" @click="$emit('identify', { ...item, info: candidate })">
        <ui-item-img :icon="candidate.icon" :item-name="candidate.refName" :namespace="candidate.namespace" />
        <span>{{ candidate.name }}<small v-if="candidate.tradeDisc === 'legacy'"> · Legacy</small></span>
        <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { itemCatalogue } from "@/assets/data";
import type { ParsedItem } from "@/parser";
import UiItemImg from "@/web/ui/UiItemImg.vue";

const props = defineProps<{ item: ParsedItem }>();
defineEmits<{ (event: "identify", item: ParsedItem): void }>();
const { t } = useI18n();
const candidates = computed(() => Array.from(
  itemCatalogue.value.uniquesByBase.get(props.item.info.refName)?.values() ?? [],
).sort((a, b) => a.name.localeCompare(b.name)));
</script>

<style scoped>
.unique-picker { padding-block: 1.5rem; min-height: 0; overflow: auto; }
.unique-picker header { margin-bottom: 1.25rem; }
.unique-picker small, .unique-picker p, .unique-option i { color: var(--muted, #aaa39b); }
.unique-picker h1 { font-family: Georgia, serif; font-size: 2rem; line-height: 1.25; }
.unique-options { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr)); gap: 0.5rem; }
.unique-option { display: flex; align-items: center; gap: 1rem; padding: 0.75rem 1rem; border-radius: 0.5rem; background: var(--surface, #232220); text-align: left; }
.unique-option span { flex: 1; color: var(--unique, #edaa75); overflow-wrap: anywhere; }
.unique-option:hover, .unique-option:focus-visible { background: var(--hover, #39342e); }
.unique-option:focus-visible { outline: 2px solid var(--accent, #e8b77a); outline-offset: -2px; }
</style>
