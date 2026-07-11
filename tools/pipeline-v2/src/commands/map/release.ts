import { join } from "node:path";
import { ROUTE_SPEED_SPINE_DEFAULT_START_MONTH } from "@bp/analytics/feature-history";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { Effect } from "effect";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { isoMonth } from "../../lib/dates.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import {
  defaultArtifactRootPath,
  defaultExportRootPath,
  fromCliPath,
  fromRepoRoot,
} from "../../lib/paths.ts";
import { runRouteBriefModel } from "../route/brief-model.ts";
import { runStudioRelease } from "../studio/release.ts";
import { runRouteSpeedSpines } from "../studio/route-speed-spines.ts";
import { runVerifyD1Export } from "../verify/d1.ts";
import { runMapArtifacts, verifyMapArtifactManifest } from "./artifacts.ts";
import { runMapContext } from "./context.ts";

export type RunMapReleaseInputs = {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  contextSourcePath: string;
  artifactRoot?: string | undefined;
  exportRoot?: string | undefined;
  spineStartMonth?: string | undefined;
  routeShapeSnapshotPath?: string | undefined;
  stopSnapshotPath?: string | undefined;
  busLaneSnapshotPath?: string | undefined;
  routeSliceRawRoot?: string | undefined;
  tspSourcePath?: string | undefined;
  documentChunksPath?: string | undefined;
  manualInterventionsPath?: string | undefined;
  publishableInterventionsByRoutePath?: string | undefined;
};

export type MapReleaseDependencies = {
  routeBrief: typeof runRouteBriefModel;
  speedSpines: typeof runRouteSpeedSpines;
  verifyD1: typeof runVerifyD1Export;
  context: typeof runMapContext;
  studio: typeof runStudioRelease;
  map: typeof runMapArtifacts;
  audit: typeof verifyMapArtifactManifest;
};

const defaultDependencies: MapReleaseDependencies = {
  routeBrief: runRouteBriefModel,
  speedSpines: runRouteSpeedSpines,
  verifyD1: runVerifyD1Export,
  context: runMapContext,
  studio: runStudioRelease,
  map: runMapArtifacts,
  audit: verifyMapArtifactManifest,
};

export async function runMapRelease(
  inputs: RunMapReleaseInputs,
  dependencies: MapReleaseDependencies = defaultDependencies,
) {
  const month = isoMonth(inputs.year, inputs.month);
  const artifactRoot = inputs.artifactRoot ?? defaultArtifactRootPath();
  const exportRoot = inputs.exportRoot ?? defaultExportRootPath();
  const routeShapeSnapshotPath =
    inputs.routeShapeSnapshotPath ?? fromRepoRoot("data/raw/network/current_bus_routes.json");
  const stopSnapshotPath =
    inputs.stopSnapshotPath ?? fromRepoRoot("data/raw/network/current_bus_stops.json");
  const busLaneSnapshotPath =
    inputs.busLaneSnapshotPath ??
    fromRepoRoot("data/raw/interventions/bus-lanes-local-streets.json");

  const routeBrief = await dependencies.routeBrief({
    local: inputs.local,
    year: inputs.year,
    month: inputs.month,
    routes: [],
    artifactRoot,
  });
  const speedSpines = await dependencies.speedSpines({
    local: inputs.local,
    startMonth: inputs.spineStartMonth ?? ROUTE_SPEED_SPINE_DEFAULT_START_MONTH,
    endMonth: month,
    artifactRoot,
  });
  const d1 = await dependencies.verifyD1({
    local: inputs.local,
    year: inputs.year,
    month: inputs.month,
    artifactRoot,
    exportRoot,
  });
  const context = await dependencies.context({
    sourcePath: inputs.contextSourcePath,
    artifactRoot,
  });
  const studio = await dependencies.studio({
    month,
    outputPath: join(artifactRoot, "studio", "v1", "release.json"),
    schemaPath: d1.schemaPath,
    seedPath: d1.seedPath,
    routeSliceArtifactsRoot: join(artifactRoot, "route-slices"),
    speedSpineRoot: artifactRoot,
    routeShapeSnapshotPath,
    stopSnapshotPath,
    localDbPath: inputs.local.path,
    profile: "full",
    ...(inputs.routeSliceRawRoot === undefined
      ? {}
      : { routeSliceRawRoot: inputs.routeSliceRawRoot }),
    ...(inputs.tspSourcePath === undefined ? {} : { tspSourcePath: inputs.tspSourcePath }),
    ...(inputs.documentChunksPath === undefined
      ? {}
      : { documentChunksPath: inputs.documentChunksPath }),
    ...(inputs.manualInterventionsPath === undefined
      ? {}
      : { manualInterventionsPath: inputs.manualInterventionsPath }),
    ...(inputs.publishableInterventionsByRoutePath === undefined
      ? {}
      : { publishableInterventionsByRoutePath: inputs.publishableInterventionsByRoutePath }),
  });
  const map = await dependencies.map({
    local: inputs.local,
    year: inputs.year,
    month: inputs.month,
    releaseProfile: "full",
    artifactRoot,
    speedSpineRoot: artifactRoot,
    routeShapeSnapshotPath,
    stopSnapshotPath,
    busLaneSnapshotPath,
    contextPath: context.artifactPath,
    contextSourcePath: context.sourcePath,
    routeFactsPath: studio.mapRouteFactsPath,
  });
  const audit = await dependencies.audit({
    artifactRoot,
    month,
    expectedProfile: "full",
  });
  if (audit.status !== "pass") {
    throw new Error(
      `Full map release audit failed with ${audit.issueCount} issue(s): ${audit.issues
        .slice(0, 5)
        .map((issue) => issue.code)
        .join(", ")}.`,
    );
  }

  return {
    month,
    artifactRoot,
    exportRoot,
    routeShapeSnapshotPath,
    stopSnapshotPath,
    busLaneSnapshotPath,
    routeBrief,
    speedSpines,
    d1,
    context,
    studio,
    map,
    audit,
  };
}

export default defineCommand({
  path: ["map", "release"],
  summary: "Build and verify one full same-root map and Studio release.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      ...{
        year: arg.positiveInt().pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(2026))),
        month: arg.positiveInt().pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(3))),
        contextSource: Schema.String.annotate({
          description: "Required raw borough-boundary CSV used to build context",
        }),
        artifactRoot: Schema.optionalKey(Schema.String),
        exportRoot: Schema.optionalKey(Schema.String),
        spineStartMonth: Schema.optionalKey(Schema.String),
        routeShapeSnapshot: Schema.optionalKey(Schema.String),
        stopSnapshot: Schema.optionalKey(Schema.String),
        busLaneSnapshot: Schema.optionalKey(Schema.String),
        routeSliceRawRoot: Schema.optionalKey(Schema.String),
        tspSource: Schema.optionalKey(Schema.String),
        documentChunks: Schema.optionalKey(Schema.String),
        manualInterventions: Schema.optionalKey(Schema.String),
        publishableInterventionsByRoute: Schema.optionalKey(Schema.String),
      },
    }),
  },
  output: Schema.Unknown,
  async run({ input }) {
    const path = (value: string | undefined) =>
      value === undefined ? undefined : fromCliPath(value);
    return runLocalDbCommandBoundary({
      dbPath: path(input.options.db),
      command: "map.release",
      operation: "runMapRelease",
      run: (local) =>
        runMapRelease({
          local,
          year: input.options.year,
          month: input.options.month,
          contextSourcePath: fromCliPath(input.options.contextSource),
          artifactRoot: path(input.options.artifactRoot),
          exportRoot: path(input.options.exportRoot),
          spineStartMonth: input.options.spineStartMonth,
          routeShapeSnapshotPath: path(input.options.routeShapeSnapshot),
          stopSnapshotPath: path(input.options.stopSnapshot),
          busLaneSnapshotPath: path(input.options.busLaneSnapshot),
          routeSliceRawRoot: path(input.options.routeSliceRawRoot),
          tspSourcePath: path(input.options.tspSource),
          documentChunksPath: path(input.options.documentChunks),
          manualInterventionsPath: path(input.options.manualInterventions),
          publishableInterventionsByRoutePath: path(input.options.publishableInterventionsByRoute),
        }),
    });
  },
});
