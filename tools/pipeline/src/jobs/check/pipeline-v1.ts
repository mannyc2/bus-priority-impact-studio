import { join } from "node:path";
import {
  getRouteBatchStatus,
  listAceRoutes,
  listCorridorArtifacts,
  listCorridorInterventionContexts,
  listCorridorMonthSummaries,
  listCorridorRouteMembers,
  listGtfsRtCollectionRuns,
  listGtfsRtFeedSnapshots,
  listGtfsRtParsedSnapshots,
  listInterventionEvents,
  listObservedHeadwaySamples,
  listRouteArtifacts,
  listRouteBatchBuiltRoutes,
  listRouteBriefSummaries,
  listRouteCatalog,
  listRouteInterventionComparisons,
  listRouteMonthCoverage,
  listRouteMonthSourceStatuses,
  listRouteMonthTrends,
  listRouteObservedReliabilitySummaries,
  listRouteReadiness,
} from "@bp/db/local";
import { type CliOption, numberOption, trueOption } from "../../lib/cli-args.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";
import { fromRepoRoot } from "../../source-manifest.js";
import { readCorridorShapeReviewArtifact } from "../build/corridor-shape-review.js";
import { verifyEvaluationArtifactManifest } from "../build/evaluation-artifacts.js";
import { verifyMapArtifactManifest } from "../build/map-artifacts.js";
import { buildRouteBatchAudit } from "../build/route-batch-audit.js";
import { verifyD1Export } from "../export/verify-d1-export.js";

type PipelineV1CheckArgs = {
  year?: number;
  month?: number;
  dbPath?: string;
  allowInsufficientGtfsRt?: boolean;
  minObservedHeadwaySamples?: number;
  minObservedRouteCount?: number;
  minObservedRouteShare?: number;
  minGtfsRtCollectionHours?: number;
  maxGtfsRtSampleSeconds?: number;
  minGtfsRtVehiclePositionSnapshotShare?: number;
  maxCorridorAmbiguousRouteShare?: number;
  maxCorridorUnassignedRouteShare?: number;
  maxSourceProbeAgeDays?: number;
  sourceMetadataDir?: string;
  now?: Date;
  artifactRoot?: string;
  exportRoot?: string;
};

type CheckStatus = "pass" | "fail";

type PipelineV1Issue = {
  code: string;
  message: string;
};

type PipelineV1Counts = {
  routeCatalogRows: number;
  routeCoverageRows: number;
  routeReadinessRows: number;
  buildEligibleRouteCount: number;
  builtRouteCount: number;
  publicRouteCount: number;
  routeArtifactRows: number;
  routeObservedReliabilityRows: number;
  routeObservedReliabilityObservedRows: number;
  routeObservedReliabilityInsufficientRows: number;
  routeObservedReliabilityRequiredObservedRows: number;
  routeObservedReliabilityObservedRouteShare: number;
  routeObservedReliabilityBelowThresholdRows: number;
  routeObservedReliabilityHeadwaySampleCount: number;
  gtfsRtCollectionRunRows: number;
  gtfsRtCompletedCollectionRunRows: number;
  gtfsRtShortestCollectionSeconds: number;
  gtfsRtLongestSampleSeconds: number;
  gtfsRtFeedSnapshotRows: number;
  gtfsRtSuccessfulFeedSnapshotRows: number;
  gtfsRtSuccessfulVehiclePositionSnapshotRows: number;
  gtfsRtRequiredVehiclePositionSnapshotRows: number;
  gtfsRtCollectionRunMonthMismatchRows: number;
  gtfsRtFeedSnapshotMonthMismatchRows: number;
  gtfsRtParsedSnapshotRows: number;
  gtfsRtParsedVehiclePositionSnapshotRows: number;
  gtfsRtObservedHeadwaySampleRows: number;
  gtfsRtObservedHeadwaySampleMonthMismatchRows: number;
  observedReliabilitySourceStatusRows: number;
  aceRouteRows: number;
  interventionEventRows: number;
  routeInterventionComparisonRows: number;
  evaluatedInterventionComparisonRows: number;
  evaluatedInterventionComparisonRidershipDeltaRows: number;
  peerAdjustedInterventionComparisonRows: number;
  busLaneMatchedPublicRouteCount: number;
  busLaneInterventionComparisonRows: number;
  busLaneDatedInterventionComparisonRows: number;
  busLaneSourceGapComparisonRows: number;
  sourceProbeRows: number;
  sourceProbeFreshRows: number;
  sourceProbeMissingRows: number;
  sourceProbeStaleRows: number;
  sourceProbeInactiveRows: number;
  routeMonthTrendRows: number;
  routeMonthTrendSpeedRows: number;
  routeMonthTrendRidershipRows: number;
  corridorRows: number;
  corridorRouteMemberRows: number;
  corridorAssignedRouteMemberRows: number;
  corridorAmbiguousRouteMemberRows: number;
  corridorUnassignedRouteMemberRows: number;
  corridorSegmentEvidenceRouteMemberRows: number;
  corridorShapeReviewRouteRows: number;
  corridorShapeReviewPassRows: number;
  corridorShapeReviewWarningRows: number;
  corridorShapeReviewIncompleteRows: number;
  corridorShapeReviewMissingRouteRows: number;
  corridorInterventionContextRows: number;
  corridorAmbiguousRouteShare: number;
  corridorUnassignedRouteShare: number;
  corridorArtifactRows: number;
  routeBatchIssueRows: number;
  evaluationArtifactRows: number;
  evaluationArtifactIssueRows: number;
  mapArtifactRows: number;
  mapRouteSegmentArtifactRows: number;
  mapArtifactIssueRows: number;
};

type PipelineV1CheckResult = {
  isoMonth: string;
  status: CheckStatus;
  issueCount: number;
  issues: PipelineV1Issue[];
  counts: PipelineV1Counts;
  audit: {
    status: CheckStatus;
    manifestPath: string;
    artifactCount: number;
    missingArtifactCount: number;
    hashMismatchCount: number;
    byteLengthMismatchCount: number;
  };
  d1: {
    status: CheckStatus;
    routeArtifactRows: number;
    corridorArtifactRows: number;
    routeObservedReliabilityRows: number;
    routeInterventionComparisonRows: number;
    corridorInterventionContextRows: number;
    routeMonthTrendRows: number;
  } | null;
};

const defaultMinObservedHeadwaySamples = 1;
const defaultMinObservedRouteShare = 0.9;
const defaultMinGtfsRtCollectionHours = 4;
const defaultMaxGtfsRtSampleSeconds = 60;
const defaultMinGtfsRtVehiclePositionSnapshotShare = 0.8;
const defaultMaxCorridorAmbiguousRouteShare = 0.15;
const defaultMaxCorridorUnassignedRouteShare = 0.02;
const busLaneSourceId = "nyc_dot_bus_lanes";
const defaultMaxSourceProbeAgeDays = 45;
const requiredV1SourceProbeIds = [
  "bus_segment_speeds_2025",
  "current_bus_routes",
  "current_bus_stops",
  "bus_hourly_ridership_2025",
  "bus_schedules_2026",
  "ace_routes",
  "ace_violations",
  "nyc_dot_bus_lanes_local_streets",
  "nyc_borough_boundaries",
  "census_acs5_profile_tracts",
] as const;

type SourceProbeFreshnessRow = {
  sourceId: string;
  status: "fresh" | "missing" | "stale" | "inactive";
  checkedAt: string | null;
  ageDays: number | null;
  probeStatus: string | null;
};

function parseCliArgs(args: string[]): PipelineV1CheckArgs {
  const extraOptions: CliOption<PipelineV1CheckArgs>[] = [
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
    numberOption(["--max-corridor-ambiguous-route-share"], (output, value) => {
      output.maxCorridorAmbiguousRouteShare = value;
    }),
    numberOption(["--max-corridor-unassigned-route-share"], (output, value) => {
      output.maxCorridorUnassignedRouteShare = value;
    }),
    numberOption(["--max-source-probe-age-days"], (output, value) => {
      output.maxSourceProbeAgeDays = value;
    }),
    {
      flags: ["--source-metadata-dir"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.sourceMetadataDir = fromCliPath(value);
        }
      },
    },
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

  return parseMonthDbCliArgs(args, {} as PipelineV1CheckArgs, extraOptions);
}

function addIssue(issues: PipelineV1Issue[], code: string, message: string): void {
  issues.push({ code, message });
}

function missingMembers(expected: readonly string[], actual: Iterable<string>): string[] {
  const actualSet = new Set(actual);
  return expected.filter((value) => !actualSet.has(value));
}

function sample(values: readonly string[], limit = 5): string {
  return values.slice(0, limit).join(", ");
}

function tableCount(tableCounts: Record<string, number>, tableName: string): number {
  return tableCounts[tableName] ?? 0;
}

function unique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatPercent(value: number): string {
  return `${round(value * 100, 1)}%`;
}

function clampShare(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function collectionElapsedSeconds(input: {
  startedAt: string;
  endedAt: string | null;
}): number | null {
  if (input.endedAt === null) {
    return null;
  }

  const startedAt = Date.parse(input.startedAt);
  const endedAt = Date.parse(input.endedAt);
  if (Number.isNaN(startedAt) || Number.isNaN(endedAt)) {
    return null;
  }

  return Math.max(0, Math.round((endedAt - startedAt) / 1000));
}

function collectionWindowSeconds(input: {
  requestedDurationSeconds: number;
  sampleSeconds: number;
  startedAt: string;
  endedAt: string | null;
}): number {
  const elapsedSeconds = collectionElapsedSeconds(input);
  if (elapsedSeconds === null) {
    return Math.max(0, input.requestedDurationSeconds);
  }

  const coveredSeconds = elapsedSeconds + Math.max(1, input.sampleSeconds);
  return Math.min(Math.max(0, input.requestedDurationSeconds), coveredSeconds);
}

function monthTimeBounds(input: { year: number; month: number }): {
  startMilliseconds: number;
  endMilliseconds: number;
} {
  return {
    startMilliseconds: Date.UTC(input.year, input.month - 1, 1, 0, 0, 0),
    endMilliseconds: Date.UTC(input.year, input.month, 1, 0, 0, 0),
  };
}

function parsedDateMilliseconds(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function dateStringInMonth(
  value: string,
  bounds: { startMilliseconds: number; endMilliseconds: number },
): boolean {
  const timestamp = parsedDateMilliseconds(value);
  return (
    timestamp !== null &&
    timestamp >= bounds.startMilliseconds &&
    timestamp < bounds.endMilliseconds
  );
}

function collectionRunOverlapsMonth(
  input: { startedAt: string; endedAt: string | null },
  bounds: { startMilliseconds: number; endMilliseconds: number },
): boolean {
  const startedAt = parsedDateMilliseconds(input.startedAt);
  const endedAt = parsedDateMilliseconds(input.endedAt);
  if (startedAt === null) {
    return false;
  }

  const effectiveEndedAt = endedAt ?? startedAt;
  return startedAt < bounds.endMilliseconds && effectiveEndedAt >= bounds.startMilliseconds;
}

function unixSecondsInMonth(
  timestampSeconds: number,
  bounds: { startMilliseconds: number; endMilliseconds: number },
): boolean {
  const timestampMilliseconds = timestampSeconds * 1000;
  return (
    timestampMilliseconds >= bounds.startMilliseconds &&
    timestampMilliseconds < bounds.endMilliseconds
  );
}

function requestedFeedTypes(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );
}

function requiredVehiclePositionSnapshotCount(input: {
  collectionSeconds: number;
  sampleSeconds: number;
  snapshotShare: number;
}): number {
  if (input.snapshotShare <= 0) {
    return 0;
  }

  const sampleSeconds = Math.max(1, input.sampleSeconds);
  return Math.max(1, Math.ceil((input.collectionSeconds / sampleSeconds) * input.snapshotShare));
}

function sourceMetadataDir(path: string | undefined): string {
  return path ?? fromRepoRoot(join("knowledge/raw/metadata"));
}

function ageDays(checkedAt: string, now: Date): number | null {
  const timestamp = Date.parse(checkedAt);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return Math.max(0, Math.floor((now.getTime() - timestamp) / (24 * 60 * 60 * 1000)));
}

async function sourceProbeFreshnessRows(input: {
  metadataDir: string;
  maxAgeDays: number;
  now: Date;
}): Promise<SourceProbeFreshnessRow[]> {
  const rows: SourceProbeFreshnessRow[] = [];

  for (const sourceId of requiredV1SourceProbeIds) {
    const file = Bun.file(join(input.metadataDir, `${sourceId}.json`));
    if (!(await file.exists())) {
      rows.push({
        sourceId,
        status: "missing",
        checkedAt: null,
        ageDays: null,
        probeStatus: null,
      });
      continue;
    }

    const parsed = (await file.json()) as {
      checkedAt?: unknown;
      probeStatus?: unknown;
    };
    const checkedAt = typeof parsed.checkedAt === "string" ? parsed.checkedAt : null;
    const probeStatus = typeof parsed.probeStatus === "string" ? parsed.probeStatus : null;
    const probeAgeDays = checkedAt === null ? null : ageDays(checkedAt, input.now);
    const status =
      probeStatus !== "active" || probeAgeDays === null
        ? "inactive"
        : probeAgeDays > input.maxAgeDays
          ? "stale"
          : "fresh";

    rows.push({
      sourceId,
      status,
      checkedAt,
      ageDays: probeAgeDays,
      probeStatus,
    });
  }

  return rows;
}

export async function checkPipelineV1(
  args: PipelineV1CheckArgs = {},
): Promise<PipelineV1CheckResult> {
  const options = createMonthContext(args);
  const month = options.isoMonth;
  const minObservedHeadwaySamples = Math.max(
    1,
    Math.round(args.minObservedHeadwaySamples ?? defaultMinObservedHeadwaySamples),
  );
  const minObservedRouteShare = clampShare(
    args.minObservedRouteShare ?? defaultMinObservedRouteShare,
  );
  const minGtfsRtCollectionSeconds = Math.max(
    1,
    Math.round((args.minGtfsRtCollectionHours ?? defaultMinGtfsRtCollectionHours) * 60 * 60),
  );
  const maxGtfsRtSampleSeconds = Math.max(
    1,
    Math.round(args.maxGtfsRtSampleSeconds ?? defaultMaxGtfsRtSampleSeconds),
  );
  const minGtfsRtVehiclePositionSnapshotShare = clampShare(
    args.minGtfsRtVehiclePositionSnapshotShare ?? defaultMinGtfsRtVehiclePositionSnapshotShare,
  );
  const minObservedRouteCountOverride =
    args.minObservedRouteCount === undefined
      ? 0
      : Math.max(0, Math.round(args.minObservedRouteCount));
  const maxCorridorAmbiguousRouteShare = clampShare(
    args.maxCorridorAmbiguousRouteShare ?? defaultMaxCorridorAmbiguousRouteShare,
  );
  const maxCorridorUnassignedRouteShare = clampShare(
    args.maxCorridorUnassignedRouteShare ?? defaultMaxCorridorUnassignedRouteShare,
  );
  const maxSourceProbeAgeDays = Math.max(
    1,
    Math.round(args.maxSourceProbeAgeDays ?? defaultMaxSourceProbeAgeDays),
  );
  const sourceFreshness = await sourceProbeFreshnessRows({
    metadataDir: sourceMetadataDir(args.sourceMetadataDir),
    maxAgeDays: maxSourceProbeAgeDays,
    now: args.now ?? new Date(),
  });
  const audit = await buildRouteBatchAudit({
    year: options.year,
    month: options.month,
    dbPath: options.dbPath,
    ...(args.artifactRoot === undefined ? {} : { artifactRoot: args.artifactRoot }),
  });
  const corridorShapeReview = await readCorridorShapeReviewArtifact({
    artifactRoot: args.artifactRoot ?? defaultArtifactRootPath(),
    month,
  });
  const localState = await withLocalPipelineDb(options.dbPath, async (local) => {
    const [
      catalog,
      coverage,
      readiness,
      builtRoutes,
      routeBriefs,
      routeArtifacts,
      observedReliability,
      sourceStatuses,
      aceRoutes,
      interventionEvents,
      interventionComparisons,
      routeMonthTrends,
      corridors,
      corridorMembers,
      corridorInterventionContexts,
      corridorArtifacts,
      batchStatus,
    ] = await Promise.all([
      listRouteCatalog(local.db),
      listRouteMonthCoverage(local.db, month),
      listRouteReadiness(local.db, month),
      listRouteBatchBuiltRoutes(local.db, month),
      listRouteBriefSummaries(local.db, month),
      listRouteArtifacts(local.db, month),
      listRouteObservedReliabilitySummaries(local.db, month),
      listRouteMonthSourceStatuses(local.db, month),
      listAceRoutes(local.db),
      listInterventionEvents(local.db),
      listRouteInterventionComparisons(local.db, month),
      listRouteMonthTrends(local.db),
      listCorridorMonthSummaries(local.db, month),
      listCorridorRouteMembers(local.db, month),
      listCorridorInterventionContexts(local.db, month),
      listCorridorArtifacts(local.db, month),
      getRouteBatchStatus(local.db, month),
    ]);

    return {
      catalog,
      coverage,
      readiness,
      builtRoutes,
      routeBriefs,
      routeArtifacts,
      observedReliability,
      sourceStatuses,
      aceRoutes,
      interventionEvents,
      interventionComparisons,
      routeMonthTrends,
      corridors,
      corridorMembers,
      corridorInterventionContexts,
      corridorArtifacts,
      batchStatus,
    };
  });
  const publicRouteIds = localState.routeBriefs
    .filter((row) => row.publicVisible)
    .map((row) => row.routeId);
  const buildEligibleRouteIds = localState.readiness
    .filter((row) => row.buildEligible)
    .map((row) => row.routeId);
  const observedRouteIds = new Set(localState.observedReliability.map((row) => row.routeId));
  const corridorRouteIds = new Set(localState.corridorMembers.map((row) => row.routeId));
  const routeArtifactsByRoute = new Map<string, number>();
  for (const row of localState.routeArtifacts) {
    routeArtifactsByRoute.set(row.routeId, (routeArtifactsByRoute.get(row.routeId) ?? 0) + 1);
  }
  const corridorArtifactsByCorridor = new Map<string, number>();
  for (const row of localState.corridorArtifacts) {
    corridorArtifactsByCorridor.set(
      row.corridorId,
      (corridorArtifactsByCorridor.get(row.corridorId) ?? 0) + 1,
    );
  }
  const observedReliabilitySourceStatusRows = localState.sourceStatuses.filter(
    (row) =>
      row.sourceScope === "reliability" &&
      ["observedHeadways", "bunching", "waitTimeReliability"].includes(row.sourceId),
  ).length;
  const observedReliabilityObservedRows = localState.observedReliability.filter(
    (row) => row.reliabilityStatus === "observed",
  ).length;
  const observedReliabilityInsufficientRows = localState.observedReliability.filter(
    (row) => row.reliabilityStatus === "insufficient_gtfs_rt_samples",
  ).length;
  const observedReliabilityRequiredObservedRows =
    publicRouteIds.length === 0
      ? 0
      : Math.max(
          minObservedRouteCountOverride,
          Math.ceil(publicRouteIds.length * minObservedRouteShare),
        );
  const observedReliabilityObservedRouteShare =
    publicRouteIds.length === 0
      ? 0
      : round(observedReliabilityObservedRows / publicRouteIds.length);
  const observedReliabilityBelowThresholdRows = localState.observedReliability.filter(
    (row) => row.reliabilityStatus === "observed" && row.sampleCount < row.minSampleThreshold,
  ).length;
  const observedReliabilityHeadwaySampleCount = localState.observedReliability.reduce(
    (sum, row) => sum + row.sampleCount,
    0,
  );
  const observedReliabilityRunIds = unique(
    localState.observedReliability
      .filter((row) => row.reliabilityStatus === "observed")
      .map((row) => row.runId),
  );
  const gtfsRtState = await withLocalPipelineDb(options.dbPath, async (local) => {
    const collectionRuns = (await listGtfsRtCollectionRuns(local.db)).filter((row) =>
      observedReliabilityRunIds.includes(row.runId),
    );
    const feedSnapshots = (
      await Promise.all(
        observedReliabilityRunIds.map((runId) => listGtfsRtFeedSnapshots(local.db, runId)),
      )
    ).flat();
    const parsedSnapshots = (
      await Promise.all(
        observedReliabilityRunIds.map((runId) => listGtfsRtParsedSnapshots(local.db, runId)),
      )
    ).flat();
    const observedHeadwaySamples = (
      await Promise.all(
        observedReliabilityRunIds.map((runId) => listObservedHeadwaySamples(local.db, runId)),
      )
    ).flat();

    return { collectionRuns, feedSnapshots, parsedSnapshots, observedHeadwaySamples };
  });
  const completedGtfsRtCollectionRunCount = gtfsRtState.collectionRuns.filter((row) =>
    ["completed", "completed_with_errors"].includes(row.status),
  ).length;
  const monthBounds = monthTimeBounds({ year: options.year, month: options.month });
  const gtfsRtCollectionRunMonthMismatchRows = gtfsRtState.collectionRuns.filter(
    (row) => !collectionRunOverlapsMonth(row, monthBounds),
  );
  const successfulGtfsRtFeedSnapshotCount = gtfsRtState.feedSnapshots.filter(
    (row) => row.status === "ok",
  ).length;
  const successfulGtfsRtVehiclePositionSnapshots = gtfsRtState.feedSnapshots.filter(
    (row) => row.status === "ok" && row.feedType === "vehicle_positions",
  );
  const successfulGtfsRtVehiclePositionSnapshotCount =
    successfulGtfsRtVehiclePositionSnapshots.length;
  const gtfsRtFeedSnapshotMonthMismatchRows = successfulGtfsRtVehiclePositionSnapshots.filter(
    (row) => !dateStringInMonth(row.fetchedAt, monthBounds),
  );
  const gtfsRtObservedHeadwaySampleMonthMismatchRows = gtfsRtState.observedHeadwaySamples.filter(
    (row) => !unixSecondsInMonth(row.observedTimestamp, monthBounds),
  );
  const successfulVehiclePositionSnapshotsByRun = new Map<string, number>();
  for (const snapshot of successfulGtfsRtVehiclePositionSnapshots) {
    successfulVehiclePositionSnapshotsByRun.set(
      snapshot.runId,
      (successfulVehiclePositionSnapshotsByRun.get(snapshot.runId) ?? 0) + 1,
    );
  }
  const collectionWindows = gtfsRtState.collectionRuns.map((run) => ({
    runId: run.runId,
    collectionSeconds: collectionWindowSeconds(run),
    sampleSeconds: run.sampleSeconds,
    requestedFeedTypes: requestedFeedTypes(run.requestedFeedTypes),
    successfulVehiclePositionSnapshots: successfulVehiclePositionSnapshotsByRun.get(run.runId) ?? 0,
  }));
  const collectionWindowsWithVehiclePositions = collectionWindows.filter((run) =>
    run.requestedFeedTypes.has("vehicle_positions"),
  );
  const gtfsRtShortestCollectionSeconds =
    collectionWindows.length === 0
      ? 0
      : Math.min(...collectionWindows.map((run) => run.collectionSeconds));
  const gtfsRtLongestSampleSeconds =
    collectionWindows.length === 0
      ? 0
      : Math.max(...collectionWindows.map((run) => run.sampleSeconds));
  const requiredGtfsRtVehiclePositionSnapshotRows =
    collectionWindowsWithVehiclePositions.length === 0
      ? 0
      : collectionWindowsWithVehiclePositions.reduce(
          (sum, run) =>
            sum +
            requiredVehiclePositionSnapshotCount({
              collectionSeconds: minGtfsRtCollectionSeconds,
              sampleSeconds: run.sampleSeconds,
              snapshotShare: minGtfsRtVehiclePositionSnapshotShare,
            }),
          0,
        );
  const lowVehiclePositionSnapshotCoverageRuns = collectionWindowsWithVehiclePositions
    .map((run) => ({
      runId: run.runId,
      actual: run.successfulVehiclePositionSnapshots,
      required: requiredVehiclePositionSnapshotCount({
        collectionSeconds: minGtfsRtCollectionSeconds,
        sampleSeconds: run.sampleSeconds,
        snapshotShare: minGtfsRtVehiclePositionSnapshotShare,
      }),
    }))
    .filter((run) => run.actual < run.required);
  const parsedVehiclePositionSnapshotCount = gtfsRtState.parsedSnapshots.filter(
    (row) => row.status === "parsed" && row.feedType === "vehicle_positions",
  ).length;
  const evaluatedInterventionComparisonRows = localState.interventionComparisons.filter(
    (row) => row.comparisonStatus === "evaluated",
  ).length;
  const evaluatedInterventionComparisonRidershipDeltaRows =
    localState.interventionComparisons.filter(
      (row) => row.comparisonStatus === "evaluated" && row.ridershipDelta !== null,
    ).length;
  const peerAdjustedInterventionComparisonRows = localState.interventionComparisons.filter(
    (row) =>
      row.comparisonStatus === "evaluated" &&
      row.evaluationLevel === "peer_adjusted_before_after" &&
      row.comparisonRouteCount > 0 &&
      row.adjustedSpeedDeltaMph !== null,
  ).length;
  const busLaneMatchedPublicRouteIds = localState.routeBriefs
    .filter((row) => row.publicVisible && row.busLaneMatchedLaneCount > 0)
    .map((row) => row.routeId);
  const busLaneInterventionComparisons = localState.interventionComparisons.filter(
    (row) => row.sourceId === busLaneSourceId,
  );
  const busLaneComparisonRouteIds = new Set(
    busLaneInterventionComparisons.map((row) => row.routeId),
  );
  const busLaneSourceGapComparisonRows = busLaneInterventionComparisons.filter((row) =>
    row.comparisonStatus.startsWith("source_gap_"),
  ).length;
  const busLaneDatedInterventionComparisonRows =
    busLaneInterventionComparisons.length - busLaneSourceGapComparisonRows;
  const routeMonthTrendSpeedRows = localState.routeMonthTrends.filter(
    (row) => row.hasSpeedTrend,
  ).length;
  const routeMonthTrendRidershipRows = localState.routeMonthTrends.filter(
    (row) => row.hasRidershipTrend,
  ).length;
  const corridorAssignedRouteMemberRows = localState.corridorMembers.filter(
    (row) => row.assignmentStatus === "assigned",
  ).length;
  const corridorAmbiguousRouteMemberRows = localState.corridorMembers.filter(
    (row) => row.assignmentStatus === "ambiguous",
  ).length;
  const corridorUnassignedRouteMemberRows = localState.corridorMembers.filter(
    (row) => row.assignmentStatus === "unassigned",
  ).length;
  const corridorSegmentEvidenceRouteMemberRows = localState.corridorMembers.filter(
    (row) => row.matchedSegmentCount > 0,
  ).length;
  const corridorShapeReviewRows = corridorShapeReview?.routes ?? [];
  const corridorShapeReviewPassRows = corridorShapeReviewRows.filter(
    (row) => row.reviewStatus === "pass",
  ).length;
  const corridorShapeReviewWarningRows = corridorShapeReviewRows.filter(
    (row) => row.reviewStatus === "shape_distance_warning",
  ).length;
  const corridorShapeReviewIncompleteRows = corridorShapeReviewRows.filter(
    (row) =>
      row.matchedSegmentCount > 0 &&
      row.assignmentStatus !== "unassigned" &&
      row.reviewStatus !== "pass",
  ).length;
  const segmentBackedCorridorRouteIds = unique(
    localState.corridorMembers
      .filter((row) => publicRouteIds.includes(row.routeId) && row.matchedSegmentCount > 0)
      .map((row) => row.routeId),
  );
  const corridorShapeReviewRouteIds = new Set(corridorShapeReviewRows.map((row) => row.routeId));
  const corridorShapeReviewMissingRoutes = missingMembers(
    segmentBackedCorridorRouteIds,
    corridorShapeReviewRouteIds,
  );
  const corridorInterventionRouteIds = new Set(
    localState.corridorInterventionContexts.map((row) => row.routeId),
  );
  const evaluationArtifacts = await verifyEvaluationArtifactManifest({
    artifactRoot: args.artifactRoot ?? defaultArtifactRootPath(),
    month,
    expectedRowCounts: {
      observedReliability: localState.observedReliability.length,
      routeInterventionComparisons: localState.interventionComparisons.length,
      corridorInterventionContexts: localState.corridorInterventionContexts.length,
    },
  });
  const mapArtifacts = await verifyMapArtifactManifest({
    artifactRoot: args.artifactRoot ?? defaultArtifactRootPath(),
    month,
    expectedRouteIds: publicRouteIds,
  });
  const corridorAmbiguousRouteShare =
    publicRouteIds.length === 0
      ? 0
      : round(corridorAmbiguousRouteMemberRows / publicRouteIds.length);
  const corridorUnassignedRouteShare =
    publicRouteIds.length === 0
      ? 0
      : round(corridorUnassignedRouteMemberRows / publicRouteIds.length);
  const missingSourceProbeRows = sourceFreshness.filter((row) => row.status === "missing");
  const staleSourceProbeRows = sourceFreshness.filter((row) => row.status === "stale");
  const inactiveSourceProbeRows = sourceFreshness.filter((row) => row.status === "inactive");
  const issues: PipelineV1Issue[] = [];

  if (missingSourceProbeRows.length > 0) {
    addIssue(
      issues,
      "source_probe_metadata_missing",
      `${missingSourceProbeRows.length} required v1 source probe captures are missing: ${sample(missingSourceProbeRows.map((row) => row.sourceId))}.`,
    );
  }
  if (staleSourceProbeRows.length > 0) {
    addIssue(
      issues,
      "source_probe_metadata_stale",
      `${staleSourceProbeRows.length} required v1 source probe captures are older than ${maxSourceProbeAgeDays} days: ${sample(staleSourceProbeRows.map((row) => `${row.sourceId}:${row.ageDays ?? "unknown"}d`))}.`,
    );
  }
  if (inactiveSourceProbeRows.length > 0) {
    addIssue(
      issues,
      "source_probe_metadata_inactive",
      `${inactiveSourceProbeRows.length} required v1 source probe captures are not active or have invalid checkedAt values: ${sample(inactiveSourceProbeRows.map((row) => row.sourceId))}.`,
    );
  }

  if (localState.catalog.length === 0) {
    addIssue(issues, "route_catalog_missing", "No route catalog rows exist.");
  }
  if (localState.coverage.length < publicRouteIds.length) {
    addIssue(
      issues,
      "route_coverage_incomplete",
      `Route/month coverage has ${localState.coverage.length} rows for ${publicRouteIds.length} public routes.`,
    );
  }
  if (buildEligibleRouteIds.length === 0) {
    addIssue(issues, "build_eligible_routes_missing", "No build-eligible route rows exist.");
  }
  if (localState.batchStatus?.status !== "pass") {
    addIssue(
      issues,
      "route_batch_status_not_pass",
      `Route batch status is ${localState.batchStatus?.status ?? "missing"}.`,
    );
  }
  if (localState.builtRoutes.length < buildEligibleRouteIds.length) {
    addIssue(
      issues,
      "built_route_count_incomplete",
      `Only ${localState.builtRoutes.length} built routes for ${buildEligibleRouteIds.length} build-eligible routes.`,
    );
  }
  if (publicRouteIds.length === 0) {
    addIssue(issues, "public_route_briefs_missing", "No public-visible route brief rows exist.");
  }

  const routesMissingObserved = missingMembers(publicRouteIds, observedRouteIds);
  if (routesMissingObserved.length > 0) {
    addIssue(
      issues,
      "observed_reliability_missing",
      `${routesMissingObserved.length} public routes lack observed reliability rows: ${sample(routesMissingObserved)}.`,
    );
  }
  if (observedReliabilitySourceStatusRows < publicRouteIds.length * 3) {
    addIssue(
      issues,
      "observed_reliability_source_status_incomplete",
      `Observed reliability source-status rows are ${observedReliabilitySourceStatusRows}; expected at least ${publicRouteIds.length * 3}.`,
    );
  }
  if (!args.allowInsufficientGtfsRt && observedReliabilityObservedRows === 0) {
    addIssue(
      issues,
      "observed_reliability_no_observed_routes",
      `No public routes have observed GTFS-RT reliability; ${observedReliabilityInsufficientRows} routes are marked insufficient.`,
    );
  }
  if (
    !args.allowInsufficientGtfsRt &&
    observedReliabilityObservedRows < observedReliabilityRequiredObservedRows
  ) {
    addIssue(
      issues,
      "observed_reliability_route_coverage_insufficient",
      `${observedReliabilityObservedRows} public routes have observed GTFS-RT reliability; expected at least ${observedReliabilityRequiredObservedRows} (${formatPercent(minObservedRouteShare)} of ${publicRouteIds.length}).`,
    );
  }
  if (!args.allowInsufficientGtfsRt && observedReliabilityBelowThresholdRows > 0) {
    addIssue(
      issues,
      "observed_reliability_observed_samples_below_threshold",
      `${observedReliabilityBelowThresholdRows} observed reliability rows have sample counts below their per-route minimum thresholds.`,
    );
  }
  if (
    !args.allowInsufficientGtfsRt &&
    observedReliabilityHeadwaySampleCount < minObservedHeadwaySamples
  ) {
    addIssue(
      issues,
      "observed_reliability_sample_coverage_insufficient",
      `Observed GTFS-RT headway samples total ${observedReliabilityHeadwaySampleCount}; expected at least ${minObservedHeadwaySamples}.`,
    );
  }
  const missingGtfsRtRunIds = missingMembers(
    observedReliabilityRunIds,
    gtfsRtState.collectionRuns.map((row) => row.runId),
  );
  if (!args.allowInsufficientGtfsRt && missingGtfsRtRunIds.length > 0) {
    addIssue(
      issues,
      "gtfs_rt_collection_run_missing",
      `Observed reliability references GTFS-RT run IDs without collection rows: ${sample(missingGtfsRtRunIds)}.`,
    );
  }
  if (
    !args.allowInsufficientGtfsRt &&
    observedReliabilityRunIds.length > 0 &&
    completedGtfsRtCollectionRunCount < observedReliabilityRunIds.length
  ) {
    addIssue(
      issues,
      "gtfs_rt_collection_run_not_completed",
      `${completedGtfsRtCollectionRunCount} completed GTFS-RT collection runs for ${observedReliabilityRunIds.length} observed reliability run IDs.`,
    );
  }
  if (
    !args.allowInsufficientGtfsRt &&
    observedReliabilityRunIds.length > 0 &&
    gtfsRtCollectionRunMonthMismatchRows.length > 0
  ) {
    addIssue(
      issues,
      "gtfs_rt_collection_month_mismatch",
      `${gtfsRtCollectionRunMonthMismatchRows.length} GTFS-RT observed reliability run(s) do not overlap ${month}: ${sample(gtfsRtCollectionRunMonthMismatchRows.map((run) => run.runId))}.`,
    );
  }
  const shortGtfsRtCollectionRuns = collectionWindows.filter(
    (run) => run.collectionSeconds < minGtfsRtCollectionSeconds,
  );
  if (
    !args.allowInsufficientGtfsRt &&
    observedReliabilityRunIds.length > 0 &&
    shortGtfsRtCollectionRuns.length > 0
  ) {
    addIssue(
      issues,
      "gtfs_rt_collection_duration_insufficient",
      `${shortGtfsRtCollectionRuns.length} GTFS-RT observed reliability run(s) have collection windows shorter than ${minGtfsRtCollectionSeconds} seconds: ${sample(shortGtfsRtCollectionRuns.map((run) => `${run.runId}:${run.collectionSeconds}s`))}.`,
    );
  }
  const sparseGtfsRtCollectionRuns = collectionWindows.filter(
    (run) => run.sampleSeconds > maxGtfsRtSampleSeconds,
  );
  if (
    !args.allowInsufficientGtfsRt &&
    observedReliabilityRunIds.length > 0 &&
    sparseGtfsRtCollectionRuns.length > 0
  ) {
    addIssue(
      issues,
      "gtfs_rt_collection_cadence_too_sparse",
      `${sparseGtfsRtCollectionRuns.length} GTFS-RT observed reliability run(s) sample less frequently than every ${maxGtfsRtSampleSeconds} seconds: ${sample(sparseGtfsRtCollectionRuns.map((run) => `${run.runId}:${run.sampleSeconds}s`))}.`,
    );
  }
  const runsWithoutRequestedVehiclePositions = collectionWindows.filter(
    (run) => !run.requestedFeedTypes.has("vehicle_positions"),
  );
  if (
    !args.allowInsufficientGtfsRt &&
    observedReliabilityRunIds.length > 0 &&
    runsWithoutRequestedVehiclePositions.length > 0
  ) {
    addIssue(
      issues,
      "gtfs_rt_vehicle_positions_not_requested",
      `${runsWithoutRequestedVehiclePositions.length} GTFS-RT observed reliability run(s) did not request vehicle_positions: ${sample(runsWithoutRequestedVehiclePositions.map((run) => run.runId))}.`,
    );
  }
  if (
    !args.allowInsufficientGtfsRt &&
    observedReliabilityRunIds.length > 0 &&
    successfulGtfsRtFeedSnapshotCount === 0
  ) {
    addIssue(
      issues,
      "gtfs_rt_feed_snapshots_missing",
      "Observed reliability has no successful GTFS-RT feed snapshots.",
    );
  }
  if (
    !args.allowInsufficientGtfsRt &&
    observedReliabilityRunIds.length > 0 &&
    lowVehiclePositionSnapshotCoverageRuns.length > 0
  ) {
    addIssue(
      issues,
      "gtfs_rt_vehicle_position_snapshot_coverage_insufficient",
      `${lowVehiclePositionSnapshotCoverageRuns.length} GTFS-RT observed reliability run(s) have too few successful vehicle_positions snapshots for the configured collection window: ${sample(lowVehiclePositionSnapshotCoverageRuns.map((run) => `${run.runId}:${run.actual}/${run.required}`))}.`,
    );
  }
  if (
    !args.allowInsufficientGtfsRt &&
    observedReliabilityRunIds.length > 0 &&
    gtfsRtFeedSnapshotMonthMismatchRows.length > 0
  ) {
    addIssue(
      issues,
      "gtfs_rt_feed_snapshot_month_mismatch",
      `${gtfsRtFeedSnapshotMonthMismatchRows.length} successful GTFS-RT vehicle-position snapshot(s) for observed reliability were fetched outside ${month}.`,
    );
  }
  if (
    !args.allowInsufficientGtfsRt &&
    observedReliabilityRunIds.length > 0 &&
    parsedVehiclePositionSnapshotCount === 0
  ) {
    addIssue(
      issues,
      "gtfs_rt_vehicle_positions_not_parsed",
      "Observed reliability has no parsed GTFS-RT vehicle-position snapshots.",
    );
  }
  if (
    !args.allowInsufficientGtfsRt &&
    observedReliabilityRunIds.length > 0 &&
    gtfsRtObservedHeadwaySampleMonthMismatchRows.length > 0
  ) {
    addIssue(
      issues,
      "observed_headway_sample_month_mismatch",
      `${gtfsRtObservedHeadwaySampleMonthMismatchRows.length} observed headway sample row(s) behind route reliability are outside ${month}.`,
    );
  }
  if (
    !args.allowInsufficientGtfsRt &&
    gtfsRtState.observedHeadwaySamples.length < observedReliabilityHeadwaySampleCount
  ) {
    addIssue(
      issues,
      "observed_headway_rows_incomplete",
      `Observed headway sample rows are ${gtfsRtState.observedHeadwaySamples.length}; reliability summaries report ${observedReliabilityHeadwaySampleCount}.`,
    );
  }
  if (localState.aceRoutes.length > 0 && localState.interventionEvents.length === 0) {
    addIssue(
      issues,
      "intervention_events_missing",
      `${localState.aceRoutes.length} ACE/ABLE source rows exist but no intervention events were generated.`,
    );
  }
  if (localState.aceRoutes.length > 0 && localState.interventionComparisons.length === 0) {
    addIssue(
      issues,
      "intervention_comparisons_missing",
      `${localState.aceRoutes.length} ACE/ABLE source rows exist but no route intervention comparisons were generated.`,
    );
  }
  if (publicRouteIds.length > 0 && localState.routeMonthTrends.length === 0) {
    addIssue(issues, "route_month_trends_missing", "No route/month trend rows exist.");
  }
  if (publicRouteIds.length > 0 && routeMonthTrendSpeedRows === 0) {
    addIssue(issues, "route_month_trend_speed_missing", "No speed trend rows exist.");
  }
  if (publicRouteIds.length > 0 && routeMonthTrendRidershipRows === 0) {
    addIssue(issues, "route_month_trend_ridership_missing", "No ridership trend rows exist.");
  }
  if (localState.aceRoutes.length > 0 && evaluatedInterventionComparisonRows === 0) {
    addIssue(
      issues,
      "intervention_evaluated_comparisons_missing",
      "ACE/ABLE route comparisons exist but none are evaluated before/after comparisons.",
    );
  }
  if (
    evaluatedInterventionComparisonRows > 0 &&
    evaluatedInterventionComparisonRidershipDeltaRows === 0
  ) {
    addIssue(
      issues,
      "intervention_ridership_deltas_missing",
      "Evaluated intervention comparisons do not include ridership deltas.",
    );
  }
  if (evaluatedInterventionComparisonRows > 0 && peerAdjustedInterventionComparisonRows === 0) {
    addIssue(
      issues,
      "intervention_peer_adjusted_comparisons_missing",
      "Evaluated intervention comparisons do not include peer-adjusted speed deltas.",
    );
  }
  const routesMissingBusLaneComparison = missingMembers(
    busLaneMatchedPublicRouteIds,
    busLaneComparisonRouteIds,
  );
  if (routesMissingBusLaneComparison.length > 0) {
    addIssue(
      issues,
      "bus_lane_intervention_comparisons_missing",
      `${routesMissingBusLaneComparison.length} public routes with matched bus lanes lack bus-lane intervention comparison rows: ${sample(routesMissingBusLaneComparison)}.`,
    );
  }
  const comparisonsWithoutCaveats = localState.interventionComparisons.filter(
    (row) => row.caveat.trim().length === 0,
  );
  if (comparisonsWithoutCaveats.length > 0) {
    addIssue(
      issues,
      "intervention_caveats_missing",
      `${comparisonsWithoutCaveats.length} intervention comparisons lack caveats.`,
    );
  }
  if (localState.corridors.length === 0) {
    addIssue(issues, "corridor_summaries_missing", "No corridor summary rows exist.");
  }
  const routesMissingCorridor = missingMembers(publicRouteIds, corridorRouteIds);
  if (routesMissingCorridor.length > 0) {
    addIssue(
      issues,
      "corridor_membership_incomplete",
      `${routesMissingCorridor.length} public routes lack corridor membership: ${sample(routesMissingCorridor)}.`,
    );
  }
  if (corridorAmbiguousRouteShare > maxCorridorAmbiguousRouteShare) {
    addIssue(
      issues,
      "corridor_ambiguous_route_share_high",
      `${corridorAmbiguousRouteMemberRows} public routes have ambiguous corridor assignments (${formatPercent(corridorAmbiguousRouteShare)}); allowed share is ${formatPercent(maxCorridorAmbiguousRouteShare)}.`,
    );
  }
  if (corridorUnassignedRouteShare > maxCorridorUnassignedRouteShare) {
    addIssue(
      issues,
      "corridor_unassigned_route_share_high",
      `${corridorUnassignedRouteMemberRows} public routes have unassigned corridor placeholders (${formatPercent(corridorUnassignedRouteShare)}); allowed share is ${formatPercent(maxCorridorUnassignedRouteShare)}.`,
    );
  }
  if (publicRouteIds.length > 0 && corridorSegmentEvidenceRouteMemberRows === 0) {
    addIssue(
      issues,
      "corridor_segment_evidence_missing",
      "No corridor route memberships are backed by hotspot-segment evidence.",
    );
  }
  if (publicRouteIds.length > 0 && corridorShapeReview === null) {
    addIssue(
      issues,
      "corridor_shape_review_missing",
      "No corridor shape review artifact exists for the analysis month.",
    );
  }
  if (
    corridorShapeReview !== null &&
    (corridorShapeReview.artifactKind !== "corridor_shape_review" ||
      corridorShapeReview.month !== month)
  ) {
    addIssue(
      issues,
      "corridor_shape_review_invalid",
      `Corridor shape review artifact is for ${corridorShapeReview.month}, expected ${month}.`,
    );
  }
  if (
    corridorShapeReview !== null &&
    corridorShapeReview.summary.publicRouteCount !== publicRouteIds.length
  ) {
    addIssue(
      issues,
      "corridor_shape_review_route_count_mismatch",
      `Corridor shape review covers ${corridorShapeReview.summary.publicRouteCount} public routes; expected ${publicRouteIds.length}.`,
    );
  }
  if (
    corridorShapeReview !== null &&
    corridorShapeReview.summary.segmentBackedRouteCount < corridorSegmentEvidenceRouteMemberRows
  ) {
    addIssue(
      issues,
      "corridor_shape_review_segment_coverage_incomplete",
      `Corridor shape review covers ${corridorShapeReview.summary.segmentBackedRouteCount} segment-backed routes; expected ${corridorSegmentEvidenceRouteMemberRows}.`,
    );
  }
  if (corridorShapeReview !== null && corridorShapeReviewMissingRoutes.length > 0) {
    addIssue(
      issues,
      "corridor_shape_review_route_coverage_incomplete",
      `${corridorShapeReviewMissingRoutes.length} segment-backed corridor route(s) are missing from shape review: ${sample(corridorShapeReviewMissingRoutes)}.`,
    );
  }
  if (corridorShapeReviewIncompleteRows > 0) {
    const incompleteRoutes = corridorShapeReviewRows
      .filter(
        (row) =>
          row.matchedSegmentCount > 0 &&
          row.assignmentStatus !== "unassigned" &&
          row.reviewStatus !== "pass",
      )
      .map((row) => `${row.routeId}:${row.reviewStatus}`);
    addIssue(
      issues,
      "corridor_shape_review_incomplete",
      `${corridorShapeReviewIncompleteRows} segment-backed corridor route assignment(s) failed shape review: ${sample(incompleteRoutes)}.`,
    );
  }
  if (
    localState.interventionComparisons.length > 0 &&
    localState.corridorInterventionContexts.length === 0
  ) {
    addIssue(
      issues,
      "corridor_intervention_context_missing",
      "Route intervention comparisons exist, but no corridor intervention context rows were generated.",
    );
  }
  const interventionRouteIds = new Set(
    localState.interventionComparisons.map((row) => row.routeId),
  );
  const interventionRoutesMissingCorridorContext = [...interventionRouteIds].filter(
    (routeId) => publicRouteIds.includes(routeId) && !corridorInterventionRouteIds.has(routeId),
  );
  if (interventionRoutesMissingCorridorContext.length > 0) {
    addIssue(
      issues,
      "corridor_intervention_context_incomplete",
      `${interventionRoutesMissingCorridorContext.length} public intervention route(s) lack corridor context rows: ${sample(interventionRoutesMissingCorridorContext)}.`,
    );
  }
  const routesMissingBriefArtifacts = publicRouteIds.filter(
    (routeId) => (routeArtifactsByRoute.get(routeId) ?? 0) < 3,
  );
  if (routesMissingBriefArtifacts.length > 0) {
    addIssue(
      issues,
      "route_brief_artifacts_incomplete",
      `${routesMissingBriefArtifacts.length} public routes lack JSON/Markdown/HTML brief artifacts: ${sample(routesMissingBriefArtifacts)}.`,
    );
  }
  const corridorsMissingBriefArtifacts = localState.corridors
    .map((row) => row.corridorId)
    .filter((corridorId) => (corridorArtifactsByCorridor.get(corridorId) ?? 0) < 3);
  if (corridorsMissingBriefArtifacts.length > 0) {
    addIssue(
      issues,
      "corridor_brief_artifacts_incomplete",
      `${corridorsMissingBriefArtifacts.length} corridors lack JSON/Markdown/HTML brief artifacts: ${sample(corridorsMissingBriefArtifacts)}.`,
    );
  }
  if (audit.status !== "pass") {
    addIssue(
      issues,
      "route_batch_audit_failed",
      `Route batch audit failed with ${audit.issueCount} issues.`,
    );
  }
  for (const issue of evaluationArtifacts.issues) {
    addIssue(issues, issue.code, issue.message);
  }
  for (const issue of mapArtifacts.issues) {
    addIssue(issues, issue.code, issue.message);
  }

  let d1: PipelineV1CheckResult["d1"] = null;
  try {
    const d1Result = await verifyD1Export({
      year: options.year,
      month: options.month,
      dbPath: options.dbPath,
      ...(args.artifactRoot === undefined ? {} : { artifactRoot: args.artifactRoot }),
      ...(args.exportRoot === undefined ? {} : { exportRoot: args.exportRoot }),
    });
    d1 = {
      status: d1Result.status,
      routeArtifactRows: tableCount(d1Result.tableCounts, "route_artifact"),
      corridorArtifactRows: tableCount(d1Result.tableCounts, "corridor_artifact"),
      routeObservedReliabilityRows: tableCount(
        d1Result.tableCounts,
        "route_observed_reliability_summary",
      ),
      routeInterventionComparisonRows: tableCount(
        d1Result.tableCounts,
        "route_intervention_comparison",
      ),
      corridorInterventionContextRows: tableCount(
        d1Result.tableCounts,
        "corridor_intervention_context",
      ),
      routeMonthTrendRows: tableCount(d1Result.tableCounts, "route_month_trend"),
    };
    if (d1.routeObservedReliabilityRows < publicRouteIds.length) {
      addIssue(
        issues,
        "d1_observed_reliability_incomplete",
        `D1 export has ${d1.routeObservedReliabilityRows} observed reliability rows for ${publicRouteIds.length} public routes.`,
      );
    }
    if (localState.aceRoutes.length > 0 && d1.routeInterventionComparisonRows === 0) {
      addIssue(
        issues,
        "d1_intervention_comparisons_missing",
        "D1 export has no route intervention comparison rows.",
      );
    }
    if (
      localState.corridorInterventionContexts.length > 0 &&
      d1.corridorInterventionContextRows === 0
    ) {
      addIssue(
        issues,
        "d1_corridor_intervention_context_missing",
        "D1 export has no corridor intervention context rows.",
      );
    }
    if (localState.routeMonthTrends.length > 0 && d1.routeMonthTrendRows === 0) {
      addIssue(issues, "d1_route_month_trends_missing", "D1 export has no route/month trend rows.");
    }
  } catch (error) {
    d1 = {
      status: "fail",
      routeArtifactRows: 0,
      corridorArtifactRows: 0,
      routeObservedReliabilityRows: 0,
      routeInterventionComparisonRows: 0,
      corridorInterventionContextRows: 0,
      routeMonthTrendRows: 0,
    };
    addIssue(
      issues,
      "d1_verification_failed",
      error instanceof Error ? error.message : String(error),
    );
  }

  return {
    isoMonth: month,
    status: issues.length === 0 ? "pass" : "fail",
    issueCount: issues.length,
    issues,
    counts: {
      routeCatalogRows: localState.catalog.length,
      routeCoverageRows: localState.coverage.length,
      routeReadinessRows: localState.readiness.length,
      buildEligibleRouteCount: buildEligibleRouteIds.length,
      builtRouteCount: localState.builtRoutes.length,
      publicRouteCount: publicRouteIds.length,
      routeArtifactRows: localState.routeArtifacts.length,
      routeObservedReliabilityRows: localState.observedReliability.length,
      routeObservedReliabilityObservedRows: observedReliabilityObservedRows,
      routeObservedReliabilityInsufficientRows: observedReliabilityInsufficientRows,
      routeObservedReliabilityRequiredObservedRows: observedReliabilityRequiredObservedRows,
      routeObservedReliabilityObservedRouteShare: observedReliabilityObservedRouteShare,
      routeObservedReliabilityBelowThresholdRows: observedReliabilityBelowThresholdRows,
      routeObservedReliabilityHeadwaySampleCount: observedReliabilityHeadwaySampleCount,
      gtfsRtCollectionRunRows: gtfsRtState.collectionRuns.length,
      gtfsRtCompletedCollectionRunRows: completedGtfsRtCollectionRunCount,
      gtfsRtShortestCollectionSeconds,
      gtfsRtLongestSampleSeconds,
      gtfsRtFeedSnapshotRows: gtfsRtState.feedSnapshots.length,
      gtfsRtSuccessfulFeedSnapshotRows: successfulGtfsRtFeedSnapshotCount,
      gtfsRtSuccessfulVehiclePositionSnapshotRows: successfulGtfsRtVehiclePositionSnapshotCount,
      gtfsRtRequiredVehiclePositionSnapshotRows: requiredGtfsRtVehiclePositionSnapshotRows,
      gtfsRtCollectionRunMonthMismatchRows: gtfsRtCollectionRunMonthMismatchRows.length,
      gtfsRtFeedSnapshotMonthMismatchRows: gtfsRtFeedSnapshotMonthMismatchRows.length,
      gtfsRtParsedSnapshotRows: gtfsRtState.parsedSnapshots.length,
      gtfsRtParsedVehiclePositionSnapshotRows: parsedVehiclePositionSnapshotCount,
      gtfsRtObservedHeadwaySampleRows: gtfsRtState.observedHeadwaySamples.length,
      gtfsRtObservedHeadwaySampleMonthMismatchRows:
        gtfsRtObservedHeadwaySampleMonthMismatchRows.length,
      observedReliabilitySourceStatusRows,
      aceRouteRows: localState.aceRoutes.length,
      interventionEventRows: localState.interventionEvents.length,
      routeInterventionComparisonRows: localState.interventionComparisons.length,
      evaluatedInterventionComparisonRows,
      evaluatedInterventionComparisonRidershipDeltaRows,
      peerAdjustedInterventionComparisonRows,
      busLaneMatchedPublicRouteCount: busLaneMatchedPublicRouteIds.length,
      busLaneInterventionComparisonRows: busLaneInterventionComparisons.length,
      busLaneDatedInterventionComparisonRows,
      busLaneSourceGapComparisonRows,
      sourceProbeRows: sourceFreshness.length,
      sourceProbeFreshRows: sourceFreshness.filter((row) => row.status === "fresh").length,
      sourceProbeMissingRows: missingSourceProbeRows.length,
      sourceProbeStaleRows: staleSourceProbeRows.length,
      sourceProbeInactiveRows: inactiveSourceProbeRows.length,
      routeMonthTrendRows: localState.routeMonthTrends.length,
      routeMonthTrendSpeedRows,
      routeMonthTrendRidershipRows,
      corridorRows: localState.corridors.length,
      corridorRouteMemberRows: localState.corridorMembers.length,
      corridorAssignedRouteMemberRows,
      corridorAmbiguousRouteMemberRows,
      corridorUnassignedRouteMemberRows,
      corridorSegmentEvidenceRouteMemberRows,
      corridorShapeReviewRouteRows: corridorShapeReviewRows.length,
      corridorShapeReviewPassRows,
      corridorShapeReviewWarningRows,
      corridorShapeReviewIncompleteRows,
      corridorShapeReviewMissingRouteRows: corridorShapeReviewMissingRoutes.length,
      corridorInterventionContextRows: localState.corridorInterventionContexts.length,
      corridorAmbiguousRouteShare,
      corridorUnassignedRouteShare,
      corridorArtifactRows: localState.corridorArtifacts.length,
      routeBatchIssueRows: localState.batchStatus?.issueCount ?? 0,
      evaluationArtifactRows:
        evaluationArtifacts.rowCounts.observedReliability +
        evaluationArtifacts.rowCounts.routeInterventionComparisons +
        evaluationArtifacts.rowCounts.corridorInterventionContexts,
      evaluationArtifactIssueRows: evaluationArtifacts.issueCount,
      mapArtifactRows: mapArtifacts.totalFeatureCount,
      mapRouteSegmentArtifactRows: mapArtifacts.routeSegmentArtifactCount,
      mapArtifactIssueRows: mapArtifacts.issueCount,
    },
    audit: {
      status: audit.status,
      manifestPath: audit.manifestPath,
      artifactCount: audit.artifactCount,
      missingArtifactCount: audit.missingArtifactCount,
      hashMismatchCount: audit.hashMismatchCount,
      byteLengthMismatchCount: audit.byteLengthMismatchCount,
    },
    d1,
  };
}

export async function checkPipelineV1FromCli(args: string[]): Promise<PipelineV1CheckResult> {
  const result = await checkPipelineV1(parseCliArgs(args));
  if (result.status === "fail") {
    throw new Error(
      `Pipeline v1 check failed: ${result.issues.map((issue) => issue.code).join(", ")}`,
    );
  }

  return result;
}
