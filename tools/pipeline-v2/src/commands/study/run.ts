import { join } from "node:path";
import { serializeStudioSegmentId } from "@bp/analytics/feature-history";
import { decodeStrict } from "@bp/domain/decode";
import {
  RouteStudiesArtifactSchema,
  routeStudiesKey,
  type StudyArtifact,
  StudyArtifactSchema,
  type StudyEventCandidate,
  StudyEventMergeArtifactSchema,
  StudyIndexArtifactSchema,
  studyArtifactKey,
  studyIndexKey,
} from "@bp/domain/studio/study";
import { defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import {
  loadStudyPanelRouteIds,
  loadStudyPanelSourceRows,
} from "@bp/pipeline-v2/local-db-aggregates";
import { Effect } from "effect";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { readJsonArtifact, writeJson } from "../../lib/json.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.ts";
import { loadRouteSpeedSpineCrosswalk } from "../../lib/route-speed-spine-crosswalk.ts";
import {
  aggregateStudyPanel,
  buildStudyArtifact,
  buildStudyArtifactCollections,
  estimateStudy,
  isoMonthFromIndex,
  monthIndex,
  PEAK_HOURS,
} from "../../lib/study-engine/index.ts";
import { segmentLaneOverlapIndex } from "../studio/_release-geometry.ts";
import type { RouteBriefInputArtifact } from "../studio/_release-types.ts";

const DEFAULT_EVENT_SET_PATH = "studio/v2/studies/study-events.json";
const DEFAULT_ROUTE_SHAPE_SNAPSHOT_PATH = "data/raw/network/current_bus_routes.json";
const DEFAULT_STOP_SNAPSHOT_PATH = "data/raw/network/current_bus_stops.json";
const READY_SPINE_STATES = new Set(["series_ready", "series_ready_with_gaps"]);

type LoadedReadySpine = Extract<
  Awaited<ReturnType<typeof loadRouteSpeedSpineCrosswalk>>,
  { status: "ready" }
>;

function windowBounds(
  candidate: StudyEventCandidate,
  analysisMonth: string,
): {
  startMonth: string;
  endMonth: string;
} {
  const implementation = monthIndex(candidate.implementationMonth);
  return {
    startMonth: isoMonthFromIndex(Math.max(monthIndex("2023-04"), implementation - 18)),
    endMonth: isoMonthFromIndex(Math.min(monthIndex(analysisMonth), implementation + 6)),
  };
}

function eventRouteExclusions(
  event: StudyEventCandidate,
  approvedEvents: readonly StudyEventCandidate[],
): Set<string> {
  const implementation = monthIndex(event.implementationMonth);
  return new Set(
    approvedEvents.flatMap((candidate) =>
      Math.abs(monthIndex(candidate.implementationMonth) - implementation) <= 9
        ? [candidate.routeId]
        : [],
    ),
  );
}

async function loadReadySpine(input: {
  artifactRoot: string;
  routeId: string;
}): Promise<LoadedReadySpine | null> {
  const loaded = await loadRouteSpeedSpineCrosswalk({
    artifactRoot: input.artifactRoot,
    routeId: input.routeId,
  });
  if (loaded.status !== "ready" || !READY_SPINE_STATES.has(loaded.audit.readiness)) return null;
  return loaded;
}

function currentRouteBriefInput(
  routeId: string,
  rows: ReturnType<typeof loadStudyPanelSourceRows>,
): RouteBriefInputArtifact {
  const latestMonth = rows
    .map((row) => row.month)
    .toSorted()
    .at(-1);
  if (latestMonth === undefined) return { segments: [] };
  const unique = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (row.routeId !== routeId || row.month !== latestMonth) continue;
    unique.set(
      serializeStudioSegmentId({
        routeId: row.routeId,
        month: row.month,
        direction: row.direction,
        stopOrder: row.stopOrder,
        fromStopId: row.fromStopId,
        toStopId: row.toStopId,
      }),
      row,
    );
  }
  return {
    analysisPeriod: latestMonth,
    segments: [...unique.entries()].map(([segmentId, row]) => ({
      segmentId,
      direction: row.direction,
      stopOrder: row.stopOrder,
    })),
  };
}

async function treatedSegments(input: {
  localPath: string;
  artifactRoot: string;
  analysisMonth: string;
  routeShapeSnapshotPath: string;
  stopSnapshotPath: string;
  candidate: StudyEventCandidate;
  spine: LoadedReadySpine;
  treatedRows: ReturnType<typeof loadStudyPanelSourceRows>;
  allowLaneFallback: boolean;
}): Promise<{
  scope: "all_route_spines" | "lane_overlap_spines" | "all_route_spines_lane_fallback";
  ids: ReadonlySet<string>;
}> {
  if (
    input.candidate.treatmentFamily !== "bus_lane" &&
    input.candidate.treatmentFamily !== "busway"
  ) {
    return {
      scope: "all_route_spines",
      ids: new Set(input.spine.artifact.segments.map((segment) => segment.segmentId)),
    };
  }
  const routeInputs = new Map<string, RouteBriefInputArtifact | null>([
    [input.candidate.routeId, currentRouteBriefInput(input.candidate.routeId, input.treatedRows)],
  ]);
  const overlaps = await segmentLaneOverlapIndex({
    localDbPath: input.localPath,
    isoMonth: input.analysisMonth,
    routeShapeSnapshotPath: input.routeShapeSnapshotPath,
    stopSnapshotPath: input.stopSnapshotPath,
    routeInputs,
  });
  const ids = new Set<string>();
  for (const [sourceId, overlap] of overlaps.get(input.candidate.routeId) ?? []) {
    if (overlap.laneMatchedCount <= 0 || overlap.laneOverlapShare <= 0) continue;
    const spineId = input.spine.crosswalk.get(sourceId);
    if (spineId !== undefined) ids.add(spineId);
  }
  if (ids.size === 0 && input.allowLaneFallback) {
    return {
      scope: "all_route_spines_lane_fallback",
      ids: new Set(input.spine.artifact.segments.map((segment) => segment.segmentId)),
    };
  }
  return { scope: "lane_overlap_spines", ids };
}

async function buildOneStudy(input: {
  local: OpenLocalPipelineDb;
  artifactRoot: string;
  analysisMonth: string;
  routeShapeSnapshotPath: string;
  stopSnapshotPath: string;
  candidateSetId: string;
  candidate: StudyEventCandidate;
  approvedEvents: readonly StudyEventCandidate[];
  allowLaneFallback?: boolean | undefined;
}): Promise<StudyArtifact | null> {
  const bounds = windowBounds(input.candidate, input.analysisMonth);
  const treatedSpine = await loadReadySpine({
    artifactRoot: input.artifactRoot,
    routeId: input.candidate.routeId,
  });
  if (treatedSpine === null) return null;
  const treatedRows = loadStudyPanelSourceRows({
    sqlite: input.local.sqlite,
    ...bounds,
    routeIds: [input.candidate.routeId],
  });
  if (treatedRows.length === 0) return null;
  const boroughs = [...new Set(treatedRows.map((row) => row.borough))].toSorted();
  const excludedControlRouteIds = eventRouteExclusions(input.candidate, input.approvedEvents);
  const candidateRouteIds = loadStudyPanelRouteIds({
    sqlite: input.local.sqlite,
    ...bounds,
    boroughs,
  }).filter(
    (routeId) => routeId !== input.candidate.routeId && !excludedControlRouteIds.has(routeId),
  );
  const controlSpines: LoadedReadySpine[] = [];
  for (const routeId of candidateRouteIds) {
    const spine = await loadReadySpine({ artifactRoot: input.artifactRoot, routeId });
    if (spine !== null) controlSpines.push(spine);
  }
  const controlRouteIds = controlSpines.map((spine) => spine.artifact.routeId);
  const allRows = [
    ...treatedRows,
    ...loadStudyPanelSourceRows({
      sqlite: input.local.sqlite,
      ...bounds,
      routeIds: controlRouteIds,
    }),
  ];
  const crosswalk = new Map(treatedSpine.crosswalk);
  for (const spine of controlSpines) {
    for (const [sourceId, spineId] of spine.crosswalk) crosswalk.set(sourceId, spineId);
  }
  const allDay = aggregateStudyPanel({ rows: allRows, spineSegmentIdBySourceId: crosswalk });
  const peak = aggregateStudyPanel({
    rows: allRows,
    spineSegmentIdBySourceId: crosswalk,
    hours: PEAK_HOURS,
  });
  const currentTreatedRows = loadStudyPanelSourceRows({
    sqlite: input.local.sqlite,
    startMonth: input.analysisMonth,
    endMonth: input.analysisMonth,
    routeIds: [input.candidate.routeId],
  });
  const treated = await treatedSegments({
    localPath: input.local.path,
    artifactRoot: input.artifactRoot,
    analysisMonth: input.analysisMonth,
    routeShapeSnapshotPath: input.routeShapeSnapshotPath,
    stopSnapshotPath: input.stopSnapshotPath,
    candidate: input.candidate,
    spine: treatedSpine,
    treatedRows: currentTreatedRows.length > 0 ? currentTreatedRows : treatedRows,
    allowLaneFallback: input.allowLaneFallback ?? false,
  });
  const estimator = estimateStudy({
    eventId: input.candidate.candidateId,
    routeId: input.candidate.routeId,
    implementationMonth: input.candidate.implementationMonth,
    analysisMonth: input.analysisMonth,
    boroughs,
    cells: allDay.cells,
    peakCells: peak.cells,
    treatedSegmentIds: treated.ids,
    excludedControlRouteIds,
  });
  return buildStudyArtifact({
    candidate: input.candidate,
    candidateSetId: input.candidateSetId,
    analysisMonth: input.analysisMonth,
    treatedSegmentScope: treated.scope,
    treatedSpineSegmentIds: [...treated.ids],
    estimator,
    allDayUnmatchedSourceRows: allDay.unmatchedSourceRowCount,
    peakUnmatchedSourceRows: peak.unmatchedSourceRowCount,
    dataWindow: bounds,
    speedSpineArtifactPaths: [treatedSpine.path, ...controlSpines.map((spine) => spine.path)],
    excludedControlRouteIds: [...excludedControlRouteIds],
  });
}

export async function writeStudyArtifactSet(input: {
  artifactRoot: string;
  analysisMonth: string;
  studies: readonly StudyArtifact[];
}): Promise<{ indexPath: string; routeRollupCount: number }> {
  const collections = buildStudyArtifactCollections(input);
  for (const study of input.studies) {
    const artifact = decodeStrict(StudyArtifactSchema)(study);
    await writeJson(join(input.artifactRoot, studyArtifactKey(study.eventKey)), artifact);
  }
  const index = decodeStrict(StudyIndexArtifactSchema)(collections.index);
  const indexPath = join(input.artifactRoot, studyIndexKey());
  await writeJson(indexPath, index);
  for (const rollup of collections.routeRollups) {
    await writeJson(
      join(input.artifactRoot, routeStudiesKey(rollup.routeSlug)),
      decodeStrict(RouteStudiesArtifactSchema)(rollup),
    );
  }
  return { indexPath, routeRollupCount: collections.routeRollups.length };
}

export async function runSegmentStudies(input: {
  local: OpenLocalPipelineDb;
  analysisMonth: string;
  artifactRoot?: string | undefined;
  eventSetPath?: string | undefined;
  event?: string | undefined;
  routeShapeSnapshotPath?: string | undefined;
  stopSnapshotPath?: string | undefined;
  buildStudy?:
    | ((input: Parameters<typeof buildOneStudy>[0]) => ReturnType<typeof buildOneStudy>)
    | undefined;
}): Promise<{
  indexPath: string;
  studyCount: number;
  ineligibleStudyCount: number;
  routeRollupCount: number;
  gatedEstimateCount: number;
  descriptiveCount: number;
  noDetectableChangeCount: number;
  laneFallbackStudyCount: number;
}> {
  monthIndex(input.analysisMonth);
  const artifactRoot = input.artifactRoot ?? defaultArtifactRootPath();
  const eventSetPath = input.eventSetPath ?? join(artifactRoot, DEFAULT_EVENT_SET_PATH);
  const eventSet = await readJsonArtifact(eventSetPath, StudyEventMergeArtifactSchema, "strict");
  if (eventSet.approvalState !== "approved" || eventSet.approvedEvents.length === 0) {
    throw new Error(
      `Study event set ${eventSetPath} is not approved; study run consumes approvedEvents only.`,
    );
  }
  const selected = eventSet.approvedEvents.filter(
    (candidate) =>
      input.event === undefined ||
      candidate.candidateId === input.event ||
      candidate.candidateId.replaceAll(":", "-").toLowerCase() === input.event,
  );
  if (input.event !== undefined && selected.length === 0) {
    throw new Error(`Approved study event not found: ${input.event}`);
  }
  const studies: StudyArtifact[] = [];
  const buildStudy = input.buildStudy ?? buildOneStudy;
  let ineligibleStudyCount = 0;
  for (const candidate of selected) {
    const study = await buildStudy({
      local: input.local,
      artifactRoot,
      analysisMonth: input.analysisMonth,
      routeShapeSnapshotPath: input.routeShapeSnapshotPath ?? DEFAULT_ROUTE_SHAPE_SNAPSHOT_PATH,
      stopSnapshotPath: input.stopSnapshotPath ?? DEFAULT_STOP_SNAPSHOT_PATH,
      candidateSetId: eventSet.candidateSetId,
      candidate,
      approvedEvents: eventSet.approvedEvents,
    });
    if (study === null) ineligibleStudyCount += 1;
    else studies.push(study);
  }
  const laneStudies = studies.filter(
    (study) => study.treatedSegmentScope === "lane_overlap_spines",
  );
  const unmappedLaneStudies = laneStudies.filter(
    (study) => study.treatedSpineSegmentIds.length === 0,
  );
  if (laneStudies.length > 0 && unmappedLaneStudies.length / laneStudies.length > 0.5) {
    for (const unmapped of unmappedLaneStudies) {
      const candidate = selected.find(
        (approvedCandidate) => approvedCandidate.candidateId === unmapped.candidateId,
      );
      if (candidate === undefined) continue;
      const rebuilt = await buildStudy({
        local: input.local,
        artifactRoot,
        analysisMonth: input.analysisMonth,
        routeShapeSnapshotPath: input.routeShapeSnapshotPath ?? DEFAULT_ROUTE_SHAPE_SNAPSHOT_PATH,
        stopSnapshotPath: input.stopSnapshotPath ?? DEFAULT_STOP_SNAPSHOT_PATH,
        candidateSetId: eventSet.candidateSetId,
        candidate,
        approvedEvents: eventSet.approvedEvents,
        allowLaneFallback: true,
      });
      if (rebuilt === null) continue;
      const studyIndex = studies.findIndex((study) => study.candidateId === unmapped.candidateId);
      if (studyIndex >= 0) studies[studyIndex] = rebuilt;
    }
  }
  const written = await writeStudyArtifactSet({
    artifactRoot,
    analysisMonth: input.analysisMonth,
    studies,
  });
  return {
    ...written,
    studyCount: studies.length,
    ineligibleStudyCount,
    gatedEstimateCount: studies.filter((study) => study.claimTier === "gated_estimate").length,
    descriptiveCount: studies.filter((study) => study.claimTier === "descriptive").length,
    noDetectableChangeCount: studies.filter((study) => study.direction === "no_detectable_change")
      .length,
    laneFallbackStudyCount: studies.filter(
      (study) => study.treatedSegmentScope === "all_route_spines_lane_fallback",
    ).length,
  };
}

export default defineCommand({
  path: ["study", "run"],
  summary: "Build approved segment-matched intervention study artifacts.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      analysisMonth: Schema.String.annotate({ description: "Study analysis cutoff month" }),
      artifactRoot: Schema.optionalKey(Schema.String).annotate({
        description: "Artifact root containing speed spines and receiving study outputs",
      }),
      eventSet: Schema.optionalKey(Schema.String).annotate({
        description: "Approved study-event merge artifact",
      }),
      event: Schema.optionalKey(Schema.String).annotate({
        description: "Run only one approved candidate id or event key",
      }),
      routeShapeSnapshot: Schema.String.pipe(
        Schema.withDecodingDefaultTypeKey(Effect.succeed(DEFAULT_ROUTE_SHAPE_SNAPSHOT_PATH)),
      ),
      stopSnapshot: Schema.String.pipe(
        Schema.withDecodingDefaultTypeKey(Effect.succeed(DEFAULT_STOP_SNAPSHOT_PATH)),
      ),
    }),
  },
  output: Schema.Struct({
    indexPath: Schema.String,
    studyCount: Schema.Number,
    ineligibleStudyCount: Schema.Number,
    routeRollupCount: Schema.Number,
    gatedEstimateCount: Schema.Number,
    descriptiveCount: Schema.Number,
    noDetectableChangeCount: Schema.Number,
    laneFallbackStudyCount: Schema.Number,
  }),
  run({ input }) {
    const options = input.options;
    return runLocalDbCommandBoundary({
      dbPath: options.db,
      localDbOptions: { readonly: true },
      command: "study.run",
      operation: "runSegmentStudies",
      run: (local) =>
        runSegmentStudies({
          local,
          analysisMonth: options.analysisMonth,
          artifactRoot:
            options.artifactRoot === undefined ? undefined : fromCliPath(options.artifactRoot),
          eventSetPath: options.eventSet === undefined ? undefined : fromCliPath(options.eventSet),
          event: options.event,
          routeShapeSnapshotPath: fromCliPath(options.routeShapeSnapshot),
          stopSnapshotPath: fromCliPath(options.stopSnapshot),
        }),
    });
  },
});
