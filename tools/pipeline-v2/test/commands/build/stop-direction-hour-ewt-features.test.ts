import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const COMMAND_PATH = new URL(
  "../../../src/commands/build/stop-direction-hour-ewt-features.ts",
  import.meta.url,
);

describe("build stop-direction-hour-ewt-features boundary", () => {
  test("keeps schedule and observed-headway row loading in pipeline-local aggregates", () => {
    const source = readFileSync(COMMAND_PATH, "utf8");

    expect(source).toContain('from "@bp/analytics/artifacts"');
    expect(source).toContain('from "@bp/pipeline-v2/local-db-aggregates"');
    expect(source).toContain("runLocalDbCommandBoundary({");
    expect(source).toContain("localDbOptions: { readonly: true }");
    expect(source).toContain("buildStopDirectionHourEwtFeatureArtifactFromDb({");
    expect(source).toContain("stopDirectionHourEwtFeatureArtifactPath({");
    expect(source).not.toContain('from "bun:sqlite"');
    expect(source).not.toContain("new BunDatabase");
    expect(source).not.toContain("local_route_schedule_timepoint");
    expect(source).not.toContain("local_gtfs_static_stop_time");
    expect(source).not.toContain("local_observed_headway_sample");
    expect(source).not.toContain("function selectScheduleSource");
    expect(source).not.toContain("function buildGtfsServiceDateMap");
  });
});
