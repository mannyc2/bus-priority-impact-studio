import { listAnalyticsDetectors } from "@bp/analytics/registry";

export type DetectorEvaluationCoverageRow = {
  detector_id: unknown;
  month: unknown;
  scope_kind: unknown;
  scope_id: unknown;
  outcome: unknown;
  reason_code: unknown;
  reason: unknown;
  inputs_seen_json: unknown;
  inputs_expected_json: unknown;
};

export type DetectorEvaluationLabelGrainSafety =
  | "detector_native_or_route_level"
  | "screening_grain_review_required"
  | "unknown_detector";

export type DetectorEvaluationLabel = {
  labelId: string;
  detectorId: string;
  month: string;
  scopeKind: string;
  scopeId: string;
  label: "confirmed_negative";
  set: "training" | "holdout";
  sourceOutcome: "clean_no_hit";
  source: "local_finding_coverage_audit";
  reasonCode: string | null;
  reason: string | null;
  inputsSeenJson: string | null;
  inputsExpectedJson: string | null;
  grainSafety: DetectorEvaluationLabelGrainSafety;
  grainSafetyReason: string;
};

export type DetectorEvaluationMissingDataScope = {
  scopeId: string;
  detectorId: string;
  month: string;
  scopeKind: string;
  sourceOutcome: "skipped_missing_input" | "skipped_failed_join" | "source_lag";
  reasonCode: string | null;
  reason: string | null;
  inputsSeenJson: string | null;
  inputsExpectedJson: string | null;
  grainSafety: DetectorEvaluationLabelGrainSafety;
  grainSafetyReason: string;
};

export type DetectorEvaluationLabelSetArtifact = {
  artifactKind: "detector_evaluation_label_set";
  schemaVersion: 1;
  generatedAt: string;
  releaseMonth: string;
  dbPath: string | null;
  artifactPath: string;
  source: {
    tableName: "local_finding_coverage_audit";
    caveat: string;
  };
  sampling: {
    holdoutModulo: number;
    maxCleanNoHitPerDetector: number | null;
    maxMissingDataScopesPerDetector: number;
  };
  summary: {
    confirmedNegativeCount: number;
    trainingNegativeCount: number;
    holdoutNegativeCount: number;
    missingDataScopeCount: number;
    detectorCount: number;
    detectorNativeOrRouteLevelLabelCount: number;
    screeningGrainReviewRequiredLabelCount: number;
    unknownDetectorLabelCount: number;
  };
  detectorCounts: Record<
    string,
    {
      confirmedNegativeCount: number;
      trainingNegativeCount: number;
      holdoutNegativeCount: number;
      missingDataScopeCount: number;
    }
  >;
  labels: DetectorEvaluationLabel[];
  missingDataScopes: DetectorEvaluationMissingDataScope[];
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function labelId(row: {
  detectorId: string;
  month: string;
  scopeKind: string;
  scopeId: string;
}): string {
  return [row.detectorId, row.month, row.scopeKind, row.scopeId].join(":");
}

function labelSet(id: string, holdoutModulo: number): "training" | "holdout" {
  if (holdoutModulo <= 1) return "training";
  return stableHash(id) % holdoutModulo === 0 ? "holdout" : "training";
}

function grainSafetyForDetector(detectorId: string): {
  grainSafety: DetectorEvaluationLabelGrainSafety;
  grainSafetyReason: string;
} {
  const detector = listAnalyticsDetectors().find((candidate) => candidate.detectorId === detectorId);
  if (detector === undefined) {
    return {
      grainSafety: "unknown_detector",
      grainSafetyReason: "Detector id is not present in the analytics detector registry.",
    };
  }
  if (detector.featureGrains.includes("route_month")) {
    return {
      grainSafety: "screening_grain_review_required",
      grainSafetyReason:
        "Detector uses the route_month screening grain; derived clean no-hits require same-grain reviewer validation or richer-grain shadow audit before use as detector-quality negatives.",
    };
  }
  return {
    grainSafety: "detector_native_or_route_level",
    grainSafetyReason:
      "Detector registry does not declare route_month as a screening input for this detector.",
  };
}

function countByDetector(
  artifact: Pick<DetectorEvaluationLabelSetArtifact, "labels" | "missingDataScopes">,
) {
  const counts: DetectorEvaluationLabelSetArtifact["detectorCounts"] = {};
  for (const label of artifact.labels) {
    const current = counts[label.detectorId] ?? {
      confirmedNegativeCount: 0,
      trainingNegativeCount: 0,
      holdoutNegativeCount: 0,
      missingDataScopeCount: 0,
    };
    current.confirmedNegativeCount += 1;
    if (label.set === "holdout") current.holdoutNegativeCount += 1;
    else current.trainingNegativeCount += 1;
    counts[label.detectorId] = current;
  }
  for (const scope of artifact.missingDataScopes) {
    const current = counts[scope.detectorId] ?? {
      confirmedNegativeCount: 0,
      trainingNegativeCount: 0,
      holdoutNegativeCount: 0,
      missingDataScopeCount: 0,
    };
    current.missingDataScopeCount += 1;
    counts[scope.detectorId] = current;
  }
  return counts;
}

export function buildDetectorEvaluationLabelSetArtifact(input: {
  rows: readonly DetectorEvaluationCoverageRow[];
  releaseMonth: string;
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  holdoutModulo: number;
  maxCleanNoHitPerDetector: number | null;
  maxMissingDataScopesPerDetector: number;
}): DetectorEvaluationLabelSetArtifact {
  const cleanRowsByDetector = new Map<string, DetectorEvaluationCoverageRow[]>();
  const missingDataScopes: DetectorEvaluationMissingDataScope[] = [];

  for (const row of input.rows) {
    const detectorId = text(row.detector_id);
    const month = text(row.month);
    const scopeKind = text(row.scope_kind);
    const scopeId = text(row.scope_id);
    const outcome = text(row.outcome);
    if (detectorId === null || month === null || scopeKind === null || scopeId === null) {
      continue;
    }
    if (outcome === "clean_no_hit") {
      const rows = cleanRowsByDetector.get(detectorId) ?? [];
      rows.push(row);
      cleanRowsByDetector.set(detectorId, rows);
      continue;
    }
    if (
      outcome === "skipped_missing_input" ||
      outcome === "skipped_failed_join" ||
      outcome === "source_lag"
    ) {
      const grainSafety = grainSafetyForDetector(detectorId);
      missingDataScopes.push({
        scopeId,
        detectorId,
        month,
        scopeKind,
        sourceOutcome: outcome,
        reasonCode: text(row.reason_code),
        reason: text(row.reason),
        inputsSeenJson: text(row.inputs_seen_json),
        inputsExpectedJson: text(row.inputs_expected_json),
        ...grainSafety,
      });
    }
  }

  const labels: DetectorEvaluationLabel[] = [];
  for (const [detectorId, rows] of cleanRowsByDetector) {
    const sortedRows = rows.sort((left, right) =>
      `${text(left.scope_kind) ?? ""}:${text(left.scope_id) ?? ""}`.localeCompare(
        `${text(right.scope_kind) ?? ""}:${text(right.scope_id) ?? ""}`,
      ),
    );
    const selectedRows =
      input.maxCleanNoHitPerDetector === null
        ? sortedRows
        : sortedRows.slice(0, input.maxCleanNoHitPerDetector);
    for (const row of selectedRows) {
      const month = text(row.month);
      const scopeKind = text(row.scope_kind);
      const scopeId = text(row.scope_id);
      if (month === null || scopeKind === null || scopeId === null) continue;
      const id = labelId({ detectorId, month, scopeKind, scopeId });
      const grainSafety = grainSafetyForDetector(detectorId);
      labels.push({
        labelId: id,
        detectorId,
        month,
        scopeKind,
        scopeId,
        label: "confirmed_negative",
        set: labelSet(id, input.holdoutModulo),
        sourceOutcome: "clean_no_hit",
        source: "local_finding_coverage_audit",
        reasonCode: text(row.reason_code),
        reason: text(row.reason),
        inputsSeenJson: text(row.inputs_seen_json),
        inputsExpectedJson: text(row.inputs_expected_json),
        ...grainSafety,
      });
    }
  }

  labels.sort((left, right) => left.labelId.localeCompare(right.labelId));
  missingDataScopes.sort((left, right) =>
    `${left.detectorId}:${left.scopeKind}:${left.scopeId}`.localeCompare(
      `${right.detectorId}:${right.scopeKind}:${right.scopeId}`,
    ),
  );

  const detectorCounts = countByDetector({ labels, missingDataScopes });
  return {
    artifactKind: "detector_evaluation_label_set",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    dbPath: input.dbPath,
    artifactPath: input.artifactPath,
    source: {
      tableName: "local_finding_coverage_audit",
      caveat:
        "Confirmed-negative labels are deterministic clean_no_hit detector-scope rows, not manually reviewed negatives. Holdout rows are selected by stable hash for regression testing.",
    },
    sampling: {
      holdoutModulo: input.holdoutModulo,
      maxCleanNoHitPerDetector: input.maxCleanNoHitPerDetector,
      maxMissingDataScopesPerDetector: input.maxMissingDataScopesPerDetector,
    },
    summary: {
      confirmedNegativeCount: labels.length,
      trainingNegativeCount: labels.filter((label) => label.set === "training").length,
      holdoutNegativeCount: labels.filter((label) => label.set === "holdout").length,
      missingDataScopeCount: missingDataScopes.length,
      detectorCount: Object.keys(detectorCounts).length,
      detectorNativeOrRouteLevelLabelCount: labels.filter(
        (label) => label.grainSafety === "detector_native_or_route_level",
      ).length,
      screeningGrainReviewRequiredLabelCount: labels.filter(
        (label) => label.grainSafety === "screening_grain_review_required",
      ).length,
      unknownDetectorLabelCount: labels.filter((label) => label.grainSafety === "unknown_detector")
        .length,
    },
    detectorCounts,
    labels,
    missingDataScopes,
  };
}
