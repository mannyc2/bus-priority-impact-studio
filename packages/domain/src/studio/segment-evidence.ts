import { Schema } from "effect";

export type StudioRouteSegmentEvidence = {
  id: string;
  routeSlug: string;
  routeId: string;
  month: string;
  direction: "NB" | "SB" | "EB" | "WB";
  from: string;
  to: string;
  stopOrder: number | null;
  observedSpeedMph: number | null;
  observedTravelTimeMinutes: number | null;
  scheduledMedianTravelTimeMinutes: number | null;
  scheduledSpeedMph: number;
  observedMinusScheduledMinutes: number | null;
  scheduledSampleCount: number | null;
  observedBusTripCount: number | null;
  observationCount: number | null;
  slowWindowPercent: number | null;
  averageRoadDistanceMiles: number | null;
  segmentGeometrySource: "mta_route_shape_timepoint_slice" | "geometry_unavailable";
  segmentGeometryMethod: "timepoint_stop_projection_to_route_shape" | "geometry_unavailable";
  segmentGeometry: unknown;
  ridershipExposure: number | null;
  riderDelayHours: number;
  hourlyPassengerDelay: unknown[];
  stopBoardings: unknown;
  segmentBoardings: unknown;
  lane: "yes" | "partial" | "minimal" | "none";
  laneSource: "dot_bus_lanes_geometry" | "geometry_unavailable";
  laneOverlapShare: number;
  laneMatchedCount: number;
  laneTypes: string[];
  laneOperatingHours: string[];
  laneOperatingDays: string[];
  tspStatus: "installed" | "candidate" | "unknown";
  tspSource: "not_in_ingested_tsp_sources" | "nyc_dot_tsp_status_2017";
  tspSourceDate: string | null;
  tspSourceUrl: string | null;
  tspCorridor: string | null;
  tspMatchMethod:
    | "not_matched_in_ingested_sources"
    | "route_label_in_2017_status_snapshot"
    | "segment_endpoint_text_match"
    | "route_level_status_only";
  hotspotScore: number | null;
  riderImpactScore: number | null;
};

export const StudioAiNoteEvidenceKeySchema = Schema.String.check(Schema.isMinLength(1));
export type StudioAiNoteEvidenceKey = typeof StudioAiNoteEvidenceKeySchema.Type;

export const StudioAiAnalystNoteSchema = Schema.Struct({
  generationMode: Schema.String.check(Schema.isMinLength(1)),
  headline: Schema.String.check(Schema.isMinLength(1)),
  body: Schema.String.check(Schema.isMinLength(1)),
  primaryEvidence: Schema.mutable(Schema.Array(StudioAiNoteEvidenceKeySchema)),
  caveats: Schema.Array(Schema.String.check(Schema.isMinLength(1))),
  nextChecks: Schema.Array(Schema.String.check(Schema.isMinLength(1))),
  blockedClaims: Schema.Array(Schema.String.check(Schema.isMinLength(1))),
  confidence: Schema.Literals(["low", "medium", "high"]),
});
export type StudioAiAnalystNote = typeof StudioAiAnalystNoteSchema.Type;

export const StudioAiPublicNoteSchema = Schema.Struct({
  generationMode: Schema.String.check(Schema.isMinLength(1)),
  body: Schema.String.check(Schema.isMinLength(1)),
  source: Schema.String.check(Schema.isMinLength(1)),
});
export type StudioAiPublicNote = typeof StudioAiPublicNoteSchema.Type;
