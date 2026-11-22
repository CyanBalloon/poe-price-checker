import { Host } from "./IPC";

const STASH_CATEGORIES = [
  ["Currency", "ITEM", "currency"],
  ["Fragment", "ITEM", "fragments"],
  ["SkillGem", "GEM", "skill-gems"],
  ["BaseType", "ITEM", "base-types"],
  ["Map", "ITEM", "maps"],
  ["BlightedMap", "ITEM", "blighted-maps"],
  ["BlightRavagedMap", "ITEM", "blight-ravaged-maps"],
  ["Invitation", "ITEM", "invitations"],
  ["UniqueMap", "UNIQUE", "unique-maps"],
  ["UniqueJewel", "UNIQUE", "unique-jewels"],
  ["UniqueFlask", "UNIQUE", "unique-flasks"],
  ["UniqueWeapon", "UNIQUE", "unique-weapons"],
  ["UniqueArmour", "UNIQUE", "unique-armours"],
  ["UniqueAccessory", "UNIQUE", "unique-accessories"],
  ["UniqueTincture", "UNIQUE", "unique-tinctures"],
  ["UniqueRelic", "UNIQUE", "unique-relics"],
] as const;

const EXCHANGE_CATEGORIES = [
  ["DivinationCard", "DIVINATION_CARD", "divination-cards"],
  ["Scarab", "ITEM", "scarabs"],
  ["Essence", "ITEM", "essences"],
  ["Fossil", "ITEM", "fossils"],
  ["Resonator", "ITEM", "resonators"],
  ["Oil", "ITEM", "oils"],
  ["DeliriumOrb", "ITEM", "delirium-orbs"],
  ["Artifact", "ITEM", "artifacts"],
  ["Tattoo", "ITEM", "tattoos"],
  ["Omen", "ITEM", "omens"],
] as const;

interface Sparkline {
  totalChange: number;
  data: Array<number | null>;
}

interface StashLine {
  name?: string;
  currencyTypeName?: string;
  detailsId: string;
  chaosValue?: number;
  chaosEquivalent?: number;
  baseType?: string;
  variant?: string;
  gemLevel?: number;
  gemQuality?: number;
  corrupted?: boolean;
  mapTier?: number;
  links?: number;
  sparkline?: Sparkline;
  paySparkLine?: Sparkline;
  receiveSparkLine?: Sparkline;
}

interface ExchangeLine {
  id: string;
  primaryValue: number;
  sparkline?: Sparkline;
}

interface ExchangeOverview {
  core: { primary: string; rates: Record<string, number>; items?: ExchangeItem[] };
  lines: ExchangeLine[];
  items?: ExchangeItem[];
}

interface ExchangeItem {
  id: string;
  name: string;
}

interface PriceKey {
  ns: string;
  name: string;
  variant?: string;
}

interface StashPrice extends PriceKey {
  chaos: number;
  url: string;
  detailsId: string;
  sparkline: Sparkline;
}

const EMPTY_SPARKLINE: Sparkline = { totalChange: 0, data: [] };

export function poe1PriceKey({ ns, name, variant }: PriceKey) {
  return JSON.stringify([ns, name, variant]);
}

function stashVariant(type: string, line: StashLine) {
  if (type === "SkillGem") {
    return String(line.gemLevel ?? 1) + (line.gemQuality ? "/" + line.gemQuality : "") + (line.corrupted ? "c" : "");
  }
  if (type === "Map" || type === "BlightedMap" || type === "BlightRavagedMap") {
    return line.mapTier ? "T" + line.mapTier : undefined;
  }
  if (type.startsWith("Unique")) {
    const base = type === "UniqueFlask" || type === "UniqueMap" ? undefined : line.baseType;
    return [line.variant, base, line.links ? line.links + "L" : undefined].filter(Boolean).join(", ") || undefined;
  }
  return line.variant;
}

export async function loadPoe1Prices(league: string, signal: AbortSignal) {
  const base = "poe.ninja/poe1/api/economy/";
  const leagueSlug = league.startsWith("Hardcore ")
    ? league.slice("Hardcore ".length).toLowerCase().replace(/\s+/g, "") + "hc"
    : league.toLowerCase().replace(/\s+/g, "");
  const site = "https://poe.ninja/poe1/economy/" + leagueSlug + "/";
  const prices = new Map<string, StashPrice>();
  const names = new Map<string, PriceKey>();
  function add(entry: StashPrice) {
    prices.set(poe1PriceKey(entry), entry);
    const { ns, name, variant } = entry;
    const key = poe1PriceKey({ ns, name });
    if (!names.has(key) || !variant) names.set(key, { ns, name, variant });
  }

  async function overview<T>(path: string, type: string): Promise<T> {
    const params = new URLSearchParams({ league, type });
    const response = await Host.proxy(base + path + "?" + params, { signal });
    if (!response.ok) throw new Error("poe.ninja returned " + response.status + " for " + type);
    return response.json();
  }

  const tasks = [
    ...STASH_CATEGORIES.map(([type, ns, category]) => async () => {
      const group = type === "Currency" || type === "Fragment" ? "currency" : "item";
      const { lines } = await overview<{ lines: StashLine[] }>("stash/current/" + group + "/overview", type);
      for (const line of lines) {
        const name = line.name ?? line.currencyTypeName;
        const chaos = line.chaosValue ?? line.chaosEquivalent;
        if (!name || chaos == null || !Number.isFinite(chaos)) continue;
        add({
          ns, name, chaos, variant: stashVariant(type, line),
          detailsId: line.detailsId,
          url: site + category + "/" + line.detailsId,
          sparkline: line.sparkline ?? line.receiveSparkLine ?? line.paySparkLine ?? EMPTY_SPARKLINE,
        });
      }
    }),
    ...EXCHANGE_CATEGORIES.map(([type, ns, category]) => async () => {
      const data = await overview<ExchangeOverview>("exchange/current/overview", type);
      const items = new Map((data.items ?? data.core.items ?? []).map((item) => [item.id, item.name]));
      const chaosPerPrimary = data.core.primary === "chaos" ? 1 : data.core.rates.chaos;
      if (!chaosPerPrimary) return;
      for (const line of data.lines) {
        const name = items.get(line.id);
        if (!name || !Number.isFinite(line.primaryValue)) continue;
        add({
          ns, name, chaos: line.primaryValue * chaosPerPrimary,
          detailsId: line.id,
          url: site + category + "/" + line.id,
          sparkline: line.sparkline ?? EMPTY_SPARKLINE,
        });
      }
    }),
  ];

  const batchSize = 4;
  for (let i = 0; i < tasks.length; i += batchSize) {
    if (signal.aborted) return { prices, names };
    const results = await Promise.allSettled(tasks.slice(i, i + batchSize).map((task) => task()));
    if (!signal.aborted) {
      for (const result of results) {
        if (result.status === "rejected") console.warn(result.reason);
      }
    }
  }
  if (prices.size && !prices.has(poe1PriceKey({ ns: "ITEM", name: "Chaos Orb" }))) {
    add({
      ns: "ITEM", name: "Chaos Orb", chaos: 1, detailsId: "chaos-orb",
      url: site + "currency/chaos-orb", sparkline: EMPTY_SPARKLINE,
    });
  }
  return { prices, names };
}
