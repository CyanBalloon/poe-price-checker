import { STAT_BY_REF } from "@/assets/data";
import { AppConfig } from "@/web/Config";
import { ModifierType, StatCalculated, StatSource } from "@/parser/modifiers";
import {
  calculatedStatToFilter,
  FiltersCreationContext,
} from "../create-stat-filters";
import { type StatFilter } from "../interfaces";
import { ARMOUR_STATS, WEAPON_STATS } from "./item-property";
import { tryParseTranslation } from "@/parser/stat-translations";


interface PseudoRule {
  group?: string;
  pseudo: string;
  disabled?: boolean;
  replaces?: string;
  stats: Array<{
    ref: string;
    multiplier?: number;
    required?: boolean;
  }>;
  mutate?: (filter: StatFilter) => void;
}

const elementalResistances = ["Fire", "Cold", "Lightning"];
const poe1PseudoRules: PseudoRule[] = [
  {
    pseudo: "+#% total Elemental Resistance",
    stats: [
      ...elementalResistances.map((element) => ({ ref: "+#% to " + element + " Resistance" })),
      { ref: "+#% to all Elemental Resistances", multiplier: 3 },
      { ref: "+#% to All Resistances", multiplier: 3 },
      ...["Fire and Cold", "Fire and Lightning", "Cold and Lightning"].map((pair) => ({
        ref: "+#% to " + pair + " Resistances",
        multiplier: 2,
      })),
    ],
  },
  {
    pseudo: "+# total maximum Life",
    stats: [{ ref: "+# to maximum Life" }],
  },
  {
    pseudo: "+#% total to Chaos Resistance",
    stats: [{ ref: "+#% to Chaos Resistance" }, { ref: "+#% to All Resistances" }],
  },
];

function activeRules() {
  return AppConfig()?.game === "poe1" ? poe1PseudoRules : [];
}

export function filterPseudo(ctx: FiltersCreationContext) {
  const filterByGroup = new Map<string, StatFilter[]>();

  const appliedRefs = new Set<string>();
  rulesLoop: for (const rule of activeRules()) {
    const pseudo = STAT_BY_REF(rule.pseudo);
    if (!pseudo?.trade.ids.pseudo?.length) continue;
    const sources = filterPseudoSources(ctx.statsByType, ({ stat }, source) => {
      const info = rule.stats.find((info) => info.ref === stat.ref);
      if (!info || !source.contributes) return null;

      const multi = info.multiplier ?? 1;
      return {
        ...source,
        contributes: {
          value: source.contributes!.value * multi,
          min: source.contributes!.min * multi,
          max: source.contributes!.max * multi,
        },
      };
    });
    if (!sources.length) continue;

    if (rule.stats.some((s) => s.required)) {
      for (const stat of rule.stats) {
        if (
          stat.required &&
          !sources.some((source) => source.stat.stat.ref === stat.ref)
        ) {
          continue rulesLoop;
        }
      }
    }

    const filter = calculatedStatToFilter(
      {
        stat: pseudo,
        type: ModifierType.Pseudo,
        sources,
      },
      ctx.searchInRange,
      ctx.item,
    );

    filter.disabled = rule.disabled ?? true;

    if (rule.mutate) {
      rule.mutate(filter);
    }

    ctx.filters.push(filter);
    for (const { ref } of rule.stats) appliedRefs.add(ref);

    if (rule.replaces && filterByGroup.has(rule.replaces)) {
      const replacedFilters = filterByGroup.get(rule.replaces)!;
      ctx.filters = ctx.filters.filter(
        (filter) => !replacedFilters.includes(filter),
      );
    }

    if (rule.group) {
      if (filterByGroup.has(rule.group)) {
        filterByGroup.get(rule.group)!.push(filter);
      } else {
        filterByGroup.set(rule.group, [filter]);
      }
    }
  }

  ctx.statsByType = ctx.statsByType.filter(
    (m) =>
      m.type === ModifierType.Augment ||
      m.type === ModifierType.AddedAugment ||
      !appliedRefs.has(m.stat.ref),
  );

  if (filterByGroup.has("to_x_ele_res")) {
    const resFilters = filterByGroup.get("to_x_ele_res")!;

    resFilters.sort((a, b) => b.roll!.value - a.roll!.value);
    const maxFilter =
      resFilters[0]?.roll?.value === resFilters[1]?.roll?.value
        ? undefined
        : resFilters[0];

    if (maxFilter) {
      maxFilter.hidden = "filters.hide_ele_res";
    }

    ctx.filters = ctx.filters.filter(
      (filter) => !resFilters.includes(filter) || filter === maxFilter,
    );
  }

  if (filterByGroup.has("to_x_attr")) {
    const attrFilters = filterByGroup.get("to_x_attr")!;
    attrFilters.sort((a, b) => b.roll!.value - a.roll!.value);
    if (attrFilters.length === 3) {
      const toAll = filterByGroup.get("to_all_attrs");
      if (
        attrFilters.every(
          (f) => f.roll!.value === attrFilters[0].roll!.value,
        ) &&
        toAll != null
      ) {
        ctx.filters = ctx.filters.filter(
          (filter) => !attrFilters.includes(filter),
        );
      } else {
        if (toAll != null) {
          ctx.filters = ctx.filters.filter((filter) => !toAll.includes(filter));
        }

        if (attrFilters[2].roll!.value / attrFilters[0].roll!.value < 0.3) {
          if (attrFilters[1].roll!.value === attrFilters[2].roll!.value) {
            attrFilters[1].hidden = "hide_attr_same_2nd_n_3rd";
            attrFilters[2].hidden = "hide_attr_same_2nd_n_3rd";
          } else {
            attrFilters[2].hidden = "hide_attr_smallest_total";
          }
        }
      }
    }
  }
}

function filterPseudoSources(
  stats: StatCalculated[],
  mapFn: (calc: StatCalculated, source: StatSource) => StatSource | null,
): StatSource[] {
  const out: StatSource[] = [];
  for (const calc of stats) {
    for (const source of calc.sources) {
      if (
        source.modifier?.info &&
        (source.modifier.info.type === ModifierType.Augment ||
          source.modifier.info.type === ModifierType.AddedAugment)
      ) {
        continue;
      }
      const result = mapFn(calc, source);
      if (result) {
        out.push(result);
      }
    }
  }
  return out;
}
const PSEUDO_REF_SET = new Set([
  ...poe1PseudoRules.flatMap((rule) => rule.stats.map((stat) => stat.ref)),
  ...poe1PseudoRules.flatMap((rule) => rule.stats.map((stat) => stat.ref)).map(
    (i) => i.replaceAll("+#", "#"),
  ),
  ...poe1PseudoRules.flatMap((rule) => rule.stats.map((stat) => stat.ref)).map(
    (i) => i.replaceAll("-#", "#"),
  ),
]);
export function refEffectsPseudos(ref: string): boolean {
  // If it is in these pseudos
  return (
    (AppConfig()?.game === "poe1" && PSEUDO_REF_SET.has(ref)) ||
    ARMOUR_STATS.has(ref) ||
    WEAPON_STATS.has(ref) ||
    ref === "Adds # to # Chaos Damage"
  );
}

export function translatedEffectsPseudos(translated: string): boolean {
  // get the ref from the translated string
  const stat = tryParseTranslation(
    { string: translated, unscalable: false },
    ModifierType.Augment,
    undefined,
  );
  if (!stat) return false;
  const ref = stat.stat.ref;
  // If it is in these pseudos
  return refEffectsPseudos(ref);
}

// Disable since this is export for tests
// eslint-disable-next-line @typescript-eslint/naming-convention
export const __testExports = {
  filterPseudoSources,
};
