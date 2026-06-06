import * as z from "zod";
import {
  DirectionIdSchema,
  IsoMonthSchema,
  LongitudeLatitudeCoordinateSchema,
  RouteIdSchema,
} from "../primitives/index.js";
import { ApiDataQualitySchema } from "../routes/index.js";
import { registerProjectSchema } from "../schema-registry.js";

export type { LongitudeLatitudeCoordinate, MapLayerMetric } from "../primitives/index.js";
export { LongitudeLatitudeCoordinateSchema, MapLayerMetricSchema } from "../primitives/index.js";

const schemaVersion = 1;

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
