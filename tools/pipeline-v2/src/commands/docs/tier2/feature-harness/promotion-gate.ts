import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJson } from "../../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../../lib/paths.ts";
import { FEATURE_PROOF_LEDGER_ARTIFACT_KIND, type Tier2FeatureProofLedgerArtifact } from "./types.ts";

export const FEATURE_PROMOTION_GATE_ARTIFACT_KIND = "bp.tier2_feature_promotion_gate.v1" as const;

export type Tier2FeaturePromotionGate = {
  artifactKind: typeof FEATURE_PROMOTION_GATE_ARTIFACT_KIND;
  schemaVersion: 1;
  generatedAt: string;
  sourceLedgerPath: string;
  strictNoBlockingErrors: boolean;
  passed: boolean;
  errors: Array<{ code: string; message: string }>;
  summary: {
    fieldCandidateCount: number;
    publishableFieldCount: number;
    publishableFieldWithoutProofCount: number;
    validationErrorCount: number;
  };
};

export function evaluateTier2FeaturePromotionGate(input: {
  ledger: Tier2FeatureProofLedgerArtifact;
  sourceLedgerPath: string;
  strictNoBlockingErrors?: boolean;
  generatedAt?: string;
}): Tier2FeaturePromotionGate {
  const errors: Tier2FeaturePromotionGate["errors"] = [];
  const strictNoBlockingErrors = input.strictNoBlockingErrors === true;
  if (input.ledger.artifactKind !== FEATURE_PROOF_LEDGER_ARTIFACT_KIND) {
    errors.push({
      code: "wrong_ledger_artifact_kind",
      message: `Expected ${FEATURE_PROOF_LEDGER_ARTIFACT_KIND}; got ${input.ledger.artifactKind}.`,
    });
  }
  if (input.ledger.summary.publishableFieldWithoutProofCount !== 0) {
    errors.push({
      code: "publishable_field_without_proof",
      message:
        "At least one public/detector/causal/brief feature is publishable without verified source-local proof.",
    });
  }
  for (const candidate of input.ledger.candidates) {
    const promoted =
      candidate.promotionEligibility.publicFeature ||
      candidate.promotionEligibility.detectorFeature ||
      candidate.promotionEligibility.causalFeature ||
      candidate.promotionEligibility.briefFeature;
    if (!promoted) continue;
    if (candidate.role !== "canonical_field" || candidate.canonicalLeafId === null) {
      errors.push({
        code: "promoted_candidate_without_canonical_resolution",
        message: `Candidate ${candidate.candidateId} is promoted without canonical vocabulary resolution.`,
      });
      break;
    }
    if (candidate.proofState !== "verified" || candidate.validationErrors.length > 0) {
      errors.push({
        code: "promoted_candidate_not_verified",
        message: `Candidate ${candidate.candidateId} is promoted but has proofState=${candidate.proofState}.`,
      });
      break;
    }
  }
  if (strictNoBlockingErrors && input.ledger.summary.validationErrorCount > 0) {
    errors.push({
      code: "strict_gate_validation_errors",
      message: "Strict promotion gate requires zero validation errors in the full ledger.",
    });
  }
  return {
    artifactKind: FEATURE_PROMOTION_GATE_ARTIFACT_KIND,
    schemaVersion: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourceLedgerPath: input.sourceLedgerPath,
    strictNoBlockingErrors,
    passed: errors.length === 0,
    errors,
    summary: {
      fieldCandidateCount: input.ledger.summary.fieldCandidateCount,
      publishableFieldCount: input.ledger.summary.publishableFieldCount,
      publishableFieldWithoutProofCount: input.ledger.summary.publishableFieldWithoutProofCount,
      validationErrorCount: input.ledger.summary.validationErrorCount,
    },
  };
}

export async function runTier2FeaturePromotionGate(input: {
  ledgerPath: string;
  outputPath?: string;
  strictNoBlockingErrors?: boolean;
  generatedAt?: string;
}): Promise<{ gate: Tier2FeaturePromotionGate; outputPath: string }> {
  const ledgerPath = fromCliPath(input.ledgerPath);
  const ledger = (await Bun.file(ledgerPath).json()) as Tier2FeatureProofLedgerArtifact;
  const gate = evaluateTier2FeaturePromotionGate({
    ledger,
    sourceLedgerPath: ledgerPath,
    ...(input.strictNoBlockingErrors === undefined ? {} : { strictNoBlockingErrors: input.strictNoBlockingErrors }),
    ...(input.generatedAt === undefined ? {} : { generatedAt: input.generatedAt }),
  });
  const outputPath = fromCliPath(
    input.outputPath ??
      join(defaultArtifactRootPath(), "docs", "tier2-feature-promotion-gate.json"),
  );
  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, gate);
  return { gate, outputPath };
}
