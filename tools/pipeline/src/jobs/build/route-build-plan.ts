import {
  type LocalRouteBuildPlan,
  type LocalRouteReadiness,
  listRouteBriefSummaries,
  listRouteReadiness,
  replaceRouteBuildPlan,
} from "@bp/db/local";
import { numberOption } from "../../lib/cli-args.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";

type RouteBuildPlanArgs = {
  year?: number;
  month?: number;
  limit?: number;
  dbPath?: string;
};

export type RouteBuildPlanResult = {
  isoMonth: string;
  routeCount: number;
  selectedRouteCount: number;
  alreadyBuiltRouteCount: number;
  blockedRouteCount: number;
  backlogRouteCount: number;
  dbPath: string;
};

function parseBuildArgs(args: RouteBuildPlanArgs = {}): Required<RouteBuildPlanArgs> & {
  isoMonth: string;
} {
  return {
    ...createMonthContext(args),
    limit: args.limit ?? 20,
  };
}

function parseCliArgs(args: string[]): RouteBuildPlanArgs {
  return parseMonthDbCliArgs(args, {} as RouteBuildPlanArgs, [
    numberOption(["--limit"], (output, value) => {
      output.limit = value;
    }),
  ]);
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
  alreadyBuiltRouteIds: ReadonlySet<string>;
  limit: number;
}): LocalRouteBuildPlan[] {
  const candidateRows = input.readiness
    .filter((row) => row.buildEligible && !input.alreadyBuiltRouteIds.has(row.routeId))
    .sort(compareCandidates);
  const rankByRouteId = new Map(
    candidateRows.map((row, index) => [row.routeId, index + 1] as const),
  );

  return input.readiness
    .map((row) => {
      const candidateRank = rankByRouteId.get(row.routeId) ?? null;
      const alreadyBuilt = input.alreadyBuiltRouteIds.has(row.routeId);
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
      } satisfies LocalRouteBuildPlan;
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
  rows: readonly LocalRouteBuildPlan[],
  status: LocalRouteBuildPlan["planStatus"],
): number {
  return rows.filter((row) => row.planStatus === status).length;
}

export async function buildRouteBuildPlan(
  args: RouteBuildPlanArgs = {},
): Promise<RouteBuildPlanResult> {
  const options = parseBuildArgs(args);
  return withLocalPipelineDb(options.dbPath, async (local) => {
    const [readiness, builtRoutes] = await Promise.all([
      listRouteReadiness(local.db, options.isoMonth),
      listRouteBriefSummaries(local.db, options.isoMonth),
    ]);
    const rows = buildPlanRows({
      readiness,
      alreadyBuiltRouteIds: new Set(builtRoutes.map((route) => route.routeId)),
      limit: options.limit,
    });
    const selectedRows = rows.filter((row) => row.selectedForNextBatch);

    await replaceRouteBuildPlan(local.db, options.isoMonth, rows);

    return {
      isoMonth: options.isoMonth,
      routeCount: rows.length,
      selectedRouteCount: selectedRows.length,
      alreadyBuiltRouteCount: countStatus(rows, "already_built"),
      blockedRouteCount: countStatus(rows, "blocked"),
      backlogRouteCount: countStatus(rows, "backlog"),
      dbPath: local.path,
    };
  });
}

export async function buildRouteBuildPlanFromCli(args: string[]): Promise<RouteBuildPlanResult> {
  return buildRouteBuildPlan(parseCliArgs(args));
}
