import { arg, defineCommand, z } from "@liche/core";
import {
  type LocalRouteBuildPlan,
  type LocalRouteReadiness,
  listRouteBriefSummaries,
  listRouteReadiness,
  replaceRouteBuildPlan,
} from "@bp/db/local";
import { isoMonth } from "../../lib/dates.ts";
import {
  dbOptions,
  localDbFromCtx,
  type OpenLocalPipelineDb,
  withLocalDb,
} from "../../lib/local-db.ts";

const defaultLimit = 20;

export type RouteBuildPlanResult = {
  isoMonth: string;
  routeCount: number;
  selectedRouteCount: number;
  alreadyBuiltRouteCount: number;
  blockedRouteCount: number;
  backlogRouteCount: number;
  dbPath: string;
};

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
  if (leftScore !== rightScore) return rightScore - leftScore;
  if (left.averageSpeedMph !== null && right.averageSpeedMph !== null)
    return left.averageSpeedMph - right.averageSpeedMph;
  if (left.speedObservationCount !== right.speedObservationCount)
    return right.speedObservationCount - left.speedObservationCount;
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
      const leftPri = planStatusPriority(left.planStatus);
      const rightPri = planStatusPriority(right.planStatus);
      if (leftPri !== rightPri) return leftPri - rightPri;
      if (left.candidateRank !== null && right.candidateRank !== null)
        return left.candidateRank - right.candidateRank;
      if (left.priorityScore !== right.priorityScore)
        return right.priorityScore - left.priorityScore;
      return left.routeId.localeCompare(right.routeId);
    });
}

function countStatus(
  rows: readonly LocalRouteBuildPlan[],
  status: LocalRouteBuildPlan["planStatus"],
): number {
  return rows.filter((row) => row.planStatus === status).length;
}

export async function runRouteBuildPlan(inputs: {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  limit: number;
}): Promise<RouteBuildPlanResult> {
  const month = isoMonth(inputs.year, inputs.month);
  const [readiness, builtRoutes] = await Promise.all([
    listRouteReadiness(inputs.local.db, month),
    listRouteBriefSummaries(inputs.local.db, month),
  ]);
  const rows = buildPlanRows({
    readiness,
    alreadyBuiltRouteIds: new Set(builtRoutes.map((route) => route.routeId)),
    limit: inputs.limit,
  });
  const selectedRows = rows.filter((row) => row.selectedForNextBatch);
  await replaceRouteBuildPlan(inputs.local.db, month, rows);
  return {
    isoMonth: month,
    routeCount: rows.length,
    selectedRouteCount: selectedRows.length,
    alreadyBuiltRouteCount: countStatus(rows, "already_built"),
    blockedRouteCount: countStatus(rows, "blocked"),
    backlogRouteCount: countStatus(rows, "backlog"),
    dbPath: inputs.local.path,
  };
}

export default defineCommand({
  path: ["route", "build-plan"],
  summary: "Rank eligible routes for the next build batch.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
      limit: arg.positiveInt().default(defaultLimit).describe("Maximum routes selected per batch"),
    }),
  },
  middleware: [withLocalDb()],
  output: z.object({
    isoMonth: z.string(),
    routeCount: z.number(),
    selectedRouteCount: z.number(),
    alreadyBuiltRouteCount: z.number(),
    blockedRouteCount: z.number(),
    backlogRouteCount: z.number(),
    dbPath: z.string(),
  }),
  async run({ ctx, input }) {
    return runRouteBuildPlan({
      local: localDbFromCtx(ctx),
      year: input.options.year,
      month: input.options.month,
      limit: input.options.limit,
    });
  },
});
