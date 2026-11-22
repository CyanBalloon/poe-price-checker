<template>
  <dl v-if="show" class="stack-estimates">
    <div>
      <dt>{{ t("trade_result.you_have") }} · {{ value.have.amount }}</dt>
      <dd>{{ value.have.price.primary }}<small v-if="value.have.price.chaos">≈ {{ value.have.price.chaos }}</small></dd>
    </div>
    <div v-if="value.oneStack">
      <dt>{{ t("trade_result.stack") }} · {{ value.oneStack.amount }}</dt>
      <dd>{{ value.oneStack.price.primary }}<small v-if="value.oneStack.price.chaos">≈ {{ value.oneStack.price.chaos }}</small></dd>
    </div>
  </dl>
</template>

<script lang="ts">
import { defineComponent, PropType, computed } from "vue";
import { AppConfig } from "@/web/Config";
import { useI18n } from "vue-i18n";
import { usePoeninja, displayRounding, formatChaosOrDivineAmount } from "@/web/background/Prices";
import { getDetailsId } from "../trends/getDetailsId";
import { ParsedItem, ItemCategory } from "@/parser";
import { ItemFilters } from "../filters/interfaces";

export default defineComponent({
  props: {
    filters: {
      type: Object as PropType<ItemFilters>,
      required: true,
    },
    item: {
      type: Object as PropType<ParsedItem>,
      required: true,
    },
  },
  setup(props) {
    const { findPriceByQuery, autoCurrency, displayPrice } = usePoeninja();

    function getPriceFor(n: number) {
      const one = findPriceByQuery(getDetailsId(props.item)!)!;
      const isCurrency = props.item.category === ItemCategory.Currency;
      const price = autoCurrency(
        n * one.primaryValue,
        isCurrency,
        isCurrency && AppConfig().game === "poe2" ? "exalted" : undefined,
      );

      const { primary, chaosEquivalent } = displayPrice(price);
      const amount = AppConfig().game === "poe1" ? formatChaosOrDivineAmount(primary.min) : displayRounding(primary.min);
      return {
        primary: amount + " " + primary.currency,
        chaos: chaosEquivalent && formatChaosOrDivineAmount(chaosEquivalent.min) + " chaos",
      };
    }

    const { t } = useI18n();

    return {
      t,
      show: computed(() => {
        const id = getDetailsId(props.item);
        return Boolean(props.filters.stackSize && id && findPriceByQuery(id));
      }),
      value: computed(() => {
        const owned = props.item.stackSize?.value ?? props.filters.stackSize!.value;
        return {
          have: {
            amount: owned,
            price: getPriceFor(owned),
          },
          oneStack: props.item.stackSize
            ? {
                amount: props.item.stackSize.max,
                price: getPriceFor(props.item.stackSize.max),
              }
            : null,
        };
      }),
    };
  },
});
</script>

<style scoped>
.stack-estimates small { display: block; color: var(--muted); font-weight: 400; }
.stack-estimates {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  margin-top: 0.65rem;
}

.stack-estimates > div {
  min-width: 5rem;
}

.stack-estimates dt {
  color: var(--quiet);
  font-size: 0.7rem;
}

.stack-estimates dd {
  margin-top: 0.1rem;
  color: var(--ink);
  font-size: 0.79rem;
  font-variant-numeric: tabular-nums;
}
</style>
