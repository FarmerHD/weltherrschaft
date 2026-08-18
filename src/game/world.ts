import { feature, neighbors as topoNeighbors } from "topojson-client";
import { geoArea, geoCentroid, geoDistance } from "d3-geo";
import type { GeometryCollection } from "topojson-specification";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import worldTopology from "world-atlas/countries-110m.json";
import { NEUTRAL, type Nation, type Region, type World } from "./state";

// Real-world countries, sourced from Natural Earth via the `world-atlas` +
// `topojson-client` npm packages (see src/game/world-atlas.d.ts for the
// import typing). This replaces the earlier hand-authored 44 macro-regions:
// geometry, adjacency, and relative size are now all derived from real data
// instead of hand-typed guesses.

export type CountryProperties = { name: string };
export type CountryFeature = Feature<Polygon | MultiPolygon, CountryProperties>;

// Antarctica has no population/economy worth conquering; "Fr. S. Antarctic
// Lands" is an uninhabited French territory that otherwise tends to win the
// "nearest centroid" sea-adjacency backfill for southern-hemisphere islands
// (e.g. Madagascar) purely on geographic bad luck, producing a meaningless
// attack route. Both are excluded from play.
const EXCLUDED_COUNTRIES = new Set(["Antarctica", "Fr. S. Antarctic Lands"]);

const countriesObject = worldTopology.objects.countries as GeometryCollection<CountryProperties>;
export const COUNTRY_FEATURES = feature<CountryProperties>(worldTopology, countriesObject).features as CountryFeature[];

const geometries = countriesObject.geometries;

/** Indices (into COUNTRY_FEATURES / geometries) we keep after filtering out Antarctica etc. */
const keepIndices: number[] = [];
COUNTRY_FEATURES.forEach((f, i) => {
  if (!EXCLUDED_COUNTRIES.has(f.properties.name)) keepIndices.push(i);
});
const keptSet = new Set(keepIndices);

function regionIdOf(idx: number): string {
  return String(COUNTRY_FEATURES[idx].id);
}

// --- Adjacency: real shared borders, plus a sea-crossing fallback for --
// --- island nations that would otherwise have zero neighbors at all. --

const landNeighborIdx = topoNeighbors(geometries); // index -> index[], over the full unfiltered array
const centroids = COUNTRY_FEATURES.map((f) => geoCentroid(f));

function nearestByDistance(fromIdx: number, count: number): number[] {
  return keepIndices
    .filter((i) => i !== fromIdx)
    .sort((a, b) => geoDistance(centroids[fromIdx], centroids[a]) - geoDistance(centroids[fromIdx], centroids[b]))
    .slice(0, count);
}

const neighborIdxByIdx = new Map<number, Set<number>>();
for (const i of keepIndices) {
  neighborIdxByIdx.set(i, new Set(landNeighborIdx[i].filter((n) => keptSet.has(n))));
}
for (const i of keepIndices) {
  const set = neighborIdxByIdx.get(i)!;
  if (set.size === 0) {
    for (const n of nearestByDistance(i, 2)) {
      set.add(n);
      neighborIdxByIdx.get(n)?.add(i); // keep adjacency symmetric
    }
  }
}

// --- Size tier from real geographic area (rank-based, since land area is --
// --- extremely skewed — a handful of huge countries, many tiny ones). ---

const areaByIdx = new Map<number, number>();
for (const i of keepIndices) areaByIdx.set(i, geoArea(COUNTRY_FEATURES[i]));
const rankedByArea = [...keepIndices].sort((a, b) => areaByIdx.get(a)! - areaByIdx.get(b)!);
const tierByIdx = new Map<number, 1 | 2 | 3>();
rankedByArea.forEach((idx, rank) => {
  const fraction = rank / rankedByArea.length;
  tierByIdx.set(idx, fraction < 1 / 3 ? 1 : fraction < 2 / 3 ? 2 : 3);
});

const TIER_STATS: Record<1 | 2 | 3, { income: number; troops: number; troopCap: number }> = {
  1: { income: 1.0, troops: 10, troopCap: 35 },
  2: { income: 2.0, troops: 18, troopCap: 65 },
  3: { income: 3.5, troops: 28, troopCap: 100 },
};

/** Neutral (unowned) countries defend a bit harder than their raw troop count implies. */
export const NEUTRAL_DEFENSE_BONUS = 1.15;

// --- Starting nations, assigned by matching real country names ----------

interface NationSeed {
  id: string;
  name: string;
  color: string;
  isPlayer: boolean;
  /** Must match COUNTRY_FEATURES[i].properties.name exactly (verified against the actual dataset). */
  startCountries: string[];
}

export const NATION_SEEDS: NationSeed[] = [
  // Player starts with two neighboring countries so a single lost battle
  // at the border doesn't immediately end the game.
  { id: "player", name: "Dein Reich", color: "#e8b84b", isPlayer: true, startCountries: ["Germany", "Poland"] },
  { id: "france_ai", name: "Frankreich", color: "#4c7fd6", isPlayer: false, startCountries: ["France", "Spain", "Belgium"] },
  { id: "russia_ai", name: "Russland", color: "#7a4cd6", isPlayer: false, startCountries: ["Russia", "Belarus", "Kazakhstan"] },
  { id: "china_ai", name: "China", color: "#d64c4c", isPlayer: false, startCountries: ["China", "Mongolia", "North Korea", "South Korea"] },
  { id: "usa_ai", name: "USA", color: "#4cd68f", isPlayer: false, startCountries: ["United States of America", "Canada"] },
  { id: "arab_ai", name: "Arabische Liga", color: "#3fb8af", isPlayer: false, startCountries: ["Saudi Arabia", "Egypt", "Iraq", "Syria", "Jordan"] },
];

const idxByName = new Map<string, number>();
keepIndices.forEach((i) => idxByName.set(COUNTRY_FEATURES[i].properties.name, i));

const nationIdByRegionId = new Map<string, string>();
for (const seed of NATION_SEEDS) {
  for (const countryName of seed.startCountries) {
    const idx = idxByName.get(countryName);
    if (idx === undefined) {
      console.warn(`Weltherrschaft: Startland "${countryName}" nicht in den Kartendaten gefunden.`);
      continue;
    }
    nationIdByRegionId.set(regionIdOf(idx), seed.id);
  }
}

function emptyBuildings(): Region["buildings"] {
  return { economy: 0, barracks: 0, fortress: 0 };
}

/** Owned start regions begin with a level-1 barracks already built, so
 *  training begins on turn one instead of everyone sitting at 0 troops/s
 *  until they manually save up for and build their first barracks. */
function startingBuildings(owner: string): Region["buildings"] {
  const buildings = emptyBuildings();
  if (owner !== NEUTRAL) buildings.barracks = 1;
  return buildings;
}

export function createInitialWorld(): World {
  const regions: Record<string, Region> = {};
  for (const idx of keepIndices) {
    const id = regionIdOf(idx);
    const tier = tierByIdx.get(idx)!;
    const stats = TIER_STATS[tier];
    const owner = nationIdByRegionId.get(id) ?? NEUTRAL;
    regions[id] = {
      id,
      name: COUNTRY_FEATURES[idx].properties.name,
      neighbors: [...(neighborIdxByIdx.get(idx) ?? new Set())].map(regionIdOf),
      owner,
      troops: stats.troops,
      income: stats.income,
      troopCap: stats.troopCap,
      buildings: startingBuildings(owner),
    };
  }

  const nations: Record<string, Nation> = {};
  for (const seed of NATION_SEEDS) {
    nations[seed.id] = {
      id: seed.id,
      name: seed.name,
      color: seed.color,
      isPlayer: seed.isPlayer,
      gold: 60,
      defeated: false,
    };
  }

  return {
    regions,
    nations,
    tick: 0,
    lastUpdated: Date.now(),
    status: "playing",
  };
}

export const TOTAL_REGION_COUNT = keepIndices.length;
