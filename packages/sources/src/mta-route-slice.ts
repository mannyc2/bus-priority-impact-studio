import { RouteIdCodec } from "@bp/domain";
import * as z from "zod";
import type { SocrataRow } from "./socrata-rows.js";

const schemaVersion = 1;
const IsoMonthStringSchema = z.string().regex(/^\d{4}-\d{2}$/);

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

export const NormalizedRouteShapeSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    routeId: z.string().min(1),
    routeShortName: z.string().min(1),
    routeLongName: z.string().min(1).optional(),
    inEffect: z.boolean(),
    directionId: z.string().min(1),
    direction: z.string().min(1),
    shapeId: z.string().min(1),
    routeType: z.string().optional(),
    tripType: z.string().optional(),
    bundle: z.string().optional(),
    shapeLength: z.number().optional(),
    geometry: z.unknown().optional(),
  })
  .strict();

export const NormalizedStopSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    routeId: z.string().min(1),
    routeShortName: z.string().min(1),
    stopId: z.string().min(1),
    stopName: z.string().min(1),
    inEffect: z.boolean(),
    directionId: z.string().min(1),
    direction: z.string().min(1),
    timepoint: z.boolean(),
    latitude: z.number(),
    longitude: z.number(),
    georeference: z.unknown().optional(),
  })
  .strict();

export const NormalizedHourlyRidershipSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    routeId: z.string().min(1),
    isoMonth: IsoMonthStringSchema,
    dayOfWeek: z.string().min(1),
    hourOfDay: z.number().int().min(0).max(23),
    ridership: z.number().nonnegative(),
    transfers: z.number().nonnegative(),
  })
  .strict();

export type NormalizedSegmentSpeed = z.output<typeof NormalizedSegmentSpeedSchema>;
export type NormalizedRouteShape = z.output<typeof NormalizedRouteShapeSchema>;
export type NormalizedStop = z.output<typeof NormalizedStopSchema>;
export type NormalizedHourlyRidership = z.output<typeof NormalizedHourlyRidershipSchema>;

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
    timepoint_stop_id: z.string().min(1),
    timepoint_stop_name: z.string().min(1),
    timepoint_stop_latitude: z.coerce.number(),
    timepoint_stop_longitude: z.coerce.number(),
    next_timepoint_stop_id: z.string().min(1),
    next_timepoint_stop_name: z.string().min(1),
    next_timepoint_stop_latitude: z.coerce.number(),
    next_timepoint_stop_longitude: z.coerce.number(),
    road_distance: z.coerce.number(),
    average_travel_time: z.coerce.number(),
    average_road_speed: z.coerce.number(),
    bus_trip_count: z.coerce.number().int(),
  })
  .passthrough();

const RawRouteShapeRowSchema = z
  .object({
    route_id: z.string().min(1),
    route_short_name: z.string().min(1),
    route_long_name: z.string().min(1).optional(),
    in_effect: z.union([z.boolean(), z.string()]),
    direction_id: z.string().min(1),
    direction: z.string().min(1),
    shape_id: z.string().min(1),
    route_type: z.string().optional(),
    trip_type: z.string().optional(),
    bundle: z.string().optional(),
    shape_length: z.coerce.number().optional(),
    geometry: z.unknown().optional(),
  })
  .passthrough();

const RawStopRowSchema = z
  .object({
    route_id: z.string().min(1),
    route_short_name: z.string().min(1),
    stop_id: z.string().min(1),
    stop_name: z.string().min(1),
    in_effect: z.union([z.boolean(), z.string()]),
    direction_id: z.string().min(1),
    direction: z.string().min(1),
    timepoint: z.union([z.boolean(), z.string(), z.number()]),
    latitude: z.coerce.number(),
    longitude: z.coerce.number(),
    georeference: z.unknown().optional(),
  })
  .passthrough();

const RawHourlyRidershipRowSchema = z
  .object({
    day_of_week_index: z.coerce.number().int().min(0).max(6),
    hour_of_day: z.coerce.number().int().min(0).max(23),
    ridership: z.coerce.number().nonnegative(),
    transfers: z.coerce.number().nonnegative(),
  })
  .passthrough();

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function parseBoolean(value: boolean | number | string): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function isoMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function normalizeSegmentSpeedRows(rows: SocrataRow[]): NormalizedSegmentSpeed[] {
  return rows.map((row) => {
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

export function normalizeRouteShapeRows(rows: SocrataRow[]): NormalizedRouteShape[] {
  return rows.map((row) => {
    const parsed = RawRouteShapeRowSchema.parse(row);
    const output: NormalizedRouteShape = {
      schemaVersion,
      routeId: z.decode(RouteIdCodec, parsed.route_id),
      routeShortName: parsed.route_short_name,
      inEffect: parseBoolean(parsed.in_effect),
      directionId: parsed.direction_id,
      direction: parsed.direction,
      shapeId: parsed.shape_id,
    };

    if (parsed.route_long_name !== undefined) {
      output.routeLongName = parsed.route_long_name;
    }
    if (parsed.route_type !== undefined) {
      output.routeType = parsed.route_type;
    }
    if (parsed.trip_type !== undefined) {
      output.tripType = parsed.trip_type;
    }
    if (parsed.bundle !== undefined) {
      output.bundle = parsed.bundle;
    }
    if (parsed.shape_length !== undefined) {
      output.shapeLength = parsed.shape_length;
    }
    if (parsed.geometry !== undefined) {
      output.geometry = parsed.geometry;
    }

    return output;
  });
}

export function normalizeStopRows(rows: SocrataRow[]): NormalizedStop[] {
  return rows.map((row) => {
    const parsed = RawStopRowSchema.parse(row);
    const output: NormalizedStop = {
      schemaVersion,
      routeId: z.decode(RouteIdCodec, parsed.route_id),
      routeShortName: parsed.route_short_name,
      stopId: parsed.stop_id,
      stopName: parsed.stop_name,
      inEffect: parseBoolean(parsed.in_effect),
      directionId: parsed.direction_id,
      direction: parsed.direction,
      timepoint: parseBoolean(parsed.timepoint),
      latitude: parsed.latitude,
      longitude: parsed.longitude,
    };

    if (parsed.georeference !== undefined) {
      output.georeference = parsed.georeference;
    }

    return output;
  });
}

export function normalizeHourlyRidershipRows(
  rows: SocrataRow[],
  args: { routeId: string; year: number; month: number },
): NormalizedHourlyRidership[] {
  return rows.map((row) => {
    const parsed = RawHourlyRidershipRowSchema.parse(row);
    const dayOfWeek = dayNames[parsed.day_of_week_index];
    if (dayOfWeek === undefined) {
      throw new Error(`Unsupported day-of-week index: ${parsed.day_of_week_index}`);
    }

    return {
      schemaVersion,
      routeId: z.decode(RouteIdCodec, args.routeId),
      isoMonth: isoMonth(args.year, args.month),
      dayOfWeek,
      hourOfDay: parsed.hour_of_day,
      ridership: parsed.ridership,
      transfers: parsed.transfers,
    };
  });
}
