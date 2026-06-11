import * as z from "zod";
import type { SocrataRow } from "../../clients/socrata/index.js";

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
    const output: NormalizedBusLane = {
      schemaVersion,
      segmentId: parsed.segmentid,
      street: parsed.street,
      borough: parsed.boro,
      facility: parsed.facility,
    };

    if (parsed.direction !== undefined) {
      output.direction = parsed.direction;
    }
    if (parsed.bltrafdir !== undefined) {
      output.trafficDirection = parsed.bltrafdir;
    }
    if (parsed.hours !== undefined) {
      output.hours = parsed.hours;
    }
    if (parsed.days !== undefined) {
      output.days = parsed.days;
    }
    if (parsed.lane_type !== undefined) {
      output.laneType = parsed.lane_type;
    }
    if (parsed.lane_type1 !== undefined) {
      output.laneSubtype = parsed.lane_type1;
    }
    if (parsed.lane_width !== undefined) {
      output.laneWidth = parsed.lane_width;
    }
    if (parsed.open_dates !== undefined) {
      output.openDate = parsed.open_dates;
    }
    if (parsed.shape_leng !== undefined) {
      output.shapeLength = parsed.shape_leng;
    }
    if (parsed.the_geom !== undefined) {
      output.geometry = parsed.the_geom;
    }

    return output;
  });
}
