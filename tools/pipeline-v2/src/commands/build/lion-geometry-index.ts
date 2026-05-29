import { arg, defineCommand, z } from "@liche/core";
import {
  dbOptions,
  localDbFromCtx,
  type OpenLocalPipelineDb,
  withLocalDb,
} from "../../lib/local-db.ts";
import { ensureLionSegmentGeomColumn } from "./_spatial-tables.ts";

function unwrapGeoJsonGeometry(raw: string): string {
  if (!raw.includes('"Feature')) return raw;
  try {
    const parsed = JSON.parse(raw) as {
      type?: string;
      geometry?: unknown;
      features?: unknown[];
    };
    if (parsed.type === "Feature" && parsed.geometry) {
      return JSON.stringify(parsed.geometry);
    }
    if (
      parsed.type === "FeatureCollection" &&
      Array.isArray(parsed.features) &&
      parsed.features[0]
    ) {
      const first = parsed.features[0] as { geometry?: unknown };
      if (first.geometry) return JSON.stringify(first.geometry);
    }
  } catch {
    // Fall through.
  }
  return raw;
}

export type BuildLionGeometryIndexInputs = {
  local: OpenLocalPipelineDb;
  limit?: number | undefined;
};

export type BuildLionGeometryIndexResult = {
  inserted: number;
  skipped: number;
  total: number;
};

export function runBuildLionGeometryIndex(
  inputs: BuildLionGeometryIndexInputs,
): BuildLionGeometryIndexResult {
  const { local } = inputs;
  ensureLionSegmentGeomColumn(local.sqlite);
  const builtAt = new Date().toISOString();

  const totalRow = local.sqlite
    .query<{ n: number }, []>(
      "SELECT count(*) AS n FROM local_lion_segment WHERE wkt_geom IS NOT NULL",
    )
    .get();
  const total = totalRow?.n ?? 0;

  const limitClause = inputs.limit ? `LIMIT ${Math.max(0, Math.floor(inputs.limit))}` : "";
  const rows = local.sqlite
    .query<{ physical_id: string; wkt_geom: string }, []>(
      `SELECT s.physical_id, s.wkt_geom
         FROM local_lion_segment s
         LEFT JOIN local_lion_segment_geom g ON g.physical_id = s.physical_id
        WHERE s.wkt_geom IS NOT NULL AND g.physical_id IS NULL
        ${limitClause}`,
    )
    .all();

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
}

export default defineCommand({
  path: ["build", "lion-geometry-index"],
  summary: "Materialize LION centerline geometries into a spatialite-indexed table.",
  input: {
    options: dbOptions.extend({
      limit: arg.positiveInt().optional().describe("Cap rows scanned per run"),
    }),
  },
  middleware: [withLocalDb({ spatial: true })],
  output: z.object({
    inserted: z.number(),
    skipped: z.number(),
    total: z.number(),
  }),
  async run({ ctx, input }) {
    return runBuildLionGeometryIndex({
      local: localDbFromCtx(ctx),
      limit: input.options.limit,
    });
  },
});
