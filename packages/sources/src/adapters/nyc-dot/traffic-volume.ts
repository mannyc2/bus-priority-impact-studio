import * as z from "@bp/domain/schema-compat";
import type { SocrataRow } from "../../core/index.js";
import { schemaVersion } from "../../core/index.js";

export const NormalizedDotTrafficVolumeSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    requestId: z.number().int(),
    segmentId: z.number().int(),
    sampledAt: z.iso.datetime(),
    borough: z.string().nullable(),
    street: z.string().nullable(),
    fromStreet: z.string().nullable(),
    toStreet: z.string().nullable(),
    direction: z.string().nullable(),
    volume: z.number().int().nonnegative(),
    wktGeom: z.string().nullable(),
  })
  .strict();

export type NormalizedDotTrafficVolume = z.output<typeof NormalizedDotTrafficVolumeSchema>;

const RawVolumeRowSchema = z
  .object({
    requestid: z.coerce.number().int(),
    boro: z.string().optional(),
    yr: z.coerce.number().int(),
    m: z.coerce.number().int(),
    d: z.coerce.number().int(),
    hh: z.coerce.number().int(),
    mm: z.coerce.number().int(),
    vol: z.coerce.number().int().nonnegative(),
    segmentid: z.coerce.number().int(),
    wktgeom: z.string().optional(),
    street: z.string().optional(),
    fromst: z.string().optional(),
    tost: z.string().optional(),
    direction: z.string().optional(),
  })
  .passthrough();

function pad(n: number, width = 2): string {
  return n.toString().padStart(width, "0");
}

export function normalizeDotTrafficVolumeRows(rows: SocrataRow[]): NormalizedDotTrafficVolume[] {
  return rows
    .map((row) => {
      const parsed = RawVolumeRowSchema.parse(row);
      const sampledAt = `${parsed.yr}-${pad(parsed.m)}-${pad(parsed.d)}T${pad(parsed.hh)}:${pad(parsed.mm)}:00Z`;
      return {
        schemaVersion,
        requestId: parsed.requestid,
        segmentId: parsed.segmentid,
        sampledAt,
        borough: parsed.boro ?? null,
        street: parsed.street ?? null,
        fromStreet: parsed.fromst ?? null,
        toStreet: parsed.tost ?? null,
        direction: parsed.direction ?? null,
        volume: parsed.vol,
        wktGeom: parsed.wktgeom ?? null,
      } satisfies NormalizedDotTrafficVolume;
    })
    .sort((a, b) => {
      if (a.segmentId !== b.segmentId) return a.segmentId - b.segmentId;
      return a.sampledAt.localeCompare(b.sampledAt);
    });
}
