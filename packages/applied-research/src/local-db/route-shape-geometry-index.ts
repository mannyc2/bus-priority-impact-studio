import type { Database } from "bun:sqlite";
import { ensureRouteShapeGeomColumn } from "./spatial-tables";

type Coordinate = [number, number];

export type RouteShapeGeometryIndexShape = {
  routeId: string;
  shapeId: string;
  directionId: string;
  routeShortName: string;
  geometry?: unknown;
};

export type BuildRouteShapeGeometryIndexLocalDb = {
  sqlite: Database;
};

export type BuildRouteShapeGeometryIndexResult = {
  shapesRead: number;
  inserted: number;
  skipped: number;
};

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

export function extractRouteShapeLineStrings(geometry: unknown): Coordinate[][] {
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

export function buildRouteShapeMultiLineString(lines: readonly Coordinate[][]): string {
  return JSON.stringify({
    type: "MultiLineString",
    coordinates: lines.filter((line) => line.length > 1),
  });
}

export function runBuildRouteShapeGeometryIndexFromShapes(input: {
  local: BuildRouteShapeGeometryIndexLocalDb;
  shapes: readonly RouteShapeGeometryIndexShape[];
  builtAt?: string | undefined;
}): BuildRouteShapeGeometryIndexResult {
  type Grouped = {
    routeId: string;
    shapeId: string;
    directionId: number | null;
    routeShortName: string;
    lines: Coordinate[][];
  };

  const groups = new Map<string, Grouped>();
  for (const shape of input.shapes) {
    const lines = extractRouteShapeLineStrings(shape.geometry);
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

  ensureRouteShapeGeomColumn(input.local.sqlite);
  const builtAt = input.builtAt ?? new Date().toISOString();
  const insert = input.local.sqlite.prepare(
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
    const geojson = buildRouteShapeMultiLineString(group.lines);
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

  return { shapesRead: input.shapes.length, inserted, skipped };
}
