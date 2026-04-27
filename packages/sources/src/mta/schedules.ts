import { RouteIdCodec } from "@bp/domain";
import * as z from "zod";
import type { SocrataRow } from "../socrata/client.js";
import { isoCalendarDateTime, schemaVersion } from "./parse-helpers.js";

export const NormalizedScheduleTimepointSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    routeId: z.string().min(1),
    scheduleDate: z.iso.datetime(),
    dayType: z.string().min(1),
    direction: z.string().min(1),
    shapeId: z.string().min(1),
    stopSequence: z.number().int().nonnegative(),
    stopId: z.string().min(1),
    stopName: z.string().min(1).optional(),
    scheduleTime: z.iso.datetime(),
    distanceFromStart: z.number().nonnegative().optional(),
    tripHeadsign: z.string().min(1).optional(),
    blockId: z.string().min(1),
    bundle: z.string().min(1).optional(),
  })
  .strict();

export type NormalizedScheduleTimepoint = z.output<typeof NormalizedScheduleTimepointSchema>;

const RawScheduleTimepointRowSchema = z
  .object({
    schedule_date: z.string().min(1),
    day_type: z.string().min(1),
    direction: z.string().min(1),
    shape_id: z.string().min(1),
    route_id: z.string().min(1),
    stop_sequence: z.coerce.number().int().nonnegative(),
    stop_id: z.string().min(1),
    stop_name: z.string().min(1).optional(),
    schedule_time: z.string().min(1),
    distance_from_start: z.coerce.number().nonnegative().optional(),
    trip_headsign: z.string().min(1).optional(),
    block_id: z.string().min(1),
    bundle: z.string().min(1).optional(),
  })
  .passthrough();

export function normalizeScheduleTimepointRows(rows: SocrataRow[]): NormalizedScheduleTimepoint[] {
  return rows.map((row) => {
    const parsed = RawScheduleTimepointRowSchema.parse(row);
    const output: NormalizedScheduleTimepoint = {
      schemaVersion,
      routeId: z.decode(RouteIdCodec, parsed.route_id),
      scheduleDate: isoCalendarDateTime(parsed.schedule_date),
      dayType: parsed.day_type,
      direction: parsed.direction,
      shapeId: parsed.shape_id,
      stopSequence: parsed.stop_sequence,
      stopId: parsed.stop_id,
      scheduleTime: isoCalendarDateTime(parsed.schedule_time),
      blockId: parsed.block_id,
    };

    if (parsed.stop_name !== undefined) {
      output.stopName = parsed.stop_name;
    }
    if (parsed.distance_from_start !== undefined) {
      output.distanceFromStart = parsed.distance_from_start;
    }
    if (parsed.trip_headsign !== undefined) {
      output.tripHeadsign = parsed.trip_headsign;
    }
    if (parsed.bundle !== undefined) {
      output.bundle = parsed.bundle;
    }

    return output;
  });
}
