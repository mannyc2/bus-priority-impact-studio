import {
  type BuildRouteShapeGeometryIndexResult,
  runBuildRouteShapeGeometryIndexFromShapes,
} from "@bp/pipeline-v2/local-db-aggregates";
import { normalizeRouteShapeRows } from "@bp/sources/adapters/mta/routes-stops";
import { defineCommand, z } from "@bp/pipeline-v2/cli/compat";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { fromCliPath, fromRepoRoot } from "../../lib/paths.ts";

function defaultSnapshotPath(): string {
  return fromRepoRoot("data/raw/network/current_bus_routes.json");
}

export type BuildRouteShapeGeometryIndexInputs = {
  local: OpenLocalPipelineDb;
  snapshotPath?: string | undefined;
};

export type { BuildRouteShapeGeometryIndexResult } from "@bp/pipeline-v2/local-db-aggregates";

export async function runBuildRouteShapeGeometryIndex(
  inputs: BuildRouteShapeGeometryIndexInputs,
): Promise<BuildRouteShapeGeometryIndexResult> {
  const snapshotPath = inputs.snapshotPath ?? defaultSnapshotPath();
  const parsed = (await Bun.file(snapshotPath).json()) as { rows?: unknown };
  const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
  const shapes = normalizeRouteShapeRows(rows as never[]);

  return runBuildRouteShapeGeometryIndexFromShapes({
    local: inputs.local,
    shapes,
  });
}

export default defineCommand({
  path: ["build", "route-shape-geometry-index"],
  summary: "Build local_route_shape_geom from the current_bus_routes snapshot.",
  input: {
    options: dbOptions.extend({
      snapshot: z
        .string()
        .optional()
        .describe(`Snapshot path (defaults to data/raw/network/current_bus_routes.json)`),
    }),
  },
  output: z.object({
    shapesRead: z.number(),
    inserted: z.number(),
    skipped: z.number(),
  }),
  async run({ input }) {
    const snapshot = input.options.snapshot;
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      localDbOptions: { spatial: true },
      command: "build.route-shape-geometry-index",
      operation: "runBuildRouteShapeGeometryIndex",
      run: (local) =>
        runBuildRouteShapeGeometryIndex({
          local,
          snapshotPath: snapshot === undefined ? undefined : fromCliPath(snapshot),
        }),
    });
  },
});
