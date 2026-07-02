import { replaceRouteMonthCoverage } from "@bp/db/local";
import { getSocrataSource } from "@bp/sources/registry";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { arg, defineCommand, z } from "@liche/core";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { isoMonth } from "../../lib/dates.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { fromRepoRoot } from "../../lib/paths.ts";
import {
  fetchSoda3RowsForSource,
  type SocrataFetch,
  type SocrataRow,
  type Soda3SoqlQuery,
} from "../../lib/soda3.ts";

const schemaVersion = 1;

const RawSpeedCoverageRowSchema = z
  .object({
    route_id: z.string().min(1),
    observation_count: z.coerce.number().int().nonnegative(),
    bus_trip_count: z.coerce.number().int().nonnegative(),
    average_speed_mph: z.coerce.number().nonnegative(),
  })
  .passthrough();

const RawScheduleCoverageRowSchema = z
  .object({
    route_id: z.string().min(1),
    timepoint_count: z.coerce.number().int().nonnegative(),
  })
  .passthrough();

type CoverageEntry = {
  schemaVersion: typeof schemaVersion;
  routeId: string;
  isoMonth: string;
  speedObservationCount: number;
  speedBusTripCount: number;
  averageSpeedMph: number | null;
  scheduleTimepointCount: number;
  hasSpeedData: boolean;
  hasScheduleData: boolean;
};

export type RouteCoverageRunInputs = {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  fetcher?: SocrataFetch | undefined;
  manifestText?: string | undefined;
};

export type RouteCoverageIngestResult = {
  routeCount: number;
  speedRouteCount: number;
  scheduleRouteCount: number;
  completeCoverageRouteCount: number;
  dbPath: string;
};

function normalizeSpeedCoverage(
  rows: readonly SocrataRow[],
  month: string,
): Map<string, CoverageEntry> {
  const entries = new Map<string, CoverageEntry>();
  for (const row of rows) {
    const parsed = RawSpeedCoverageRowSchema.parse(row);
    const routeId = parsed.route_id;
    entries.set(routeId, {
      schemaVersion,
      routeId,
      isoMonth: month,
      speedObservationCount: parsed.observation_count,
      speedBusTripCount: parsed.bus_trip_count,
      averageSpeedMph: Math.round(parsed.average_speed_mph * 10_000) / 10_000,
      scheduleTimepointCount: 0,
      hasSpeedData: true,
      hasScheduleData: false,
    });
  }
  return entries;
}

function addScheduleCoverage(
  entries: Map<string, CoverageEntry>,
  rows: readonly SocrataRow[],
  month: string,
): void {
  for (const row of rows) {
    const parsed = RawScheduleCoverageRowSchema.parse(row);
    const routeId = parsed.route_id;
    const entry =
      entries.get(routeId) ??
      ({
        schemaVersion,
        routeId,
        isoMonth: month,
        speedObservationCount: 0,
        speedBusTripCount: 0,
        averageSpeedMph: null,
        scheduleTimepointCount: 0,
        hasSpeedData: false,
        hasScheduleData: false,
      } satisfies CoverageEntry);
    entry.scheduleTimepointCount = parsed.timepoint_count;
    entry.hasScheduleData = true;
    entries.set(routeId, entry);
  }
}

export async function runRouteCoverageIngest(
  inputs: RouteCoverageRunInputs,
): Promise<RouteCoverageIngestResult> {
  const monthKey = isoMonth(inputs.year, inputs.month);
  const manifestText =
    inputs.manifestText ??
    (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text());
  const manifest = loadSourceManifestYaml(manifestText);
  const speedSource = getSocrataSource(manifest, "bus_segment_speeds_2025");
  const scheduleSource = getSocrataSource(manifest, "bus_schedules_2026");
  const speedQuery: Soda3SoqlQuery = {
    select:
      "route_id,count(*) as observation_count,sum(bus_trip_count) as bus_trip_count,avg(average_road_speed) as average_speed_mph",
    where: `year=${inputs.year} AND month=${inputs.month}`,
    group: "route_id",
    order: "route_id",
  };
  const scheduleQuery: Soda3SoqlQuery = {
    select: "route_id,count(*) as timepoint_count",
    where: "timepoint='1' AND route_id IS NOT NULL",
    group: "route_id",
    order: "route_id",
  };
  const [speedRows, scheduleRows] = await Promise.all([
    fetchSoda3RowsForSource(speedSource, speedQuery, { fetcher: inputs.fetcher }),
    fetchSoda3RowsForSource(scheduleSource, scheduleQuery, { fetcher: inputs.fetcher }),
  ]);
  const entries = normalizeSpeedCoverage(speedRows, monthKey);
  addScheduleCoverage(entries, scheduleRows, monthKey);
  const rows = [...entries.values()].sort((l, r) => {
    if (l.averageSpeedMph !== null && r.averageSpeedMph !== null) {
      return l.averageSpeedMph - r.averageSpeedMph || l.routeId.localeCompare(r.routeId);
    }
    return l.routeId.localeCompare(r.routeId);
  });

  await replaceRouteMonthCoverage(inputs.local.db, monthKey, rows);

  return {
    routeCount: rows.length,
    speedRouteCount: rows.filter((r) => r.hasSpeedData).length,
    scheduleRouteCount: rows.filter((r) => r.hasScheduleData).length,
    completeCoverageRouteCount: rows.filter((r) => r.hasSpeedData && r.hasScheduleData).length,
    dbPath: inputs.local.path,
  };
}

export default defineCommand({
  path: ["ingest", "route-coverage"],
  summary: "Build route/month coverage from speed and schedule sources.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
    }),
  },
  output: z.object({
    routeCount: z.number(),
    speedRouteCount: z.number(),
    scheduleRouteCount: z.number(),
    completeCoverageRouteCount: z.number(),
    dbPath: z.string(),
  }),
  async run({ input }) {
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "ingest.route-coverage",
      operation: "runRouteCoverageIngest",
      spanAttributes: {
        year: input.options.year,
        month: input.options.month,
      },
      run: (local) =>
        runRouteCoverageIngest({
          local,
          year: input.options.year,
          month: input.options.month,
        }),
    });
  },
});
