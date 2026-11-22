<template>
  <div v-if="isStandalone" class="source-line">
    <div class="source-meta">
      <span>{{ modTypeTranslated }}</span>
      <strong v-if="runeName || info.name">{{ runeName || info.name }}</strong>
      <span v-if="info.tier != null">{{ t("filters.tier", [info.tier]) }}</span>
      <span v-if="info.rank != null">{{ t("item.mod_rank", [info.rank]) }}</span>
      <span v-if="rollRange">Roll {{ rollRange }}</span>
    </div>
    <div v-if="!isSingleSource">
      <div v-for="stat of contributingStats" :key="stat.text" class="source-stat">
        <item-modifier-text :text="stat.text" :roll="stat.roll" />
        <span v-if="stat.contribution != null && stat.contribution !== stat.roll">{{ stat.contribution > 0 ? '+' : '' }}{{ stat.contribution }}</span>
      </div>
    </div>
  </div>
  <!-- Original UI for non-standalone mode -->
  <div v-else>
    <div :class="$style['modinfo']">{{ modText }}</div>
    <div v-for="stat of stats" :key="stat.text" class="flex items-baseline">
      <ItemModifierText
        :text="stat.text"
        :roll="stat.roll"
        :class="{ 'line-through': !stat.contributes }"
      />
      <div
        v-if="stat.contributes && stat.contribution"
        :class="$style['contribution']"
      >
        {{ stat.contribution }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { applyIncr } from "@/parser/advanced-mod-desc";
import { roundRoll } from "./util";
import type { StatCalculated } from "@/parser/modifiers";
import { FilterTag, type StatFilter } from "./interfaces";
import { AUGMENT_LIST } from "@/assets/data";

import ItemModifierText from "@/web/ui/ItemModifierText.vue";

const props = defineProps<{
  source: StatCalculated["sources"][number];
  filter: StatFilter;
}>();

const { t } = useI18n();

const isStandalone = computed(() => {
  const params = new URLSearchParams(window.location.search);
  return params.get("mode") === "standalone";
});

const isSingleSource = computed(() => {
  return props.filter.sources.length === 1 && 
         props.filter.tag !== FilterTag.Pseudo && 
         props.filter.tradeId[0] !== "item.elemental_dps";
});

const info = computed(() => props.source.modifier.info);

const runeName = computed(() => {
  const type = info.value.type;
  if (type !== "rune" && type !== "added-rune") return null;
  if (props.filter.editorAdded) {
    return props.filter.editorAdded.name;
  }
  if (info.value.name) {
    return info.value.name;
  }
  
  // Try to find the rune by comparing trade IDs
  const tradeIds: string[] = [];
  if (props.source.stat.stat.trade.ids) {
    for (const key in props.source.stat.stat.trade.ids) {
      const ids = props.source.stat.stat.trade.ids[key];
      if (ids) {
        tradeIds.push(...ids);
      }
    }
  }

  if (tradeIds.length > 0) {
    const foundRune = AUGMENT_LIST.find((rune) =>
      rune.augment?.some((aug) =>
        aug.tradeId?.some((id) => tradeIds.includes(id))
      )
    );
    if (foundRune) return foundRune.name;
  }

  // Fallback to match based on stat ref
  const statRef = props.source.stat.stat.ref;
  const foundRune = AUGMENT_LIST.find((rune) => 
    rune.augment?.some((aug) => 
      aug.string === statRef ||
      aug.string.replaceAll("+", "") === statRef.replaceAll("+", "") ||
      aug.string.replaceAll("#", "") === statRef.replaceAll("#", "")
    )
  );
  return foundRune ? foundRune.name : null;
});

const modTypeTranslated = computed(() => {
  if (info.value.generation === "corrupted") return t("item.corrupted");
  const type = info.value.type;
  if (type === "added-rune") return t("item.mod_rune");
  return t(`item.mod_${type}`);
});

const modText = computed(() => {
  let text = t(`item.mod_${info.value.type}`);
  if (info.value.name) {
    text += ` "${info.value.name}"`;
  }
  if (info.value.tier != null || info.value.rank != null) {
    text += ` (${t("item.mod_tier", [info.value.tier])})`;
  }
  if (info.value.rank != null) {
    text += ` (${t("item.mod_rank", [info.value.rank])})`;
  }
  return text;
});

const stats = computed(() => {
  const { stats } = props.source.modifier;
  const { stat: contribStat } = props.source.stat;

  let contribution = props.source.contributes?.value;
  if (contribution != null) {
    const filter = props.filter.roll!;
    contribution *= filter.isNegated ? -1 : 1;
    contribution = roundRoll(contribution, filter.dp);
  }

  return stats.map((parsed) => {
    if (parsed.stat.ref !== contribStat.ref) {
      return {
        text: parsed.translation.string,
        contributes: false,
      };
    }
    parsed = applyIncr(props.source.modifier.info, parsed) ?? parsed;
    if (!parsed.roll) {
      return {
        text: parsed.translation.string,
        contribution,
        contributes: true,
      };
    }

    const rollValue = parsed.roll.value * (parsed.translation.negate ? -1 : 1);
    
    let minVal = parsed.roll.min * (parsed.translation.negate ? -1 : 1);
    let maxVal = parsed.roll.max * (parsed.translation.negate ? -1 : 1);
    if (minVal > maxVal) {
      [minVal, maxVal] = [maxVal, minVal];
    }

    return {
      text: parsed.translation.string,
      roll: roundRoll(rollValue, parsed.roll.dp),
      min: roundRoll(minVal, parsed.roll.dp),
      max: roundRoll(maxVal, parsed.roll.dp),
      contribution: contribution!,
      contributes: true,
    };
  });
});

const contributingStats = computed(() => stats.value.filter(stat => stat.contributes));

const rollRange = computed(() => {
  const contrib = stats.value.find(s => s.contributes && s.roll != null);
  if (!contrib || contrib.min == null || contrib.max == null || contrib.min === contrib.max) {
    return null;
  }
  return `${contrib.min}–${contrib.max}`;
});
</script>

<style lang="postcss" module>
.modinfo {
  @apply text-gray-500;
  font-style: italic;
}

.contribution {
  margin-left: auto;
  @apply w-12;
  @apply rounded;
  @apply border border-gray-700;
  text-align: center;
  flex-shrink: 0;
}
</style>

<style scoped>
.source-line { padding: 0.35rem 0; }
.source-line + .source-line { border-top: 1px solid var(--line); }
.source-meta, .source-stat { display: flex; gap: 0.5rem; align-items: baseline; font-size: 0.75rem; }
.source-meta { flex-wrap: wrap; color: var(--muted); }
.source-stat { justify-content: space-between; margin-top: 0.2rem; }
</style>
