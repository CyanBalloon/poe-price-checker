import { CLIENT_STRINGS as _$ } from "@/assets/data";
import type { ParsedStat } from "./stat-translations";
import { ModifierType } from "./modifiers";
import { ItemInfluence } from "./ParsedItem";
import { removeLinesEnding } from "./Parser";

export const SCOURGE_LINE = " (scourge)";
export const AUGMENT_LINE = " (rune)";
export const ADDED_AUGMENT_LINE = " (added rune)";
export const ENCHANT_LINE = " (enchant)";
export const IMPLICIT_LINE = " (implicit)";
export const DESECRATED_LINE = " (desecrated)";
const CRAFTED_LINE = " (crafted)";
const FRACTURED_LINE = " (fractured)";

export interface ParsedModifier {
  info: ModifierInfo;
  stats: ParsedStat[];
}

export interface ModifierInfo {
  type: ModifierType;
  generation?: "suffix" | "prefix" | "corrupted" | "eldritch" | "mutated";
  isFoulborn?: true;
  isRareOnly?: true;
  influence?: ItemInfluence.SearingExarch | ItemInfluence.EaterOfWorlds;
  name?: string;
  tier?: number;
  rank?: number;
  tags: string[];
  rollIncr?: number;
  hybridWithRef?: Set<string>;
}

export function parseModInfoLine(
  line: string,
  type: ModifierType,
): ModifierInfo {
  const [modText, xText2, xText3] = line
    .slice(1, -1)
    .split("\u2014")
    .map((_) => _.trim());

  let generation: ModifierInfo["generation"];
  let isFoulborn: ModifierInfo["isFoulborn"];
  let isRareOnly: ModifierInfo["isRareOnly"];
  let name: ModifierInfo["name"];
  let tier: ModifierInfo["tier"];
  let rank: ModifierInfo["rank"];

  let influence: ModifierInfo["influence"];
  const eater = _$.EATER_IMPLICIT.exec(modText);
  const match = eater ?? _$.EXARCH_IMPLICIT.exec(modText);
  if (match) {
    generation = "eldritch";
    if (_$.MAP_TIER instanceof RegExp) {
      type = ModifierType.Implicit;
      influence = eater ? ItemInfluence.EaterOfWorlds : ItemInfluence.SearingExarch;
    }
    switch (match.groups!.rank) {
      case _$.ELDRITCH_MOD_R1:
        rank = 1;
        break;
      case _$.ELDRITCH_MOD_R2:
        rank = 2;
        break;
      case _$.ELDRITCH_MOD_R3:
        rank = 3;
        break;
      case _$.ELDRITCH_MOD_R4:
        rank = 4;
        break;
      case _$.ELDRITCH_MOD_R5:
        rank = 5;
        break;
      case _$.ELDRITCH_MOD_R6:
        rank = 6;
        break;
    }
  } else {
    const match = modText.match(_$.MODIFIER_LINE);
    if (!match) {
      throw new Error("Invalid regex for mod info line");
    }
    match.groups!.type = match.groups!.type.trim();
    if (match.groups!.type.startsWith(_$.FRACTURED_MODIFIER)) {
      match.groups!.type = match
        .groups!.type.slice(_$.FRACTURED_MODIFIER.length)
        .trim();
      type = ModifierType.Fractured;
    } else if (match.groups!.type.startsWith(_$.DESECRATED_MODIFIER)) {
      match.groups!.type = match
        .groups!.type.slice(_$.DESECRATED_MODIFIER.length)
        .trim();
      type = ModifierType.Desecrated;
    } else if (match.groups!.type.startsWith(_$.CRAFTED_MODIFIER)) {
      match.groups!.type = match
        .groups!.type.slice(_$.CRAFTED_MODIFIER.length)
        .trim();
      type = ModifierType.Crafted;
    }

    let label = match.groups!.type;
    const { RARE_ONLY_PREFIX, RARE_ONLY_SUFFIX, PREFIX_MODIFIER, SUFFIX_MODIFIER } = _$;
    if (RARE_ONLY_PREFIX && RARE_ONLY_PREFIX === RARE_ONLY_SUFFIX) {
      // Some languages use one qualifier for both affix types.
      const unqualified = label.replace(RARE_ONLY_PREFIX, "").trim();
      if (unqualified !== label && (!unqualified || unqualified === PREFIX_MODIFIER || unqualified === SUFFIX_MODIFIER)) {
        isRareOnly = true;
        label = unqualified;
      }
    } else if (label === RARE_ONLY_PREFIX || label === RARE_ONLY_SUFFIX) {
      isRareOnly = true;
      label = label === RARE_ONLY_PREFIX ? PREFIX_MODIFIER : SUFFIX_MODIFIER;
    }

    switch (label) {
      case _$.CRAFTED_PREFIX:
        type = ModifierType.Crafted;
        generation = "prefix";
        break;
      case _$.CRAFTED_SUFFIX:
        type = ModifierType.Crafted;
        generation = "suffix";
        break;
      case _$.PREFIX_MODIFIER:
        generation = "prefix";
        break;
      case _$.SUFFIX_MODIFIER:
        generation = "suffix";
        break;
      case _$.CORRUPTED_IMPLICIT:
        generation = "corrupted";
        if (_$.MAP_TIER instanceof RegExp) type = ModifierType.Implicit;
        break;
      case _$.IMPLICIT_MODIFIER:
      case _$.VESTIGIAL_IMPLICIT:
        type = ModifierType.Implicit;
        break;
      case _$.FOULBORN_MODIFIER:
        isFoulborn = true;
        generation = "mutated";
        break;
      case _$.VAAL_UNIQUE_MODIFIER:
        generation = "mutated";
    }
    name = match.groups!.name || undefined;
    tier = Number(match.groups!.tier) || undefined;
    rank = Number(match.groups!.rank) || undefined;
  }

  let tags: ModifierInfo["tags"];
  let rollIncr: ModifierInfo["rollIncr"];
  {
    const incrText =
      xText3 !== undefined
        ? xText3
        : xText2 !== undefined && _$.MODIFIER_INCREASED.test(xText2)
          ? xText2
          : undefined;

    const tagsText =
      xText2 !== undefined && incrText !== xText2 ? xText2 : undefined;

    tags = tagsText ? tagsText.split(", ") : [];
    rollIncr = incrText
      ? Number(_$.MODIFIER_INCREASED.exec(incrText)![1])
      : undefined;
  }

  return { type, generation, isFoulborn, name, tier, rank, tags, rollIncr, ...(isRareOnly && { isRareOnly }), ...(influence && { influence }) };
}

export function isModInfoLine(line: string): boolean {
  return line.startsWith("{") && line.endsWith("}");
}

interface GroupedModLines {
  modLine: string;
  statLines: string[];
}

export function* groupLinesByMod(
  lines: string[],
): Generator<GroupedModLines, void> {
  if (!lines.length || !isModInfoLine(lines[0])) {
    return;
  }

  let last: GroupedModLines | undefined;
  for (const line of lines) {
    if (!isModInfoLine(line)) {
      last!.statLines.push(line);
    } else {
      if (last) {
        yield last;
      }
      last = { modLine: line, statLines: [] };
    }
  }
  yield last!;
}

export function parseModType(lines: string[]): {
  modType: ModifierType;
  lines: string[];
} {
  let modType: ModifierType;
  if (lines[0] === _$.VEILED_PREFIX || lines[0] === _$.VEILED_SUFFIX) {
    modType = ModifierType.Veiled;
  } else if (lines.some((line) => line.endsWith(SCOURGE_LINE))) {
    modType = ModifierType.Scourge;
    lines = removeLinesEnding(lines, SCOURGE_LINE);
  } else if (lines.some((line) => line.endsWith(ENCHANT_LINE))) {
    modType = ModifierType.Enchant;
    lines = removeLinesEnding(lines, ENCHANT_LINE);
  } else if (lines.some((line) => line.endsWith(IMPLICIT_LINE))) {
    modType = ModifierType.Implicit;
    lines = removeLinesEnding(lines, IMPLICIT_LINE);
  } else if (lines.some((line) => line.endsWith(FRACTURED_LINE))) {
    modType = ModifierType.Fractured;
    lines = removeLinesEnding(lines, FRACTURED_LINE);
  } else if (lines.some((line) => line.endsWith(CRAFTED_LINE))) {
    modType = ModifierType.Crafted;
    lines = removeLinesEnding(lines, CRAFTED_LINE);
  } else if (lines.some((line) => line.endsWith(AUGMENT_LINE))) {
    modType = ModifierType.Augment;
    lines = removeLinesEnding(lines, AUGMENT_LINE);
  } else if (lines.some((line) => line.endsWith(ADDED_AUGMENT_LINE))) {
    modType = ModifierType.AddedAugment;
    lines = removeLinesEnding(lines, ADDED_AUGMENT_LINE);
  } else if (lines.some((line) => line.endsWith(DESECRATED_LINE))) {
    modType = ModifierType.Desecrated;
    lines = removeLinesEnding(lines, DESECRATED_LINE);
  } else {
    modType = ModifierType.Explicit;
  }

  return { modType, lines };
}

// stat values internally stored as ints,
// this is the most common formatter
const DIV_BY_100 = 2;

export function applyIncr(
  mod: ModifierInfo,
  parsed: ParsedStat,
): ParsedStat | null {
  const { rollIncr } = mod;
  const { roll } = parsed;

  if (!rollIncr || !roll || roll.unscalable) {
    return null;
  }

  return {
    stat: parsed.stat,
    translation: parsed.translation,
    roll: {
      unscalable: roll.unscalable,
      dp: roll.dp,
      value: incrRoll(roll.value, rollIncr, roll.dp ? DIV_BY_100 : 0),
      min: incrRoll(roll.min, rollIncr, roll.dp ? DIV_BY_100 : 0),
      max: incrRoll(roll.max, rollIncr, roll.dp ? DIV_BY_100 : 0),
    },
  };
}

export function incrRoll(value: number, p: number, dp: number): number {
  const res = value + (value * p) / 100;
  const rounding = Math.pow(10, dp);
  return Math.trunc((res + Number.EPSILON) * rounding) / rounding;
}
