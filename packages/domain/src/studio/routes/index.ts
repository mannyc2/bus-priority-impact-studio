import * as z from "zod";
import { StudioInterventionSchema } from "../interventions.js";
import { StudioRouteCapabilitySchema } from "../route-capability.js";
import { RouteDossierSummaryForDetailSchema } from "../route-dossier.js";
import { StudioQualitySchema } from "../shared.js";

export const StudioObservedReliabilitySchema = z
  .object({
    month: z.string(),
    runId: z.string(),
    source: z.enum(["official_self_collected", "third_party_recovered"]),
    releaseLayer: z.enum(["observed_release", "current_signal"]),
    reliabilityStatus: z.enum(["observed", "insufficient_gtfs_rt_samples"]),
    sampleCount: z.number().int().nonnegative(),
    medianObservedHeadwayMinutes: z.number().nullable(),
    p90ObservedHeadwayMinutes: z.number().nullable(),
    observedBunchingShare: z.number().nullable(),
    observedLongGapShare: z.number().nullable(),
    excessWaitMinutes: z.number().nullable(),
    caveats: z.array(z.string()),
  })
  .strict();

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

function legacyTermini(route: StudioRouteCompatInput): { north: string; south: string } {
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

export const StudioRouteSchema = z.preprocess(
  (value) => {
    if (typeof value !== "object" || value === null) return value;
    const route = value as StudioRouteCompatInput;
    return {
      ...route,
      tspCoverage: legacyTspCoverage(route.tspCoverage ?? route.tspStatus),
      diagnosis: legacyDiagnosis(route),
      termini: legacyTermini(route),
    };
  },
  z
    .object({
      slug: z.string(),
      routeId: z.string(),
      label: z.string(),
      corridor: z.string(),
      corridorFull: z.string(),
      borough: z.string(),
      sbs: z.boolean(),
      speedMph: z.number(),
      scheduledMph: z.number(),
      weightedAvgSpeed: z.number(),
      speedPercentile: z.number(),
      dailyRiders: z.number(),
      ridersYoyPct: z.number(),
      riderHoursLost: z.number(),
      laneCoverage: z.number(),
      aceStatus: z.enum(["active", "none"]),
      aceSince: z.string().nullable(),
      tspCoverage: z.enum(["yes", "partial", "none"]),
      reliability: z.string(),
      observedReliability: StudioObservedReliabilitySchema.nullable(),
      diagnosis: z.string(),
      spark: z.array(z.number()),
      termini: z
        .object({
          north: z.string(),
          south: z.string(),
        })
        .strict(),
      miles: z.number(),
      stops: z.number(),
      flags: z.array(z.string()),
      peerSlug: z.string().nullable(),
      interventions: z.array(StudioInterventionSchema),
      /** §16-D3 trend baseline (C3): % speed change vs 6/12 months before the latest speed month. */
      movement6mPct: z.number().nullable().default(null),
      context12mPct: z.number().nullable().default(null),
    })
    .strip(),
);

export const StudioSegmentSchema = z.preprocess(
  (value) => {
    if (typeof value !== "object" || value === null) return value;
    const segment = value as StudioSegmentCompatInput;
    const { aiNote } = segment;
    return {
      ...segment,
      tsp: typeof segment.tsp === "boolean" ? segment.tsp : segment.tspStatus === "installed",
      aiNote:
        typeof aiNote === "object" &&
        aiNote !== null &&
        typeof (aiNote as { body?: unknown }).body === "string"
          ? (aiNote as { body: string }).body
          : aiNote,
    };
  },
  z
    .object({
      id: z.string(),
      routeSlug: z.string(),
      direction: z.enum(["NB", "SB", "EB", "WB"]),
      from: z.string(),
      to: z.string(),
      speedMph: z.number(),
      scheduledMph: z.number(),
      riderHours: z.number(),
      lane: z.enum(["yes", "partial", "minimal", "none"]),
      ace: z.boolean(),
      tsp: z.boolean(),
      hours: z.array(z.number()),
      miles: z.number().optional(),
      timepoints: z.number().optional(),
      flagged: z.boolean().optional(),
      aiNote: z.string().optional(),
      suggestedSeeds: z.array(z.string()).optional(),
    })
    .strip(),
);

export const StudioRouteArtifactRefSchema = z
  .object({
    routeId: z.string(),
    month: z.string(),
    name: z.string(),
    key: z.string(),
    contentType: z.string(),
    byteLength: z.number().int().nonnegative(),
    sha256: z.string(),
  })
  .strict();

export const StudioRouteInsightKindSchema = z.enum([
  "customer_journey",
  "treatment_scope",
  "timeline_annotation",
  "map_segment",
  "performance_annotation",
]);

export const StudioRouteInsightPlacementSchema = z.enum([
  "overview",
  "chart_annotation",
  "map_segment",
  "timeline",
]);

export const StudioRouteInsightSeveritySchema = z.enum(["low", "medium", "high"]);

export const StudioRouteInsightSchema = z
  .object({
    routeId: z.string(),
    kind: StudioRouteInsightKindSchema,
    placement: StudioRouteInsightPlacementSchema,
    title: z.string(),
    shortText: z.string(),
    severity: StudioRouteInsightSeveritySchema,
    month: z.string().optional(),
    asOfMonth: z.string().nullable().optional(),
    scopeId: z.string().optional(),
    target: z
      .object({
        segmentIds: z.array(z.string()).optional(),
        direction: z.string().optional(),
        segmentIndex: z.number().int().nonnegative().optional(),
        fromNodeId: z.string().optional(),
        toNodeId: z.string().optional(),
      })
      .strict()
      .optional(),
    detectorId: z.string(),
    refs: z.array(
      z
        .object({
          evidenceRefPath: z.string().optional(),
          sourceProjectionPath: z.string().optional(),
        })
        .strict(),
    ),
    caveatsForTooltip: z.array(z.string()).optional(),
  })
  .strict();

export const StudioRouteEquityContextSchema = z
  .object({
    acsYear: z.number().int(),
    assignedCountyName: z.string().nullable(),
    totalPopulation: z.number().int().nonnegative().nullable(),
    noVehicleHouseholdShare: z.number().nonnegative().nullable(),
    medianHouseholdIncome: z.number().nonnegative().nullable(),
    povertyRate: z.number().nonnegative().nullable(),
    publicTransitCommuterShare: z.number().nonnegative().nullable(),
  })
  .strict();

export const StudioRoutesResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    routes: z.array(StudioRouteSchema),
    quality: StudioQualitySchema,
  })
  .strict();

export const StudioSegmentsResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    segments: z.array(StudioSegmentSchema),
    quality: StudioQualitySchema,
  })
  .strict();

const HourOfDaySchema = z.number().int().min(0).max(23);

export const StudioRouteHourlyProfileHourSchema = z
  .object({
    hourOfDay: HourOfDaySchema,
    speedObservationCount: z.number().int().nonnegative(),
    speedBusTripCount: z.number().int().nonnegative(),
    averageSpeedMph: z.number().nullable(),
    ridership: z.number().nullable(),
    transfers: z.number().nullable(),
  })
  .strict();

export const StudioRouteHourlyProfilePeakWindowSchema = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    dayOfWeek: z.string(),
    hourOfDay: HourOfDaySchema,
    ridership: z.number().nullable(),
  })
  .strict();

export const StudioRouteHourlyProfileSlowestWindowSchema = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    dayOfWeek: z.string(),
    hourOfDay: HourOfDaySchema,
    observationCount: z.number().int().nonnegative(),
    busTripCount: z.number().int().nonnegative(),
    weightedAverageSpeedMph: z.number().nullable(),
  })
  .strict();

export const StudioRouteReliabilitySampleSchema = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    hourOfDay: HourOfDaySchema,
    sampleCount: z.number().int().nonnegative(),
    averageObservedHeadwayMinutes: z.number().nonnegative(),
  })
  .strict();

export const StudioRouteHourlyProfileMonthlyProfileSchema = z
  .object({
    routeId: z.string(),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    hourlyRowCount: z.number().int().nonnegative(),
    totalRidership: z.number().nonnegative(),
    totalTransfers: z.number().nonnegative(),
    peakWindow: z
      .object({
        dayOfWeek: z.string(),
        hourOfDay: HourOfDaySchema,
        ridership: z.number().nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const StudioRouteHourlyProfileResponseSchema = z
  .object({
    artifactKind: z.literal("studio_route_hourly_profile"),
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    routeId: z.string(),
    routeSlug: z.string(),
    source: z
      .object({
        tables: z.tuple([
          z.literal("local_route_hourly_ridership"),
          z.literal("local_route_segment_speed"),
          z.literal("local_route_observed_reliability_summary"),
          z.literal("local_observed_headway_sample"),
        ]),
        dbPath: z.string(),
        startMonth: z.string().regex(/^\d{4}-\d{2}$/),
        endMonth: z.string().regex(/^\d{4}-\d{2}$/),
        artifactPath: z.string(),
      })
      .strict(),
    dimensions: z
      .object({
        months: z.array(z.string().regex(/^\d{4}-\d{2}$/)),
        hours: z.array(HourOfDaySchema).length(24),
      })
      .strict(),
    summary: z
      .object({
        monthCount: z.number().int().nonnegative(),
        latestMonth: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .nullable(),
        hourCount: z.literal(24),
        populatedHourCount: z.number().int().nonnegative(),
        speedObservationCount: z.number().int().nonnegative(),
        speedBusTripCount: z.number().int().nonnegative(),
        totalRidership: z.number().nonnegative(),
        totalTransfers: z.number().nonnegative(),
        reliabilitySampleCount: z.number().int().nonnegative(),
      })
      .strict(),
    hours: z.array(StudioRouteHourlyProfileHourSchema).length(24),
    peakWindows: z.array(StudioRouteHourlyProfilePeakWindowSchema),
    slowestWindows: z.array(StudioRouteHourlyProfileSlowestWindowSchema),
    reliabilitySamples: z.array(StudioRouteReliabilitySampleSchema),
    monthlyProfiles: z.array(StudioRouteHourlyProfileMonthlyProfileSchema),
  })
  .strict();

/**
 * Route detail v2 (frontend §7.2 / hard-cutover C2): the route evidence dossier.
 * Identity + segments + the pipeline-built capability row and dossier summary
 * (series-shaped, per-block dataAsOf). One Tier-1 fetch renders the page; cell-grain
 * data stays in lazy artifacts referenced by `artifactRefs`. `capability` and
 * `dossier` are null only on the partial D1 fallback for routes without rich
 * artifacts — the UI renders the honest building/insufficient states from that.
 */
export const StudioRouteDetailResponseSchema = z
  .object({
    schemaVersion: z.literal(2),
    generatedAt: z.string(),
    route: StudioRouteSchema,
    peerRoute: StudioRouteSchema.optional(),
    segments: z.array(StudioSegmentSchema),
    artifactRefs: z.array(StudioRouteArtifactRefSchema),
    insights: z.array(StudioRouteInsightSchema).default([]),
    peakWindows: z.array(StudioRouteHourlyProfilePeakWindowSchema).default([]),
    slowestWindows: z.array(StudioRouteHourlyProfileSlowestWindowSchema).default([]),
    reliabilitySamples: z.array(StudioRouteReliabilitySampleSchema).default([]),
    capability: StudioRouteCapabilitySchema.nullable().default(null),
    dossier: RouteDossierSummaryForDetailSchema.nullable().default(null),
    equityContext: StudioRouteEquityContextSchema.nullable().default(null),
    quality: StudioQualitySchema,
  })
  .strict();

export const StudioRouteHistoryPointSchema = z
  .object({
    routeId: z.string(),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    speedObservationCount: z.number().int().nonnegative(),
    speedBusTripCount: z.number().int().nonnegative(),
    averageSpeedMph: z.number().nullable(),
    ridership: z.number().nullable(),
    transfers: z.number().nullable(),
    hasSpeedTrend: z.boolean(),
    hasRidershipTrend: z.boolean(),
  })
  .strict();

export const StudioRouteHistoryCoverageSchema = z
  .object({
    startMonth: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .nullable(),
    endMonth: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .nullable(),
    pointCount: z.number().int().nonnegative(),
    speedMonthCount: z.number().int().nonnegative(),
    ridershipMonthCount: z.number().int().nonnegative(),
  })
  .strict();

export const StudioRouteHistoryResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    route: StudioRouteSchema,
    points: z.array(StudioRouteHistoryPointSchema),
    coverage: StudioRouteHistoryCoverageSchema,
    quality: StudioQualitySchema,
  })
  .strict();

export const StudioRouteSpeedHistoryDaypartSchema = z.enum([
  "am_peak",
  "midday",
  "pm_peak",
  "off_peak",
]);

export const StudioRouteSpeedHistoryCellSchema = z
  .object({
    segmentId: z.string(),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    daypart: StudioRouteSpeedHistoryDaypartSchema,
    status: z.enum(["available", "missing", "not_expected", "source_missing"]),
    observationCount: z.number().int().nonnegative(),
    traversalCount: z.number().int().nonnegative(),
    averageSpeedMph: z.number().nullable(),
    averageTravelTimeMinutes: z.number().nullable(),
    averageRoadDistanceMiles: z.number().nullable(),
    segmentDaypartMeanSpeedMph: z.number().nullable(),
    deltaFromSegmentDaypartMeanMph: z.number().nullable(),
    pctFromSegmentDaypartMean: z.number().nullable(),
  })
  .strict();

export const StudioRouteSpeedHistoryResponseSchema = z
  .object({
    artifactKind: z.literal("studio_route_speed_history"),
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    routeId: z.string(),
    routeSlug: z.string(),
    source: z
      .object({
        table: z.literal("local_route_segment_speed"),
        dbPath: z.string(),
        speedSpinePath: z.string(),
        startMonth: z.string().regex(/^\d{4}-\d{2}$/),
        endMonth: z.string().regex(/^\d{4}-\d{2}$/),
        artifactPath: z.string(),
        expectedService: z
          .object({
            table: z.literal("local_route_schedule_stop"),
            completeMonths: z.array(z.string().regex(/^\d{4}-\d{2}$/)),
            incompleteMonths: z.array(z.string().regex(/^\d{4}-\d{2}$/)),
            routeScheduleRowCount: z.number().int().nonnegative(),
            matchedSchedulePairCount: z.number().int().nonnegative(),
            unmatchedSchedulePairCount: z.number().int().nonnegative(),
          })
          .strict()
          .nullable()
          .optional(),
      })
      .strict(),
    dimensions: z
      .object({
        months: z.array(z.string().regex(/^\d{4}-\d{2}$/)),
        dayparts: z.array(StudioRouteSpeedHistoryDaypartSchema),
        segments: z.array(
          z
            .object({
              segmentId: z.string(),
              direction: z.string(),
              displayOrder: z.number(),
              label: z.string(),
              fromNodeId: z.string(),
              toNodeId: z.string(),
            })
            .strict(),
        ),
      })
      .strict(),
    summary: z
      .object({
        monthCount: z.number().int().nonnegative(),
        segmentCount: z.number().int().nonnegative(),
        daypartCount: z.number().int().nonnegative(),
        cellCount: z.number().int().nonnegative(),
        expectedCellCount: z.number().int().nonnegative().optional(),
        availableExpectedCellCount: z.number().int().nonnegative().optional(),
        missingExpectedCellCount: z.number().int().nonnegative().optional(),
        notExpectedCellCount: z.number().int().nonnegative().optional(),
        availableCellCount: z.number().int().nonnegative(),
        missingCellCount: z.number().int().nonnegative(),
        sourceObservationCount: z.number().int().nonnegative(),
        traversalCount: z.number().int().nonnegative(),
        unmappedRawKeyCount: z.number().int().nonnegative(),
        ignoredNonSegmentSourceKeyCount: z.number().int().nonnegative().optional(),
      })
      .strict(),
    unmappedRawKeys: z.array(
      z
        .object({
          direction: z.string(),
          stopOrder: z.number(),
          fromStopId: z.string().nullable(),
          toStopId: z.string().nullable(),
          sourceRowCount: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    cells: z.array(StudioRouteSpeedHistoryCellSchema),
  })
  .strict();

export const StudioRouteSectionIdSchema = z.enum([
  "needs_attention",
  "worsening_fast",
  "treatment_gaps",
  "data_coverage",
  "reliability_watch",
  "evidence_ready",
]);

export const StudioRouteSectionStatusSchema = z.enum(["available", "partial", "not_built"]);

export const StudioRouteSectionMetricSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    value: z.number().nullable(),
    unit: z.string().nullable(),
    displayValue: z.string().min(1),
  })
  .strict();

export const StudioRouteSectionRowSchema = z
  .object({
    rank: z.number().int().positive(),
    routeId: z.string().min(1),
    slug: z.string().min(1),
    label: z.string().min(1),
    borough: z.string().min(1),
    supportLevel: z.enum(["index_only", "summary_ready", "artifact_ready", "evidence_ready"]),
    score: z.number(),
    scoreLabel: z.string().min(1),
    reasons: z.array(z.string().min(1)),
    metrics: z.array(StudioRouteSectionMetricSchema),
    /** §16-D3 trend baseline: % speed change vs 6 months before the latest speed month. */
    movement6mPct: z.number().nullable(),
    /** 12-month context companion to the 6-month movement. */
    context12mPct: z.number().nullable(),
  })
  .strict();

export const StudioRouteSectionSchema = z
  .object({
    sectionId: StudioRouteSectionIdSchema,
    title: z.string().min(1),
    productQuestion: z.string().min(1),
    status: StudioRouteSectionStatusSchema,
    rankMeaning: z.string().min(1),
    minCoverageRule: z.string().min(1),
    rows: z.array(StudioRouteSectionRowSchema),
    caveats: z.array(z.string()),
    notBuiltReason: z.string().nullable(),
  })
  .strict();

export const StudioRouteSectionsResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    releaseId: z.string(),
    /** Serving month the sections were built from (provenance; resolved internally — C3). */
    baselineMonth: z.string().regex(/^\d{4}-\d{2}$/),
    /** Latest data month behind the rankings — the user-facing freshness label (C3). */
    dataAsOf: z.string().regex(/^\d{4}-\d{2}$/),
    sections: z.array(StudioRouteSectionSchema),
    quality: StudioQualitySchema,
  })
  .strict();

export type StudioObservedReliability = z.output<typeof StudioObservedReliabilitySchema>;
export type StudioRoute = z.output<typeof StudioRouteSchema>;
export type StudioSegment = z.output<typeof StudioSegmentSchema>;
export type StudioRouteArtifactRef = z.output<typeof StudioRouteArtifactRefSchema>;
export type StudioRouteEquityContext = z.output<typeof StudioRouteEquityContextSchema>;
export type StudioRouteInsight = z.output<typeof StudioRouteInsightSchema>;
export type StudioRouteInsightKind = z.output<typeof StudioRouteInsightKindSchema>;
export type StudioRouteInsightPlacement = z.output<typeof StudioRouteInsightPlacementSchema>;
export type StudioRouteInsightSeverity = z.output<typeof StudioRouteInsightSeveritySchema>;
export type StudioRoutesResponse = z.output<typeof StudioRoutesResponseSchema>;
export type StudioSegmentsResponse = z.output<typeof StudioSegmentsResponseSchema>;
export type StudioRouteDetailResponse = z.output<typeof StudioRouteDetailResponseSchema>;
export type StudioRouteHistoryPoint = z.output<typeof StudioRouteHistoryPointSchema>;
export type StudioRouteHistoryCoverage = z.output<typeof StudioRouteHistoryCoverageSchema>;
export type StudioRouteHistoryResponse = z.output<typeof StudioRouteHistoryResponseSchema>;
export type StudioRouteHourlyProfileHour = z.output<typeof StudioRouteHourlyProfileHourSchema>;
export type StudioRouteHourlyProfilePeakWindow = z.output<
  typeof StudioRouteHourlyProfilePeakWindowSchema
>;
export type StudioRouteHourlyProfileSlowestWindow = z.output<
  typeof StudioRouteHourlyProfileSlowestWindowSchema
>;
export type StudioRouteReliabilitySample = z.output<typeof StudioRouteReliabilitySampleSchema>;
export type StudioRouteHourlyProfileMonthlyProfile = z.output<
  typeof StudioRouteHourlyProfileMonthlyProfileSchema
>;
export type StudioRouteHourlyProfileResponse = z.output<
  typeof StudioRouteHourlyProfileResponseSchema
>;
export type StudioRouteSpeedHistoryDaypart = z.output<typeof StudioRouteSpeedHistoryDaypartSchema>;
export type StudioRouteSpeedHistoryCell = z.output<typeof StudioRouteSpeedHistoryCellSchema>;
export type StudioRouteSpeedHistoryResponse = z.output<
  typeof StudioRouteSpeedHistoryResponseSchema
>;
export type StudioRouteSectionId = z.output<typeof StudioRouteSectionIdSchema>;
export type StudioRouteSectionStatus = z.output<typeof StudioRouteSectionStatusSchema>;
export type StudioRouteSectionMetric = z.output<typeof StudioRouteSectionMetricSchema>;
export type StudioRouteSectionRow = z.output<typeof StudioRouteSectionRowSchema>;
export type StudioRouteSection = z.output<typeof StudioRouteSectionSchema>;
export type StudioRouteSectionsResponse = z.output<typeof StudioRouteSectionsResponseSchema>;
