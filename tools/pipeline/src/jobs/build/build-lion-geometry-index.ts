import { withLocalPipelineDb } from "../../lib/local-db.js";
import { ensureLionSegmentGeomColumn } from "../../lib/spatial-tables.js";

/**
 * If the row is a GeoJSON Feature or FeatureCollection, unwrap to its
 * `.geometry`. `GeomFromGeoJSON` only accepts geometry-type objects.
 */
function unwrapGeoJsonGeometry(raw: string): string {
  // Cheap parse: most rows are bare geometries and skipping a JSON.parse on
  // them keeps the hot path tight. We only parse when the type marker appears.
  if (!raw.includes('"Feature')) return raw;
  try {
    const parsed = JSON.parse(raw) as { type?: string; geometry?: unknown; features?: unknown[] };
    if (parsed.type === "Feature" && parsed.geometry) {
      return JSON.stringify(parsed.geometry);
    }
    if (parsed.type === "FeatureCollection" && Array.isArray(parsed.features) && parsed.features[0]) {
      const first = parsed.features[0] as { geometry?: unknown };
      if (first.geometry) return JSON.stringify(first.geometry);
    }
  } catch {
    // Fall through to raw; GeomFromGeoJSON will surface the precise error.
  }
  return raw;
}

type Args = { dbPath?: string; limit?: number };

type Result = {
  inserted: number;
  skipped: number;
  total: number;
};

function parseCliArgs(args: string[]): Args {
  const out: Args = {};
  const dbi = args.indexOf("--db-path");
  const dbPath = dbi !== -1 ? args[dbi + 1] : undefined;
  if (dbPath !== undefined) out.dbPath = dbPath;
  const li = args.indexOf("--limit");
  if (li !== -1) {
    const n = Number(args[li + 1]);
    if (Number.isFinite(n)) out.limit = n;
  }
  return out;
}

/**
 * Convert local_lion_segment.wkt_geom (WKT or JSON MultiLineString) into a
 * real spatialite geometry stored in local_lion_segment_geom.geom. Skips
 * rows that already have a geom row.
 */
export async function buildLionGeometryIndex(args: Args = {}): Promise<Result> {
  return withLocalPipelineDb(
    args.dbPath,
    (local) => {
      ensureLionSegmentGeomColumn(local.sqlite);
      const builtAt = new Date().toISOString();

      const totalRow = local.sqlite
        .query<{ n: number }, []>(
          "SELECT count(*) AS n FROM local_lion_segment WHERE wkt_geom IS NOT NULL",
        )
        .get();
      const total = totalRow?.n ?? 0;

      const limitClause = args.limit ? `LIMIT ${Math.max(0, Math.floor(args.limit))}` : "";
      const rows = local.sqlite
        .query<{ physical_id: string; wkt_geom: string }, []>(
          `SELECT s.physical_id, s.wkt_geom
             FROM local_lion_segment s
             LEFT JOIN local_lion_segment_geom g ON g.physical_id = s.physical_id
            WHERE s.wkt_geom IS NOT NULL AND g.physical_id IS NULL
            ${limitClause}`,
        )
        .all();

      // We re-parse per row because the column can be either WKT or a JSON
      // MultiLineString (see packages/sources/src/nyc-public-data/centerline.ts).
      const insertWkt = local.sqlite.prepare(
        `INSERT INTO local_lion_segment_geom (physical_id, built_at, geom)
         VALUES (?, ?, GeomFromText(?, 4326))
         ON CONFLICT(physical_id) DO NOTHING`,
      );
      const insertGeoJson = local.sqlite.prepare(
        `INSERT INTO local_lion_segment_geom (physical_id, built_at, geom)
         VALUES (?, ?, SetSRID(GeomFromGeoJSON(?), 4326))
         ON CONFLICT(physical_id) DO NOTHING`,
      );

      let inserted = 0;
      let skipped = 0;
      const skipExamples: string[] = [];
      for (const row of rows) {
        // Strip BOM and trim. The same column ships either WKT or JSON, so
        // we sniff on the first non-whitespace character rather than a naive
        // startsWith("{").
        const raw = row.wkt_geom.replace(/^﻿/, "").trim();
        if (raw.length === 0) {
          skipped += 1;
          if (skipExamples.length < 5) skipExamples.push(`${row.physical_id}: empty geom`);
          continue;
        }
        const first = raw[0];
        try {
          if (first === "{") {
            insertGeoJson.run(row.physical_id, builtAt, unwrapGeoJsonGeometry(raw));
          } else if (first === "[") {
            // Bare coordinate array; treat as opaque and let GeomFromGeoJSON
            // reject — captured in the catch with a precise message.
            insertGeoJson.run(row.physical_id, builtAt, raw);
          } else {
            insertWkt.run(row.physical_id, builtAt, raw);
          }
          inserted += 1;
        } catch (err) {
          skipped += 1;
          if (skipExamples.length < 5)
            skipExamples.push(`${row.physical_id}: ${(err as Error).message}`);
        }
      }
      // Always surface skip context — a non-zero skip count went unnoticed
      // historically because the prior log only fired conditionally.
      if (skipped > 0) {
        console.error(
          `lion-geometry-index: ${skipped} rows skipped. First examples: ${skipExamples.join(" | ")}`,
        );
        const skipRate = total > 0 ? skipped / total : 0;
        if (skipRate > 0.001) {
          throw new Error(
            `lion-geometry-index skip rate ${(skipRate * 100).toFixed(3)}% exceeds 0.1% threshold; refusing to claim success`,
          );
        }
      }

      return { inserted, skipped, total };
    },
    { spatial: true },
  );
}

export async function buildLionGeometryIndexFromCli(args: string[]): Promise<Result> {
  const result = await buildLionGeometryIndex(parseCliArgs(args));
  console.log(
    `LION geometry index: inserted=${result.inserted} skipped=${result.skipped} total_with_wkt=${result.total}`,
  );
  return result;
}
