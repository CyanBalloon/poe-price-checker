import { ITEM_BY_REF, TRADE_TAG_TO_REF } from "@/assets/data";
import { AppConfig } from "@/web/Config";

const coreCurrencies = {
  chaos: "Chaos Orb",
  divine: "Divine Orb",
  exalted: "Exalted Orb",
  annul: "Orb of Annulment",
} as const;

type CoreCurrency = keyof typeof coreCurrencies;
const aliases = new Map<string, CoreCurrency>([
  ["c", "chaos"], ["chaos", "chaos"],
  ["div", "divine"], ["divine", "divine"],
  ["ex", "exalted"], ["exa", "exalted"], ["exalt", "exalted"], ["exalted", "exalted"],
  ["annul", "annul"], ["annulment", "annul"],
]);

export function currencyIcon(currency: string) {
  const id = currency.toLowerCase();
  const core = aliases.get(id);
  if (core) {
    return `/images/${AppConfig()?.game ?? "poe2"}/${core}.png`;
  }

  const ref = TRADE_TAG_TO_REF.get(id);
  const icon = ref && ITEM_BY_REF("ITEM", ref)?.[0]?.icon;
  return icon && icon !== "%NOT_FOUND%" ? icon : undefined;
}

export function currencyLabel(currency: string, amount = 1) {
  const id = currency.toLowerCase();
  const core = aliases.get(id);
  const ref = TRADE_TAG_TO_REF.get(id);
  if (!core) return ref || currency;
  if (amount === 1) return coreCurrencies[core];
  return core === "annul" ? "Orbs of Annulment" : coreCurrencies[core] + "s";
}
