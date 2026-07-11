import { Schema } from "effect";
import { IsoMonthSchema, RouteIdSchema, SourceCitationSchema } from "../primitives/index.js";
import { registerProjectSchema } from "../schema-registry.js";

const schemaVersion = 1;

export const RouteCoverageStatusSchema = registerProjectSchema(
  Schema.Literals(["full", "no_observed_speed"]),
  {
    id: "bp.route_coverage_status",
    title: "Route Coverage Status",
    description:
      "Whether a route scorecard is backed by observed speed data for the analysis month.",
    stability: "draft",
  },
);

export type RouteCoverageStatus = typeof RouteCoverageStatusSchema.Type;

export const RouteScorecardSchema = registerProjectSchema(
  Schema.Struct({
    schemaVersion: Schema.Literal(schemaVersion),
    routeId: RouteIdSchema,
    month: IsoMonthSchema,
    routeScore: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).check(
      Schema.isLessThanOrEqualTo(100),
    ),
    coverageStatus: RouteCoverageStatusSchema,
    averageSpeedMph: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
    hotspotCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    citations: Schema.Array(SourceCitationSchema).check(Schema.isMinLength(1)),
  }),
  {
    id: "bp.route_scorecard.v1",
    title: "Route Scorecard",
    description: "Compact read model served by the public app for one route and month.",
    stability: "draft",
  },
);

export type RouteScorecard = typeof RouteScorecardSchema.Type;

export const ReleaseLayerSchema = registerProjectSchema(
  Schema.Literals([
    "baseline_release",
    "current_signal",
    "pending_publication",
    "observed_release",
  ]),
  {
    id: "bp.release_layer",
    title: "Release Layer",
    description: "Completeness-aware layer used by the public API to label data freshness.",
    stability: "draft",
  },
);

export type ReleaseLayer = typeof ReleaseLayerSchema.Type;

export const CompletenessStatusSchema = registerProjectSchema(
  Schema.Literals([
    "complete",
    "partial_realtime_only",
    "partial_public_monthly_only",
    "missing_speed",
    "missing_realtime",
    "insufficient_samples",
    "source_lag_expected",
  ]),
  {
    id: "bp.completeness_status",
    title: "Completeness Status",
    description: "Machine-readable status describing what can be claimed for a metric or release.",
    stability: "draft",
  },
);

export type CompletenessStatus = typeof CompletenessStatusSchema.Type;

export const ApiDataQualitySchema = registerProjectSchema(
  Schema.Struct({
    releaseLayer: ReleaseLayerSchema,
    completenessStatus: CompletenessStatusSchema,
    confidence: Schema.Literals(["high", "medium", "low"]),
    caveats: Schema.Array(Schema.String.check(Schema.isMinLength(1))),
  }),
  {
    id: "bp.api_data_quality.v1",
    title: "API Data Quality",
    description: "Public API quality envelope for source cadence, completeness, and caveats.",
    stability: "draft",
  },
);

export type ApiDataQuality = typeof ApiDataQualitySchema.Type;

export const ReleaseStatusResponseSchema = registerProjectSchema(
  Schema.Struct({
    schemaVersion: Schema.Literal(schemaVersion),
    generatedAt: Schema.String.check(
      Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/),
    ),
    baselineMonth: IsoMonthSchema,
    currentSignalMonth: Schema.NullOr(IsoMonthSchema),
    canonicalMonthlyRelease: Schema.Struct({
      month: IsoMonthSchema,
      status: Schema.Literals(["pass", "fail", "missing"]),
      routeCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      artifactCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      issueCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    }),
    observedRealtimeEvidence: Schema.Struct({
      runId: Schema.NullOr(Schema.String.check(Schema.isMinLength(1))),
      source: Schema.Literals(["official_self_collected", "third_party_recovered", "none"]),
      observedRouteCount: Schema.Number.check(Schema.isInt()).check(
        Schema.isGreaterThanOrEqualTo(0),
      ),
      insufficientRouteCount: Schema.Number.check(Schema.isInt()).check(
        Schema.isGreaterThanOrEqualTo(0),
      ),
      sampleCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      routeCoverageShare: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).check(
        Schema.isLessThanOrEqualTo(1),
      ),
    }),
    currentObservedSignal: Schema.NullOr(
      Schema.Struct({
        month: IsoMonthSchema,
        runId: Schema.NullOr(Schema.String.check(Schema.isMinLength(1))),
        source: Schema.Literals(["official_self_collected", "third_party_recovered", "none"]),
        releaseLayer: Schema.Literal("current_signal"),
        routeCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
        observedRouteCount: Schema.Number.check(Schema.isInt()).check(
          Schema.isGreaterThanOrEqualTo(0),
        ),
        insufficientRouteCount: Schema.Number.check(Schema.isInt()).check(
          Schema.isGreaterThanOrEqualTo(0),
        ),
        sampleCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
        caveats: Schema.Array(Schema.String.check(Schema.isMinLength(1))),
      }),
    ),
    quality: ApiDataQualitySchema,
  }),
  {
    id: "bp.release_status_response.v1",
    title: "Release Status Response",
    description: "Public API response describing the active release month and data provenance.",
    stability: "draft",
  },
);

export type ReleaseStatusResponse = typeof ReleaseStatusResponseSchema.Type;

export const RouteCardSchema = registerProjectSchema(
  Schema.Struct({
    routeId: RouteIdSchema,
    shortName: Schema.String.check(Schema.isMinLength(1)),
    month: IsoMonthSchema,
    rank: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
    routeScore: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).check(
      Schema.isLessThanOrEqualTo(100),
    ),
    averageSpeedMph: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
    hotspotCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    totalRidership: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
    aceActive: Schema.Boolean,
    busLaneMatchedLaneCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    observedBunchingShare: Schema.NullOr(
      Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).check(Schema.isLessThanOrEqualTo(1)),
    ),
    observedLongGapShare: Schema.NullOr(
      Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).check(Schema.isLessThanOrEqualTo(1)),
    ),
    reliabilityStatus: Schema.NullOr(Schema.Literals(["observed", "insufficient_gtfs_rt_samples"])),
    sampleCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    quality: ApiDataQualitySchema,
  }),
  {
    id: "bp.route_card.v1",
    title: "Route Card",
    description: "Compact public route card for ranked lists, search, and hotspot panels.",
    stability: "draft",
  },
);

export type RouteCard = typeof RouteCardSchema.Type;

export const RouteListResponseSchema = registerProjectSchema(
  Schema.Struct({
    schemaVersion: Schema.Literal(schemaVersion),
    generatedAt: Schema.String.check(
      Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/),
    ),
    baselineMonth: IsoMonthSchema,
    routes: Schema.Array(RouteCardSchema),
    quality: ApiDataQualitySchema,
  }),
  {
    id: "bp.route_list_response.v1",
    title: "Route List Response",
    description: "Public API response for compact route cards in the active release month.",
    stability: "draft",
  },
);

export type RouteListResponse = typeof RouteListResponseSchema.Type;

export const RouteArtifactRefSchema = registerProjectSchema(
  Schema.Struct({
    name: Schema.String.check(Schema.isMinLength(1)),
    key: Schema.String.check(Schema.isMinLength(1)),
    contentType: Schema.String.check(Schema.isMinLength(1)),
    byteLength: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    sha256: Schema.String.check(Schema.isLengthBetween(64, 64)),
  }),
  {
    id: "bp.route_artifact_ref.v1",
    title: "Route Artifact Reference",
    description: "Reference to a generated route artifact stored outside the compact D1 payload.",
    stability: "draft",
  },
);

export type RouteArtifactRef = typeof RouteArtifactRefSchema.Type;

export const RouteProfileResponseSchema = registerProjectSchema(
  Schema.Struct({
    schemaVersion: Schema.Literal(schemaVersion),
    generatedAt: Schema.String.check(
      Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/),
    ),
    baselineMonth: IsoMonthSchema,
    route: RouteCardSchema,
    peakRidership: Schema.NullOr(
      Schema.Struct({
        dayOfWeek: Schema.String.check(Schema.isMinLength(1)),
        hourOfDay: Schema.Number.check(Schema.isInt())
          .check(Schema.isGreaterThanOrEqualTo(0))
          .check(Schema.isLessThanOrEqualTo(23)),
        ridership: Schema.NullOr(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))),
        transfers: Schema.NullOr(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))),
        weightedAverageSpeedMph: Schema.NullOr(
          Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
        ),
      }),
    ),
    slowestWindow: Schema.NullOr(
      Schema.Struct({
        dayOfWeek: Schema.String.check(Schema.isMinLength(1)),
        hourOfDay: Schema.Number.check(Schema.isInt())
          .check(Schema.isGreaterThanOrEqualTo(0))
          .check(Schema.isLessThanOrEqualTo(23)),
        observationCount: Schema.NullOr(
          Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
        ),
        busTripCount: Schema.NullOr(
          Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
        ),
        weightedAverageSpeedMph: Schema.NullOr(
          Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
        ),
        slowObservationShare: Schema.NullOr(
          Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).check(
            Schema.isLessThanOrEqualTo(1),
          ),
        ),
      }),
    ),
    observedReliability: Schema.NullOr(
      Schema.Struct({
        runId: Schema.String.check(Schema.isMinLength(1)),
        reliabilityStatus: Schema.Literals(["observed", "insufficient_gtfs_rt_samples"]),
        sampleCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
        medianObservedHeadwayMinutes: Schema.NullOr(
          Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
        ),
        p90ObservedHeadwayMinutes: Schema.NullOr(
          Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
        ),
        observedBunchingShare: Schema.NullOr(
          Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).check(
            Schema.isLessThanOrEqualTo(1),
          ),
        ),
        observedLongGapShare: Schema.NullOr(
          Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).check(
            Schema.isLessThanOrEqualTo(1),
          ),
        ),
        excessWaitMinutes: Schema.NullOr(Schema.Number),
      }),
    ),
    artifacts: Schema.Array(RouteArtifactRefSchema),
    quality: ApiDataQualitySchema,
  }),
  {
    id: "bp.route_profile_response.v1",
    title: "Route Profile Response",
    description: "Public API response for one route profile panel in the active release month.",
    stability: "draft",
  },
);

export type RouteProfileResponse = typeof RouteProfileResponseSchema.Type;

export const HotspotCardSchema = registerProjectSchema(
  Schema.Struct({
    corridorId: Schema.String.check(Schema.isMinLength(1)),
    corridorName: Schema.String.check(Schema.isMinLength(1)),
    routeId: RouteIdSchema,
    month: IsoMonthSchema,
    rank: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
    routeHotspotRank: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
    fromStopName: Schema.String.check(Schema.isMinLength(1)),
    toStopName: Schema.String.check(Schema.isMinLength(1)),
    averageSpeedMph: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
    hotspotScore: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    riderImpactScore: Schema.NullOr(
      Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    ),
    quality: ApiDataQualitySchema,
  }),
  {
    id: "bp.hotspot_card.v1",
    title: "Hotspot Card",
    description: "Compact precomputed hotspot card for triage lists and map sheets.",
    stability: "draft",
  },
);

export type HotspotCard = typeof HotspotCardSchema.Type;

export const HotspotListResponseSchema = registerProjectSchema(
  Schema.Struct({
    schemaVersion: Schema.Literal(schemaVersion),
    generatedAt: Schema.String.check(
      Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/),
    ),
    baselineMonth: IsoMonthSchema,
    hotspots: Schema.Array(HotspotCardSchema),
    quality: ApiDataQualitySchema,
  }),
  {
    id: "bp.hotspot_list_response.v1",
    title: "Hotspot List Response",
    description: "Public API response for ranked precomputed hotspot cards.",
    stability: "draft",
  },
);

export type HotspotListResponse = typeof HotspotListResponseSchema.Type;

export const RouteCompareResponseSchema = registerProjectSchema(
  Schema.Struct({
    schemaVersion: Schema.Literal(schemaVersion),
    generatedAt: Schema.String.check(
      Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/),
    ),
    baselineMonth: IsoMonthSchema,
    routes: Schema.Tuple([RouteCardSchema, RouteCardSchema]),
    deltas: Schema.Struct({
      routeScore: Schema.Number,
      averageSpeedMph: Schema.Number,
      totalRidership: Schema.Number,
      observedBunchingShare: Schema.NullOr(Schema.Number),
      observedLongGapShare: Schema.NullOr(Schema.Number),
    }),
    quality: ApiDataQualitySchema,
  }),
  {
    id: "bp.route_compare_response.v1",
    title: "Route Compare Response",
    description: "Public API response for a two-route comparison panel.",
    stability: "draft",
  },
);

export type RouteCompareResponse = typeof RouteCompareResponseSchema.Type;

export const HealthResponseSchema = registerProjectSchema(
  Schema.Struct({
    ok: Schema.Literal(true),
    service: Schema.Literal("bus-priority-impact-studio"),
    checkedAt: Schema.String.check(
      Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/),
    ),
  }),
  {
    id: "bp.health_response.v1",
    title: "Health Response",
    description: "Worker health-check response contract.",
    stability: "stable",
  },
);

export type HealthResponse = typeof HealthResponseSchema.Type;
