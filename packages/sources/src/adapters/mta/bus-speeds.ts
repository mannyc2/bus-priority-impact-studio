import { RouteIdCodec } from "@bp/domain/primitives";
import * as z from "zod";
import type { SocrataRow } from "../../clients/socrata/index.js";
import { IsoMonthStringSchema, isoMonth, schemaVersion } from "../../core/index.js";

export const NormalizedSegmentSpeedSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    routeId: z.string().min(1),
    isoMonth: IsoMonthStringSchema,
    timestamp: z.string().min(1),
    dayOfWeek: z.string().min(1),
    hourOfDay: z.number().int(),
    direction: z.string().min(1),
    borough: z.string().min(1),
    routeType: z.string().min(1),
    stopOrder: z.number().int(),
    timepointStopId: z.string().min(1),
    timepointStopName: z.string().min(1),
    timepointStopLatitude: z.number(),
    timepointStopLongitude: z.number(),
    nextTimepointStopId: z.string().min(1),
    nextTimepointStopName: z.string().min(1),
    nextTimepointStopLatitude: z.number(),
    nextTimepointStopLongitude: z.number(),
    roadDistanceMiles: z.number(),
    averageTravelTimeMinutes: z.number(),
    averageRoadSpeedMph: z.number(),
    busTripCount: z.number().int(),
  })
  .strict();

export type NormalizedSegmentSpeed = z.output<typeof NormalizedSegmentSpeedSchema>;

export const NormalizedSegmentSpeedCellSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    routeId: z.string().min(1),
    isoMonth: IsoMonthStringSchema,
    timestamp: z.string().min(1),
    dayOfWeek: z.string().min(1),
    hourOfDay: z.number().int(),
    direction: z.string().min(1),
    borough: z.string().min(1),
    routeType: z.string().min(1),
    stopOrder: z.number().int(),
    timepointStopId: z.string().nullable(),
    timepointStopName: z.string().nullable(),
    timepointStopLatitude: z.number().nullable(),
    timepointStopLongitude: z.number().nullable(),
    nextTimepointStopId: z.string().nullable(),
    nextTimepointStopName: z.string().nullable(),
    nextTimepointStopLatitude: z.number().nullable(),
    nextTimepointStopLongitude: z.number().nullable(),
    roadDistanceMiles: z.number().nullable(),
    averageTravelTimeMinutes: z.number().nullable(),
    averageRoadSpeedMph: z.number().nullable(),
    busTripCount: z.number().int().nullable(),
  })
  .strict();

export type NormalizedSegmentSpeedCell = z.output<typeof NormalizedSegmentSpeedCellSchema>;

const RawSegmentSpeedRowSchema = z
  .object({
    year: z.coerce.number().int(),
    month: z.coerce.number().int(),
    timestamp: z.string().min(1),
    day_of_week: z.string().min(1),
    hour_of_day: z.coerce.number().int(),
    route_id: z.string().min(1),
    direction: z.string().min(1),
    borough: z.string().min(1),
    route_type: z.string().min(1),
    stop_order: z.coerce.number().int(),
    timepoint_stop_id: z.coerce.string().min(1),
    timepoint_stop_name: z.string().min(1),
    timepoint_stop_latitude: z.coerce.number(),
    timepoint_stop_longitude: z.coerce.number(),
    next_timepoint_stop_id: z.coerce.string().min(1),
    next_timepoint_stop_name: z.string().min(1),
    next_timepoint_stop_latitude: z.coerce.number(),
    next_timepoint_stop_longitude: z.coerce.number(),
    road_distance: z.coerce.number(),
    average_travel_time: z.coerce.number(),
    average_road_speed: z.coerce.number(),
    bus_trip_count: z.coerce.number().int(),
  })
  .passthrough();

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function hasUsableTimepointSegment(row: SocrataRow): boolean {
  const {
    timepoint_stop_id: timepointStopId,
    timepoint_stop_name: timepointStopName,
    timepoint_stop_latitude: timepointStopLatitude,
    timepoint_stop_longitude: timepointStopLongitude,
    next_timepoint_stop_id: nextTimepointStopId,
    next_timepoint_stop_name: nextTimepointStopName,
    next_timepoint_stop_latitude: nextTimepointStopLatitude,
    next_timepoint_stop_longitude: nextTimepointStopLongitude,
  } = row;

  return (
    hasValue(timepointStopId) &&
    hasText(timepointStopName) &&
    hasValue(timepointStopLatitude) &&
    hasValue(timepointStopLongitude) &&
    hasValue(nextTimepointStopId) &&
    hasText(nextTimepointStopName) &&
    hasValue(nextTimepointStopLatitude) &&
    hasValue(nextTimepointStopLongitude)
  );
}

const RawSegmentSpeedCellRowSchema = z
  .object({
    year: z.coerce.number().int(),
    month: z.coerce.number().int(),
    timestamp: z.string().min(1),
    day_of_week: z.string().min(1),
    hour_of_day: z.coerce.number().int(),
    route_id: z.string().min(1),
    direction: z.string().min(1),
    borough: z.string().min(1),
    route_type: z.string().min(1),
    stop_order: z.coerce.number().int(),
    timepoint_stop_id: z.coerce.string().optional(),
    timepoint_stop_name: z.string().optional(),
    timepoint_stop_latitude: z.coerce.number().optional(),
    timepoint_stop_longitude: z.coerce.number().optional(),
    next_timepoint_stop_id: z.coerce.string().optional(),
    next_timepoint_stop_name: z.string().optional(),
    next_timepoint_stop_latitude: z.coerce.number().optional(),
    next_timepoint_stop_longitude: z.coerce.number().optional(),
    road_distance: z.coerce.number().optional(),
    average_travel_time: z.coerce.number().optional(),
    average_road_speed: z.coerce.number().optional(),
    bus_trip_count: z.coerce.number().int().optional(),
  })
  .passthrough();

function nullable<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

export function normalizeSegmentSpeedCellRows(rows: SocrataRow[]): NormalizedSegmentSpeedCell[] {
  return rows.map((row) => {
    const parsed = RawSegmentSpeedCellRowSchema.parse(row);

    return {
      schemaVersion,
      routeId: z.decode(RouteIdCodec, parsed.route_id),
      isoMonth: isoMonth(parsed.year, parsed.month),
      timestamp: parsed.timestamp,
      dayOfWeek: parsed.day_of_week,
      hourOfDay: parsed.hour_of_day,
      direction: parsed.direction,
      borough: parsed.borough,
      routeType: parsed.route_type,
      stopOrder: parsed.stop_order,
      timepointStopId: nullable(parsed.timepoint_stop_id),
      timepointStopName: nullable(parsed.timepoint_stop_name),
      timepointStopLatitude: nullable(parsed.timepoint_stop_latitude),
      timepointStopLongitude: nullable(parsed.timepoint_stop_longitude),
      nextTimepointStopId: nullable(parsed.next_timepoint_stop_id),
      nextTimepointStopName: nullable(parsed.next_timepoint_stop_name),
      nextTimepointStopLatitude: nullable(parsed.next_timepoint_stop_latitude),
      nextTimepointStopLongitude: nullable(parsed.next_timepoint_stop_longitude),
      roadDistanceMiles: nullable(parsed.road_distance),
      averageTravelTimeMinutes: nullable(parsed.average_travel_time),
      averageRoadSpeedMph: nullable(parsed.average_road_speed),
      busTripCount: nullable(parsed.bus_trip_count),
    };
  });
}

export function normalizeSegmentSpeedRows(rows: SocrataRow[]): NormalizedSegmentSpeed[] {
  return rows.filter(hasUsableTimepointSegment).map((row) => {
    const parsed = RawSegmentSpeedRowSchema.parse(row);

    return {
      schemaVersion,
      routeId: z.decode(RouteIdCodec, parsed.route_id),
      isoMonth: isoMonth(parsed.year, parsed.month),
      timestamp: parsed.timestamp,
      dayOfWeek: parsed.day_of_week,
      hourOfDay: parsed.hour_of_day,
      direction: parsed.direction,
      borough: parsed.borough,
      routeType: parsed.route_type,
      stopOrder: parsed.stop_order,
      timepointStopId: parsed.timepoint_stop_id,
      timepointStopName: parsed.timepoint_stop_name,
      timepointStopLatitude: parsed.timepoint_stop_latitude,
      timepointStopLongitude: parsed.timepoint_stop_longitude,
      nextTimepointStopId: parsed.next_timepoint_stop_id,
      nextTimepointStopName: parsed.next_timepoint_stop_name,
      nextTimepointStopLatitude: parsed.next_timepoint_stop_latitude,
      nextTimepointStopLongitude: parsed.next_timepoint_stop_longitude,
      roadDistanceMiles: parsed.road_distance,
      averageTravelTimeMinutes: parsed.average_travel_time,
      averageRoadSpeedMph: parsed.average_road_speed,
      busTripCount: parsed.bus_trip_count,
    };
  });
}
