import { select, type Selection } from "d3-selection";
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior } from "d3-zoom";
import { geoNaturalEarth1, geoPath, type GeoPath, type GeoProjection } from "d3-geo";
import type { FeatureCollection } from "geojson";
import { NEUTRAL, type World } from "../game/state";
import { COUNTRY_FEATURES, type CountryFeature } from "../game/world";
import { getEffectiveIncome } from "../game/engine";

const WIDTH = 1000;
const HEIGHT = 520;
const NEUTRAL_COLOR = "#5b6472";

export interface MapSelection {
  fromId: string | null;
  attackableIds: string[];
}

const featureCollection: FeatureCollection = { type: "FeatureCollection", features: COUNTRY_FEATURES };

// geoNaturalEarth1 gives a pleasant, low-distortion whole-world view (the
// classic "textbook" world map look) rather than Mercator's polar stretching.
const projection: GeoProjection = geoNaturalEarth1().fitSize([WIDTH, HEIGHT], featureCollection);
const pathGenerator: GeoPath = geoPath(projection);

type PathSelection = Selection<SVGPathElement, unknown, null, undefined>;

export class MapRenderer {
  private svg: Selection<SVGSVGElement, unknown, null, undefined>;
  private zoomLayer: Selection<SVGGElement, unknown, null, undefined>;
  private paths = new Map<string, PathSelection>();
  private zoomBehavior: ZoomBehavior<SVGSVGElement, unknown>;
  private tooltip: Selection<HTMLDivElement, unknown, null, undefined>;
  private currentWorld: World | null = null;
  private currentSelection: MapSelection = { fromId: null, attackableIds: [] };

  constructor(private container: HTMLElement, private onRegionClick: (regionId: string) => void) {
    this.svg = select(container)
      .append("svg")
      .attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`)
      .attr("class", "world-map");

    this.zoomLayer = this.svg.append("g").attr("class", "zoom-layer");

    this.tooltip = select(container).append("div").attr("class", "map-tooltip").style("display", "none");

    // The extent is set explicitly in viewBox units (not CSS pixels) so pan/
    // zoom math stays correct no matter how large the SVG is actually
    // rendered on screen (it's scaled responsively via the viewBox).
    this.zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 10])
      .extent([
        [0, 0],
        [WIDTH, HEIGHT],
      ])
      .translateExtent([
        [0, 0],
        [WIDTH, HEIGHT],
      ])
      .on("zoom", (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        this.zoomLayer.attr("transform", event.transform.toString());
      });

    this.svg.call(this.zoomBehavior);
  }

  /** Builds the SVG once: one clickable <path> per country, using its real geography. */
  build(world: World): void {
    this.zoomLayer.selectAll("*").remove();
    this.paths.clear();

    for (const feature of COUNTRY_FEATURES as CountryFeature[]) {
      const id = String(feature.id);
      if (!world.regions[id]) continue; // filtered out at world-gen time (e.g. Antarctica)

      const path = this.zoomLayer
        .append("path")
        .attr("d", pathGenerator(feature) ?? "")
        .attr("class", "country")
        .style("cursor", "pointer")
        .on("click", () => this.onRegionClick(id))
        .on("mouseenter", (event: MouseEvent) => this.showTooltip(event, id))
        .on("mousemove", (event: MouseEvent) => this.positionTooltip(event))
        .on("mouseleave", () => this.hideTooltip());

      this.paths.set(id, path);
    }

    this.update(world, { fromId: null, attackableIds: [] });
  }

  /** Cheap per-tick refresh: fill color + selection/attackable highlighting. */
  update(world: World, selection: MapSelection): void {
    this.currentWorld = world;
    this.currentSelection = selection;

    for (const [id, path] of this.paths) {
      const region = world.regions[id];
      if (!region) continue;

      const color = region.owner === NEUTRAL ? NEUTRAL_COLOR : (world.nations[region.owner]?.color ?? NEUTRAL_COLOR);
      path.attr("fill", color);
      path.classed("is-selected", id === selection.fromId);
      path.classed("is-attackable", selection.attackableIds.includes(id));
      path.classed("is-player", region.owner === "player");
    }
  }

  /**
   * Custom hover tooltip (replaces the old static native <title>, which only
   * ever showed the country name and never updated as troops/ownership
   * changed). Shows live troop count, owner and income — this is what lets
   * you check how strong a country you might attack is, just by hovering it,
   * without first clicking it.
   */
  private showTooltip(event: MouseEvent, id: string): void {
    const world = this.currentWorld;
    const region = world?.regions[id];
    if (!world || !region) return;

    const ownerName = region.owner === NEUTRAL ? "Neutral" : (world.nations[region.owner]?.name ?? region.owner);
    const troops = Math.floor(region.troops);
    const income = getEffectiveIncome(region).toFixed(1);
    const isAttackable = this.currentSelection.attackableIds.includes(id);

    this.tooltip.html(
      `<strong>${region.name}</strong><br>` +
        `Besitzer: ${ownerName}<br>` +
        `Truppen: ${troops}<br>` +
        `Einkommen: ${income} Gold/s` +
        (isAttackable ? `<br><span class="tooltip-hint">⚔️ angreifbar</span>` : ""),
    );
    this.positionTooltip(event);
    this.tooltip.style("display", "block");
  }

  private positionTooltip(event: MouseEvent): void {
    const rect = this.container.getBoundingClientRect();
    const x = event.clientX - rect.left + 14;
    const y = event.clientY - rect.top + 14;
    this.tooltip.style("left", `${x}px`).style("top", `${y}px`);
  }

  private hideTooltip(): void {
    this.tooltip.style("display", "none");
  }

  /** Resets pan/zoom back to the initial whole-world view. */
  resetView(): void {
    this.svg.call(this.zoomBehavior.transform, zoomIdentity);
  }
}
