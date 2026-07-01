import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseBusLaneOpenDates } from "@bp/pipeline-v2/local-db-aggregates";
import {
  listBusLanes,
  listRouteBriefSummaries,
  listRouteMonthCoverage,
  listRouteStops,
} from "@bp/db/local";
import { arg, defineCommand, z } from "@liche/core";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, fromRepoRoot } from "../../lib/paths.ts";
import { busLaneMatches } from "../../lib/route-briefs/index.ts";
import {
  type BusObservatoryAvailabilityResult,
  readBusObservatoryAvailabilityArtifact,
} from "../check/bus-observatory-gtfs-rt.ts";
import {
  type PipelineV1CheckResult,
  runCheckPipelineV1,
  runCheckPipelineV1WithDbPath,
} from "../check/pipeline-v1.ts";
import {
  type RouteSpeedAvailabilityResult,
  readRouteSpeedAvailabilityArtifact,
} from "../check/route-speed-availability.ts";
import { type GtfsRtPreflightResult, runGtfsRtPreflight } from "../gtfs-rt/preflight.ts";
import { readSourceRefreshPlanArtifact, type SourceRefreshPlan } from "../plan/source-refresh.ts";

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

type DataCompletenessStatus =
  | "complete"
  | "partial_realtime_only"
  | "partial_public_monthly_only"
  | "missing_speed"
  | "missing_realtime"
  | "insufficient_samples"
  | "source_lag_expected";

type ConfidenceLevel = "high" | "medium" | "low" | "none";

type ReleaseLayer = {
  id: "baseline_release" | "current_signal" | "pending_publication" | "observed_release";
  label: string;
  month: string | null;
  completenessStatus: DataCompletenessStatus;
  confidence: ConfidenceLevel;
  canSay: string[];
  directionalOnly: string[];
  cannotSayYet: string[];
  waitingOn: string[];
};

type CompletenessMetric = {
  metric: string;
  month: string;
  completenessStatus: DataCompletenessStatus;
  confidence: ConfidenceLevel;
  evidence: string;
};

type ThirdPartyRecoveredGtfsRtCandidate = {
  month: string;
  status:
    | "full_month_candidate_pending_row_level_qa"
    | "partial_month_candidate"
    | "missing"
    | "not_checked";
  gtfsRtSource: "third_party_recovered" | "none";
  provider: string | null;
  license: string | null;
  artifactPath: string | null;
  rowLevelQaRequired: boolean;
  canPromoteObservedRelease: false;
};

export type PipelineV1AuditResult = {
  status: RequirementStatus;
  generatedAt: string;
  objective: string;
  successCriteria: string[];
  releaseModel: {
    canonicalMonthlyRelease: string;
    realtimeAppendix: string;
    layers: ReleaseLayer[];
    metricCompleteness: CompletenessMetric[];
    thirdPartyRecoveredGtfsRtCandidate: ThirdPartyRecoveredGtfsRtCandidate;
    sameMonthPromotionReady: boolean;
    sameMonthPromotionIssues: string[];
  };
  publicMonth: string;
  realtimeMonth: string;
  runId: string | null;
  outputPath: string;
  checklist: PipelineV1AuditChecklistItem[];
  coverage: { publicMonth: CoverageSummary; realtimeMonth: CoverageSummary };
  sourceAvailability: {
    routeSpeed: RouteSpeedAvailabilityResult | null;
    refreshPlan: SourceRefreshPlan | null;
    busObservatoryGtfsRt: BusObservatoryAvailabilityResult | null;
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
  "Finish Data Pipeline v1: a reproducible full-network pipeline with GTFS-RT observed reliability/bunching, before/after intervention context, corridor grouping, verified D1/map static export contracts, QA gates, and updated roadmap/docs.";

const pipelineV1SuccessCriteria = [
  "Reproducible latest complete public-source monthly release from clean local DB evidence.",
  "GTFS-RT observed reliability and bunching computed from collected realtime samples and attached as a current observed appendix when source months differ.",
  "Every release layer and major metric is labeled with completeness status and confidence so source lag is visible rather than treated as failure.",
  "Before/after intervention evaluation exists with methodology and causal-claim gates.",
  "Corridor grouping exists with shape-reviewed segment evidence and corridor intervention context.",
  "Full route and corridor brief artifact set passes hash, byte-length, and JSON contract audits.",
  "D1 serving export and static map artifact contracts verify against generated data.",
  "Source-cadence caveats are explicit: delayed monthly public speeds are canonical for release claims, while live-only GTFS-RT is labeled as current observed evidence.",
  "Same-month public-speed and collected-realtime alignment is tracked as an observed monthly promotion condition, not a Data Pipeline v1 blocker.",
  "Roadmap, methodology, and handoff docs match the commands, limitations, source cadence, and promotion conditions.",
] as const;

function defaultOutputPath(publicMonth: string, realtimeMonth: string): string {
  return fromRepoRoot(
    join("data/artifacts/pipeline-v1", `audit-${publicMonth}-${realtimeMonth}.json`),
  );
}

function statusFromItems(items: readonly PipelineV1AuditChecklistItem[]): RequirementStatus {
  if (items.some((item) => item.status === "blocked")) return "blocked";
  if (items.some((item) => item.status === "partial")) return "partial";
  return "pass";
}

async function coverageSummary(
  local: OpenLocalPipelineDb,
  month: string,
): Promise<CoverageSummary> {
  const rows = await listRouteMonthCoverage(local.db, month);
  return {
    isoMonth: month,
    routeRows: rows.length,
    speedRoutes: rows.filter((row) => row.hasSpeedData).length,
    scheduleRoutes: rows.filter((row) => row.hasScheduleData).length,
  };
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

function realtimeCompletenessStatus(input: {
  realtimeStatus: string;
  observedRoutes: number;
  headwaySamples: number;
}): DataCompletenessStatus {
  if (input.realtimeStatus !== "pass") {
    return input.headwaySamples > 0 || input.observedRoutes > 0
      ? "insufficient_samples"
      : "missing_realtime";
  }
  return "partial_realtime_only";
}

function buildReleaseLayers(input: {
  publicIsoMonth: string;
  realtimeIsoMonth: string;
  publicStructuralStatus: string;
  publicCoverage: CoverageSummary;
  realtimeCoverage: CoverageSummary;
  realtimePreflightStatus: string;
  realtimeObservedRoutes: number;
  realtimeHeadwaySamples: number;
  sameMonthPromotionReady: boolean;
}): ReleaseLayer[] {
  const publicMonthlyComplete =
    input.publicStructuralStatus === "pass" && input.publicCoverage.speedRoutes > 0;
  const currentSignalStatus = realtimeCompletenessStatus({
    realtimeStatus: input.realtimePreflightStatus,
    observedRoutes: input.realtimeObservedRoutes,
    headwaySamples: input.realtimeHeadwaySamples,
  });
  const currentSignalHasSpeed = input.realtimeCoverage.speedRoutes > 0;

  return [
    {
      id: "baseline_release",
      label: "Baseline Release",
      month: input.publicIsoMonth,
      completenessStatus: publicMonthlyComplete ? "complete" : "missing_speed",
      confidence: publicMonthlyComplete ? "high" : "none",
      canSay: publicMonthlyComplete
        ? [
            "Monthly route segment speeds, schedules, route/corridor briefs, intervention comparisons, D1 exports, and static artifacts are publishable for the baseline month.",
          ]
        : [],
      directionalOnly: [
        "Observed reliability for this baseline month is not inferred from another month's GTFS-RT samples.",
      ],
      cannotSayYet: input.sameMonthPromotionReady
        ? []
        : ["Same-month observed reliability claims for the baseline month are not supported yet."],
      waitingOn: input.sameMonthPromotionReady
        ? []
        : ["A completed GTFS-RT collection aligned to the baseline public-source month."],
    },
    {
      id: "current_signal",
      label: "Current Signal",
      month: input.realtimeIsoMonth,
      completenessStatus: currentSignalHasSpeed ? "complete" : currentSignalStatus,
      confidence: input.realtimePreflightStatus === "pass" ? "medium" : "low",
      canSay:
        input.realtimePreflightStatus === "pass"
          ? [
              "Collected GTFS-RT supports current observed headway, bunching, and long-gap signals for routes with enough samples.",
            ]
          : [],
      directionalOnly: [
        "Current operational conditions can be compared qualitatively against the baseline, but are not merged into monthly speed/intervention claims until public monthly aggregates land.",
      ],
      cannotSayYet: currentSignalHasSpeed
        ? []
        : ["Full monthly speed performance for the current signal month is not available."],
      waitingOn: currentSignalHasSpeed
        ? []
        : ["MTA monthly route-segment speed publication for the current signal month."],
    },
    {
      id: "pending_publication",
      label: "Pending Publication",
      month: input.realtimeIsoMonth,
      completenessStatus: currentSignalHasSpeed ? "complete" : "source_lag_expected",
      confidence: currentSignalHasSpeed ? "high" : "medium",
      canSay: currentSignalHasSpeed
        ? ["Public monthly speed rows are available for the current signal month."]
        : ["The absence of current-month speed rows is an expected source-cadence condition."],
      directionalOnly: [],
      cannotSayYet: currentSignalHasSpeed
        ? []
        : ["Whether the current signal month is a complete public monthly release."],
      waitingOn: currentSignalHasSpeed ? [] : ["Next MTA monthly aggregate publication cycle."],
    },
    {
      id: "observed_release",
      label: "Observed Release",
      month: input.sameMonthPromotionReady ? input.publicIsoMonth : null,
      completenessStatus: input.sameMonthPromotionReady ? "complete" : "source_lag_expected",
      confidence: input.sameMonthPromotionReady ? "high" : "none",
      canSay: input.sameMonthPromotionReady
        ? [
            "Public monthly speed evidence and collected GTFS-RT observed reliability align for the same month.",
          ]
        : [],
      directionalOnly: [],
      cannotSayYet: input.sameMonthPromotionReady
        ? []
        : ["No month is currently promoted to observed release status."],
      waitingOn: input.sameMonthPromotionReady
        ? []
        : [
            "A month with both complete public monthly speed rows and passing collected GTFS-RT evidence.",
          ],
    },
  ];
}

function buildMetricCompleteness(input: {
  publicIsoMonth: string;
  realtimeIsoMonth: string;
  publicStructuralStatus: string;
  publicCoverage: CoverageSummary;
  realtimeCoverage: CoverageSummary;
  realtimePreflightStatus: string;
  realtimeObservedRoutes: number;
  realtimeHeadwaySamples: number;
  peerAdjustedRows: number;
  sameMonthPromotionReady: boolean;
}): CompletenessMetric[] {
  return [
    {
      metric: "public_monthly_speed",
      month: input.publicIsoMonth,
      completenessStatus:
        input.publicStructuralStatus === "pass" && input.publicCoverage.speedRoutes > 0
          ? "complete"
          : "missing_speed",
      confidence:
        input.publicStructuralStatus === "pass" && input.publicCoverage.speedRoutes > 0
          ? "high"
          : "none",
      evidence: `${input.publicCoverage.speedRoutes} route(s) have speed coverage in the baseline month.`,
    },
    {
      metric: "current_month_speed",
      month: input.realtimeIsoMonth,
      completenessStatus: input.realtimeCoverage.speedRoutes > 0 ? "complete" : "missing_speed",
      confidence: input.realtimeCoverage.speedRoutes > 0 ? "high" : "none",
      evidence: `${input.realtimeCoverage.speedRoutes} route(s) have speed coverage in the current signal month.`,
    },
    {
      metric: "observed_reliability",
      month: input.realtimeIsoMonth,
      completenessStatus: realtimeCompletenessStatus({
        realtimeStatus: input.realtimePreflightStatus,
        observedRoutes: input.realtimeObservedRoutes,
        headwaySamples: input.realtimeHeadwaySamples,
      }),
      confidence: input.realtimePreflightStatus === "pass" ? "medium" : "low",
      evidence: `${input.realtimeObservedRoutes} observed route(s) and ${input.realtimeHeadwaySamples} observed headway sample(s).`,
    },
    {
      metric: "baseline_observed_reliability",
      month: input.publicIsoMonth,
      completenessStatus: input.sameMonthPromotionReady ? "complete" : "missing_realtime",
      confidence: input.sameMonthPromotionReady ? "high" : "none",
      evidence: input.sameMonthPromotionReady
        ? "Baseline month has aligned public monthly and GTFS-RT observed evidence."
        : "Baseline month does not have aligned collected GTFS-RT evidence.",
    },
    {
      metric: "intervention_evaluation",
      month: input.publicIsoMonth,
      completenessStatus:
        input.peerAdjustedRows > 0 ? "partial_public_monthly_only" : "missing_speed",
      confidence: input.peerAdjustedRows > 0 ? "medium" : "none",
      evidence: `${input.peerAdjustedRows} peer-adjusted intervention comparison row(s); causal claims remain methodology-gated.`,
    },
  ];
}

function buildThirdPartyRecoveredGtfsRtCandidate(input: {
  publicIsoMonth: string;
  busObservatoryGtfsRt: BusObservatoryAvailabilityResult | null;
}): ThirdPartyRecoveredGtfsRtCandidate {
  const artifact = input.busObservatoryGtfsRt;
  if (artifact === null || artifact.requestedMonth !== input.publicIsoMonth) {
    return {
      month: input.publicIsoMonth,
      status: "not_checked",
      gtfsRtSource: "none",
      provider: null,
      license: null,
      artifactPath: null,
      rowLevelQaRequired: true,
      canPromoteObservedRelease: false,
    };
  }
  return {
    month: input.publicIsoMonth,
    status:
      artifact.coverage.status === "full_month_candidate"
        ? "full_month_candidate_pending_row_level_qa"
        : artifact.coverage.status,
    gtfsRtSource: artifact.provenance.gtfsRtSource,
    provider: `${artifact.provider.name} / ${artifact.provider.organization}`,
    license: artifact.provider.license,
    artifactPath: artifact.artifactPath ?? null,
    rowLevelQaRequired: artifact.qa.rowLevelQaRequired,
    canPromoteObservedRelease: false,
  };
}

async function busLaneSourceGapDiagnostics(
  local: OpenLocalPipelineDb,
  month: string,
): Promise<BusLaneSourceGapDiagnostics> {
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
      if (parseBusLaneOpenDates(sourceValue).length > 0) continue;
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
}

export type AuditPipelineV1Inputs = {
  local: OpenLocalPipelineDb;
  publicYear: number;
  publicMonth: number;
  realtimeYear?: number | undefined;
  realtimeMonth?: number | undefined;
  runId?: string | undefined;
  cleanDbPath?: string | undefined;
  cleanArtifactRoot?: string | undefined;
  cleanExportRoot?: string | undefined;
  sourceMetadataDir?: string | undefined;
  now?: Date | undefined;
  minGtfsRtCollectionHours?: number | undefined;
  artifactRoot?: string | undefined;
  exportRoot?: string | undefined;
  outputPath?: string | undefined;
};

export async function runAuditPipelineV1(
  inputs: AuditPipelineV1Inputs,
): Promise<PipelineV1AuditResult> {
  const publicYear = inputs.publicYear;
  const publicMonth = inputs.publicMonth;
  const realtimeYear = inputs.realtimeYear ?? publicYear;
  const realtimeMonth = inputs.realtimeMonth ?? publicMonth;
  const publicIsoMonth = isoMonth(publicYear, publicMonth);
  const realtimeIsoMonth = isoMonth(realtimeYear, realtimeMonth);
  const outputPath = inputs.outputPath ?? defaultOutputPath(publicIsoMonth, realtimeIsoMonth);
  const artifactRoot = inputs.artifactRoot ?? defaultArtifactRootPath();

  const cleanRebuild =
    inputs.cleanDbPath === undefined
      ? null
      : await runCheckPipelineV1WithDbPath({
          year: publicYear,
          month: publicMonth,
          dbPath: inputs.cleanDbPath,
          sourceMetadataDir: inputs.sourceMetadataDir,
          now: inputs.now,
          minGtfsRtCollectionHours: inputs.minGtfsRtCollectionHours,
          artifactRoot: inputs.cleanArtifactRoot ?? inputs.artifactRoot,
          exportRoot: inputs.cleanExportRoot ?? inputs.exportRoot,
          allowInsufficientGtfsRt: true,
        });

  const publicStructural: PipelineV1CheckResult = await runCheckPipelineV1({
    local: inputs.local,
    year: publicYear,
    month: publicMonth,
    sourceMetadataDir: inputs.sourceMetadataDir,
    now: inputs.now,
    minGtfsRtCollectionHours: inputs.minGtfsRtCollectionHours,
    artifactRoot: inputs.artifactRoot,
    exportRoot: inputs.exportRoot,
    allowInsufficientGtfsRt: true,
  });
  const publicStrict: PipelineV1CheckResult = await runCheckPipelineV1({
    local: inputs.local,
    year: publicYear,
    month: publicMonth,
    sourceMetadataDir: inputs.sourceMetadataDir,
    now: inputs.now,
    minGtfsRtCollectionHours: inputs.minGtfsRtCollectionHours,
    artifactRoot: inputs.artifactRoot,
    exportRoot: inputs.exportRoot,
  });

  const realtimePreflight: GtfsRtPreflightResult = await runGtfsRtPreflight({
    local: inputs.local,
    year: realtimeYear,
    month: realtimeMonth,
    runId: inputs.runId,
    minGtfsRtCollectionHours: inputs.minGtfsRtCollectionHours,
  });
  const publicCoverage = await coverageSummary(inputs.local, publicIsoMonth);
  const realtimeCoverage = await coverageSummary(inputs.local, realtimeIsoMonth);
  const busLaneSourceGaps = await busLaneSourceGapDiagnostics(inputs.local, publicIsoMonth);
  const routeSpeedAvailability = await readRouteSpeedAvailabilityArtifact(artifactRoot);
  const sourceRefreshPlan = await readSourceRefreshPlanArtifact(artifactRoot);
  const busObservatoryGtfsRt = await readBusObservatoryAvailabilityArtifact(
    artifactRoot,
    publicIsoMonth,
  );

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
  const releaseLayers = buildReleaseLayers({
    publicIsoMonth,
    realtimeIsoMonth,
    publicStructuralStatus: publicStructural.status,
    publicCoverage,
    realtimeCoverage,
    realtimePreflightStatus: realtimePreflight.status,
    realtimeObservedRoutes: realtimePreflight.counts.routeObservedReliabilityObservedRows,
    realtimeHeadwaySamples: realtimePreflight.counts.observedHeadwaySampleRows,
    sameMonthPromotionReady,
  });
  const metricCompleteness = buildMetricCompleteness({
    publicIsoMonth,
    realtimeIsoMonth,
    publicStructuralStatus: publicStructural.status,
    publicCoverage,
    realtimeCoverage,
    realtimePreflightStatus: realtimePreflight.status,
    realtimeObservedRoutes: realtimePreflight.counts.routeObservedReliabilityObservedRows,
    realtimeHeadwaySamples: realtimePreflight.counts.observedHeadwaySampleRows,
    peerAdjustedRows: publicStructural.counts.peerAdjustedInterventionComparisonRows,
    sameMonthPromotionReady,
  });
  const thirdPartyRecoveredGtfsRtCandidate = buildThirdPartyRecoveredGtfsRtCandidate({
    publicIsoMonth,
    busObservatoryGtfsRt,
  });
  const sourceAvailabilityMissing =
    sourceRefreshPlan === null ? ["Source-refresh plan artifact is missing."] : [];
  const sourceAvailabilityStatus: RequirementStatus =
    sourceRefreshPlan === null ? "partial" : "pass";
  const cleanRebuildEvidence =
    cleanRebuild === null
      ? ""
      : ` Clean rebuild check is ${cleanRebuild.status}; built routes ${cleanRebuild.counts.builtRouteCount}/${cleanRebuild.counts.buildEligibleRouteCount}.`;
  const cleanRebuildIssues =
    cleanRebuild === null
      ? ["Clean rebuild from an empty local DB still needs to be run and recorded."]
      : cleanRebuild.issues.map((issue) => issue.code);
  const reproduciblePipelineStatus: RequirementStatus =
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
      requirement: "Corridor grouping and artifacts",
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
      requirement: "Verified D1/static export contracts",
      status:
        publicStructural.d1?.status === "pass" && publicStructural.counts.mapArtifactIssueRows === 0
          ? "pass"
          : "blocked",
      evidence: `${publicIsoMonth} D1 status is ${publicStructural.d1?.status ?? "missing"}; route artifacts ${publicStructural.d1?.routeArtifactRows ?? 0}, corridor artifacts ${publicStructural.d1?.corridorArtifactRows ?? 0}, map artifact features ${publicStructural.counts.mapArtifactRows}, map route-segment artifacts ${publicStructural.counts.mapRouteSegmentArtifactRows}, map artifact issues ${publicStructural.counts.mapArtifactIssueRows}.`,
      missing:
        publicStructural.d1?.status === "pass" && publicStructural.counts.mapArtifactIssueRows === 0
          ? []
          : ["D1 verification or map artifact manifest is failing."],
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
    {
      requirement: "Completeness-aware release labels",
      status: "pass",
      evidence: `Release layers: ${releaseLayers.map((layer) => `${layer.label}=${layer.completenessStatus}`).join(", ")}. Metric labels: ${metricCompleteness.map((metric) => `${metric.metric}=${metric.completenessStatus}`).join(", ")}. Third-party recovered GTFS-RT candidate=${thirdPartyRecoveredGtfsRtCandidate.status}.`,
      missing: [],
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
      layers: releaseLayers,
      metricCompleteness,
      thirdPartyRecoveredGtfsRtCandidate,
      sameMonthPromotionReady,
      sameMonthPromotionIssues,
    },
    publicMonth: publicIsoMonth,
    realtimeMonth: realtimeIsoMonth,
    runId: inputs.runId ?? null,
    outputPath,
    checklist,
    coverage: { publicMonth: publicCoverage, realtimeMonth: realtimeCoverage },
    sourceAvailability: {
      routeSpeed: routeSpeedAvailability,
      refreshPlan: sourceRefreshPlan,
      busObservatoryGtfsRt,
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

export default defineCommand({
  path: ["audit", "pipeline-v1"],
  summary: "Run the pipeline v1 audit checklist and write a JSON report.",
  input: {
    options: dbOptions.extend({
      publicYear: arg.positiveInt().default(2026).describe("Public release calendar year"),
      publicMonth: arg.positiveInt().default(3).describe("Public release calendar month, 1-12"),
      realtimeYear: arg.positiveInt().optional().describe("Realtime appendix year"),
      realtimeMonth: arg.positiveInt().optional().describe("Realtime appendix month, 1-12"),
      runId: z.string().optional().describe("GTFS-RT collection run id"),
      cleanDb: z.string().optional().describe("Local pipeline DB path for the clean rebuild check"),
      cleanArtifactRoot: z.string().optional(),
      cleanExportRoot: z.string().optional(),
      sourceMetadataDir: z.string().optional(),
      minGtfsRtCollectionHours: z.coerce.number().optional(),
      artifactRoot: z.string().optional(),
      exportRoot: z.string().optional(),
      output: z.string().optional().describe("Override path for the audit JSON"),
    }),
  },
  output: z
    .object({
      status: z.enum(["pass", "partial", "blocked"]),
      publicMonth: z.string(),
      realtimeMonth: z.string(),
      outputPath: z.string(),
      checklist: z.array(z.unknown()),
      gates: z.unknown(),
    })
    .passthrough(),
  async run({ input }) {
    const cleanDbPath =
      input.options.cleanDb === undefined ? undefined : fromCliPath(input.options.cleanDb);
    const cleanArtifactRoot =
      input.options.cleanArtifactRoot === undefined
        ? undefined
        : fromCliPath(input.options.cleanArtifactRoot);
    const cleanExportRoot =
      input.options.cleanExportRoot === undefined
        ? undefined
        : fromCliPath(input.options.cleanExportRoot);
    const sourceMetadataDir =
      input.options.sourceMetadataDir === undefined
        ? undefined
        : fromCliPath(input.options.sourceMetadataDir);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? undefined
        : fromCliPath(input.options.artifactRoot);
    const exportRoot =
      input.options.exportRoot === undefined ? undefined : fromCliPath(input.options.exportRoot);
    const outputPath =
      input.options.output === undefined ? undefined : fromCliPath(input.options.output);
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "audit.pipeline-v1",
      operation: "runAuditPipelineV1",
      spanAttributes: {
        publicYear: input.options.publicYear ?? null,
        publicMonth: input.options.publicMonth ?? null,
        realtimeYear: input.options.realtimeYear ?? null,
        realtimeMonth: input.options.realtimeMonth ?? null,
        runId: input.options.runId ?? null,
      },
      run: (local) =>
        runAuditPipelineV1({
          local,
          publicYear: input.options.publicYear,
          publicMonth: input.options.publicMonth,
          realtimeYear: input.options.realtimeYear,
          realtimeMonth: input.options.realtimeMonth,
          runId: input.options.runId,
          cleanDbPath,
          cleanArtifactRoot,
          cleanExportRoot,
          sourceMetadataDir,
          minGtfsRtCollectionHours: input.options.minGtfsRtCollectionHours,
          artifactRoot,
          exportRoot,
          outputPath,
        }),
    });
  },
});
