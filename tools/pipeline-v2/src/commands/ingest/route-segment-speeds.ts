import { Effect } from "effect";
import {
  type LocalRouteSegmentSpeed,
  type LocalRouteSegmentSpeedCell,
  replaceRouteSegmentSpeedCells,
  replaceRouteSegmentSpeeds,
} from "@bp/db/local";
import { decodeStrip } from "@bp/domain/decode";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import {
  normalizeSegmentSpeedCellRows,
  normalizeSegmentSpeedRows,
} from "@bp/sources/adapters/mta/bus-speeds";
import { getSocrataSource } from "@bp/sources/registry";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { runBoundedPromises } from "../../effect/concurrency.ts";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { isoMonth } from "../../lib/dates.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { fromRepoRoot } from "../../lib/paths.ts";
import { mergeRoutesWithFile } from "../../lib/route-list.ts";
import {
  createSoda3SourceClient,
  type PipelineSoda3Client,
  type SocrataFetch,
  type SocrataRow,
  type Soda3SoqlQuery,
  soqlIn,
  soqlYearMonthRange,
} from "../../lib/soda3.ts";

type SegmentSpeedSourceId = "bus_segment_speeds_2023_2024" | "bus_segment_speeds_2025";

const DEFAULT_ROUTE_CONCURRENCY = 6;

export type RouteSegmentSpeedsIngestInputs = {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  routes: readonly string[];
  routeConcurrency?: number | undefined;
  fetcher?: SocrataFetch | undefined;
  manifestText?: string | undefined;
};

export type RouteSegmentSpeedsIngestResult = {
  month: string;
  sourceId: SegmentSpeedSourceId;
  fetchedRowCount: number;
  normalizedRowCount: number;
  cellRowCount: number;
  routeCount: number;
};

const RawRouteIdRowSchema = Schema.Struct({
  route_id: Schema.String.check(Schema.isMinLength(1)),
});

function sourceIdForMonth(month: string): SegmentSpeedSourceId {
  return month < "2025-01" ? "bus_segment_speeds_2023_2024" : "bus_segment_speeds_2025";
}

function chunkArray<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function rowsByRoute(
  rows: readonly LocalRouteSegmentSpeed[],
): Map<string, LocalRouteSegmentSpeed[]> {
  const output = new Map<string, LocalRouteSegmentSpeed[]>();
  for (const row of rows) {
    output.set(row.routeId, [...(output.get(row.routeId) ?? []), row]);
  }
  return output;
}

function sortSegmentRows(left: LocalRouteSegmentSpeed, right: LocalRouteSegmentSpeed): number {
  return (
    left.direction.localeCompare(right.direction) ||
    left.stopOrder - right.stopOrder ||
    left.dayOfWeek.localeCompare(right.dayOfWeek) ||
    left.hourOfDay - right.hourOfDay ||
    left.timestamp.localeCompare(right.timestamp)
  );
}

export function normalizeRouteSegmentSpeedCellRows(
  rows: readonly SocrataRow[],
  expectedMonth: string,
): LocalRouteSegmentSpeedCell[] {
  return normalizeSegmentSpeedCellRows([...rows])
    .filter((row) => row.isoMonth === expectedMonth)
    .map(({ schemaVersion: _schemaVersion, ...row }) => row);
}

export function normalizeRouteSegmentSpeedRows(
  rows: readonly SocrataRow[],
  expectedMonth: string,
): LocalRouteSegmentSpeed[] {
  return normalizeSegmentSpeedRows([...rows])
    .filter((row) => row.isoMonth === expectedMonth)
    .map(({ schemaVersion: _schemaVersion, ...row }) => row)
    .sort(
      (left, right) => left.routeId.localeCompare(right.routeId) || sortSegmentRows(left, right),
    );
}

async function listSourceRoutes(input: {
  client: PipelineSoda3Client;
  year: number;
  month: number;
}): Promise<string[]> {
  const rows = await input.client.rows({
    select: "route_id",
    where: soqlYearMonthRange(input.year, input.month, input.year, input.month),
    group: "route_id",
    order: "route_id",
  });
  return rows.map((row) => decodeStrip(RawRouteIdRowSchema)(row).route_id);
}

async function fetchRouteSegmentSpeedRows(input: {
  client: PipelineSoda3Client;
  year: number;
  monthNumber: number;
  isoMonth: string;
  routeId: string;
}): Promise<{
  routeId: string;
  rawRowCount: number;
  normalizedRows: LocalRouteSegmentSpeed[];
  cellRows: LocalRouteSegmentSpeedCell[];
}> {
  const query: Soda3SoqlQuery = {
    where: [
      soqlYearMonthRange(input.year, input.monthNumber, input.year, input.monthNumber),
      soqlIn("route_id", [input.routeId]),
    ].join(" AND "),
    order: "route_id,direction,stop_order,day_of_week,hour_of_day,timestamp",
  };
  const rawRows = await input.client.rows(query);
  return {
    routeId: input.routeId,
    rawRowCount: rawRows.length,
    normalizedRows: normalizeRouteSegmentSpeedRows(rawRows, input.isoMonth),
    cellRows: normalizeRouteSegmentSpeedCellRows(rawRows, input.isoMonth),
  };
}

export async function runRouteSegmentSpeedsIngest(
  inputs: RouteSegmentSpeedsIngestInputs,
): Promise<RouteSegmentSpeedsIngestResult> {
  const month = isoMonth(inputs.year, inputs.month);
  const sourceId = sourceIdForMonth(month);
  const manifestText =
    inputs.manifestText ??
    (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text());
  const manifest = loadSourceManifestYaml(manifestText);
  const source = getSocrataSource(manifest, sourceId);
  const client = createSoda3SourceClient(source, { fetcher: inputs.fetcher });
  const routeIds =
    inputs.routes.length > 0
      ? [...new Set(inputs.routes)].sort()
      : await listSourceRoutes({ client, year: inputs.year, month: inputs.month });
  const routeConcurrency = inputs.routeConcurrency ?? DEFAULT_ROUTE_CONCURRENCY;

  let fetchedRowCount = 0;
  let normalizedRowCount = 0;
  let cellRowCount = 0;
  let writtenRouteCount = 0;
  for (const routeChunk of chunkArray(routeIds, routeConcurrency)) {
    const results = await runBoundedPromises(routeChunk, routeConcurrency, (routeId) =>
      fetchRouteSegmentSpeedRows({
        client,
        year: inputs.year,
        monthNumber: inputs.month,
        isoMonth: month,
        routeId,
      }),
    );

    for (const result of results) {
      fetchedRowCount += result.rawRowCount;
      normalizedRowCount += result.normalizedRows.length;
      cellRowCount += result.cellRows.length;

      const byRoute = rowsByRoute(result.normalizedRows);
      const rows = byRoute.get(result.routeId) ?? [];
      await replaceRouteSegmentSpeeds(inputs.local.db, result.routeId, month, rows);
      replaceRouteSegmentSpeedCells(
        inputs.local.db,
        result.routeId,
        month,
        result.cellRows.filter((row) => row.routeId === result.routeId),
      );
      writtenRouteCount += 1;
    }
  }

  return {
    month,
    sourceId,
    fetchedRowCount,
    normalizedRowCount,
    cellRowCount,
    routeCount: writtenRouteCount,
  };
}

export default defineCommand({
  path: ["ingest", "route-segment-speeds"],
  summary: "Fetch route segment speed rows for a month and replace local route/month slices.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      ...{
        year: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(2026)))
          .annotate({ description: "Year to ingest" }),
        month: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(3)))
          .annotate({ description: "Month to ingest, 1-12" }),
        route: Schema.optionalKey(Schema.String).annotate({
          description: "Single route ID convenience filter",
        }),
        routes: Schema.Array(Schema.String)
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed([])))
          .annotate({ description: "Specific route IDs (default: all routes in source month)" }),
        routesFile: Schema.optionalKey(Schema.String).annotate({
          description: "JSON file containing route IDs",
        }),
        routeConcurrency: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(DEFAULT_ROUTE_CONCURRENCY)))
          .annotate({
            description: "Number of route-level Socrata segment-speed queries to run concurrently",
          }),
      },
    }),
  },
  output: Schema.Struct({
    month: Schema.String,
    sourceId: Schema.Literals(["bus_segment_speeds_2023_2024", "bus_segment_speeds_2025"]),
    fetchedRowCount: Schema.Number,
    normalizedRowCount: Schema.Number,
    cellRowCount: Schema.Number,
    routeCount: Schema.Number,
  }),
  async run({ input }) {
    const routes = await mergeRoutesWithFile(
      input.options.route === undefined
        ? input.options.routes
        : [...input.options.routes, input.options.route],
      input.options.routesFile,
    );
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "ingest.route-segment-speeds",
      operation: "runRouteSegmentSpeedsIngest",
      spanAttributes: {
        year: input.options.year,
        month: input.options.month,
        routeCount: routes.length,
        routeConcurrency: input.options.routeConcurrency,
      },
      run: (local) =>
        runRouteSegmentSpeedsIngest({
          local,
          year: input.options.year,
          month: input.options.month,
          routes,
          routeConcurrency: input.options.routeConcurrency,
        }),
    });
  },
});
