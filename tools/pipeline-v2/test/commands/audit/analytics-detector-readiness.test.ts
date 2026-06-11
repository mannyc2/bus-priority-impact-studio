import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const COMMAND_PATH = new URL(
  "../../../src/commands/audit/analytics-detector-readiness.ts",
  import.meta.url,
);

describe("analytics detector readiness audit boundary", () => {
  it("keeps detector policy logic and direct surface SQL in applied-research", () => {
    const source = readFileSync(COMMAND_PATH, "utf8");

    expect(source).toContain('from "@bp/applied-research/evaluation"');
    expect(source).toContain('from "@bp/applied-research/local-db"');
    expect(source).toContain("buildAnalyticsDetectorReadinessAudit({");
    expect(source).toContain("loadAnalyticsDetectorReadinessDirectSurfaceCoverage({");
    expect(source).not.toContain("@bp/analytics/calibration");
    expect(source).not.toContain("@bp/analytics/registry");
    expect(source).not.toContain("listDetectorCalibrationPolicies");
    expect(source).not.toContain("listAnalyticsDetectors");
    expect(source).not.toContain("local_route_observed_reliability_summary");
    expect(source).not.toContain("local_route_schedule_stop");
  });
});
