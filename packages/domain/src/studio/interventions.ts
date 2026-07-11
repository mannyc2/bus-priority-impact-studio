import { Schema, SchemaGetter } from "effect";

const StudioInterventionWindowSchema = Schema.Struct({
  from: Schema.String,
  to: Schema.String,
  sampleMonths: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
});

const StudioInterventionComparisonCohortSchema = Schema.Struct({
  method: Schema.String,
  causalInterpretation: Schema.String,
  methodLimitations: Schema.Array(Schema.String),
  routeIds: Schema.Array(Schema.String),
  routeCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  preWindow: Schema.NullOr(StudioInterventionWindowSchema),
  postWindow: Schema.NullOr(StudioInterventionWindowSchema),
  routeSpeedDeltaMph: Schema.NullOr(Schema.Number),
  comparisonSpeedDeltaMph: Schema.NullOr(Schema.Number),
  adjustedSpeedDeltaMph: Schema.NullOr(Schema.Number),
  caveat: Schema.String,
});

const StudioInterventionShapeSchema = Schema.Struct({
  year: Schema.String,
  title: Schema.String,
  detail: Schema.String,
  tone: Schema.optional(Schema.Literals(["accent", "good", "warn", "bad"])),
  sourceLabel: Schema.optional(Schema.String),
  sourceDetail: Schema.optional(Schema.String),
  comparisonCohort: Schema.optional(StudioInterventionComparisonCohortSchema),
});

export const StudioInterventionSchema = Schema.Unknown.pipe(
  Schema.decodeTo(StudioInterventionShapeSchema, {
    decode: SchemaGetter.transform((value) => {
      if (typeof value !== "object" || value === null) {
        return Schema.decodeUnknownSync(Schema.toEncoded(StudioInterventionShapeSchema))(value);
      }
      const { year, title, detail, tone, sourceLabel, sourceDetail, comparisonCohort } =
        value as Record<string, unknown>;
      return Schema.decodeUnknownSync(Schema.toEncoded(StudioInterventionShapeSchema), {
        onExcessProperty: "ignore",
      })({
        year,
        title,
        detail,
        tone,
        sourceLabel,
        sourceDetail,
        comparisonCohort,
      });
    }),
    encode: SchemaGetter.passthrough(),
  }),
);

export type StudioInterventionComparisonCohort =
  typeof StudioInterventionComparisonCohortSchema.Type;
export type StudioIntervention = typeof StudioInterventionSchema.Type;

export type StudioInterventionComparisonInput = {
  eventId: string;
  interventionType: string;
  program: string;
  implementationMonth: string;
  eventStatus: "implemented" | "future" | "source_gap";
  evaluationLevel?:
    | "descriptive_before_after"
    | "peer_adjusted_before_after"
    | "insufficient_trend_data"
    | "not_evaluated_future"
    | "not_evaluated_source_gap";
  comparisonStatus:
    | "evaluated"
    | "future_intervention"
    | "insufficient_pre_data"
    | "insufficient_post_data"
    | "source_gap_missing_implementation_date";
  preStartMonth?: string | null;
  preEndMonth?: string | null;
  postStartMonth?: string | null;
  postEndMonth?: string | null;
  preSampleMonthCount?: number;
  postSampleMonthCount?: number;
  adjustedSpeedDeltaMph: number | null;
  speedDeltaMph: number | null;
  comparisonSpeedDeltaMph?: number | null;
  comparisonRouteCount: number;
  comparisonRouteIds?: readonly string[];
  caveat?: string;
};

function interventionTitle(input: StudioInterventionComparisonInput): string {
  const suffix = input.eventStatus === "future" ? "scheduled" : "begins";

  if (input.interventionType === "automated_bus_lane_enforcement") {
    return `${input.program} enforcement ${suffix}`;
  }

  if (input.interventionType === "bus_lane_infrastructure") {
    return input.eventStatus === "future"
      ? "Bus lane infrastructure scheduled"
      : "Bus lane opening evidence";
  }

  return `${input.program} ${suffix}`;
}

function signedMph(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} mph`;
}

function statusDetail(input: StudioInterventionComparisonInput): string {
  if (input.comparisonStatus === "evaluated") {
    const delta = input.adjustedSpeedDeltaMph ?? input.speedDeltaMph;
    if (delta === null) {
      return "Evaluated before/after window; speed delta unavailable.";
    }

    const peerText =
      input.comparisonRouteCount > 0
        ? ` using ${input.comparisonRouteCount} comparison routes`
        : "";
    return `Peer-adjusted speed change ${signedMph(delta)}${peerText}.`;
  }

  if (input.comparisonStatus === "future_intervention") {
    return "Future dated intervention; evaluation waits for post-period data.";
  }

  if (input.comparisonStatus === "insufficient_post_data") {
    return "Documented intervention; not enough post-period speed data yet.";
  }

  if (input.comparisonStatus === "insufficient_pre_data") {
    return "Documented intervention; not enough pre-period speed data for comparison.";
  }

  return "Matched treatment evidence needs a source-backed implementation date.";
}

function interventionTone(
  input: StudioInterventionComparisonInput,
): NonNullable<StudioIntervention["tone"]> {
  if (input.comparisonStatus !== "evaluated") {
    return input.eventStatus === "future" ? "accent" : "warn";
  }

  const delta = input.adjustedSpeedDeltaMph ?? input.speedDeltaMph;
  if (delta === null) return "accent";
  if (delta > 0.05) return "good";
  if (delta < -0.05) return "bad";
  return "accent";
}

function comparisonWindow(
  from: string | null | undefined,
  to: string | null | undefined,
  sampleMonths: number | undefined,
): NonNullable<StudioIntervention["comparisonCohort"]>["preWindow"] {
  if (from === undefined || from === null || to === undefined || to === null) {
    return null;
  }

  return { from, to, sampleMonths: sampleMonths ?? 0 };
}

function comparisonCohort(
  input: StudioInterventionComparisonInput,
): StudioIntervention["comparisonCohort"] {
  const routeIds = [...new Set(input.comparisonRouteIds ?? [])].toSorted();
  const routeCount = Math.max(input.comparisonRouteCount, routeIds.length);
  if (routeCount === 0) {
    return undefined;
  }

  return {
    method: input.evaluationLevel ?? "peer_adjusted_before_after",
    causalInterpretation: "comparison_adjusted_not_causal_proof",
    methodLimitations: [
      "not_randomized_or_quasi_experimental",
      "detector_side_control_cohort_pending",
      "external_methodology_review_pending",
      "overlapping_interventions_not_fully_controlled",
    ],
    routeIds,
    routeCount,
    preWindow: comparisonWindow(input.preStartMonth, input.preEndMonth, input.preSampleMonthCount),
    postWindow: comparisonWindow(
      input.postStartMonth,
      input.postEndMonth,
      input.postSampleMonthCount,
    ),
    routeSpeedDeltaMph: input.speedDeltaMph,
    comparisonSpeedDeltaMph: input.comparisonSpeedDeltaMph ?? null,
    adjustedSpeedDeltaMph: input.adjustedSpeedDeltaMph,
    caveat:
      input.caveat ??
      "Matched comparison cohorts adjust descriptive before/after speed changes; they are not causal proof.",
  };
}

export function buildStudioInterventionsFromComparisons(
  comparisons: readonly StudioInterventionComparisonInput[],
): StudioIntervention[] {
  return comparisons
    .filter((comparison) => comparison.eventStatus !== "source_gap")
    .toSorted((a, b) => {
      const monthOrder = a.implementationMonth.localeCompare(b.implementationMonth);
      return monthOrder === 0 ? a.eventId.localeCompare(b.eventId) : monthOrder;
    })
    .map((comparison) => {
      const cohort = comparisonCohort(comparison);
      return {
        year: comparison.implementationMonth,
        title: interventionTitle(comparison),
        detail: statusDetail(comparison),
        tone: interventionTone(comparison),
        sourceLabel: comparison.program,
        sourceDetail: "Structured intervention source",
        ...(cohort === undefined ? {} : { comparisonCohort: cohort }),
      };
    });
}
