import { RouteIdCodec } from "@bp/domain/primitives";
import * as z from "@bp/domain/schema-compat";
import type { SocrataRow } from "../../core/index.js";
import { schemaVersion } from "../../core/index.js";

export const NormalizedBusWaitAssessmentSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    routeId: z.string().min(1),
    borough: z.string().min(1),
    dayType: z.number().int(),
    tripType: z.string().min(1),
    period: z.string().min(1),
    tripsPassingWait: z.number().int().nonnegative(),
    scheduledTrips: z.number().int().nonnegative(),
    waitAssessment: z.number().nullable(),
  })
  .strict();

export type NormalizedBusWaitAssessment = z.output<typeof NormalizedBusWaitAssessmentSchema>;

const RawBusWaitAssessmentRowSchema = z
  .object({
    month: z.string().min(1),
    borough: z.string().min(1),
    day_type: z.coerce.number().int(),
    trip_type: z.string().min(1),
    route_id: z.string().min(1),
    period: z.string().min(1),
    number_of_trips_passing_wait: z.coerce.number().int().nonnegative(),
    number_of_scheduled_trips: z.coerce.number().int().nonnegative(),
    wait_assessment: z
      .union([z.null(), z.coerce.number()])
      .optional()
      .transform((value) => (value === undefined ? null : value)),
  })
  .passthrough();

function toIsoMonth(value: string): string {
  // Socrata calendar_date arrives as "2026-03-01T00:00:00.000" or "2026-03-01T00:00:00".
  const match = value.match(/^(\d{4})-(\d{2})/);
  if (!match) {
    throw new Error(`Unrecognized month value from Socrata: ${value}`);
  }
  return `${match[1]}-${match[2]}`;
}

export function normalizeBusWaitAssessmentRows(rows: SocrataRow[]): NormalizedBusWaitAssessment[] {
  return rows
    .map((row) => {
      const parsed = RawBusWaitAssessmentRowSchema.parse(row);
      return {
        schemaVersion,
        month: toIsoMonth(parsed.month),
        routeId: RouteIdCodec.parse(parsed.route_id),
        borough: parsed.borough,
        dayType: parsed.day_type,
        tripType: parsed.trip_type,
        period: parsed.period,
        tripsPassingWait: parsed.number_of_trips_passing_wait,
        scheduledTrips: parsed.number_of_scheduled_trips,
        waitAssessment: parsed.wait_assessment ?? null,
      } satisfies NormalizedBusWaitAssessment;
    })
    .sort((a, b) => {
      const m = a.month.localeCompare(b.month);
      if (m !== 0) return m;
      const r = a.routeId.localeCompare(b.routeId);
      if (r !== 0) return r;
      const d = a.dayType - b.dayType;
      if (d !== 0) return d;
      const t = a.tripType.localeCompare(b.tripType);
      if (t !== 0) return t;
      return a.period.localeCompare(b.period);
    });
}
