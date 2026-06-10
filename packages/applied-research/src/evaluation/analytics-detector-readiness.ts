import type {
  BackfillValidationSurfaceId,
  DetectorCalibrationPolicy,
  DetectorPostBackfillValidationExpectation,
} from "@bp/analytics/calibration";
import {
  getCalibrationWindowConfig,
  listDetectorCalibrationPolicies,
} from "@bp/analytics/calibration";
import { listAnalyticsDetectors } from "@bp/analytics/registry";
import type {
  AnalyticsBackfillCoverageAudit,
  SurfaceCoverageSummary,
} from "./analytics-backfill-coverage";

export type DetectorReadinessStatus = "ready" | "partial" | "blocked" | "policy_pending";

export type PolicySurfaceCoverageSummary = Omit<SurfaceCoverageSummary, "surfaceId"> & {
  surfaceId: BackfillValidationSurfaceId;
  registryProductId: string | null;
};

export type DetectorSurfaceReadiness = {
  surfaceId: BackfillValidationSurfaceId;
  registryProductId: string | null;
  label: string;
  tableName: string;
  required: boolean;
  status: DetectorReadinessStatus;
  presentMonthCount: number;
  usableMonthCount: number;
  thinMonthCount: number;
  missingMonthCount: number;
  minimumCompleteMonths: number;
  missingMonths: string[];
  thinMonths: string[];
  failureState: string;
  expectation: string;
  reasons: string[];
};

export type DetectorReadinessSummary = {
  detectorId: string;
  detectorName: string;
  status: DetectorReadinessStatus;
  releaseOutputWindow: string;
  baselineWindowIds: string[];
  minimumCompleteMonths: number;
  requiredSurfaceIds: BackfillValidationSurfaceId[];
  optionalSurfaceIds: BackfillValidationSurfaceId[];
  requirements: DetectorSurfaceReadiness[];
  blockingReasons: string[];
  nextActions: string[];
};

export type AnalyticsDetectorReadinessAudit = {
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  coverageArtifactPath: string;
  window: AnalyticsBackfillCoverageAudit["window"];
  summary: {
    detectorCount: number;
    readyDetectorCount: number;
    partialDetectorCount: number;
    blockedDetectorCount: number;
    policyPendingDetectorCount: number;
    requiredSurfaceCount: number;
    readyRequiredSurfaceCount: number;
    partialRequiredSurfaceCount: number;
    blockedRequiredSurfaceCount: number;
  };
  detectors: DetectorReadinessSummary[];
  surfaceCoverage: PolicySurfaceCoverageSummary[];
};

export type BuildAnalyticsDetectorReadinessAuditInput = {
  backfillCoverage: AnalyticsBackfillCoverageAudit;
  directSurfaceCoverage: readonly PolicySurfaceCoverageSummary[];
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  coverageArtifactPath: string;
};

const BACKFILL_SURFACE_TO_POLICY_SURFACE: ReadonlyMap<string, BackfillValidationSurfaceId> =
  new Map([
    ["route_segment_speed", "route_segment_speeds"],
    ["route_hourly_ridership", "route_hourly_ridership"],
    ["intervention_comparisons", "intervention_comparisons"],
  ]);

export const DETECTOR_READINESS_REGISTRY_PRODUCT_BY_SURFACE = {
  bus_wait_assessment: "local_bus_wait_assessment_history",
  customer_journey_metrics: "local_bus_customer_journey_metrics_history",
  dot_permit_route_touches: "local_context_event_route_touches_history",
  gtfs_schedule_runtime: "local_route_schedule_timepoints_release",
  intervention_comparisons: "local_route_intervention_comparison_history",
  observed_headways: "local_route_observed_reliability_summary_release",
  route_hourly_ridership: "local_route_hourly_ridership_history",
  route_segment_speeds: "local_route_segment_speed_history",
  service_request_route_touches: "local_context_event_route_touches_history",
} as const satisfies Record<BackfillValidationSurfaceId, string>;

export function detectorReadinessRegistryProductId(surfaceId: BackfillValidationSurfaceId): string {
  return DETECTOR_READINESS_REGISTRY_PRODUCT_BY_SURFACE[surfaceId];
}

function policySurfaceCoverage(
  backfillCoverage: AnalyticsBackfillCoverageAudit,
  directCoverage: readonly PolicySurfaceCoverageSummary[],
): PolicySurfaceCoverageSummary[] {
  const backfillSurfaces = backfillCoverage.surfaces.map((surface) => {
    const policySurfaceId = BACKFILL_SURFACE_TO_POLICY_SURFACE.get(surface.surfaceId);
    const surfaceId = policySurfaceId ?? (surface.surfaceId as BackfillValidationSurfaceId);
    return {
      ...surface,
      surfaceId,
      registryProductId: detectorReadinessRegistryProductId(surfaceId),
    };
  });
  return [...backfillSurfaces, ...directCoverage];
}

function maximumMinimumCompleteMonths(policy: DetectorCalibrationPolicy): number {
  const gateMinimum = Math.max(
    0,
    ...policy.minimumHistoryGates.map((gate) => gate.minimumCompleteMonths),
  );
  const windowMinimum = Math.max(
    0,
    ...policy.baselineWindowIds.map(
      (windowId) => getCalibrationWindowConfig(windowId)?.minimumCompleteMonths ?? 0,
    ),
  );
  return Math.max(gateMinimum, windowMinimum, 1);
}

function surfaceReadiness(input: {
  expectation: DetectorPostBackfillValidationExpectation;
  surface: PolicySurfaceCoverageSummary | undefined;
  minimumCompleteMonths: number;
}): DetectorSurfaceReadiness {
  if (input.surface === undefined) {
    return {
      surfaceId: input.expectation.surfaceId,
      registryProductId: detectorReadinessRegistryProductId(input.expectation.surfaceId),
      label: input.expectation.surfaceId,
      tableName: "",
      required: input.expectation.required,
      status: input.expectation.required ? "blocked" : "partial",
      presentMonthCount: 0,
      usableMonthCount: 0,
      thinMonthCount: 0,
      missingMonthCount: 0,
      minimumCompleteMonths: input.minimumCompleteMonths,
      missingMonths: [],
      thinMonths: [],
      failureState: input.expectation.failureState,
      expectation: input.expectation.expectation,
      reasons: ["surface_not_audited"],
    };
  }

  const usableMonthCount = input.surface.presentMonthCount;
  const hasFullWindow = input.surface.missingMonthCount === 0 && input.surface.thinMonthCount === 0;
  const passesMinimum = usableMonthCount >= input.minimumCompleteMonths;
  const status: DetectorReadinessStatus = !passesMinimum
    ? "blocked"
    : hasFullWindow
      ? "ready"
      : "partial";

  const reasons: string[] = [];
  if (!passesMinimum) reasons.push("below_minimum_complete_months");
  if (input.surface.missingMonthCount > 0) reasons.push("missing_months");
  if (input.surface.thinMonthCount > 0) reasons.push("thin_months");

  return {
    surfaceId: input.expectation.surfaceId,
    registryProductId:
      input.surface.registryProductId ??
      detectorReadinessRegistryProductId(input.expectation.surfaceId),
    label: input.surface.label,
    tableName: input.surface.tableName,
    required: input.expectation.required,
    status,
    presentMonthCount: input.surface.presentMonthCount,
    usableMonthCount,
    thinMonthCount: input.surface.thinMonthCount,
    missingMonthCount: input.surface.missingMonthCount,
    minimumCompleteMonths: input.minimumCompleteMonths,
    missingMonths: input.surface.missingMonths,
    thinMonths: input.surface.thinMonths,
    failureState: input.expectation.failureState,
    expectation: input.expectation.expectation,
    reasons,
  };
}

function detectorStatus(
  requirements: readonly DetectorSurfaceReadiness[],
): DetectorReadinessStatus {
  const required = requirements.filter((requirement) => requirement.required);
  if (required.some((requirement) => requirement.status === "blocked")) return "blocked";
  if (required.some((requirement) => requirement.status === "partial")) return "partial";
  return "ready";
}

function nextActionsFor(detector: DetectorReadinessSummary): string[] {
  if (detector.status === "policy_pending") {
    return [
      "Add an explicit detector calibration policy or record why historical calibration is not required.",
    ];
  }
  if (detector.status === "ready") {
    return [
      "Materialize baseline snapshots for the declared windows.",
      "Generate historical score vectors and threshold sensitivity summaries.",
    ];
  }
  return detector.requirements
    .filter((requirement) => requirement.required && requirement.status !== "ready")
    .map(
      (requirement) =>
        `${requirement.surfaceId}: ${requirement.failureState} (${requirement.usableMonthCount}/${requirement.minimumCompleteMonths} minimum usable months; ${requirement.missingMonthCount} missing, ${requirement.thinMonthCount} thin).`,
    );
}

function pendingPolicyDetectorSummary(input: {
  detectorId: string;
  detectorName: string;
}): DetectorReadinessSummary {
  const detector: DetectorReadinessSummary = {
    detectorId: input.detectorId,
    detectorName: input.detectorName,
    status: "policy_pending",
    releaseOutputWindow: "policy_pending",
    baselineWindowIds: [],
    minimumCompleteMonths: 0,
    requiredSurfaceIds: [],
    optionalSurfaceIds: [],
    requirements: [],
    blockingReasons: ["calibration_policy_pending"],
    nextActions: [],
  };
  return {
    ...detector,
    nextActions: nextActionsFor(detector),
  };
}

function detectorReadinessFromPolicy(input: {
  policy: DetectorCalibrationPolicy;
  surfaceById: ReadonlyMap<string, PolicySurfaceCoverageSummary>;
}): DetectorReadinessSummary {
  const minimumCompleteMonths = maximumMinimumCompleteMonths(input.policy);
  const requirements = input.policy.postBackfillValidation.map((expectation) =>
    surfaceReadiness({
      expectation,
      surface: input.surfaceById.get(expectation.surfaceId),
      minimumCompleteMonths,
    }),
  );
  const status = detectorStatus(requirements);
  const blockingReasons = requirements
    .filter((requirement) => requirement.required && requirement.status === "blocked")
    .flatMap((requirement) =>
      requirement.reasons.map((reason) => `${requirement.surfaceId}:${reason}`),
    );
  const detector: DetectorReadinessSummary = {
    detectorId: input.policy.detectorId,
    detectorName: input.policy.detectorName,
    status,
    releaseOutputWindow: input.policy.releaseOutputWindow,
    baselineWindowIds: [...input.policy.baselineWindowIds],
    minimumCompleteMonths,
    requiredSurfaceIds: input.policy.postBackfillValidation
      .filter((expectation) => expectation.required)
      .map((expectation) => expectation.surfaceId),
    optionalSurfaceIds: input.policy.postBackfillValidation
      .filter((expectation) => !expectation.required)
      .map((expectation) => expectation.surfaceId),
    requirements,
    blockingReasons,
    nextActions: [],
  };
  return {
    ...detector,
    nextActions: nextActionsFor(detector),
  };
}

export function buildAnalyticsDetectorReadinessAudit(
  input: BuildAnalyticsDetectorReadinessAuditInput,
): AnalyticsDetectorReadinessAudit {
  const surfaces = policySurfaceCoverage(input.backfillCoverage, input.directSurfaceCoverage);
  const surfaceById = new Map<string, PolicySurfaceCoverageSummary>(
    surfaces.map((surface) => [surface.surfaceId, surface]),
  );

  const policyByDetectorId = new Map(
    listDetectorCalibrationPolicies().map((policy) => [policy.detectorId, policy]),
  );
  const detectors = listAnalyticsDetectors().map((detector): DetectorReadinessSummary => {
    const policy = policyByDetectorId.get(detector.detectorId);
    if (policy === undefined) {
      return pendingPolicyDetectorSummary({
        detectorId: detector.detectorId,
        detectorName: detector.spec.name,
      });
    }
    return detectorReadinessFromPolicy({ policy, surfaceById });
  });

  const requiredRequirements = detectors.flatMap((detector) =>
    detector.requirements.filter((requirement) => requirement.required),
  );

  return {
    generatedAt: input.generatedAt,
    dbPath: input.dbPath,
    artifactPath: input.artifactPath,
    coverageArtifactPath: input.coverageArtifactPath,
    window: input.backfillCoverage.window,
    summary: {
      detectorCount: detectors.length,
      readyDetectorCount: detectors.filter((detector) => detector.status === "ready").length,
      partialDetectorCount: detectors.filter((detector) => detector.status === "partial").length,
      blockedDetectorCount: detectors.filter((detector) => detector.status === "blocked").length,
      policyPendingDetectorCount: detectors.filter(
        (detector) => detector.status === "policy_pending",
      ).length,
      requiredSurfaceCount: requiredRequirements.length,
      readyRequiredSurfaceCount: requiredRequirements.filter(
        (requirement) => requirement.status === "ready",
      ).length,
      partialRequiredSurfaceCount: requiredRequirements.filter(
        (requirement) => requirement.status === "partial",
      ).length,
      blockedRequiredSurfaceCount: requiredRequirements.filter(
        (requirement) => requirement.status === "blocked",
      ).length,
    },
    detectors,
    surfaceCoverage: surfaces,
  };
}
