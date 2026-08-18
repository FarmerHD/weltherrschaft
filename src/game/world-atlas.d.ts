// world-atlas ships plain TopoJSON files with no bundled types. This ambient
// declaration gives the JSON import a real `Topology` type (instead of a
// giant inferred literal type, which would make `tsc` painfully slow on a
// multi-megabyte world map file) without needing a runtime cast everywhere.
declare module "world-atlas/countries-110m.json" {
  import type { Topology } from "topojson-specification";
  const topology: Topology;
  export default topology;
}
