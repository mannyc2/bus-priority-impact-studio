import { Effect, Schema } from "effect";
import {
  DirectionIdSchema,
  IsoMonthSchema,
  LongitudeLatitudeCoordinateSchema,
  RouteIdSchema,
} from "../primitives/index.js";
import { ApiDataQualitySchema } from "../routes/index.js";
import { registerProjectSchema } from "../schema-registry.js";

export type {
  LongitudeLatitudeCoordinate,
  MapLayerMetric,
} from "../primitives/index.js";
export {
  LongitudeLatitudeCoordinateSchema,
  MapLayerMetricSchema,
} from "../primitives/index.js";

const schemaVersion = 1;

export const MapRouteSegmentPropertiesSchema = registerProjectSchema(
  Schema.Struct({
    segmentId: Schema.String.check(Schema.isMinLength(1)),
    sourceSegmentId: Schema.String.check(Schema.isMinLength(1)),
    studioSegmentId: Schema.String.check(Schema.isMinLength(1)),
    spineSegmentId: Schema.NullOr(Schema.String.check(Schema.isMinLength(1))).pipe(
      Schema.withDecodingDefaultType(Effect.succeed(null)),
    ),
    spineJoinStatus: Schema.Literals(["matched", "unmatched", "ambiguous", "not_built"]).pipe(
      Schema.withDecodingDefaultType(Effect.succeed("not_built")),
    ),
    routeId: RouteIdSchema,
    directionId: DirectionIdSchema,
    month: IsoMonthSchema,
    hourOfDay: Schema.NullOr(
      Schema.Number.check(Schema.isInt())
        .check(Schema.isGreaterThanOrEqualTo(0))
        .check(Schema.isLessThanOrEqualTo(23)),
    ),
    averageSpeedMph: Schema.NullOr(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))),
    hotspotScore: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).check(
      Schema.isLessThanOrEqualTo(100),
    ),
    rankOnRoute: Schema.NullOr(
      Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    ),
    startStopName: Schema.NullOr(Schema.String.check(Schema.isMinLength(1))),
    endStopName: Schema.NullOr(Schema.String.check(Schema.isMinLength(1))),
  }),
  {
    id: "bp.map_route_segment_properties.v2",
    title: "Map Route Segment Properties",
    description: "Public properties attached to a derived timepoint-to-timepoint bus segment.",
    stability: "draft",
  },
);

export type MapRouteSegmentProperties = typeof MapRouteSegmentPropertiesSchema.Type;

export const MapLineStringGeometrySchema = registerProjectSchema(
  Schema.Struct({
    type: Schema.Literal("LineString"),
    coordinates: Schema.Array(LongitudeLatitudeCoordinateSchema).check(Schema.isMinLength(2)),
  }),
  {
    id: "bp.map_linestring_geometry.v1",
    title: "Map LineString Geometry",
    description: "GeoJSON LineString geometry used by precomputed route-segment artifacts.",
    stability: "draft",
  },
);

export type MapLineStringGeometry = typeof MapLineStringGeometrySchema.Type;

export const MapRouteSegmentFeatureSchema = registerProjectSchema(
  Schema.Struct({
    type: Schema.Literal("Feature"),
    id: Schema.String.check(Schema.isMinLength(1)),
    geometry: MapLineStringGeometrySchema,
    properties: MapRouteSegmentPropertiesSchema,
  }),
  {
    id: "bp.map_route_segment_feature.v2",
    title: "Map Route Segment Feature",
    description: "GeoJSON feature for one precomputed route segment served to the public map.",
    stability: "draft",
  },
);

export type MapRouteSegmentFeature = typeof MapRouteSegmentFeatureSchema.Type;

export const MapRouteSegmentFeatureCollectionSchema = registerProjectSchema(
  Schema.Struct({
    type: Schema.Literal("FeatureCollection"),
    features: Schema.Array(MapRouteSegmentFeatureSchema),
  }),
  {
    id: "bp.map_route_segment_feature_collection.v2",
    title: "Map Route Segment Feature Collection",
    description: "GeoJSON FeatureCollection for precomputed route segment map artifacts.",
    stability: "draft",
  },
);

export type MapRouteSegmentFeatureCollection = typeof MapRouteSegmentFeatureCollectionSchema.Type;

export const MapArtifactEntrySchema = registerProjectSchema(
  Schema.Struct({
    artifactKind: Schema.String.check(Schema.isMinLength(1)),
    artifactKey: Schema.String.check(Schema.isMinLength(1)),
    contentType: Schema.String.check(Schema.isMinLength(1)),
    byteLength: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    sha256: Schema.String.check(Schema.isLengthBetween(64, 64)),
    featureCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    routeId: Schema.NullOr(RouteIdSchema),
    apiPath: Schema.String.check(Schema.isMinLength(1)),
  }),
  {
    id: "bp.map_artifact_entry.v1",
    title: "Map Artifact Entry",
    description: "Public map artifact reference with an API path for fetching the R2 object.",
    stability: "draft",
  },
);

export type MapArtifactEntry = typeof MapArtifactEntrySchema.Type;

export const MapManifestResponseSchema = registerProjectSchema(
  Schema.Struct({
    schemaVersion: Schema.Literal(schemaVersion),
    generatedAt: Schema.String.check(
      Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/),
    ),
    baselineMonth: IsoMonthSchema,
    status: Schema.Literals(["pass", "fail"]),
    artifactCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    routeSegmentArtifactCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    totalFeatureCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    totalByteLength: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    issueCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    artifacts: Schema.Array(MapArtifactEntrySchema),
    quality: ApiDataQualitySchema,
  }),
  {
    id: "bp.map_manifest_response.v1",
    title: "Map Manifest Response",
    description: "Public API response for generated map artifact metadata.",
    stability: "draft",
  },
);

export type MapManifestResponse = typeof MapManifestResponseSchema.Type;
