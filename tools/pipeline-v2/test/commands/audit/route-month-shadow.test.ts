import { describe, expect, test } from "bun:test";
import { buildRouteMonthShadowAudit } from "../../../src/commands/audit/route-month-shadow.ts";

describe("audit route-month-shadow", () => {
  test("finds richer-grain candidates hidden behind route-month clean no-hits", () => {
    const audit = buildRouteMonthShadowAudit({
      month: "2026-03",
      generatedAt: "2026-06-01T00:00:00.000Z",
      dbPath: "data/local/pipeline.sqlite",
      artifactPath:
        "data/artifacts/detector-shadow-audits/2026-03/route-month-false-negative-shadow.json",
      cleanNoHitRows: [
        { detector_id: "multi_month_speed_peer", route_id: "M15" },
        { detector_id: "multi_month_speed_peer", route_id: "B1" },
        { detector_id: "intervention_gap", route_id: "M15" },
      ],
      richerCandidateRows: [
        {
          detector_id: "speed_pace_hotspot",
          route_id: "M15",
          candidate_id: "c-speed",
          scope_kind: "segment",
          scope_id: "M15:N:1:s1:s2",
          reason_code: "slow_pace_hotspot",
          detector_score: 91,
          claim_text: "M15 segment is slow.",
        },
        {
          detector_id: "headway_reliability_ewt",
          route_id: "M15",
          candidate_id: "c-ewt",
          scope_kind: "route",
          scope_id: "M15:N:s1:2026-03-01:08",
          reason_code: "excess_wait_time",
          detector_score: 77,
          claim_text: "M15 stop-hour has excess wait.",
        },
      ],
    });

    expect(audit.summary.routeMonthCleanNoHitRouteCount).toBe(2);
    expect(audit.summary.hiddenRouteCount).toBe(1);
    expect(audit.summary.hiddenCandidateCount).toBe(4);
    const multiMonth = audit.baselineDetectors.find(
      (detector) => detector.detectorId === "multi_month_speed_peer",
    );
    expect(multiMonth?.hiddenRouteCount).toBe(1);
    expect(multiMonth?.hiddenCandidateDetectorCounts).toEqual({
      headway_reliability_ewt: 1,
      speed_pace_hotspot: 1,
    });
  });
});
