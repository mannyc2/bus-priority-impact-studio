import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

// biome-ignore lint/suspicious/noExplicitAny: pinned external review artifacts are decoded dynamically.
type Json = any;

const args = new Map<string, string>();
for (let index = 2; index < Bun.argv.length; index += 2) {
  const flag = Bun.argv[index];
  const value = Bun.argv[index + 1];
  if (!flag?.startsWith("--") || value === undefined) {
    throw new Error(`Expected --flag value, received ${flag ?? "end of arguments"}`);
  }
  args.set(flag.slice(2), value);
}
const required = (name: string): string => {
  const value = args.get(name);
  if (value === undefined) throw new Error(`Missing --${name}`);
  return value;
};
const readJson = (path: string): Json => JSON.parse(readFileSync(path, "utf8"));
const sha256 = (path: string): string =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const identity = (candidate: Json): string =>
  [
    candidate.routeId,
    candidate.treatmentFamily,
    candidate.implementationDate,
    candidate.datePrecision,
  ].join("|");
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonical(record[key])]),
    );
  }
  return value;
};
const equalJson = (left: unknown, right: unknown): boolean =>
  JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
const outputFile = (inputFile: string): string => {
  if (!inputFile.endsWith(".input.json")) {
    throw new Error(`Expected .input.json batch filename, received ${inputFile}`);
  }
  return `${inputFile.slice(0, -".input.json".length)}.json`;
};
const counts = (decisions: Json[]) => ({
  recommend_approve: decisions.filter((decision) => decision.recommendation === "recommend_approve")
    .length,
  recommend_reject: decisions.filter((decision) => decision.recommendation === "recommend_reject")
    .length,
  needs_followup: decisions.filter((decision) => decision.recommendation === "needs_followup")
    .length,
});

const discoveryCandidatePath = required("discovery-candidate");
const correctedCandidatePath = required("corrected-candidate");
const discoveryRoot = required("discovery-review-root");
const correctedRoot = required("corrected-review-root");
const recheckPath = required("recheck");

const discoveryManifest = readJson(join(discoveryRoot, "inputs", "manifest.json"));
const correctedManifest = readJson(join(correctedRoot, "inputs", "manifest.json"));
const discoveryCandidateSet = readJson(discoveryCandidatePath);
const correctedCandidateSet = readJson(correctedCandidatePath);
const recheck = readJson(recheckPath);

for (const [label, manifest, candidateSet, candidatePath] of [
  ["discovery", discoveryManifest, discoveryCandidateSet, discoveryCandidatePath],
  ["corrected", correctedManifest, correctedCandidateSet, correctedCandidatePath],
] as const) {
  if (manifest.candidateSetId !== candidateSet.candidateSetId) {
    throw new Error(`${label} manifest/candidate-set ID mismatch`);
  }
  if (manifest.candidateSetSha256 !== sha256(candidatePath)) {
    throw new Error(`${label} manifest/candidate-set hash mismatch`);
  }
  if (candidateSet.approvalState !== "awaiting_approval" || candidateSet.approval !== null) {
    throw new Error(`${label} candidate set must remain awaiting approval`);
  }
}
if (
  recheck.candidateSetId !== correctedCandidateSet.candidateSetId ||
  recheck.candidateSetSha256 !== sha256(correctedCandidatePath) ||
  recheck.authorization !== "non_authorizing_recommendation_only"
) {
  throw new Error("Corrected recheck is not bound to the corrected candidate set");
}

const discoveryDecisionById = new Map<string, Json>();
for (const batch of discoveryManifest.batches as Json[]) {
  const path = join(discoveryRoot, outputFile(batch.file));
  const output = readJson(path);
  if (
    output.candidateSetId !== discoveryCandidateSet.candidateSetId ||
    output.candidateSetSha256 !== sha256(discoveryCandidatePath) ||
    output.authorization !== "non_authorizing_recommendation_only" ||
    output.decisions.length !== batch.candidateCount
  ) {
    throw new Error(`Invalid discovery batch output ${basename(path)}`);
  }
  for (const decision of output.decisions as Json[]) {
    if (discoveryDecisionById.has(decision.candidateId)) {
      throw new Error(`Duplicate discovery decision ${decision.candidateId}`);
    }
    discoveryDecisionById.set(decision.candidateId, decision);
  }
}

const discoveryById = new Map<string, Json>(
  discoveryCandidateSet.candidates.map((candidate: Json) => [candidate.candidateId, candidate]),
);
const correctedById = new Map<string, Json>(
  correctedCandidateSet.candidates.map((candidate: Json) => [candidate.candidateId, candidate]),
);
const recheckById = new Map<string, Json>();
for (const decision of recheck.decisions as Json[]) {
  if (recheckById.has(decision.candidateId)) {
    throw new Error(`Duplicate recheck decision ${decision.candidateId}`);
  }
  recheckById.set(decision.candidateId, decision);
}
if (recheckById.size !== 12)
  throw new Error(`Expected 12 rechecked rows, found ${recheckById.size}`);

let transferredCount = 0;
let recheckedCount = 0;
const usedRechecks = new Set<string>();
const allOutputIds = new Set<string>();
const writtenBatches: Json[] = [];

mkdirSync(correctedRoot, { recursive: true });
for (const batch of correctedManifest.batches as Json[]) {
  const input = readJson(join(correctedRoot, "inputs", batch.file));
  const decisions = (input.candidates as Json[])
    .map((assigned) => {
      const correctedCandidate = correctedById.get(assigned.candidateId);
      if (correctedCandidate === undefined || assigned.identity !== identity(correctedCandidate)) {
        throw new Error(`Corrected assignment mismatch for ${assigned.candidateId}`);
      }
      if (allOutputIds.has(assigned.candidateId)) {
        throw new Error(`Corrected candidate assigned twice: ${assigned.candidateId}`);
      }
      allOutputIds.add(assigned.candidateId);

      const rechecked = recheckById.get(assigned.candidateId);
      if (rechecked !== undefined) {
        const sourceKinds = new Set(
          correctedCandidate.provenance.map((entry: Json) => entry.sourceKind),
        );
        if (!sourceKinds.has("registry") || !sourceKinds.has("mta_wiki")) {
          throw new Error(`Rechecked candidate lacks dual provenance: ${assigned.candidateId}`);
        }
        if (
          rechecked.identity !== assigned.identity ||
          rechecked.routeId !== assigned.routeId ||
          rechecked.treatmentFamily !== assigned.treatmentFamily ||
          rechecked.implementationDate !== assigned.implementationDate
        ) {
          throw new Error(`Rechecked decision identity mismatch: ${assigned.candidateId}`);
        }
        usedRechecks.add(assigned.candidateId);
        recheckedCount += 1;
        return rechecked;
      }

      const discoveryCandidate = discoveryById.get(assigned.candidateId);
      const discoveryDecision = discoveryDecisionById.get(assigned.candidateId);
      if (
        discoveryCandidate === undefined ||
        discoveryDecision === undefined ||
        !equalJson(discoveryCandidate, correctedCandidate)
      ) {
        throw new Error(
          `Candidate changed without an explicit corrected recheck: ${assigned.candidateId}`,
        );
      }
      if (
        discoveryDecision.identity !== assigned.identity ||
        discoveryDecision.routeId !== assigned.routeId ||
        discoveryDecision.treatmentFamily !== assigned.treatmentFamily ||
        discoveryDecision.implementationDate !== assigned.implementationDate
      ) {
        throw new Error(`Transferred decision identity mismatch: ${assigned.candidateId}`);
      }
      transferredCount += 1;
      return discoveryDecision;
    })
    .toSorted((left, right) => left.candidateId.localeCompare(right.candidateId));

  const artifact = {
    artifactKind: "bp.studio.codex_review_batch.v1",
    authorization: "non_authorizing_recommendation_only",
    authorizesStudyRun: false,
    authorizesPublication: false,
    batchId: batch.batchId,
    candidateSetId: correctedCandidateSet.candidateSetId,
    candidateSetSha256: sha256(correctedCandidatePath),
    reviewer: "Codex multi-agent review, corrected-set deterministic reconciliation",
    decisionCount: decisions.length,
    countsByRecommendation: counts(decisions),
    validatedInputHashes: {
      candidateSet: correctedManifest.candidateSetSha256,
      historicalCandidateSet: correctedManifest.immutableInputs.baselineSha256,
      historicalReceipt: correctedManifest.immutableInputs.historicalReceiptSha256,
      spineManifest: correctedManifest.immutableInputs.spineManifestSha256,
      correctedRecheck: sha256(recheckPath),
    },
    decisions,
  };
  const path = join(correctedRoot, outputFile(batch.file));
  writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`);
  writtenBatches.push({
    batchId: batch.batchId,
    file: basename(path),
    decisionCount: decisions.length,
    countsByRecommendation: artifact.countsByRecommendation,
    sha256: sha256(path),
  });
}

if (allOutputIds.size !== correctedCandidateSet.candidates.length) {
  throw new Error(
    `Corrected review coverage is ${allOutputIds.size}, expected ${correctedCandidateSet.candidates.length}`,
  );
}
if (usedRechecks.size !== recheckById.size || recheckedCount !== 12 || transferredCount !== 477) {
  throw new Error(
    `Expected 477 unchanged transfers + 12 rechecks, found ${transferredCount} + ${recheckedCount}`,
  );
}

const summary = {
  artifactKind: "bp.studio.codex_review_transfer_summary.v1",
  authorization: "non_authorizing_recommendation_only",
  authorizesStudyRun: false,
  authorizesPublication: false,
  candidateSetId: correctedCandidateSet.candidateSetId,
  candidateSetSha256: sha256(correctedCandidatePath),
  transferredUnchangedCandidateCount: transferredCount,
  explicitlyRecheckedCandidateCount: recheckedCount,
  decisionCount: allOutputIds.size,
  batches: writtenBatches,
};
const summaryPath = join(correctedRoot, "review-transfer-summary.json");
mkdirSync(dirname(summaryPath), { recursive: true });
writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ output: summaryPath, ...summary }, null, 2));
