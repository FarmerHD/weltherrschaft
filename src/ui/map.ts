import { NEUTRAL, type World } from "../game/state";

const WIDTH = 1000;
const HEIGHT = 520;
const NEUTRAL_COLOR = "#5b6472";

export interface MapSelection {
  fromId: string | null;
  attackableIds: string[];
}

function project(lat: number, lon: number): { x: number; y: number } {
  const x = ((lon + 180) / 360) * WIDTH;
  const y = ((90 - lat) / 180) * HEIGHT;
  return { x, y };
}

function nodeRadius(troopCap: number): number {
  return 10 + troopCap / 11;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export class MapRenderer {
  private svg: SVGSVGElement;
  private nodeGroups = new Map<string, SVGGElement>();
  private circles = new Map<string, SVGCircleElement>();
  private troopLabels = new Map<string, SVGTextElement>();

  constructor(container: HTMLElement, private onRegionClick: (regionId: string) => void) {
    this.svg = document.createElementNS(SVG_NS, "svg");
    this.svg.setAttribute("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);
    this.svg.setAttribute("class", "world-map");
    container.appendChild(this.svg);
  }

  /** Builds the SVG once: adjacency lines + one interactive node per region. */
  build(world: World): void {
    this.svg.innerHTML = "";
    this.nodeGroups.clear();
    this.circles.clear();
    this.troopLabels.clear();

    const linesGroup = document.createElementNS(SVG_NS, "g");
    linesGroup.setAttribute("class", "adjacency-lines");
    this.svg.appendChild(linesGroup);

    const drawnPairs = new Set<string>();
    for (const region of Object.values(world.regions)) {
      const { x: x1, y: y1 } = project(region.lat, region.lon);
      for (const neighborId of region.neighbors) {
        const pairKey = [region.id, neighborId].sort().join("|");
        if (drawnPairs.has(pairKey)) continue;
        drawnPairs.add(pairKey);
        const neighbor = world.regions[neighborId];
        if (!neighbor) continue;
        const { x: x2, y: y2 } = project(neighbor.lat, neighbor.lon);
        const line = document.createElementNS(SVG_NS, "line");
        line.setAttribute("x1", String(x1));
        line.setAttribute("y1", String(y1));
        line.setAttribute("x2", String(x2));
        line.setAttribute("y2", String(y2));
        line.setAttribute("class", "adjacency-line");
        linesGroup.appendChild(line);
      }
    }

    const nodesGroup = document.createElementNS(SVG_NS, "g");
    nodesGroup.setAttribute("class", "region-nodes");
    this.svg.appendChild(nodesGroup);

    for (const region of Object.values(world.regions)) {
      const { x, y } = project(region.lat, region.lon);
      const g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("class", "region-node");
      g.setAttribute("transform", `translate(${x}, ${y})`);
      g.style.cursor = "pointer";
      g.addEventListener("click", () => this.onRegionClick(region.id));

      const circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("r", String(nodeRadius(region.troopCap)));
      g.appendChild(circle);

      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = region.name;
      g.appendChild(title);

      const nameLabel = document.createElementNS(SVG_NS, "text");
      nameLabel.setAttribute("class", "region-name");
      nameLabel.setAttribute("y", String(-nodeRadius(region.troopCap) - 5));
      nameLabel.textContent = region.name;
      g.appendChild(nameLabel);

      const troopLabel = document.createElementNS(SVG_NS, "text");
      troopLabel.setAttribute("class", "region-troops");
      troopLabel.setAttribute("dy", "0.35em");
      g.appendChild(troopLabel);

      nodesGroup.appendChild(g);
      this.nodeGroups.set(region.id, g);
      this.circles.set(region.id, circle);
      this.troopLabels.set(region.id, troopLabel);
    }

    this.update(world, { fromId: null, attackableIds: [] });
  }

  /** Cheap per-tick refresh: colors, troop numbers, and selection highlighting. */
  update(world: World, selection: MapSelection): void {
    for (const region of Object.values(world.regions)) {
      const circle = this.circles.get(region.id);
      const troopLabel = this.troopLabels.get(region.id);
      const g = this.nodeGroups.get(region.id);
      if (!circle || !troopLabel || !g) continue;

      const color = region.owner === NEUTRAL ? NEUTRAL_COLOR : world.nations[region.owner]?.color ?? NEUTRAL_COLOR;
      circle.setAttribute("fill", color);
      troopLabel.textContent = String(Math.floor(region.troops));

      g.classList.toggle("is-selected", region.id === selection.fromId);
      g.classList.toggle("is-attackable", selection.attackableIds.includes(region.id));
      g.classList.toggle("is-player", region.owner === "player");
    }
  }
}
