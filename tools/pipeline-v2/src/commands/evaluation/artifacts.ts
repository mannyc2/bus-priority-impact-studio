import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { arg, defineCommand, z } from "@liche/core";
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
import { isoMonth } from "../../lib/dates.ts";
import {
  dbOptions,
  localDbFromCtx,
  type OpenLocalPipelineDb,
  withLocalDb,
} from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.ts";

type EvaluationArtifactKind =
  | "observed_reliability_evaluation_payload"
  | "route_intervention_evaluation_payload"
  | "corridor_intervention_evaluation_payload";

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
  artifactKind: "evaluation_artifact_manifest";
  analysisPeriod: string;
  generatedAt: string;
  status: "pass";
  artifactCount: number;
  totalByteLength: number;
  issueCount: 0;
  artifacts: EvaluationArtifactEntry[];
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

export type EvaluationArtifactIssue = {
  code: string;
  message: string;
  artifactKey?: string;
};

export type EvaluationArtifactExpectedRowCounts = {
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

const contentType = "application/json" as const;

const artifactDefinitions = [
  {
    artifactKind: "observed_reliability_evaluation_payload" as const,
    fileName: "observed-reliability.json",
    rowField: "rows",
    rowCountName: "observedReliability" as const,
  },
  {
    artifactKind: "route_intervention_evaluation_payload" as const,
    fileName: "interventions.json",
    rowField: "comparisons",
    rowCountName: "routeInterventionComparisons" as const,
  },
  {
    artifactKind: "corridor_intervention_evaluation_payload" as const,
    fileName: "corridor-interventions.json",
    rowField: "rows",
    rowCountName: "corridorInterventionContexts" as const,
  },
] satisfies readonly {
  artifactKind: EvaluationArtifactKind;
  fileName: string;
  rowField: string;
  rowCountName: keyof EvaluationArtifactExpectedRowCounts;
}[];

function evaluationArtifactKey(month: string, fileName: string): string {
  return join("evaluations", month, fileName);
}

function evaluationArtifactPath(artifactRoot: string, month: string, fileName: string): string {
  return join(artifactRoot, evaluationArtifactKey(month, fileName));
}

export function evaluationArtifactManifestPath(artifactRoot: string, month: string): string {
  return evaluationArtifactPath(artifactRoot, month, "manifest.json");
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

async function readEvaluationRows(input: {
  local: OpenLocalPipelineDb;
  month: string;
}): Promise<{
  observedReliability: LocalRouteObservedReliabilitySummary[];
  interventionEvents: LocalInterventionEvent[];
  interventionComparisons: LocalRouteInterventionComparison[];
  corridorInterventionContexts: LocalCorridorInterventionContext[];
}> {
  const [
    observedReliability,
    interventionEvents,
    interventionComparisons,
    corridorInterventionContexts,
  ] = await Promise.all([
    listRouteObservedReliabilitySummaries(input.local.db, input.month),
    listInterventionEvents(input.local.db),
    listRouteInterventionComparisons(input.local.db, input.month),
    listCorridorInterventionContexts(input.local.db, input.month),
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
}

export async function runEvaluationArtifacts(inputs: {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  artifactRoot?: string | undefined;
}): Promise<EvaluationArtifactsResult> {
  const month = isoMonth(inputs.year, inputs.month);
  const artifactRoot = inputs.artifactRoot ?? defaultArtifactRootPath();
  const generatedAt = new Date().toISOString();
  const rows = await readEvaluationRows({ local: inputs.local, month });

  const observedPayload = {
    schemaVersion: 1,
    artifactKind: "observed_reliability_evaluation_payload",
    analysisPeriod: month,
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
    analysisPeriod: month,
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
    analysisPeriod: month,
    generatedAt,
    contextCount: rows.corridorInterventionContexts.length,
    rows: rows.corridorInterventionContexts,
  } as const;

  const artifacts = await Promise.all([
    writeJsonArtifact({
      path: evaluationArtifactPath(artifactRoot, month, "observed-reliability.json"),
      artifactKey: evaluationArtifactKey(month, "observed-reliability.json"),
      artifactKind: observedPayload.artifactKind,
      rowCount: rows.observedReliability.length,
      payload: observedPayload,
    }),
    writeJsonArtifact({
      path: evaluationArtifactPath(artifactRoot, month, "interventions.json"),
      artifactKey: evaluationArtifactKey(month, "interventions.json"),
      artifactKind: interventionsPayload.artifactKind,
      rowCount: rows.interventionComparisons.length,
      payload: interventionsPayload,
    }),
    writeJsonArtifact({
      path: evaluationArtifactPath(artifactRoot, month, "corridor-interventions.json"),
      artifactKey: evaluationArtifactKey(month, "corridor-interventions.json"),
      artifactKind: corridorPayload.artifactKind,
      rowCount: rows.corridorInterventionContexts.length,
      payload: corridorPayload,
    }),
  ]);
  const totalByteLength = artifacts.reduce((sum, row) => sum + row.byteLength, 0);
  const manifest: EvaluationArtifactManifest = {
    schemaVersion: 1,
    artifactKind: "evaluation_artifact_manifest",
    analysisPeriod: month,
    generatedAt,
    status: "pass",
    artifactCount: artifacts.length,
    totalByteLength,
    issueCount: 0,
    artifacts,
  };
  const manifestPath = evaluationArtifactManifestPath(artifactRoot, month);
  await mkdir(dirname(manifestPath), { recursive: true });
  await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    isoMonth: month,
    manifestPath,
    artifactCount: artifacts.length,
    totalByteLength,
    observedReliabilityRowCount: rows.observedReliability.length,
    interventionEventCount: rows.interventionEvents.length,
    interventionComparisonCount: rows.interventionComparisons.length,
    corridorInterventionContextRowCount: rows.corridorInterventionContexts.length,
  };
}

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEvaluationArtifactManifest(value: unknown): value is EvaluationArtifactManifest {
  if (!isJsonObject(value)) return false;
  return (
    (value as { schemaVersion?: unknown }).schemaVersion === 1 &&
    (value as { artifactKind?: unknown }).artifactKind === "evaluation_artifact_manifest" &&
    typeof (value as { analysisPeriod?: unknown }).analysisPeriod === "string" &&
    typeof (value as { generatedAt?: unknown }).generatedAt === "string" &&
    (value as { status?: unknown }).status === "pass" &&
    typeof (value as { artifactCount?: unknown }).artifactCount === "number" &&
    typeof (value as { totalByteLength?: unknown }).totalByteLength === "number" &&
    (value as { issueCount?: unknown }).issueCount === 0 &&
    Array.isArray((value as { artifacts?: unknown }).artifacts)
  );
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

function rowCountForPayload(payload: unknown, rowField: string): number | null {
  if (!isJsonObject(payload)) return null;
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

  const payload = input.payload as JsonObject;
  if (payload["artifactKind"] !== input.artifact.artifactKind) {
    issues.push({
      code: "evaluation_artifact_payload_kind_mismatch",
      artifactKey: input.artifact.artifactKey,
      message: `Evaluation artifact ${input.artifact.artifactKey} has artifactKind ${String(payload["artifactKind"])}; expected ${input.artifact.artifactKind}.`,
    });
  }
  if (payload["analysisPeriod"] !== input.month) {
    issues.push({
      code: "evaluation_artifact_payload_month_mismatch",
      artifactKey: input.artifact.artifactKey,
      message: `Evaluation artifact ${input.artifact.artifactKey} is for ${String(payload["analysisPeriod"])}, expected ${input.month}.`,
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
}): Promise<{ issues: EvaluationArtifactIssue[]; rowCount: number }> {
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

  return { rowCount: input.artifact.rowCount, issues };
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

export default defineCommand({
  path: ["evaluation", "artifacts"],
  summary: "Write evaluation JSON artifacts (observed reliability + interventions) and manifest.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
    }),
  },
  middleware: [withLocalDb()],
  output: z.object({
    isoMonth: z.string(),
    manifestPath: z.string(),
    artifactCount: z.number(),
    totalByteLength: z.number(),
    observedReliabilityRowCount: z.number(),
    interventionEventCount: z.number(),
    interventionComparisonCount: z.number(),
    corridorInterventionContextRowCount: z.number(),
  }),
  async run({ ctx, input }) {
    return runEvaluationArtifacts({
      local: localDbFromCtx(ctx),
      year: input.options.year,
      month: input.options.month,
      artifactRoot:
        input.options.artifactRoot === undefined
          ? undefined
          : fromCliPath(input.options.artifactRoot),
    });
  },
});
