import { iconHasInfluenceBackdrop, sameItemIconArt } from "@ipc/item-icons";
import { AppConfig } from "@/web/Config";
import { getCategoryToTradeId } from "./trade-constants";
import { ItemCategory, ParsedItem, ItemInfluence, ItemRarity } from "@/parser";
import { readListingInfluences, type ListingInfluences } from "@/parser/item-influences";
import { listingInventory, type InventoryFlags } from "@/parser/inventory-effects";
import {
  ItemFilters,
  StatFilter,
  INTERNAL_TRADE_IDS,
  InternalTradeId,
  ItemIsElementalModifier,
  FilterTag,
} from "../filters/interfaces";
import { setProperty as propSet } from "dot-prop";
import { DateTime } from "luxon";
import { Host } from "@/web/background/IPC";
import {
  TradeResponse,
  Account,
  getTradeEndpoint,
  getTradeEndpointPath,
  adjustRateLimits,
  RATE_LIMIT_RULES,
  preventQueueCreation,
} from "./common";
import { STAT_BY_REF, CLIENT_STRINGS as _$, ITEM_BY_REF, ITEM_BY_TRANSLATED } from "@/assets/data";
import { RateLimiter } from "./RateLimiter";
import { ModifierType } from "@/parser/modifiers";
import { mapInfluenceTradeIds, mapRewardFields } from "@/parser/poe1-map";
import { Cache } from "./Cache";
import { parseAffixStrings } from "@/parser/Parser";
import {
  CoreCurrency,
  displayRounding,
  DivCurrency,
  usePoeninja,
} from "@/web/background/Prices";
import { getCurrencyDetailsId } from "../trends/getDetailsId";
import { areaLevelByAscendancyPoints } from "../filters/create-item-filters";

const TOTAL_MODS_TEXT = {
  EMPTY_MODIFIERS: [
    "# Empty Modifiers",
    "# Empty Prefix Modifiers",
    "# Empty Suffix Modifiers",
  ],
  TOTAL_MODIFIERS: ["# Modifiers", "# Prefix Modifiers", "# Suffix Modifiers"],
};

// const INFLUENCE_PSEUDO_TEXT = {
//   [ItemInfluence.Shaper]: 'Has Shaper Influence',
//   [ItemInfluence.Crusader]: 'Has Crusader Influence',
//   [ItemInfluence.Hunter]: 'Has Hunter Influence',
//   [ItemInfluence.Elder]: 'Has Elder Influence',
//   [ItemInfluence.Redeemer]: 'Has Redeemer Influence',
//   [ItemInfluence.Warlord]: 'Has Warlord Influence'
// }

const CONVERT_CURRENCY: Record<string, string> = {
  "greater-orb-of-transmutation": "G. transmute",
  "perfect-orb-of-transmutation": "P. transmute",
  "greater-orb-of-augmentation": "G. aug",
  "perfect-orb-of-augmentation": "P. aug",
  "greater-chaos-orb": "G. chaos",
  "perfect-chaos-orb": "P. chaos",
  "greater-regal-orb": "G. regal",
  "perfect-regal-orb": "P. regal",
  "greater-exalted-orb": "G. exalted",
  "perfect-exalted-orb": "P. exalted",
};

enum TradePropType {
  Unused,
  MapTier,
  MapQuantityBonus,
  MapRarityBonus,
  MapPackSizeBonus,
  GemLevel,
  Quality,
  QualityItemBonus,
  QualitySupportBonus,
  WeaponPhysicalDamage,
  WeaponElementalDamage,
  WeaponChaosDamage,
  WeaponCriticalChance,
  WeaponSpeed,
  WeaponRange,
  ShieldBlock,
  ArmourReduction,
  ArmourEvasion,
  ArmourEnergyShield,
  NetTier,
  GemLevelProgress,
  BestiaryGenus,
  BestiaryGroup,
  BestiaryFamily,
  JewelRadius,
  Spirit,
  SanctumFloors,
  UltimatumRooms,
  Notable,
  HarvestGrowth,
  MonsterLevel,
  StoredExperience,
  StackSize,
  Durability,
  AreaLevel,
  HeistWings,
  HeistEscapeRoutes,
  HeistRewardRooms,
  HeistJobLockpicking,
  HeistJobBruteForce,
  HeistJobPerception,
  HeistJobDemolition,
  HeistJobCounterThaumaturgy,
  HeistJobTrapDisarmament,
  HeistJobAgility,
  HeistJobDeception,
  HeistJobEngineering,
  HeistContractObjective,
  RitualStoneWorldArea,
  IncursionTempleRoom,
  MavenCollectedMaps,
  UltimatumTrialItemRequirement,
  UltimatumTrialReward,
  UltimatumTrialDifficulty,
  ArmourWard,
  ArmourAdaptation,
  QualityGlobalStatsBonus,
  ClassRequirement,
  SentinelDroneUses,
  SentinelDuration,
  SentinelTagLimit,
  SentinelEmpowerment,
  LevelRequirement,
  StrengthRequirement,
  DexterityRequirement,
  IntelligenceRequirement,
  MapMapItemDropChanceBonus,
  MapItemsDropCorruptedChance,
  SanctumResolve,
  SanctumInspiration,
  SanctumGold,
  SanctumMinorBoons,
  SanctumMajorBoons,
  SanctumMinorCurses,
  SanctumMajorCurses,
  SanctumPacts,
  CompletionReward,
  MapConversion,
  ItemLevel,
  CorpseTag,
  MapConversionShaper,
  MapConversionElder,
  MapConversionConqueror,
  MapConversionUnique,
  MapConversionChargedCompass,
  MapConversionMavenInvite,
  MapConversionMemoryLine,
  ScarabUseLimit, // ScrabUseLimit?
  MapMapDropBonus,
  MapScarabDropBonus,
  MapCurrencyDropBonus,
  MapDivinationCardDropBonus,
  ShieldDeflect,
  TrapToolDamage,
  TrapToolSpeed,
  TrapToolDetonationType,
  WeaponRequirement,
  WeaponReloadTime,
  MapPortals,
  ZanaInfluence,
  MapGoldQuantityBonus,
  MapExperienceBonus,
  MapMagicMonstersQuantityBonus,
  MapRareMonstersQuantityBonus,
  ReservationCost,
  MapKeyWorldArea,
  RitualStoneUniqueMonsters,
  RitualStoneOtherMonsters,
  Poe1AtlasDrops = 112,
}

enum TradeNumberColors {
  White = 0,
  Augmented = 1,
  Unmet = 2,
  Physical = 3,
  Fire = 4,
  Cold = 5,
  Lightning = 6,
  Chaos = 7,
  Unique = 8,
  Unreachable = 9,
  Currency = 10,
  Reward = 11,
  Divination = 12,
  SanctumBoon = 13,
  SanctumCurse = 14,
  SanctumPact = 15,
  GrantedSkill = 25,
  Enchant = 8729,
  Fractured = 8730,
  Desecrated = 8731,
  Sanctified = 8732,
  Mutated = 8733,
  Crafted = 8734,
}

interface FilterBoolean {
  option?: "true" | "false";
}
interface FilterRange {
  min?: number;
  max?: number;
}

export interface TradeRequest {
  query: {
    term?: string;
    status: { option: "available" | "securable" | "online" | "any" };
    name?: string | { discriminator: string; option: string };
    type?: string | { discriminator: string; option: string };
    stats: Array<{
      type: "and" | "if" | "count" | "not" | "weight";
      value?: FilterRange;
      filters: Array<{
        id: string;
        value?: {
          min?: number;
          max?: number;
          option?: number | string;
          weight?: number;
        };
        disabled?: boolean;
      }>;
      disabled?: boolean;
    }>;
    filters: {
      type_filters?: {
        filters: {
          rarity?: {
            option?: "normal" | "magic" | "rare" | "unique" | "nonunique" | "uniquefoil";
          };
          category?: {
            option?: string;
          };
          ilvl?: FilterRange;
          quality?: FilterRange;
        };
      };
      equipment_filters?: {
        filters: {
          // Attacks per Second
          aps?: FilterRange;
          // Armor Rating
          ar?: FilterRange;
          // Block
          block?: FilterRange;
          // Critical Strike Chance
          crit?: FilterRange;
          // Damage (not used)
          // damage?: FilterRange
          // Damage per Second
          dps?: FilterRange;
          // Elemental Damage per Second
          edps?: FilterRange;
          // Energy Shield
          es?: FilterRange;
          // Evasion Rating
          ev?: FilterRange;
          // Physical Damage per Second
          pdps?: FilterRange;
          // Augment Slots (still called rune on trade site)
          rune_sockets?: FilterRange;
          // Spirit
          spirit?: FilterRange;
          // reload time
          reload_time?: FilterRange;
        };
      };
      req_filters?: {
        filters: {
          dex?: FilterRange;
          int?: FilterRange;
          lvl?: FilterRange;
          str?: FilterRange;
        };
      };
      socket_filters?: { filters: { links?: FilterRange; sockets?: FilterRange & { w?: number } } };
      map_filters?: {
        filters: {
          map_tier?: FilterRange;
          map_iiq?: FilterRange;
          area_level?: FilterRange;
          map_revives?: FilterRange;
          map_packsize?: FilterRange;
          map_magic_monsters?: FilterRange;
          map_rare_monsters?: FilterRange;
          map_bonus?: FilterRange;
          map_iir?: FilterRange;
          ultimatum_hint?: {
            option?: "Victorious" | "Cowardly" | "Deadly";
          };
        };
      };
      misc_filters?: {
        filters: {
          ilvl?: FilterRange;
          alternate_art?: FilterBoolean;
          area_level?: FilterRange;
          corrupted?: FilterBoolean;
          gem_level?: FilterRange;
          gem_sockets?: FilterRange;
          identified?: FilterBoolean;
          mirrored?: FilterBoolean;
          mutated?: FilterBoolean;
          sanctified?: FilterBoolean;
          sanctum_gold?: FilterRange;
          unidentified_tier?: FilterRange;
          veiled?: FilterBoolean;
          fractured_item?: FilterBoolean;
          searing_item?: FilterBoolean;
          tangled_item?: FilterBoolean;
        };
      };
      trade_filters?: {
        filters: {
          collapse?: FilterBoolean;
          indexed?: { option?: string };
          price?: FilterRange | { option?: string };
        };
      };
    };
  };
  sort: {
    price: "asc";
  };
}

export interface SearchResult {
  id: string;
  result: string[];
  total: number;
  inexact?: boolean;
}

interface TradeModMetadata {
  name: string;
  tier: number;
  level: number;
  magnitudes: Array<{ hash: string; min: string; max: string }>;
}

export interface RawTradeResult {
  item: ListingInfluences & {
    frameType: number;
    name?: string;
    typeLine?: string;
    baseType?: string;
    ilvl?: number;
    corrupted?: boolean;
    gemSockets?: unknown[];
    extended?: {
      hashes?: Record<string, Array<Array<string | number[] | null>>>;
      mods?: Record<string, TradeModMetadata[]>;
    };
  };
}

interface TradeDataRichLine {
  name: string;
  values: Array<[string, TradeNumberColors]>;
  displayMode: number;
  type?: TradePropType;
  icon?: string;
}

export type TradeModLine = string | { description: string; hash?: string };

interface FetchResult {
  id: string;
  item: ListingInfluences & InventoryFlags & {
    w: number;
    h: number;
    icon: string;
    sockets: Array<{
      group: number;
      type: string;
      sColour?: "R" | "G" | "B" | "W" | "A" | "DV";
      // sacred:orange, primal:blue,vivid:yellow, wild:purple
      item?:
        | "rune"
        | "soulcore"
        | "sacredtalisman"
        | "primaltalisman"
        | "vividtalisman"
        | "wildtalisman"
        | "jewel";
    }>;
    fractured?: true;
    name: string;
    typeLine: string;
    baseType: string;
    rarity: ItemRarity;
    frameType?: DisplayFrameType;
    frameTypeId?: string;
    ilvl?: number;
    identified: boolean;
    unidentifiedTier?: number;
    note?: string;
    sanctified?: true;
    duplicated?: true;
    stackSize?: number;
    corrupted?: true;
    mutated?: true;
    doubleCorrupted?: true;
    gemSockets?: string[];
    properties?: TradeDataRichLine[];
    requirements?: TradeDataRichLine[];
    grantedSkills?: TradeDataRichLine[];
    implicitMods?: TradeModLine[];
    explicitMods?: TradeModLine[];
    craftedMods?: TradeModLine[];
    mutatedMods?: TradeModLine[];
    enchantMods?: TradeModLine[];
    runeMods?: TradeModLine[];
    extended?: {
      dps?: number;
      pdps?: number;
      edps?: number;
      ar?: number;
      ev?: number;
      es?: number;
      ward?: number;
      dps_aug?: boolean;
      pdps_aug?: boolean;
      edps_aug?: boolean;
      ar_aug?: boolean;
      ev_aug?: boolean;
      es_aug?: boolean;
      ward_aug?: boolean;
      mods?: Record<string, TradeModMetadata[]>;
      hashes?: Record<string, Array<Array<string | number[] | null>>>;
    };
    pseudoMods?: TradeModLine[];
    desecratedMods?: TradeModLine[];
    fracturedMods?: TradeModLine[];
  };
  listing: {
    indexed: string;
    fee?: number;
    price?: {
      amount: number;
      currency: string;
      type: "~price";
    };
    account: Account;
    in_demand?: boolean;
    whisper?: string;
  };
  gone?: boolean;
}

export interface DisplayItemLine {
  // text should include colon if required...
  text: string;
  value?: string | number;
  color: TradeNumberColors;
}
export enum DisplayFrameType {
  Normal = 0,
  Magic = 1,
  Rare = 2,
  Unique = 3,
  Gem = 4,
  Foil = 9,
  SupporterFoil = 10,
  RunicMagic = 12,
  RunicRare = 13,
  RunicUnique = 14,
}

export interface DisplayItem {
  title: string[];
  influences?: ItemInfluence[];
  inventory?: InventoryFlags;
  mapTier?: number;
  atlasDrops?: string;
  rarity: ItemRarity;
  frameType?: DisplayFrameType;
  nameBlock?: DisplayItemLine[];
  itemProps?: DisplayItemLine[];
  grantSkill?: DisplayItemLine[];
  enchantMods?: DisplayItemLine[];
  runeMods?: DisplayItemLine[];
  implicitMods?: DisplayItemLine[];
  fracturedMods?: DisplayItemLine[];
  explicitMods?: DisplayItemLine[];
  craftedMods?: DisplayItemLine[];
  mutatedMods?: DisplayItemLine[];
  desecratedMods?: DisplayItemLine[];
  pseudoMods?: DisplayItemLine[];
  extended?: Array<{ text: string; value: number }>;
  itemTags?: DisplayItemLine[];
  sockets: Array<{ group: number; type: string; item?: string }>;
  icon?: {
    url: string;
    baseUrl?: string;
    w: number;
    h: number;
  };
}

export interface PricingResult {
  id: string;
  itemLevel?: string;
  stackSize?: number;
  corrupted?: boolean;
  quality?: string;
  level?: string;
  gemSockets?: number;
  relativeDate: string;
  priceAmount: number;
  priceCurrency: string;
  priceCurrencyRank?: number;
  normalizedPrice?: string;
  normalizedPriceCurrency?: CoreCurrency;
  isMine: boolean;
  hasNote: boolean;
  isInstantBuyout: boolean;
  accountName: string;
  accountStatus: "offline" | "online" | "afk";
  ign: string;
  displayItem: DisplayItem;
  inDemand?: boolean;
  gone?: boolean;
  whisper?: string;
  rawResult?: FetchResult;
}

export function createTradeRequest(
  filters: ItemFilters,
  stats: StatFilter[],
  item: ParsedItem,
) {
  const poe1 = AppConfig()?.game === "poe1";
  const listingType = filters.trade.listingType === "onlineleague"
    ? (poe1 ? "available" : "securable")
    : filters.trade.listingType;

  const body: TradeRequest = {
    query: {
      status: {
        option: listingType,
      },
      stats: [{ type: "and", filters: [] }],
      filters: {},
    },
    sort: {
      price: "asc",
    },
  };
  const { query } = body;
  stats = stats.filter(stat => stat.tradeId.length && !(stat.allModsOnly && stat.disabled));

  if (poe1 && item.category === ItemCategory.Map) {
    const present = new Set(item.statsByType
      .filter(({ type }) => type === ModifierType.Implicit)
      .flatMap(({ stat }) => stat.trade.ids.implicit ?? []));
    const excluded = mapInfluenceTradeIds.filter(id => !present.has(id));
    if (excluded.length) {
      query.stats.push({ type: "not", filters: excluded.map(id => ({ id })) });
    }
  }

  if (filters.trade.currency) {
    propSet(
      query.filters,
      "trade_filters.filters.price.option",
      filters.trade.currency,
    );
  }

  if (filters.trade.collapseListings === "api") {
    propSet(
      query.filters,
      "trade_filters.filters.collapse.option",
      String(true),
    );
  }

  if (filters.trade.listed) {
    propSet(
      query.filters,
      "trade_filters.filters.indexed.option",
      filters.trade.listed,
    );
  }

  // Search by category not base type?
  const activeSearch =
    filters.searchRelaxed && !filters.searchRelaxed.disabled
      ? filters.searchRelaxed
      : filters.searchExact;

  if (activeSearch.term) query.term = activeSearch.term;
  if (activeSearch.nameTrade) {
    query.name = nameToQuery(activeSearch.nameTrade, filters);
  } else if (activeSearch.name) {
    query.name = nameToQuery(activeSearch.name, filters);
  }

  if (activeSearch.baseTypeTrade) {
    query.type = nameToQuery(activeSearch.baseTypeTrade, filters);
  } else if (activeSearch.baseType) {
    query.type = nameToQuery(activeSearch.baseType, filters);
  }

  // TYPE FILTERS
  if (activeSearch.category) {
    const id = getCategoryToTradeId().get(activeSearch.category);
    if (id) {
      propSet(query.filters, "type_filters.filters.category.option", id);
    } else {
      throw new Error(`Invalid category: ${activeSearch.category}`);
    }
  }

  if (filters.foil && !filters.foil.disabled) {
    propSet(query.filters, "type_filters.filters.rarity.option", "uniquefoil");
  } else if (filters.rarity) {
    propSet(
      query.filters,
      "type_filters.filters.rarity.option",
      filters.rarity.value,
    );
  }

  const itemProperties = poe1 ? "misc_filters" : "type_filters";
  if (poe1 && item.isFoulborn) {
    propSet(query.filters, "misc_filters.filters.mutated.option", "true");
  }
  const armourProperties = poe1 ? "armour_filters" : "equipment_filters";
  const weaponProperties = poe1 ? "weapon_filters" : "equipment_filters";
  if (filters.itemLevel && !filters.itemLevel.disabled) {
    propSet(
      query.filters,
      `${itemProperties}.filters.ilvl.min`,
      filters.itemLevel.value,
    );
    if (filters.itemLevel.max) {
      propSet(
        query.filters,
        `${itemProperties}.filters.ilvl.max`,
        filters.itemLevel.max,
      );
    }
  }

  if (
    filters.requires &&
    filters.requires.level &&
    !filters.requires.level.disabled
  ) {
    propSet(
      query.filters,
      "req_filters.filters.lvl.max",
      filters.requires.level.value,
    );
  }

  if (filters.quality && !filters.quality.disabled) {
    propSet(
      query.filters,
      `${itemProperties}.filters.quality.min`,
      filters.quality.value,
    );
  }

  if (poe1) {
    if (filters.linkedSockets && !filters.linkedSockets.disabled) {
      propSet(query.filters, "socket_filters.filters.links.min", filters.linkedSockets.value);
    }
    if (filters.whiteSockets && !filters.whiteSockets.disabled) {
      propSet(query.filters, "socket_filters.filters.sockets.w", filters.whiteSockets.value);
    }
    if (filters.socketNumber && !filters.socketNumber.disabled) {
      propSet(query.filters, "socket_filters.filters.sockets.min", filters.socketNumber.value);
    }
    if (filters.mapBlighted) {
      const { value } = filters.mapBlighted;
      if (value !== "Blight-ravaged") {
        propSet(query.filters, "map_filters.filters.map_blighted.option", String(value === "Blighted"));
      }
      if (value !== "Blighted") {
        propSet(query.filters, "map_filters.filters.map_uberblighted.option", String(value === "Blight-ravaged"));
      }
    }
  }

  // EQUIPMENT FILTERS

  if (!poe1 && filters.augmentSockets && !filters.augmentSockets.disabled) {
    propSet(
      query.filters,
      "equipment_filters.filters.rune_sockets.min",
      filters.augmentSockets.value,
    );
  }

  // REQ FILTERS

  // MAP (WAYSTONE) FILTERS

  if (filters.mapTier && !filters.mapTier.disabled) {
    propSet(
      query.filters,
      "map_filters.filters.map_tier.min",
      filters.mapTier.value,
    );
    propSet(
      query.filters,
      "map_filters.filters.map_tier.max",
      filters.mapTier.value,
    );
  }

  for (const reward of filters.mapRewards ?? []) {
    if (reward.disabled) continue;
    const id = mapRewardFields[reward.key];
    if (id.startsWith("pseudo.")) {
      query.stats[0].filters.push({ id, value: { min: reward.value } });
    } else {
      propSet(query.filters, `map_filters.filters.${id}.min`, reward.value);
    }
  }

  if (filters.ultimatumHint && !filters.ultimatumHint.disabled) {
    propSet(
      query.filters,
      "map_filters.filters.ultimatum_hint.option",
      filters.ultimatumHint.value,
    );
  }

  // MISC FILTERS
  if (filters.gemLevel && !filters.gemLevel.disabled) {
    propSet(
      query.filters,
      "misc_filters.filters.gem_level.min",
      filters.gemLevel.value,
    );
    if (filters.gemLevel.max) {
      propSet(
        query.filters,
        "misc_filters.filters.gem_level.max",
        filters.gemLevel.max,
      );
    }
  }

  if (!poe1 && filters.socketNumber && !filters.socketNumber.disabled) {
    propSet(
      query.filters,
      "misc_filters.filters.gem_sockets.min",
      filters.socketNumber.value,
    );
  }

  if (filters.areaLevel && !filters.areaLevel.disabled) {
    if (filters.awardedAscendancyPoints) {
      // set max, lower has higher value, so exclude worse(higher area level) items
      propSet(
        query.filters,
        `${poe1 ? "map_filters" : "misc_filters"}.filters.area_level.max`,
        filters.areaLevel.value,
      );
    } else {
      propSet(
        query.filters,
        `${poe1 ? "map_filters" : "misc_filters"}.filters.area_level.min`,
        filters.areaLevel.value,
      );
    }
  }

  if (
    filters.awardedAscendancyPoints &&
    !filters.awardedAscendancyPoints.disabled
  ) {
    propSet(
      query.filters,
      `${poe1 ? "map_filters" : "misc_filters"}.filters.area_level.min`,
      areaLevelByAscendancyPoints(
        item.info.refName,
        filters.awardedAscendancyPoints.value,
      ),
    );
  }

  if (filters.unidentified && !filters.unidentified.disabled) {
    propSet(
      query.filters,
      "misc_filters.filters.identified.option",
      String(false),
    );
  }

  if (filters.unidentifiedTier && !filters.unidentifiedTier.disabled) {
    propSet(
      query.filters,
      "misc_filters.filters.unidentified_tier.min",
      filters.unidentifiedTier.value,
    );
  }

  if (
    filters.corrupted && !filters.corrupted.disabled &&
    (poe1 || filters.corrupted.value === false || filters.corrupted.exact) &&
    (!filters.sanctified || (filters.sanctified && filters.sanctified.disabled))
  ) {
    propSet(
      query.filters,
      "misc_filters.filters.corrupted.option",
      String(filters.corrupted.value),
    );
  }

  if (filters.fractured?.value === false) {
    propSet(
      query.filters,
      "misc_filters.filters.fractured_item.option",
      String(false),
    );
  }

  if (filters.mirrored) {
    if (filters.mirrored.disabled) {
      propSet(
        query.filters,
        "misc_filters.filters.mirrored.option",
        String(false),
      );
    }
  } else if (
    item.rarity === ItemRarity.Normal ||
    item.rarity === ItemRarity.Magic ||
    item.rarity === ItemRarity.Rare
  ) {
    propSet(
      query.filters,
      "misc_filters.filters.mirrored.option",
      String(false),
    );
  }

  if (
    filters.sanctified ||
    (filters.corrupted?.value === true && !filters.corrupted?.exact)
  ) {
    if (filters.sanctified?.disabled) {
      propSet(
        query.filters,
        "misc_filters.filters.sanctified.option",
        String(false),
      );
    }
  } else if (
    item.rarity === ItemRarity.Normal ||
    item.rarity === ItemRarity.Magic ||
    item.rarity === ItemRarity.Rare
  ) {
    propSet(
      query.filters,
      "misc_filters.filters.sanctified.option",
      String(false),
    );
  }

  // TRADE FILTERS

  // BREAK ==============================================================================================================================================================================================================================================================================================================================================================================================================================================================================================================================================================

  // Meta internal stuff, crafting as empty and setting dps/pdps/edps
  for (const stat of stats) {
    if (stat.tradeId[0] === "item.has_empty_modifier") {
      const TARGET_ID = {
        EMPTY_MODIFIERS: STAT_BY_REF(
          TOTAL_MODS_TEXT.EMPTY_MODIFIERS[stat.option!.value],
        )!.trade.ids[ModifierType.Pseudo][0],
      };
      const emptyRoll = stat.roll!;
      query.stats.push({
        type: "count",
        value: { min: 1, max: 1 },
        disabled: stat.disabled,
        filters: [
          {
            id: TARGET_ID.EMPTY_MODIFIERS,
            value: { ...getMinMax(emptyRoll) },
            disabled: stat.disabled,
          },
        ],
      });
    } else if (
      // https://github.com/SnosMe/awakened-poe-trade/issues/758
      item.category === ItemCategory.Flask &&
      stat.statRef === "#% increased Charge Recovery" &&
      !stats.some((s) => s.statRef === "#% increased effect")
    ) {
      const reducedEffectId = STAT_BY_REF("#% increased effect")!.trade.ids[
        ModifierType.Explicit
      ][0];
      query.stats.push({
        type: "not",
        disabled: stat.disabled,
        filters: [{ id: reducedEffectId, disabled: stat.disabled }],
      });
    }

    if (stat.disabled) continue;

    function applyElementalDamageLogicalFilter() {
      if (stat.tradeId[0] !== "item.elemental_dps") {
        console.error("Elemental damage filter applied to non-elemental dps");
        return;
      }
      const mapIds = (ids: { [type: string]: string[] }) =>
        Object.values(ids)
          .flat()
          .map((id) => ({ id }));
      const fireIds = mapIds(STAT_BY_REF("Adds # to # Fire Damage")!.trade.ids);
      const coldIds = mapIds(STAT_BY_REF("Adds # to # Cold Damage")!.trade.ids);
      const lightningIds = mapIds(
        STAT_BY_REF("Adds # to # Lightning Damage")!.trade.ids,
      );

      const selectedType = stat.option!.value as ItemIsElementalModifier;
      const notGroup: Array<{ id: string }> = [];
      switch (selectedType) {
        case ItemIsElementalModifier.Any:
          break;
        case ItemIsElementalModifier.Fire:
          notGroup.push(...coldIds);
          notGroup.push(...lightningIds);
          break;
        case ItemIsElementalModifier.Cold:
          notGroup.push(...fireIds);
          notGroup.push(...lightningIds);
          break;
        case ItemIsElementalModifier.Lightning:
          notGroup.push(...fireIds);
          notGroup.push(...coldIds);
          break;
      }
      if (notGroup.length) {
        query.stats.push({
          type: "not",
          filters: notGroup,
        });
      }
    }

    const input = stat.roll!;
    switch (stat.tradeId[0] as InternalTradeId) {
      // case 'item.base_percentile':
      //   propSet(
      //     query.filters,
      //     'equipment_filters.filters.base_defence_percentile.min',
      //     typeof input.min === 'number' ? input.min : undefined
      //   )
      //   propSet(
      //     query.filters,
      //     'equipment_filters.filters.base_defence_percentile.max',
      //     typeof input.max === 'number' ? input.max : undefined
      //   )
      //   break
      case "item.armour":
        propSet(
          query.filters,
          `${armourProperties}.filters.ar.min`,
          typeof input.min === "number" ? input.min : undefined,
        );
        propSet(
          query.filters,
          `${armourProperties}.filters.ar.max`,
          typeof input.max === "number" ? input.max : undefined,
        );
        break;
      case "item.evasion_rating":
        propSet(
          query.filters,
          `${armourProperties}.filters.ev.min`,
          typeof input.min === "number" ? input.min : undefined,
        );
        propSet(
          query.filters,
          `${armourProperties}.filters.ev.max`,
          typeof input.max === "number" ? input.max : undefined,
        );
        break;
      case "item.energy_shield":
        propSet(
          query.filters,
          `${armourProperties}.filters.es.min`,
          typeof input.min === "number" ? input.min : undefined,
        );
        propSet(
          query.filters,
          `${armourProperties}.filters.es.max`,
          typeof input.max === "number" ? input.max : undefined,
        );
        break;
      case "item.runic_ward":
        propSet(
          query.filters,
          `${armourProperties}.filters.ward.min`,
          typeof input.min === "number" ? input.min : undefined,
        );
        propSet(
          query.filters,
          `${armourProperties}.filters.ward.max`,
          typeof input.max === "number" ? input.max : undefined,
        );
        break;
      case "item.block":
        propSet(
          query.filters,
          `${armourProperties}.filters.block.min`,
          typeof input.min === "number" ? input.min : undefined,
        );
        propSet(
          query.filters,
          `${armourProperties}.filters.block.max`,
          typeof input.max === "number" ? input.max : undefined,
        );
        break;
      case "item.total_dps":
        propSet(
          query.filters,
          `${weaponProperties}.filters.dps.min`,
          typeof input.min === "number" ? input.min : undefined,
        );
        propSet(
          query.filters,
          `${weaponProperties}.filters.dps.max`,
          typeof input.max === "number" ? input.max : undefined,
        );
        break;
      case "item.physical_dps":
        propSet(
          query.filters,
          `${weaponProperties}.filters.pdps.min`,
          typeof input.min === "number" ? input.min : undefined,
        );
        propSet(
          query.filters,
          `${weaponProperties}.filters.pdps.max`,
          typeof input.max === "number" ? input.max : undefined,
        );
        break;
      case "item.elemental_dps":
        propSet(
          query.filters,
          `${weaponProperties}.filters.edps.min`,
          typeof input.min === "number" ? input.min : undefined,
        );
        propSet(
          query.filters,
          `${weaponProperties}.filters.edps.max`,
          typeof input.max === "number" ? input.max : undefined,
        );
        applyElementalDamageLogicalFilter();
        break;
      case "item.crit":
        propSet(
          query.filters,
          `${weaponProperties}.filters.crit.min`,
          typeof input.min === "number" ? input.min : undefined,
        );
        propSet(
          query.filters,
          `${weaponProperties}.filters.crit.max`,
          typeof input.max === "number" ? input.max : undefined,
        );
        break;
      case "item.aps":
        propSet(
          query.filters,
          `${weaponProperties}.filters.aps.min`,
          typeof input.min === "number" ? input.min : undefined,
        );
        propSet(
          query.filters,
          `${weaponProperties}.filters.aps.max`,
          typeof input.max === "number" ? input.max : undefined,
        );
        break;
      case "item.spirit":
        propSet(
          query.filters,
          "equipment_filters.filters.spirit.min",
          typeof input.min === "number" ? input.min : undefined,
        );
        propSet(
          query.filters,
          "equipment_filters.filters.spirit.max",
          typeof input.max === "number" ? input.max : undefined,
        );
        break;
      case "item.reload_time":
        propSet(
          query.filters,
          "equipment_filters.filters.reload_time.min",
          typeof input.min === "number" ? input.min : undefined,
        );
        propSet(
          query.filters,
          "equipment_filters.filters.reload_time.max",
          typeof input.max === "number" ? input.max : undefined,
        );
        break;
      case "item.rarity_magic":
        propSet(query.filters, "type_filters.filters.rarity.option", "magic");
        break;
      case "item.map_revives":
        propSet(
          query.filters,
          "map_filters.filters.map_revives.min",
          typeof input.min === "number" ? input.min : undefined,
        );
        break;
      case "item.map_pack_size":
        propSet(
          query.filters,
          "map_filters.filters.map_packsize.min",
          typeof input.min === "number" ? input.min : undefined,
        );
        break;
      case "item.map_magic_monsters":
        propSet(
          query.filters,
          "map_filters.filters.map_magic_monsters.min",
          typeof input.min === "number" ? input.min : undefined,
        );
        break;
      case "item.map_rare_monsters":
        propSet(
          query.filters,
          "map_filters.filters.map_rare_monsters.min",
          typeof input.min === "number" ? input.min : undefined,
        );
        break;
      case "item.map_drop_chance":
        propSet(
          query.filters,
          "map_filters.filters.map_bonus.min",
          typeof input.min === "number" ? input.min : undefined,
        );
        break;
      case "item.map_item_rarity":
        propSet(
          query.filters,
          "map_filters.filters.map_iir.min",
          typeof input.min === "number" ? input.min : undefined,
        );
        break;
      case "item.map_gold":
        propSet(
          query.filters,
          "map_filters.filters.map_gold.min",
          typeof input.min === "number" ? input.min : undefined,
        );
        break;
    }
  }

  stats = stats.filter((stat) => !INTERNAL_TRADE_IDS.includes(stat.tradeId[0]));

  const qAnd = query.stats[0];
  if (poe1 && filters.influences) {
    for (const { value, disabled } of filters.influences) {
      if (value === ItemInfluence.SearingExarch || value === ItemInfluence.EaterOfWorlds) {
        if (!disabled) {
          const field = value === ItemInfluence.SearingExarch ? "searing_item" : "tangled_item";
          propSet(query.filters, `misc_filters.filters.${field}.option`, "true");
        }
      } else {
        const id = STAT_BY_REF("Has " + value + " Influence")?.trade.ids.pseudo?.[0];
        if (id) qAnd.filters.push({ id, disabled });
      }
    }
  }

  for (const stat of stats) {
    if (stat.tradeId[0] === "pseudo.custom_weighted_elemental_resistance") {
      const eleFilters = [
        // Fire Resistance
        { id: "explicit.stat_3372524247", value: { weight: 1 } },
        // Cold Resistance
        { id: "explicit.stat_4220027924", value: { weight: 1 } },
        // Lightning Resistance
        { id: "explicit.stat_1671376347", value: { weight: 1 } },
        // all Elemental Resistances
        { id: "explicit.stat_2901986750", value: { weight: 3 } },
        // Fire and Chaos Resistances
        { id: "explicit.stat_378817135", value: { weight: 1 } },
        // Cold and Chaos Resistances
        { id: "explicit.stat_3393628375", value: { weight: 1 } },
        // Lightning and Chaos Resistances
        { id: "explicit.stat_3465022881", value: { weight: 1 } }
      ];

      query.stats.push({
        type: "weight",
        value: {
          min: typeof stat.roll?.min === "number" ? stat.roll.min : undefined,
          max: typeof stat.roll?.max === "number" ? stat.roll.max : undefined
        },
        disabled: stat.disabled,
        filters: eleFilters
      });
      continue;
    }

    if (stat.tradeId[0] === "pseudo.custom_weighted_chaos_resistance") {
      const chaosFilters = [
        // Chaos Resistance
        { id: "explicit.stat_2923486259", value: { weight: 1 } },
        // Fire and Chaos Resistances
        { id: "explicit.stat_378817135", value: { weight: 1 } },
        // Cold and Chaos Resistances
        { id: "explicit.stat_3393628375", value: { weight: 1 } },
        // Lightning and Chaos Resistances
        { id: "explicit.stat_3465022881", value: { weight: 1 } }
      ];

      query.stats.push({
        type: "weight",
        value: {
          min: typeof stat.roll?.min === "number" ? stat.roll.min : undefined,
          max: typeof stat.roll?.max === "number" ? stat.roll.max : undefined
        },
        disabled: stat.disabled,
        filters: chaosFilters
      });
      continue;
    }

    if (stat.statRef === "Only affects Passives in # Ring") {
      const metaSource = stat.roll!;
      const metamorphosisCount = metaSource.bounds!.max;
      const metamorphosisCurrent = metaSource.min as number;
      const builtTradeFilter = Array.from(
        { length: metamorphosisCount },
        (_, index) => ({
          id: `${stat.tradeId[0]}|${index + 1}`,
          disabled: index + 1 !== metamorphosisCurrent,
        }),
      );
      query.stats.push({
        type: "count",
        value: { min: 1 },
        disabled: stat.disabled,
        filters: builtTradeFilter,
      });
      continue;
    }

    if (stat.tradeId.length === 1) {
      qAnd.filters.push(tradeIdToQuery(stat.tradeId[0], stat, poe1));
    } else {
      query.stats.push({
        type: "count",
        value: { min: 1 },
        disabled: stat.disabled,
        filters: stat.tradeId.map((id) => tradeIdToQuery(id, stat, poe1)),
      });
    }
  }

  if (filters.veiled && !filters.veiled.disabled) {
    propSet(query.filters, "misc_filters.filters.veiled.option", String(true));
    const veiledCount = filters.veiled.veiledCount;

    // HACK: add pseudo stat for veiled count(dont want on my ui though)
    qAnd.filters.push(
      tradeIdToQuery("pseudo.pseudo_number_of_unrevealed_mods", {
        tradeId: ["pseudo.pseudo_number_of_unrevealed_mods"],
        statRef: "# Unrevealed Modifiers",
        text: "Unrevealed Modifiers",
        tag: FilterTag.Pseudo,
        sources: [],
        roll: {
          value: veiledCount,
          min: veiledCount,
          max: undefined,
          default: { min: veiledCount, max: veiledCount },
          dp: false,
          isNegated: false,
        },
        disabled: false,
      }),
    );
  }

  return body;
}

const cache = new Cache();

export async function requestTradeResultList(
  body: TradeRequest,
  leagueId: string,
  { waitForRateLimit = false } = {},
): Promise<SearchResult> {
  const endpoint = getTradeEndpoint();
  const tradePath = getTradeEndpointPath();
  const cacheKey = [endpoint, tradePath, leagueId, body];
  let data = cache.get<SearchResult>(cacheKey);

  if (!data) {
    if (!waitForRateLimit) {
      preventQueueCreation([
        { count: 1, limiters: RATE_LIMIT_RULES.SEARCH },
        { count: 1, limiters: RATE_LIMIT_RULES.FETCH },
      ]);
    }

    await RateLimiter.waitMulti(RATE_LIMIT_RULES.SEARCH);

    const response = await Host.proxy(
      `${endpoint}/api/${tradePath}/search/${encodeURIComponent(leagueId)}`,
      {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    adjustRateLimits(RATE_LIMIT_RULES.SEARCH, response.headers);

    const _data = (await response.json()) as TradeResponse<SearchResult>;
    if (_data.error) {
      throw new Error(_data.error.message);
    } else {
      data = _data;
    }

    cache.set<SearchResult>(
      cacheKey,
      data,
      Cache.deriveTtl(...RATE_LIMIT_RULES.SEARCH, ...RATE_LIMIT_RULES.FETCH),
    );
  }

  return data;
}

export async function requestResults(
  queryId: string,
  resultIds: string[],
  opts: { accountName: string },
): Promise<PricingResult[]> {
  const { cachedCurrencyByQuery, xchgRateCurrency } = usePoeninja();
  // Solves cached results showing random incorrect values
  cache.purgeIfDifferentCurrency(xchgRateCurrency.value?.id);

  const endpoint = getTradeEndpoint();
  const tradePath = getTradeEndpointPath();
  const cacheKey = [endpoint, tradePath, queryId, ...resultIds];
  let data = cache.get<FetchResult[]>(cacheKey);

  if (!data) {
    await RateLimiter.waitMulti(RATE_LIMIT_RULES.FETCH);

    const response = await Host.proxy(
      `${endpoint}/api/${tradePath}/fetch/${resultIds.join(",")}?query=${encodeURIComponent(queryId)}`,
    );
    adjustRateLimits(RATE_LIMIT_RULES.FETCH, response.headers);

    const _data = (await response.json()) as TradeResponse<{
      result: Array<FetchResult | null>;
    }>;
    if (_data.error) {
      throw new Error(_data.error.message);
    } else {
      data = _data.result.filter((res) => res != null);
    }

    cache.set<FetchResult[]>(
      cacheKey,
      data,
      Cache.deriveTtl(...RATE_LIMIT_RULES.SEARCH, ...RATE_LIMIT_RULES.FETCH),
    );
  }

  return data.map<PricingResult>((result) => {
    const displayItem: DisplayItem = parseFetchResult(result);

    let priceCurrencyRank: PricingResult["priceCurrencyRank"];
    if (
      result.listing.price?.currency &&
      result.listing.price.currency in CONVERT_CURRENCY
    ) {
      result.listing.price.currency =
        CONVERT_CURRENCY[result.listing.price.currency];
      if (result.listing.price.currency[0] === "G") {
        priceCurrencyRank = 2;
      } else if (result.listing.price.currency[0] === "P") {
        priceCurrencyRank = 3;
      }
    }

    const query = getCurrencyDetailsId(
      result.listing.price?.currency ?? "no price",
    );
    const normalizedCurrency = cachedCurrencyByQuery(
      query,
      result.listing.price?.amount ?? 0,
    );
    const normalizedPrice =
      normalizedCurrency !== undefined
        ? displayRounding(normalizedCurrency.min)
        : undefined;
    const normalizedPriceCurrency =
      normalizedCurrency?.currency !== "div"
        ? xchgRateCurrency.value
        : DivCurrency;

    return {
      id: result.id,
      itemLevel:
        result.item.properties?.find((prop) => prop.type === 78)
          ?.values[0][0] ?? String(result.item.ilvl),
      stackSize: result.item.stackSize,
      corrupted: result.item.corrupted,
      quality: result.item.properties?.find((prop) => prop.type === 6)
        ?.values[0][0],
      level: result.item.properties?.find((prop) => prop.type === 5)
        ?.values[0][0],
      gemSockets: result.item.gemSockets?.length,
      relativeDate:
        DateTime.fromISO(result.listing.indexed).toRelative({
          style: "short",
        }) ?? "",
      priceAmount: result.listing.price?.amount ?? 0,
      priceCurrency: result.listing.price?.currency ?? "no price",
      priceCurrencyRank,
      normalizedPrice,
      normalizedPriceCurrency,
      hasNote: result.item.note != null,
      isMine: result.listing.account.name === opts.accountName,
      isInstantBuyout: result.listing.fee != null,
      ign: result.listing.account.lastCharacterName,
      accountName: result.listing.account.name,
      accountStatus: result.listing.account.online
        ? result.listing.account.online.status === "afk"
          ? "afk"
          : "online"
        : "offline",
      displayItem,
      inDemand: result.listing.in_demand,
      gone: result.gone,
      whisper: result.listing.whisper,
      rawResult: result,
    };
  });
}

function getMinMax(roll: StatFilter["roll"], divisor = 1) {
  if (!roll) {
    return { min: undefined, max: undefined };
  }

  const scale = (roll.tradeInvert ? -1 : 1) / divisor;
  const a = typeof roll.min === "number" ? roll.min * scale : undefined;
  const b = typeof roll.max === "number" ? roll.max * scale : undefined;

  return !roll.tradeInvert ? { min: a, max: b } : { min: b, max: a };
}

function tradeIdToQuery(id: string, stat: StatFilter, poe1 = false) {
  let roll = stat.roll;
  let tradeId = id;
  let divisor = 1;
  if (poe1) {
    if (id.startsWith("{div_by_100}")) divisor = 100;
    if (id.startsWith("{empty}") || (id.startsWith("{empty_if_100}") && roll?.value === 100)) {
      roll = undefined;
    }
    if (id.startsWith("{")) tradeId = id.slice(id.indexOf("}") + 1);
  } else if (stat.option != null) {
    tradeId += "|" + stat.option.value;
  }

  return {
    id: tradeId,
    value: {
      ...getMinMax(roll, divisor),
      option: poe1 ? stat.option?.value : undefined,
    },
    disabled: stat.disabled,
  };
}

function nameToQuery(name: string, filters: ItemFilters) {
  if (!filters.discriminator) {
    return name;
  } else {
    return {
      discriminator: filters.discriminator.trade,
      option: name,
    };
  }
}

/**
 * Parse out all the components from a fetch result into something easier to display on the ui
 * @param result fetch result json from the trade site
 * @returns item to display on ui
 */
function parseFetchResult(result: FetchResult): PricingResult["displayItem"] {
  /* Components on the trade site:
  Name block
  ------
  Item props
  ------
  Enchant mods
  ------
  Rune mods
  ------
  Implicit mods
  ------
  Explicit mods (+ fractured + desecrated)
  ------
  item tags
  */

  const title: string[] = [];
  if (result.item.name && result.item.name.length > 0) {
    title.push(result.item.name);
  }
  if (result.item.typeLine) {
    title.push(result.item.typeLine);
  }

  const itemTags = [];

  // Should be exclusive to all other tags(except corrupted)
  if (result.item.identified === false) {
    if (result.item.unidentifiedTier) {
      itemTags.push({
        text: `Unidentified (Tier ${result.item.unidentifiedTier})`,
        color: TradeNumberColors.Unmet,
      });
    } else {
      itemTags.push({
        text: "item.unidentified",
        color: TradeNumberColors.Unmet,
      });
    }
  }

  // remaining _should_ be exclusive
  if (result.item.doubleCorrupted) {
    itemTags.push({
      text: _$.DOUBLE_CORRUPTED,
      color: TradeNumberColors.Unmet,
    });
  } else if (result.item.corrupted) {
    itemTags.push({ text: _$.CORRUPTED, color: TradeNumberColors.Unmet });
  }
  if (result.item.duplicated) {
    itemTags.push({ text: _$.MIRRORED, color: TradeNumberColors.Augmented });
  }
  if (result.item.sanctified) {
    itemTags.push({ text: _$.SANCTIFIED, color: TradeNumberColors.Sanctified });
  }

  const mapTier = _$.MAP_TIER instanceof RegExp
    ? _$.MAP_TIER.exec(result.item.baseType ?? result.item.typeLine)?.[1] : undefined;
  const poe1 = AppConfig().game === "poe1";
  const influences = poe1 ? readListingInfluences(result.item) : undefined;
  const gemName = poe1 && (result.item.frameTypeId === "Gem" || result.item.frameType === DisplayFrameType.Gem)
    ? ITEM_BY_TRANSLATED("GEM", result.item.typeLine)?.[0]?.refName ?? result.item.typeLine : undefined;
  const displayItem: PricingResult["displayItem"] = {
    title,
    influences,
    inventory: poe1 ? listingInventory(result.item, gemName) : undefined,
    mapTier: mapTier ? Number(mapTier) : undefined,
    atlasDrops: mapTier ? result.item.properties?.find(prop => prop.type === TradePropType.Poe1AtlasDrops)?.values[0]?.[0] : undefined,
    rarity: result.item.rarity ?? ({
      [DisplayFrameType.Normal]: ItemRarity.Normal,
      [DisplayFrameType.Magic]: ItemRarity.Magic,
      [DisplayFrameType.Rare]: ItemRarity.Rare,
      [DisplayFrameType.Unique]: ItemRarity.Unique,
      [DisplayFrameType.Foil]: ItemRarity.Unique,
      [DisplayFrameType.SupporterFoil]: ItemRarity.Unique,
    } as Partial<Record<DisplayFrameType, ItemRarity>>)[result.item.frameType ?? DisplayFrameType.Normal] ?? ItemRarity.Normal,
    frameType: result.item.frameType,
    nameBlock: mapTier ? result.item.properties?.map(({ name, values }) => ({
      text: parseAffixStrings(name) + " ",
      value: values[0]?.[0],
      color: values[0]?.[1] ?? TradeNumberColors.White,
    })) : buildNameBlock(result.item.extended, result.item.properties),
    itemProps: buildItemProps(result.item.ilvl, result.item.requirements),
    grantSkill: buildGrantSkillBlock(result.item.grantedSkills),
    ...parseMods(result),
    sockets: result.item.sockets?.map((socket) => ({ ...socket, type: socket.sColour ?? socket.type })) ?? [],
    itemTags,
    icon: {
      url: result.item.icon,
      baseUrl: influences?.length && iconHasInfluenceBackdrop(result.item.icon)
        ? listingSilhouette(result.item) : undefined,
      w: result.item.w,
      h: result.item.h,
    },
  };

  return displayItem;
}

function listingSilhouette(item: FetchResult["item"]) {
  const unique = item.frameType === DisplayFrameType.Unique || item.rarity === ItemRarity.Unique;
  const namespace = unique ? "UNIQUE" : "ITEM";
  const name = unique ? item.name : item.baseType || item.typeLine;
  const bases = ITEM_BY_TRANSLATED(namespace, name) ?? ITEM_BY_REF(namespace, name);
  return bases?.find(base => base.icon && sameItemIconArt(base.icon, item.icon))?.icon;
}

function parseMods(result: FetchResult): {
  enchantMods?: DisplayItemLine[] | undefined;
  runeMods?: DisplayItemLine[] | undefined;
  implicitMods?: DisplayItemLine[] | undefined;
  explicitMods?: DisplayItemLine[] | undefined;
  craftedMods?: DisplayItemLine[] | undefined;
  desecratedMods?: DisplayItemLine[] | undefined;
  mutatedMods?: DisplayItemLine[] | undefined;
  fracturedMods?: DisplayItemLine[] | undefined;
  pseudoMods?: DisplayItemLine[] | undefined;
} {
  /*

  */
  return {
    enchantMods: parseModBlock(
      result.item.enchantMods,
      TradeNumberColors.Enchant,
    ),
    runeMods: parseModBlock(result.item.runeMods, TradeNumberColors.Enchant),
    implicitMods: parseModBlock(result.item.implicitMods),
    fracturedMods: parseModBlock(
      result.item.fracturedMods,
      TradeNumberColors.Fractured,
    ),
    explicitMods: parseModBlock(result.item.explicitMods),
    craftedMods: parseModBlock(
      result.item.craftedMods,
      TradeNumberColors.Crafted,
    ),
    desecratedMods: parseModBlock(
      result.item.desecratedMods,
      TradeNumberColors.Desecrated,
    ),
    mutatedMods: parseModBlock(
      result.item.mutatedMods,
      TradeNumberColors.Mutated,
    ),
    pseudoMods: parseModBlock(result.item.pseudoMods),
  };
}

function parseModBlock(
  translated: TradeModLine[] | undefined,
  color: TradeNumberColors = TradeNumberColors.Augmented,
  // mods: TradeModMetadata[] | undefined,
  // hashes: Array<Array<string | number[] | null>> | undefined,
): DisplayItemLine[] | undefined {
  // separate function, allow doing complex parsing later if needed
  if (!translated) return undefined;
  return translated.map((s) => {
    return { text: parseAffixStrings(s), color };
  });
}

function buildNameBlock(
  extended: FetchResult["item"]["extended"],
  props: FetchResult["item"]["properties"],
): DisplayItem["nameBlock"] {
  const block: Array<{
    text: string;
    value: string | number;
    color: TradeNumberColors;
  }> = [];
  if (!props || !extended) return block;

  // put everything from props in the block, but replace certain ones
  if (props) {
    let hasDamage = false;
    for (const prop of props) {
      const { name, values, type } = prop;
      let text: string | undefined;
      switch (type) {
        // TODO: swap to dps from extended
        case TradePropType.WeaponPhysicalDamage:
          block.push({
            text: "item.physical_dps",
            value: extended.pdps!,
            color: useColor(extended.pdps_aug),
          });
          hasDamage = true;
          continue;
        case TradePropType.WeaponElementalDamage:
          block.push({
            text: "item.elemental_dps",
            value: extended.edps!,
            color: useColor(extended.edps_aug),
          });
          hasDamage = true;
          continue;

        case TradePropType.ArmourReduction:
          block.push({
            text: "item.armour",
            value: extended.ar!,
            color: useColor(extended.ar_aug) || values[0][1],
          });
          continue;
        case TradePropType.ArmourEvasion:
          block.push({
            text: "item.evasion_rating",
            value: extended.ev!,
            color: useColor(extended.ev_aug) || values[0][1],
          });
          continue;
        case TradePropType.ArmourEnergyShield:
          block.push({
            text: "item.energy_shield",
            value: extended.es!,
            color: useColor(extended.es_aug) || values[0][1],
          });
          continue;

        case TradePropType.ArmourWard:
          block.push({
            text: "item.runic_ward",
            value: extended.ward!,
            color: useColor(extended.ward_aug) || values[0][1],
          });
          continue;

        case TradePropType.Quality:
          text = "item.quality";
          break;

        case TradePropType.WeaponSpeed:
          text = "item.aps";
          break;
        case TradePropType.WeaponCriticalChance:
          text = "item.crit";
          break;
        case TradePropType.WeaponReloadTime:
          text = "item.reload_time";
          break;
        case TradePropType.ShieldBlock:
          text = "item.block";
          break;
        case TradePropType.Spirit:
          text = "item.spirit";
          break;

        // map stuffs
        case TradePropType.MapTier:
          text = "item.map_tier";
          break;
        case TradePropType.MapPortals:
          text = "item.map_revives";
          break;
        case TradePropType.MapPackSizeBonus:
          text = "item.map_pack_size";
          break;
        case TradePropType.MapMagicMonstersQuantityBonus:
          text = "item.map_magic_monsters";
          break;
        case TradePropType.MapRareMonstersQuantityBonus:
          text = "item.map_rare_monsters";
          break;
        case TradePropType.MapMapItemDropChanceBonus:
          text = "item.map_drop_chance";
          break;
        case TradePropType.MapRarityBonus:
          text = "item.map_item_rarity";
          break;
        case TradePropType.MapGoldQuantityBonus:
          text = "item.map_gold";
          break;
        case TradePropType.MapQuantityBonus:
          // text = "item.map_item_quantity";
          break;
      }

      block.push({
        text: text ?? `${parseAffixStrings(name)} `,
        // if we have a value, there should only be one probably...
        value: values.length ? values[0][0] : "",
        color: values.length ? values[0][1] : TradeNumberColors.White,
      });
    }
    if (hasDamage) {
      const dpsIndex = block.findIndex((line) => line.text.includes("dps"));
      block.splice(dpsIndex, 0, {
        text: "item.total_dps",
        value: extended.dps!,
        color: useColor(extended.dps_aug),
      });
    }

    return block;
  }

  function useColor(use: boolean | undefined) {
    return use ? TradeNumberColors.Augmented : TradeNumberColors.White;
  }
}

function buildItemProps(
  ilvl: number | undefined,
  requirements: TradeDataRichLine[] | undefined,
): DisplayItem["itemProps"] {
  if (!ilvl && !requirements) return;

  const block: Array<{
    text: string;
    value: string | number;
    color: TradeNumberColors;
  }> = [];
  if (ilvl) {
    block.push({
      text: "item.item_level",
      value: ilvl,
      color: TradeNumberColors.White,
    });
  }
  if (requirements && requirements.length) {
    let value = requirements[0].values[0][0];

    if (requirements.length > 1) {
      value = parseAffixStrings(
        `${value}, ${requirements
          .slice(1)
          .map((r) => `${r.values[0][0]} ${r.name}`)
          .join(", ")}`,
      );
    }

    // do i actually care about this?
    block.push({
      // no colon for req
      text: `${parseAffixStrings(requirements[0].name)} `,
      value,
      color: TradeNumberColors.White,
    });
  }
  return block;
}

function buildGrantSkillBlock(
  skills: TradeDataRichLine[] | undefined,
): DisplayItemLine[] {
  if (!skills || skills.length === 0) return [];
  const block: DisplayItemLine[] = [];
  for (const skill of skills) {
    block.push({
      text: `${parseAffixStrings(skill.name)}: `,
      value: parseAffixStrings(skill.values[0][0]),
      color: skill.values[0][1],
    });
  }

  return block;
}

// Disable since this is export for tests
// eslint-disable-next-line @typescript-eslint/naming-convention
export const __testExports = {
  parseFetchResult,
};
