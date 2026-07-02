import type { SegmentDaypartHistoryRow } from "./rows.js";

export type SegmentDaypartHistoryArtifact = {
  readonly artifactKind: "segment_daypart_history";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly dbPath: string;
  readonly artifactPath: string;
  readonly window: {
    readonly startMonth: string;
    readonly endMonth: string;
    readonly monthCount: number;
  };
  readonly summary: {
    readonly featureCount: number;
    readonly routeCount: number;
    readonly dayparts: readonly ["am_peak", "midday", "pm_peak", "off_peak"];
    readonly aggregationNote: string;
  };
  readonly features: readonly SegmentDaypartFeature[];
};

export type SegmentDaypartFeature = {
  readonly routeId: string;
  readonly month: string;
  readonly segmentId: string;
  readonly direction: string;
  readonly daypart: string;
  readonly observationCount: number;
  readonly traversalCount: number;
  readonly averageSpeedMph: number | null;
  readonly averageTravelTimeMinutes: number | null;
  readonly averageRoadDistanceMiles: number | null;
};

const DAYPARTS = ["am_peak", "midday", "pm_peak", "off_peak"] as const;

const AGGREGATION_NOTE =
  "Speed and travel-time values are deterministic daypart means over source observations; detector-specific robust baselines can be derived from the persisted local table.";

export function buildSegmentDaypartHistoryArtifact(input: {
  readonly rows: readonly SegmentDaypartHistoryRow[];
  readonly startMonth: string;
  readonly endMonth: string;
  readonly generatedAt: string;
  readonly dbPath: string;
  readonly artifactPath: string;
}): SegmentDaypartHistoryArtifact {
  const routeIds = new Set(input.rows.map((row) => row.route_id));
  const months = new Set(input.rows.map((row) => row.month));

  return {
    artifactKind: "segment_daypart_history",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    dbPath: input.dbPath,
    artifactPath: input.artifactPath,
    window: { startMonth: input.startMonth, endMonth: input.endMonth, monthCount: months.size },
    summary: {
      featureCount: input.rows.length,
      routeCount: routeIds.size,
      dayparts: DAYPARTS,
      aggregationNote: AGGREGATION_NOTE,
    },
    features: input.rows.map((row) => ({
      routeId: row.route_id,
      month: row.month,
      segmentId: row.segment_id,
      direction: row.direction,
      daypart: row.daypart,
      observationCount: row.observation_count,
      traversalCount: row.traversal_count,
      averageSpeedMph: row.average_speed_mph,
      averageTravelTimeMinutes: row.average_travel_time_minutes,
      averageRoadDistanceMiles: row.average_road_distance_miles,
    })),
  };
}
