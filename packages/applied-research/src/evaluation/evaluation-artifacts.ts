import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  evaluationArtifactKey,
  evaluationArtifactManifestPath,
  evaluationArtifactPath,
} from "../artifacts";

export type EvaluationArtifactKind =
  | "observed_reliability_evaluation_payload"
  | "route_intervention_evaluation_payload"
  | "corridor_intervention_evaluation_payload";

export type EvaluationArtifactEntry = {
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

export type EvaluationObservedReliabilityRow = {
  reliabilityStatus?: string | null;
  sampleCount?: number | null;
};

export type EvaluationInterventionEventRow = {
  eventId: string;
};

export type EvaluationInterventionComparisonRow = {
  eventId: string;
  comparisonStatus?: string | null;
};

export type EvaluationArtifactRows = {
  observedReliability: readonly EvaluationObservedReliabilityRow[];
  interventionEvents: readonly EvaluationInterventionEventRow[];
  interventionComparisons: readonly EvaluationInterventionComparisonRow[];
  corridorInterventionContexts: readonly unknown[];
};

export type EvaluationJsonArtifact = {
  path: string;
  artifactKey: string;
  bytes: Uint8Array;
  entry: EvaluationArtifactEntry;
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

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function referencedEvaluationInterventionEvents(input: {
  events: readonly EvaluationInterventionEventRow[];
  comparisons: readonly EvaluationInterventionComparisonRow[];
}): EvaluationInterventionEventRow[] {
  const referencedEventIds = new Set(input.comparisons.map((row) => row.eventId));
  return input.events.filter((row) => referencedEventIds.has(row.eventId));
}

export function buildEvaluationArtifactPayloads(input: {
  month: string;
  generatedAt: string;
  rows: EvaluationArtifactRows;
}): {
  observedPayload: unknown;
  interventionsPayload: unknown;
  corridorPayload: unknown;
  referencedInterventionEvents: EvaluationInterventionEventRow[];
} {
  const referencedInterventionEvents = referencedEvaluationInterventionEvents({
    events: input.rows.interventionEvents,
    comparisons: input.rows.interventionComparisons,
  });
  return {
    observedPayload: {
      schemaVersion: 1,
      artifactKind: "observed_reliability_evaluation_payload",
      analysisPeriod: input.month,
      generatedAt: input.generatedAt,
      routeCount: input.rows.observedReliability.length,
      observedRouteCount: input.rows.observedReliability.filter(
        (row) => row.reliabilityStatus === "observed",
      ).length,
      insufficientRouteCount: input.rows.observedReliability.filter(
        (row) => row.reliabilityStatus === "insufficient_gtfs_rt_samples",
      ).length,
      sampleCount: input.rows.observedReliability.reduce(
        (sum, row) => sum + (row.sampleCount ?? 0),
        0,
      ),
      rows: input.rows.observedReliability,
    },
    interventionsPayload: {
      schemaVersion: 1,
      artifactKind: "route_intervention_evaluation_payload",
      analysisPeriod: input.month,
      generatedAt: input.generatedAt,
      eventCount: referencedInterventionEvents.length,
      comparisonCount: input.rows.interventionComparisons.length,
      evaluatedComparisonCount: input.rows.interventionComparisons.filter(
        (row) => row.comparisonStatus === "evaluated",
      ).length,
      events: referencedInterventionEvents,
      comparisons: input.rows.interventionComparisons,
    },
    corridorPayload: {
      schemaVersion: 1,
      artifactKind: "corridor_intervention_evaluation_payload",
      analysisPeriod: input.month,
      generatedAt: input.generatedAt,
      contextCount: input.rows.corridorInterventionContexts.length,
      rows: input.rows.corridorInterventionContexts,
    },
    referencedInterventionEvents,
  };
}

export function buildEvaluationJsonArtifact(input: {
  path: string;
  artifactKey: string;
  artifactKind: EvaluationArtifactKind;
  rowCount: number;
  payload: unknown;
}): EvaluationJsonArtifact {
  const bytes = new TextEncoder().encode(`${JSON.stringify(input.payload, null, 2)}\n`);
  return {
    path: input.path,
    artifactKey: input.artifactKey,
    bytes,
    entry: {
      artifactKind: input.artifactKind,
      artifactKey: input.artifactKey,
      contentType,
      byteLength: bytes.byteLength,
      sha256: hashBytes(bytes),
      rowCount: input.rowCount,
    },
  };
}

export function buildEvaluationJsonArtifacts(input: {
  artifactRoot: string;
  month: string;
  generatedAt: string;
  rows: EvaluationArtifactRows;
}): {
  artifacts: EvaluationJsonArtifact[];
  referencedInterventionEvents: EvaluationInterventionEventRow[];
} {
  const payloads = buildEvaluationArtifactPayloads(input);
  return {
    referencedInterventionEvents: payloads.referencedInterventionEvents,
    artifacts: [
      buildEvaluationJsonArtifact({
        path: evaluationArtifactPath(input.artifactRoot, input.month, "observed-reliability.json"),
        artifactKey: evaluationArtifactKey(input.month, "observed-reliability.json"),
        artifactKind: "observed_reliability_evaluation_payload",
        rowCount: input.rows.observedReliability.length,
        payload: payloads.observedPayload,
      }),
      buildEvaluationJsonArtifact({
        path: evaluationArtifactPath(input.artifactRoot, input.month, "interventions.json"),
        artifactKey: evaluationArtifactKey(input.month, "interventions.json"),
        artifactKind: "route_intervention_evaluation_payload",
        rowCount: input.rows.interventionComparisons.length,
        payload: payloads.interventionsPayload,
      }),
      buildEvaluationJsonArtifact({
        path: evaluationArtifactPath(
          input.artifactRoot,
          input.month,
          "corridor-interventions.json",
        ),
        artifactKey: evaluationArtifactKey(input.month, "corridor-interventions.json"),
        artifactKind: "corridor_intervention_evaluation_payload",
        rowCount: input.rows.corridorInterventionContexts.length,
        payload: payloads.corridorPayload,
      }),
    ],
  };
}

export function buildEvaluationArtifactManifest(input: {
  month: string;
  generatedAt: string;
  artifacts: readonly EvaluationArtifactEntry[];
}): EvaluationArtifactManifest {
  const totalByteLength = input.artifacts.reduce((sum, row) => sum + row.byteLength, 0);
  return {
    schemaVersion: 1,
    artifactKind: "evaluation_artifact_manifest",
    analysisPeriod: input.month,
    generatedAt: input.generatedAt,
    status: "pass",
    artifactCount: input.artifacts.length,
    totalByteLength,
    issueCount: 0,
    artifacts: [...input.artifacts],
  };
}

export function isEvaluationArtifactManifest(value: unknown): value is EvaluationArtifactManifest {
  if (!isJsonObject(value)) return false;
  return (
    value["schemaVersion"] === 1 &&
    value["artifactKind"] === "evaluation_artifact_manifest" &&
    typeof value["analysisPeriod"] === "string" &&
    typeof value["generatedAt"] === "string" &&
    value["status"] === "pass" &&
    typeof value["artifactCount"] === "number" &&
    typeof value["totalByteLength"] === "number" &&
    value["issueCount"] === 0 &&
    Array.isArray(value["artifacts"])
  );
}

export async function readEvaluationArtifactManifest(input: {
  artifactRoot: string;
  month: string;
}): Promise<EvaluationArtifactManifest | null> {
  const file = Bun.file(evaluationArtifactManifestPath(input.artifactRoot, input.month));
  if (!(await file.exists())) return null;
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

  if (input.payload["artifactKind"] !== input.artifact.artifactKind) {
    issues.push({
      code: "evaluation_artifact_payload_kind_mismatch",
      artifactKey: input.artifact.artifactKey,
      message: `Evaluation artifact ${input.artifact.artifactKey} has artifactKind ${String(input.payload["artifactKind"])}; expected ${input.artifact.artifactKind}.`,
    });
  }
  if (input.payload["analysisPeriod"] !== input.month) {
    issues.push({
      code: "evaluation_artifact_payload_month_mismatch",
      artifactKey: input.artifact.artifactKey,
      message: `Evaluation artifact ${input.artifact.artifactKey} is for ${String(input.payload["analysisPeriod"])}, expected ${input.month}.`,
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
