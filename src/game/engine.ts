import { NEUTRAL, type BuildingType, type NationId, type Region, type World } from "./state";
import { NEUTRAL_DEFENSE_BONUS, TOTAL_REGION_COUNT } from "./world";

/** Gold cost consumed per troop trained by a barracks. Halved from 4 — at
 *  the higher training rate below, 4 gold/troop would have made gold (not
 *  the barracks rate) the real bottleneck, quietly undercutting the speed-up. */
export const TRAINING_GOLD_COST_PER_TROOP = 2;
/** Troops trained per second, per barracks level (level 1 = one troop every 2s, level 3 three times as fast).
 *  4x the previous rate (was 1/8) — feeds the nation's shared army pool, not any one region. */
export const TRAINING_RATE_PER_BARRACKS_LEVEL = 1 / 2;
/** Fraction of countries the player must control to win. Lower than the old 60%
 *  since the real-world map has ~176 countries instead of 44 macro-regions. */
const VICTORY_FRACTION = 0.5;
/** AI won't commit an attack unless its force is at least this multiple of the target's estimated defense. */
const AI_SAFETY_MARGIN = 1.15;
/** AI won't attack at all unless its whole army is at least this large. */
const AI_MIN_ATTACK_TROOPS = 10;
/** Minimum army size needed to launch any attack at all. */
const MIN_ATTACK_TROOPS = 2;

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
  /** Bonus applied per level, e.g. 0.25 = +25% per level. Unused for barracks — its effect is a flat rate (TRAINING_RATE_PER_BARRACKS_LEVEL), not a % bonus. */
  bonusPerLevel: number;
}

export const BUILDING_CONFIG: Record<BuildingType, BuildingConfig> = {
  economy: { name: "Wirtschaft", description: "+25% Goldeinkommen dieses Landes pro Stufe", baseCost: 60, bonusPerLevel: 0.25 },
  barracks: {
    name: "Kaserne",
    description: `Bildet Truppen für deine gesamte Armee aus (${TRAINING_GOLD_COST_PER_TROOP} Gold/Truppe) — platziere sie strategisch, mehr/höhere Kasernen überall im Land bilden zusammen schneller aus`,
    baseCost: 80,
    bonusPerLevel: 0,
  },
  fortress: { name: "Festung", description: "+20% Verteidigung dieses Landes pro Stufe", baseCost: 100, bonusPerLevel: 0.2 },
};

/** Gold cost to go from the current level to the next one (linear scaling). */
export function buildingCost(type: BuildingType, currentLevel: number): number {
  return BUILDING_CONFIG[type].baseCost * (currentLevel + 1);
}

export function getEffectiveIncome(region: Region): number {
  return region.income * (1 + BUILDING_CONFIG.economy.bonusPerLevel * region.buildings.economy);
}

function getFortressMultiplier(region: Region): number {
  return 1 + BUILDING_CONFIG.fortress.bonusPerLevel * region.buildings.fortress;
}

export function getRegionsOwnedBy(world: World, nationId: NationId): Region[] {
  return Object.values(world.regions).filter((r) => r.owner === nationId);
}

/** Total gold/s a nation earns across all of its regions. */
export function getNationIncome(world: World, nationId: NationId): number {
  return getRegionsOwnedBy(world, nationId).reduce((sum, r) => sum + getEffectiveIncome(r), 0);
}

/** A nation's shared troop capacity — the sum of every owned region's area-based contribution. Not affected by barracks (that only affects training speed, not the ceiling). */
export function getNationTroopCap(world: World, nationId: NationId): number {
  return getRegionsOwnedBy(world, nationId).reduce((sum, r) => sum + r.troopCap, 0);
}

/** Troops/second a nation's whole army trains at — the sum of every owned region's barracks level, wherever they've been built. */
export function getNationTrainingRatePerSecond(world: World, nationId: NationId): number {
  return getRegionsOwnedBy(world, nationId).reduce((sum, r) => sum + r.buildings.barracks * TRAINING_RATE_PER_BARRACKS_LEVEL, 0);
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

/**
 * Effective defense power of a region if it were attacked right now.
 * - A neutral region defends with its own fixed local garrison.
 * - A nation-owned region no longer keeps a garrison of its own: it's
 *   defended by an even share of that nation's whole shared army (troops
 *   divided across every region it holds) — the "one army, not scattered
 *   garrisons" model. A fortress built specifically in that region still
 *   gives it a real, strategic local defense boost on top of that share.
 */
export function getEffectiveDefensePower(world: World, region: Region): number {
  if (region.owner === NEUTRAL) {
    return region.troops * NEUTRAL_DEFENSE_BONUS * getFortressMultiplier(region);
  }
  const nation = world.nations[region.owner];
  if (!nation) return 0;
  const regionCount = getRegionsOwnedBy(world, region.owner).length;
  const share = regionCount > 0 ? nation.troops / regionCount : 0;
  return share * getFortressMultiplier(region);
}

/** Raw troop count (before fortress/neutral bonuses) a region would commit if attacked — used to apply combat losses back onto the right pool afterwards. */
function getDefendingTroopsCommitted(world: World, region: Region): number {
  if (region.owner === NEUTRAL) return Math.floor(region.troops);
  const nation = world.nations[region.owner];
  if (!nation) return 0;
  const regionCount = getRegionsOwnedBy(world, region.owner).length;
  return regionCount > 0 ? Math.max(1, Math.round(nation.troops / regionCount)) : 0;
}

/**
 * Advances gold income and barracks troop training for every nation by
 * `deltaSeconds`. Troops are trained into the nation's single shared army
 * pool (Nation.troops), not any one region — a region only contributes to
 * how fast that pool trains (via its own barracks level) and how big the
 * pool's cap is (via its area-based capacity). Training is paid for
 * continuously out of the nation's gold; if gold runs out mid-tick,
 * training slows down proportionally instead of going negative or
 * stalling entirely.
 */
export function tickResources(world: World, deltaSeconds: number): void {
  if (deltaSeconds <= 0) return;
  for (const nation of Object.values(world.nations)) {
    if (nation.defeated) continue;

    const income = getNationIncome(world, nation.id);
    nation.gold += income * deltaSeconds;

    const trainingRate = getNationTrainingRatePerSecond(world, nation.id);
    const troopCap = getNationTroopCap(world, nation.id);
    if (trainingRate > 0 && nation.troops < troopCap) {
      const desiredTroops = Math.min(trainingRate * deltaSeconds, troopCap - nation.troops);
      const goldNeeded = desiredTroops * TRAINING_GOLD_COST_PER_TROOP;
      const affordableFraction = goldNeeded > 0 ? Math.min(1, nation.gold / goldNeeded) : 1;
      const trainedTroops = desiredTroops * affordableFraction;

      nation.troops += trainedTroops;
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
  const nation = world.nations[nationId];
  return (nation?.troops ?? 0) >= MIN_ATTACK_TROOPS;
}

/**
 * Resolves an attack from `fromId` into `toId` using `fraction` (0-1] of the
 * attacking nation's whole shared army. `fromId` still has to be an owned
 * region bordering the target — you attack via a specific stretch of your
 * territory — but the troops committed come out of one shared pool instead
 * of a garrison stationed in that specific region. Mutates the world in
 * place and returns a log of what happened so the UI can report it.
 */
export function attack(world: World, fromId: string, toId: string, nationId: NationId, fraction: number): CombatResult | null {
  if (!canAttack(world, fromId, toId, nationId)) return null;
  const to = world.regions[toId];
  const attackerNation = world.nations[nationId];
  if (!attackerNation) return null;

  const clampedFraction = Math.min(1, Math.max(0.05, fraction));
  const attackTroops = Math.max(1, Math.floor(attackerNation.troops * clampedFraction));
  const defendTroopsCommitted = getDefendingTroopsCommitted(world, to);
  const defenderNationId = to.owner;
  const defenderNation = defenderNationId !== NEUTRAL ? world.nations[defenderNationId] : null;

  const attackPower = attackTroops * (0.85 + Math.random() * 0.3);
  const defendPower = getEffectiveDefensePower(world, to) * (0.85 + Math.random() * 0.3);

  attackerNation.troops -= attackTroops;

  let captured: boolean;
  let survivors: number;

  if (attackPower > defendPower) {
    const ratio = defendPower / attackPower; // 0..1, how close the fight was
    survivors = Math.max(1, Math.round(attackTroops * (1 - ratio) * 0.8));
    // No separate garrison to leave behind anymore: the surviving attackers
    // redeploy straight back into your shared army, ready to be used again.
    attackerNation.troops += survivors;
    if (defenderNation) {
      defenderNation.troops = Math.max(0, defenderNation.troops - defendTroopsCommitted);
    }
    to.owner = nationId;
    to.troops = 0; // unused for nation-owned regions — defense is drawn from the national pool instead
    captured = true;
  } else {
    const ratio = attackPower / defendPower; // 0..1
    const defenseSurvivors = Math.max(1, Math.round(defendTroopsCommitted * (1 - ratio * 0.6)));
    if (defenderNation) {
      const losses = Math.max(0, defendTroopsCommitted - defenseSurvivors);
      defenderNation.troops = Math.max(0, defenderNation.troops - losses);
    } else {
      to.troops = defenseSurvivors;
    }
    survivors = defenseSurvivors;
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
    defendTroops: defendTroopsCommitted,
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
 * Very small rule-based AI: for the given nation, find its single best
 * attack opportunity (an adjacent region its shared army can plausibly
 * beat) and take it. If none is found, invest in whichever owned region has
 * the fewest barracks levels (spreading out its "strategic placement" the
 * same way the player has to), or once every region is fully built up,
 * reinforce a border region's fortress instead. Called periodically per
 * nation from the game loop, at most one action per call.
 */
export function runAiTurn(world: World, nationId: NationId): CombatResult | null {
  const nation = world.nations[nationId];
  if (!nation || nation.defeated || nation.isPlayer) return null;

  const ownRegions = getRegionsOwnedBy(world, nationId);
  if (ownRegions.length === 0) return null;

  const attackTroopsAvailable = nation.troops * 0.7;
  let bestAttack: { from: Region; to: Region; score: number } | null = null;

  if (attackTroopsAvailable >= AI_MIN_ATTACK_TROOPS) {
    for (const from of ownRegions) {
      for (const neighborId of from.neighbors) {
        const to = world.regions[neighborId];
        if (!to || to.owner === nationId) continue;

        const defendPower = getEffectiveDefensePower(world, to);
        if (attackTroopsAvailable < defendPower * AI_SAFETY_MARGIN) continue;

        const score = attackTroopsAvailable - defendPower;
        if (!bestAttack || score > bestAttack.score) {
          bestAttack = { from, to, score };
        }
      }
    }
  }

  if (bestAttack) {
    return attack(world, bestAttack.from.id, bestAttack.to.id, nationId, 0.7);
  }

  const belowMaxBarracks = ownRegions.filter((r) => r.buildings.barracks < MAX_BUILDING_LEVEL);
  if (belowMaxBarracks.length > 0) {
    const target = belowMaxBarracks.sort((a, b) => a.buildings.barracks - b.buildings.barracks)[0];
    upgradeBuilding(world, nationId, target.id, "barracks");
    return null;
  }

  const borderRegions = ownRegions.filter((r) => r.neighbors.some((n) => world.regions[n]?.owner !== nationId));
  const fortressCandidates = (borderRegions.length > 0 ? borderRegions : ownRegions).filter((r) => r.buildings.fortress < MAX_BUILDING_LEVEL);
  if (fortressCandidates.length > 0) {
    const target = fortressCandidates.sort((a, b) => a.buildings.fortress - b.buildings.fortress)[0];
    upgradeBuilding(world, nationId, target.id, "fortress");
  }
  return null;
}
