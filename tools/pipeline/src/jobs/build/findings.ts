import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  BUS_LANE_DATE_SENTINELS,
  DEFAULT_INTERVENTION_GAP_THRESHOLDS,
  DEFAULT_INTERVENTION_UNDERPERFORMANCE_THRESHOLDS,
  DEFAULT_MULTI_MONTH_SPEED_PEER_THRESHOLDS,
  DEFAULT_OBSERVED_RELIABILITY_THRESHOLDS,
  DEFAULT_PERSISTENT_SPEED_HOTSPOT_THRESHOLDS,
  DEFAULT_SERVICE_REQUEST_CONTEXT_THRESHOLDS,
  DEFAULT_SOURCE_GAP_THRESHOLDS,
  detectInterventionGaps,
  detectInterventionUnderperformance,
  detectMultiMonthSpeedPeerDeficits,
  detectObservedReliability,
  detectPermitCorrelatedSlowdowns,
  detectPersistentSpeedHotspots,
  detectServiceRequestContext,
  detectSourceGaps,
  INTERVENTION_GAP_DETECTOR_ID,
  INTERVENTION_UNDERPERFORMANCE_DETECTOR_ID,
  type InterventionEvidenceStatus,
  type InterventionGapRouteInput,
  type InterventionUnderperformanceRouteInput,
  MULTI_MONTH_SPEED_PEER_DETECTOR_ID,
  type MultiMonthSpeedPeerRouteInput,
  OBSERVED_RELIABILITY_DETECTOR_ID,
  type ObservedReliabilityRouteInput,
  PERMIT_CORRELATED_SLOWDOWN_DETECTOR_ID,
  PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID,
  type PersistentSpeedHotspotRouteInput,
  SERVICE_REQUEST_CONTEXT_DETECTOR_ID,
  SOURCE_GAP_DETECTOR_ID,
  type SourceGapBusLaneDateInput,
  type SourceGapContextJoinInput,
  type SourceGapFreshnessInput,
  type SourceGapRouteInput,
} from "@bp/analytics";
import {
  getRouteHotspotSummary,
  type LocalFindingCandidate,
  type LocalFindingCoverageAudit,
  type LocalFindingEvidenceLink,
  listBusWaitAssessmentRowsForMonth,
  listRouteCatalog,
  listRouteHotspots,
  listRouteIdsWithLionLink,
  listRouteInterventionComparisons,
  listRouteMonthCoverage,
  listRouteMonthTrends,
  listRouteObservedReliabilitySummaries,
  listRouteReliabilityBaselines,
  replaceFindingsForMonth,
} from "@bp/db/local";
import {
  FindingEvidenceLinkSchema,
  FindingReviewPacketsArtifactSchema,
  type RouteMonthSignalFeature,
} from "@bp/domain";
import { isoMonth, nextIsoMonthStart } from "../../lib/dates.js";
import { writeJson } from "../../lib/json.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";
import { SOURCE_FRESHNESS_POLICIES } from "../../source-freshness-policy.js";
import { detectorSpecFor, writeDetectorSpecsArtifact } from "./detector-specs.js";
import {
  buildFindingSignalFeaturesArtifact,
  buildRouteMonthSignalFeaturesFromSqlite,
  signalFeaturesArtifactPath as signalFeaturesArtifactPathFor,
} from "./signal-features.js";

type FindingsDetectArgs = {
  year?: number;
  month?: number;
  dbPath?: string;
  artifactRoot?: string;
  reviewQueueLimit?: number;
};

export type FindingsDetectResult = {
  isoMonth: string;
  detectorRunId: string;
  detectorCounts: Array<{
    detectorId: string;
    candidateCount: number;
    coverageCount: number;
    hits: number;
    cleanNoHits: number;
  }>;
  dbPath: string;
  auditArtifactPath: string;
  detectorSpecsArtifactPath: string;
  reviewQueueArtifactPath: string;
  reviewPacketsArtifactPath: string;
  signalFeaturesArtifactPath: string;
};

function parseCliArgs(args: string[]): FindingsDetectArgs {
  return parseMonthDbCliArgs(args, {} as FindingsDetectArgs, [
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.artifactRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--review-queue-limit"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.reviewQueueLimit = Number(value);
        }
      },
    },
  ]);
}

function reviewQueueLimitFor(value: number | undefined): number {
  if (value === undefined) return 200;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`reviewQueueLimit must be a non-negative integer, got ${value}`);
  }
  return value;
}

function detectorRunIdFor(detectorId: string, month: string, generatedAt: string): string {
  return createHash("sha256")
    .update(`${detectorId}:${month}:${generatedAt}`)
    .digest("hex")
    .slice(0, 32);
}

function buildSourceGapInputs(args: {
  month: string;
  catalogRouteIds: readonly string[];
  coverageByRoute: Map<string, { hasSpeedData: boolean; speedObservationCount: number }>;
  routesWithGeometry: ReadonlySet<string>;
  observedHeadwaySamplesByRoute: Map<string, number>;
  scheduledBaselineSamplesByRoute: Map<string, number>;
}): SourceGapRouteInput[] {
  return args.catalogRouteIds.map((routeId) => {
    const coverage = args.coverageByRoute.get(routeId);
    return {
      routeId,
      hasSpeedData: coverage?.hasSpeedData ?? false,
      speedObservationCount: coverage?.speedObservationCount ?? 0,
      hasGeometry: args.routesWithGeometry.has(routeId),
      observedHeadwaySampleCount: args.observedHeadwaySamplesByRoute.get(routeId) ?? 0,
      scheduledBaselineHeadwaySampleCount: args.scheduledBaselineSamplesByRoute.get(routeId) ?? 0,
    };
  });
}

async function buildPersistentSpeedHotspotInputs(args: {
  catalogRouteIds: readonly string[];
  coverageByRoute: Map<string, { hasSpeedData: boolean; speedObservationCount: number }>;
  db: Parameters<typeof getRouteHotspotSummary>[0];
  month: string;
}): Promise<PersistentSpeedHotspotRouteInput[]> {
  return Promise.all(
    args.catalogRouteIds.map(async (routeId) => {
      const coverage = args.coverageByRoute.get(routeId);
      const [summary, hotspots] = await Promise.all([
        getRouteHotspotSummary(args.db, routeId, args.month),
        listRouteHotspots(args.db, routeId, args.month),
      ]);

      return {
        routeId,
        hasSpeedData: coverage?.hasSpeedData ?? false,
        speedObservationCount: coverage?.speedObservationCount ?? 0,
        segmentCount: summary?.segmentCount ?? 0,
        hotspots: hotspots.map((hotspot) => ({
          segmentId: hotspot.segmentId,
          hotspotRank: hotspot.hotspotRank ?? 0,
          direction: hotspot.direction,
          stopOrder: hotspot.stopOrder,
          timepointStopName: hotspot.timepointStopName,
          nextTimepointStopName: hotspot.nextTimepointStopName,
          observationCount: hotspot.observationCount,
          busTripCount: hotspot.busTripCount,
          weightedAverageSpeedMph: hotspot.weightedAverageSpeedMph,
          slowWindowShare: hotspot.slowWindowShare,
          speedSeverity: hotspot.speedSeverity,
          hotspotScore: hotspot.hotspotScore,
          riderImpactScore: hotspot.riderImpactScore ?? null,
          ridershipExposure: hotspot.ridershipExposure ?? null,
        })),
      };
    }),
  );
}

function recentIsoMonths(args: { year: number; month: number; count: number }): string[] {
  const months: string[] = [];
  let year = args.year;
  let month = args.month;
  for (let index = 0; index < args.count; index += 1) {
    months.unshift(isoMonth(year, month));
    month -= 1;
    if (month === 0) {
      year -= 1;
      month = 12;
    }
  }
  return months;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[midpoint] ?? null;
  const left = sorted[midpoint - 1];
  const right = sorted[midpoint];
  if (left === undefined || right === undefined) return null;
  return (left + right) / 2;
}

function buildMultiMonthSpeedPeerInputs(args: {
  catalogRouteIds: readonly string[];
  monthWindow: readonly string[];
  trends: Awaited<ReturnType<typeof listRouteMonthTrends>>;
}): MultiMonthSpeedPeerRouteInput[] {
  const months = new Set(args.monthWindow);
  const trendByRouteMonth = new Map(
    args.trends
      .filter((trend) => months.has(trend.month))
      .map((trend) => [`${trend.routeId}:${trend.month}`, trend] as const),
  );
  const peerByMonth = new Map<string, { medianSpeedMph: number | null; routeCount: number }>();
  for (const month of args.monthWindow) {
    const speeds = args.trends
      .filter(
        (trend) =>
          trend.month === month &&
          trend.hasSpeedTrend &&
          trend.averageSpeedMph !== null &&
          trend.speedObservationCount >=
            DEFAULT_MULTI_MONTH_SPEED_PEER_THRESHOLDS.minSpeedObservationCount,
      )
      .map((trend) => trend.averageSpeedMph)
      .filter((value): value is number => value !== null);
    peerByMonth.set(month, {
      medianSpeedMph: median(speeds),
      routeCount: speeds.length,
    });
  }

  return args.catalogRouteIds.map((routeId) => ({
    routeId,
    observations: args.monthWindow.map((month) => {
      const trend = trendByRouteMonth.get(`${routeId}:${month}`);
      const peer = peerByMonth.get(month);
      return {
        month,
        hasSpeedTrend: trend?.hasSpeedTrend ?? false,
        averageSpeedMph: trend?.averageSpeedMph ?? null,
        speedObservationCount: trend?.speedObservationCount ?? 0,
        peerMedianSpeedMph: peer?.medianSpeedMph ?? null,
        peerRouteCount: peer?.routeCount ?? 0,
      };
    }),
  }));
}

function buildBusWaitAssessmentByRoute(
  rows: Awaited<ReturnType<typeof listBusWaitAssessmentRowsForMonth>>,
): Map<string, { tripCount: number; waitAssessment: number | null }> {
  const weighted = new Map<string, { weightedTotal: number; tripCount: number }>();

  for (const row of rows) {
    if (row.waitAssessment === null || row.scheduledTrips <= 0) continue;
    const prior = weighted.get(row.routeId) ?? { weightedTotal: 0, tripCount: 0 };
    prior.weightedTotal += row.waitAssessment * row.scheduledTrips;
    prior.tripCount += row.scheduledTrips;
    weighted.set(row.routeId, prior);
  }

  return new Map(
    [...weighted.entries()].map(([routeId, row]) => [
      routeId,
      {
        tripCount: row.tripCount,
        waitAssessment: row.tripCount === 0 ? null : row.weightedTotal / row.tripCount,
      },
    ]),
  );
}

function buildObservedReliabilityInputs(args: {
  catalogRouteIds: readonly string[];
  observedSummaries: Awaited<ReturnType<typeof listRouteObservedReliabilitySummaries>>;
  scheduledBaselineSamplesByRoute: Map<string, number>;
  busWaitAssessmentByRoute: Map<string, { tripCount: number; waitAssessment: number | null }>;
}): ObservedReliabilityRouteInput[] {
  const summariesByRoute = new Map<string, (typeof args.observedSummaries)[number]>();
  for (const summary of args.observedSummaries) {
    const prior = summariesByRoute.get(summary.routeId);
    if (prior === undefined || summary.sampleCount > prior.sampleCount) {
      summariesByRoute.set(summary.routeId, summary);
    }
  }

  return args.catalogRouteIds.map((routeId) => {
    const summary = summariesByRoute.get(routeId);
    const busWait = args.busWaitAssessmentByRoute.get(routeId);
    return {
      routeId,
      reliabilityStatus: summary?.reliabilityStatus ?? "missing",
      sampleCount: summary?.sampleCount ?? 0,
      minSampleThreshold: summary?.minSampleThreshold ?? 0,
      observedLongGapShare: summary?.observedLongGapShare ?? null,
      waitReliabilityRatio: summary?.waitReliabilityRatio ?? null,
      excessWaitMinutes: summary?.excessWaitMinutes ?? null,
      scheduledBaselineHeadwaySampleCount: args.scheduledBaselineSamplesByRoute.get(routeId) ?? 0,
      busWaitAssessmentTripCount: busWait?.tripCount ?? 0,
      busWaitAssessment: busWait?.waitAssessment ?? null,
    };
  });
}

function routeSpeedSignalByRoute(
  features: readonly { routeId: string; maxHotspotScore: number | null }[],
): Map<string, number> {
  const output = new Map<string, number>();
  for (const feature of features) {
    if (feature.maxHotspotScore === null) continue;
    output.set(
      feature.routeId,
      Math.max(output.get(feature.routeId) ?? 0, feature.maxHotspotScore),
    );
  }
  return output;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function routeReliabilitySignalByRoute(
  routes: readonly ObservedReliabilityRouteInput[],
): Map<string, number> {
  const output = new Map<string, number>();
  for (const route of routes) {
    if (
      route.reliabilityStatus !== "observed" ||
      route.observedLongGapShare === null ||
      route.waitReliabilityRatio === null ||
      route.busWaitAssessment === null ||
      route.sampleCount < DEFAULT_OBSERVED_RELIABILITY_THRESHOLDS.minGtfsRtHeadwaySamples ||
      route.scheduledBaselineHeadwaySampleCount <
        DEFAULT_OBSERVED_RELIABILITY_THRESHOLDS.minScheduledBaselineSamples ||
      route.busWaitAssessmentTripCount <
        DEFAULT_OBSERVED_RELIABILITY_THRESHOLDS.minBusWaitAssessmentTrips
    ) {
      continue;
    }

    const longGapSignal = clamp(
      (route.observedLongGapShare -
        DEFAULT_OBSERVED_RELIABILITY_THRESHOLDS.minObservedLongGapShare) /
        (0.8 - DEFAULT_OBSERVED_RELIABILITY_THRESHOLDS.minObservedLongGapShare),
      0,
      1,
    );
    const waitRatioSignal = clamp(
      (Math.log(route.waitReliabilityRatio) -
        Math.log(DEFAULT_OBSERVED_RELIABILITY_THRESHOLDS.minWaitReliabilityRatio)) /
        (Math.log(10) - Math.log(DEFAULT_OBSERVED_RELIABILITY_THRESHOLDS.minWaitReliabilityRatio)),
      0,
      1,
    );
    const waitAssessmentSignal = clamp(
      (DEFAULT_OBSERVED_RELIABILITY_THRESHOLDS.maxBusWaitAssessment - route.busWaitAssessment) /
        (DEFAULT_OBSERVED_RELIABILITY_THRESHOLDS.maxBusWaitAssessment - 0.5),
      0,
      1,
    );
    output.set(
      route.routeId,
      Math.round(
        60 + 40 * (0.45 * longGapSignal + 0.35 * waitRatioSignal + 0.2 * waitAssessmentSignal),
      ),
    );
  }
  return output;
}

function buildInterventionStatusByRoute(
  comparisons: Awaited<ReturnType<typeof listRouteInterventionComparisons>>,
): Map<string, { status: InterventionEvidenceStatus; count: number }> {
  const statuses = new Map<string, string[]>();
  for (const comparison of comparisons) {
    const group = statuses.get(comparison.routeId) ?? [];
    group.push(comparison.comparisonStatus);
    statuses.set(comparison.routeId, group);
  }

  return new Map(
    [...statuses.entries()].map(([routeId, routeStatuses]) => {
      const nonFuture = routeStatuses.filter((status) => status !== "future_intervention");
      const hasDatedOrEvaluated = nonFuture.some(
        (status) => status !== "source_gap_missing_implementation_date",
      );
      const sourceGapOnly =
        nonFuture.length > 0 &&
        nonFuture.every((status) => status === "source_gap_missing_implementation_date");
      const status: InterventionEvidenceStatus = hasDatedOrEvaluated
        ? "dated_or_evaluated"
        : sourceGapOnly
          ? "thin_source_gap"
          : "future_only";

      return [routeId, { status, count: routeStatuses.length }];
    }),
  );
}

function buildInterventionGapInputs(args: {
  catalogRouteIds: readonly string[];
  speedPainByRoute: Map<string, number>;
  reliabilityPainByRoute: Map<string, number>;
  interventionStatusByRoute: Map<string, { status: InterventionEvidenceStatus; count: number }>;
}): InterventionGapRouteInput[] {
  return args.catalogRouteIds.map((routeId) => {
    const intervention = args.interventionStatusByRoute.get(routeId);
    return {
      routeId,
      speedPainScore: args.speedPainByRoute.get(routeId) ?? null,
      reliabilityPainScore: args.reliabilityPainByRoute.get(routeId) ?? null,
      interventionEvidenceStatus: intervention?.status ?? "absent",
      interventionEvidenceCount: intervention?.count ?? 0,
    };
  });
}

function buildInterventionUnderperformanceInputs(args: {
  catalogRouteIds: readonly string[];
  speedPainByRoute: Map<string, number>;
  reliabilityPainByRoute: Map<string, number>;
  comparisons: Awaited<ReturnType<typeof listRouteInterventionComparisons>>;
}): InterventionUnderperformanceRouteInput[] {
  const comparisonsByRoute = new Map<string, typeof args.comparisons>();
  for (const comparison of args.comparisons) {
    const group = comparisonsByRoute.get(comparison.routeId) ?? [];
    group.push(comparison);
    comparisonsByRoute.set(comparison.routeId, group);
  }

  return args.catalogRouteIds.map((routeId) => ({
    routeId,
    speedPainScore: args.speedPainByRoute.get(routeId) ?? null,
    reliabilityPainScore: args.reliabilityPainByRoute.get(routeId) ?? null,
    comparisons: (comparisonsByRoute.get(routeId) ?? []).map((comparison) => ({
      eventId: comparison.eventId,
      interventionType: comparison.interventionType,
      comparisonStatus: comparison.comparisonStatus,
      adjustedSpeedDeltaMph: comparison.adjustedSpeedDeltaMph,
      comparisonRouteCount: comparison.comparisonRouteCount,
    })),
  }));
}

type DetectorOutput = {
  candidates: readonly LocalFindingCandidate[];
  coverage: readonly LocalFindingCoverageAudit[];
  evidence: readonly LocalFindingEvidenceLink[];
};

function stableId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 32);
}

function attachRouteContextEvidence(
  output: DetectorOutput,
  features: readonly RouteMonthSignalFeature[],
): DetectorOutput {
  const featureByRoute = new Map<string, RouteMonthSignalFeature>(
    features.map((feature) => [feature.routeId, feature]),
  );
  const contextEvidence: LocalFindingEvidenceLink[] = [];

  for (const candidate of output.candidates) {
    if (candidate.routeId === null) continue;
    const feature = featureByRoute.get(candidate.routeId);
    if (feature === undefined || feature.contextTouchedEventCount === 0) continue;

    contextEvidence.push(
      FindingEvidenceLinkSchema.parse({
        linkId: stableId(candidate.candidateId, "route_context_feature", candidate.routeId),
        candidateId: candidate.candidateId,
        evidenceKind: "context_event",
        evidenceRole: "context",
        evidenceRef: JSON.stringify({
          artifactKind: "route_month_context_evidence",
          routeId: candidate.routeId,
          month: feature.month,
          contextTouchedEventCount: feature.contextTouchedEventCount,
          contextTouchCount: feature.contextTouchCount,
          contextPrimaryTouchCount: feature.contextPrimaryTouchCount,
          contextHighConfidenceTouchCount: feature.contextHighConfidenceTouchCount,
          contextEventCounts: feature.contextEventCounts,
          provenance: feature.provenance,
        }),
        evidenceWeight: Math.min(1, feature.contextHighConfidenceTouchCount / 100),
        note: "Route-month context evidence summary across all normalized context sources; use as context/caveat unless the source eligibility ledger permits primary use.",
      }) as LocalFindingEvidenceLink,
    );
  }

  return {
    candidates: output.candidates,
    coverage: output.coverage,
    evidence: [...output.evidence, ...contextEvidence],
  };
}

type ReviewQueueCandidate = DetectorOutput["candidates"][number] & {
  evidenceRefs: string[];
};

type ReviewQueueItem = Pick<
  ReviewQueueCandidate,
  | "candidateId"
  | "detectorId"
  | "routeId"
  | "scopeKind"
  | "scopeId"
  | "reasonCode"
  | "severity"
  | "confidence"
  | "detectorScore"
  | "claimSafeLabel"
  | "claimText"
  | "evidenceRefs"
> & {
  reviewRank: number;
  reviewState: string;
  category: string;
  reviewPriority: number;
  reviewPriorityBand: string;
  reviewSignals: string[];
  evidenceRefCount: number;
};

function countBy<T>(rows: readonly T[], key: (row: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const value = key(row);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function countFor(counts: Record<string, number>, key: string): number {
  return Object.entries(counts).find(([countKey]) => countKey === key)?.[1] ?? 0;
}

function buildDetectorAuditArtifact(args: {
  isoMonth: string;
  generatedAt: string;
  outputs: readonly DetectorOutput[];
}) {
  return {
    artifactKind: "finding_detector_coverage_audit",
    schemaVersion: 1,
    month: args.isoMonth,
    generatedAt: args.generatedAt,
    detectorCount: args.outputs.length,
    detectors: args.outputs.map((output) => ({
      detectorId: output.coverage[0]?.detectorId ?? output.candidates[0]?.detectorId ?? "unknown",
      candidateCount: output.candidates.length,
      evidenceCount: output.evidence.length,
      coverageCount: output.coverage.length,
      outcomeCounts: countBy(output.coverage, (row) => row.outcome),
      reasonCounts: countBy(
        output.coverage.filter((row) => row.reasonCode !== null),
        (row) => row.reasonCode ?? "unknown",
      ),
      candidateReasonCounts: countBy(output.candidates, (row) => row.reasonCode),
      topCandidates: [...output.candidates]
        .sort((left, right) => right.detectorScore - left.detectorScore)
        .slice(0, 10)
        .map((candidate) => ({
          candidateId: candidate.candidateId,
          routeId: candidate.routeId,
          scopeKind: candidate.scopeKind,
          scopeId: candidate.scopeId,
          reasonCode: candidate.reasonCode,
          severity: candidate.severity,
          confidence: candidate.confidence,
          detectorScore: candidate.detectorScore,
          claimSafeLabel: candidate.claimSafeLabel,
          claimText: candidate.claimText,
        })),
    })),
  };
}

async function writeDetectorAuditArtifact(args: {
  artifactRoot: string;
  isoMonth: string;
  generatedAt: string;
  outputs: readonly DetectorOutput[];
}): Promise<string> {
  const path = join(args.artifactRoot, "findings", args.isoMonth, "detector-coverage-audit.json");
  await mkdir(dirname(path), { recursive: true });
  await writeJson(
    path,
    buildDetectorAuditArtifact({
      isoMonth: args.isoMonth,
      generatedAt: args.generatedAt,
      outputs: args.outputs,
    }),
  );
  return path;
}

function reviewPriority(
  candidate: Pick<ReviewQueueCandidate, "detectorScore" | "severity">,
): number {
  const severityBoost =
    candidate.severity === "high" ? 10 : candidate.severity === "medium" ? 5 : 0;
  return candidate.detectorScore + severityBoost;
}

function reviewPriorityBand(priority: number): "critical" | "high" | "medium" | "low" {
  if (priority >= 105) return "critical";
  if (priority >= 90) return "high";
  if (priority >= 70) return "medium";
  return "low";
}

function reviewSignals(candidate: ReviewQueueCandidate): string[] {
  const signals = [`${candidate.detectorId}:${candidate.reasonCode}`];
  if (candidate.severity === "high") {
    signals.push("high_severity");
  }
  if (candidate.confidence === "low") {
    signals.push("low_confidence");
  }
  if (candidate.evidenceRefs.length === 0) {
    signals.push("missing_evidence_ref");
  }
  if (candidate.scopeKind !== "route") {
    signals.push(`${candidate.scopeKind}_scope`);
  }
  return signals;
}

type ReviewQueueHealthIssue = {
  severity: "warning" | "info";
  code: string;
  message: string;
  count: number;
};

function buildReviewQueueHealth(args: {
  candidateCount: number;
  criticalOmittedCount: number;
  omittedCandidateCount: number;
  unlinkedCandidateCount: number;
  routeGroupCount: number;
}): { status: "ok" | "attention_required"; issues: ReviewQueueHealthIssue[] } {
  const issues: ReviewQueueHealthIssue[] = [];
  if (args.candidateCount === 0) {
    issues.push({
      severity: "warning",
      code: "empty_review_queue",
      message: "No candidates were surfaced for review.",
      count: 0,
    });
  }
  if (args.criticalOmittedCount > 0) {
    issues.push({
      severity: "warning",
      code: "critical_candidates_omitted",
      message: "The review cap omitted critical-priority candidates.",
      count: args.criticalOmittedCount,
    });
  }
  if (args.unlinkedCandidateCount > 0) {
    issues.push({
      severity: "warning",
      code: "candidate_evidence_refs_missing",
      message: "Some detector candidates have no evidence refs attached.",
      count: args.unlinkedCandidateCount,
    });
  }
  if (args.candidateCount > 0 && args.routeGroupCount === 0) {
    issues.push({
      severity: "info",
      code: "no_route_scoped_candidates",
      message: "The surfaced queue has no route-scoped candidates to group.",
      count: args.candidateCount,
    });
  }
  if (args.omittedCandidateCount > 0 && args.criticalOmittedCount === 0) {
    issues.push({
      severity: "info",
      code: "lower_priority_candidates_omitted",
      message: "The review cap omitted non-critical candidates.",
      count: args.omittedCandidateCount,
    });
  }

  return {
    status: issues.some((issue) => issue.severity === "warning") ? "attention_required" : "ok",
    issues,
  };
}

function validationChecksFor(
  candidate: Pick<ReviewQueueCandidate, "detectorId" | "scopeKind">,
): string[] {
  const checks = [
    "Read the claim text, detector/reason code, scope, priority, confidence, and evidence objects.",
    "Audit whether detector inputs support emitting this candidate without relying on detector score alone.",
  ];
  if (candidate.scopeKind !== "route") {
    checks.push(
      "Check whether the non-route scope is specific enough or should be split/enriched.",
    );
  }
  if (candidate.detectorId === SOURCE_GAP_DETECTOR_ID) {
    checks.push("Check whether this should remain a data-quality work item, not a service claim.");
  } else {
    checks.push(
      "Check whether the detector claim overstates, conflates, or underspecifies the evidence.",
    );
  }
  checks.push("Return one detector action: keep, downgrade, suppress, split, or enrich.");
  return checks;
}

function parseEvidenceObject(evidenceRef: string): unknown {
  try {
    return JSON.parse(evidenceRef) as unknown;
  } catch {
    return {
      parseError: "evidence_ref_is_not_json",
      rawEvidenceRef: evidenceRef,
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function derivedMetricWarningsFor(evidenceObjects: readonly unknown[]): string[] {
  const warnings = new Set<string>();
  for (const evidence of evidenceObjects) {
    if (!isRecord(evidence)) continue;
    if ("speedPainScore" in evidence) {
      warnings.add(
        "speedPainScore is a derived detector score; verify the underlying segment speed metrics before relying on it.",
      );
    }
    if ("reliabilityPainScore" in evidence) {
      warnings.add(
        "reliabilityPainScore is a derived detector score; verify the underlying observed reliability metrics before relying on it.",
      );
    }
    if ("hotspotScore" in evidence || "riderImpactScore" in evidence) {
      warnings.add(
        "hotspotScore/riderImpactScore are derived rankings; inspect weightedAverageSpeedMph, slowWindowShare, observations, trips, and exposure.",
      );
    }
  }
  return [...warnings].sort();
}

function detectorGuidanceFor(detectorId: string) {
  if (detectorId === SOURCE_GAP_DETECTOR_ID) {
    return {
      detectorKind: "data_quality",
      validateAs: "Data-quality gap; do not promote as a service-performance finding by itself.",
      defaultThresholds: DEFAULT_SOURCE_GAP_THRESHOLDS,
      keyEvidenceFields: {
        reasonCode: "Which missing/stale/join-failed source condition triggered the candidate.",
        observedCount: "Observed input count when present in evidence.",
        expected: "Minimum expected input or freshness condition when present in evidence.",
      },
      commonFollowUps: [
        "Check whether a newer source capture resolves the gap.",
        "Attach the missing source class or coverage audit before citing this in a public brief.",
      ],
    };
  }
  if (detectorId === PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID) {
    return {
      detectorKind: "service_performance",
      validateAs: "Segment-scoped low-speed hotspot.",
      defaultThresholds: DEFAULT_PERSISTENT_SPEED_HOTSPOT_THRESHOLDS,
      keyEvidenceFields: {
        weightedAverageSpeedMph: "Observed segment speed; lower is worse.",
        slowWindowShare: "Share of observed windows classified as slow.",
        observationCount: "Speed observations supporting the segment metric.",
        busTripCount: "Trip exposure supporting confidence.",
        ridershipExposure: "Rider exposure used for impact ranking when available.",
      },
      commonFollowUps: [
        "Confirm the segment stop names and geometry if speed is near zero.",
        "Prefer segment-specific validation over route-wide claims.",
      ],
    };
  }
  if (detectorId === MULTI_MONTH_SPEED_PEER_DETECTOR_ID) {
    return {
      detectorKind: "service_performance",
      validateAs: "Route-scoped multi-month low-speed trend below a broad peer median.",
      defaultThresholds: DEFAULT_MULTI_MONTH_SPEED_PEER_THRESHOLDS,
      keyEvidenceFields: {
        observedMonthCount: "Number of supported route-month trend rows in the lookback window.",
        averageSpeedMph: "Mean route speed across supported months; lower is worse.",
        averagePeerMedianSpeedMph:
          "Mean monthly route-corpus median speed used as the starter peer baseline.",
        averagePeerDeficitMph: "Peer median minus route speed across supported months.",
        peerRouteCount: "Number of routes contributing to each monthly peer median.",
      },
      commonFollowUps: [
        "Inspect counter-evidence for weak months and broad-peer limitations.",
        "Replace the broad corpus median with a reviewed borough/route-type peer group before making strong peer claims.",
      ],
    };
  }
  if (detectorId === OBSERVED_RELIABILITY_DETECTOR_ID) {
    return {
      detectorKind: "service_performance",
      validateAs: "Route-scoped observed reliability risk corroborated by Bus Wait Assessment.",
      defaultThresholds: DEFAULT_OBSERVED_RELIABILITY_THRESHOLDS,
      keyEvidenceFields: {
        sampleCount: "Observed GTFS-RT headway samples.",
        observedLongGapShare: "Share of observed headways above the long-gap threshold.",
        waitReliabilityRatio: "Observed wait burden relative to scheduled expectation.",
        busWaitAssessment: "MTA wait-assessment pass share; lower is worse.",
        busWaitAssessmentTripCount: "Scheduled trips supporting the wait-assessment corroboration.",
      },
      commonFollowUps: [
        "Attach observed run id and scheduled-baseline context before publication.",
        "Check whether reliability risk is directional or time-window-specific.",
      ],
    };
  }
  if (detectorId === INTERVENTION_GAP_DETECTOR_ID) {
    return {
      detectorKind: "intervention_gap",
      validateAs:
        "High derived speed/reliability detector signal plus absent/thin dated intervention evidence.",
      defaultThresholds: DEFAULT_INTERVENTION_GAP_THRESHOLDS,
      keyEvidenceFields: {
        speedPainScore:
          "Derived from speed-hotspot detector output; require underlying segment-speed evidence for review.",
        reliabilityPainScore:
          "Derived from observed-reliability detector output; require underlying headway/wait evidence for review.",
        interventionEvidenceStatus: "absent/thin_source_gap/future_only/dated_or_evaluated.",
        interventionEvidenceCount: "Count of intervention comparison records seen for the route.",
      },
      commonFollowUps: [
        "Attach the underlying intervention source inventory before making a strong no-intervention claim.",
        "Attach the underlying speed/reliability evidence that produced any derived detector score.",
      ],
    };
  }
  if (detectorId === INTERVENTION_UNDERPERFORMANCE_DETECTOR_ID) {
    return {
      detectorKind: "intervention_evaluation",
      validateAs:
        "Implemented/evaluated treatment with non-positive peer-adjusted speed delta and a high current speed-derived detector signal.",
      defaultThresholds: DEFAULT_INTERVENTION_UNDERPERFORMANCE_THRESHOLDS,
      keyEvidenceFields: {
        eventId: "Intervention event evaluated by the comparison.",
        interventionType: "Treatment/source type.",
        adjustedSpeedDeltaMph: "Peer-adjusted speed change; non-positive triggers the detector.",
        comparisonRouteCount: "Number of peer routes in the comparison.",
        speedPainScore:
          "Derived from current speed-hotspot detector output; required for this speed-delta detector.",
        reliabilityPainScore:
          "Derived from current observed-reliability detector output; context only for this speed-delta detector.",
      },
      commonFollowUps: [
        "Check before/after windows, peer routes, and uncertainty before claiming underperformance.",
        "Attach underlying speed-hotspot metrics before relying on speedPainScore.",
      ],
    };
  }
  if (detectorId === SERVICE_REQUEST_CONTEXT_DETECTOR_ID) {
    return {
      detectorKind: "context",
      validateAs:
        "Route-scoped slow-speed evidence with substantial 311 service-request context; not causal by itself.",
      defaultThresholds: DEFAULT_SERVICE_REQUEST_CONTEXT_THRESHOLDS,
      keyEvidenceFields: {
        routeWeightedAverageSpeedMph: "Route-month speed signal; lower is worse.",
        speedObservationCount: "Speed observations supporting the route-month metric.",
        maxHotspotScore: "Maximum route hotspot score used as alternate speed-pain signal.",
        serviceRequestContext:
          "311 touch counts, high-confidence support, match weight, source ids, and fanout.",
      },
      commonFollowUps: [
        "Inspect counter-evidence for fanout, match weight, and reporting-bias limits.",
        "Use context/correlation language unless event-level 311 rows are reviewed.",
      ],
    };
  }

  return {
    detectorKind: "unknown",
    validateAs: "Unknown detector; inspect detector source before promotion.",
    defaultThresholds: {},
    keyEvidenceFields: {},
    commonFollowUps: ["Inspect detector source and evidence generation before validating."],
  };
}

function buildAgentReviewSection(args: {
  isoMonth: string;
  health: { status: "ok" | "attention_required"; issues: ReviewQueueHealthIssue[] };
  summary: {
    capExhaustedPriorityBands: string[];
  };
  routeGroups: readonly {
    routeRank: number;
    routeId: string;
    candidateCount: number;
    detectorIds: string[];
    reasonCodes: string[];
    topReviewPriority: number;
    topReviewPriorityBand: string;
    hasMultiDetectorSignal: boolean;
    evidenceRefCount: number;
    topCandidateIds: string[];
  }[];
  candidates: readonly ReviewQueueItem[];
}) {
  const candidatePackets = args.candidates.map((candidate) => {
    const evidenceRefs = candidate.evidenceRefs.slice(0, 5);
    const evidenceObjects = evidenceRefs.map(parseEvidenceObject);
    return {
      candidateId: candidate.candidateId,
      reviewRank: candidate.reviewRank,
      routeId: candidate.routeId,
      detectorId: candidate.detectorId,
      reasonCode: candidate.reasonCode,
      scope: {
        kind: candidate.scopeKind,
        id: candidate.scopeId,
      },
      claim: {
        safeLabel: candidate.claimSafeLabel,
        text: candidate.claimText,
      },
      priority: {
        score: candidate.reviewPriority,
        band: candidate.reviewPriorityBand,
        signals: candidate.reviewSignals,
      },
      detectorGuidance: detectorGuidanceFor(candidate.detectorId),
      evidenceRefs,
      evidenceObjects,
      derivedMetricWarnings: derivedMetricWarningsFor(evidenceObjects),
      validationChecks: validationChecksFor(candidate),
    };
  });

  return {
    reviewMode: "agent_detector_audit",
    month: args.isoMonth,
    intendedReviewers: ["codex", "claude"],
    instructions: [
      "Audit why the detector emitted each candidate; do not bless findings for publication.",
      "Evaluate detector inputs and evidence shape, not detector score alone.",
      "Treat source_gap candidates as data-quality work items unless evidence independently supports a service claim.",
      "Prefer routeGroups when multiple candidates share a route; audit whether the combined route story is stronger than any single row.",
      "Use evidenceObjects first; evidenceRefs are retained as raw provenance strings.",
      "Keep the output structured so another agent or pipeline step can apply it without prose parsing.",
    ],
    outputSchema: {
      detectorAction: "keep | downgrade | suppress | split | enrich",
      confidence: "high | medium | low",
      revisedClaimText: "string | null",
      evidenceRefsUsed: "string[]",
      rationale: "string",
      detectorImprovement: "string | null",
    },
    health: args.health,
    capExhaustedPriorityBands: args.summary.capExhaustedPriorityBands,
    routePackets: args.routeGroups.slice(0, 20).map((group) => ({
      routeRank: group.routeRank,
      routeId: group.routeId,
      candidateCount: group.candidateCount,
      hasMultiDetectorSignal: group.hasMultiDetectorSignal,
      detectorIds: group.detectorIds,
      reasonCodes: group.reasonCodes,
      topReviewPriority: group.topReviewPriority,
      topReviewPriorityBand: group.topReviewPriorityBand,
      evidenceRefCount: group.evidenceRefCount,
      candidateIds: group.topCandidateIds,
      task:
        group.detectorIds.length > 1
          ? "Audit whether the route-level multi-detector story is coherent, then audit each linked detector candidate."
          : "Audit each linked detector candidate independently.",
    })),
    candidatePackets,
  };
}

function buildFindingReviewQueueArtifact(args: {
  isoMonth: string;
  generatedAt: string;
  outputs: readonly DetectorOutput[];
  limit: number;
}) {
  const candidatesById = new Map<string, ReviewQueueCandidate>();
  for (const output of args.outputs) {
    for (const candidate of output.candidates) {
      candidatesById.set(candidate.candidateId, { ...candidate, evidenceRefs: [] });
    }
    for (const link of output.evidence) {
      const evidence = link as { candidateId?: unknown; evidenceRef?: unknown };
      if (typeof evidence.candidateId !== "string" || typeof evidence.evidenceRef !== "string") {
        continue;
      }
      candidatesById.get(evidence.candidateId)?.evidenceRefs.push(evidence.evidenceRef);
    }
  }

  const sortedCandidates = [...candidatesById.values()].sort((left, right) => {
    const priorityDelta = reviewPriority(right) - reviewPriority(left);
    if (priorityDelta !== 0) return priorityDelta;
    return left.candidateId.localeCompare(right.candidateId);
  });
  const omittedCandidates = sortedCandidates.slice(args.limit);
  const candidates = sortedCandidates.slice(0, args.limit).map((candidate, index) => {
    const priority = reviewPriority(candidate);
    return {
      reviewRank: index + 1,
      reviewState: candidate.confidence === "low" ? "needs_review" : "unreviewed",
      candidateId: candidate.candidateId,
      detectorId: candidate.detectorId,
      routeId: candidate.routeId,
      scopeKind: candidate.scopeKind,
      scopeId: candidate.scopeId,
      reasonCode: candidate.reasonCode,
      category: candidate.detectorId === "source_gap" ? "data_quality" : candidate.reasonCode,
      severity: candidate.severity,
      confidence: candidate.confidence,
      detectorScore: candidate.detectorScore,
      reviewPriority: priority,
      reviewPriorityBand: reviewPriorityBand(priority),
      reviewSignals: reviewSignals(candidate),
      claimSafeLabel: candidate.claimSafeLabel,
      claimText: candidate.claimText,
      evidenceRefs: candidate.evidenceRefs.slice(0, 5),
      evidenceRefCount: candidate.evidenceRefs.length,
    };
  });
  const candidatesByRoute = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    if (candidate.routeId === null) continue;
    const group = candidatesByRoute.get(candidate.routeId) ?? [];
    group.push(candidate);
    candidatesByRoute.set(candidate.routeId, group);
  }
  const routeGroups = [...candidatesByRoute.entries()]
    .map(([routeId, group]) => {
      const topReviewPriority = Math.max(...group.map((candidate) => candidate.reviewPriority));
      const detectorIds = [...new Set(group.map((candidate) => candidate.detectorId))].sort();
      return {
        routeRank: 0,
        routeId,
        candidateCount: group.length,
        detectorIds,
        reasonCodes: [...new Set(group.map((candidate) => candidate.reasonCode))].sort(),
        topReviewPriority,
        topReviewPriorityBand: reviewPriorityBand(topReviewPriority),
        hasMultiDetectorSignal: detectorIds.length > 1,
        evidenceRefCount: group.reduce((total, candidate) => total + candidate.evidenceRefCount, 0),
        topCandidateIds: group
          .sort((left, right) => {
            const priorityDelta = right.reviewPriority - left.reviewPriority;
            if (priorityDelta !== 0) return priorityDelta;
            return left.candidateId.localeCompare(right.candidateId);
          })
          .slice(0, 5)
          .map((candidate) => candidate.candidateId),
      };
    })
    .sort((left, right) => {
      const priorityDelta = right.topReviewPriority - left.topReviewPriority;
      if (priorityDelta !== 0) return priorityDelta;
      const detectorDelta = right.detectorIds.length - left.detectorIds.length;
      if (detectorDelta !== 0) return detectorDelta;
      const candidateDelta = right.candidateCount - left.candidateCount;
      if (candidateDelta !== 0) return candidateDelta;
      return left.routeId.localeCompare(right.routeId);
    })
    .map((group, index) => ({
      ...group,
      routeRank: index + 1,
    }));
  const reviewSummary = {
    totalPriorityBandCounts: countBy(sortedCandidates, (candidate) =>
      reviewPriorityBand(reviewPriority(candidate)),
    ),
    surfacedPriorityBandCounts: countBy(candidates, (candidate) => candidate.reviewPriorityBand),
    omittedPriorityBandCounts: countBy(omittedCandidates, (candidate) =>
      reviewPriorityBand(reviewPriority(candidate)),
    ),
    surfacedCategoryCounts: countBy(candidates, (candidate) => candidate.category),
    routePriorityBandCounts: countBy(routeGroups, (group) => group.topReviewPriorityBand),
    multiDetectorRouteCount: routeGroups.filter((group) => group.hasMultiDetectorSignal).length,
    criticalRouteGroupCount: routeGroups.filter(
      (group) => group.topReviewPriorityBand === "critical",
    ).length,
    capExhaustedPriorityBands: Object.keys(
      countBy(omittedCandidates, (candidate) => reviewPriorityBand(reviewPriority(candidate))),
    ),
  };
  const unlinkedCandidateCount = sortedCandidates.filter(
    (candidate) => candidate.evidenceRefs.length === 0,
  ).length;
  const omittedCandidateCount = Math.max(0, sortedCandidates.length - candidates.length);
  const reviewHealth = buildReviewQueueHealth({
    candidateCount: candidates.length,
    criticalOmittedCount: countFor(reviewSummary.omittedPriorityBandCounts, "critical"),
    omittedCandidateCount,
    unlinkedCandidateCount,
    routeGroupCount: routeGroups.length,
  });
  const agentReview = buildAgentReviewSection({
    isoMonth: args.isoMonth,
    health: reviewHealth,
    summary: reviewSummary,
    routeGroups,
    candidates,
  });

  return {
    artifactKind: "finding_review_queue",
    schemaVersion: 1,
    month: args.isoMonth,
    generatedAt: args.generatedAt,
    queueLimit: args.limit,
    totalCandidateCount: sortedCandidates.length,
    candidateCount: candidates.length,
    omittedCandidateCount,
    evidenceLinkedCandidateCount: sortedCandidates.filter(
      (candidate) => candidate.evidenceRefs.length > 0,
    ).length,
    unlinkedCandidateCount,
    totalDetectorCounts: countBy(sortedCandidates, (candidate) => candidate.detectorId),
    detectorCounts: countBy(candidates, (candidate) => candidate.detectorId),
    routeGroupCount: routeGroups.length,
    summary: reviewSummary,
    health: reviewHealth,
    agentReview,
    routeGroups,
    candidates,
  };
}

async function writeFindingReviewQueueArtifact(args: {
  artifactRoot: string;
  isoMonth: string;
  generatedAt: string;
  outputs: readonly DetectorOutput[];
  limit: number;
}): Promise<string> {
  const path = join(args.artifactRoot, "findings", args.isoMonth, "review-queue.json");
  await mkdir(dirname(path), { recursive: true });
  await writeJson(
    path,
    buildFindingReviewQueueArtifact({
      isoMonth: args.isoMonth,
      generatedAt: args.generatedAt,
      outputs: args.outputs,
      limit: args.limit,
    }),
  );
  return path;
}

type ReviewEvidenceGroups = {
  primary: LocalFindingEvidenceLink[];
  context: LocalFindingEvidenceLink[];
  counterEvidence: LocalFindingEvidenceLink[];
  caveats: LocalFindingEvidenceLink[];
  missingData: LocalFindingEvidenceLink[];
  coverageAudit: LocalFindingEvidenceLink[];
};

function emptyReviewEvidenceGroups(): ReviewEvidenceGroups {
  return {
    primary: [],
    context: [],
    counterEvidence: [],
    caveats: [],
    missingData: [],
    coverageAudit: [],
  };
}

function groupEvidenceLinks(links: readonly LocalFindingEvidenceLink[]): ReviewEvidenceGroups {
  const groups = emptyReviewEvidenceGroups();
  for (const link of links) {
    if (link.evidenceRole === "primary") {
      groups.primary.push(link);
    } else if (link.evidenceRole === "context") {
      groups.context.push(link);
    } else if (link.evidenceRole === "counter_evidence") {
      groups.counterEvidence.push(link);
    } else if (link.evidenceRole === "caveat") {
      groups.caveats.push(link);
    } else if (link.evidenceRole === "missing_data") {
      groups.missingData.push(link);
    } else if (link.evidenceRole === "coverage_audit") {
      groups.coverageAudit.push(link);
    }
  }
  return groups;
}

function parseEvidenceGroups(groups: ReviewEvidenceGroups) {
  return {
    primary: groups.primary.map((link) => parseEvidenceObject(link.evidenceRef)),
    context: groups.context.map((link) => parseEvidenceObject(link.evidenceRef)),
    counterEvidence: groups.counterEvidence.map((link) => parseEvidenceObject(link.evidenceRef)),
    caveats: groups.caveats.map((link) => parseEvidenceObject(link.evidenceRef)),
    missingData: groups.missingData.map((link) => parseEvidenceObject(link.evidenceRef)),
    coverageAudit: groups.coverageAudit.map((link) => parseEvidenceObject(link.evidenceRef)),
  };
}

function coverageForCandidate(
  candidate: LocalFindingCandidate,
  output: DetectorOutput,
): LocalFindingCoverageAudit[] {
  return output.coverage.filter(
    (row) =>
      row.detectorId === candidate.detectorId &&
      (row.scopeId === candidate.scopeId ||
        (candidate.routeId !== null && row.scopeId === candidate.routeId)),
  );
}

function promotionBlockersFor(args: {
  evidence: ReviewEvidenceGroups;
  coverage: readonly LocalFindingCoverageAudit[];
  detectorId: string;
}): string[] {
  const blockers: string[] = [];
  const spec = detectorSpecFor(args.detectorId);
  if (args.evidence.primary.length === 0 && args.evidence.missingData.length === 0) {
    blockers.push("Missing primary or missing-data evidence for the detector claim.");
  }
  if (spec.counterEvidenceRequired.length > 0 && args.evidence.counterEvidence.length === 0) {
    blockers.push("Missing explicit counter-evidence/caveat rows required by the detector spec.");
  }
  if (args.coverage.length === 0) {
    blockers.push("Missing coverage-audit row for the candidate scope.");
  }
  return blockers;
}

function buildFindingReviewPacketsArtifact(args: {
  isoMonth: string;
  generatedAt: string;
  detectorSpecsArtifactPath: string;
  outputs: readonly DetectorOutput[];
}) {
  const candidates: ReviewQueueCandidate[] = [];
  const evidenceByCandidate = new Map<string, LocalFindingEvidenceLink[]>();
  const outputByDetector = new Map<string, DetectorOutput>();
  for (const output of args.outputs) {
    const detectorId = output.coverage[0]?.detectorId ?? output.candidates[0]?.detectorId;
    if (detectorId !== undefined) {
      outputByDetector.set(detectorId, output);
    }
    for (const candidate of output.candidates) {
      candidates.push({ ...candidate, evidenceRefs: [] });
    }
    for (const link of output.evidence) {
      const links = evidenceByCandidate.get(link.candidateId) ?? [];
      links.push(link);
      evidenceByCandidate.set(link.candidateId, links);
    }
  }

  const sortedCandidates = candidates
    .map((candidate) => {
      const links = evidenceByCandidate.get(candidate.candidateId) ?? [];
      return {
        ...candidate,
        evidenceRefs: links.map((link) => link.evidenceRef),
      };
    })
    .sort((left, right) => {
      const priorityDelta = reviewPriority(right) - reviewPriority(left);
      if (priorityDelta !== 0) return priorityDelta;
      return left.candidateId.localeCompare(right.candidateId);
    });

  const packets = sortedCandidates.map((candidate, index) => {
    const candidateRow: LocalFindingCandidate = {
      candidateId: candidate.candidateId,
      detectorId: candidate.detectorId,
      detectorRunId: candidate.detectorRunId,
      month: candidate.month,
      scopeKind: candidate.scopeKind,
      scopeId: candidate.scopeId,
      routeId: candidate.routeId,
      physicalId: candidate.physicalId,
      category: candidate.category,
      severity: candidate.severity,
      confidence: candidate.confidence,
      detectorScore: candidate.detectorScore,
      reasonCode: candidate.reasonCode,
      claimSafeLabel: candidate.claimSafeLabel,
      claimText: candidate.claimText,
      status: candidate.status,
      reviewState: candidate.reviewState,
      windowStart: candidate.windowStart,
      windowEnd: candidate.windowEnd,
      createdAt: candidate.createdAt,
    };
    const links = evidenceByCandidate.get(candidate.candidateId) ?? [];
    const evidence = groupEvidenceLinks(links);
    const output = outputByDetector.get(candidate.detectorId);
    const coverage = output === undefined ? [] : coverageForCandidate(candidate, output);
    const spec = detectorSpecFor(candidate.detectorId);
    const priority = reviewPriority(candidate);
    const evidenceObjects = parseEvidenceGroups(evidence);
    const promotionBlockers = promotionBlockersFor({
      evidence,
      coverage,
      detectorId: candidate.detectorId,
    });
    return {
      packetId: stableId("review_packet", candidate.candidateId),
      reviewRank: index + 1,
      candidate: candidateRow,
      detectorSpec: spec,
      priority: {
        score: priority,
        band: reviewPriorityBand(priority),
        signals: reviewSignals(candidate),
      },
      evidence,
      evidenceObjects,
      coverage,
      derivedMetricWarnings: derivedMetricWarningsFor(Object.values(evidenceObjects).flat()),
      promotionBlockers,
      reviewChecklist: [...spec.promotionChecklist, ...validationChecksFor(candidate)],
      allowedClaimStrength: spec.allowedClaimStrength,
      packetCompleteness: {
        hasPrimaryEvidence: evidence.primary.length > 0 || evidence.missingData.length > 0,
        hasCounterEvidence: evidence.counterEvidence.length > 0,
        hasCoverageAudit: coverage.length > 0,
        hasDetectorSpec: true,
        hasReviewChecklist: spec.promotionChecklist.length > 0,
      },
    };
  });

  return FindingReviewPacketsArtifactSchema.parse({
    artifactKind: "finding_review_packets",
    schemaVersion: 1,
    month: args.isoMonth,
    generatedAt: args.generatedAt,
    detectorSpecsArtifactPath: args.detectorSpecsArtifactPath,
    packetCount: packets.length,
    summary: {
      packetCount: packets.length,
      candidatesWithoutCounterEvidence: packets.filter(
        (packet) => !packet.packetCompleteness.hasCounterEvidence,
      ).length,
      candidatesWithoutCoverage: packets.filter(
        (packet) => !packet.packetCompleteness.hasCoverageAudit,
      ).length,
      detectorCounts: countBy(packets, (packet) => packet.candidate.detectorId),
    },
    packets,
  });
}

async function writeFindingReviewPacketsArtifact(args: {
  artifactRoot: string;
  isoMonth: string;
  generatedAt: string;
  detectorSpecsArtifactPath: string;
  outputs: readonly DetectorOutput[];
}): Promise<string> {
  const path = join(args.artifactRoot, "findings", args.isoMonth, "review-packets.json");
  await mkdir(dirname(path), { recursive: true });
  await writeJson(
    path,
    buildFindingReviewPacketsArtifact({
      isoMonth: args.isoMonth,
      generatedAt: args.generatedAt,
      detectorSpecsArtifactPath: args.detectorSpecsArtifactPath,
      outputs: args.outputs,
    }),
  );
  return path;
}

function listContextJoinInputs(sqlite: Database): SourceGapContextJoinInput[] {
  return sqlite
    .query<
      {
        source_id: string;
        event_kinds: string;
        joinable_event_count: number;
        joined_event_count: number;
      },
      []
    >(
      `WITH joinable AS (
         SELECT source_id,
                group_concat(DISTINCT event_kind) AS event_kinds,
                count(*) AS joinable_event_count
           FROM local_context_event
          WHERE route_id IS NOT NULL
             OR physical_id IS NOT NULL
          GROUP BY source_id
       ),
       joined AS (
         SELECT source_id,
                count(DISTINCT event_id) AS joined_event_count
           FROM local_context_event_route_touch
          GROUP BY source_id
       )
       SELECT joinable.source_id,
              joinable.event_kinds,
              joinable.joinable_event_count,
              coalesce(joined.joined_event_count, 0) AS joined_event_count
         FROM joinable
         LEFT JOIN joined ON joined.source_id = joinable.source_id
        ORDER BY joinable.source_id`,
    )
    .all()
    .map((row) => ({
      sourceId: row.source_id,
      eventKinds: row.event_kinds.split(",").sort(),
      joinableEventCount: row.joinable_event_count,
      joinedEventCount: row.joined_event_count,
    }));
}

function listBusLaneDateInputs(sqlite: Database): SourceGapBusLaneDateInput[] {
  const sentinels = [...BUS_LANE_DATE_SENTINELS];
  if (sentinels.length === 0) return [];
  return sqlite
    .query<
      {
        route_id: string;
        sentinel_date: string;
        intervention_count: number;
      },
      string[]
    >(
      `SELECT route_id,
              implementation_date AS sentinel_date,
              count(*) AS intervention_count
         FROM local_intervention_event
        WHERE (intervention_type LIKE '%bus_lane%' OR program LIKE '%bus%')
          AND implementation_date IN (${sentinels.map(() => "?").join(", ")})
        GROUP BY route_id, implementation_date
        ORDER BY route_id`,
    )
    .all(...sentinels)
    .map((row) => ({
      routeId: row.route_id,
      sentinelDate: row.sentinel_date,
      interventionCount: row.intervention_count,
    }));
}

function listSourceFreshnessInputs(args: {
  sqlite: Database;
  windowStart: string;
  windowEnd: string;
}): SourceGapFreshnessInput[] {
  const latestBySource = new Map(
    args.sqlite
      .query<{ source_id: string; latest_ingested_at: string }, [string, string]>(
        `SELECT source_id, max(ingested_at) AS latest_ingested_at
           FROM local_context_event
          WHERE occurred_at >= ?
            AND occurred_at < ?
          GROUP BY source_id`,
      )
      .all(args.windowStart, args.windowEnd)
      .map((row) => [row.source_id, row.latest_ingested_at]),
  );

  return SOURCE_FRESHNESS_POLICIES.map((policy) => ({
    sourceId: policy.sourceId,
    latestIngestedAt: latestBySource.get(policy.sourceId) ?? null,
    expectedLagDays: policy.expectedLagDays,
  }));
}

export async function buildFindings(args: FindingsDetectArgs = {}): Promise<FindingsDetectResult> {
  const options = createMonthContext(args);
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const reviewQueueLimit = reviewQueueLimitFor(args.reviewQueueLimit);
  return withLocalPipelineDb(options.dbPath, async (local) => {
    const [
      catalog,
      coverage,
      geometryRouteIds,
      observedSummaries,
      scheduledBaselines,
      busWaitRows,
      interventionComparisons,
      routeMonthTrends,
    ] = await Promise.all([
      listRouteCatalog(local.db),
      listRouteMonthCoverage(local.db, options.isoMonth),
      listRouteIdsWithLionLink(local.db),
      // Observed summaries are scoped by month + run; we only care about the
      // sample-count signal here, so we sum across runs to avoid coupling the
      // detector to a particular GTFS-RT run id.
      listRouteObservedReliabilitySummaries(local.db, options.isoMonth),
      listRouteReliabilityBaselines(local.db, options.isoMonth),
      listBusWaitAssessmentRowsForMonth(local.db, options.isoMonth),
      listRouteInterventionComparisons(local.db, options.isoMonth),
      listRouteMonthTrends(local.db),
    ]);
    const routesWithGeometry = new Set(geometryRouteIds);

    const coverageByRoute = new Map(
      coverage.map((row) => [
        row.routeId,
        {
          hasSpeedData: row.hasSpeedData,
          speedObservationCount: row.speedObservationCount,
        },
      ]),
    );
    const observedHeadwaySamplesByRoute = new Map<string, number>();
    for (const summary of observedSummaries) {
      const prior = observedHeadwaySamplesByRoute.get(summary.routeId) ?? 0;
      observedHeadwaySamplesByRoute.set(summary.routeId, prior + summary.sampleCount);
    }
    const scheduledBaselineSamplesByRoute = new Map(
      scheduledBaselines.map((row) => [row.routeId, row.headwaySampleCount]),
    );
    const contextJoins = listContextJoinInputs(local.sqlite);
    const busLaneDates = listBusLaneDateInputs(local.sqlite);
    const sourceFreshness = listSourceFreshnessInputs({
      sqlite: local.sqlite,
      windowStart: `${options.isoMonth}-01T00:00:00`,
      windowEnd: nextIsoMonthStart(options.year, options.month),
    });

    const generatedAt = new Date().toISOString();
    const detectorRunId = detectorRunIdFor(SOURCE_GAP_DETECTOR_ID, options.isoMonth, generatedAt);
    const sourceGapInputs = buildSourceGapInputs({
      month: options.isoMonth,
      catalogRouteIds: catalog.map((row) => row.routeId),
      coverageByRoute,
      routesWithGeometry,
      observedHeadwaySamplesByRoute,
      scheduledBaselineSamplesByRoute,
    });
    const sourceGap = detectSourceGaps({
      detectorRunId,
      month: options.isoMonth,
      generatedAt,
      routes: sourceGapInputs,
      contextJoins,
      busLaneDates,
      sourceFreshness,
    });
    const hotspotRunId = detectorRunIdFor(
      PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID,
      options.isoMonth,
      generatedAt,
    );
    const hotspotInputs = await buildPersistentSpeedHotspotInputs({
      catalogRouteIds: catalog.map((row) => row.routeId),
      coverageByRoute,
      db: local.db,
      month: options.isoMonth,
    });
    const persistentSpeedHotspots = detectPersistentSpeedHotspots({
      detectorRunId: hotspotRunId,
      month: options.isoMonth,
      generatedAt,
      routes: hotspotInputs,
    });
    const multiMonthSpeedPeer = detectMultiMonthSpeedPeerDeficits({
      detectorRunId: detectorRunIdFor(
        MULTI_MONTH_SPEED_PEER_DETECTOR_ID,
        options.isoMonth,
        generatedAt,
      ),
      month: options.isoMonth,
      generatedAt,
      routes: buildMultiMonthSpeedPeerInputs({
        catalogRouteIds: catalog.map((row) => row.routeId),
        monthWindow: recentIsoMonths({ year: options.year, month: options.month, count: 6 }),
        trends: routeMonthTrends,
      }),
    });
    const observedReliabilityInputs = buildObservedReliabilityInputs({
      catalogRouteIds: catalog.map((row) => row.routeId),
      observedSummaries,
      scheduledBaselineSamplesByRoute,
      busWaitAssessmentByRoute: buildBusWaitAssessmentByRoute(busWaitRows),
    });
    const reliabilityRunId = detectorRunIdFor(
      OBSERVED_RELIABILITY_DETECTOR_ID,
      options.isoMonth,
      generatedAt,
    );
    const observedReliability = detectObservedReliability({
      detectorRunId: reliabilityRunId,
      month: options.isoMonth,
      generatedAt,
      routes: observedReliabilityInputs,
    });
    const signalFeatures = buildRouteMonthSignalFeaturesFromSqlite({
      sqlite: local.sqlite,
      isoMonth: options.isoMonth,
      year: options.year,
      month: options.month,
      generatedAt,
    });
    const signalFeaturesArtifact = buildFindingSignalFeaturesArtifact({
      isoMonth: options.isoMonth,
      generatedAt,
      features: signalFeatures,
    });
    const signalFeaturesArtifactPath = signalFeaturesArtifactPathFor(
      artifactRoot,
      options.isoMonth,
    );
    const permitCorrelatedSlowdown = detectPermitCorrelatedSlowdowns({
      detectorRunId: detectorRunIdFor(
        PERMIT_CORRELATED_SLOWDOWN_DETECTOR_ID,
        options.isoMonth,
        generatedAt,
      ),
      month: options.isoMonth,
      generatedAt,
      features: signalFeatures,
    });
    const serviceRequestContext = detectServiceRequestContext({
      detectorRunId: detectorRunIdFor(
        SERVICE_REQUEST_CONTEXT_DETECTOR_ID,
        options.isoMonth,
        generatedAt,
      ),
      month: options.isoMonth,
      generatedAt,
      features: signalFeatures,
    });
    const interventionGapRunId = detectorRunIdFor(
      INTERVENTION_GAP_DETECTOR_ID,
      options.isoMonth,
      generatedAt,
    );
    const interventionGap = detectInterventionGaps({
      detectorRunId: interventionGapRunId,
      month: options.isoMonth,
      generatedAt,
      routes: buildInterventionGapInputs({
        catalogRouteIds: catalog.map((row) => row.routeId),
        speedPainByRoute: routeSpeedSignalByRoute(signalFeatures),
        reliabilityPainByRoute: routeReliabilitySignalByRoute(observedReliabilityInputs),
        interventionStatusByRoute: buildInterventionStatusByRoute(interventionComparisons),
      }),
    });
    const interventionUnderperformanceRunId = detectorRunIdFor(
      INTERVENTION_UNDERPERFORMANCE_DETECTOR_ID,
      options.isoMonth,
      generatedAt,
    );
    const speedPainByRoute = routeSpeedSignalByRoute(signalFeatures);
    const reliabilityPainByRoute = routeReliabilitySignalByRoute(observedReliabilityInputs);
    const interventionUnderperformance = detectInterventionUnderperformance({
      detectorRunId: interventionUnderperformanceRunId,
      month: options.isoMonth,
      generatedAt,
      routes: buildInterventionUnderperformanceInputs({
        catalogRouteIds: catalog.map((row) => row.routeId),
        speedPainByRoute,
        reliabilityPainByRoute,
        comparisons: interventionComparisons,
      }),
    });
    const sourceGapWithContext = attachRouteContextEvidence(sourceGap, signalFeatures);
    const persistentSpeedHotspotsWithContext = attachRouteContextEvidence(
      persistentSpeedHotspots,
      signalFeatures,
    );
    const multiMonthSpeedPeerWithContext = attachRouteContextEvidence(
      multiMonthSpeedPeer,
      signalFeatures,
    );
    const observedReliabilityWithContext = attachRouteContextEvidence(
      observedReliability,
      signalFeatures,
    );
    const interventionGapWithContext = attachRouteContextEvidence(interventionGap, signalFeatures);
    const interventionUnderperformanceWithContext = attachRouteContextEvidence(
      interventionUnderperformance,
      signalFeatures,
    );
    const permitCorrelatedSlowdownWithContext = attachRouteContextEvidence(
      permitCorrelatedSlowdown,
      signalFeatures,
    );
    const serviceRequestContextWithContext = serviceRequestContext;
    const detectorOutputs = [
      sourceGapWithContext,
      persistentSpeedHotspotsWithContext,
      multiMonthSpeedPeerWithContext,
      observedReliabilityWithContext,
      interventionGapWithContext,
      interventionUnderperformanceWithContext,
      permitCorrelatedSlowdownWithContext,
      serviceRequestContextWithContext,
    ] as const;

    await replaceFindingsForMonth(local.db, {
      month: options.isoMonth,
      detectorId: SOURCE_GAP_DETECTOR_ID,
      candidates: sourceGapWithContext.candidates,
      evidence: sourceGapWithContext.evidence,
      coverage: sourceGapWithContext.coverage,
    });
    await replaceFindingsForMonth(local.db, {
      month: options.isoMonth,
      detectorId: PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID,
      candidates: persistentSpeedHotspotsWithContext.candidates,
      evidence: persistentSpeedHotspotsWithContext.evidence,
      coverage: persistentSpeedHotspotsWithContext.coverage,
    });
    await replaceFindingsForMonth(local.db, {
      month: options.isoMonth,
      detectorId: MULTI_MONTH_SPEED_PEER_DETECTOR_ID,
      candidates: multiMonthSpeedPeerWithContext.candidates,
      evidence: multiMonthSpeedPeerWithContext.evidence,
      coverage: multiMonthSpeedPeerWithContext.coverage,
    });
    await replaceFindingsForMonth(local.db, {
      month: options.isoMonth,
      detectorId: OBSERVED_RELIABILITY_DETECTOR_ID,
      candidates: observedReliabilityWithContext.candidates,
      evidence: observedReliabilityWithContext.evidence,
      coverage: observedReliabilityWithContext.coverage,
    });
    await replaceFindingsForMonth(local.db, {
      month: options.isoMonth,
      detectorId: INTERVENTION_GAP_DETECTOR_ID,
      candidates: interventionGapWithContext.candidates,
      evidence: interventionGapWithContext.evidence,
      coverage: interventionGapWithContext.coverage,
    });
    await replaceFindingsForMonth(local.db, {
      month: options.isoMonth,
      detectorId: INTERVENTION_UNDERPERFORMANCE_DETECTOR_ID,
      candidates: interventionUnderperformanceWithContext.candidates,
      evidence: interventionUnderperformanceWithContext.evidence,
      coverage: interventionUnderperformanceWithContext.coverage,
    });
    await replaceFindingsForMonth(local.db, {
      month: options.isoMonth,
      detectorId: PERMIT_CORRELATED_SLOWDOWN_DETECTOR_ID,
      candidates: permitCorrelatedSlowdownWithContext.candidates,
      evidence: permitCorrelatedSlowdownWithContext.evidence,
      coverage: permitCorrelatedSlowdownWithContext.coverage,
    });
    await replaceFindingsForMonth(local.db, {
      month: options.isoMonth,
      detectorId: SERVICE_REQUEST_CONTEXT_DETECTOR_ID,
      candidates: serviceRequestContextWithContext.candidates,
      evidence: serviceRequestContextWithContext.evidence,
      coverage: serviceRequestContextWithContext.coverage,
    });
    await mkdir(dirname(signalFeaturesArtifactPath), { recursive: true });
    await writeJson(signalFeaturesArtifactPath, signalFeaturesArtifact);
    const detectorSpecsArtifactPath = await writeDetectorSpecsArtifact({
      artifactRoot,
      generatedAt,
    });
    const auditArtifactPath = await writeDetectorAuditArtifact({
      artifactRoot,
      isoMonth: options.isoMonth,
      generatedAt,
      outputs: detectorOutputs,
    });
    const reviewQueueArtifactPath = await writeFindingReviewQueueArtifact({
      artifactRoot,
      isoMonth: options.isoMonth,
      generatedAt,
      outputs: detectorOutputs,
      limit: reviewQueueLimit,
    });
    const reviewPacketsArtifactPath = await writeFindingReviewPacketsArtifact({
      artifactRoot,
      isoMonth: options.isoMonth,
      generatedAt,
      detectorSpecsArtifactPath,
      outputs: detectorOutputs,
    });

    const hits = sourceGap.coverage.filter((row) => row.outcome === "hit").length;
    const cleanNoHits = sourceGap.coverage.filter((row) => row.outcome === "clean_no_hit").length;
    const hotspotHits = persistentSpeedHotspots.coverage.filter(
      (row) => row.outcome === "hit",
    ).length;
    const hotspotCleanNoHits = persistentSpeedHotspots.coverage.filter(
      (row) => row.outcome === "clean_no_hit",
    ).length;
    const multiMonthSpeedPeerHits = multiMonthSpeedPeer.coverage.filter(
      (row) => row.outcome === "hit",
    ).length;
    const multiMonthSpeedPeerCleanNoHits = multiMonthSpeedPeer.coverage.filter(
      (row) => row.outcome === "clean_no_hit",
    ).length;
    const reliabilityHits = observedReliability.coverage.filter(
      (row) => row.outcome === "hit",
    ).length;
    const reliabilityCleanNoHits = observedReliability.coverage.filter(
      (row) => row.outcome === "clean_no_hit",
    ).length;
    const interventionGapHits = interventionGap.coverage.filter(
      (row) => row.outcome === "hit",
    ).length;
    const interventionGapCleanNoHits = interventionGap.coverage.filter(
      (row) => row.outcome === "clean_no_hit",
    ).length;
    const interventionUnderperformanceHits = interventionUnderperformance.coverage.filter(
      (row) => row.outcome === "hit",
    ).length;
    const interventionUnderperformanceCleanNoHits = interventionUnderperformance.coverage.filter(
      (row) => row.outcome === "clean_no_hit",
    ).length;
    const permitCorrelatedSlowdownHits = permitCorrelatedSlowdown.coverage.filter(
      (row) => row.outcome === "hit",
    ).length;
    const permitCorrelatedSlowdownCleanNoHits = permitCorrelatedSlowdown.coverage.filter(
      (row) => row.outcome === "clean_no_hit",
    ).length;
    const serviceRequestContextHits = serviceRequestContext.coverage.filter(
      (row) => row.outcome === "hit",
    ).length;
    const serviceRequestContextCleanNoHits = serviceRequestContext.coverage.filter(
      (row) => row.outcome === "clean_no_hit",
    ).length;

    return {
      isoMonth: options.isoMonth,
      detectorRunId,
      detectorCounts: [
        {
          detectorId: SOURCE_GAP_DETECTOR_ID,
          candidateCount: sourceGap.candidates.length,
          coverageCount: sourceGap.coverage.length,
          hits,
          cleanNoHits,
        },
        {
          detectorId: PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID,
          candidateCount: persistentSpeedHotspots.candidates.length,
          coverageCount: persistentSpeedHotspots.coverage.length,
          hits: hotspotHits,
          cleanNoHits: hotspotCleanNoHits,
        },
        {
          detectorId: MULTI_MONTH_SPEED_PEER_DETECTOR_ID,
          candidateCount: multiMonthSpeedPeer.candidates.length,
          coverageCount: multiMonthSpeedPeer.coverage.length,
          hits: multiMonthSpeedPeerHits,
          cleanNoHits: multiMonthSpeedPeerCleanNoHits,
        },
        {
          detectorId: OBSERVED_RELIABILITY_DETECTOR_ID,
          candidateCount: observedReliability.candidates.length,
          coverageCount: observedReliability.coverage.length,
          hits: reliabilityHits,
          cleanNoHits: reliabilityCleanNoHits,
        },
        {
          detectorId: INTERVENTION_GAP_DETECTOR_ID,
          candidateCount: interventionGap.candidates.length,
          coverageCount: interventionGap.coverage.length,
          hits: interventionGapHits,
          cleanNoHits: interventionGapCleanNoHits,
        },
        {
          detectorId: INTERVENTION_UNDERPERFORMANCE_DETECTOR_ID,
          candidateCount: interventionUnderperformance.candidates.length,
          coverageCount: interventionUnderperformance.coverage.length,
          hits: interventionUnderperformanceHits,
          cleanNoHits: interventionUnderperformanceCleanNoHits,
        },
        {
          detectorId: PERMIT_CORRELATED_SLOWDOWN_DETECTOR_ID,
          candidateCount: permitCorrelatedSlowdown.candidates.length,
          coverageCount: permitCorrelatedSlowdown.coverage.length,
          hits: permitCorrelatedSlowdownHits,
          cleanNoHits: permitCorrelatedSlowdownCleanNoHits,
        },
        {
          detectorId: SERVICE_REQUEST_CONTEXT_DETECTOR_ID,
          candidateCount: serviceRequestContext.candidates.length,
          coverageCount: serviceRequestContext.coverage.length,
          hits: serviceRequestContextHits,
          cleanNoHits: serviceRequestContextCleanNoHits,
        },
      ],
      dbPath: local.path,
      auditArtifactPath,
      detectorSpecsArtifactPath,
      reviewQueueArtifactPath,
      reviewPacketsArtifactPath,
      signalFeaturesArtifactPath,
    };
  });
}

export async function buildFindingsFromCli(args: string[]): Promise<FindingsDetectResult> {
  return buildFindings(parseCliArgs(args));
}
