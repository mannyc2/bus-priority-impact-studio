import * as z from "zod";
import { registerProjectSchema, toProjectJsonSchema } from "./schema-registry.js";

const schemaVersion = 1;

export const RouteIdSchema = registerProjectSchema(
  z
    .string()
    .min(1)
    .max(12)
    .regex(/^[A-Z][A-Z0-9+-]*$/)
    .brand<"RouteId">(),
  {
    id: "bp.route_id",
    title: "Route ID",
    description: "Short public MTA bus route identifier such as M1, B46-SBS, or Q70+.",
    stability: "draft",
  },
);

export type RouteId = z.output<typeof RouteIdSchema>;

export const RouteIdCodec = z.codec(z.string(), RouteIdSchema, {
  decode: (value) => RouteIdSchema.parse(value.trim().toUpperCase()),
  encode: (value) => value,
});

export const DirectionIdSchema = registerProjectSchema(z.enum(["0", "1"]).brand<"DirectionId">(), {
  id: "bp.direction_id",
  title: "Direction ID",
  description: "GTFS-style bus direction identifier. This MVP only accepts 0 or 1.",
  stability: "draft",
});

export type DirectionId = z.output<typeof DirectionIdSchema>;

export const IsoMonthSchema = registerProjectSchema(
  z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .brand<"IsoMonth">(),
  {
    id: "bp.iso_month",
    title: "ISO Month",
    description: "Calendar month in YYYY-MM format.",
    stability: "draft",
  },
);

export type IsoMonth = z.output<typeof IsoMonthSchema>;

export const SourceCitationSchema = registerProjectSchema(
  z
    .object({
      sourceId: z.string().min(1),
      title: z.string().min(1),
      url: z.url(),
      verifiedAt: z.iso.datetime(),
    })
    .strict(),
  {
    id: "bp.source_citation",
    title: "Source Citation",
    description: "Auditable reference used by public route briefs and generated explanations.",
    stability: "draft",
  },
);

export type SourceCitation = z.output<typeof SourceCitationSchema>;

export const MetricNameSchema = registerProjectSchema(
  z.enum(["average_speed_mph", "travel_time_seconds", "hotspot_score", "route_score"]),
  {
    id: "bp.metric_name",
    title: "Metric Name",
    description: "Metric identifiers allowed in route scorecards and hotspot summaries.",
    stability: "draft",
  },
);

export type MetricName = z.output<typeof MetricNameSchema>;

export const MapLayerMetricSchema = registerProjectSchema(
  z.enum(["average_speed_mph", "hotspot_score", "ace_status", "bus_lane_presence"]),
  {
    id: "bp.map_layer_metric",
    title: "Map Layer Metric",
    description: "Metric identifiers available for public map layer styling and legends.",
    stability: "draft",
  },
);

export type MapLayerMetric = z.output<typeof MapLayerMetricSchema>;

export const NycBoroughSchema = registerProjectSchema(
  z.enum(["Bronx", "Brooklyn", "Manhattan", "Queens", "Staten Island"]),
  {
    id: "bp.nyc_borough",
    title: "NYC Borough",
    description: "The five New York City boroughs used to scope public map layers.",
    stability: "stable",
  },
);

export type NycBorough = z.output<typeof NycBoroughSchema>;

export const LongitudeLatitudeCoordinateSchema = registerProjectSchema(
  z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]).readonly(),
  {
    id: "bp.longitude_latitude_coordinate",
    title: "Longitude/Latitude Coordinate",
    description: "GeoJSON coordinate pair in [longitude, latitude] order.",
    stability: "draft",
  },
);

export type LongitudeLatitudeCoordinate = z.output<typeof LongitudeLatitudeCoordinateSchema>;

export const MapRouteSegmentPropertiesSchema = registerProjectSchema(
  z
    .object({
      segmentId: z.string().min(1),
      routeId: RouteIdSchema,
      directionId: DirectionIdSchema,
      month: IsoMonthSchema,
      hourOfDay: z.number().int().min(0).max(23).nullable(),
      averageSpeedMph: z.number().nonnegative().nullable(),
      hotspotScore: z.number().min(0).max(100),
      rankOnRoute: z.number().int().nonnegative().nullable(),
      startStopName: z.string().min(1).nullable(),
      endStopName: z.string().min(1).nullable(),
    })
    .strict()
    .readonly(),
  {
    id: "bp.map_route_segment_properties.v1",
    title: "Map Route Segment Properties",
    description: "Public properties attached to a derived timepoint-to-timepoint bus segment.",
    stability: "draft",
  },
);

export type MapRouteSegmentProperties = z.output<typeof MapRouteSegmentPropertiesSchema>;

export const MapLineStringGeometrySchema = registerProjectSchema(
  z
    .object({
      type: z.literal("LineString"),
      coordinates: z.array(LongitudeLatitudeCoordinateSchema).min(2),
    })
    .strict()
    .readonly(),
  {
    id: "bp.map_linestring_geometry.v1",
    title: "Map LineString Geometry",
    description: "GeoJSON LineString geometry used by precomputed route-segment artifacts.",
    stability: "draft",
  },
);

export type MapLineStringGeometry = z.output<typeof MapLineStringGeometrySchema>;

export const MapRouteSegmentFeatureSchema = registerProjectSchema(
  z
    .object({
      type: z.literal("Feature"),
      id: z.string().min(1),
      geometry: MapLineStringGeometrySchema,
      properties: MapRouteSegmentPropertiesSchema,
    })
    .strict()
    .readonly(),
  {
    id: "bp.map_route_segment_feature.v1",
    title: "Map Route Segment Feature",
    description: "GeoJSON feature for one precomputed route segment served to the public map.",
    stability: "draft",
  },
);

export type MapRouteSegmentFeature = z.output<typeof MapRouteSegmentFeatureSchema>;

export const MapRouteSegmentFeatureCollectionSchema = registerProjectSchema(
  z
    .object({
      type: z.literal("FeatureCollection"),
      features: z.array(MapRouteSegmentFeatureSchema),
    })
    .strict()
    .readonly(),
  {
    id: "bp.map_route_segment_feature_collection.v1",
    title: "Map Route Segment Feature Collection",
    description: "GeoJSON FeatureCollection for precomputed route segment map artifacts.",
    stability: "draft",
  },
);

export type MapRouteSegmentFeatureCollection = z.output<
  typeof MapRouteSegmentFeatureCollectionSchema
>;

export const RouteCoverageStatusSchema = registerProjectSchema(
  z.enum(["full", "no_observed_speed"]),
  {
    id: "bp.route_coverage_status",
    title: "Route Coverage Status",
    description:
      "Whether a route scorecard is backed by observed speed data for the analysis month.",
    stability: "draft",
  },
);

export type RouteCoverageStatus = z.output<typeof RouteCoverageStatusSchema>;

export const RouteScorecardSchema = registerProjectSchema(
  z
    .object({
      schemaVersion: z.literal(schemaVersion),
      routeId: RouteIdSchema,
      month: IsoMonthSchema,
      routeScore: z.number().min(0).max(100),
      coverageStatus: RouteCoverageStatusSchema,
      averageSpeedMph: z.number().nonnegative(),
      hotspotCount: z.number().int().nonnegative(),
      citations: z.array(SourceCitationSchema).min(1),
    })
    .strict()
    .readonly(),
  {
    id: "bp.route_scorecard.v1",
    title: "Route Scorecard",
    description: "Compact read model served by the public app for one route and month.",
    stability: "draft",
  },
);

export type RouteScorecard = z.output<typeof RouteScorecardSchema>;

export const ReleaseLayerSchema = registerProjectSchema(
  z.enum(["baseline_release", "current_signal", "pending_publication", "observed_release"]),
  {
    id: "bp.release_layer",
    title: "Release Layer",
    description: "Completeness-aware layer used by the public API to label data freshness.",
    stability: "draft",
  },
);

export type ReleaseLayer = z.output<typeof ReleaseLayerSchema>;

export const CompletenessStatusSchema = registerProjectSchema(
  z.enum([
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

export type CompletenessStatus = z.output<typeof CompletenessStatusSchema>;

export const ApiDataQualitySchema = registerProjectSchema(
  z
    .object({
      releaseLayer: ReleaseLayerSchema,
      completenessStatus: CompletenessStatusSchema,
      confidence: z.enum(["high", "medium", "low"]),
      caveats: z.array(z.string().min(1)),
    })
    .strict()
    .readonly(),
  {
    id: "bp.api_data_quality.v1",
    title: "API Data Quality",
    description: "Public API quality envelope for source cadence, completeness, and caveats.",
    stability: "draft",
  },
);

export type ApiDataQuality = z.output<typeof ApiDataQualitySchema>;

export const ReleaseStatusResponseSchema = registerProjectSchema(
  z
    .object({
      schemaVersion: z.literal(schemaVersion),
      generatedAt: z.iso.datetime(),
      baselineMonth: IsoMonthSchema,
      currentSignalMonth: IsoMonthSchema.nullable(),
      canonicalMonthlyRelease: z
        .object({
          month: IsoMonthSchema,
          status: z.enum(["pass", "fail", "missing"]),
          routeCount: z.number().int().nonnegative(),
          artifactCount: z.number().int().nonnegative(),
          issueCount: z.number().int().nonnegative(),
        })
        .strict(),
      observedRealtimeEvidence: z
        .object({
          runId: z.string().min(1).nullable(),
          source: z.enum(["official_self_collected", "third_party_recovered", "none"]),
          observedRouteCount: z.number().int().nonnegative(),
          insufficientRouteCount: z.number().int().nonnegative(),
          sampleCount: z.number().int().nonnegative(),
          routeCoverageShare: z.number().min(0).max(1),
        })
        .strict(),
      currentObservedSignal: z
        .object({
          month: IsoMonthSchema,
          runId: z.string().min(1).nullable(),
          source: z.enum(["official_self_collected", "third_party_recovered", "none"]),
          releaseLayer: z.literal("current_signal"),
          routeCount: z.number().int().nonnegative(),
          observedRouteCount: z.number().int().nonnegative(),
          insufficientRouteCount: z.number().int().nonnegative(),
          sampleCount: z.number().int().nonnegative(),
          caveats: z.array(z.string().min(1)).readonly(),
        })
        .strict()
        .nullable(),
      quality: ApiDataQualitySchema,
    })
    .strict()
    .readonly(),
  {
    id: "bp.release_status_response.v1",
    title: "Release Status Response",
    description: "Public API response describing the active release month and data provenance.",
    stability: "draft",
  },
);

export type ReleaseStatusResponse = z.output<typeof ReleaseStatusResponseSchema>;

export const RouteCardSchema = registerProjectSchema(
  z
    .object({
      routeId: RouteIdSchema,
      shortName: z.string().min(1),
      month: IsoMonthSchema,
      rank: z.number().int().positive(),
      routeScore: z.number().min(0).max(100),
      averageSpeedMph: z.number().nonnegative(),
      hotspotCount: z.number().int().nonnegative(),
      totalRidership: z.number().nonnegative(),
      aceActive: z.boolean(),
      busLaneMatchedLaneCount: z.number().int().nonnegative(),
      observedBunchingShare: z.number().min(0).max(1).nullable(),
      observedLongGapShare: z.number().min(0).max(1).nullable(),
      reliabilityStatus: z.enum(["observed", "insufficient_gtfs_rt_samples"]).nullable(),
      sampleCount: z.number().int().nonnegative(),
      quality: ApiDataQualitySchema,
    })
    .strict()
    .readonly(),
  {
    id: "bp.route_card.v1",
    title: "Route Card",
    description: "Compact public route card for ranked lists, search, and hotspot panels.",
    stability: "draft",
  },
);

export type RouteCard = z.output<typeof RouteCardSchema>;

export const RouteListResponseSchema = registerProjectSchema(
  z
    .object({
      schemaVersion: z.literal(schemaVersion),
      generatedAt: z.iso.datetime(),
      baselineMonth: IsoMonthSchema,
      routes: z.array(RouteCardSchema),
      quality: ApiDataQualitySchema,
    })
    .strict()
    .readonly(),
  {
    id: "bp.route_list_response.v1",
    title: "Route List Response",
    description: "Public API response for compact route cards in the active release month.",
    stability: "draft",
  },
);

export type RouteListResponse = z.output<typeof RouteListResponseSchema>;

export const RouteArtifactRefSchema = registerProjectSchema(
  z
    .object({
      name: z.string().min(1),
      key: z.string().min(1),
      contentType: z.string().min(1),
      byteLength: z.number().int().nonnegative(),
      sha256: z.string().length(64),
    })
    .strict()
    .readonly(),
  {
    id: "bp.route_artifact_ref.v1",
    title: "Route Artifact Reference",
    description: "Reference to a generated route artifact stored outside the compact D1 payload.",
    stability: "draft",
  },
);

export type RouteArtifactRef = z.output<typeof RouteArtifactRefSchema>;

export const RouteProfileResponseSchema = registerProjectSchema(
  z
    .object({
      schemaVersion: z.literal(schemaVersion),
      generatedAt: z.iso.datetime(),
      baselineMonth: IsoMonthSchema,
      route: RouteCardSchema,
      peakRidership: z
        .object({
          dayOfWeek: z.string().min(1),
          hourOfDay: z.number().int().min(0).max(23),
          ridership: z.number().nonnegative().nullable(),
          transfers: z.number().nonnegative().nullable(),
          weightedAverageSpeedMph: z.number().nonnegative().nullable(),
        })
        .strict()
        .nullable(),
      slowestWindow: z
        .object({
          dayOfWeek: z.string().min(1),
          hourOfDay: z.number().int().min(0).max(23),
          observationCount: z.number().int().nonnegative().nullable(),
          busTripCount: z.number().int().nonnegative().nullable(),
          weightedAverageSpeedMph: z.number().nonnegative().nullable(),
          slowObservationShare: z.number().min(0).max(1).nullable(),
        })
        .strict()
        .nullable(),
      observedReliability: z
        .object({
          runId: z.string().min(1),
          reliabilityStatus: z.enum(["observed", "insufficient_gtfs_rt_samples"]),
          sampleCount: z.number().int().nonnegative(),
          medianObservedHeadwayMinutes: z.number().nonnegative().nullable(),
          p90ObservedHeadwayMinutes: z.number().nonnegative().nullable(),
          observedBunchingShare: z.number().min(0).max(1).nullable(),
          observedLongGapShare: z.number().min(0).max(1).nullable(),
          excessWaitMinutes: z.number().nullable(),
        })
        .strict()
        .nullable(),
      artifacts: z.array(RouteArtifactRefSchema),
      quality: ApiDataQualitySchema,
    })
    .strict()
    .readonly(),
  {
    id: "bp.route_profile_response.v1",
    title: "Route Profile Response",
    description: "Public API response for one route profile panel in the active release month.",
    stability: "draft",
  },
);

export type RouteProfileResponse = z.output<typeof RouteProfileResponseSchema>;

export const MapArtifactEntrySchema = registerProjectSchema(
  z
    .object({
      artifactKind: z.string().min(1),
      artifactKey: z.string().min(1),
      contentType: z.string().min(1),
      byteLength: z.number().int().nonnegative(),
      sha256: z.string().length(64),
      featureCount: z.number().int().nonnegative(),
      routeId: RouteIdSchema.nullable(),
      apiPath: z.string().min(1),
    })
    .strict()
    .readonly(),
  {
    id: "bp.map_artifact_entry.v1",
    title: "Map Artifact Entry",
    description: "Public map artifact reference with an API path for fetching the R2 object.",
    stability: "draft",
  },
);

export type MapArtifactEntry = z.output<typeof MapArtifactEntrySchema>;

export const MapManifestResponseSchema = registerProjectSchema(
  z
    .object({
      schemaVersion: z.literal(schemaVersion),
      generatedAt: z.iso.datetime(),
      baselineMonth: IsoMonthSchema,
      status: z.enum(["pass", "fail"]),
      artifactCount: z.number().int().nonnegative(),
      routeSegmentArtifactCount: z.number().int().nonnegative(),
      totalFeatureCount: z.number().int().nonnegative(),
      totalByteLength: z.number().int().nonnegative(),
      issueCount: z.number().int().nonnegative(),
      artifacts: z.array(MapArtifactEntrySchema),
      quality: ApiDataQualitySchema,
    })
    .strict()
    .readonly(),
  {
    id: "bp.map_manifest_response.v1",
    title: "Map Manifest Response",
    description: "Public API response for generated map artifact metadata.",
    stability: "draft",
  },
);

export type MapManifestResponse = z.output<typeof MapManifestResponseSchema>;

export const HotspotCardSchema = registerProjectSchema(
  z
    .object({
      corridorId: z.string().min(1),
      corridorName: z.string().min(1),
      routeId: RouteIdSchema,
      month: IsoMonthSchema,
      rank: z.number().int().positive(),
      routeHotspotRank: z.number().int().positive(),
      fromStopName: z.string().min(1),
      toStopName: z.string().min(1),
      averageSpeedMph: z.number().nonnegative(),
      hotspotScore: z.number().int().nonnegative(),
      riderImpactScore: z.number().int().nonnegative().nullable(),
      quality: ApiDataQualitySchema,
    })
    .strict()
    .readonly(),
  {
    id: "bp.hotspot_card.v1",
    title: "Hotspot Card",
    description: "Compact precomputed hotspot card for triage lists and map sheets.",
    stability: "draft",
  },
);

export type HotspotCard = z.output<typeof HotspotCardSchema>;

export const HotspotListResponseSchema = registerProjectSchema(
  z
    .object({
      schemaVersion: z.literal(schemaVersion),
      generatedAt: z.iso.datetime(),
      baselineMonth: IsoMonthSchema,
      hotspots: z.array(HotspotCardSchema),
      quality: ApiDataQualitySchema,
    })
    .strict()
    .readonly(),
  {
    id: "bp.hotspot_list_response.v1",
    title: "Hotspot List Response",
    description: "Public API response for ranked precomputed hotspot cards.",
    stability: "draft",
  },
);

export type HotspotListResponse = z.output<typeof HotspotListResponseSchema>;

export const RouteCompareResponseSchema = registerProjectSchema(
  z
    .object({
      schemaVersion: z.literal(schemaVersion),
      generatedAt: z.iso.datetime(),
      baselineMonth: IsoMonthSchema,
      routes: z.tuple([RouteCardSchema, RouteCardSchema]),
      deltas: z
        .object({
          routeScore: z.number(),
          averageSpeedMph: z.number(),
          totalRidership: z.number(),
          observedBunchingShare: z.number().nullable(),
          observedLongGapShare: z.number().nullable(),
        })
        .strict(),
      quality: ApiDataQualitySchema,
    })
    .strict()
    .readonly(),
  {
    id: "bp.route_compare_response.v1",
    title: "Route Compare Response",
    description: "Public API response for a two-route comparison panel.",
    stability: "draft",
  },
);

export type RouteCompareResponse = z.output<typeof RouteCompareResponseSchema>;

export const HealthResponseSchema = registerProjectSchema(
  z
    .object({
      ok: z.literal(true),
      service: z.literal("bus-priority-impact-studio"),
      checkedAt: z.iso.datetime(),
    })
    .strict()
    .readonly(),
  {
    id: "bp.health_response.v1",
    title: "Health Response",
    description: "Worker health-check response contract.",
    stability: "stable",
  },
);

export type HealthResponse = z.output<typeof HealthResponseSchema>;

// Detector contracts. See knowledge/wiki/analysis/finding_coverage_and_corpus_expansion.md
// for the candidate/evidence/coverage spine. These schemas are the strict
// internal contract for `findings:detect`; Studio projections derive a public
// subset from reviewed/promoted candidates in studio-schemas.ts.

const SLUG_REGEX = /^[a-z][a-z0-9_]*$/;

export const DetectorIdSchema = registerProjectSchema(
  z.string().min(2).max(64).regex(SLUG_REGEX).brand<"DetectorId">(),
  {
    id: "bp.finding.detector_id",
    title: "Detector ID",
    description: "Stable snake_case slug identifying a deterministic detector.",
    stability: "draft",
  },
);

export type DetectorId = z.output<typeof DetectorIdSchema>;

// Detectors built (or planned) in the v1 order from the wiki. Listing them as
// a const lets callers `as const` reference them without weakening the schema.
export const KNOWN_DETECTOR_IDS = [
  "source_gap",
  "persistent_speed_hotspot",
  "multi_month_speed_peer",
  "observed_reliability",
  "intervention_gap",
  "intervention_underperformance",
  "permit_correlated_slowdown",
  "service_request_context",
] as const;

export const DetectorRunIdSchema = registerProjectSchema(
  z.string().min(8).max(128).brand<"DetectorRunId">(),
  {
    id: "bp.finding.detector_run_id",
    title: "Detector Run ID",
    description: "Stable id for one execution of a detector against a release month.",
    stability: "draft",
  },
);

export type DetectorRunId = z.output<typeof DetectorRunIdSchema>;

export const FindingSeveritySchema = registerProjectSchema(
  z.enum(["info", "low", "medium", "high"]).brand<"FindingSeverity">(),
  {
    id: "bp.finding.severity",
    title: "Finding Severity",
    description: "Rider-impact severity bucket assigned by the detector.",
    stability: "draft",
  },
);

export type FindingSeverity = z.output<typeof FindingSeveritySchema>;

export const FindingConfidenceSchema = registerProjectSchema(
  z.enum(["insufficient", "low", "medium", "high"]).brand<"FindingConfidence">(),
  {
    id: "bp.finding.confidence",
    title: "Finding Confidence",
    description:
      "Source-sufficiency and join-quality confidence label. Not a rhetorical certainty.",
    stability: "draft",
  },
);

export type FindingConfidence = z.output<typeof FindingConfidenceSchema>;

export const FindingStatusSchema = registerProjectSchema(
  z.enum(["open", "promoted", "dismissed", "superseded"]).brand<"FindingStatus">(),
  {
    id: "bp.finding.status",
    title: "Finding Status",
    description: "Lifecycle status of a candidate emitted by a detector run.",
    stability: "draft",
  },
);

export type FindingStatus = z.output<typeof FindingStatusSchema>;

export const FindingReviewStateSchema = registerProjectSchema(
  z.enum(["unreviewed", "needs_review", "approved", "rejected"]).brand<"FindingReviewState">(),
  {
    id: "bp.finding.review_state",
    title: "Finding Review State",
    description: "Reviewer workflow state. Only approved candidates feed Studio projections.",
    stability: "draft",
  },
);

export type FindingReviewState = z.output<typeof FindingReviewStateSchema>;

export const FindingScopeKindSchema = registerProjectSchema(
  z.enum(["route", "segment", "corridor", "system"]).brand<"FindingScopeKind">(),
  {
    id: "bp.finding.scope_kind",
    title: "Finding Scope Kind",
    description:
      "Geometry scope a candidate is anchored to. `system` is reserved for source-gap rows that are not route- or segment-scoped.",
    stability: "draft",
  },
);

export type FindingScopeKind = z.output<typeof FindingScopeKindSchema>;

export const FindingCategorySchema = registerProjectSchema(
  z
    .enum(["reliability", "speed", "intervention", "data_quality", "context"])
    .brand<"FindingCategory">(),
  {
    id: "bp.finding.category",
    title: "Finding Category",
    description: "Top-level topic of a finding, derived from the detector matrix in the wiki.",
    stability: "draft",
  },
);

export type FindingCategory = z.output<typeof FindingCategorySchema>;

export const FindingClaimSafeLabelSchema = registerProjectSchema(
  z
    .enum([
      "no_issue_clean",
      "issue_clean",
      "issue_needs_review",
      "insufficient_evidence",
      "source_lag_expected",
    ])
    .brand<"FindingClaimSafeLabel">(),
  {
    id: "bp.finding.claim_safe_label",
    title: "Claim-Safe Label",
    description:
      "Reader-facing classification per the wiki Product Rule. Drives Studio messaging without overclaiming.",
    stability: "draft",
  },
);

export type FindingClaimSafeLabel = z.output<typeof FindingClaimSafeLabelSchema>;

export const FindingReasonCodeSchema = registerProjectSchema(
  z.string().min(2).max(64).regex(SLUG_REGEX).brand<"FindingReasonCode">(),
  {
    id: "bp.finding.reason_code",
    title: "Finding Reason Code",
    description:
      "Stable snake_case reason a candidate fired (or a coverage row was emitted). Open-vocabulary; see KNOWN_FINDING_REASON_CODES for the documented set.",
    stability: "draft",
  },
);

export type FindingReasonCode = z.output<typeof FindingReasonCodeSchema>;

// Seed list of reason codes documented in the wiki + the codes the source-gap
// detector will emit. New detectors may introduce more — the schema only
// enforces shape, not membership in this list.
export const KNOWN_FINDING_REASON_CODES = [
  // Candidate reason codes from the wiki.
  "persistent_low_speed",
  "multi_month_peer_speed_deficit",
  "high_long_gap_share",
  "intervention_gap",
  "negative_peer_adjusted_delta",
  "permit_correlated_slowdown",
  "service_request_context_slowdown",
  // Source-gap detector reason codes.
  "missing_speed",
  "missing_geometry",
  "insufficient_gtfs_rt_samples",
  "missing_scheduled_baseline",
  "missing_bus_wait_assessment",
  "missing_reliability_metric",
  "missing_pain_signal",
  "missing_evaluated_intervention",
  "bus_lane_date_gap",
  "failed_context_join",
  "source_lag",
  "insufficient_speed_observations",
  "insufficient_permit_touches",
  "insufficient_service_request_context",
  "insufficient_trend_months",
  "missing_current_trend_month",
] as const;

export const FindingDetectorScoreSchema = registerProjectSchema(z.number().min(0).max(100), {
  id: "bp.finding.detector_score",
  title: "Detector Score",
  description: "0-100 rank score for sorting candidates within a single detector.",
  stability: "draft",
});

export type FindingDetectorScore = z.output<typeof FindingDetectorScoreSchema>;

export const FindingEvidenceKindSchema = registerProjectSchema(
  z
    .enum(["metric", "context_event", "source_row", "missing_data", "source_doc", "coverage_audit"])
    .brand<"FindingEvidenceKind">(),
  {
    id: "bp.finding.evidence_kind",
    title: "Finding Evidence Kind",
    description: "What kind of evidence row a candidate is anchored to.",
    stability: "draft",
  },
);

export type FindingEvidenceKind = z.output<typeof FindingEvidenceKindSchema>;

export const FindingEvidenceRoleSchema = registerProjectSchema(
  z
    .enum(["primary", "context", "counter_evidence", "caveat", "missing_data", "coverage_audit"])
    .brand<"FindingEvidenceRole">(),
  {
    id: "bp.finding.evidence_role",
    title: "Finding Evidence Role",
    description:
      "Role evidence plays in the candidate (primary signal, context, counter-evidence, caveat, or audit support).",
    stability: "draft",
  },
);

export type FindingEvidenceRole = z.output<typeof FindingEvidenceRoleSchema>;

export const FindingCoverageOutcomeSchema = registerProjectSchema(
  z
    .enum(["hit", "clean_no_hit", "skipped_missing_input", "skipped_failed_join", "source_lag"])
    .brand<"FindingCoverageOutcome">(),
  {
    id: "bp.finding.coverage_outcome",
    title: "Finding Coverage Outcome",
    description:
      "Per-scope outcome of a detector pass. Required for every considered scope so silent gaps cannot hide.",
    stability: "draft",
  },
);

export type FindingCoverageOutcome = z.output<typeof FindingCoverageOutcomeSchema>;

export const FindingCandidateSchema = registerProjectSchema(
  z
    .object({
      candidateId: z.string().min(1),
      detectorId: DetectorIdSchema,
      detectorRunId: DetectorRunIdSchema,
      month: IsoMonthSchema,
      scopeKind: FindingScopeKindSchema,
      scopeId: z.string().min(1),
      routeId: RouteIdSchema.nullable(),
      physicalId: z.string().min(1).nullable(),
      category: FindingCategorySchema,
      severity: FindingSeveritySchema,
      confidence: FindingConfidenceSchema,
      detectorScore: FindingDetectorScoreSchema,
      reasonCode: FindingReasonCodeSchema,
      claimSafeLabel: FindingClaimSafeLabelSchema,
      claimText: z.string().min(1).max(500),
      status: FindingStatusSchema,
      reviewState: FindingReviewStateSchema,
      windowStart: z.iso.datetime().nullable(),
      windowEnd: z.iso.datetime().nullable(),
      createdAt: z.iso.datetime(),
    })
    .strict(),
  {
    id: "bp.finding.candidate.v1",
    title: "Finding Candidate",
    description:
      "Internal detector output. Studio projections consume only reviewed/promoted rows.",
    stability: "draft",
  },
);

export type FindingCandidate = z.output<typeof FindingCandidateSchema>;

export const FindingEvidenceLinkSchema = registerProjectSchema(
  z
    .object({
      linkId: z.string().min(1),
      candidateId: z.string().min(1),
      evidenceKind: FindingEvidenceKindSchema,
      evidenceRole: FindingEvidenceRoleSchema,
      evidenceRef: z.string().min(1),
      evidenceWeight: z.number().min(0).max(1).nullable(),
      note: z.string().max(500).nullable(),
    })
    .strict(),
  {
    id: "bp.finding.evidence_link.v1",
    title: "Finding Evidence Link",
    description: "Candidate-to-evidence link with role and weight.",
    stability: "draft",
  },
);

export type FindingEvidenceLink = z.output<typeof FindingEvidenceLinkSchema>;

export const FindingCoverageAuditSchema = registerProjectSchema(
  z
    .object({
      auditId: z.string().min(1),
      detectorRunId: DetectorRunIdSchema,
      detectorId: DetectorIdSchema,
      month: IsoMonthSchema,
      scopeKind: FindingScopeKindSchema,
      scopeId: z.string().min(1),
      outcome: FindingCoverageOutcomeSchema,
      reasonCode: FindingReasonCodeSchema.nullable(),
      reason: z.string().max(500).nullable(),
      inputsSeenJson: z.string().nullable(),
      inputsExpectedJson: z.string().nullable(),
      createdAt: z.iso.datetime(),
    })
    .strict(),
  {
    id: "bp.finding.coverage_audit.v1",
    title: "Finding Coverage Audit",
    description:
      "Per-scope, per-detector-run accounting row. Required for every considered scope, regardless of hit or miss.",
    stability: "draft",
  },
);

export type FindingCoverageAudit = z.output<typeof FindingCoverageAuditSchema>;

export const FindingDetectorSpecTemplateSchema = registerProjectSchema(
  z
    .object({
      requiredFields: z.array(z.string().min(1)),
      template: z.record(z.string().min(1), z.string().min(1)),
    })
    .strict(),
  {
    id: "bp.finding.detector_spec_template.v1",
    title: "Finding Detector Spec Template",
    description:
      "Human-readable template each deterministic detector spec must fill before promotion.",
    stability: "draft",
  },
);

export type FindingDetectorSpecTemplate = z.output<typeof FindingDetectorSpecTemplateSchema>;

export const FindingDetectorSpecSchema = registerProjectSchema(
  z
    .object({
      detectorId: DetectorIdSchema,
      name: z.string().min(1).max(120),
      question: z.string().min(1).max(500),
      claimTemplate: z.string().min(1).max(500),
      allowedClaimStrength: z.number().int().min(0).max(5),
      primaryEvidenceRequired: z.array(z.string().min(1).max(300)),
      supportingEvidenceExpected: z.array(z.string().min(1).max(300)),
      counterEvidenceRequired: z.array(z.string().min(1).max(300)),
      promotionChecklist: z.array(z.string().min(1).max(300)),
      knownFailureModes: z.array(z.string().min(1).max(300)),
    })
    .strict(),
  {
    id: "bp.finding.detector_spec.v1",
    title: "Finding Detector Spec",
    description:
      "Detector-specific review contract: question, allowed claim strength, required evidence, counter-evidence, and promotion checklist.",
    stability: "draft",
  },
);

export type FindingDetectorSpec = z.output<typeof FindingDetectorSpecSchema>;

export const FindingDetectorSpecsArtifactSchema = registerProjectSchema(
  z
    .object({
      artifactKind: z.literal("finding_detector_specs"),
      schemaVersion: z.literal(schemaVersion),
      generatedAt: z.iso.datetime(),
      template: FindingDetectorSpecTemplateSchema,
      detectorCount: z.number().int().nonnegative(),
      detectors: z.array(FindingDetectorSpecSchema),
    })
    .strict(),
  {
    id: "bp.finding.detector_specs_artifact.v1",
    title: "Finding Detector Specs Artifact",
    description:
      "Generated artifact that freezes the detector spec template and current detector specs used for review packets.",
    stability: "draft",
  },
);

export type FindingDetectorSpecsArtifact = z.output<typeof FindingDetectorSpecsArtifactSchema>;

export const FindingReviewPriorityBandSchema = registerProjectSchema(
  z.enum(["critical", "high", "medium", "low"]),
  {
    id: "bp.finding.review_priority_band",
    title: "Finding Review Priority Band",
    description: "Priority bucket used to order detector review packets.",
    stability: "draft",
  },
);

export type FindingReviewPriorityBand = z.output<typeof FindingReviewPriorityBandSchema>;

export const FindingReviewPacketSchema = registerProjectSchema(
  z
    .object({
      packetId: z.string().min(1),
      reviewRank: z.number().int().positive(),
      candidate: FindingCandidateSchema,
      detectorSpec: FindingDetectorSpecSchema,
      priority: z
        .object({
          score: z.number().nonnegative(),
          band: FindingReviewPriorityBandSchema,
          signals: z.array(z.string().min(1)),
        })
        .strict(),
      evidence: z
        .object({
          primary: z.array(FindingEvidenceLinkSchema),
          context: z.array(FindingEvidenceLinkSchema),
          counterEvidence: z.array(FindingEvidenceLinkSchema),
          caveats: z.array(FindingEvidenceLinkSchema),
          missingData: z.array(FindingEvidenceLinkSchema),
          coverageAudit: z.array(FindingEvidenceLinkSchema),
        })
        .strict(),
      evidenceObjects: z
        .object({
          primary: z.array(z.unknown()),
          context: z.array(z.unknown()),
          counterEvidence: z.array(z.unknown()),
          caveats: z.array(z.unknown()),
          missingData: z.array(z.unknown()),
          coverageAudit: z.array(z.unknown()),
        })
        .strict(),
      coverage: z.array(FindingCoverageAuditSchema),
      derivedMetricWarnings: z.array(z.string().min(1).max(500)),
      promotionBlockers: z.array(z.string().min(1).max(500)),
      reviewChecklist: z.array(z.string().min(1).max(500)),
      allowedClaimStrength: z.number().int().min(0).max(5),
      packetCompleteness: z
        .object({
          hasPrimaryEvidence: z.boolean(),
          hasCounterEvidence: z.boolean(),
          hasCoverageAudit: z.boolean(),
          hasDetectorSpec: z.boolean(),
          hasReviewChecklist: z.boolean(),
        })
        .strict(),
    })
    .strict(),
  {
    id: "bp.finding.review_packet.v1",
    title: "Finding Review Packet",
    description:
      "Promotion-review packet with grouped evidence, parsed evidence objects, counter-evidence, coverage rows, and detector checklist.",
    stability: "draft",
  },
);

export type FindingReviewPacket = z.output<typeof FindingReviewPacketSchema>;

export const FindingReviewPacketsArtifactSchema = registerProjectSchema(
  z
    .object({
      artifactKind: z.literal("finding_review_packets"),
      schemaVersion: z.literal(schemaVersion),
      month: IsoMonthSchema,
      generatedAt: z.iso.datetime(),
      detectorSpecsArtifactPath: z.string().min(1),
      packetCount: z.number().int().nonnegative(),
      summary: z
        .object({
          packetCount: z.number().int().nonnegative(),
          candidatesWithoutCounterEvidence: z.number().int().nonnegative(),
          candidatesWithoutCoverage: z.number().int().nonnegative(),
          detectorCounts: z.record(DetectorIdSchema, z.number().int().nonnegative()),
        })
        .strict(),
      packets: z.array(FindingReviewPacketSchema),
    })
    .strict(),
  {
    id: "bp.finding.review_packets_artifact.v1",
    title: "Finding Review Packets Artifact",
    description: "Manifest of all packetized detector candidates for human/agent promotion review.",
    stability: "draft",
  },
);

export type FindingReviewPacketsArtifact = z.output<typeof FindingReviewPacketsArtifactSchema>;

export const FindingPromotionReadinessSchema = registerProjectSchema(
  z.enum(["ready_for_review", "needs_enrichment", "blocked"]).brand<"FindingPromotionReadiness">(),
  {
    id: "bp.finding.promotion_readiness",
    title: "Finding Promotion Readiness",
    description:
      "Deterministic readiness bucket for moving a detector candidate into human promotion review.",
    stability: "draft",
  },
);

export type FindingPromotionReadiness = z.output<typeof FindingPromotionReadinessSchema>;

export const FindingPromotionDecisionSchema = registerProjectSchema(
  z
    .enum(["approve", "approve_with_revisions", "defer", "reject", "downgrade_to_context"])
    .brand<"FindingPromotionDecision">(),
  {
    id: "bp.finding.promotion_decision",
    title: "Finding Promotion Decision",
    description:
      "Human reviewer decision vocabulary for turning a detector candidate into a promoted finding or deferring it.",
    stability: "draft",
  },
);

export type FindingPromotionDecision = z.output<typeof FindingPromotionDecisionSchema>;

export const FindingPromotionNextActionSchema = registerProjectSchema(
  z
    .enum([
      "review_for_promotion",
      "revise_claim_before_promotion",
      "keep_as_data_quality",
      "enrich_before_promotion",
      "do_not_promote",
    ])
    .brand<"FindingPromotionNextAction">(),
  {
    id: "bp.finding.promotion_next_action",
    title: "Finding Promotion Next Action",
    description:
      "Pipeline-suggested next review action. This is not an approval decision by itself.",
    stability: "draft",
  },
);

export type FindingPromotionNextAction = z.output<typeof FindingPromotionNextActionSchema>;

export const FindingPromotionQueueItemSchema = registerProjectSchema(
  z
    .object({
      packetId: z.string().min(1),
      reviewRank: z.number().int().positive(),
      candidate: FindingCandidateSchema,
      readiness: FindingPromotionReadinessSchema,
      recommendedNextAction: FindingPromotionNextActionSchema,
      promotionPriority: z.number().int().nonnegative(),
      promotionPriorityBand: FindingReviewPriorityBandSchema,
      allowedClaimStrength: z.number().int().min(0).max(5),
      maxPromotableClaimStrength: z.number().int().min(0).max(5),
      promotionBlockers: z.array(z.string().min(1).max(500)),
      requiredReviewerActions: z.array(z.string().min(1).max(500)),
      evidenceSummary: z
        .object({
          primaryCount: z.number().int().nonnegative(),
          contextCount: z.number().int().nonnegative(),
          counterEvidenceCount: z.number().int().nonnegative(),
          caveatCount: z.number().int().nonnegative(),
          missingDataCount: z.number().int().nonnegative(),
          coverageAuditCount: z.number().int().nonnegative(),
        })
        .strict(),
      reviewChecklist: z.array(z.string().min(1).max(500)),
    })
    .strict(),
  {
    id: "bp.finding.promotion_queue_item.v1",
    title: "Finding Promotion Queue Item",
    description:
      "One detector candidate summarized for human promotion review, with blockers and decision inputs.",
    stability: "draft",
  },
);

export type FindingPromotionQueueItem = z.output<typeof FindingPromotionQueueItemSchema>;

export const FindingPromotionQueueArtifactSchema = registerProjectSchema(
  z
    .object({
      artifactKind: z.literal("finding_promotion_queue"),
      schemaVersion: z.literal(schemaVersion),
      month: IsoMonthSchema,
      generatedAt: z.iso.datetime(),
      reviewPacketsArtifactPath: z.string().min(1),
      candidateCount: z.number().int().nonnegative(),
      summary: z
        .object({
          candidateCount: z.number().int().nonnegative(),
          readinessCounts: z.record(
            FindingPromotionReadinessSchema,
            z.number().int().nonnegative(),
          ),
          recommendedNextActionCounts: z.record(
            FindingPromotionNextActionSchema,
            z.number().int().nonnegative(),
          ),
          detectorCounts: z.record(DetectorIdSchema, z.number().int().nonnegative()),
          readyForReviewCount: z.number().int().nonnegative(),
          blockedCount: z.number().int().nonnegative(),
        })
        .strict(),
      reviewerDecisionOptions: z.array(
        z
          .object({
            decision: FindingPromotionDecisionSchema,
            meaning: z.string().min(1).max(500),
          })
          .strict(),
      ),
      outputSchema: z
        .object({
          candidateId: z.literal("string"),
          decision: z.literal(
            "approve | approve_with_revisions | defer | reject | downgrade_to_context",
          ),
          revisedClaimText: z.literal("string | null"),
          rationale: z.literal("string"),
          evidenceRefsApproved: z.literal("string[]"),
          reviewer: z.literal("string"),
          reviewedAt: z.literal("ISO datetime"),
        })
        .strict(),
      candidates: z.array(FindingPromotionQueueItemSchema),
    })
    .strict(),
  {
    id: "bp.finding.promotion_queue_artifact.v1",
    title: "Finding Promotion Queue Artifact",
    description:
      "Reviewer-facing promotion queue derived from review packets. It exposes readiness, blockers, and an explicit decision contract.",
    stability: "draft",
  },
);

export type FindingPromotionQueueArtifact = z.output<typeof FindingPromotionQueueArtifactSchema>;

export const FindingReviewerDecisionInputSchema = registerProjectSchema(
  z
    .object({
      candidateId: z.string().min(1),
      decision: FindingPromotionDecisionSchema,
      revisedClaimText: z.string().min(1).max(500).nullable(),
      rationale: z.string().min(1).max(1000),
      evidenceRefsApproved: z.array(z.string().min(1)).default([]),
      reviewer: z.string().min(1).max(120),
      reviewedAt: z.iso.datetime(),
    })
    .strict(),
  {
    id: "bp.finding.reviewer_decision_input.v1",
    title: "Finding Reviewer Decision Input",
    description:
      "Human reviewer decision captured outside the detector. Approval decisions are validated against the promotion queue before promotion.",
    stability: "draft",
  },
);

export type FindingReviewerDecisionInput = z.output<typeof FindingReviewerDecisionInputSchema>;

export const FindingReviewerDecisionRecordSchema = registerProjectSchema(
  z
    .object({
      decisionId: z.string().min(1),
      decisionHash: z.string().regex(/^[a-f0-9]{64}$/),
      packetId: z.string().min(1),
      candidateId: z.string().min(1),
      detectorId: DetectorIdSchema,
      routeId: RouteIdSchema.nullable(),
      decision: FindingPromotionDecisionSchema,
      revisedClaimText: z.string().min(1).max(500).nullable(),
      rationale: z.string().min(1).max(1000),
      evidenceRefsApproved: z.array(z.string().min(1)),
      reviewer: z.string().min(1).max(120),
      reviewedAt: z.iso.datetime(),
      promoted: z.boolean(),
    })
    .strict(),
  {
    id: "bp.finding.reviewer_decision_record.v1",
    title: "Finding Reviewer Decision Record",
    description:
      "Validated reviewer decision with a stable hash and candidate metadata for calibration and promotion audit.",
    stability: "draft",
  },
);

export type FindingReviewerDecisionRecord = z.output<typeof FindingReviewerDecisionRecordSchema>;

export const FindingReviewDecisionsArtifactSchema = registerProjectSchema(
  z
    .object({
      artifactKind: z.literal("finding_review_decisions"),
      schemaVersion: z.literal(schemaVersion),
      month: IsoMonthSchema,
      generatedAt: z.iso.datetime(),
      promotionQueueArtifactPath: z.string().min(1),
      reviewPacketsArtifactPath: z.string().min(1),
      decisionCount: z.number().int().nonnegative(),
      summary: z
        .object({
          decisionCount: z.number().int().nonnegative(),
          decisionCounts: z.record(FindingPromotionDecisionSchema, z.number().int().nonnegative()),
          promotedDecisionCount: z.number().int().nonnegative(),
          nonPromotedDecisionCount: z.number().int().nonnegative(),
        })
        .strict(),
      decisions: z.array(FindingReviewerDecisionRecordSchema),
    })
    .strict(),
  {
    id: "bp.finding.review_decisions_artifact.v1",
    title: "Finding Review Decisions Artifact",
    description:
      "Captured reviewer decisions for detector candidates. This is the audit input for promoted findings and calibration.",
    stability: "draft",
  },
);

export type FindingReviewDecisionsArtifact = z.output<typeof FindingReviewDecisionsArtifactSchema>;

export const PromotedFindingSchema = registerProjectSchema(
  z
    .object({
      promotedFindingId: z.string().min(1),
      sourceCandidateId: z.string().min(1),
      sourceDecisionId: z.string().min(1),
      sourcePacketId: z.string().min(1),
      detectorId: DetectorIdSchema,
      month: IsoMonthSchema,
      scopeKind: FindingScopeKindSchema,
      scopeId: z.string().min(1),
      routeId: RouteIdSchema.nullable(),
      category: FindingCategorySchema,
      severity: FindingSeveritySchema,
      confidence: FindingConfidenceSchema,
      reasonCode: FindingReasonCodeSchema,
      claimText: z.string().min(1).max(500),
      approvedClaimStrength: z.number().int().min(0).max(5),
      approvedEvidenceRefs: z.array(z.string().min(1)),
      reviewer: z.string().min(1).max(120),
      reviewedAt: z.iso.datetime(),
      reviewRationale: z.string().min(1).max(1000),
      sourceCandidate: FindingCandidateSchema,
      decisionHash: z.string().regex(/^[a-f0-9]{64}$/),
      candidateSnapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
      promotedFindingHash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  {
    id: "bp.finding.promoted_finding.v1",
    title: "Promoted Finding",
    description:
      "Immutable promoted-finding record produced from an approved reviewer decision and a frozen detector candidate snapshot.",
    stability: "draft",
  },
);

export type PromotedFinding = z.output<typeof PromotedFindingSchema>;

export const PromotedFindingsArtifactSchema = registerProjectSchema(
  z
    .object({
      artifactKind: z.literal("promoted_findings"),
      schemaVersion: z.literal(schemaVersion),
      month: IsoMonthSchema,
      generatedAt: z.iso.datetime(),
      promotionQueueArtifactPath: z.string().min(1),
      reviewDecisionsArtifactPath: z.string().min(1),
      promotedFindingCount: z.number().int().nonnegative(),
      summary: z
        .object({
          promotedFindingCount: z.number().int().nonnegative(),
          detectorCounts: z.record(DetectorIdSchema, z.number().int().nonnegative()),
          routeCount: z.number().int().nonnegative(),
        })
        .strict(),
      findings: z.array(PromotedFindingSchema),
    })
    .strict(),
  {
    id: "bp.finding.promoted_findings_artifact.v1",
    title: "Promoted Findings Artifact",
    description:
      "Immutable promoted-finding artifact. Each record is traceable to a reviewer decision, detector candidate, and approved evidence refs.",
    stability: "draft",
  },
);

export type PromotedFindingsArtifact = z.output<typeof PromotedFindingsArtifactSchema>;

export const FindingDetectorAuditActionSchema = registerProjectSchema(
  z.enum(["keep", "downgrade", "suppress", "split", "enrich"]),
  {
    id: "bp.finding.detector_audit_action",
    title: "Finding Detector Audit Action",
    description:
      "Agent-native detector feedback action. This audits detector behavior; it does not approve a public finding.",
    stability: "draft",
  },
);

export type FindingDetectorAuditAction = z.output<typeof FindingDetectorAuditActionSchema>;

export const FindingDetectorAuditResultSchema = registerProjectSchema(
  z
    .object({
      candidateId: z.string().min(1),
      detectorId: DetectorIdSchema,
      routeId: RouteIdSchema.nullable(),
      action: FindingDetectorAuditActionSchema,
      confidence: FindingConfidenceSchema,
      evidenceRefsUsed: z.array(z.unknown()).default([]),
      rationale: z.string().min(1).max(2000),
      missingEvidence: z.array(z.string().min(1).max(500)).default([]),
      derivedMetricIssues: z.array(z.string().min(1).max(500)).default([]),
      detectorImprovement: z.string().max(1000).nullable(),
      reviewedAt: z.iso.datetime().nullable(),
    })
    .strict(),
  {
    id: "bp.finding.detector_audit_result.v1",
    title: "Finding Detector Audit Result",
    description:
      "One agent review of why a detector emitted a candidate and what would improve future detector output.",
    stability: "draft",
  },
);

export type FindingDetectorAuditResult = z.output<typeof FindingDetectorAuditResultSchema>;

export const FindingDetectorAuditResultsArtifactSchema = registerProjectSchema(
  z
    .object({
      artifactKind: z.literal("finding_detector_audit_results"),
      schemaVersion: z.literal(schemaVersion),
      month: IsoMonthSchema,
      generatedAt: z.iso.datetime(),
      reviewer: z.string().min(1).max(100),
      reviewQueueArtifactPath: z.string().min(1).nullable(),
      results: z.array(FindingDetectorAuditResultSchema),
    })
    .strict(),
  {
    id: "bp.finding.detector_audit_results_artifact.v1",
    title: "Finding Detector Audit Results Artifact",
    description: "Structured output produced by an agent after reviewing detector candidates.",
    stability: "draft",
  },
);

export type FindingDetectorAuditResultsArtifact = z.output<
  typeof FindingDetectorAuditResultsArtifactSchema
>;

export const FindingDetectorAuditSummaryArtifactSchema = registerProjectSchema(
  z
    .object({
      artifactKind: z.literal("finding_detector_audit_summary"),
      schemaVersion: z.literal(schemaVersion),
      month: IsoMonthSchema,
      generatedAt: z.iso.datetime(),
      inputArtifactPath: z.string().min(1),
      reviewedCandidateCount: z.number().int().nonnegative(),
      actionCounts: z.record(FindingDetectorAuditActionSchema, z.number().int().nonnegative()),
      detectorActionCounts: z.record(
        DetectorIdSchema,
        z.record(FindingDetectorAuditActionSchema, z.number().int().nonnegative()),
      ),
      confidenceCounts: z.record(z.string().min(1), z.number().int().nonnegative()),
      improvementThemes: z.array(
        z
          .object({
            theme: z.string().min(1).max(120),
            count: z.number().int().positive(),
            detectorIds: z.array(DetectorIdSchema),
            exampleCandidateIds: z.array(z.string().min(1)),
          })
          .strict(),
      ),
      derivedMetricIssueCount: z.number().int().nonnegative(),
      topDetectorRecommendations: z.array(
        z
          .object({
            detectorId: DetectorIdSchema,
            actionCounts: z.record(
              FindingDetectorAuditActionSchema,
              z.number().int().nonnegative(),
            ),
            recommendation: z.string().min(1).max(1000),
          })
          .strict(),
      ),
    })
    .strict(),
  {
    id: "bp.finding.detector_audit_summary_artifact.v1",
    title: "Finding Detector Audit Summary Artifact",
    description:
      "Pipeline-generated rollup of agent detector-audit feedback for improving detector inputs, thresholds, and review packets.",
    stability: "draft",
  },
);

export type FindingDetectorAuditSummaryArtifact = z.output<
  typeof FindingDetectorAuditSummaryArtifactSchema
>;

export const SignalFeatureWindowSchema = registerProjectSchema(
  z.enum(["all_day", "am_peak", "pm_peak"]),
  {
    id: "bp.finding.signal_feature_window",
    title: "Signal Feature Window",
    description: "Time window represented by a detector signal feature.",
    stability: "draft",
  },
);

export type SignalFeatureWindow = z.output<typeof SignalFeatureWindowSchema>;

export const RouteMonthContextEventFeatureSchema = registerProjectSchema(
  z
    .object({
      sourceId: z.string().min(1),
      eventKind: z.string().min(1),
      touchedEventCount: z.number().int().nonnegative(),
      touchCount: z.number().int().nonnegative(),
      primaryTouchCount: z.number().int().nonnegative(),
      contextTouchCount: z.number().int().nonnegative(),
      highConfidenceTouchCount: z.number().int().nonnegative(),
      matchWeightSum: z.number().nonnegative(),
      averageMatchWeight: z.number().nonnegative(),
      maxRouteFanout: z.number().int().nonnegative(),
    })
    .strict(),
  {
    id: "bp.finding.route_month_context_event_feature.v1",
    title: "Route Month Context Event Feature",
    description:
      "Per-route/month context-event support for one source/event-kind pair, including fanout and match-weight uncertainty.",
    stability: "draft",
  },
);

export type RouteMonthContextEventFeature = z.output<typeof RouteMonthContextEventFeatureSchema>;

export const RouteMonthSignalFeatureSchema = registerProjectSchema(
  z
    .object({
      scope: z.literal("route"),
      scopeId: RouteIdSchema,
      routeId: RouteIdSchema,
      month: IsoMonthSchema,
      window: SignalFeatureWindowSchema,
      direction: z.string().min(1).nullable(),
      routeWeightedAverageSpeedMph: z.number().nonnegative().nullable(),
      speedObservationCount: z.number().int().nonnegative(),
      hotspotCount: z.number().int().nonnegative(),
      maxHotspotScore: z.number().min(0).max(100).nullable(),
      ridershipExposure: z.number().nonnegative().nullable(),
      permitTouchedEventCount: z.number().int().nonnegative(),
      permitTouchCount: z.number().int().nonnegative(),
      permitRouteCount: z.number().int().nonnegative(),
      permitSources: z.array(z.string().min(1)),
      contextTouchedEventCount: z.number().int().nonnegative(),
      contextTouchCount: z.number().int().nonnegative(),
      contextPrimaryTouchCount: z.number().int().nonnegative(),
      contextHighConfidenceTouchCount: z.number().int().nonnegative(),
      contextEventCounts: z.array(RouteMonthContextEventFeatureSchema),
      sampleSupport: z.number().int().nonnegative(),
      uncertainty: z
        .object({
          speedObservationCount: z.number().int().nonnegative(),
          permitTouchedEventCount: z.number().int().nonnegative(),
          contextTouchedEventCount: z.number().int().nonnegative(),
          contextHighConfidenceTouchCount: z.number().int().nonnegative(),
        })
        .strict(),
      provenance: z
        .object({
          featureComputedAt: z.iso.datetime(),
          derivationVersion: z.string().min(1),
          sourceRefs: z.array(z.string().min(1)),
        })
        .strict(),
      coverage: z
        .object({
          isComputable: z.boolean(),
          skippedReasonCode: FindingReasonCodeSchema.nullable(),
          inputsSeenJson: z.string(),
          inputsExpectedJson: z.string(),
        })
        .strict(),
    })
    .strict(),
  {
    id: "bp.finding.route_month_signal_feature.v1",
    title: "Route Month Signal Feature",
    description:
      "Route/month/window signal row with raw feature values, uncertainty support, provenance, and coverage facts.",
    stability: "draft",
  },
);

export type RouteMonthSignalFeature = z.output<typeof RouteMonthSignalFeatureSchema>;

export const FindingSignalFeaturesArtifactSchema = registerProjectSchema(
  z
    .object({
      artifactKind: z.literal("finding_signal_features"),
      schemaVersion: z.literal(schemaVersion),
      month: IsoMonthSchema,
      generatedAt: z.iso.datetime(),
      featureGrain: z
        .object({
          scope: z.array(z.literal("route")),
          window: z.array(SignalFeatureWindowSchema),
          direction: z.literal("nullable"),
        })
        .strict(),
      summary: z
        .object({
          featureCount: z.number().int().nonnegative(),
          computableFeatureCount: z.number().int().nonnegative(),
          permitTouchedFeatureCount: z.number().int().nonnegative(),
          contextTouchedFeatureCount: z.number().int().nonnegative(),
          contextSourceCount: z.number().int().nonnegative(),
          detectorCandidateCount: z.number().int().nonnegative(),
        })
        .strict(),
      features: z.array(RouteMonthSignalFeatureSchema),
      detectorPreview: z
        .object({
          candidates: z.array(FindingCandidateSchema),
          evidence: z.array(FindingEvidenceLinkSchema),
          coverage: z.array(FindingCoverageAuditSchema),
        })
        .strict(),
    })
    .strict(),
  {
    id: "bp.finding.signal_features_artifact.v1",
    title: "Finding Signal Features Artifact",
    description:
      "Pipeline artifact for detector signal features and the first context-event detector preview.",
    stability: "draft",
  },
);

export type FindingSignalFeaturesArtifact = z.output<typeof FindingSignalFeaturesArtifactSchema>;

export const AgentFindingProposalClaimStrengthSchema = registerProjectSchema(
  z.enum(["observation", "qualified_claim", "blocked"]),
  {
    id: "bp.finding.agent_proposal.claim_strength",
    title: "Agent Finding Proposal Claim Strength",
    description:
      "Strength label an agent proposal commits to. `observation` is descriptive only; `qualified_claim` is the highest an agent may assert; `blocked` signals the agent reached a non-permitted claim and the proposal is for review notice only.",
    stability: "draft",
  },
);

export type AgentFindingProposalClaimStrength = z.output<typeof AgentFindingProposalClaimStrengthSchema>;

export const AgentFindingProposalValidationStateSchema = registerProjectSchema(
  z.enum(["pending", "valid", "rejected"]),
  {
    id: "bp.finding.agent_proposal.validation_state",
    title: "Agent Finding Proposal Validation State",
    description:
      "Outcome of deterministic validation. `pending` is the model-submitted default; valid proposals enter the review queue; rejected proposals never do.",
    stability: "draft",
  },
);

export type AgentFindingProposalValidationState = z.output<
  typeof AgentFindingProposalValidationStateSchema
>;

export const AgentFindingProposalEvidenceRefSchema = registerProjectSchema(
  z
    .discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("review_packet_link"),
          packetId: z.string().min(1),
          linkId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          kind: z.literal("signal_feature"),
          routeId: RouteIdSchema,
          month: IsoMonthSchema,
          window: SignalFeatureWindowSchema,
          feature: z.string().min(1).max(120),
        })
        .strict(),
      z
        .object({
          kind: z.literal("promoted_finding"),
          promotedFindingId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          kind: z.literal("intervention_record"),
          recordId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          kind: z.literal("document_candidate"),
          candidateId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          kind: z.literal("context_appendix"),
          routeId: RouteIdSchema,
          month: IsoMonthSchema,
          section: z.string().min(1).max(120),
        })
        .strict(),
    ]),
  {
    id: "bp.finding.agent_proposal.evidence_ref.v1",
    title: "Agent Finding Proposal Evidence Reference",
    description:
      "Discriminated reference to an existing corpus artifact. Every kind must resolve in the loaded corpus; invented refs fail validation.",
    stability: "draft",
  },
);

export type AgentFindingProposalEvidenceRef = z.output<
  typeof AgentFindingProposalEvidenceRefSchema
>;

export const AgentFindingProposalMetricClaimSchema = registerProjectSchema(
  z
    .object({
      variable: z.string().min(1).max(120),
      value: z.number(),
      units: z.string().min(1).max(40).nullable(),
      evidenceRef: AgentFindingProposalEvidenceRefSchema,
    })
    .strict(),
  {
    id: "bp.finding.agent_proposal.metric_claim.v1",
    title: "Agent Finding Proposal Metric Claim",
    description:
      "Quantitative claim made inside a proposal. The cited evidenceRef must contain a value matching `value` within validator tolerance.",
    stability: "draft",
  },
);

export type AgentFindingProposalMetricClaim = z.output<
  typeof AgentFindingProposalMetricClaimSchema
>;

export const AgentFindingProposalDuplicateCheckSchema = registerProjectSchema(
  z
    .object({
      matchedPromotedFindingId: z.string().min(1).nullable(),
      reason: z.string().min(1).max(400),
    })
    .strict(),
  {
    id: "bp.finding.agent_proposal.duplicate_check.v1",
    title: "Agent Finding Proposal Duplicate Check",
    description:
      "Result of comparing the proposal against existing promoted findings on the same route. Non-null matchedPromotedFindingId blocks promotion.",
    stability: "draft",
  },
);

export type AgentFindingProposalDuplicateCheck = z.output<
  typeof AgentFindingProposalDuplicateCheckSchema
>;

export const AgentFindingProposalSchema = registerProjectSchema(
  z
    .object({
      proposalId: z.string().min(1),
      runId: z.string().min(1),
      routeId: RouteIdSchema.nullable(),
      scopeKind: FindingScopeKindSchema,
      category: FindingCategorySchema,
      severity: FindingSeveritySchema,
      confidence: FindingConfidenceSchema,
      claimText: z.string().min(1).max(500),
      claimStrength: AgentFindingProposalClaimStrengthSchema,
      evidenceRefs: z.array(AgentFindingProposalEvidenceRefSchema),
      counterEvidenceRefs: z.array(AgentFindingProposalEvidenceRefSchema),
      interventionRecordIds: z.array(z.string().min(1)),
      documentCandidateIds: z.array(z.string().min(1)),
      metricClaims: z.array(AgentFindingProposalMetricClaimSchema),
      caveats: z.array(z.string().min(1).max(280)),
      missingEvidence: z.array(z.string().min(1).max(280)),
      duplicateCheck: AgentFindingProposalDuplicateCheckSchema,
      validationState: AgentFindingProposalValidationStateSchema,
      validationErrors: z.array(z.string().min(1).max(400)),
    })
    .strict(),
  {
    id: "bp.finding.agent_proposal.v1",
    title: "Agent Finding Proposal",
    description:
      "Proposal-only artifact written by `findings:agent-propose`. Never a public finding; only enters the human review queue after deterministic validation.",
    stability: "draft",
  },
);

export type AgentFindingProposal = z.output<typeof AgentFindingProposalSchema>;

export const AgentFindingProposalModelMetaSchema = registerProjectSchema(
  z
    .object({
      provider: z.string().min(1).max(80),
      modelId: z.string().min(1).max(160),
      temperature: z.number().min(0).max(2).nullable(),
      maxOutputTokens: z.number().int().positive().nullable(),
    })
    .strict(),
  {
    id: "bp.finding.agent_proposal.model_meta.v1",
    title: "Agent Finding Proposal Model Metadata",
    description:
      "Identifies the LLM and key generation parameters used to produce a proposal artifact. Operator-supplied via --model.",
    stability: "draft",
  },
);

export type AgentFindingProposalModelMeta = z.output<
  typeof AgentFindingProposalModelMetaSchema
>;

export const AgentFindingProposalCorpusPathsSchema = registerProjectSchema(
  z
    .object({
      reviewPackets: z.string().min(1).nullable(),
      promotionQueue: z.string().min(1).nullable(),
      promotedFindings: z.string().min(1).nullable(),
      signalFeatures: z.string().min(1).nullable(),
      contextAppendix: z.string().min(1).nullable(),
      interventionPublishable: z.string().min(1).nullable(),
      interventionPublishableByRoute: z.string().min(1).nullable(),
      interventionRecords: z.string().min(1).nullable(),
      documentCandidates: z.string().min(1).nullable(),
    })
    .strict(),
  {
    id: "bp.finding.agent_proposal.corpus_paths.v1",
    title: "Agent Finding Proposal Corpus Paths",
    description:
      "Resolved absolute paths of the corpus artifacts the proposal run consumed. Nullable per-artifact so runs can document partial coverage.",
    stability: "draft",
  },
);

export type AgentFindingProposalCorpusPaths = z.output<
  typeof AgentFindingProposalCorpusPathsSchema
>;

export const AgentFindingProposalsArtifactSchema = registerProjectSchema(
  z
    .object({
      artifactKind: z.literal("agent_finding_proposals"),
      schemaVersion: z.literal(schemaVersion),
      month: IsoMonthSchema,
      runId: z.string().min(1),
      model: AgentFindingProposalModelMetaSchema,
      corpusPaths: AgentFindingProposalCorpusPathsSchema,
      generatedAt: z.iso.datetime(),
      durationMs: z.number().int().nonnegative(),
      toolCallCount: z.number().int().nonnegative(),
      proposals: z.array(AgentFindingProposalSchema),
      summary: z
        .object({
          totalProposals: z.number().int().nonnegative(),
          validCount: z.number().int().nonnegative(),
          rejectedCount: z.number().int().nonnegative(),
          byCategory: z.record(z.string(), z.number().int().nonnegative()),
          bySeverity: z.record(z.string(), z.number().int().nonnegative()),
          byScope: z.record(z.string(), z.number().int().nonnegative()),
        })
        .strict(),
    })
    .strict(),
  {
    id: "bp.finding.agent_proposals_artifact.v1",
    title: "Agent Finding Proposals Artifact",
    description:
      "Full output of one `findings:agent-propose` run. Includes provenance, tool-call count, and per-proposal records pre-validation.",
    stability: "draft",
  },
);

export type AgentFindingProposalsArtifact = z.output<
  typeof AgentFindingProposalsArtifactSchema
>;

export const AgentFindingProposalValidationCheckSchema = registerProjectSchema(
  z
    .object({
      name: z.enum([
        "evidence_refs_resolve",
        "metric_consistency",
        "prose_number_coverage",
        "route_refs",
        "intervention_support",
        "language",
        "duplicate",
        "scope_blocked_claims",
      ]),
      passed: z.boolean(),
      errors: z.array(z.string().min(1).max(400)),
    })
    .strict(),
  {
    id: "bp.finding.agent_proposal.validation_check.v1",
    title: "Agent Finding Proposal Validation Check",
    description: "Per-validator outcome for one proposal.",
    stability: "draft",
  },
);

export type AgentFindingProposalValidationCheck = z.output<
  typeof AgentFindingProposalValidationCheckSchema
>;

export const AgentFindingProposalValidationRecordSchema = registerProjectSchema(
  z
    .object({
      proposalId: z.string().min(1),
      validationState: AgentFindingProposalValidationStateSchema,
      errors: z.array(z.string().min(1).max(400)),
      checks: z.array(AgentFindingProposalValidationCheckSchema),
    })
    .strict(),
  {
    id: "bp.finding.agent_proposal.validation_record.v1",
    title: "Agent Finding Proposal Validation Record",
    description: "All validator outcomes for one proposal, plus the rolled-up state.",
    stability: "draft",
  },
);

export type AgentFindingProposalValidationRecord = z.output<
  typeof AgentFindingProposalValidationRecordSchema
>;

export const AgentFindingProposalValidationArtifactSchema = registerProjectSchema(
  z
    .object({
      artifactKind: z.literal("agent_finding_proposal_validation"),
      schemaVersion: z.literal(schemaVersion),
      proposalsArtifactPath: z.string().min(1),
      generatedAt: z.iso.datetime(),
      summary: z
        .object({
          totalProposals: z.number().int().nonnegative(),
          validCount: z.number().int().nonnegative(),
          rejectedCount: z.number().int().nonnegative(),
        })
        .strict(),
      validations: z.array(AgentFindingProposalValidationRecordSchema),
    })
    .strict(),
  {
    id: "bp.finding.agent_proposal_validation_artifact.v1",
    title: "Agent Finding Proposal Validation Artifact",
    description:
      "Deterministic validation outputs for a proposals artifact. The bridge command only promotes proposals where validationState is `valid`.",
    stability: "draft",
  },
);

export type AgentFindingProposalValidationArtifact = z.output<
  typeof AgentFindingProposalValidationArtifactSchema
>;

// ===========================================================================
// AgentBriefProposal — LLM-authored brief drafts
//
// A brief proposal wraps a complete StudioBrief draft (display-ready prose,
// structured claims/evidence/caveats) with a provenance index that maps each
// `brief.evidence[i].id` back to the corpus AgentEvidenceRefs and metricClaims
// it was derived from. Validators run against the provenance to verify that
// every quantitative figure in the display layer traces to real data.
//
// Proposals carry status="Draft" inside the embedded brief; the bridge
// command (`findings:agent-briefs-to-review`) writes valid drafts into the
// release payload's briefs array. Reviewers iterate via the existing comments
// + versions flow, then an operator promotes through
// `studio:promote-publish-candidate` as today.

export const AgentBriefProposalEvidenceProvenanceSchema = registerProjectSchema(
  z
    .object({
      evidenceId: z.string().min(1),
      citedRefs: z.array(AgentFindingProposalEvidenceRefSchema),
      metricClaims: z.array(AgentFindingProposalMetricClaimSchema),
    })
    .strict(),
  {
    id: "bp.brief.agent_proposal.evidence_provenance.v1",
    title: "Agent Brief Proposal Evidence Provenance",
    description:
      "Per-evidence-row provenance: which corpus refs and metric claims back the display text in `brief.evidence[evidenceId].detail`.",
    stability: "draft",
  },
);

export type AgentBriefProposalEvidenceProvenance = z.output<
  typeof AgentBriefProposalEvidenceProvenanceSchema
>;

export const AgentBriefProposalDuplicateCheckSchema = registerProjectSchema(
  z
    .object({
      matchedBriefId: z.string().min(1).nullable(),
      reason: z.string().min(1).max(400),
    })
    .strict(),
  {
    id: "bp.brief.agent_proposal.duplicate_check.v1",
    title: "Agent Brief Proposal Duplicate Check",
    description:
      "Result of comparing the proposal against existing briefs on the same route. Non-null matchedBriefId blocks promotion.",
    stability: "draft",
  },
);

export type AgentBriefProposalDuplicateCheck = z.output<
  typeof AgentBriefProposalDuplicateCheckSchema
>;

// The agent draft shape diverges from the strict @bp/domain StudioBriefSchema
// in two places: (a) evidence + caveats carry `id` fields the strict schema
// omits (the deterministic studio builder writes them too — see
// _release-briefs.ts), (b) we lock status="Draft" and version="draft-v1" so
// agent output can never claim publication readiness. The slice-11 bridge
// lifts a validated draft into a full StudioBrief (adds id, generated,
// authors, evidenceRefCount, source-provenance fields) before writing it
// into the release payload.

const AgentBriefDraftKpiSchema = z
  .object({
    label: z.string().min(1).max(80),
    value: z.string().min(1).max(40),
    unit: z.string().max(20).optional(),
    sub: z.string().max(80),
    tone: z.enum(["neutral", "good", "warn", "bad"]),
  })
  .strict();

const AgentBriefDraftSectionCalloutSchema = z
  .object({
    variant: z.enum(["warn", "bad", "info"]),
    title: z.string().min(1).max(120),
    body: z.string().min(1).max(400),
  })
  .strict();

const AgentBriefDraftSectionFigureSchema = z
  .object({
    kind: z.enum(["map", "chart"]),
    label: z.string().min(1).max(160),
  })
  .strict();

const AgentBriefDraftSectionSchema = z
  .object({
    title: z.string().min(1).max(120),
    sub: z.string().max(160).optional(),
    body: z.array(z.string().min(1).max(800)),
    callout: AgentBriefDraftSectionCalloutSchema.optional(),
    figure: AgentBriefDraftSectionFigureSchema.optional(),
  })
  .strict();

const AgentBriefDraftClaimSchema = z
  .object({
    n: z.number().int().positive(),
    title: z.string().min(1).max(280),
    body: z.string().max(800).optional(),
    strength: z.number().int().min(0).max(100),
    evidenceIds: z.array(z.string().min(1)),
    caveatIds: z.array(z.string().min(1)),
    state: z.enum(["editing", "weak", "active"]).optional(),
  })
  .strict();

const AgentBriefDraftEvidenceSchema = z
  .object({
    id: z.string().min(1).max(80),
    kind: z.enum(["number", "chart", "source", "caveat"]),
    title: z.string().min(1).max(160),
    detail: z.string().min(1).max(800),
  })
  .strict();

const AgentBriefDraftCaveatSchema = z
  .object({
    id: z.string().min(1).max(80),
    title: z.string().min(1).max(120),
    body: z.string().min(1).max(400),
  })
  .strict();

export const AgentBriefDraftSchema = registerProjectSchema(
  z
    .object({
      routeSlug: z.string().min(1).max(80),
      title: z.string().min(1).max(200),
      status: z.literal("Draft"),
      version: z.literal("draft-v1"),
      summary: z.string().min(1).max(800),
      dek: z.string().min(1).max(400),
      kpis: z.array(AgentBriefDraftKpiSchema),
      sections: z.array(AgentBriefDraftSectionSchema),
      claims: z.array(AgentBriefDraftClaimSchema),
      evidence: z.array(AgentBriefDraftEvidenceSchema),
      caveats: z.array(AgentBriefDraftCaveatSchema),
    })
    .strict(),
  {
    id: "bp.brief.agent_draft.v1",
    title: "Agent Brief Draft",
    description:
      "Agent-authored brief draft. Status and version are pinned; evidence/caveat ids exist so claims.evidenceIds/caveatIds can reference them. The bridge command lifts this into a publishable StudioBrief.",
    stability: "draft",
  },
);

export type AgentBriefDraft = z.output<typeof AgentBriefDraftSchema>;

export const AgentBriefProposalSchema = registerProjectSchema(
  z
    .object({
      proposalId: z.string().min(1),
      runId: z.string().min(1),
      brief: AgentBriefDraftSchema,
      evidenceProvenance: z.array(AgentBriefProposalEvidenceProvenanceSchema),
      selectedFindingIds: z.array(z.string().min(1)),
      selectedInterventionRecordIds: z.array(z.string().min(1)),
      curationRationale: z.string().min(1).max(1000),
      caveats: z.array(z.string().min(1).max(280)),
      missingEvidence: z.array(z.string().min(1).max(280)),
      duplicateCheck: AgentBriefProposalDuplicateCheckSchema,
      validationState: AgentFindingProposalValidationStateSchema,
      validationErrors: z.array(z.string().min(1).max(400)),
    })
    .strict(),
  {
    id: "bp.brief.agent_proposal.v1",
    title: "Agent Brief Proposal",
    description:
      "Proposal-only artifact written by `findings:agent-brief-propose`. The embedded brief carries status=Draft; only reviewer approval + operator promotion produces a published brief.",
    stability: "draft",
  },
);

export type AgentBriefProposal = z.output<typeof AgentBriefProposalSchema>;

export const AgentBriefProposalCorpusPathsSchema = registerProjectSchema(
  z
    .object({
      reviewPackets: z.string().min(1).nullable(),
      promotionQueue: z.string().min(1).nullable(),
      promotedFindings: z.string().min(1).nullable(),
      signalFeatures: z.string().min(1).nullable(),
      contextAppendix: z.string().min(1).nullable(),
      interventionPublishable: z.string().min(1).nullable(),
      interventionPublishableByRoute: z.string().min(1).nullable(),
      interventionRecords: z.string().min(1).nullable(),
      documentCandidates: z.string().min(1).nullable(),
      briefs: z.string().min(1).nullable(),
    })
    .strict(),
  {
    id: "bp.brief.agent_proposal.corpus_paths.v1",
    title: "Agent Brief Proposal Corpus Paths",
    description:
      "Resolved absolute paths of the corpus artifacts the brief-proposal run consumed. Adds the briefs artifact path for dedupe vs existing briefs.",
    stability: "draft",
  },
);

export type AgentBriefProposalCorpusPaths = z.output<
  typeof AgentBriefProposalCorpusPathsSchema
>;

export const AgentBriefProposalsArtifactSchema = registerProjectSchema(
  z
    .object({
      artifactKind: z.literal("agent_brief_proposals"),
      schemaVersion: z.literal(schemaVersion),
      month: IsoMonthSchema,
      runId: z.string().min(1),
      model: AgentFindingProposalModelMetaSchema,
      corpusPaths: AgentBriefProposalCorpusPathsSchema,
      generatedAt: z.iso.datetime(),
      durationMs: z.number().int().nonnegative(),
      toolCallCount: z.number().int().nonnegative(),
      proposals: z.array(AgentBriefProposalSchema),
      summary: z
        .object({
          totalProposals: z.number().int().nonnegative(),
          validCount: z.number().int().nonnegative(),
          rejectedCount: z.number().int().nonnegative(),
          byRoute: z.record(z.string(), z.number().int().nonnegative()),
        })
        .strict(),
    })
    .strict(),
  {
    id: "bp.brief.agent_proposals_artifact.v1",
    title: "Agent Brief Proposals Artifact",
    description:
      "Full output of one `findings:agent-brief-propose` run. Includes provenance, tool-call count, and per-proposal records pre-validation.",
    stability: "draft",
  },
);

export type AgentBriefProposalsArtifact = z.output<
  typeof AgentBriefProposalsArtifactSchema
>;

export const AgentBriefProposalValidationCheckSchema = registerProjectSchema(
  z
    .object({
      name: z.enum([
        "brief_reference_integrity",
        "evidence_provenance_resolves",
        "prose_number_coverage",
        "metric_consistency",
        "language",
        "scope_blocked_claims",
        "duplicate",
        "section_coverage",
        "kpi_grounding",
      ]),
      passed: z.boolean(),
      errors: z.array(z.string().min(1).max(400)),
    })
    .strict(),
  {
    id: "bp.brief.agent_proposal.validation_check.v1",
    title: "Agent Brief Proposal Validation Check",
    description: "Per-validator outcome for one brief proposal.",
    stability: "draft",
  },
);

export type AgentBriefProposalValidationCheck = z.output<
  typeof AgentBriefProposalValidationCheckSchema
>;

export const AgentBriefProposalValidationRecordSchema = registerProjectSchema(
  z
    .object({
      proposalId: z.string().min(1),
      validationState: AgentFindingProposalValidationStateSchema,
      errors: z.array(z.string().min(1).max(400)),
      checks: z.array(AgentBriefProposalValidationCheckSchema),
    })
    .strict(),
  {
    id: "bp.brief.agent_proposal.validation_record.v1",
    title: "Agent Brief Proposal Validation Record",
    description: "All validator outcomes for one brief proposal plus the rolled-up state.",
    stability: "draft",
  },
);

export type AgentBriefProposalValidationRecord = z.output<
  typeof AgentBriefProposalValidationRecordSchema
>;

export const AgentBriefProposalValidationArtifactSchema = registerProjectSchema(
  z
    .object({
      artifactKind: z.literal("agent_brief_proposal_validation"),
      schemaVersion: z.literal(schemaVersion),
      proposalsArtifactPath: z.string().min(1),
      generatedAt: z.iso.datetime(),
      summary: z
        .object({
          totalProposals: z.number().int().nonnegative(),
          validCount: z.number().int().nonnegative(),
          rejectedCount: z.number().int().nonnegative(),
        })
        .strict(),
      validations: z.array(AgentBriefProposalValidationRecordSchema),
    })
    .strict(),
  {
    id: "bp.brief.agent_proposal_validation_artifact.v1",
    title: "Agent Brief Proposal Validation Artifact",
    description:
      "Deterministic validation outputs for a brief-proposals artifact. The bridge command only promotes proposals where validationState is `valid`.",
    stability: "draft",
  },
);

export type AgentBriefProposalValidationArtifact = z.output<
  typeof AgentBriefProposalValidationArtifactSchema
>;

export const routeScorecardJsonSchema = toProjectJsonSchema(RouteScorecardSchema);
export const healthResponseJsonSchema = toProjectJsonSchema(HealthResponseSchema);
export const releaseStatusResponseJsonSchema = toProjectJsonSchema(ReleaseStatusResponseSchema);
export const routeListResponseJsonSchema = toProjectJsonSchema(RouteListResponseSchema);
export const routeProfileResponseJsonSchema = toProjectJsonSchema(RouteProfileResponseSchema);
export const mapManifestResponseJsonSchema = toProjectJsonSchema(MapManifestResponseSchema);
export const hotspotListResponseJsonSchema = toProjectJsonSchema(HotspotListResponseSchema);
export const routeCompareResponseJsonSchema = toProjectJsonSchema(RouteCompareResponseSchema);
