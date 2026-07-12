import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type MapBorough, MapContextFeatureCollectionSchema } from "@bp/domain/maps";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { Effect } from "effect";
import { defaultArtifactRootPath, fromCliPath, fromRepoRoot } from "../../lib/paths.ts";
import { decodeSchemaStrict } from "../../lib/schema-decode.ts";

/**
 * Build the map context artifact: simplified NYC borough shoreline polygons
 * used by the route-detail geographic map as its land/water background. Reads
 * the captured NYC Open Data borough-boundary bulk CSV (WKT MULTIPOLYGON per
 * borough) and emits a small GeoJSON FeatureCollection.
 */

const DEFAULT_SOURCE = "data/raw/socrata-bulk/nyc_borough_boundaries/rows.csv";
const ARTIFACT_KEY = join("map", "context", "nyc-boroughs.min.geojson");

type Point = readonly [number, number];

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const header = rows[0] ?? [];
  return rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    header.forEach((name, index) => {
      record[name] = cells[index] ?? "";
    });
    return record;
  });
}

function parseMultiPolygonWkt(wkt: string): Point[][][] {
  const body = wkt.trim().replace(/^MULTIPOLYGON\s*/i, "");
  const inner = body.replace(/^\(/, "").replace(/\)$/, "");
  return inner.split(/\)\)\s*,\s*\(\(/).map((polygonText) =>
    polygonText
      .replace(/^\(+/, "")
      .replace(/\)+$/, "")
      .split(/\)\s*,\s*\(/)
      .map((ringText) =>
        ringText
          .split(",")
          .map((pair) => pair.trim().split(/\s+/).map(Number))
          .filter((xy) => xy.length === 2 && xy.every(Number.isFinite))
          .map((xy) => [xy[0] as number, xy[1] as number] as const),
      )
      .filter((ring) => ring.length >= 4),
  );
}

function ringArea(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i] as Point;
    const [x2, y2] = points[(i + 1) % points.length] as Point;
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

export function pointInRing(point: Point, ring: readonly Point[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [xi, yi] = ring[index] as Point;
    const [xj, yj] = ring[previous] as Point;
    const crosses =
      yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(point: Point, rings: readonly (readonly Point[])[]): boolean {
  const outer = rings[0];
  if (outer === undefined || !pointInRing(point, outer)) return false;
  return rings.slice(1).every((hole) => !pointInRing(point, hole));
}

function polygonLabelPoint(rings: readonly (readonly Point[])[]): Point {
  const outer = rings[0];
  if (outer === undefined || outer.length < 4) {
    throw new Error("Cannot find a label point for an empty polygon.");
  }
  const longitude = outer.reduce((sum, point) => sum + point[0], 0) / outer.length;
  const latitude = outer.reduce((sum, point) => sum + point[1], 0) / outer.length;
  const centroid: Point = [longitude, latitude];
  if (pointInPolygon(centroid, rings)) return centroid;

  const longitudes = outer.map((point) => point[0]);
  const latitudes = outer.map((point) => point[1]);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  for (const divisions of [32, 64, 128, 256]) {
    for (let row = 0; row < divisions; row += 1) {
      for (let column = 0; column < divisions; column += 1) {
        const candidate: Point = [
          minLongitude + ((column + 0.5) / divisions) * (maxLongitude - minLongitude),
          minLatitude + ((row + 0.5) / divisions) * (maxLatitude - minLatitude),
        ];
        if (pointInPolygon(candidate, rings)) return candidate;
      }
    }
  }
  throw new Error("Could not find a point on the polygon surface.");
}

export type RunMapContextInputs = {
  sourcePath: string;
  artifactRoot: string;
  toleranceDegrees?: number | undefined;
  minRingArea?: number | undefined;
};

export type RunMapContextResult = {
  artifactPath: string;
  sourcePath: string;
  sourceSha256: string;
  boroughCount: number;
  ringCount: number;
  pointCount: number;
  byteLength: number;
};

export async function runMapContext(inputs: RunMapContextInputs): Promise<RunMapContextResult> {
  const toleranceDegrees = inputs.toleranceDegrees ?? 0.0004;
  const minRingArea = inputs.minRingArea ?? 0.00001;
  const sourceBytes = new Uint8Array(await readFile(inputs.sourcePath));
  const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
  const records = parseCsv(new TextDecoder().decode(sourceBytes));
  let ringCount = 0;
  let pointCount = 0;
  const features = records.flatMap((record) => {
    const geometryWkt = record["the_geom"];
    const boroName = record["BoroName"] as MapBorough | undefined;
    if (geometryWkt === undefined || geometryWkt === "" || boroName === undefined) return [];
    const polygons = parseMultiPolygonWkt(geometryWkt)
      .map((rings) =>
        rings
          .filter((ring) => ringArea(ring) >= minRingArea)
          .map((ring) =>
            douglasPeucker(ring, toleranceDegrees).map(
              ([lon, lat]) =>
                [Number(lon.toFixed(5)), Number(lat.toFixed(5))] as readonly [number, number],
            ),
          )
          .filter((ring) => ring.length >= 4),
      )
      .filter((rings) => rings.length > 0);
    if (polygons.length === 0) return [];
    const largest = polygons.toSorted(
      (left, right) => ringArea(right[0] ?? []) - ringArea(left[0] ?? []),
    )[0];
    if (largest === undefined) return [];
    const labelPoint = polygonLabelPoint(largest);
    if (!pointInPolygon(labelPoint, largest)) {
      throw new Error(`Generated label point for ${boroName} is outside its polygon.`);
    }
    ringCount += polygons.reduce((sum, rings) => sum + rings.length, 0);
    pointCount += polygons.reduce(
      (sum, rings) => sum + rings.reduce((ringSum, ring) => ringSum + ring.length, 0),
      0,
    );
    return [
      {
        type: "Feature" as const,
        properties: {
          boroName,
          labelPoint: [Number(labelPoint[0].toFixed(5)), Number(labelPoint[1].toFixed(5))],
        },
        geometry: { type: "MultiPolygon" as const, coordinates: polygons },
      },
    ];
  });

  const collection = decodeSchemaStrict(MapContextFeatureCollectionSchema, {
    type: "FeatureCollection",
    sourceRevision: {
      sourceId: "nyc_borough_boundaries",
      sha256: sourceSha256,
      currencyPolicy: "revision_pinned",
    },
    features,
  });
  const artifactPath = join(inputs.artifactRoot, ARTIFACT_KEY);
  await mkdir(dirname(artifactPath), { recursive: true });
  const payload = JSON.stringify(collection);
  await writeFile(artifactPath, payload);
  return {
    artifactPath,
    sourcePath: inputs.sourcePath,
    sourceSha256,
    boroughCount: features.length,
    ringCount,
    pointCount,
    byteLength: Buffer.byteLength(payload),
  };
}

function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const [px, py] = point;
  const [ax, ay] = lineStart;
  const [bx, by] = lineEnd;
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function douglasPeucker(points: readonly Point[], epsilon: number): Point[] {
  if (points.length < 3) return [...points];
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop() as [number, number];
    if (end <= start + 1) continue;
    let maxDistance = 0;
    let maxIndex = -1;
    for (let i = start + 1; i < end; i += 1) {
      const distance = perpendicularDistance(
        points[i] as Point,
        points[start] as Point,
        points[end] as Point,
      );
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }
    if (maxDistance > epsilon && maxIndex > 0) {
      keep[maxIndex] = true;
      stack.push([start, maxIndex], [maxIndex, end]);
    }
  }
  return points.filter((_, index) => keep[index] === true);
}

export default defineCommand({
  path: ["map", "context"],
  summary: "Build the simplified NYC borough shoreline GeoJSON map-context artifact.",
  input: {
    options: Schema.Struct({
      source: Schema.optionalKey(Schema.String).annotate({
        description: "Override borough-boundary CSV path",
      }),
      artifactRoot: Schema.optionalKey(Schema.String).annotate({
        description: "Override artifact root directory",
      }),
      toleranceDegrees: arg
        .number()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(0.0004)))
        .annotate({
          description: "Douglas-Peucker simplification tolerance in degrees (~40m default)",
        }),
      minRingArea: arg
        .number()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(0.00001)))
        .annotate({
          description: "Drop rings smaller than this area in square degrees (tiny islands)",
        }),
    }),
  },
  output: Schema.Struct({
    artifactPath: Schema.String,
    sourcePath: Schema.String,
    sourceSha256: Schema.String,
    boroughCount: Schema.Number,
    ringCount: Schema.Number,
    pointCount: Schema.Number,
    byteLength: Schema.Number,
  }),
  async run({ input }) {
    const sourcePath =
      input.options.source === undefined
        ? fromRepoRoot(DEFAULT_SOURCE)
        : fromCliPath(input.options.source);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    return runMapContext({
      sourcePath,
      artifactRoot,
      toleranceDegrees: input.options.toleranceDegrees,
      minRingArea: input.options.minRingArea,
    });
  },
});
