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

// --- Per-region stats scaled continuously from real geographic area -----
// (replaces the old 3-bucket tier system). Land area is extremely skewed —
// Russia is ~7000x the size of Luxembourg — so raw area would make giant
// countries absurdly overpowered and tiny ones worthless. A fourth-root
// compresses that down to a much gentler ~9x spread between the smallest
// and largest country, which reads as "bigger countries produce a bit more"
// (as requested) rather than an unbeatable-superpower snowball. Constants
// were fitted so the results land in roughly the same range the old 3-tier
// system used (10-28 troops, 35-100 capacity, 1.0-3.5 income), just now on
// a smooth curve instead of 3 buckets.
const AREA_EXPONENT = 0.25;

const areaByIdx = new Map<number, number>();
for (const i of keepIndices) areaByIdx.set(i, geoArea(COUNTRY_FEATURES[i]));

function statsForArea(area: number): { income: number; troops: number; troopCap: number } {
  const areaFactor = Math.pow(Math.max(area, 1e-8), AREA_EXPONENT);
  return {
    income: 0.5 + 2.49 * areaFactor,
    troops: 7.8 + 25.2 * areaFactor,
    troopCap: 27 + 90.9 * areaFactor,
  };
}

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
/** First start country per nation = its "capital" — the only region that
 *  begins with a barracks already built (see startingBuildings below). */
const capitalRegionIdByNation = new Map<string, string>();
for (const seed of NATION_SEEDS) {
  seed.startCountries.forEach((countryName, i) => {
    const idx = idxByName.get(countryName);
    if (idx === undefined) {
      console.warn(`Weltherrschaft: Startland "${countryName}" nicht in den Kartendaten gefunden.`);
      return;
    }
    const id = regionIdOf(idx);
    nationIdByRegionId.set(id, seed.id);
    if (i === 0) capitalRegionIdByNation.set(seed.id, id);
  });
}

function emptyBuildings(): Region["buildings"] {
  return { economy: 0, barracks: 0, fortress: 0 };
}

/** Only each nation's capital region begins with a level-1 barracks already
 *  built — enough that training starts on turn one instead of the economy
 *  sitting completely idle, while still leaving where to put every further
 *  barracks (and fortress) as a real strategic choice for the player. */
function startingBuildings(regionId: string, owner: string): Region["buildings"] {
  const buildings = emptyBuildings();
  if (owner !== NEUTRAL && capitalRegionIdByNation.get(owner) === regionId) {
    buildings.barracks = 1;
  }
  return buildings;
}

export function createInitialWorld(): World {
  const regions: Record<string, Region> = {};
  for (const idx of keepIndices) {
    const id = regionIdOf(idx);
    const stats = statsForArea(areaByIdx.get(idx)!);
    const owner = nationIdByRegionId.get(id) ?? NEUTRAL;
    regions[id] = {
      id,
      name: COUNTRY_FEATURES[idx].properties.name,
      neighbors: [...(neighborIdxByIdx.get(idx) ?? new Set())].map(regionIdOf),
      owner,
      troops: Math.round(stats.troops),
      income: stats.income,
      troopCap: Math.round(stats.troopCap),
      buildings: startingBuildings(id, owner),
    };
  }

  const nations: Record<string, Nation> = {};
  for (const seed of NATION_SEEDS) {
    // Starting army = the sum of what each of the nation's start regions
    // would have defended with on its own — a fair, non-arbitrary seed for
    // the new shared pool.
    const startingTroops = Object.values(regions)
      .filter((r) => r.owner === seed.id)
      .reduce((sum, r) => sum + r.troops, 0);
    nations[seed.id] = {
      id: seed.id,
      name: seed.name,
      color: seed.color,
      isPlayer: seed.isPlayer,
      gold: 60,
      troops: startingTroops,
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
