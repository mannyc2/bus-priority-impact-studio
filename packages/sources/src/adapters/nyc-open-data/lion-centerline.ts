import * as z from "zod";
import type { SocrataRow } from "../../core/index.js";
import { schemaVersion } from "../../core/index.js";

// NYC Centerline / LION (inkn-q76z) — stable street-segment ID + geometry +
// metadata used by other context sources for street joins.

export const NormalizedLionSegmentSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    physicalId: z.string().min(1),
    streetCodeMaster: z.string().nullable(),
    streetName: z.string().nullable(),
    borough: z.string().nullable(),
    boroughCode: z.string().nullable(),
    leftLowHouseNumber: z.string().nullable(),
    leftHighHouseNumber: z.string().nullable(),
    rightLowHouseNumber: z.string().nullable(),
    rightHighHouseNumber: z.string().nullable(),
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

const strN = z
  .union([z.null(), z.string()])
  .optional()
  .transform((v) => (v === undefined ? null : v));
const numN = z
  .union([z.null(), z.coerce.number()])
  .optional()
  .transform((v) => (v === undefined ? null : v));

const RawCenterlineRowSchema = z
  .object({
    physicalid: z.coerce.string(),
    b5sc: strN,
    full_street_name: strN,
    street_name: strN,
    borough_indicator: strN,
    boroughcode: strN,
    l_low_hn: strN,
    l_high_hn: strN,
    r_low_hn: strN,
    r_high_hn: strN,
    l_zip: strN,
    r_zip: strN,
    rw_type: strN.optional(),
    trafdir: strN,
    segmentlength: numN,
    the_geom: z
      .union([z.string(), z.record(z.string(), z.unknown()), z.null()])
      .optional()
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
      const borough = p.borough_indicator ?? p.boroughcode;
      return {
        schemaVersion,
        physicalId: p.physicalid,
        streetCodeMaster: p.b5sc,
        streetName,
        borough,
        boroughCode: p.boroughcode,
        leftLowHouseNumber: p.l_low_hn,
        leftHighHouseNumber: p.l_high_hn,
        rightLowHouseNumber: p.r_low_hn,
        rightHighHouseNumber: p.r_high_hn,
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
