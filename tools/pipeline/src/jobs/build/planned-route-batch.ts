import { type LocalRouteBuildPlan, listRouteBuildPlan } from "@bp/db/local";
import { RouteIdCodec } from "@bp/domain";
import * as z from "zod";
import {
  dbOption,
  falseOption,
  monthOption,
  numberOption,
  parseCliOptions,
  yearOption,
} from "../../lib/cli-args.js";
import { isoMonth } from "../../lib/dates.js";
import { defaultLocalPipelineDbPath, withLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { exportD1Seed } from "../export/export-d1.js";
import { ingestAceRoutes } from "../ingest/ingest-ace-routes.js";
import { ingestAceViolationSummary } from "../ingest/ingest-ace-violations.js";
import { ingestBusLanes } from "../ingest/ingest-bus-lanes.js";
import { buildRouteBatchAudit } from "./route-batch-audit.js";
import { buildRouteBuildPlan } from "./route-build-plan.js";
import { buildRouteComparison } from "./route-comparison.js";
import { buildRouteReliabilityBaseline } from "./route-reliability-baseline.js";
import { buildRouteSliceArtifacts } from "./route-slice-pipeline.js";

type PlannedRouteBatchArgs = {
  year?: number;
  month?: number;
  limit?: number;
  hotspotLimit?: number;
  topSegmentLimit?: number;
  refreshSharedSources?: boolean;
  refreshPlan?: boolean;
  exportD1?: boolean;
  dbPath?: string;
};

type PlannedRouteBatchResult = {
  isoMonth: string;
  builtRouteIds: string[];
  selectedRouteCount: number;
  builtRouteCount: number;
  totalBatchRouteCount: number;
  refreshedPlanDbPath: string | null;
  d1SeedPath: string | null;
};

type PlannedRouteBatchDeps = {
  buildRouteSliceArtifacts: typeof buildRouteSliceArtifacts;
  buildRouteBatchAudit: typeof buildRouteBatchAudit;
  buildRouteComparison: typeof buildRouteComparison;
  buildRouteReliabilityBaseline: typeof buildRouteReliabilityBaseline;
  buildRouteBuildPlan: typeof buildRouteBuildPlan;
  exportD1Seed: typeof exportD1Seed;
  ingestAceRoutes: typeof ingestAceRoutes;
  ingestAceViolationSummary: typeof ingestAceViolationSummary;
  ingestBusLanes: typeof ingestBusLanes;
};

const defaultDeps: PlannedRouteBatchDeps = {
  buildRouteSliceArtifacts,
  buildRouteBatchAudit,
  buildRouteComparison,
  buildRouteReliabilityBaseline,
  buildRouteBuildPlan,
  exportD1Seed,
  ingestAceRoutes,
  ingestAceViolationSummary,
  ingestBusLanes,
};

function parseBuildArgs(args: PlannedRouteBatchArgs = {}): Required<PlannedRouteBatchArgs> {
  return {
    year: args.year ?? 2026,
    month: args.month ?? 3,
    limit: args.limit ?? Number.POSITIVE_INFINITY,
    hotspotLimit: args.hotspotLimit ?? 10,
    topSegmentLimit: args.topSegmentLimit ?? 5,
    refreshSharedSources: args.refreshSharedSources ?? true,
    refreshPlan: args.refreshPlan ?? true,
    exportD1: args.exportD1 ?? true,
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

function parseCliArgs(args: string[]): PlannedRouteBatchArgs {
  return parseCliOptions(args, {} as PlannedRouteBatchArgs, [
    yearOption(),
    monthOption(),
    numberOption(["--limit"], (output, value) => {
      output.limit = value;
    }),
    numberOption(["--hotspot-limit"], (output, value) => {
      output.hotspotLimit = value;
    }),
    numberOption(["--top-segments"], (output, value) => {
      output.topSegmentLimit = value;
    }),
    falseOption(["--no-refresh-shared"], (output) => {
      output.refreshSharedSources = false;
    }),
    falseOption(["--no-refresh-plan"], (output) => {
      output.refreshPlan = false;
    }),
    falseOption(["--no-d1-export"], (output) => {
      output.exportD1 = false;
    }),
    dbOption(fromCliPath),
  ]);
}

async function readSelectedPlanRoutes(
  path: string,
  month: string,
  limit: number,
): Promise<string[]> {
  return withLocalPipelineDb(path, async (local) => {
    return selectedPlanRoutes(await listRouteBuildPlan(local.db, month), limit);
  });
}

function selectedPlanRoutes(planRows: readonly LocalRouteBuildPlan[], limit: number): string[] {
  return planRows
    .filter((row) => row.selectedForNextBatch)
    .sort((left, right) => {
      if (left.candidateRank !== null && right.candidateRank !== null) {
        return left.candidateRank - right.candidateRank;
      }

      return left.routeId.localeCompare(right.routeId);
    })
    .slice(0, limit)
    .map((row) => z.decode(RouteIdCodec, row.routeId));
}

export async function buildPlannedRouteBatch(
  args: PlannedRouteBatchArgs = {},
  deps: PlannedRouteBatchDeps = defaultDeps,
): Promise<PlannedRouteBatchResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const plannedRouteIds = await readSelectedPlanRoutes(options.dbPath, month, options.limit);

  if (options.refreshSharedSources) {
    await Promise.all([
      deps.ingestAceRoutes(),
      deps.ingestAceViolationSummary({ year: options.year, month: options.month }),
      deps.ingestBusLanes(),
    ]);
  }

  const builtRoutes = [];
  for (const routeId of plannedRouteIds) {
    builtRoutes.push(
      await deps.buildRouteSliceArtifacts({
        routeId,
        year: options.year,
        month: options.month,
        hotspotLimit: options.hotspotLimit,
        topSegmentLimit: options.topSegmentLimit,
        dbPath: options.dbPath,
      }),
    );
  }

  await deps.buildRouteComparison({
    year: options.year,
    month: options.month,
    limit: builtRoutes.length,
    dbPath: options.dbPath,
  });
  await deps.buildRouteReliabilityBaseline({
    year: options.year,
    month: options.month,
    dbPath: options.dbPath,
  });
  await deps.buildRouteBatchAudit({
    year: options.year,
    month: options.month,
    dbPath: options.dbPath,
  });
  const refreshedPlan = options.refreshPlan
    ? await deps.buildRouteBuildPlan({
        year: options.year,
        month: options.month,
        limit: 20,
        dbPath: options.dbPath,
      })
    : null;
  const d1Export = options.exportD1
    ? await deps.exportD1Seed({
        year: options.year,
        month: options.month,
        dbPath: options.dbPath,
      })
    : null;

  return {
    isoMonth: month,
    builtRouteIds: builtRoutes.map((route) => route.routeId),
    selectedRouteCount: plannedRouteIds.length,
    builtRouteCount: builtRoutes.length,
    totalBatchRouteCount: builtRoutes.length,
    refreshedPlanDbPath: refreshedPlan?.dbPath ?? null,
    d1SeedPath: d1Export?.seedPath ?? null,
  };
}

export async function buildPlannedRouteBatchFromCli(
  args: string[],
): Promise<PlannedRouteBatchResult> {
  return buildPlannedRouteBatch(parseCliArgs(args));
}
