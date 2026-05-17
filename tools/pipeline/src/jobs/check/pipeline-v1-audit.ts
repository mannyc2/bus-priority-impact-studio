import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  listBusLanes,
  listRouteBriefSummaries,
  listRouteMonthCoverage,
  listRouteStops,
} from "@bp/db/local";
import { type CliOption, dbOption, parseCliOptions } from "../../lib/cli-args.js";
import { writeJson } from "../../lib/json.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { defaultArtifactRootPath, fromCliPath, fromRepoRoot } from "../../lib/paths.js";
import { busLaneMatches } from "../build/route-brief-metrics.js";
import { parseBusLaneOpenDates } from "../build/route-intervention-evaluation.js";
import { preflightGtfsRt } from "./gtfs-rt-preflight.js";
import { checkPipelineV1 } from "./pipeline-v1.js";
import {
  type RouteSpeedAvailabilityResult,
  readRouteSpeedAvailabilityArtifact,
} from "./route-speed-availability.js";
import { readSourceRefreshPlanArtifact, type SourceRefreshPlan } from "./source-refresh-plan.js";

type PipelineV1AuditArgs = {
  publicYear?: number;
  publicMonth?: number;
  realtimeYear?: number;
  realtimeMonth?: number;
  runId?: string;
  dbPath?: string;
  cleanDbPath?: string;
  cleanArtifactRoot?: string;
  cleanExportRoot?: string;
  sourceMetadataDir?: string;
  now?: Date;
  minGtfsRtCollectionHours?: number;
  artifactRoot?: string;
  exportRoot?: string;
  output?: string;
};

type RequirementStatus = "pass" | "partial" | "blocked";

type PipelineV1AuditChecklistItem = {
  requirement: string;
  status: RequirementStatus;
  evidence: string;
  missing: string[];
};

type CoverageSummary = {
  isoMonth: string;
  routeRows: number;
  speedRoutes: number;
  scheduleRoutes: number;
};

type BusLaneSourceGapDiagnostics = {
  publicMatchedRouteCount: number;
  matchedLaneInstanceCount: number;
  missingOpenDateLaneInstanceCount: number;
  blankOpenDateLaneInstanceCount: number;
  unparsableOpenDateLaneInstanceCount: number;
  routesWithMissingOpenDateCount: number;
  distinctUnparsableOpenDateValues: { sourceValue: string; laneInstanceCount: number }[];
  topRoutesByMissingOpenDate: {
    routeId: string;
    missingOpenDateLaneInstanceCount: number;
    matchedLaneInstanceCount: number;
  }[];
};

type MethodologyGate = {
  status: "descriptive_only" | "causal_claims_allowed";
  externalReviewStatus: "open" | "complete";
  causalClaimsAllowed: boolean;
  maxSupportedClaim: "descriptive_association" | "causal_estimate";
  allowedEvaluationLevels: string[];
  caveats: string[];
};

type PipelineV1AuditResult = {
  status: RequirementStatus;
  generatedAt: string;
  objective: string;
  successCriteria: string[];
  releaseModel: {
    canonicalMonthlyRelease: string;
    realtimeAppendix: string;
    sameMonthPromotionReady: boolean;
    sameMonthPromotionIssues: string[];
  };
  publicMonth: string;
  realtimeMonth: string;
  runId: string | null;
  outputPath: string;
  checklist: PipelineV1AuditChecklistItem[];
  coverage: {
    publicMonth: CoverageSummary;
    realtimeMonth: CoverageSummary;
  };
  sourceAvailability: {
    routeSpeed: RouteSpeedAvailabilityResult | null;
    refreshPlan: SourceRefreshPlan | null;
  };
  interventions: {
    busLaneSourceGaps: BusLaneSourceGapDiagnostics;
    methodologyGate: MethodologyGate;
  };
  gates: {
    publicStructuralStatus: string;
    publicStrictStatus: string;
    realtimePreflightStatus: string;
    cleanRebuildStatus: string | null;
    publicStrictIssues: string[];
    realtimePreflightIssues: string[];
    cleanRebuildIssues: string[];
  };
  recommendation: string;
};

const pipelineV1Objective =
  "Finish Data Pipeline v1: a reproducible full-network pipeline with GTFS-RT observed reliability/bunching, before/after intervention evaluation, corridor grouping, a full set of route/corridor brief artifacts, verified D1/static export contracts, QA gates, and updated roadmap/docs.";

const pipelineV1SuccessCriteria = [
  "Reproducible latest complete public-source monthly release from clean local DB evidence.",
  "GTFS-RT observed reliability and bunching computed from collected realtime samples and attached as a current observed appendix when source months differ.",
  "Before/after intervention evaluation exists with methodology and causal-claim gates.",
  "Corridor grouping exists with shape-reviewed segment evidence and corridor intervention context.",
  "Full route and corridor brief artifact set passes hash, byte-length, and JSON contract audits.",
  "D1 serving export and static evaluation/map artifact contracts verify against generated data.",
  "Source-cadence caveats are explicit: delayed monthly public speeds are canonical for release claims, while live-only GTFS-RT is labeled as current observed evidence.",
  "Same-month public-speed and collected-realtime alignment is tracked as an observed monthly promotion condition, not a Data Pipeline v1 blocker.",
  "Roadmap, methodology, and handoff docs match the commands, limitations, source cadence, and promotion conditions.",
] as const;

function isoMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function defaultOutputPath(publicMonth: string, realtimeMonth: string): string {
  return fromRepoRoot(
    join("data/artifacts/pipeline-v1", `audit-${publicMonth}-${realtimeMonth}.json`),
  );
}

function parseArgs(args: string[]): Required<PipelineV1AuditArgs> {
  const output: PipelineV1AuditArgs = {};
  const options: CliOption<PipelineV1AuditArgs>[] = [
    {
      flags: ["--public-year"],
      apply: (target, value) => {
        target.publicYear = Number(value);
      },
    },
    {
      flags: ["--public-month"],
      apply: (target, value) => {
        target.publicMonth = Number(value);
      },
    },
    {
      flags: ["--realtime-year"],
      apply: (target, value) => {
        target.realtimeYear = Number(value);
      },
    },
    {
      flags: ["--realtime-month"],
      apply: (target, value) => {
        target.realtimeMonth = Number(value);
      },
    },
    {
      flags: ["--run-id"],
      apply: (target, value) => {
        if (value !== undefined) {
          target.runId = value;
        }
      },
    },
    {
      flags: ["--output"],
      apply: (target, value) => {
        if (value !== undefined) {
          target.output = fromCliPath(value);
        }
      },
    },
    dbOption(fromCliPath),
    {
      flags: ["--clean-db"],
      apply: (target, value) => {
        if (value !== undefined) {
          target.cleanDbPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--clean-artifact-root"],
      apply: (target, value) => {
        if (value !== undefined) {
          target.cleanArtifactRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--clean-export-root"],
      apply: (target, value) => {
        if (value !== undefined) {
          target.cleanExportRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--source-metadata-dir"],
      apply: (target, value) => {
        if (value !== undefined) {
          target.sourceMetadataDir = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--min-gtfs-rt-collection-hours"],
      apply: (target, value) => {
        target.minGtfsRtCollectionHours = Number(value);
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (target, value) => {
        if (value !== undefined) {
          target.artifactRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--export-root"],
      apply: (target, value) => {
        if (value !== undefined) {
          target.exportRoot = fromCliPath(value);
        }
      },
    },
  ];
  const parsed = parseCliOptions(args, output, options);
  const publicYear = parsed.publicYear ?? 2026;
  const publicMonth = parsed.publicMonth ?? 3;
  const realtimeYear = parsed.realtimeYear ?? publicYear;
  const realtimeMonth = parsed.realtimeMonth ?? publicMonth;
  const publicIsoMonth = isoMonth(publicYear, publicMonth);
  const realtimeIsoMonth = isoMonth(realtimeYear, realtimeMonth);

  return {
    publicYear,
    publicMonth,
    realtimeYear,
    realtimeMonth,
    runId: parsed.runId ?? "",
    dbPath: parsed.dbPath ?? "",
    cleanDbPath: parsed.cleanDbPath ?? "",
    cleanArtifactRoot: parsed.cleanArtifactRoot ?? "",
    cleanExportRoot: parsed.cleanExportRoot ?? "",
    sourceMetadataDir: parsed.sourceMetadataDir ?? "",
    now: parsed.now ?? new Date(0),
    minGtfsRtCollectionHours: parsed.minGtfsRtCollectionHours ?? 0,
    artifactRoot: parsed.artifactRoot ?? "",
    exportRoot: parsed.exportRoot ?? "",
    output: parsed.output ?? defaultOutputPath(publicIsoMonth, realtimeIsoMonth),
  };
}

function statusFromItems(items: readonly PipelineV1AuditChecklistItem[]): RequirementStatus {
  if (items.some((item) => item.status === "blocked")) {
    return "blocked";
  }

  if (items.some((item) => item.status === "partial")) {
    return "partial";
  }

  return "pass";
}

async function coverageSummary(dbPath: string, month: string): Promise<CoverageSummary> {
  return withLocalPipelineDb(dbPath.length > 0 ? dbPath : undefined, async (local) => {
    const rows = await listRouteMonthCoverage(local.db, month);
    return {
      isoMonth: month,
      routeRows: rows.length,
      speedRoutes: rows.filter((row) => row.hasSpeedData).length,
      scheduleRoutes: rows.filter((row) => row.hasScheduleData).length,
    };
  });
}

function methodologyGate(input: {
  peerAdjustedInterventionComparisonRows: number;
  busLaneSourceGapComparisonRows: number;
  busLaneSourceGaps: BusLaneSourceGapDiagnostics;
}): MethodologyGate {
  const caveats = [
    "External transit-domain methodology review is not complete.",
    "Peer-adjusted before/after rows control for broad network shifts but are observational.",
    ...(input.busLaneSourceGapComparisonRows > 0 ||
    input.busLaneSourceGaps.missingOpenDateLaneInstanceCount > 0
      ? [
          "Some matched bus-lane segments lack parseable implementation dates and must remain source-gap rows.",
        ]
      : []),
  ];

  return {
    status: "descriptive_only",
    externalReviewStatus: "open",
    causalClaimsAllowed: false,
    maxSupportedClaim: "descriptive_association",
    allowedEvaluationLevels:
      input.peerAdjustedInterventionComparisonRows > 0
        ? ["descriptive_before_after", "matched_comparison"]
        : ["descriptive_before_after"],
    caveats,
  };
}

async function busLaneSourceGapDiagnostics(
  dbPath: string,
  month: string,
): Promise<BusLaneSourceGapDiagnostics> {
  return withLocalPipelineDb(dbPath.length > 0 ? dbPath : undefined, async (local) => {
    const [briefs, busLanes] = await Promise.all([
      listRouteBriefSummaries(local.db, month),
      listBusLanes(local.db),
    ]);
    const publicMatchedBriefs = briefs.filter(
      (brief) => brief.publicVisible && brief.busLaneMatchedLaneCount > 0,
    );
    const unparsableValues = new Map<string, number>();
    const routeGaps: BusLaneSourceGapDiagnostics["topRoutesByMissingOpenDate"] = [];
    let matchedLaneInstanceCount = 0;
    let missingOpenDateLaneInstanceCount = 0;
    let blankOpenDateLaneInstanceCount = 0;
    let unparsableOpenDateLaneInstanceCount = 0;

    for (const brief of publicMatchedBriefs) {
      const stops = await listRouteStops(local.db, brief.routeId, month);
      const matchedLanes = busLaneMatches([...busLanes], [...stops]).map((match) => match.lane);
      let routeMissingOpenDateLaneInstanceCount = 0;

      for (const lane of matchedLanes) {
        matchedLaneInstanceCount += 1;
        const sourceValue = lane.openDate?.trim() ?? "";
        if (parseBusLaneOpenDates(sourceValue).length > 0) {
          continue;
        }

        missingOpenDateLaneInstanceCount += 1;
        routeMissingOpenDateLaneInstanceCount += 1;
        if (sourceValue.length === 0) {
          blankOpenDateLaneInstanceCount += 1;
        } else {
          unparsableOpenDateLaneInstanceCount += 1;
          unparsableValues.set(sourceValue, (unparsableValues.get(sourceValue) ?? 0) + 1);
        }
      }

      if (routeMissingOpenDateLaneInstanceCount > 0) {
        routeGaps.push({
          routeId: brief.routeId,
          missingOpenDateLaneInstanceCount: routeMissingOpenDateLaneInstanceCount,
          matchedLaneInstanceCount: matchedLanes.length,
        });
      }
    }

    return {
      publicMatchedRouteCount: publicMatchedBriefs.length,
      matchedLaneInstanceCount,
      missingOpenDateLaneInstanceCount,
      blankOpenDateLaneInstanceCount,
      unparsableOpenDateLaneInstanceCount,
      routesWithMissingOpenDateCount: routeGaps.length,
      distinctUnparsableOpenDateValues: [...unparsableValues.entries()]
        .sort(
          ([leftValue, leftCount], [rightValue, rightCount]) =>
            rightCount - leftCount || leftValue.localeCompare(rightValue),
        )
        .slice(0, 20)
        .map(([sourceValue, laneInstanceCount]) => ({ sourceValue, laneInstanceCount })),
      topRoutesByMissingOpenDate: routeGaps
        .sort(
          (left, right) =>
            right.missingOpenDateLaneInstanceCount - left.missingOpenDateLaneInstanceCount ||
            left.routeId.localeCompare(right.routeId),
        )
        .slice(0, 20),
    };
  });
}

export async function auditPipelineV1(
  args: PipelineV1AuditArgs = {},
): Promise<PipelineV1AuditResult> {
  const publicYear = args.publicYear ?? 2026;
  const publicMonth = args.publicMonth ?? 3;
  const realtimeYear = args.realtimeYear ?? publicYear;
  const realtimeMonth = args.realtimeMonth ?? publicMonth;
  const publicIsoMonth = isoMonth(publicYear, publicMonth);
  const realtimeIsoMonth = isoMonth(realtimeYear, realtimeMonth);
  const outputPath = args.output ?? defaultOutputPath(publicIsoMonth, realtimeIsoMonth);
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const dbPath = args.dbPath;
  const dbArg = dbPath === undefined ? {} : { dbPath };
  const runArg = args.runId === undefined ? {} : { runId: args.runId };
  const sourceMetadataArg =
    args.sourceMetadataDir === undefined ? {} : { sourceMetadataDir: args.sourceMetadataDir };
  const nowArg = args.now === undefined ? {} : { now: args.now };
  const minCollectionHoursArg =
    args.minGtfsRtCollectionHours === undefined
      ? {}
      : { minGtfsRtCollectionHours: args.minGtfsRtCollectionHours };
  const artifactRootArg = { artifactRoot };
  const exportRootArg = args.exportRoot === undefined ? {} : { exportRoot: args.exportRoot };
  const cleanRebuild =
    args.cleanDbPath === undefined
      ? null
      : await checkPipelineV1({
          year: publicYear,
          month: publicMonth,
          dbPath: args.cleanDbPath,
          ...sourceMetadataArg,
          ...nowArg,
          ...minCollectionHoursArg,
          ...(args.cleanArtifactRoot === undefined ? {} : { artifactRoot: args.cleanArtifactRoot }),
          ...(args.cleanExportRoot === undefined ? {} : { exportRoot: args.cleanExportRoot }),
          allowInsufficientGtfsRt: true,
        });

  const publicStructural = await checkPipelineV1({
    year: publicYear,
    month: publicMonth,
    ...dbArg,
    ...sourceMetadataArg,
    ...nowArg,
    ...minCollectionHoursArg,
    ...artifactRootArg,
    ...exportRootArg,
    allowInsufficientGtfsRt: true,
  });
  const publicStrict = await checkPipelineV1({
    year: publicYear,
    month: publicMonth,
    ...dbArg,
    ...sourceMetadataArg,
    ...nowArg,
    ...minCollectionHoursArg,
    ...artifactRootArg,
    ...exportRootArg,
  });
  const [
    realtimePreflight,
    publicCoverage,
    realtimeCoverage,
    busLaneSourceGaps,
    routeSpeedAvailability,
    sourceRefreshPlan,
  ] = await Promise.all([
    preflightGtfsRt({
      year: realtimeYear,
      month: realtimeMonth,
      ...runArg,
      ...dbArg,
      ...minCollectionHoursArg,
    }),
    coverageSummary(dbPath ?? "", publicIsoMonth),
    coverageSummary(dbPath ?? "", realtimeIsoMonth),
    busLaneSourceGapDiagnostics(dbPath ?? "", publicIsoMonth),
    readRouteSpeedAvailabilityArtifact(artifactRoot),
    readSourceRefreshPlanArtifact(artifactRoot),
  ]);

  const monthSplit = publicIsoMonth !== realtimeIsoMonth;
  const realtimeHasSpeedCoverage = realtimeCoverage.speedRoutes > 0;
  const routeSpeedAvailabilityEvidence =
    routeSpeedAvailability === null
      ? "No route-speed availability artifact found."
      : ` Route-speed availability artifact latest complete speed month is ${routeSpeedAvailability.latestSpeedMonth?.isoMonth ?? "none"}; requested month ${routeSpeedAvailability.requestedMonth?.isoMonth ?? "none"} is ${routeSpeedAvailability.requestedMonth?.status ?? "not checked"}; rebuild decision is ${routeSpeedAvailability.releaseDecision.status} with shouldRebuild=${routeSpeedAvailability.releaseDecision.shouldRebuild}.`;
  const sourceRefreshPlanEvidence =
    sourceRefreshPlan === null
      ? " No source-refresh plan artifact found."
      : ` Source-refresh plan jobs: ${sourceRefreshPlan.jobs.map((job) => `${job.id}=${job.status}`).join(", ")}.`;
  const sameMonthPromotionIssues = [
    ...(monthSplit
      ? [
          `Canonical public-source month ${publicIsoMonth} differs from realtime appendix month ${realtimeIsoMonth}.`,
        ]
      : []),
    ...(!realtimeHasSpeedCoverage
      ? [`Realtime appendix month ${realtimeIsoMonth} has no public monthly speed coverage yet.`]
      : []),
    ...publicStrict.issues.map((issue) => issue.code),
  ];
  const sameMonthPromotionReady =
    sameMonthPromotionIssues.length === 0 && publicStrict.status === "pass";
  const sourceAvailabilityMissing =
    sourceRefreshPlan === null ? ["Source-refresh plan artifact is missing."] : [];
  const sourceAvailabilityStatus = sourceRefreshPlan === null ? "partial" : "pass";
  const cleanRebuildEvidence =
    cleanRebuild === null
      ? ""
      : ` Clean rebuild check is ${cleanRebuild.status}; built routes ${cleanRebuild.counts.builtRouteCount}/${cleanRebuild.counts.buildEligibleRouteCount}.`;
  const cleanRebuildIssues =
    cleanRebuild === null
      ? ["Clean rebuild from an empty local DB still needs to be run and recorded."]
      : cleanRebuild.issues.map((issue) => issue.code);
  const reproduciblePipelineStatus =
    publicStructural.status !== "pass"
      ? "blocked"
      : cleanRebuild?.status === "pass"
        ? "pass"
        : "partial";
  const checklist: PipelineV1AuditChecklistItem[] = [
    {
      requirement: "Reproducible full-network public-source pipeline",
      status: reproduciblePipelineStatus,
      evidence: `${publicIsoMonth} structural check is ${publicStructural.status}; built routes ${publicStructural.counts.builtRouteCount}/${publicStructural.counts.buildEligibleRouteCount}.${cleanRebuildEvidence}`,
      missing:
        publicStructural.status === "pass"
          ? cleanRebuild?.status === "pass"
            ? []
            : cleanRebuildIssues
          : publicStructural.issues.map((issue) => issue.code),
    },
    {
      requirement: "GTFS-RT observed reliability and bunching",
      status: realtimePreflight.status === "pass" ? "pass" : "blocked",
      evidence: `${realtimeIsoMonth} GTFS-RT preflight is ${realtimePreflight.status}; observed routes ${realtimePreflight.counts.routeObservedReliabilityObservedRows}, headway samples ${realtimePreflight.counts.observedHeadwaySampleRows}. ${
        monthSplit
          ? `This is a current observed appendix, not merged into ${publicIsoMonth} monthly release claims.`
          : "This is aligned with the canonical monthly release."
      }`,
      missing:
        realtimePreflight.status === "pass"
          ? []
          : realtimePreflight.issues.map((issue) => issue.code),
    },
    {
      requirement: "Before/after intervention evaluation",
      status:
        publicStructural.counts.peerAdjustedInterventionComparisonRows > 0 ? "pass" : "blocked",
      evidence: `${publicIsoMonth} has ${publicStructural.counts.routeInterventionComparisonRows} intervention comparisons, ${publicStructural.counts.evaluatedInterventionComparisonRows} evaluated rows, ${publicStructural.counts.peerAdjustedInterventionComparisonRows} peer-adjusted rows, ${publicStructural.counts.busLaneDatedInterventionComparisonRows} dated bus-lane comparison rows, and ${publicStructural.counts.busLaneSourceGapComparisonRows} bus-lane source-gap rows. Bus-lane source-date diagnostics: ${busLaneSourceGaps.missingOpenDateLaneInstanceCount}/${busLaneSourceGaps.matchedLaneInstanceCount} matched lane instances lack parseable source dates, including ${busLaneSourceGaps.blankOpenDateLaneInstanceCount} blank source open_date values and ${busLaneSourceGaps.unparsableOpenDateLaneInstanceCount} unparsable nonblank values across ${busLaneSourceGaps.routesWithMissingOpenDateCount} public route(s).`,
      missing:
        publicStructural.counts.peerAdjustedInterventionComparisonRows > 0
          ? []
          : ["Peer-adjusted intervention comparison rows are missing."],
    },
    {
      requirement: "Corridor grouping and corridor briefs",
      status:
        publicStructural.counts.corridorRows > 0 &&
        publicStructural.counts.corridorShapeReviewRouteRows > 0 &&
        publicStructural.counts.corridorShapeReviewIncompleteRows === 0
          ? "pass"
          : publicStructural.counts.corridorRows > 0
            ? "partial"
            : "blocked",
      evidence: `${publicIsoMonth} has ${publicStructural.counts.corridorRows} corridors, ${publicStructural.counts.corridorRouteMemberRows} route memberships, ${publicStructural.counts.corridorSegmentEvidenceRouteMemberRows} segment-backed memberships, ${publicStructural.counts.corridorShapeReviewPassRows} shape-reviewed pass rows, ${publicStructural.counts.corridorInterventionContextRows} intervention context rows, and ${publicStructural.counts.corridorArtifactRows} corridor artifacts.`,
      missing:
        publicStructural.counts.corridorShapeReviewRouteRows > 0 &&
        publicStructural.counts.corridorShapeReviewIncompleteRows === 0
          ? []
          : ["Shape-based corridor membership review remains open."],
    },
    {
      requirement: "Full route/corridor brief artifact set",
      status: publicStructural.audit.status === "pass" ? "pass" : "blocked",
      evidence: `${publicIsoMonth} route-batch audit is ${publicStructural.audit.status}; ${publicStructural.audit.artifactCount} artifacts, missing ${publicStructural.audit.missingArtifactCount}, hash mismatches ${publicStructural.audit.hashMismatchCount}.`,
      missing:
        publicStructural.audit.status === "pass"
          ? []
          : ["Route/corridor artifact audit is failing."],
    },
    {
      requirement: "Verified D1/static export contracts",
      status:
        publicStructural.d1?.status === "pass" &&
        publicStructural.audit.status === "pass" &&
        publicStructural.counts.evaluationArtifactIssueRows === 0 &&
        publicStructural.counts.mapArtifactIssueRows === 0
          ? "pass"
          : "blocked",
      evidence: `${publicIsoMonth} D1 status is ${publicStructural.d1?.status ?? "missing"}; route artifacts ${publicStructural.d1?.routeArtifactRows ?? 0}, corridor artifacts ${publicStructural.d1?.corridorArtifactRows ?? 0}, evaluation artifact rows ${publicStructural.counts.evaluationArtifactRows}, evaluation artifact issues ${publicStructural.counts.evaluationArtifactIssueRows}, map artifact features ${publicStructural.counts.mapArtifactRows}, map route-segment artifacts ${publicStructural.counts.mapRouteSegmentArtifactRows}, map artifact issues ${publicStructural.counts.mapArtifactIssueRows}.`,
      missing:
        publicStructural.d1?.status === "pass" &&
        publicStructural.audit.status === "pass" &&
        publicStructural.counts.evaluationArtifactIssueRows === 0 &&
        publicStructural.counts.mapArtifactIssueRows === 0
          ? []
          : [
              "D1 verification, brief artifact audit, evaluation artifact manifest, or map artifact manifest is failing.",
            ],
    },
    {
      requirement: "Observed monthly promotion condition",
      status: "pass",
      evidence: sameMonthPromotionReady
        ? `${publicIsoMonth} is ready to promote as an observed monthly release.`
        : `${publicIsoMonth} is a canonical monthly public-source release; same-month observed promotion is not ready yet. Promotion issues: ${sameMonthPromotionIssues.join(", ")}.`,
      missing: [],
    },
    {
      requirement: "Source cadence and release availability",
      status: sourceAvailabilityStatus,
      evidence: `${publicIsoMonth} speed routes: ${publicCoverage.speedRoutes}; ${realtimeIsoMonth} speed routes: ${realtimeCoverage.speedRoutes}; realtime month is ${realtimeIsoMonth}; same-month promotion ready=${sameMonthPromotionReady}.${routeSpeedAvailabilityEvidence}${sourceRefreshPlanEvidence}`,
      missing: sourceAvailabilityMissing,
    },
  ];
  const status = statusFromItems(checklist);
  const interventionMethodologyGate = methodologyGate({
    peerAdjustedInterventionComparisonRows:
      publicStructural.counts.peerAdjustedInterventionComparisonRows,
    busLaneSourceGapComparisonRows: publicStructural.counts.busLaneSourceGapComparisonRows,
    busLaneSourceGaps,
  });
  const recommendation =
    status === "pass"
      ? "Data Pipeline v1 passes as the latest defensible public-source monthly release with a labeled realtime observed appendix when available."
      : "Resolve the remaining blocked or partial checklist rows before calling Data Pipeline v1 complete; same-month source alignment is tracked separately as an observed monthly promotion condition.";
  const result: PipelineV1AuditResult = {
    status,
    generatedAt: new Date().toISOString(),
    objective: pipelineV1Objective,
    successCriteria: [...pipelineV1SuccessCriteria],
    releaseModel: {
      canonicalMonthlyRelease: publicIsoMonth,
      realtimeAppendix: realtimeIsoMonth,
      sameMonthPromotionReady,
      sameMonthPromotionIssues,
    },
    publicMonth: publicIsoMonth,
    realtimeMonth: realtimeIsoMonth,
    runId: args.runId ?? null,
    outputPath,
    checklist,
    coverage: {
      publicMonth: publicCoverage,
      realtimeMonth: realtimeCoverage,
    },
    sourceAvailability: {
      routeSpeed: routeSpeedAvailability,
      refreshPlan: sourceRefreshPlan,
    },
    interventions: {
      busLaneSourceGaps,
      methodologyGate: interventionMethodologyGate,
    },
    gates: {
      publicStructuralStatus: publicStructural.status,
      publicStrictStatus: publicStrict.status,
      realtimePreflightStatus: realtimePreflight.status,
      cleanRebuildStatus: cleanRebuild?.status ?? null,
      publicStrictIssues: publicStrict.issues.map((issue) => issue.code),
      realtimePreflightIssues: realtimePreflight.issues.map((issue) => issue.code),
      cleanRebuildIssues: cleanRebuild?.issues.map((issue) => issue.code) ?? [],
    },
    recommendation,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, result);

  return result;
}

export async function auditPipelineV1FromCli(args: string[]): Promise<PipelineV1AuditResult> {
  const parsed = parseArgs(args);
  const auditArgs: PipelineV1AuditArgs = {
    publicYear: parsed.publicYear,
    publicMonth: parsed.publicMonth,
    realtimeYear: parsed.realtimeYear,
    realtimeMonth: parsed.realtimeMonth,
    output: parsed.output,
  };
  if (parsed.runId.length > 0) {
    auditArgs.runId = parsed.runId;
  }
  if (parsed.dbPath.length > 0) {
    auditArgs.dbPath = parsed.dbPath;
  }
  if (parsed.cleanDbPath.length > 0) {
    auditArgs.cleanDbPath = parsed.cleanDbPath;
  }
  if (parsed.cleanArtifactRoot.length > 0) {
    auditArgs.cleanArtifactRoot = parsed.cleanArtifactRoot;
  }
  if (parsed.cleanExportRoot.length > 0) {
    auditArgs.cleanExportRoot = parsed.cleanExportRoot;
  }
  if (parsed.sourceMetadataDir.length > 0) {
    auditArgs.sourceMetadataDir = parsed.sourceMetadataDir;
  }
  if (parsed.now.getTime() > 0) {
    auditArgs.now = parsed.now;
  }
  if (parsed.minGtfsRtCollectionHours > 0) {
    auditArgs.minGtfsRtCollectionHours = parsed.minGtfsRtCollectionHours;
  }
  if (parsed.artifactRoot.length > 0) {
    auditArgs.artifactRoot = parsed.artifactRoot;
  }
  if (parsed.exportRoot.length > 0) {
    auditArgs.exportRoot = parsed.exportRoot;
  }

  return auditPipelineV1(auditArgs);
}
