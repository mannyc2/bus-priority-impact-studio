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

const NonEmptyStringSchema = Schema.String.check(Schema.isMinLength(1));
const Sha256Schema = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/));
const NonNegativeIntSchema = Schema.Number.check(Schema.isInt()).check(
  Schema.isGreaterThanOrEqualTo(0),
);

export const MapBoroughSchema = Schema.Literals([
  "Bronx",
  "Brooklyn",
  "Manhattan",
  "Queens",
  "Staten Island",
]);
export type MapBorough = typeof MapBoroughSchema.Type;

const HourlySpeedSchema = Schema.Array(
  Schema.NullOr(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))),
).check(Schema.isLengthBetween(24, 24));
const HourlyTraversalCountSchema = Schema.Array(NonNegativeIntSchema).check(
  Schema.isLengthBetween(24, 24),
);

export const MapNetworkPropertiesSchema = Schema.Struct({
  routeId: RouteIdSchema,
  month: IsoMonthSchema,
  hourlySpeedMph: HourlySpeedSchema,
  hourlyTraversalCount: HourlyTraversalCountSchema,
  servedBoroughs: Schema.Array(MapBoroughSchema),
  servedBoroughsStatus: Schema.Literals(["verified", "unavailable"]),
}).check(
  Schema.makeFilter((properties) => {
    const issues: Schema.FilterIssue[] = [];
    const boroughs = [...properties.servedBoroughs];
    if (new Set(boroughs).size !== boroughs.length) {
      issues.push({ path: ["servedBoroughs"], issue: "Served boroughs must be unique." });
    }
    if (
      boroughs.some((borough, index) => index > 0 && (boroughs[index - 1] as MapBorough) > borough)
    ) {
      issues.push({ path: ["servedBoroughs"], issue: "Served boroughs must be sorted." });
    }
    if (properties.servedBoroughsStatus === "verified" && boroughs.length === 0) {
      issues.push({
        path: ["servedBoroughs"],
        issue: "Verified borough evidence cannot be empty.",
      });
    }
    if (properties.servedBoroughsStatus === "unavailable" && boroughs.length !== 0) {
      issues.push({
        path: ["servedBoroughs"],
        issue: "Unavailable borough evidence must be empty.",
      });
    }
    for (let hour = 0; hour < 24; hour += 1) {
      if (properties.hourlySpeedMph[hour] !== null && properties.hourlyTraversalCount[hour] === 0) {
        issues.push({
          path: ["hourlyTraversalCount", hour],
          issue: "An observed hourly speed requires a positive traversal count.",
        });
      }
    }
    return issues;
  }),
);

export const MapMultiLineStringGeometrySchema = Schema.Struct({
  type: Schema.Literal("MultiLineString"),
  coordinates: Schema.Array(
    Schema.Array(LongitudeLatitudeCoordinateSchema).check(Schema.isMinLength(2)),
  ).check(Schema.isMinLength(1)),
});

export const MapNetworkFeatureSchema = Schema.Struct({
  type: Schema.Literal("Feature"),
  geometry: MapMultiLineStringGeometrySchema,
  properties: MapNetworkPropertiesSchema,
});

export const MapNetworkFeatureCollectionSchema = registerProjectSchema(
  Schema.Struct({
    type: Schema.Literal("FeatureCollection"),
    features: Schema.Array(MapNetworkFeatureSchema),
  }).check(
    Schema.makeFilter((collection) => {
      const routeIds = collection.features.map((feature) => feature.properties.routeId);
      return new Set(routeIds).size === routeIds.length
        ? []
        : [{ path: ["features"], issue: "Network map route IDs must be unique." }];
    }),
  ),
  {
    id: "bp.map_network_feature_collection.v1",
    title: "Map Network Feature Collection",
    description:
      "Citywide route geometry with hourly speed evidence and served-borough membership.",
    stability: "draft",
  },
);
export type MapNetworkFeatureCollection = typeof MapNetworkFeatureCollectionSchema.Type;
export type MapNetworkFeature = MapNetworkFeatureCollection["features"][number];

const MapPolygonCoordinatesSchema = Schema.Array(
  Schema.Array(LongitudeLatitudeCoordinateSchema).check(Schema.isMinLength(4)),
).check(Schema.isMinLength(1));

export const MapContextFeatureSchema = Schema.Struct({
  type: Schema.Literal("Feature"),
  properties: Schema.Struct({
    boroName: MapBoroughSchema,
    labelPoint: LongitudeLatitudeCoordinateSchema,
  }),
  geometry: Schema.Struct({
    type: Schema.Literal("MultiPolygon"),
    coordinates: Schema.Array(MapPolygonCoordinatesSchema).check(Schema.isMinLength(1)),
  }),
});

export const MapContextFeatureCollectionSchema = registerProjectSchema(
  Schema.Struct({
    type: Schema.Literal("FeatureCollection"),
    sourceRevision: Schema.Struct({
      sourceId: Schema.Literal("nyc_borough_boundaries"),
      sha256: Sha256Schema,
      currencyPolicy: Schema.Literal("revision_pinned"),
    }),
    features: Schema.Array(MapContextFeatureSchema).check(Schema.isMinLength(1)),
  }),
  {
    id: "bp.map_context_feature_collection.v1",
    title: "Map Context Feature Collection",
    description: "Revision-pinned NYC borough polygons and deterministic label points.",
    stability: "draft",
  },
);
export type MapContextFeatureCollection = typeof MapContextFeatureCollectionSchema.Type;

export const MapBusLaneFeatureSchema = Schema.Struct({
  type: Schema.Literal("Feature"),
  geometry: Schema.Struct({
    type: Schema.Literal("LineString"),
    coordinates: Schema.Array(LongitudeLatitudeCoordinateSchema).check(Schema.isMinLength(2)),
  }),
  properties: Schema.Struct({
    segmentId: NonEmptyStringSchema,
    street: NonEmptyStringSchema,
    borough: MapBoroughSchema,
    facility: NonEmptyStringSchema,
    laneType: Schema.NullOr(NonEmptyStringSchema),
    openDate: Schema.NullOr(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/))),
  }),
});

export const MapBusLaneFeatureCollectionSchema = registerProjectSchema(
  Schema.Struct({
    type: Schema.Literal("FeatureCollection"),
    features: Schema.Array(MapBusLaneFeatureSchema),
  }),
  {
    id: "bp.map_bus_lane_feature_collection.v1",
    title: "Map Bus Lane Feature Collection",
    description: "Strict public NYC DOT bus-lane geometry.",
    stability: "draft",
  },
);
export type MapBusLaneFeatureCollection = typeof MapBusLaneFeatureCollectionSchema.Type;

export const MapRouteDelayExposureSchema = Schema.Struct({
  valueRiderHours: Schema.NullOr(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))),
  status: Schema.Literals(["available", "unavailable"]),
  analysisPeriod: Schema.NullOr(IsoMonthSchema),
  grain: Schema.NullOr(Schema.Literal("all_observed_timepoint_segments")),
  source: Schema.NullOr(Schema.Literal("mta_bus_segment_speeds")),
  segmentCount: NonNegativeIntSchema,
  ridershipDenominator: Schema.NullOr(Schema.Literal("average_service_day_route_hourly_ridership")),
  serviceDayRidershipCoverage: Schema.Literals(["available", "not_available"]),
  hourlyPassengerDelayCoverage: Schema.Literals(["available", "not_available"]),
  unavailableReason: Schema.NullOr(NonEmptyStringSchema),
}).check(
  Schema.makeFilter((exposure) => {
    const available = exposure.status === "available";
    const complete =
      exposure.valueRiderHours !== null &&
      exposure.analysisPeriod !== null &&
      exposure.grain !== null &&
      exposure.source !== null &&
      exposure.segmentCount > 0 &&
      exposure.ridershipDenominator !== null &&
      exposure.serviceDayRidershipCoverage === "available" &&
      exposure.hourlyPassengerDelayCoverage === "available" &&
      exposure.unavailableReason === null;
    const empty =
      exposure.valueRiderHours === null &&
      exposure.analysisPeriod === null &&
      exposure.grain === null &&
      exposure.source === null &&
      exposure.ridershipDenominator === null &&
      exposure.unavailableReason !== null;
    return available === complete && (available || empty)
      ? []
      : [{ path: [], issue: "Delay-exposure status contradicts its evidence metadata." }];
  }),
);

export const MapRouteProvenanceSchema = Schema.Struct({
  lane: Schema.Struct({
    status: Schema.Literals(["available", "unavailable"]),
    valuePct: Schema.NullOr(
      Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).check(Schema.isLessThanOrEqualTo(100)),
    ),
    method: Schema.NullOr(Schema.Literal("route_shape_proximity_overlap")),
    sourceId: Schema.NullOr(Schema.Literal("nyc_dot_bus_lanes_local_streets")),
    unavailableReason: Schema.NullOr(NonEmptyStringSchema),
  }),
  ace: Schema.Struct({
    status: Schema.Literals(["active", "none", "unknown"]),
    grain: Schema.Literal("route_month"),
    sourceId: Schema.NullOr(Schema.Literal("ace_routes")),
    sourceAsOf: Schema.NullOr(Schema.String),
    sourceStatus: Schema.Literals(["available", "unavailable"]),
    unavailableReason: Schema.NullOr(NonEmptyStringSchema),
  }),
  tsp: Schema.Struct({
    status: Schema.Literals(["installed", "candidate", "unknown"]),
    grain: Schema.Literal("route_or_corridor"),
    sourceId: Schema.NullOr(Schema.Literal("nyc_dot_tsp_status_2017")),
    sourceDate: Schema.NullOr(Schema.String),
    corridor: Schema.NullOr(Schema.String),
    matchMethod: Schema.String,
  }),
}).check(
  Schema.makeFilter((provenance) => {
    const issues: Schema.FilterIssue[] = [];
    const laneAvailable = provenance.lane.status === "available";
    const laneComplete =
      provenance.lane.valuePct !== null &&
      provenance.lane.method !== null &&
      provenance.lane.sourceId !== null &&
      provenance.lane.unavailableReason === null;
    if (laneAvailable !== laneComplete) {
      issues.push({ path: ["lane"], issue: "Lane status contradicts its evidence metadata." });
    }
    if (
      !laneAvailable &&
      (provenance.lane.valuePct !== null || provenance.lane.unavailableReason === null)
    ) {
      issues.push({
        path: ["lane"],
        issue: "Unavailable lane evidence requires a null value and reason.",
      });
    }
    const aceAvailable = provenance.ace.sourceStatus === "available";
    if (
      (aceAvailable &&
        (provenance.ace.status === "unknown" ||
          provenance.ace.sourceId === null ||
          provenance.ace.unavailableReason !== null)) ||
      (!aceAvailable &&
        (provenance.ace.status !== "unknown" ||
          provenance.ace.sourceId !== null ||
          provenance.ace.sourceAsOf !== null ||
          provenance.ace.unavailableReason === null))
    ) {
      issues.push({ path: ["ace"], issue: "ACE status contradicts its source posture." });
    }
    return issues;
  }),
);

export const MapRouteSummarySchema = Schema.Struct({
  routeId: RouteIdSchema,
  slug: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  corridor: NonEmptyStringSchema,
  borough: NonEmptyStringSchema,
  sbs: Schema.Boolean,
  speedMph: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
  dailyRiders: NonNegativeIntSchema,
  reliability: NonEmptyStringSchema,
  movement6mPct: Schema.NullOr(Schema.Number),
});

export const MapRouteFactSchema = Schema.Struct({
  route: MapRouteSummarySchema,
  delayExposure: MapRouteDelayExposureSchema,
  provenance: MapRouteProvenanceSchema,
});

export const MapRouteFactMetadataSchema = Schema.Struct({
  routeId: RouteIdSchema,
  delayExposure: MapRouteDelayExposureSchema,
  provenance: MapRouteProvenanceSchema,
});
export type MapRouteFactMetadata = typeof MapRouteFactMetadataSchema.Type;

export const MapRouteFactsResponseSchema = registerProjectSchema(
  Schema.Struct({
    schemaVersion: Schema.Literal(1),
    baselineMonth: IsoMonthSchema,
    generatedAt: Schema.String,
    routes: Schema.Array(MapRouteFactSchema),
  }).check(
    Schema.makeFilter((response) => {
      const routeIds = response.routes.map((fact) => fact.route.routeId);
      return new Set(routeIds).size === routeIds.length
        ? []
        : [{ path: ["routes"], issue: "Map route facts must have unique route IDs." }];
    }),
  ),
  {
    id: "bp.map_route_facts_response.v1",
    title: "Map Route Facts Response",
    description: "Compact same-month canonical route facts joined to network geometry by route ID.",
    stability: "draft",
  },
);
export type MapRouteFact = typeof MapRouteFactSchema.Type;
export type MapRouteFactsResponse = typeof MapRouteFactsResponseSchema.Type;

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

export const MapRouteFactsReferenceSchema = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("available"),
    artifactKey: NonEmptyStringSchema,
    sha256: Sha256Schema,
    schemaVersion: Schema.Literal(1),
    baselineMonth: IsoMonthSchema,
    routeCount: NonNegativeIntSchema,
  }),
  Schema.Struct({
    status: Schema.Literal("unavailable"),
    reason: NonEmptyStringSchema,
  }),
]);
export type MapRouteFactsReference = typeof MapRouteFactsReferenceSchema.Type;

export const MapManifestResponseSchema = registerProjectSchema(
  Schema.Struct({
    schemaVersion: Schema.Literal(schemaVersion),
    generatedAt: Schema.String.check(
      Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/),
    ),
    baselineMonth: IsoMonthSchema,
    releaseProfile: Schema.Literals(["demo", "full"]),
    buildStatus: Schema.Literals(["pass", "fail"]),
    verificationStatus: Schema.Literals(["not_run", "pass", "fail"]),
    routeFacts: MapRouteFactsReferenceSchema,
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
