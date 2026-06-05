import { RouteIdCodec } from "@bp/domain";
import * as z from "zod";
import type { SocrataRow } from "../../clients/socrata/index.js";
import { schemaVersion } from "../../core/index.js";

export const NormalizedBusCustomerJourneyMetricSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    routeId: z.string().min(1),
    borough: z.string().min(1),
    tripType: z.string().min(1),
    period: z.string().min(1),
    customers: z.number().nonnegative(),
    additionalBusStopTimeMinutes: z.number().nullable(),
    additionalTravelTimeMinutes: z.number().nullable(),
    customerJourneyTimeMinutes: z.number().nullable(),
  })
  .strict();

export type NormalizedBusCustomerJourneyMetric = z.output<
  typeof NormalizedBusCustomerJourneyMetricSchema
>;

const NullableNumberSchema = z
  .union([z.null(), z.undefined(), z.literal(""), z.coerce.number()])
  .transform((value) => (value === null || value === undefined || value === "" ? null : value));

const RawBusCustomerJourneyMetricRowSchema = z
  .object({
    month: z.string().min(1),
    borough: z.string().min(1),
    trip_type: z.string().min(1),
    route_id: z.string().min(1),
    period: z.string().min(1),
    number_of_customers: z.coerce.number().nonnegative(),
    additional_bus_stop_time: NullableNumberSchema,
    additional_travel_time: NullableNumberSchema,
    customer_journey_time: NullableNumberSchema,
  })
  .passthrough();

function toIsoMonth(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})/);
  if (!match) {
    throw new Error(`Unrecognized month value from Socrata: ${value}`);
  }
  return `${match[1]}-${match[2]}`;
}

export function normalizeBusCustomerJourneyMetricRows(
  rows: SocrataRow[],
): NormalizedBusCustomerJourneyMetric[] {
  return rows
    .flatMap((row): NormalizedBusCustomerJourneyMetric[] => {
      const parsed = RawBusCustomerJourneyMetricRowSchema.parse(row);
      if (parsed.route_id.trim().toUpperCase() === "ALL") return [];
      return [
        {
          schemaVersion,
          month: toIsoMonth(parsed.month),
          routeId: z.decode(RouteIdCodec, parsed.route_id),
          borough: parsed.borough,
          tripType: parsed.trip_type,
          period: parsed.period,
          customers: parsed.number_of_customers,
          additionalBusStopTimeMinutes: parsed.additional_bus_stop_time,
          additionalTravelTimeMinutes: parsed.additional_travel_time,
          customerJourneyTimeMinutes: parsed.customer_journey_time,
        },
      ];
    })
    .sort((a, b) => {
      const m = a.month.localeCompare(b.month);
      if (m !== 0) return m;
      const r = a.routeId.localeCompare(b.routeId);
      if (r !== 0) return r;
      const t = a.tripType.localeCompare(b.tripType);
      if (t !== 0) return t;
      return a.period.localeCompare(b.period);
    });
}
