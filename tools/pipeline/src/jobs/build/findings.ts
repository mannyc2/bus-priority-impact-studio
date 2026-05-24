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
  type MultiMonthSpeedPeerGroupMethod,
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
  FindingPromotionQueueArtifactSchema,
  type FindingReviewPacketsArtifact,
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
  promotionQueueArtifactPath: string;
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

type RoutePeerProfile = {
  routeId: string;
  routeFamily: string;
  primaryRouteType: string;
  centroidLat: number | null;
  centroidLng: number | null;
};

type PeerGroupSelection = {
  peerGroupId: string;
  peerGroupLabel: string;
  peerGroupMethod: MultiMonthSpeedPeerGroupMethod;
  peerRouteIds: string[];
};

function routeFamilyFor(routeId: string): string {
  return routeId.match(/^[A-Z]+/)?.[0] ?? "UNKNOWN";
}

function primaryRouteTypeFor(routeTypes: readonly string[] | undefined): string {
  const nonSchool = routeTypes?.find((routeType) => routeType !== "School");
  return nonSchool ?? routeTypes?.[0] ?? "unknown";
}

function centroidFor(row: {
  latitudeMin: number | null;
  latitudeMax: number | null;
  longitudeMin: number | null;
  longitudeMax: number | null;
}): { lat: number | null; lng: number | null } {
  if (
    row.latitudeMin === null ||
    row.latitudeMax === null ||
    row.longitudeMin === null ||
    row.longitudeMax === null
  ) {
    return { lat: null, lng: null };
  }
  return {
    lat: (row.latitudeMin + row.latitudeMax) / 2,
    lng: (row.longitudeMin + row.longitudeMax) / 2,
  };
}

function routePeerProfiles(args: {
  catalog: Awaited<ReturnType<typeof listRouteCatalog>>;
  trends: Awaited<ReturnType<typeof listRouteMonthTrends>>;
}): Map<string, RoutePeerProfile> {
  const profiles = new Map<string, RoutePeerProfile>();
  for (const row of args.catalog) {
    const centroid = centroidFor(row);
    profiles.set(row.routeId, {
      routeId: row.routeId,
      routeFamily: routeFamilyFor(row.routeId),
      primaryRouteType: primaryRouteTypeFor(row.routeTypes),
      centroidLat: centroid.lat,
      centroidLng: centroid.lng,
    });
  }
  for (const trend of args.trends) {
    if (profiles.has(trend.routeId)) continue;
    profiles.set(trend.routeId, {
      routeId: trend.routeId,
      routeFamily: routeFamilyFor(trend.routeId),
      primaryRouteType: "unknown",
      centroidLat: null,
      centroidLng: null,
    });
  }
  return profiles;
}

function approximateMilesBetween(left: RoutePeerProfile, right: RoutePeerProfile): number | null {
  if (
    left.centroidLat === null ||
    left.centroidLng === null ||
    right.centroidLat === null ||
    right.centroidLng === null
  ) {
    return null;
  }
  const latMiles = (left.centroidLat - right.centroidLat) * 69;
  const lngMiles =
    (left.centroidLng - right.centroidLng) * 69 * Math.cos((left.centroidLat * Math.PI) / 180);
  return Math.sqrt(latMiles ** 2 + lngMiles ** 2);
}

function peerGroupLabelFor(
  method: MultiMonthSpeedPeerGroupMethod,
  profile: RoutePeerProfile,
): string {
  if (method === "route_family_type_spatial") {
    return `${profile.routeFamily} ${profile.primaryRouteType} routes near route geography`;
  }
  if (method === "route_family_type") {
    return `${profile.routeFamily} ${profile.primaryRouteType} routes`;
  }
  if (method === "route_family") return `${profile.routeFamily} routes`;
  if (method === "route_type") return `${profile.primaryRouteType} routes`;
  return "all supported routes";
}

function peerGroupIdFor(method: MultiMonthSpeedPeerGroupMethod, profile: RoutePeerProfile): string {
  if (method === "route_family_type_spatial") {
    return `${method}:${profile.routeFamily}:${profile.primaryRouteType}:nearby`;
  }
  if (method === "route_family_type") {
    return `${method}:${profile.routeFamily}:${profile.primaryRouteType}`;
  }
  if (method === "route_family") return `${method}:${profile.routeFamily}`;
  if (method === "route_type") return `${method}:${profile.primaryRouteType}`;
  return method;
}

function matchedPeerGroup(args: {
  profile: RoutePeerProfile;
  candidates: readonly RoutePeerProfile[];
  minPeerRouteCount: number;
}): PeerGroupSelection {
  const byFamilyType = args.candidates.filter(
    (candidate) =>
      candidate.routeFamily === args.profile.routeFamily &&
      candidate.primaryRouteType === args.profile.primaryRouteType,
  );
  const byFamilyTypeSpatial = byFamilyType.filter((candidate) => {
    const miles = approximateMilesBetween(args.profile, candidate);
    return miles !== null && miles <= 6;
  });
  const byFamily = args.candidates.filter(
    (candidate) => candidate.routeFamily === args.profile.routeFamily,
  );
  const byType = args.candidates.filter(
    (candidate) => candidate.primaryRouteType === args.profile.primaryRouteType,
  );
  const groups: Array<{ method: MultiMonthSpeedPeerGroupMethod; profiles: RoutePeerProfile[] }> = [
    { method: "route_family_type_spatial", profiles: byFamilyTypeSpatial },
    { method: "route_family_type", profiles: byFamilyType },
    { method: "route_family", profiles: byFamily },
    { method: "route_type", profiles: byType },
    { method: "system", profiles: [...args.candidates] },
  ];
  const selected =
    groups.find((group) => group.profiles.length >= args.minPeerRouteCount) ?? groups.at(-1);
  const method = selected?.method ?? "system";
  const peerRouteIds = (selected?.profiles ?? [])
    .map((profile) => profile.routeId)
    .sort((left, right) => left.localeCompare(right));
  return {
    peerGroupId: peerGroupIdFor(method, args.profile),
    peerGroupLabel: peerGroupLabelFor(method, args.profile),
    peerGroupMethod: method,
    peerRouteIds,
  };
}

function buildMultiMonthSpeedPeerInputs(args: {
  catalog: Awaited<ReturnType<typeof listRouteCatalog>>;
  monthWindow: readonly string[];
  trends: Awaited<ReturnType<typeof listRouteMonthTrends>>;
}): MultiMonthSpeedPeerRouteInput[] {
  const months = new Set(args.monthWindow);
  const profiles = routePeerProfiles({ catalog: args.catalog, trends: args.trends });
  const trendByRouteMonth = new Map(
    args.trends
      .filter((trend) => months.has(trend.month))
      .map((trend) => [`${trend.routeId}:${trend.month}`, trend] as const),
  );
  const supportedProfilesByMonth = new Map<string, RoutePeerProfile[]>();
  for (const month of args.monthWindow) {
    const supportedProfiles = args.trends
      .filter(
        (trend) =>
          trend.month === month &&
          trend.hasSpeedTrend &&
          trend.averageSpeedMph !== null &&
          trend.speedObservationCount >=
            DEFAULT_MULTI_MONTH_SPEED_PEER_THRESHOLDS.minSpeedObservationCount,
      )
      .map((trend) => profiles.get(trend.routeId))
      .filter((profile): profile is RoutePeerProfile => profile !== undefined);
    supportedProfilesByMonth.set(month, supportedProfiles);
  }

  return args.catalog.map((catalogRow) => ({
    routeId: catalogRow.routeId,
    observations: args.monthWindow.map((month) => {
      const trend = trendByRouteMonth.get(`${catalogRow.routeId}:${month}`);
      const profile =
        profiles.get(catalogRow.routeId) ??
        ({
          routeId: catalogRow.routeId,
          routeFamily: routeFamilyFor(catalogRow.routeId),
          primaryRouteType: primaryRouteTypeFor(catalogRow.routeTypes),
          centroidLat: null,
          centroidLng: null,
        } satisfies RoutePeerProfile);
      const peerGroup = matchedPeerGroup({
        profile,
        candidates: (supportedProfilesByMonth.get(month) ?? []).filter(
          (candidate) => candidate.routeId !== catalogRow.routeId,
        ),
        minPeerRouteCount: DEFAULT_MULTI_MONTH_SPEED_PEER_THRESHOLDS.minPeerRouteCount,
      });
      const peerSpeeds = peerGroup.peerRouteIds
        .map((routeId) => trendByRouteMonth.get(`${routeId}:${month}`)?.averageSpeedMph ?? null)
        .filter((value): value is number => value !== null);
      return {
        month,
        hasSpeedTrend: trend?.hasSpeedTrend ?? false,
        averageSpeedMph: trend?.averageSpeedMph ?? null,
        speedObservationCount: trend?.speedObservationCount ?? 0,
        peerMedianSpeedMph: median(peerSpeeds),
        peerRouteCount: peerGroup.peerRouteIds.length,
        peerGroupId: peerGroup.peerGroupId,
        peerGroupLabel: peerGroup.peerGroupLabel,
        peerGroupMethod: peerGroup.peerGroupMethod,
        peerRouteIds: peerGroup.peerRouteIds,
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

type WeatherNormalizationContext = {
  artifactKind: "route_month_weather_normalization_context";
  month: string;
  releaseLayer: "baseline_release";
  observationDayCount: number;
  stationCount: number;
  precipitationMm: number;
  rainDayCount: number;
  snowDayCount: number;
  highWindDayCount: number;
  maxDailyPrecipitationMm: number | null;
  averageTemperatureC: number | null;
  averageWindMs: number | null;
  normalizationStatus: "weather_context_only";
  caveats: string[];
  sourceRefs: string[];
};

type RouteWeatherReliabilityContext = {
  artifactKind: "route_weather_reliability_context";
  month: string;
  runId: string;
  releaseLayer: "baseline_release";
  routeId: string;
  normalizationStatus: "route_day_weather_split";
  sampleSupport:
    | "sufficient_split"
    | "thin_weather_samples"
    | "thin_reference_samples"
    | "insufficient_split";
  interpretation:
    | "reference_days_still_poor"
    | "weather_conditions_worse"
    | "reference_conditions_worse"
    | "similar_weather_and_reference"
    | "insufficient_split";
  minBucketSampleThreshold: number;
  weatherImpactedDayCount: number;
  referenceDayCount: number;
  weatherImpactedSampleCount: number;
  referenceSampleCount: number;
  weatherImpactedExpectedWaitMinutes: number | null;
  referenceExpectedWaitMinutes: number | null;
  expectedWaitDeltaMinutes: number | null;
  weatherImpactedLongGapShare: number | null;
  referenceLongGapShare: number | null;
  longGapShareDelta: number | null;
  controlledWindowCount: number;
  controlledWindowSampleSupport:
    | "sufficient_split"
    | "thin_weather_samples"
    | "thin_reference_samples"
    | "insufficient_split";
  controlledWindowInterpretation:
    | "reference_days_still_poor"
    | "weather_conditions_worse"
    | "reference_conditions_worse"
    | "similar_weather_and_reference"
    | "insufficient_split";
  controlledWeatherImpactedSampleCount: number;
  controlledReferenceSampleCount: number;
  controlledWeatherImpactedExpectedWaitMinutes: number | null;
  controlledReferenceExpectedWaitMinutes: number | null;
  controlledExpectedWaitDeltaMinutes: number | null;
  controlledWeatherImpactedLongGapShare: number | null;
  controlledReferenceLongGapShare: number | null;
  controlledLongGapShareDelta: number | null;
  plannedServiceControlStatus: "available" | "partial" | "missing";
  plannedServiceBestMatchMethod: "exact_stop_hour" | "route_hour_fallback" | "mixed" | "none";
  controlledScheduledWindowCount: number;
  controlledScheduledExactWindowCount: number;
  controlledScheduledFallbackWindowCount: number;
  controlledScheduledMatchedSampleCount: number;
  controlledScheduledSampleCoverageShare: number | null;
  controlledScheduledAverageHeadwayMinutes: number | null;
  controlledScheduledExpectedWaitMinutes: number | null;
  controlledObservedExpectedWaitMinutes: number | null;
  controlledObservedToScheduledExpectedWaitRatio: number | null;
  passengerLoadControlStatus: "available" | "partial" | "missing";
  controlledPassengerLoadMatchedSampleCount: number;
  controlledPassengerLoadSampleCoverageShare: number | null;
  controlledPassengerLoadAverageRidership: number | null;
  controlledPassengerLoadAverageTransfers: number | null;
  incidentControlStatus: "available" | "partial" | "missing";
  controlledIncidentCheckedSampleCount: number;
  controlledIncidentSampleCoverageShare: number | null;
  controlledWeatherImpactedAverageIncidentWeight: number | null;
  controlledReferenceAverageIncidentWeight: number | null;
  controlledIncidentWeightDelta: number | null;
  longGapThresholdMinutes: number;
  weatherImpactDefinition: {
    precipitationMmAtLeast: number;
    windMsAtLeast: number;
    includesSnowOrWeatherFlags: boolean;
  };
  caveats: string[];
  sourceRefs: string[];
};

type EquityPrioritizationContext = {
  artifactKind: "route_equity_prioritization_context";
  month: string;
  releaseLayer: "baseline_release";
  routeId: string;
  acsYear: number;
  assignmentGeography: string;
  assignmentMethod: string;
  tractCount: number;
  noVehicleHouseholdShare: number | null;
  povertyRate: number | null;
  publicTransitCommuterShare: number | null;
  medianHouseholdIncome: number | null;
  equityPriorityScore: number | null;
  equityPriorityBand: "high" | "medium" | "reference" | "unscored";
  caveats: string[];
  sourceRefs: string[];
};

type TrafficVolumeContext = {
  artifactKind: "route_traffic_volume_context";
  releaseMonth: string;
  sourceMonth: string;
  releaseLayer: "release_context";
  temporalRelation: "same_month" | "latest_prior_month";
  lagMonths: number;
  routeId: string;
  observationCount: number;
  physicalIdCount: number;
  dayCount: number;
  weightedVolumeSum: number;
  averageVolumePerObservation: number | null;
  peakVolume: number | null;
  averageMatchWeight: number | null;
  maxRouteFanout: number;
  caveats: string[];
  sourceRefs: string[];
};

type CurrentTrafficSpeedContext = {
  artifactKind: "route_current_traffic_speed_context";
  releaseMonth: string;
  currentSignalDay: string;
  currentSignalMonth: string;
  releaseLayer: "current_signal";
  temporalRelation: "same_month" | "after_release" | "before_release";
  monthOffsetFromRelease: number;
  routeId: string;
  linkSampleCount: number;
  speedSampleCount: number;
  averageTrafficSpeedMph: number | null;
  minTrafficSpeedMph: number | null;
  slowLinkSampleCount: number;
  statusCodes: string[];
  averageMatchWeight: number | null;
  maxRouteFanout: number;
  caveats: string[];
  sourceRefs: string[];
};

export type SupplementalRouteEvidenceContext = {
  weather: WeatherNormalizationContext | null;
  weatherReliabilityByRoute: Map<string, RouteWeatherReliabilityContext>;
  equityByRoute: Map<string, EquityPrioritizationContext>;
  trafficVolumeByRoute: Map<string, TrafficVolumeContext>;
  currentTrafficSpeedByRoute: Map<string, CurrentTrafficSpeedContext>;
};

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function roundNullable(value: number | null | undefined, digits = 4): number | null {
  return value === null || value === undefined ? null : round(value, digits);
}

const weatherImpactedPrecipitationMmThreshold = 1;
const weatherImpactedWindMsThreshold = 8;
const weatherReliabilityMinBucketSamples = 100;
const nycWeatherWindowFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "long",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

function monthStartDate(month: string): string {
  return `${month}-01`;
}

function monthUnixBounds(month: string): { startSeconds: number; endSeconds: number } {
  const [yearPart, monthPart] = month.split("-");
  const year = Number(yearPart);
  const monthNumber = Number(monthPart);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber)) {
    throw new Error(`Invalid ISO month: ${month}`);
  }

  return {
    startSeconds: Date.UTC(year, monthNumber - 1, 1, 0, 0, 0) / 1000,
    endSeconds: Date.UTC(year, monthNumber, 1, 0, 0, 0) / 1000,
  };
}

function localWeatherWindowParts(timestampSeconds: number): {
  observedDate: string;
  dayOfWeek: string;
  hourOfDay: number;
} {
  const parts = nycWeatherWindowFormatter.formatToParts(new Date(timestampSeconds * 1000));
  const part = (type: string): string => parts.find((item) => item.type === type)?.value ?? "";
  return {
    observedDate: `${part("year")}-${part("month")}-${part("day")}`,
    dayOfWeek: part("weekday") || "Unknown",
    hourOfDay: Number(part("hour") || "0"),
  };
}

function evidenceTemporalRelation(
  sourceMonth: string,
  releaseMonth: string,
): "same_month" | "latest_prior_month" {
  return sourceMonth === releaseMonth ? "same_month" : "latest_prior_month";
}

function isoMonthIndex(month: string): number {
  const [yearPart, monthPart] = month.split("-");
  const year = Number(yearPart);
  const monthNumber = Number(monthPart);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber)) {
    throw new Error(`Invalid ISO month: ${month}`);
  }
  return year * 12 + monthNumber - 1;
}

function lagMonths(sourceMonth: string, releaseMonth: string): number {
  return Math.max(0, isoMonthIndex(releaseMonth) - isoMonthIndex(sourceMonth));
}

function monthOffsetFromRelease(sourceMonth: string, releaseMonth: string): number {
  return isoMonthIndex(sourceMonth) - isoMonthIndex(releaseMonth);
}

function currentSignalTemporalRelation(
  sourceMonth: string,
  releaseMonth: string,
): "same_month" | "after_release" | "before_release" {
  if (sourceMonth === releaseMonth) return "same_month";
  return sourceMonth > releaseMonth ? "after_release" : "before_release";
}

function listWeatherNormalizationContext(args: {
  sqlite: Database;
  month: string;
  monthEndDate: string;
}): WeatherNormalizationContext | null {
  const row = args.sqlite
    .query<
      {
        observation_day_count: number;
        station_count: number | null;
        precipitation_mm: number | null;
        rain_day_count: number | null;
        snow_day_count: number | null;
        high_wind_day_count: number | null;
        max_daily_precipitation_mm: number | null;
        average_temperature_c: number | null;
        average_wind_ms: number | null;
      },
      [string, string]
    >(
      `WITH daily AS (
         SELECT date,
                count(DISTINCT station_id) AS station_count,
                avg(coalesce(prcp_mm, 0)) AS daily_precipitation_mm,
                max(coalesce(prcp_mm, 0)) AS max_daily_precipitation_mm,
                avg(tavg_c) AS average_temperature_c,
                avg(awnd_ms) AS average_wind_ms,
                max(CASE
                  WHEN coalesce(has_rain, 0) = 1
                    OR coalesce(prcp_mm, 0) >= ${weatherImpactedPrecipitationMmThreshold}
                  THEN 1 ELSE 0 END) AS has_rain,
                max(CASE
                  WHEN coalesce(has_snow, 0) = 1
                    OR coalesce(snow_mm, 0) > 0
                  THEN 1 ELSE 0 END) AS has_snow,
                max(CASE
                  WHEN coalesce(has_high_wind, 0) = 1
                    OR coalesce(awnd_ms, 0) >= ${weatherImpactedWindMsThreshold}
                  THEN 1 ELSE 0 END) AS has_high_wind
           FROM local_weather_observation
          WHERE date >= ?
            AND date < ?
          GROUP BY date
       )
       SELECT count(*) AS observation_day_count,
              max(station_count) AS station_count,
              coalesce(sum(daily_precipitation_mm), 0) AS precipitation_mm,
              coalesce(sum(has_rain), 0) AS rain_day_count,
              coalesce(sum(has_snow), 0) AS snow_day_count,
              coalesce(sum(has_high_wind), 0) AS high_wind_day_count,
              max(max_daily_precipitation_mm) AS max_daily_precipitation_mm,
              avg(average_temperature_c) AS average_temperature_c,
              avg(average_wind_ms) AS average_wind_ms
         FROM daily`,
    )
    .get(monthStartDate(args.month), args.monthEndDate);

  if (row === null || row.observation_day_count === 0) {
    return null;
  }

  return {
    artifactKind: "route_month_weather_normalization_context",
    month: args.month,
    releaseLayer: "baseline_release",
    observationDayCount: row.observation_day_count,
    stationCount: row.station_count ?? 0,
    precipitationMm: round(row.precipitation_mm ?? 0, 2),
    rainDayCount: row.rain_day_count ?? 0,
    snowDayCount: row.snow_day_count ?? 0,
    highWindDayCount: row.high_wind_day_count ?? 0,
    maxDailyPrecipitationMm: roundNullable(row.max_daily_precipitation_mm, 2),
    averageTemperatureC: roundNullable(row.average_temperature_c, 2),
    averageWindMs: roundNullable(row.average_wind_ms, 2),
    normalizationStatus: "weather_context_only",
    caveats: [
      "Weather is citywide month context; it is not a route-level causal explanation.",
      "True weather-normalized findings require route-day or route-window performance metrics.",
    ],
    sourceRefs: [`local_weather_observation:${args.month}`],
  };
}

type DailyWeatherSplit = {
  isWeatherImpacted: boolean;
};

type WeatherReliabilityRouteRun = {
  routeId: string;
  runId: string;
  longGapThresholdMinutes: number;
  sampleCount: number;
};

type WeatherReliabilityBucket = {
  sampleCount: number;
  headwaySum: number;
  headwaySquareSum: number;
  longGapCount: number;
  ridershipSampleCount: number;
  ridershipSum: number;
  transferSum: number;
  incidentCheckedSampleCount: number;
  incidentWeightedEventSum: number;
  dates: Set<string>;
};

type WeatherReliabilityWindowAccumulator = {
  dayOfWeek: string;
  hourOfDay: number;
  directionId: string;
  stopId: string;
  weatherImpacted: WeatherReliabilityBucket;
  reference: WeatherReliabilityBucket;
};

type WeatherReliabilityRouteAccumulator = {
  runId: string;
  longGapThresholdMinutes: number;
  weatherImpacted: WeatherReliabilityBucket;
  reference: WeatherReliabilityBucket;
  windows: Map<string, WeatherReliabilityWindowAccumulator>;
};

type ScheduledWindowStats = {
  intervalCount: number;
  headwaySumMinutes: number;
};

type RidershipWindowStats = {
  ridership: number;
  transfers: number;
};

type IncidentWindowStats = {
  eventCount: number;
  weightedEventCount: number;
};

type PlannedServiceControlStats = {
  status: RouteWeatherReliabilityContext["plannedServiceControlStatus"];
  bestMatchMethod: RouteWeatherReliabilityContext["plannedServiceBestMatchMethod"];
  scheduledWindowCount: number;
  scheduledExactWindowCount: number;
  scheduledFallbackWindowCount: number;
  scheduledMatchedSampleCount: number;
  scheduledSampleCoverageShare: number | null;
  scheduledAverageHeadwayMinutes: number | null;
  scheduledExpectedWaitMinutes: number | null;
  observedExpectedWaitMinutes: number | null;
  observedToScheduledExpectedWaitRatio: number | null;
};

type PassengerLoadControlStats = {
  status: RouteWeatherReliabilityContext["passengerLoadControlStatus"];
  matchedSampleCount: number;
  sampleCoverageShare: number | null;
  averageRidership: number | null;
  averageTransfers: number | null;
};

type IncidentControlStats = {
  status: RouteWeatherReliabilityContext["incidentControlStatus"];
  checkedSampleCount: number;
  sampleCoverageShare: number | null;
  weatherImpactedAverageIncidentWeight: number | null;
  referenceAverageIncidentWeight: number | null;
  incidentWeightDelta: number | null;
};

function emptyWeatherReliabilityBucket(): WeatherReliabilityBucket {
  return {
    sampleCount: 0,
    headwaySum: 0,
    headwaySquareSum: 0,
    longGapCount: 0,
    ridershipSampleCount: 0,
    ridershipSum: 0,
    transferSum: 0,
    incidentCheckedSampleCount: 0,
    incidentWeightedEventSum: 0,
    dates: new Set(),
  };
}

function updateWeatherReliabilityBucket(
  bucket: WeatherReliabilityBucket,
  input: {
    observedDate: string;
    headwayMinutes: number;
    longGapThresholdMinutes: number;
    ridership: RidershipWindowStats | undefined;
    incident: IncidentWindowStats | undefined;
    incidentControlsAvailable: boolean;
  },
): void {
  bucket.sampleCount += 1;
  bucket.headwaySum += input.headwayMinutes;
  bucket.headwaySquareSum += input.headwayMinutes ** 2;
  if (input.headwayMinutes >= input.longGapThresholdMinutes) {
    bucket.longGapCount += 1;
  }
  if (input.ridership !== undefined) {
    bucket.ridershipSampleCount += 1;
    bucket.ridershipSum += input.ridership.ridership;
    bucket.transferSum += input.ridership.transfers;
  }
  if (input.incidentControlsAvailable) {
    bucket.incidentCheckedSampleCount += 1;
    bucket.incidentWeightedEventSum += input.incident?.weightedEventCount ?? 0;
  }
  bucket.dates.add(input.observedDate);
}

function mergeWeatherReliabilityBucket(
  target: WeatherReliabilityBucket,
  source: WeatherReliabilityBucket,
): void {
  target.sampleCount += source.sampleCount;
  target.headwaySum += source.headwaySum;
  target.headwaySquareSum += source.headwaySquareSum;
  target.longGapCount += source.longGapCount;
  target.ridershipSampleCount += source.ridershipSampleCount;
  target.ridershipSum += source.ridershipSum;
  target.transferSum += source.transferSum;
  target.incidentCheckedSampleCount += source.incidentCheckedSampleCount;
  target.incidentWeightedEventSum += source.incidentWeightedEventSum;
  for (const date of source.dates) {
    target.dates.add(date);
  }
}

function expectedWaitForBucket(bucket: WeatherReliabilityBucket): number | null {
  if (bucket.sampleCount === 0 || bucket.headwaySum <= 0) {
    return null;
  }
  return round(bucket.headwaySquareSum / (2 * bucket.headwaySum));
}

function controlledWeatherBuckets(accumulator: WeatherReliabilityRouteAccumulator): {
  windowCount: number;
  weatherImpacted: WeatherReliabilityBucket;
  reference: WeatherReliabilityBucket;
} {
  const weatherImpacted = emptyWeatherReliabilityBucket();
  const reference = emptyWeatherReliabilityBucket();
  let windowCount = 0;

  for (const window of accumulator.windows.values()) {
    if (window.weatherImpacted.sampleCount === 0 || window.reference.sampleCount === 0) {
      continue;
    }
    windowCount += 1;
    mergeWeatherReliabilityBucket(weatherImpacted, window.weatherImpacted);
    mergeWeatherReliabilityBucket(reference, window.reference);
  }

  return { windowCount, weatherImpacted, reference };
}

function listScheduledWindowStats(args: {
  sqlite: Database;
  month: string;
  routeIds: readonly string[];
}): Map<string, ScheduledWindowStats> {
  const output = new Map<string, ScheduledWindowStats>();
  const addScheduledWindow = (key: string, headwayMinutes: number) => {
    const stats = output.get(key) ?? { intervalCount: 0, headwaySumMinutes: 0 };
    stats.intervalCount += 1;
    stats.headwaySumMinutes += headwayMinutes;
    output.set(key, stats);
  };
  const query = args.sqlite.query<
    {
      route_id: string;
      day_type: string;
      stop_id: string;
      schedule_time: string;
    },
    [string, string]
  >(
    `SELECT route_id,
            day_type,
            stop_id,
            schedule_time
       FROM local_route_schedule_timepoint
      WHERE month = ?
        AND route_id = ?
      ORDER BY day_type, stop_id, schedule_time`,
  );

  for (const routeId of args.routeIds) {
    let priorGroupKey: string | null = null;
    let priorScheduleTime: string | null = null;
    for (const row of query.iterate(args.month, routeId)) {
      const groupKey = [row.route_id, row.day_type, row.stop_id].join("::");
      if (groupKey !== priorGroupKey) {
        priorGroupKey = groupKey;
        priorScheduleTime = row.schedule_time;
        continue;
      }
      if (priorScheduleTime === null || row.schedule_time === priorScheduleTime) {
        priorScheduleTime = row.schedule_time;
        continue;
      }

      const headwayMinutes =
        (Date.parse(row.schedule_time) - Date.parse(priorScheduleTime)) / 60_000;
      priorScheduleTime = row.schedule_time;
      if (headwayMinutes <= 0 || headwayMinutes > 240) {
        continue;
      }

      const hourOfDay = scheduleHourOfDay(row.schedule_time);
      if (hourOfDay === null) {
        continue;
      }
      const key = scheduledWindowKey({
        routeId: row.route_id,
        dayType: row.day_type,
        hourOfDay,
        stopId: row.stop_id,
      });
      addScheduledWindow(key, headwayMinutes);
      addScheduledWindow(
        scheduledRouteHourWindowKey({
          routeId: row.route_id,
          dayType: row.day_type,
          hourOfDay,
        }),
        headwayMinutes,
      );
    }
  }

  return output;
}

function listRidershipWindowStats(args: {
  sqlite: Database;
  month: string;
  routeIds: readonly string[];
}): Map<string, RidershipWindowStats> {
  const output = new Map<string, RidershipWindowStats>();
  const query = args.sqlite.query<
    {
      route_id: string;
      day_of_week: string;
      hour_of_day: number;
      ridership: number;
      transfers: number;
    },
    [string, string]
  >(
    `SELECT route_id,
            day_of_week,
            hour_of_day,
            ridership,
            transfers
       FROM local_route_hourly_ridership
      WHERE month = ?
        AND route_id = ?`,
  );

  for (const routeId of args.routeIds) {
    for (const row of query.iterate(args.month, routeId)) {
      output.set(
        ridershipWindowKey({
          routeId: row.route_id,
          dayOfWeek: row.day_of_week,
          hourOfDay: row.hour_of_day,
        }),
        {
          ridership: row.ridership,
          transfers: row.transfers,
        },
      );
    }
  }

  return output;
}

function listIncidentWindowStats(args: {
  sqlite: Database;
  month: string;
  monthEndDate: string;
  routeIds: readonly string[];
}): { windows: Map<string, IncidentWindowStats>; hasRows: boolean } {
  const routeIds = new Set(args.routeIds);
  const windows = new Map<string, IncidentWindowStats>();
  let hasRows = false;
  const query = args.sqlite.query<
    {
      route_id: string;
      occurred_at: string;
      match_weight: number;
    },
    [string, string]
  >(
    `SELECT route_id,
            occurred_at,
            match_weight
       FROM local_context_event_route_touch
      WHERE occurred_at >= ?
        AND occurred_at < ?`,
  );

  for (const row of query.iterate(monthStartDate(args.month), args.monthEndDate)) {
    if (!routeIds.has(row.route_id)) {
      continue;
    }
    const parts = eventLocalWindowParts(row.occurred_at);
    if (parts === null) {
      continue;
    }
    hasRows = true;
    const key = incidentWindowKey({
      routeId: row.route_id,
      observedDate: parts.observedDate,
      hourOfDay: parts.hourOfDay,
    });
    const stats = windows.get(key) ?? { eventCount: 0, weightedEventCount: 0 };
    stats.eventCount += 1;
    stats.weightedEventCount += row.match_weight;
    windows.set(key, stats);
  }

  return { windows, hasRows };
}

function plannedServiceControlStats(input: {
  routeId: string;
  accumulator: WeatherReliabilityRouteAccumulator;
  controlled: ReturnType<typeof controlledWeatherBuckets>;
  scheduledWindows: ReadonlyMap<string, ScheduledWindowStats>;
}): PlannedServiceControlStats {
  const totalControlledSamples =
    input.controlled.weatherImpacted.sampleCount + input.controlled.reference.sampleCount;
  let scheduledWindowCount = 0;
  let scheduledExactWindowCount = 0;
  let scheduledFallbackWindowCount = 0;
  let scheduledMatchedSampleCount = 0;
  let scheduledWeightedHeadwaySum = 0;

  for (const window of input.accumulator.windows.values()) {
    if (window.weatherImpacted.sampleCount === 0 || window.reference.sampleCount === 0) {
      continue;
    }
    const dayType = dayTypeForDayOfWeek(window.dayOfWeek);
    const exactKey = scheduledWindowKey({
      routeId: input.routeId,
      dayType,
      hourOfDay: window.hourOfDay,
      stopId: window.stopId,
    });
    const fallbackKey = scheduledRouteHourWindowKey({
      routeId: input.routeId,
      dayType,
      hourOfDay: window.hourOfDay,
    });
    const exactScheduled = input.scheduledWindows.get(exactKey);
    const fallbackScheduled = input.scheduledWindows.get(fallbackKey);
    const scheduled =
      exactScheduled !== undefined && exactScheduled.intervalCount > 0
        ? exactScheduled
        : fallbackScheduled;
    if (scheduled === undefined || scheduled.intervalCount === 0) {
      continue;
    }
    const observedSampleCount = window.weatherImpacted.sampleCount + window.reference.sampleCount;
    scheduledWindowCount += 1;
    if (scheduled === exactScheduled) {
      scheduledExactWindowCount += 1;
    } else {
      scheduledFallbackWindowCount += 1;
    }
    scheduledMatchedSampleCount += observedSampleCount;
    scheduledWeightedHeadwaySum +=
      (scheduled.headwaySumMinutes / scheduled.intervalCount) * observedSampleCount;
  }

  const scheduledSampleCoverageShare =
    totalControlledSamples === 0
      ? null
      : round(scheduledMatchedSampleCount / totalControlledSamples);
  const scheduledAverageHeadwayMinutes =
    scheduledMatchedSampleCount === 0
      ? null
      : round(scheduledWeightedHeadwaySum / scheduledMatchedSampleCount);
  const scheduledExpectedWaitMinutes =
    scheduledAverageHeadwayMinutes === null ? null : round(scheduledAverageHeadwayMinutes / 2);
  const observedBucket = emptyWeatherReliabilityBucket();
  mergeWeatherReliabilityBucket(observedBucket, input.controlled.weatherImpacted);
  mergeWeatherReliabilityBucket(observedBucket, input.controlled.reference);
  const observedExpectedWaitMinutes = expectedWaitForBucket(observedBucket);
  const status =
    scheduledMatchedSampleCount === 0
      ? "missing"
      : (scheduledSampleCoverageShare ?? 0) >= 0.8
        ? "available"
        : "partial";
  const bestMatchMethod =
    scheduledWindowCount === 0
      ? "none"
      : scheduledExactWindowCount > 0 && scheduledFallbackWindowCount > 0
        ? "mixed"
        : scheduledFallbackWindowCount > 0
          ? "route_hour_fallback"
          : "exact_stop_hour";

  return {
    status,
    bestMatchMethod,
    scheduledWindowCount,
    scheduledExactWindowCount,
    scheduledFallbackWindowCount,
    scheduledMatchedSampleCount,
    scheduledSampleCoverageShare,
    scheduledAverageHeadwayMinutes,
    scheduledExpectedWaitMinutes,
    observedExpectedWaitMinutes,
    observedToScheduledExpectedWaitRatio: ratio(
      observedExpectedWaitMinutes,
      scheduledExpectedWaitMinutes,
    ),
  };
}

function passengerLoadControlStats(input: {
  controlled: ReturnType<typeof controlledWeatherBuckets>;
}): PassengerLoadControlStats {
  const totalControlledSamples =
    input.controlled.weatherImpacted.sampleCount + input.controlled.reference.sampleCount;
  const matchedSampleCount =
    input.controlled.weatherImpacted.ridershipSampleCount +
    input.controlled.reference.ridershipSampleCount;
  const ridershipSum =
    input.controlled.weatherImpacted.ridershipSum + input.controlled.reference.ridershipSum;
  const transferSum =
    input.controlled.weatherImpacted.transferSum + input.controlled.reference.transferSum;
  const sampleCoverageShare =
    totalControlledSamples === 0 ? null : round(matchedSampleCount / totalControlledSamples);
  const status =
    matchedSampleCount === 0
      ? "missing"
      : (sampleCoverageShare ?? 0) >= 0.8
        ? "available"
        : "partial";

  return {
    status,
    matchedSampleCount,
    sampleCoverageShare,
    averageRidership: matchedSampleCount === 0 ? null : round(ridershipSum / matchedSampleCount),
    averageTransfers: matchedSampleCount === 0 ? null : round(transferSum / matchedSampleCount),
  };
}

function averageIncidentWeightForBucket(bucket: WeatherReliabilityBucket): number | null {
  return bucket.incidentCheckedSampleCount === 0
    ? null
    : round(bucket.incidentWeightedEventSum / bucket.incidentCheckedSampleCount);
}

function incidentControlStats(input: {
  controlled: ReturnType<typeof controlledWeatherBuckets>;
}): IncidentControlStats {
  const totalControlledSamples =
    input.controlled.weatherImpacted.sampleCount + input.controlled.reference.sampleCount;
  const checkedSampleCount =
    input.controlled.weatherImpacted.incidentCheckedSampleCount +
    input.controlled.reference.incidentCheckedSampleCount;
  const sampleCoverageShare =
    totalControlledSamples === 0 ? null : round(checkedSampleCount / totalControlledSamples);
  const status =
    checkedSampleCount === 0
      ? "missing"
      : (sampleCoverageShare ?? 0) >= 0.8
        ? "available"
        : "partial";
  const weatherImpactedAverageIncidentWeight = averageIncidentWeightForBucket(
    input.controlled.weatherImpacted,
  );
  const referenceAverageIncidentWeight = averageIncidentWeightForBucket(input.controlled.reference);

  return {
    status,
    checkedSampleCount,
    sampleCoverageShare,
    weatherImpactedAverageIncidentWeight,
    referenceAverageIncidentWeight,
    incidentWeightDelta: delta(
      weatherImpactedAverageIncidentWeight,
      referenceAverageIncidentWeight,
    ),
  };
}

function longGapShareForBucket(bucket: WeatherReliabilityBucket): number | null {
  return bucket.sampleCount === 0 ? null : round(bucket.longGapCount / bucket.sampleCount);
}

function delta(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : round(left - right);
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  return numerator === null || denominator === null || denominator === 0
    ? null
    : round(numerator / denominator);
}

function dayTypeForDayOfWeek(dayOfWeek: string): "Saturday" | "Sunday" | "Weekday" {
  if (dayOfWeek === "Saturday") return "Saturday";
  if (dayOfWeek === "Sunday") return "Sunday";
  return "Weekday";
}

function scheduleHourOfDay(scheduleTime: string): number | null {
  const hour = Number(scheduleTime.slice(11, 13));
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

function scheduledWindowKey(input: {
  routeId: string;
  dayType: string;
  hourOfDay: number;
  stopId: string;
}): string {
  return [input.routeId, input.dayType, input.hourOfDay, input.stopId].join("::");
}

function scheduledRouteHourWindowKey(input: {
  routeId: string;
  dayType: string;
  hourOfDay: number;
}): string {
  return [input.routeId, input.dayType, input.hourOfDay, "*"].join("::");
}

function ridershipWindowKey(input: {
  routeId: string;
  dayOfWeek: string;
  hourOfDay: number;
}): string {
  return [input.routeId, input.dayOfWeek, input.hourOfDay].join("::");
}

function incidentWindowKey(input: {
  routeId: string;
  observedDate: string;
  hourOfDay: number;
}): string {
  return [input.routeId, input.observedDate, input.hourOfDay].join("::");
}

function eventLocalWindowParts(occurredAt: string): {
  observedDate: string;
  hourOfDay: number;
} | null {
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(occurredAt);
  const localMatch = /^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{1,2}))?/.exec(occurredAt);
  if (!hasTimezone && localMatch !== null) {
    const observedDate = localMatch[1];
    const hour = Number(localMatch[2] ?? "0");
    if (observedDate !== undefined && Number.isInteger(hour) && hour >= 0 && hour <= 23) {
      return { observedDate, hourOfDay: hour };
    }
  }

  const parsed = Date.parse(occurredAt);
  if (Number.isNaN(parsed)) {
    return null;
  }
  const parts = localWeatherWindowParts(parsed / 1000);
  return { observedDate: parts.observedDate, hourOfDay: parts.hourOfDay };
}

function weatherReliabilitySampleSupport(input: {
  weatherImpactedSampleCount: number;
  referenceSampleCount: number;
  minBucketSampleThreshold: number;
}): RouteWeatherReliabilityContext["sampleSupport"] {
  const hasWeather = input.weatherImpactedSampleCount >= input.minBucketSampleThreshold;
  const hasReference = input.referenceSampleCount >= input.minBucketSampleThreshold;
  if (hasWeather && hasReference) return "sufficient_split";
  if (!hasWeather && hasReference) return "thin_weather_samples";
  if (hasWeather && !hasReference) return "thin_reference_samples";
  return "insufficient_split";
}

function weatherReliabilityInterpretation(input: {
  sampleSupport: RouteWeatherReliabilityContext["sampleSupport"];
  expectedWaitDeltaMinutes: number | null;
  longGapShareDelta: number | null;
  referenceLongGapShare: number | null;
}): RouteWeatherReliabilityContext["interpretation"] {
  if (input.sampleSupport !== "sufficient_split") return "insufficient_split";
  const waitDelta = input.expectedWaitDeltaMinutes ?? 0;
  const longGapDelta = input.longGapShareDelta ?? 0;
  if (waitDelta >= 2 || longGapDelta >= 0.05) return "weather_conditions_worse";
  if (waitDelta <= -2 || longGapDelta <= -0.05) return "reference_conditions_worse";
  if ((input.referenceLongGapShare ?? 0) >= 0.2) return "reference_days_still_poor";
  return "similar_weather_and_reference";
}

function listWeatherSplitByDate(args: {
  sqlite: Database;
  month: string;
  monthEndDate: string;
}): Map<string, DailyWeatherSplit> {
  return new Map(
    args.sqlite
      .query<
        {
          date: string;
          is_weather_impacted: number;
        },
        [string, string]
      >(
        `SELECT date,
                max(CASE
                  WHEN coalesce(prcp_mm, 0) >= ${weatherImpactedPrecipitationMmThreshold}
                    OR coalesce(snow_mm, 0) > 0
                    OR coalesce(has_rain, 0) = 1
                    OR coalesce(has_snow, 0) = 1
                    OR coalesce(has_high_wind, 0) = 1
                    OR coalesce(awnd_ms, 0) >= ${weatherImpactedWindMsThreshold}
                  THEN 1 ELSE 0 END) AS is_weather_impacted
           FROM local_weather_observation
          WHERE date >= ?
            AND date < ?
          GROUP BY date
          ORDER BY date`,
      )
      .all(monthStartDate(args.month), args.monthEndDate)
      .map((row) => [row.date, { isWeatherImpacted: row.is_weather_impacted === 1 }] as const),
  );
}

function listBestObservedReliabilityRunsByRoute(args: {
  sqlite: Database;
  month: string;
}): Map<string, WeatherReliabilityRouteRun> {
  const output = new Map<string, WeatherReliabilityRouteRun>();
  const rows = args.sqlite
    .query<
      {
        route_id: string;
        run_id: string;
        long_gap_threshold_minutes: number | null;
        sample_count: number;
      },
      [string]
    >(
      `SELECT route_id,
              run_id,
              long_gap_threshold_minutes,
              sample_count
         FROM local_route_observed_reliability_summary
        WHERE month = ?
          AND reliability_status = 'observed'
        ORDER BY route_id, sample_count DESC, run_id`,
    )
    .all(args.month);

  for (const row of rows) {
    if (output.has(row.route_id)) continue;
    output.set(row.route_id, {
      routeId: row.route_id,
      runId: row.run_id,
      longGapThresholdMinutes: row.long_gap_threshold_minutes ?? 20,
      sampleCount: row.sample_count,
    });
  }
  return output;
}

function weatherReliabilityContextFromAccumulator(args: {
  month: string;
  routeId: string;
  accumulator: WeatherReliabilityRouteAccumulator;
  scheduledWindows: ReadonlyMap<string, ScheduledWindowStats>;
}): RouteWeatherReliabilityContext {
  const controlled = controlledWeatherBuckets(args.accumulator);
  const plannedService = plannedServiceControlStats({
    routeId: args.routeId,
    accumulator: args.accumulator,
    controlled,
    scheduledWindows: args.scheduledWindows,
  });
  const passengerLoad = passengerLoadControlStats({ controlled });
  const incidentControl = incidentControlStats({ controlled });
  const weatherExpectedWait = expectedWaitForBucket(args.accumulator.weatherImpacted);
  const referenceExpectedWait = expectedWaitForBucket(args.accumulator.reference);
  const weatherLongGapShare = longGapShareForBucket(args.accumulator.weatherImpacted);
  const referenceLongGapShare = longGapShareForBucket(args.accumulator.reference);
  const expectedWaitDeltaMinutes = delta(weatherExpectedWait, referenceExpectedWait);
  const longGapShareDelta = delta(weatherLongGapShare, referenceLongGapShare);
  const controlledWeatherExpectedWait = expectedWaitForBucket(controlled.weatherImpacted);
  const controlledReferenceExpectedWait = expectedWaitForBucket(controlled.reference);
  const controlledWeatherLongGapShare = longGapShareForBucket(controlled.weatherImpacted);
  const controlledReferenceLongGapShare = longGapShareForBucket(controlled.reference);
  const controlledExpectedWaitDeltaMinutes = delta(
    controlledWeatherExpectedWait,
    controlledReferenceExpectedWait,
  );
  const controlledLongGapShareDelta = delta(
    controlledWeatherLongGapShare,
    controlledReferenceLongGapShare,
  );
  const sampleSupport = weatherReliabilitySampleSupport({
    weatherImpactedSampleCount: args.accumulator.weatherImpacted.sampleCount,
    referenceSampleCount: args.accumulator.reference.sampleCount,
    minBucketSampleThreshold: weatherReliabilityMinBucketSamples,
  });
  const controlledWindowSampleSupport = weatherReliabilitySampleSupport({
    weatherImpactedSampleCount: controlled.weatherImpacted.sampleCount,
    referenceSampleCount: controlled.reference.sampleCount,
    minBucketSampleThreshold: weatherReliabilityMinBucketSamples,
  });

  return {
    artifactKind: "route_weather_reliability_context",
    month: args.month,
    runId: args.accumulator.runId,
    releaseLayer: "baseline_release",
    routeId: args.routeId,
    normalizationStatus: "route_day_weather_split",
    sampleSupport,
    interpretation: weatherReliabilityInterpretation({
      sampleSupport,
      expectedWaitDeltaMinutes,
      longGapShareDelta,
      referenceLongGapShare,
    }),
    minBucketSampleThreshold: weatherReliabilityMinBucketSamples,
    weatherImpactedDayCount: args.accumulator.weatherImpacted.dates.size,
    referenceDayCount: args.accumulator.reference.dates.size,
    weatherImpactedSampleCount: args.accumulator.weatherImpacted.sampleCount,
    referenceSampleCount: args.accumulator.reference.sampleCount,
    weatherImpactedExpectedWaitMinutes: weatherExpectedWait,
    referenceExpectedWaitMinutes: referenceExpectedWait,
    expectedWaitDeltaMinutes,
    weatherImpactedLongGapShare: weatherLongGapShare,
    referenceLongGapShare,
    longGapShareDelta,
    controlledWindowCount: controlled.windowCount,
    controlledWindowSampleSupport,
    controlledWindowInterpretation: weatherReliabilityInterpretation({
      sampleSupport: controlledWindowSampleSupport,
      expectedWaitDeltaMinutes: controlledExpectedWaitDeltaMinutes,
      longGapShareDelta: controlledLongGapShareDelta,
      referenceLongGapShare: controlledReferenceLongGapShare,
    }),
    controlledWeatherImpactedSampleCount: controlled.weatherImpacted.sampleCount,
    controlledReferenceSampleCount: controlled.reference.sampleCount,
    controlledWeatherImpactedExpectedWaitMinutes: controlledWeatherExpectedWait,
    controlledReferenceExpectedWaitMinutes: controlledReferenceExpectedWait,
    controlledExpectedWaitDeltaMinutes,
    controlledWeatherImpactedLongGapShare: controlledWeatherLongGapShare,
    controlledReferenceLongGapShare: controlledReferenceLongGapShare,
    controlledLongGapShareDelta,
    plannedServiceControlStatus: plannedService.status,
    plannedServiceBestMatchMethod: plannedService.bestMatchMethod,
    controlledScheduledWindowCount: plannedService.scheduledWindowCount,
    controlledScheduledExactWindowCount: plannedService.scheduledExactWindowCount,
    controlledScheduledFallbackWindowCount: plannedService.scheduledFallbackWindowCount,
    controlledScheduledMatchedSampleCount: plannedService.scheduledMatchedSampleCount,
    controlledScheduledSampleCoverageShare: plannedService.scheduledSampleCoverageShare,
    controlledScheduledAverageHeadwayMinutes: plannedService.scheduledAverageHeadwayMinutes,
    controlledScheduledExpectedWaitMinutes: plannedService.scheduledExpectedWaitMinutes,
    controlledObservedExpectedWaitMinutes: plannedService.observedExpectedWaitMinutes,
    controlledObservedToScheduledExpectedWaitRatio:
      plannedService.observedToScheduledExpectedWaitRatio,
    passengerLoadControlStatus: passengerLoad.status,
    controlledPassengerLoadMatchedSampleCount: passengerLoad.matchedSampleCount,
    controlledPassengerLoadSampleCoverageShare: passengerLoad.sampleCoverageShare,
    controlledPassengerLoadAverageRidership: passengerLoad.averageRidership,
    controlledPassengerLoadAverageTransfers: passengerLoad.averageTransfers,
    incidentControlStatus: incidentControl.status,
    controlledIncidentCheckedSampleCount: incidentControl.checkedSampleCount,
    controlledIncidentSampleCoverageShare: incidentControl.sampleCoverageShare,
    controlledWeatherImpactedAverageIncidentWeight:
      incidentControl.weatherImpactedAverageIncidentWeight,
    controlledReferenceAverageIncidentWeight: incidentControl.referenceAverageIncidentWeight,
    controlledIncidentWeightDelta: incidentControl.incidentWeightDelta,
    longGapThresholdMinutes: args.accumulator.longGapThresholdMinutes,
    weatherImpactDefinition: {
      precipitationMmAtLeast: weatherImpactedPrecipitationMmThreshold,
      windMsAtLeast: weatherImpactedWindMsThreshold,
      includesSnowOrWeatherFlags: true,
    },
    caveats: [
      "This is a route-day weather split over observed headway samples, not a causal weather model.",
      "Controlled-window fields compare only local day-of-week, hour, direction, and stop buckets that have both weather-impacted and reference samples.",
      "Planned-service controls use scheduled timepoints by exact stop/hour when possible, with a route-hour fallback when exact stop alignment is unavailable; they do not prove what service actually ran.",
      "Passenger-load controls use route/day/hour ridership profiles, not stop-level crowding.",
      "Incident controls use route/date/hour event-touch density; they do not prove incident causality or exact stop exposure.",
      "Dates are joined at daily grain; same-day weather can still miss the exact conditions during a specific headway sample.",
    ],
    sourceRefs: [
      `local_observed_headway_sample:${args.accumulator.runId}:${args.routeId}:${args.month}`,
      `local_weather_observation:${args.month}`,
      `local_route_schedule_timepoint:${args.month}`,
      `local_route_hourly_ridership:${args.month}`,
      `local_context_event_route_touch:${args.month}`,
    ],
  };
}

function listWeatherReliabilityContextByRoute(args: {
  sqlite: Database;
  month: string;
  monthEndDate: string;
}): Map<string, RouteWeatherReliabilityContext> {
  const weatherByDate = listWeatherSplitByDate(args);
  if (weatherByDate.size === 0) return new Map();

  const bestRunsByRoute = listBestObservedReliabilityRunsByRoute(args);
  if (bestRunsByRoute.size === 0) return new Map();

  const routeRunByKey = new Map(
    [...bestRunsByRoute.values()].map((run) => [`${run.runId}:${run.routeId}`, run] as const),
  );
  const runIds = [...new Set([...bestRunsByRoute.values()].map((run) => run.runId))].sort();
  const scheduledWindows = listScheduledWindowStats({
    sqlite: args.sqlite,
    month: args.month,
    routeIds: [...bestRunsByRoute.keys()].sort(),
  });
  const ridershipWindows = listRidershipWindowStats({
    sqlite: args.sqlite,
    month: args.month,
    routeIds: [...bestRunsByRoute.keys()].sort(),
  });
  const incidentWindows = listIncidentWindowStats({
    sqlite: args.sqlite,
    month: args.month,
    monthEndDate: args.monthEndDate,
    routeIds: [...bestRunsByRoute.keys()].sort(),
  });
  const routeAccumulators = new Map<string, WeatherReliabilityRouteAccumulator>();
  const bounds = monthUnixBounds(args.month);
  const sampleQuery = args.sqlite.query<
    {
      route_id: string;
      run_id: string;
      observed_timestamp: number;
      direction_id: number | null;
      stop_id: string;
      headway_minutes: number;
    },
    [string, number, number]
  >(
    `SELECT route_id,
            run_id,
            observed_timestamp,
            direction_id,
            stop_id,
            headway_minutes
       FROM local_observed_headway_sample
      WHERE run_id = ?
        AND observed_timestamp >= ?
        AND observed_timestamp < ?
        AND headway_minutes > 0`,
  );

  for (const runId of runIds) {
    for (const row of sampleQuery.iterate(runId, bounds.startSeconds, bounds.endSeconds)) {
      const routeRun = routeRunByKey.get(`${row.run_id}:${row.route_id}`);
      if (routeRun === undefined) continue;
      const parts = localWeatherWindowParts(row.observed_timestamp);
      const weather = weatherByDate.get(parts.observedDate);
      if (weather === undefined) continue;
      const accumulator = routeAccumulators.get(row.route_id) ?? {
        runId: routeRun.runId,
        longGapThresholdMinutes: routeRun.longGapThresholdMinutes,
        weatherImpacted: emptyWeatherReliabilityBucket(),
        reference: emptyWeatherReliabilityBucket(),
        windows: new Map<string, WeatherReliabilityWindowAccumulator>(),
      };
      const windowKey = [
        parts.dayOfWeek,
        parts.hourOfDay,
        row.direction_id ?? "unknown_direction",
        row.stop_id,
      ].join("::");
      const window = accumulator.windows.get(windowKey) ?? {
        dayOfWeek: parts.dayOfWeek,
        hourOfDay: parts.hourOfDay,
        directionId: String(row.direction_id ?? "unknown_direction"),
        stopId: row.stop_id,
        weatherImpacted: emptyWeatherReliabilityBucket(),
        reference: emptyWeatherReliabilityBucket(),
      };
      const targetBucket = weather.isWeatherImpacted
        ? accumulator.weatherImpacted
        : accumulator.reference;
      const targetWindowBucket = weather.isWeatherImpacted
        ? window.weatherImpacted
        : window.reference;
      const ridership = ridershipWindows.get(
        ridershipWindowKey({
          routeId: row.route_id,
          dayOfWeek: parts.dayOfWeek,
          hourOfDay: parts.hourOfDay,
        }),
      );
      const incident = incidentWindows.windows.get(
        incidentWindowKey({
          routeId: row.route_id,
          observedDate: parts.observedDate,
          hourOfDay: parts.hourOfDay,
        }),
      );
      updateWeatherReliabilityBucket(targetBucket, {
        observedDate: parts.observedDate,
        headwayMinutes: row.headway_minutes,
        longGapThresholdMinutes: routeRun.longGapThresholdMinutes,
        ridership,
        incident,
        incidentControlsAvailable: incidentWindows.hasRows,
      });
      updateWeatherReliabilityBucket(targetWindowBucket, {
        observedDate: parts.observedDate,
        headwayMinutes: row.headway_minutes,
        longGapThresholdMinutes: routeRun.longGapThresholdMinutes,
        ridership,
        incident,
        incidentControlsAvailable: incidentWindows.hasRows,
      });
      accumulator.windows.set(windowKey, window);
      routeAccumulators.set(row.route_id, accumulator);
    }
  }

  return new Map(
    [...routeAccumulators.entries()].map(([routeId, accumulator]) => [
      routeId,
      weatherReliabilityContextFromAccumulator({
        month: args.month,
        routeId,
        accumulator,
        scheduledWindows,
      }),
    ]),
  );
}

function percentileRanks<T>(
  rows: readonly T[],
  valueFor: (row: T) => number | null,
  invert = false,
): Map<T, number> {
  const scored = rows
    .map((row) => ({ row, value: valueFor(row) }))
    .filter((row): row is { row: T; value: number } => row.value !== null)
    .sort((left, right) => left.value - right.value);
  const output = new Map<T, number>();
  const denominator = Math.max(1, scored.length - 1);
  scored.forEach((row, index) => {
    const rank = index / denominator;
    output.set(row.row, invert ? 1 - rank : rank);
  });
  return output;
}

function equityPriorityBand(
  score: number | null,
): EquityPrioritizationContext["equityPriorityBand"] {
  if (score === null) return "unscored";
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "reference";
}

function listEquityPrioritizationContextByRoute(args: {
  sqlite: Database;
  month: string;
}): Map<string, EquityPrioritizationContext> {
  const rows = args.sqlite
    .query<
      {
        route_id: string;
        acs_year: number;
        assignment_geography: string;
        assignment_method: string;
        tract_count: number;
        no_vehicle_household_share: number | null;
        poverty_rate: number | null;
        public_transit_commuter_share: number | null;
        median_household_income: number | null;
      },
      [string]
    >(
      `SELECT route_id,
              acs_year,
              assignment_geography,
              assignment_method,
              tract_count,
              no_vehicle_household_share,
              poverty_rate,
              public_transit_commuter_share,
              median_household_income
         FROM local_route_equity_context
        WHERE month = ?
        ORDER BY route_id`,
    )
    .all(args.month);

  const noVehicleRanks = percentileRanks(rows, (row) => row.no_vehicle_household_share);
  const povertyRanks = percentileRanks(rows, (row) => row.poverty_rate);
  const transitRanks = percentileRanks(rows, (row) => row.public_transit_commuter_share);
  const lowIncomeRanks = percentileRanks(rows, (row) => row.median_household_income, true);
  const output = new Map<string, EquityPrioritizationContext>();

  for (const row of rows) {
    const rankInputs = [
      noVehicleRanks.get(row),
      povertyRanks.get(row),
      transitRanks.get(row),
      lowIncomeRanks.get(row),
    ].filter((value): value is number => value !== undefined);
    const score =
      rankInputs.length === 0
        ? null
        : round((rankInputs.reduce((total, value) => total + value, 0) / rankInputs.length) * 100);
    output.set(row.route_id, {
      artifactKind: "route_equity_prioritization_context",
      month: args.month,
      releaseLayer: "baseline_release",
      routeId: row.route_id,
      acsYear: row.acs_year,
      assignmentGeography: row.assignment_geography,
      assignmentMethod: row.assignment_method,
      tractCount: row.tract_count,
      noVehicleHouseholdShare: roundNullable(row.no_vehicle_household_share),
      povertyRate: roundNullable(row.poverty_rate),
      publicTransitCommuterShare: roundNullable(row.public_transit_commuter_share),
      medianHouseholdIncome: roundNullable(row.median_household_income, 2),
      equityPriorityScore: score,
      equityPriorityBand: equityPriorityBand(score),
      caveats: [
        "Equity context is a prioritization lens, not a detector cause.",
        "Route assignment uses the current route-equity context artifact and should be reviewed before weighting public rankings.",
      ],
      sourceRefs: [`local_route_equity_context:${row.route_id}:${args.month}`],
    });
  }

  return output;
}

function latestTrafficVolumeMonth(sqlite: Database, releaseMonth: string): string | null {
  const row = sqlite
    .query<{ source_month: string | null }, [string]>(
      `SELECT max(substr(sampled_at, 1, 7)) AS source_month
         FROM local_dot_traffic_volume_count
        WHERE physical_id IS NOT NULL
          AND substr(sampled_at, 1, 7) <= ?`,
    )
    .get(releaseMonth);
  return row?.source_month ?? null;
}

function listTrafficVolumeContextByRoute(args: {
  sqlite: Database;
  releaseMonth: string;
}): Map<string, TrafficVolumeContext> {
  const sourceMonth = latestTrafficVolumeMonth(args.sqlite, args.releaseMonth);
  if (sourceMonth === null) return new Map();

  const rows = args.sqlite
    .query<
      {
        route_id: string;
        observation_count: number;
        physical_id_count: number;
        day_count: number;
        weighted_volume_sum: number | null;
        average_volume_per_observation: number | null;
        peak_volume: number | null;
        average_match_weight: number | null;
        max_route_fanout: number | null;
      },
      [string]
    >(
      `WITH fanout AS (
         SELECT physical_id, count(DISTINCT route_id) AS route_fanout
           FROM local_route_lion_link
          GROUP BY physical_id
       ),
       route_volume AS (
         SELECT l.route_id,
                v.request_id,
                v.segment_id,
                v.sampled_at,
                v.physical_id,
                v.volume,
                f.route_fanout
           FROM local_dot_traffic_volume_count v
           JOIN local_route_lion_link l ON l.physical_id = v.physical_id
           JOIN fanout f ON f.physical_id = v.physical_id
          WHERE substr(v.sampled_at, 1, 7) = ?
       )
       SELECT route_id,
              count(*) AS observation_count,
              count(DISTINCT physical_id) AS physical_id_count,
              count(DISTINCT substr(sampled_at, 1, 10)) AS day_count,
              sum(volume * (1.0 / route_fanout)) AS weighted_volume_sum,
              avg(volume) AS average_volume_per_observation,
              max(volume) AS peak_volume,
              avg(1.0 / route_fanout) AS average_match_weight,
              max(route_fanout) AS max_route_fanout
         FROM route_volume
        GROUP BY route_id
        ORDER BY route_id`,
    )
    .all(sourceMonth);

  return new Map(
    rows.map((row) => {
      const lag = lagMonths(sourceMonth, args.releaseMonth);
      return [
        row.route_id,
        {
          artifactKind: "route_traffic_volume_context",
          releaseMonth: args.releaseMonth,
          sourceMonth,
          releaseLayer: "release_context",
          temporalRelation: evidenceTemporalRelation(sourceMonth, args.releaseMonth),
          lagMonths: lag,
          routeId: row.route_id,
          observationCount: row.observation_count,
          physicalIdCount: row.physical_id_count,
          dayCount: row.day_count,
          weightedVolumeSum: round(row.weighted_volume_sum ?? 0, 2),
          averageVolumePerObservation: roundNullable(row.average_volume_per_observation, 2),
          peakVolume: roundNullable(row.peak_volume, 2),
          averageMatchWeight: roundNullable(row.average_match_weight),
          maxRouteFanout: row.max_route_fanout ?? 0,
          caveats: [
            "DOT traffic volume is route-adjacent street context, not bus operating speed.",
            `Volume context is ${lag} month${lag === 1 ? "" : "s"} from the release month; do not cite as same-month evidence when lagMonths > 0.`,
          ],
          sourceRefs: [`local_dot_traffic_volume_count:${row.route_id}:${sourceMonth}`],
        },
      ];
    }),
  );
}

function latestTrafficSpeedDay(sqlite: Database): string | null {
  const row = sqlite
    .query<{ source_day: string | null }, []>(
      `SELECT max(substr(sampled_at, 1, 10)) AS source_day
         FROM local_dot_traffic_speed
        WHERE physical_id IS NOT NULL`,
    )
    .get();
  return row?.source_day ?? null;
}

function listCurrentTrafficSpeedContextByRoute(args: {
  sqlite: Database;
  releaseMonth: string;
}): Map<string, CurrentTrafficSpeedContext> {
  const sourceDay = latestTrafficSpeedDay(args.sqlite);
  if (sourceDay === null) return new Map();
  const sourceMonth = sourceDay.slice(0, 7);

  const rows = args.sqlite
    .query<
      {
        route_id: string;
        link_sample_count: number;
        speed_sample_count: number | null;
        average_traffic_speed_mph: number | null;
        min_traffic_speed_mph: number | null;
        slow_link_sample_count: number | null;
        status_codes: string | null;
        average_match_weight: number | null;
        max_route_fanout: number | null;
      },
      [string]
    >(
      `WITH fanout AS (
         SELECT physical_id, count(DISTINCT route_id) AS route_fanout
           FROM local_route_lion_link
          GROUP BY physical_id
       ),
       route_speed AS (
         SELECT l.route_id,
                s.link_id,
                s.speed,
                s.status_code,
                f.route_fanout
           FROM local_dot_traffic_speed s
           JOIN local_route_lion_link l ON l.physical_id = s.physical_id
           JOIN fanout f ON f.physical_id = s.physical_id
          WHERE substr(s.sampled_at, 1, 10) = ?
       )
       SELECT route_id,
              count(*) AS link_sample_count,
              sum(CASE WHEN speed IS NOT NULL THEN 1 ELSE 0 END) AS speed_sample_count,
              avg(speed) AS average_traffic_speed_mph,
              min(speed) AS min_traffic_speed_mph,
              sum(CASE WHEN speed IS NOT NULL AND speed < 10 THEN 1 ELSE 0 END)
                AS slow_link_sample_count,
              group_concat(DISTINCT status_code) AS status_codes,
              avg(1.0 / route_fanout) AS average_match_weight,
              max(route_fanout) AS max_route_fanout
         FROM route_speed
        GROUP BY route_id
        ORDER BY route_id`,
    )
    .all(sourceDay);

  return new Map(
    rows.map((row) => [
      row.route_id,
      {
        artifactKind: "route_current_traffic_speed_context",
        releaseMonth: args.releaseMonth,
        currentSignalDay: sourceDay,
        currentSignalMonth: sourceMonth,
        releaseLayer: "current_signal",
        temporalRelation: currentSignalTemporalRelation(sourceMonth, args.releaseMonth),
        monthOffsetFromRelease: monthOffsetFromRelease(sourceMonth, args.releaseMonth),
        routeId: row.route_id,
        linkSampleCount: row.link_sample_count,
        speedSampleCount: row.speed_sample_count ?? 0,
        averageTrafficSpeedMph: roundNullable(row.average_traffic_speed_mph, 2),
        minTrafficSpeedMph: roundNullable(row.min_traffic_speed_mph, 2),
        slowLinkSampleCount: row.slow_link_sample_count ?? 0,
        statusCodes: row.status_codes?.split(",").sort() ?? [],
        averageMatchWeight: roundNullable(row.average_match_weight),
        maxRouteFanout: row.max_route_fanout ?? 0,
        caveats: [
          "DOT realtime traffic speed is a current-condition appendix, not historical March release evidence.",
          "Traffic link speed is street-link context and may not equal observed bus operating speed.",
        ],
        sourceRefs: [`local_dot_traffic_speed:${row.route_id}:${sourceDay}`],
      },
    ]),
  );
}

export function buildSupplementalRouteEvidenceContext(args: {
  sqlite: Database;
  month: string;
  monthEndDate: string;
}): SupplementalRouteEvidenceContext {
  return {
    weather: listWeatherNormalizationContext({
      sqlite: args.sqlite,
      month: args.month,
      monthEndDate: args.monthEndDate,
    }),
    weatherReliabilityByRoute: listWeatherReliabilityContextByRoute({
      sqlite: args.sqlite,
      month: args.month,
      monthEndDate: args.monthEndDate,
    }),
    equityByRoute: listEquityPrioritizationContextByRoute({
      sqlite: args.sqlite,
      month: args.month,
    }),
    trafficVolumeByRoute: listTrafficVolumeContextByRoute({
      sqlite: args.sqlite,
      releaseMonth: args.month,
    }),
    currentTrafficSpeedByRoute: listCurrentTrafficSpeedContextByRoute({
      sqlite: args.sqlite,
      releaseMonth: args.month,
    }),
  };
}

function supplementalEvidenceLinksForCandidate(
  candidate: LocalFindingCandidate,
  context: SupplementalRouteEvidenceContext,
): LocalFindingEvidenceLink[] {
  if (candidate.routeId === null) return [];

  const links: LocalFindingEvidenceLink[] = [];
  if (context.weather !== null) {
    links.push(
      FindingEvidenceLinkSchema.parse({
        linkId: stableId(candidate.candidateId, "supplemental", "weather", context.weather.month),
        candidateId: candidate.candidateId,
        evidenceKind: "metric",
        evidenceRole: candidate.category === "data_quality" ? "caveat" : "counter_evidence",
        evidenceRef: JSON.stringify(context.weather),
        evidenceWeight: null,
        note: "Weather context is attached so reviewers can check whether weather weakens or scopes the detector claim; it is not a causal route diagnosis.",
      }) as LocalFindingEvidenceLink,
    );
  }

  const weatherReliability = context.weatherReliabilityByRoute.get(candidate.routeId);
  if (
    candidate.detectorId === OBSERVED_RELIABILITY_DETECTOR_ID &&
    weatherReliability !== undefined
  ) {
    const weatherOnlyRisk =
      weatherReliability.interpretation === "weather_conditions_worse" ||
      weatherReliability.controlledWindowInterpretation === "weather_conditions_worse";
    links.push(
      FindingEvidenceLinkSchema.parse({
        linkId: stableId(
          candidate.candidateId,
          "supplemental",
          "weather_reliability",
          candidate.routeId,
          weatherReliability.runId,
        ),
        candidateId: candidate.candidateId,
        evidenceKind: "metric",
        evidenceRole:
          weatherReliability.sampleSupport === "sufficient_split" && !weatherOnlyRisk
            ? "counter_evidence"
            : "caveat",
        evidenceRef: JSON.stringify(weatherReliability),
        evidenceWeight:
          weatherReliability.sampleSupport === "sufficient_split"
            ? Math.min(1, weatherReliability.referenceSampleCount / 1_000)
            : null,
        note:
          weatherReliability.sampleSupport === "sufficient_split"
            ? "Route-day observed headways are split by weather-impacted versus reference days to check whether reliability risk persists outside weather conditions."
            : "Weather reliability split is attached as a caveat because one side of the split has thin sample support.",
      }) as LocalFindingEvidenceLink,
    );
  }

  const equity = context.equityByRoute.get(candidate.routeId);
  if (equity !== undefined) {
    links.push(
      FindingEvidenceLinkSchema.parse({
        linkId: stableId(candidate.candidateId, "supplemental", "equity", candidate.routeId),
        candidateId: candidate.candidateId,
        evidenceKind: "metric",
        evidenceRole: "context",
        evidenceRef: JSON.stringify(equity),
        evidenceWeight:
          equity.equityPriorityScore === null ? null : equity.equityPriorityScore / 100,
        note: "Equity context can inform prioritization/review order, but it is not detector proof of a service issue.",
      }) as LocalFindingEvidenceLink,
    );
  }

  const trafficVolume = context.trafficVolumeByRoute.get(candidate.routeId);
  if (trafficVolume !== undefined) {
    links.push(
      FindingEvidenceLinkSchema.parse({
        linkId: stableId(
          candidate.candidateId,
          "supplemental",
          "traffic_volume",
          candidate.routeId,
          trafficVolume.sourceMonth,
        ),
        candidateId: candidate.candidateId,
        evidenceKind: "context_event",
        evidenceRole: "context",
        evidenceRef: JSON.stringify(trafficVolume),
        evidenceWeight: trafficVolume.averageMatchWeight,
        note: "DOT traffic-volume context is route-adjacent street evidence; use it for review context, not as detector-grade cause.",
      }) as LocalFindingEvidenceLink,
    );
  }

  const currentTrafficSpeed = context.currentTrafficSpeedByRoute.get(candidate.routeId);
  if (currentTrafficSpeed !== undefined) {
    links.push(
      FindingEvidenceLinkSchema.parse({
        linkId: stableId(
          candidate.candidateId,
          "supplemental",
          "current_traffic_speed",
          candidate.routeId,
          currentTrafficSpeed.currentSignalDay,
        ),
        candidateId: candidate.candidateId,
        evidenceKind: "metric",
        evidenceRole: "caveat",
        evidenceRef: JSON.stringify(currentTrafficSpeed),
        evidenceWeight: currentTrafficSpeed.averageMatchWeight,
        note: "Current DOT traffic speed is an appendix for present conditions and must not be cited as historical release-month evidence.",
      }) as LocalFindingEvidenceLink,
    );
  }

  return links;
}

function attachSupplementalRouteEvidence(
  output: DetectorOutput,
  context: SupplementalRouteEvidenceContext,
): DetectorOutput {
  const supplementalEvidence = output.candidates.flatMap((candidate) =>
    supplementalEvidenceLinksForCandidate(candidate, context),
  );
  return {
    candidates: output.candidates,
    coverage: output.coverage,
    evidence: [...output.evidence, ...supplementalEvidence],
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
      validateAs: "Route-scoped multi-month low-speed trend below a matched peer median.",
      defaultThresholds: DEFAULT_MULTI_MONTH_SPEED_PEER_THRESHOLDS,
      keyEvidenceFields: {
        observedMonthCount: "Number of supported route-month trend rows in the lookback window.",
        averageSpeedMph: "Mean route speed across supported months; lower is worse.",
        averagePeerMedianSpeedMph:
          "Mean monthly matched-peer median speed used as the comparative baseline.",
        averagePeerDeficitMph: "Peer median minus route speed across supported months.",
        peerGroupMethod: "Route family/type/geography matching method used for each month.",
        peerRouteCount: "Number of routes contributing to each monthly peer median.",
      },
      commonFollowUps: [
        "Inspect counter-evidence for weak months and fallback-peer limitations.",
        "Validate route-family/type/geography peers before making strong peer claims.",
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
}): Promise<{ path: string; artifact: FindingReviewPacketsArtifact }> {
  const path = join(args.artifactRoot, "findings", args.isoMonth, "review-packets.json");
  const artifact = buildFindingReviewPacketsArtifact({
    isoMonth: args.isoMonth,
    generatedAt: args.generatedAt,
    detectorSpecsArtifactPath: args.detectorSpecsArtifactPath,
    outputs: args.outputs,
  });
  await mkdir(dirname(path), { recursive: true });
  await writeJson(path, artifact);
  return { path, artifact };
}

type ReviewPacket = FindingReviewPacketsArtifact["packets"][number];

const REVIEWER_DECISION_OPTIONS = [
  {
    decision: "approve",
    meaning: "Promote the candidate as written within the detector's allowed claim strength.",
  },
  {
    decision: "approve_with_revisions",
    meaning: "Promote only after revising claim text, scope, or caveats in the reviewer response.",
  },
  {
    decision: "defer",
    meaning: "Keep the candidate open for more evidence or reviewer follow-up.",
  },
  {
    decision: "reject",
    meaning: "Reject the candidate for this release month.",
  },
  {
    decision: "downgrade_to_context",
    meaning: "Keep the evidence as context or data quality, not as a promoted service finding.",
  },
] as const;

const PROMOTION_READINESS_VALUES = ["ready_for_review", "needs_enrichment", "blocked"] as const;

const PROMOTION_NEXT_ACTION_VALUES = [
  "review_for_promotion",
  "revise_claim_before_promotion",
  "keep_as_data_quality",
  "enrich_before_promotion",
  "do_not_promote",
] as const;

function countByFixedKeys<T, K extends string>(
  rows: readonly T[],
  keys: readonly K[],
  keyFor: (row: T) => K,
): Record<K, number> {
  const counts = Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
  for (const row of rows) {
    counts[keyFor(row)] += 1;
  }
  return counts;
}

function promotionReadinessFor(
  packet: ReviewPacket,
): "ready_for_review" | "needs_enrichment" | "blocked" {
  if (packet.promotionBlockers.length > 0) return "blocked";
  if (
    packet.allowedClaimStrength < 2 ||
    packet.candidate.confidence === "low" ||
    !packet.packetCompleteness.hasCounterEvidence
  ) {
    return "needs_enrichment";
  }
  return "ready_for_review";
}

function promotionNextActionFor(
  packet: ReviewPacket,
  readiness: "ready_for_review" | "needs_enrichment" | "blocked",
):
  | "review_for_promotion"
  | "revise_claim_before_promotion"
  | "keep_as_data_quality"
  | "enrich_before_promotion"
  | "do_not_promote" {
  if (packet.candidate.category === "data_quality" || packet.allowedClaimStrength <= 1) {
    return "keep_as_data_quality";
  }
  if (readiness === "blocked") return "do_not_promote";
  if (readiness === "needs_enrichment") return "enrich_before_promotion";
  if (packet.allowedClaimStrength <= 2 || packet.candidate.confidence === "medium") {
    return "revise_claim_before_promotion";
  }
  return "review_for_promotion";
}

function requiredReviewerActionsFor(packet: ReviewPacket): string[] {
  if (packet.promotionBlockers.length > 0) return packet.promotionBlockers;
  return [
    "Confirm primary evidence directly supports the claim text and scope.",
    "Confirm counter-evidence does not block promotion or requires claim revision.",
    "Choose one promotion decision and include rationale plus evidence refs approved.",
  ];
}

function buildFindingPromotionQueueArtifact(args: {
  isoMonth: string;
  generatedAt: string;
  reviewPacketsArtifactPath: string;
  reviewPackets: FindingReviewPacketsArtifact;
}) {
  const candidates = args.reviewPackets.packets
    .map((packet) => {
      const readiness = promotionReadinessFor(packet);
      const recommendedNextAction = promotionNextActionFor(packet, readiness);
      const promotionPriority = packet.priority.score + packet.allowedClaimStrength * 5;
      return {
        packetId: packet.packetId,
        reviewRank: packet.reviewRank,
        candidate: packet.candidate,
        readiness,
        recommendedNextAction,
        promotionPriority,
        promotionPriorityBand: reviewPriorityBand(promotionPriority),
        allowedClaimStrength: packet.allowedClaimStrength,
        maxPromotableClaimStrength:
          readiness === "blocked" ? 0 : Math.min(packet.allowedClaimStrength, 3),
        promotionBlockers: packet.promotionBlockers,
        requiredReviewerActions: requiredReviewerActionsFor(packet),
        evidenceSummary: {
          primaryCount: packet.evidence.primary.length,
          contextCount: packet.evidence.context.length,
          counterEvidenceCount: packet.evidence.counterEvidence.length,
          caveatCount: packet.evidence.caveats.length,
          missingDataCount: packet.evidence.missingData.length,
          coverageAuditCount: packet.evidence.coverageAudit.length + packet.coverage.length,
        },
        reviewChecklist: packet.reviewChecklist,
      };
    })
    .sort((left, right) => {
      const priorityDelta = right.promotionPriority - left.promotionPriority;
      if (priorityDelta !== 0) return priorityDelta;
      return left.candidate.candidateId.localeCompare(right.candidate.candidateId);
    })
    .map((candidate, index) => ({ ...candidate, reviewRank: index + 1 }));

  return FindingPromotionQueueArtifactSchema.parse({
    artifactKind: "finding_promotion_queue",
    schemaVersion: 1,
    month: args.isoMonth,
    generatedAt: args.generatedAt,
    reviewPacketsArtifactPath: args.reviewPacketsArtifactPath,
    candidateCount: candidates.length,
    summary: {
      candidateCount: candidates.length,
      readinessCounts: countByFixedKeys(
        candidates,
        PROMOTION_READINESS_VALUES,
        (candidate) => candidate.readiness,
      ),
      recommendedNextActionCounts: countByFixedKeys(
        candidates,
        PROMOTION_NEXT_ACTION_VALUES,
        (candidate) => candidate.recommendedNextAction,
      ),
      detectorCounts: countBy(candidates, (candidate) => candidate.candidate.detectorId),
      readyForReviewCount: candidates.filter(
        (candidate) => candidate.readiness === "ready_for_review",
      ).length,
      blockedCount: candidates.filter((candidate) => candidate.readiness === "blocked").length,
    },
    reviewerDecisionOptions: REVIEWER_DECISION_OPTIONS,
    outputSchema: {
      candidateId: "string",
      decision: "approve | approve_with_revisions | defer | reject | downgrade_to_context",
      revisedClaimText: "string | null",
      rationale: "string",
      evidenceRefsApproved: "string[]",
      reviewer: "string",
      reviewedAt: "ISO datetime",
    },
    candidates,
  });
}

async function writeFindingPromotionQueueArtifact(args: {
  artifactRoot: string;
  isoMonth: string;
  generatedAt: string;
  reviewPacketsArtifactPath: string;
  reviewPackets: FindingReviewPacketsArtifact;
}): Promise<string> {
  const path = join(args.artifactRoot, "findings", args.isoMonth, "promotion-queue.json");
  const artifact = buildFindingPromotionQueueArtifact({
    isoMonth: args.isoMonth,
    generatedAt: args.generatedAt,
    reviewPacketsArtifactPath: args.reviewPacketsArtifactPath,
    reviewPackets: args.reviewPackets,
  });
  await mkdir(dirname(path), { recursive: true });
  await writeJson(path, artifact);
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
    const monthEnd = nextIsoMonthStart(options.year, options.month);

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
        catalog,
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
    const supplementalRouteContext = buildSupplementalRouteEvidenceContext({
      sqlite: local.sqlite,
      month: options.isoMonth,
      monthEndDate: monthEnd.slice(0, 10),
    });
    const sourceGapWithContext = attachRouteContextEvidence(sourceGap, signalFeatures);
    const persistentSpeedHotspotsWithContext = attachSupplementalRouteEvidence(
      attachRouteContextEvidence(persistentSpeedHotspots, signalFeatures),
      supplementalRouteContext,
    );
    const multiMonthSpeedPeerWithContext = attachSupplementalRouteEvidence(
      attachRouteContextEvidence(multiMonthSpeedPeer, signalFeatures),
      supplementalRouteContext,
    );
    const observedReliabilityWithContext = attachSupplementalRouteEvidence(
      attachRouteContextEvidence(observedReliability, signalFeatures),
      supplementalRouteContext,
    );
    const interventionGapWithContext = attachSupplementalRouteEvidence(
      attachRouteContextEvidence(interventionGap, signalFeatures),
      supplementalRouteContext,
    );
    const interventionUnderperformanceWithContext = attachSupplementalRouteEvidence(
      attachRouteContextEvidence(interventionUnderperformance, signalFeatures),
      supplementalRouteContext,
    );
    const permitCorrelatedSlowdownWithContext = attachSupplementalRouteEvidence(
      attachRouteContextEvidence(permitCorrelatedSlowdown, signalFeatures),
      supplementalRouteContext,
    );
    const serviceRequestContextWithContext = attachSupplementalRouteEvidence(
      serviceRequestContext,
      supplementalRouteContext,
    );
    const sourceGapWithSupplementalContext = attachSupplementalRouteEvidence(
      sourceGapWithContext,
      supplementalRouteContext,
    );
    const detectorOutputs = [
      sourceGapWithSupplementalContext,
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
      candidates: sourceGapWithSupplementalContext.candidates,
      evidence: sourceGapWithSupplementalContext.evidence,
      coverage: sourceGapWithSupplementalContext.coverage,
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
    const reviewPacketsWrite = await writeFindingReviewPacketsArtifact({
      artifactRoot,
      isoMonth: options.isoMonth,
      generatedAt,
      detectorSpecsArtifactPath,
      outputs: detectorOutputs,
    });
    const reviewPacketsArtifactPath = reviewPacketsWrite.path;
    const promotionQueueArtifactPath = await writeFindingPromotionQueueArtifact({
      artifactRoot,
      isoMonth: options.isoMonth,
      generatedAt,
      reviewPacketsArtifactPath,
      reviewPackets: reviewPacketsWrite.artifact,
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
      promotionQueueArtifactPath,
      signalFeaturesArtifactPath,
    };
  });
}

export async function buildFindingsFromCli(args: string[]): Promise<FindingsDetectResult> {
  return buildFindings(parseCliArgs(args));
}
