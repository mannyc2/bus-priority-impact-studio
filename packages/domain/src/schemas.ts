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

export const RouteScorecardSchema = registerProjectSchema(
  z
    .object({
      schemaVersion: z.literal(schemaVersion),
      routeId: RouteIdSchema,
      month: IsoMonthSchema,
      routeScore: z.number().min(0).max(100),
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
