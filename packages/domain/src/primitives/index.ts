import { Schema, SchemaGetter } from "effect";
import { registerProjectSchema } from "../schema-registry.js";

export const RouteIdSchema = registerProjectSchema(
  Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(12),
    Schema.isPattern(/^[A-Z][A-Z0-9+-]*$/),
  ).pipe(Schema.brand("RouteId")),
  {
    id: "bp.route_id",
    title: "Route ID",
    description: "Short public MTA bus route identifier such as M1, B46-SBS, or Q70+.",
    stability: "draft",
  },
);

export type RouteId = typeof RouteIdSchema.Type;

export const RouteIdCodec = Schema.String.pipe(
  Schema.decodeTo(RouteIdSchema, {
    decode: SchemaGetter.transform((value) => value.trim().toUpperCase()),
    encode: SchemaGetter.passthrough(),
  }),
);

export const DirectionIdSchema = registerProjectSchema(
  Schema.Literals(["0", "1"]).pipe(Schema.brand("DirectionId")),
  {
    id: "bp.direction_id",
    title: "Direction ID",
    description: "GTFS-style bus direction identifier. This MVP only accepts 0 or 1.",
    stability: "draft",
  },
);

export type DirectionId = typeof DirectionIdSchema.Type;

export const IsoMonthSchema = registerProjectSchema(
  Schema.String.check(Schema.isPattern(/^\d{4}-(0[1-9]|1[0-2])$/)).pipe(Schema.brand("IsoMonth")),
  {
    id: "bp.iso_month",
    title: "ISO Month",
    description: "Calendar month in YYYY-MM format.",
    stability: "draft",
  },
);

export type IsoMonth = typeof IsoMonthSchema.Type;

export const SourceCitationSchema = registerProjectSchema(
  Schema.Struct({
    sourceId: Schema.String.check(Schema.isMinLength(1)),
    title: Schema.String.check(Schema.isMinLength(1)),
    url: Schema.String.check(Schema.isPattern(/^https?:\/\/\S+$/)),
    verifiedAt: Schema.String.check(
      Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/),
    ),
  }),
  {
    id: "bp.source_citation",
    title: "Source Citation",
    description: "Auditable reference used by public route briefs and generated explanations.",
    stability: "draft",
  },
);

export type SourceCitation = typeof SourceCitationSchema.Type;

export const MetricNameSchema = registerProjectSchema(
  Schema.Literals(["average_speed_mph", "travel_time_seconds", "hotspot_score", "route_score"]),
  {
    id: "bp.metric_name",
    title: "Metric Name",
    description: "Metric identifiers allowed in route scorecards and hotspot summaries.",
    stability: "draft",
  },
);

export type MetricName = typeof MetricNameSchema.Type;

export const MapLayerMetricSchema = registerProjectSchema(
  Schema.Literals(["average_speed_mph", "hotspot_score", "ace_status", "bus_lane_presence"]),
  {
    id: "bp.map_layer_metric",
    title: "Map Layer Metric",
    description: "Metric identifiers available for public map layer styling and legends.",
    stability: "draft",
  },
);

export type MapLayerMetric = typeof MapLayerMetricSchema.Type;

export const CodeExecutionLanguageSchema = registerProjectSchema(
  Schema.Literals(["typescript", "bash"]),
  {
    id: "bp.code_execution_language",
    title: "Code Execution Language",
    description:
      "Languages accepted by agent-authored code_execution evidence refs. TypeScript/Bun is the primary path; bash is limited to deterministic shell slicing.",
    stability: "draft",
  },
);

export type CodeExecutionLanguage = typeof CodeExecutionLanguageSchema.Type;

export const NycBoroughSchema = registerProjectSchema(
  Schema.Literals(["Bronx", "Brooklyn", "Manhattan", "Queens", "Staten Island"]),
  {
    id: "bp.nyc_borough",
    title: "NYC Borough",
    description: "The five New York City boroughs used to scope public map layers.",
    stability: "stable",
  },
);

export type NycBorough = typeof NycBoroughSchema.Type;

export const LongitudeLatitudeCoordinateSchema = registerProjectSchema(
  Schema.Tuple([
    Schema.Number.check(Schema.isGreaterThanOrEqualTo(-180), Schema.isLessThanOrEqualTo(180)),
    Schema.Number.check(Schema.isGreaterThanOrEqualTo(-90), Schema.isLessThanOrEqualTo(90)),
  ]),
  {
    id: "bp.longitude_latitude_coordinate",
    title: "Longitude/Latitude Coordinate",
    description: "GeoJSON coordinate pair in [longitude, latitude] order.",
    stability: "draft",
  },
);

export type LongitudeLatitudeCoordinate = typeof LongitudeLatitudeCoordinateSchema.Type;
