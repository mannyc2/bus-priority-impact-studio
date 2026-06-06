import * as z from "zod";
import { registerProjectSchema } from "../schema-registry.js";

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

export const CodeExecutionLanguageSchema = registerProjectSchema(z.enum(["typescript", "bash"]), {
  id: "bp.code_execution_language",
  title: "Code Execution Language",
  description:
    "Languages accepted by agent-authored code_execution evidence refs. TypeScript/Bun is the primary path; bash is limited to deterministic shell slicing.",
  stability: "draft",
});

export type CodeExecutionLanguage = z.output<typeof CodeExecutionLanguageSchema>;

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
