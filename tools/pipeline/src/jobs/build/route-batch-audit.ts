import { createHash } from "node:crypto";
import { join } from "node:path";
import { listRouteArtifacts, replaceRouteBatch } from "@bp/db/local";
import { isoMonth } from "../../lib/dates.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { fromRepoRoot } from "../../source-manifest.js";

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

type RouteBatchAuditArgs = {
  year?: number;
  month?: number;
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

type RouteBatchAuditResult = {
  isoMonth: string;
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
    return {
      routeArtifacts: await listRouteArtifacts(local.db, month),
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

async function auditRoute(input: {
  routeId: string;
  month: string;
  artifacts: readonly {
    artifactName: string;
    artifactKey: string;
    byteLength: number;
    sha256: string;
  }[];
}): Promise<RouteBatchAuditRow> {
  const issues: string[] = [];
  const artifactsByName = new Map(
    input.artifacts.map((artifact) => [artifact.artifactName, artifact]),
  );
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

    const path = fromRepoRoot(join("data/artifacts", artifact.artifactKey));
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

function routeBatchIssueParts(issue: string): {
  routeId: string | null;
  issueCode: string;
  message: string;
} {
  const [routeId, issueCode] = issue.split(":");

  return {
    routeId: routeId === undefined || routeId.length === 0 ? null : routeId,
    issueCode: issueCode === undefined || issueCode.length === 0 ? "unknown" : issueCode,
    message: issue,
  };
}

export async function buildRouteBatchAudit(
  args: RouteBatchAuditArgs = {},
): Promise<RouteBatchAuditResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const { routeArtifacts } = await readLocalAuditRows(options.dbPath, month);
  const artifactsByRoute = new Map<string, typeof routeArtifacts>();
  for (const artifact of routeArtifacts) {
    artifactsByRoute.set(artifact.routeId, [
      ...(artifactsByRoute.get(artifact.routeId) ?? []),
      artifact,
    ]);
  }
  const rows = await Promise.all(
    [...artifactsByRoute.entries()].map(([routeId, artifacts]) =>
      auditRoute({
        routeId,
        month,
        artifacts,
      }),
    ),
  );
  const issues = summarizeIssues(rows);
  const summary = {
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
  };

  const local = await openLocalPipelineDb(options.dbPath);
  try {
    await replaceRouteBatch(local.db, {
      status: {
        month,
        generatedAt: summary.generatedAt,
        status: summary.status,
        routeCount: summary.routeCount,
        artifactCount: summary.artifactCount,
        missingArtifactCount: summary.missingArtifactCount,
        hashMismatchCount: summary.hashMismatchCount,
        byteLengthMismatchCount: summary.byteLengthMismatchCount,
        totalByteLength: summary.totalByteLength,
        issueCount: summary.issueCount,
      },
      builtRoutes: rows.map((row, index) => ({
        month,
        routeRank: index + 1,
        routeId: row.routeId,
        artifactCount: row.verifiedArtifactCount,
        status: row.status === "pass" ? "built" : "failed",
      })),
      issues: issues.map((issue, index) => {
        const parts = routeBatchIssueParts(issue);
        return {
          month,
          issueRank: index + 1,
          routeId: parts.routeId,
          severity: "error",
          issueCode: parts.issueCode,
          message: parts.message,
        };
      }),
    });
  } finally {
    local.sqlite.close();
  }

  return {
    isoMonth: month,
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
