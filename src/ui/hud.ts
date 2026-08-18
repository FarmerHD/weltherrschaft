import { NEUTRAL, type NationId, type World } from "../game/state";
import { TROOP_GOLD_COST } from "../game/engine";
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
  const playerRegions = Object.values(world.regions).filter((r) => r.owner === "player");
  const totalTroops = playerRegions.reduce((sum, r) => sum + r.troops, 0);
  const totalIncome = playerRegions.reduce((sum, r) => sum + r.income, 0);

  el.innerHTML = `
    <span class="res">💰 ${fmt(player?.gold ?? 0)} Gold <small>(+${totalIncome.toFixed(1)}/s)</small></span>
    <span class="res">⚔️ ${fmt(totalTroops)} Truppen</span>
    <span class="res">🗺️ ${playerRegions.length} / ${TOTAL_REGION_COUNT} Regionen</span>
  `;
}

export function renderNationList(el: HTMLElement, world: World): void {
  const rows = Object.values(world.nations)
    .map((nation) => {
      const count = Object.values(world.regions).filter((r) => r.owner === nation.id).length;
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
    el.innerHTML += `<p class="hint">Klicke auf eine deiner Regionen, um Truppen zu verschieben oder anzugreifen.</p>`;
    actionEl.innerHTML = "";
    return;
  }

  const from = world.regions[selection.fromId];
  if (!from) {
    actionEl.innerHTML = "";
    return;
  }
  const fromOwnerName = ownerName(world, from.owner);
  el.innerHTML += `
    <div class="region-detail">
      <h3>${from.name}</h3>
      <p>Besitzer: <strong>${fromOwnerName}</strong></p>
      <p>Truppen: <strong>${fmt(from.troops)}</strong> / Kapazität ${fmt(from.troopCap)}</p>
      <p>Einkommen: <strong>${from.income.toFixed(1)}</strong> Gold/s</p>
    </div>
  `;

  let actionsHtml = "";

  if (from.owner === "player") {
    const player = world.nations["player"];
    actionsHtml += `
      <div class="action-group">
        <h4>Truppen kaufen (${TROOP_GOLD_COST} Gold/Truppe)</h4>
        <button data-action="buy" data-amount="20">+5 (20 Gold)</button>
        <button data-action="buy" data-amount="80">+20 (80 Gold)</button>
        <button data-action="buy" data-amount="${Math.floor((player?.gold ?? 0))}">Alles Gold ausgeben</button>
      </div>
    `;
  }

  if (selection.toId) {
    const to = world.regions[selection.toId];
    if (to) {
      const toOwnerName = ownerName(world, to.owner);
      actionsHtml += `
        <div class="action-group attack-group">
          <h4>Angriff auf ${to.name} (${toOwnerName}, ${fmt(to.troops)} Truppen)</h4>
          <label>
            Einsatz: <span id="attack-fraction-label">${selection.attackFraction}%</span>
            <input type="range" id="attack-fraction" min="10" max="100" step="5" value="${selection.attackFraction}" data-action="set-fraction" />
          </label>
          <button data-action="attack" class="attack-btn">⚔️ Angriff starten</button>
        </div>
      `;
    }
  } else if (from.owner === "player") {
    actionsHtml += `<p class="hint">Klicke eine angrenzende, nicht eigene Region an, um sie anzugreifen.</p>`;
  }

  actionEl.innerHTML = actionsHtml;
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
        <p>Du kontrollierst ${playerRegions} von ${TOTAL_REGION_COUNT} Regionen.</p>
        <button data-action="restart">Neues Spiel</button>
      </div>`;
  } else {
    el.innerHTML = `
      <div class="overlay-card">
        <h2>💀 Dein Reich ist gefallen</h2>
        <p>Alle deine Regionen wurden erobert.</p>
        <button data-action="restart">Neu versuchen</button>
      </div>`;
  }
}
