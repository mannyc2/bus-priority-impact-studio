import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  interventionObservationBundleKey,
  interventionObservationIndexKey,
  routeInterventionInventoryBundleKey,
  routeInterventionInventoryIndexKey,
  StudioInterventionObservationIndexSchema,
  StudioReleasePayloadSchema,
  StudioRouteInterventionInventoryBundleSchema,
  StudioRouteInterventionInventoryIndexSchema,
  StudioRouteInterventionObservationBundleSchema,
} from "@bp/domain/studio";
import { defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { loadInterventionObservationTrendRows } from "@bp/pipeline-v2/local-db-aggregates";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import {
  buildInterventionObservationArtifacts,
  type InterventionObservationAdmissionSummary,
} from "../../lib/intervention-observations.ts";
import { readJsonArtifact, writeJson } from "../../lib/json.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

const DEFAULT_RELEASE_ARTIFACT = "data/artifacts/studio/v1/release.json";

export type ExportInterventionObservationsOptions = {
  readonly db?: string | undefined;
  readonly inventoryIndex?: string | undefined;
  readonly releaseArtifact?: string | undefined;
  readonly artifactRoot?: string | undefined;
};

export type ExportInterventionObservationsResult = {
  readonly routeBundleCount: number;
  readonly eventCount: number;
  readonly admittedAnchorCount: number;
  readonly rejectedAnchorCount: number;
  readonly admissionReasonCounts: InterventionObservationAdmissionSummary["admissionReasonCounts"];
  readonly supportedEventCount: number;
  readonly unsupportedEventCount: number;
  readonly availableSeriesCount: number;
  readonly partialSeriesCount: number;
  readonly missingSeriesCount: number;
  readonly dataCoverage: {
    readonly start: string | null;
    readonly end: string | null;
    readonly grain: "month";
  };
  readonly indexPath: string;
};

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameCoverage(
  left: { readonly start: string | null; readonly end: string },
  right: { readonly start: string | null; readonly end: string },
): boolean {
  return left.start === right.start && left.end === right.end;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function displayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const repoRelative = relative(repoRoot, path);
  return repoRelative.startsWith("..") ? path : repoRelative;
}

function artifactPath(artifactRoot: string, key: string): string {
  const root = resolve(artifactRoot);
  const path = resolve(root, key);
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    throw new Error(`Artifact key escapes artifact root: ${key}`);
  }
  return path;
}

async function loadInventoryBundles(input: {
  readonly artifactRoot: string;
  readonly inventoryIndexPath: string;
  readonly release: {
    readonly releaseId: string;
    readonly publishedAt: string;
    readonly coverage: { readonly start: string | null; readonly end: string };
  };
}) {
  const index = await readJsonArtifact(
    input.inventoryIndexPath,
    StudioRouteInterventionInventoryIndexSchema,
    "strict",
  );
  if (
    index.releaseId !== input.release.releaseId ||
    index.publishedAt !== input.release.publishedAt ||
    !sameCoverage(index.coverage, input.release.coverage)
  ) {
    throw new Error("Inventory index release identity does not match the Studio release artifact");
  }
  if (
    index.summary.routeCount !== index.routes.length ||
    index.summary.checkedEmptyRouteCount !==
      index.routes.filter((route) => route.coverageState === "checked_no_positive_evidence")
        .length ||
    index.summary.totalByteSize !== index.routes.reduce((sum, route) => sum + route.byteSize, 0)
  ) {
    throw new Error("Inventory index summary does not reconcile with its route rows");
  }

  const seenRouteIds = new Set<string>();
  const seenRouteSlugs = new Set<string>();
  const seenBundleKeys = new Set<string>();
  const sortedRoutes = [...index.routes].sort(
    (left, right) =>
      compareText(left.routeSlug, right.routeSlug) ||
      compareText(left.route.routeId, right.route.routeId),
  );
  for (const route of sortedRoutes) {
    if (
      seenRouteIds.has(route.route.routeId) ||
      seenRouteSlugs.has(route.routeSlug) ||
      seenBundleKeys.has(route.bundleKey)
    ) {
      throw new Error(
        `Inventory index contains a duplicate route or bundle key: ${route.bundleKey}`,
      );
    }
    seenRouteIds.add(route.route.routeId);
    seenRouteSlugs.add(route.routeSlug);
    seenBundleKeys.add(route.bundleKey);
    const expectedKey = routeInterventionInventoryBundleKey(route.routeSlug);
    if (route.bundleKey !== expectedKey) {
      throw new Error(
        `Inventory bundle key mismatch: expected ${expectedKey}, received ${route.bundleKey}`,
      );
    }
  }

  const bundles = [];
  for (const route of sortedRoutes) {
    const path = artifactPath(input.artifactRoot, route.bundleKey);
    const bytes = await readFile(path);
    if (bytes.byteLength !== route.byteSize) {
      throw new Error(`Inventory bundle byte-size mismatch at ${route.bundleKey}`);
    }
    if (sha256(bytes) !== route.sha256) {
      throw new Error(`Inventory bundle SHA-256 mismatch at ${route.bundleKey}`);
    }
    const bundle = await readJsonArtifact(
      path,
      StudioRouteInterventionInventoryBundleSchema,
      "strict",
    );
    if (
      bundle.releaseId !== input.release.releaseId ||
      bundle.publishedAt !== input.release.publishedAt ||
      !sameCoverage(bundle.coverage, input.release.coverage)
    ) {
      throw new Error(`Inventory bundle release identity mismatch at ${route.bundleKey}`);
    }
    if (
      bundle.routeSlug !== route.routeSlug ||
      !sameJson(bundle.route, route.route) ||
      bundle.coverageState !== route.coverageState
    ) {
      throw new Error(`Inventory bundle index row mismatch at ${route.bundleKey}`);
    }
    bundles.push(bundle);
  }
  return bundles;
}

export async function runExportInterventionObservations(input: {
  readonly options: ExportInterventionObservationsOptions;
  readonly local: OpenLocalPipelineDb;
}): Promise<ExportInterventionObservationsResult> {
  const artifactRoot = fromCliPath(input.options.artifactRoot ?? defaultArtifactRootPath());
  const inventoryIndexPath =
    input.options.inventoryIndex === undefined
      ? join(artifactRoot, routeInterventionInventoryIndexKey())
      : fromCliPath(input.options.inventoryIndex);
  const releaseArtifactPath = fromCliPath(
    input.options.releaseArtifact ?? DEFAULT_RELEASE_ARTIFACT,
  );

  const release = await readJsonArtifact(releaseArtifactPath, StudioReleasePayloadSchema, "strict");
  const inventoryBundles = await loadInventoryBundles({
    artifactRoot,
    inventoryIndexPath,
    release,
  });
  const trendRows = loadInterventionObservationTrendRows({ sqlite: input.local.sqlite });
  const built = buildInterventionObservationArtifacts({
    inventoryBundles,
    trendRows,
    releaseId: release.releaseId,
    publishedAt: release.publishedAt,
  });
  if (built.admissionSummary.admittedAnchorCount === 0) {
    throw new Error("No trusted registry occurrence anchors were admitted");
  }

  const bundles = built.bundles.map((bundle) =>
    Schema.decodeUnknownSync(StudioRouteInterventionObservationBundleSchema, {
      onExcessProperty: "error",
    })(bundle),
  );
  const index = Schema.decodeUnknownSync(StudioInterventionObservationIndexSchema, {
    onExcessProperty: "error",
  })(built.index);
  for (const bundle of bundles) {
    const expectedKey = interventionObservationBundleKey(bundle.routeSlug);
    if (
      index.events.some(
        (event) => event.routeId === bundle.routeId && event.bundleKey !== expectedKey,
      )
    ) {
      throw new Error(`Observation index bundle key mismatch for route ${bundle.routeId}`);
    }
  }

  for (const bundle of bundles) {
    const path = artifactPath(artifactRoot, interventionObservationBundleKey(bundle.routeSlug));
    await mkdir(dirname(path), { recursive: true });
    await writeJson(path, bundle);
  }
  const indexPath = artifactPath(artifactRoot, interventionObservationIndexKey());
  await mkdir(dirname(indexPath), { recursive: true });
  await writeJson(indexPath, index);

  const events = bundles.flatMap((bundle) => bundle.events);
  const supportedEvents = events.filter(
    (event) =>
      event.resolutionStatus === "available" ||
      event.resolutionStatus === "partial" ||
      event.resolutionStatus === "missing",
  );
  const series = supportedEvents.flatMap((event) => event.series);
  return {
    routeBundleCount: bundles.length,
    eventCount: events.length,
    admittedAnchorCount: built.admissionSummary.admittedAnchorCount,
    rejectedAnchorCount: built.admissionSummary.rejectedAnchorCount,
    admissionReasonCounts: built.admissionSummary.admissionReasonCounts,
    supportedEventCount: supportedEvents.length,
    unsupportedEventCount: events.length - supportedEvents.length,
    availableSeriesCount: series.filter((item) => item.status === "available").length,
    partialSeriesCount: series.filter((item) => item.status === "partial").length,
    missingSeriesCount: series.filter((item) => item.status === "missing").length,
    dataCoverage: index.dataCoverage,
    indexPath: displayPath(indexPath),
  };
}

export default defineCommand({
  path: ["studio", "export-intervention-observations"],
  summary: "Export value-blind route intervention observation artifacts.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      inventoryIndex: Schema.optionalKey(Schema.String).annotate({
        description: "Plan 091 route intervention inventory index path",
      }),
      releaseArtifact: Schema.optionalKey(Schema.String).annotate({
        description: "Strict Studio release payload path",
      }),
      artifactRoot: Schema.optionalKey(Schema.String).annotate({
        description: "Artifact root for inventory inputs and observation outputs",
      }),
    }),
  },
  output: Schema.Unknown,
  async run({ input }) {
    return runLocalDbCommandBoundary({
      dbPath: input.options.db === undefined ? undefined : fromCliPath(input.options.db),
      localDbOptions: { readonly: true },
      command: "studio.export-intervention-observations",
      operation: "runExportInterventionObservations",
      run: (local) => runExportInterventionObservations({ options: input.options, local }),
    });
  },
});
