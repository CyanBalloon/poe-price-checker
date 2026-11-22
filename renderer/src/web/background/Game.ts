import { switchGameData } from "@/assets/data";
import { AppConfig, saveConfig } from "@/web/Config";
import type { GameVersion } from "@ipc/types";
import { useLeagues } from "./Leagues";
import { useTradeData } from "./TradeData";

let pendingGame: GameVersion | undefined;
let pendingSwitch: Promise<boolean> | undefined;

export function selectGame(game: GameVersion): Promise<boolean> {
  if (game === pendingGame && pendingSwitch) return pendingSwitch;
  if (!pendingSwitch && AppConfig().game === game) return Promise.resolve(true);

  pendingGame = game;
  const switching = applyGame(game).finally(() => {
    if (pendingSwitch === switching) {
      pendingSwitch = undefined;
      pendingGame = undefined;
    }
  });
  pendingSwitch = switching;
  return switching;
}

async function applyGame(game: GameVersion) {
  const config = AppConfig();
  const loaded = await switchGameData(game, config.language);
  if (!loaded || pendingGame !== game) return false;
  if (config.game === game) return true;

  const previous = config.game;
  config.leagueByGame ??= {};
  config.leagueByGame[previous] = config.leagueId;
  config.leagueId = config.leagueByGame[game];
  config.game = game;
  saveConfig();

  void useTradeData().load(true, game);
  await useLeagues().load();
  return pendingGame === game;
}
