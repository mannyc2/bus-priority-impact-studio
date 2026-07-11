import {
  listGtfsRtCollectionRuns,
  listGtfsRtFeedSnapshots,
  listGtfsRtParsedSnapshots,
  listGtfsRtVehiclePositions,
  listObservedHeadwaySamples,
  listRouteMonthSourceStatuses,
  listRouteObservedReliabilitySummaries,
} from "@bp/db/local";
import { arg, defineCommand, z } from "@bp/pipeline-v2/cli/compat";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { isoMonth } from "../../lib/dates.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";

const defaultMinObservedHeadwaySamples = 30;
const defaultMinGtfsRtCollectionHours = 4;
const defaultMaxGtfsRtSampleSeconds = 60;
const defaultMinGtfsRtVehiclePositionSnapshotShare = 0.8;
const observedReliabilitySourceIds = ["observedHeadways", "bunching", "waitTimeReliability"];

export type GtfsRtPreflightInputs = {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  runId?: string | undefined;
  minObservedHeadwaySamples?: number | undefined;
  minGtfsRtCollectionHours?: number | undefined;
  maxGtfsRtSampleSeconds?: number | undefined;
  minGtfsRtVehiclePositionSnapshotShare?: number | undefined;
  apiKey?: string | null | undefined;
};

type GtfsRtPreflightIssue = { code: string; message: string };

type GtfsRtPreflightCounts = {
  collectionRunRows: number;
  selectedCollectionRunRows: number;
  completedCollectionRunRows: number;
  shortestCollectionSeconds: number;
  longestSampleSeconds: number;
  feedSnapshotRows: number;
  successfulFeedSnapshotRows: number;
  successfulVehiclePositionSnapshotRows: number;
  requiredVehiclePositionSnapshotRows: number;
  collectionRunMonthMismatchRows: number;
  feedSnapshotMonthMismatchRows: number;
  parsedSnapshotRows: number;
  parsedVehiclePositionSnapshotRows: number;
  vehiclePositionRows: number;
  observedHeadwaySampleRows: number;
  observedHeadwaySampleMonthMismatchRows: number;
  routeObservedReliabilityRows: number;
  routeObservedReliabilityObservedRows: number;
  routeObservedReliabilityInsufficientRows: number;
  routeObservedReliabilityHeadwaySampleCount: number;
  observedReliabilitySourceStatusRows: number;
};

export type GtfsRtPreflightResult = {
  isoMonth: string;
  status: "pass" | "fail";
  selectedRunId: string | null;
  apiKey: { envName: "MTA_BUS_TIME_API_KEY"; present: boolean };
  thresholds: {
    minObservedHeadwaySamples: number;
    minGtfsRtCollectionSeconds: number;
    maxGtfsRtSampleSeconds: number;
    minGtfsRtVehiclePositionSnapshotShare: number;
  };
  readiness: {
    canCollect: boolean;
    hasAnalysisMonthAlignedEvidence: boolean;
    hasCollectionRun: boolean;
    hasCollectionWindow: boolean;
    hasSuccessfulVehiclePositionSnapshots: boolean;
    hasParsedVehiclePositions: boolean;
    hasObservedHeadways: boolean;
    hasObservedRouteReliability: boolean;
    strictPipelineV1ObservedLayerReady: boolean;
  };
  routeCoverage: { routesWithHeadwaySamples: number; routesMeetingMinSamples: number };
  counts: GtfsRtPreflightCounts;
  issueCount: number;
  issues: GtfsRtPreflightIssue[];
  warnings: GtfsRtPreflightIssue[];
  recommendations: string[];
};

function latestRunId(runs: readonly { runId: string; startedAt: string }[]): string | null {
  return runs.at(-1)?.runId ?? null;
}

function addIssue(issues: GtfsRtPreflightIssue[], code: string, message: string): void {
  issues.push({ code, message });
}

function unique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function sample(values: readonly string[], limit = 5): string {
  return values.slice(0, limit).join(", ");
}

function clampShare(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function collectionElapsedSeconds(input: {
  startedAt: string;
  endedAt: string | null;
}): number | null {
  if (input.endedAt === null) return null;
  const startedAt = Date.parse(input.startedAt);
  const endedAt = Date.parse(input.endedAt);
  if (Number.isNaN(startedAt) || Number.isNaN(endedAt)) return null;
  return Math.max(0, Math.round((endedAt - startedAt) / 1000));
}

function collectionWindowSeconds(input: {
  requestedDurationSeconds: number;
  sampleSeconds: number;
  startedAt: string;
  endedAt: string | null;
}): number {
  const elapsed = collectionElapsedSeconds(input);
  if (elapsed === null) return Math.max(0, input.requestedDurationSeconds);
  const covered = elapsed + Math.max(1, input.sampleSeconds);
  return Math.min(Math.max(0, input.requestedDurationSeconds), covered);
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
  if (value === null) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function dateStringInMonth(
  value: string,
  bounds: { startMilliseconds: number; endMilliseconds: number },
): boolean {
  const ts = parsedDateMilliseconds(value);
  return ts !== null && ts >= bounds.startMilliseconds && ts < bounds.endMilliseconds;
}

function collectionRunOverlapsMonth(
  input: { startedAt: string; endedAt: string | null },
  bounds: { startMilliseconds: number; endMilliseconds: number },
): boolean {
  const startedAt = parsedDateMilliseconds(input.startedAt);
  const endedAt = parsedDateMilliseconds(input.endedAt);
  if (startedAt === null) return false;
  const effectiveEndedAt = endedAt ?? startedAt;
  return startedAt < bounds.endMilliseconds && effectiveEndedAt >= bounds.startMilliseconds;
}

function unixSecondsInMonth(
  timestampSeconds: number,
  bounds: { startMilliseconds: number; endMilliseconds: number },
): boolean {
  const ms = timestampSeconds * 1000;
  return ms >= bounds.startMilliseconds && ms < bounds.endMilliseconds;
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
  if (input.snapshotShare <= 0) return 0;
  const sampleSeconds = Math.max(1, input.sampleSeconds);
  return Math.max(1, Math.ceil((input.collectionSeconds / sampleSeconds) * input.snapshotShare));
}

function recommendationsFor(issues: readonly GtfsRtPreflightIssue[]): string[] {
  const byCode: Record<string, string> = {
    api_key_missing:
      "Set MTA_BUS_TIME_API_KEY before running collect:gtfs-rt for a real Bus Time collection.",
    gtfs_rt_collection_run_missing:
      "Run collect:gtfs-rt with a stable --run-id, then parse and finalize that same run ID.",
    gtfs_rt_collection_run_not_completed:
      "Use a completed or completed_with_errors GTFS-RT collection run for observed reliability.",
    gtfs_rt_collection_month_mismatch:
      "Use a GTFS-RT collection run from the same month as the route reliability analysis.",
    gtfs_rt_collection_duration_insufficient:
      "Collect a longer GTFS-RT window, or lower the explicit collection-hour threshold only for a documented fixture run.",
    gtfs_rt_collection_cadence_too_sparse:
      "Collect GTFS-RT snapshots at the required cadence, normally every 30 to 60 seconds.",
    gtfs_rt_vehicle_positions_not_requested:
      "Request the vehicle_positions feed during collection; observed headways cannot be derived from alerts or trip updates alone.",
    gtfs_rt_vehicle_position_snapshot_missing:
      "Collect vehicle_positions snapshots; observed headways cannot be derived from alerts or trip updates alone.",
    gtfs_rt_vehicle_position_snapshot_coverage_insufficient:
      "Re-run collection long enough to satisfy the configured successful vehicle-position snapshot coverage threshold.",
    gtfs_rt_feed_snapshot_month_mismatch:
      "Rebuild observed reliability with vehicle-position snapshots fetched during the analysis month.",
    gtfs_rt_vehicle_positions_not_parsed:
      "Run ingest:gtfs-rt-snapshots -- --run-id <run_id> before building observed headways.",
    gtfs_rt_vehicle_position_rows_missing:
      "Inspect parsed vehicle-position snapshots; they parsed without usable vehicle-position rows.",
    observed_headway_samples_insufficient:
      "Run build:observed-headways -- --run-id <run_id> after parsing snapshots, or collect a longer GTFS-RT window.",
    observed_headway_route_coverage_missing:
      "Collect enough observations for at least one route to meet the observed-headway sample threshold.",
    observed_headway_sample_month_mismatch:
      "Re-run route-observed-reliability after filtering observed headways to the requested analysis month.",
    route_observed_reliability_missing:
      "Run route-observed-reliability for the selected month and run ID.",
    route_observed_reliability_no_observed_routes:
      "Increase GTFS-RT collection coverage or lower the explicit sample threshold only for a documented fixture run.",
    observed_reliability_source_status_incomplete:
      "Rebuild route observed reliability so observedHeadways, bunching, and waitTimeReliability source statuses are written.",
  };
  return unique(
    issues.map((issue) => byCode[issue.code]).filter((rec): rec is string => rec !== undefined),
  );
}

export async function runGtfsRtPreflight(
  inputs: GtfsRtPreflightInputs,
): Promise<GtfsRtPreflightResult> {
  const apiKey =
    inputs.apiKey === null ? undefined : (inputs.apiKey ?? Bun.env["MTA_BUS_TIME_API_KEY"]);
  const apiKeyPresent = apiKey !== undefined && apiKey.length > 0;
  const minObservedHeadwaySamples = Math.max(
    1,
    Math.round(inputs.minObservedHeadwaySamples ?? defaultMinObservedHeadwaySamples),
  );
  const minGtfsRtCollectionSeconds = Math.max(
    1,
    Math.round((inputs.minGtfsRtCollectionHours ?? defaultMinGtfsRtCollectionHours) * 60 * 60),
  );
  const maxGtfsRtSampleSeconds = Math.max(
    1,
    Math.round(inputs.maxGtfsRtSampleSeconds ?? defaultMaxGtfsRtSampleSeconds),
  );
  const minGtfsRtVehiclePositionSnapshotShare = clampShare(
    inputs.minGtfsRtVehiclePositionSnapshotShare ?? defaultMinGtfsRtVehiclePositionSnapshotShare,
  );

  const monthKey = isoMonth(inputs.year, inputs.month);
  const runs = await listGtfsRtCollectionRuns(inputs.local.db);
  const selectedRunId = inputs.runId ?? latestRunId(runs);
  const [feedSnapshots, parsedSnapshots, vehiclePositions, observedHeadwaySamples] =
    selectedRunId === null
      ? [[], [], [], []]
      : await Promise.all([
          listGtfsRtFeedSnapshots(inputs.local.db, selectedRunId),
          listGtfsRtParsedSnapshots(inputs.local.db, selectedRunId),
          listGtfsRtVehiclePositions(inputs.local.db, selectedRunId),
          listObservedHeadwaySamples(inputs.local.db, selectedRunId),
        ]);
  const [routeObservedReliability, sourceStatusesAll] = await Promise.all([
    listRouteObservedReliabilitySummaries(inputs.local.db, monthKey, selectedRunId ?? undefined),
    listRouteMonthSourceStatuses(inputs.local.db, monthKey),
  ]);

  const monthBounds = monthTimeBounds({ year: inputs.year, month: inputs.month });
  const selectedCollectionRuns =
    selectedRunId === null ? [] : runs.filter((run) => run.runId === selectedRunId);
  const completedCollectionRuns = selectedCollectionRuns.filter((run) =>
    ["completed", "completed_with_errors"].includes(run.status),
  );
  const successfulFeedSnapshots = feedSnapshots.filter((snapshot) => snapshot.status === "ok");
  const successfulVehiclePositionSnapshots = successfulFeedSnapshots.filter(
    (snapshot) => snapshot.feedType === "vehicle_positions",
  );
  const collectionRunMonthMismatchRows = selectedCollectionRuns.filter(
    (run) => !collectionRunOverlapsMonth(run, monthBounds),
  );
  const feedSnapshotMonthMismatchRows = successfulVehiclePositionSnapshots.filter(
    (snapshot) => !dateStringInMonth(snapshot.fetchedAt, monthBounds),
  );
  const observedHeadwaySampleMonthMismatchRows = observedHeadwaySamples.filter(
    (s) => !unixSecondsInMonth(s.observedTimestamp, monthBounds),
  );
  const selectedCollectionWindows = selectedCollectionRuns.map((run) => ({
    runId: run.runId,
    collectionSeconds: collectionWindowSeconds(run),
    sampleSeconds: run.sampleSeconds,
    requestedFeedTypes: requestedFeedTypes(run.requestedFeedTypes),
    successfulVehiclePositionSnapshots: successfulVehiclePositionSnapshots.length,
  }));
  const selectedCollectionWindowsWithVehiclePositions = selectedCollectionWindows.filter((run) =>
    run.requestedFeedTypes.has("vehicle_positions"),
  );
  const shortestCollectionSeconds =
    selectedCollectionWindows.length === 0
      ? 0
      : Math.min(...selectedCollectionWindows.map((r) => r.collectionSeconds));
  const longestSampleSeconds =
    selectedCollectionWindows.length === 0
      ? 0
      : Math.max(...selectedCollectionWindows.map((r) => r.sampleSeconds));
  const requiredVehiclePositionSnapshotRows =
    selectedCollectionWindowsWithVehiclePositions.length === 0
      ? 0
      : selectedCollectionWindowsWithVehiclePositions.reduce(
          (sum, run) =>
            sum +
            requiredVehiclePositionSnapshotCount({
              collectionSeconds: minGtfsRtCollectionSeconds,
              sampleSeconds: run.sampleSeconds,
              snapshotShare: minGtfsRtVehiclePositionSnapshotShare,
            }),
          0,
        );
  const lowVehiclePositionSnapshotCoverageRuns = selectedCollectionWindowsWithVehiclePositions
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
  const parsedVehiclePositionSnapshots = parsedSnapshots.filter(
    (s) => s.status === "parsed" && s.feedType === "vehicle_positions",
  );
  const routeObservedReliabilityObservedRows = routeObservedReliability.filter(
    (row) => row.reliabilityStatus === "observed",
  );
  const routeObservedReliabilityInsufficientRows = routeObservedReliability.filter(
    (row) => row.reliabilityStatus === "insufficient_gtfs_rt_samples",
  );
  const routeObservedReliabilityHeadwaySampleCount = routeObservedReliability.reduce(
    (sum, row) => sum + row.sampleCount,
    0,
  );
  const sourceStatuses =
    selectedRunId === null
      ? sourceStatusesAll
      : sourceStatusesAll.filter((s) => s.snapshotId === selectedRunId);
  const observedReliabilitySourceStatusRows = sourceStatuses.filter(
    (row) =>
      row.sourceScope === "reliability" && observedReliabilitySourceIds.includes(row.sourceId),
  ).length;
  const headwaySamplesByRoute = new Map<string, number>();
  for (const s of observedHeadwaySamples) {
    headwaySamplesByRoute.set(s.routeId, (headwaySamplesByRoute.get(s.routeId) ?? 0) + 1);
  }
  const routesWithHeadwaySamples = headwaySamplesByRoute.size;
  const routesMeetingMinSamples = [...headwaySamplesByRoute.values()].filter(
    (c) => c >= minObservedHeadwaySamples,
  ).length;

  const issues: GtfsRtPreflightIssue[] = [];
  const warnings: GtfsRtPreflightIssue[] = [];

  if (!apiKeyPresent && selectedRunId === null) {
    addIssue(
      issues,
      "api_key_missing",
      "MTA_BUS_TIME_API_KEY is not set, and no existing GTFS-RT collection run is available.",
    );
  } else if (!apiKeyPresent) {
    addIssue(
      warnings,
      "api_key_missing",
      "MTA_BUS_TIME_API_KEY is not set; existing local GTFS-RT rows can be checked, but new collection cannot start.",
    );
  }
  if (selectedRunId === null || selectedCollectionRuns.length === 0) {
    addIssue(
      issues,
      "gtfs_rt_collection_run_missing",
      selectedRunId === null
        ? "No GTFS-RT collection runs exist in the local pipeline DB."
        : `No GTFS-RT collection run row exists for ${selectedRunId}.`,
    );
  }
  if (selectedRunId !== null && completedCollectionRuns.length === 0) {
    addIssue(
      issues,
      "gtfs_rt_collection_run_not_completed",
      `GTFS-RT run ${selectedRunId} is not completed or completed_with_errors.`,
    );
  }
  if (selectedRunId !== null && collectionRunMonthMismatchRows.length > 0) {
    addIssue(
      issues,
      "gtfs_rt_collection_month_mismatch",
      `${collectionRunMonthMismatchRows.length} GTFS-RT run(s) do not overlap ${monthKey}: ${sample(collectionRunMonthMismatchRows.map((r) => r.runId))}.`,
    );
  }
  const shortGtfsRtCollectionRuns = selectedCollectionWindows.filter(
    (run) => run.collectionSeconds < minGtfsRtCollectionSeconds,
  );
  if (selectedRunId !== null && shortGtfsRtCollectionRuns.length > 0) {
    addIssue(
      issues,
      "gtfs_rt_collection_duration_insufficient",
      `${shortGtfsRtCollectionRuns.length} GTFS-RT run(s) have collection windows shorter than ${minGtfsRtCollectionSeconds} seconds: ${sample(shortGtfsRtCollectionRuns.map((r) => `${r.runId}:${r.collectionSeconds}s`))}.`,
    );
  }
  const sparseGtfsRtCollectionRuns = selectedCollectionWindows.filter(
    (run) => run.sampleSeconds > maxGtfsRtSampleSeconds,
  );
  if (selectedRunId !== null && sparseGtfsRtCollectionRuns.length > 0) {
    addIssue(
      issues,
      "gtfs_rt_collection_cadence_too_sparse",
      `${sparseGtfsRtCollectionRuns.length} GTFS-RT run(s) sample less frequently than every ${maxGtfsRtSampleSeconds} seconds: ${sample(sparseGtfsRtCollectionRuns.map((r) => `${r.runId}:${r.sampleSeconds}s`))}.`,
    );
  }
  const runsWithoutRequestedVehiclePositions = selectedCollectionWindows.filter(
    (run) => !run.requestedFeedTypes.has("vehicle_positions"),
  );
  if (selectedRunId !== null && runsWithoutRequestedVehiclePositions.length > 0) {
    addIssue(
      issues,
      "gtfs_rt_vehicle_positions_not_requested",
      `${runsWithoutRequestedVehiclePositions.length} GTFS-RT run(s) did not request vehicle_positions: ${sample(runsWithoutRequestedVehiclePositions.map((r) => r.runId))}.`,
    );
  }
  if (selectedRunId !== null && successfulVehiclePositionSnapshots.length === 0) {
    addIssue(
      issues,
      "gtfs_rt_vehicle_position_snapshot_missing",
      `GTFS-RT run ${selectedRunId} has no successful vehicle_positions feed snapshots.`,
    );
  }
  if (selectedRunId !== null && lowVehiclePositionSnapshotCoverageRuns.length > 0) {
    addIssue(
      issues,
      "gtfs_rt_vehicle_position_snapshot_coverage_insufficient",
      `${lowVehiclePositionSnapshotCoverageRuns.length} GTFS-RT run(s) have too few successful vehicle_positions snapshots for the configured collection window: ${sample(lowVehiclePositionSnapshotCoverageRuns.map((r) => `${r.runId}:${r.actual}/${r.required}`))}.`,
    );
  }
  if (selectedRunId !== null && feedSnapshotMonthMismatchRows.length > 0) {
    addIssue(
      issues,
      "gtfs_rt_feed_snapshot_month_mismatch",
      `${feedSnapshotMonthMismatchRows.length} successful vehicle-position snapshot(s) were fetched outside ${monthKey}.`,
    );
  }
  if (selectedRunId !== null && parsedVehiclePositionSnapshots.length === 0) {
    addIssue(
      issues,
      "gtfs_rt_vehicle_positions_not_parsed",
      `GTFS-RT run ${selectedRunId} has no parsed vehicle_positions snapshots.`,
    );
  }
  if (selectedRunId !== null && vehiclePositions.length === 0) {
    addIssue(
      issues,
      "gtfs_rt_vehicle_position_rows_missing",
      `GTFS-RT run ${selectedRunId} has no parsed vehicle-position rows.`,
    );
  }
  if (observedHeadwaySamples.length < minObservedHeadwaySamples) {
    addIssue(
      issues,
      "observed_headway_samples_insufficient",
      `Observed headway sample rows are ${observedHeadwaySamples.length}; expected at least ${minObservedHeadwaySamples}.`,
    );
  }
  if (selectedRunId !== null && observedHeadwaySampleMonthMismatchRows.length > 0) {
    addIssue(
      issues,
      "observed_headway_sample_month_mismatch",
      `${observedHeadwaySampleMonthMismatchRows.length} observed headway sample row(s) are outside ${monthKey}.`,
    );
  }
  if (routesMeetingMinSamples === 0) {
    addIssue(
      issues,
      "observed_headway_route_coverage_missing",
      `No route has at least ${minObservedHeadwaySamples} observed headway samples.`,
    );
  }
  if (routeObservedReliability.length === 0) {
    addIssue(
      issues,
      "route_observed_reliability_missing",
      `No route observed reliability rows exist for ${monthKey}${selectedRunId === null ? "" : ` and run ${selectedRunId}`}.`,
    );
  } else if (routeObservedReliabilityObservedRows.length === 0) {
    addIssue(
      issues,
      "route_observed_reliability_no_observed_routes",
      `${routeObservedReliabilityInsufficientRows.length} route observed reliability rows are marked insufficient and none are observed.`,
    );
  }
  if (
    routeObservedReliability.length > 0 &&
    observedReliabilitySourceStatusRows < routeObservedReliability.length * 3
  ) {
    addIssue(
      issues,
      "observed_reliability_source_status_incomplete",
      `Observed reliability source-status rows are ${observedReliabilitySourceStatusRows}; expected at least ${routeObservedReliability.length * 3}.`,
    );
  }

  const counts: GtfsRtPreflightCounts = {
    collectionRunRows: runs.length,
    selectedCollectionRunRows: selectedCollectionRuns.length,
    completedCollectionRunRows: completedCollectionRuns.length,
    shortestCollectionSeconds,
    longestSampleSeconds,
    feedSnapshotRows: feedSnapshots.length,
    successfulFeedSnapshotRows: successfulFeedSnapshots.length,
    successfulVehiclePositionSnapshotRows: successfulVehiclePositionSnapshots.length,
    requiredVehiclePositionSnapshotRows,
    collectionRunMonthMismatchRows: collectionRunMonthMismatchRows.length,
    feedSnapshotMonthMismatchRows: feedSnapshotMonthMismatchRows.length,
    parsedSnapshotRows: parsedSnapshots.length,
    parsedVehiclePositionSnapshotRows: parsedVehiclePositionSnapshots.length,
    vehiclePositionRows: vehiclePositions.length,
    observedHeadwaySampleRows: observedHeadwaySamples.length,
    observedHeadwaySampleMonthMismatchRows: observedHeadwaySampleMonthMismatchRows.length,
    routeObservedReliabilityRows: routeObservedReliability.length,
    routeObservedReliabilityObservedRows: routeObservedReliabilityObservedRows.length,
    routeObservedReliabilityInsufficientRows: routeObservedReliabilityInsufficientRows.length,
    routeObservedReliabilityHeadwaySampleCount,
    observedReliabilitySourceStatusRows,
  };
  const readiness = {
    canCollect: apiKeyPresent,
    hasAnalysisMonthAlignedEvidence:
      selectedRunId !== null &&
      collectionRunMonthMismatchRows.length === 0 &&
      feedSnapshotMonthMismatchRows.length === 0 &&
      observedHeadwaySampleMonthMismatchRows.length === 0,
    hasCollectionRun: selectedCollectionRuns.length > 0 && completedCollectionRuns.length > 0,
    hasCollectionWindow:
      selectedCollectionRuns.length > 0 &&
      shortGtfsRtCollectionRuns.length === 0 &&
      sparseGtfsRtCollectionRuns.length === 0 &&
      runsWithoutRequestedVehiclePositions.length === 0 &&
      lowVehiclePositionSnapshotCoverageRuns.length === 0,
    hasSuccessfulVehiclePositionSnapshots: successfulVehiclePositionSnapshots.length > 0,
    hasParsedVehiclePositions:
      parsedVehiclePositionSnapshots.length > 0 && vehiclePositions.length > 0,
    hasObservedHeadways:
      observedHeadwaySamples.length >= minObservedHeadwaySamples && routesMeetingMinSamples > 0,
    hasObservedRouteReliability: routeObservedReliabilityObservedRows.length > 0,
    strictPipelineV1ObservedLayerReady: issues.length === 0,
  };

  return {
    isoMonth: monthKey,
    status: issues.length === 0 ? "pass" : "fail",
    selectedRunId,
    apiKey: { envName: "MTA_BUS_TIME_API_KEY", present: apiKeyPresent },
    thresholds: {
      minObservedHeadwaySamples,
      minGtfsRtCollectionSeconds,
      maxGtfsRtSampleSeconds,
      minGtfsRtVehiclePositionSnapshotShare,
    },
    readiness,
    routeCoverage: { routesWithHeadwaySamples, routesMeetingMinSamples },
    counts,
    issueCount: issues.length,
    issues,
    warnings,
    recommendations: recommendationsFor(issues),
  };
}

export default defineCommand({
  path: ["gtfs-rt", "preflight"],
  summary: "Validate GTFS-RT collection state for a monthly observed reliability build.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
      runId: z.string().optional().describe("Specific run ID (default: latest)"),
      minObservedHeadwaySamples: arg
        .positiveInt()
        .optional()
        .describe("Required observed headway sample count"),
      minGtfsRtCollectionHours: z.coerce
        .number()
        .positive()
        .optional()
        .describe("Required collection window in hours"),
      maxGtfsRtSampleSeconds: arg
        .positiveInt()
        .optional()
        .describe("Maximum allowed sample period in seconds"),
      minGtfsRtVehiclePositionSnapshotShare: z.coerce
        .number()
        .optional()
        .describe("Minimum share of vehicle-position snapshots within the planned window"),
    }),
  },
  output: z.object({
    isoMonth: z.string(),
    status: z.enum(["pass", "fail"]),
    selectedRunId: z.string().nullable(),
    apiKey: z.object({ envName: z.string(), present: z.boolean() }),
    thresholds: z.unknown(),
    readiness: z.unknown(),
    routeCoverage: z.unknown(),
    counts: z.unknown(),
    issueCount: z.number(),
    issues: z.array(z.object({ code: z.string(), message: z.string() })),
    warnings: z.array(z.object({ code: z.string(), message: z.string() })),
    recommendations: z.array(z.string()),
  }),
  async run({ input }) {
    const result = await runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "gtfs-rt.preflight",
      operation: "runGtfsRtPreflight",
      spanAttributes: {
        year: input.options.year,
        month: input.options.month,
        runId: input.options.runId ?? null,
      },
      run: (local) =>
        runGtfsRtPreflight({
          local,
          year: input.options.year,
          month: input.options.month,
          runId: input.options.runId,
          minObservedHeadwaySamples: input.options.minObservedHeadwaySamples,
          minGtfsRtCollectionHours: input.options.minGtfsRtCollectionHours,
          maxGtfsRtSampleSeconds: input.options.maxGtfsRtSampleSeconds,
          minGtfsRtVehiclePositionSnapshotShare:
            input.options.minGtfsRtVehiclePositionSnapshotShare,
        }),
    });
    if (result.status === "fail") {
      process.exitCode = 1;
    }
    return result;
  },
});
