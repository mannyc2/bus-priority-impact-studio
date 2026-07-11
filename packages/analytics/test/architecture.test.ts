import { describe, expect, test } from "bun:test";
import {
  distributionBaseline,
  distributionRank,
  historicalDelta,
  interventionWindowDelta,
  peerMedianBaseline,
  quantileCutoff,
  sourceCoverageBaseline,
} from "@bp/analytics/baselines";
import {
  buildCoverageAudit,
  buildEvidenceLink,
  clamp,
  round,
  severityFromScore,
  stableId,
} from "@bp/analytics/core";
import { routeMonthFeatureKey } from "@bp/analytics/features";
import { IsoMonthSchema, RouteIdSchema } from "@bp/domain/primitives";

describe("analytics architecture primitives", () => {
  test("creates stable ids from ordered parts", () => {
    expect(stableId("run-1", "candidate", "M15")).toBe(stableId("run-1", "candidate", "M15"));
    expect(stableId("run-1", "candidate", "M15")).not.toBe(
      stableId("run-1", "candidate", "M15", "extra"),
    );
  });

  test("centralizes numeric helpers used by detectors", () => {
    expect(clamp(12, 0, 10)).toBe(10);
    expect(round(1.23456, 3)).toBe(1.235);
    expect(severityFromScore(95)).toBe("high");
    expect(severityFromScore(70)).toBe("medium");
    expect(severityFromScore(60)).toBe("low");
  });

  test("builds schema-validated evidence and coverage rows", () => {
    const evidence = buildEvidenceLink({
      linkId: stableId("candidate-1", "evidence", "metric"),
      candidateId: "candidate-1",
      evidenceKind: "metric",
      evidenceRole: "primary",
      evidenceRef: { routeId: "M15", score: 95 },
      evidenceWeight: 1,
      note: null,
    });
    const coverage = buildCoverageAudit({
      auditId: stableId("run-1", "audit", "M15"),
      detectorRunId: "abcdef0123456789abcdef0123456789",
      detectorId: "source_gap",
      month: "2026-03",
      scopeKind: "route",
      scopeId: "M15",
      outcome: "clean_no_hit",
      reasonCode: null,
      reason: null,
      inputsSeenJson: { routeId: "M15" },
      inputsExpectedJson: { routeId: "present" },
      createdAt: "2026-05-20T00:00:00.000Z",
    });

    expect(JSON.parse(evidence.evidenceRef)).toEqual({ routeId: "M15", score: 95 });
    expect(JSON.parse(coverage.inputsSeenJson ?? "{}")).toEqual({ routeId: "M15" });
  });

  test("exposes pure baseline helpers for detector designs", () => {
    expect(distributionBaseline([4, 8, 10])).toEqual({
      count: 3,
      min: 4,
      median: 8,
      max: 10,
    });
    expect(quantileCutoff([4, 8, 10], 0.5)).toBe(8);
    expect(distributionRank(8, [4, 8, 10])).toBeCloseTo(2 / 3, 10);
    expect(
      peerMedianBaseline([
        { scopeId: "M15", value: 5 },
        { scopeId: "M14", value: null },
      ]),
    ).toEqual({ peerCount: 1, peerMedian: 5, peerScopeIds: ["M15"] });
    expect(historicalDelta(12, 10)).toEqual({
      current: 12,
      baseline: 10,
      delta: 2,
      percentDelta: 0.2,
    });
    expect(interventionWindowDelta({ preValue: 10, postValue: 9, peerDelta: 0.5 })).toEqual({
      preValue: 10,
      postValue: 9,
      rawDelta: -1,
      peerDelta: 0.5,
      adjustedDelta: -1.5,
    });
    expect(sourceCoverageBaseline({ expectedCount: 10, observedCount: 7 })).toEqual({
      expectedCount: 10,
      observedCount: 7,
      missingCount: 3,
      observedShare: 0.7,
    });
  });

  test("defines feature grain keys without depending on app or pipeline code", () => {
    expect(
      routeMonthFeatureKey({
        routeId: RouteIdSchema.parse("M15"),
        month: IsoMonthSchema.parse("2026-03"),
        window: "all_day",
        direction: null,
      }),
    ).toBe("M15:2026-03:all_day:all");
  });
});
