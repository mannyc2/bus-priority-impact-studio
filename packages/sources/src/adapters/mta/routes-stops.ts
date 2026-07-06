import { RouteIdCodec } from "@bp/domain/primitives";
import * as z from "@bp/domain/schema-compat";
import type { SocrataRow } from "../../core/index.js";
import { schemaVersion } from "../../core/index.js";

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

export type NormalizedRouteShape = z.output<typeof NormalizedRouteShapeSchema>;
export type NormalizedStop = z.output<typeof NormalizedStopSchema>;

const RawRouteShapeRowSchema = z
  .object({
    route_id: z.string().min(1),
    route_short_name: z.string().min(1).optional(),
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
    route_short_name: z.string().min(1).optional(),
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

export function normalizeRouteShapeRows(rows: SocrataRow[]): NormalizedRouteShape[] {
  return rows.map((row) => {
    const parsed = RawRouteShapeRowSchema.parse(row);
    return {
      schemaVersion,
      routeId: RouteIdCodec.parse(parsed.route_id),
      routeShortName: parsed.route_short_name ?? parsed.route_id,
      inEffect: parseBoolean(parsed.in_effect),
      directionId: parsed.direction_id,
      direction: parsed.direction,
      shapeId: parsed.shape_id,
      ...(parsed.route_long_name === undefined ? {} : { routeLongName: parsed.route_long_name }),
      ...(parsed.route_type === undefined ? {} : { routeType: parsed.route_type }),
      ...(parsed.trip_type === undefined ? {} : { tripType: parsed.trip_type }),
      ...(parsed.bundle === undefined ? {} : { bundle: parsed.bundle }),
      ...(parsed.shape_length === undefined ? {} : { shapeLength: parsed.shape_length }),
      ...(parsed.geometry === undefined ? {} : { geometry: parsed.geometry }),
    } satisfies NormalizedRouteShape;
  });
}

export function normalizeStopRows(rows: SocrataRow[]): NormalizedStop[] {
  return rows.map((row) => {
    const parsed = RawStopRowSchema.parse(row);
    return {
      schemaVersion,
      routeId: RouteIdCodec.parse(parsed.route_id),
      routeShortName: parsed.route_short_name ?? parsed.route_id,
      stopId: parsed.stop_id,
      stopName: parsed.stop_name,
      inEffect: parseBoolean(parsed.in_effect),
      directionId: parsed.direction_id,
      direction: parsed.direction,
      timepoint: parseBoolean(parsed.timepoint),
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      ...(parsed.georeference === undefined ? {} : { georeference: parsed.georeference }),
    } satisfies NormalizedStop;
  });
}
