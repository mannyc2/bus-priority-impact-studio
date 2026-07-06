import * as z from "@bp/domain/schema-compat";
import type { SocrataRow } from "../../core/index.js";
import { schemaVersion } from "../../core/index.js";

export const NormalizedDotTrafficSpeedSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    linkId: z.string().min(1),
    sampledAt: z.iso.datetime(),
    speed: z.number().nullable(),
    travelTime: z.number().nullable(),
    statusCode: z.string().min(1),
    owner: z.string().nullable(),
    borough: z.string().nullable(),
    linkName: z.string().nullable(),
    linkPoints: z.string().nullable(),
    transcomId: z.string().nullable(),
  })
  .strict();

export type NormalizedDotTrafficSpeed = z.output<typeof NormalizedDotTrafficSpeedSchema>;

const RawDotTrafficSpeedRowSchema = z
  .object({
    link_id: z.string().min(1),
    data_as_of: z.string().min(1),
    speed: z.coerce.number().optional(),
    travel_time: z.coerce.number().optional(),
    status: z.string().optional(),
    owner: z.string().optional(),
    borough: z.string().optional(),
    link_name: z.string().optional(),
    link_points: z.string().optional(),
    transcom_id: z.string().optional(),
  })
  .passthrough();

function toIsoDatetime(value: string): string {
  // Socrata calendar_date arrives as "2026-05-18T21:29:07.000". Some endpoints
  // omit the milliseconds. Normalize to a full ISO Z-suffixed timestamp.
  if (/Z$/.test(value)) return value;
  const trimmed = value.endsWith(".000") ? value.slice(0, -4) : value;
  return `${trimmed}Z`;
}

export function normalizeDotTrafficSpeedRows(rows: SocrataRow[]): NormalizedDotTrafficSpeed[] {
  return rows
    .map((row) => {
      const parsed = RawDotTrafficSpeedRowSchema.parse(row);
      return {
        schemaVersion,
        linkId: parsed.link_id,
        sampledAt: toIsoDatetime(parsed.data_as_of),
        speed:
          parsed.speed === undefined ? null : Number.isFinite(parsed.speed) ? parsed.speed : null,
        travelTime:
          parsed.travel_time === undefined
            ? null
            : Number.isFinite(parsed.travel_time)
              ? parsed.travel_time
              : null,
        statusCode: parsed.status ?? "",
        owner: parsed.owner ?? null,
        borough: parsed.borough ?? null,
        linkName: parsed.link_name ?? null,
        linkPoints: parsed.link_points ?? null,
        transcomId: parsed.transcom_id ?? null,
      } satisfies NormalizedDotTrafficSpeed;
    })
    .sort((a, b) => a.linkId.localeCompare(b.linkId));
}
