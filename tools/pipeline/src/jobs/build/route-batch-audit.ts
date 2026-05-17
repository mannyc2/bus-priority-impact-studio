import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  LocalCorridorArtifact,
  LocalRouteArtifact,
  LocalRouteObservedReliabilitySummary,
} from "@bp/db/local";
import {
  listCorridorArtifacts,
  listCorridorMonthSummaries,
  listGtfsRtCollectionRuns,
  listRouteArtifacts,
  listRouteBatchBuiltRoutes,
  listRouteBriefSummaries,
  listRouteObservedReliabilitySummaries,
  replaceRouteBatch,
} from "@bp/db/local";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";

type RouteBatchAuditArgs = {
  year?: number;
  month?: number;
  dbPath?: string;
  artifactRoot?: string;
};

type RouteAuditStatus = "pass" | "fail";

type RouteBatchAuditResult = {
  isoMonth: string;
  manifestPath: string;
  routeCount: number;
  status: RouteAuditStatus;
  issueCount: number;
  missingArtifactCount: number;
  hashMismatchCount: number;
  byteLengthMismatchCount: number;
  artifactCount: number;
  totalByteLength: number;
};

type AuditIssue = {
  routeId: string | null;
  severity: "error";
  issueCode: string;
  message: string;
};

type BriefArtifactRow = LocalRouteArtifact | LocalCorridorArtifact;

type JsonObject = Record<string, unknown>;

type BriefContractContext = {
  reliabilityByRoute: ReadonlyMap<string, LocalRouteObservedReliabilitySummary>;
  collectionRunIds: ReadonlySet<string>;
};

const requiredArtifactNames = ["brief.json", "brief.md", "brief.html"] as const;

function parseBuildArgs(args: RouteBatchAuditArgs = {}) {
  return createMonthContext(args);
}

function parseCliArgs(args: string[]): RouteBatchAuditArgs {
  return parseMonthDbCliArgs(args, {} as RouteBatchAuditArgs, [
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.artifactRoot = fromCliPath(value);
        }
      },
    },
  ]);
}

function artifactPath(artifactRoot: string, artifactKey: string): string {
  return join(artifactRoot, artifactKey);
}

function artifactManifestPath(artifactRoot: string, month: string): string {
  return join(artifactRoot, "briefs", month, "manifest.json");
}

function artifactOwner(row: BriefArtifactRow): string {
  return "routeId" in row ? row.routeId : row.corridorId;
}

function artifactOwnerKind(row: BriefArtifactRow): "route" | "corridor" {
  return "routeId" in row ? "route" : "corridor";
}

function issueOwner(row: BriefArtifactRow): string | null {
  return "routeId" in row ? row.routeId : null;
}

function artifactKey(row: BriefArtifactRow): string {
  return `${artifactOwner(row)}:${row.artifactName}`;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasKey(value: JsonObject, key: string): boolean {
  return Object.hasOwn(value, key);
}

function jsonField(value: JsonObject, key: string): unknown {
  return value[key];
}

function missingRequiredIssues(input: {
  expectedOwners: readonly string[];
  rows: readonly BriefArtifactRow[];
  ownerKind: "route" | "corridor";
}): AuditIssue[] {
  const existing = new Set(input.rows.map(artifactKey));
  const issues: AuditIssue[] = [];

  for (const owner of input.expectedOwners) {
    for (const name of requiredArtifactNames) {
      if (existing.has(`${owner}:${name}`)) {
        continue;
      }

      issues.push({
        routeId: input.ownerKind === "route" ? owner : null,
        severity: "error",
        issueCode: `${input.ownerKind}_brief_artifact_missing`,
        message: `Missing ${name} for ${input.ownerKind} ${owner}`,
      });
    }
  }

  return issues;
}

async function verifyArtifact(
  row: BriefArtifactRow,
  artifactRoot: string,
): Promise<{
  missing: boolean;
  hashMismatch: boolean;
  byteLengthMismatch: boolean;
  issues: AuditIssue[];
}> {
  const file = Bun.file(artifactPath(artifactRoot, row.artifactKey));
  const exists = await file.exists();
  if (!exists) {
    return {
      missing: true,
      hashMismatch: false,
      byteLengthMismatch: false,
      issues: [
        {
          routeId: issueOwner(row),
          severity: "error",
          issueCode: "artifact_file_missing",
          message: `Missing artifact file ${row.artifactKey}`,
        },
      ],
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const byteLengthMismatch = bytes.byteLength !== row.byteLength;
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  const hashMismatch = actualSha256 !== row.sha256;
  const issues: AuditIssue[] = [];
  if (byteLengthMismatch) {
    issues.push({
      routeId: issueOwner(row),
      severity: "error",
      issueCode: "artifact_byte_length_mismatch",
      message: `Artifact ${row.artifactKey} expected ${row.byteLength} bytes but found ${bytes.byteLength}`,
    });
  }
  if (hashMismatch) {
    issues.push({
      routeId: issueOwner(row),
      severity: "error",
      issueCode: "artifact_hash_mismatch",
      message: `Artifact ${row.artifactKey} failed SHA-256 verification`,
    });
  }

  return {
    missing: false,
    hashMismatch,
    byteLengthMismatch,
    issues,
  };
}

async function readJsonArtifact(row: BriefArtifactRow, artifactRoot: string): Promise<unknown> {
  try {
    return await Bun.file(artifactPath(artifactRoot, row.artifactKey)).json();
  } catch {
    return null;
  }
}

function briefJsonShapeIssues(row: BriefArtifactRow, json: unknown): AuditIssue[] {
  if (!isJsonObject(json)) {
    return [
      {
        routeId: issueOwner(row),
        severity: "error",
        issueCode: "brief_json_invalid",
        message: `Brief JSON artifact ${row.artifactKey} could not be parsed as an object.`,
      },
    ];
  }

  const expectedKind = artifactOwnerKind(row) === "route" ? "route_brief" : "corridor_brief";
  const issues: AuditIssue[] = [];
  const artifactKind = jsonField(json, "artifactKind");
  if (artifactKind !== expectedKind) {
    issues.push({
      routeId: issueOwner(row),
      severity: "error",
      issueCode: "brief_json_kind_mismatch",
      message: `Brief JSON artifact ${row.artifactKey} has artifactKind ${String(artifactKind)}; expected ${expectedKind}.`,
    });
  }
  const artifactMonth = jsonField(json, "month");
  if (artifactMonth !== row.month) {
    issues.push({
      routeId: issueOwner(row),
      severity: "error",
      issueCode: "brief_json_month_mismatch",
      message: `Brief JSON artifact ${row.artifactKey} has month ${String(artifactMonth)}; expected ${row.month}.`,
    });
  }

  return issues;
}

function routeBriefReliabilityContractIssues(
  row: LocalRouteArtifact,
  json: unknown,
  context: BriefContractContext,
): AuditIssue[] {
  if (!isJsonObject(json)) {
    return [];
  }

  const issues: AuditIssue[] = [];
  const routeId = jsonField(json, "routeId");
  if (routeId !== row.routeId) {
    issues.push({
      routeId: row.routeId,
      severity: "error",
      issueCode: "route_brief_route_id_mismatch",
      message: `Route brief ${row.artifactKey} has routeId ${String(routeId)}; expected ${row.routeId}.`,
    });
  }
  if (!hasKey(json, "observedReliability")) {
    issues.push({
      routeId: row.routeId,
      severity: "error",
      issueCode: "route_brief_observed_reliability_contract_missing",
      message: `Route brief ${row.artifactKey} does not include observedReliability.`,
    });
    return issues;
  }

  const reliability = context.reliabilityByRoute.get(row.routeId);
  if (reliability === undefined) {
    return issues;
  }

  const observedReliability = jsonField(json, "observedReliability");
  if (!isJsonObject(observedReliability)) {
    issues.push({
      routeId: row.routeId,
      severity: "error",
      issueCode: "route_brief_observed_reliability_contract_missing",
      message: `Route brief ${row.artifactKey} should include observedReliability details for ${reliability.runId}.`,
    });
    return issues;
  }
  const reliabilityStatus = jsonField(observedReliability, "status");
  const sampleCount = jsonField(observedReliability, "sampleCount");
  if (
    reliabilityStatus !== reliability.reliabilityStatus ||
    sampleCount !== reliability.sampleCount
  ) {
    issues.push({
      routeId: row.routeId,
      severity: "error",
      issueCode: "route_brief_observed_reliability_mismatch",
      message: `Route brief ${row.artifactKey} observedReliability does not match local reliability summary for ${reliability.runId}.`,
    });
  }
  if (!hasKey(observedReliability, "collectionWindow")) {
    issues.push({
      routeId: row.routeId,
      severity: "error",
      issueCode: "route_brief_collection_window_contract_missing",
      message: `Route brief ${row.artifactKey} does not include observedReliability.collectionWindow.`,
    });
    return issues;
  }
  if (!context.collectionRunIds.has(reliability.runId)) {
    return issues;
  }

  const collectionWindow = jsonField(observedReliability, "collectionWindow");
  if (
    !isJsonObject(collectionWindow) ||
    jsonField(collectionWindow, "runId") !== reliability.runId
  ) {
    issues.push({
      routeId: row.routeId,
      severity: "error",
      issueCode: "route_brief_collection_window_missing",
      message: `Route brief ${row.artifactKey} does not include the collection window for observed reliability run ${reliability.runId}.`,
    });
  }

  return issues;
}

function corridorBriefContractIssues(row: LocalCorridorArtifact, json: unknown): AuditIssue[] {
  if (!isJsonObject(json)) {
    return [];
  }

  const issues: AuditIssue[] = [];
  const corridorId = jsonField(json, "corridorId");
  if (corridorId !== row.corridorId) {
    issues.push({
      routeId: null,
      severity: "error",
      issueCode: "corridor_brief_corridor_id_mismatch",
      message: `Corridor brief ${row.artifactKey} has corridorId ${String(corridorId)}; expected ${row.corridorId}.`,
    });
  }
  const metrics = jsonField(json, "metrics");
  if (!isJsonObject(metrics) || !hasKey(metrics, "observedReliabilityRouteCount")) {
    issues.push({
      routeId: null,
      severity: "error",
      issueCode: "corridor_brief_metrics_contract_missing",
      message: `Corridor brief ${row.artifactKey} does not include observed reliability route-count metrics.`,
    });
  }

  return issues;
}

async function verifyBriefJsonContract(
  row: BriefArtifactRow,
  context: BriefContractContext,
  artifactRoot: string,
): Promise<AuditIssue[]> {
  if (row.artifactName !== "brief.json") {
    return [];
  }

  const json = await readJsonArtifact(row, artifactRoot);
  const shapeIssues = briefJsonShapeIssues(row, json);
  if ("routeId" in row) {
    return [...shapeIssues, ...routeBriefReliabilityContractIssues(row, json, context)];
  }

  return [...shapeIssues, ...corridorBriefContractIssues(row, json)];
}

async function writeBriefArtifactManifest(input: {
  path: string;
  month: string;
  generatedAt: string;
  status: RouteAuditStatus;
  routeCount: number;
  publicRouteCount: number;
  corridorCount: number;
  routeArtifactCount: number;
  corridorArtifactCount: number;
  artifactRows: readonly BriefArtifactRow[];
  totalByteLength: number;
  missingArtifactCount: number;
  hashMismatchCount: number;
  byteLengthMismatchCount: number;
  issues: readonly AuditIssue[];
}): Promise<void> {
  const content = {
    schemaVersion: 1,
    artifactKind: "brief_artifact_manifest",
    analysisPeriod: input.month,
    generatedAt: input.generatedAt,
    status: input.status,
    requiredArtifactNames,
    routeCount: input.routeCount,
    publicRouteCount: input.publicRouteCount,
    corridorCount: input.corridorCount,
    routeArtifactCount: input.routeArtifactCount,
    corridorArtifactCount: input.corridorArtifactCount,
    artifactCount: input.artifactRows.length,
    totalByteLength: input.totalByteLength,
    missingArtifactCount: input.missingArtifactCount,
    hashMismatchCount: input.hashMismatchCount,
    byteLengthMismatchCount: input.byteLengthMismatchCount,
    issueCount: input.issues.length,
    artifacts: input.artifactRows.map((row) => ({
      ownerKind: artifactOwnerKind(row),
      ownerId: artifactOwner(row),
      month: row.month,
      artifactName: row.artifactName,
      artifactKey: row.artifactKey,
      contentType: row.contentType,
      byteLength: row.byteLength,
      sha256: row.sha256,
    })),
    issues: input.issues,
  };

  await mkdir(dirname(input.path), { recursive: true });
  await Bun.write(input.path, `${JSON.stringify(content, null, 2)}\n`);
}

export async function buildRouteBatchAudit(
  args: RouteBatchAuditArgs = {},
): Promise<RouteBatchAuditResult> {
  const options = parseBuildArgs(args);
  const month = options.isoMonth;
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const manifestPath = artifactManifestPath(artifactRoot, month);
  const auditInput = await withLocalPipelineDb(options.dbPath, async (local) => {
    const [
      builtRoutes,
      routeBriefs,
      routeArtifacts,
      observedReliability,
      collectionRuns,
      corridors,
      corridorArtifacts,
    ] = await Promise.all([
      listRouteBatchBuiltRoutes(local.db, month),
      listRouteBriefSummaries(local.db, month),
      listRouteArtifacts(local.db, month),
      listRouteObservedReliabilitySummaries(local.db, month),
      listGtfsRtCollectionRuns(local.db),
      listCorridorMonthSummaries(local.db, month),
      listCorridorArtifacts(local.db, month),
    ]);

    return {
      builtRoutes,
      publicRouteIds: routeBriefs.filter((row) => row.publicVisible).map((row) => row.routeId),
      routeArtifacts,
      observedReliability,
      collectionRuns,
      corridorIds: corridors.map((row) => row.corridorId),
      corridorArtifacts,
    };
  });
  const artifactRows: BriefArtifactRow[] = [
    ...auditInput.routeArtifacts,
    ...auditInput.corridorArtifacts,
  ];
  const requiredIssues = [
    ...missingRequiredIssues({
      expectedOwners: auditInput.publicRouteIds,
      rows: auditInput.routeArtifacts,
      ownerKind: "route",
    }),
    ...missingRequiredIssues({
      expectedOwners: auditInput.corridorIds,
      rows: auditInput.corridorArtifacts,
      ownerKind: "corridor",
    }),
  ];
  const verificationResults = await Promise.all(
    artifactRows.map((row) => verifyArtifact(row, artifactRoot)),
  );
  const verificationIssues = verificationResults.flatMap((result) => result.issues);
  const contractContext: BriefContractContext = {
    reliabilityByRoute: new Map(auditInput.observedReliability.map((row) => [row.routeId, row])),
    collectionRunIds: new Set(auditInput.collectionRuns.map((row) => row.runId)),
  };
  const contractIssues = (
    await Promise.all(
      artifactRows.map((row) => verifyBriefJsonContract(row, contractContext, artifactRoot)),
    )
  ).flat();
  const issues = [...requiredIssues, ...verificationIssues, ...contractIssues];
  const missingArtifactCount =
    requiredIssues.length + verificationResults.filter((result) => result.missing).length;
  const hashMismatchCount = verificationResults.filter((result) => result.hashMismatch).length;
  const byteLengthMismatchCount = verificationResults.filter(
    (result) => result.byteLengthMismatch,
  ).length;
  const totalByteLength = artifactRows.reduce((sum, row) => sum + row.byteLength, 0);
  const generatedAt = new Date().toISOString();
  const status: RouteAuditStatus = issues.length === 0 ? "pass" : "fail";

  const routeCount = await withLocalPipelineDb(options.dbPath, async (local) => {
    await replaceRouteBatch(local.db, {
      status: {
        month,
        generatedAt,
        status,
        routeCount: auditInput.builtRoutes.length,
        artifactCount: artifactRows.length,
        missingArtifactCount,
        hashMismatchCount,
        byteLengthMismatchCount,
        totalByteLength,
        issueCount: issues.length,
      },
      builtRoutes: auditInput.builtRoutes.map((r, index) => ({
        month,
        routeRank: index + 1,
        routeId: r.routeId,
        artifactCount: auditInput.routeArtifacts.filter((row) => row.routeId === r.routeId).length,
        status: "built",
      })),
      issues: issues.map((issue, index) => ({
        month,
        issueRank: index + 1,
        routeId: issue.routeId,
        severity: issue.severity,
        issueCode: issue.issueCode,
        message: issue.message,
      })),
    });

    return auditInput.builtRoutes.length;
  });
  await writeBriefArtifactManifest({
    path: manifestPath,
    month,
    generatedAt,
    status,
    routeCount,
    publicRouteCount: auditInput.publicRouteIds.length,
    corridorCount: auditInput.corridorIds.length,
    routeArtifactCount: auditInput.routeArtifacts.length,
    corridorArtifactCount: auditInput.corridorArtifacts.length,
    artifactRows,
    totalByteLength,
    missingArtifactCount,
    hashMismatchCount,
    byteLengthMismatchCount,
    issues,
  });

  return {
    isoMonth: month,
    manifestPath,
    routeCount,
    status,
    issueCount: issues.length,
    missingArtifactCount,
    hashMismatchCount,
    byteLengthMismatchCount,
    artifactCount: artifactRows.length,
    totalByteLength,
  };
}

export async function buildRouteBatchAuditFromCli(args: string[]): Promise<RouteBatchAuditResult> {
  return buildRouteBatchAudit(parseCliArgs(args));
}
