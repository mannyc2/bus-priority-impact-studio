import { defineCommand, z } from "@liche/core";
import { normalizeRouteShapeRows } from "@bp/sources";
import {
  dbOptions,
  localDbFromCtx,
  type OpenLocalPipelineDb,
  withLocalDb,
} from "../../lib/local-db.ts";
import { fromCliPath, fromRepoRoot } from "../../lib/paths.ts";
import { ensureRouteShapeGeomColumn } from "./_spatial-tables.ts";

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

function defaultSnapshotPath(): string {
  return fromRepoRoot("data/raw/network/current_bus_routes.json");
}

export type BuildRouteShapeGeometryIndexInputs = {
  local: OpenLocalPipelineDb;
  snapshotPath?: string | undefined;
};

export type BuildRouteShapeGeometryIndexResult = {
  shapesRead: number;
  inserted: number;
  skipped: number;
};

export async function runBuildRouteShapeGeometryIndex(
  inputs: BuildRouteShapeGeometryIndexInputs,
): Promise<BuildRouteShapeGeometryIndexResult> {
  const snapshotPath = inputs.snapshotPath ?? defaultSnapshotPath();
  const parsed = (await Bun.file(snapshotPath).json()) as { rows?: unknown };
  const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
  const shapes = normalizeRouteShapeRows(rows as never[]);

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

  const { local } = inputs;
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
}

export default defineCommand({
  path: ["build", "route-shape-geometry-index"],
  summary: "Build local_route_shape_geom from the current_bus_routes snapshot.",
  input: {
    options: dbOptions.extend({
      snapshot: z
        .string()
        .optional()
        .describe(`Snapshot path (defaults to data/raw/network/current_bus_routes.json)`),
    }),
  },
  middleware: [withLocalDb({ spatial: true })],
  output: z.object({
    shapesRead: z.number(),
    inserted: z.number(),
    skipped: z.number(),
  }),
  async run({ ctx, input }) {
    const snapshot = input.options.snapshot;
    return runBuildRouteShapeGeometryIndex({
      local: localDbFromCtx(ctx),
      snapshotPath: snapshot === undefined ? undefined : fromCliPath(snapshot),
    });
  },
});
