import {
  getRouteBatchStatus,
  listAceRoutes,
  listCorridorArtifacts,
  listCorridorMonthSummaries,
  listCorridorRouteMembers,
  listInterventionEvents,
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
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";
import { buildRouteBatchAudit } from "../build/route-batch-audit.js";
import { verifyD1Export } from "../export/verify-d1-export.js";

type PipelineV1CheckArgs = {
  year?: number;
  month?: number;
  dbPath?: string;
  allowInsufficientGtfsRt?: boolean;
  minObservedHeadwaySamples?: number;
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
  observedReliabilitySourceStatusRows: number;
  aceRouteRows: number;
  interventionEventRows: number;
  routeInterventionComparisonRows: number;
  evaluatedInterventionComparisonRows: number;
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
  } | null;
};

const defaultMinObservedHeadwaySamples = 1;

function parseCliArgs(args: string[]): PipelineV1CheckArgs {
  const extraOptions: CliOption<PipelineV1CheckArgs>[] = [
    trueOption(["--allow-insufficient-gtfs-rt"], (output) => {
      output.allowInsufficientGtfsRt = true;
    }),
    numberOption(["--min-observed-headway-samples"], (output, value) => {
      output.minObservedHeadwaySamples = value;
    }),
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

export async function checkPipelineV1(
  args: PipelineV1CheckArgs = {},
): Promise<PipelineV1CheckResult> {
  const options = createMonthContext(args);
  const month = options.isoMonth;
  const minObservedHeadwaySamples = Math.max(
    1,
    Math.round(args.minObservedHeadwaySamples ?? defaultMinObservedHeadwaySamples),
  );
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
  const issues: PipelineV1Issue[] = [];

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
  } catch (error) {
    d1 = {
      status: "fail",
      routeArtifactRows: 0,
      corridorArtifactRows: 0,
      routeObservedReliabilityRows: 0,
      routeInterventionComparisonRows: 0,
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
      observedReliabilitySourceStatusRows,
      aceRouteRows: localState.aceRoutes.length,
      interventionEventRows: localState.interventionEvents.length,
      routeInterventionComparisonRows: localState.interventionComparisons.length,
      evaluatedInterventionComparisonRows: localState.interventionComparisons.filter(
        (row) => row.comparisonStatus === "evaluated",
      ).length,
      routeMonthTrendRows: localState.routeMonthTrends.length,
      routeMonthTrendSpeedRows: localState.routeMonthTrends.filter((row) => row.hasSpeedTrend)
        .length,
      routeMonthTrendRidershipRows: localState.routeMonthTrends.filter(
        (row) => row.hasRidershipTrend,
      ).length,
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
