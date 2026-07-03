import { RouteIdCodec } from "@bp/domain/primitives";
import * as z from "zod";
import type { SocrataRow } from "../../core/index.js";
import { schemaVersion } from "../../core/index.js";

const ExpressBusDayTypeSchema = z.enum(["Weekday", "Weekend"]);
const ExpressBusDirectionSchema = z.enum(["NB", "SB", "EB", "WB"]);

export const NormalizedExpressBusCapacitySchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dayType: ExpressBusDayTypeSchema,
    borough: z.string().min(1),
    routeId: z.string().min(1),
    direction: ExpressBusDirectionSchema,
    hourOfDay: z.number().int().min(0).max(23),
    loadPercentage: z.number().min(0).max(1),
    tripsWithApc: z.number().int().nonnegative(),
  })
  .strict();

export type NormalizedExpressBusCapacity = z.output<typeof NormalizedExpressBusCapacitySchema>;

const RawExpressBusCapacityRowSchema = z
  .object({
    week: z.string().min(1),
    day_type: ExpressBusDayTypeSchema,
    borough: z.string().min(1),
    route: z.string().min(1),
    direction: ExpressBusDirectionSchema,
    hour: z.coerce.number().int().min(0).max(23),
    load_percentage: z.coerce.number().min(0).max(1),
    trips_with_apc: z.coerce.number().int().nonnegative(),
  })
  .passthrough();

function weekStartDate(value: string): string {
  const [date] = value.split("T");
  if (date === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid express bus capacity week value: ${value}`);
  }

  return date;
}

export function normalizeExpressBusCapacityRows(
  rows: SocrataRow[],
): NormalizedExpressBusCapacity[] {
  return rows.map((row) => {
    const parsed = RawExpressBusCapacityRowSchema.parse(row);

    return {
      schemaVersion,
      weekStartDate: weekStartDate(parsed.week),
      dayType: parsed.day_type,
      borough: parsed.borough,
      routeId: z.decode(RouteIdCodec, parsed.route),
      direction: parsed.direction,
      hourOfDay: parsed.hour,
      loadPercentage: parsed.load_percentage,
      tripsWithApc: parsed.trips_with_apc,
    };
  });
}
