import { Schema } from "effect";
import { IsoMonthSchema } from "../primitives/index.js";
import {
  StudioInterventionTreatmentKindSchema,
  StudioRouteInterventionOccurrenceSchema,
  StudioRouteInterventionTreatmentSchema,
} from "./route-intervention-inventory.js";
import { StudioRouteIdentityPresentationSchema } from "./route-presentation.js";
import { ReleaseIdentitySchema, releaseIdFromPublishedAt } from "./shared.js";

const StrictParseOptions = {
  parseOptions: { onExcessProperty: "error" },
} as const;

const MAX_SERIES_POINTS = 61;
const MAX_SERIES_LIMITATIONS = 12;
const MAX_EVENT_SERIES = 8;
const MAX_ROUTE_EVENTS = 100;
const MAX_INDEX_EVENTS = 100_000;

const NonEmptyStringSchema = Schema.String.check(Schema.isMinLength(1));
const MediumStringSchema = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512));
const NonNegativeIntegerSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
);
const PositiveIntegerSchema = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1));
const FiniteNumberSchema = Schema.Number.check(Schema.isFinite());
const TreatmentIdSchema = StudioRouteInterventionTreatmentSchema.fields.treatmentId;
const OccurrenceIdSchema = StudioRouteInterventionOccurrenceSchema.fields.occurrenceId;

function monthIndex(month: string): number {
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
}

function isoMonthFromIndex(index: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}`;
}

function isCanonicalIsoDay(value: string): boolean {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u.test(value)) {
    return false;
  }
  const instant = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === value;
}

const IsoDaySchema = Schema.String.check(
  Schema.makeFilter((value) =>
    isCanonicalIsoDay(value)
      ? []
      : [{ path: [], issue: "Implementation dates must be valid ISO calendar days." }],
  ),
);

function releaseIdentityIssues(identity: {
  readonly releaseId: string;
  readonly publishedAt: string;
}): ReadonlyArray<{ readonly path: ReadonlyArray<string>; readonly issue: string }> {
  try {
    return identity.releaseId === releaseIdFromPublishedAt(identity.publishedAt)
      ? []
      : [
          {
            path: ["releaseId"],
            issue: "Release ID must be derived from the canonical publication timestamp.",
          },
        ];
  } catch {
    return [];
  }
}

function uniqueStrings(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function sortedStrings(values: readonly string[]): boolean {
  return values.slice(1).every((value, index) => {
    const previous = values.at(index);
    return previous !== undefined && previous < value;
  });
}

export const StudioInterventionObservationBindingRoleSchema = Schema.Literals([
  "primary_outcome",
  "secondary_outcome",
  "exposure",
  "mechanism",
  "confounder",
  "context",
]);
export type StudioInterventionObservationBindingRole =
  typeof StudioInterventionObservationBindingRoleSchema.Type;

export const StudioInterventionObservationClaimCeilingSchema = Schema.Literals([
  "annotation_only",
  "descriptive_observation",
  "gated_study_only",
]);
export type StudioInterventionObservationClaimCeiling =
  typeof StudioInterventionObservationClaimCeilingSchema.Type;

export const StudioInterventionObservationSeriesStatusSchema = Schema.Literals([
  "available",
  "partial",
  "missing",
]);
export type StudioInterventionObservationSeriesStatus =
  typeof StudioInterventionObservationSeriesStatusSchema.Type;

export const StudioInterventionObservationResolutionStatusSchema = Schema.Literals([
  "available",
  "partial",
  "missing",
  "unsupported_treatment_family",
  "unsupported_scope",
]);
export type StudioInterventionObservationResolutionStatus =
  typeof StudioInterventionObservationResolutionStatusSchema.Type;

export const StudioInterventionObservationAnalysisFamilySchema = Schema.NullOr(
  Schema.Literal("automated_bus_lane_enforcement"),
);
export type StudioInterventionObservationAnalysisFamily =
  typeof StudioInterventionObservationAnalysisFamilySchema.Type;

export const StudioInterventionObservationPointSchema = Schema.Struct({
  month: IsoMonthSchema,
  value: Schema.NullOr(FiniteNumberSchema),
  sampleCount: Schema.NullOr(NonNegativeIntegerSchema),
})
  .check(
    Schema.makeFilter((point) =>
      point.value === null && point.sampleCount !== null
        ? [
            {
              path: ["sampleCount"],
              issue: "A null observation cannot declare a sample count.",
            },
          ]
        : [],
    ),
  )
  .annotate(StrictParseOptions);
export type StudioInterventionObservationPoint =
  typeof StudioInterventionObservationPointSchema.Type;

export const StudioInterventionObservationCoverageSchema = Schema.Struct({
  requestedStart: IsoMonthSchema,
  requestedEnd: IsoMonthSchema,
  expectedPointCount: NonNegativeIntegerSchema.check(Schema.isLessThanOrEqualTo(MAX_SERIES_POINTS)),
  observedStart: Schema.NullOr(IsoMonthSchema),
  observedEnd: Schema.NullOr(IsoMonthSchema),
  observedPointCount: NonNegativeIntegerSchema.check(Schema.isLessThanOrEqualTo(MAX_SERIES_POINTS)),
  nullPointCount: NonNegativeIntegerSchema.check(Schema.isLessThanOrEqualTo(MAX_SERIES_POINTS)),
})
  .check(
    Schema.makeFilter((coverage) => {
      const issues: Array<{ path: string[]; issue: string }> = [];
      const requestedCount =
        monthIndex(coverage.requestedEnd) - monthIndex(coverage.requestedStart) + 1;
      if (requestedCount <= 0) {
        issues.push({
          path: ["requestedEnd"],
          issue: "Requested coverage end cannot precede its start.",
        });
      } else if (coverage.expectedPointCount !== requestedCount) {
        issues.push({
          path: ["expectedPointCount"],
          issue: "Expected point count must equal the inclusive requested month window.",
        });
      }
      if (coverage.observedPointCount + coverage.nullPointCount !== coverage.expectedPointCount) {
        issues.push({
          path: ["observedPointCount"],
          issue: "Observed and null point counts must sum to the expected count.",
        });
      }
      const hasObservedBounds = coverage.observedStart !== null && coverage.observedEnd !== null;
      if ((coverage.observedStart === null) !== (coverage.observedEnd === null)) {
        issues.push({
          path: ["observedStart"],
          issue: "Observed coverage bounds must either both be present or both be null.",
        });
      }
      if (coverage.observedPointCount === 0 && hasObservedBounds) {
        issues.push({
          path: ["observedStart"],
          issue: "Zero observed points require null observed bounds.",
        });
      }
      if (coverage.observedPointCount > 0 && !hasObservedBounds) {
        issues.push({
          path: ["observedStart"],
          issue: "Observed points require non-null observed bounds.",
        });
      }
      if (
        coverage.observedStart !== null &&
        coverage.observedEnd !== null &&
        (coverage.observedStart < coverage.requestedStart ||
          coverage.observedEnd > coverage.requestedEnd ||
          coverage.observedStart > coverage.observedEnd)
      ) {
        issues.push({
          path: ["observedStart"],
          issue: "Observed coverage bounds must be ordered inside the requested window.",
        });
      }
      return issues;
    }),
  )
  .annotate(StrictParseOptions);
export type StudioInterventionObservationCoverage =
  typeof StudioInterventionObservationCoverageSchema.Type;

export const StudioInterventionObservationSeriesSchema = Schema.Struct({
  bindingId: NonEmptyStringSchema,
  metricId: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  unit: NonEmptyStringSchema,
  role: StudioInterventionObservationBindingRoleSchema,
  grain: Schema.Literal("month"),
  dataProductId: Schema.Literal("local_route_month_trends_history"),
  resolverId: Schema.Literal("sqlite.local_route_month_trend.history.v1"),
  claimCeiling: StudioInterventionObservationClaimCeilingSchema,
  presentationPriority: PositiveIntegerSchema,
  status: StudioInterventionObservationSeriesStatusSchema,
  coverage: StudioInterventionObservationCoverageSchema,
  points: Schema.Array(StudioInterventionObservationPointSchema).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(MAX_SERIES_POINTS),
  ),
  limitations: Schema.Array(MediumStringSchema).check(Schema.isMaxLength(MAX_SERIES_LIMITATIONS)),
})
  .check(
    Schema.makeFilter((series) => {
      const issues: Array<{ path: Array<string | number>; issue: string }> = [];
      if (series.points.length !== series.coverage.expectedPointCount) {
        issues.push({
          path: ["points"],
          issue: "Point count must equal expectedPointCount.",
        });
      }

      const pointMonths = series.points.map((point) => point.month);
      for (let index = 0; index < pointMonths.length; index += 1) {
        const expectedMonth = isoMonthFromIndex(monthIndex(series.coverage.requestedStart) + index);
        if (pointMonths[index] !== expectedMonth) {
          issues.push({
            path: ["points", index, "month"],
            issue: "Points must contain every requested month exactly once in ascending order.",
          });
          break;
        }
      }
      if (
        pointMonths.at(0) !== series.coverage.requestedStart ||
        pointMonths.at(-1) !== series.coverage.requestedEnd
      ) {
        issues.push({
          path: ["points"],
          issue: "Point bounds must match requested coverage bounds.",
        });
      }

      const observedMonths = series.points.flatMap((point) =>
        point.value === null ? [] : [point.month],
      );
      const actualNullCount = series.points.length - observedMonths.length;
      if (
        observedMonths.length !== series.coverage.observedPointCount ||
        actualNullCount !== series.coverage.nullPointCount
      ) {
        issues.push({
          path: ["coverage"],
          issue: "Coverage counts must match the emitted point values.",
        });
      }
      if (
        (observedMonths.at(0) ?? null) !== series.coverage.observedStart ||
        (observedMonths.at(-1) ?? null) !== series.coverage.observedEnd
      ) {
        issues.push({
          path: ["coverage"],
          issue: "Observed coverage bounds must match the first and last non-null point.",
        });
      }

      const expectedStatus =
        observedMonths.length === 0
          ? "missing"
          : observedMonths.length === series.points.length
            ? "available"
            : "partial";
      if (series.status !== expectedStatus) {
        issues.push({
          path: ["status"],
          issue: "Series status must match its observed/null coverage.",
        });
      }
      return issues;
    }),
  )
  .annotate(StrictParseOptions);
export type StudioInterventionObservationSeries =
  typeof StudioInterventionObservationSeriesSchema.Type;

export const StudioInterventionObservationEventSchema = Schema.Struct({
  eventId: NonEmptyStringSchema,
  occurrenceId: OccurrenceIdSchema,
  treatmentId: TreatmentIdSchema,
  routeId: NonEmptyStringSchema,
  treatmentKind: StudioInterventionTreatmentKindSchema,
  analysisFamily: StudioInterventionObservationAnalysisFamilySchema,
  program: NonEmptyStringSchema,
  sourceId: NonEmptyStringSchema,
  implementationDate: IsoDaySchema,
  implementationMonth: IsoMonthSchema,
  resolutionStatus: StudioInterventionObservationResolutionStatusSchema,
  series: Schema.Array(StudioInterventionObservationSeriesSchema).check(
    Schema.isMaxLength(MAX_EVENT_SERIES),
  ),
})
  .check(
    Schema.makeFilter((event) => {
      const issues: Array<{ path: string[]; issue: string }> = [];
      const supportedResolution =
        event.resolutionStatus === "available" ||
        event.resolutionStatus === "partial" ||
        event.resolutionStatus === "missing";

      if (supportedResolution && event.analysisFamily === null) {
        issues.push({
          path: ["analysisFamily"],
          issue: "A supported resolution requires a reviewed analysis family.",
        });
      }
      if (
        event.resolutionStatus === "unsupported_treatment_family" &&
        event.analysisFamily !== null
      ) {
        issues.push({
          path: ["analysisFamily"],
          issue: "An unsupported treatment family must have a null analysis family.",
        });
      }
      if (
        event.analysisFamily !== null &&
        event.treatmentKind !== "automated_bus_lane_enforcement"
      ) {
        issues.push({
          path: ["treatmentKind"],
          issue: "The v1 reviewed analysis family is valid only for canonical ACE treatments.",
        });
      }
      if (event.implementationDate.slice(0, 7) !== event.implementationMonth) {
        issues.push({
          path: ["implementationMonth"],
          issue: "Implementation month must agree with implementation date.",
        });
      }
      if (!uniqueStrings(event.series.map((series) => series.bindingId))) {
        issues.push({
          path: ["series"],
          issue: "Binding IDs must be unique within an event.",
        });
      }
      if (!supportedResolution && event.series.length !== 0) {
        issues.push({
          path: ["series"],
          issue: "Unsupported events cannot publish observation series.",
        });
      }
      if (supportedResolution && event.series.length === 0) {
        issues.push({
          path: ["series"],
          issue: "Supported events must publish at least one observation series.",
        });
      }
      if (supportedResolution && event.series.length > 0) {
        const availableCount = event.series.filter(
          (series) => series.status === "available",
        ).length;
        const observedCount = event.series.filter((series) => series.status !== "missing").length;
        const expectedStatus =
          availableCount === event.series.length
            ? "available"
            : observedCount === 0
              ? "missing"
              : "partial";
        if (event.resolutionStatus !== expectedStatus) {
          issues.push({
            path: ["resolutionStatus"],
            issue: "Event resolution must match its series statuses.",
          });
        }
      }
      return issues;
    }),
  )
  .annotate(StrictParseOptions);
export type StudioInterventionObservationEvent =
  typeof StudioInterventionObservationEventSchema.Type;

export const StudioInterventionObservationEventAnchorInputRefSchema = Schema.Struct({
  dataProductId: Schema.Literal("studio_route_intervention_inventory"),
  role: Schema.Literal("event_anchor"),
  featureGrain: Schema.Null,
  resolverId: Schema.Null,
}).annotate(StrictParseOptions);

export const StudioInterventionObservationSourceInputRefSchema = Schema.Struct({
  dataProductId: Schema.Literal("local_route_month_trends_history"),
  role: Schema.Literal("observation_source"),
  featureGrain: Schema.Literal("route_metric_history"),
  resolverId: Schema.Literal("sqlite.local_route_month_trend.history.v1"),
}).annotate(StrictParseOptions);

export const StudioInterventionObservationInputRefSchema = Schema.Union([
  StudioInterventionObservationEventAnchorInputRefSchema,
  StudioInterventionObservationSourceInputRefSchema,
]);
export type StudioInterventionObservationInputRef =
  typeof StudioInterventionObservationInputRefSchema.Type;

export const StudioInterventionObservationInputRefsSchema = Schema.Tuple([
  StudioInterventionObservationEventAnchorInputRefSchema,
  StudioInterventionObservationSourceInputRefSchema,
]);
export type StudioInterventionObservationInputRefs =
  typeof StudioInterventionObservationInputRefsSchema.Type;

export const StudioInterventionObservationDataCoverageSchema = Schema.Struct({
  start: Schema.NullOr(IsoMonthSchema),
  end: Schema.NullOr(IsoMonthSchema),
  grain: Schema.Literal("month"),
})
  .check(
    Schema.makeFilter((coverage) => {
      if ((coverage.start === null) !== (coverage.end === null)) {
        return [
          {
            path: ["start"],
            issue: "Observed data coverage bounds must both be present or both be null.",
          },
        ];
      }
      return coverage.start !== null && coverage.end !== null && coverage.start > coverage.end
        ? [
            {
              path: ["start"],
              issue: "Observed data coverage start cannot follow its end.",
            },
          ]
        : [];
    }),
  )
  .annotate(StrictParseOptions);
export type StudioInterventionObservationDataCoverage =
  typeof StudioInterventionObservationDataCoverageSchema.Type;

function observedBundleBounds(
  events: readonly (typeof StudioInterventionObservationEventSchema.Type)[],
): { readonly start: string | null; readonly end: string | null } {
  const months = events.flatMap((event) =>
    event.series.flatMap((series) =>
      series.points.flatMap((point) => (point.value === null ? [] : [point.month])),
    ),
  );
  months.sort();
  return { start: months.at(0) ?? null, end: months.at(-1) ?? null };
}

export const StudioRouteInterventionObservationBundleSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.route_intervention_observations.v1"),
  schemaVersion: Schema.Literal(1),
  ...ReleaseIdentitySchema.fields,
  route: StudioRouteIdentityPresentationSchema,
  routeId: NonEmptyStringSchema,
  routeSlug: NonEmptyStringSchema,
  dataCoverage: StudioInterventionObservationDataCoverageSchema,
  inputRefs: StudioInterventionObservationInputRefsSchema,
  events: Schema.Array(StudioInterventionObservationEventSchema).check(
    Schema.isMaxLength(MAX_ROUTE_EVENTS),
  ),
  limitations: Schema.Array(MediumStringSchema).check(Schema.isMaxLength(MAX_SERIES_LIMITATIONS)),
})
  .check(
    Schema.makeFilter((bundle) => {
      const issues = [...releaseIdentityIssues(bundle)];
      if (bundle.route.routeId !== bundle.routeId) {
        issues.push({
          path: ["routeId"],
          issue: "Bundle route ID must equal the exact presentation route ID.",
        });
      }
      if (bundle.events.some((event) => event.routeId !== bundle.routeId)) {
        issues.push({
          path: ["events"],
          issue: "Every event route ID must equal the bundle route ID.",
        });
      }
      if (!uniqueStrings(bundle.events.map((event) => event.eventId))) {
        issues.push({ path: ["events"], issue: "Event IDs must be unique within a bundle." });
      }
      const compositeKeys = bundle.events.map(
        (event) => `${event.occurrenceId}\u0000${event.treatmentId}`,
      );
      if (!uniqueStrings(compositeKeys)) {
        issues.push({
          path: ["events"],
          issue: "Occurrence/treatment pairs must be unique within a bundle.",
        });
      }
      const bounds = observedBundleBounds(bundle.events);
      if (bundle.dataCoverage.start !== bounds.start || bundle.dataCoverage.end !== bounds.end) {
        issues.push({
          path: ["dataCoverage"],
          issue: "Bundle data coverage must span its non-null observation points.",
        });
      }
      return issues;
    }),
  )
  .annotate(StrictParseOptions);
export type StudioRouteInterventionObservationBundle =
  typeof StudioRouteInterventionObservationBundleSchema.Type;

export const StudioInterventionObservationIndexEventSchema = Schema.Struct({
  eventId: NonEmptyStringSchema,
  occurrenceId: OccurrenceIdSchema,
  treatmentId: TreatmentIdSchema,
  routeId: NonEmptyStringSchema,
  routeSlug: NonEmptyStringSchema,
  treatmentKind: StudioInterventionTreatmentKindSchema,
  analysisFamily: StudioInterventionObservationAnalysisFamilySchema,
  program: NonEmptyStringSchema,
  sourceId: NonEmptyStringSchema,
  implementationDate: IsoDaySchema,
  implementationMonth: IsoMonthSchema,
  resolutionStatus: StudioInterventionObservationResolutionStatusSchema,
  availableMetricIds: Schema.Array(NonEmptyStringSchema).check(
    Schema.isMaxLength(MAX_EVENT_SERIES),
  ),
  bundleKey: NonEmptyStringSchema,
})
  .check(
    Schema.makeFilter((event) => {
      const issues: Array<{ path: string[]; issue: string }> = [];
      const supportedResolution =
        event.resolutionStatus === "available" ||
        event.resolutionStatus === "partial" ||
        event.resolutionStatus === "missing";
      if (supportedResolution && event.analysisFamily === null) {
        issues.push({
          path: ["analysisFamily"],
          issue: "A supported resolution requires a reviewed analysis family.",
        });
      }
      if (
        event.resolutionStatus === "unsupported_treatment_family" &&
        event.analysisFamily !== null
      ) {
        issues.push({
          path: ["analysisFamily"],
          issue: "An unsupported treatment family must have a null analysis family.",
        });
      }
      if (
        event.analysisFamily !== null &&
        event.treatmentKind !== "automated_bus_lane_enforcement"
      ) {
        issues.push({
          path: ["treatmentKind"],
          issue: "The v1 reviewed analysis family is valid only for canonical ACE treatments.",
        });
      }
      if (event.implementationDate.slice(0, 7) !== event.implementationMonth) {
        issues.push({
          path: ["implementationMonth"],
          issue: "Implementation month must agree with implementation date.",
        });
      }
      if (!uniqueStrings(event.availableMetricIds) || !sortedStrings(event.availableMetricIds)) {
        issues.push({
          path: ["availableMetricIds"],
          issue: "Available metric IDs must be sorted and unique.",
        });
      }
      if (
        (event.resolutionStatus === "missing" || !supportedResolution) &&
        event.availableMetricIds.length > 0
      ) {
        issues.push({
          path: ["availableMetricIds"],
          issue: "Missing and unsupported events cannot advertise available metrics.",
        });
      }
      if (
        (event.resolutionStatus === "available" || event.resolutionStatus === "partial") &&
        event.availableMetricIds.length === 0
      ) {
        issues.push({
          path: ["availableMetricIds"],
          issue: "Available and partial events must advertise an available metric.",
        });
      }
      return issues;
    }),
  )
  .annotate(StrictParseOptions);
export type StudioInterventionObservationIndexEvent =
  typeof StudioInterventionObservationIndexEventSchema.Type;

function compareIndexEvents(
  left: typeof StudioInterventionObservationIndexEventSchema.Type,
  right: typeof StudioInterventionObservationIndexEventSchema.Type,
): number {
  return (
    left.implementationMonth.localeCompare(right.implementationMonth) ||
    left.routeSlug.localeCompare(right.routeSlug) ||
    left.occurrenceId.localeCompare(right.occurrenceId) ||
    left.treatmentId.localeCompare(right.treatmentId) ||
    left.eventId.localeCompare(right.eventId)
  );
}

export const StudioInterventionObservationIndexSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.intervention_observation_index.v1"),
  schemaVersion: Schema.Literal(1),
  ...ReleaseIdentitySchema.fields,
  dataCoverage: StudioInterventionObservationDataCoverageSchema,
  inputRefs: StudioInterventionObservationInputRefsSchema,
  events: Schema.Array(StudioInterventionObservationIndexEventSchema).check(
    Schema.isMaxLength(MAX_INDEX_EVENTS),
  ),
})
  .check(
    Schema.makeFilter((index) => {
      const issues = [...releaseIdentityIssues(index)];
      if (!uniqueStrings(index.events.map((event) => event.eventId))) {
        issues.push({ path: ["events"], issue: "Index event IDs must be unique." });
      }
      const compositeKeys = index.events.map(
        (event) => `${event.routeId}\u0000${event.occurrenceId}\u0000${event.treatmentId}`,
      );
      if (!uniqueStrings(compositeKeys)) {
        issues.push({
          path: ["events"],
          issue: "Index route/occurrence/treatment keys must be unique.",
        });
      }
      if (
        index.events.some((event, eventIndex) => {
          const previous = index.events.at(eventIndex - 1);
          return (
            eventIndex > 0 && previous !== undefined && compareIndexEvents(previous, event) >= 0
          );
        })
      ) {
        issues.push({
          path: ["events"],
          issue: "Index events must be sorted by month, route slug, occurrence, and treatment.",
        });
      }
      return issues;
    }),
  )
  .annotate(StrictParseOptions);
export type StudioInterventionObservationIndex =
  typeof StudioInterventionObservationIndexSchema.Type;
