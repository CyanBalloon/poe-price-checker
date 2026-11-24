import type { GameVersion } from "./types";

export interface ItemIcon {
  game: GameVersion;
  namespace: string;
  refName: string;
  iconUrl: string;
}

export function itemIconKey(game: GameVersion, namespace: string, refName: string, influences: readonly string[] = []) {
  return JSON.stringify(influences.length
    ? [game, namespace, refName, [...influences].sort()]
    : [game, namespace, refName]);
}

interface GeneratedItemArt {
  f?: string;
  realm?: string;
  w?: number;
  h?: number;
  scale?: number;
  shaper?: boolean;
  elder?: boolean;
  searing?: boolean;
  tangled?: boolean;
}

function generatedItemArt(url?: string): GeneratedItemArt | undefined {
  const token = url && /^https:\/\/web\.poecdn\.com\/gen\/image\/([^/]+)\//.exec(url)?.[1];
  if (!token) return;
  try {
    const descriptor = JSON.parse(atob(token.replace(/-/g, "+").replace(/_/g, "/")))[2];
    if (descriptor && typeof descriptor === "object") return descriptor;
  } catch { /* Unknown icon format. */ }
}

export function itemIconBackdropFlags(url: string) {
  const art = generatedItemArt(url);
  return { shaper: art?.shaper === true, elder: art?.elder === true, searing: art?.searing === true, tangled: art?.tangled === true };
}

export function iconHasInfluenceBackdrop(url: string) {
  return Object.values(itemIconBackdropFlags(url)).some(Boolean);
}

// GGG's public art endpoint also exposes the undecorated sprite for inherently influenced uniques.
export function plainItemIconUrl(signed: string) {
  const art = generatedItemArt(signed);
  if (typeof art?.f !== "string" || (art.realm ?? "poe1") !== "poe1") return;
  const segments = art.f.split("/");
  if (segments[0] !== "2DItems" || segments.length < 2 ||
      segments.some(part => !part || part === "." || part === ".." || part.includes("\\"))) return;
  const url = new URL("https://web.poecdn.com/image/Art/" + segments.map(encodeURIComponent).join("/") + ".png");
  url.searchParams.set("w", String(art.w ?? 1));
  url.searchParams.set("h", String(art.h ?? 1));
  url.searchParams.set("scale", String(art.scale ?? 1));
  return url.href;
}

// GGG can render different influence backgrounds around the same inventory sprite.
export function sameItemIconArt(first: string, second: string) {
  const a = generatedItemArt(first);
  const b = generatedItemArt(second);
  return Boolean(a?.f && b && a.f === b.f && (a.realm ?? "poe1") === (b.realm ?? "poe1") &&
    (a.w ?? 1) === (b.w ?? 1) && (a.h ?? 1) === (b.h ?? 1) && (a.scale ?? 1) === (b.scale ?? 1));
}

// Old caches used item names alone. The official generated URL identifies its game.
export function legacyItemIcon(url: string | undefined, game: GameVersion) {
  const art = generatedItemArt(url);
  if (art && (art.realm ?? "poe1") === game) return url;
}
