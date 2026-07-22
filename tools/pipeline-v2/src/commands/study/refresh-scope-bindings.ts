import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { serializeStudioSegmentId } from "@bp/analytics/feature-history";
import {
  type StudyEventCandidateV3,
  StudyEventMergeArtifactV3Schema,
  type StudyPhysicalScopeBindingsArtifact,
  StudyPhysicalScopeBindingsArtifactSchema,
} from "@bp/domain/studio/study";
import { defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { loadStudyPanelSourceRows } from "@bp/pipeline-v2/local-db-aggregates";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { readJsonArtifact, writeJson } from "../../lib/json.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { fromCliPath } from "../../lib/paths.ts";
import { loadRouteSpeedSpineCrosswalk } from "../../lib/route-speed-spine-crosswalk.ts";
import { segmentLaneOverlapIndex } from "../studio/_release-geometry.ts";
import type { RouteBriefInputArtifact } from "../studio/_release-types.ts";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function currentRouteBriefInput(
  routeId: string,
  rows: ReturnType<typeof loadStudyPanelSourceRows>,
): RouteBriefInputArtifact {
  const unique = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (row.routeId !== routeId) continue;
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
  const analysisPeriod = rows[0]?.month;
  if (analysisPeriod === undefined) throw new Error(`No current route rows for ${routeId}`);
  return {
    analysisPeriod,
    segments: [...unique.entries()].map(([segmentId, row]) => ({
      segmentId,
      direction: row.direction,
      stopOrder: row.stopOrder,
    })),
  };
}

function assertCandidateBinding(
  candidate: StudyEventCandidateV3,
  binding: {
    routeId: string;
    occurrenceId: string;
    physicalScopeRecordIds: readonly string[];
  },
): void {
  if (candidate.routeId !== binding.routeId || candidate.occurrenceId !== binding.occurrenceId) {
    throw new Error(`Scope binding identity drift for ${candidate.candidateId}`);
  }
  const wikiRows = candidate.provenance.filter((row) => row.sourceKind === "mta_wiki");
  for (const scopeId of binding.physicalScopeRecordIds) {
    if (!wikiRows.some((row) => row.physicalScopeRecordIds.includes(scopeId))) {
      throw new Error(`Scope binding ${candidate.candidateId} lacks pinned scope ${scopeId}`);
    }
  }
}

export async function refreshStudyScopeBindings(input: {
  local: OpenLocalPipelineDb;
  priorPath: string;
  eventSetPath: string;
  analysisMonth: string;
  artifactRoot: string;
  busLaneSnapshotPath: string;
  routeShapeSnapshotPath: string;
  stopSnapshotPath: string;
}): Promise<StudyPhysicalScopeBindingsArtifact> {
  const [prior, eventSet, busLaneBytes, routeShapeBytes, stopBytes] = await Promise.all([
    readJsonArtifact(input.priorPath, StudyPhysicalScopeBindingsArtifactSchema, "strict"),
    readJsonArtifact(input.eventSetPath, StudyEventMergeArtifactV3Schema, "strict"),
    readFile(input.busLaneSnapshotPath),
    readFile(input.routeShapeSnapshotPath),
    readFile(input.stopSnapshotPath),
  ]);
  if (prior.candidateSetId !== eventSet.candidateSetId) {
    throw new Error("Prior scope artifact and event set do not share one candidate universe");
  }
  const snapshotHashes = {
    busLaneSnapshotSha256: sha256(busLaneBytes),
    routeShapeSnapshotSha256: sha256(routeShapeBytes),
    stopSnapshotSha256: sha256(stopBytes),
  };
  if (
    snapshotHashes.busLaneSnapshotSha256 !== prior.inputs.busLaneSnapshotSha256 ||
    snapshotHashes.routeShapeSnapshotSha256 !== prior.inputs.routeShapeSnapshotSha256 ||
    snapshotHashes.stopSnapshotSha256 !== prior.inputs.stopSnapshotSha256
  ) {
    throw new Error("Scope source snapshots differ from the previously reviewed exact geometry");
  }
  const candidates = new Map(
    eventSet.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const routeInputs = new Map<string, RouteBriefInputArtifact>();
  const allowedLaneSegmentIdsByRoute = new Map<string, ReadonlySet<string>>();
  const spines = new Map<string, Awaited<ReturnType<typeof loadRouteSpeedSpineCrosswalk>>>();
  for (const binding of prior.bindings) {
    const candidate = candidates.get(binding.candidateId);
    if (candidate === undefined) throw new Error(`Unknown scope candidate ${binding.candidateId}`);
    assertCandidateBinding(candidate, binding);
    const rows = loadStudyPanelSourceRows({
      sqlite: input.local.sqlite,
      startMonth: input.analysisMonth,
      endMonth: input.analysisMonth,
      routeIds: [binding.routeId],
    });
    if (rows.length === 0)
      throw new Error(`No ${input.analysisMonth} scope rows for ${binding.routeId}`);
    routeInputs.set(binding.routeId, currentRouteBriefInput(binding.routeId, rows));
    allowedLaneSegmentIdsByRoute.set(binding.routeId, new Set(binding.geometryFeatureIds));
    const spine = await loadRouteSpeedSpineCrosswalk({
      artifactRoot: input.artifactRoot,
      routeId: binding.routeId,
      requireSpine: true,
    });
    if (spine.status !== "ready") throw new Error(`Missing refreshed spine for ${binding.routeId}`);
    spines.set(binding.routeId, spine);
  }
  const overlaps = await segmentLaneOverlapIndex({
    localDbPath: input.local.path,
    isoMonth: input.analysisMonth,
    routeShapeSnapshotPath: input.routeShapeSnapshotPath,
    stopSnapshotPath: input.stopSnapshotPath,
    routeInputs,
    allowedLaneSegmentIdsByRoute,
  });
  const bindings = await Promise.all(
    prior.bindings.map(async (binding) => {
      const spine = spines.get(binding.routeId);
      if (spine?.status !== "ready") throw new Error(`Missing loaded spine for ${binding.routeId}`);
      const segmentBindings = [...(overlaps.get(binding.routeId) ?? [])]
        .filter(([, overlap]) => overlap.laneMatchedCount > 0 && overlap.laneOverlapShare > 0)
        .flatMap(([sourceSegmentId]) => {
          const spineSegmentId = spine.crosswalk.get(sourceSegmentId);
          return spineSegmentId === undefined ? [] : [{ sourceSegmentId, spineSegmentId }];
        })
        .toSorted(
          (left, right) =>
            left.sourceSegmentId.localeCompare(right.sourceSegmentId) ||
            left.spineSegmentId.localeCompare(right.spineSegmentId),
        );
      if (segmentBindings.length === 0) {
        throw new Error(`No exact refreshed scope mapping for ${binding.candidateId}`);
      }
      return {
        ...binding,
        speedSpineSha256: sha256(await readFile(spine.path)),
        segmentBindings,
      };
    }),
  );
  return {
    artifactKind: "bp.studio.study_physical_scope_bindings.v1",
    schemaVersion: 1,
    candidateSetId: eventSet.candidateSetId,
    analysisMonth: input.analysisMonth,
    sourceRelease: prior.sourceRelease,
    inputs: snapshotHashes,
    bindings,
  };
}

export default defineCommand({
  path: ["study", "refresh-scope-bindings"],
  summary: "Recompute candidate-bound physical scope against a fresh analysis month and spine set.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      prior: Schema.String,
      eventSet: Schema.String,
      analysisMonth: Schema.String,
      artifactRoot: Schema.String,
      busLaneSnapshot: Schema.String,
      routeShapeSnapshot: Schema.String,
      stopSnapshot: Schema.String,
      output: Schema.String,
    }),
  },
  output: Schema.Struct({ outputPath: Schema.String, bindingCount: Schema.Number }),
  run({ input }) {
    const options = input.options;
    return runLocalDbCommandBoundary({
      dbPath: options.db,
      localDbOptions: { readonly: true },
      command: "study.refresh-scope-bindings",
      operation: "refreshStudyScopeBindings",
      run: async (local) => {
        const artifact = await refreshStudyScopeBindings({
          local,
          priorPath: fromCliPath(options.prior),
          eventSetPath: fromCliPath(options.eventSet),
          analysisMonth: options.analysisMonth,
          artifactRoot: fromCliPath(options.artifactRoot),
          busLaneSnapshotPath: fromCliPath(options.busLaneSnapshot),
          routeShapeSnapshotPath: fromCliPath(options.routeShapeSnapshot),
          stopSnapshotPath: fromCliPath(options.stopSnapshot),
        });
        const outputPath = fromCliPath(options.output);
        await writeJson(outputPath, artifact);
        return { outputPath, bindingCount: artifact.bindings.length };
      },
    });
  },
});
