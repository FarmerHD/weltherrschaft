import { NEUTRAL, type Nation, type Region, type World } from "./state";

// A simplified, stylized world map: ~44 macro-regions grouped by continent
// (not exact political borders — a node/graph map in the tradition of
// classic conquest board games). Coordinates are approximate centroids in
// lat/lon degrees; src/ui/map.ts projects them onto the SVG canvas.

interface RegionSeed {
  id: string;
  name: string;
  continent: string;
  lat: number;
  lon: number;
  neighbors: string[];
  /** Relative size tier 1-3, drives starting troops / income / troop cap. */
  tier: 1 | 2 | 3;
}

const REGION_SEEDS: RegionSeed[] = [
  // Europe
  { id: "britain", name: "Britannien", continent: "europe", lat: 54, lon: -2, neighbors: ["france", "scandinavia"], tier: 2 },
  { id: "iberia", name: "Iberien", continent: "europe", lat: 40, lon: -4, neighbors: ["france", "north_africa"], tier: 2 },
  { id: "france", name: "Frankreich", continent: "europe", lat: 47, lon: 2, neighbors: ["britain", "iberia", "germany", "italy"], tier: 3 },
  { id: "germany", name: "Deutschland", continent: "europe", lat: 51, lon: 10, neighbors: ["france", "poland", "italy", "scandinavia"], tier: 3 },
  { id: "italy", name: "Italien", continent: "europe", lat: 43, lon: 12, neighbors: ["france", "germany", "balkans", "north_africa"], tier: 2 },
  { id: "poland", name: "Polen", continent: "europe", lat: 52, lon: 19, neighbors: ["germany", "ukraine", "scandinavia", "balkans"], tier: 2 },
  { id: "scandinavia", name: "Skandinavien", continent: "europe", lat: 62, lon: 15, neighbors: ["britain", "germany", "poland", "european_russia"], tier: 2 },
  { id: "ukraine", name: "Ukraine", continent: "europe", lat: 49, lon: 32, neighbors: ["poland", "balkans", "european_russia", "turkey"], tier: 2 },
  { id: "balkans", name: "Balkan", continent: "europe", lat: 43, lon: 22, neighbors: ["italy", "poland", "ukraine", "turkey"], tier: 1 },
  { id: "european_russia", name: "Westrussland", continent: "europe", lat: 56, lon: 38, neighbors: ["scandinavia", "ukraine", "central_asia", "siberia"], tier: 3 },

  // Africa
  { id: "north_africa", name: "Nordafrika", continent: "africa", lat: 28, lon: 2, neighbors: ["iberia", "italy", "egypt", "west_africa"], tier: 2 },
  { id: "egypt", name: "Ägypten", continent: "africa", lat: 26, lon: 30, neighbors: ["north_africa", "middle_east", "east_africa"], tier: 2 },
  { id: "west_africa", name: "Westafrika", continent: "africa", lat: 10, lon: -2, neighbors: ["north_africa", "central_africa"], tier: 1 },
  { id: "central_africa", name: "Zentralafrika", continent: "africa", lat: 0, lon: 20, neighbors: ["west_africa", "east_africa", "south_africa"], tier: 1 },
  { id: "east_africa", name: "Ostafrika", continent: "africa", lat: 2, lon: 38, neighbors: ["egypt", "central_africa", "south_africa", "madagascar", "arabia"], tier: 1 },
  { id: "south_africa", name: "Südafrika", continent: "africa", lat: -29, lon: 24, neighbors: ["central_africa", "east_africa", "madagascar"], tier: 2 },
  { id: "madagascar", name: "Madagaskar", continent: "africa", lat: -19, lon: 46, neighbors: ["east_africa", "south_africa"], tier: 1 },

  // Asia
  { id: "turkey", name: "Türkei", continent: "asia", lat: 39, lon: 35, neighbors: ["balkans", "ukraine", "middle_east"], tier: 2 },
  { id: "middle_east", name: "Naher Osten", continent: "asia", lat: 31, lon: 38, neighbors: ["turkey", "egypt", "arabia", "persia"], tier: 2 },
  { id: "arabia", name: "Arabien", continent: "asia", lat: 21, lon: 45, neighbors: ["middle_east", "egypt", "persia", "east_africa"], tier: 1 },
  { id: "persia", name: "Persien", continent: "asia", lat: 32, lon: 53, neighbors: ["middle_east", "arabia", "central_asia", "india"], tier: 2 },
  { id: "central_asia", name: "Zentralasien", continent: "asia", lat: 45, lon: 65, neighbors: ["european_russia", "persia", "india", "china", "siberia", "mongolia"], tier: 1 },
  { id: "india", name: "Indien", continent: "asia", lat: 22, lon: 79, neighbors: ["persia", "central_asia", "china", "southeast_asia"], tier: 3 },
  { id: "southeast_asia", name: "Südostasien", continent: "asia", lat: 13, lon: 103, neighbors: ["india", "china", "indonesia"], tier: 2 },
  { id: "indonesia", name: "Indonesien", continent: "asia", lat: -3, lon: 118, neighbors: ["southeast_asia", "australia"], tier: 2 },
  { id: "china", name: "China", continent: "asia", lat: 35, lon: 105, neighbors: ["central_asia", "india", "southeast_asia", "mongolia", "korea"], tier: 3 },
  { id: "mongolia", name: "Mongolei", continent: "asia", lat: 46, lon: 103, neighbors: ["central_asia", "china", "siberia", "russian_far_east"], tier: 1 },
  { id: "japan", name: "Japan", continent: "asia", lat: 36, lon: 138, neighbors: ["korea", "russian_far_east"], tier: 2 },
  { id: "korea", name: "Korea", continent: "asia", lat: 37, lon: 127, neighbors: ["china", "japan", "russian_far_east"], tier: 1 },
  { id: "siberia", name: "Sibirien", continent: "asia", lat: 60, lon: 90, neighbors: ["european_russia", "central_asia", "mongolia", "russian_far_east"], tier: 1 },
  { id: "russian_far_east", name: "Fernost", continent: "asia", lat: 62, lon: 130, neighbors: ["siberia", "mongolia", "korea", "japan", "alaska"], tier: 1 },

  // Oceania
  { id: "australia", name: "Australien", continent: "oceania", lat: -25, lon: 134, neighbors: ["indonesia", "new_zealand"], tier: 2 },
  { id: "new_zealand", name: "Neuseeland", continent: "oceania", lat: -41, lon: 174, neighbors: ["australia"], tier: 1 },

  // North America
  { id: "alaska", name: "Alaska", continent: "north_america", lat: 64, lon: -153, neighbors: ["russian_far_east", "canada_west"], tier: 1 },
  { id: "canada_west", name: "Westkanada", continent: "north_america", lat: 55, lon: -120, neighbors: ["alaska", "canada_east", "usa_west"], tier: 1 },
  { id: "canada_east", name: "Ostkanada", continent: "north_america", lat: 50, lon: -75, neighbors: ["canada_west", "usa_east"], tier: 1 },
  { id: "usa_west", name: "USA West", continent: "north_america", lat: 40, lon: -115, neighbors: ["canada_west", "usa_east", "mexico"], tier: 3 },
  { id: "usa_east", name: "USA Ost", continent: "north_america", lat: 39, lon: -80, neighbors: ["canada_east", "usa_west", "mexico"], tier: 3 },
  { id: "mexico", name: "Mexiko", continent: "north_america", lat: 23, lon: -102, neighbors: ["usa_west", "usa_east", "central_america"], tier: 2 },
  { id: "central_america", name: "Zentralamerika", continent: "north_america", lat: 10, lon: -84, neighbors: ["mexico", "north_sa"], tier: 1 },

  // South America
  { id: "north_sa", name: "Nordsüdamerika", continent: "south_america", lat: 6, lon: -66, neighbors: ["central_america", "brazil", "andes"], tier: 1 },
  { id: "brazil", name: "Brasilien", continent: "south_america", lat: -10, lon: -55, neighbors: ["north_sa", "andes", "argentina"], tier: 3 },
  { id: "andes", name: "Anden", continent: "south_america", lat: -15, lon: -72, neighbors: ["north_sa", "brazil", "argentina"], tier: 1 },
  { id: "argentina", name: "Argentinien", continent: "south_america", lat: -35, lon: -64, neighbors: ["brazil", "andes"], tier: 2 },
];

interface NationSeed {
  id: string;
  name: string;
  color: string;
  isPlayer: boolean;
  startRegions: string[];
}

export const NATION_SEEDS: NationSeed[] = [
  // Player starts with two neighboring regions (not just one) so a single lost
  // battle at the border doesn't immediately end the game.
  { id: "player", name: "Dein Reich", color: "#e8b84b", isPlayer: true, startRegions: ["germany", "poland"] },
  { id: "france_ai", name: "Frankreich", color: "#4c7fd6", isPlayer: false, startRegions: ["france", "iberia"] },
  { id: "russia_ai", name: "Russland", color: "#7a4cd6", isPlayer: false, startRegions: ["european_russia", "siberia", "russian_far_east"] },
  { id: "china_ai", name: "China", color: "#d64c4c", isPlayer: false, startRegions: ["china", "mongolia", "korea"] },
  { id: "usa_ai", name: "USA", color: "#4cd68f", isPlayer: false, startRegions: ["usa_east", "usa_west", "canada_east"] },
  { id: "arab_ai", name: "Arabische Liga", color: "#d6a24c", isPlayer: false, startRegions: ["middle_east", "arabia", "egypt"] },
];

const TIER_STATS: Record<1 | 2 | 3, { income: number; troops: number; troopCap: number }> = {
  1: { income: 1.2, troops: 12, troopCap: 40 },
  2: { income: 2.2, troops: 20, troopCap: 70 },
  3: { income: 3.6, troops: 30, troopCap: 110 },
};

/** Neutral (unowned) regions defend a bit harder than their raw troop count implies. */
export const NEUTRAL_DEFENSE_BONUS = 1.15;

/**
 * The hand-authored neighbor lists above are not guaranteed to be symmetric
 * (e.g. "arabia" lists "egypt" but "egypt" might not list "arabia" back).
 * This builds the symmetric closure so adjacency always works both ways.
 */
function buildSymmetricAdjacency(seeds: RegionSeed[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const seed of seeds) {
    adjacency.set(seed.id, new Set(seed.neighbors));
  }
  for (const seed of seeds) {
    for (const neighborId of seed.neighbors) {
      const reverse = adjacency.get(neighborId);
      if (reverse) reverse.add(seed.id);
    }
  }
  return adjacency;
}

const ADJACENCY = buildSymmetricAdjacency(REGION_SEEDS);

export function createInitialWorld(): World {
  const ownerByRegion = new Map<string, string>();
  for (const nation of NATION_SEEDS) {
    for (const regionId of nation.startRegions) {
      ownerByRegion.set(regionId, nation.id);
    }
  }

  const regions: Record<string, Region> = {};
  for (const seed of REGION_SEEDS) {
    const stats = TIER_STATS[seed.tier];
    const owner = ownerByRegion.get(seed.id) ?? NEUTRAL;
    regions[seed.id] = {
      id: seed.id,
      name: seed.name,
      continent: seed.continent,
      lat: seed.lat,
      lon: seed.lon,
      neighbors: [...(ADJACENCY.get(seed.id) ?? new Set())],
      owner,
      troops: stats.troops,
      income: stats.income,
      troopCap: stats.troopCap,
    };
  }

  const nations: Record<string, Nation> = {};
  for (const seed of NATION_SEEDS) {
    nations[seed.id] = {
      id: seed.id,
      name: seed.name,
      color: seed.color,
      isPlayer: seed.isPlayer,
      gold: 50,
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

export const TOTAL_REGION_COUNT = REGION_SEEDS.length;
