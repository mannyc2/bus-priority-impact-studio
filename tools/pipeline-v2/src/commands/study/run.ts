import { join } from "node:path";
import { decodeStrict } from "@bp/domain/decode";
import {
  RouteStudiesArtifactSchema,
  routeStudiesKey,
  type StudyArtifact,
  StudyArtifactSchema,
  type StudyEventCandidateV3,
  StudyEventMergeArtifactV3ApprovedSchema,
  StudyIndexArtifactSchema,
  studyArtifactKey,
  studyIndexKey,
} from "@bp/domain/studio/study";
import { defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import {
  loadStudyPanelRouteIds,
  loadStudyPanelSourceRows,
} from "@bp/pipeline-v2/local-db-aggregates";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { readJsonArtifact, writeJson } from "../../lib/json.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.ts";
import { loadRouteSpeedSpineCrosswalk } from "../../lib/route-speed-spine-crosswalk.ts";
import {
  admitStudyTreatmentScope,
  aggregateStudyPanel,
  buildStudyArtifact,
  buildStudyArtifactCollections,
  estimateStudy,
  eventRouteExclusions,
  isoMonthFromIndex,
  monthIndex,
  PEAK_HOURS,
} from "../../lib/study-engine/index.ts";

const DEFAULT_EVENT_SET_PATH = "studio/v2/studies/study-events.json";
const READY_SPINE_STATES = new Set(["series_ready", "series_ready_with_gaps"]);

type LoadedReadySpine = Extract<
  Awaited<ReturnType<typeof loadRouteSpeedSpineCrosswalk>>,
  { status: "ready" }
>;

function windowBounds(
  candidate: StudyEventCandidateV3,
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

async function buildOneStudy(input: {
  local: OpenLocalPipelineDb;
  artifactRoot: string;
  analysisMonth: string;
  candidateSetId: string;
  candidate: StudyEventCandidateV3;
  interferenceEvents: readonly StudyEventCandidateV3[];
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
  const excludedControlRouteIds = eventRouteExclusions(input.candidate, input.interferenceEvents);
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
  const treatedSpineSegmentIds = new Set(
    treatedSpine.artifact.segments.map((segment) => segment.segmentId),
  );
  const estimator = estimateStudy({
    eventId: input.candidate.candidateId,
    routeId: input.candidate.routeId,
    implementationMonth: input.candidate.implementationMonth,
    analysisMonth: input.analysisMonth,
    boroughs,
    cells: allDay.cells,
    peakCells: peak.cells,
    treatedSegmentIds: treatedSpineSegmentIds,
    excludedControlRouteIds,
  });
  return buildStudyArtifact({
    candidate: input.candidate,
    candidateSetId: input.candidateSetId,
    analysisMonth: input.analysisMonth,
    treatedSegmentScope: "all_route_spines",
    treatedSpineSegmentIds: [...treatedSpineSegmentIds],
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
  scopeIneligibleStudyCount: number;
  boundedScopeBindingRequiredCount: number;
  boundedScopeEvidenceMissingCount: number;
  routeWideEvidenceMissingCount: number;
}> {
  monthIndex(input.analysisMonth);
  const artifactRoot = input.artifactRoot ?? defaultArtifactRootPath();
  const eventSetPath = input.eventSetPath ?? join(artifactRoot, DEFAULT_EVENT_SET_PATH);
  const eventSet = await readJsonArtifact(
    eventSetPath,
    StudyEventMergeArtifactV3ApprovedSchema,
    "strict",
  );
  if (eventSet.approvedEvents.length === 0) {
    throw new Error(`Exact-route v3 study event set ${eventSetPath} has no approved events.`);
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
  let boundedScopeBindingRequiredCount = 0;
  let boundedScopeEvidenceMissingCount = 0;
  let routeWideEvidenceMissingCount = 0;
  for (const candidate of selected) {
    const scopeAdmission = admitStudyTreatmentScope(candidate);
    if (scopeAdmission.status === "rejected") {
      ineligibleStudyCount += 1;
      if (scopeAdmission.reason === "bounded_scope_binding_required") {
        boundedScopeBindingRequiredCount += 1;
      } else if (scopeAdmission.reason === "bounded_scope_evidence_missing") {
        boundedScopeEvidenceMissingCount += 1;
      } else {
        routeWideEvidenceMissingCount += 1;
      }
      continue;
    }
    const study = await buildStudy({
      local: input.local,
      artifactRoot,
      analysisMonth: input.analysisMonth,
      candidateSetId: eventSet.candidateSetId,
      candidate,
      interferenceEvents: eventSet.candidates,
    });
    if (study === null) ineligibleStudyCount += 1;
    else studies.push(study);
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
    scopeIneligibleStudyCount:
      boundedScopeBindingRequiredCount +
      boundedScopeEvidenceMissingCount +
      routeWideEvidenceMissingCount,
    boundedScopeBindingRequiredCount,
    boundedScopeEvidenceMissingCount,
    routeWideEvidenceMissingCount,
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
    scopeIneligibleStudyCount: Schema.Number,
    boundedScopeBindingRequiredCount: Schema.Number,
    boundedScopeEvidenceMissingCount: Schema.Number,
    routeWideEvidenceMissingCount: Schema.Number,
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
        }),
    });
  },
});
