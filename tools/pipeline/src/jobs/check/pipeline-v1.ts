import { join } from "node:path";
import {
  getRouteBatchStatus,
  listAceRoutes,
  listCorridorArtifacts,
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
import { fromCliPath } from "../../lib/paths.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";
import { fromRepoRoot } from "../../source-manifest.js";
import { buildRouteBatchAudit } from "../build/route-batch-audit.js";
import { verifyD1Export } from "../export/verify-d1-export.js";

type PipelineV1CheckArgs = {
  year?: number;
  month?: number;
  dbPath?: string;
  allowInsufficientGtfsRt?: boolean;
  minObservedHeadwaySamples?: number;
  maxSourceProbeAgeDays?: number;
  sourceMetadataDir?: string;
  now?: Date;
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
  routeObservedReliabilityHeadwaySampleCount: number;
  gtfsRtCollectionRunRows: number;
  gtfsRtCompletedCollectionRunRows: number;
  gtfsRtFeedSnapshotRows: number;
  gtfsRtSuccessfulFeedSnapshotRows: number;
  gtfsRtParsedSnapshotRows: number;
  gtfsRtParsedVehiclePositionSnapshotRows: number;
  gtfsRtObservedHeadwaySampleRows: number;
  observedReliabilitySourceStatusRows: number;
  aceRouteRows: number;
  interventionEventRows: number;
  routeInterventionComparisonRows: number;
  evaluatedInterventionComparisonRows: number;
  evaluatedInterventionComparisonRidershipDeltaRows: number;
  busLaneMatchedPublicRouteCount: number;
  busLaneInterventionComparisonRows: number;
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
  corridorArtifactRows: number;
  routeBatchIssueRows: number;
};

type PipelineV1CheckResult = {
  isoMonth: string;
  status: CheckStatus;
  issueCount: number;
  issues: PipelineV1Issue[];
  counts: PipelineV1Counts;
  audit: {
    status: CheckStatus;
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
    routeMonthTrendRows: number;
  } | null;
};

const defaultMinObservedHeadwaySamples = 1;
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
  const successfulGtfsRtFeedSnapshotCount = gtfsRtState.feedSnapshots.filter(
    (row) => row.status === "ok",
  ).length;
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
  const routeMonthTrendSpeedRows = localState.routeMonthTrends.filter(
    (row) => row.hasSpeedTrend,
  ).length;
  const routeMonthTrendRidershipRows = localState.routeMonthTrends.filter(
    (row) => row.hasRidershipTrend,
  ).length;
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

  let d1: PipelineV1CheckResult["d1"] = null;
  try {
    const d1Result = await verifyD1Export({
      year: options.year,
      month: options.month,
      dbPath: options.dbPath,
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
      routeObservedReliabilityHeadwaySampleCount: observedReliabilityHeadwaySampleCount,
      gtfsRtCollectionRunRows: gtfsRtState.collectionRuns.length,
      gtfsRtCompletedCollectionRunRows: completedGtfsRtCollectionRunCount,
      gtfsRtFeedSnapshotRows: gtfsRtState.feedSnapshots.length,
      gtfsRtSuccessfulFeedSnapshotRows: successfulGtfsRtFeedSnapshotCount,
      gtfsRtParsedSnapshotRows: gtfsRtState.parsedSnapshots.length,
      gtfsRtParsedVehiclePositionSnapshotRows: parsedVehiclePositionSnapshotCount,
      gtfsRtObservedHeadwaySampleRows: gtfsRtState.observedHeadwaySamples.length,
      observedReliabilitySourceStatusRows,
      aceRouteRows: localState.aceRoutes.length,
      interventionEventRows: localState.interventionEvents.length,
      routeInterventionComparisonRows: localState.interventionComparisons.length,
      evaluatedInterventionComparisonRows,
      evaluatedInterventionComparisonRidershipDeltaRows,
      busLaneMatchedPublicRouteCount: busLaneMatchedPublicRouteIds.length,
      busLaneInterventionComparisonRows: busLaneInterventionComparisons.length,
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
      corridorArtifactRows: localState.corridorArtifacts.length,
      routeBatchIssueRows: localState.batchStatus?.issueCount ?? 0,
    },
    audit: {
      status: audit.status,
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
