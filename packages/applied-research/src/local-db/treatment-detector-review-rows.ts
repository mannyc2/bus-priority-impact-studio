import type { Database } from "bun:sqlite";
import type { TreatmentReviewSegmentSpeedRow } from "../detector-runs/treatment-review";

export type TreatmentDetectorReviewLocalDbQuery = {
  readonly sqlite: Database;
  readonly month: string;
  readonly routeId?: string;
};

export type TreatmentDetectorReviewLocalDbRows = {
  readonly speedRows: readonly TreatmentReviewSegmentSpeedRow[];
};

export function loadTreatmentDetectorReviewLocalDbRows(
  input: TreatmentDetectorReviewLocalDbQuery,
): TreatmentDetectorReviewLocalDbRows {
  const routeFilter = input.routeId === undefined ? "" : "AND route_id = ?";
  const query = input.sqlite.query(
    `
      SELECT
        route_id,
        month,
        route_id || ':' || month || ':' || direction || ':' || stop_order || ':' ||
          timepoint_stop_id || ':' || next_timepoint_stop_id AS segment_id,
        direction,
        stop_order,
        SUM(average_road_speed_mph * bus_trip_count) / NULLIF(SUM(bus_trip_count), 0)
          AS average_speed_mph,
        COUNT(*) AS observation_count,
        SUM(bus_trip_count) AS bus_trip_count
      FROM local_route_segment_speed
      WHERE month = ?
        ${routeFilter}
      GROUP BY
        route_id,
        month,
        direction,
        stop_order,
        timepoint_stop_id,
        next_timepoint_stop_id
      ORDER BY route_id, direction, stop_order
    `,
  );

  return {
    speedRows: (
      input.routeId === undefined ? query.all(input.month) : query.all(input.month, input.routeId)
    ) as TreatmentReviewSegmentSpeedRow[],
  };
}
