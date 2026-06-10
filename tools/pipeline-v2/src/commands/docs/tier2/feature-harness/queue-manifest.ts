import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import * as z from "zod";
import { writeJson } from "../../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../../lib/paths.ts";

export const QUEUE_MANIFEST_GATE_ARTIFACT_KIND = "bp.tier2_feature_queue_manifest_gate.v1" as const;

export const QueueKindSchema = z.enum([
  "full_corpus",
  "repair_subset",
  "targeted_backfill",
  "validation_canary",
]);
export type QueueKind = z.output<typeof QueueKindSchema>;

export const Tier2FeatureQueueManifestSchema = z
  .object({
    artifactKind: z.literal("bp.tier2_feature_queue_manifest.v1").default("bp.tier2_feature_queue_manifest.v1"),
    schemaVersion: z.literal(1).default(1),
    generatedAt: z.string().min(1),
    queueId: z.string().min(1),
    queueKind: QueueKindSchema,
    description: z.string().min(1).optional(),
    sourceRunIds: z.array(z.string().min(1)).default([]),
    inputPaths: z.array(z.string().min(1)).default([]),
  })
  .strict();

export type Tier2FeatureQueueManifest = z.output<typeof Tier2FeatureQueueManifestSchema>;

export type Tier2FeatureQueueManifestGate = {
  artifactKind: typeof QUEUE_MANIFEST_GATE_ARTIFACT_KIND;
  schemaVersion: 1;
  generatedAt: string;
  manifestPath: string;
  requestedQueueKind: QueueKind;
  allowNonFullCorpusInput: boolean;
  passed: boolean;
  errors: Array<{ code: string; message: string }>;
  manifest: Tier2FeatureQueueManifest;
};

export function evaluateTier2FeatureQueueManifestGate(input: {
  manifest: Tier2FeatureQueueManifest;
  manifestPath: string;
  requestedQueueKind: QueueKind;
  allowNonFullCorpusInput?: boolean;
  generatedAt?: string;
}): Tier2FeatureQueueManifestGate {
  const errors: Tier2FeatureQueueManifestGate["errors"] = [];
  const allowNonFullCorpusInput = input.allowNonFullCorpusInput === true;
  if (
    input.requestedQueueKind === "full_corpus" &&
    input.manifest.queueKind !== "full_corpus" &&
    !allowNonFullCorpusInput
  ) {
    errors.push({
      code: "qv_tail_input_used_for_full_corpus",
      message: `Requested full_corpus execution but queue ${input.manifest.queueId} declares ${input.manifest.queueKind}.`,
    });
  }
  return {
    artifactKind: QUEUE_MANIFEST_GATE_ARTIFACT_KIND,
    schemaVersion: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    manifestPath: input.manifestPath,
    requestedQueueKind: input.requestedQueueKind,
    allowNonFullCorpusInput,
    passed: errors.length === 0,
    errors,
    manifest: input.manifest,
  };
}

export async function runTier2FeatureQueueManifestGate(input: {
  manifestPath: string;
  requestedQueueKind: QueueKind;
  outputPath?: string;
  allowNonFullCorpusInput?: boolean;
  generatedAt?: string;
}): Promise<{ gate: Tier2FeatureQueueManifestGate; outputPath: string }> {
  const manifestPath = fromCliPath(input.manifestPath);
  const rawManifest = await Bun.file(manifestPath).json();
  const manifest = Tier2FeatureQueueManifestSchema.parse(rawManifest);
  const gate = evaluateTier2FeatureQueueManifestGate({
    manifest,
    manifestPath,
    requestedQueueKind: input.requestedQueueKind,
    ...(input.allowNonFullCorpusInput === undefined
      ? {}
      : { allowNonFullCorpusInput: input.allowNonFullCorpusInput }),
    ...(input.generatedAt === undefined ? {} : { generatedAt: input.generatedAt }),
  });
  const outputPath = fromCliPath(
    input.outputPath ??
      join(defaultArtifactRootPath(), "docs", "tier2-feature-queue-manifest-gate.json"),
  );
  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, gate);
  return { gate, outputPath };
}
