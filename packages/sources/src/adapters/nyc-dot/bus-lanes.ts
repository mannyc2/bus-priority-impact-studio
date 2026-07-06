import * as z from "@bp/domain/schema-compat";
import type { SocrataRow } from "../../core/index.js";

const schemaVersion = 1;

export const NormalizedBusLaneSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    segmentId: z.string().min(1),
    street: z.string().min(1),
    borough: z.string().min(1),
    facility: z.string().min(1),
    direction: z.string().min(1).optional(),
    trafficDirection: z.string().min(1).optional(),
    hours: z.string().min(1).optional(),
    days: z.string().min(1).optional(),
    laneType: z.string().min(1).optional(),
    laneSubtype: z.string().min(1).optional(),
    laneWidth: z.string().min(1).optional(),
    openDate: z.string().min(1).optional(),
    shapeLength: z.number().nonnegative().optional(),
    geometry: z.unknown().optional(),
  })
  .strict();

export type NormalizedBusLane = z.output<typeof NormalizedBusLaneSchema>;

const RawBusLaneRowSchema = z
  .object({
    the_geom: z.unknown().optional(),
    street: z.string().min(1),
    bltrafdir: z.string().min(1).optional(),
    segmentid: z.string().min(1),
    boro: z.string().min(1),
    facility: z.string().min(1),
    direction: z.string().min(1).optional(),
    hours: z.string().min(1).optional(),
    days: z.string().min(1).optional(),
    lane_width: z.string().min(1).optional(),
    lane_type1: z.string().min(1).optional(),
    lane_type: z.string().min(1).optional(),
    open_dates: z.string().min(1).optional(),
    shape_leng: z.coerce.number().nonnegative().optional(),
  })
  .passthrough();

export function normalizeBusLaneRows(rows: SocrataRow[]): NormalizedBusLane[] {
  return rows.map((row) => {
    const parsed = RawBusLaneRowSchema.parse(row);
    return {
      schemaVersion,
      segmentId: parsed.segmentid,
      street: parsed.street,
      borough: parsed.boro,
      facility: parsed.facility,
      ...(parsed.direction === undefined ? {} : { direction: parsed.direction }),
      ...(parsed.bltrafdir === undefined ? {} : { trafficDirection: parsed.bltrafdir }),
      ...(parsed.hours === undefined ? {} : { hours: parsed.hours }),
      ...(parsed.days === undefined ? {} : { days: parsed.days }),
      ...(parsed.lane_type === undefined ? {} : { laneType: parsed.lane_type }),
      ...(parsed.lane_type1 === undefined ? {} : { laneSubtype: parsed.lane_type1 }),
      ...(parsed.lane_width === undefined ? {} : { laneWidth: parsed.lane_width }),
      ...(parsed.open_dates === undefined ? {} : { openDate: parsed.open_dates }),
      ...(parsed.shape_leng === undefined ? {} : { shapeLength: parsed.shape_leng }),
      ...(parsed.the_geom === undefined ? {} : { geometry: parsed.the_geom }),
    } satisfies NormalizedBusLane;
  });
}
