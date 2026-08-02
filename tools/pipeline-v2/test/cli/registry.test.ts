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
    "freshness-alarm",
    "map-artifacts",
    "plan097-readiness",
    "raw-snapshot-coverage",
    "route-schedule-progress",
    "route-source-reconciliation",
    "source-coverage",
    "studio-coverage",
  ],
  backfill: ["bus-observatory-range", "route-ridership-trends", "socrata-range"],
  build: [
    "express-bus-capacity-context",
    "express-route-analysis",
    "lion-geometry-index",
    "observed-headways",
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
  publish: ["r2-artifacts", "recovery", "serving-release"],
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
  study: [
    "merge-events",
    "migrate-member-scope-bindings",
    "prepare-review-worksheet",
    "refresh-scope-bindings",
    "run",
    "snapshot-review-inputs",
  ],
  studio: [
    "build-mta-wiki-route-fixture",
    "export-intervention-corpus",
    "export-intervention-observations",
    "export-route-intervention-inventory",
    "import-mta-wiki-member-extents",
    "import-mta-wiki-operational-anchors",
    "import-mta-wiki-operational-occurrences",
    "import-mta-wiki-route-evidence",
    "public-intervention-episodes",
    "release",
    "route-speed-histories",
    "route-speed-history",
    "route-speed-spine",
    "route-speed-spines",
  ],
  verify: ["d1"],
};

describe("Effect CLI registry", () => {
  test("loads every pipeline command descriptor loudly", async () => {
    const commands = await discoverCommandDescriptors();
    expect(commands).toHaveLength(106);
    expect(buildCommandRegistrySnapshot(commands)).toEqual(expectedRegistry);
  });

  test("preserves route readiness option names", async () => {
    const commands = await discoverCommandDescriptors();
    const readiness = commands.find((command) => command.path.join(" ") === "route readiness");
    if (!readiness) throw new Error("Missing route readiness command");
    expect(optionNames(readiness)).toEqual(["db", "month", "year"]);
  });
});
