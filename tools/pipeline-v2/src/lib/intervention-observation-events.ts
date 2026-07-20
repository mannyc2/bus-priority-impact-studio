import { treatmentRelevanceFor } from "@bp/analytics/intervention-evidence";
import type { IsoMonth } from "@bp/domain/primitives";
import type {
  StudioInterventionGeographyScope,
  StudioInterventionTreatmentFamily,
  StudioInterventionTreatmentKind,
  StudioRouteInterventionInventoryBundle,
} from "@bp/domain/studio";

export const INTERVENTION_OBSERVATION_ANCHOR_REJECTION_REASONS = [
  "unsupported_treatment_kind",
  "non_operational_lifecycle",
  "date_precision_insufficient",
  "source_unavailable",
  "scope_unresolved",
  "route_identity_mismatch",
  "occurrence_treatment_mismatch",
] as const;

export type InterventionObservationAnchorRejectionReason =
  (typeof INTERVENTION_OBSERVATION_ANCHOR_REJECTION_REASONS)[number];

export type InterventionObservationAnchor = {
  readonly routeId: string;
  readonly occurrenceId: string;
  readonly treatmentId: string;
  readonly treatmentKind: StudioInterventionTreatmentKind;
  readonly treatmentFamily: StudioInterventionTreatmentFamily;
  readonly specIds: readonly string[];
  readonly sourceId: string;
  readonly program: string | null;
  readonly effectiveDate: string;
  readonly implementationMonth: IsoMonth;
  readonly datePrecision: "day" | "month";
  readonly geographyScope: StudioInterventionGeographyScope;
};

export type InterventionObservationAnchorRejection = {
  readonly routeId: string;
  readonly occurrenceId: string;
  readonly treatmentId: string;
  readonly treatmentKind: StudioInterventionTreatmentKind | null;
  readonly reasons: readonly InterventionObservationAnchorRejectionReason[];
  readonly relevanceReasonId: string | null;
};

export type InterventionObservationEventGateResult = {
  readonly anchors: readonly InterventionObservationAnchor[];
  readonly rejections: readonly InterventionObservationAnchorRejection[];
  readonly exactDeduplicationCount: number;
};

const OPERATIONAL_LIFECYCLE_STATES = new Set([
  "current_confirmed",
  "implemented",
  "historical_confirmed",
]);
const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/u;
const ISO_DAY_OR_TIMESTAMP =
  /^\d{4}-(0[1-9]|1[0-2])-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/u;
const REASON_PRIORITY = new Map(
  INTERVENTION_OBSERVATION_ANCHOR_REJECTION_REASONS.map((reason, index) => [reason, index]),
);

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareIdentity(
  left: { readonly routeId: string; readonly occurrenceId: string; readonly treatmentId: string },
  right: { readonly routeId: string; readonly occurrenceId: string; readonly treatmentId: string },
): number {
  return (
    compareText(left.routeId, right.routeId) ||
    compareText(left.occurrenceId, right.occurrenceId) ||
    compareText(left.treatmentId, right.treatmentId)
  );
}

function implementationMonth(effectiveDate: string | null, datePrecision: string): IsoMonth | null {
  if (effectiveDate === null) return null;
  if (datePrecision === "month" && ISO_MONTH.test(effectiveDate)) {
    return effectiveDate as IsoMonth;
  }
  if (datePrecision === "day" && ISO_DAY_OR_TIMESTAMP.test(effectiveDate)) {
    return effectiveDate.slice(0, 7) as IsoMonth;
  }
  return null;
}

function hasUsableSourceLineage(
  bundle: StudioRouteInterventionInventoryBundle,
  occurrence: StudioRouteInterventionInventoryBundle["occurrences"][number],
): boolean {
  if (occurrence.sourceRefs.length === 0) return false;
  const sourceAvailable = (sourceKind: "local_registry" | "operational_occurrences") =>
    bundle.sourceStates.some(
      (state) => state.sourceKind === sourceKind && state.availability !== "unavailable",
    );
  return (
    (occurrence.registryLineage !== null && sourceAvailable("local_registry")) ||
    (occurrence.wikiOccurrenceId !== null && sourceAvailable("operational_occurrences"))
  );
}

function sortedReasons(
  reasons: ReadonlySet<InterventionObservationAnchorRejectionReason>,
): InterventionObservationAnchorRejectionReason[] {
  return [...reasons].sort(
    (left, right) => (REASON_PRIORITY.get(left) ?? 0) - (REASON_PRIORITY.get(right) ?? 0),
  );
}

export function classifyInterventionObservationEvents(
  bundle: StudioRouteInterventionInventoryBundle,
): InterventionObservationEventGateResult {
  const routeId = bundle.route.routeId;
  const treatmentCounts = new Map<string, number>();
  const treatments = new Map<
    string,
    StudioRouteInterventionInventoryBundle["treatments"][number]
  >();
  for (const treatment of bundle.treatments) {
    treatmentCounts.set(
      treatment.treatmentId,
      (treatmentCounts.get(treatment.treatmentId) ?? 0) + 1,
    );
    if (!treatments.has(treatment.treatmentId)) treatments.set(treatment.treatmentId, treatment);
  }

  const anchors: InterventionObservationAnchor[] = [];
  const rejections: InterventionObservationAnchorRejection[] = [];
  const seen = new Set<string>();
  let exactDeduplicationCount = 0;

  for (const occurrence of bundle.occurrences) {
    for (const treatmentId of occurrence.treatmentIds) {
      const deduplicationKey = JSON.stringify([occurrence.occurrenceId, routeId, treatmentId]);
      if (seen.has(deduplicationKey)) {
        exactDeduplicationCount += 1;
        continue;
      }
      seen.add(deduplicationKey);

      const treatment = treatments.get(treatmentId);
      const reasons = new Set<InterventionObservationAnchorRejectionReason>();
      let relevanceReasonId: string | null = null;
      if (
        occurrence.routeId !== routeId ||
        (occurrence.registryLineage !== null && occurrence.registryLineage.rawRouteId !== routeId)
      ) {
        reasons.add("route_identity_mismatch");
      }
      if (
        treatment === undefined ||
        treatmentCounts.get(treatmentId) !== 1 ||
        !treatment.occurrenceIds.includes(occurrence.occurrenceId) ||
        treatment.sourceRefs.length === 0
      ) {
        reasons.add("occurrence_treatment_mismatch");
      }

      const month = implementationMonth(occurrence.effectiveDate, occurrence.datePrecision);
      if (month === null) reasons.add("date_precision_insufficient");
      if (
        !OPERATIONAL_LIFECYCLE_STATES.has(occurrence.lifecycleState) ||
        (treatment !== undefined && !OPERATIONAL_LIFECYCLE_STATES.has(treatment.lifecycleState))
      ) {
        reasons.add("non_operational_lifecycle");
      }
      if (!hasUsableSourceLineage(bundle, occurrence)) reasons.add("source_unavailable");

      let specIds: readonly string[] = [];
      if (treatment !== undefined) {
        const relevance = treatmentRelevanceFor(treatment.treatmentKind);
        if (relevance.status !== "supported") {
          reasons.add("unsupported_treatment_kind");
          relevanceReasonId = relevance.reasonId;
        } else {
          specIds = relevance.specs
            .filter((spec) =>
              spec.supportedScopeKinds.some(
                (supportedScope) => supportedScope === occurrence.geographyScope,
              ),
            )
            .map((spec) => spec.specId)
            .sort(compareText);
          if (specIds.length === 0) reasons.add("scope_unresolved");
        }
      }

      if (reasons.size > 0 || treatment === undefined || month === null) {
        rejections.push({
          routeId,
          occurrenceId: occurrence.occurrenceId,
          treatmentId,
          treatmentKind: treatment?.treatmentKind ?? null,
          reasons: sortedReasons(reasons),
          relevanceReasonId,
        });
        continue;
      }
      anchors.push({
        routeId,
        occurrenceId: occurrence.occurrenceId,
        treatmentId,
        treatmentKind: treatment.treatmentKind,
        treatmentFamily: treatment.treatmentFamily,
        specIds,
        sourceId: occurrence.sourceId,
        program: occurrence.program,
        effectiveDate: occurrence.effectiveDate as string,
        implementationMonth: month,
        datePrecision: occurrence.datePrecision as "day" | "month",
        geographyScope: occurrence.geographyScope,
      });
    }
  }

  anchors.sort(compareIdentity);
  rejections.sort(compareIdentity);
  return { anchors, rejections, exactDeduplicationCount };
}
