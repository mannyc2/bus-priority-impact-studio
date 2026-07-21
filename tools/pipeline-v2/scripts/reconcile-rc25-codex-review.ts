import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

// biome-ignore lint/suspicious/noExplicitAny: frozen review artifacts are decoded dynamically.
type Json = any;

const EXPECTED_CANDIDATE_SET_ID = "candidate-set-v3:575ee30a44f2e141e97f6a77";
const EXPECTED_CANDIDATE_SHA256 =
  "b66c0cd70afdf99a0fa2779d9b0574ba328bcc5f49c7d0177eaa029b0bb2c195";
const GATE_NAMES = ["evidenceScope", "date", "spine", "outcome", "conflict", "confounder"] as const;

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
const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const outputFileFor = (inputFile: string): string => {
  if (!inputFile.endsWith(".input.json")) {
    throw new Error(`Review input must end in .input.json: ${inputFile}`);
  }
  return `${inputFile.slice(0, -".input.json".length)}.json`;
};
const countDecisions = (decisions: readonly Json[]) => ({
  approved: decisions.filter((decision) => decision.decision === "approved").length,
  rejected: decisions.filter((decision) => decision.decision === "rejected").length,
});
const identity = (candidate: Json): string =>
  [
    candidate.routeId,
    candidate.treatmentFamily,
    candidate.implementationDate,
    candidate.datePrecision,
  ].join("|");
const assertEqual = (actual: unknown, expected: unknown, label: string): void => {
  if (actual !== expected)
    throw new Error(`${label}: expected ${String(expected)}, found ${String(actual)}`);
};

const reviewRoot = required("review-root");
const candidatePath = required("candidate");
const receiptPath = required("receipt");
const reconciliationPath = required("reconciliation");
const inputRoot = join(reviewRoot, "inputs");
const manifestPath = join(inputRoot, "manifest.json");
const manifest = readJson(manifestPath);
const candidateSet = readJson(candidatePath);

assertEqual(manifest.artifactKind, "bp.studio.codex_review_manifest.v2", "manifest artifactKind");
assertEqual(manifest.authorization, "owner_delegated_candidate_review", "manifest authorization");
assertEqual(manifest.candidateSetId, EXPECTED_CANDIDATE_SET_ID, "manifest candidateSetId");
assertEqual(manifest.candidateSetSha256, EXPECTED_CANDIDATE_SHA256, "manifest candidate hash");
assertEqual(candidateSet.candidateSetId, EXPECTED_CANDIDATE_SET_ID, "candidateSetId");
assertEqual(sha256(candidatePath), EXPECTED_CANDIDATE_SHA256, "candidate artifact hash");
assertEqual(candidateSet.approvalState, "awaiting_approval", "candidate approvalState");
assertEqual(candidateSet.approval, null, "candidate approval");
assertEqual(candidateSet.candidates.length, 486, "candidate count");

const sourceById = new Map<string, Json>();
for (const candidate of candidateSet.candidates as Json[]) {
  if (sourceById.has(candidate.candidateId)) {
    throw new Error(`Duplicate source candidate: ${candidate.candidateId}`);
  }
  sourceById.set(candidate.candidateId, candidate);
}

const allDecisions: Json[] = [];
const batchRecords: Json[] = [];
const seen = new Set<string>();
for (const batch of manifest.batches as Json[]) {
  const inputPath = join(inputRoot, batch.file);
  if (!existsSync(inputPath)) throw new Error(`Missing review input: ${inputPath}`);
  assertEqual(sha256(inputPath), batch.sha256, `${batch.batchId} input hash`);
  const input = readJson(inputPath);
  const outputPath = join(reviewRoot, outputFileFor(batch.file));
  if (!existsSync(outputPath)) throw new Error(`Missing review output: ${outputPath}`);
  const output = readJson(outputPath);
  assertEqual(
    output.artifactKind,
    "bp.studio.codex_review_batch.v2",
    `${batch.batchId} artifactKind`,
  );
  assertEqual(
    output.authorization,
    "owner_delegated_candidate_review",
    `${batch.batchId} authorization`,
  );
  assertEqual(output.authorizesStudyRun, false, `${batch.batchId} authorizesStudyRun`);
  assertEqual(output.batchId, batch.batchId, `${batch.batchId} batchId`);
  assertEqual(output.candidateSetId, manifest.candidateSetId, `${batch.batchId} candidateSetId`);
  assertEqual(
    output.candidateSetSha256,
    manifest.candidateSetSha256,
    `${batch.batchId} candidateSetSha256`,
  );
  assertEqual(output.inputFile, `inputs/${batch.file}`, `${batch.batchId} inputFile`);
  assertEqual(output.inputSha256, batch.sha256, `${batch.batchId} inputSha256`);
  if (!nonEmpty(output.reviewer)) throw new Error(`${batch.batchId} reviewer is blank`);
  assertEqual(
    input.candidateSetId,
    manifest.candidateSetId,
    `${batch.batchId} input candidateSetId`,
  );
  assertEqual(
    input.candidateSetSha256,
    manifest.candidateSetSha256,
    `${batch.batchId} input hash binding`,
  );
  assertEqual(input.batchId, batch.batchId, `${batch.batchId} input batchId`);
  assertEqual(input.decisionCount, batch.candidateCount, `${batch.batchId} input decisionCount`);
  assertEqual(output.decisionCount, batch.candidateCount, `${batch.batchId} output decisionCount`);
  assertEqual(output.decisions.length, batch.candidateCount, `${batch.batchId} decisions length`);

  const assignedById = new Map<string, Json>();
  for (const assigned of input.candidates as Json[]) {
    if (assignedById.has(assigned.candidateId)) {
      throw new Error(`${batch.batchId} assigns duplicate ${assigned.candidateId}`);
    }
    assignedById.set(assigned.candidateId, assigned);
  }
  const localSeen = new Set<string>();
  for (const decision of output.decisions as Json[]) {
    if (localSeen.has(decision.candidateId)) {
      throw new Error(`${batch.batchId} decides duplicate ${decision.candidateId}`);
    }
    localSeen.add(decision.candidateId);
    const assigned = assignedById.get(decision.candidateId);
    const source = sourceById.get(decision.candidateId);
    if (assigned === undefined || source === undefined) {
      throw new Error(`${batch.batchId} contains out-of-shard decision ${decision.candidateId}`);
    }
    if (seen.has(decision.candidateId)) {
      throw new Error(`Candidate appears in multiple review outputs: ${decision.candidateId}`);
    }
    seen.add(decision.candidateId);
    for (const [field, expected] of Object.entries({
      identity: identity(source),
      routeId: source.routeId,
      treatmentFamily: source.treatmentFamily,
      implementationDate: source.implementationDate,
    })) {
      assertEqual(decision[field], expected, `${decision.candidateId} ${field}`);
    }
    if (decision.decision !== "approved" && decision.decision !== "rejected") {
      throw new Error(`${decision.candidateId} has invalid decision ${String(decision.decision)}`);
    }
    if (!nonEmpty(decision.reviewer) || !nonEmpty(decision.rationale)) {
      throw new Error(`${decision.candidateId} requires reviewer and rationale`);
    }
    if (decision.gates === null || typeof decision.gates !== "object") {
      throw new Error(`${decision.candidateId} requires gate explanations`);
    }
    for (const gate of GATE_NAMES) {
      if (!nonEmpty(decision.gates[gate])) {
        throw new Error(`${decision.candidateId} has blank ${gate} gate`);
      }
    }
    if (decision.decision === "approved") {
      if (assigned.currentAdmission.scope.status !== "admitted") {
        throw new Error(`${decision.candidateId} approves a production scope rejection`);
      }
      if (
        assigned.currentAdmission.spine.readiness !== "series_ready" &&
        assigned.currentAdmission.spine.readiness !== "series_ready_with_gaps"
      ) {
        throw new Error(`${decision.candidateId} approves an ineligible spine`);
      }
      if (assigned.currentAdmission.outcomeWindow.calendarMinimumFourPerSide !== true) {
        throw new Error(`${decision.candidateId} approves an ineligible calendar window`);
      }
      if (source.conflictState !== "none") {
        throw new Error(`${decision.candidateId} approves a conflicted candidate`);
      }
      const failedGate = GATE_NAMES.find((gate) =>
        /(^|\b)fail(?:ed|ure)?\b/iu.test(decision.gates[gate]),
      );
      if (failedGate !== undefined) {
        throw new Error(`${decision.candidateId} is approved with a failing ${failedGate} gate`);
      }
    }
    allDecisions.push({ ...decision, sourceBatchId: batch.batchId, inputSha256: batch.sha256 });
  }
  if (localSeen.size !== assignedById.size) {
    throw new Error(`${batch.batchId} output does not cover its exact assignment`);
  }
  const actualCounts = countDecisions(output.decisions);
  assertEqual(
    output.countsByDecision?.approved,
    actualCounts.approved,
    `${batch.batchId} approved count`,
  );
  assertEqual(
    output.countsByDecision?.rejected,
    actualCounts.rejected,
    `${batch.batchId} rejected count`,
  );
  batchRecords.push({
    batchId: batch.batchId,
    inputFile: batch.file,
    inputSha256: batch.sha256,
    outputFile: basename(outputPath),
    outputSha256: sha256(outputPath),
    decisionCount: output.decisions.length,
    countsByDecision: actualCounts,
    reviewer: output.reviewer,
  });
}

if (seen.size !== sourceById.size) {
  const missing = [...sourceById.keys()].filter((candidateId) => !seen.has(candidateId));
  throw new Error(`Review coverage is ${seen.size}/486; missing ${missing.slice(0, 8).join(", ")}`);
}
allDecisions.sort((left, right) => left.candidateId.localeCompare(right.candidateId));
const countsByDecision = countDecisions(allDecisions);
const receipt = {
  artifactKind: "bp.studio.study_event_approvals.v3",
  schemaVersion: 3,
  candidateSetId: manifest.candidateSetId,
  decisions: allDecisions.map((decision) => ({
    candidateId: decision.candidateId,
    decision: decision.decision,
    reviewer: decision.reviewer,
    rationale: decision.rationale,
  })),
};
const reconciliation = {
  artifactKind: "bp.studio.codex_review_reconciliation.v2",
  authorization: "owner_delegated_candidate_review",
  authorizesStudyRun: true,
  authorizesPublication: false,
  candidateSetId: manifest.candidateSetId,
  candidateSetSha256: manifest.candidateSetSha256,
  manifestSha256: sha256(manifestPath),
  immutableInputs: manifest.immutableInputs,
  summary: {
    decisionCount: allDecisions.length,
    countsByDecision,
    uniqueCandidateCount: seen.size,
    batchCount: batchRecords.length,
  },
  batches: batchRecords,
  decisions: allDecisions,
  notice:
    "Owner-delegated admission decisions only. Estimator, anchor-review, and publication gates remain independently binding.",
};

mkdirSync(dirname(receiptPath), { recursive: true });
mkdirSync(dirname(reconciliationPath), { recursive: true });
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
writeFileSync(reconciliationPath, `${JSON.stringify(reconciliation, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      receipt: receiptPath,
      receiptSha256: sha256(receiptPath),
      reconciliation: reconciliationPath,
      reconciliationSha256: sha256(reconciliationPath),
      decisionCount: allDecisions.length,
      countsByDecision,
      approvedCandidateIds: receipt.decisions
        .filter((decision) => decision.decision === "approved")
        .map((decision) => decision.candidateId),
    },
    null,
    2,
  ),
);
