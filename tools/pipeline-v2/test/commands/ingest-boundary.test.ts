import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const localDbIngestCommandFiles = [
  "311-service-requests.ts",
  "ace-routes.ts",
  "ace-violations.ts",
  "bus-customer-journey-metrics.ts",
  "bus-lanes.ts",
  "bus-wait-assessment.ts",
  "dot-street-permits.ts",
  "dot-traffic-speeds.ts",
  "dot-traffic-volumes.ts",
  "equity-context.ts",
  "gtfs-rt-snapshots.ts",
  "gtfs-static.ts",
  "lion-centerline.ts",
  "noaa-weather.ts",
  "nypd-collisions.ts",
  "parking-violations.ts",
  "route-catalog.ts",
  "route-coverage.ts",
  "route-hourly-ridership.ts",
  "route-segment-speeds.ts",
  "route-schedules-bulk.ts",
  "route-schedules.ts",
  "route-trends.ts",
];

describe("ingest command boundaries", () => {
  test("use the Effect local DB boundary instead of Liche local DB middleware", () => {
    const helperSource = readFileSync(
      join(import.meta.dir, "../../src/commands/ingest/_define-ingest-command.ts"),
      "utf8",
    );
    expect(helperSource).toContain("runLocalDbCommandBoundary({");
    expect(helperSource).toContain("input.options.db");

    for (const file of localDbIngestCommandFiles) {
      const source = readFileSync(join(import.meta.dir, "../../src/commands/ingest", file), "utf8");

      expect(
        source.includes("runLocalDbCommandBoundary({") || source.includes("defineIngestCommand({"),
      ).toBe(true);
      expect(source).not.toContain("withLocalDb");
      expect(source).not.toContain("localDbFromCtx");
    }
  });
});
