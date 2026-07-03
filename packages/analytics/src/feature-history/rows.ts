export type SegmentDaypartHistoryRow = {
  route_id: string;
  month: string;
  segment_id: string;
  direction: string;
  daypart: string;
  observation_count: number;
  traversal_count: number;
  average_speed_mph: number | null;
  average_travel_time_minutes: number | null;
  average_road_distance_miles: number | null;
};

export type RouteMonthHourlyProfileRow = {
  route_id: string;
  month: string;
  hourly_row_count: number;
  total_ridership: number;
  total_transfers: number;
  peak_day_of_week: string | null;
  peak_hour_of_day: number | null;
  peak_ridership: number | null;
};

export type RouteHourlyProfileHourRow = {
  route_id: string;
  month: string;
  hour_of_day: number;
  ridership_hourly_row_count: number;
  ridership: number | null;
  transfers: number | null;
  speed_observation_count: number;
  speed_bus_trip_count: number;
  average_speed_mph: number | null;
};

export type RouteHourlyProfileSlowestWindowRow = {
  route_id: string;
  month: string;
  day_of_week: string;
  hour_of_day: number;
  observation_count: number;
  bus_trip_count: number;
  weighted_average_speed_mph: number | null;
};

export type RouteHourlyProfileReliabilitySampleRow = {
  route_id: string;
  month: string;
  hour_of_day: number;
  sample_count: number;
  average_observed_headway_minutes: number;
};
