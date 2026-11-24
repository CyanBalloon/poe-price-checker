<template>
  <div class="modifier-row">
    <div class="criteria-row">
      <label class="criteria-property">
        <input type="checkbox" :checked="searchable && !filter.disabled" :disabled="!searchable" @change="toggleFilter" />
        <span>{{ influence ? display.onItem : display.label }}
          <small v-if="!inlineMinimum && !influence && display.onItem !== 'Present'">On item {{ display.onItem }}</small>
        </span>
      </label>
      <span v-if="!searchable" class="criteria-value">Unavailable</span>
      <filter-number-field v-else-if="inlineMinimum && filter.roll" :name="display.label + ' minimum'"
        :value="filter.roll.min" :step="filter.roll.dp ? .01 : 1" :unit="display.onItem.endsWith('%') ? '%' : ''"
        :item-value="display.onItem" :active="!filter.disabled" @edit="setMinimum" />
      <button v-else-if="hasDetails" ref="trigger" type="button" class="criteria-target" :class="{ 'is-active': !filter.disabled }"
        :aria-label="'Edit ' + display.label + ' search'" :aria-expanded="expanded" @click="$emit('edit')">
        <span>{{ display.search }}</span><i class="fas fa-chevron-down" aria-hidden="true" />
      </button>
      <select v-else :value="filter.disabled ? 'any' : 'match'" :aria-label="'Search for ' + display.label"
        class="criteria-target" :class="{ 'is-active': !filter.disabled }" @change="toggleFilter">
        <option value="any">{{ influence ? 'Optional' : 'Any' }}</option>
        <option value="match">{{ room ? 'Open room' : 'Exact match' }}</option>
      </select>
    </div>
    <div v-if="expanded && hasDetails" class="modifier-details" @keydown.esc.stop.prevent="closeEditor">
      <div v-if="showInputs && filter.roll" class="criteria-editor">
        <label>{{ boundsMode === "exact" ? "Exact value" : "Minimum" }}
          <input v-model.number="filter.roll.min" type="number" :step="filter.roll.dp ? .01 : 1" placeholder="Any"
            :aria-label="display.label + (boundsMode === 'exact' ? ' exact value' : ' minimum')" @focus="selectNumber" @input="filter.disabled = false" @mousewheel.stop />
        </label>
        <label v-if="boundsMode === 'range'">Maximum
          <input v-model.number="filter.roll.max" type="number" :step="filter.roll.dp ? .01 : 1" placeholder="Any"
            :aria-label="display.label + ' maximum'" @focus="selectNumber" @input="filter.disabled = false" @mousewheel.stop />
        </label>
        <div class="range-adjust" aria-label="Adjust search range" role="group">
          <button type="button" @click="adjustRoll(-10)" aria-label="Decrease range by 10 percent">−10%</button>
          <button type="button" @click="adjustRoll(10)" aria-label="Increase range by 10 percent">+10%</button>
        </div>
      </div>
      <stat-roll-slider v-if="boundsMode === 'range' && filter.roll?.bounds" class="roll-slider" v-model="slider"
        :roll="filter.roll.value" :dp="filter.roll.dp" :bounds="filter.roll.bounds" />
      <div class="modifier-facts">
        <span v-if="filter.tag !== FilterTag.Property">{{ t('filters.tag_' + filter.tag.replace('-', '_')) }}</span>
        <button v-if="filter.tradeIdVariant && filter.tradeIdBase" type="button" @click="toggleVariant">
          {{ filter.useVariant ? filter.variantLabel : 'Base' }}
        </button>
        <filter-modifier-tiers :filter="filter" :item="item" />
        <filter-modifier-item-has-empty v-if="id === 'item.has_empty_modifier'" :filter="filter" />
        <filter-modifier-item-is-elemental v-if="id === 'item.elemental_dps'" :filter="filter" />
        <span v-if="filter.editorAdded"><img :src="filter.editorAdded.icon === '%NOT_FOUND%' ? '/images/404.png' : filter.editorAdded.icon" alt="" /> Augment</span>
        <span v-if="showQuality">{{ t('item.prop_quality', [Math.max(20, item.quality || 0)]) }}</span>
        <span v-if="filter.hidden">{{ t(filter.hidden) }}</span>
      </div>
      <modifier-anointment v-if="filter.oils" :filter="filter" />
      <details v-if="filter.sources.length" class="modifier-sources">
        <summary>Modifier sources</summary>
        <source-info v-for="(source, idx) in filter.sources" :key="idx" :source="source" :filter="filter" />
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { itemIsModifiable, type ParsedItem } from "@/parser";
import { isMapInfluenceId } from "@/parser/poe1-map";
import { FilterTag, type StatFilter } from "./interfaces";
import { modifierBoundsMode, type displayModifier } from "./filter-comparison";
import FilterNumberField from "./FilterNumberField.vue";
import StatRollSlider from "@/web/ui/StatRollSlider.vue";
import ModifierAnointment from "./FilterModifierAnointment.vue";
import FilterModifierItemHasEmpty from "./FilterModifierItemHasEmpty.vue";
import FilterModifierItemIsElemental from "./FilterModifierItemIsElemental.vue";
import FilterModifierTiers from "./FilterModifierTiers.vue";
import SourceInfo from "./SourceInfo.vue";

const props = defineProps<{ filter: StatFilter; item: ParsedItem; display: ReturnType<typeof displayModifier>; expanded: boolean; inlineMinimum?: boolean }>();
const emit = defineEmits<{ (event: "edit"): void }>();
const { t } = useI18n();
const id = computed(() => props.filter.tradeId[0]);
const searchable = computed(() => Boolean(id.value));
const influence = computed(() => props.filter.tradeId.some(isMapInfluenceId));
const room = computed(() => id.value?.startsWith("pseudo.pseudo_temple_"));
const showQuality = computed(() => ["item.armour", "item.evasion_rating", "item.energy_shield", "item.total_dps", "item.physical_dps"].includes(id.value) && itemIsModifiable(props.item));
const boundsMode = computed(() => modifierBoundsMode(props.filter));
const showInputs = computed(() => boundsMode.value !== "presence");
const hasDetails = computed(() => !influence.value && !room.value && Boolean(showInputs.value || props.filter.oils || props.filter.sources.length ||
  props.filter.tradeIdVariant || props.filter.hidden || props.filter.editorAdded || showQuality.value));
const trigger = ref<HTMLButtonElement>();
const slider = computed({
  get: () => [props.filter.roll!.min, props.filter.roll!.max],
  set(bounds) {
    [props.filter.roll!.min, props.filter.roll!.max] = bounds;
    props.filter.disabled = false;
  },
});

function setMinimum(value?: number) {
  props.filter.roll!.min = value;
  props.filter.disabled = value == null;
}
function toggleFilter() { props.filter.disabled = !props.filter.disabled; }
function selectNumber(event: FocusEvent) { (event.target as HTMLInputElement).select(); }
function closeEditor() {
  emit("edit");
  trigger.value?.focus();
}
function toggleVariant() {
  const filter = props.filter;
  filter.useVariant = !filter.useVariant;
  filter.tradeId = [filter.useVariant ? filter.tradeIdVariant! : filter.tradeIdBase!];
}
function adjustRoll(percent: number) {
  const roll = props.filter.roll!;
  const adjust = (value: number) => Number((value * (1 + percent / 100)).toFixed(roll.dp ? 2 : 0));
  roll.min = adjust(typeof roll.min === "number" ? roll.min : roll.value);
  if (typeof roll.max === "number") roll.max = adjust(roll.max);
  props.filter.disabled = false;
}
</script>

<style scoped>
.modifier-row { min-width: 0; }
.modifier-details { display: grid; gap: .5rem; margin: 0 0 .65rem var(--criteria-indent); }
.modifier-details .criteria-editor { margin-left: 0; }
.roll-slider { width: min(100%, 14rem); }
.range-adjust, .modifier-facts { display: flex; align-items: center; flex-wrap: wrap; gap: .35rem; }
.range-adjust button, .modifier-facts button { min-height: 1.9rem; padding: .22rem .45rem; border-radius: .35rem; }
.range-adjust button:hover, .modifier-facts button:hover { background: var(--criteria-hover); color: var(--criteria-ink); }
.modifier-sources, .modifier-facts, .range-adjust { color: var(--criteria-muted); font-size: .77rem; }
.modifier-facts img { display: inline; vertical-align: middle; }
.modifier-sources summary { cursor: pointer; }
</style>
