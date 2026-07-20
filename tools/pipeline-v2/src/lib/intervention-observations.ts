import { createHash } from "node:crypto";
import { getFeatureContract, ROUTE_METRIC_HISTORY_FEATURE_GRAIN } from "@bp/analytics/features";
import {
  type TreatmentRelevanceBinding,
  type TreatmentRelevanceScopeSemantic,
  type TreatmentRelevanceSpec,
  treatmentRelevanceFor,
} from "@bp/analytics/intervention-evidence";
import { type IsoMonth, IsoMonthSchema } from "@bp/domain/primitives";
import {
  interventionObservationBundleKey,
  type StudioInterventionObservationAnalysisFamily,
  type StudioInterventionObservationBindingId,
  StudioInterventionObservationBindingIdSchema,
  type StudioInterventionObservationBindingRole,
  type StudioInterventionObservationDataCoverage,
  type StudioInterventionObservationEvent,
  type StudioInterventionObservationGeographyScope,
  type StudioInterventionObservationIndex,
  StudioInterventionObservationIndexSchema,
  type StudioInterventionObservationInputRefs,
  type StudioInterventionObservationPoint,
  type StudioInterventionObservationSeries,
  type StudioInterventionObservationSpecId,
  type StudioRouteInterventionInventoryBundle,
  StudioRouteInterventionInventoryBundleSchema,
  type StudioRouteInterventionObservationBundle,
  StudioRouteInterventionObservationBundleSchema,
} from "@bp/domain/studio";
import type { CoverageWindow } from "@bp/domain/studio/shared";
import {
  classifyInterventionObservationEvents,
  type InterventionObservationAnchor,
  type InterventionObservationAnchorRejectionReason,
} from "./intervention-observation-events.ts";
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
  | InterventionObservationAnchorRejectionReason
  | TrustedRegistryStudyEventRejectionReason;

export type InterventionObservationAdmissionSummary = {
  readonly admittedAnchorCount: number;
  readonly rejectedAnchorCount: number;
  readonly exactDeduplicationCount: number;
  readonly admissionReasonCounts: Readonly<Record<InterventionObservationAdmissionReason, number>>;
  readonly relevanceReasonCounts: Readonly<Record<string, number>>;
};

export type InterventionObservationCount<Row extends string> = Readonly<Record<Row, string>> & {
  readonly count: number;
};

export type InterventionObservationResolutionSummary = {
  readonly treatmentKindCounts: readonly InterventionObservationCount<"treatmentKind">[];
  readonly specCounts: readonly InterventionObservationCount<"specId">[];
  readonly sourceCounts: readonly InterventionObservationCount<"sourceId">[];
  readonly resolutionStatusCounts: readonly InterventionObservationCount<"resolutionStatus">[];
};

type PreparedBinding = {
  readonly binding: TreatmentRelevanceBinding;
  readonly role: StudioInterventionObservationBindingRole;
  readonly methodLimitation: string | null;
};

type PreparedAnchor = {
  readonly anchor: InterventionObservationAnchor;
  readonly analysisFamily: Exclude<StudioInterventionObservationAnalysisFamily, null>;
  readonly specId: Exclude<StudioInterventionObservationSpecId, null>;
  readonly implementationDate: string;
  readonly implementationMonth: IsoMonth;
  readonly datePrecision: "day" | "month";
  readonly geographyScope: StudioInterventionObservationGeographyScope;
  readonly program: string | null;
  readonly sourceId: string;
  readonly bindings: readonly PreparedBinding[];
};

type PreparedRoute = {
  readonly inventoryBundle: StudioRouteInterventionInventoryBundle;
  readonly anchors: readonly PreparedAnchor[];
};

export type PreparedInterventionObservationArtifacts = {
  readonly releaseId: string;
  readonly publishedAt: string;
  readonly coverage: CoverageWindow;
  readonly inputRefs: StudioInterventionObservationInputRefs;
  readonly routes: readonly PreparedRoute[];
  readonly admissionSummary: InterventionObservationAdmissionSummary;
};

export type PrepareInterventionObservationArtifactsInput = {
  readonly inventoryBundles: readonly StudioRouteInterventionInventoryBundle[];
  readonly releaseId: string;
  readonly publishedAt: string;
  readonly coverage: { readonly start: string | null; readonly end: string };
};

export type BuildInterventionObservationArtifactsInput =
  PrepareInterventionObservationArtifactsInput & {
    readonly trendRows: readonly InterventionObservationTrendRow[];
  };

export type BuildInterventionObservationArtifactsResult = {
  readonly bundles: readonly StudioRouteInterventionObservationBundle[];
  readonly index: StudioInterventionObservationIndex;
  readonly admissionSummary: InterventionObservationAdmissionSummary;
  readonly resolutionSummary: InterventionObservationResolutionSummary;
};

const ADMISSION_REASONS = [
  "admitted",
  "unsupported_treatment_kind",
  "non_operational_lifecycle",
  "date_precision_insufficient",
  "source_unavailable",
  "scope_unresolved",
  "route_identity_mismatch",
  "occurrence_treatment_mismatch",
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

function sameCoverage(
  left: { readonly start: string | null; readonly end: string },
  right: { readonly start: string | null; readonly end: string },
): boolean {
  return left.start === right.start && left.end === right.end;
}

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function countRows<Row extends string>(
  counts: ReadonlyMap<string, number>,
  field: Row,
): InterventionObservationCount<Row>[] {
  return [...counts]
    .sort(([left], [right]) => compareText(left, right))
    .map(([value, count]) => ({ [field]: value, count }) as InterventionObservationCount<Row>);
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

function lineageAdmission(
  occurrence: StudioRouteInterventionInventoryBundle["occurrences"][number],
): TrustedRegistryStudyEventAdmission | null {
  const lineage = occurrence.registryLineage;
  if (lineage === null) return null;
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

function scopeSemantic(
  spec: TreatmentRelevanceSpec,
  binding: TreatmentRelevanceBinding,
  geographyScope: StudioInterventionObservationGeographyScope,
): TreatmentRelevanceScopeSemantic & {
  readonly status: "supported";
  readonly role: StudioInterventionObservationBindingRole;
} {
  const semantic = binding.scopeSemantics.find((item) => item.scopeKind === geographyScope);
  if (semantic?.status !== "supported" || semantic.role === null) {
    throw new Error(`Spec ${spec.specId} does not support ${binding.bindingId}:${geographyScope}`);
  }
  return semantic as TreatmentRelevanceScopeSemantic & {
    readonly status: "supported";
    readonly role: StudioInterventionObservationBindingRole;
  };
}

function preparedBindings(
  spec: TreatmentRelevanceSpec,
  geographyScope: StudioInterventionObservationGeographyScope,
): PreparedBinding[] {
  return spec.bindings.map((binding) => {
    const semantic = scopeSemantic(spec, binding, geographyScope);
    return {
      binding,
      role: semantic.role,
      methodLimitation: semantic.methodLimitation,
    };
  });
}

export function prepareInterventionObservationArtifacts(
  input: PrepareInterventionObservationArtifactsInput,
): PreparedInterventionObservationArtifacts {
  if (input.inventoryBundles.length === 0) {
    throw new Error("At least one Plan 091 inventory bundle is required");
  }
  const inventoryBundles = input.inventoryBundles.map((bundle) =>
    decodeSchemaStrict(StudioRouteInterventionInventoryBundleSchema, bundle),
  );
  const publicationCoverage = inventoryBundles[0]?.coverage;
  if (publicationCoverage === undefined) {
    throw new Error("At least one decoded Plan 091 inventory bundle is required");
  }
  const routeIds = new Set<string>();
  for (const bundle of inventoryBundles) {
    if (
      bundle.releaseId !== input.releaseId ||
      bundle.publishedAt !== input.publishedAt ||
      !sameCoverage(bundle.coverage, input.coverage)
    ) {
      throw new Error(`Inventory release identity mismatch for route ${bundle.route.routeId}`);
    }
    if (routeIds.has(bundle.route.routeId)) {
      throw new Error(`Duplicate inventory route ${bundle.route.routeId}`);
    }
    routeIds.add(bundle.route.routeId);
  }

  const reasonCounts = admissionReasonCounts();
  const relevanceReasonCounts = new Map<string, number>();
  const routes: PreparedRoute[] = [];
  const compositeKeys = new Set<string>();
  let admittedAnchorCount = 0;
  let rejectedAnchorCount = 0;
  let exactDeduplicationCount = 0;

  for (const inventoryBundle of inventoryBundles) {
    const gate = classifyInterventionObservationEvents(inventoryBundle);
    exactDeduplicationCount += gate.exactDeduplicationCount;
    rejectedAnchorCount += gate.rejections.length;
    for (const rejection of gate.rejections) {
      for (const reason of rejection.reasons) reasonCounts[reason] += 1;
      if (rejection.relevanceReasonId !== null) {
        increment(relevanceReasonCounts, rejection.relevanceReasonId);
      }
    }

    const occurrences = new Map(
      inventoryBundle.occurrences.map((occurrence) => [occurrence.occurrenceId, occurrence]),
    );
    const prepared: PreparedAnchor[] = [];
    for (const anchor of gate.anchors) {
      if (anchor.specIds.length !== 1) {
        throw new Error(`Anchor ${anchor.occurrenceId}/${anchor.treatmentId} must select one spec`);
      }
      const relevance = treatmentRelevanceFor(anchor.treatmentKind);
      if (relevance.status !== "supported") {
        throw new Error(`Gate admitted unsupported treatment ${anchor.treatmentKind}`);
      }
      const spec = relevance.specs.find((candidate) => candidate.specId === anchor.specIds[0]);
      if (spec === undefined)
        throw new Error(`Missing prepared relevance spec ${anchor.specIds[0]}`);
      const occurrence = occurrences.get(anchor.occurrenceId);
      if (occurrence === undefined) throw new Error(`Missing occurrence ${anchor.occurrenceId}`);

      let implementationDate =
        anchor.datePrecision === "day" ? anchor.effectiveDate.slice(0, 10) : anchor.effectiveDate;
      let implementationMonth = anchor.implementationMonth;
      let datePrecision = anchor.datePrecision;
      let program = anchor.program;
      let sourceId = anchor.sourceId;
      if (anchor.treatmentKind === "automated_bus_lane_enforcement") {
        const admission = lineageAdmission(occurrence);
        if (admission === null) {
          rejectedAnchorCount += 1;
          reasonCounts.untrusted_or_retired_registry_source += 1;
          continue;
        }
        if (admission.status === "rejected") {
          rejectedAnchorCount += 1;
          for (const reason of admission.reasons) reasonCounts[reason] += 1;
          continue;
        }
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
        if (admission.treatmentFamily !== spec.analysisFamily) {
          throw new Error(`ACE study-family mismatch for occurrence ${occurrence.occurrenceId}`);
        }
        implementationDate = admission.implementationDate;
        implementationMonth = decodeSchemaStrict(IsoMonthSchema, admission.implementationMonth);
        datePrecision = "day";
        program = admission.program;
        sourceId = admission.sourceId;
      }

      const compositeKey = [anchor.routeId, anchor.occurrenceId, anchor.treatmentId].join("\u0000");
      if (compositeKeys.has(compositeKey)) {
        throw new Error(`Duplicate route/occurrence/treatment pair ${compositeKey}`);
      }
      compositeKeys.add(compositeKey);
      admittedAnchorCount += 1;
      reasonCounts.admitted += 1;
      prepared.push({
        anchor,
        analysisFamily: spec.analysisFamily as Exclude<
          StudioInterventionObservationAnalysisFamily,
          null
        >,
        specId: spec.specId as Exclude<StudioInterventionObservationSpecId, null>,
        implementationDate,
        implementationMonth,
        datePrecision,
        geographyScope: anchor.geographyScope,
        program,
        sourceId,
        bindings: preparedBindings(spec, anchor.geographyScope),
      });
    }
    prepared.sort(
      (left, right) =>
        compareText(left.implementationMonth, right.implementationMonth) ||
        compareText(left.anchor.occurrenceId, right.anchor.occurrenceId) ||
        compareText(left.anchor.treatmentId, right.anchor.treatmentId),
    );
    if (prepared.length > 0) routes.push({ inventoryBundle, anchors: prepared });
  }
  routes.sort(
    (left, right) =>
      compareText(left.inventoryBundle.routeSlug, right.inventoryBundle.routeSlug) ||
      compareText(left.inventoryBundle.route.routeId, right.inventoryBundle.route.routeId),
  );
  return {
    releaseId: input.releaseId,
    publishedAt: input.publishedAt,
    coverage: publicationCoverage,
    inputRefs: exactInputRefs(),
    routes,
    admissionSummary: {
      admittedAnchorCount,
      rejectedAnchorCount,
      exactDeduplicationCount,
      admissionReasonCounts: reasonCounts,
      relevanceReasonCounts: Object.fromEntries([...relevanceReasonCounts].sort()),
    },
  };
}

function monthKeys(implementationMonth: string, binding: TreatmentRelevanceBinding): IsoMonth[] {
  const anchor = monthIndex(implementationMonth);
  const start = anchor - binding.window.monthsBefore;
  const end = anchor + binding.window.monthsAfter;
  return Array.from({ length: end - start + 1 }, (_, index) =>
    decodeSchemaStrict(IsoMonthSchema, isoMonthFromIndex(start + index)),
  );
}

function trendPoint(
  binding: TreatmentRelevanceBinding,
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
    return { month, value: row.average_speed_mph, sampleCount: row.speed_observation_count };
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
  prepared: PreparedBinding,
  implementationMonth: IsoMonth,
  rowsByMonth: ReadonlyMap<string, InterventionObservationTrendRow>,
): StudioInterventionObservationSeries {
  const { binding } = prepared;
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
  const bindingId = decodeSchemaStrict(
    StudioInterventionObservationBindingIdSchema,
    binding.bindingId,
  ) as StudioInterventionObservationBindingId;
  return {
    bindingId,
    metricId: binding.metricId,
    label: binding.label,
    unit: binding.unit,
    role: prepared.role,
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
      ...(prepared.methodLimitation === null ? [] : [prepared.methodLimitation]),
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

export function materializeInterventionObservationArtifacts(input: {
  readonly preparation: PreparedInterventionObservationArtifacts;
  readonly trendRows: readonly InterventionObservationTrendRow[];
}): BuildInterventionObservationArtifactsResult {
  const trendByRoute = new Map<string, Map<string, InterventionObservationTrendRow>>();
  for (const row of input.trendRows) {
    const routeRows = trendByRoute.get(row.route_id) ?? new Map();
    if (routeRows.has(row.month)) {
      throw new Error(`Duplicate route trend row ${row.route_id}\u0000${row.month}`);
    }
    routeRows.set(row.month, row);
    trendByRoute.set(row.route_id, routeRows);
  }

  const bundles: StudioRouteInterventionObservationBundle[] = [];
  for (const route of input.preparation.routes) {
    const routeTrendRows = trendByRoute.get(route.inventoryBundle.route.routeId) ?? new Map();
    const events = route.anchors.map((prepared) => {
      const series = prepared.bindings
        .map((binding) => observationSeries(binding, prepared.implementationMonth, routeTrendRows))
        .sort((left, right) => left.presentationPriority - right.presentationPriority);
      return {
        eventId: observationEventId(
          prepared.anchor.routeId,
          prepared.anchor.occurrenceId,
          prepared.anchor.treatmentId,
        ),
        occurrenceId: prepared.anchor.occurrenceId,
        treatmentId: prepared.anchor.treatmentId,
        routeId: prepared.anchor.routeId,
        treatmentKind: prepared.anchor.treatmentKind,
        analysisFamily: prepared.analysisFamily,
        specId: prepared.specId,
        program: prepared.program,
        sourceId: prepared.sourceId,
        implementationDate: prepared.implementationDate,
        implementationMonth: prepared.implementationMonth,
        datePrecision: prepared.datePrecision,
        geographyScope: prepared.geographyScope,
        resolutionStatus: eventResolution(series),
        series,
      } satisfies StudioInterventionObservationEvent;
    });
    bundles.push(
      decodeSchemaStrict(StudioRouteInterventionObservationBundleSchema, {
        artifactKind: "bp.studio.route_intervention_observations.v1",
        schemaVersion: 1,
        releaseId: input.preparation.releaseId,
        publishedAt: input.preparation.publishedAt,
        coverage: input.preparation.coverage,
        route: route.inventoryBundle.route,
        routeId: route.inventoryBundle.route.routeId,
        routeSlug: route.inventoryBundle.routeSlug,
        dataCoverage: bundleDataCoverage(events),
        inputRefs: input.preparation.inputRefs,
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
        specId: event.specId,
        program: event.program,
        sourceId: event.sourceId,
        implementationDate: event.implementationDate,
        implementationMonth: event.implementationMonth,
        datePrecision: event.datePrecision,
        geographyScope: event.geographyScope,
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
    releaseId: input.preparation.releaseId,
    publishedAt: input.preparation.publishedAt,
    coverage: input.preparation.coverage,
    dataCoverage: indexDataCoverage(bundles),
    inputRefs: input.preparation.inputRefs,
    events: indexEvents,
  });

  const kindCounts = new Map<string, number>();
  const specCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  const resolutionCounts = new Map<string, number>();
  for (const event of bundles.flatMap((bundle) => bundle.events)) {
    increment(kindCounts, event.treatmentKind);
    if (event.specId !== null) increment(specCounts, event.specId);
    increment(sourceCounts, event.sourceId);
    increment(resolutionCounts, event.resolutionStatus);
  }
  return {
    bundles,
    index,
    admissionSummary: input.preparation.admissionSummary,
    resolutionSummary: {
      treatmentKindCounts: countRows(kindCounts, "treatmentKind"),
      specCounts: countRows(specCounts, "specId"),
      sourceCounts: countRows(sourceCounts, "sourceId"),
      resolutionStatusCounts: countRows(resolutionCounts, "resolutionStatus"),
    },
  };
}

export function buildInterventionObservationArtifacts(
  input: BuildInterventionObservationArtifactsInput,
): BuildInterventionObservationArtifactsResult {
  const preparation = prepareInterventionObservationArtifacts({
    inventoryBundles: input.inventoryBundles,
    releaseId: input.releaseId,
    publishedAt: input.publishedAt,
    coverage: input.coverage,
  });
  return materializeInterventionObservationArtifacts({ preparation, trendRows: input.trendRows });
}
