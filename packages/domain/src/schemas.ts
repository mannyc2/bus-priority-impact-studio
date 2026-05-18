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

export const routeScorecardJsonSchema = toProjectJsonSchema(RouteScorecardSchema);
export const healthResponseJsonSchema = toProjectJsonSchema(HealthResponseSchema);
export const releaseStatusResponseJsonSchema = toProjectJsonSchema(ReleaseStatusResponseSchema);
export const routeListResponseJsonSchema = toProjectJsonSchema(RouteListResponseSchema);
export const routeProfileResponseJsonSchema = toProjectJsonSchema(RouteProfileResponseSchema);
export const mapManifestResponseJsonSchema = toProjectJsonSchema(MapManifestResponseSchema);
export const hotspotListResponseJsonSchema = toProjectJsonSchema(HotspotListResponseSchema);
export const routeCompareResponseJsonSchema = toProjectJsonSchema(RouteCompareResponseSchema);
