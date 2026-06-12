import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  auditProjectionSegmentHourBins,
  auditRouteBriefInputHourlyBins,
  hasDotRouteLaneCoverage,
  hasValidRidershipProfile,
  hasValidTrendMonthLabels,
  type RouteBriefInputHourlyBins,
} from "@bp/applied-research/evaluation";
import {
  listRouteBriefSummaries,
  listRouteCatalog,
  listRouteObservedReliabilitySummaries,
} from "@bp/db/local";
import { arg, defineCommand, z } from "@liche/core";
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
    d1RouteAddressabilityShare: number;
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
  const d1RouteAddressabilityShare =
    publicRouteIds.size === 0
      ? 0
      : Number(Math.min(1, catalog.length / publicRouteIds.size).toFixed(4));

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
  const hasMandatoryServingGaps =
    publicRouteIds.size === 0 ||
    d1RouteAddressabilityShare < 1 ||
    routeBriefInputs.routesMissingBriefInput.length > 0 ||
    routeBriefInputs.routesMissingScheduleComparisons.length > 0 ||
    routeBriefInputs.routesWithSegmentsMissingScheduleComparisons.length > 0 ||
    routeBriefInputs.routesWithIncompleteScheduleComparisons.length > 0 ||
    routeBriefInputs.routesWithMissingRidershipExposure.length > 0 ||
    routeBriefInputs.routesWithMissingHourlyBins.length > 0 ||
    routeBriefInputs.routesWithLegacyHourlyBins.length > 0 ||
    routesWithInvalidLaneCoverage.length > 0 ||
    routesWithInvalidTrendMonthLabels.length > 0 ||
    routesWithInvalidRidershipProfile.length > 0 ||
    projectionSegmentHours.routeSegmentEvidenceWithInvalidLaneGeometry > 0 ||
    projectionSegmentHours.routeSegmentEvidenceWithInvalidRouteShapeGeometry > 0 ||
    projectionSegmentHours.routeSegmentEvidenceWithInvalidTspEvidence > 0 ||
    projectionSegmentHours.routeSegmentEvidenceWithInvalidRiderDelay > 0 ||
    projectionSegmentHours.routeSegmentResponsesWithInvalidCoverageMetadata > 0 ||
    evidenceCatalogAudit.evidenceCatalogInvalidItemCount > 0 ||
    presentationScan.generatedArtifactPresentationViolationCount > 0;
  const hasLegacyRouteDetailProjectionGaps =
    projectionSegmentHours.segmentsWithInvalidHourBins > 0 ||
    projectionSegmentHours.segmentsWithInvalidLaneGeometry > 0 ||
    projectionSegmentHours.segmentsWithInvalidRouteShapeGeometry > 0 ||
    projectionSegmentHours.segmentsWithInvalidTspEvidence > 0 ||
    projectionSegmentHours.segmentsWithInvalidPublicAiNotes > 0 ||
    projectionSegmentHours.routeDetailsWithExcessPublicAiNoteDensity > 0 ||
    projectionSegmentHours.routeDetailsWithInvalidRidershipProfile > 0;

  const status: StudioCoverageAuditResult["status"] = hasMandatoryServingGaps
    ? "fail"
    : routesMissingFromProjection.length > 0 ||
        briefsMissingFromProjection.length > 0 ||
        studioRouteCoverageShare < 0.5 ||
        studioBriefCoverageShare < 0.5 ||
        hasLegacyRouteDetailProjectionGaps ||
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
      routesListWithTrendMonthLabels: routesList.length - routesWithInvalidTrendMonthLabels.length,
      routesListWithInvalidTrendMonthLabels: routesWithInvalidTrendMonthLabels.length,
      routesListWithRidershipProfile: routesList.length - routesWithInvalidRidershipProfile.length,
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
      d1RouteAddressabilityShare,
      studioRouteCoverageShare,
      studioBriefCoverageShare,
      findingRouteCount: projectionFindingRouteIds.size,
      studioFindingCoverageShare,
      note: "D1 route addressability is the public /api/v1/studio/routes fail gate; legacy studio/v1 route and brief projection coverage is retained as an artifact-depth warning because sparse routes now return D1-backed partial detail with surface flags. Findings are thresholded candidate outputs, so finding coverage is reported but not required to reach every route. Route brief inputs must include complete schedule comparisons, ridership exposure, and 24 observed hourly slow-window bins for every public route segment before the release can pass. Route segment evidence projections must carry DOT bus-lane geometry, route-shape LineStrings, TSP source-status evidence, complete delay-exposure evidence, explicit route-segment coverage blocker metadata, unique stable evidence catalog IDs with source refs and immutable artifact href/hash metadata, and no retired synthetic/proxy presentation phrases in generated JSON artifacts. Legacy route detail projection geometry, public-AI-note, and route-level ridership-profile gaps are warnings until the v1 curated route-detail artifacts are rebuilt from the v2 serving surfaces.",
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
  middleware: [withLocalDb({ readonly: true })],
  output: z
    .object({
      status: z.enum(["pass", "warn", "fail"]),
      isoMonth: z.string(),
      outputPath: z.string(),
    })
    .passthrough(),
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
