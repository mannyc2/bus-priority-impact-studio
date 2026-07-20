import { describe, expect, test } from "bun:test";
import {
  buildCommandRegistrySnapshot,
  discoverCommandDescriptors,
  optionNames,
} from "../../src/cli/registry.ts";

const expectedRegistry = {
  audit: [
    "data-product-completeness",
    "freshness",
    "map-artifacts",
    "raw-snapshot-coverage",
    "route-schedule-progress",
    "route-source-reconciliation",
    "source-coverage",
    "studio-coverage",
  ],
  backfill: ["bus-observatory-range", "route-ridership-trends", "socrata-range"],
  build: [
    "context-event-route-touches",
    "context-events",
    "express-bus-capacity-context",
    "express-route-analysis",
    "lion-geometry-index",
    "observed-headways",
    "parking-violation-matches",
    "route-hourly-profile",
    "route-lion-link",
    "route-month-speed-golden-diff",
    "route-shape-geometry-index",
    "segment-daypart-history",
    "segment-daypart-panel",
    "stop-direction-hour-ewt-features",
  ],
  check: [
    "bus-observatory-gtfs-rt",
    "bus-observatory-gtfs-rt-range",
    "route-speed-availability",
    "spatialite",
  ],
  cloudflare: ["cost-plan"],
  collect: ["gtfs-rt"],
  corridor: ["model"],
  export: ["d1", "route-speed-history-coverage-index"],
  geocode: [
    "311",
    "nypd-collisions",
    "parking-violations",
    "permits",
    "traffic-speeds",
    "traffic-volumes",
  ],
  "gtfs-rt": ["preflight", "run-status"],
  import: [
    "bus-observatory-gtfs-rt",
    "bus-observatory-headway-samples",
    "bus-observatory-reliability-summary",
    "gtfs-rt-r2-manifests",
  ],
  ingest: [
    "311-service-requests",
    "ace-routes",
    "ace-violations",
    "bus-customer-journey-metrics",
    "bus-lanes",
    "bus-wait-assessment",
    "dot-street-permits",
    "dot-traffic-speeds",
    "dot-traffic-speeds-history",
    "dot-traffic-volumes",
    "equity-context",
    "express-bus-capacity",
    "gtfs-rt-snapshots",
    "gtfs-static",
    "lion-centerline",
    "noaa-weather",
    "nypd-collisions",
    "parking-violations",
    "route-catalog",
    "route-coverage",
    "route-hourly-ridership",
    "route-schedules",
    "route-schedules-bulk",
    "route-segment-speeds",
    "route-trends",
    "socrata-csv-snapshot",
    "socrata-partitioned-csv-snapshot",
  ],
  map: ["artifacts", "context", "release"],
  plan: ["source-refresh"],
  publish: ["r2-artifacts"],
  pull: ["gtfs-rt-r2-run"],
  route: [
    "brief-model",
    "build-plan",
    "equity-context",
    "intervention-evaluation",
    "observed-reliability",
    "readiness",
    "reliability-baseline",
  ],
  sources: ["catalog-search", "list", "probe", "soda3-range-probe"],
  study: ["merge-events", "prepare-review-worksheet", "run"],
  studio: [
    "build-mta-wiki-route-fixture",
    "export-intervention-corpus",
    "import-mta-wiki-operational-anchors",
    "import-mta-wiki-operational-occurrences",
    "import-mta-wiki-route-evidence",
    "release",
    "route-speed-histories",
    "route-speed-history",
    "route-speed-spine",
    "route-speed-spines",
    "route-treatment-summary",
  ],
  verify: ["d1"],
};

describe("Effect CLI registry", () => {
  test("loads every pipeline command descriptor loudly", async () => {
    const commands = await discoverCommandDescriptors();
    expect(commands).toHaveLength(105);
    expect(buildCommandRegistrySnapshot(commands)).toEqual(expectedRegistry);
  });

  test("preserves route readiness option names", async () => {
    const commands = await discoverCommandDescriptors();
    const readiness = commands.find((command) => command.path.join(" ") === "route readiness");
    if (!readiness) throw new Error("Missing route readiness command");
    expect(optionNames(readiness)).toEqual(["db", "month", "year"]);
  });
});
