import { createHash } from "node:crypto";
import { join } from "node:path";
import { canonicalServingJson } from "@bp/domain/studio/serving-release";
import { createPlan098OperatorClient } from "../src/lib/plan098-operator-client.ts";

const CANDIDATE_ID = "afa266944bc3e85d13c0ffd3c9a012acd9e2d9f01d965942d7ebf3b805f82ccf";
const PREVIOUS_CANDIDATE_ID = "a8a3747fc2889d8d32daab2b5705efc2991349732c5cf991f1a6b271d2d226d5";
const PREVIOUS_RELEASE_ID = "pub_20260801T232501631Z";

type CandidateStatus = {
  candidate: null | { state: string; manifestSha256: string };
  releases: Array<{ releaseId: string; publishedAt: string }>;
};

type PointerStatus = {
  generation: number;
  candidateId?: string;
  release?: { releaseId: string };
};

function option(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined || value.length === 0) throw new Error(`Missing ${name}.`);
  return value;
}

function sha256(body: Uint8Array | string): string {
  return createHash("sha256").update(body).digest("hex");
}

const root = option("--candidate-root");
const output = option("--output");
const finalizeLog = option("--finalize-log");
const endpoint = process.env.PLAN098_ENDPOINT;
const token = process.env.PLAN098_TOKEN;
if (endpoint === undefined || token === undefined) {
  throw new Error("PLAN098_ENDPOINT and PLAN098_TOKEN are required.");
}
const staging = (await Bun.file(join(root, "production-staging.json")).json()) as {
  protectedFingerprints: unknown;
};
const call = createPlan098OperatorClient({ endpoint, token });
const before = await call<PointerStatus>({ action: "status" });
if (before.candidateId !== CANDIDATE_ID) {
  const safe =
    (before.generation === 4 && before.candidateId === PREVIOUS_CANDIDATE_ID) ||
    (before.generation === 6 && before.candidateId === PREVIOUS_CANDIDATE_ID);
  if (!safe)
    throw new Error(`Rollback encountered an unexpected pointer: ${JSON.stringify(before)}`);
  const text = `${canonicalServingJson({ outcome: "rollback-not-required", pointer: before })}\n`;
  await Bun.write(output, text);
  console.log(text.trim());
  process.exit(0);
}
if (before.generation !== 5 || before.release === undefined) {
  throw new Error(`Rollback CAS prerequisite drifted: ${JSON.stringify(before)}`);
}
const previous = await call<CandidateStatus>({
  action: "candidate-status",
  candidateId: PREVIOUS_CANDIDATE_ID,
});
const previousRelease = previous.releases.find(
  (release) => release.releaseId === PREVIOUS_RELEASE_ID,
);
if (
  previous.candidate?.state !== "ready" ||
  previousRelease === undefined ||
  !/^[a-f0-9]{64}$/u.test(previous.candidate.manifestSha256)
) {
  throw new Error("The previous production candidate is not rollback-ready.");
}
const rolledBackAt = new Date().toISOString();
const transition = await call({
  action: "activate",
  operationId: `gen17-catchup-failure-rollback-${CANDIDATE_ID.slice(0, 20)}`,
  expectedReleaseId: before.release.releaseId,
  expectedGeneration: 5,
  release: {
    schemaVersion: 1,
    releaseId: PREVIOUS_RELEASE_ID,
    candidateId: PREVIOUS_CANDIDATE_ID,
    publishedAt: previousRelease.publishedAt,
    activatedAt: rolledBackAt,
  },
  manifestSha256: previous.candidate.manifestSha256,
});
const after = await call<PointerStatus>({ action: "status" });
const protectedAfter = await call<unknown>({ action: "protected-fingerprints" });
if (
  after.generation !== 6 ||
  after.candidateId !== PREVIOUS_CANDIDATE_ID ||
  canonicalServingJson(protectedAfter) !== canonicalServingJson(staging.protectedFingerprints)
) {
  throw new Error(
    `Failure rollback did not restore protected production: ${JSON.stringify(after)}`,
  );
}
const receipt = {
  artifactKind: "bp.ops.gen17.catchup_failure_rollback.v1",
  schemaVersion: 1,
  rolledBackAt,
  failedCandidateId: CANDIDATE_ID,
  before,
  transition,
  after,
  protectedFingerprints: protectedAfter,
  finalizeLogSha256: sha256(new Uint8Array(await Bun.file(finalizeLog).arrayBuffer())),
};
const durable = await call({
  action: "record-receipt",
  operationId: `gen17-catchup-failure-receipt-${CANDIDATE_ID.slice(0, 20)}`,
  receiptKind: "rollback",
  createdAt: rolledBackAt,
  receipt,
});
const text = `${canonicalServingJson({ ...receipt, durable })}\n`;
await Bun.write(output, text);
console.log(
  JSON.stringify({
    outcome: "rolled-back",
    generation: after.generation,
    candidateId: after.candidateId,
    receiptSha256: sha256(text),
    durable,
  }),
);
