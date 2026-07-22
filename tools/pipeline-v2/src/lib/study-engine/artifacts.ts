import { routeSpeedSpineRouteSlug } from "@bp/analytics/feature-history";
import type {
  RouteStudiesArtifact,
  StudyArtifact,
  StudyEstimateVariant,
  StudyEventCandidateV3,
  StudyIndexArtifact,
  StudySensitivityEstimate,
} from "@bp/domain/studio/study";
import type { StudyEstimatorResult, StudyEstimatorVariant } from "./estimator.ts";

export const STUDY_ENGINE_VERSION = "segment-matched-did-v2";

function artifactEventKey(candidate: StudyEventCandidateV3): string {
  return candidate.candidateId.replaceAll(":", "-").toLowerCase();
}

function artifactVariant(
  variant: StudyEstimatorVariant,
  unmatchedSourceRows: number,
): StudyEstimateVariant {
  const estimate = variant.estimate;
  return {
    effectMph: estimate?.effectMph ?? null,
    effectPercent: estimate?.effectPercent ?? null,
    confidenceInterval: variant.confidenceInterval,
    windowMeans:
      estimate === null
        ? null
        : {
            treatedPreMeanMph: estimate.treatedPreMeanMph,
            treatedPostMeanMph: estimate.treatedPostMeanMph,
            controlPreMeanMph: estimate.controlPreMeanMph,
            controlPostMeanMph: estimate.controlPostMeanMph,
          },
    matchedSegmentCount: variant.matchedSegmentCount,
    eligibleControlSegmentCount: variant.eligibleControlSegmentCount,
    dropped: { ...variant.dropped, unmatchedSourceRows },
    monthlySeries: variant.monthlySeries,
  };
}

function artifactSensitivity(
  sensitivity: StudyEstimatorResult["sensitivityEstimates"]["congestionPricing"],
): StudySensitivityEstimate | null {
  if (sensitivity === null) return null;
  return {
    reason: sensitivity.reason,
    excludedMonths: sensitivity.excludedMonths,
    effectMph: sensitivity.variant.estimate?.effectMph ?? null,
    effectPercent: sensitivity.variant.estimate?.effectPercent ?? null,
    confidenceInterval: sensitivity.variant.confidenceInterval,
  };
}

export function buildStudyArtifact(input: {
  readonly candidate: StudyEventCandidateV3;
  readonly candidateSetId: string;
  readonly reviewCutId?: string | undefined;
  readonly analysisMonth: string;
  readonly treatedSegmentScope: "all_route_spines" | "lane_overlap_spines";
  readonly treatedSpineSegmentIds: readonly string[];
  readonly estimator: StudyEstimatorResult;
  readonly allDayUnmatchedSourceRows: number;
  readonly peakUnmatchedSourceRows: number;
  readonly dataWindow: { readonly startMonth: string; readonly endMonth: string };
  readonly speedSpineArtifactPaths: readonly string[];
  readonly excludedControlRouteIds: readonly string[];
}): StudyArtifact {
  const routeSlug = routeSpeedSpineRouteSlug(input.candidate.routeId);
  return {
    artifactKind: "bp.studio.segment_study.v1",
    schemaVersion: 1,
    eventKey: artifactEventKey(input.candidate),
    candidateId: input.candidate.candidateId,
    candidateSetId: input.candidateSetId,
    ...(input.reviewCutId === undefined ? {} : { reviewCutId: input.reviewCutId }),
    routeId: input.candidate.routeId,
    routeSlug,
    treatmentFamily: input.candidate.treatmentFamily,
    implementationDate: input.candidate.implementationDate,
    implementationMonth: input.candidate.implementationMonth,
    treatedSegmentScope: input.treatedSegmentScope,
    treatedSpineSegmentIds: [...input.treatedSpineSegmentIds].toSorted(),
    evaluationLevel: input.estimator.evaluationLevel,
    claimTier: input.estimator.claimTier,
    direction: input.estimator.direction,
    gates: input.estimator.gates,
    variants: {
      allDay: artifactVariant(input.estimator.allDay, input.allDayUnmatchedSourceRows),
      peakHours: artifactVariant(input.estimator.peakHours, input.peakUnmatchedSourceRows),
    },
    placeboEffectMph: input.estimator.placeboEffectMph,
    sensitivityEstimates: {
      congestionPricing: artifactSensitivity(
        input.estimator.sensitivityEstimates.congestionPricing,
      ),
      queensRedesign: artifactSensitivity(input.estimator.sensitivityEstimates.queensRedesign),
    },
    provenance: {
      engineVersion: STUDY_ENGINE_VERSION,
      event: input.candidate.provenance,
      sourceTable: "local_route_segment_speed",
      analysisMonth: input.analysisMonth,
      dataWindow: input.dataWindow,
      speedSpineArtifactPaths: [...input.speedSpineArtifactPaths].toSorted(),
      excludedControlRouteIds: [...input.excludedControlRouteIds].toSorted(),
    },
  };
}

export function buildStudyArtifactCollections(input: {
  readonly studies: readonly StudyArtifact[];
  readonly analysisMonth: string;
}): {
  readonly index: StudyIndexArtifact;
  readonly routeRollups: readonly RouteStudiesArtifact[];
} {
  const studies = [...input.studies].toSorted(
    (left, right) =>
      left.implementationMonth.localeCompare(right.implementationMonth) ||
      left.eventKey.localeCompare(right.eventKey),
  );
  if (studies.length > 500) throw new Error(`Study index cap exceeded: ${studies.length} > 500`);
  const reviewCutStudyCount = studies.filter((study) => study.reviewCutId !== undefined).length;
  const reviewCutIds = new Set(
    studies.flatMap((study) => (study.reviewCutId === undefined ? [] : [study.reviewCutId])),
  );
  if (
    reviewCutIds.size > 1 ||
    (reviewCutStudyCount > 0 && reviewCutStudyCount !== studies.length)
  ) {
    throw new Error("Study artifact collection cannot mix review cuts");
  }
  const reviewCutId = [...reviewCutIds][0];
  const index: StudyIndexArtifact = {
    artifactKind: "bp.studio.segment_study_index.v1",
    schemaVersion: 1,
    analysisMonth: input.analysisMonth,
    ...(reviewCutId === undefined ? {} : { reviewCutId }),
    studies: studies.map((study) => ({
      eventKey: study.eventKey,
      routeId: study.routeId,
      routeSlug: study.routeSlug,
      treatmentFamily: study.treatmentFamily,
      implementationMonth: study.implementationMonth,
      effectMph: study.variants.allDay.effectMph,
      confidenceInterval: study.variants.allDay.confidenceInterval,
      evaluationLevel: study.evaluationLevel,
      claimTier: study.claimTier,
      direction: study.direction,
    })),
  };
  const byRoute = new Map<string, StudyArtifact[]>();
  for (const study of studies) {
    const routeStudies = byRoute.get(study.routeId) ?? [];
    routeStudies.push(study);
    byRoute.set(study.routeId, routeStudies);
  }
  const routeRollups = [...byRoute.entries()]
    .map(([routeId, routeStudies]) => {
      const cappedStudies = routeStudies
        .toSorted(
          (left, right) =>
            right.implementationMonth.localeCompare(left.implementationMonth) ||
            left.eventKey.localeCompare(right.eventKey),
        )
        .slice(0, 20);
      const first = cappedStudies[0];
      if (first === undefined) throw new Error(`Empty route study group for ${routeId}`);
      return {
        artifactKind: "bp.studio.route_studies.v1" as const,
        schemaVersion: 1 as const,
        analysisMonth: input.analysisMonth,
        routeId,
        routeSlug: first.routeSlug,
        studies: cappedStudies,
      };
    })
    .toSorted((left, right) => left.routeId.localeCompare(right.routeId));
  return { index, routeRollups };
}
