// Core data model for the game. Kept as plain, serializable objects with no
// DOM access anywhere in this file or in engine.ts — this is what lets a
// later "online multiplayer" phase swap localStorage for a synced backend
// (e.g. Firestore) without rewriting the game logic.

export type NationId = "player" | string; // "player" or an AI nation id, e.g. "france"
export const NEUTRAL: NationId = "neutral";

export type BuildingType = "economy" | "barracks" | "fortress";

export interface Region {
  id: string;
  name: string;
  neighbors: string[];
  owner: NationId;
  troops: number;
  /** Base gold generated per second while owned, before building bonuses. */
  income: number;
  /** Base soft cap that passive troop regeneration approaches, before building bonuses. */
  troopCap: number;
  /** Building levels 0-3 each. Effects are applied via engine.ts helpers, not stored here. */
  buildings: Record<BuildingType, number>;
}

export interface Nation {
  id: NationId;
  name: string;
  color: string;
  isPlayer: boolean;
  gold: number;
  /** True once a nation has lost all regions. */
  defeated: boolean;
}

export interface World {
  regions: Record<string, Region>;
  nations: Record<string, Nation>;
  tick: number;
  /** Unix ms timestamp of last simulation step, used for offline progress. */
  lastUpdated: number;
  status: "playing" | "victory" | "defeat";
}

export interface SaveGame {
  version: number;
  savedAt: number;
  world: World;
}

// Bumped for the real-country map + buildings rework: old saves used
// different region ids (slugs like "germany") and lack the buildings field,
// so they must not be loaded into the new model.
const SAVE_VERSION = 2;
const SAVE_KEY = "weltherrschaft-save-v2";
/** Cap offline simulation so leaving the tab open for days doesn't cause a huge jump. */
const MAX_OFFLINE_SECONDS = 12 * 60 * 60;

export function saveGame(world: World): void {
  const save: SaveGame = {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    world,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (err) {
    console.warn("Speichern fehlgeschlagen:", err);
  }
}

export function loadGame(): SaveGame | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveGame;
    if (parsed.version !== SAVE_VERSION) return null;
    return parsed;
  } catch (err) {
    console.warn("Speicherstand konnte nicht geladen werden:", err);
    return null;
  }
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

/** Seconds elapsed since the save, clamped to a sane maximum. */
export function offlineSecondsSince(savedAt: number): number {
  const elapsedSeconds = Math.max(0, (Date.now() - savedAt) / 1000);
  return Math.min(elapsedSeconds, MAX_OFFLINE_SECONDS);
}
