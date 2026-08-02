import { createHash } from "node:crypto";
import { join } from "node:path";
import { decodeStrict } from "@bp/domain/decode";
import { ServingCandidateManifestV1Schema } from "@bp/domain/studio/serving-release";
import { createPlan098OperatorClient } from "../src/lib/plan098-operator-client.ts";

const CANDIDATE_ID = "afa266944bc3e85d13c0ffd3c9a012acd9e2d9f01d965942d7ebf3b805f82ccf";
const MANIFEST_SHA256 = "843892c29e371e287dde1e6e0b6ac46445304b1550e239115582f58a1862cd9e";
const SEED_SHA256 = "49ed41666ed7a69f4220c8adf3a659f29e330c9270227b74f564cf47cbf26250";
const SOURCE_COMMIT = "1266baf529117aaa8c86816753a0c9677cf2c8a4";
const ACTIVE_CANDIDATE_ID = "a8a3747fc2889d8d32daab2b5705efc2991349732c5cf991f1a6b271d2d226d5";
const ACTIVE_RELEASE_ID = "pub_20260801T232501631Z";
const ARTIFACT_COUNT = 4_247;
const UPLOAD_COUNT = 1_848;
const UPLOAD_BYTES = 149_481_005;

type StagePlan = {
  activeCandidateId: string;
  artifactCount: number;
  candidateId: string;
  candidateManifestKey: string;
  candidateManifestSha256: string;
  candidateSeedSha256: string;
  sourceCommit: string;
  uploadArtifactCount: number;
  uploadBytes: number;
};

type UploadEntry = {
  logicalId: string;
  key: string;
  sha256: string;
  bytes: number;
  mediaType: string;
};

type CandidateStatus = {
  candidateId: string;
  candidate: null | { state: "staging" | "ready" | "rejected" };
  artifacts: { total: number; verified: number };
};

type PointerStatus = {
  kind: string;
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

async function uploadArtifact(input: {
  endpoint: string;
  token: string;
  root: string;
  entry: UploadEntry;
}): Promise<void> {
  const body = new Uint8Array(
    await Bun.file(join(input.root, "objects", input.entry.key)).arrayBuffer(),
  );
  if (body.byteLength !== input.entry.bytes || sha256(body) !== input.entry.sha256) {
    throw new Error(`Upload source drifted for ${input.entry.logicalId}.`);
  }
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(input.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
          "Content-Type": "application/octet-stream",
          "X-Plan098-Action": "upload-artifact",
          "X-Plan098-Candidate-Id": CANDIDATE_ID,
          "X-Plan098-Logical-Id": input.entry.logicalId,
          "X-Plan098-Verified-At": new Date().toISOString(),
        },
        body: new Blob([Uint8Array.from(body)]),
      });
    } catch (error) {
      if (attempt < 3) {
        await Bun.sleep(attempt * 2_000);
        continue;
      }
      throw error;
    }
    if (response.ok) return;
    const text = await response.text();
    if ((response.status === 404 || response.status >= 500) && attempt < 3) {
      await Bun.sleep(attempt * 2_000);
      continue;
    }
    throw new Error(
      `Artifact upload failed for ${input.entry.logicalId}: HTTP ${response.status} ${text}`,
    );
  }
}

const root = option("--candidate-root");
const output = option("--output");
const endpoint = process.env["PLAN098_ENDPOINT"];
const token = process.env["PLAN098_TOKEN"];
if (endpoint === undefined || token === undefined) {
  throw new Error("PLAN098_ENDPOINT and PLAN098_TOKEN are required.");
}

const manifestBytes = new Uint8Array(
  await Bun.file(join(root, "candidate.manifest.json")).arrayBuffer(),
);
const seedBytes = new Uint8Array(await Bun.file(join(root, "candidate-seed.sql")).arrayBuffer());
const manifest = decodeStrict(ServingCandidateManifestV1Schema)(
  JSON.parse(new TextDecoder().decode(manifestBytes)),
);
const stage = (await Bun.file(join(root, "stage-plan.json")).json()) as StagePlan;
const inventory = (await Bun.file(join(root, "upload-inventory.json")).json()) as {
  schemaVersion: number;
  entries: UploadEntry[];
};
if (
  manifest.candidateId !== CANDIDATE_ID ||
  manifest.artifacts.length !== ARTIFACT_COUNT ||
  sha256(manifestBytes) !== MANIFEST_SHA256 ||
  sha256(seedBytes) !== SEED_SHA256 ||
  stage.candidateId !== CANDIDATE_ID ||
  stage.candidateManifestSha256 !== MANIFEST_SHA256 ||
  stage.candidateSeedSha256 !== SEED_SHA256 ||
  stage.sourceCommit !== SOURCE_COMMIT ||
  stage.activeCandidateId !== ACTIVE_CANDIDATE_ID ||
  stage.artifactCount !== ARTIFACT_COUNT ||
  stage.uploadArtifactCount !== UPLOAD_COUNT ||
  stage.uploadBytes !== UPLOAD_BYTES ||
  inventory.schemaVersion !== 1 ||
  inventory.entries.length !== UPLOAD_COUNT ||
  inventory.entries.reduce((sum, entry) => sum + entry.bytes, 0) !== UPLOAD_BYTES
) {
  throw new Error("Generation-17 catch-up candidate identity drifted.");
}
const manifestEntries = new Map(manifest.artifacts.map((entry) => [entry.logicalId, entry]));
for (const entry of inventory.entries) {
  const declared = manifestEntries.get(entry.logicalId);
  if (
    declared === undefined ||
    declared.key !== entry.key ||
    declared.sha256 !== entry.sha256 ||
    declared.bytes !== entry.bytes ||
    declared.mediaType !== entry.mediaType
  ) {
    throw new Error(`Upload inventory is outside the closed manifest: ${entry.logicalId}.`);
  }
}

const call = createPlan098OperatorClient({ endpoint, token });
const pointer = await call<PointerStatus>({ action: "status" });
const resumesActivatedCandidate =
  pointer.kind === "pointed" && pointer.generation === 5 && pointer.candidateId === CANDIDATE_ID;
if (
  !resumesActivatedCandidate &&
  !(
    pointer.kind === "pointed" &&
    pointer.generation === 4 &&
    pointer.release?.releaseId === ACTIVE_RELEASE_ID &&
    pointer.candidateId === ACTIVE_CANDIDATE_ID
  )
) {
  throw new Error(`Production pointer prerequisite drifted: ${JSON.stringify(pointer)}`);
}
const protectedFingerprints = await call<unknown>({ action: "protected-fingerprints" });
if (!resumesActivatedCandidate) {
  await call({
    action: "register-candidate",
    manifest,
    manifestKey: stage.candidateManifestKey,
    manifestSha256: MANIFEST_SHA256,
    stagedAt: new Date().toISOString(),
  });
}
let status = await call<CandidateStatus>({ action: "candidate-status", candidateId: CANDIDATE_ID });
if (status.candidate?.state === "rejected") throw new Error("Catch-up candidate is rejected.");
if (status.candidate?.state === "staging") {
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const entry = inventory.entries[cursor++];
      if (entry === undefined) return;
      await uploadArtifact({ endpoint, token, root, entry });
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));

  const batches: string[][] = [];
  let batch: string[] = [];
  let batchBytes = 0;
  for (const artifact of manifest.artifacts) {
    if (batch.length > 0 && (batch.length >= 8 || batchBytes + artifact.bytes > 4_000_000)) {
      batches.push(batch);
      batch = [];
      batchBytes = 0;
    }
    batch.push(artifact.logicalId);
    batchBytes += artifact.bytes;
  }
  if (batch.length > 0) batches.push(batch);
  for (let offset = 0; offset < batches.length; offset += 6) {
    await Promise.all(
      batches.slice(offset, offset + 6).map((logicalIds) =>
        call({
          action: "verify-artifacts",
          candidateId: CANDIDATE_ID,
          logicalIds,
          verifiedAt: new Date().toISOString(),
        }),
      ),
    );
  }
  status = await call<CandidateStatus>({ action: "candidate-status", candidateId: CANDIDATE_ID });
}
if (
  (status.candidate?.state !== "staging" && status.candidate?.state !== "ready") ||
  (resumesActivatedCandidate && status.candidate.state !== "ready") ||
  status.artifacts.total !== ARTIFACT_COUNT ||
  status.artifacts.verified !== ARTIFACT_COUNT
) {
  throw new Error(`Remote artifact staging is incomplete: ${JSON.stringify(status)}`);
}
const receipt = {
  artifactKind: "bp.ops.gen17.catchup_staging.v1",
  schemaVersion: 1,
  stagedAt: new Date().toISOString(),
  candidateId: CANDIDATE_ID,
  manifestSha256: MANIFEST_SHA256,
  seedSha256: SEED_SHA256,
  candidateArtifactCount: ARTIFACT_COUNT,
  submittedArtifactCount: UPLOAD_COUNT,
  submittedArtifactBytes: UPLOAD_BYTES,
  d1StageRequired: !resumesActivatedCandidate,
  pointer,
  protectedFingerprints,
  status,
};
const receiptText = `${JSON.stringify(receipt, null, 2)}\n`;
await Bun.write(output, receiptText);
console.log(JSON.stringify({ candidateId: CANDIDATE_ID, receiptSha256: sha256(receiptText) }));
