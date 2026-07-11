import { Effect } from "effect";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import {
  routeTreatmentSummaryArtifactPath,
  routeTreatmentSummaryMarkdownPath,
} from "@bp/analytics/artifacts";
import {
  buildRouteTreatmentSummaryArtifact,
  type PublishableInterventionLike,
  type RouteSegmentLaneOverlapInput,
  routeTreatmentSourceRowsFromAce,
  routeTreatmentSourceRowsFromInterventionEvents,
  routeTreatmentSourceRowsFromPublishableInterventions,
  routeTreatmentSourceRowsFromRouteBriefSummaries,
  routeTreatmentSummaryMarkdown,
  segmentTreatmentRowsFromLaneOverlaps,
} from "@bp/analytics/interventions";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import {
  loadRouteTreatmentSummaryLocalDbRows,
  type RouteTreatmentSegmentUniverseRow,
} from "@bp/pipeline-v2/local-db-aggregates";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { isoMonth } from "../../lib/dates.ts";
import { readJsonIfExists, writeJson } from "../../lib/json.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, fromRepoRoot, repoRoot } from "../../lib/paths.ts";
import { segmentLaneOverlapIndex } from "./_release-geometry.ts";
import type { RouteBriefInputArtifact } from "./_release-types.ts";

const defaultPublishableInterventionsPath = fromRepoRoot(
  "data/artifacts/studio/v2/wiki/intervention-publishable-v1.json",
);
const defaultRouteShapeSnapshotPath = "data/raw/network/current_bus_routes.json";
const defaultStopSnapshotPath = "data/raw/network/current_bus_stops.json";

type PublishableInterventionsArtifactLike = {
  publishableInterventions?: PublishableInterventionLike[];
};

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

async function loadPublishableInterventions(
  path: string | null,
): Promise<readonly PublishableInterventionLike[]> {
  if (path === null) return [];
  const artifact = await readJsonIfExists<PublishableInterventionsArtifactLike>(path);
  return Array.isArray(artifact?.publishableInterventions) ? artifact.publishableInterventions : [];
}

function segmentIdFromUniverseRow(row: RouteTreatmentSegmentUniverseRow): string {
  return [
    row.route_id,
    row.month,
    row.direction,
    row.stop_order,
    row.timepoint_stop_id,
    row.next_timepoint_stop_id,
  ].join(":");
}

function routeBriefInputsFromSegmentUniverse(
  rows: readonly RouteTreatmentSegmentUniverseRow[],
): ReadonlyMap<string, RouteBriefInputArtifact | null> {
  const byRoute = new Map<string, RouteBriefInputArtifact>();
  for (const row of rows) {
    const existing =
      byRoute.get(row.route_id) ??
      ({
        analysisPeriod: row.month,
        segments: [],
      } satisfies RouteBriefInputArtifact);
    existing.segments = [
      ...(existing.segments ?? []),
      {
        segmentId: segmentIdFromUniverseRow(row),
        direction: row.direction,
        stopOrder: row.stop_order,
      },
    ];
    byRoute.set(row.route_id, existing);
  }
  return byRoute;
}

async function segmentLaneTreatmentInputs(input: {
  localDbPath: string;
  month: string;
  routeShapeSnapshotPath: string;
  stopSnapshotPath: string;
  segmentUniverseRows: readonly RouteTreatmentSegmentUniverseRow[];
}): Promise<RouteSegmentLaneOverlapInput[]> {
  if (input.segmentUniverseRows.length === 0) return [];
  const routeInputs = routeBriefInputsFromSegmentUniverse(input.segmentUniverseRows);
  const overlapsByRoute = await segmentLaneOverlapIndex({
    localDbPath: input.localDbPath,
    isoMonth: input.month,
    routeShapeSnapshotPath: input.routeShapeSnapshotPath,
    stopSnapshotPath: input.stopSnapshotPath,
    routeInputs,
  });

  return input.segmentUniverseRows.map((row) => {
    const segmentId = segmentIdFromUniverseRow(row);
    const overlap = overlapsByRoute.get(row.route_id)?.get(segmentId);
    return {
      routeId: row.route_id,
      month: row.month,
      segmentId,
      directionId: row.direction,
      segmentOrder: row.stop_order,
      laneSource: overlap?.laneSource ?? "geometry_unavailable",
      laneOverlapShare: overlap?.laneOverlapShare ?? 0,
      laneMatchedCount: overlap?.laneMatchedCount ?? 0,
      laneTypes: overlap?.laneTypes ?? [],
      laneOperatingHours: overlap?.laneOperatingHours ?? [],
      laneOperatingDays: overlap?.laneOperatingDays ?? [],
    };
  });
}

export async function runRouteTreatmentSummary(input: {
  local: OpenLocalPipelineDb;
  month: string;
  artifactRoot?: string | undefined;
  output?: string | undefined;
  summaryOutput?: string | undefined;
  publishableInterventionsPath?: string | null | undefined;
  routeShapeSnapshotPath?: string | undefined;
  stopSnapshotPath?: string | undefined;
  generatedAt?: string | undefined;
}): Promise<{
  month: string;
  outputPath: string;
  summaryPath: string;
  validationStatus: "pass" | "warn" | "fail";
  issueCount: number;
  routeCount: number;
  routeTreatmentRowCount: number;
  sourceGapRowCount: number;
  segmentTreatmentRowCount: number;
  routeWithPositiveEvidenceCount: number;
}> {
  const artifactRoot = input.artifactRoot ?? defaultArtifactRootPath();
  const outputPath =
    input.output ??
    routeTreatmentSummaryArtifactPath({
      artifactRoot,
      month: input.month,
    });
  const summaryOutputPath =
    input.summaryOutput ??
    routeTreatmentSummaryMarkdownPath({
      artifactRoot,
      month: input.month,
    });
  const publishablePath =
    input.publishableInterventionsPath === undefined
      ? defaultPublishableInterventionsPath
      : input.publishableInterventionsPath;

  const localRows = loadRouteTreatmentSummaryLocalDbRows({
    sqlite: input.local.sqlite,
    month: input.month,
  });
  const segmentTreatmentRows = segmentTreatmentRowsFromLaneOverlaps({
    rows: await segmentLaneTreatmentInputs({
      localDbPath: input.local.path,
      month: input.month,
      routeShapeSnapshotPath: input.routeShapeSnapshotPath ?? defaultRouteShapeSnapshotPath,
      stopSnapshotPath: input.stopSnapshotPath ?? defaultStopSnapshotPath,
      segmentUniverseRows: localRows.segmentUniverseRows,
    }),
  });
  const publishableInterventions = await loadPublishableInterventions(publishablePath ?? null);
  const evidenceRows = [
    ...routeTreatmentSourceRowsFromAce({ rows: localRows.aceRows, month: input.month }),
    ...routeTreatmentSourceRowsFromRouteBriefSummaries({
      rows: localRows.routeBriefRows,
      month: input.month,
    }),
    ...routeTreatmentSourceRowsFromInterventionEvents({
      rows: localRows.interventionEventRows,
      month: input.month,
    }),
    ...routeTreatmentSourceRowsFromPublishableInterventions({
      rows: publishableInterventions,
      month: input.month,
    }),
  ];

  const artifact = buildRouteTreatmentSummaryArtifact({
    month: input.month,
    routeIds: localRows.routeRows.map((row) => row.route_id),
    evidenceRows,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    dbPath: repoDisplayPath(input.local.path),
    artifactPath: repoDisplayPath(outputPath),
    summaryPath: repoDisplayPath(summaryOutputPath),
    localMissingTables: localRows.missingTables,
    publishableInterventionCount: publishableInterventions.length,
    segmentUniverseRowCount: localRows.segmentUniverseRows.length,
    segmentTreatmentRows,
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await mkdir(dirname(summaryOutputPath), { recursive: true });
  await writeJson(outputPath, artifact);
  await Bun.write(summaryOutputPath, routeTreatmentSummaryMarkdown(artifact));

  return {
    month: input.month,
    outputPath: repoDisplayPath(outputPath),
    summaryPath: repoDisplayPath(summaryOutputPath),
    validationStatus: artifact.validation.status,
    issueCount: artifact.validation.issues.length,
    routeCount: artifact.summary.routeCount,
    routeTreatmentRowCount: artifact.summary.routeTreatmentRowCount,
    sourceGapRowCount: artifact.summary.sourceGapRowCount,
    segmentTreatmentRowCount: artifact.summary.segmentTreatmentRowCount,
    routeWithPositiveEvidenceCount: artifact.summary.routeWithPositiveEvidenceCount,
  };
}

export default defineCommand({
  path: ["studio", "route-treatment-summary"],
  summary: "Build the deterministic route treatment-state summary artifact.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      ...{
        year: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(2026)))
          .annotate({ description: "Calendar year" }),
        month: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(3)))
          .annotate({ description: "Calendar month, 1-12" }),
        artifactRoot: Schema.optionalKey(Schema.String).annotate({
          description: "Override artifact root directory",
        }),
        output: Schema.optionalKey(Schema.String).annotate({
          description: "Override JSON output path",
        }),
        summaryOutput: Schema.optionalKey(Schema.String).annotate({
          description: "Override Markdown summary output path",
        }),
        publishableInterventions: Schema.optionalKey(Schema.String).annotate({
          description: "Reviewed publishable intervention artifact path",
        }),
        routeShapeSnapshot: Schema.String.pipe(
          Schema.withDecodingDefaultTypeKey(Effect.succeed(defaultRouteShapeSnapshotPath)),
        ).annotate({
          description: "Current bus route shape snapshot used for segment bus-lane overlap checks",
        }),
        stopSnapshot: Schema.String.pipe(
          Schema.withDecodingDefaultTypeKey(Effect.succeed(defaultStopSnapshotPath)),
        ).annotate({
          description: "Current bus stop snapshot used for segment bus-lane overlap checks",
        }),
        skipPublishableInterventions: Schema.Boolean.pipe(
          Schema.withDecodingDefaultTypeKey(Effect.succeed(false)),
        ).annotate({ description: "Skip optional publishable intervention artifact input" }),
      },
    }),
  },
  output: Schema.Struct({
    month: Schema.String,
    outputPath: Schema.String,
    summaryPath: Schema.String,
    validationStatus: Schema.Literals(["pass", "warn", "fail"]),
    issueCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    routeCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    routeTreatmentRowCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    sourceGapRowCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    segmentTreatmentRowCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    routeWithPositiveEvidenceCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
  }),
  async run({ input }) {
    const month = isoMonth(input.options.year, input.options.month);
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "studio.route-treatment-summary",
      operation: "runRouteTreatmentSummary",
      spanAttributes: {
        month,
        skipPublishableInterventions: input.options.skipPublishableInterventions,
      },
      run: (local) =>
        runRouteTreatmentSummary({
          local,
          month,
          artifactRoot:
            input.options.artifactRoot === undefined
              ? undefined
              : fromCliPath(input.options.artifactRoot),
          output:
            input.options.output === undefined ? undefined : fromCliPath(input.options.output),
          summaryOutput:
            input.options.summaryOutput === undefined
              ? undefined
              : fromCliPath(input.options.summaryOutput),
          publishableInterventionsPath: input.options.skipPublishableInterventions
            ? null
            : input.options.publishableInterventions === undefined
              ? undefined
              : fromCliPath(input.options.publishableInterventions),
          routeShapeSnapshotPath: input.options.routeShapeSnapshot,
          stopSnapshotPath: input.options.stopSnapshot,
        }),
    });
  },
});
