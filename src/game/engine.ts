import { NEUTRAL, type NationId, type Region, type World } from "./state";
import { NEUTRAL_DEFENSE_BONUS, TOTAL_REGION_COUNT } from "./world";

/** Gold cost to buy a single troop via reinforcement. */
export const TROOP_GOLD_COST = 4;
/** Seconds of passive regeneration needed to go from 0 troops to a region's cap. */
const REGEN_TIME_TO_FULL_SECONDS = 240;
/** Fraction of total regions the player must control to win. */
const VICTORY_FRACTION = 0.6;
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

function regionDefensePower(region: Region): number {
  const bonus = region.owner === NEUTRAL ? NEUTRAL_DEFENSE_BONUS : 1;
  return region.troops * bonus;
}

/** Advances gold and passive troop regeneration for every region/nation by `deltaSeconds`. */
export function tickResources(world: World, deltaSeconds: number): void {
  if (deltaSeconds <= 0) return;
  for (const region of Object.values(world.regions)) {
    if (region.owner === NEUTRAL) continue;
    const nation = world.nations[region.owner];
    if (!nation || nation.defeated) continue;

    nation.gold += region.income * deltaSeconds;

    if (region.troops < region.troopCap) {
      const regenPerSecond = region.troopCap / REGEN_TIME_TO_FULL_SECONDS;
      region.troops = Math.min(region.troopCap, region.troops + regenPerSecond * deltaSeconds);
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

/** Spends up to `goldAmount` gold buying troops into `regionId` for `nationId`. Returns troops actually bought. */
export function reinforceRegion(world: World, nationId: NationId, regionId: string, goldAmount: number): number {
  const region = world.regions[regionId];
  const nation = world.nations[nationId];
  if (!region || !nation || region.owner !== nationId) return 0;

  const affordableGold = Math.max(0, Math.min(goldAmount, nation.gold));
  const troopsBought = Math.floor(affordableGold / TROOP_GOLD_COST);
  if (troopsBought <= 0) return 0;

  nation.gold -= troopsBought * TROOP_GOLD_COST;
  region.troops += troopsBought;
  return troopsBought;
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
 * is found, reinforce its weakest border region instead. Called periodically
 * per-nation from the game loop, at most one action per call.
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

  // No good attack available: reinforce the border region with the weakest garrison.
  const borderRegions = ownRegions.filter((r) => r.neighbors.some((n) => world.regions[n]?.owner !== nationId));
  const weakest = (borderRegions.length > 0 ? borderRegions : ownRegions).sort((a, b) => a.troops - b.troops)[0];
  if (weakest && nation.gold >= TROOP_GOLD_COST) {
    reinforceRegion(world, nationId, weakest.id, nation.gold * 0.5);
  }
  return null;
}
