import { describe, expect, test } from "bun:test";
import { buildPersistentSpeedSegmentCoverageRepairs } from "../../../src/commands/findings/repair-persistent-speed-coverage.ts";

describe("findings repair-persistent-speed-coverage", () => {
  test("builds exact segment-scope hit coverage rows for missing persistent-speed candidates", () => {
    const repairs = buildPersistentSpeedSegmentCoverageRepairs({
      generatedAt: "2026-06-01T00:00:00.000Z",
      rows: [
        {
          candidate_id: "candidate-1",
          detector_run_id: "persistent-speed-run",
          detector_id: "persistent_speed_hotspot",
          month: "2026-03",
          scope_kind: "segment",
          scope_id: "M15:0:1",
          route_id: "M15",
          evidence_ref: '{"weightedAverageSpeedMph":5.2}',
          created_at: "2026-05-20T12:00:00.000Z",
        },
      ],
    });

    expect(repairs).toHaveLength(1);
    expect(repairs[0]?.detectorId as string).toBe("persistent_speed_hotspot");
    expect(repairs[0]?.scopeKind as string).toBe("segment");
    expect(repairs[0]?.scopeId).toBe("M15:0:1");
    expect(repairs[0]?.outcome as string).toBe("hit");
    expect(JSON.parse(repairs[0]?.inputsExpectedJson ?? "{}")).toEqual({
      scopeKind: "segment",
      detectorCandidate: "persistent_speed_hotspot",
      exactScopeCoverageRequired: true,
    });
    expect(JSON.parse(repairs[0]?.inputsSeenJson ?? "{}")).toMatchObject({
      candidateId: "candidate-1",
      routeId: "M15",
      repairedFrom: "local_finding_candidate",
      primaryEvidence: { weightedAverageSpeedMph: 5.2 },
    });
  });

  test("skips malformed and non-segment rows", () => {
    const repairs = buildPersistentSpeedSegmentCoverageRepairs({
      generatedAt: "2026-06-01T00:00:00.000Z",
      rows: [
        {
          candidate_id: "candidate-1",
          detector_run_id: "persistent-speed-run",
          detector_id: "persistent_speed_hotspot",
          month: "2026-03",
          scope_kind: "route",
          scope_id: "M15",
          route_id: "M15",
          evidence_ref: null,
          created_at: "2026-05-20T12:00:00.000Z",
        },
        {
          candidate_id: "",
          detector_run_id: "persistent-speed-run",
          detector_id: "persistent_speed_hotspot",
          month: "2026-03",
          scope_kind: "segment",
          scope_id: "M15:0:1",
          route_id: "M15",
          evidence_ref: null,
          created_at: "2026-05-20T12:00:00.000Z",
        },
      ],
    });

    expect(repairs).toHaveLength(0);
  });
});
