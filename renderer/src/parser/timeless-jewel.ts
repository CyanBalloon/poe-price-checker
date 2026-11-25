import { STATS_ITERATOR } from "@/assets/data";
import type { ParsedItem } from "./ParsedItem";

const seedPrefix = "explicit.pseudo_timeless_jewel_";

export function isTimelessSeedId(id: string) {
  return id.startsWith(seedPrefix);
}

export function isHistoricJewel(item: ParsedItem) {
  const unique = item.info.unique;
  return unique?.base === "Timeless Jewel" || unique?.fixedStats?.includes("Historic") === true;
}

// Use the active language's actual seed lines, including legacy figures that
// only have a one-line trade translation. Switching game data replaces the iterator.
const translations = new WeakMap<typeof STATS_ITERATOR, { titles: Map<string, string>; captions: Set<string> }>();

function seedTranslations() {
  const cached = translations.get(STATS_ITERATOR);
  if (cached) return cached;
  const titles = new Map<string, string>();
  const captions = new Set<string>();
  for (const stat of STATS_ITERATOR(seedPrefix)) {
    if (!stat.trade.ids.explicit?.some(isTimelessSeedId)) continue;
    for (const matcher of stat.matchers) {
      const [title, caption] = matcher.string.split("\n");
      if (caption) captions.add(caption);
      titles.set(title, matcher.string);
      if (matcher.advanced) titles.set(matcher.advanced.split("\n")[0], matcher.string);
    }
  }
  const result = { titles, captions };
  translations.set(STATS_ITERATOR, result);
  return result;
}

export function joinTimelessSeedLines(lines: string[]) {
  const { titles, captions } = seedTranslations();
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const number = line.match(/\d+(?:\(\d+(?:-\d+)?\))?/);
    const title = number && line.replace(number[0], "#").replace(/[（(](?:\.{3}|…)?[）)]/gu, "");
    const matcher = title && titles.get(title);
    if (!matcher || !number) {
      result.push(line);
      continue;
    }
    // The faction caption belongs to the seed even in a basic Ctrl+C copy.
    // Retain the seed and its original roll bounds for the normal stat parser.
    result.push(matcher.replace("#", number[0]));
    if (captions.has(lines[i + 1])) i++;
  }
  return result;
}
