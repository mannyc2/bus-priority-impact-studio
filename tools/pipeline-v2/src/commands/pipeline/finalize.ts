import { arg, defineCommand, z } from "@bp/pipeline-v2/cli/compat";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { isoMonth } from "../../lib/dates.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { fromCliPath } from "../../lib/paths.ts";
import {
  type BackfillRouteRidershipTrendsResult,
  runBackfillRouteRidershipTrends,
} from "../backfill/route-ridership-trends.ts";
import { runBuildObservedHeadways } from "../build/observed-headways.ts";
import { type PipelineV1CheckResult, runCheckPipelineV1 } from "../check/pipeline-v1.ts";
import { runCorridorModel } from "../corridor/model.ts";
import { runRouteTrendsIngest } from "../ingest/route-trends.ts";
import { runMapArtifacts } from "../map/artifacts.ts";
import { runRouteBriefModel } from "../route/brief-model.ts";
import { runRouteInterventionEvaluation } from "../route/intervention-evaluation.ts";
import { runRouteObservedReliability } from "../route/observed-reliability.ts";
import { runVerifyD1Export } from "../verify/d1.ts";

const defaultObservedReliabilityMinSamples = 30;
const defaultInterventionWindowMonths = 3;
const defaultInterventionMinSampleMonths = 1;
const defaultInterventionComparisonRouteCount = 10;
const defaultCorridorHotspotLimit = 10;
const defaultTrendStartYear = 2025;
const defaultTrendStartMonth = 1;

export type PipelineFinalizeInputs = {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  runId?: string | undefined;
  refreshTrends?: boolean | undefined;
  backfillRidership?: boolean | undefined;
  trendStartYear?: number | undefined;
  trendStartMonth?: number | undefined;
  ridershipBackfillLimit?: number | undefined;
  ridershipBackfillConcurrency?: number | undefined;
  buildObservedHeadways?: boolean | undefined;
  allowInsufficientGtfsRt?: boolean | undefined;
  minObservedHeadwaySamples?: number | undefined;
  minObservedRouteCount?: number | undefined;
  minObservedRouteShare?: number | undefined;
  minGtfsRtCollectionHours?: number | undefined;
  maxGtfsRtSampleSeconds?: number | undefined;
  minGtfsRtVehiclePositionSnapshotShare?: number | undefined;
  observedReliabilityMinSamples?: number | undefined;
  interventionWindowMonths?: number | undefined;
  interventionMinSampleMonths?: number | undefined;
  interventionComparisonRouteCount?: number | undefined;
  corridorHotspotLimit?: number | undefined;
  artifactRoot?: string | undefined;
  exportRoot?: string | undefined;
};

export type PipelineFinalizeResult = {
  isoMonth: string;
  trendWindow: {
    startYear: number;
    startMonth: number;
    endYear: number;
    endMonth: number;
  };
  gtfsRtRunId: string;
  strictGtfsRt: boolean;
  trendRefresh: Awaited<ReturnType<typeof runRouteTrendsIngest>> | null;
  ridershipBackfills: BackfillRouteRidershipTrendsResult[];
  observedHeadways: Awaited<ReturnType<typeof runBuildObservedHeadways>> | null;
  observedReliability: Awaited<ReturnType<typeof runRouteObservedReliability>>;
  interventionEvaluation: Awaited<ReturnType<typeof runRouteInterventionEvaluation>>;
  routeBriefModel: Awaited<ReturnType<typeof runRouteBriefModel>>;
  corridorModel: Awaited<ReturnType<typeof runCorridorModel>>;
  mapArtifacts: Awaited<ReturnType<typeof runMapArtifacts>>;
  d1: Awaited<ReturnType<typeof runVerifyD1Export>>;
  check: PipelineV1CheckResult;
};

function requireGtfsRtRunId(input: {
  runId: string | undefined;
  allowInsufficientGtfsRt: boolean | undefined;
  isoMonth: string;
}): string {
  if (input.runId !== undefined && input.runId.length > 0) return input.runId;
  if (input.allowInsufficientGtfsRt) return `insufficient-gtfs-rt-${input.isoMonth}`;
  throw new Error("Missing required argument: --run-id, or pass --allow-insufficient-gtfs-rt.");
}

export async function runPipelineFinalize(
  inputs: PipelineFinalizeInputs,
): Promise<PipelineFinalizeResult> {
  const monthKey = isoMonth(inputs.year, inputs.month);
  const trendWindow = {
    startYear: inputs.trendStartYear ?? defaultTrendStartYear,
    startMonth: inputs.trendStartMonth ?? defaultTrendStartMonth,
    endYear: inputs.year,
    endMonth: inputs.month,
  };
  const refreshTrends = inputs.refreshTrends ?? true;
  const backfillRidership = inputs.backfillRidership ?? true;
  const ridershipBackfillLimit = Math.max(1, Math.round(inputs.ridershipBackfillLimit ?? 1000));
  const ridershipBackfillConcurrency = Math.max(
    1,
    Math.round(inputs.ridershipBackfillConcurrency ?? 8),
  );
  const gtfsRtRunId = requireGtfsRtRunId({
    runId: inputs.runId,
    allowInsufficientGtfsRt: inputs.allowInsufficientGtfsRt,
    isoMonth: monthKey,
  });
  const shouldBuildObservedHeadways = inputs.buildObservedHeadways ?? inputs.runId !== undefined;
  const strictGtfsRt = inputs.allowInsufficientGtfsRt !== true;

  const trendRefresh = refreshTrends
    ? await runRouteTrendsIngest({
        local: inputs.local,
        startYear: trendWindow.startYear,
        startMonth: trendWindow.startMonth,
        endYear: trendWindow.endYear,
        endMonth: trendWindow.endMonth,
        routes: [],
        includeRidership: false,
      })
    : null;
  const ridershipBackfills: BackfillRouteRidershipTrendsResult[] = [];
  if (backfillRidership) {
    for (;;) {
      const result = await runBackfillRouteRidershipTrends({
        local: inputs.local,
        startYear: trendWindow.startYear,
        startMonth: trendWindow.startMonth,
        endYear: trendWindow.endYear,
        endMonth: trendWindow.endMonth,
        limit: ridershipBackfillLimit,
        concurrency: ridershipBackfillConcurrency,
      });
      ridershipBackfills.push(result);
      if (result.remainingRidershipMissingCount === 0 || result.updatedRowCount === 0) break;
    }
  }

  const observedHeadways = shouldBuildObservedHeadways
    ? await runBuildObservedHeadways({ local: inputs.local, runId: gtfsRtRunId })
    : null;
  const observedReliability = await runRouteObservedReliability({
    local: inputs.local,
    year: inputs.year,
    month: inputs.month,
    runId: gtfsRtRunId,
    minSamples: inputs.observedReliabilityMinSamples ?? defaultObservedReliabilityMinSamples,
  });
  const interventionEvaluation = await runRouteInterventionEvaluation({
    local: inputs.local,
    year: inputs.year,
    month: inputs.month,
    windowMonths: inputs.interventionWindowMonths ?? defaultInterventionWindowMonths,
    minSampleMonths: inputs.interventionMinSampleMonths ?? defaultInterventionMinSampleMonths,
    comparisonRouteCount:
      inputs.interventionComparisonRouteCount ?? defaultInterventionComparisonRouteCount,
  });
  const routeBriefModel = await runRouteBriefModel({
    local: inputs.local,
    year: inputs.year,
    month: inputs.month,
    routes: [],
    artifactRoot: inputs.artifactRoot,
  });
  const corridorModel = await runCorridorModel({
    local: inputs.local,
    year: inputs.year,
    month: inputs.month,
    hotspotLimit: inputs.corridorHotspotLimit ?? defaultCorridorHotspotLimit,
  });
  const mapArtifacts = await runMapArtifacts({
    local: inputs.local,
    year: inputs.year,
    month: inputs.month,
    artifactRoot: inputs.artifactRoot,
  });
  const d1 = await runVerifyD1Export({
    local: inputs.local,
    year: inputs.year,
    month: inputs.month,
    exportRoot: inputs.exportRoot,
  });
  const check = await runCheckPipelineV1({
    local: inputs.local,
    year: inputs.year,
    month: inputs.month,
    allowInsufficientGtfsRt: inputs.allowInsufficientGtfsRt,
    minObservedHeadwaySamples: inputs.minObservedHeadwaySamples,
    minObservedRouteCount: inputs.minObservedRouteCount,
    minObservedRouteShare: inputs.minObservedRouteShare,
    minGtfsRtCollectionHours: inputs.minGtfsRtCollectionHours,
    maxGtfsRtSampleSeconds: inputs.maxGtfsRtSampleSeconds,
    minGtfsRtVehiclePositionSnapshotShare: inputs.minGtfsRtVehiclePositionSnapshotShare,
    artifactRoot: inputs.artifactRoot,
    exportRoot: inputs.exportRoot,
  });

  if (check.status === "fail") {
    throw new Error(
      `Pipeline v1 finalization failed: ${check.issues.map((issue) => issue.code).join(", ")}`,
    );
  }

  return {
    isoMonth: monthKey,
    trendWindow,
    gtfsRtRunId,
    strictGtfsRt,
    trendRefresh,
    ridershipBackfills,
    observedHeadways,
    observedReliability,
    interventionEvaluation,
    routeBriefModel,
    corridorModel,
    mapArtifacts,
    d1,
    check,
  };
}

export default defineCommand({
  path: ["pipeline", "finalize"],
  summary:
    "Run the full pipeline v1 finalization (trends, observed, intervention, map, D1, check).",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
      runId: z.string().optional().describe("GTFS-RT collection run id"),
      trendStartYear: arg.positiveInt().optional(),
      trendStartMonth: arg.positiveInt().optional(),
      noTrends: z.boolean().optional().describe("Skip route-trends ingest"),
      noRidershipBackfill: z.boolean().optional().describe("Skip ridership backfill"),
      ridershipLimit: arg.positiveInt().optional(),
      ridershipConcurrency: arg.positiveInt().optional(),
      skipObservedHeadways: z.boolean().optional(),
      allowInsufficientGtfsRt: z.boolean().optional(),
      minObservedHeadwaySamples: arg.positiveInt().optional(),
      minObservedRouteCount: arg.positiveInt().optional(),
      minObservedRouteShare: z.coerce.number().optional(),
      minGtfsRtCollectionHours: z.coerce.number().optional(),
      maxGtfsRtSampleSeconds: arg.positiveInt().optional(),
      minGtfsRtVehiclePositionSnapshotShare: z.coerce.number().optional(),
      observedReliabilityMinSamples: arg.positiveInt().optional(),
      interventionWindowMonths: arg.positiveInt().optional(),
      interventionMinSampleMonths: arg.positiveInt().optional(),
      interventionComparisonRouteCount: arg.positiveInt().optional(),
      corridorHotspotLimit: arg.positiveInt().optional(),
      artifactRoot: z.string().optional(),
      exportRoot: z.string().optional(),
    }),
  },
  output: z
    .object({
      isoMonth: z.string(),
      gtfsRtRunId: z.string(),
      strictGtfsRt: z.boolean(),
    })
    .passthrough(),
  async run({ input }) {
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? undefined
        : fromCliPath(input.options.artifactRoot);
    const exportRoot =
      input.options.exportRoot === undefined ? undefined : fromCliPath(input.options.exportRoot);
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "pipeline.finalize",
      operation: "runPipelineFinalize",
      spanAttributes: {
        year: input.options.year,
        month: input.options.month,
        runId: input.options.runId ?? null,
        strictGtfsRt: input.options.allowInsufficientGtfsRt !== true,
      },
      run: (local) =>
        runPipelineFinalize({
          local,
          year: input.options.year,
          month: input.options.month,
          runId: input.options.runId,
          trendStartYear: input.options.trendStartYear,
          trendStartMonth: input.options.trendStartMonth,
          refreshTrends: input.options.noTrends === true ? false : undefined,
          backfillRidership: input.options.noRidershipBackfill === true ? false : undefined,
          ridershipBackfillLimit: input.options.ridershipLimit,
          ridershipBackfillConcurrency: input.options.ridershipConcurrency,
          buildObservedHeadways: input.options.skipObservedHeadways === true ? false : undefined,
          allowInsufficientGtfsRt: input.options.allowInsufficientGtfsRt,
          minObservedHeadwaySamples: input.options.minObservedHeadwaySamples,
          minObservedRouteCount: input.options.minObservedRouteCount,
          minObservedRouteShare: input.options.minObservedRouteShare,
          minGtfsRtCollectionHours: input.options.minGtfsRtCollectionHours,
          maxGtfsRtSampleSeconds: input.options.maxGtfsRtSampleSeconds,
          minGtfsRtVehiclePositionSnapshotShare:
            input.options.minGtfsRtVehiclePositionSnapshotShare,
          observedReliabilityMinSamples: input.options.observedReliabilityMinSamples,
          interventionWindowMonths: input.options.interventionWindowMonths,
          interventionMinSampleMonths: input.options.interventionMinSampleMonths,
          interventionComparisonRouteCount: input.options.interventionComparisonRouteCount,
          corridorHotspotLimit: input.options.corridorHotspotLimit,
          artifactRoot,
          exportRoot,
        }),
    });
  },
});
