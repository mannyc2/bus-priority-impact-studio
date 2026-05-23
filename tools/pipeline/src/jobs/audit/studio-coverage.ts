import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  listRouteBriefSummaries,
  listRouteCatalog,
  listRouteObservedReliabilitySummaries,
} from "@bp/db/local";
import { writeJson } from "../../lib/json.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { defaultArtifactRootPath, fromCliPath, fromRepoRoot } from "../../lib/paths.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";

type StudioCoverageAuditArgs = {
  year?: number;
  month?: number;
  dbPath?: string;
  artifactRoot?: string;
  output?: string;
};

type ObservedReliabilityByMonth = {
  month: string;
  runIds: string[];
  routeCount: number;
  observedRouteCount: number;
  insufficientRouteCount: number;
  sampleCount: number;
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
    routeDetailCount: number;
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
  };
  gaps: {
    routesMissingFromProjection: string[];
    briefsMissingFromProjection: string[];
    findingsMissingReview: string[];
    reviewCandidatesMarkedApproved: string[];
    reviewedFindingsWithoutApproval: string[];
    detectorFindingsMissingRefs: string[];
    studioRouteCoverageShare: number;
    studioBriefCoverageShare: number;
    findingRouteCount: number;
    studioFindingCoverageShare: number;
    note: string;
  };
  outputPath: string;
};

function parseCliArgs(args: string[]): StudioCoverageAuditArgs {
  return parseMonthDbCliArgs(args, {} as StudioCoverageAuditArgs, [
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.artifactRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.output = fromCliPath(value);
        }
      },
    },
  ]);
}

async function listDirectoryEntries(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
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

function findingId(finding: Record<string, unknown>, fallback: number): string {
  return stringValue(finding, "id") ?? `finding:${fallback + 1}`;
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

export async function auditStudioCoverage(
  args: StudioCoverageAuditArgs = {},
): Promise<StudioCoverageAuditResult> {
  const { isoMonth } = createMonthContext(args);
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const studioRoot = join(artifactRoot, "studio", "v1");
  const outputPath =
    args.output ??
    fromRepoRoot(join("data", "artifacts", "audits", `studio-coverage-${isoMonth}.json`));

  return withLocalPipelineDb(args.dbPath, async (local) => {
    const [catalog, briefSummaries, observedRows] = await Promise.all([
      listRouteCatalog(local.db),
      listRouteBriefSummaries(local.db, isoMonth),
      listRouteObservedReliabilitySummaries(local.db, isoMonth),
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
        stringValue(finding.review, "source") === "detector_review_queue",
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
      .filter(
        (finding) =>
          finding.review !== null &&
          (stringValue(finding.review, "candidateId") === null ||
            stringValue(finding.review, "detectorId") === null),
      )
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

    const status: StudioCoverageAuditResult["status"] =
      studioRouteCoverageShare < 0.5 || studioBriefCoverageShare < 0.5
        ? "fail"
        : routesMissingFromProjection.length > 0 ||
            briefsMissingFromProjection.length > 0 ||
            findingsMissingReview.length > 0 ||
            reviewCandidatesMarkedApproved.length > 0 ||
            reviewedFindingsWithoutApproval.length > 0 ||
            detectorFindingsMissingRefs.length > 0
          ? "warn"
          : "pass";

    const result: StudioCoverageAuditResult = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      isoMonth,
      status,
      d1: {
        routeCatalogCount: catalog.length,
        routeBriefSummaryCount: briefSummaries.length,
        publicRouteBriefSummaryCount: publicRouteIds.size,
        observedReliability: aggregateObserved(observedRows),
      },
      projection: {
        routesListCount: routesList.length,
        routeDetailCount: routeDirs.length,
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
      },
      gaps: {
        routesMissingFromProjection,
        briefsMissingFromProjection,
        findingsMissingReview,
        reviewCandidatesMarkedApproved,
        reviewedFindingsWithoutApproval,
        detectorFindingsMissingRefs,
        studioRouteCoverageShare,
        studioBriefCoverageShare,
        findingRouteCount: projectionFindingRouteIds.size,
        studioFindingCoverageShare,
        note: "Studio route and brief coverage are measured against public-visible route_brief_summary rows, not every route_catalog row. Findings are thresholded candidate outputs, so finding coverage is reported but not required to reach every route.",
      },
      outputPath,
    };

    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, result);
    return result;
  });
}

export async function auditStudioCoverageFromCli(
  args: string[],
): Promise<StudioCoverageAuditResult> {
  return auditStudioCoverage(parseCliArgs(args));
}
