import { existsSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { routeSpeedHistoryManifestPath } from "@bp/analytics/artifacts";
import { ROUTE_SPEED_SPINE_DEFAULT_START_MONTH } from "@bp/analytics/feature-history";
import { decodeStrip } from "@bp/domain/decode";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import {
  materializeRouteSpeedHistoryCoverageIndex,
  type RouteSpeedHistoryCoverageIndexRoute,
} from "@bp/pipeline-v2/local-db-aggregates";
import { Effect } from "effect";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { isoMonth } from "../../lib/dates.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

const ISO_MONTH_RE = /^\d{4}-\d{2}$/;

const RouteSpeedHistoryManifestSchema = Schema.Struct({
  artifactKind: Schema.Literal("studio_route_speed_history_manifest"),
  schemaVersion: Schema.Literal(1),
  source: Schema.Struct({
    startMonth: Schema.String.check(Schema.isPattern(ISO_MONTH_RE)),
    endMonth: Schema.NullOr(Schema.String.check(Schema.isPattern(ISO_MONTH_RE))),
  }),
  routes: Schema.Array(
    Schema.Struct({
      routeId: Schema.String.check(Schema.isMinLength(1)),
      routeSlug: Schema.String.check(Schema.isMinLength(1)),
      status: Schema.Literals(["written", "skipped_existing", "blocked", "failed"]),
      readiness: Schema.Literals([
        "series_ready",
        "series_ready_with_gaps",
        "needs_pattern_review",
        "failed",
      ]),
      reasons: Schema.Array(Schema.String),
      artifactPath: Schema.String.check(Schema.isMinLength(1)),
      monthCount: Schema.NullOr(
        Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      ),
      segmentCount: Schema.NullOr(
        Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      ),
      cellCount: Schema.NullOr(
        Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      ),
      availableCellCount: Schema.NullOr(
        Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      ),
      missingCellCount: Schema.NullOr(
        Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      ),
    }),
  ),
});

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

function absoluteArtifactPath(path: string): string {
  return isAbsolute(path) ? path : join(repoRoot, path);
}

export async function runRouteSpeedHistoryCoverageIndex(input: {
  local: OpenLocalPipelineDb;
  releaseMonth: string;
  startMonth: string;
  endMonth: string | null;
  artifactRoot?: string | undefined;
  manifestPath?: string | undefined;
  generatedAt?: string | undefined;
}): Promise<{
  releaseMonth: string;
  manifestPath: string;
  expectedRouteCount: number;
  availableRouteCount: number;
  missingRouteCount: number;
  tableRowCount: number;
}> {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const artifactRoot = input.artifactRoot ?? defaultArtifactRootPath();
  const manifestPath =
    input.manifestPath ??
    routeSpeedHistoryManifestPath({
      artifactRoot,
      startMonth: input.startMonth,
      endMonth: input.endMonth,
    });
  const manifest = decodeStrip(RouteSpeedHistoryManifestSchema)(
    await Bun.file(manifestPath).json(),
  );
  const historyEndMonth = manifest.source.endMonth ?? input.endMonth ?? input.releaseMonth;
  const availableRoutes: RouteSpeedHistoryCoverageIndexRoute[] = manifest.routes.flatMap(
    (route) => {
      const artifactPath = absoluteArtifactPath(route.artifactPath);
      const artifactReady =
        (route.status === "written" || route.status === "skipped_existing") &&
        existsSync(artifactPath);
      if (!artifactReady) return [];
      return [
        {
          routeId: route.routeId,
          routeSlug: route.routeSlug,
          artifactPath: repoDisplayPath(artifactPath),
          artifactStatus: route.status,
          spineReadiness: route.readiness,
          spineReasons: route.reasons,
          monthCount: route.monthCount,
          segmentCount: route.segmentCount,
          cellCount: route.cellCount,
          availableCellCount: route.availableCellCount,
          missingCellCount: route.missingCellCount,
        },
      ];
    },
  );
  const result = materializeRouteSpeedHistoryCoverageIndex({
    local: input.local,
    releaseMonth: input.releaseMonth,
    historyStartMonth: manifest.source.startMonth,
    historyEndMonth,
    expectedRouteCount: manifest.routes.length,
    routes: availableRoutes,
    generatedAt,
  });

  return {
    ...result,
    manifestPath: repoDisplayPath(manifestPath),
  };
}

export default defineCommand({
  path: ["export", "route-speed-history-coverage-index"],
  summary: "Materialize local route speed-history coverage rows from the Studio history manifest.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      ...{
        year: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(2026)))
          .annotate({ description: "Release calendar year" }),
        month: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(3)))
          .annotate({ description: "Release calendar month, 1-12" }),
        startMonth: Schema.String.check(Schema.isPattern(ISO_MONTH_RE))
          .pipe(
            Schema.withDecodingDefaultTypeKey(
              Effect.succeed(ROUTE_SPEED_SPINE_DEFAULT_START_MONTH),
            ),
          )
          .annotate({ description: "First source month in the route speed-history manifest" }),
        endMonth: Schema.optionalKey(Schema.String.check(Schema.isPattern(ISO_MONTH_RE))).annotate({
          description: "Last source month in the route speed-history manifest",
        }),
        artifactRoot: Schema.optionalKey(Schema.String).annotate({
          description: "Override artifact root directory",
        }),
        manifest: Schema.optionalKey(Schema.String).annotate({
          description: "Override route speed-history manifest path",
        }),
      },
    }),
  },
  output: Schema.Struct({
    releaseMonth: Schema.String,
    manifestPath: Schema.String,
    expectedRouteCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    availableRouteCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    missingRouteCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    tableRowCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  }),
  async run({ input }) {
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? undefined
        : fromCliPath(input.options.artifactRoot);
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "export.route-speed-history-coverage-index",
      operation: "runRouteSpeedHistoryCoverageIndex",
      spanAttributes: {
        releaseMonth,
        startMonth: input.options.startMonth,
        endMonth: input.options.endMonth ?? null,
      },
      run: (local) =>
        runRouteSpeedHistoryCoverageIndex({
          local,
          releaseMonth,
          startMonth: input.options.startMonth,
          endMonth: input.options.endMonth ?? null,
          artifactRoot,
          manifestPath:
            input.options.manifest === undefined ? undefined : fromCliPath(input.options.manifest),
        }),
    });
  },
});
