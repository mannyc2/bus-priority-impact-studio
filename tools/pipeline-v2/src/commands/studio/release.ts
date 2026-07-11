import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import {
  listRouteArtifacts,
  listRouteBriefSummaries,
  listRouteInterventionComparisons,
  listRouteMonthTrends,
  listRouteObservedReliabilitySummaries,
  listRouteReadiness,
  type RouteBriefSummary,
  type RouteInterventionComparison,
} from "@bp/db";
import type { LocalRouteScheduleTimepoint } from "@bp/db/local";
import type { StudioIntervention } from "@bp/domain/studio/interventions";
import {
  buildMapRouteFactsProjection,
  buildStudioDocsProjection,
  buildStudioMethodsProjection,
  buildStudioRouteProjection,
  buildStudioRoutesProjection,
  buildStudioSegmentsProjection,
} from "@bp/domain/studio/projections";
import { type StudioReleasePayload, StudioReleasePayloadSchema } from "@bp/domain/studio/release";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { normalizeHourlyRidershipRows } from "@bp/sources/adapters/mta/bus-ridership";
import { normalizeSegmentSpeedRows } from "@bp/sources/adapters/mta/bus-speeds";
import { normalizeScheduleTimepointRows } from "@bp/sources/adapters/mta/schedules";
import { Effect } from "effect";
import { localTransformConcurrency, runBoundedPromises } from "../../effect/concurrency.ts";
import { runD1ReplayBoundary } from "../../effect/d1-replay.ts";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { fromCliPath } from "../../lib/paths.ts";
import { buildRouteBriefSegmentUniverse } from "../../lib/route-briefs/index.ts";
import {
  type LoadedRouteSpeedSpineCrosswalk,
  loadRouteSpeedSpineCrosswalk,
} from "../../lib/route-speed-spine-crosswalk.ts";
import { decodeSchemaStrict } from "../../lib/schema-decode.ts";
import type { SocrataRow } from "../../lib/soda3.ts";
import { buildSourceCoverageLedger } from "../audit/source-coverage.ts";
import {
  docsSections,
  docsSourceFromGeneratedReleaseSource,
  docsSourceFromLedgerEntry,
  methodDatasetsFromDocsSources,
} from "./_release-docs.ts";
import {
  assertRouteGeometryCoverage,
  readJsonIfExists,
  routeGeometryIndex,
  segmentLaneOverlapIndex,
  tspEvidenceIndex,
  unknownTspEvidence,
} from "./_release-geometry.ts";
import {
  buildRouteInterventions,
  documentChunkIndex,
  manualInterventionIndex,
} from "./_release-interventions.ts";
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
  buildSegmentAnalystNote,
  buildSegments,
  enhanceSegmentAiNotesWithLlm,
  withSparsePublicSegmentNotes,
} from "./_release-segments.ts";
import type {
  CliOptions,
  ManualInterventionCandidatesArtifact,
  RawSourceSnapshot,
  ReleaseProfile,
  RouteBriefInputArtifact,
  SegmentAnalystNotesArtifact,
  SegmentNoteLlmOptions,
  StudioRoute,
  StudioSegment,
} from "./_release-types.ts";

const defaultMonth = "2026-03";
const defaultOutputPath = "data/artifacts/studio/v1/release.json";
const defaultSchemaPath = "data/exports/d1/2026-03/schema.sql";
const defaultSeedPath = "data/exports/d1/2026-03/seed.sql";
const defaultRouteSliceArtifactsRoot = "data/artifacts/route-slices";
const defaultRouteSliceRawRoot = "data/raw/route-slices";
const defaultSpeedSpineRoot = "data/artifacts";
const defaultRouteShapeSnapshotPath = "data/raw/network/current_bus_routes.json";
const defaultStopSnapshotPath = "data/raw/network/current_bus_stops.json";
const defaultTspSourcePath = "data/artifacts/studio/v2/wiki/sources/nyc_dot_tsp_status_2017";
const defaultDocumentChunksPath = "data/artifacts/studio/v2/wiki/document-chunks.json";
const defaultManualInterventionsPath =
  "data/artifacts/studio/v2/wiki/manual-intervention-candidates.json";
const defaultSegmentNoteModel = "qwen/qwen3.7-max";
const defaultSegmentNoteLlmLimit = 8;
const defaultSegmentNoteLlmTimeoutMs = 60_000;
const defaultSegmentNoteLlmAttempts = 2;
const defaultRouteLimit = 12;
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

async function loadStudioReleaseD1Context(options: CliOptions) {
  const [schemaSql, seedSql] = await Promise.all([
    Bun.file(fromCliPath(options.schemaPath)).text(),
    Bun.file(fromCliPath(options.seedPath)).text(),
  ]);

  return runD1ReplayBoundary({
    command: "studio.release",
    operation: "loadStudioReleaseD1Context",
    schemaSql,
    seedSql,
    spanAttributes: { month: options.month },
    run: async ({ db }) => {
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
      const profileSelectedSummaries =
        options.profile === "full"
          ? orderedSummaries
          : orderedSummaries.slice(0, Math.max(options.routeLimit, requiredSummaries.length));
      const routeFilter = new Set(options.routeIds.map((routeId) => routeId.trim().toUpperCase()));
      const selectedSummaries = profileSelectedSummaries.filter(
        (summary) => routeFilter.size === 0 || routeFilter.has(summary.routeId),
      );
      const speedPercentiles = speedPercentilesForSummaries(orderedSummaries, readinessByRoute);
      const descriptivePeerSlugs = descriptivePeerSlugsForSummaries(
        selectedSummaries,
        readinessByRoute,
      );
      const routeTrends = new Map(
        await runBoundedPromises(
          selectedSummaries,
          localTransformConcurrency,
          async (summary) =>
            [summary.routeId, await listRouteMonthTrends(db, summary.routeId)] as const,
        ),
      );

      return {
        readinessByRoute,
        observedByRoute,
        interventionsByRoute,
        selectedSummaries,
        speedPercentiles,
        descriptivePeerSlugs,
        routeArtifactRows,
        routeTrends,
      };
    },
  });
}

async function rawRouteSliceRows(
  routeId: string,
  month: string,
  filename: string,
  routeSliceRawRoot: string,
): Promise<SocrataRow[] | null> {
  const slug = routeId.toLowerCase();
  const path = fromCliPath(join(routeSliceRawRoot, `${slug}-${month}`, filename));
  const snapshot = await readJsonIfExists<RawSourceSnapshot>(path);
  return Array.isArray(snapshot?.rows) ? snapshot.rows : null;
}

async function augmentRouteBriefInputFromRaw(
  routeId: string,
  month: string,
  artifact: RouteBriefInputArtifact | null,
  routeSliceRawRoot: string,
  currentScheduleRows: readonly LocalRouteScheduleTimepoint[],
): Promise<RouteBriefInputArtifact | null> {
  if (artifact === null) {
    return artifact;
  }

  if ((artifact.segments?.length ?? 0) > 0 && currentScheduleRows.length === 0) {
    return artifact;
  }

  const [speedRows, ridershipRows, snapshotScheduleRows] = await Promise.all([
    rawRouteSliceRows(routeId, month, "bus_segment_speeds_2025.json", routeSliceRawRoot),
    rawRouteSliceRows(routeId, month, "bus_hourly_ridership_2025.json", routeSliceRawRoot),
    currentScheduleRows.length === 0
      ? rawRouteSliceRows(routeId, month, "bus_schedules_2026.json", routeSliceRawRoot)
      : Promise.resolve(null),
  ]);
  if (
    speedRows === null ||
    ridershipRows === null ||
    (currentScheduleRows.length === 0 && snapshotScheduleRows === null)
  ) {
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
    schedules:
      currentScheduleRows.length > 0
        ? currentScheduleRows
        : normalizeScheduleTimepointRows(snapshotScheduleRows ?? []).map((row) => ({
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
  currentScheduleRows: readonly LocalRouteScheduleTimepoint[],
): Promise<RouteBriefInputArtifact | null> {
  const slug = routeId.toLowerCase();
  const path = fromCliPath(
    join(routeSliceArtifactsRoot, `${slug}-${month}`, "route-brief-input.json"),
  );
  const artifact = await readJsonIfExists<RouteBriefInputArtifact>(path);
  return augmentRouteBriefInputFromRaw(
    routeId,
    month,
    artifact,
    routeSliceRawRoot,
    currentScheduleRows,
  );
}

async function routeBriefInputs(
  routeId: string,
  month: string,
  routeSliceArtifactsRoot: string,
  routeSliceRawRoot: string,
  currentScheduleRowsByRoute: ReadonlyMap<string, readonly LocalRouteScheduleTimepoint[]>,
): Promise<RouteBriefInputArtifact[]> {
  const slug = routeId.toLowerCase();
  const root = fromCliPath(routeSliceArtifactsRoot);
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
  const artifacts = await runBoundedPromises(months, localTransformConcurrency, (candidate) =>
    routeBriefInput(
      routeId,
      candidate,
      routeSliceArtifactsRoot,
      routeSliceRawRoot,
      candidate === month ? (currentScheduleRowsByRoute.get(routeId) ?? []) : [],
    ),
  );
  return artifacts.flatMap((artifact) => (artifact === null ? [] : [artifact]));
}

async function currentMonthScheduleRowsByRoute(
  localDbPath: string,
  month: string,
  routeIds: readonly string[],
): Promise<Map<string, LocalRouteScheduleTimepoint[]>> {
  if (routeIds.length === 0) return new Map();
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber)) return new Map();
  const nextMonth = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 7);

  return runLocalDbCommandBoundary({
    dbPath: localDbPath,
    localDbOptions: { readonly: true },
    command: "studio.release",
    operation: "loadCurrentMonthRouteSchedules",
    spanAttributes: { month, routeCount: routeIds.length },
    run: async (local) => {
      const table = local.sqlite
        .query(
          "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'local_route_schedule_stop'",
        )
        .get();
      if (table === null) return new Map();

      const placeholders = routeIds.map(() => "?").join(", ");
      const rows = local.sqlite
        .query(
          `
            SELECT route_id, schedule_date, day_type, direction, shape_id, stop_sequence,
                   stop_id, stop_name, schedule_time, distance_from_start, trip_headsign,
                   block_id, bundle
            FROM local_route_schedule_stop
            WHERE source_year = ?
              AND schedule_date >= ?
              AND schedule_date < ?
              AND route_id IN (${placeholders})
            ORDER BY route_id, schedule_date, direction, shape_id, block_id,
                     schedule_time, stop_sequence
          `,
        )
        .all(
          year,
          `${month}-01T00:00:00.000`,
          `${nextMonth}-01T00:00:00.000`,
          ...routeIds,
        ) as Array<{
        route_id: string;
        schedule_date: string;
        day_type: string;
        direction: string;
        shape_id: string;
        stop_sequence: number;
        stop_id: string;
        stop_name: string | null;
        schedule_time: string;
        distance_from_start: number | null;
        trip_headsign: string | null;
        block_id: string;
        bundle: string | null;
      }>;
      const byRoute = new Map<string, LocalRouteScheduleTimepoint[]>();
      for (const row of rows) {
        const schedule: LocalRouteScheduleTimepoint = {
          routeId: row.route_id,
          isoMonth: month,
          scheduleDate: row.schedule_date,
          dayType: row.day_type,
          direction: row.direction,
          shapeId: row.shape_id,
          stopSequence: row.stop_sequence,
          stopId: row.stop_id,
          scheduleTime: row.schedule_time,
          blockId: row.block_id,
          ...(row.stop_name === null ? {} : { stopName: row.stop_name }),
          ...(row.distance_from_start === null
            ? {}
            : { distanceFromStart: row.distance_from_start }),
          ...(row.trip_headsign === null ? {} : { tripHeadsign: row.trip_headsign }),
          ...(row.bundle === null ? {} : { bundle: row.bundle }),
        };
        const routeRows = byRoute.get(row.route_id) ?? [];
        routeRows.push(schedule);
        byRoute.set(row.route_id, routeRows);
      }
      return byRoute;
    },
  });
}

async function buildRelease(options: CliOptions): Promise<StudioReleasePayload> {
  const {
    readinessByRoute,
    observedByRoute,
    interventionsByRoute,
    selectedSummaries,
    speedPercentiles,
    descriptivePeerSlugs,
    routeArtifactRows,
    routeTrends,
  } = await loadStudioReleaseD1Context(options);
  const routeGeometry = await routeGeometryIndex(
    options.routeShapeSnapshotPath,
    options.stopSnapshotPath,
    options.localDbPath,
  );
  const tspEvidenceByRoute = await tspEvidenceIndex(options.tspSourcePath);
  const sourceCoverageDocsSources = await runLocalDbCommandBoundary({
    dbPath: options.localDbPath,
    localDbOptions: { readonly: true },
    command: "studio.release",
    operation: "buildSourceCoverageLedger",
    spanAttributes: { month: options.month },
    run: async (local) =>
      buildSourceCoverageLedger({
        sqlite: local.sqlite,
        month: options.month,
        dbPath: local.path,
      }).sources.map(docsSourceFromLedgerEntry),
  });
  const selectedRouteIds = new Set(selectedSummaries.map((summary) => summary.routeId));
  const currentScheduleRowsByRoute = await currentMonthScheduleRowsByRoute(
    options.localDbPath,
    options.month,
    [...selectedRouteIds],
  );
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
  const speedSpinesByRoute = new Map<string, LoadedRouteSpeedSpineCrosswalk>();

  for (const summary of selectedSummaries) {
    const inputs = await routeBriefInputs(
      summary.routeId,
      options.month,
      options.routeSliceArtifactsRoot,
      options.routeSliceRawRoot,
      currentScheduleRowsByRoute,
    );
    const currentInput =
      inputs.find((input) => (input.analysisPeriod ?? options.month) === options.month) ??
      inputs[0] ??
      null;
    routeInputs.set(summary.routeId, currentInput);
    speedSpinesByRoute.set(
      summary.routeId,
      await loadRouteSpeedSpineCrosswalk({
        artifactRoot: fromCliPath(options.speedSpineRoot),
        routeId: summary.routeId,
        requireSpine: options.profile === "full",
      }),
    );
  }
  const segmentLaneOverlaps = await segmentLaneOverlapIndex({
    localDbPath: options.localDbPath,
    isoMonth: options.month,
    routeShapeSnapshotPath: options.routeShapeSnapshotPath,
    stopSnapshotPath: options.stopSnapshotPath,
    routeInputs,
  });
  const documentChunks = await documentChunkIndex(options.documentChunksPath, fromCliPath);
  const manualInterventionsArtifact = await readJsonIfExists<ManualInterventionCandidatesArtifact>(
    fromCliPath(options.manualInterventionsPath),
  );
  const manualInterventionsByRoute = manualInterventionIndex(
    manualInterventionsArtifact,
    documentChunks,
  );

  if (options.publishableInterventionsByRoutePath !== null) {
    const publishableByRouteArtifact = await readJsonIfExists<{
      interventionsByRoute?: Record<string, StudioIntervention[]>;
    }>(fromCliPath(options.publishableInterventionsByRoutePath));
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

  const deterministicSegments = routes.flatMap((route) => {
    const speedSpine = speedSpinesByRoute.get(route.routeId);
    return buildSegments(
      route.slug,
      route.routeId,
      routeInputs.get(route.routeId) ?? null,
      segmentLaneOverlaps.get(route.routeId),
      tspEvidenceByRoute.get(route.routeId) ?? unknownTspEvidence(),
      speedSpine?.status === "ready" ? speedSpine.crosswalk : null,
    );
  });
  for (const route of routes) {
    const routeSegments = deterministicSegments.filter(
      (segment) => segment.routeSlug === route.slug,
    );
    const seenSpineIds = new Set<string>();
    let unmatchedCount = 0;
    for (const segment of routeSegments) {
      if (segment.spineJoinStatus === "unmatched") unmatchedCount += 1;
      if (segment.spineSegmentId === null) continue;
      if (seenSpineIds.has(segment.spineSegmentId)) {
        throw new Error(
          `Studio release route ${route.routeId} ${options.month} maps more than one current segment to ${segment.spineSegmentId}.`,
        );
      }
      seenSpineIds.add(segment.spineSegmentId);
    }
    const spine = speedSpinesByRoute.get(route.routeId);
    if (
      spine?.status === "ready" &&
      spine.audit.readiness === "series_ready" &&
      unmatchedCount > 0
    ) {
      throw new Error(
        `Studio release route ${route.routeId} is series_ready but has ${unmatchedCount} unmatched current segments.`,
      );
    }
  }
  const publicNoteSegments = withSparsePublicSegmentNotes(deterministicSegments, options.month);
  const segments = await enhanceSegmentAiNotesWithLlm(publicNoteSegments, options.segmentNoteLlm);
  const releaseGeneratedAt = new Date().toISOString();
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

  return decodeSchemaStrict(StudioReleasePayloadSchema, {
    schemaVersion: 2,
    generatedAt: releaseGeneratedAt,
    baselineMonth: options.month,
    quality: {
      releaseLayer: "baseline_release",
      completenessStatus: "partial_public_monthly_only",
      confidence: "medium",
      caveats: qualityCaveats(options.month),
    },
    routes,
    routeFactMetadata: routes.map((route) => {
      const input = routeInputs.get(route.routeId) ?? null;
      const universe = input?.segmentUniverse;
      const delayAvailable =
        route.riderHoursLost !== null &&
        input?.analysisPeriod === options.month &&
        universe?.grain === "all_observed_timepoint_segments" &&
        (universe.segmentCount ?? 0) > 0 &&
        universe.source === "mta_bus_segment_speeds" &&
        universe.ridershipDenominator === "average_service_day_route_hourly_ridership" &&
        universe.serviceDayRidershipCoverage === "available" &&
        universe.hourlyRiderDelayCoverage === "available";
      const laneAvailable = route.laneCoverageSource === "dot_bus_lanes_geometry";
      const tspAvailable = route.tspStatus !== "unknown";
      return {
        routeId: route.routeId,
        delayExposure: delayAvailable
          ? {
              valueRiderHours: route.riderHoursLost,
              status: "available",
              analysisPeriod: options.month,
              grain: "all_observed_timepoint_segments",
              source: "mta_bus_segment_speeds",
              segmentCount: universe?.segmentCount ?? 0,
              ridershipDenominator: "average_service_day_route_hourly_ridership",
              serviceDayRidershipCoverage: "available",
              hourlyPassengerDelayCoverage: "available",
              unavailableReason: null,
            }
          : {
              valueRiderHours: null,
              status: "unavailable",
              analysisPeriod: null,
              grain: null,
              source: null,
              segmentCount: universe?.segmentCount ?? 0,
              ridershipDenominator: null,
              serviceDayRidershipCoverage: "not_available",
              hourlyPassengerDelayCoverage: "not_available",
              unavailableReason:
                "Complete same-month route-slice passenger-delay evidence is unavailable.",
            },
        provenance: {
          lane: laneAvailable
            ? {
                status: "available",
                valuePct: route.laneCoverage,
                method: "route_shape_proximity_overlap",
                sourceId: "nyc_dot_bus_lanes_local_streets",
                unavailableReason: null,
              }
            : {
                status: "unavailable",
                valuePct: null,
                method: null,
                sourceId: null,
                unavailableReason: "Route-shape lane-overlap evidence is unavailable.",
              },
          ace: {
            status: route.aceStatus,
            grain: "route_month",
            sourceId: "ace_routes",
            sourceAsOf: null,
            sourceStatus: "available",
            unavailableReason: null,
          },
          tsp: {
            status: route.tspStatus,
            grain: "route_or_corridor",
            sourceId: tspAvailable ? "nyc_dot_tsp_status_2017" : null,
            sourceDate: route.tspSourceDate,
            corridor: route.tspCorridor,
            matchMethod: route.tspMatchMethod,
          },
        },
      };
    }),
    segments,
    routeArtifacts,
    methods: methodDatasetsFromDocsSources(docsSources),
    docsSections: docsSections(options.month),
    docsEndpoints: [],
  });
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

function isLlmGeneratedSegmentNote(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "generationMode" in value &&
    value.generationMode === "llm_assisted_evidence_summary"
  );
}

async function writeProjections(outputPath: string, release: StudioReleasePayload): Promise<void> {
  const outputDir = dirname(resolve(outputPath));

  await rm(outputDir, { recursive: true, force: true });
  await writeJson(outputPath, release);
  await writeJson(analystNotesOutputPath(outputDir), buildSegmentAnalystNotesArtifact(release));
  await writeJson(resolve(outputDir, "routes.json"), buildStudioRoutesProjection(release));
  await writeJson(
    resolve(outputDir, "map-route-facts.json"),
    buildMapRouteFactsProjection(release),
  );
  await writeJson(resolve(outputDir, "segments.json"), buildStudioSegmentsProjection(release));
  // methods.json is still loaded by the serving snapshot; its deletion is owned by plan 063.
  await writeJson(resolve(outputDir, "methods.json"), buildStudioMethodsProjection(release));
  await writeJson(resolve(outputDir, "docs.json"), buildStudioDocsProjection(release));

  for (const route of release.routes) {
    await writeJson(
      resolve(outputDir, "routes", route.slug, "index.json"),
      buildStudioRouteProjection(release, route),
    );
  }
}

export type RunStudioReleaseInputs = {
  month?: string | undefined;
  outputPath?: string | undefined;
  schemaPath?: string | undefined;
  seedPath?: string | undefined;
  routeLimit?: number | undefined;
  routeSliceArtifactsRoot?: string | undefined;
  routeSliceRawRoot?: string | undefined;
  speedSpineRoot?: string | undefined;
  routeShapeSnapshotPath?: string | undefined;
  stopSnapshotPath?: string | undefined;
  tspSourcePath?: string | undefined;
  documentChunksPath?: string | undefined;
  manualInterventionsPath?: string | undefined;
  publishableInterventionsByRoutePath?: string | undefined;
  localDbPath?: string | undefined;
  profile?: ReleaseProfile | undefined;
  routeIds?: readonly string[] | undefined;
  segmentNoteLlm?: Partial<SegmentNoteLlmOptions> | undefined;
};

export type RunStudioReleaseResult = {
  outputPath: string;
  mapRouteFactsPath: string;
  routeCount: number;
  segmentCount: number;
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
    routeSliceArtifactsRoot: inputs.routeSliceArtifactsRoot ?? defaultRouteSliceArtifactsRoot,
    routeSliceRawRoot: inputs.routeSliceRawRoot ?? defaultRouteSliceRawRoot,
    speedSpineRoot: inputs.speedSpineRoot ?? defaultSpeedSpineRoot,
    routeShapeSnapshotPath: inputs.routeShapeSnapshotPath ?? defaultRouteShapeSnapshotPath,
    stopSnapshotPath: inputs.stopSnapshotPath ?? defaultStopSnapshotPath,
    tspSourcePath: inputs.tspSourcePath ?? defaultTspSourcePath,
    documentChunksPath: inputs.documentChunksPath ?? defaultDocumentChunksPath,
    manualInterventionsPath: inputs.manualInterventionsPath ?? defaultManualInterventionsPath,
    publishableInterventionsByRoutePath: inputs.publishableInterventionsByRoutePath ?? null,
    localDbPath: inputs.localDbPath ?? defaultLocalPipelineDbPath(),
    profile: inputs.profile ?? "full",
    routeIds: (inputs.routeIds ?? []).map((routeId) => routeId.trim().toUpperCase()),
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

  const outputPath = fromCliPath(options.outputPath);
  const release = await buildRelease(options);
  const publicNoteCount = release.segments.filter((segment) => segment.aiNote !== undefined).length;

  await writeProjections(outputPath, release);

  return {
    outputPath,
    mapRouteFactsPath: resolve(dirname(outputPath), "map-route-facts.json"),
    routeCount: release.routes.length,
    segmentCount: release.segments.length,
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
      generatedCount: release.segments.filter((segment) =>
        isLlmGeneratedSegmentNote(segment.aiNote),
      ).length,
    },
  };
}

export default defineCommand({
  path: ["studio", "release"],
  summary: "Build the Bus Priority Impact Studio release projection set.",
  input: {
    options: Schema.Struct({
      month: Schema.String.pipe(
        Schema.withDecodingDefaultTypeKey(Effect.succeed(defaultMonth)),
      ).annotate({ description: "Public release iso month" }),
      output: Schema.optionalKey(Schema.String).annotate({
        description: "Override path for the release.json output",
      }),
      schema: Schema.optionalKey(Schema.String).annotate({
        description: "Override the D1 schema.sql path",
      }),
      seed: Schema.optionalKey(Schema.String).annotate({
        description: "Override the D1 seed.sql path",
      }),
      limit: arg
        .number()
        .check(Schema.isInt())
        .check(Schema.isGreaterThan(0))
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(defaultRouteLimit)))
        .annotate({ description: "Route limit for demo profile" }),
      routeSliceArtifacts: Schema.optionalKey(Schema.String),
      routeSliceRaw: Schema.optionalKey(Schema.String),
      speedSpineRoot: Schema.optionalKey(Schema.String),
      routeShapeSnapshot: Schema.optionalKey(Schema.String),
      stopSnapshot: Schema.optionalKey(Schema.String),
      tspSource: Schema.optionalKey(Schema.String),
      documentChunks: Schema.optionalKey(Schema.String),
      manualInterventions: Schema.optionalKey(Schema.String),
      publishableInterventionsByRoute: Schema.optionalKey(Schema.String),
      localDb: Schema.optionalKey(Schema.String),
      profile: Schema.Literals(["demo", "full"]).pipe(
        Schema.withDecodingDefaultTypeKey(Effect.succeed("full")),
      ),
      routes: Schema.optionalKey(Schema.String).annotate({
        description: "Comma-separated route IDs to include",
      }),
      segmentNoteLlm: arg.boolean().pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(false))),
      segmentNoteModel: Schema.optionalKey(Schema.String),
      segmentNoteLlmLimit: Schema.optionalKey(Schema.String),
      segmentNoteMaxTokens: Schema.optionalKey(
        arg.number().check(Schema.isInt()).check(Schema.isGreaterThan(0)),
      ),
      segmentNoteTimeoutMs: Schema.optionalKey(
        arg.number().check(Schema.isInt()).check(Schema.isGreaterThan(0)),
      ),
      segmentNoteAttempts: Schema.optionalKey(
        arg.number().check(Schema.isInt()).check(Schema.isGreaterThan(0)),
      ),
    }),
  },
  output: Schema.Struct({
    outputPath: Schema.String,
    routeCount: Schema.Number,
    segmentCount: Schema.Number,
    source: Schema.Struct({
      schemaPath: Schema.String,
      seedPath: Schema.String,
      month: Schema.String,
    }),
    segmentNoteLlm: Schema.Struct({
      enabled: Schema.Boolean,
      model: Schema.NullOr(Schema.String),
      requestedCount: Schema.Number,
      generatedCount: Schema.Number,
    }),
  }),
  async run({ input }) {
    const env = process.env as {
      OPENROUTER_API_KEY?: string;
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
      outputPath: input.options.output === undefined ? undefined : input.options.output,
      schemaPath: input.options.schema === undefined ? undefined : input.options.schema,
      seedPath: input.options.seed === undefined ? undefined : input.options.seed,
      routeLimit: input.options.limit,
      routeSliceArtifactsRoot: input.options.routeSliceArtifacts,
      routeSliceRawRoot: input.options.routeSliceRaw,
      speedSpineRoot: input.options.speedSpineRoot,
      routeShapeSnapshotPath: input.options.routeShapeSnapshot,
      stopSnapshotPath: input.options.stopSnapshot,
      tspSourcePath: input.options.tspSource,
      documentChunksPath: input.options.documentChunks,
      manualInterventionsPath: input.options.manualInterventions,
      publishableInterventionsByRoutePath: input.options.publishableInterventionsByRoute,
      localDbPath:
        input.options.localDb === undefined ? undefined : fromCliPath(input.options.localDb),
      profile: input.options.profile,
      routeIds: input.options.routes?.split(",").map((routeId) => routeId.trim()),
      segmentNoteLlm: {
        enabled: input.options.segmentNoteLlm,
        model,
        limit: llmLimit,
        maxTokens: input.options.segmentNoteMaxTokens ?? 900,
        timeoutMs: input.options.segmentNoteTimeoutMs ?? defaultSegmentNoteLlmTimeoutMs,
        maxAttempts: input.options.segmentNoteAttempts ?? defaultSegmentNoteLlmAttempts,
        apiKey: env.OPENROUTER_API_KEY,
        fetcher: fetch,
      },
    });
  },
});
