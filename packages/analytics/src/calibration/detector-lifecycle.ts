export type DetectorVersionChangeKind = "same" | "patch" | "minor" | "major" | "regression";

// Lifecycle records (S4.2): machine-readable demotion / supersession / retirement decisions per
// detector id + version. The resulting retirement status mirrors the registry's
// DETECTOR_RETIREMENT_STATUSES enum (duplicated as a local union to keep this pure helper module
// dependency-free of the registry). The persistence + pipeline command wrap these pure builders.

export type DetectorLifecycleEventKind =
  | "introduced"
  | "version_change"
  | "demoted"
  | "superseded"
  | "retired";

export type DetectorLifecycleRetirementStatus =
  | "active"
  | "experimental"
  | "deprecated"
  | "retired";

export type DetectorLifecycleRecord = {
  readonly detectorId: string;
  readonly detectorVersion: string;
  readonly eventKind: DetectorLifecycleEventKind;
  readonly resultingRetirementStatus: DetectorLifecycleRetirementStatus;
  readonly decidedAt: string;
  readonly reason: string;
  readonly supersededByDetectorIds: readonly string[];
  readonly decisionRef: string | null;
};

export type BuildDetectorLifecycleRecordInput = {
  readonly detectorId: string;
  readonly detectorVersion: string;
  readonly eventKind: DetectorLifecycleEventKind;
  readonly resultingRetirementStatus: DetectorLifecycleRetirementStatus;
  readonly decidedAt: string;
  readonly reason: string;
  readonly supersededByDetectorIds?: readonly string[];
  readonly decisionRef?: string | null;
};

export function buildDetectorLifecycleRecord(
  input: BuildDetectorLifecycleRecordInput,
): DetectorLifecycleRecord {
  const supersededByDetectorIds = [...new Set(input.supersededByDetectorIds ?? [])].sort();
  if (input.eventKind === "superseded" && supersededByDetectorIds.length === 0) {
    throw new Error("A superseded lifecycle record requires at least one successor detector id.");
  }
  if (supersededByDetectorIds.includes(input.detectorId)) {
    throw new Error("A detector cannot supersede itself.");
  }
  if (input.eventKind !== "superseded" && supersededByDetectorIds.length > 0) {
    throw new Error("Only superseded lifecycle records may list successor detector ids.");
  }
  return {
    detectorId: input.detectorId,
    detectorVersion: input.detectorVersion,
    eventKind: input.eventKind,
    resultingRetirementStatus: input.resultingRetirementStatus,
    decidedAt: input.decidedAt,
    reason: input.reason,
    supersededByDetectorIds,
    decisionRef: input.decisionRef ?? null,
  };
}

export type DetectorLifecycleLog = {
  readonly artifactKind: "detector_lifecycle_log";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly records: readonly DetectorLifecycleRecord[];
};

export function buildDetectorLifecycleLog(input: {
  readonly generatedAt: string;
  readonly records: readonly DetectorLifecycleRecord[];
}): DetectorLifecycleLog {
  const records = [...input.records].sort(
    (left, right) =>
      left.detectorId.localeCompare(right.detectorId) ||
      left.detectorVersion.localeCompare(right.detectorVersion) ||
      left.decidedAt.localeCompare(right.decidedAt) ||
      left.eventKind.localeCompare(right.eventKind),
  );
  return {
    artifactKind: "detector_lifecycle_log",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    records,
  };
}

export type DetectorVersionComparison = {
  fromVersion: string;
  toVersion: string;
  changeKind: DetectorVersionChangeKind;
};

export type DetectorReviewCycleSummaryInput = {
  detectorId: string;
  detectorVersion: string;
  reviewedCount: number;
  confirmedCount: number;
};

export type DetectorReviewCycleSummary = DetectorReviewCycleSummaryInput & {
  confirmedRate: number | null;
};

export type DetectorRetirementPolicy = {
  minReviewedCount: number;
  minConfirmedRate: number;
};

export type DetectorRetirementRecommendation = {
  detectorId: string;
  detectorVersion: string;
  recommendation: "keep" | "watch" | "retire_candidate";
  reason: string;
};

export type FalsePositiveRecord = {
  detectorId: string;
  detectorVersion: string;
  rootCause: string;
};

export type FalsePositiveRootCauseSummary = {
  detectorId: string;
  detectorVersion: string;
  rootCause: string;
  count: number;
};

function parseSemver(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (match === null) throw new Error(`Invalid detector semver: ${version}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareDetectorVersions(
  fromVersion: string,
  toVersion: string,
): DetectorVersionComparison {
  const from = parseSemver(fromVersion);
  const to = parseSemver(toVersion);
  let changeKind: DetectorVersionChangeKind = "same";
  if (
    to[0] < from[0] ||
    (to[0] === from[0] && to[1] < from[1]) ||
    (to[0] === from[0] && to[1] === from[1] && to[2] < from[2])
  ) {
    changeKind = "regression";
  } else if (to[0] > from[0]) {
    changeKind = "major";
  } else if (to[1] > from[1]) {
    changeKind = "minor";
  } else if (to[2] > from[2]) {
    changeKind = "patch";
  }
  return { fromVersion, toVersion, changeKind };
}

export function summarizeDetectorReviewCycle(
  input: DetectorReviewCycleSummaryInput,
): DetectorReviewCycleSummary {
  return {
    ...input,
    confirmedRate: input.reviewedCount === 0 ? null : input.confirmedCount / input.reviewedCount,
  };
}

export function recommendDetectorRetirement(
  summary: DetectorReviewCycleSummary,
  policy: DetectorRetirementPolicy,
): DetectorRetirementRecommendation {
  if (summary.reviewedCount < policy.minReviewedCount) {
    return {
      detectorId: summary.detectorId,
      detectorVersion: summary.detectorVersion,
      recommendation: "watch",
      reason: "Not enough reviewed findings to make a retirement decision.",
    };
  }
  if (summary.confirmedRate !== null && summary.confirmedRate < policy.minConfirmedRate) {
    return {
      detectorId: summary.detectorId,
      detectorVersion: summary.detectorVersion,
      recommendation: "retire_candidate",
      reason: "Confirmed rate is below the configured retirement threshold.",
    };
  }
  return {
    detectorId: summary.detectorId,
    detectorVersion: summary.detectorVersion,
    recommendation: "keep",
    reason: "Confirmed rate is at or above the configured threshold.",
  };
}

export function summarizeFalsePositiveRootCauses(
  records: readonly FalsePositiveRecord[],
): FalsePositiveRootCauseSummary[] {
  const counts = new Map<string, FalsePositiveRootCauseSummary>();
  for (const record of records) {
    const key = [record.detectorId, record.detectorVersion, record.rootCause].join("\u0000");
    const current = counts.get(key) ?? {
      detectorId: record.detectorId,
      detectorVersion: record.detectorVersion,
      rootCause: record.rootCause,
      count: 0,
    };
    current.count += 1;
    counts.set(key, current);
  }
  return [...counts.values()].sort((left, right) => {
    const detectorDelta = left.detectorId.localeCompare(right.detectorId);
    if (detectorDelta !== 0) return detectorDelta;
    const versionDelta = left.detectorVersion.localeCompare(right.detectorVersion);
    if (versionDelta !== 0) return versionDelta;
    return left.rootCause.localeCompare(right.rootCause);
  });
}
