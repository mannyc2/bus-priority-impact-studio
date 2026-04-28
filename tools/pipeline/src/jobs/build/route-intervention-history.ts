import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { listRouteBriefSummaries } from "@bp/db/local";
import * as z from "zod";
import { routeSliceKey } from "../../lib/artifacts.js";
import { isoMonth } from "../../lib/dates.js";
import { writeJson } from "../../lib/json.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { fromRepoRoot } from "../../source-manifest.js";

const schemaVersion = 1;

const IsoMonthSchema = z.string().regex(/^\d{4}-\d{2}$/);

const InterventionOverlaySchema = z
  .object({
    schemaVersion: z.literal(1),
    routeId: z.string().min(1),
    analysisPeriod: IsoMonthSchema,
    ace: z
      .object({
        routeMatched: z.boolean(),
        routeMatchCount: z.number().int().nonnegative(),
        activeDuringAnalysisPeriod: z.boolean(),
        activePrograms: z.array(
          z
            .object({
              program: z.string().min(1),
              implementationDate: z.string().min(1),
            })
            .passthrough(),
        ),
        futurePrograms: z.array(
          z
            .object({
              program: z.string().min(1),
              implementationDate: z.string().min(1),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
    violations: z
      .object({
        routeViolationCount: z.number().int().nonnegative(),
        groupedRowCount: z.number().int().nonnegative(),
      })
      .passthrough(),
  })
  .passthrough();

const BusLaneOverlaySchema = z
  .object({
    schemaVersion: z.literal(1),
    routeId: z.string().min(1),
    analysisPeriod: IsoMonthSchema,
    matchedLaneCount: z.number().int().nonnegative(),
    matchedStreetCount: z.number().int().nonnegative(),
    matchedLanes: z.array(
      z
        .object({
          segmentId: z.string().min(1),
          street: z.string().min(1),
          facility: z.string().min(1),
          laneType: z.string().nullable().optional(),
          laneSubtype: z.string().nullable().optional(),
          openDate: z.string().nullable().optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

type RouteInterventionHistoryArgs = {
  year?: number;
  month?: number;
  dbPath?: string;
};

type RouteInterventionHistoryResult = {
  isoMonth: string;
  historyPath: string;
  summaryPath: string;
  routeCount: number;
  aceMatchedRouteCount: number;
  busLaneMatchedRouteCount: number;
};

type Program = {
  program: string;
  implementationDate: string;
};

type BusLane = z.output<typeof BusLaneOverlaySchema>["matchedLanes"][number];

function parseBuildArgs(
  args: RouteInterventionHistoryArgs = {},
): Required<RouteInterventionHistoryArgs> {
  return {
    year: args.year ?? 2026,
    month: args.month ?? 3,
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

function parseCliArgs(args: string[]): RouteInterventionHistoryArgs {
  const output: RouteInterventionHistoryArgs = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === "--year" && value !== undefined) {
      output.year = Number(value);
      index += 1;
      continue;
    }

    if (arg === "--month" && value !== undefined) {
      output.month = Number(value);
      index += 1;
      continue;
    }

    if (arg === "--db" && value !== undefined) {
      output.dbPath = fromCliPath(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${arg ?? ""}`);
  }

  return output;
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(values.filter((value): value is string => value !== undefined && value !== null)),
  ].sort();
}

function sortedDates(values: Array<string | null | undefined>): string[] {
  return uniqueSorted(values).sort();
}

function summarizePrograms(activePrograms: Program[], futurePrograms: Program[]) {
  const programs = [
    ...activePrograms.map((program) => ({ ...program, status: "active" as const })),
    ...futurePrograms.map((program) => ({ ...program, status: "future" as const })),
  ].sort(
    (left, right) =>
      left.implementationDate.localeCompare(right.implementationDate) ||
      left.program.localeCompare(right.program),
  );

  return {
    routeMatched: programs.length > 0,
    routeMatchCount: programs.length,
    activeProgramCount: activePrograms.length,
    futureProgramCount: futurePrograms.length,
    firstImplementationDate: programs[0]?.implementationDate ?? null,
    latestImplementationDate: programs.at(-1)?.implementationDate ?? null,
    programs,
  };
}

function summarizeBusLanes(lanes: BusLane[]) {
  const openDates = sortedDates(lanes.map((lane) => lane.openDate));

  return {
    matchedLaneCount: lanes.length,
    matchedStreetCount: uniqueSorted(lanes.map((lane) => lane.street)).length,
    openDateCount: openDates.length,
    missingOpenDateCount: lanes.filter(
      (lane) => lane.openDate === undefined || lane.openDate === null,
    ).length,
    earliestOpenDate: openDates[0] ?? null,
    latestOpenDate: openDates.at(-1) ?? null,
    laneTypes: uniqueSorted(lanes.map((lane) => lane.laneType)),
    laneSubtypes: uniqueSorted(lanes.map((lane) => lane.laneSubtype)),
    facilities: uniqueSorted(lanes.map((lane) => lane.facility)).slice(0, 25),
  };
}

export async function buildRouteInterventionHistory(
  args: RouteInterventionHistoryArgs = {},
): Promise<RouteInterventionHistoryResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const batchDir = fromRepoRoot(join("data/artifacts/route-batches", month));
  const historyPath = join(batchDir, "route-intervention-history.json");
  const summaryPath = join(batchDir, "route-intervention-history-summary.json");
  const local = await openLocalPipelineDb(options.dbPath);
  const builtRoutes = await listRouteBriefSummaries(local.db, month);
  local.sqlite.close();
  const rows = await Promise.all(
    builtRoutes.map(async (route) => {
      const artifactDir = fromRepoRoot(
        join("data/artifacts/route-slices", routeSliceKey(route.routeId, month)),
      );
      const intervention = InterventionOverlaySchema.parse(
        await Bun.file(join(artifactDir, "intervention-overlay.json")).json(),
      );
      const busLanes = BusLaneOverlaySchema.parse(
        await Bun.file(join(artifactDir, "bus-lane-overlay.json")).json(),
      );

      return {
        schemaVersion,
        routeId: route.routeId,
        isoMonth: month,
        ace: summarizePrograms(intervention.ace.activePrograms, intervention.ace.futurePrograms),
        enforcement: {
          aceViolationCount: intervention.violations.routeViolationCount,
          aceViolationGroupedRowCount: intervention.violations.groupedRowCount,
          enforcementActivationStatus:
            intervention.ace.activeDuringAnalysisPeriod || intervention.ace.routeMatched
              ? "ace_implementation_date_available"
              : "no_ace_route_match",
        },
        busLanes: summarizeBusLanes(busLanes.matchedLanes),
        signalPriority: {
          status: "not_ingested",
          note: "No signal-priority source has been added to the manifest or pipeline yet.",
        },
        laneUpgrades: {
          status: "not_ingested",
          note: "Bus-lane open dates are available where provided, but lane-upgrade/version history is not yet ingested.",
        },
      };
    }),
  );
  const summary = {
    schemaVersion,
    analysisPeriod: month,
    generatedAt: new Date().toISOString(),
    routeCount: rows.length,
    aceMatchedRouteCount: rows.filter((row) => row.ace.routeMatched).length,
    activeAceRouteCount: rows.filter((row) => row.ace.activeProgramCount > 0).length,
    busLaneMatchedRouteCount: rows.filter((row) => row.busLanes.matchedLaneCount > 0).length,
    busLaneOpenDateRouteCount: rows.filter((row) => row.busLanes.openDateCount > 0).length,
    sourceReadiness: {
      aceImplementationDates: "available",
      aceViolationCounts: "available_monthly_grouped",
      busLaneOpenDates: "available_where_published",
      signalPriority: "not_ingested",
      laneUpgradeHistory: "not_ingested",
      enforcementActivation: "partial_ace_implementation_dates_only",
    },
    caveats: [
      "ACE dates are route-level program implementation dates, not camera-by-camera activation windows.",
      "Bus-lane dates come from the NYC DOT bus-lane layer where open-date fields are populated.",
      "Signal priority, lane upgrade history, and enforcement warning periods still need source discovery and ingestion.",
    ],
    rows,
  };

  await mkdir(batchDir, { recursive: true });
  await Promise.all([
    writeJson(historyPath, {
      schemaVersion,
      analysisPeriod: month,
      generatedAt: summary.generatedAt,
      rows,
    }),
    writeJson(summaryPath, summary),
  ]);

  return {
    isoMonth: month,
    historyPath,
    summaryPath,
    routeCount: rows.length,
    aceMatchedRouteCount: summary.aceMatchedRouteCount,
    busLaneMatchedRouteCount: summary.busLaneMatchedRouteCount,
  };
}

export function buildRouteInterventionHistoryFromCli(
  args: string[],
): Promise<RouteInterventionHistoryResult> {
  return buildRouteInterventionHistory(parseCliArgs(args));
}
