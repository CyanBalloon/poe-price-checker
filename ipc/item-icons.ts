import type { GameVersion } from "./types";

export interface ItemIcon {
  game: GameVersion;
  namespace: string;
  refName: string;
  iconUrl: string;
}

export function itemIconKey(game: GameVersion, namespace: string, refName: string) {
  return JSON.stringify([game, namespace, refName]);
}

// Old caches used item names alone. The official generated URL identifies its game.
export function legacyItemIcon(url: string | undefined, game: GameVersion) {
  if (!url) return;
  const token = /^https:\/\/web\.poecdn\.com\/gen\/image\/([^/]+)\//.exec(url)?.[1];
  if (!token) return;
  try {
    const asset = JSON.parse(atob(token.replace(/-/g, "+").replace(/_/g, "/")))[2];
    if ((asset.realm ?? "poe1") === game) return url;
  } catch { /* Ignore old URLs with unknown provenance. */ }
}
