import { describe, expect, test } from "bun:test";
import {
  buildDetectorCalibrationRegister,
  type DetectorCalibrationRegisterEntry,
} from "../src/evaluation/detector-calibration-register";

const entry = (
  overrides: Partial<DetectorCalibrationRegisterEntry> & { detectorId: string },
): DetectorCalibrationRegisterEntry => ({
  detectorVersion: "1.0.0",
  retirementStatus: "active",
  disposition: "machinery_built",
  calibrationDir: null,
  notePath: null,
  reviewedGoldModule: null,
  reviewedLabelCount: 0,
  falsePositiveRootCauseTags: [],
  decisionRef: null,
  ...overrides,
});

describe("detector calibration register (S4.3)", () => {
  test("summarizes dispositions, retirement statuses, labels, and fp root-cause tags", () => {
    const register = buildDetectorCalibrationRegister({
      generatedAt: "2026-06-10T00:00:00.000Z",
      entries: [
        entry({
          detectorId: "schedule_mismatch",
          disposition: "machinery_built",
          reviewedLabelCount: 4,
          falsePositiveRootCauseTags: ["congestion_or_incident_confound"],
        }),
        entry({
          detectorId: "positive_deviance",
          disposition: "internal_only",
          reviewedLabelCount: 2,
          falsePositiveRootCauseTags: ["peer_construction_artifact"],
        }),
        entry({ detectorId: "source_gap", disposition: "coverage_authority" }),
        entry({
          detectorId: "persistent_speed_hotspot",
          retirementStatus: "deprecated",
          disposition: "superseded",
        }),
        entry({ detectorId: "delay_concentration", disposition: "deferred" }),
      ],
    });

    expect(register.summary.detectorCount).toBe(5);
    // entries are sorted by detector id
    expect(register.entries.map((e) => e.detectorId)).toEqual([
      "delay_concentration",
      "persistent_speed_hotspot",
      "positive_deviance",
      "schedule_mismatch",
      "source_gap",
    ]);
    expect(register.summary.byDisposition).toMatchObject({
      machinery_built: 1,
      internal_only: 1,
      coverage_authority: 1,
      superseded: 1,
      deferred: 1,
    });
    expect(register.summary.byRetirementStatus).toEqual({ active: 4, deprecated: 1 });
    // machinery = public machinery + internal-only machinery
    expect(register.summary.machineryCount).toBe(2);
    expect(register.summary.totalReviewedLabelCount).toBe(6);
    expect(register.summary.falsePositiveRootCauseTagCounts).toEqual({
      congestion_or_incident_confound: 1,
      peer_construction_artifact: 1,
    });
  });

  test("rejects duplicate detector id + version entries", () => {
    expect(() =>
      buildDetectorCalibrationRegister({
        generatedAt: "2026-06-10T00:00:00.000Z",
        entries: [
          entry({ detectorId: "schedule_mismatch" }),
          entry({ detectorId: "schedule_mismatch" }),
        ],
      }),
    ).toThrow(/Duplicate/);
  });
});
