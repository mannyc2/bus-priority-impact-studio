import { constants } from "node:fs";
import { copyFile, readFile } from "node:fs/promises";
import { relative } from "node:path";
import {
  type Plan042AcceptanceManifest,
  Plan042AcceptanceManifestSchema,
  Plan042CandidateSetV5Schema,
  Plan042ExtentBindingArtifactSchema,
  Plan042GrainVerdictArtifactSchema,
  Plan042IdentityVerdictProjectionSchema,
  Plan042LineageComparabilityArtifactSchema,
  Plan042MemberGrainProjectionSchema,
  Plan042OutcomeRelevanceRegistrySchema,
  Plan042ProducerImportArtifactSchema,
  Plan042ReviewHandoffArtifactSchema,
  Plan042ServicePatternCoverageArtifactSchema,
  Plan042StopSetCoverageArtifactSchema,
} from "@bp/domain/studio/member-grain-outcomes";
import type { Schema } from "effect";
import { sha256Bytes } from "./plan042-member-grain.ts";
import { decodeSchemaStrict } from "./schema-decode.ts";

const ARTIFACTS = [
  ["candidate-set-v5", "candidate-set-v5.json", Plan042CandidateSetV5Schema],
  ["extent-segment-bindings", "extent-segment-bindings.json", Plan042ExtentBindingArtifactSchema],
  ["grain-verdict-matrix", "grain-verdict-matrix.json", Plan042GrainVerdictArtifactSchema],
  [
    "identity-verdict-import",
    "identity-verdict-import.json",
    Plan042IdentityVerdictProjectionSchema,
  ],
  [
    "lineage-comparability",
    "lineage-comparability.json",
    Plan042LineageComparabilityArtifactSchema,
  ],
  ["member-grain-import", "member-grain-import.json", Plan042MemberGrainProjectionSchema],
  [
    "outcome-relevance-registry",
    "outcome-relevance-registry.json",
    Plan042OutcomeRelevanceRegistrySchema,
  ],
  [
    "pending-review-handoff",
    "pending-review-handoff.json",
    Plan042ReviewHandoffArtifactSchema,
    "review-handoff.json",
  ],
  ["producer-import", "producer-import.json", Plan042ProducerImportArtifactSchema],
  [
    "service-pattern-coverage",
    "service-pattern-coverage.json",
    Plan042ServicePatternCoverageArtifactSchema,
  ],
  ["stop-set-coverage", "stop-set-coverage.json", Plan042StopSetCoverageArtifactSchema],
] as const;

export const PLAN042_IMPLEMENTATION_PATHS = [
  "biome.jsonc",
  "packages/domain/package.json",
  "packages/domain/src/studio/member-grain-outcomes.ts",
  "tools/pipeline-v2/src/cli/registry.ts",
  "tools/pipeline-v2/src/commands/render-closure-downstream-pin.ts",
  "tools/pipeline-v2/src/commands/study/certify-member-grain-outcomes.ts",
  "tools/pipeline-v2/src/commands/study/finalize-member-grain-review.ts",
  "tools/pipeline-v2/src/commands/study/freeze-member-grain-acceptance.ts",
  "tools/pipeline-v2/src/commands/verify-closure-receipt.ts",
  "tools/pipeline-v2/src/lib/plan042-acceptance.ts",
  "tools/pipeline-v2/src/lib/plan042-closure-receipt.ts",
  "tools/pipeline-v2/src/lib/plan042-member-grain.ts",
  "tools/pipeline-v2/src/lib/plan042-review-finalizer.ts",
  "tools/pipeline-v2/test/cli/registry.test.ts",
  "tools/pipeline-v2/test/lib/plan042-closure-receipt.test.ts",
  "tools/pipeline-v2/test/lib/plan042-member-grain.test.ts",
] as const;

function decodeJson<T>(schema: Schema.Constraint, bytes: Uint8Array, label: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (cause) {
    throw new Error(`${label}: invalid JSON: ${String(cause)}`);
  }
  return decodeSchemaStrict(schema, parsed) as T;
}

async function readBytes(path: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path));
}

function repositoryPath(repositoryRoot: string, path: string): string {
  const value = relative(repositoryRoot, path);
  if (value.length === 0 || value === ".." || value.startsWith("../") || value.startsWith("/")) {
    throw new Error(`${path}: acceptance artifact must be inside the repository`);
  }
  return value;
}

function artifactRowCount(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record["row_count"] === "number") return record["row_count"];
  const summary = record["summary"];
  if (
    summary &&
    typeof summary === "object" &&
    typeof (summary as Record<string, unknown>)["candidate_count"] === "number"
  ) {
    return (summary as Record<string, number>)["candidate_count"] ?? null;
  }
  return null;
}

function artifactTreeSha256(
  artifacts: readonly {
    readonly artifact_id: string;
    readonly bytes: number;
    readonly sha256: string;
  }[],
): string {
  return sha256Bytes(
    new TextEncoder().encode(
      `${artifacts
        .map((artifact) => `${artifact.artifact_id}\u0000${artifact.bytes}\u0000${artifact.sha256}`)
        .join("\n")}\n`,
    ),
  );
}

export async function buildPlan042AcceptanceManifest(input: {
  readonly repositoryRoot: string;
  readonly artifactDir: string;
  readonly replayArtifactDir: string;
  readonly focusedLogPath: string;
  readonly typecheckLogPath: string;
  readonly validationLogPath: string;
  readonly replayLogPath: string;
  readonly focusedCommand: string;
  readonly typecheckCommand: string;
  readonly validationCommand: string;
  readonly replayCommand: string;
}): Promise<Plan042AcceptanceManifest> {
  const sourceHandoffPath = `${input.artifactDir}/review-handoff.json`;
  const pendingHandoffPath = `${input.artifactDir}/pending-review-handoff.json`;
  const sourceHandoffBytes = await readBytes(sourceHandoffPath);
  const sourceHandoff = decodeJson<typeof Plan042ReviewHandoffArtifactSchema.Type>(
    Plan042ReviewHandoffArtifactSchema,
    sourceHandoffBytes,
    sourceHandoffPath,
  );
  if (sourceHandoff.status !== "pending_independent_review") {
    throw new Error("Acceptance manifest source handoff must still be pending");
  }
  try {
    const existingPendingBytes = await readBytes(pendingHandoffPath);
    if (sha256Bytes(existingPendingBytes) !== sha256Bytes(sourceHandoffBytes)) {
      throw new Error("Frozen pending review handoff differs from current pending bytes");
    }
  } catch (cause) {
    if (!(cause instanceof Error) || !("code" in cause) || cause.code !== "ENOENT") {
      throw cause;
    }
    await copyFile(sourceHandoffPath, pendingHandoffPath, constants.COPYFILE_EXCL);
  }
  const artifacts = await Promise.all(
    ARTIFACTS.map(async ([artifactId, fileName, schema]) => {
      const path = `${input.artifactDir}/${fileName}`;
      const bytes = await readBytes(path);
      const artifact = decodeJson<unknown>(schema, bytes, path);
      return {
        artifact_id: artifactId,
        path: repositoryPath(input.repositoryRoot, path),
        bytes: bytes.byteLength,
        sha256: sha256Bytes(bytes),
        row_count: artifactRowCount(artifact),
      };
    }),
  );
  const replayArtifacts = await Promise.all(
    ARTIFACTS.map(async ([artifactId, fileName, schema, replayFileName]) => {
      const path = `${input.replayArtifactDir}/${replayFileName ?? fileName}`;
      const bytes = await readBytes(path);
      decodeJson(schema, bytes, path);
      return {
        artifact_id: artifactId,
        bytes: bytes.byteLength,
        sha256: sha256Bytes(bytes),
      };
    }),
  );
  const artifactTree = artifactTreeSha256(artifacts);
  const replayTree = artifactTreeSha256(replayArtifacts);
  if (artifactTree !== replayTree) {
    throw new Error("Plan 042 deterministic replay artifact tree differs");
  }
  const handoffPath = pendingHandoffPath;
  const handoff = decodeJson<typeof Plan042ReviewHandoffArtifactSchema.Type>(
    Plan042ReviewHandoffArtifactSchema,
    await readBytes(handoffPath),
    handoffPath,
  );
  if (handoff.status !== "pending_independent_review") {
    throw new Error("Acceptance manifest must freeze the pre-review handoff");
  }
  const logs = await Promise.all(
    [
      ["focused", input.focusedLogPath],
      ["typecheck", input.typecheckLogPath],
      ["validation", input.validationLogPath],
      ["replay", input.replayLogPath],
    ].map(async ([id, path]) => {
      if (id === undefined || path === undefined) throw new Error("Invalid check log");
      const bytes = await readBytes(path);
      return [
        id,
        {
          path: repositoryPath(input.repositoryRoot, path),
          bytes: bytes.byteLength,
          sha256: sha256Bytes(bytes),
        },
      ] as const;
    }),
  );
  const logById = Object.fromEntries(logs) as Record<
    "focused" | "typecheck" | "validation" | "replay",
    { readonly path: string; readonly bytes: number; readonly sha256: string }
  >;
  const candidateSet = decodeJson<typeof Plan042CandidateSetV5Schema.Type>(
    Plan042CandidateSetV5Schema,
    await readBytes(`${input.artifactDir}/candidate-set-v5.json`),
    "candidate set",
  );
  const implementationFiles = await Promise.all(
    PLAN042_IMPLEMENTATION_PATHS.map(async (path) => {
      const fileBytes = await readBytes(`${input.repositoryRoot}/${path}`);
      return {
        path,
        bytes: fileBytes.byteLength,
        sha256: sha256Bytes(fileBytes),
      };
    }),
  );
  return decodeSchemaStrict(Plan042AcceptanceManifestSchema, {
    artifact_kind: "bp.plan042.acceptance-manifest.v1",
    schema_version: 1,
    candidate_set_id: candidateSet.candidate_set_id,
    review_cut_id: handoff.review_cut_id,
    artifacts,
    implementation_files: implementationFiles,
    checks: {
      focused: {
        check_id: "focused",
        command: input.focusedCommand,
        exit_code: 0,
        result: "passed",
        log: logById.focused,
      },
      typecheck: {
        check_id: "typecheck",
        command: input.typecheckCommand,
        exit_code: 0,
        result: "passed",
        log: logById.typecheck,
      },
      validation: {
        check_id: "validation",
        command: input.validationCommand,
        exit_code: 0,
        result: "passed",
        log: logById.validation,
      },
      replay: {
        check_id: "replay",
        command: input.replayCommand,
        exit_code: 0,
        result: "passed",
        log: logById.replay,
        replay_artifact_tree_sha256: replayTree,
      },
    },
    package_results: handoff.package_results.map((result) => ({
      package_id: result.package_id,
      candidate_or_member_count: result.candidate_or_member_count,
      item_ids: result.item_ids,
      item_ids_sha256: result.item_ids_sha256,
      risk_class: result.risk_class,
      check_ids: ["focused", "typecheck", "validation", "replay"],
      authority: { authorizes_study: false, authorizes_publication: false },
    })),
    authority: {
      authorizes_study: false,
      authorizes_occurrence: false,
      authorizes_publication: false,
      authorizes_d1_r2_mutation: false,
      authorizes_deploy: false,
    },
  });
}
