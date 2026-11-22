import { computed, shallowRef, readonly } from "vue";
import { createGlobalState } from "@vueuse/core";
import { AppConfig, poeWebApi } from "@/web/Config";
import { Host } from "./IPC";
import type { GameVersion } from "@ipc/types";
import { getTradeEndpointPath } from "@/web/price-check/trade/common";

// pc-ggg, pc-garena
// const PERMANENT_SC = ['Standard', '標準模式']
// const PERMANENT_HC = ["Hardcore", "專家模式"];

interface TradeLeague {
  id: string;
  text: string;
  realm?: string;
}

interface League {
  id: string;
  isPopular: boolean;
  text: string;
}

export const useLeagues = createGlobalState(() => {
  const isLoading = shallowRef(false);
  const error = shallowRef<string | null>(null);
  const tradeLeagues = shallowRef<League[]>([]);
  const loadedGame = shallowRef<GameVersion>();
  const list = computed(() => {
    const game = AppConfig()?.game;
    return game && loadedGame.value === game ? tradeLeagues.value : [];
  });
  let request = 0;

  const selectedId = computed<string | undefined>({
    get() {
      return list.value.length ? AppConfig()?.leagueId : undefined;
    },
    set(id) {
      const config = AppConfig();
      if (!config) return;
      config.leagueId = id;
      config.leagueByGame ??= {};
      config.leagueByGame[config.game] = id;
    },
  });

  const selected = computed(() => {
    const leagueId = selectedId.value;
    const config = AppConfig();
    if (!leagueId || !config) return undefined;
    const listed = list.value.find((league) => league.id === leagueId);
    return {
      id: leagueId,
      realm: config.realm,
      isPopular: !isPrivateLeague(leagueId) && Boolean(listed?.isPopular),
    };
  });

  async function load() {
    const game = AppConfig()?.game;
    if (!game) return;

    const loadId = ++request;
    isLoading.value = true;
    error.value = null;

    try {
      const response = await Host.proxy(
        poeWebApi() + "/api/" + getTradeEndpointPath(game) + "/data/leagues",
      );
      if (!response.ok) throw new Error("League request failed: " + response.status);
      const leagues: { result: TradeLeague[] } = await response.json();
      const config = AppConfig();
      if (loadId !== request || config?.game !== game) return;
      const pcLeagues = game === "poe1"
        ? leagues.result.filter((league) => !league.realm || league.realm === "pc")
        : leagues.result;
      if (!pcLeagues.length) throw new Error("The trade site returned no PC leagues");

      tradeLeagues.value = pcLeagues.map(({ id, text }) => ({
        id, isPopular: true, text,
      }));
      loadedGame.value = game;

      const chosen = config.leagueId;
      if (!tradeLeagues.value.some((league) => league.id === chosen) && !isPrivateLeague(chosen ?? "")) {
        const defaultLeague = game === "poe2" ? pcLeagues[2] : pcLeagues[0];
        selectedId.value = (defaultLeague ?? pcLeagues[0]).id;
      }
    } catch (e) {
      if (loadId === request) error.value = (e as Error).message;
    } finally {
      if (loadId === request) isLoading.value = false;
    }
  }

  return {
    isLoading,
    error,
    selectedId,
    selected,
    list: readonly(list),
    load,
  };
});

function isPrivateLeague(id: string) {
  if (id.includes("Ruthless")) {
    return true;
  }
  return /\(PL\d+\)$/.test(id);
}
