import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { routeSpeedSpineManifestPath } from "@bp/analytics/artifacts";
import {
  classifyRouteSpeedSpineArtifact,
  type RouteSpeedSpineArtifact,
} from "@bp/analytics/feature-history";
import { earliestRouteSpeedSpineCoverageStart } from "../../../src/commands/studio/route-speed-spines.ts";

function artifact(input: {
  validationStatus?: RouteSpeedSpineArtifact["validation"]["status"];
  spineSegmentCount?: number;
  monthCoverage: Array<{
    coverageShare: number;
    rawSegmentKeyCount?: number;
    spineSegmentCount?: number;
  }>;
}): RouteSpeedSpineArtifact {
  const spineSegmentCount = input.spineSegmentCount ?? 8;
  const monthsWithPartialSpineCoverageCount = input.monthCoverage.filter(
    (row) => row.coverageShare < 1,
  ).length;
  const monthsWithRawKeyDriftCount = input.monthCoverage.filter(
    (row) =>
      (row.rawSegmentKeyCount ?? spineSegmentCount) !==
      (row.spineSegmentCount ?? spineSegmentCount),
  ).length;
  return {
    artifactKind: "studio_route_speed_spine",
    schemaVersion: 1,
    generatedAt: "2026-06-06T00:00:00.000Z",
    routeId: "B41",
    routeSlug: "b41",
    source: {
      table: "local_route_segment_speed",
      dbPath: "data/local/pipeline.sqlite",
      startMonth: "2023-04",
      endMonth: "2026-03",
      toleranceMeters: 110,
      artifactPath: "data/artifacts/studio/v2/routes/b41/speed-spine.json",
    },
    summary: {
      monthCount: input.monthCoverage.length,
      sourceRowCount: 100,
      busTripCount: 1000,
      nodeCount: 5,
      spineSegmentCount,
      rawSegmentKeyCount: spineSegmentCount,
      rawStopPairCount: spineSegmentCount,
      monthsWithRawKeyDriftCount,
      monthsWithPartialSpineCoverageCount,
      mergedNodeCount: 0,
      segmentWithRawVariantCount: 0,
      issueCount: input.validationStatus === "fail" ? 1 : 0,
    },
    nodes: [],
    segments: [],
    monthCoverage: input.monthCoverage.map((row, index) => ({
      month: `2026-${String(index + 1).padStart(2, "0")}`,
      sourceRowCount: 10,
      busTripCount: 100,
      rawSegmentKeyCount: row.rawSegmentKeyCount ?? spineSegmentCount,
      rawStopPairCount: row.spineSegmentCount ?? spineSegmentCount,
      spineSegmentCount: row.spineSegmentCount ?? spineSegmentCount,
      coverageShare: row.coverageShare,
    })),
    validation: {
      status: input.validationStatus ?? "pass",
      issues:
        input.validationStatus === "fail"
          ? [{ severity: "error", code: "fixture", message: "fixture" }]
          : [],
    },
  };
}

describe("studio route speed spines manifest", () => {
  test("derives the earliest observed coverage month and preserves unknown empty evidence", () => {
    expect(
      earliestRouteSpeedSpineCoverageStart([
        { startMonth: "2024-02" },
        { startMonth: "2023-04" },
        { startMonth: "2025-01" },
      ]),
    ).toBe("2023-04");
    expect(earliestRouteSpeedSpineCoverageStart([])).toBeNull();
  });

  test("classifies fully covered routes as series-ready", () => {
    const audit = classifyRouteSpeedSpineArtifact(
      artifact({ monthCoverage: Array.from({ length: 4 }, () => ({ coverageShare: 1 })) }),
    );

    expect(audit.readiness).toBe("series_ready");
    expect(audit.reasons).toContain("full_spine_coverage_all_months");
    expect(audit.coverage.partialCoverageMonthCount).toBe(0);
  });

  test("allows sparse but bounded gaps for first-pass series use", () => {
    const audit = classifyRouteSpeedSpineArtifact(
      artifact({
        monthCoverage: [
          ...Array.from({ length: 8 }, () => ({ coverageShare: 1 })),
          { coverageShare: 0.875 },
          { coverageShare: 0.875 },
        ],
      }),
    );

    expect(audit.readiness).toBe("series_ready_with_gaps");
    expect(audit.reasons).toContain("partial_months_within_gap_tolerance");
    expect(audit.coverage.partialCoverageMonthShare).toBe(0.2);
  });

  test("requires pattern review when partial coverage dominates the route history", () => {
    const audit = classifyRouteSpeedSpineArtifact(
      artifact({
        monthCoverage: Array.from({ length: 6 }, () => ({
          coverageShare: 0.5,
          rawSegmentKeyCount: 12,
          spineSegmentCount: 6,
        })),
      }),
    );

    expect(audit.readiness).toBe("needs_pattern_review");
    expect(audit.reasons).toContain("low_monthly_spine_coverage");
    expect(audit.reasons).toContain("partial_months_require_pattern_grouping");
  });

  test("fails routes with invalid spine artifacts", () => {
    const audit = classifyRouteSpeedSpineArtifact(
      artifact({ validationStatus: "fail", spineSegmentCount: 0, monthCoverage: [] }),
    );

    expect(audit.readiness).toBe("failed");
    expect(audit.reasons).toContain("validation_failed");
    expect(audit.reasons).toContain("no_spine_segments");
  });

  test("uses the Studio v2 speed-spines manifest namespace", () => {
    expect(
      routeSpeedSpineManifestPath({
        artifactRoot: "data/artifacts",
        startMonth: "2023-04",
        endMonth: "2026-03",
      }),
    ).toBe("data/artifacts/studio/v2/speed-spines/2023-04_to_2026-03/manifest.json");
  });

  test("keeps manifest readiness policy and candidate SQL out of the command", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../../src/commands/studio/route-speed-spines.ts"),
      "utf8",
    );

    expect(source).toContain('from "@bp/analytics/artifacts"');
    expect(source).toContain('from "@bp/analytics/feature-history"');
    expect(source).toContain('from "@bp/pipeline-v2/local-db-aggregates"');
    expect(source).not.toContain("function classifyRouteSpeedSpineArtifact");
    expect(source).not.toContain("function queryRouteSpeedSpineCandidates");
    expect(source).not.toContain("function queryCurrentCatalogRouteIds");
    expect(source).not.toContain("FROM local_route_segment_speed");
    expect(source).not.toContain("FROM local_route_catalog");
  });
});
