import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { classifyPublicRouteVisibility, type PublicRouteVisibilityReason } from "@bp/analytics";
import { type LocalRouteReadinessStatus, listRouteBuildPlan, listRouteCatalog } from "@bp/db/local";
import * as z from "zod";
import { routeSliceKey } from "../../lib/artifacts.js";
import { isoMonth } from "../../lib/dates.js";
import { writeJson } from "../../lib/json.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { fromRepoRoot } from "../../source-manifest.js";

const schemaVersion = 1;

const artifactNames = [
  "summary.json",
  "hotspots.json",
  "ridership-profile.json",
  "speed-profile.json",
  "intervention-overlay.json",
  "bus-lane-overlay.json",
  "schedule-comparison.json",
  "route-scorecard.json",
  "route-brief-input.json",
] as const;

const IsoMonthSchema = z.string().regex(/^\d{4}-\d{2}$/);

const BatchSummarySchema = z
  .object({
    schemaVersion: z.literal(1),
    analysisPeriod: IsoMonthSchema,
    routes: z.array(
      z
        .object({
          routeId: z.string().min(1),
          isoMonth: IsoMonthSchema,
        })
        .passthrough(),
    ),
  })
  .passthrough();

const ArtifactManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    routeId: z.string().min(1),
    isoMonth: IsoMonthSchema,
    artifacts: z.array(
      z
        .object({
          name: z.string().min(1),
          path: z.string().min(1).optional(),
          artifactKey: z.string().min(1),
          contentType: z.string().min(1),
          byteLength: z.number().int().nonnegative(),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const RouteComparisonSchema = z
  .object({
    rankedRoutes: z.array(
      z
        .object({
          routeId: z.string().min(1),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const RouteScorecardSchema = z
  .object({
    coverageStatus: z.enum(["full", "no_observed_speed"]),
  })
  .passthrough();

type RouteBatchAuditArgs = {
  year?: number;
  month?: number;
  batchDir?: string;
  dbPath?: string;
};

type RouteAuditStatus = "pass" | "fail";

type RouteBatchAuditRow = {
  routeId: string;
  isoMonth: string;
  status: RouteAuditStatus;
  expectedArtifactCount: number;
  verifiedArtifactCount: number;
  missingArtifactCount: number;
  hashMismatchCount: number;
  byteLengthMismatchCount: number;
  totalByteLength: number;
  issues: string[];
};

type RouteCoverageAuditRow = {
  routeId: string;
  coverageStatus: "full" | "no_observed_speed";
  comparisonIncluded: boolean;
  publicVisible: boolean;
  publicVisibilityReason: PublicRouteVisibilityReason;
  readinessStatus: LocalRouteReadinessStatus | null;
  missingInputs: string[];
};

type RouteBatchAuditResult = {
  isoMonth: string;
  auditPath: string;
  routeCount: number;
  status: RouteAuditStatus;
  issueCount: number;
  artifactCount: number;
  totalByteLength: number;
};

function parseBuildArgs(args: RouteBatchAuditArgs = {}): Required<RouteBatchAuditArgs> {
  return {
    year: args.year ?? 2026,
    month: args.month ?? 3,
    batchDir:
      args.batchDir ??
      fromRepoRoot(
        join("data/artifacts/route-batches", isoMonth(args.year ?? 2026, args.month ?? 3)),
      ),
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

function parseCliArgs(args: string[]): RouteBatchAuditArgs {
  const output: RouteBatchAuditArgs = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === "--year" && value !== undefined) {
      output.year = Number(value);
      index += 1;
      continue;
    }

    if (arg === "--month" && value !== undefined) {
      output.month = Number(value);
      index += 1;
      continue;
    }

    if (arg === "--db" && value !== undefined) {
      output.dbPath = fromCliPath(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${arg ?? ""}`);
  }

  return output;
}

async function readLocalAuditRows(path: string, month: string) {
  const local = await openLocalPipelineDb(path);

  try {
    const [routeCatalog, routeBuildPlan] = await Promise.all([
      listRouteCatalog(local.db),
      listRouteBuildPlan(local.db, month),
    ]);

    return {
      routeCatalog,
      routeBuildPlan,
    };
  } finally {
    local.sqlite.close();
  }
}

async function fileDigest(path: string): Promise<{ byteLength: number; sha256: string }> {
  const bytes = Buffer.from(await Bun.file(path).arrayBuffer());

  return {
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function readJsonIfPresent<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
): Promise<z.output<TSchema> | null> {
  const file = Bun.file(path);

  if (!(await file.exists())) {
    return null;
  }

  try {
    return schema.parse(await file.json());
  } catch {
    return null;
  }
}

async function auditRoute(input: {
  routeId: string;
  month: string;
  routeDir: string;
}): Promise<RouteBatchAuditRow> {
  const manifestPath = join(input.routeDir, "artifact-manifest.json");
  const issues: string[] = [];
  const manifestFile = Bun.file(manifestPath);

  if (!(await manifestFile.exists())) {
    return {
      routeId: input.routeId,
      isoMonth: input.month,
      status: "fail",
      expectedArtifactCount: artifactNames.length,
      verifiedArtifactCount: 0,
      missingArtifactCount: artifactNames.length,
      hashMismatchCount: 0,
      byteLengthMismatchCount: 0,
      totalByteLength: 0,
      issues: ["missing_manifest"],
    };
  }

  const manifest = ArtifactManifestSchema.parse(await manifestFile.json());
  const artifactsByName = new Map(manifest.artifacts.map((artifact) => [artifact.name, artifact]));
  let verifiedArtifactCount = 0;
  let missingArtifactCount = 0;
  let hashMismatchCount = 0;
  let byteLengthMismatchCount = 0;
  let totalByteLength = 0;

  for (const name of artifactNames) {
    const artifact = artifactsByName.get(name);

    if (artifact === undefined) {
      missingArtifactCount += 1;
      issues.push(`missing_required_artifact:${name}`);
      continue;
    }

    const path = artifact.path ?? join(input.routeDir, name);
    const file = Bun.file(path);

    if (!(await file.exists())) {
      missingArtifactCount += 1;
      issues.push(`missing_artifact_file:${name}`);
      continue;
    }

    const digest = await fileDigest(path);
    totalByteLength += digest.byteLength;
    verifiedArtifactCount += 1;

    if (digest.byteLength !== artifact.byteLength) {
      byteLengthMismatchCount += 1;
      issues.push(`byte_length_mismatch:${name}`);
    }
    if (digest.sha256 !== artifact.sha256) {
      hashMismatchCount += 1;
      issues.push(`sha256_mismatch:${name}`);
    }
  }

  if (manifest.routeId !== input.routeId) {
    issues.push(`route_id_mismatch:${manifest.routeId}`);
  }
  if (manifest.isoMonth !== input.month) {
    issues.push(`month_mismatch:${manifest.isoMonth}`);
  }

  return {
    routeId: input.routeId,
    isoMonth: input.month,
    status: issues.length === 0 ? "pass" : "fail",
    expectedArtifactCount: artifactNames.length,
    verifiedArtifactCount,
    missingArtifactCount,
    hashMismatchCount,
    byteLengthMismatchCount,
    totalByteLength,
    issues,
  };
}

function summarizeStatus(rows: readonly RouteBatchAuditRow[]): RouteAuditStatus {
  return rows.every((row) => row.status === "pass") ? "pass" : "fail";
}

function summarizeIssues(rows: readonly RouteBatchAuditRow[]): string[] {
  return rows.flatMap((row) => row.issues.map((issue) => `${row.routeId}:${issue}`));
}

export async function buildRouteBatchAudit(
  args: RouteBatchAuditArgs = {},
): Promise<RouteBatchAuditResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const batchDir = options.batchDir;
  const auditPath = join(batchDir, "route-batch-audit.json");
  const comparisonPath = join(batchDir, "route-comparison.json");
  const batch = BatchSummarySchema.parse(
    await Bun.file(join(batchDir, "batch-summary.json")).json(),
  );
  const [{ routeCatalog, routeBuildPlan }, comparison] = await Promise.all([
    readLocalAuditRows(options.dbPath, month),
    readJsonIfPresent(comparisonPath, RouteComparisonSchema),
  ]);
  const rows = await Promise.all(
    batch.routes.map((route) =>
      auditRoute({
        routeId: route.routeId,
        month,
        routeDir: fromRepoRoot(
          join("data/artifacts/route-slices", routeSliceKey(route.routeId, month)),
        ),
      }),
    ),
  );
  const issues = summarizeIssues(rows);
  const catalogByRouteId = new Map(routeCatalog.map((row) => [row.routeId, row]));
  const buildPlanByRouteId = new Map(routeBuildPlan.map((row) => [row.routeId, row]));
  const rankedRouteIds = new Set(comparison?.rankedRoutes.map((row) => row.routeId) ?? []);
  const coverageRows = (
    await Promise.all(
      batch.routes.map(async (route) => {
        const routeDir = fromRepoRoot(
          join("data/artifacts/route-slices", routeSliceKey(route.routeId, month)),
        );
        const scorecard = await readJsonIfPresent(
          join(routeDir, "route-scorecard.json"),
          RouteScorecardSchema,
        );

        if (scorecard === null) {
          return null;
        }

        const catalogRow = catalogByRouteId.get(route.routeId);
        const buildPlanRow = buildPlanByRouteId.get(route.routeId);
        const visibility = classifyPublicRouteVisibility({
          routeId: route.routeId,
          routeLongName: catalogRow?.routeLongName ?? null,
          routeTypes: catalogRow?.routeTypes ?? [],
          shapeCount: catalogRow?.shapeCount ?? 0,
          coverageStatus: scorecard.coverageStatus,
        });

        return {
          routeId: route.routeId,
          coverageStatus: scorecard.coverageStatus,
          comparisonIncluded: rankedRouteIds.has(route.routeId),
          publicVisible: visibility.publicVisible,
          publicVisibilityReason: visibility.reason,
          readinessStatus: buildPlanRow?.readinessStatus ?? null,
          missingInputs: buildPlanRow?.missingInputs ?? [],
        } satisfies RouteCoverageAuditRow;
      }),
    )
  ).filter((row): row is RouteCoverageAuditRow => row !== null);
  const summary = {
    schemaVersion,
    analysisPeriod: month,
    generatedAt: new Date().toISOString(),
    status: summarizeStatus(rows),
    routeCount: rows.length,
    artifactCount: rows.reduce((sum, row) => sum + row.verifiedArtifactCount, 0),
    missingArtifactCount: rows.reduce((sum, row) => sum + row.missingArtifactCount, 0),
    hashMismatchCount: rows.reduce((sum, row) => sum + row.hashMismatchCount, 0),
    byteLengthMismatchCount: rows.reduce((sum, row) => sum + row.byteLengthMismatchCount, 0),
    totalByteLength: rows.reduce((sum, row) => sum + row.totalByteLength, 0),
    issueCount: issues.length,
    builtRouteIds: rows.map((row) => row.routeId),
    issues,
    coverageReport: {
      routeCount: coverageRows.length,
      fullObservedRouteCount: coverageRows.filter((row) => row.coverageStatus === "full").length,
      noObservedSpeedRouteCount: coverageRows.filter(
        (row) => row.coverageStatus === "no_observed_speed",
      ).length,
      comparisonExcludedRouteCount: coverageRows.filter((row) => !row.comparisonIncluded).length,
      publicHiddenRouteCount: coverageRows.filter((row) => !row.publicVisible).length,
      missingGeometryRouteCount: coverageRows.filter(
        (row) => row.readinessStatus === "missing_geometry",
      ).length,
      missingScheduleRouteCount: coverageRows.filter((row) =>
        row.missingInputs.includes("schedules"),
      ).length,
      publicHiddenRoutes: coverageRows
        .filter((row) => !row.publicVisible)
        .map((row) => ({
          routeId: row.routeId,
          reason: row.publicVisibilityReason,
        })),
      rows: coverageRows,
    },
    rows,
  };

  await mkdir(batchDir, { recursive: true });
  await writeJson(auditPath, summary);

  return {
    isoMonth: month,
    auditPath,
    routeCount: summary.routeCount,
    status: summary.status,
    issueCount: summary.issueCount,
    artifactCount: summary.artifactCount,
    totalByteLength: summary.totalByteLength,
  };
}

export async function buildRouteBatchAuditFromCli(args: string[]): Promise<RouteBatchAuditResult> {
  return buildRouteBatchAudit(parseCliArgs(args));
}
