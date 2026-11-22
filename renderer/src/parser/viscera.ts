import type { VisceraImplicit } from "@/assets/data/interfaces";
import type { ParsedStat } from "./stat-translations";

function pattern(text: string) {
  return text.replace(/\u200b/g, "").replace(/\([+-]?\d+(?:\.\d+)?[–~-][+-]?\d+(?:\.\d+)?\)/g, "#")
    .replace(/[+-]?(?:\d+(?:\.\d+)?|#)/g, "#").replace(/\s+/g, " ").trim();
}

export function matchVisceraImplicit(options: VisceraImplicit[], stats: ParsedStat[]) {
  const translated = pattern(stats.map(stat => stat.translation.string).join("\n"));
  return options.find(option => pattern(option.text) === translated);
}
