import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  LocalCorridorInterventionContext,
  LocalInterventionEvent,
  LocalRouteInterventionComparison,
  LocalRouteObservedReliabilitySummary,
} from "@bp/db/local";
import {
  listCorridorInterventionContexts,
  listInterventionEvents,
  listRouteInterventionComparisons,
  listRouteObservedReliabilitySummaries,
} from "@bp/db/local";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";

type EvaluationArtifactsArgs = {
  year?: number;
  month?: number;
  dbPath?: string;
  artifactRoot?: string;
};

type EvaluationArtifactKind =
  | "observed_reliability_evaluation_payload"
  | "route_intervention_evaluation_payload"
  | "corridor_intervention_evaluation_payload";

type EvaluationArtifactManifestKind = "evaluation_artifact_manifest";

type EvaluationArtifactEntry = {
  artifactKind: EvaluationArtifactKind;
  artifactKey: string;
  contentType: "application/json";
  byteLength: number;
  sha256: string;
  rowCount: number;
};

export type EvaluationArtifactManifest = {
  schemaVersion: 1;
  artifactKind: EvaluationArtifactManifestKind;
  analysisPeriod: string;
  generatedAt: string;
  status: "pass";
  artifactCount: number;
  totalByteLength: number;
  issueCount: 0;
  artifacts: EvaluationArtifactEntry[];
};

type EvaluationArtifactIssue = {
  code: string;
  message: string;
  artifactKey?: string;
};

type EvaluationArtifactExpectedRowCounts = {
  observedReliability: number;
  routeInterventionComparisons: number;
  corridorInterventionContexts: number;
};

export type EvaluationArtifactVerification = {
  status: "pass" | "fail";
  manifestPath: string;
  artifactCount: number;
  totalByteLength: number;
  issueCount: number;
  issues: EvaluationArtifactIssue[];
  rowCounts: EvaluationArtifactExpectedRowCounts;
};

export type EvaluationArtifactsResult = {
  isoMonth: string;
  manifestPath: string;
  artifactCount: number;
  totalByteLength: number;
  observedReliabilityRowCount: number;
  interventionEventCount: number;
  interventionComparisonCount: number;
  corridorInterventionContextRowCount: number;
};

type JsonObject = Record<string, unknown>;

type EvaluationManifestCandidate = {
  schemaVersion?: unknown;
  artifactKind?: unknown;
  analysisPeriod?: unknown;
  generatedAt?: unknown;
  status?: unknown;
  artifactCount?: unknown;
  totalByteLength?: unknown;
  issueCount?: unknown;
  artifacts?: unknown;
};

type EvaluationPayloadCandidate = JsonObject & {
  artifactKind?: unknown;
  analysisPeriod?: unknown;
};

const contentType = "application/json" as const;

const artifactDefinitions = [
  {
    artifactKind: "observed_reliability_evaluation_payload",
    fileName: "observed-reliability.json",
    rowField: "rows",
    rowCountName: "observedReliability",
  },
  {
    artifactKind: "route_intervention_evaluation_payload",
    fileName: "interventions.json",
    rowField: "comparisons",
    rowCountName: "routeInterventionComparisons",
  },
  {
    artifactKind: "corridor_intervention_evaluation_payload",
    fileName: "corridor-interventions.json",
    rowField: "rows",
    rowCountName: "corridorInterventionContexts",
  },
] as const satisfies readonly {
  artifactKind: EvaluationArtifactKind;
  fileName: string;
  rowField: string;
  rowCountName: keyof EvaluationArtifactExpectedRowCounts;
}[];

function parseCliArgs(args: string[]): EvaluationArtifactsArgs {
  return parseMonthDbCliArgs(args, {} as EvaluationArtifactsArgs, [
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

function evaluationArtifactKey(month: string, fileName: string): string {
  return join("evaluations", month, fileName);
}

function evaluationArtifactPath(artifactRoot: string, month: string, fileName: string): string {
  return join(artifactRoot, evaluationArtifactKey(month, fileName));
}

export function evaluationArtifactManifestPath(artifactRoot: string, month: string): string {
  return evaluationArtifactPath(artifactRoot, month, "manifest.json");
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function writeJsonArtifact(input: {
  path: string;
  artifactKey: string;
  artifactKind: EvaluationArtifactKind;
  rowCount: number;
  payload: unknown;
}): Promise<EvaluationArtifactEntry> {
  const bytes = new TextEncoder().encode(`${JSON.stringify(input.payload, null, 2)}\n`);
  await mkdir(dirname(input.path), { recursive: true });
  await Bun.write(input.path, bytes);

  return {
    artifactKind: input.artifactKind,
    artifactKey: input.artifactKey,
    contentType,
    byteLength: bytes.byteLength,
    sha256: hashBytes(bytes),
    rowCount: input.rowCount,
  };
}

function referencedEvents(input: {
  events: readonly LocalInterventionEvent[];
  comparisons: readonly LocalRouteInterventionComparison[];
}): LocalInterventionEvent[] {
  const referencedEventIds = new Set(input.comparisons.map((row) => row.eventId));
  return input.events.filter((row) => referencedEventIds.has(row.eventId));
}

async function readEvaluationRows(input: { dbPath: string; month: string }): Promise<{
  observedReliability: LocalRouteObservedReliabilitySummary[];
  interventionEvents: LocalInterventionEvent[];
  interventionComparisons: LocalRouteInterventionComparison[];
  corridorInterventionContexts: LocalCorridorInterventionContext[];
}> {
  return withLocalPipelineDb(input.dbPath, async (local) => {
    const [
      observedReliability,
      interventionEvents,
      interventionComparisons,
      corridorInterventionContexts,
    ] = await Promise.all([
      listRouteObservedReliabilitySummaries(local.db, input.month),
      listInterventionEvents(local.db),
      listRouteInterventionComparisons(local.db, input.month),
      listCorridorInterventionContexts(local.db, input.month),
    ]);

    return {
      observedReliability,
      interventionEvents: referencedEvents({
        events: interventionEvents,
        comparisons: interventionComparisons,
      }),
      interventionComparisons,
      corridorInterventionContexts,
    };
  });
}

export async function buildEvaluationArtifacts(
  args: EvaluationArtifactsArgs = {},
): Promise<EvaluationArtifactsResult> {
  const options = createMonthContext(args);
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const generatedAt = new Date().toISOString();
  const rows = await readEvaluationRows({
    dbPath: options.dbPath,
    month: options.isoMonth,
  });
  const observedPayload = {
    schemaVersion: 1,
    artifactKind: "observed_reliability_evaluation_payload",
    analysisPeriod: options.isoMonth,
    generatedAt,
    routeCount: rows.observedReliability.length,
    observedRouteCount: rows.observedReliability.filter(
      (row) => row.reliabilityStatus === "observed",
    ).length,
    insufficientRouteCount: rows.observedReliability.filter(
      (row) => row.reliabilityStatus === "insufficient_gtfs_rt_samples",
    ).length,
    sampleCount: rows.observedReliability.reduce((sum, row) => sum + row.sampleCount, 0),
    rows: rows.observedReliability,
  } as const;
  const interventionsPayload = {
    schemaVersion: 1,
    artifactKind: "route_intervention_evaluation_payload",
    analysisPeriod: options.isoMonth,
    generatedAt,
    eventCount: rows.interventionEvents.length,
    comparisonCount: rows.interventionComparisons.length,
    evaluatedComparisonCount: rows.interventionComparisons.filter(
      (row) => row.comparisonStatus === "evaluated",
    ).length,
    events: rows.interventionEvents,
    comparisons: rows.interventionComparisons,
  } as const;
  const corridorPayload = {
    schemaVersion: 1,
    artifactKind: "corridor_intervention_evaluation_payload",
    analysisPeriod: options.isoMonth,
    generatedAt,
    contextCount: rows.corridorInterventionContexts.length,
    rows: rows.corridorInterventionContexts,
  } as const;
  const artifacts = await Promise.all([
    writeJsonArtifact({
      path: evaluationArtifactPath(artifactRoot, options.isoMonth, "observed-reliability.json"),
      artifactKey: evaluationArtifactKey(options.isoMonth, "observed-reliability.json"),
      artifactKind: observedPayload.artifactKind,
      rowCount: rows.observedReliability.length,
      payload: observedPayload,
    }),
    writeJsonArtifact({
      path: evaluationArtifactPath(artifactRoot, options.isoMonth, "interventions.json"),
      artifactKey: evaluationArtifactKey(options.isoMonth, "interventions.json"),
      artifactKind: interventionsPayload.artifactKind,
      rowCount: rows.interventionComparisons.length,
      payload: interventionsPayload,
    }),
    writeJsonArtifact({
      path: evaluationArtifactPath(artifactRoot, options.isoMonth, "corridor-interventions.json"),
      artifactKey: evaluationArtifactKey(options.isoMonth, "corridor-interventions.json"),
      artifactKind: corridorPayload.artifactKind,
      rowCount: rows.corridorInterventionContexts.length,
      payload: corridorPayload,
    }),
  ]);
  const totalByteLength = artifacts.reduce((sum, row) => sum + row.byteLength, 0);
  const manifest: EvaluationArtifactManifest = {
    schemaVersion: 1,
    artifactKind: "evaluation_artifact_manifest",
    analysisPeriod: options.isoMonth,
    generatedAt,
    status: "pass",
    artifactCount: artifacts.length,
    totalByteLength,
    issueCount: 0,
    artifacts,
  };
  const manifestPath = evaluationArtifactManifestPath(artifactRoot, options.isoMonth);
  await mkdir(dirname(manifestPath), { recursive: true });
  await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    isoMonth: options.isoMonth,
    manifestPath,
    artifactCount: artifacts.length,
    totalByteLength,
    observedReliabilityRowCount: rows.observedReliability.length,
    interventionEventCount: rows.interventionEvents.length,
    interventionComparisonCount: rows.interventionComparisons.length,
    corridorInterventionContextRowCount: rows.corridorInterventionContexts.length,
  };
}

export async function readEvaluationArtifactManifest(input: {
  artifactRoot: string;
  month: string;
}): Promise<EvaluationArtifactManifest | null> {
  const file = Bun.file(evaluationArtifactManifestPath(input.artifactRoot, input.month));
  if (!(await file.exists())) {
    return null;
  }

  try {
    const parsed = await file.json();
    return isEvaluationArtifactManifest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isEvaluationArtifactManifest(value: unknown): value is EvaluationArtifactManifest {
  if (!isJsonObject(value)) {
    return false;
  }

  const candidate = value as EvaluationManifestCandidate;
  return (
    candidate.schemaVersion === 1 &&
    candidate.artifactKind === "evaluation_artifact_manifest" &&
    typeof candidate.analysisPeriod === "string" &&
    typeof candidate.generatedAt === "string" &&
    candidate.status === "pass" &&
    typeof candidate.artifactCount === "number" &&
    typeof candidate.totalByteLength === "number" &&
    candidate.issueCount === 0 &&
    Array.isArray(candidate.artifacts)
  );
}

function rowCountForPayload(payload: unknown, rowField: string): number | null {
  if (!isJsonObject(payload)) {
    return null;
  }
  const rows = payload[rowField];
  return Array.isArray(rows) ? rows.length : null;
}

function payloadContractIssues(input: {
  payload: unknown;
  artifact: EvaluationArtifactEntry;
  month: string;
  rowField: string;
  expectedRowCount: number | undefined;
}): EvaluationArtifactIssue[] {
  const issues: EvaluationArtifactIssue[] = [];
  if (!isJsonObject(input.payload)) {
    return [
      {
        code: "evaluation_artifact_payload_invalid",
        artifactKey: input.artifact.artifactKey,
        message: `Evaluation artifact ${input.artifact.artifactKey} is not a JSON object.`,
      },
    ];
  }

  const payload = input.payload as EvaluationPayloadCandidate;
  if (payload.artifactKind !== input.artifact.artifactKind) {
    issues.push({
      code: "evaluation_artifact_payload_kind_mismatch",
      artifactKey: input.artifact.artifactKey,
      message: `Evaluation artifact ${input.artifact.artifactKey} has artifactKind ${String(payload.artifactKind)}; expected ${input.artifact.artifactKind}.`,
    });
  }
  if (payload.analysisPeriod !== input.month) {
    issues.push({
      code: "evaluation_artifact_payload_month_mismatch",
      artifactKey: input.artifact.artifactKey,
      message: `Evaluation artifact ${input.artifact.artifactKey} is for ${String(payload.analysisPeriod)}, expected ${input.month}.`,
    });
  }

  const payloadRowCount = rowCountForPayload(input.payload, input.rowField);
  if (payloadRowCount === null) {
    issues.push({
      code: "evaluation_artifact_payload_rows_missing",
      artifactKey: input.artifact.artifactKey,
      message: `Evaluation artifact ${input.artifact.artifactKey} does not include ${input.rowField}.`,
    });
  } else if (payloadRowCount !== input.artifact.rowCount) {
    issues.push({
      code: "evaluation_artifact_payload_row_count_mismatch",
      artifactKey: input.artifact.artifactKey,
      message: `Evaluation artifact ${input.artifact.artifactKey} manifest rowCount is ${input.artifact.rowCount}, but payload has ${payloadRowCount}.`,
    });
  }

  if (input.expectedRowCount !== undefined && input.artifact.rowCount !== input.expectedRowCount) {
    issues.push({
      code: "evaluation_artifact_expected_row_count_mismatch",
      artifactKey: input.artifact.artifactKey,
      message: `Evaluation artifact ${input.artifact.artifactKey} has ${input.artifact.rowCount} rows; expected ${input.expectedRowCount} from local DB.`,
    });
  }

  return issues;
}

function expectedArtifactDefinitions(month: string): Map<
  EvaluationArtifactKind,
  {
    artifactKey: string;
    rowField: string;
    rowCountName: keyof EvaluationArtifactExpectedRowCounts;
  }
> {
  return new Map(
    artifactDefinitions.map((definition) => [
      definition.artifactKind,
      {
        artifactKey: evaluationArtifactKey(month, definition.fileName),
        rowField: definition.rowField,
        rowCountName: definition.rowCountName,
      },
    ]),
  );
}

async function verifyArtifactFile(input: {
  artifactRoot: string;
  month: string;
  artifact: EvaluationArtifactEntry;
  rowField: string;
  expectedRowCount: number | undefined;
}): Promise<{
  issues: EvaluationArtifactIssue[];
  rowCount: number;
}> {
  const path = join(input.artifactRoot, input.artifact.artifactKey);
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return {
      rowCount: input.artifact.rowCount,
      issues: [
        {
          code: "evaluation_artifact_file_missing",
          artifactKey: input.artifact.artifactKey,
          message: `Missing evaluation artifact file ${input.artifact.artifactKey}.`,
        },
      ],
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const issues: EvaluationArtifactIssue[] = [];
  if (bytes.byteLength !== input.artifact.byteLength) {
    issues.push({
      code: "evaluation_artifact_byte_length_mismatch",
      artifactKey: input.artifact.artifactKey,
      message: `Evaluation artifact ${input.artifact.artifactKey} expected ${input.artifact.byteLength} bytes but found ${bytes.byteLength}.`,
    });
  }
  if (hashBytes(bytes) !== input.artifact.sha256) {
    issues.push({
      code: "evaluation_artifact_hash_mismatch",
      artifactKey: input.artifact.artifactKey,
      message: `Evaluation artifact ${input.artifact.artifactKey} failed SHA-256 verification.`,
    });
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    issues.push({
      code: "evaluation_artifact_payload_invalid",
      artifactKey: input.artifact.artifactKey,
      message: `Evaluation artifact ${input.artifact.artifactKey} could not be parsed as JSON.`,
    });
  }

  issues.push(
    ...payloadContractIssues({
      payload,
      artifact: input.artifact,
      month: input.month,
      rowField: input.rowField,
      expectedRowCount: input.expectedRowCount,
    }),
  );

  return {
    rowCount: input.artifact.rowCount,
    issues,
  };
}

export async function verifyEvaluationArtifactManifest(input: {
  artifactRoot: string;
  month: string;
  expectedRowCounts?: EvaluationArtifactExpectedRowCounts;
}): Promise<EvaluationArtifactVerification> {
  const manifestPath = evaluationArtifactManifestPath(input.artifactRoot, input.month);
  const manifest = await readEvaluationArtifactManifest(input);
  if (manifest === null) {
    return {
      status: "fail",
      manifestPath,
      artifactCount: 0,
      totalByteLength: 0,
      issueCount: 1,
      issues: [
        {
          code: "evaluation_artifact_manifest_missing",
          message: `Missing or invalid evaluation artifact manifest for ${input.month}.`,
        },
      ],
      rowCounts: {
        observedReliability: 0,
        routeInterventionComparisons: 0,
        corridorInterventionContexts: 0,
      },
    };
  }

  const issues: EvaluationArtifactIssue[] = [];
  if (manifest.analysisPeriod !== input.month) {
    issues.push({
      code: "evaluation_artifact_manifest_month_mismatch",
      message: `Evaluation artifact manifest is for ${manifest.analysisPeriod}, expected ${input.month}.`,
    });
  }
  const expectedDefinitions = expectedArtifactDefinitions(input.month);
  if (manifest.artifactCount !== expectedDefinitions.size) {
    issues.push({
      code: "evaluation_artifact_manifest_count_mismatch",
      message: `Evaluation artifact manifest has ${manifest.artifactCount} artifact rows; expected ${expectedDefinitions.size}.`,
    });
  }

  const artifactsByKind = new Map(manifest.artifacts.map((row) => [row.artifactKind, row]));
  const verificationResults: Awaited<ReturnType<typeof verifyArtifactFile>>[] = [];
  const rowCounts: EvaluationArtifactExpectedRowCounts = {
    observedReliability: 0,
    routeInterventionComparisons: 0,
    corridorInterventionContexts: 0,
  };
  for (const [artifactKind, expected] of expectedDefinitions) {
    const artifact = artifactsByKind.get(artifactKind);
    if (artifact === undefined) {
      issues.push({
        code: "evaluation_artifact_manifest_artifact_missing",
        artifactKey: expected.artifactKey,
        message: `Evaluation artifact manifest lacks ${expected.artifactKey}.`,
      });
      continue;
    }

    if (artifact.artifactKey !== expected.artifactKey) {
      issues.push({
        code: "evaluation_artifact_manifest_artifact_key_mismatch",
        artifactKey: artifact.artifactKey,
        message: `Evaluation artifact manifest maps ${artifactKind} to ${artifact.artifactKey}; expected ${expected.artifactKey}.`,
      });
    }
    if (artifact.contentType !== contentType) {
      issues.push({
        code: "evaluation_artifact_manifest_content_type_mismatch",
        artifactKey: artifact.artifactKey,
        message: `Evaluation artifact ${artifact.artifactKey} has contentType ${artifact.contentType}; expected ${contentType}.`,
      });
    }

    const verification = await verifyArtifactFile({
      artifactRoot: input.artifactRoot,
      month: input.month,
      artifact,
      rowField: expected.rowField,
      expectedRowCount: input.expectedRowCounts?.[expected.rowCountName],
    });
    verificationResults.push(verification);
    rowCounts[expected.rowCountName] = verification.rowCount;
  }

  issues.push(...verificationResults.flatMap((result) => result.issues));
  const totalByteLength = manifest.artifacts.reduce((sum, row) => sum + row.byteLength, 0);
  if (manifest.totalByteLength !== totalByteLength) {
    issues.push({
      code: "evaluation_artifact_manifest_byte_total_mismatch",
      message: `Evaluation artifact manifest totalByteLength is ${manifest.totalByteLength}; artifact rows total ${totalByteLength}.`,
    });
  }

  return {
    status: issues.length === 0 ? "pass" : "fail",
    manifestPath,
    artifactCount: manifest.artifacts.length,
    totalByteLength,
    issueCount: issues.length,
    issues,
    rowCounts,
  };
}

export function buildEvaluationArtifactsFromCli(
  args: string[],
): Promise<EvaluationArtifactsResult> {
  return buildEvaluationArtifacts(parseCliArgs(args));
}
