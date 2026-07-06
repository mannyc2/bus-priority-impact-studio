import * as z from "../schema-compat.js";

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

export const StudioAiNoteEvidenceKeySchema = z.string().min(1);
export type StudioAiNoteEvidenceKey = z.output<typeof StudioAiNoteEvidenceKeySchema>;

export const StudioAiAnalystNoteSchema = z.object({
  generationMode: z.string().min(1),
  headline: z.string().min(1),
  body: z.string().min(1),
  primaryEvidence: z.array(StudioAiNoteEvidenceKeySchema),
  caveats: z.array(z.string().min(1)),
  nextChecks: z.array(z.string().min(1)),
  blockedClaims: z.array(z.string().min(1)),
  confidence: z.enum(["low", "medium", "high"]),
});
export type StudioAiAnalystNote = z.output<typeof StudioAiAnalystNoteSchema>;

export const StudioAiPublicNoteSchema = z.object({
  generationMode: z.string().min(1),
  body: z.string().min(1),
  source: z.string().min(1),
});
export type StudioAiPublicNote = z.output<typeof StudioAiPublicNoteSchema>;
