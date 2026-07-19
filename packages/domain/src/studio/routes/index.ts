import { Effect, Schema, SchemaGetter } from "effect";
import { StudioInterventionSchema } from "../interventions.js";
import { StudioRouteCapabilitySchema } from "../route-capability.js";
import { RouteDossierSummaryForDetailSchema } from "../route-dossier.js";
import {
  assertStudioRouteIdentityPresentation,
  StudioCurrentBusRouteTypeSchema,
  StudioCurrentBusTripTypeSchema,
  StudioRouteServiceModeSchema,
} from "../route-presentation.js";
import { CoverageWindowSchema, StudioQualitySchema } from "../shared.js";

export const StudioObservedReliabilitySchema = Schema.Struct({
  month: Schema.String,
  runId: Schema.String,
  source: Schema.Literals(["official_self_collected", "third_party_recovered"]),
  releaseLayer: Schema.Literals(["observed_release", "current_signal"]),
  reliabilityStatus: Schema.Literals(["observed", "insufficient_gtfs_rt_samples"]),
  sampleCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  medianObservedHeadwayMinutes: Schema.NullOr(Schema.Number),
  p90ObservedHeadwayMinutes: Schema.NullOr(Schema.Number),
  observedBunchingShare: Schema.NullOr(Schema.Number),
  observedLongGapShare: Schema.NullOr(Schema.Number),
  excessWaitMinutes: Schema.NullOr(Schema.Number),
  caveats: Schema.Array(Schema.String),
});

function legacyTspCoverage(value: unknown): "yes" | "partial" | "none" {
  if (value === "yes" || value === "partial" || value === "none") return value;
  if (value === "installed") return "yes";
  if (value === "candidate") return "partial";
  return "none";
}

type StudioRouteCompatInput = Record<string, unknown> & {
  dailyRiders?: unknown;
  diagnosis?: unknown;
  endpoints?: unknown;
  label?: unknown;
  speedMph?: unknown;
  termini?: unknown;
  tspCoverage?: unknown;
  tspStatus?: unknown;
};

type StudioSegmentCompatInput = Record<string, unknown> & {
  aiNote?: unknown;
  tsp?: unknown;
  tspStatus?: unknown;
};

function legacyDiagnosis(route: StudioRouteCompatInput): string {
  const { dailyRiders, diagnosis, label: labelValue, speedMph: speedValue } = route;
  if (typeof diagnosis === "string" && diagnosis.length > 0) return diagnosis;
  const label = typeof labelValue === "string" ? labelValue : "This route";
  const speed = typeof speedValue === "number" ? `${speedValue} mph` : "an unrecorded speed";
  const riders =
    typeof dailyRiders === "number"
      ? `${Math.round(dailyRiders).toLocaleString("en-US")} daily riders`
      : "unrecorded ridership";
  return `${label} runs at ${speed} and carries ${riders}.`;
}

function legacyTermini(route: StudioRouteCompatInput): {
  north: string;
  south: string;
} {
  const { termini } = route;
  if (
    typeof termini === "object" &&
    termini !== null &&
    typeof (termini as { north?: unknown }).north === "string" &&
    typeof (termini as { south?: unknown }).south === "string"
  ) {
    return termini as { north: string; south: string };
  }
  const endpointsValue = route.endpoints;
  const endpoints =
    typeof endpointsValue === "object" && endpointsValue !== null
      ? (endpointsValue as { end?: unknown; start?: unknown })
      : {};
  return {
    north: typeof endpoints.start === "string" ? endpoints.start : "Route start",
    south: typeof endpoints.end === "string" ? endpoints.end : "Route end",
  };
}

const STUDIO_ROUTE_IDENTITY_V2_FIELDS = [
  "routeSchemaVersion",
  "routeFamilyId",
  "displayLabel",
  "officialLongName",
  "designationLiterals",
  "serviceModes",
  "routeTypes",
  "tripTypes",
] as const;

function assertStudioRouteIdentityV2(
  route: Record<string, unknown> & { routeSchemaVersion?: unknown },
): void {
  const present = STUDIO_ROUTE_IDENTITY_V2_FIELDS.filter((field) => Object.hasOwn(route, field));
  if (present.length === 0) return;
  if (route.routeSchemaVersion !== 2) {
    throw new Error("Studio route exact-identity fields require routeSchemaVersion 2");
  }
  const missing = STUDIO_ROUTE_IDENTITY_V2_FIELDS.filter((field) => !Object.hasOwn(route, field));
  if (missing.length > 0) {
    throw new Error(`Studio route v2 exact-identity fields are incomplete: ${missing.join(",")}`);
  }
  assertStudioRouteIdentityPresentation(route);
}

const StudioRouteShapeSchema = Schema.Struct({
  slug: Schema.String,
  routeId: Schema.String,
  label: Schema.String,
  routeSchemaVersion: Schema.optional(Schema.Literal(2)),
  routeFamilyId: Schema.optional(Schema.String),
  displayLabel: Schema.optional(Schema.String),
  officialLongName: Schema.optional(Schema.NullOr(Schema.String)),
  designationLiterals: Schema.optional(Schema.Array(Schema.String)),
  serviceModes: Schema.optional(Schema.Array(StudioRouteServiceModeSchema)),
  routeTypes: Schema.optional(Schema.Array(StudioCurrentBusRouteTypeSchema)),
  tripTypes: Schema.optional(Schema.Array(StudioCurrentBusTripTypeSchema)),
  corridor: Schema.String,
  corridorFull: Schema.String,
  borough: Schema.String,
  sbs: Schema.Boolean,
  speedMph: Schema.Number,
  scheduledMph: Schema.NullOr(Schema.Number),
  weightedAvgSpeed: Schema.Number,
  speedPercentile: Schema.NullOr(Schema.Number),
  dailyRiders: Schema.Number,
  ridersYoyPct: Schema.NullOr(Schema.Number),
  riderHoursLost: Schema.NullOr(Schema.Number),
  laneCoverage: Schema.Number,
  aceStatus: Schema.Literals(["active", "none"]),
  aceSince: Schema.NullOr(Schema.String),
  tspCoverage: Schema.Literals(["yes", "partial", "none"]),
  reliability: Schema.String,
  observedReliability: Schema.NullOr(StudioObservedReliabilitySchema),
  diagnosis: Schema.String,
  spark: Schema.NullOr(Schema.Array(Schema.Number)),
  termini: Schema.Struct({ north: Schema.String, south: Schema.String }),
  miles: Schema.NullOr(Schema.Number),
  stops: Schema.Number,
  flags: Schema.Array(Schema.String),
  peerSlug: Schema.NullOr(Schema.String),
  interventions: Schema.Array(StudioInterventionSchema),
  movement6mPct: Schema.NullOr(Schema.Number).pipe(
    Schema.withDecodingDefaultType(Effect.succeed(null)),
  ),
  context12mPct: Schema.NullOr(Schema.Number).pipe(
    Schema.withDecodingDefaultType(Effect.succeed(null)),
  ),
});

export const StudioRouteSchema = Schema.Unknown.pipe(
  Schema.decodeTo(StudioRouteShapeSchema, {
    decode: SchemaGetter.transform((value) => {
      if (typeof value !== "object" || value === null) {
        return Schema.decodeUnknownSync(Schema.toEncoded(StudioRouteShapeSchema))(value);
      }
      const route = value as StudioRouteCompatInput;
      const decoded = Schema.decodeUnknownSync(Schema.toEncoded(StudioRouteShapeSchema), {
        onExcessProperty: "ignore",
      })({
        ...route,
        tspCoverage: legacyTspCoverage(route.tspCoverage ?? route.tspStatus),
        diagnosis: legacyDiagnosis(route),
        termini: legacyTermini(route),
      });
      assertStudioRouteIdentityV2(decoded);
      return decoded;
    }),
    encode: SchemaGetter.passthrough(),
  }),
);

const StudioSegmentShapeSchema = Schema.Struct({
  id: Schema.String,
  spineSegmentId: Schema.NullOr(Schema.String).pipe(
    Schema.withDecodingDefaultType(Effect.succeed(null)),
  ),
  spineJoinStatus: Schema.Literals(["matched", "unmatched", "ambiguous", "not_built"]).pipe(
    Schema.withDecodingDefaultType(Effect.succeed("not_built")),
  ),
  routeSlug: Schema.String,
  direction: Schema.Literals(["NB", "SB", "EB", "WB"]),
  from: Schema.String,
  to: Schema.String,
  speedMph: Schema.Number,
  scheduledMph: Schema.NullOr(Schema.Number),
  riderHours: Schema.Number,
  lane: Schema.Literals(["yes", "partial", "minimal", "none"]),
  ace: Schema.Boolean,
  tsp: Schema.Boolean,
  hours: Schema.Array(Schema.Number),
  miles: Schema.optional(Schema.Number),
  timepoints: Schema.optional(Schema.Number),
  flagged: Schema.optional(Schema.Boolean),
  aiNote: Schema.optional(Schema.String),
  suggestedSeeds: Schema.optional(Schema.Array(Schema.String)),
});

export const StudioSegmentSchema = Schema.Unknown.pipe(
  Schema.decodeTo(StudioSegmentShapeSchema, {
    decode: SchemaGetter.transform((value) => {
      if (typeof value !== "object" || value === null) {
        return Schema.decodeUnknownSync(Schema.toEncoded(StudioSegmentShapeSchema))(value);
      }
      const segment = value as StudioSegmentCompatInput;
      const { aiNote } = segment;
      return Schema.decodeUnknownSync(Schema.toEncoded(StudioSegmentShapeSchema), {
        onExcessProperty: "ignore",
      })({
        ...segment,
        tsp: typeof segment.tsp === "boolean" ? segment.tsp : segment.tspStatus === "installed",
        aiNote:
          typeof aiNote === "object" &&
          aiNote !== null &&
          typeof (aiNote as { body?: unknown }).body === "string"
            ? (aiNote as { body: string }).body
            : aiNote,
      });
    }),
    encode: SchemaGetter.passthrough(),
  }),
);

export const StudioRouteArtifactRefSchema = Schema.Struct({
  routeId: Schema.String,
  month: Schema.String,
  name: Schema.String,
  key: Schema.String,
  contentType: Schema.String,
  byteLength: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  sha256: Schema.String,
});

export const StudioRouteInsightKindSchema = Schema.Literals([
  "customer_journey",
  "treatment_scope",
  "timeline_annotation",
  "map_segment",
  "performance_annotation",
]);

export const StudioRouteInsightPlacementSchema = Schema.Literals([
  "overview",
  "chart_annotation",
  "map_segment",
  "timeline",
]);

export const StudioRouteInsightSeveritySchema = Schema.Literals(["low", "medium", "high"]);

export const StudioRouteInsightSchema = Schema.Struct({
  routeId: Schema.String,
  kind: StudioRouteInsightKindSchema,
  placement: StudioRouteInsightPlacementSchema,
  title: Schema.String,
  shortText: Schema.String,
  severity: StudioRouteInsightSeveritySchema,
  month: Schema.optional(Schema.String),
  asOfMonth: Schema.optional(Schema.NullOr(Schema.String)),
  scopeId: Schema.optional(Schema.String),
  target: Schema.optional(
    Schema.Struct({
      segmentIds: Schema.optional(Schema.Array(Schema.String)),
      direction: Schema.optional(Schema.String),
      segmentIndex: Schema.optional(
        Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      ),
      fromNodeId: Schema.optional(Schema.String),
      toNodeId: Schema.optional(Schema.String),
    }),
  ),
  detectorId: Schema.String,
  refs: Schema.Array(
    Schema.Struct({
      evidenceRefPath: Schema.optional(Schema.String),
      sourceProjectionPath: Schema.optional(Schema.String),
    }),
  ),
  caveatsForTooltip: Schema.optional(Schema.Array(Schema.String)),
});

export const StudioRouteEquityContextSchema = Schema.Struct({
  acsYear: Schema.Number.check(Schema.isInt()),
  assignedCountyName: Schema.NullOr(Schema.String),
  totalPopulation: Schema.NullOr(
    Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  ),
  noVehicleHouseholdShare: Schema.NullOr(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))),
  medianHouseholdIncome: Schema.NullOr(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))),
  povertyRate: Schema.NullOr(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))),
  publicTransitCommuterShare: Schema.NullOr(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))),
});

export const StudioRoutesResponseSchema = Schema.Struct({
  schemaVersion: Schema.Literal(2),
  generatedAt: Schema.String,
  releaseId: Schema.String,
  publishedAt: Schema.String,
  coverage: CoverageWindowSchema,
  routes: Schema.Array(StudioRouteSchema),
  quality: StudioQualitySchema,
});

export const StudioSegmentsResponseSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  generatedAt: Schema.String,
  segments: Schema.Array(StudioSegmentSchema),
  quality: StudioQualitySchema,
});

const HourOfDaySchema = Schema.Number.check(Schema.isInt())
  .check(Schema.isGreaterThanOrEqualTo(0))
  .check(Schema.isLessThanOrEqualTo(23));

export const StudioRouteHourlyProfileHourSchema = Schema.Struct({
  hourOfDay: HourOfDaySchema,
  speedObservationCount: Schema.Number.check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0),
  ),
  speedBusTripCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  averageSpeedMph: Schema.NullOr(Schema.Number),
  ridership: Schema.NullOr(Schema.Number),
  transfers: Schema.NullOr(Schema.Number),
});

export const StudioRouteHourlyProfilePeakWindowSchema = Schema.Struct({
  month: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/)),
  dayOfWeek: Schema.String,
  hourOfDay: HourOfDaySchema,
  ridership: Schema.NullOr(Schema.Number),
});

export const StudioRouteHourlyProfileSlowestWindowSchema = Schema.Struct({
  month: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/)),
  dayOfWeek: Schema.String,
  hourOfDay: HourOfDaySchema,
  observationCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  busTripCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  weightedAverageSpeedMph: Schema.NullOr(Schema.Number),
});

export const StudioRouteReliabilitySampleSchema = Schema.Struct({
  month: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/)),
  hourOfDay: HourOfDaySchema,
  sampleCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  averageObservedHeadwayMinutes: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
});

export const StudioRouteHourlyProfileMonthlyProfileSchema = Schema.Struct({
  routeId: Schema.String,
  month: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/)),
  hourlyRowCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  totalRidership: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
  totalTransfers: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
  peakWindow: Schema.NullOr(
    Schema.Struct({
      dayOfWeek: Schema.String,
      hourOfDay: HourOfDaySchema,
      ridership: Schema.NullOr(Schema.Number),
    }),
  ),
});

export const StudioRouteHourlyProfileResponseSchema = Schema.Struct({
  artifactKind: Schema.Literal("studio_route_hourly_profile"),
  schemaVersion: Schema.Literal(1),
  generatedAt: Schema.String,
  routeId: Schema.String,
  routeSlug: Schema.String,
  source: Schema.Struct({
    tables: Schema.Tuple([
      Schema.Literal("local_route_hourly_ridership"),
      Schema.Literal("local_route_segment_speed"),
      Schema.Literal("local_route_observed_reliability_summary"),
      Schema.Literal("local_observed_headway_sample"),
    ]),
    dbPath: Schema.String,
    startMonth: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/)),
    endMonth: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/)),
    artifactPath: Schema.String,
  }),
  dimensions: Schema.Struct({
    months: Schema.Array(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/))),
    hours: Schema.Array(HourOfDaySchema).check(Schema.isLengthBetween(24, 24)),
  }),
  summary: Schema.Struct({
    monthCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    latestMonth: Schema.NullOr(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/))),
    hourCount: Schema.Literal(24),
    populatedHourCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    speedObservationCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    speedBusTripCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    totalRidership: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
    totalTransfers: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
    reliabilitySampleCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
  }),
  hours: Schema.Array(StudioRouteHourlyProfileHourSchema).check(Schema.isLengthBetween(24, 24)),
  peakWindows: Schema.Array(StudioRouteHourlyProfilePeakWindowSchema),
  slowestWindows: Schema.Array(StudioRouteHourlyProfileSlowestWindowSchema),
  reliabilitySamples: Schema.Array(StudioRouteReliabilitySampleSchema),
  monthlyProfiles: Schema.Array(StudioRouteHourlyProfileMonthlyProfileSchema),
});

/**
 * Route detail v2 (frontend §7.2 / hard-cutover C2): the route evidence dossier.
 * Identity + segments + the pipeline-built capability row and dossier summary
 * (series-shaped, per-block dataAsOf). One Tier-1 fetch renders the page; cell-grain
 * data stays in lazy artifacts referenced by `artifactRefs`. `capability` and
 * `dossier` are null only on the partial D1 fallback for routes without rich
 * artifacts — the UI renders the honest building/insufficient states from that.
 */
export const StudioRouteDetailResponseSchema = Schema.Struct({
  schemaVersion: Schema.Literal(3),
  generatedAt: Schema.String,
  releaseId: Schema.String,
  publishedAt: Schema.String,
  coverage: CoverageWindowSchema,
  route: StudioRouteSchema,
  peerRoute: Schema.optional(StudioRouteSchema),
  segments: Schema.Array(StudioSegmentSchema),
  artifactRefs: Schema.Array(StudioRouteArtifactRefSchema),
  insights: Schema.Array(StudioRouteInsightSchema).pipe(
    Schema.withDecodingDefaultType(Effect.succeed([])),
  ),
  peakWindows: Schema.Array(StudioRouteHourlyProfilePeakWindowSchema).pipe(
    Schema.withDecodingDefaultType(Effect.succeed([])),
  ),
  slowestWindows: Schema.Array(StudioRouteHourlyProfileSlowestWindowSchema).pipe(
    Schema.withDecodingDefaultType(Effect.succeed([])),
  ),
  reliabilitySamples: Schema.Array(StudioRouteReliabilitySampleSchema).pipe(
    Schema.withDecodingDefaultType(Effect.succeed([])),
  ),
  capability: Schema.NullOr(StudioRouteCapabilitySchema).pipe(
    Schema.withDecodingDefaultType(Effect.succeed(null)),
  ),
  dossier: Schema.NullOr(RouteDossierSummaryForDetailSchema).pipe(
    Schema.withDecodingDefaultType(Effect.succeed(null)),
  ),
  equityContext: Schema.NullOr(StudioRouteEquityContextSchema).pipe(
    Schema.withDecodingDefaultType(Effect.succeed(null)),
  ),
  quality: StudioQualitySchema,
});

export const StudioRouteHistoryPointSchema = Schema.Struct({
  routeId: Schema.String,
  month: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/)),
  speedObservationCount: Schema.Number.check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0),
  ),
  speedBusTripCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  averageSpeedMph: Schema.NullOr(Schema.Number),
  ridership: Schema.NullOr(Schema.Number),
  transfers: Schema.NullOr(Schema.Number),
  hasSpeedTrend: Schema.Boolean,
  hasRidershipTrend: Schema.Boolean,
});

export const StudioRouteHistoryCoverageSchema = Schema.Struct({
  startMonth: Schema.NullOr(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/))),
  endMonth: Schema.NullOr(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/))),
  pointCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  speedMonthCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  ridershipMonthCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
});

export const StudioRouteHistoryResponseSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  generatedAt: Schema.String,
  route: StudioRouteSchema,
  points: Schema.Array(StudioRouteHistoryPointSchema),
  coverage: StudioRouteHistoryCoverageSchema,
  quality: StudioQualitySchema,
});

export const StudioRouteSpeedHistoryDaypartSchema = Schema.Literals([
  "am_peak",
  "midday",
  "pm_peak",
  "off_peak",
]);

export const StudioRouteSpeedSpineReadinessSchema = Schema.Literals([
  "series_ready",
  "series_ready_with_gaps",
  "needs_pattern_review",
  "failed",
]);

export const StudioRouteSpeedHistoryCellSchema = Schema.Struct({
  segmentId: Schema.String,
  month: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/)),
  daypart: StudioRouteSpeedHistoryDaypartSchema,
  status: Schema.Literals(["available", "missing", "not_expected", "source_missing"]),
  observationCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  traversalCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  averageSpeedMph: Schema.NullOr(Schema.Number),
  averageTravelTimeMinutes: Schema.NullOr(Schema.Number),
  averageRoadDistanceMiles: Schema.NullOr(Schema.Number),
  segmentDaypartMeanSpeedMph: Schema.NullOr(Schema.Number),
  deltaFromSegmentDaypartMeanMph: Schema.NullOr(Schema.Number),
  pctFromSegmentDaypartMean: Schema.NullOr(Schema.Number),
});

export const StudioRouteSpeedHistoryResponseSchema = Schema.Struct({
  artifactKind: Schema.Literal("studio_route_speed_history"),
  schemaVersion: Schema.Literal(1),
  generatedAt: Schema.String,
  routeId: Schema.String,
  routeSlug: Schema.String,
  spineReadiness: Schema.NullOr(StudioRouteSpeedSpineReadinessSchema).pipe(
    Schema.withDecodingDefaultType(Effect.succeed(null)),
  ),
  source: Schema.Struct({
    table: Schema.Literal("local_route_segment_speed"),
    dbPath: Schema.String,
    speedSpinePath: Schema.String,
    startMonth: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/)),
    endMonth: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/)),
    artifactPath: Schema.String,
    expectedService: Schema.optional(
      Schema.NullOr(
        Schema.Struct({
          table: Schema.Literal("local_route_schedule_stop"),
          completeMonths: Schema.Array(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/))),
          incompleteMonths: Schema.Array(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/))),
          routeScheduleRowCount: Schema.Number.check(Schema.isInt()).check(
            Schema.isGreaterThanOrEqualTo(0),
          ),
          matchedSchedulePairCount: Schema.Number.check(Schema.isInt()).check(
            Schema.isGreaterThanOrEqualTo(0),
          ),
          unmatchedSchedulePairCount: Schema.Number.check(Schema.isInt()).check(
            Schema.isGreaterThanOrEqualTo(0),
          ),
        }),
      ),
    ),
  }),
  dimensions: Schema.Struct({
    months: Schema.Array(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/))),
    dayparts: Schema.Array(StudioRouteSpeedHistoryDaypartSchema),
    segments: Schema.Array(
      Schema.Struct({
        segmentId: Schema.String,
        direction: Schema.String,
        displayOrder: Schema.Number,
        label: Schema.String,
        fromNodeId: Schema.String,
        toNodeId: Schema.String,
      }),
    ),
  }),
  summary: Schema.Struct({
    monthCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    segmentCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    daypartCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    cellCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    expectedCellCount: Schema.optional(
      Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    ),
    availableExpectedCellCount: Schema.optional(
      Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    ),
    missingExpectedCellCount: Schema.optional(
      Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    ),
    notExpectedCellCount: Schema.optional(
      Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    ),
    availableCellCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    missingCellCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    sourceObservationCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    traversalCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    unmappedRawKeyCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    ignoredNonSegmentSourceKeyCount: Schema.optional(
      Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    ),
  }),
  unmappedRawKeys: Schema.Array(
    Schema.Struct({
      direction: Schema.String,
      stopOrder: Schema.Number,
      fromStopId: Schema.NullOr(Schema.String),
      toStopId: Schema.NullOr(Schema.String),
      sourceRowCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    }),
  ),
  cells: Schema.Array(StudioRouteSpeedHistoryCellSchema),
});

export const StudioRouteSectionIdSchema = Schema.Literals([
  "needs_attention",
  "worsening_fast",
  "treatment_gaps",
  "data_coverage",
  "reliability_watch",
  "evidence_ready",
]);

export const StudioRouteSectionStatusSchema = Schema.Literals([
  "available",
  "partial",
  "not_built",
]);

export const StudioRouteSectionMetricSchema = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1)),
  label: Schema.String.check(Schema.isMinLength(1)),
  value: Schema.NullOr(Schema.Number),
  unit: Schema.NullOr(Schema.String),
  displayValue: Schema.String.check(Schema.isMinLength(1)),
});

export const StudioRouteSectionRowSchema = Schema.Struct({
  rank: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
  routeId: Schema.String.check(Schema.isMinLength(1)),
  slug: Schema.String.check(Schema.isMinLength(1)),
  label: Schema.String.check(Schema.isMinLength(1)),
  borough: Schema.String.check(Schema.isMinLength(1)),
  supportLevel: Schema.Literals([
    "index_only",
    "summary_ready",
    "artifact_ready",
    "evidence_ready",
  ]),
  score: Schema.Number,
  scoreLabel: Schema.String.check(Schema.isMinLength(1)),
  reasons: Schema.Array(Schema.String.check(Schema.isMinLength(1))),
  metrics: Schema.Array(StudioRouteSectionMetricSchema),
  /** §16-D3 trend baseline: % speed change vs 6 months before the latest speed month. */
  movement6mPct: Schema.NullOr(Schema.Number),
  /** 12-month context companion to the 6-month movement. */
  context12mPct: Schema.NullOr(Schema.Number),
});

export const StudioRouteSectionSchema = Schema.Struct({
  sectionId: StudioRouteSectionIdSchema,
  title: Schema.String.check(Schema.isMinLength(1)),
  productQuestion: Schema.String.check(Schema.isMinLength(1)),
  status: StudioRouteSectionStatusSchema,
  rankMeaning: Schema.String.check(Schema.isMinLength(1)),
  minCoverageRule: Schema.String.check(Schema.isMinLength(1)),
  rows: Schema.Array(StudioRouteSectionRowSchema),
  caveats: Schema.Array(Schema.String),
  notBuiltReason: Schema.NullOr(Schema.String),
});

export const StudioRouteSectionsResponseSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  generatedAt: Schema.String,
  releaseId: Schema.String,
  publishedAt: Schema.String,
  coverage: CoverageWindowSchema,
  /** Latest data month behind the rankings — the user-facing freshness label (C3). */
  dataAsOf: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/)),
  sections: Schema.Array(StudioRouteSectionSchema),
  quality: StudioQualitySchema,
});

export type StudioObservedReliability = typeof StudioObservedReliabilitySchema.Type;
export type StudioRoute = typeof StudioRouteSchema.Type;
export type StudioSegment = typeof StudioSegmentSchema.Type;
export type StudioRouteArtifactRef = typeof StudioRouteArtifactRefSchema.Type;
export type StudioRouteEquityContext = typeof StudioRouteEquityContextSchema.Type;
export type StudioRouteInsight = typeof StudioRouteInsightSchema.Type;
export type StudioRouteInsightKind = typeof StudioRouteInsightKindSchema.Type;
export type StudioRouteInsightPlacement = typeof StudioRouteInsightPlacementSchema.Type;
export type StudioRouteInsightSeverity = typeof StudioRouteInsightSeveritySchema.Type;
export type StudioRoutesResponse = typeof StudioRoutesResponseSchema.Type;
export type StudioSegmentsResponse = typeof StudioSegmentsResponseSchema.Type;
export type StudioRouteDetailResponse = typeof StudioRouteDetailResponseSchema.Type;
export type StudioRouteHistoryPoint = typeof StudioRouteHistoryPointSchema.Type;
export type StudioRouteHistoryCoverage = typeof StudioRouteHistoryCoverageSchema.Type;
export type StudioRouteHistoryResponse = typeof StudioRouteHistoryResponseSchema.Type;
export type StudioRouteHourlyProfileHour = typeof StudioRouteHourlyProfileHourSchema.Type;
export type StudioRouteHourlyProfilePeakWindow =
  typeof StudioRouteHourlyProfilePeakWindowSchema.Type;
export type StudioRouteHourlyProfileSlowestWindow =
  typeof StudioRouteHourlyProfileSlowestWindowSchema.Type;
export type StudioRouteReliabilitySample = typeof StudioRouteReliabilitySampleSchema.Type;
export type StudioRouteHourlyProfileMonthlyProfile =
  typeof StudioRouteHourlyProfileMonthlyProfileSchema.Type;
export type StudioRouteHourlyProfileResponse = typeof StudioRouteHourlyProfileResponseSchema.Type;
export type StudioRouteSpeedHistoryDaypart = typeof StudioRouteSpeedHistoryDaypartSchema.Type;
export type StudioRouteSpeedSpineReadiness = typeof StudioRouteSpeedSpineReadinessSchema.Type;
export type StudioRouteSpeedHistoryCell = typeof StudioRouteSpeedHistoryCellSchema.Type;
export type StudioRouteSpeedHistoryResponse = typeof StudioRouteSpeedHistoryResponseSchema.Type;
export type StudioRouteSectionId = typeof StudioRouteSectionIdSchema.Type;
export type StudioRouteSectionStatus = typeof StudioRouteSectionStatusSchema.Type;
export type StudioRouteSectionMetric = typeof StudioRouteSectionMetricSchema.Type;
export type StudioRouteSectionRow = typeof StudioRouteSectionRowSchema.Type;
export type StudioRouteSection = typeof StudioRouteSectionSchema.Type;
export type StudioRouteSectionsResponse = typeof StudioRouteSectionsResponseSchema.Type;
