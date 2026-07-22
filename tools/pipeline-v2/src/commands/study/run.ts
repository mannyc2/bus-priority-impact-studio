import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { serializeStudioSegmentId } from "@bp/analytics/feature-history";
import { decodeStrict } from "@bp/domain/decode";
import {
  RouteStudiesArtifactSchema,
  routeStudiesKey,
  type StudyArtifact,
  StudyArtifactSchema,
  type StudyEventCandidateV3,
  type StudyEventCandidateV4,
  StudyEventMergeArtifactV3ApprovedSchema,
  StudyEventMergeArtifactV4ApprovedSchema,
  StudyEventMergeArtifactV5ApprovedSchema,
  StudyIndexArtifactSchema,
  type StudyPhysicalScopeBindingsArtifact,
  StudyPhysicalScopeBindingsArtifactSchema,
  type StudyPhysicalScopeBindingsArtifactV2,
  StudyPhysicalScopeBindingsArtifactV2Schema,
  StudyReviewInputsArtifactV1Schema,
  studyArtifactKey,
  studyIndexKey,
} from "@bp/domain/studio/study";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import {
  loadStudyPanelRouteIds,
  loadStudyPanelSourceRows,
} from "@bp/pipeline-v2/local-db-aggregates";
import { Effect } from "effect";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { readJsonArtifact, writeJson } from "../../lib/json.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, fromRepoRoot } from "../../lib/paths.ts";
import { loadRouteSpeedSpineCrosswalk } from "../../lib/route-speed-spine-crosswalk.ts";
import {
  admitStudyMemberTreatmentScope,
  admitStudyTreatmentScope,
  aggregateStudyPanel,
  buildStudyArtifact,
  buildStudyArtifactCollections,
  estimateStudy,
  eventRouteExclusions,
  isoMonthFromIndex,
  monthIndex,
  PEAK_HOURS,
  type StudyMemberTreatmentScopeAdmission,
  type StudyTreatmentScopeAdmission,
} from "../../lib/study-engine/index.ts";
import { validateStudyPhysicalScopeBindingsArtifactV2 } from "../../lib/study-engine/scope.ts";
import {
  validateStudyEventMergeArtifactV4,
  validateStudyEventMergeArtifactV5,
} from "../../lib/study-engine/study-events.ts";
import { segmentLaneOverlapIndex } from "../studio/_release-geometry.ts";
import type { RouteBriefInputArtifact } from "../studio/_release-types.ts";
import { buildStudyReviewInputsArtifact } from "./snapshot-review-inputs.ts";

const DEFAULT_EVENT_SET_PATH = "studio/v2/studies/study-events.json";
const DEFAULT_BUS_LANE_SNAPSHOT_PATH = "data/raw/interventions/bus-lanes-local-streets.json";
const DEFAULT_ROUTE_SHAPE_SNAPSHOT_PATH = "data/raw/network/current_bus_routes.json";
const DEFAULT_STOP_SNAPSHOT_PATH = "data/raw/network/current_bus_stops.json";
const READY_SPINE_STATES = new Set(["series_ready", "series_ready_with_gaps"]);

type LoadedReadySpine = Extract<
  Awaited<ReturnType<typeof loadRouteSpeedSpineCrosswalk>>,
  { status: "ready" }
>;
type StudyRunCandidate = StudyEventCandidateV3 | StudyEventCandidateV4;
type AdmittedStudyScope =
  | Extract<StudyTreatmentScopeAdmission, { status: "admitted" }>
  | Extract<StudyMemberTreatmentScopeAdmission, { status: "admitted" }>;

function windowBounds(
  candidate: StudyRunCandidate,
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

async function assertFileSha256(path: string, expected: string, label: string): Promise<void> {
  const actual = createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
  if (actual !== expected) {
    throw new Error(`${label} SHA-256 mismatch: expected ${expected}, received ${actual}`);
  }
}

function segmentBindingKey(input: {
  readonly sourceSegmentId: string;
  readonly spineSegmentId: string;
}): string {
  return `${input.sourceSegmentId}|${input.spineSegmentId}`;
}

async function treatedSegments(input: {
  localPath: string;
  analysisMonth: string;
  busLaneSnapshotPath: string;
  routeShapeSnapshotPath: string;
  stopSnapshotPath: string;
  candidate: StudyRunCandidate;
  spine: LoadedReadySpine;
  treatedRows: ReturnType<typeof loadStudyPanelSourceRows>;
  scopeAdmission: AdmittedStudyScope;
  scopeBindingArtifact:
    | StudyPhysicalScopeBindingsArtifact
    | StudyPhysicalScopeBindingsArtifactV2
    | null;
}): Promise<{
  scope: "all_route_spines" | "lane_overlap_spines";
  ids: ReadonlySet<string>;
}> {
  if (input.scopeAdmission.scope === "all_route_spines") {
    return {
      scope: "all_route_spines",
      ids: new Set(input.spine.artifact.segments.map((segment) => segment.segmentId)),
    };
  }
  const bindingArtifact = input.scopeBindingArtifact;
  if (bindingArtifact === null) {
    throw new Error(`Missing physical-scope binding artifact for ${input.candidate.candidateId}`);
  }
  const bindings =
    "binding" in input.scopeAdmission
      ? [input.scopeAdmission.binding]
      : "bindings" in input.scopeAdmission
        ? input.scopeAdmission.bindings
        : [];
  if (bindings.length === 0) {
    throw new Error(`Missing exact member binding for ${input.candidate.candidateId}`);
  }
  await Promise.all([
    assertFileSha256(
      input.busLaneSnapshotPath,
      bindingArtifact.inputs.busLaneSnapshotSha256,
      "Bus-lane source snapshot",
    ),
    assertFileSha256(
      input.routeShapeSnapshotPath,
      bindingArtifact.inputs.routeShapeSnapshotSha256,
      "Route-shape source snapshot",
    ),
    assertFileSha256(
      input.stopSnapshotPath,
      bindingArtifact.inputs.stopSnapshotSha256,
      "Stop source snapshot",
    ),
    ...bindings.map((binding) =>
      assertFileSha256(input.spine.path, binding.speedSpineSha256, "Route speed-spine artifact"),
    ),
  ]);
  const routeInputs = new Map<string, RouteBriefInputArtifact | null>([
    [input.candidate.routeId, currentRouteBriefInput(input.candidate.routeId, input.treatedRows)],
  ]);
  const overlaps = await segmentLaneOverlapIndex({
    localDbPath: input.localPath,
    isoMonth: input.analysisMonth,
    routeShapeSnapshotPath: input.routeShapeSnapshotPath,
    stopSnapshotPath: input.stopSnapshotPath,
    routeInputs,
    allowedLaneSegmentIdsByRoute: new Map([
      [input.candidate.routeId, new Set(bindings.flatMap((binding) => binding.geometryFeatureIds))],
    ]),
  });
  const actualBindings: Array<{ sourceSegmentId: string; spineSegmentId: string }> = [];
  for (const [sourceSegmentId, overlap] of overlaps.get(input.candidate.routeId) ?? []) {
    if (overlap.laneMatchedCount <= 0 || overlap.laneOverlapShare <= 0) continue;
    const spineSegmentId = input.spine.crosswalk.get(sourceSegmentId);
    if (spineSegmentId !== undefined) actualBindings.push({ sourceSegmentId, spineSegmentId });
  }
  const actualKeys = actualBindings.map(segmentBindingKey).toSorted();
  const expectedKeys = [
    ...new Set(bindings.flatMap((binding) => binding.segmentBindings.map(segmentBindingKey))),
  ].toSorted();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error(
      `Exact physical-scope mapping drift for ${input.candidate.candidateId}: expected ${expectedKeys.join(", ") || "none"}; received ${actualKeys.join(", ") || "none"}`,
    );
  }
  return {
    scope: "lane_overlap_spines",
    ids: new Set(actualBindings.map((row) => row.spineSegmentId)),
  };
}

async function buildOneStudy(input: {
  local: OpenLocalPipelineDb;
  artifactRoot: string;
  analysisMonth: string;
  busLaneSnapshotPath: string;
  routeShapeSnapshotPath: string;
  stopSnapshotPath: string;
  candidateSetId: string;
  reviewCutId?: string | undefined;
  candidate: StudyRunCandidate;
  interferenceEvents: readonly StudyRunCandidate[];
  scopeAdmission: AdmittedStudyScope;
  scopeBindingArtifact:
    | StudyPhysicalScopeBindingsArtifact
    | StudyPhysicalScopeBindingsArtifactV2
    | null;
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
  const currentTreatedRows = loadStudyPanelSourceRows({
    sqlite: input.local.sqlite,
    startMonth: input.analysisMonth,
    endMonth: input.analysisMonth,
    routeIds: [input.candidate.routeId],
  });
  const treated = await treatedSegments({
    localPath: input.local.path,
    analysisMonth: input.analysisMonth,
    busLaneSnapshotPath: input.busLaneSnapshotPath,
    routeShapeSnapshotPath: input.routeShapeSnapshotPath,
    stopSnapshotPath: input.stopSnapshotPath,
    candidate: input.candidate,
    spine: treatedSpine,
    treatedRows: currentTreatedRows.length > 0 ? currentTreatedRows : treatedRows,
    scopeAdmission: input.scopeAdmission,
    scopeBindingArtifact: input.scopeBindingArtifact,
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
    reviewCutId: input.reviewCutId,
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

type ApprovedV3EventSet = typeof StudyEventMergeArtifactV3ApprovedSchema.Type;
type ApprovedV4EventSet = typeof StudyEventMergeArtifactV4ApprovedSchema.Type;
type ApprovedV5EventSet = typeof StudyEventMergeArtifactV5ApprovedSchema.Type;
type ApprovedEventSet = ApprovedV3EventSet | ApprovedV4EventSet | ApprovedV5EventSet;

function scopeBindingIndex(input: {
  artifact: StudyPhysicalScopeBindingsArtifact;
  eventSet: ApprovedV3EventSet | ApprovedV4EventSet;
  analysisMonth: string;
}): ReadonlyMap<string, StudyPhysicalScopeBindingsArtifact["bindings"][number]> {
  if (input.artifact.candidateSetId !== input.eventSet.candidateSetId) {
    throw new Error(
      `Physical-scope binding artifact is stale: expected ${input.eventSet.candidateSetId}, received ${input.artifact.candidateSetId}`,
    );
  }
  if (input.artifact.analysisMonth !== input.analysisMonth) {
    throw new Error(
      `Physical-scope binding analysis month mismatch: expected ${input.analysisMonth}, received ${input.artifact.analysisMonth}`,
    );
  }
  if (
    input.artifact.sourceRelease.releaseId !== input.eventSet.wikiInput.releaseId ||
    input.artifact.sourceRelease.manifestSha256 !== input.eventSet.wikiInput.manifestSha256 ||
    input.artifact.sourceRelease.occurrencesSha256 !== input.eventSet.wikiInput.artifactSha256
  ) {
    throw new Error("Physical-scope binding source release does not match the approved event set");
  }
  const candidateIds = new Set(input.eventSet.candidates.map((candidate) => candidate.candidateId));
  const bindings = new Map<string, StudyPhysicalScopeBindingsArtifact["bindings"][number]>();
  for (const binding of input.artifact.bindings) {
    if (!candidateIds.has(binding.candidateId)) {
      throw new Error(`Physical-scope binding references unknown candidate ${binding.candidateId}`);
    }
    if (bindings.has(binding.candidateId)) {
      throw new Error(`Duplicate physical-scope binding for ${binding.candidateId}`);
    }
    bindings.set(binding.candidateId, binding);
  }
  return bindings;
}

export async function runSegmentStudies(input: {
  local: OpenLocalPipelineDb;
  analysisMonth: string;
  artifactRoot?: string | undefined;
  focusedArtifactRoot?: string | undefined;
  eventSetPath?: string | undefined;
  reviewInputsPath?: string | undefined;
  availabilityPath?: string | undefined;
  spineManifestPath?: string | undefined;
  scopeBindingsPath?: string | undefined;
  legacyV3EventSet?: boolean | undefined;
  event?: string | undefined;
  busLaneSnapshotPath?: string | undefined;
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
  scopeIneligibleStudyCount: number;
  boundedScopeBindingRequiredCount: number;
  boundedScopeBindingMismatchCount: number;
  boundedScopeEvidenceMissingCount: number;
  routeWideEvidenceMissingCount: number;
  memberExtentIneligibleCount: number;
  unsupportedMemberScopeCount: number;
}> {
  monthIndex(input.analysisMonth);
  const completeArtifactRoot = input.artifactRoot ?? defaultArtifactRootPath();
  if (input.event !== undefined && input.focusedArtifactRoot === undefined) {
    throw new Error("Focused study runs require --focused-artifact-root");
  }
  const outputArtifactRoot = input.focusedArtifactRoot ?? completeArtifactRoot;
  const eventSetPath = input.eventSetPath ?? join(completeArtifactRoot, DEFAULT_EVENT_SET_PATH);
  const useLegacyV3 = input.legacyV3EventSet === true || input.reviewInputsPath === undefined;
  const eventSet: ApprovedEventSet = useLegacyV3
    ? await readJsonArtifact(eventSetPath, StudyEventMergeArtifactV3ApprovedSchema, "strict")
    : await (async () => {
        const loaded = await readJsonArtifact(
          eventSetPath,
          Schema.Union([
            StudyEventMergeArtifactV4ApprovedSchema,
            StudyEventMergeArtifactV5ApprovedSchema,
          ]),
          "strict",
        );
        if (loaded.artifactKind === "bp.studio.study_events.v4") {
          validateStudyEventMergeArtifactV4(loaded);
        } else {
          validateStudyEventMergeArtifactV5(loaded);
        }
        return loaded;
      })();
  if (
    eventSet.artifactKind === "bp.studio.study_events.v4" ||
    eventSet.artifactKind === "bp.studio.study_events.v5"
  ) {
    if (
      input.reviewInputsPath === undefined ||
      input.availabilityPath === undefined ||
      input.spineManifestPath === undefined ||
      input.scopeBindingsPath === undefined
    ) {
      throw new Error(
        "v4/v5 study runs require --review-inputs, --availability, --spine-manifest, and --scope-bindings",
      );
    }
    if (input.analysisMonth !== eventSet.reviewInputs.analysisMonth) {
      throw new Error(
        `Study analysis month is outside the approved review cut: expected ${eventSet.reviewInputs.analysisMonth}, received ${input.analysisMonth}`,
      );
    }
    const pinnedReviewInputs = await readJsonArtifact(
      input.reviewInputsPath,
      StudyReviewInputsArtifactV1Schema,
      "strict",
    );
    if (!isDeepStrictEqual(pinnedReviewInputs, eventSet.reviewInputs)) {
      throw new Error("External review-input receipt does not match the approved review cut");
    }
    const currentReviewInputs = await buildStudyReviewInputsArtifact({
      local: input.local,
      analysisMonth: input.analysisMonth,
      availabilityPath: input.availabilityPath,
      spineManifestPath: input.spineManifestPath,
      scopeBindingsPath: input.scopeBindingsPath,
    });
    if (!isDeepStrictEqual(currentReviewInputs, eventSet.reviewInputs)) {
      throw new Error(
        "Current outcome, spine, scope, or engine inputs do not match the approved review cut",
      );
    }
  }
  if (eventSet.approvedEvents.length === 0) {
    throw new Error(`Exact-route approved study event set ${eventSetPath} has no approved events.`);
  }
  const scopeBindingArtifact =
    input.scopeBindingsPath === undefined
      ? null
      : await readJsonArtifact(
          input.scopeBindingsPath,
          eventSet.artifactKind === "bp.studio.study_events.v5"
            ? StudyPhysicalScopeBindingsArtifactV2Schema
            : StudyPhysicalScopeBindingsArtifactSchema,
          "strict",
        );
  const legacyScopeBindings =
    scopeBindingArtifact === null ||
    scopeBindingArtifact.artifactKind !== "bp.studio.study_physical_scope_bindings.v1"
      ? new Map<string, StudyPhysicalScopeBindingsArtifact["bindings"][number]>()
      : scopeBindingIndex({
          artifact: scopeBindingArtifact,
          eventSet: eventSet as ApprovedV3EventSet | ApprovedV4EventSet,
          analysisMonth: input.analysisMonth,
        });
  const memberScopeBindingArtifact =
    scopeBindingArtifact?.artifactKind === "bp.studio.study_physical_scope_bindings.v2"
      ? scopeBindingArtifact
      : null;
  if (eventSet.artifactKind === "bp.studio.study_events.v5") {
    if (memberScopeBindingArtifact === null) {
      throw new Error("Member-grain v5 study runs require v2 physical-scope bindings");
    }
    if (memberScopeBindingArtifact.analysisMonth !== input.analysisMonth) {
      throw new Error(
        `Member scope-binding analysis month mismatch: expected ${input.analysisMonth}, received ${memberScopeBindingArtifact.analysisMonth}`,
      );
    }
    validateStudyPhysicalScopeBindingsArtifactV2({
      artifact: memberScopeBindingArtifact,
      candidateSetId: eventSet.candidateSetId,
      candidates: eventSet.candidates,
      sourceRelease: {
        releaseId: eventSet.wikiInput.releaseId,
        manifestSha256: eventSet.wikiInput.manifestSha256,
        occurrencesSha256: eventSet.wikiInput.artifactSha256,
        memberExtentManifestSha256: eventSet.wikiInput.memberExtent.manifestSha256,
        memberExtentProjectionSha256: eventSet.wikiInput.memberExtent.projectionSha256,
      },
    });
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
  let boundedScopeBindingMismatchCount = 0;
  let boundedScopeEvidenceMissingCount = 0;
  let routeWideEvidenceMissingCount = 0;
  let memberExtentIneligibleCount = 0;
  let unsupportedMemberScopeCount = 0;
  for (const candidate of selected) {
    const scopeAdmission =
      eventSet.artifactKind === "bp.studio.study_events.v5"
        ? admitStudyMemberTreatmentScope(candidate as StudyEventCandidateV4, {
            artifact: memberScopeBindingArtifact as StudyPhysicalScopeBindingsArtifactV2,
            candidateSetId: eventSet.candidateSetId,
          })
        : admitStudyTreatmentScope(
            candidate as StudyEventCandidateV3,
            legacyScopeBindings.get(candidate.candidateId),
          );
    if (scopeAdmission.status === "rejected") {
      ineligibleStudyCount += 1;
      if (scopeAdmission.reason === "bounded_scope_binding_required") {
        boundedScopeBindingRequiredCount += 1;
      } else if (scopeAdmission.reason === "bounded_scope_binding_mismatch") {
        boundedScopeBindingMismatchCount += 1;
      } else if (scopeAdmission.reason === "bounded_scope_evidence_missing") {
        boundedScopeEvidenceMissingCount += 1;
      } else if (scopeAdmission.reason === "route_wide_evidence_missing") {
        routeWideEvidenceMissingCount += 1;
      } else if (
        scopeAdmission.reason === "bounded_member_scope_binding_required" ||
        scopeAdmission.reason === "bounded_member_scope_binding_duplicate" ||
        scopeAdmission.reason === "bounded_member_scope_binding_mismatch" ||
        scopeAdmission.reason === "member_scope_binding_candidate_set_mismatch"
      ) {
        boundedScopeBindingMismatchCount += 1;
      } else if (
        scopeAdmission.reason === "member_extent_stop_set_unsupported" ||
        scopeAdmission.reason === "member_extent_mixed_unsupported" ||
        scopeAdmission.reason === "heterogeneous_member_scope_unsupported"
      ) {
        unsupportedMemberScopeCount += 1;
      } else {
        memberExtentIneligibleCount += 1;
      }
      continue;
    }
    const study = await buildStudy({
      local: input.local,
      artifactRoot: completeArtifactRoot,
      analysisMonth: input.analysisMonth,
      busLaneSnapshotPath:
        input.busLaneSnapshotPath ?? fromRepoRoot(DEFAULT_BUS_LANE_SNAPSHOT_PATH),
      routeShapeSnapshotPath:
        input.routeShapeSnapshotPath ?? fromRepoRoot(DEFAULT_ROUTE_SHAPE_SNAPSHOT_PATH),
      stopSnapshotPath: input.stopSnapshotPath ?? fromRepoRoot(DEFAULT_STOP_SNAPSHOT_PATH),
      candidateSetId: eventSet.candidateSetId,
      reviewCutId:
        eventSet.artifactKind === "bp.studio.study_events.v4" ||
        eventSet.artifactKind === "bp.studio.study_events.v5"
          ? eventSet.reviewCutId
          : undefined,
      candidate,
      interferenceEvents: eventSet.candidates,
      scopeAdmission,
      scopeBindingArtifact,
    });
    if (study === null) ineligibleStudyCount += 1;
    else studies.push(study);
  }
  const written = await writeStudyArtifactSet({
    artifactRoot: outputArtifactRoot,
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
      boundedScopeBindingMismatchCount +
      boundedScopeEvidenceMissingCount +
      routeWideEvidenceMissingCount +
      memberExtentIneligibleCount +
      unsupportedMemberScopeCount,
    boundedScopeBindingRequiredCount,
    boundedScopeBindingMismatchCount,
    boundedScopeEvidenceMissingCount,
    routeWideEvidenceMissingCount,
    memberExtentIneligibleCount,
    unsupportedMemberScopeCount,
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
      focusedArtifactRoot: Schema.optionalKey(Schema.String).annotate({
        description: "Required isolated output root for a focused --event run",
      }),
      eventSet: Schema.optionalKey(Schema.String).annotate({
        description: "Approved study-event merge artifact",
      }),
      reviewInputs: Schema.optionalKey(Schema.String).annotate({
        description: "Exact review-input receipt embedded in the approved v4 review cut",
      }),
      availability: Schema.optionalKey(Schema.String).annotate({
        description: "Pinned official route-speed availability artifact",
      }),
      spineManifest: Schema.optionalKey(Schema.String).annotate({
        description: "Full route-speed-spine manifest bound by the review cut",
      }),
      scopeBindings: Schema.optionalKey(Schema.String).annotate({
        description: "Candidate-set-bound exact physical-scope binding artifact",
      }),
      event: Schema.optionalKey(Schema.String).annotate({
        description: "Run only one approved candidate id or event key",
      }),
      legacyV3EventSet: arg
        .boolean()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(false)))
        .annotate({
          description: "Explicit historical replay mode for approved v3 event sets",
        }),
      busLaneSnapshot: Schema.optionalKey(Schema.String).annotate({
        description: "Hash-pinned NYC DOT bus-lane source snapshot",
      }),
      routeShapeSnapshot: Schema.optionalKey(Schema.String).annotate({
        description: "Hash-pinned current route-shape source snapshot",
      }),
      stopSnapshot: Schema.optionalKey(Schema.String).annotate({
        description: "Hash-pinned current stop source snapshot",
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
    boundedScopeBindingMismatchCount: Schema.Number,
    boundedScopeEvidenceMissingCount: Schema.Number,
    routeWideEvidenceMissingCount: Schema.Number,
    memberExtentIneligibleCount: Schema.Number,
    unsupportedMemberScopeCount: Schema.Number,
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
          focusedArtifactRoot:
            options.focusedArtifactRoot === undefined
              ? undefined
              : fromCliPath(options.focusedArtifactRoot),
          eventSetPath: options.eventSet === undefined ? undefined : fromCliPath(options.eventSet),
          reviewInputsPath:
            options.reviewInputs === undefined ? undefined : fromCliPath(options.reviewInputs),
          availabilityPath:
            options.availability === undefined ? undefined : fromCliPath(options.availability),
          spineManifestPath:
            options.spineManifest === undefined ? undefined : fromCliPath(options.spineManifest),
          scopeBindingsPath:
            options.scopeBindings === undefined ? undefined : fromCliPath(options.scopeBindings),
          event: options.event,
          legacyV3EventSet: options.legacyV3EventSet,
          busLaneSnapshotPath:
            options.busLaneSnapshot === undefined
              ? undefined
              : fromCliPath(options.busLaneSnapshot),
          routeShapeSnapshotPath:
            options.routeShapeSnapshot === undefined
              ? undefined
              : fromCliPath(options.routeShapeSnapshot),
          stopSnapshotPath:
            options.stopSnapshot === undefined ? undefined : fromCliPath(options.stopSnapshot),
        }),
    });
  },
});
