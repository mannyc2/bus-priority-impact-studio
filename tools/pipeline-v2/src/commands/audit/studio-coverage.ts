import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { arg, defineCommand, z } from "@liche/core";
import {
  listRouteBriefSummaries,
  listRouteCatalog,
  listRouteObservedReliabilitySummaries,
} from "@bp/db/local";
import { StudioAiPublicNoteSchema } from "@bp/domain";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, localDbFromCtx, withLocalDb } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, fromRepoRoot } from "../../lib/paths.ts";

type ObservedReliabilityByMonth = {
  month: string;
  runIds: string[];
  routeCount: number;
  observedRouteCount: number;
  insufficientRouteCount: number;
  sampleCount: number;
};

type RouteBriefInputHourlyBins = {
  routeInputCount: number;
  scheduleComparisonCount: number;
  segmentsWithScheduleComparisons: number;
  segmentsWithCompleteScheduleComparisons: number;
  segmentsMissingScheduleComparisons: number;
  segmentsWithIncompleteScheduleComparisons: number;
  segmentCount: number;
  segmentsWith24HourlyBins: number;
  segmentsMissingHourlyBins: number;
  segmentsWithLegacyHourlyBins: number;
  segmentsWithRidershipExposure: number;
  segmentsMissingRidershipExposure: number;
  routesMissingBriefInput: string[];
  routesMissingScheduleComparisons: string[];
  routesWithSegmentsMissingScheduleComparisons: string[];
  routesWithIncompleteScheduleComparisons: string[];
  routesWithMissingHourlyBins: string[];
  routesWithLegacyHourlyBins: string[];
  routesWithMissingRidershipExposure: string[];
};

type ProjectionSegmentHourBins = {
  segmentCount: number;
  segmentsWith24HourBins: number;
  segmentsWithInvalidHourBins: number;
  segmentsWithDotLaneGeometry: number;
  segmentsWithInvalidLaneGeometry: number;
  segmentsWithRouteShapeGeometry: number;
  segmentsWithInvalidRouteShapeGeometry: number;
  segmentsWithTspSourceEvidence: number;
  segmentsWithInvalidTspEvidence: number;
  segmentsWithPublicAiNotes: number;
  segmentsWithInvalidPublicAiNotes: number;
  routeDetailsWithExcessPublicAiNoteDensity: number;
  routeDetailsWithRidershipProfile: number;
  routeDetailsWithInvalidRidershipProfile: number;
  routeSegmentEvidenceCount: number;
  routeSegmentEvidenceWithDotLaneGeometry: number;
  routeSegmentEvidenceWithInvalidLaneGeometry: number;
  routeSegmentEvidenceWithRouteShapeGeometry: number;
  routeSegmentEvidenceWithInvalidRouteShapeGeometry: number;
  routeSegmentEvidenceWithTspSourceEvidence: number;
  routeSegmentEvidenceWithInvalidTspEvidence: number;
  routeSegmentEvidenceWithCompleteRiderDelay: number;
  routeSegmentEvidenceWithInvalidRiderDelay: number;
  routeSegmentResponsesWithCoverageMetadata: number;
  routeSegmentResponsesWithInvalidCoverageMetadata: number;
  invalidSegmentRefs: string[];
  invalidLaneRefs: string[];
  invalidRouteShapeRefs: string[];
  invalidTspRefs: string[];
  invalidPublicAiNoteRefs: string[];
  excessPublicAiNoteDensityRefs: string[];
  invalidRouteDetailRidershipProfileRefs: string[];
  invalidRouteSegmentEvidenceLaneRefs: string[];
  invalidRouteSegmentEvidenceRouteShapeRefs: string[];
  invalidRouteSegmentEvidenceTspRefs: string[];
  invalidRouteSegmentEvidenceRiderDelayRefs: string[];
  invalidRouteSegmentCoverageRefs: string[];
};

type GeneratedArtifactPresentationScan = {
  generatedArtifactPresentationViolationCount: number;
  generatedArtifactPresentationViolations: string[];
};

type EvidenceCatalogAudit = {
  evidenceCatalogItemCount: number;
  evidenceCatalogInvalidItemCount: number;
  invalidEvidenceCatalogRefs: string[];
};

export type StudioCoverageAuditResult = {
  schemaVersion: 1;
  generatedAt: string;
  isoMonth: string;
  status: "pass" | "warn" | "fail";
  d1: {
    routeCatalogCount: number;
    routeBriefSummaryCount: number;
    publicRouteBriefSummaryCount: number;
    observedReliability: ObservedReliabilityByMonth[];
  };
  projection: {
    routesListCount: number;
    routesListWithDotLaneCoverage: number;
    routesListWithInvalidLaneCoverage: number;
    routesListWithTrendMonthLabels: number;
    routesListWithInvalidTrendMonthLabels: number;
    routesListWithRidershipProfile: number;
    routesListWithInvalidRidershipProfile: number;
    routeDetailCount: number;
    routeDetailSegmentCount: number;
    routeDetailSegmentsWith24HourBins: number;
    routeDetailSegmentsWithInvalidHourBins: number;
    routeDetailSegmentsWithDotLaneGeometry: number;
    routeDetailSegmentsWithInvalidLaneGeometry: number;
    routeDetailSegmentsWithRouteShapeGeometry: number;
    routeDetailSegmentsWithInvalidRouteShapeGeometry: number;
    routeDetailSegmentsWithTspSourceEvidence: number;
    routeDetailSegmentsWithInvalidTspEvidence: number;
    routeDetailSegmentsWithPublicAiNotes: number;
    routeDetailSegmentsWithInvalidPublicAiNotes: number;
    routeDetailsWithExcessPublicAiNoteDensity: number;
    routeDetailsWithRidershipProfile: number;
    routeDetailsWithInvalidRidershipProfile: number;
    routeSegmentEvidenceCount: number;
    routeSegmentEvidenceWithDotLaneGeometry: number;
    routeSegmentEvidenceWithInvalidLaneGeometry: number;
    routeSegmentEvidenceWithRouteShapeGeometry: number;
    routeSegmentEvidenceWithInvalidRouteShapeGeometry: number;
    routeSegmentEvidenceWithTspSourceEvidence: number;
    routeSegmentEvidenceWithInvalidTspEvidence: number;
    routeSegmentEvidenceWithCompleteRiderDelay: number;
    routeSegmentEvidenceWithInvalidRiderDelay: number;
    routeSegmentResponsesWithCoverageMetadata: number;
    routeSegmentResponsesWithInvalidCoverageMetadata: number;
    briefsListCount: number;
    briefDetailCount: number;
    briefEvidenceDetailCount: number;
    briefHistoryDetailCount: number;
    findingsListCount: number;
    findingDetailCount: number;
    reviewedFindingCount: number;
    reviewCandidateFindingCount: number;
    generatedCandidateFindingCount: number;
    findingsMissingReviewCount: number;
    detectorFindingCount: number;
    evidenceCatalogItemCount: number;
    evidenceCatalogInvalidItemCount: number;
    generatedArtifactPresentationViolationCount: number;
  };
  routeBriefInputs: RouteBriefInputHourlyBins;
  gaps: {
    routesMissingFromProjection: string[];
    routesWithInvalidLaneCoverage: string[];
    routesWithInvalidTrendMonthLabels: string[];
    routesWithInvalidRidershipProfile: string[];
    briefsMissingFromProjection: string[];
    routesMissingRouteBriefInput: string[];
    routesMissingScheduleComparisons: string[];
    routesWithSegmentsMissingScheduleComparisons: string[];
    routesWithIncompleteScheduleComparisons: string[];
    routesWithMissingRidershipExposure: string[];
    routesWithMissingHourlyBins: string[];
    routesWithLegacyHourlyBins: string[];
    routeDetailSegmentsWithInvalidHourBins: string[];
    routeDetailSegmentsWithInvalidLaneGeometry: string[];
    routeDetailSegmentsWithInvalidRouteShapeGeometry: string[];
    routeDetailSegmentsWithInvalidTspEvidence: string[];
    routeDetailSegmentsWithInvalidPublicAiNotes: string[];
    routeDetailsWithExcessPublicAiNoteDensity: string[];
    routeDetailsWithInvalidRidershipProfile: string[];
    routeSegmentEvidenceWithInvalidLaneGeometry: string[];
    routeSegmentEvidenceWithInvalidRouteShapeGeometry: string[];
    routeSegmentEvidenceWithInvalidTspEvidence: string[];
    routeSegmentEvidenceWithInvalidRiderDelay: string[];
    routeSegmentResponsesWithInvalidCoverageMetadata: string[];
    findingsMissingReview: string[];
    reviewCandidatesMarkedApproved: string[];
    reviewedFindingsWithoutApproval: string[];
    detectorFindingsMissingRefs: string[];
    evidenceCatalogInvalidItems: string[];
    generatedArtifactPresentationViolations: string[];
    studioRouteCoverageShare: number;
    studioBriefCoverageShare: number;
    findingRouteCount: number;
    studioFindingCoverageShare: number;
    note: string;
  };
  outputPath: string;
};

async function listDirectoryEntries(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function listJsonFiles(path: string): Promise<string[]> {
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    entries = (await readdir(path, { withFileTypes: true })) as Array<{
      name: string;
      isDirectory(): boolean;
      isFile(): boolean;
    }>;
  } catch {
    return [];
  }

  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(path, entry.name);
      if (entry.isDirectory()) return listJsonFiles(entryPath);
      return entry.isFile() && entry.name.endsWith(".json") ? [entryPath] : [];
    }),
  );
  return files.flat().sort();
}

async function readJsonArray(path: string, key: string): Promise<unknown[]> {
  try {
    const body = JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
    const value = body[key];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function pickField(entry: unknown, ...keys: string[]): string | null {
  if (typeof entry !== "object" || entry === null) return null;
  const record = entry as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  return null;
}

function pickNestedField(entry: unknown, path: readonly string[]): string | null {
  let current = entry;
  for (const key of path) {
    if (typeof current !== "object" || current === null) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : null;
}

function findingRecord(entry: unknown): Record<string, unknown> {
  if (typeof entry !== "object" || entry === null) return {};
  const record = entry as { finding?: unknown };
  const nested = record.finding;
  return typeof nested === "object" && nested !== null
    ? (nested as Record<string, unknown>)
    : record;
}

function reviewRecord(finding: Record<string, unknown>): Record<string, unknown> | null {
  const review = (finding as { review?: unknown }).review;
  return typeof review === "object" && review !== null ? (review as Record<string, unknown>) : null;
}

function stringValue(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function stringArrayValue(record: Record<string, unknown>, key: string): string[] | null {
  const value = record[key];
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : null;
}

function findingId(finding: Record<string, unknown>, fallback: number): string {
  return stringValue(finding, "id") ?? `finding:${fallback + 1}`;
}

function emptyRouteBriefInputHourlyBins(): RouteBriefInputHourlyBins {
  return {
    routeInputCount: 0,
    scheduleComparisonCount: 0,
    segmentsWithScheduleComparisons: 0,
    segmentsWithCompleteScheduleComparisons: 0,
    segmentsMissingScheduleComparisons: 0,
    segmentsWithIncompleteScheduleComparisons: 0,
    segmentCount: 0,
    segmentsWith24HourlyBins: 0,
    segmentsMissingHourlyBins: 0,
    segmentsWithLegacyHourlyBins: 0,
    segmentsWithRidershipExposure: 0,
    segmentsMissingRidershipExposure: 0,
    routesMissingBriefInput: [],
    routesMissingScheduleComparisons: [],
    routesWithSegmentsMissingScheduleComparisons: [],
    routesWithIncompleteScheduleComparisons: [],
    routesWithMissingHourlyBins: [],
    routesWithLegacyHourlyBins: [],
    routesWithMissingRidershipExposure: [],
  };
}

function routeBriefInputPath(artifactRoot: string, routeId: string, isoMonthValue: string): string {
  return join(
    artifactRoot,
    "route-slices",
    `${routeId.toLowerCase()}-${isoMonthValue}`,
    "route-brief-input.json",
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasRidershipExposure(record: { ridershipExposure?: unknown }): boolean {
  return isFiniteNumber(record.ridershipExposure) && record.ridershipExposure >= 0;
}

function hasCompleteScheduleComparison(record: {
  scheduledMedianTravelTimeMinutes?: unknown;
  observedMinusScheduledMinutes?: unknown;
  scheduledSampleCount?: unknown;
}): boolean {
  return (
    isFiniteNumber(record.scheduledMedianTravelTimeMinutes) &&
    record.scheduledMedianTravelTimeMinutes > 0 &&
    isFiniteNumber(record.observedMinusScheduledMinutes) &&
    isFiniteNumber(record.scheduledSampleCount) &&
    Number.isInteger(record.scheduledSampleCount) &&
    record.scheduledSampleCount > 0
  );
}

async function auditRouteBriefInputHourlyBins(args: {
  artifactRoot: string;
  isoMonth: string;
  routeIds: readonly string[];
}): Promise<RouteBriefInputHourlyBins> {
  const result = emptyRouteBriefInputHourlyBins();

  for (const routeId of args.routeIds) {
    let body: { topSegments?: unknown; scheduleComparisons?: unknown };
    try {
      body = JSON.parse(
        await readFile(routeBriefInputPath(args.artifactRoot, routeId, args.isoMonth), "utf-8"),
      ) as Record<string, unknown>;
    } catch {
      result.routesMissingBriefInput.push(routeId);
      continue;
    }

    result.routeInputCount += 1;
    const scheduleComparisons = body.scheduleComparisons;
    const scheduleComparisonsBySegmentId = new Map<string, Record<string, unknown>>();
    if (Array.isArray(scheduleComparisons) && scheduleComparisons.length > 0) {
      result.scheduleComparisonCount += scheduleComparisons.length;
      for (const comparison of scheduleComparisons) {
        const record =
          typeof comparison === "object" && comparison !== null
            ? (comparison as Record<string, unknown>)
            : {};
        const segmentId = record["segmentId"];
        if (typeof segmentId === "string") {
          scheduleComparisonsBySegmentId.set(segmentId, record);
        }
      }
    } else {
      result.routesMissingScheduleComparisons.push(routeId);
    }

    const topSegments = body.topSegments;
    const segments = Array.isArray(topSegments) ? topSegments : [];
    let routeHasSegmentMissingScheduleComparison = false;
    let routeHasIncompleteScheduleComparison = false;
    let routeHasMissingBins = false;
    let routeHasLegacyBins = false;
    let routeHasMissingRidershipExposure = false;

    for (const segment of segments) {
      result.segmentCount += 1;
      const segmentRecord =
        typeof segment === "object" && segment !== null ? (segment as Record<string, unknown>) : {};
      const segmentId = segmentRecord["segmentId"];
      const comparison =
        typeof segmentId === "string" ? scheduleComparisonsBySegmentId.get(segmentId) : undefined;
      if (comparison !== undefined) {
        result.segmentsWithScheduleComparisons += 1;
        if (hasCompleteScheduleComparison(comparison)) {
          result.segmentsWithCompleteScheduleComparisons += 1;
        } else {
          result.segmentsWithIncompleteScheduleComparisons += 1;
          routeHasIncompleteScheduleComparison = true;
        }
      } else {
        result.segmentsMissingScheduleComparisons += 1;
        routeHasSegmentMissingScheduleComparison = true;
      }
      const bins =
        typeof segment === "object" && segment !== null
          ? (segment as { hourlySlowWindowBins?: unknown }).hourlySlowWindowBins
          : undefined;
      if (!Array.isArray(bins)) {
        result.segmentsMissingHourlyBins += 1;
        routeHasMissingBins = true;
      } else if (bins.length === 24) {
        result.segmentsWith24HourlyBins += 1;
      } else {
        result.segmentsWithLegacyHourlyBins += 1;
        routeHasLegacyBins = true;
      }
      if (hasRidershipExposure(segmentRecord)) {
        result.segmentsWithRidershipExposure += 1;
      } else {
        result.segmentsMissingRidershipExposure += 1;
        routeHasMissingRidershipExposure = true;
      }
    }

    if (routeHasSegmentMissingScheduleComparison) {
      result.routesWithSegmentsMissingScheduleComparisons.push(routeId);
    }
    if (routeHasIncompleteScheduleComparison) {
      result.routesWithIncompleteScheduleComparisons.push(routeId);
    }
    if (routeHasMissingBins) result.routesWithMissingHourlyBins.push(routeId);
    if (routeHasLegacyBins) result.routesWithLegacyHourlyBins.push(routeId);
    if (routeHasMissingRidershipExposure) result.routesWithMissingRidershipExposure.push(routeId);
  }

  return {
    ...result,
    routesMissingBriefInput: result.routesMissingBriefInput.sort(),
    routesMissingScheduleComparisons: result.routesMissingScheduleComparisons.sort(),
    routesWithSegmentsMissingScheduleComparisons:
      result.routesWithSegmentsMissingScheduleComparisons.sort(),
    routesWithIncompleteScheduleComparisons: result.routesWithIncompleteScheduleComparisons.sort(),
    routesWithMissingHourlyBins: result.routesWithMissingHourlyBins.sort(),
    routesWithLegacyHourlyBins: result.routesWithLegacyHourlyBins.sort(),
    routesWithMissingRidershipExposure: result.routesWithMissingRidershipExposure.sort(),
  };
}

function emptyProjectionSegmentHourBins(): ProjectionSegmentHourBins {
  return {
    segmentCount: 0,
    segmentsWith24HourBins: 0,
    segmentsWithInvalidHourBins: 0,
    segmentsWithDotLaneGeometry: 0,
    segmentsWithInvalidLaneGeometry: 0,
    segmentsWithRouteShapeGeometry: 0,
    segmentsWithInvalidRouteShapeGeometry: 0,
    segmentsWithTspSourceEvidence: 0,
    segmentsWithInvalidTspEvidence: 0,
    segmentsWithPublicAiNotes: 0,
    segmentsWithInvalidPublicAiNotes: 0,
    routeDetailsWithExcessPublicAiNoteDensity: 0,
    routeDetailsWithRidershipProfile: 0,
    routeDetailsWithInvalidRidershipProfile: 0,
    routeSegmentEvidenceCount: 0,
    routeSegmentEvidenceWithDotLaneGeometry: 0,
    routeSegmentEvidenceWithInvalidLaneGeometry: 0,
    routeSegmentEvidenceWithRouteShapeGeometry: 0,
    routeSegmentEvidenceWithInvalidRouteShapeGeometry: 0,
    routeSegmentEvidenceWithTspSourceEvidence: 0,
    routeSegmentEvidenceWithInvalidTspEvidence: 0,
    routeSegmentEvidenceWithCompleteRiderDelay: 0,
    routeSegmentEvidenceWithInvalidRiderDelay: 0,
    routeSegmentResponsesWithCoverageMetadata: 0,
    routeSegmentResponsesWithInvalidCoverageMetadata: 0,
    invalidSegmentRefs: [],
    invalidLaneRefs: [],
    invalidRouteShapeRefs: [],
    invalidTspRefs: [],
    invalidPublicAiNoteRefs: [],
    excessPublicAiNoteDensityRefs: [],
    invalidRouteDetailRidershipProfileRefs: [],
    invalidRouteSegmentEvidenceLaneRefs: [],
    invalidRouteSegmentEvidenceRouteShapeRefs: [],
    invalidRouteSegmentEvidenceTspRefs: [],
    invalidRouteSegmentEvidenceRiderDelayRefs: [],
    invalidRouteSegmentCoverageRefs: [],
  };
}

function hasLaneMethodMetadata(record: {
  laneTypes?: unknown;
  laneOperatingHours?: unknown;
  laneOperatingDays?: unknown;
}) {
  return (
    Array.isArray(record.laneTypes) &&
    record.laneTypes.every((value) => typeof value === "string") &&
    Array.isArray(record.laneOperatingHours) &&
    record.laneOperatingHours.every((value) => typeof value === "string") &&
    Array.isArray(record.laneOperatingDays) &&
    record.laneOperatingDays.every((value) => typeof value === "string")
  );
}

function hasDotLaneGeometryEvidence(record: {
  lane?: unknown;
  laneSource?: unknown;
  laneOverlapShare?: unknown;
  laneMatchedCount?: unknown;
  laneTypes?: unknown;
  laneOperatingHours?: unknown;
  laneOperatingDays?: unknown;
}): boolean {
  return (
    (record.lane === "yes" ||
      record.lane === "partial" ||
      record.lane === "minimal" ||
      record.lane === "none") &&
    record.laneSource === "dot_bus_lanes_geometry" &&
    typeof record.laneOverlapShare === "number" &&
    record.laneOverlapShare >= 0 &&
    record.laneOverlapShare <= 1 &&
    typeof record.laneMatchedCount === "number" &&
    Number.isInteger(record.laneMatchedCount) &&
    record.laneMatchedCount >= 0 &&
    hasLaneMethodMetadata(record)
  );
}

function hasDotRouteLaneCoverage(record: {
  laneCoverage?: unknown;
  laneCoverageSource?: unknown;
  laneTypes?: unknown;
  laneOperatingHours?: unknown;
  laneOperatingDays?: unknown;
}) {
  return (
    typeof record.laneCoverage === "number" &&
    Number.isFinite(record.laneCoverage) &&
    record.laneCoverage >= 0 &&
    record.laneCoverage <= 100 &&
    record.laneCoverageSource === "dot_bus_lanes_geometry" &&
    hasLaneMethodMetadata(record)
  );
}

function hasValidTrendMonthLabels(record: {
  spark?: unknown;
  sparkMonths?: unknown;
  ridershipSpark?: unknown;
  ridershipSparkMonths?: unknown;
}): boolean {
  const isIsoMonth = (value: unknown): value is string =>
    typeof value === "string" && /^\d{4}-\d{2}$/.test(value);
  return (
    Array.isArray(record.spark) &&
    record.spark.every(isFiniteNumber) &&
    Array.isArray(record.sparkMonths) &&
    record.sparkMonths.length === record.spark.length &&
    record.sparkMonths.every(isIsoMonth) &&
    Array.isArray(record.ridershipSpark) &&
    record.ridershipSpark.every(isFiniteNumber) &&
    Array.isArray(record.ridershipSparkMonths) &&
    record.ridershipSparkMonths.length === record.ridershipSpark.length &&
    record.ridershipSparkMonths.every(isIsoMonth)
  );
}

function hasValidRidershipWindow(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const record = value as {
    dayOfWeek?: unknown;
    hourOfDay?: unknown;
    ridership?: unknown;
    transfers?: unknown;
    matchedObservationCount?: unknown;
    busTripCount?: unknown;
    weightedAverageSpeedMph?: unknown;
    slowObservationShare?: unknown;
  };
  return (
    typeof record.dayOfWeek === "string" &&
    record.dayOfWeek.length > 0 &&
    Number.isInteger(record.hourOfDay) &&
    typeof record.hourOfDay === "number" &&
    record.hourOfDay >= 0 &&
    record.hourOfDay <= 23 &&
    isFiniteNumber(record.ridership) &&
    record.ridership >= 0 &&
    isFiniteNumber(record.transfers) &&
    record.transfers >= 0 &&
    Number.isInteger(record.matchedObservationCount) &&
    typeof record.matchedObservationCount === "number" &&
    record.matchedObservationCount >= 0 &&
    isFiniteNumber(record.busTripCount) &&
    record.busTripCount >= 0 &&
    (record.weightedAverageSpeedMph === null ||
      (isFiniteNumber(record.weightedAverageSpeedMph) && record.weightedAverageSpeedMph >= 0)) &&
    (record.slowObservationShare === null ||
      (isFiniteNumber(record.slowObservationShare) &&
        record.slowObservationShare >= 0 &&
        record.slowObservationShare <= 1))
  );
}

function hasValidRidershipProfile(record: { ridershipProfile?: unknown }): boolean {
  if (typeof record.ridershipProfile !== "object" || record.ridershipProfile === null) {
    return false;
  }
  const profile = record.ridershipProfile as {
    peakRidershipWindow?: unknown;
    topRidershipWindows?: unknown;
    slowCrowdedWindows?: unknown;
  };
  return (
    (profile.peakRidershipWindow === null ||
      hasValidRidershipWindow(profile.peakRidershipWindow)) &&
    Array.isArray(profile.topRidershipWindows) &&
    profile.topRidershipWindows.length > 0 &&
    profile.topRidershipWindows.every(hasValidRidershipWindow) &&
    Array.isArray(profile.slowCrowdedWindows) &&
    profile.slowCrowdedWindows.every(hasValidRidershipWindow)
  );
}

function hasRouteShapeSegmentGeometry(record: {
  segmentGeometrySource?: unknown;
  segmentGeometryMethod?: unknown;
  segmentGeometry?: unknown;
}): boolean {
  if (
    record.segmentGeometrySource !== "mta_route_shape_timepoint_slice" ||
    record.segmentGeometryMethod !== "timepoint_stop_projection_to_route_shape" ||
    typeof record.segmentGeometry !== "object" ||
    record.segmentGeometry === null
  ) {
    return false;
  }

  const geometry = record.segmentGeometry as { type?: unknown; coordinates?: unknown };
  return (
    geometry.type === "LineString" &&
    Array.isArray(geometry.coordinates) &&
    geometry.coordinates.length >= 2 &&
    geometry.coordinates.every(
      (coordinate) =>
        Array.isArray(coordinate) &&
        coordinate.length === 2 &&
        coordinate.every((value) => typeof value === "number" && Number.isFinite(value)),
    )
  );
}

function hasTspSourceEvidence(record: {
  tspStatus?: unknown;
  tspSource?: unknown;
  tspSourceDate?: unknown;
  tspSourceUrl?: unknown;
  tspCorridor?: unknown;
  tspMatchMethod?: unknown;
}): boolean {
  const validStatus =
    record.tspStatus === "installed" ||
    record.tspStatus === "candidate" ||
    record.tspStatus === "unknown";
  const validSource =
    record.tspSource === "nyc_dot_tsp_status_2017" ||
    record.tspSource === "not_in_ingested_tsp_sources";
  if (!validStatus || !validSource) return false;

  if (record.tspSource === "nyc_dot_tsp_status_2017") {
    return (
      typeof record.tspSourceDate === "string" &&
      record.tspSourceDate.length > 0 &&
      typeof record.tspSourceUrl === "string" &&
      record.tspSourceUrl.length > 0 &&
      typeof record.tspCorridor === "string" &&
      record.tspCorridor.length > 0 &&
      (record.tspMatchMethod === "route_label_in_2017_status_snapshot" ||
        record.tspMatchMethod === "segment_endpoint_text_match" ||
        record.tspMatchMethod === "route_level_status_only")
    );
  }

  return (
    record.tspSourceDate === null &&
    record.tspSourceUrl === null &&
    record.tspCorridor === null &&
    record.tspMatchMethod === "not_matched_in_ingested_sources"
  );
}

function hasCompleteRiderDelayEvidence(record: {
  scheduledMedianTravelTimeMinutes?: unknown;
  scheduledSpeedMph?: unknown;
  observedMinusScheduledMinutes?: unknown;
  scheduledSampleCount?: unknown;
  ridershipExposure?: unknown;
  riderDelayHours?: unknown;
  hourlyPassengerDelay?: unknown;
  stopBoardings?: unknown;
  segmentBoardings?: unknown;
}): boolean {
  const hourlyRows = Array.isArray(record.hourlyPassengerDelay) ? record.hourlyPassengerDelay : [];
  return (
    hasCompleteScheduleComparison(record) &&
    isFiniteNumber(record.scheduledSpeedMph) &&
    record.scheduledSpeedMph > 0 &&
    hasRidershipExposure(record) &&
    isFiniteNumber(record.riderDelayHours) &&
    record.riderDelayHours >= 0 &&
    hourlyRows.length > 0 &&
    hourlyRows.every((row) => {
      if (typeof row !== "object" || row === null) return false;
      const hourlyRecord = row as {
        averageServiceDayRouteRidership?: unknown;
        monthlyRouteRidership?: unknown;
        riderDelayHours?: unknown;
        segmentBoardings?: unknown;
        serviceDayCount?: unknown;
        stopBoardings?: unknown;
      };
      return (
        (hourlyRecord.averageServiceDayRouteRidership === null ||
          (isFiniteNumber(hourlyRecord.averageServiceDayRouteRidership) &&
            hourlyRecord.averageServiceDayRouteRidership >= 0)) &&
        (hourlyRecord.monthlyRouteRidership === null ||
          (isFiniteNumber(hourlyRecord.monthlyRouteRidership) &&
            hourlyRecord.monthlyRouteRidership >= 0)) &&
        (hourlyRecord.serviceDayCount === null ||
          (Number.isInteger(hourlyRecord.serviceDayCount) &&
            typeof hourlyRecord.serviceDayCount === "number" &&
            hourlyRecord.serviceDayCount > 0)) &&
        isFiniteNumber(hourlyRecord.riderDelayHours) &&
        hourlyRecord.riderDelayHours >= 0 &&
        hourlyRecord.stopBoardings === null &&
        hourlyRecord.segmentBoardings === null
      );
    }) &&
    record.stopBoardings === null &&
    record.segmentBoardings === null
  );
}

function routePublicAiNoteLimit(segmentCount: number): number {
  return segmentCount === 0 ? 0 : Math.max(1, Math.floor(segmentCount * 0.3));
}

function hasValidPublicAiNote(value: unknown): boolean {
  return StudioAiPublicNoteSchema.safeParse(value).success;
}

const requiredBoardingUnavailableCoverageReasons = [
  "stop_level_boardings_unavailable",
  "segment_level_boardings_unavailable",
] as const;

const singleMonthUnavailableCoverageReasons = [
  "multi_month_window_projection_pending",
  "stop_level_boardings_unavailable",
  "segment_level_boardings_unavailable",
] as const;

function hasRouteSegmentCoverageMetadata(record: {
  coverage?: unknown;
  segments?: unknown;
}): boolean {
  const coverage =
    typeof record.coverage === "object" && record.coverage !== null
      ? (record.coverage as {
          scope?: unknown;
          segmentUniverse?: unknown;
          riderDelayMetric?: unknown;
          riderDelayAggregation?: unknown;
          ridershipDenominator?: unknown;
          serviceDayRidershipCoverage?: unknown;
          stopBoardingsCoverage?: unknown;
          segmentBoardingsCoverage?: unknown;
          hourlyRiderDelayCoverage?: unknown;
          fullRouteCoverage?: unknown;
          multiMonthWindowCoverage?: unknown;
          unavailableCoverageReasons?: unknown;
          totalRouteSegmentRows?: unknown;
          returnedSegmentRows?: unknown;
          windowMonthCount?: unknown;
        })
      : null;
  if (coverage === null) return false;
  const segments = Array.isArray(record.segments) ? record.segments : [];
  const reasons = Array.isArray(coverage.unavailableCoverageReasons)
    ? coverage.unavailableCoverageReasons
    : [];
  const windowMonthCount =
    typeof coverage.windowMonthCount === "number" &&
    Number.isInteger(coverage.windowMonthCount) &&
    coverage.windowMonthCount >= 1
      ? coverage.windowMonthCount
      : null;
  const expectedReasons =
    windowMonthCount !== null && windowMonthCount > 1
      ? requiredBoardingUnavailableCoverageReasons
      : singleMonthUnavailableCoverageReasons;
  return (
    coverage.scope === "full_route_observed_timepoint_segments" &&
    coverage.segmentUniverse === "all_observed_timepoint_segments" &&
    coverage.riderDelayMetric ===
      "positive_observed_minus_scheduled_minutes_times_average_service_day_route_hourly_ridership" &&
    coverage.riderDelayAggregation === "segment_hour_service_day_hours" &&
    coverage.ridershipDenominator === "average_service_day_route_hourly_ridership" &&
    coverage.serviceDayRidershipCoverage === "available" &&
    coverage.stopBoardingsCoverage === "not_available" &&
    coverage.segmentBoardingsCoverage === "not_available" &&
    coverage.hourlyRiderDelayCoverage === "available" &&
    coverage.fullRouteCoverage === true &&
    windowMonthCount !== null &&
    coverage.multiMonthWindowCoverage ===
      (windowMonthCount > 1 ? "multi_month_window" : "single_release_month") &&
    expectedReasons.every((reason) => reasons.includes(reason)) &&
    reasons.every((reason) => expectedReasons.includes(reason)) &&
    coverage.returnedSegmentRows === segments.length &&
    isFiniteNumber(coverage.totalRouteSegmentRows) &&
    coverage.totalRouteSegmentRows >= segments.length &&
    coverage.windowMonthCount === windowMonthCount
  );
}

const forbiddenGeneratedArtifactPresentationTerms = [
  "LOCAL SKETCH",
  "Local claim sketch",
  "not persisted",
  "Estimated speed by hour",
  "Generate brief",
  "Open route brief",
  "Start brief",
  "RH/day",
  "rider-hr/day",
  "rider-hours/day",
  "Delay exposure / day",
  "Top rider-impact segments",
  "List route cards",
  "Rider-hour",
  "rider-hour",
  "rider hours",
  "rider-hours",
  "rider impact",
  "rider-impact",
  "full route rider-hours",
  "full-route rider-hours",
  "route-wide rider-hours",
  "top decile route-wide",
  "total route delay",
] as const;

async function auditGeneratedArtifactPresentationText(
  studioRoot: string,
): Promise<GeneratedArtifactPresentationScan> {
  const jsonFiles = await listJsonFiles(studioRoot);
  const violations: string[] = [];

  for (const path of jsonFiles) {
    const text = await readFile(path, "utf8");
    for (const term of forbiddenGeneratedArtifactPresentationTerms) {
      if (text.includes(term)) {
        violations.push(`${path.replace(`${studioRoot}/`, "")}:${term}`);
      }
    }
  }

  return {
    generatedArtifactPresentationViolationCount: violations.length,
    generatedArtifactPresentationViolations: violations.sort(),
  };
}

async function auditEvidenceCatalog(_studioRoot: string): Promise<EvidenceCatalogAudit> {
  // evidence.json projection retired with the cohort/evidence catalog domain refactor;
  // gate is now vestigial and always reports zero items.
  return {
    evidenceCatalogItemCount: 0,
    evidenceCatalogInvalidItemCount: 0,
    invalidEvidenceCatalogRefs: [],
  };
}

async function auditProjectionSegmentHourBins(args: {
  studioRoot: string;
  routeDirs: readonly string[];
}): Promise<ProjectionSegmentHourBins> {
  const result = emptyProjectionSegmentHourBins();

  for (const dir of args.routeDirs) {
    let routeDetailPayload: { route?: unknown; segments?: unknown };
    try {
      routeDetailPayload = JSON.parse(
        await readFile(join(args.studioRoot, "routes", dir, "index.json"), "utf-8"),
      ) as Record<string, unknown>;
    } catch {
      routeDetailPayload = {};
    }
    const routeRecord =
      typeof routeDetailPayload.route === "object" && routeDetailPayload.route !== null
        ? (routeDetailPayload.route as { ridershipProfile?: unknown })
        : {};
    if (hasValidRidershipProfile(routeRecord)) {
      result.routeDetailsWithRidershipProfile += 1;
    } else {
      result.routeDetailsWithInvalidRidershipProfile += 1;
      result.invalidRouteDetailRidershipProfileRefs.push(`${dir}:route:ridershipProfile`);
    }
    const segments = Array.isArray(routeDetailPayload.segments) ? routeDetailPayload.segments : [];
    for (const [index, segment] of segments.entries()) {
      result.segmentCount += 1;
      const record =
        typeof segment === "object" && segment !== null
          ? (segment as {
              hours?: unknown;
              id?: unknown;
              lane?: unknown;
              laneSource?: unknown;
              laneOverlapShare?: unknown;
              laneMatchedCount?: unknown;
              laneTypes?: unknown;
              laneOperatingHours?: unknown;
              laneOperatingDays?: unknown;
              segmentGeometrySource?: unknown;
              segmentGeometryMethod?: unknown;
              segmentGeometry?: unknown;
              tspStatus?: unknown;
              tspSource?: unknown;
              tspSourceDate?: unknown;
              tspSourceUrl?: unknown;
              tspCorridor?: unknown;
              tspMatchMethod?: unknown;
              aiNote?: unknown;
            })
          : {};
      const segmentRef = `${dir}:${typeof record.id === "string" ? record.id : index + 1}`;
      if (record.aiNote !== undefined) {
        result.segmentsWithPublicAiNotes += 1;
        if (!hasValidPublicAiNote(record.aiNote)) {
          result.segmentsWithInvalidPublicAiNotes += 1;
          result.invalidPublicAiNoteRefs.push(`${segmentRef}:aiNote`);
        }
      }
      const hours = record.hours;
      if (Array.isArray(hours) && hours.length === 24) {
        result.segmentsWith24HourBins += 1;
      } else {
        result.segmentsWithInvalidHourBins += 1;
        result.invalidSegmentRefs.push(segmentRef);
      }
      if (hasDotLaneGeometryEvidence(record)) {
        result.segmentsWithDotLaneGeometry += 1;
      } else {
        result.segmentsWithInvalidLaneGeometry += 1;
        result.invalidLaneRefs.push(segmentRef);
      }
      if (hasRouteShapeSegmentGeometry(record)) {
        result.segmentsWithRouteShapeGeometry += 1;
      } else {
        result.segmentsWithInvalidRouteShapeGeometry += 1;
        result.invalidRouteShapeRefs.push(segmentRef);
      }
      if (hasTspSourceEvidence(record)) {
        result.segmentsWithTspSourceEvidence += 1;
      } else {
        result.segmentsWithInvalidTspEvidence += 1;
        result.invalidTspRefs.push(segmentRef);
      }
    }
    const routePublicAiNoteLimitValue = routePublicAiNoteLimit(segments.length);
    const routePublicAiNoteCount = segments.filter(
      (segment) =>
        typeof segment === "object" &&
        segment !== null &&
        (segment as { aiNote?: unknown }).aiNote !== undefined,
    ).length;
    if (routePublicAiNoteCount > routePublicAiNoteLimitValue) {
      result.routeDetailsWithExcessPublicAiNoteDensity += 1;
      result.excessPublicAiNoteDensityRefs.push(
        `${dir}:aiNote-density:${routePublicAiNoteCount}/${segments.length}>${routePublicAiNoteLimitValue}`,
      );
    }

    const routeSegmentEvidencePath = join(args.studioRoot, "routes", dir, "segments.json");
    const routeSegmentEvidencePayload = JSON.parse(
      await readFile(routeSegmentEvidencePath, "utf8"),
    );
    if (hasRouteSegmentCoverageMetadata(routeSegmentEvidencePayload)) {
      result.routeSegmentResponsesWithCoverageMetadata += 1;
    } else {
      result.routeSegmentResponsesWithInvalidCoverageMetadata += 1;
      result.invalidRouteSegmentCoverageRefs.push(`${dir}:segments:coverage`);
    }
    const routeSegmentEvidence = Array.isArray(
      (routeSegmentEvidencePayload as { segments?: unknown }).segments,
    )
      ? (routeSegmentEvidencePayload as { segments: unknown[] }).segments
      : [];
    if (routeSegmentEvidence.length === 0) {
      result.routeSegmentEvidenceWithInvalidLaneGeometry += 1;
      result.invalidRouteSegmentEvidenceLaneRefs.push(`${dir}:segments:missing`);
      result.routeSegmentEvidenceWithInvalidRouteShapeGeometry += 1;
      result.invalidRouteSegmentEvidenceRouteShapeRefs.push(`${dir}:segments:missing`);
      result.routeSegmentEvidenceWithInvalidTspEvidence += 1;
      result.invalidRouteSegmentEvidenceTspRefs.push(`${dir}:segments:missing`);
      result.routeSegmentEvidenceWithInvalidRiderDelay += 1;
      result.invalidRouteSegmentEvidenceRiderDelayRefs.push(`${dir}:segments:missing`);
    }
    for (const [index, segment] of routeSegmentEvidence.entries()) {
      result.routeSegmentEvidenceCount += 1;
      const record =
        typeof segment === "object" && segment !== null
          ? (segment as {
              id?: unknown;
              lane?: unknown;
              laneSource?: unknown;
              laneOverlapShare?: unknown;
              laneMatchedCount?: unknown;
              laneTypes?: unknown;
              laneOperatingHours?: unknown;
              laneOperatingDays?: unknown;
              segmentGeometrySource?: unknown;
              segmentGeometryMethod?: unknown;
              segmentGeometry?: unknown;
              tspStatus?: unknown;
              tspSource?: unknown;
              tspSourceDate?: unknown;
              tspSourceUrl?: unknown;
              tspCorridor?: unknown;
              tspMatchMethod?: unknown;
              scheduledMedianTravelTimeMinutes?: unknown;
              scheduledSpeedMph?: unknown;
              observedMinusScheduledMinutes?: unknown;
              scheduledSampleCount?: unknown;
              ridershipExposure?: unknown;
              riderDelayHours?: unknown;
            })
          : {};
      const segmentRef = `${dir}:segments:${typeof record.id === "string" ? record.id : index + 1}`;
      if (hasDotLaneGeometryEvidence(record)) {
        result.routeSegmentEvidenceWithDotLaneGeometry += 1;
      } else {
        result.routeSegmentEvidenceWithInvalidLaneGeometry += 1;
        result.invalidRouteSegmentEvidenceLaneRefs.push(segmentRef);
      }
      if (hasRouteShapeSegmentGeometry(record)) {
        result.routeSegmentEvidenceWithRouteShapeGeometry += 1;
      } else {
        result.routeSegmentEvidenceWithInvalidRouteShapeGeometry += 1;
        result.invalidRouteSegmentEvidenceRouteShapeRefs.push(segmentRef);
      }
      if (hasTspSourceEvidence(record)) {
        result.routeSegmentEvidenceWithTspSourceEvidence += 1;
      } else {
        result.routeSegmentEvidenceWithInvalidTspEvidence += 1;
        result.invalidRouteSegmentEvidenceTspRefs.push(segmentRef);
      }
      if (hasCompleteRiderDelayEvidence(record)) {
        result.routeSegmentEvidenceWithCompleteRiderDelay += 1;
      } else {
        result.routeSegmentEvidenceWithInvalidRiderDelay += 1;
        result.invalidRouteSegmentEvidenceRiderDelayRefs.push(segmentRef);
      }
    }
  }

  return {
    ...result,
    invalidSegmentRefs: result.invalidSegmentRefs.sort(),
    invalidLaneRefs: result.invalidLaneRefs.sort(),
    invalidRouteShapeRefs: result.invalidRouteShapeRefs.sort(),
    invalidTspRefs: result.invalidTspRefs.sort(),
    invalidPublicAiNoteRefs: result.invalidPublicAiNoteRefs.sort(),
    excessPublicAiNoteDensityRefs: result.excessPublicAiNoteDensityRefs.sort(),
    invalidRouteSegmentEvidenceLaneRefs: result.invalidRouteSegmentEvidenceLaneRefs.sort(),
    invalidRouteSegmentEvidenceRouteShapeRefs:
      result.invalidRouteSegmentEvidenceRouteShapeRefs.sort(),
    invalidRouteSegmentEvidenceTspRefs: result.invalidRouteSegmentEvidenceTspRefs.sort(),
    invalidRouteSegmentEvidenceRiderDelayRefs:
      result.invalidRouteSegmentEvidenceRiderDelayRefs.sort(),
    invalidRouteSegmentCoverageRefs: result.invalidRouteSegmentCoverageRefs.sort(),
  };
}

function aggregateObserved(
  rows: readonly {
    month: string;
    runId: string;
    reliabilityStatus: "observed" | "insufficient_gtfs_rt_samples";
    sampleCount: number;
  }[],
): ObservedReliabilityByMonth[] {
  const byMonth = new Map<string, ObservedReliabilityByMonth>();
  for (const row of rows) {
    const entry = byMonth.get(row.month) ?? {
      month: row.month,
      runIds: [] as string[],
      routeCount: 0,
      observedRouteCount: 0,
      insufficientRouteCount: 0,
      sampleCount: 0,
    };
    if (!entry.runIds.includes(row.runId)) {
      entry.runIds.push(row.runId);
    }
    entry.routeCount += 1;
    if (row.reliabilityStatus === "observed") {
      entry.observedRouteCount += 1;
    } else {
      entry.insufficientRouteCount += 1;
    }
    entry.sampleCount += row.sampleCount;
    byMonth.set(row.month, entry);
  }
  return [...byMonth.values()]
    .map((entry) => ({ ...entry, runIds: entry.runIds.slice().sort() }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export type AuditStudioCoverageInputs = {
  local: { db: import("@bp/db/local").LocalPipelineDb };
  year: number;
  month: number;
  artifactRoot?: string | undefined;
  output?: string | undefined;
};

export async function auditStudioCoverage(
  inputs: AuditStudioCoverageInputs,
): Promise<StudioCoverageAuditResult> {
  const isoMonthValue = isoMonth(inputs.year, inputs.month);
  const artifactRoot = inputs.artifactRoot ?? defaultArtifactRootPath();
  const studioRoot = join(artifactRoot, "studio", "v1");
  const outputPath =
    inputs.output ??
    fromRepoRoot(join("data", "artifacts", "audits", `studio-coverage-${isoMonthValue}.json`));

  const local = inputs.local;
  const [catalog, briefSummaries, observedRows] = await Promise.all([
    listRouteCatalog(local.db),
    listRouteBriefSummaries(local.db, isoMonthValue),
    listRouteObservedReliabilitySummaries(local.db, isoMonthValue),
  ]);
  const publicRouteIds = new Set(
    briefSummaries.filter((entry) => entry.publicVisible).map((entry) => entry.routeId),
  );

  const [routesList, briefsList, findingsList, routeDirs, briefDirs, findingDirs] =
    await Promise.all([
      readJsonArray(join(studioRoot, "routes.json"), "routes"),
      readJsonArray(join(studioRoot, "briefs.json"), "briefs"),
      readJsonArray(join(studioRoot, "findings.json"), "findings"),
      listDirectoryEntries(join(studioRoot, "routes")),
      listDirectoryEntries(join(studioRoot, "briefs")),
      listDirectoryEntries(join(studioRoot, "findings")),
    ]);

  const projectionRouteIds = new Set(
    routesList
      .map((entry) => pickField(entry, "routeId"))
      .filter((id): id is string => id !== null),
  );
  const routesWithInvalidLaneCoverage = routesList
    .map((entry, index) => {
      const record =
        typeof entry === "object" && entry !== null
          ? (entry as {
              routeId?: unknown;
              laneCoverage?: unknown;
              laneCoverageSource?: unknown;
              laneTypes?: unknown;
              laneOperatingHours?: unknown;
              laneOperatingDays?: unknown;
            })
          : {};
      return hasDotRouteLaneCoverage(record)
        ? null
        : typeof record.routeId === "string"
          ? record.routeId
          : `routes:${index + 1}`;
    })
    .filter((id): id is string => id !== null)
    .sort();
  const routesWithInvalidTrendMonthLabels = routesList
    .map((entry, index) => {
      const record =
        typeof entry === "object" && entry !== null
          ? (entry as {
              routeId?: unknown;
              spark?: unknown;
              sparkMonths?: unknown;
              ridershipSpark?: unknown;
              ridershipSparkMonths?: unknown;
            })
          : {};
      return hasValidTrendMonthLabels(record)
        ? null
        : typeof record.routeId === "string"
          ? record.routeId
          : `routes:${index + 1}`;
    })
    .filter((id): id is string => id !== null)
    .sort();
  const routesWithInvalidRidershipProfile = routesList
    .map((entry, index) => {
      const record =
        typeof entry === "object" && entry !== null
          ? (entry as {
              routeId?: unknown;
              ridershipProfile?: unknown;
            })
          : {};
      return hasValidRidershipProfile(record)
        ? null
        : typeof record.routeId === "string"
          ? record.routeId
          : `routes:${index + 1}`;
    })
    .filter((id): id is string => id !== null)
    .sort();
  const projectionBriefRouteIds = new Set(
    briefsList
      .map((entry) => pickNestedField(entry, ["route", "routeId"]) ?? pickField(entry, "routeId"))
      .filter((id): id is string => id !== null),
  );
  const projectionFindingRouteIds = new Set(
    findingsList
      .map((entry) => pickNestedField(entry, ["route", "routeId"]) ?? pickField(entry, "routeId"))
      .filter((id): id is string => id !== null),
  );
  const findings = findingsList.map(findingRecord);
  const findingsWithReview = findings.map((finding, index) => ({
    id: findingId(finding, index),
    review: reviewRecord(finding),
  }));
  const findingsMissingReview = findingsWithReview
    .filter((finding) => finding.review === null)
    .map((finding) => finding.id);
  const reviewStateCounts = findingsWithReview.reduce(
    (counts, finding) => {
      const publicationState =
        finding.review === null ? null : stringValue(finding.review, "publicationState");
      if (publicationState === "reviewed") counts.reviewed += 1;
      else if (publicationState === "review_candidate") counts.reviewCandidate += 1;
      else if (publicationState === "generated_candidate") counts.generatedCandidate += 1;
      return counts;
    },
    { reviewed: 0, reviewCandidate: 0, generatedCandidate: 0 },
  );
  const detectorFindings = findingsWithReview.filter(
    (finding) =>
      finding.review !== null &&
      (stringValue(finding.review, "source") === "detector_review_queue" ||
        stringValue(finding.review, "source") === "promoted_finding"),
  );
  const reviewCandidatesMarkedApproved = findingsWithReview
    .filter(
      (finding) =>
        finding.review !== null &&
        stringValue(finding.review, "publicationState") === "review_candidate" &&
        stringValue(finding.review, "reviewState") === "approved",
    )
    .map((finding) => finding.id);
  const reviewedFindingsWithoutApproval = findingsWithReview
    .filter(
      (finding) =>
        finding.review !== null &&
        stringValue(finding.review, "publicationState") === "reviewed" &&
        stringValue(finding.review, "reviewState") !== "approved",
    )
    .map((finding) => finding.id);
  const detectorFindingsMissingRefs = detectorFindings
    .filter((finding) => {
      if (finding.review === null) return false;
      const source = stringValue(finding.review, "source");
      return (
        stringValue(finding.review, "candidateId") === null ||
        stringValue(finding.review, "detectorId") === null ||
        (source === "promoted_finding" &&
          (stringValue(finding.review, "promotedFindingId") === null ||
            stringValue(finding.review, "decisionId") === null ||
            stringValue(finding.review, "packetId") === null ||
            (stringArrayValue(finding.review, "approvedEvidenceRefs")?.length ?? 0) === 0 ||
            stringValue(finding.review, "decisionHash") === null ||
            stringValue(finding.review, "candidateSnapshotHash") === null ||
            stringValue(finding.review, "promotedFindingHash") === null))
      );
    })
    .map((finding) => finding.id);

  const routesMissingFromProjection = [...publicRouteIds]
    .filter((routeId) => !projectionRouteIds.has(routeId))
    .sort();
  const briefsMissingFromProjection = [...publicRouteIds]
    .filter((routeId) => !projectionBriefRouteIds.has(routeId))
    .sort();
  const coveredPublicRouteCount = [...publicRouteIds].filter((routeId) =>
    projectionRouteIds.has(routeId),
  ).length;
  const coveredPublicBriefCount = [...publicRouteIds].filter((routeId) =>
    projectionBriefRouteIds.has(routeId),
  ).length;

  const studioRouteCoverageShare =
    publicRouteIds.size === 0
      ? 1
      : Number((coveredPublicRouteCount / publicRouteIds.size).toFixed(4));
  const studioBriefCoverageShare =
    publicRouteIds.size === 0
      ? 1
      : Number((coveredPublicBriefCount / publicRouteIds.size).toFixed(4));
  const studioFindingCoverageShare =
    publicRouteIds.size === 0
      ? 0
      : Number((projectionFindingRouteIds.size / publicRouteIds.size).toFixed(4));

  const [briefEvidenceDetailCount, briefHistoryDetailCount] = await Promise.all([
    Promise.all(
      briefDirs.map((dir) => fileExists(join(studioRoot, "briefs", dir, "evidence.json"))),
    ).then((results) => results.filter(Boolean).length),
    Promise.all(
      briefDirs.map((dir) => fileExists(join(studioRoot, "briefs", dir, "history.json"))),
    ).then((results) => results.filter(Boolean).length),
  ]);
  const [routeBriefInputs, projectionSegmentHours, evidenceCatalogAudit, presentationScan] =
    await Promise.all([
      auditRouteBriefInputHourlyBins({
        artifactRoot,
        isoMonth: isoMonthValue,
        routeIds: [...publicRouteIds].sort(),
      }),
      auditProjectionSegmentHourBins({
        studioRoot,
        routeDirs,
      }),
      auditEvidenceCatalog(studioRoot),
      auditGeneratedArtifactPresentationText(studioRoot),
    ]);
  const hasRouteBriefInputGaps =
    routeBriefInputs.routesMissingBriefInput.length > 0 ||
    routeBriefInputs.routesMissingScheduleComparisons.length > 0 ||
    routeBriefInputs.routesWithSegmentsMissingScheduleComparisons.length > 0 ||
    routeBriefInputs.routesWithIncompleteScheduleComparisons.length > 0 ||
    routeBriefInputs.routesWithMissingRidershipExposure.length > 0 ||
    routeBriefInputs.routesWithMissingHourlyBins.length > 0 ||
    routeBriefInputs.routesWithLegacyHourlyBins.length > 0 ||
    projectionSegmentHours.segmentsWithInvalidHourBins > 0 ||
    routesWithInvalidLaneCoverage.length > 0 ||
    routesWithInvalidTrendMonthLabels.length > 0 ||
    routesWithInvalidRidershipProfile.length > 0 ||
    projectionSegmentHours.segmentsWithInvalidLaneGeometry > 0 ||
    projectionSegmentHours.segmentsWithInvalidRouteShapeGeometry > 0 ||
    projectionSegmentHours.segmentsWithInvalidTspEvidence > 0 ||
    projectionSegmentHours.segmentsWithInvalidPublicAiNotes > 0 ||
    projectionSegmentHours.routeDetailsWithExcessPublicAiNoteDensity > 0 ||
    projectionSegmentHours.routeDetailsWithInvalidRidershipProfile > 0 ||
    projectionSegmentHours.routeSegmentEvidenceWithInvalidLaneGeometry > 0 ||
    projectionSegmentHours.routeSegmentEvidenceWithInvalidRouteShapeGeometry > 0 ||
    projectionSegmentHours.routeSegmentEvidenceWithInvalidTspEvidence > 0 ||
    projectionSegmentHours.routeSegmentEvidenceWithInvalidRiderDelay > 0 ||
    projectionSegmentHours.routeSegmentResponsesWithInvalidCoverageMetadata > 0 ||
    evidenceCatalogAudit.evidenceCatalogInvalidItemCount > 0 ||
    presentationScan.generatedArtifactPresentationViolationCount > 0;

  const status: StudioCoverageAuditResult["status"] =
    studioRouteCoverageShare < 0.5 || studioBriefCoverageShare < 0.5 || hasRouteBriefInputGaps
      ? "fail"
      : routesMissingFromProjection.length > 0 ||
          briefsMissingFromProjection.length > 0 ||
          findingsMissingReview.length > 0 ||
          reviewStateCounts.generatedCandidate > 0 ||
          reviewCandidatesMarkedApproved.length > 0 ||
          reviewedFindingsWithoutApproval.length > 0 ||
          detectorFindingsMissingRefs.length > 0
        ? "warn"
        : "pass";

  const result: StudioCoverageAuditResult = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    isoMonth: isoMonthValue,
    status,
    d1: {
      routeCatalogCount: catalog.length,
      routeBriefSummaryCount: briefSummaries.length,
      publicRouteBriefSummaryCount: publicRouteIds.size,
      observedReliability: aggregateObserved(observedRows),
    },
    projection: {
      routesListCount: routesList.length,
      routesListWithDotLaneCoverage: routesList.length - routesWithInvalidLaneCoverage.length,
      routesListWithInvalidLaneCoverage: routesWithInvalidLaneCoverage.length,
      routesListWithTrendMonthLabels:
        routesList.length - routesWithInvalidTrendMonthLabels.length,
      routesListWithInvalidTrendMonthLabels: routesWithInvalidTrendMonthLabels.length,
      routesListWithRidershipProfile:
        routesList.length - routesWithInvalidRidershipProfile.length,
      routesListWithInvalidRidershipProfile: routesWithInvalidRidershipProfile.length,
      routeDetailCount: routeDirs.length,
      routeDetailSegmentCount: projectionSegmentHours.segmentCount,
      routeDetailSegmentsWith24HourBins: projectionSegmentHours.segmentsWith24HourBins,
      routeDetailSegmentsWithInvalidHourBins: projectionSegmentHours.segmentsWithInvalidHourBins,
      routeDetailSegmentsWithDotLaneGeometry: projectionSegmentHours.segmentsWithDotLaneGeometry,
      routeDetailSegmentsWithInvalidLaneGeometry:
        projectionSegmentHours.segmentsWithInvalidLaneGeometry,
      routeDetailSegmentsWithRouteShapeGeometry:
        projectionSegmentHours.segmentsWithRouteShapeGeometry,
      routeDetailSegmentsWithInvalidRouteShapeGeometry:
        projectionSegmentHours.segmentsWithInvalidRouteShapeGeometry,
      routeDetailSegmentsWithTspSourceEvidence:
        projectionSegmentHours.segmentsWithTspSourceEvidence,
      routeDetailSegmentsWithInvalidTspEvidence:
        projectionSegmentHours.segmentsWithInvalidTspEvidence,
      routeDetailSegmentsWithPublicAiNotes: projectionSegmentHours.segmentsWithPublicAiNotes,
      routeDetailSegmentsWithInvalidPublicAiNotes:
        projectionSegmentHours.segmentsWithInvalidPublicAiNotes,
      routeDetailsWithExcessPublicAiNoteDensity:
        projectionSegmentHours.routeDetailsWithExcessPublicAiNoteDensity,
      routeDetailsWithRidershipProfile: projectionSegmentHours.routeDetailsWithRidershipProfile,
      routeDetailsWithInvalidRidershipProfile:
        projectionSegmentHours.routeDetailsWithInvalidRidershipProfile,
      routeSegmentEvidenceCount: projectionSegmentHours.routeSegmentEvidenceCount,
      routeSegmentEvidenceWithDotLaneGeometry:
        projectionSegmentHours.routeSegmentEvidenceWithDotLaneGeometry,
      routeSegmentEvidenceWithInvalidLaneGeometry:
        projectionSegmentHours.routeSegmentEvidenceWithInvalidLaneGeometry,
      routeSegmentEvidenceWithRouteShapeGeometry:
        projectionSegmentHours.routeSegmentEvidenceWithRouteShapeGeometry,
      routeSegmentEvidenceWithInvalidRouteShapeGeometry:
        projectionSegmentHours.routeSegmentEvidenceWithInvalidRouteShapeGeometry,
      routeSegmentEvidenceWithTspSourceEvidence:
        projectionSegmentHours.routeSegmentEvidenceWithTspSourceEvidence,
      routeSegmentEvidenceWithInvalidTspEvidence:
        projectionSegmentHours.routeSegmentEvidenceWithInvalidTspEvidence,
      routeSegmentEvidenceWithCompleteRiderDelay:
        projectionSegmentHours.routeSegmentEvidenceWithCompleteRiderDelay,
      routeSegmentEvidenceWithInvalidRiderDelay:
        projectionSegmentHours.routeSegmentEvidenceWithInvalidRiderDelay,
      routeSegmentResponsesWithCoverageMetadata:
        projectionSegmentHours.routeSegmentResponsesWithCoverageMetadata,
      routeSegmentResponsesWithInvalidCoverageMetadata:
        projectionSegmentHours.routeSegmentResponsesWithInvalidCoverageMetadata,
      briefsListCount: briefsList.length,
      briefDetailCount: briefDirs.length,
      briefEvidenceDetailCount,
      briefHistoryDetailCount,
      findingsListCount: findingsList.length,
      findingDetailCount: findingDirs.length,
      reviewedFindingCount: reviewStateCounts.reviewed,
      reviewCandidateFindingCount: reviewStateCounts.reviewCandidate,
      generatedCandidateFindingCount: reviewStateCounts.generatedCandidate,
      findingsMissingReviewCount: findingsMissingReview.length,
      detectorFindingCount: detectorFindings.length,
      evidenceCatalogItemCount: evidenceCatalogAudit.evidenceCatalogItemCount,
      evidenceCatalogInvalidItemCount: evidenceCatalogAudit.evidenceCatalogInvalidItemCount,
      generatedArtifactPresentationViolationCount:
        presentationScan.generatedArtifactPresentationViolationCount,
    },
    routeBriefInputs,
    gaps: {
      routesMissingFromProjection,
      routesWithInvalidLaneCoverage,
      routesWithInvalidTrendMonthLabels,
      routesWithInvalidRidershipProfile,
      briefsMissingFromProjection,
      routesMissingRouteBriefInput: routeBriefInputs.routesMissingBriefInput,
      routesMissingScheduleComparisons: routeBriefInputs.routesMissingScheduleComparisons,
      routesWithSegmentsMissingScheduleComparisons:
        routeBriefInputs.routesWithSegmentsMissingScheduleComparisons,
      routesWithIncompleteScheduleComparisons:
        routeBriefInputs.routesWithIncompleteScheduleComparisons,
      routesWithMissingRidershipExposure: routeBriefInputs.routesWithMissingRidershipExposure,
      routesWithMissingHourlyBins: routeBriefInputs.routesWithMissingHourlyBins,
      routesWithLegacyHourlyBins: routeBriefInputs.routesWithLegacyHourlyBins,
      routeDetailSegmentsWithInvalidHourBins: projectionSegmentHours.invalidSegmentRefs,
      routeDetailSegmentsWithInvalidLaneGeometry: projectionSegmentHours.invalidLaneRefs,
      routeDetailSegmentsWithInvalidRouteShapeGeometry:
        projectionSegmentHours.invalidRouteShapeRefs,
      routeDetailSegmentsWithInvalidTspEvidence: projectionSegmentHours.invalidTspRefs,
      routeDetailSegmentsWithInvalidPublicAiNotes: projectionSegmentHours.invalidPublicAiNoteRefs,
      routeDetailsWithExcessPublicAiNoteDensity:
        projectionSegmentHours.excessPublicAiNoteDensityRefs,
      routeDetailsWithInvalidRidershipProfile:
        projectionSegmentHours.invalidRouteDetailRidershipProfileRefs,
      routeSegmentEvidenceWithInvalidLaneGeometry:
        projectionSegmentHours.invalidRouteSegmentEvidenceLaneRefs,
      routeSegmentEvidenceWithInvalidRouteShapeGeometry:
        projectionSegmentHours.invalidRouteSegmentEvidenceRouteShapeRefs,
      routeSegmentEvidenceWithInvalidTspEvidence:
        projectionSegmentHours.invalidRouteSegmentEvidenceTspRefs,
      routeSegmentEvidenceWithInvalidRiderDelay:
        projectionSegmentHours.invalidRouteSegmentEvidenceRiderDelayRefs,
      routeSegmentResponsesWithInvalidCoverageMetadata:
        projectionSegmentHours.invalidRouteSegmentCoverageRefs,
      findingsMissingReview,
      reviewCandidatesMarkedApproved,
      reviewedFindingsWithoutApproval,
      detectorFindingsMissingRefs,
      evidenceCatalogInvalidItems: evidenceCatalogAudit.invalidEvidenceCatalogRefs,
      generatedArtifactPresentationViolations:
        presentationScan.generatedArtifactPresentationViolations,
      studioRouteCoverageShare,
      studioBriefCoverageShare,
      findingRouteCount: projectionFindingRouteIds.size,
      studioFindingCoverageShare,
      note: "Studio route and brief coverage are measured against public-visible route_brief_summary rows, not every route_catalog row. Findings are thresholded candidate outputs, so finding coverage is reported but not required to reach every route. Route brief inputs must include complete schedule comparisons, ridership exposure, and 24 observed hourly slow-window bins for every public route segment before the release can pass. Route list/detail/segment projections must carry DOT bus-lane geometry, source-month labels for speed/ridership sparklines, route-level hourly ridership profiles, route-shape LineStrings, TSP source-status evidence, complete delay-exposure evidence, explicit route-segment coverage blocker metadata, optional sparse public AI notes with only body/source/generationMode, unique stable evidence catalog IDs with source refs and immutable artifact href/hash metadata, and no retired synthetic/proxy presentation phrases in generated JSON artifacts.",
    },
    outputPath,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, result);
  return result;
}

export default defineCommand({
  path: ["audit", "studio-coverage"],
  summary: "Audit Studio projection vs DB coverage and write a JSON report.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
      output: z.string().optional().describe("Override output path for audit JSON"),
    }),
  },
  middleware: [withLocalDb()],
  output: z.object({
    status: z.enum(["pass", "warn", "fail"]),
    isoMonth: z.string(),
    outputPath: z.string(),
  }).passthrough(),
  async run({ ctx, input }) {
    return auditStudioCoverage({
      local: localDbFromCtx(ctx),
      year: input.options.year,
      month: input.options.month,
      artifactRoot:
        input.options.artifactRoot === undefined
          ? undefined
          : fromCliPath(input.options.artifactRoot),
      output: input.options.output === undefined ? undefined : fromCliPath(input.options.output),
    });
  },
});
