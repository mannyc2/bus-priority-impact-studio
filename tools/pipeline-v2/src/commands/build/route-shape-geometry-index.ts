import {
  type BuildRouteShapeGeometryIndexResult,
  runBuildRouteShapeGeometryIndexFromShapes,
} from "@bp/applied-research/local-db";
import { normalizeRouteShapeRows } from "@bp/sources/adapters/mta/routes-stops";
import { defineCommand, z } from "@liche/core";
import {
  dbOptions,
  localDbFromCtx,
  type OpenLocalPipelineDb,
  withLocalDb,
} from "../../lib/local-db.ts";
import { fromCliPath, fromRepoRoot } from "../../lib/paths.ts";

function defaultSnapshotPath(): string {
  return fromRepoRoot("data/raw/network/current_bus_routes.json");
}

export type BuildRouteShapeGeometryIndexInputs = {
  local: OpenLocalPipelineDb;
  snapshotPath?: string | undefined;
};

export type { BuildRouteShapeGeometryIndexResult } from "@bp/applied-research/local-db";

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
  middleware: [withLocalDb({ spatial: true })],
  output: z.object({
    shapesRead: z.number(),
    inserted: z.number(),
    skipped: z.number(),
  }),
  async run({ ctx, input }) {
    const snapshot = input.options.snapshot;
    return runBuildRouteShapeGeometryIndex({
      local: localDbFromCtx(ctx),
      snapshotPath: snapshot === undefined ? undefined : fromCliPath(snapshot),
    });
  },
});
