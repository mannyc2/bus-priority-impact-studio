import * as z from "zod";
import type { SocrataRow } from "../socrata/client.js";
import { schemaVersion } from "../mta/parse-helpers.js";

// NYC Centerline / LION (inkn-q76z) — stable street-segment ID + geometry +
// metadata used by other context sources for street joins.

export const NormalizedLionSegmentSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    physicalId: z.string().min(1),
    streetName: z.string().nullable(),
    borough: z.string().nullable(),
    l_zip: z.string().nullable(),
    r_zip: z.string().nullable(),
    rwTypeCode: z.string().nullable(),
    rwTypeDesc: z.string().nullable(),
    trafficDir: z.string().nullable(),
    shapeLength: z.number().nullable(),
    wktGeom: z.string().nullable(),
  })
  .strict();

export type NormalizedLionSegment = z.output<typeof NormalizedLionSegmentSchema>;

const strN = z.union([z.null(), z.undefined(), z.string()]).transform((v) => (v === undefined ? null : v));
const numN = z.union([z.null(), z.undefined(), z.coerce.number()]).transform((v) =>
  v === undefined ? null : v,
);

const RawCenterlineRowSchema = z
  .object({
    physicalid: z.coerce.string(),
    full_street_name: strN,
    street_name: strN,
    borough_indicator: strN,
    l_zip: strN,
    r_zip: strN,
    rw_type: strN.optional(),
    trafdir: strN,
    segmentlength: numN,
    the_geom: z.union([z.string(), z.record(z.string(), z.unknown()), z.undefined(), z.null()])
      .transform((value) => {
        if (value === undefined || value === null) return null;
        if (typeof value === "string") return value;
        // MultiLineString GeoJSON — store the JSON representation as the
        // canonical "wkt"-style serialized geometry. Worker-side detector
        // jobs can re-parse if needed.
        return JSON.stringify(value);
      }),
  })
  .passthrough();

export function normalizeLionSegmentRows(rows: SocrataRow[]): NormalizedLionSegment[] {
  return rows
    .map((row) => {
      const p = RawCenterlineRowSchema.parse(row);
      const streetName = p.full_street_name ?? p.street_name;
      return {
        schemaVersion,
        physicalId: p.physicalid,
        streetName,
        borough: p.borough_indicator,
        l_zip: p.l_zip,
        r_zip: p.r_zip,
        rwTypeCode: p.rw_type === undefined ? null : p.rw_type,
        rwTypeDesc: null,
        trafficDir: p.trafdir,
        shapeLength: p.segmentlength,
        wktGeom: p.the_geom,
      } satisfies NormalizedLionSegment;
    })
    .sort((a, b) => a.physicalId.localeCompare(b.physicalId));
}
