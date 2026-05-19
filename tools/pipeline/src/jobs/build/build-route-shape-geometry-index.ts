import { normalizeRouteShapeRows } from "@bp/sources";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { ensureRouteShapeGeomColumn } from "../../lib/spatial-tables.js";
import { fromRepoRoot } from "../../source-manifest.js";

type Args = { dbPath?: string; snapshotPath?: string };

type Result = {
  shapesRead: number;
  inserted: number;
  skipped: number;
};

function parseCliArgs(args: string[]): Args {
  const out: Args = {};
  const dbi = args.indexOf("--db-path");
  const dbPath = dbi !== -1 ? args[dbi + 1] : undefined;
  if (dbPath !== undefined) out.dbPath = dbPath;
  const si = args.indexOf("--snapshot");
  const snap = si !== -1 ? args[si + 1] : undefined;
  if (snap !== undefined) out.snapshotPath = snap;
  return out;
}

function defaultSnapshotPath(): string {
  return fromRepoRoot("data/raw/network/current_bus_routes.json");
}

type Coordinate = [number, number];

function isCoordinatePair(value: unknown): value is Coordinate {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0] as number) &&
    Number.isFinite(value[1] as number)
  );
}

/**
 * Coerce the raw geometry blob attached to a normalized route shape into a
 * list of LineString coordinate arrays. The source publishes either a
 * MultiLineString or a single LineString GeoJSON; we accept both.
 */
function extractLineStrings(geometry: unknown): Coordinate[][] {
  if (geometry == null) return [];
  let candidate: { type?: unknown; coordinates?: unknown } | null = null;

  if (typeof geometry === "string") {
    try {
      candidate = JSON.parse(geometry) as { type?: unknown; coordinates?: unknown };
    } catch {
      return [];
    }
  } else if (typeof geometry === "object") {
    candidate = geometry as { type?: unknown; coordinates?: unknown };
  }
  if (!candidate || typeof candidate.type !== "string") return [];

  if (candidate.type === "LineString" && Array.isArray(candidate.coordinates)) {
    return [candidate.coordinates.filter(isCoordinatePair)];
  }
  if (candidate.type === "MultiLineString" && Array.isArray(candidate.coordinates)) {
    return candidate.coordinates
      .filter((line): line is unknown[] => Array.isArray(line))
      .map((line) => line.filter(isCoordinatePair));
  }
  return [];
}

function buildMultiLineString(lines: Coordinate[][]): string {
  return JSON.stringify({
    type: "MultiLineString",
    coordinates: lines.filter((line) => line.length > 1),
  });
}

export async function buildRouteShapeGeometryIndex(args: Args = {}): Promise<Result> {
  const snapshotPath = args.snapshotPath ?? defaultSnapshotPath();
  const parsed = (await Bun.file(snapshotPath).json()) as { rows?: unknown };
  const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
  const shapes = normalizeRouteShapeRows(rows as never[]);

  // Group all LineString fragments per (routeId, shapeId) into a single
  // MultiLineString so each shape is represented by one geometry row.
  type Grouped = {
    routeId: string;
    shapeId: string;
    directionId: number | null;
    routeShortName: string;
    lines: Coordinate[][];
  };
  const groups = new Map<string, Grouped>();
  for (const shape of shapes) {
    const lines = extractLineStrings(shape.geometry);
    if (lines.length === 0) continue;
    // Tab delimiter: keys remain unambiguous even if a future id contains a space.
    const key = `${shape.routeId}\t${shape.shapeId}`;
    const prev = groups.get(key);
    if (prev) {
      prev.lines.push(...lines);
    } else {
      const dir = Number.parseInt(shape.directionId, 10);
      groups.set(key, {
        routeId: shape.routeId,
        shapeId: shape.shapeId,
        directionId: Number.isFinite(dir) ? dir : null,
        routeShortName: shape.routeShortName,
        lines,
      });
    }
  }

  return withLocalPipelineDb(
    args.dbPath,
    (local) => {
      ensureRouteShapeGeomColumn(local.sqlite);
      const builtAt = new Date().toISOString();

      const insert = local.sqlite.prepare(
        `INSERT INTO local_route_shape_geom (route_id, shape_id, direction_id, route_short_name, built_at, geom)
         VALUES (?, ?, ?, ?, ?, SetSRID(GeomFromGeoJSON(?), 4326))
         ON CONFLICT(route_id, shape_id) DO UPDATE SET
           direction_id = excluded.direction_id,
           route_short_name = excluded.route_short_name,
           built_at = excluded.built_at,
           geom = excluded.geom`,
      );

      let inserted = 0;
      let skipped = 0;
      for (const group of groups.values()) {
        const geojson = buildMultiLineString(group.lines);
        try {
          insert.run(
            group.routeId,
            group.shapeId,
            group.directionId,
            group.routeShortName,
            builtAt,
            geojson,
          );
          inserted += 1;
        } catch {
          skipped += 1;
        }
      }

      return { shapesRead: shapes.length, inserted, skipped };
    },
    { spatial: true },
  );
}

export async function buildRouteShapeGeometryIndexFromCli(args: string[]): Promise<Result> {
  const result = await buildRouteShapeGeometryIndex(parseCliArgs(args));
  console.log(
    `Route shape geometry index: shapesRead=${result.shapesRead} inserted=${result.inserted} skipped=${result.skipped}`,
  );
  return result;
}
