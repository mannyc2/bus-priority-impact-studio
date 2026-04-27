import { RouteIdCodec } from "@bp/domain";
import * as z from "zod";
import type { SocrataRow } from "../socrata/client.js";
import { IsoMonthStringSchema, isoMonth, schemaVersion } from "./parse-helpers.js";

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

export type NormalizedHourlyRidership = z.output<typeof NormalizedHourlyRidershipSchema>;

const RawHourlyRidershipRowSchema = z
  .object({
    day_of_week_index: z.coerce.number().int().min(0).max(6),
    hour_of_day: z.coerce.number().int().min(0).max(23),
    ridership: z.coerce.number().nonnegative(),
    transfers: z.coerce.number().nonnegative(),
  })
  .passthrough();

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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
