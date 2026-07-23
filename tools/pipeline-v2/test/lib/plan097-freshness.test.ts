import { describe, expect, test } from "bun:test";
import type { RouteSpeedAvailabilityResult } from "@bp/analytics/evaluation";
import type { FreshnessLedger } from "../../src/lib/freshness-ledger.ts";
import {
  buildPlan097FreshnessMatrix,
  latestClosedUpstreamMonth,
  type Plan097FreshnessEvidence,
} from "../../src/lib/plan097-freshness.ts";

const checkedAt = "2026-07-23T00:00:00.000Z";
const sourceRows = [
  ["bus_segment_speeds_2025", "2026-05", "2026-05"],
  ["bus_hourly_ridership_2025", "2026-07", "2026-06"],
  ["bus_wait_assessment", "2026-05", "2026-05"],
  ["ace_violations", "2026-06", "2026-06"],
  ["bus_time_gtfsrt_vehicle_positions", null, "2026-07-22"],
] as const;

function ledger(): FreshnessLedger {
  return {
    artifactKind: "freshness_ledger",
    schemaVersion: 1,
    checkedAt,
    publishedAt: null,
    rows: sourceRows.map(([sourceId, upstreamLatest, ingestedLatest]) => ({
      sourceId,
      grain: sourceId === "bus_time_gtfsrt_vehicle_positions" ? "realtime" : "month",
      servingCritical: true,
      upstreamLatest,
      ingestedLatest,
      publishedCoverageEnd: null,
      ingestLagMonths: null,
      publishLagMonths: null,
      status: "unknown",
    })),
  };
}

function availability(minSpeedRoutes = 300): RouteSpeedAvailabilityResult {
  return {
    sourceId: "bus_segment_speeds_2025",
    checkedAt,
    startYear: 2026,
    endYear: 2026,
    minSpeedRoutes,
    latestSpeedMonth: {
      isoMonth: "2026-05",
      year: 2026,
      month: 5,
      routeCount: 359,
      rowCount: 476_481,
      busTripCount: 7_096_970,
      status: "complete",
    },
    requestedMonth: null,
    releaseDecision: {
      status: "new_complete_month_available",
      latestCompleteMonth: "2026-05",
      lastBuiltMonth: "2026-03",
      shouldRebuild: true,
      reason: "fixture",
    },
    months: [],
    artifactPath: "fixture.json",
  };
}

function evidence(): Plan097FreshnessEvidence[] {
  return (
    [
      ["bus_segment_speeds_2025", "2026-05", 476_481, 359],
      ["bus_hourly_ridership_2025", "2026-06", 10_000, 330],
      ["bus_wait_assessment", "2026-05", 1_000, 300],
      ["ace_violations", "2026-06", 100, 20],
      ["ace_routes", "2026-07-23T00:00:00.000Z", 100, 100],
      ["nyc_dot_bus_lanes_local_streets", "2026-07-23T00:00:00.000Z", 200, null],
      ["bus_time_gtfsrt_vehicle_positions", "2026-07-22", 10, null],
    ] as const
  ).map(([sourceId, partition, rowCount, routeCount]) => ({
    sourceId,
    partition,
    rowCount,
    routeCount,
    rowsSha256: "a".repeat(64),
    sourceSnapshotSha256: null,
  }));
}

describe("Plan 097 freshness-derived candidate matrix", () => {
  test("selects the prior month when upstream already exposes an open month", () => {
    expect(latestClosedUpstreamMonth("2026-07", checkedAt)).toBe("2026-06");
    expect(latestClosedUpstreamMonth("2026-05", checkedAt)).toBe("2026-05");
    expect(latestClosedUpstreamMonth(null, checkedAt)).toBeNull();
  });

  test("accepts independently complete dataset ranges without clipping to one month", () => {
    const matrix = buildPlan097FreshnessMatrix({
      checkedAt,
      ledger: ledger(),
      routeSpeedAvailability: availability(),
      evidence: evidence(),
    });
    expect(matrix.status).toBe("ready");
    expect(matrix.candidateCompatibilityCoverageEnd).toBe("2026-05");
    expect(
      matrix.datasets.map((row) => [row.sourceId, row.selectedCompletePartition]),
    ).toContainEqual(["bus_hourly_ridership_2025", "2026-06"]);
  });

  test("fails closed on a weak route probe or missing selected partition evidence", () => {
    const missing = evidence().filter((row) => row.sourceId !== "ace_violations");
    const matrix = buildPlan097FreshnessMatrix({
      checkedAt,
      ledger: ledger(),
      routeSpeedAvailability: availability(1),
      evidence: missing,
    });
    expect(matrix.status).toBe("stop");
    expect(
      matrix.datasets.find((row) => row.sourceId === "bus_segment_speeds_2025")?.reasons,
    ).toContain("route_speed_probe_threshold_below_300_routes");
    expect(matrix.datasets.find((row) => row.sourceId === "ace_violations")?.reasons).toContain(
      "selected_partition_evidence_missing_or_empty",
    );
  });
});
