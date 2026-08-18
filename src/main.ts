import "./style.css";
import { type World, loadGame, saveGame, clearSave, offlineSecondsSince } from "./game/state";
import { createInitialWorld } from "./game/world";
import { tickResources, checkVictoryDefeat, runAiTurn, attack, attackableTargets, upgradeBuilding } from "./game/engine";
import { MapRenderer } from "./ui/map";
import {
  renderResourceBar,
  renderNationList,
  renderSelection,
  renderOverlay,
  updateAttackEstimate,
  type SelectionState,
} from "./ui/hud";

const AI_ACTION_INTERVAL_TICKS = 3;
const AUTOSAVE_INTERVAL_TICKS = 15;

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} nicht gefunden`);
  return el;
}

const resourceBarEl = $("resource-bar");
const mapContainerEl = $("map-container");
const selectionInfoEl = $("selection-info");
const actionPanelEl = $("action-panel");
const nationListEl = $("nation-list");
const overlayEl = $("overlay");
const saveStatusEl = $("save-status");

let world: World;
// Default to committing half of a region's troops to an attack, not more —
// overcommitting your only border region is how new players get wiped out
// by an immediate AI counter-attack.
const selection: SelectionState = { fromId: null, toId: null, attackFraction: 50, lastMessage: null };

const saved = loadGame();
if (saved) {
  world = saved.world;
  const offlineSeconds = offlineSecondsSince(saved.savedAt);
  if (offlineSeconds > 5) {
    tickResources(world, offlineSeconds);
    checkVictoryDefeat(world);
    const minutes = Math.floor(offlineSeconds / 60);
    selection.lastMessage =
      minutes > 0
        ? `Willkommen zurück! Während du weg warst (${minutes} Min.) haben deine Länder weiter produziert.`
        : "Willkommen zurück!";
  }
} else {
  world = createInitialWorld();
}

const mapRenderer = new MapRenderer(mapContainerEl, handleRegionClick);
mapRenderer.build(world);

function render(): void {
  renderResourceBar(resourceBarEl, world);
  renderNationList(nationListEl, world);
  renderSelection(selectionInfoEl, actionPanelEl, world, selection);
  renderOverlay(overlayEl, world);
  const attackable = selection.fromId ? attackableTargets(world, selection.fromId, "player") : [];
  mapRenderer.update(world, { fromId: selection.fromId, attackableIds: attackable });
}

function handleRegionClick(regionId: string): void {
  const region = world.regions[regionId];
  if (!region || world.status !== "playing") return;

  if (region.owner === "player") {
    selection.fromId = selection.fromId === regionId ? null : regionId;
    selection.toId = null;
  } else if (selection.fromId) {
    const from = world.regions[selection.fromId];
    selection.toId = from && from.neighbors.includes(regionId) ? regionId : null;
  }
  selection.lastMessage = null;
  render();
}

// Reset needs care: location.reload() itself fires `beforeunload`, and the
// autosave listener there used to unconditionally re-save the (just
// cleared) game — silently undoing the reset. This flag makes reset win.
let isResetting = false;

function resetGame(): void {
  if (!confirm("Aktuellen Spielstand löschen und neu starten?")) return;
  isResetting = true;
  clearSave();
  location.reload();
}

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const actionEl = target.closest<HTMLElement>("[data-action]");
  if (!actionEl) return;
  const action = actionEl.dataset.action;

  if (action === "upgrade-building" && selection.fromId) {
    const buildingType = actionEl.dataset.building as "economy" | "barracks" | "fortress" | undefined;
    if (buildingType) {
      const upgraded = upgradeBuilding(world, "player", selection.fromId, buildingType);
      selection.lastMessage = upgraded ? "Gebäude ausgebaut." : "Ausbau nicht möglich (Gold oder Maxstufe).";
      render();
    }
  } else if (action === "attack" && selection.fromId && selection.toId) {
    const result = attack(world, selection.fromId, selection.toId, "player", selection.attackFraction / 100);
    if (result) {
      const toName = world.regions[selection.toId]?.name ?? selection.toId;
      selection.lastMessage = result.captured
        ? `Sieg! ${toName} erobert (${result.survivors} Truppen stehen dort jetzt).`
        : `Angriff auf ${toName} zurückgeschlagen. Verteidiger hat noch ${result.survivors} Truppen.`;
    }
    selection.toId = null;
    render();
  } else if (action === "restart") {
    resetGame();
  }
});

document.addEventListener("input", (event) => {
  const target = event.target as HTMLInputElement;
  if (target.id === "attack-fraction") {
    selection.attackFraction = Number(target.value);
    const label = document.getElementById("attack-fraction-label");
    if (label) label.textContent = `${selection.attackFraction}%`;
    updateAttackEstimate(world, selection);
  }
});

$("save-btn").addEventListener("click", () => {
  saveGame(world);
  saveStatusEl.textContent = `Gespeichert um ${new Date().toLocaleTimeString("de-DE")}`;
});

$("reset-btn").addEventListener("click", resetGame);

setInterval(() => {
  if (world.status === "playing") {
    tickResources(world, 1);
    if (world.tick % AI_ACTION_INTERVAL_TICKS === 0) {
      for (const nationId of Object.keys(world.nations)) {
        if (nationId !== "player") runAiTurn(world, nationId);
      }
    }
    checkVictoryDefeat(world);
    if (world.tick % AUTOSAVE_INTERVAL_TICKS === 0) {
      saveGame(world);
      saveStatusEl.textContent = `Automatisch gespeichert um ${new Date().toLocaleTimeString("de-DE")}`;
    }
  }
  render();
}, 1000);

window.addEventListener("beforeunload", () => {
  if (!isResetting) saveGame(world);
});

render();
