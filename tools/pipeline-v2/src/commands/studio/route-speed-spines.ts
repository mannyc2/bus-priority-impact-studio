import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { routeSpeedSpineArtifactPath, routeSpeedSpineManifestPath } from "@bp/analytics/artifacts";
import {
  buildRouteSpeedSpineArtifact,
  classifyRouteSpeedSpineArtifact,
  ROUTE_SPEED_SPINE_DEFAULT_START_MONTH,
  ROUTE_SPEED_SPINE_DEFAULT_TOLERANCE_METERS,
  type RouteSpeedSpineArtifact,
  type RouteSpeedSpineReadiness,
  type RouteSpeedSpineReadinessAudit,
  routeSpeedSpineRouteSlug,
} from "@bp/analytics/feature-history";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import {
  loadCurrentRouteSpeedSpineCatalogRouteIds,
  loadRouteSpeedSpineCandidateLocalDbRows,
  loadRouteSpeedSpineLocalDbRows,
} from "@bp/pipeline-v2/local-db-aggregates";
import { Effect } from "effect";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

const ISO_MONTH_RE = /^\d{4}-\d{2}$/;

type RouteSpeedSpineManifestRoute = {
  routeId: string;
  routeSlug: string;
  inCurrentCatalog: boolean;
  readiness: RouteSpeedSpineReadiness;
  reasons: string[];
  artifactPath: string;
  artifactWritten: boolean;
  monthCount: number;
  sourceRowCount: number;
  busTripCount: number;
  nodeCount: number;
  spineSegmentCount: number;
  rawSegmentKeyCount: number;
  rawStopPairCount: number;
  coverage: RouteSpeedSpineReadinessAudit["coverage"];
  validationStatus: RouteSpeedSpineArtifact["validation"]["status"];
  issueCount: number;
};

type RouteSpeedSpineManifest = {
  artifactKind: "studio_route_speed_spine_manifest";
  schemaVersion: 1;
  generatedAt: string;
  source: {
    table: "local_route_segment_speed";
    dbPath: string;
    startMonth: string;
    endMonth: string | null;
    toleranceMeters: number;
    artifactRoot: string;
    manifestPath: string;
    routeUniverse: "local_route_segment_speed_distinct_routes";
  };
  summary: {
    candidateRouteCount: number;
    routeCount: number;
    currentCatalogRouteCount: number;
    speedRouteNotInCurrentCatalogCount: number;
    currentCatalogRouteMissingSpeedCount: number;
    artifactWrittenRouteCount: number;
    seriesReadyRouteCount: number;
    seriesReadyWithGapsRouteCount: number;
    needsPatternReviewRouteCount: number;
    failedRouteCount: number;
  };
  routes: RouteSpeedSpineManifestRoute[];
};

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

function normalizeRouteId(routeId: string): string {
  return routeId.trim().toUpperCase();
}

export function earliestRouteSpeedSpineCoverageStart(
  candidates: readonly { startMonth: string }[],
): string | null {
  return candidates.reduce<string | null>(
    (earliest, candidate) =>
      earliest === null || candidate.startMonth < earliest ? candidate.startMonth : earliest,
    null,
  );
}

function parseRouteList(value: string | undefined): string[] {
  if (value === undefined) return [];
  return value
    .split(",")
    .map((routeId) => normalizeRouteId(routeId))
    .filter((routeId) => routeId.length > 0);
}

function manifestSummary(input: {
  candidateRouteCount: number;
  candidateRouteIds: ReadonlySet<string>;
  catalogRouteIds: ReadonlySet<string>;
  routeFilterIds: readonly string[];
  routes: readonly RouteSpeedSpineManifestRoute[];
}): RouteSpeedSpineManifest["summary"] {
  const catalogComparisonRouteIds =
    input.routeFilterIds.length > 0
      ? new Set(input.routeFilterIds.filter((routeId) => input.catalogRouteIds.has(routeId)))
      : input.catalogRouteIds;
  return {
    candidateRouteCount: input.candidateRouteCount,
    routeCount: input.routes.length,
    currentCatalogRouteCount: input.catalogRouteIds.size,
    speedRouteNotInCurrentCatalogCount: [...input.candidateRouteIds].filter(
      (routeId) => !input.catalogRouteIds.has(routeId),
    ).length,
    currentCatalogRouteMissingSpeedCount: [...catalogComparisonRouteIds].filter(
      (routeId) => !input.candidateRouteIds.has(routeId),
    ).length,
    artifactWrittenRouteCount: input.routes.filter((route) => route.artifactWritten).length,
    seriesReadyRouteCount: input.routes.filter((route) => route.readiness === "series_ready")
      .length,
    seriesReadyWithGapsRouteCount: input.routes.filter(
      (route) => route.readiness === "series_ready_with_gaps",
    ).length,
    needsPatternReviewRouteCount: input.routes.filter(
      (route) => route.readiness === "needs_pattern_review",
    ).length,
    failedRouteCount: input.routes.filter((route) => route.readiness === "failed").length,
  };
}

export async function runRouteSpeedSpines(input: {
  local: OpenLocalPipelineDb;
  startMonth: string;
  endMonth: string | null;
  routeIds?: readonly string[] | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  artifactRoot?: string | undefined;
  output?: string | undefined;
  toleranceMeters?: number | undefined;
  writeRouteArtifacts?: boolean | undefined;
  generatedAt?: string | undefined;
}): Promise<{
  manifestPath: string;
  coverageStart: string | null;
  candidateRouteCount: number;
  routeCount: number;
  currentCatalogRouteCount: number;
  speedRouteNotInCurrentCatalogCount: number;
  currentCatalogRouteMissingSpeedCount: number;
  artifactWrittenRouteCount: number;
  seriesReadyRouteCount: number;
  seriesReadyWithGapsRouteCount: number;
  needsPatternReviewRouteCount: number;
  failedRouteCount: number;
}> {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const toleranceMeters = input.toleranceMeters ?? ROUTE_SPEED_SPINE_DEFAULT_TOLERANCE_METERS;
  const artifactRoot = input.artifactRoot ?? defaultArtifactRootPath();
  const manifestPath =
    input.output ??
    routeSpeedSpineManifestPath({
      artifactRoot,
      startMonth: input.startMonth,
      endMonth: input.endMonth,
    });
  const routeIds = (input.routeIds ?? []).map(normalizeRouteId);
  const catalogRouteIds = loadCurrentRouteSpeedSpineCatalogRouteIds(input.local.sqlite);
  const candidates = loadRouteSpeedSpineCandidateLocalDbRows({
    sqlite: input.local.sqlite,
    startMonth: input.startMonth,
    endMonth: input.endMonth,
    routeIds,
  });
  const offset = input.offset ?? 0;
  const selectedCandidates = candidates.slice(
    offset,
    input.limit === undefined ? undefined : offset + input.limit,
  );
  const coverageStart = earliestRouteSpeedSpineCoverageStart(selectedCandidates);
  const writeRouteArtifacts = input.writeRouteArtifacts ?? true;
  const routes: RouteSpeedSpineManifestRoute[] = [];
  const candidateRouteIds = new Set(
    candidates.map((candidate) => normalizeRouteId(candidate.routeId)),
  );

  for (const candidate of selectedCandidates) {
    const routeId = normalizeRouteId(candidate.routeId);
    const routeSlug = routeSpeedSpineRouteSlug(routeId);
    const routeArtifactPath = routeSpeedSpineArtifactPath({ artifactRoot, routeSlug });
    const rows = loadRouteSpeedSpineLocalDbRows({
      sqlite: input.local.sqlite,
      routeId,
      startMonth: input.startMonth,
      endMonth: input.endMonth,
    });
    const artifact = buildRouteSpeedSpineArtifact({
      routeId,
      routeSlug,
      rows,
      generatedAt,
      dbPath: repoDisplayPath(input.local.path),
      artifactPath: repoDisplayPath(routeArtifactPath),
      startMonth: input.startMonth,
      endMonth: input.endMonth,
      toleranceMeters,
    });
    if (writeRouteArtifacts) {
      await mkdir(dirname(routeArtifactPath), { recursive: true });
      await writeJson(routeArtifactPath, artifact);
    }
    const audit = classifyRouteSpeedSpineArtifact(artifact);
    routes.push({
      routeId,
      routeSlug,
      inCurrentCatalog: catalogRouteIds.has(routeId),
      readiness: audit.readiness,
      reasons: audit.reasons,
      artifactPath: repoDisplayPath(routeArtifactPath),
      artifactWritten: writeRouteArtifacts,
      monthCount: artifact.summary.monthCount,
      sourceRowCount: artifact.summary.sourceRowCount,
      busTripCount: artifact.summary.busTripCount,
      nodeCount: artifact.summary.nodeCount,
      spineSegmentCount: artifact.summary.spineSegmentCount,
      rawSegmentKeyCount: artifact.summary.rawSegmentKeyCount,
      rawStopPairCount: artifact.summary.rawStopPairCount,
      coverage: audit.coverage,
      validationStatus: artifact.validation.status,
      issueCount: artifact.summary.issueCount,
    });
  }

  const manifest: RouteSpeedSpineManifest = {
    artifactKind: "studio_route_speed_spine_manifest",
    schemaVersion: 1,
    generatedAt,
    source: {
      table: "local_route_segment_speed",
      dbPath: repoDisplayPath(input.local.path),
      startMonth: input.startMonth,
      endMonth: input.endMonth,
      toleranceMeters,
      artifactRoot: repoDisplayPath(artifactRoot),
      manifestPath: repoDisplayPath(manifestPath),
      routeUniverse: "local_route_segment_speed_distinct_routes",
    },
    summary: manifestSummary({
      candidateRouteCount: candidates.length,
      candidateRouteIds,
      catalogRouteIds,
      routeFilterIds: routeIds,
      routes,
    }),
    routes,
  };

  await mkdir(dirname(manifestPath), { recursive: true });
  await writeJson(manifestPath, manifest);

  return {
    manifestPath: repoDisplayPath(manifestPath),
    coverageStart,
    candidateRouteCount: manifest.summary.candidateRouteCount,
    routeCount: manifest.summary.routeCount,
    currentCatalogRouteCount: manifest.summary.currentCatalogRouteCount,
    speedRouteNotInCurrentCatalogCount: manifest.summary.speedRouteNotInCurrentCatalogCount,
    currentCatalogRouteMissingSpeedCount: manifest.summary.currentCatalogRouteMissingSpeedCount,
    artifactWrittenRouteCount: manifest.summary.artifactWrittenRouteCount,
    seriesReadyRouteCount: manifest.summary.seriesReadyRouteCount,
    seriesReadyWithGapsRouteCount: manifest.summary.seriesReadyWithGapsRouteCount,
    needsPatternReviewRouteCount: manifest.summary.needsPatternReviewRouteCount,
    failedRouteCount: manifest.summary.failedRouteCount,
  };
}

export default defineCommand({
  path: ["studio", "route-speed-spines"],
  summary: "Build stable route-speed spine artifacts and an all-route readiness manifest.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      ...{
        startMonth: Schema.String.check(Schema.isPattern(ISO_MONTH_RE))
          .pipe(
            Schema.withDecodingDefaultTypeKey(
              Effect.succeed(ROUTE_SPEED_SPINE_DEFAULT_START_MONTH),
            ),
          )
          .annotate({ description: "First source month, YYYY-MM" }),
        endMonth: Schema.optionalKey(Schema.String.check(Schema.isPattern(ISO_MONTH_RE))).annotate({
          description: "Last source month, YYYY-MM; defaults to all available months",
        }),
        routes: Schema.optionalKey(Schema.String).annotate({
          description: "Comma-separated route IDs to include",
        }),
        limit: Schema.optionalKey(
          arg.number().check(Schema.isInt()).check(Schema.isGreaterThan(0)),
        ).annotate({ description: "Maximum route count to process" }),
        offset: arg
          .number()
          .check(Schema.isInt())
          .check(Schema.isGreaterThanOrEqualTo(0))
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(0)))
          .annotate({ description: "Candidate route offset" }),
        toleranceMeters: arg
          .number()
          .check(Schema.isGreaterThan(0))
          .pipe(
            Schema.withDecodingDefaultTypeKey(
              Effect.succeed(ROUTE_SPEED_SPINE_DEFAULT_TOLERANCE_METERS),
            ),
          )
          .annotate({
            description: "Maximum distance for snapping source timepoints into one spine node",
          }),
        writeRouteArtifacts: arg
          .boolean()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(true)))
          .annotate({
            description: "Write per-route speed-spine artifacts as well as the manifest",
          }),
        artifactRoot: Schema.optionalKey(Schema.String).annotate({
          description: "Override artifact root directory",
        }),
        output: Schema.optionalKey(Schema.String).annotate({
          description: "Override manifest output path",
        }),
      },
    }),
  },
  output: Schema.Struct({
    manifestPath: Schema.String,
    coverageStart: Schema.NullOr(Schema.String.check(Schema.isPattern(ISO_MONTH_RE))),
    candidateRouteCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    routeCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    currentCatalogRouteCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    speedRouteNotInCurrentCatalogCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    currentCatalogRouteMissingSpeedCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    artifactWrittenRouteCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    seriesReadyRouteCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    seriesReadyWithGapsRouteCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    needsPatternReviewRouteCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    failedRouteCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  }),
  async run({ input }) {
    const routeIds = parseRouteList(input.options.routes);
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "studio.route-speed-spines",
      operation: "runRouteSpeedSpines",
      spanAttributes: {
        startMonth: input.options.startMonth,
        endMonth: input.options.endMonth ?? null,
        routeFilterCount: routeIds.length,
        limit: input.options.limit ?? null,
        offset: input.options.offset,
      },
      run: (local) =>
        runRouteSpeedSpines({
          local,
          startMonth: input.options.startMonth,
          endMonth: input.options.endMonth ?? null,
          routeIds,
          limit: input.options.limit,
          offset: input.options.offset,
          toleranceMeters: input.options.toleranceMeters,
          writeRouteArtifacts: input.options.writeRouteArtifacts,
          artifactRoot:
            input.options.artifactRoot === undefined
              ? undefined
              : fromCliPath(input.options.artifactRoot),
          output:
            input.options.output === undefined ? undefined : fromCliPath(input.options.output),
        }),
    });
  },
});
