// Consolidated calibration register (S4.3 in docs/research/backend-goal-finish-detectors.md).
//
// One queryable record across detector families: per detector id + version, its calibration
// disposition, gold/NOTE artifact locations, reviewed-label count, and false-positive root-cause tags
// — generated from the existing `data/artifacts/detector-calibration-*` dirs + the registry, without
// hand-editing those dirs. Pure + deterministic; the scanner/command that reads the dirs wraps this
// builder.

export type DetectorCalibrationDisposition =
  | "machinery_built" // review-queue + reviewed-gold machinery exists (public 5-bucket vocab)
  | "internal_only" // machinery exists but readiness can never reach a public bucket
  | "coverage_authority" // data-quality authority; agreement audit, no gold-precision frame
  | "inventory_blocked" // coverage-starved; held until inputs improve, no machinery
  | "superseded" // replaced by other detectors; deprecated/retired
  | "deferred" // build gated on a prerequisite (e.g. a feature-field slice)
  | "pending"; // not yet dispositioned

export const DETECTOR_CALIBRATION_DISPOSITIONS: readonly DetectorCalibrationDisposition[] = [
  "machinery_built",
  "internal_only",
  "coverage_authority",
  "inventory_blocked",
  "superseded",
  "deferred",
  "pending",
];

export type DetectorCalibrationRegisterEntry = {
  readonly detectorId: string;
  readonly detectorVersion: string;
  readonly retirementStatus: string;
  readonly disposition: DetectorCalibrationDisposition;
  readonly calibrationDir: string | null;
  readonly notePath: string | null;
  readonly reviewedGoldModule: string | null;
  readonly reviewedLabelCount: number;
  readonly falsePositiveRootCauseTags: readonly string[];
  readonly decisionRef: string | null;
};

export type DetectorCalibrationRegister = {
  readonly artifactKind: "detector_calibration_register";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly summary: {
    readonly detectorCount: number;
    readonly byDisposition: Record<DetectorCalibrationDisposition, number>;
    readonly byRetirementStatus: Record<string, number>;
    readonly machineryCount: number;
    readonly totalReviewedLabelCount: number;
    readonly falsePositiveRootCauseTagCounts: Record<string, number>;
  };
  readonly entries: readonly DetectorCalibrationRegisterEntry[];
};

function emptyDispositionCounts(): Record<DetectorCalibrationDisposition, number> {
  return {
    machinery_built: 0,
    internal_only: 0,
    coverage_authority: 0,
    inventory_blocked: 0,
    superseded: 0,
    deferred: 0,
    pending: 0,
  };
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedCountRecord(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries(
    [...map.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function buildDetectorCalibrationRegister(input: {
  readonly generatedAt: string;
  readonly entries: readonly DetectorCalibrationRegisterEntry[];
}): DetectorCalibrationRegister {
  const seen = new Set<string>();
  for (const entry of input.entries) {
    const key = `${entry.detectorId}\0${entry.detectorVersion}`;
    if (seen.has(key)) {
      throw new Error(
        `Duplicate calibration-register entry for ${entry.detectorId}@${entry.detectorVersion}.`,
      );
    }
    seen.add(key);
    if (entry.reviewedLabelCount < 0) {
      throw new Error(`reviewedLabelCount cannot be negative for ${entry.detectorId}.`);
    }
  }

  const entries = [...input.entries].sort(
    (left, right) =>
      left.detectorId.localeCompare(right.detectorId) ||
      left.detectorVersion.localeCompare(right.detectorVersion),
  );

  const byDisposition = emptyDispositionCounts();
  const byRetirementStatus = new Map<string, number>();
  const falsePositiveRootCauseTagCounts = new Map<string, number>();
  let totalReviewedLabelCount = 0;
  for (const entry of entries) {
    byDisposition[entry.disposition] += 1;
    increment(byRetirementStatus, entry.retirementStatus);
    totalReviewedLabelCount += entry.reviewedLabelCount;
    for (const tag of entry.falsePositiveRootCauseTags)
      increment(falsePositiveRootCauseTagCounts, tag);
  }

  return {
    artifactKind: "detector_calibration_register",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    summary: {
      detectorCount: entries.length,
      byDisposition,
      byRetirementStatus: sortedCountRecord(byRetirementStatus),
      machineryCount: byDisposition.machinery_built + byDisposition.internal_only,
      totalReviewedLabelCount,
      falsePositiveRootCauseTagCounts: sortedCountRecord(falsePositiveRootCauseTagCounts),
    },
    entries,
  };
}
