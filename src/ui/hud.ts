import { NEUTRAL, type NationId, type Region, type World } from "../game/state";
import {
  BUILDING_CONFIG,
  MAX_BUILDING_LEVEL,
  buildingCost,
  getEffectiveDefensePower,
  getEffectiveIncome,
  getNationIncome,
  getNationTrainingRatePerSecond,
  getNationTroopCap,
  getRegionsOwnedBy,
} from "../game/engine";
import { TOTAL_REGION_COUNT } from "../game/world";

export interface SelectionState {
  fromId: string | null;
  toId: string | null;
  attackFraction: number;
  lastMessage: string | null;
}

function fmt(n: number): string {
  return Math.floor(n).toLocaleString("de-DE");
}

export function renderResourceBar(el: HTMLElement, world: World): void {
  const player = world.nations["player"];
  const playerRegions = getRegionsOwnedBy(world, "player");
  const totalIncome = getNationIncome(world, "player");
  const troopCap = getNationTroopCap(world, "player");
  const trainingRate = getNationTrainingRatePerSecond(world, "player");
  const worldShare = ((playerRegions.length / TOTAL_REGION_COUNT) * 100).toFixed(1);

  el.innerHTML = `
    <span class="res">💰 ${fmt(player?.gold ?? 0)} Gold <small>(+${totalIncome.toFixed(1)}/s)</small></span>
    <span class="res">⚔️ ${fmt(player?.troops ?? 0)} / ${fmt(troopCap)} Truppen <small>(+${(trainingRate * 60).toFixed(1)}/Min)</small></span>
    <span class="res">🗺️ ${playerRegions.length} / ${TOTAL_REGION_COUNT} Länder <small>(${worldShare}%)</small></span>
  `;
}

export function renderNationList(el: HTMLElement, world: World): void {
  const rows = Object.values(world.nations)
    .map((nation) => ({ nation, count: Object.values(world.regions).filter((r) => r.owner === nation.id).length }))
    .sort((a, b) => b.count - a.count)
    .map(({ nation, count }) => {
      const statusClass = nation.defeated ? "defeated" : "";
      return `
        <div class="nation-row ${statusClass}">
          <span class="swatch" style="background:${nation.color}"></span>
          <span class="nation-name">${nation.name}</span>
          <span class="nation-count">${count}${nation.defeated ? " (besiegt)" : ""}</span>
        </div>`;
    })
    .join("");
  el.innerHTML = `<h3>Nationen</h3>${rows}`;
}

export function renderSelection(el: HTMLElement, actionEl: HTMLElement, world: World, selection: SelectionState): void {
  if (selection.lastMessage) {
    const msg = document.createElement("p");
    msg.className = "combat-log";
    msg.textContent = selection.lastMessage;
    el.innerHTML = "";
    el.appendChild(msg);
  } else {
    el.innerHTML = "";
  }

  if (!selection.fromId) {
    el.innerHTML += `<p class="hint">Klicke auf ein Land, um es auszuwählen — eigene Länder zeigen Ausbau-Optionen, fremde angrenzende Länder können angegriffen werden.</p>`;
    actionEl.innerHTML = "";
    return;
  }

  const from = world.regions[selection.fromId];
  if (!from) {
    actionEl.innerHTML = "";
    return;
  }
  const fromOwnerName = ownerName(world, from.owner);
  const defensePower = Math.round(getEffectiveDefensePower(world, from));
  el.innerHTML += `
    <div class="region-detail">
      <h3>${from.name}</h3>
      <p>Besitzer: <strong>${fromOwnerName}</strong></p>
      <p>Einkommen: <strong>${getEffectiveIncome(from).toFixed(1)}</strong> Gold/s</p>
      <p>Geschätzte Verteidigung hier: <strong>~${fmt(defensePower)}</strong> Truppen</p>
    </div>
  `;

  let actionsHtml = "";

  if (from.owner === "player") {
    const player = world.nations["player"];
    actionsHtml += `
      <div class="action-group">
        <h4>Infrastruktur</h4>
        ${renderBuildingRows(from, player?.gold ?? 0)}
      </div>
    `;
  }

  if (selection.toId) {
    const to = world.regions[selection.toId];
    if (to) {
      const toOwnerName = ownerName(world, to.owner);
      const toDefensePower = Math.round(getEffectiveDefensePower(world, to));
      actionsHtml += `
        <div class="action-group attack-group">
          <h4>Angriff auf ${to.name} (${toOwnerName}, ~${fmt(toDefensePower)} Truppen Verteidigung)</h4>
          <label>
            Einsatz: <span id="attack-fraction-label">${selection.attackFraction}%</span>
            <input type="range" id="attack-fraction" min="10" max="100" step="5" value="${selection.attackFraction}" data-action="set-fraction" />
          </label>
          <div id="attack-estimate">${buildAttackEstimateHtml(world, from.owner, to, selection.attackFraction)}</div>
          <button data-action="attack" class="attack-btn">⚔️ Angriff starten</button>
        </div>
      `;
    }
  } else if (from.owner === "player") {
    actionsHtml += `<p class="hint">Klicke ein angrenzendes, nicht eigenes Land an, um es anzugreifen.</p>`;
  }

  actionEl.innerHTML = actionsHtml;
}

/**
 * Rough attack-odds estimate shown in the attack panel: attacker troops
 * (the current slider % of the attacker's whole shared army) vs. the
 * defender's effective defense power (troops × neutral/fortress bonuses).
 * The real combat roll uses a random ±15% swing on both sides, so this
 * ratio is a good average-case indicator, not an exact guarantee.
 */
function buildAttackEstimateHtml(world: World, attackerNationId: NationId, to: Region, attackFraction: number): string {
  const attackerNation = world.nations[attackerNationId];
  const attackTroops = Math.max(1, Math.floor((attackerNation?.troops ?? 0) * (attackFraction / 100)));
  const defensePower = getEffectiveDefensePower(world, to);
  const ratio = defensePower > 0 ? attackTroops / defensePower : Infinity;

  let label: string;
  let cls: string;
  if (ratio >= 1.3) {
    label = "Gute Chancen ✅";
    cls = "est-good";
  } else if (ratio >= 0.9) {
    label = "Knapp — Ausgang ungewiss ⚠️";
    cls = "est-risky";
  } else {
    label = "Schlechte Chancen ❌";
    cls = "est-bad";
  }

  return `<p class="attack-estimate ${cls}">Deine Angriffsstärke: ${fmt(attackTroops)} · Verteidigung: ${fmt(defensePower)}<br>${label}</p>`;
}

/**
 * Lightweight update for just the attack-odds line, called while the user
 * drags the attack-fraction slider. Deliberately does NOT touch innerHTML of
 * the whole selection panel — that would recreate the <input type="range">
 * mid-drag and break the gesture the user is currently performing.
 */
export function updateAttackEstimate(world: World, selection: SelectionState): void {
  if (!selection.fromId || !selection.toId) return;
  const from = world.regions[selection.fromId];
  const to = world.regions[selection.toId];
  const el = document.getElementById("attack-estimate");
  if (!from || !to || !el) return;
  el.innerHTML = buildAttackEstimateHtml(world, from.owner, to, selection.attackFraction);
}

function renderBuildingRows(region: World["regions"][string], gold: number): string {
  return (Object.keys(BUILDING_CONFIG) as Array<keyof typeof BUILDING_CONFIG>)
    .map((type) => {
      const config = BUILDING_CONFIG[type];
      const level = region.buildings[type];
      const maxed = level >= MAX_BUILDING_LEVEL;
      const cost = buildingCost(type, level);
      const canAfford = gold >= cost;
      const dots = Array.from({ length: MAX_BUILDING_LEVEL }, (_, i) => (i < level ? "●" : "○")).join("");

      return `
        <div class="building-row">
          <div class="building-info">
            <span class="building-name">${config.name}</span>
            <span class="building-level" title="Stufe ${level}/${MAX_BUILDING_LEVEL}">${dots}</span>
          </div>
          <div class="building-desc">${config.description}</div>
          <button
            data-action="upgrade-building"
            data-building="${type}"
            ${maxed || !canAfford ? "disabled" : ""}
          >${maxed ? "Maximal ausgebaut" : `Ausbauen (${cost} Gold)`}</button>
        </div>
      `;
    })
    .join("");
}

function ownerName(world: World, owner: NationId): string {
  if (owner === NEUTRAL) return "Neutral";
  return world.nations[owner]?.name ?? owner;
}

export function renderOverlay(el: HTMLElement, world: World): void {
  if (world.status === "playing") {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  el.classList.remove("hidden");
  const playerRegions = Object.values(world.regions).filter((r) => r.owner === "player").length;
  if (world.status === "victory") {
    el.innerHTML = `
      <div class="overlay-card">
        <h2>🏆 Weltherrschaft erreicht!</h2>
        <p>Du kontrollierst ${playerRegions} von ${TOTAL_REGION_COUNT} Ländern.</p>
        <button data-action="restart">Neues Spiel</button>
      </div>`;
  } else {
    el.innerHTML = `
      <div class="overlay-card">
        <h2>💀 Dein Reich ist gefallen</h2>
        <p>Alle deine Länder wurden erobert.</p>
        <button data-action="restart">Neu versuchen</button>
      </div>`;
  }
}
