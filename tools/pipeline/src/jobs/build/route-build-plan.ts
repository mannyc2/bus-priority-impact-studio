import { join } from "node:path";
import {
  type LocalRouteBuildPlan,
  type LocalRouteReadiness,
  listRouteReadiness,
  replaceRouteBuildPlan,
} from "@bp/db/local";
import * as z from "zod";
import { readArtifactIfPresent, writeArtifact } from "../../lib/artifact-store.js";
import { isoMonth } from "../../lib/dates.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { fromRepoRoot } from "../../source-manifest.js";

const schemaVersion = 1;

const IsoMonthSchema = z.string().regex(/^\d{4}-\d{2}$/);

const BatchSummarySchema = z
  .object({
    schemaVersion: z.literal(1),
    analysisPeriod: IsoMonthSchema,
    routes: z.array(
      z
        .object({
          routeId: z.string().min(1),
          isoMonth: IsoMonthSchema,
        })
        .passthrough(),
    ),
  })
  .passthrough();

type RouteBuildPlanArgs = {
  year?: number;
  month?: number;
  limit?: number;
  dbPath?: string;
};

type BatchSummary = z.output<typeof BatchSummarySchema>;

type RouteBuildPlanArtifactRow = LocalRouteBuildPlan & {
  schemaVersion: typeof schemaVersion;
};

type RouteBuildPlanResult = {
  isoMonth: string;
  planPath: string;
  summaryPath: string;
  routeCount: number;
  selectedRouteCount: number;
  alreadyBuiltRouteCount: number;
  blockedRouteCount: number;
  backlogRouteCount: number;
  dbPath: string;
};

function parseBuildArgs(args: RouteBuildPlanArgs = {}): Required<RouteBuildPlanArgs> {
  return {
    year: args.year ?? 2026,
    month: args.month ?? 3,
    limit: args.limit ?? 20,
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

function parseCliArgs(args: string[]): RouteBuildPlanArgs {
  const output: RouteBuildPlanArgs = {};

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

    if (arg === "--limit" && value !== undefined) {
      output.limit = Number(value);
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

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function priorityScore(row: LocalRouteReadiness): number {
  const slowSpeedWeight =
    row.averageSpeedMph === null ? 0 : Math.max(0, 25 - row.averageSpeedMph) * 100;
  const observationWeight = Math.log10(row.speedObservationCount + 1) * 10;
  const busTripWeight = Math.log10(row.speedBusTripCount + 1) * 5;
  const scheduleWeight = Math.log10(row.scheduleTimepointCount + 1) * 5;

  return round(
    row.readinessScore * 10 + slowSpeedWeight + observationWeight + busTripWeight + scheduleWeight,
  );
}

function compareCandidates(left: LocalRouteReadiness, right: LocalRouteReadiness): number {
  const leftScore = priorityScore(left);
  const rightScore = priorityScore(right);

  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }
  if (left.averageSpeedMph !== null && right.averageSpeedMph !== null) {
    return left.averageSpeedMph - right.averageSpeedMph;
  }
  if (left.speedObservationCount !== right.speedObservationCount) {
    return right.speedObservationCount - left.speedObservationCount;
  }

  return left.routeId.localeCompare(right.routeId);
}

function planStatusPriority(status: LocalRouteBuildPlan["planStatus"]): number {
  switch (status) {
    case "selected":
      return 0;
    case "backlog":
      return 1;
    case "already_built":
      return 2;
    case "blocked":
      return 3;
  }
}

function buildPlanRows(input: {
  readiness: readonly LocalRouteReadiness[];
  batch: BatchSummary | null;
  limit: number;
}): RouteBuildPlanArtifactRow[] {
  const alreadyBuiltRouteIds = new Set(input.batch?.routes.map((route) => route.routeId) ?? []);
  const candidateRows = input.readiness
    .filter((row) => row.buildEligible && !alreadyBuiltRouteIds.has(row.routeId))
    .sort(compareCandidates);
  const rankByRouteId = new Map(
    candidateRows.map((row, index) => [row.routeId, index + 1] as const),
  );

  return input.readiness
    .map((row) => {
      const candidateRank = rankByRouteId.get(row.routeId) ?? null;
      const alreadyBuilt = alreadyBuiltRouteIds.has(row.routeId);
      const selectedForNextBatch =
        candidateRank !== null && candidateRank <= input.limit && !alreadyBuilt;
      const planStatus: LocalRouteBuildPlan["planStatus"] = !row.buildEligible
        ? "blocked"
        : alreadyBuilt
          ? "already_built"
          : selectedForNextBatch
            ? "selected"
            : "backlog";

      return {
        schemaVersion,
        routeId: row.routeId,
        routeShortName: row.routeShortName,
        routeLongName: row.routeLongName,
        isoMonth: row.isoMonth,
        candidateRank,
        planStatus,
        selectedForNextBatch,
        alreadyBuilt,
        buildEligible: row.buildEligible,
        priorityScore: priorityScore(row),
        readinessStatus: row.readinessStatus,
        readinessScore: row.readinessScore,
        missingInputs: row.missingInputs,
        speedObservationCount: row.speedObservationCount,
        speedBusTripCount: row.speedBusTripCount,
        averageSpeedMph: row.averageSpeedMph,
        scheduleTimepointCount: row.scheduleTimepointCount,
        shapeCount: row.shapeCount,
        stopCount: row.stopCount,
        timepointStopCount: row.timepointStopCount,
      } satisfies RouteBuildPlanArtifactRow;
    })
    .sort((left, right) => {
      const leftStatusPriority = planStatusPriority(left.planStatus);
      const rightStatusPriority = planStatusPriority(right.planStatus);

      if (leftStatusPriority !== rightStatusPriority) {
        return leftStatusPriority - rightStatusPriority;
      }
      if (left.candidateRank !== null && right.candidateRank !== null) {
        return left.candidateRank - right.candidateRank;
      }
      if (left.priorityScore !== right.priorityScore) {
        return right.priorityScore - left.priorityScore;
      }

      return left.routeId.localeCompare(right.routeId);
    });
}

function countStatus(
  rows: readonly RouteBuildPlanArtifactRow[],
  status: LocalRouteBuildPlan["planStatus"],
): number {
  return rows.filter((row) => row.planStatus === status).length;
}

function summarizeMissingInputs(
  rows: readonly RouteBuildPlanArtifactRow[],
): Record<string, number> {
  const counts = new Map<string, number>();

  for (const row of rows) {
    for (const input of row.missingInputs) {
      counts.set(input, (counts.get(input) ?? 0) + 1);
    }
  }

  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

export async function buildRouteBuildPlan(
  args: RouteBuildPlanArgs = {},
): Promise<RouteBuildPlanResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const batchDir = fromRepoRoot(join("data/artifacts/route-batches", month));
  const batchSummaryPath = join(batchDir, "batch-summary.json");
  const planPath = join(batchDir, "route-build-plan.json");
  const summaryPath = join(batchDir, "route-build-plan-summary.json");
  const local = await openLocalPipelineDb(options.dbPath);

  try {
    const batch = await readArtifactIfPresent(batchSummaryPath, BatchSummarySchema);
    const readiness = await listRouteReadiness(local.db, month);
    const rows = buildPlanRows({
      readiness,
      batch,
      limit: options.limit,
    });
    const selectedRows = rows.filter((row) => row.selectedForNextBatch);
    const summary = {
      schemaVersion,
      analysisPeriod: month,
      generatedAt: new Date().toISOString(),
      limit: options.limit,
      routeCount: rows.length,
      candidateRouteCount: rows.filter((row) => row.candidateRank !== null).length,
      selectedRouteCount: selectedRows.length,
      alreadyBuiltRouteCount: countStatus(rows, "already_built"),
      blockedRouteCount: countStatus(rows, "blocked"),
      backlogRouteCount: countStatus(rows, "backlog"),
      selectedRouteIds: selectedRows.map((row) => row.routeId),
      missingInputCounts: summarizeMissingInputs(rows),
      planningMethod:
        "Eligible routes not already present in the batch summary are ranked by priority score, which weights readiness, slower observed speeds, speed observation volume, bus-trip volume, and schedule coverage.",
      caveats: [
        "This is an offline build plan, not a public route grade.",
        "Already-built routes are excluded from the next-batch selection but kept in the table for auditability.",
        "Routes missing geometry, speed data, or schedule inputs stay blocked until upstream ingestion fills the gaps.",
      ],
    };

    await replaceRouteBuildPlan(local.db, month, rows);
    await Promise.all([
      writeArtifact(batchDir, planPath, {
        schemaVersion,
        analysisPeriod: month,
        generatedAt: summary.generatedAt,
        limit: options.limit,
        rows,
      }),
      writeArtifact(batchDir, summaryPath, summary),
    ]);

    return {
      isoMonth: month,
      planPath,
      summaryPath,
      routeCount: rows.length,
      selectedRouteCount: selectedRows.length,
      alreadyBuiltRouteCount: summary.alreadyBuiltRouteCount,
      blockedRouteCount: summary.blockedRouteCount,
      backlogRouteCount: summary.backlogRouteCount,
      dbPath: local.path,
    };
  } finally {
    local.sqlite.close();
  }
}

export async function buildRouteBuildPlanFromCli(args: string[]): Promise<RouteBuildPlanResult> {
  return buildRouteBuildPlan(parseCliArgs(args));
}
