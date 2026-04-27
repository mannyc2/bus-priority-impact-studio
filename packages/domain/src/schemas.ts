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
