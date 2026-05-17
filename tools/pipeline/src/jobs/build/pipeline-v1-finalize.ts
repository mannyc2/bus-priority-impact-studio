import { type CliOption, falseOption, numberOption, trueOption } from "../../lib/cli-args.js";
import { fromCliPath } from "../../lib/paths.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";
import { checkPipelineV1 } from "../check/pipeline-v1.js";
import { verifyD1Export } from "../export/verify-d1-export.js";
import { backfillRouteRidershipTrends } from "../ingest/backfill-route-ridership-trends.js";
import { ingestRouteTrends } from "../ingest/ingest-route-trends.js";
import { buildBriefArtifacts } from "./brief-artifacts.js";
import { buildCorridorModel } from "./corridor-model.js";
import { buildCorridorShapeReview } from "./corridor-shape-review.js";
import { buildEvaluationArtifacts } from "./evaluation-artifacts.js";
import { buildMapArtifacts } from "./map-artifacts.js";
import { buildObservedHeadways } from "./observed-headways.js";
import { buildRouteBatchAudit } from "./route-batch-audit.js";
import { buildRouteInterventionEvaluation } from "./route-intervention-evaluation.js";
import { buildRouteObservedReliability } from "./route-observed-reliability.js";

type PipelineV1FinalizeArgs = {
  year?: number;
  month?: number;
  dbPath?: string;
  trendStartYear?: number;
  trendStartMonth?: number;
  refreshTrends?: boolean;
  backfillRidership?: boolean;
  ridershipBackfillLimit?: number;
  ridershipBackfillConcurrency?: number;
  runId?: string;
  buildObservedHeadways?: boolean;
  allowInsufficientGtfsRt?: boolean;
  minObservedHeadwaySamples?: number;
  minObservedRouteCount?: number;
  minObservedRouteShare?: number;
  minGtfsRtCollectionHours?: number;
  maxGtfsRtSampleSeconds?: number;
  minGtfsRtVehiclePositionSnapshotShare?: number;
  artifactRoot?: string;
  exportRoot?: string;
};

type PipelineV1FinalizeResult = {
  isoMonth: string;
  trendWindow: {
    startYear: number;
    startMonth: number;
    endYear: number;
    endMonth: number;
  };
  gtfsRtRunId: string;
  strictGtfsRt: boolean;
  trendRefresh: Awaited<ReturnType<typeof ingestRouteTrends>> | null;
  ridershipBackfills: Awaited<ReturnType<typeof backfillRouteRidershipTrends>>[];
  observedHeadways: Awaited<ReturnType<typeof buildObservedHeadways>> | null;
  observedReliability: Awaited<ReturnType<typeof buildRouteObservedReliability>>;
  interventionEvaluation: Awaited<ReturnType<typeof buildRouteInterventionEvaluation>>;
  corridorModel: Awaited<ReturnType<typeof buildCorridorModel>>;
  corridorShapeReview: Awaited<ReturnType<typeof buildCorridorShapeReview>>;
  evaluationArtifacts: Awaited<ReturnType<typeof buildEvaluationArtifacts>>;
  mapArtifacts: Awaited<ReturnType<typeof buildMapArtifacts>>;
  briefArtifacts: Awaited<ReturnType<typeof buildBriefArtifacts>>;
  audit: Awaited<ReturnType<typeof buildRouteBatchAudit>>;
  d1: Awaited<ReturnType<typeof verifyD1Export>>;
  check: Awaited<ReturnType<typeof checkPipelineV1>>;
};

type PipelineV1FinalizeDeps = {
  ingestRouteTrends: typeof ingestRouteTrends;
  backfillRouteRidershipTrends: typeof backfillRouteRidershipTrends;
  buildObservedHeadways: typeof buildObservedHeadways;
  buildRouteObservedReliability: typeof buildRouteObservedReliability;
  buildRouteInterventionEvaluation: typeof buildRouteInterventionEvaluation;
  buildCorridorModel: typeof buildCorridorModel;
  buildCorridorShapeReview: typeof buildCorridorShapeReview;
  buildEvaluationArtifacts: typeof buildEvaluationArtifacts;
  buildMapArtifacts: typeof buildMapArtifacts;
  buildBriefArtifacts: typeof buildBriefArtifacts;
  buildRouteBatchAudit: typeof buildRouteBatchAudit;
  verifyD1Export: typeof verifyD1Export;
  checkPipelineV1: typeof checkPipelineV1;
};

const defaultPipelineV1FinalizeDeps: PipelineV1FinalizeDeps = {
  ingestRouteTrends,
  backfillRouteRidershipTrends,
  buildObservedHeadways,
  buildRouteObservedReliability,
  buildRouteInterventionEvaluation,
  buildCorridorModel,
  buildCorridorShapeReview,
  buildEvaluationArtifacts,
  buildMapArtifacts,
  buildBriefArtifacts,
  buildRouteBatchAudit,
  verifyD1Export,
  checkPipelineV1,
};

function parseCliArgs(args: string[]): PipelineV1FinalizeArgs {
  const extraOptions: CliOption<PipelineV1FinalizeArgs>[] = [
    numberOption(["--trend-start-year"], (output, value) => {
      output.trendStartYear = value;
    }),
    numberOption(["--trend-start-month"], (output, value) => {
      output.trendStartMonth = value;
    }),
    falseOption(["--no-trends"], (output) => {
      output.refreshTrends = false;
    }),
    falseOption(["--no-ridership-backfill"], (output) => {
      output.backfillRidership = false;
    }),
    numberOption(["--ridership-limit"], (output, value) => {
      output.ridershipBackfillLimit = value;
    }),
    numberOption(["--ridership-concurrency"], (output, value) => {
      output.ridershipBackfillConcurrency = value;
    }),
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.runId = value;
        }
      },
    },
    falseOption(["--skip-observed-headways"], (output) => {
      output.buildObservedHeadways = false;
    }),
    trueOption(["--allow-insufficient-gtfs-rt"], (output) => {
      output.allowInsufficientGtfsRt = true;
    }),
    numberOption(["--min-observed-headway-samples"], (output, value) => {
      output.minObservedHeadwaySamples = value;
    }),
    numberOption(["--min-observed-route-count"], (output, value) => {
      output.minObservedRouteCount = value;
    }),
    numberOption(["--min-observed-route-share"], (output, value) => {
      output.minObservedRouteShare = value;
    }),
    numberOption(["--min-gtfs-rt-collection-hours"], (output, value) => {
      output.minGtfsRtCollectionHours = value;
    }),
    numberOption(["--max-gtfs-rt-sample-seconds"], (output, value) => {
      output.maxGtfsRtSampleSeconds = value;
    }),
    numberOption(["--min-gtfs-rt-vehicle-position-snapshot-share"], (output, value) => {
      output.minGtfsRtVehiclePositionSnapshotShare = value;
    }),
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.artifactRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--export-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.exportRoot = fromCliPath(value);
        }
      },
    },
  ];

  return parseMonthDbCliArgs(args, {} as PipelineV1FinalizeArgs, extraOptions);
}

function trendWindow(args: PipelineV1FinalizeArgs, endYear: number, endMonth: number) {
  return {
    startYear: args.trendStartYear ?? 2025,
    startMonth: args.trendStartMonth ?? 1,
    endYear,
    endMonth,
  };
}

function requireGtfsRtRunId(args: PipelineV1FinalizeArgs, isoMonth: string): string {
  if (args.runId !== undefined && args.runId.length > 0) {
    return args.runId;
  }
  if (args.allowInsufficientGtfsRt) {
    return `insufficient-gtfs-rt-${isoMonth}`;
  }

  throw new Error("Missing required argument: --run-id, or pass --allow-insufficient-gtfs-rt.");
}

export async function finalizePipelineV1(
  args: PipelineV1FinalizeArgs = {},
  deps: PipelineV1FinalizeDeps = defaultPipelineV1FinalizeDeps,
): Promise<PipelineV1FinalizeResult> {
  const options = createMonthContext(args);
  const window = trendWindow(args, options.year, options.month);
  const monthArgs = {
    year: options.year,
    month: options.month,
    dbPath: options.dbPath,
  };
  const rangeArgs = {
    ...window,
    dbPath: options.dbPath,
  };
  const refreshTrends = args.refreshTrends ?? true;
  const backfillRidership = args.backfillRidership ?? true;
  const ridershipBackfillLimit = Math.max(1, Math.round(args.ridershipBackfillLimit ?? 1000));
  const ridershipBackfillConcurrency = Math.max(
    1,
    Math.round(args.ridershipBackfillConcurrency ?? 8),
  );
  const gtfsRtRunId = requireGtfsRtRunId(args, options.isoMonth);
  const shouldBuildObservedHeadways = args.buildObservedHeadways ?? args.runId !== undefined;
  const strictGtfsRt = args.allowInsufficientGtfsRt !== true;

  const trendRefresh = refreshTrends
    ? await deps.ingestRouteTrends({
        ...rangeArgs,
        includeRidership: false,
      })
    : null;
  const ridershipBackfills: PipelineV1FinalizeResult["ridershipBackfills"] = [];
  if (backfillRidership) {
    for (;;) {
      const result = await deps.backfillRouteRidershipTrends({
        ...rangeArgs,
        limit: ridershipBackfillLimit,
        concurrency: ridershipBackfillConcurrency,
      });
      ridershipBackfills.push(result);
      if (result.remainingRidershipMissingCount === 0 || result.updatedRowCount === 0) {
        break;
      }
    }
  }

  const observedHeadways = shouldBuildObservedHeadways
    ? await deps.buildObservedHeadways({
        dbPath: options.dbPath,
        runId: gtfsRtRunId,
      })
    : null;
  const observedReliability = await deps.buildRouteObservedReliability({
    ...monthArgs,
    runId: gtfsRtRunId,
  });
  const interventionEvaluation = await deps.buildRouteInterventionEvaluation(monthArgs);
  const corridorModel = await deps.buildCorridorModel(monthArgs);
  const artifactMonthArgs =
    args.artifactRoot === undefined ? monthArgs : { ...monthArgs, artifactRoot: args.artifactRoot };
  const corridorShapeReview = await deps.buildCorridorShapeReview(artifactMonthArgs);
  const exportMonthArgs = {
    ...monthArgs,
    ...(args.artifactRoot === undefined ? {} : { artifactRoot: args.artifactRoot }),
    ...(args.exportRoot === undefined ? {} : { exportRoot: args.exportRoot }),
  };
  const evaluationArtifacts = await deps.buildEvaluationArtifacts(artifactMonthArgs);
  const mapArtifacts = await deps.buildMapArtifacts(artifactMonthArgs);
  const briefArtifacts = await deps.buildBriefArtifacts(artifactMonthArgs);
  const audit = await deps.buildRouteBatchAudit(artifactMonthArgs);
  const d1 = await deps.verifyD1Export(exportMonthArgs);
  const checkArgs = {
    ...monthArgs,
    ...(args.allowInsufficientGtfsRt === undefined
      ? {}
      : { allowInsufficientGtfsRt: args.allowInsufficientGtfsRt }),
    ...(args.minObservedHeadwaySamples === undefined
      ? {}
      : { minObservedHeadwaySamples: args.minObservedHeadwaySamples }),
    ...(args.minObservedRouteCount === undefined
      ? {}
      : { minObservedRouteCount: args.minObservedRouteCount }),
    ...(args.minObservedRouteShare === undefined
      ? {}
      : { minObservedRouteShare: args.minObservedRouteShare }),
    ...(args.minGtfsRtCollectionHours === undefined
      ? {}
      : { minGtfsRtCollectionHours: args.minGtfsRtCollectionHours }),
    ...(args.maxGtfsRtSampleSeconds === undefined
      ? {}
      : { maxGtfsRtSampleSeconds: args.maxGtfsRtSampleSeconds }),
    ...(args.minGtfsRtVehiclePositionSnapshotShare === undefined
      ? {}
      : { minGtfsRtVehiclePositionSnapshotShare: args.minGtfsRtVehiclePositionSnapshotShare }),
    ...(args.artifactRoot === undefined ? {} : { artifactRoot: args.artifactRoot }),
    ...(args.exportRoot === undefined ? {} : { exportRoot: args.exportRoot }),
  };
  const check = await deps.checkPipelineV1(checkArgs);

  if (check.status === "fail") {
    throw new Error(
      `Pipeline v1 finalization failed: ${check.issues.map((issue) => issue.code).join(", ")}`,
    );
  }

  return {
    isoMonth: options.isoMonth,
    trendWindow: window,
    gtfsRtRunId,
    strictGtfsRt,
    trendRefresh,
    ridershipBackfills,
    observedHeadways,
    observedReliability,
    interventionEvaluation,
    corridorModel,
    corridorShapeReview,
    evaluationArtifacts,
    mapArtifacts,
    briefArtifacts,
    audit,
    d1,
    check,
  };
}

export function finalizePipelineV1FromCli(args: string[]): Promise<PipelineV1FinalizeResult> {
  return finalizePipelineV1(parseCliArgs(args));
}
