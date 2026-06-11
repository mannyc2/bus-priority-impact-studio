import { describe, expect, test } from "bun:test";
import { buildDetectorLifecycleLog, buildDetectorLifecycleRecord } from "@bp/analytics/calibration";

describe("detector lifecycle records (S4.2)", () => {
  test("builds a supersession record (persistent_speed_hotspot -> speed_pace_hotspot + delay_concentration)", () => {
    const record = buildDetectorLifecycleRecord({
      detectorId: "persistent_speed_hotspot",
      detectorVersion: "1.0.0",
      eventKind: "superseded",
      resultingRetirementStatus: "deprecated",
      decidedAt: "2026-06-10",
      reason:
        "Open Decision 2 resolved: superseded by speed_pace_hotspot + delay_concentration (same similarity cluster, coarser grain).",
      supersededByDetectorIds: ["delay_concentration", "speed_pace_hotspot"],
      decisionRef: "backend-goal-finish-detectors.md#open-decision-2",
    });

    expect(record).toMatchObject({
      detectorId: "persistent_speed_hotspot",
      eventKind: "superseded",
      resultingRetirementStatus: "deprecated",
      decisionRef: "backend-goal-finish-detectors.md#open-decision-2",
    });
    // successor ids are deduped + sorted
    expect(record.supersededByDetectorIds).toEqual(["delay_concentration", "speed_pace_hotspot"]);
  });

  test("rejects a supersession with no successor, self-supersession, and successors on non-supersede events", () => {
    expect(() =>
      buildDetectorLifecycleRecord({
        detectorId: "persistent_speed_hotspot",
        detectorVersion: "1.0.0",
        eventKind: "superseded",
        resultingRetirementStatus: "deprecated",
        decidedAt: "2026-06-10",
        reason: "missing successor",
      }),
    ).toThrow(/at least one successor/);

    expect(() =>
      buildDetectorLifecycleRecord({
        detectorId: "persistent_speed_hotspot",
        detectorVersion: "1.0.0",
        eventKind: "superseded",
        resultingRetirementStatus: "deprecated",
        decidedAt: "2026-06-10",
        reason: "self supersession",
        supersededByDetectorIds: ["persistent_speed_hotspot"],
      }),
    ).toThrow(/cannot supersede itself/);

    expect(() =>
      buildDetectorLifecycleRecord({
        detectorId: "speed_pace_hotspot",
        detectorVersion: "2.0.0",
        eventKind: "version_change",
        resultingRetirementStatus: "active",
        decidedAt: "2026-06-10",
        reason: "successors on a non-supersede event",
        supersededByDetectorIds: ["delay_concentration"],
      }),
    ).toThrow(/Only superseded/);
  });

  test("lifecycle log sorts records deterministically", () => {
    const a = buildDetectorLifecycleRecord({
      detectorId: "persistent_speed_hotspot",
      detectorVersion: "1.0.0",
      eventKind: "superseded",
      resultingRetirementStatus: "deprecated",
      decidedAt: "2026-06-10",
      reason: "superseded",
      supersededByDetectorIds: ["speed_pace_hotspot"],
    });
    const b = buildDetectorLifecycleRecord({
      detectorId: "customer_journey_shortfall",
      detectorVersion: "1.0.0",
      eventKind: "introduced",
      resultingRetirementStatus: "active",
      decidedAt: "2026-03-01",
      reason: "introduced",
    });

    const log = buildDetectorLifecycleLog({
      generatedAt: "2026-06-10T00:00:00.000Z",
      records: [a, b],
    });
    expect(log.artifactKind).toBe("detector_lifecycle_log");
    expect(log.records.map((record) => record.detectorId)).toEqual([
      "customer_journey_shortfall",
      "persistent_speed_hotspot",
    ]);
  });
});
