import { Database } from "bun:sqlite";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { defineCommand, z } from "@liche/core";
import {
  listRouteArtifacts,
  listRouteBriefSummaries,
  listRouteInterventionComparisons,
  listRouteMonthTrends,
  listRouteObservedReliabilitySummaries,
  listRouteReadiness,
  type RouteBriefSummary,
  type RouteInterventionComparison,
  type RouteMonthTrend,
} from "@bp/db";
import { createBunSqliteServingDb } from "@bp/db/d1/bun-sqlite";
import {
  buildStudioBriefEvidenceProjection,
  buildStudioBriefHistoryProjection,
  buildStudioBriefProjection,
  buildStudioBriefsProjection,
  buildStudioCohortCatalogProjection,
  buildStudioDocsProjection,
  buildStudioEvidenceCatalogProjection,
  buildStudioFindingProjection,
  buildStudioFindingsProjection,
  buildStudioMethodsProjection,
  buildStudioRouteLadderProjection,
  buildStudioRouteProjection,
  buildStudioRouteSegmentsProjection,
  buildStudioRoutesProjection,
  type StudioAiPublicNote,
  type StudioIntervention,
  type StudioReleasePayload,
  StudioReleasePayloadSchema,
} from "@bp/domain";
import {
  normalizeHourlyRidershipRows,
  normalizeScheduleTimepointRows,
  normalizeSegmentSpeedRows,
} from "@bp/sources";
import { buildSourceCoverageLedger } from "../audit/source-coverage.ts";
import { buildRouteBriefSegmentUniverse } from "../route/brief-model.ts";
import {
  defaultLocalPipelineDbPath,
  openLocalPipelineDb,
} from "../../lib/local-db.ts";
import { fromCliPath, fromRepoRoot } from "../../lib/paths.ts";
import {
  readJsonIfExists,
  routeGeometryIndex,
  segmentLaneOverlapIndex,
  tspEvidenceIndex,
  unknownTspEvidence,
} from "./_release-geometry.ts";
import {
  buildSegmentAnalystNote,
  buildRouteSegmentEvidence,
  buildSegments,
  enhanceSegmentAiNotesWithLlm,
  withSparsePublicSegmentNotes,
} from "./_release-segments.ts";
import {
  buildRoute,
  buildRouteArtifactRef,
  descriptivePeerSlugsForSummaries,
  qualityCaveats,
  routeKey,
  speedPercentileContext,
  speedPercentilesForSummaries,
} from "./_release-routes.ts";
import {
  buildRouteInterventions,
  manualInterventionIndex,
  tier2DocumentChunkIndex,
} from "./_release-interventions.ts";
import {
  addFindingContextAppendix,
  buildReviewedFinding,
  readDetectorFindingsFromReviewQueue,
  readPromotedFindingsFromArtifact,
} from "./_release-findings.ts";
import {
  assertGeneratedBriefReferenceIntegrity,
  buildBrief,
  docsSections,
  docsSourceFromGeneratedReleaseSource,
  docsSourceFromLedgerEntry,
  methodDatasetsFromDocsSources,
} from "./_release-briefs.ts";
import { assertRouteGeometryCoverage } from "./_release-geometry.ts";
import type {
  CliOptions,
  FindingContextAppendixArtifact,
  RawSourceSnapshot,
  ReleaseProfile,
  RouteBriefInputArtifact,
  SegmentAnalystNotesArtifact,
  SegmentNoteLlmOptions,
  StudioRoute,
  StudioSegment,
  Tier2ManualInterventionCandidatesArtifact,
} from "./_release-types.ts";
import type { SocrataRow } from "@bp/sources";

const defaultMonth = "2026-03";
const defaultOutputPath = "data/artifacts/studio/v1/release.json";
const defaultSchemaPath = "data/exports/d1/2026-03/schema.sql";
const defaultSeedPath = "data/exports/d1/2026-03/seed.sql";
const defaultRouteSliceArtifactsRoot = "data/artifacts/route-slices";
const defaultRouteSliceRawRoot = "data/raw/route-slices";
const defaultRouteShapeSnapshotPath = "data/raw/network/current_bus_routes.json";
const defaultStopSnapshotPath = "data/raw/network/current_bus_stops.json";
const defaultTspSourcePath =
  "data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/sources/nyc_dot_tsp_status_2017";
const defaultTier2DocumentChunksPath =
  "data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/document-chunks.json";
const defaultManualInterventionsPath =
  "data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/manual-intervention-candidates.json";
const defaultSegmentNoteModel = "qwen/qwen3.7-max";
const defaultSegmentNoteLlmLimit = 8;
const defaultSegmentNoteLlmTimeoutMs = 60_000;
const defaultSegmentNoteLlmAttempts = 2;
const defaultRouteLimit = 12;
const defaultFindingLimit = 50;
const canonicalRouteIds = [
  "M15+",
  "BX12+",
  "B25",
  "BX41",
  "M101",
  "B41",
  "B46+",
  "Q58",
  "M14A+",
  "M14D+",
];

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function createServingDbFromExport(schemaPath: string, seedPath: string) {
  const sqlite = new Database(":memory:");
  sqlite.exec(await readFile(schemaPath, "utf8"));
  sqlite.exec(await readFile(seedPath, "utf8"));

  return {
    sqlite,
    db: createBunSqliteServingDb(sqlite),
  };
}

async function rawRouteSliceRows(
  routeId: string,
  month: string,
  filename: string,
  routeSliceRawRoot: string,
): Promise<SocrataRow[] | null> {
  const slug = routeId.toLowerCase();
  const path = fromRepoRoot(join(routeSliceRawRoot, `${slug}-${month}`, filename));
  const snapshot = await readJsonIfExists<RawSourceSnapshot>(path);
  return Array.isArray(snapshot?.rows) ? snapshot.rows : null;
}

async function augmentRouteBriefInputFromRaw(
  routeId: string,
  month: string,
  artifact: RouteBriefInputArtifact | null,
  routeSliceRawRoot: string,
): Promise<RouteBriefInputArtifact | null> {
  if (artifact === null || (artifact.segments?.length ?? 0) > 0) {
    return artifact;
  }

  const [speedRows, ridershipRows, scheduleRows] = await Promise.all([
    rawRouteSliceRows(routeId, month, "bus_segment_speeds_2025.json", routeSliceRawRoot),
    rawRouteSliceRows(routeId, month, "bus_hourly_ridership_2025.json", routeSliceRawRoot),
    rawRouteSliceRows(routeId, month, "bus_schedules_2026.json", routeSliceRawRoot),
  ]);
  if (speedRows === null || ridershipRows === null || scheduleRows === null) {
    return artifact;
  }

  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber)) {
    return artifact;
  }

  const universe = buildRouteBriefSegmentUniverse({
    speedRows: normalizeSegmentSpeedRows(speedRows),
    ridershipRows: normalizeHourlyRidershipRows(ridershipRows, {
      routeId,
      year,
      month: monthNumber,
    }),
    schedules: normalizeScheduleTimepointRows(scheduleRows).map((row) => ({
      ...row,
      isoMonth: month,
    })),
    year,
    month: monthNumber,
  });

  return {
    ...artifact,
    analysisPeriod: artifact.analysisPeriod ?? month,
    metrics: {
      ...artifact.metrics,
      segmentCount: universe.segmentUniverse.segmentCount,
      scheduledPairCount: universe.scheduledPairCount,
      scheduleMatchedHotspotCount: universe.matchedSegmentCount,
    },
    segmentUniverse: universe.segmentUniverse,
    segments: universe.segments as NonNullable<RouteBriefInputArtifact["segments"]>,
    scheduleComparisons: universe.scheduleComparisons as NonNullable<
      RouteBriefInputArtifact["scheduleComparisons"]
    >,
    caveats: [...(artifact.caveats ?? []), ...universe.segmentUniverse.caveats],
  };
}

async function routeBriefInput(
  routeId: string,
  month: string,
  routeSliceArtifactsRoot: string,
  routeSliceRawRoot: string,
): Promise<RouteBriefInputArtifact | null> {
  const slug = routeId.toLowerCase();
  const path = fromRepoRoot(
    join(routeSliceArtifactsRoot, `${slug}-${month}`, "route-brief-input.json"),
  );
  const artifact = await readJsonIfExists<RouteBriefInputArtifact>(path);
  return augmentRouteBriefInputFromRaw(routeId, month, artifact, routeSliceRawRoot);
}

async function routeBriefInputs(
  routeId: string,
  month: string,
  routeSliceArtifactsRoot: string,
  routeSliceRawRoot: string,
): Promise<RouteBriefInputArtifact[]> {
  const slug = routeId.toLowerCase();
  const root = fromRepoRoot(routeSliceArtifactsRoot);
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const matchedMonths = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .flatMap((name) => {
      const prefix = `${slug}-`;
      if (!name.startsWith(prefix)) return [];
      const candidate = name.slice(prefix.length);
      return /^\d{4}-\d{2}$/.test(candidate) ? [candidate] : [];
    })
    .sort();
  const months = matchedMonths.length === 0 ? [month] : matchedMonths;
  const artifacts = await Promise.all(
    months.map((candidate) =>
      routeBriefInput(routeId, candidate, routeSliceArtifactsRoot, routeSliceRawRoot),
    ),
  );
  return artifacts.flatMap((artifact) => (artifact === null ? [] : [artifact]));
}

async function buildRelease(options: CliOptions): Promise<StudioReleasePayload> {
  const { sqlite, db } = await createServingDbFromExport(
    fromRepoRoot(options.schemaPath),
    fromRepoRoot(options.seedPath),
  );

  try {
    const [
      readinessRows,
      briefSummaries,
      observedRows,
      routeArtifactRows,
      interventionComparisonRows,
    ] = await Promise.all([
      listRouteReadiness(db, options.month),
      listRouteBriefSummaries(db, options.month),
      listRouteObservedReliabilitySummaries(db, options.month),
      listRouteArtifacts(db, options.month),
      listRouteInterventionComparisons(db, options.month),
    ]);
    const readinessByRoute = new Map(readinessRows.map((row) => [row.routeId, row]));
    const summariesByRoute = new Map(
      briefSummaries.map((summary: RouteBriefSummary) => [summary.routeId, summary]),
    );
    const observedByRoute = new Map(observedRows.map((row) => [row.routeId, row]));
    const interventionsByRoute = new Map<string, RouteInterventionComparison[]>();
    for (const comparison of interventionComparisonRows) {
      const group = interventionsByRoute.get(comparison.routeId) ?? [];
      group.push(comparison);
      interventionsByRoute.set(comparison.routeId, group);
    }
    const requiredSummaries = canonicalRouteIds.flatMap((routeId) => {
      const summary = summariesByRoute.get(routeId);
      return summary === undefined ? [] : [summary];
    });
    const orderedSummaries = [
      ...requiredSummaries,
      ...briefSummaries.filter(
        (summary) => !requiredSummaries.some((required) => required.routeId === summary.routeId),
      ),
    ];
    const selectedSummaries =
      options.profile === "full"
        ? orderedSummaries
        : orderedSummaries.slice(0, Math.max(options.routeLimit, requiredSummaries.length));
    const speedPercentiles = speedPercentilesForSummaries(orderedSummaries, readinessByRoute);
    const descriptivePeerSlugs = descriptivePeerSlugsForSummaries(
      selectedSummaries,
      readinessByRoute,
    );
    const routeGeometry = await routeGeometryIndex(
      options.routeShapeSnapshotPath,
      options.stopSnapshotPath,
      options.localDbPath,
    );
    const tspEvidenceByRoute = await tspEvidenceIndex(options.tspSourcePath);
    const sourceCoverageDocsSources = await (async () => {
      const local = await openLocalPipelineDb(options.localDbPath);
      try {
        return buildSourceCoverageLedger({
          sqlite: local.sqlite,
          month: options.month,
          dbPath: local.path,
        }).sources.map(docsSourceFromLedgerEntry);
      } finally {
        local.sqlite.close();
      }
    })();
    const selectedRouteIds = new Set(selectedSummaries.map((summary) => summary.routeId));
    assertRouteGeometryCoverage(
      selectedSummaries.flatMap((summary) =>
        readinessByRoute.has(summary.routeId) ? [summary.routeId] : [],
      ),
      routeGeometry,
    );
    const routeArtifacts = routeArtifactRows
      .filter((row) => selectedRouteIds.has(row.route_id))
      .map(buildRouteArtifactRef);
    const routeInputs = new Map<string, RouteBriefInputArtifact | null>();
    const routeInputsByRoute = new Map<string, RouteBriefInputArtifact[]>();

    for (const summary of selectedSummaries) {
      const inputs = await routeBriefInputs(
        summary.routeId,
        options.month,
        options.routeSliceArtifactsRoot,
        options.routeSliceRawRoot,
      );
      const currentInput =
        inputs.find((input) => (input.analysisPeriod ?? options.month) === options.month) ??
        inputs[0] ??
        null;
      routeInputsByRoute.set(summary.routeId, inputs);
      routeInputs.set(summary.routeId, currentInput);
    }
    const segmentLaneOverlaps = await segmentLaneOverlapIndex({
      localDbPath: options.localDbPath,
      isoMonth: options.month,
      routeShapeSnapshotPath: options.routeShapeSnapshotPath,
      stopSnapshotPath: options.stopSnapshotPath,
      routeInputs,
    });
    const routeTrends = new Map<string, RouteMonthTrend[]>();
    await Promise.all(
      selectedSummaries.map(async (summary) => {
        routeTrends.set(summary.routeId, await listRouteMonthTrends(db, summary.routeId));
      }),
    );
    const tier2DocumentChunks = await tier2DocumentChunkIndex(
      options.tier2DocumentChunksPath,
      fromRepoRoot,
    );
    const manualInterventionsArtifact =
      await readJsonIfExists<Tier2ManualInterventionCandidatesArtifact>(
        fromRepoRoot(options.manualInterventionsPath),
      );
    const manualInterventionsByRoute = manualInterventionIndex(
      manualInterventionsArtifact,
      tier2DocumentChunks,
    );

    if (options.publishableInterventionsByRoutePath !== null) {
      const publishableByRouteArtifact = await readJsonIfExists<{
        interventionsByRoute?: Record<string, StudioIntervention[]>;
      }>(fromRepoRoot(options.publishableInterventionsByRoutePath));
      if (publishableByRouteArtifact?.interventionsByRoute !== undefined) {
        for (const [routeKeyRaw, entries] of Object.entries(
          publishableByRouteArtifact.interventionsByRoute,
        )) {
          const key = routeKey(routeKeyRaw);
          const existing = manualInterventionsByRoute.get(key) ?? [];
          manualInterventionsByRoute.set(key, [...existing, ...entries]);
        }
      }
    }

    const routes: StudioRoute[] = selectedSummaries.flatMap((summary) => {
      const readiness = readinessByRoute.get(summary.routeId);
      if (readiness === undefined) {
        return [];
      }

      return [
        buildRoute(
          readiness,
          summary,
          routeInputs.get(summary.routeId) ?? null,
          routeGeometry.get(summary.routeId),
          descriptivePeerSlugs.get(summary.routeId) ?? null,
          observedByRoute.get(summary.routeId),
          interventionsByRoute.get(summary.routeId) ?? [],
          manualInterventionsByRoute.get(routeKey(summary.routeId)) ?? [],
          speedPercentiles.get(summary.routeId) ?? {
            percentile: 50,
            ...speedPercentileContext(1, 1),
          },
          routeTrends.get(summary.routeId) ?? [],
          tspEvidenceByRoute.get(summary.routeId) ?? unknownTspEvidence(),
          buildRouteInterventions,
        ),
      ];
    });

    const deterministicSegments = routes.flatMap((route) =>
      buildSegments(
        route.slug,
        route.routeId,
        routeInputs.get(route.routeId) ?? null,
        segmentLaneOverlaps.get(route.routeId),
        tspEvidenceByRoute.get(route.routeId) ?? unknownTspEvidence(),
      ),
    );
    const publicNoteSegments = withSparsePublicSegmentNotes(deterministicSegments, options.month);
    const segments = await enhanceSegmentAiNotesWithLlm(
      publicNoteSegments,
      options.segmentNoteLlm,
    );
    const routeSegmentEvidence = routes.flatMap((route) =>
      (routeInputsByRoute.get(route.routeId) ?? [routeInputs.get(route.routeId) ?? null]).flatMap(
        (input) =>
          buildRouteSegmentEvidence(
            route.slug,
            route.routeId,
            input?.analysisPeriod ?? options.month,
            input,
            segmentLaneOverlaps.get(route.routeId),
            tspEvidenceByRoute.get(route.routeId) ?? unknownTspEvidence(),
          ),
      ),
    );
    const reviewedFindings = routes.flatMap((route) => {
      const finding = buildReviewedFinding(route);
      return finding === null ? [] : [finding];
    });
    const promotedFindings = await readPromotedFindingsFromArtifact({
      path: options.promotedFindingsPath,
      routes,
      limit: Math.max(0, options.findingLimit - reviewedFindings.length),
      excludedRouteSlugs: new Set(reviewedFindings.map((finding) => finding.routeSlug)),
    });
    const reviewedAndPromotedFindings = [...reviewedFindings, ...promotedFindings];
    const remainingFindingSlots = Math.max(
      0,
      options.findingLimit - reviewedAndPromotedFindings.length,
    );
    const detectorFindings = await readDetectorFindingsFromReviewQueue({
      path: options.reviewQueuePath,
      routes,
      limit: remainingFindingSlots,
      excludedRouteSlugs: new Set(reviewedAndPromotedFindings.map((finding) => finding.routeSlug)),
    });
    const contextAppendix = await readJsonIfExists<FindingContextAppendixArtifact>(
      fromRepoRoot(options.contextAppendixPath),
    );
    const findings = addFindingContextAppendix({
      findings: [...reviewedAndPromotedFindings, ...detectorFindings],
      routes,
      appendix: contextAppendix,
    });
    const routeArtifactRouteIds = new Set(routeArtifacts.map((artifact) => artifact.routeId));
    const releaseGeneratedAt = new Date().toISOString();
    const briefs = routes
      .filter((route) => routeArtifactRouteIds.has(route.routeId))
      .map((route) =>
        buildBrief(
          route,
          findings.find((finding) => finding.routeSlug === route.slug),
          releaseGeneratedAt,
          routeArtifacts.filter((artifact) => artifact.routeId === route.routeId),
        ),
      );
    assertGeneratedBriefReferenceIntegrity(briefs);
    const tspSourceDate =
      [...tspEvidenceByRoute.values()].find((evidence) => evidence.tspSourceDate !== null)
        ?.tspSourceDate ?? null;
    const docsSources = [
      ...sourceCoverageDocsSources,
      docsSourceFromGeneratedReleaseSource({
        sourceId: "nyc_dot_tsp_status_2017",
        rowCount: tspEvidenceByRoute.size,
        period: tspSourceDate === null ? "No ingested TSP source" : `${tspSourceDate} snapshot`,
        monthCount: null,
        role: "release_context",
        decision: tspEvidenceByRoute.size === 0 ? "excluded_until_fixed" : "release_context_only",
        detectorEligibility: tspEvidenceByRoute.size === 0 ? "blocked" : "manual_review_primary",
        primaryEvidenceAllowed: tspEvidenceByRoute.size > 0,
        automaticPromotionAllowed: false,
        readinessStatus: tspEvidenceByRoute.size === 0 ? "blocked" : "sample_only",
        readinessReasons:
          tspEvidenceByRoute.size === 0
            ? ["Captured NYC DOT TSP status source is missing or did not parse route mentions."]
            : [
                "TSP status comes from a captured 2017 source snapshot; use it as source status, not proof of current signal operation.",
              ],
      }),
      docsSourceFromGeneratedReleaseSource({
        sourceId: "generated_route_slice_artifacts",
        rowCount: routeArtifacts.length,
        period: options.month,
        monthCount: 1,
        role: "release_context",
        decision: routeArtifacts.length === 0 ? "backfill_required" : "release_context_only",
        detectorEligibility: routeArtifacts.length === 0 ? "missing_data_only" : "context_only",
        primaryEvidenceAllowed: false,
        automaticPromotionAllowed: false,
        readinessStatus: routeArtifacts.length === 0 ? "blocked" : "sample_only",
        readinessReasons:
          routeArtifacts.length === 0
            ? ["No generated route artifact references are present for the selected release."]
            : [
                "Generated artifacts are release-serving projections; attach public source refs when making external claims.",
              ],
      }),
    ];

    return StudioReleasePayloadSchema.parse({
      schemaVersion: 1,
      generatedAt: releaseGeneratedAt,
      quality: {
        releaseLayer: "baseline_release",
        completenessStatus: "partial_public_monthly_only",
        confidence: "medium",
        caveats: qualityCaveats(options.month),
      },
      routes,
      segments,
      routeSegmentEvidence,
      routeArtifacts,
      findings,
      briefs,
      versions: briefs.map((brief) => ({
        briefId: brief.id,
        v: brief.version,
        date: brief.generated,
        author: brief.authors[0] ?? "Studio release builder",
        summary: "Generated from D1/R2 serving projections.",
        claimsCount: brief.claims.length,
        evidenceRefCount: brief.evidenceRefCount,
        caveatsCount: brief.caveats.length,
      })),
      comments: [],
      methods: methodDatasetsFromDocsSources(docsSources),
      docsSections: docsSections(options.month),
      docsSources,
      docsEndpoints: [],
    });
  } finally {
    sqlite.close();
  }
}

function buildSegmentAnalystNotesArtifact(
  release: StudioReleasePayload,
): SegmentAnalystNotesArtifact {
  return {
    schemaVersion: 1,
    generatedAt: release.generatedAt,
    notes: release.segments.map((segment) => ({
      routeSlug: segment.routeSlug,
      segmentId: segment.id,
      note: buildSegmentAnalystNote(segment as unknown as StudioSegment),
    })),
  };
}

function analystNotesOutputPath(outputDir: string): string {
  return resolve(outputDir, "..", "internal", basename(outputDir), "segment-analyst-notes.json");
}

async function writeProjections(
  outputPath: string,
  release: StudioReleasePayload,
): Promise<void> {
  const outputDir = dirname(resolve(outputPath));

  await rm(outputDir, { recursive: true, force: true });
  await writeJson(outputPath, release);
  await writeJson(analystNotesOutputPath(outputDir), buildSegmentAnalystNotesArtifact(release));
  await writeJson(resolve(outputDir, "routes.json"), buildStudioRoutesProjection(release));
  await writeJson(resolve(outputDir, "findings.json"), buildStudioFindingsProjection(release));
  await writeJson(resolve(outputDir, "briefs.json"), buildStudioBriefsProjection(release));
  await writeJson(
    resolve(outputDir, "evidence.json"),
    buildStudioEvidenceCatalogProjection(release),
  );
  await writeJson(resolve(outputDir, "cohorts.json"), buildStudioCohortCatalogProjection(release));
  await writeJson(resolve(outputDir, "methods.json"), buildStudioMethodsProjection(release));
  await writeJson(resolve(outputDir, "docs.json"), buildStudioDocsProjection(release));

  for (const route of release.routes) {
    await writeJson(
      resolve(outputDir, "routes", route.slug, "index.json"),
      buildStudioRouteProjection(release, route),
    );
    await writeJson(
      resolve(outputDir, "routes", route.slug, "ladder.json"),
      buildStudioRouteLadderProjection(release, route),
    );
    await writeJson(
      resolve(outputDir, "routes", route.slug, "segments.json"),
      buildStudioRouteSegmentsProjection(release, route),
    );
  }

  for (const finding of release.findings) {
    const projection = buildStudioFindingProjection(release, finding);
    if (projection !== undefined) {
      await writeJson(resolve(outputDir, "findings", finding.id, "index.json"), projection);
    }
  }

  for (const brief of release.briefs) {
    const projection = buildStudioBriefProjection(release, brief);
    if (projection !== undefined) {
      await writeJson(resolve(outputDir, "briefs", brief.id, "index.json"), projection);
    }
    const evidenceProjection = buildStudioBriefEvidenceProjection(release, brief);
    if (evidenceProjection !== undefined) {
      await writeJson(resolve(outputDir, "briefs", brief.id, "evidence.json"), evidenceProjection);
    }
    const historyProjection = buildStudioBriefHistoryProjection(release, brief);
    if (historyProjection !== undefined) {
      await writeJson(resolve(outputDir, "briefs", brief.id, "history.json"), historyProjection);
    }
  }
}

export type RunStudioReleaseInputs = {
  month?: string | undefined;
  outputPath?: string | undefined;
  schemaPath?: string | undefined;
  seedPath?: string | undefined;
  routeLimit?: number | undefined;
  findingLimit?: number | undefined;
  reviewQueuePath?: string | undefined;
  promotedFindingsPath?: string | undefined;
  contextAppendixPath?: string | undefined;
  routeSliceArtifactsRoot?: string | undefined;
  routeSliceRawRoot?: string | undefined;
  routeShapeSnapshotPath?: string | undefined;
  stopSnapshotPath?: string | undefined;
  tspSourcePath?: string | undefined;
  tier2DocumentChunksPath?: string | undefined;
  manualInterventionsPath?: string | undefined;
  publishableInterventionsByRoutePath?: string | undefined;
  localDbPath?: string | undefined;
  profile?: ReleaseProfile | undefined;
  segmentNoteLlm?: Partial<SegmentNoteLlmOptions> | undefined;
};

export type RunStudioReleaseResult = {
  outputPath: string;
  routeCount: number;
  segmentCount: number;
  findingCount: number;
  briefCount: number;
  source: {
    schemaPath: string;
    seedPath: string;
    month: string;
  };
  segmentNoteLlm: {
    enabled: boolean;
    model: string | null;
    requestedCount: number;
    generatedCount: number;
  };
};

export async function runStudioRelease(
  inputs: RunStudioReleaseInputs,
): Promise<RunStudioReleaseResult> {
  const month = inputs.month ?? defaultMonth;
  const env = process.env as { OPENROUTER_API_KEY?: string };
  const llmInput = inputs.segmentNoteLlm ?? {};
  const options: CliOptions = {
    month,
    outputPath: inputs.outputPath ?? defaultOutputPath,
    schemaPath: inputs.schemaPath ?? defaultSchemaPath,
    seedPath: inputs.seedPath ?? defaultSeedPath,
    routeLimit: inputs.routeLimit ?? defaultRouteLimit,
    findingLimit: inputs.findingLimit ?? defaultFindingLimit,
    reviewQueuePath:
      inputs.reviewQueuePath ?? join("data/artifacts/findings", month, "review-queue.json"),
    promotedFindingsPath:
      inputs.promotedFindingsPath ??
      join("data/artifacts/findings", month, "promoted-findings.json"),
    contextAppendixPath:
      inputs.contextAppendixPath ?? join("data/artifacts/findings", month, "context-appendix.json"),
    routeSliceArtifactsRoot: inputs.routeSliceArtifactsRoot ?? defaultRouteSliceArtifactsRoot,
    routeSliceRawRoot: inputs.routeSliceRawRoot ?? defaultRouteSliceRawRoot,
    routeShapeSnapshotPath: inputs.routeShapeSnapshotPath ?? defaultRouteShapeSnapshotPath,
    stopSnapshotPath: inputs.stopSnapshotPath ?? defaultStopSnapshotPath,
    tspSourcePath: inputs.tspSourcePath ?? defaultTspSourcePath,
    tier2DocumentChunksPath: inputs.tier2DocumentChunksPath ?? defaultTier2DocumentChunksPath,
    manualInterventionsPath: inputs.manualInterventionsPath ?? defaultManualInterventionsPath,
    publishableInterventionsByRoutePath: inputs.publishableInterventionsByRoutePath ?? null,
    localDbPath: inputs.localDbPath ?? defaultLocalPipelineDbPath(),
    profile: inputs.profile ?? "full",
    segmentNoteLlm: {
      enabled: llmInput.enabled ?? false,
      model: llmInput.model ?? defaultSegmentNoteModel,
      limit: llmInput.limit ?? defaultSegmentNoteLlmLimit,
      maxTokens: llmInput.maxTokens ?? 900,
      timeoutMs: llmInput.timeoutMs ?? defaultSegmentNoteLlmTimeoutMs,
      maxAttempts: llmInput.maxAttempts ?? defaultSegmentNoteLlmAttempts,
      apiKey: llmInput.apiKey ?? env.OPENROUTER_API_KEY,
      fetcher: llmInput.fetcher ?? fetch,
    },
  };

  const outputPath = fromRepoRoot(options.outputPath);
  const release = await buildRelease(options);
  const publicNoteCount = release.segments.filter(
    (segment) => segment.aiNote !== undefined,
  ).length;

  await writeProjections(outputPath, release);

  return {
    outputPath,
    routeCount: release.routes.length,
    segmentCount: release.segments.length,
    findingCount: release.findings.length,
    briefCount: release.briefs.length,
    source: {
      schemaPath: options.schemaPath,
      seedPath: options.seedPath,
      month: options.month,
    },
    segmentNoteLlm: {
      enabled: options.segmentNoteLlm.enabled,
      model: options.segmentNoteLlm.enabled ? options.segmentNoteLlm.model : null,
      requestedCount:
        options.segmentNoteLlm.enabled && options.segmentNoteLlm.limit === null
          ? publicNoteCount
          : options.segmentNoteLlm.enabled
            ? Math.min(options.segmentNoteLlm.limit ?? 0, publicNoteCount)
            : 0,
      generatedCount: release.segments.filter(
        (segment) =>
          (segment.aiNote as StudioAiPublicNote | undefined)?.generationMode ===
          "llm_assisted_evidence_summary",
      ).length,
    },
  };
}

export default defineCommand({
  path: ["studio", "release"],
  summary: "Build the Bus Priority Impact Studio release projection set.",
  input: {
    options: z.object({
      month: z.string().default(defaultMonth).describe("Public release iso month"),
      output: z.string().optional().describe("Override path for the release.json output"),
      schema: z.string().optional().describe("Override the D1 schema.sql path"),
      seed: z.string().optional().describe("Override the D1 seed.sql path"),
      limit: z.coerce
        .number()
        .int()
        .positive()
        .default(defaultRouteLimit)
        .describe("Route limit for demo profile"),
      findingLimit: z.coerce
        .number()
        .int()
        .positive()
        .default(defaultFindingLimit)
        .describe("Maximum findings to include"),
      reviewQueue: z.string().optional(),
      promotedFindings: z.string().optional(),
      contextAppendix: z.string().optional(),
      routeSliceArtifacts: z.string().optional(),
      routeSliceRaw: z.string().optional(),
      routeShapeSnapshot: z.string().optional(),
      stopSnapshot: z.string().optional(),
      tspSource: z.string().optional(),
      tier2DocumentChunks: z.string().optional(),
      manualInterventions: z.string().optional(),
      publishableInterventionsByRoute: z.string().optional(),
      localDb: z.string().optional(),
      profile: z.enum(["demo", "full"]).default("full"),
      segmentNoteLlm: z.coerce.boolean().default(false),
      segmentNoteModel: z.string().optional(),
      segmentNoteLlmLimit: z.string().optional(),
      segmentNoteMaxTokens: z.coerce.number().int().positive().optional(),
      segmentNoteTimeoutMs: z.coerce.number().int().positive().optional(),
      segmentNoteAttempts: z.coerce.number().int().positive().optional(),
    }),
  },
  output: z.object({
    outputPath: z.string(),
    routeCount: z.number(),
    segmentCount: z.number(),
    findingCount: z.number(),
    briefCount: z.number(),
    source: z.object({
      schemaPath: z.string(),
      seedPath: z.string(),
      month: z.string(),
    }),
    segmentNoteLlm: z.object({
      enabled: z.boolean(),
      model: z.string().nullable(),
      requestedCount: z.number(),
      generatedCount: z.number(),
    }),
  }),
  async run({ input }) {
    const env = process.env as {
      STUDIO_SEGMENT_NOTE_MODEL?: string;
      STUDIO_LLM_MODEL?: string;
    };
    const llmLimitStr = input.options.segmentNoteLlmLimit;
    const llmLimit =
      llmLimitStr === undefined
        ? defaultSegmentNoteLlmLimit
        : llmLimitStr === "all"
          ? null
          : Number(llmLimitStr);
    const model =
      input.options.segmentNoteModel ??
      env.STUDIO_SEGMENT_NOTE_MODEL ??
      env.STUDIO_LLM_MODEL ??
      defaultSegmentNoteModel;
    return runStudioRelease({
      month: input.options.month,
      outputPath:
        input.options.output === undefined ? undefined : input.options.output,
      schemaPath: input.options.schema === undefined ? undefined : input.options.schema,
      seedPath: input.options.seed === undefined ? undefined : input.options.seed,
      routeLimit: input.options.limit,
      findingLimit: input.options.findingLimit,
      reviewQueuePath: input.options.reviewQueue,
      promotedFindingsPath: input.options.promotedFindings,
      contextAppendixPath: input.options.contextAppendix,
      routeSliceArtifactsRoot: input.options.routeSliceArtifacts,
      routeSliceRawRoot: input.options.routeSliceRaw,
      routeShapeSnapshotPath: input.options.routeShapeSnapshot,
      stopSnapshotPath: input.options.stopSnapshot,
      tspSourcePath: input.options.tspSource,
      tier2DocumentChunksPath: input.options.tier2DocumentChunks,
      manualInterventionsPath: input.options.manualInterventions,
      publishableInterventionsByRoutePath: input.options.publishableInterventionsByRoute,
      localDbPath:
        input.options.localDb === undefined ? undefined : fromCliPath(input.options.localDb),
      profile: input.options.profile,
      segmentNoteLlm: {
        enabled: input.options.segmentNoteLlm,
        model,
        limit: llmLimit,
        maxTokens: input.options.segmentNoteMaxTokens ?? 900,
        timeoutMs: input.options.segmentNoteTimeoutMs ?? defaultSegmentNoteLlmTimeoutMs,
        maxAttempts: input.options.segmentNoteAttempts ?? defaultSegmentNoteLlmAttempts,
        apiKey: process.env["OPENROUTER_API_KEY"],
        fetcher: fetch,
      },
    });
  },
});
