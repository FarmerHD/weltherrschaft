import { NEUTRAL, type BuildingType, type NationId, type Region, type World } from "./state";
import { NEUTRAL_DEFENSE_BONUS, TOTAL_REGION_COUNT } from "./world";

/** Gold cost consumed per troop trained by a barracks. */
export const TRAINING_GOLD_COST_PER_TROOP = 4;
/** Troops trained per second, per barracks level (level 1 = one troop every 8s, level 3 three times as fast). */
export const TRAINING_RATE_PER_BARRACKS_LEVEL = 1 / 8;
/** Fraction of countries the player must control to win. Lower than the old 60%
 *  since the real-world map has ~176 countries instead of 44 macro-regions. */
const VICTORY_FRACTION = 0.5;
/** AI won't commit an attack unless its force is at least this multiple of the target's estimated defense. */
const AI_SAFETY_MARGIN = 1.15;
/** AI regions below this troop count are considered too weak to launch an attack from. */
const AI_MIN_ATTACK_TROOPS = 10;

export interface CombatResult {
  attackerNationId: NationId;
  defenderNationId: NationId;
  fromRegionId: string;
  toRegionId: string;
  attackTroops: number;
  defendTroops: number;
  captured: boolean;
  survivors: number;
}

// --- Infrastructure & military buildings --------------------------------
// Three simple building types per region, levels 0-3. Base stats on Region
// stay untouched; effective values are derived here so save data stays
// simple and the bonuses are easy to tune from one place.

export const MAX_BUILDING_LEVEL = 3;

interface BuildingConfig {
  name: string;
  description: string;
  baseCost: number;
  /** Bonus applied per level, e.g. 0.25 = +25% per level. */
  bonusPerLevel: number;
}

export const BUILDING_CONFIG: Record<BuildingType, BuildingConfig> = {
  economy: { name: "Wirtschaft", description: "+25% Goldeinkommen pro Stufe", baseCost: 60, bonusPerLevel: 0.25 },
  barracks: { name: "Kaserne", description: "Bildet Truppen aus (schneller & mehr Kapazität pro Stufe)", baseCost: 80, bonusPerLevel: 0.3 },
  fortress: { name: "Festung", description: "+20% Verteidigung pro Stufe", baseCost: 100, bonusPerLevel: 0.2 },
};

/** Gold cost to go from the current level to the next one (linear scaling). */
export function buildingCost(type: BuildingType, currentLevel: number): number {
  return BUILDING_CONFIG[type].baseCost * (currentLevel + 1);
}

export function getEffectiveIncome(region: Region): number {
  return region.income * (1 + BUILDING_CONFIG.economy.bonusPerLevel * region.buildings.economy);
}

export function getEffectiveTroopCap(region: Region): number {
  return region.troopCap * (1 + BUILDING_CONFIG.barracks.bonusPerLevel * region.buildings.barracks);
}

/** Troops per second a region's barracks can train — 0 if it has no barracks yet. */
export function getTrainingRatePerSecond(region: Region): number {
  return region.buildings.barracks * TRAINING_RATE_PER_BARRACKS_LEVEL;
}

function getFortressMultiplier(region: Region): number {
  return 1 + BUILDING_CONFIG.fortress.bonusPerLevel * region.buildings.fortress;
}

/** Effective defense power (troops × neutral bonus × fortress bonus) — exported so the UI can show attack estimates. */
export function getEffectiveDefensePower(region: Region): number {
  return regionDefensePower(region);
}

/**
 * Spends gold to upgrade `buildingType` in `regionId` by one level, if the
 * nation owns the region, hasn't maxed it out, and can afford it. Returns
 * true if the upgrade happened.
 */
export function upgradeBuilding(world: World, nationId: NationId, regionId: string, buildingType: BuildingType): boolean {
  const region = world.regions[regionId];
  const nation = world.nations[nationId];
  if (!region || !nation || region.owner !== nationId) return false;

  const currentLevel = region.buildings[buildingType];
  if (currentLevel >= MAX_BUILDING_LEVEL) return false;

  const cost = buildingCost(buildingType, currentLevel);
  if (nation.gold < cost) return false;

  nation.gold -= cost;
  region.buildings[buildingType] = currentLevel + 1;
  return true;
}

function regionDefensePower(region: Region): number {
  const neutralBonus = region.owner === NEUTRAL ? NEUTRAL_DEFENSE_BONUS : 1;
  return region.troops * neutralBonus * getFortressMultiplier(region);
}

/**
 * Advances gold income and barracks troop training for every region/nation
 * by `deltaSeconds`. There is no manual "buy troops" anymore — a region only
 * grows its garrison if it has a barracks (level 1+), at a rate that scales
 * with the barracks level, and training is paid for continuously out of the
 * owning nation's gold. If gold runs out mid-tick, training slows down
 * proportionally instead of going negative or stalling entirely.
 */
export function tickResources(world: World, deltaSeconds: number): void {
  if (deltaSeconds <= 0) return;
  for (const region of Object.values(world.regions)) {
    if (region.owner === NEUTRAL) continue;
    const nation = world.nations[region.owner];
    if (!nation || nation.defeated) continue;

    nation.gold += getEffectiveIncome(region) * deltaSeconds;

    const trainingRate = getTrainingRatePerSecond(region);
    const effectiveCap = getEffectiveTroopCap(region);
    if (trainingRate > 0 && region.troops < effectiveCap) {
      const desiredTroops = Math.min(trainingRate * deltaSeconds, effectiveCap - region.troops);
      const goldNeeded = desiredTroops * TRAINING_GOLD_COST_PER_TROOP;
      const affordableFraction = goldNeeded > 0 ? Math.min(1, nation.gold / goldNeeded) : 1;
      const trainedTroops = desiredTroops * affordableFraction;

      region.troops += trainedTroops;
      nation.gold -= trainedTroops * TRAINING_GOLD_COST_PER_TROOP;
    }
  }
  world.tick += 1;
  world.lastUpdated = Date.now();
}

export function attackableTargets(world: World, regionId: string, nationId: NationId): string[] {
  const region = world.regions[regionId];
  if (!region || region.owner !== nationId) return [];
  return region.neighbors.filter((id) => world.regions[id]?.owner !== nationId);
}

export function canAttack(world: World, fromId: string, toId: string, nationId: NationId): boolean {
  const from = world.regions[fromId];
  const to = world.regions[toId];
  if (!from || !to) return false;
  if (from.owner !== nationId) return false;
  if (to.owner === nationId) return false;
  if (!from.neighbors.includes(toId)) return false;
  return from.troops >= 2;
}

/**
 * Resolves an attack from `fromId` into `toId` using `fraction` (0-1] of the
 * attacking region's troops. Mutates the world in place and returns a log of
 * what happened so the UI can report it.
 */
export function attack(world: World, fromId: string, toId: string, nationId: NationId, fraction: number): CombatResult | null {
  if (!canAttack(world, fromId, toId, nationId)) return null;
  const from = world.regions[fromId];
  const to = world.regions[toId];

  const clampedFraction = Math.min(1, Math.max(0.05, fraction));
  const attackTroops = Math.max(1, Math.floor(from.troops * clampedFraction));
  const defendTroops = Math.floor(to.troops);
  const defenderNationId = to.owner;

  const attackPower = attackTroops * (0.85 + Math.random() * 0.3);
  const defendPower = regionDefensePower(to) * (0.85 + Math.random() * 0.3);

  from.troops -= attackTroops;

  let captured: boolean;
  let survivors: number;

  if (attackPower > defendPower) {
    const ratio = defendPower / attackPower; // 0..1, how close the fight was
    survivors = Math.max(1, Math.round(attackTroops * (1 - ratio) * 0.8));
    to.troops = survivors;
    to.owner = nationId;
    captured = true;
  } else {
    const ratio = attackPower / defendPower; // 0..1
    survivors = Math.max(1, Math.round(defendTroops * (1 - ratio * 0.6)));
    to.troops = survivors;
    captured = false;
  }

  markDefeatedNations(world);
  checkVictoryDefeat(world);

  return {
    attackerNationId: nationId,
    defenderNationId,
    fromRegionId: fromId,
    toRegionId: toId,
    attackTroops,
    defendTroops,
    captured,
    survivors,
  };
}

function markDefeatedNations(world: World): void {
  const ownedCounts = new Map<string, number>();
  for (const region of Object.values(world.regions)) {
    if (region.owner === NEUTRAL) continue;
    ownedCounts.set(region.owner, (ownedCounts.get(region.owner) ?? 0) + 1);
  }
  for (const nation of Object.values(world.nations)) {
    nation.defeated = (ownedCounts.get(nation.id) ?? 0) === 0;
  }
}

export function checkVictoryDefeat(world: World): void {
  if (world.status !== "playing") return;
  const player = world.nations["player"];
  if (!player) return;

  const playerRegions = Object.values(world.regions).filter((r) => r.owner === "player").length;

  if (playerRegions === 0) {
    world.status = "defeat";
    return;
  }
  if (playerRegions / TOTAL_REGION_COUNT >= VICTORY_FRACTION) {
    world.status = "victory";
  }
}

/**
 * Very small rule-based AI: for the given nation, find its single best attack
 * opportunity (an adjacent region it can plausibly beat) and take it. If none
 * is found, invest in a barracks in its weakest border region instead (the
 * AI trains troops the same way the player does — no shortcuts). Called
 * periodically per-nation from the game loop, at most one action per call.
 */
export function runAiTurn(world: World, nationId: NationId): CombatResult | null {
  const nation = world.nations[nationId];
  if (!nation || nation.defeated || nation.isPlayer) return null;

  const ownRegions = Object.values(world.regions).filter((r) => r.owner === nationId);
  if (ownRegions.length === 0) return null;

  let bestAttack: { from: Region; to: Region; score: number } | null = null;

  for (const from of ownRegions) {
    if (from.troops < AI_MIN_ATTACK_TROOPS) continue;
    for (const neighborId of from.neighbors) {
      const to = world.regions[neighborId];
      if (!to || to.owner === nationId) continue;

      const attackTroops = from.troops * 0.7;
      const defendPower = regionDefensePower(to);
      if (attackTroops < defendPower * AI_SAFETY_MARGIN) continue;

      const score = attackTroops - defendPower;
      if (!bestAttack || score > bestAttack.score) {
        bestAttack = { from, to, score };
      }
    }
  }

  if (bestAttack) {
    return attack(world, bestAttack.from.id, bestAttack.to.id, nationId, 0.7);
  }

  // No good attack available: invest in the barracks of the border region with
  // the weakest garrison, so it can start (or keep) training troops there.
  const borderRegions = ownRegions.filter((r) => r.neighbors.some((n) => world.regions[n]?.owner !== nationId));
  const weakest = (borderRegions.length > 0 ? borderRegions : ownRegions).sort((a, b) => a.troops - b.troops)[0];
  if (weakest) {
    upgradeBuilding(world, nationId, weakest.id, "barracks");
  }
  return null;
}
