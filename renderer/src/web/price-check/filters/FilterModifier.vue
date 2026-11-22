<template>
  <div v-if="isStandalone" class="modifier-row" :class="{ 'modifier-row--expanded': expanded }">
    <div class="modifier-line">
      <label class="modifier-select">
        <input type="checkbox" :checked="!isDisabled" @change="filter.disabled = !filter.disabled" />
        <item-modifier-text :text="showShortText ? shortText : text" :roll="roll?.value" />
      </label>
      <button
        v-if="hasDetails"
        type="button"
        class="modifier-edit"
        :aria-label="'Edit details for ' + modifierLabel"
        :aria-expanded="expanded"
        @click="$emit('edit')"
      >
        <span v-if="rangeLabel && !isDisabled">{{ rangeLabel }}</span>
        <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
      </button>
    </div>
    <div v-if="expanded" class="modifier-details" @keydown.esc.stop.prevent="closeEditor">
      <div v-if="showInputs" class="range-editor">
        <label>Minimum
          <input ref="inputMinEl" v-model.number="inputMin" type="number" :step="changeStep" placeholder="Any"
            @focus="selectNumber" @input="filter.disabled = false" @mousewheel.stop />
        </label>
        <label>Maximum
          <input ref="inputMaxEl" v-model.number="inputMax" type="number" :step="changeStep" placeholder="Any"
            @focus="selectNumber" @input="filter.disabled = false" @mousewheel.stop />
        </label>
        <div class="range-adjust" aria-label="Adjust search range" role="group">
          <button type="button" @click="adjustRoll(-10)" aria-label="Decrease range by 10 percent">−10%</button>
          <button type="button" @click="adjustRoll(10)" aria-label="Increase range by 10 percent">+10%</button>
        </div>
      </div>
      <div class="modifier-facts">
        <span v-if="showTag">{{ t('filters.tag_' + tag.replace('-', '_')) }}</span>
        <button v-if="filter.tradeIdVariant && filter.tradeIdBase" type="button" @click="toggleVariant">
          {{ filter.useVariant ? filter.variantLabel : 'Base' }}
        </button>
        <filter-modifier-tiers :filter="filter" :item="item" />
        <filter-modifier-item-has-empty v-if="tradeId === 'item.has_empty_modifier'" :filter="filter" />
        <filter-modifier-item-is-elemental v-if="tradeId === 'item.elemental_dps'" :filter="filter" />
        <span v-if="showAugmentNotice"><img :src="showAugmentNotice === '%NOT_FOUND%' ? '/images/404.png' : showAugmentNotice" alt="" /> Augment</span>
        <span v-if="showQ20Notice">{{ t('item.prop_quality', [calcQuality]) }}</span>
        <span v-if="isHidden">{{ hiddenReason }}</span>
      </div>
      <modifier-anointment v-if="filter.oils" :filter="filter" />
      <details v-if="showSourceInfo" class="modifier-sources">
        <summary>Modifier sources</summary>
        <source-info v-for="(source, idx) of filter.sources" :key="idx" :source="source" :filter="filter" />
      </details>
    </div>
  </div>
  <div v-else :class="$style.filter" @click="toggleFilter">
    <div v-if="showSourceInfo" :class="$style['mods']" @click.stop>
      <div class="pl-5 py-1" v-for="(source, idx) of filter.sources" :key="idx">
        <source-info :source="source" :filter="filter" />
      </div>
    </div>
    <div class="flex flex-col min-w-0 flex-1">
      <div class="pb-px flex items-baseline justify-between">
        <div class="flex items-center text-left min-w-0 flex-1 select-none">
          <i class="w-5 shrink-0" :class="isDisabled ? 'far fa-square text-gray-500' : 'fas fa-check-square'" aria-hidden="true"></i>
          <div class="search-text flex-1 mr-1 relative flex min-w-0">
            <item-modifier-text :text="showShortText ? shortText : text" :roll="roll?.value" />
          </div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0 select-none" @click.stop>
          <span
            v-if="showTag"
            :class="[$style.tag, $style[`tag-${tag}`]]"
          >
            {{ t(`filters.tag_${tag.replace("-", "_")}`) }}
            {{ filter.sources.length > 1 ? ` x ${filter.sources.length}` : null }}
          </span>
          <button
            v-if="filter.tradeIdVariant && filter.tradeIdBase"
            @click.stop="toggleVariant"
            :class="[$style['tag'], $style['tag-pseudo'], 'cursor-pointer hover:bg-gray-600']"
          >
            {{ filter.useVariant ? filter.variantLabel : 'Base' }}
          </button>
          <filter-modifier-tiers :filter="filter" :item="item" />
          <filter-modifier-item-has-empty
            :filter="filter"
            v-if="tradeId === 'item.has_empty_modifier'"
          />
          <filter-modifier-item-is-elemental
            :filter="filter"
            v-if="tradeId === 'item.elemental_dps'"
          />
          <div
            v-if="showAugmentNotice"
            :class="$style['qualityLabel']"
            class="self-center flex items-center"
          >
            <img
              :src="
                showAugmentNotice === '%NOT_FOUND%'
                  ? '/images/404.png'
                  : showAugmentNotice
              "
              class="min-w-5 min-h-5 w-5 h-5"
            />
          </div>
          <div v-if="showQ20Notice" :class="$style['qualityLabel']">
            {{ t("item.prop_quality", [calcQuality]) }}
          </div>
          <div v-if="showInputs" class="modifier-adjust flex gap-1 items-center shrink-0">
            <button @click.stop="adjustRoll(-10)" type="button" class="px-1 py-0.5 text-[9px] bg-gray-800 border border-gray-700 rounded text-gray-400 hover:text-gray-200">-10%</button>
            <button @click.stop="adjustRoll(10)" type="button" class="px-1 py-0.5 text-[9px] bg-gray-800 border border-gray-700 rounded text-gray-400 hover:text-gray-200">+10%</button>
          </div>
          <div v-if="showInputs" class="modifier-bounds flex gap-1 select-all shrink-0">
            <input
              :class="$style['rollInput']"
              :placeholder="t('min')"
              :aria-label="t('min')"
              :min="roll?.bounds?.min"
              :max="roll?.bounds?.max"
              :step="changeStep"
              type="number"
              v-if="showInputs"
              ref="inputMinEl"
              v-model.number="inputMin"
              @focus="inputFocus($event, 'min')"
              @click.stop
              @mousewheel.stop
            />
            <input
              :class="$style['rollInput']"
              :placeholder="t('max')"
              :aria-label="t('max')"
              :min="roll?.bounds?.min"
              :max="roll?.bounds?.max"
              :step="changeStep"
              type="number"
              v-if="showInputs"
              ref="inputMaxEl"
              v-model.number="inputMax"
              @focus="inputFocus($event, 'max')"
              @click.stop
              @mousewheel.stop
            />
          </div>
        </div>
      </div>
      <div class="flex" @click.stop>
        <div class="w-5 flex items-start">
          <ui-popover
            v-if="isHidden"
            tag-name="div"
            class="flex"
            placement="right-start"
            boundary="#price-window"
          >
            <template #target>
              <span class="text-xs leading-none text-gray-600 cursor-pointer" @click.stop>
                <i
                  class="fas fa-eye-slash"
                  :class="{ 'faa-ring': !isDisabled }"
                ></i>
              </span>
            </template>
            <template #content>
              <div style="max-width: 18.5rem">{{ hiddenReason }}</div>
            </template>
          </ui-popover>
        </div>

        <div class="flex-1 flex flex-col gap-1">
          <div class="flex-1 flex items-start gap-x-2">
            <span
              v-if="showTag"
              :class="[$style.tag, $style[`tag-${tag}`]]"
            >
              {{ t(`filters.tag_${tag.replace("-", "_")}`) }}
              {{ filter.sources.length > 1 ? ` x ${filter.sources.length}` : null }}
            </span>
            <button
              v-if="filter.tradeIdVariant && filter.tradeIdBase"
              @click.stop="toggleVariant"
              :class="[$style['tag'], $style['tag-pseudo'], 'cursor-pointer hover:bg-gray-600']"
            >
              {{ filter.useVariant ? filter.variantLabel : 'Base' }}
            </button>
            <filter-modifier-tiers :filter="filter" :item="item" />
            <filter-modifier-item-has-empty
              :filter="filter"
              v-if="tradeId === 'item.has_empty_modifier'"
            />
          </div>
          <filter-modifier-item-is-elemental
            :filter="filter"
            v-if="tradeId === 'item.elemental_dps'"
          />
        </div>

        <stat-roll-slider
          v-if="roll && roll.bounds"
          class="mr-4"
          style="width: 12.5rem"
          v-model="sliderValue"
          :roll="roll.value"
          :dp="roll.dp"
          :bounds="roll.bounds"
          @click.stop
        />
        <div style="width: calc(2 * 3rem + 1px)" />
      </div>
    </div>
    <div class="flex flex-col" @click.stop>
      <modifier-anointment :filter="filter" v-if="filter.oils" />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType, computed, ref, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import UiPopover from "@/web/ui/Popover.vue";
import StatRollSlider from "../../ui/StatRollSlider.vue";
import ItemModifierText from "../../ui/ItemModifierText.vue";
import ModifierAnointment from "./FilterModifierAnointment.vue";
import FilterModifierItemHasEmpty from "./FilterModifierItemHasEmpty.vue";
import FilterModifierTiers from "./FilterModifierTiers.vue";
import { AppConfig } from "@/web/Config";
import {
  ItemCategory,
  itemIsModifiable,
  ItemRarity,
  ParsedItem,
} from "@/parser";
import { FilterTag, StatFilter, INTERNAL_TRADE_IDS } from "./interfaces";
import SourceInfo from "./SourceInfo.vue";
import FilterModifierItemIsElemental from "./FilterModifierItemIsElemental.vue";
import { CLIENT_STRINGS as _$ } from "@/assets/data";

export default defineComponent({
  components: {
    ItemModifierText,
    ModifierAnointment,
    FilterModifierItemHasEmpty,
    FilterModifierTiers,
    SourceInfo,
    StatRollSlider,
    UiPopover,
    FilterModifierItemIsElemental,
  },
  emits: ["submit", "edit"],
  props: {
    expanded: Boolean,
    filter: {
      type: Object as PropType<StatFilter>,
      required: true,
    },
    item: {
      type: Object as PropType<ParsedItem>,
      required: true,
    },
    showSources: {
      type: Boolean,
      required: true,
    },
  },
  setup(props, ctx) {
    const isStandalone = computed(() => {
      const params = new URLSearchParams(window.location.search);
      return params.get("mode") === "standalone";
    });

    const showTag = computed(
      () =>
        props.filter.tag !== FilterTag.Property &&
        props.filter.tradeId?.[0] !== "item.has_empty_modifier" &&
        props.item.info.refName !== "Chronicle of Atzoatl" &&
        props.item.info.refName !== "Mirrored Tablet" &&
        props.item.info.refName !== "Filled Coffin" &&
        !(
          props.item.rarity === ItemRarity.Unique &&
          (props.filter.tag === FilterTag.Explicit ||
            props.filter.tag === FilterTag.Pseudo)
        ),
    );

    const showAugmentNotice = computed(() => {
      if (props.filter.editorAdded) {
        return props.filter.editorAdded.icon;
      }
      return false;
    });

    const showQ20Notice = computed(() => {
      return (
        [
          "item.armour",
          "item.evasion_rating",
          "item.energy_shield",
          "item.total_dps",
          "item.physical_dps",
        ].includes(props.filter.tradeId?.[0]) && itemIsModifiable(props.item)
      );
    });

    const calcQuality = computed(() => Math.max(20, props.item.quality || 0));

    const inputMinEl = ref<HTMLInputElement | null>(null);
    const inputMaxEl = ref<HTMLInputElement | null>(null);

    const sliderValue = computed<Array<number | "" | undefined>>({
      get() {
        const roll = props.filter.roll!;
        return [roll.min, roll.max];
      },
      set(value) {
        if (typeof value[0] === "number") {
          props.filter.roll!.min = value[0];
          nextTick(() => {
            inputMinEl.value!.focus();
          });
        } else if (typeof value[1] === "number") {
          props.filter.roll!.max = value[1];
          nextTick(() => {
            inputMaxEl.value!.focus();
          });
        }
        props.filter.disabled = false;
      },
    });

    function inputFocus(e: FocusEvent, type: "min" | "max") {
      const target = e.target as HTMLInputElement;
      if (target.value === "") {
        if (type === "max") {
          props.filter.roll!.max = props.filter.roll!.default.max;
        } else if (type === "min") {
          props.filter.roll!.min = props.filter.roll!.default.min;
        }
        nextTick(() => {
          target.select();
        });
      } else {
        target.select();
      }
      props.filter.disabled = false;
    }

    function toggleFilter(e: MouseEvent) {
      if (e.detail === 0) {
        ctx.emit("submit");
      } else {
        props.filter.disabled = !props.filter.disabled;
      }
    }

    function toggleVariant() {
      props.filter.useVariant = !props.filter.useVariant;
      if (props.filter.tradeIdVariant && props.filter.tradeIdBase) {
        props.filter.tradeId = [props.filter.useVariant ? props.filter.tradeIdVariant : props.filter.tradeIdBase];
      }
      if (!isStandalone.value) ctx.emit("submit");
    }

    function adjustRoll(percent: number) {
      if (!props.filter.roll) return;
      const roll = props.filter.roll;
      const round = (val: number) => {
        return roll.dp ? Number(val.toFixed(2)) : Math.round(val);
      };

      const factor = 1 + percent / 100;
      roll.min = round((typeof roll.min === "number" ? roll.min : roll.value) * factor);
      if (typeof roll.max === "number") {
        roll.max = round(roll.max * factor);
      }

      props.filter.disabled = false;
    }

    const text = computed(() => {
      if (
        !props.filter.tradeId?.[0] ||
        !(INTERNAL_TRADE_IDS as readonly string[]).includes(
          props.filter.tradeId[0],
        )
      ) {
        return props.filter.text;
      } else {
        return t(props.filter.tradeId[0], ["#", "#"]);
      }
    });

    const rangeLabel = computed(() => {
      const roll = props.filter.roll;
      if (!roll) return "";
      const { min, max } = roll;
      if (typeof min === "number" && typeof max === "number") {
        return min === max ? String(min) : `${min}–${max}`;
      }
      if (typeof min === "number") return `≥ ${min}`;
      if (typeof max === "number") return `≤ ${max}`;
      return "";
    });

    function closeEditor(event: KeyboardEvent) {
      const editor = (event.currentTarget as HTMLElement).closest(".modifier-row");
      ctx.emit("edit");
      editor?.querySelector<HTMLButtonElement>(".modifier-edit")?.focus();
    }

    const { t } = useI18n();

    const showSourceInfo = computed(
      () =>
        props.showSources &&
        props.filter.sources.length &&
        (props.filter.option == null ||
          (props.filter.tradeId &&
            props.filter.tradeId.length > 0 &&
            props.filter.tradeId[0] === "item.elemental_dps")) &&
        (props.filter.tag === FilterTag.Pseudo ||
          props.filter.tag === FilterTag.Corrupted ||
          props.filter.tag === FilterTag.Enchant ||
          props.filter.tag === FilterTag.Augment ||
          props.filter.tag === FilterTag.AddedAugment ||
          props.filter.sources.length >= 2 ||
          props.filter.sources[0].modifier.info.name != null ||
          props.filter.sources[0].modifier.info.tier != null ||
          props.filter.sources[0].modifier.info.rank != null),
    );

    const hasDetails = computed(() => {
      const filter = props.filter;
      return Boolean(filter.roll || filter.oils || filter.tradeIdVariant || filter.hidden ||
        showSourceInfo.value || showTag.value || showQ20Notice.value || showAugmentNotice.value ||
        ["item.has_empty_modifier", "item.elemental_dps"].includes(filter.tradeId[0]) ||
        filter.sources.some((source) => source.modifier.info.tier != null));
    });

    return {
      isStandalone,
      rangeLabel,
      hasDetails,
      modifierLabel: computed(() => text.value.replace(/#/g, String(props.filter.roll?.value ?? ""))),
      selectNumber(event: FocusEvent) {
        (event.target as HTMLInputElement).select();
      },
      closeEditor,
      t,
      showTag,
      showAugmentNotice,
      showQ20Notice,
      calcQuality,
      inputMinEl,
      inputMaxEl,
      sliderValue,
      inputMin: computed({
        // this can be undefined
        get(): number | "" {
          return props.filter.roll!.min!;
        },
        set(value: "" | number) {
          props.filter.roll!.min = value;
        },
      }),
      inputMax: computed({
        // this can be undefined
        get(): number | "" {
          return props.filter.roll!.max!;
        },
        set(value: "" | number) {
          props.filter.roll!.max = value;
        },
      }),
      tag: computed(() => props.filter.tag),
      // TODO: change
      changeStep: computed(() => (props.filter.roll!.dp ? 0.01 : 1)),
      showInputs: computed(
        () => props.filter.roll != null && !props.filter.oils,
      ),
      fontSize: computed(() => AppConfig().fontSize),
      isDisabled: computed(() => props.filter.disabled),
      shortText: computed(() => {
        if (
          props.item.category === ItemCategory.Jewel &&
          props.item.info.refName.startsWith("Time-Lost")
        ) {
          const raw = text.value;
          const templates = [
            _$.TIMELESS_SMALL_PASSIVES,
            _$.TIMELESS_NOTABLE_PASSIVES,
          ];
          for (const template of templates) {
            const escaped = template.replace("{0}", "(.*)");
            const regex = new RegExp("^" + escaped + "$");
            const match = raw.match(regex);
            if (match) return match[1];
          }
        } else if (text.value.startsWith(_$.GRANTS_SKILL)) {
          return text.value.slice(_$.GRANTS_SKILL.length);
        }
        return text.value;
      }),
      text,
      roll: computed(() => props.filter.roll),
      isHidden: computed(() => props.filter.hidden != null),
      hiddenReason: computed(() => t(props.filter.hidden!)),
      showSourceInfo,
      inputFocus,
      toggleFilter,
      toggleVariant,
      adjustRoll,
      showShortText: computed(
        () =>
          (props.item.category === ItemCategory.Jewel &&
            props.item.info.refName.startsWith("Time-Lost")) ||
          text.value.startsWith(_$.GRANTS_SKILL),
      ),
      tradeId: computed(() => {
        if (props.filter.tradeId && props.filter.tradeId.length > 0) {
          return props.filter.tradeId[0];
        }
      }),
    };
  },
});
</script>

<style lang="postcss" module>
.filter {
  @apply py-2;
  @apply border-b border-gray-700;
  display: flex;
  position: relative;
  cursor: pointer;
}

.rollInput {
  @apply bg-gray-900;
  @apply text-gray-300;
  @apply text-center;
  @apply w-12;
  @apply px-1;
  @apply border border-transparent;

  &:first-child {
    @apply rounded-l;
  }
  &:last-child {
    @apply rounded-r;
  }

  &::placeholder {
    @apply text-gray-700;
    font-size: 0.8125rem;
  }

  /* &:not(:placeholder-shown) { @apply border-gray-600; } */

  &:focus {
    @apply border-gray-500;
    cursor: none;
  }
}

.qualityLabel {
  @apply text-gray-500;
  @apply border border-gray-700;
  @apply rounded;
  @apply px-2;
  @apply text-center;
}

.mods {
  border-bottom: 3px solid rgba(139, 92, 246, 0.4);
  background: linear-gradient(
    to bottom,
    #11121d,
    #0a0b12
  );
  @apply -mx-4 px-4;
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  pointer-events: none;
  z-index: 10;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
}

.filter:not(:hover) > .mods {
  display: none;
}

.tag {
  @apply px-1;
  @apply rounded;
  @apply text-xs;
  line-height: 1;
}
.tag-variant {
  @apply bg-yellow-700 text-yellow-100;
}
.tag-eldritch {
  background: linear-gradient(
    to right,
    theme("colors.red.700"),
    theme("colors.blue.700")
  );
}
.tag-explicit-shaper,
.tag-explicit-elder,
.tag-explicit-crusader,
.tag-explicit-hunter,
.tag-explicit-redeemer,
.tag-explicit-warlord,
.tag-explicit-delve,
.tag-explicit-veiled,
.tag-explicit-incursion {
  display: flex;
  align-items: center;
  @apply -mx-1 pl-0.5 gap-x-0.5 text-gray-600;
  text-shadow: 0 0 4px theme("colors.gray.900");

  &::before {
    background-size: contain;
    @apply w-5 h-5 -my-5;
    content: "";
  }
}
.tag-explicit-shaper::before {
  background-image: url("/images/influence-Shaper.png");
}
.tag-explicit-elder::before {
  background-image: url("/images/influence-Elder.png");
}
.tag-explicit-crusader::before {
  background-image: url("/images/influence-Crusader.png");
}
.tag-explicit-hunter::before {
  background-image: url("/images/influence-Hunter.png");
}
.tag-explicit-redeemer::before {
  background-image: url("/images/influence-Redeemer.png");
}
.tag-explicit-warlord::before {
  background-image: url("/images/influence-Warlord.png");
}
.tag-explicit-delve::before {
  background-image: url("/images/delve.png");
}
.tag-explicit-veiled::before {
  background-image: url("/images/veiled.png");
}
.tag-explicit-incursion::before {
  background-image: url("/images/incursion.png");
}

.tag-corrupted {
  @apply bg-red-700 text-red-100;
}
.tag-fractured {
  @apply bg-yellow-400 text-black;
}
.tag-crafted,
.tag-synthesised,
.tag-rune {
  @apply bg-blue-600 text-blue-100;
}
.tag-skill,
.tag-implicit,
.tag-explicit {
  @apply -mx-1 text-gray-600;
  text-shadow: 0 0 4px theme("colors.gray.900");
}
.tag-scourge {
  @apply bg-orange-600 text-white;
}
.tag-enchant {
  @apply bg-purple-600 text-purple-100;
}
.tag-pseudo {
  @apply bg-gray-700 text-black;
}

.tag-added-rune {
  @apply text-blue-100 relative overflow-hidden;

  background: repeating-linear-gradient(
    45deg,
    #3182ce,
    #3182ce 8px,
    #1a4773 8px,
    #1a4773 16px
  );
}
.tag-sanctum {
  @apply border;
}
.tag-desecrated {
  @apply bg-green-900 text-green-100;
}
.tag-mutated {
  @apply bg-rose-900 text-yellow-100;
}
</style>

<style lang="postcss">
.truncate-start {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
}
.truncate-start:after {
  position: absolute;
  left: 0px;
  content: "...";
}
</style>

<style scoped>
.modifier-row { min-width: 0; }
.modifier-line { display: flex; align-items: stretch; gap: 0.6rem; }
.modifier-select {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 0.7rem;
  min-width: 0;
  min-height: 2.95rem;
  padding: 0.45rem 0.1rem;
  cursor: pointer;
  overflow-wrap: anywhere;
  font-size: 1rem;
  line-height: 1.45;
  color: var(--ink);
}
.modifier-select input { flex: none; width: 1rem; height: 1rem; accent-color: var(--accent); cursor: pointer; }
.modifier-select :deep(span) { color: inherit; }
.modifier-select:has(input:not(:checked)) { color: var(--muted); }
.modifier-edit {
  display: inline-flex;
  align-items: center;
  justify-content: end;
  gap: 0.55rem;
  min-width: 2rem;
  padding: 0.3rem 0.45rem;
  color: var(--muted);
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
}
.modifier-edit i { color: var(--quiet); font-size: 0.63rem; }
.modifier-edit[aria-expanded="true"] i { transform: rotate(180deg); }
.modifier-edit:hover, .modifier-edit[aria-expanded="true"] { color: var(--accent); }
.modifier-details {
  display: grid;
  gap: 0.6rem;
  margin: 0 0 0.75rem 1.8rem;
  padding-block: 0.4rem;
}
.range-editor { display: flex; flex-wrap: wrap; gap: 0.55rem; align-items: end; }
.range-editor label { display: grid; gap: 0.3rem; color: var(--muted); font-size: 0.72rem; }
.range-editor input {
  width: 5rem;
  padding: 0.38rem 0.5rem;
  border: 1px solid var(--line-strong);
  border-radius: 0.35rem;
  background: var(--surface);
  color: var(--ink);
  font-size: 0.85rem;
}
.range-adjust { display: inline-flex; }
.range-adjust button, .modifier-facts button { min-height: 2rem; padding: 0.25rem 0.45rem; border-radius: 0.35rem; color: var(--muted); font-size: 0.75rem; }
.range-adjust button:hover, .modifier-facts button:hover { color: var(--ink); background: var(--hover); }
.modifier-facts { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; color: var(--muted); font-size: 0.74rem; }
.modifier-facts:empty { display: none; }
.modifier-facts img { display: inline; vertical-align: middle; }
.modifier-sources { color: var(--muted); font-size: 0.78rem; }
.modifier-sources summary { cursor: pointer; }
.modifier-sources[open] summary { margin-bottom: 0.5rem; }
</style>
