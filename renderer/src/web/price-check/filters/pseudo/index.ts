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

const RESISTANCES_INFO = [
  {
    ref: "#% to All Resistances",
    elements: ["fire", "cold", "lightning"],
    chaos: true,
  },
  {
    ref: "#% to all Elemental Resistances",
    elements: ["fire", "cold", "lightning"],
  },
  { ref: "#% to Fire Resistance", elements: ["fire"] },
  { ref: "#% to Cold Resistance", elements: ["cold"] },
  { ref: "#% to Lightning Resistance", elements: ["lightning"] },
  {
    ref: "#% to Fire and Lightning Resistances",
    elements: ["fire", "lightning"],
  },
  { ref: "#% to Fire and Cold Resistances", elements: ["fire", "cold"] },
  {
    ref: "#% to Cold and Lightning Resistances",
    elements: ["cold", "lightning"],
  },
  { ref: "#% to Chaos Resistance", elements: [], chaos: true },
  {
    ref: "#% to Fire and Chaos Resistances",
    elements: ["fire"],
    chaos: true,
  },
  {
    ref: "#% to Cold and Chaos Resistances",
    elements: ["cold"],
    chaos: true,
  },
  {
    ref: "#% to Lightning and Chaos Resistances",
    elements: ["lightning"],
    chaos: true,
  },
];

const ATTRIBUTES_INFO = [
  { ref: "# to all Attributes", attributes: ["str", "dex", "int"] },
  { ref: "# to Strength", attributes: ["str"] },
  { ref: "# to Dexterity", attributes: ["dex"] },
  { ref: "# to Intelligence", attributes: ["int"] },
  { ref: "# to Strength and Intelligence", attributes: ["str", "int"] },
  { ref: "# to Strength and Dexterity", attributes: ["str", "dex"] },
  { ref: "# to Dexterity and Intelligence", attributes: ["dex", "int"] },
];

const poe2PseudoRules: PseudoRule[] = [
  {
    pseudo: "#% total Elemental Resistance",
    disabled: false,
    stats: RESISTANCES_INFO.filter((info) => info.elements.length).map(
      (info) => ({ ref: info.ref, multiplier: info.elements.length }),
    ),
  },
  {
    pseudo: "#% total to Fire Resistance",
    group: "to_x_ele_res",
    stats: RESISTANCES_INFO.filter((info) =>
      info.elements.includes("fire"),
    ).map((info) => ({ ref: info.ref })),
  },
  {
    pseudo: "#% total to Cold Resistance",
    group: "to_x_ele_res",
    stats: RESISTANCES_INFO.filter((info) =>
      info.elements.includes("cold"),
    ).map((info) => ({ ref: info.ref })),
  },
  {
    pseudo: "#% total to Lightning Resistance",
    group: "to_x_ele_res",
    stats: RESISTANCES_INFO.filter((info) =>
      info.elements.includes("lightning"),
    ).map((info) => ({ ref: info.ref })),
  },
  {
    pseudo: "#% total to Chaos Resistance",
    stats: RESISTANCES_INFO.filter((info) => info.chaos === true).map(
      (info) => ({ ref: info.ref }),
    ),
    disabled: false,
  },
  {
    pseudo: "+# total to all Attributes",
    group: "to_all_attrs",
    stats: [
      { ref: "# to all Attributes" },
    ],
  },
  {
    pseudo: "+# total to Strength",
    group: "to_x_attr",
    stats: ATTRIBUTES_INFO.filter((info) =>
      info.attributes.includes("str"),
    ).map((info) => ({ ref: info.ref })),
  },
  {
    pseudo: "+# total to Dexterity",
    group: "to_x_attr",
    stats: ATTRIBUTES_INFO.filter((info) =>
      info.attributes.includes("dex"),
    ).map((info) => ({ ref: info.ref })),
  },
  {
    pseudo: "+# total to Intelligence",
    group: "to_x_attr",
    stats: ATTRIBUTES_INFO.filter((info) =>
      info.attributes.includes("int"),
    ).map((info) => ({ ref: info.ref })),
  },
  {
    pseudo: "+# total maximum Life",
    disabled: false,
    stats: [
      { ref: "# to maximum Life", required: true },
      ...ATTRIBUTES_INFO.filter((info) => info.attributes.includes("str")).map(
        (info) => ({ ref: info.ref, multiplier: 2 }),
      ),
    ],
  },
  {
    pseudo: "+# total maximum Mana",
    stats: [
      { ref: "# to maximum Mana", required: true },
      ...ATTRIBUTES_INFO.filter((info) => info.attributes.includes("int")).map(
        (info) => ({ ref: info.ref, multiplier: 2 }),
      ),
    ],
  },
  {
    pseudo: "#% total increased maximum Energy Shield",
    stats: [{ ref: "#% increased maximum Energy Shield" }],
  },
  {
    pseudo: "+# total maximum Energy Shield",
    stats: [
      { ref: "# to maximum Energy Shield" }, // global
    ],
  },
  {
    pseudo: "#% increased Movement Speed",
    stats: [{ ref: "#% increased Movement Speed" }],
    disabled: false,
  },
  {
    pseudo: "# uses remaining",
    disabled: false,
    stats: [
      { ref: "Adds Irradiated to a Map \n# use remaining" },
      { ref: "Adds Ritual Altars to a Map \n# use remaining" },
      { ref: "Adds a Kalguuran Expedition to a Map \n# use remaining" },
      { ref: "Adds a Mirror of Delirium to a Map \n# use remaining" },
      { ref: "Adds an Otherworldy Breach to a Map \n# use remaining" },
      { ref: "Empowers the Map Boss of a Map \n# use remaining" },
      { ref: "Adds Abysses to a Map \n# use remaining" },
      { ref: "Adds Vaal Beacons to a Map \n# use remaining" },
    ],
  },
];

function activeRules() {
  return AppConfig()?.game === "poe1" ? poe1PseudoRules : poe2PseudoRules;
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
function sourceRefs(rules: PseudoRule[]) {
  const refs = rules.flatMap(rule => rule.stats.map(stat => stat.ref));
  return new Set([...refs, ...refs.map(ref => ref.replace(/[+-]#/g, "#"))]);
}
const poe1SourceRefs = sourceRefs(poe1PseudoRules);
const poe2SourceRefs = sourceRefs(poe2PseudoRules);

export function refEffectsPseudos(ref: string): boolean {
  const refs = AppConfig()?.game === "poe1" ? poe1SourceRefs : poe2SourceRefs;
  return (
    refs.has(ref) ||
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
