import { RouteIdCodec } from "@bp/domain/primitives";
import * as z from "@bp/domain/schema-compat";
import type { SocrataRow } from "../../core/index.js";
import { isoCalendarDateTime, schemaVersion } from "../../core/index.js";

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
    return {
      schemaVersion,
      routeId: RouteIdCodec.parse(parsed.route_id),
      scheduleDate: isoCalendarDateTime(parsed.schedule_date),
      dayType: parsed.day_type,
      direction: parsed.direction,
      shapeId: parsed.shape_id,
      stopSequence: parsed.stop_sequence,
      stopId: parsed.stop_id,
      scheduleTime: isoCalendarDateTime(parsed.schedule_time),
      blockId: parsed.block_id,
      ...(parsed.stop_name === undefined ? {} : { stopName: parsed.stop_name }),
      ...(parsed.distance_from_start === undefined
        ? {}
        : { distanceFromStart: parsed.distance_from_start }),
      ...(parsed.trip_headsign === undefined ? {} : { tripHeadsign: parsed.trip_headsign }),
      ...(parsed.bundle === undefined ? {} : { bundle: parsed.bundle }),
    } satisfies NormalizedScheduleTimepoint;
  });
}
