import { createHash } from "node:crypto";
import { getFeatureContract, ROUTE_METRIC_HISTORY_FEATURE_GRAIN } from "@bp/analytics/features";
import {
  type InterventionEvidenceBinding,
  interventionEvidenceSpecFor,
} from "@bp/analytics/intervention-evidence";
import { type IsoMonth, IsoMonthSchema } from "@bp/domain/primitives";
import {
  interventionObservationBundleKey,
  type StudioInterventionObservationDataCoverage,
  type StudioInterventionObservationEvent,
  type StudioInterventionObservationIndex,
  StudioInterventionObservationIndexSchema,
  type StudioInterventionObservationInputRefs,
  type StudioInterventionObservationPoint,
  type StudioInterventionObservationSeries,
  type StudioRouteInterventionInventoryBundle,
  StudioRouteInterventionInventoryBundleSchema,
  type StudioRouteInterventionObservationBundle,
  StudioRouteInterventionObservationBundleSchema,
} from "@bp/domain/studio";
import type { CoverageWindow } from "@bp/domain/studio/shared";
import type { InterventionObservationTrendRow } from "./local-db-aggregates/intervention-observation-rows.ts";
import { decodeSchemaStrict } from "./schema-decode.ts";
import { isoMonthFromIndex, monthIndex } from "./study-engine/panel.ts";
import {
  admitTrustedRegistryStudyEvent,
  type TrustedRegistryStudyEventAdmission,
  type TrustedRegistryStudyEventRejectionReason,
} from "./study-engine/study-events.ts";

export type InterventionObservationAdmissionReason =
  | "admitted"
  | TrustedRegistryStudyEventRejectionReason;

export type InterventionObservationAdmissionSummary = {
  readonly admittedAnchorCount: number;
  readonly rejectedAnchorCount: number;
  readonly admissionReasonCounts: Readonly<Record<InterventionObservationAdmissionReason, number>>;
};

export type BuildInterventionObservationArtifactsInput = {
  readonly inventoryBundles: readonly StudioRouteInterventionInventoryBundle[];
  readonly trendRows: readonly InterventionObservationTrendRow[];
  readonly releaseId: string;
  readonly publishedAt: string;
};

export type BuildInterventionObservationArtifactsResult = {
  readonly bundles: readonly StudioRouteInterventionObservationBundle[];
  readonly index: StudioInterventionObservationIndex;
  readonly admissionSummary: InterventionObservationAdmissionSummary;
};

const ADMISSION_REASONS = [
  "admitted",
  "invalid_registry_implementation_date",
  "missing_route_id",
  "registry_event_not_implemented",
  "registry_month_date_mismatch",
  "unsupported_treatment_family",
  "untrusted_or_retired_registry_source",
] as const satisfies readonly InterventionObservationAdmissionReason[];

const ROUTE_BUNDLE_LIMITATIONS = [
  "Observation series are descriptive; only a gated StudyArtifact may support causal interpretation.",
] as const;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameCoverage(left: CoverageWindow, right: CoverageWindow): boolean {
  return left.start === right.start && left.end === right.end;
}

function admissionReasonCounts(): Record<InterventionObservationAdmissionReason, number> {
  return Object.fromEntries(ADMISSION_REASONS.map((reason) => [reason, 0])) as Record<
    InterventionObservationAdmissionReason,
    number
  >;
}

function observationEventId(routeId: string, occurrenceId: string, treatmentId: string): string {
  const digest = createHash("sha256")
    .update(JSON.stringify([routeId, occurrenceId, treatmentId]))
    .digest("hex")
    .slice(0, 24);
  return `observation-event:v1:${digest}`;
}

function exactInputRefs(): StudioInterventionObservationInputRefs {
  const contract = getFeatureContract(ROUTE_METRIC_HISTORY_FEATURE_GRAIN);
  if (contract === null) {
    throw new Error(`Missing feature contract for ${ROUTE_METRIC_HISTORY_FEATURE_GRAIN}`);
  }
  if (contract.resolverId !== "sqlite.local_route_month_trend.history.v1") {
    throw new Error(`Unexpected route metric history resolver: ${contract.resolverId}`);
  }
  return [
    {
      dataProductId: "studio_route_intervention_inventory",
      role: "event_anchor",
      featureGrain: null,
      resolverId: null,
    },
    {
      dataProductId: "local_route_month_trends_history",
      role: "observation_source",
      featureGrain: ROUTE_METRIC_HISTORY_FEATURE_GRAIN,
      resolverId: contract.resolverId,
    },
  ];
}

function monthKeys(implementationMonth: string, binding: InterventionEvidenceBinding): IsoMonth[] {
  const anchor = monthIndex(implementationMonth);
  const start = anchor - binding.window.monthsBefore;
  const end = anchor + binding.window.monthsAfter;
  return Array.from({ length: end - start + 1 }, (_, index) =>
    decodeSchemaStrict(IsoMonthSchema, isoMonthFromIndex(start + index)),
  );
}

function trendPoint(
  binding: InterventionEvidenceBinding,
  month: IsoMonth,
  row: InterventionObservationTrendRow | undefined,
): StudioInterventionObservationPoint {
  if (binding.sourceField === "average_speed_mph") {
    if (
      row === undefined ||
      !row.has_speed_trend ||
      !Number.isFinite(row.average_speed_mph) ||
      row.speed_observation_count <= 0
    ) {
      return { month, value: null, sampleCount: null };
    }
    return {
      month,
      value: row.average_speed_mph,
      sampleCount: row.speed_observation_count,
    };
  }
  if (
    row === undefined ||
    !row.has_ridership_trend ||
    row.ridership === null ||
    !Number.isFinite(row.ridership) ||
    row.ridership < 0
  ) {
    return { month, value: null, sampleCount: null };
  }
  return { month, value: row.ridership, sampleCount: null };
}

function observationSeries(
  binding: InterventionEvidenceBinding,
  implementationMonth: IsoMonth,
  rowsByMonth: ReadonlyMap<string, InterventionObservationTrendRow>,
): StudioInterventionObservationSeries {
  const requestedMonths = monthKeys(implementationMonth, binding);
  const requestedStart = requestedMonths[0];
  const requestedEnd = requestedMonths.at(-1);
  if (requestedStart === undefined || requestedEnd === undefined) {
    throw new Error(`Binding ${binding.bindingId} produced an empty observation window`);
  }
  const points = requestedMonths.map((month) => trendPoint(binding, month, rowsByMonth.get(month)));
  const observedMonths = points.flatMap((point) => (point.value === null ? [] : [point.month]));
  const status =
    observedMonths.length === 0
      ? "missing"
      : observedMonths.length === points.length
        ? "available"
        : "partial";
  return {
    bindingId: binding.bindingId,
    metricId: binding.metricId,
    label: binding.label,
    unit: binding.unit,
    role: binding.role,
    grain: "month",
    dataProductId: "local_route_month_trends_history",
    resolverId: binding.resolverId as "sqlite.local_route_month_trend.history.v1",
    claimCeiling: binding.claimCeiling,
    presentationPriority: binding.presentationPriority,
    status,
    coverage: {
      requestedStart,
      requestedEnd,
      expectedPointCount: points.length,
      observedStart: observedMonths[0] ?? null,
      observedEnd: observedMonths.at(-1) ?? null,
      observedPointCount: observedMonths.length,
      nullPointCount: points.length - observedMonths.length,
    },
    points,
    limitations: [
      `${observedMonths.length} of ${points.length} requested route-month values are published.`,
    ],
  };
}

function eventResolution(
  series: readonly StudioInterventionObservationSeries[],
): "available" | "partial" | "missing" {
  if (series.every((item) => item.status === "available")) return "available";
  if (series.every((item) => item.status === "missing")) return "missing";
  return "partial";
}

function bundleDataCoverage(
  events: readonly StudioInterventionObservationEvent[],
): StudioInterventionObservationDataCoverage {
  const months = events.flatMap((event) =>
    event.series.flatMap((series) =>
      series.points.flatMap((point) => (point.value === null ? [] : [point.month])),
    ),
  );
  months.sort(compareText);
  return { start: months[0] ?? null, end: months.at(-1) ?? null, grain: "month" };
}

function indexDataCoverage(
  bundles: readonly StudioRouteInterventionObservationBundle[],
): StudioInterventionObservationDataCoverage {
  const starts = bundles.flatMap((bundle) =>
    bundle.dataCoverage.start === null ? [] : [bundle.dataCoverage.start],
  );
  const ends = bundles.flatMap((bundle) =>
    bundle.dataCoverage.end === null ? [] : [bundle.dataCoverage.end],
  );
  starts.sort(compareText);
  ends.sort(compareText);
  return { start: starts[0] ?? null, end: ends.at(-1) ?? null, grain: "month" };
}

function assertSortedUnique(values: readonly string[], label: string): void {
  let previous = values[0];
  if (previous === undefined) {
    throw new Error(`${label} must be nonempty, sorted, and unique`);
  }
  for (const value of values.slice(1)) {
    if (compareText(previous, value) >= 0) {
      throw new Error(`${label} must be nonempty, sorted, and unique`);
    }
    previous = value;
  }
}

function lineageAdmission(
  occurrence: StudioRouteInterventionInventoryBundle["occurrences"][number],
): TrustedRegistryStudyEventAdmission {
  const lineage = occurrence.registryLineage;
  if (lineage === null)
    throw new Error(`Occurrence ${occurrence.occurrenceId} has no registry lineage`);
  return admitTrustedRegistryStudyEvent({
    event_id: lineage.eventId,
    route_id: lineage.rawRouteId,
    intervention_type: lineage.rawInterventionType,
    source_id: lineage.sourceId,
    program: lineage.program,
    implementation_date: lineage.implementationDate,
    implementation_month: lineage.implementationMonth,
    event_status: lineage.rawStatus,
  });
}

export function buildInterventionObservationArtifacts(
  input: BuildInterventionObservationArtifactsInput,
): BuildInterventionObservationArtifactsResult {
  if (input.inventoryBundles.length === 0) {
    throw new Error("At least one Plan 091 inventory bundle is required");
  }
  const inventoryBundles = input.inventoryBundles.map((bundle) =>
    decodeSchemaStrict(StudioRouteInterventionInventoryBundleSchema, bundle),
  );
  const firstInventoryBundle = inventoryBundles[0];
  if (firstInventoryBundle === undefined) {
    throw new Error("At least one decoded Plan 091 inventory bundle is required");
  }
  const publicationCoverage = firstInventoryBundle.coverage;
  const routeIds = new Set<string>();
  for (const bundle of inventoryBundles) {
    if (bundle.releaseId !== input.releaseId || bundle.publishedAt !== input.publishedAt) {
      throw new Error(`Inventory release identity mismatch for route ${bundle.route.routeId}`);
    }
    if (!sameCoverage(bundle.coverage, publicationCoverage)) {
      throw new Error(`Inventory coverage mismatch for route ${bundle.route.routeId}`);
    }
    if (routeIds.has(bundle.route.routeId)) {
      throw new Error(`Duplicate inventory route ${bundle.route.routeId}`);
    }
    routeIds.add(bundle.route.routeId);
  }

  const trendByRouteMonth = new Map<string, InterventionObservationTrendRow>();
  for (const row of input.trendRows) {
    const key = `${row.route_id}\u0000${row.month}`;
    if (trendByRouteMonth.has(key)) throw new Error(`Duplicate route trend row ${key}`);
    trendByRouteMonth.set(key, row);
  }

  const reasonCounts = admissionReasonCounts();
  let admittedAnchorCount = 0;
  let rejectedAnchorCount = 0;
  const registryEventIds = new Set<string>();
  const eventIds = new Set<string>();
  const compositeKeys = new Set<string>();
  const inputRefs = exactInputRefs();
  const bundles: StudioRouteInterventionObservationBundle[] = [];

  for (const inventoryBundle of inventoryBundles) {
    const treatmentById = new Map(
      inventoryBundle.treatments.map((treatment) => [treatment.treatmentId, treatment]),
    );
    if (treatmentById.size !== inventoryBundle.treatments.length) {
      throw new Error(`Duplicate treatment ID in inventory route ${inventoryBundle.route.routeId}`);
    }
    const occurrenceIds = new Set<string>();
    const events: StudioInterventionObservationEvent[] = [];
    const routeTrendRows = new Map<string, InterventionObservationTrendRow>();
    for (const row of input.trendRows) {
      if (row.route_id === inventoryBundle.route.routeId) routeTrendRows.set(row.month, row);
    }

    for (const occurrence of inventoryBundle.occurrences) {
      if (occurrenceIds.has(occurrence.occurrenceId)) {
        throw new Error(`Duplicate occurrence ID ${occurrence.occurrenceId}`);
      }
      occurrenceIds.add(occurrence.occurrenceId);
      if (occurrence.routeId !== inventoryBundle.route.routeId) {
        throw new Error(`Occurrence ${occurrence.occurrenceId} route does not match its bundle`);
      }
      assertSortedUnique(
        occurrence.treatmentIds,
        `Occurrence ${occurrence.occurrenceId} treatments`,
      );
      for (const treatmentId of occurrence.treatmentIds) {
        if (!treatmentById.has(treatmentId)) {
          throw new Error(
            `Occurrence ${occurrence.occurrenceId} references missing ${treatmentId}`,
          );
        }
      }
      const lineage = occurrence.registryLineage;
      if (lineage === null) continue;
      if (registryEventIds.has(lineage.eventId)) {
        throw new Error(`Duplicate registry lineage event ID ${lineage.eventId}`);
      }
      registryEventIds.add(lineage.eventId);
      const admission = lineageAdmission(occurrence);
      if (admission.status === "rejected") {
        rejectedAnchorCount += 1;
        for (const reason of admission.reasons) reasonCounts[reason] += 1;
        continue;
      }
      admittedAnchorCount += 1;
      reasonCounts.admitted += 1;
      if (admission.routeId !== inventoryBundle.route.routeId) {
        throw new Error(`Registry route mismatch for occurrence ${occurrence.occurrenceId}`);
      }
      const occurrenceDay = occurrence.effectiveDate?.slice(0, 10) ?? null;
      if (
        occurrenceDay !== admission.implementationDate ||
        occurrenceDay?.slice(0, 7) !== admission.implementationMonth
      ) {
        throw new Error(`Registry date mismatch for occurrence ${occurrence.occurrenceId}`);
      }
      const implementationMonth = decodeSchemaStrict(IsoMonthSchema, admission.implementationMonth);

      for (const treatmentId of occurrence.treatmentIds) {
        const treatment = treatmentById.get(treatmentId);
        if (treatment === undefined) {
          throw new Error(
            `Occurrence ${occurrence.occurrenceId} references missing ${treatmentId}`,
          );
        }
        const disposition = interventionEvidenceSpecFor(treatment.treatmentKind);
        const eventId = observationEventId(
          inventoryBundle.route.routeId,
          occurrence.occurrenceId,
          treatmentId,
        );
        const compositeKey = `${occurrence.occurrenceId}\u0000${treatmentId}`;
        if (eventIds.has(eventId)) throw new Error(`Duplicate observation event ID ${eventId}`);
        if (compositeKeys.has(compositeKey)) {
          throw new Error(`Duplicate occurrence/treatment pair ${compositeKey}`);
        }
        eventIds.add(eventId);
        compositeKeys.add(compositeKey);

        if (disposition.status === "unsupported_treatment_family") {
          events.push({
            eventId,
            occurrenceId: occurrence.occurrenceId,
            treatmentId,
            routeId: inventoryBundle.route.routeId,
            treatmentKind: treatment.treatmentKind,
            analysisFamily: null,
            program: admission.program,
            sourceId: admission.sourceId,
            implementationDate: admission.implementationDate,
            implementationMonth,
            resolutionStatus: "unsupported_treatment_family",
            series: [],
          });
          continue;
        }
        if (admission.treatmentFamily !== disposition.analysisFamily) {
          throw new Error(`ACE study-family mismatch for occurrence ${occurrence.occurrenceId}`);
        }
        if (occurrence.geographyScope !== "route" || treatment.geographyScope !== "route") {
          events.push({
            eventId,
            occurrenceId: occurrence.occurrenceId,
            treatmentId,
            routeId: inventoryBundle.route.routeId,
            treatmentKind: treatment.treatmentKind,
            analysisFamily: disposition.analysisFamily,
            program: admission.program,
            sourceId: admission.sourceId,
            implementationDate: admission.implementationDate,
            implementationMonth,
            resolutionStatus: "unsupported_scope",
            series: [],
          });
          continue;
        }
        const series = disposition.spec.bindings
          .map((binding) => observationSeries(binding, implementationMonth, routeTrendRows))
          .sort((left, right) => left.presentationPriority - right.presentationPriority);
        events.push({
          eventId,
          occurrenceId: occurrence.occurrenceId,
          treatmentId,
          routeId: inventoryBundle.route.routeId,
          treatmentKind: treatment.treatmentKind,
          analysisFamily: disposition.analysisFamily,
          program: admission.program,
          sourceId: admission.sourceId,
          implementationDate: admission.implementationDate,
          implementationMonth,
          resolutionStatus: eventResolution(series),
          series,
        });
      }
    }

    if (events.length === 0) continue;
    events.sort(
      (left, right) =>
        compareText(left.implementationMonth, right.implementationMonth) ||
        compareText(left.occurrenceId, right.occurrenceId) ||
        compareText(left.treatmentId, right.treatmentId),
    );
    bundles.push(
      decodeSchemaStrict(StudioRouteInterventionObservationBundleSchema, {
        artifactKind: "bp.studio.route_intervention_observations.v1",
        schemaVersion: 1,
        releaseId: input.releaseId,
        publishedAt: input.publishedAt,
        coverage: publicationCoverage,
        route: inventoryBundle.route,
        routeId: inventoryBundle.route.routeId,
        routeSlug: inventoryBundle.routeSlug,
        dataCoverage: bundleDataCoverage(events),
        inputRefs,
        events,
        limitations: ROUTE_BUNDLE_LIMITATIONS,
      }),
    );
  }

  bundles.sort(
    (left, right) =>
      compareText(left.routeSlug, right.routeSlug) || compareText(left.routeId, right.routeId),
  );
  const indexEvents = bundles
    .flatMap((bundle) =>
      bundle.events.map((event) => ({
        eventId: event.eventId,
        occurrenceId: event.occurrenceId,
        treatmentId: event.treatmentId,
        routeId: event.routeId,
        routeSlug: bundle.routeSlug,
        treatmentKind: event.treatmentKind,
        analysisFamily: event.analysisFamily,
        program: event.program,
        sourceId: event.sourceId,
        implementationDate: event.implementationDate,
        implementationMonth: event.implementationMonth,
        resolutionStatus: event.resolutionStatus,
        availableMetricIds: event.series
          .filter((series) => series.status !== "missing")
          .map((series) => series.metricId)
          .sort(compareText),
        bundleKey: interventionObservationBundleKey(bundle.routeSlug),
      })),
    )
    .sort(
      (left, right) =>
        compareText(left.implementationMonth, right.implementationMonth) ||
        compareText(left.routeSlug, right.routeSlug) ||
        compareText(left.occurrenceId, right.occurrenceId) ||
        compareText(left.treatmentId, right.treatmentId) ||
        compareText(left.eventId, right.eventId),
    );
  const index = decodeSchemaStrict(StudioInterventionObservationIndexSchema, {
    artifactKind: "bp.studio.intervention_observation_index.v1",
    schemaVersion: 1,
    releaseId: input.releaseId,
    publishedAt: input.publishedAt,
    coverage: publicationCoverage,
    dataCoverage: indexDataCoverage(bundles),
    inputRefs,
    events: indexEvents,
  });

  return {
    bundles,
    index,
    admissionSummary: {
      admittedAnchorCount,
      rejectedAnchorCount,
      admissionReasonCounts: reasonCounts,
    },
  };
}
