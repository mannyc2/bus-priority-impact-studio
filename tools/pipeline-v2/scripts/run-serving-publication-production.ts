import { join } from "node:path";
import { canonicalServingJson } from "@bp/domain/studio/serving-release";
import { releaseIdFromPublishedAt } from "@bp/domain/studio/shared";
import {
  createPlan098OperatorClient,
  fetchPlan098PublicRead,
} from "../src/lib/plan098-operator-client.ts";
import {
  advanceServingPublicationPhase,
  canonicalReceiptText,
  readServingPublicationPreparation,
  type ServingPublicationPhase,
  sha256,
  type UploadInventoryEntry,
  validateCandidateRoot,
} from "../src/lib/serving-publication.ts";

type Action = "classify" | "migrate" | "blobs" | "d1" | "verify" | "finalize" | "rollback";
type PointerStatus = {
  kind: string;
  generation: number;
  candidateId?: string;
  release?: { releaseId: string };
};
type CandidateStatus = {
  candidateId: string;
  candidate: null | {
    state: "staging" | "ready" | "rejected";
    readyAt: string | null;
    semanticInputFingerprint: string;
    manifestKey: string;
    manifestSha256: string;
  };
  artifacts: { total: number; verified: number };
  verifiedLogicalIds: string[];
  releases: Array<{ releaseId: string; publishedAt: string; activatedAt: string }>;
};
type DurableReceipt = {
  operationId: string;
  receiptKind: string;
  key: string;
  sha256: string;
  bytes: number;
};
type RunState = {
  artifactKind: "bp.ops.serving_publication_run.v1";
  schemaVersion: 1;
  operationId: string;
  preparationSha256: string;
  candidateId: string;
  phase: ServingPublicationPhase;
  outcome: "publish" | "no_op" | "rolled_back";
  startedAt: string;
  updatedAt: string;
  pointerBefore: PointerStatus;
  protectedFingerprints: unknown;
  durableReceipts: DurableReceipt[];
  migrationOutputSha256?: string;
  d1OutputSha256?: string;
  release?: { releaseId: string; publishedAt: string; activatedAt: string };
  activation?: unknown;
  evidence?: unknown[];
};

const FORWARD_PHASES: readonly ServingPublicationPhase[] = [
  "candidate_validated",
  "migrations_applied",
  "blobs_uploaded",
  "d1_staged",
  "candidate_verified",
  "activated",
  "production_smoke_passed",
  "complete",
];

function option(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined || value.length === 0) throw new Error(`Missing ${name}.`);
  return value;
}

function phaseAtLeast(
  current: ServingPublicationPhase,
  expected: ServingPublicationPhase,
): boolean {
  const currentIndex = FORWARD_PHASES.indexOf(current);
  const expectedIndex = FORWARD_PHASES.indexOf(expected);
  return currentIndex >= 0 && expectedIndex >= 0 && currentIndex >= expectedIndex;
}

async function writeState(path: string, state: RunState): Promise<void> {
  await Bun.write(path, canonicalReceiptText(state));
}

async function readState(path: string): Promise<RunState> {
  const text = await Bun.file(path).text();
  const parsed = JSON.parse(text) as RunState;
  if (
    parsed.artifactKind !== "bp.ops.serving_publication_run.v1" ||
    parsed.schemaVersion !== 1 ||
    text !== canonicalReceiptText(parsed)
  ) {
    throw new Error("Serving publication state is invalid or noncanonical.");
  }
  return parsed;
}

async function uploadArtifact(input: {
  endpoint: string;
  token: string;
  root: string;
  candidateId: string;
  entry: UploadInventoryEntry;
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
          "X-Plan098-Candidate-Id": input.candidateId,
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

async function runChild(args: string[], label: string): Promise<string> {
  const child = Bun.spawn(args, { stdout: "pipe", stderr: "pipe", env: process.env });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const output = `${stdout}${stderr}`;
  if (output.length > 0) process.stderr.write(output);
  if (exitCode !== 0) throw new Error(`${label} failed with exit ${exitCode}.`);
  return output;
}

async function durablePhase(input: {
  call: ReturnType<typeof createPlan098OperatorClient>;
  state: RunState;
  phase: ServingPublicationPhase;
}): Promise<RunState> {
  const receiptKind = input.phase.replaceAll("_", "-");
  const receipt = {
    artifactKind: "bp.ops.serving_publication_phase.v1",
    schemaVersion: 1,
    operationId: input.state.operationId,
    preparationSha256: input.state.preparationSha256,
    candidateId: input.state.candidateId,
    phase: input.phase,
    recordedAt: input.state.updatedAt,
    pointerBefore: input.state.pointerBefore,
  };
  const durable = await input.call<DurableReceipt>({
    action: "record-receipt",
    operationId: input.state.operationId,
    receiptKind,
    createdAt: input.state.updatedAt,
    receipt,
  });
  return {
    ...input.state,
    durableReceipts: [
      ...input.state.durableReceipts.filter((item) => item.receiptKind !== receiptKind),
      durable,
    ],
  };
}

async function restoreDurablePhase(input: {
  call: ReturnType<typeof createPlan098OperatorClient>;
  operationId: string;
  preparationSha256: string;
  candidateId: string;
}): Promise<{ phase: ServingPublicationPhase; durable: DurableReceipt } | null> {
  const phases: ServingPublicationPhase[] = [
    "candidate_verified",
    "d1_staged",
    "blobs_uploaded",
    "migrations_applied",
  ];
  for (const phase of phases) {
    const receiptKind = phase.replaceAll("_", "-");
    const found = await input.call<
      | null
      | (DurableReceipt & {
          receipt: {
            operationId: string;
            preparationSha256: string;
            candidateId: string;
            phase: ServingPublicationPhase;
          };
        })
    >({ action: "read-receipt", operationId: input.operationId, receiptKind });
    if (found === null) continue;
    if (
      found.receipt.operationId !== input.operationId ||
      found.receipt.preparationSha256 !== input.preparationSha256 ||
      found.receipt.candidateId !== input.candidateId ||
      found.receipt.phase !== phase
    ) {
      throw new Error(`Durable ${phase} receipt drifted from this preparation.`);
    }
    return { phase, durable: found };
  }
  return null;
}

const action = option("--action") as Action;
if (!["classify", "migrate", "blobs", "d1", "verify", "finalize", "rollback"].includes(action)) {
  throw new Error(`Unsupported --action ${action}.`);
}
const candidateRoot = option("--candidate-root");
const preparationPath = option("--preparation");
const expectedPreparationSha256 = option("--preparation-sha256");
const statePath = option("--state");
const endpoint = process.env["PLAN098_ENDPOINT"];
const token = process.env["PLAN098_TOKEN"];
if (endpoint === undefined || token === undefined) {
  throw new Error("PLAN098_ENDPOINT and PLAN098_TOKEN are required.");
}

const prepared = await readServingPublicationPreparation(preparationPath);
if (prepared.sha256 !== expectedPreparationSha256) {
  throw new Error("Preparation receipt SHA-256 drifted.");
}
const validated = await validateCandidateRoot(candidateRoot);
const receipt = prepared.receipt;
if (
  validated.manifest.candidateId !== receipt.candidate.candidateId ||
  validated.manifest.semanticInputFingerprint !== receipt.candidate.semanticInputFingerprint ||
  sha256(validated.manifestBytes) !== receipt.candidate.manifestSha256 ||
  sha256(validated.seedBytes) !== receipt.candidate.seedSha256 ||
  sha256(validated.inventoryBytes) !== receipt.candidate.uploadInventorySha256 ||
  validated.manifest.artifacts.length !== receipt.candidate.artifactCount
) {
  throw new Error("Prepared candidate bytes drifted from the approval receipt.");
}

const call = createPlan098OperatorClient({ endpoint, token });

if (action === "classify") {
  const pointer = await call<PointerStatus>({ action: "status" });
  const protectedFingerprints = await call<unknown>({ action: "protected-fingerprints" });
  const now = new Date().toISOString();
  if (
    pointer.generation === receipt.expected.generation + 1 &&
    pointer.candidateId === receipt.candidate.candidateId &&
    pointer.release !== undefined
  ) {
    const candidate = await call<CandidateStatus>({
      action: "candidate-status",
      candidateId: receipt.candidate.candidateId,
    });
    const release = candidate.releases.find(
      (item) => item.releaseId === pointer.release?.releaseId,
    );
    if (candidate.candidate?.state !== "ready" || release === undefined) {
      throw new Error("Activated resume candidate does not have its exact ready release.");
    }
    const state: RunState = {
      artifactKind: "bp.ops.serving_publication_run.v1",
      schemaVersion: 1,
      operationId: receipt.operationId,
      preparationSha256: prepared.sha256,
      candidateId: receipt.candidate.candidateId,
      phase: "activated",
      outcome: "publish",
      startedAt: now,
      updatedAt: now,
      pointerBefore: {
        kind: "pointed",
        generation: receipt.expected.generation,
        candidateId: receipt.expected.candidateId,
        release: { releaseId: receipt.expected.releaseId },
      },
      protectedFingerprints,
      durableReceipts: [],
      release,
    };
    await writeState(statePath, state);
    console.log(canonicalServingJson({ outcome: "resume-activated", phase: state.phase }));
    process.exit(0);
  }
  if (
    pointer.kind !== "pointed" ||
    pointer.generation !== receipt.expected.generation ||
    pointer.candidateId !== receipt.expected.candidateId ||
    pointer.release?.releaseId !== receipt.expected.releaseId
  ) {
    throw new Error(`Publication pointer prerequisite drifted: ${JSON.stringify(pointer)}`);
  }
  const activeCandidate = await call<CandidateStatus>({
    action: "candidate-status",
    candidateId: receipt.expected.candidateId,
  });
  if (activeCandidate.candidate?.state !== "ready") {
    throw new Error("Active publication candidate is not ready.");
  }
  let state: RunState = {
    artifactKind: "bp.ops.serving_publication_run.v1",
    schemaVersion: 1,
    operationId: receipt.operationId,
    preparationSha256: prepared.sha256,
    candidateId: receipt.candidate.candidateId,
    phase: "candidate_validated",
    outcome: "publish",
    startedAt: now,
    updatedAt: now,
    pointerBefore: pointer,
    protectedFingerprints,
    durableReceipts: [],
  };
  if (
    activeCandidate.candidate.semanticInputFingerprint ===
    receipt.candidate.semanticInputFingerprint
  ) {
    state = {
      ...state,
      phase: advanceServingPublicationPhase(state.phase, "no_op"),
      outcome: "no_op",
    };
  } else {
    const restored = await restoreDurablePhase({
      call,
      operationId: receipt.operationId,
      preparationSha256: prepared.sha256,
      candidateId: receipt.candidate.candidateId,
    });
    if (restored !== null) {
      state = { ...state, phase: restored.phase, durableReceipts: [restored.durable] };
    }
  }
  await writeState(statePath, state);
  console.log(canonicalServingJson({ outcome: state.outcome, phase: state.phase }));
  process.exit(0);
}

let state = await readState(statePath);
if (
  state.operationId !== receipt.operationId ||
  state.preparationSha256 !== prepared.sha256 ||
  state.candidateId !== receipt.candidate.candidateId
) {
  throw new Error("Serving publication state drifted from the approval receipt.");
}

if (action === "migrate") {
  if (state.outcome !== "publish" || phaseAtLeast(state.phase, "migrations_applied"))
    process.exit(0);
  if (state.phase !== "candidate_validated") throw new Error("Migration stage is out of order.");
  const output = await runChild(
    ["bun", "--filter", "@bp/db", "db:migrate:d1:v2:remote"],
    "v2 migration wrapper",
  );
  state = {
    ...state,
    phase: advanceServingPublicationPhase(state.phase, "migrations_applied"),
    updatedAt: new Date().toISOString(),
    migrationOutputSha256: sha256(output),
  };
  state = await durablePhase({ call, state, phase: state.phase });
  await writeState(statePath, state);
  process.exit(0);
}

if (action === "blobs") {
  if (state.outcome !== "publish" || phaseAtLeast(state.phase, "blobs_uploaded")) process.exit(0);
  if (state.phase !== "migrations_applied") throw new Error("Blob stage is out of order.");
  let status = await call<CandidateStatus>({
    action: "candidate-status",
    candidateId: receipt.candidate.candidateId,
  });
  if (status.candidate === null) {
    await call({
      action: "register-candidate",
      manifest: validated.manifest,
      manifestKey: receipt.candidate.manifestKey,
      manifestSha256: receipt.candidate.manifestSha256,
      stagedAt: new Date().toISOString(),
    });
    status = await call<CandidateStatus>({
      action: "candidate-status",
      candidateId: receipt.candidate.candidateId,
    });
  }
  if (
    status.candidate?.state === "rejected" ||
    status.candidate?.manifestSha256 !== receipt.candidate.manifestSha256 ||
    status.candidate.semanticInputFingerprint !== receipt.candidate.semanticInputFingerprint
  ) {
    throw new Error("Remote candidate registration drifted.");
  }
  const verified = new Set(status.verifiedLogicalIds);
  const pending = validated.inventory.entries.filter((entry) => !verified.has(entry.logicalId));
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const entry = pending[cursor++];
      if (entry === undefined) return;
      await uploadArtifact({
        endpoint,
        token,
        root: candidateRoot,
        candidateId: receipt.candidate.candidateId,
        entry,
      });
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  status = await call<CandidateStatus>({
    action: "candidate-status",
    candidateId: receipt.candidate.candidateId,
  });
  const afterVerified = new Set(status.verifiedLogicalIds);
  if (validated.inventory.entries.some((entry) => !afterVerified.has(entry.logicalId))) {
    throw new Error("Prepared upload inventory is not fully verified.");
  }
  state = {
    ...state,
    phase: advanceServingPublicationPhase(state.phase, "blobs_uploaded"),
    updatedAt: new Date().toISOString(),
  };
  state = await durablePhase({ call, state, phase: state.phase });
  await writeState(statePath, state);
  process.exit(0);
}

if (action === "d1") {
  if (state.outcome !== "publish" || phaseAtLeast(state.phase, "d1_staged")) process.exit(0);
  if (state.phase !== "blobs_uploaded") throw new Error("D1 stage is out of order.");
  const output = await runChild(
    [
      "bunx",
      "wrangler",
      "d1",
      "execute",
      receipt.resources.d1Database,
      "--remote",
      "--config",
      "packages/db/wrangler.d1-v2.jsonc",
      "--file",
      join(candidateRoot, "candidate-seed.sql"),
    ],
    "candidate-scoped D1 staging",
  );
  state = {
    ...state,
    phase: advanceServingPublicationPhase(state.phase, "d1_staged"),
    updatedAt: new Date().toISOString(),
    d1OutputSha256: sha256(output),
  };
  state = await durablePhase({ call, state, phase: state.phase });
  await writeState(statePath, state);
  process.exit(0);
}

if (action === "verify") {
  if (state.outcome !== "publish" || phaseAtLeast(state.phase, "candidate_verified"))
    process.exit(0);
  if (state.phase !== "d1_staged") throw new Error("Candidate verification is out of order.");
  let status = await call<CandidateStatus>({
    action: "candidate-status",
    candidateId: receipt.candidate.candidateId,
  });
  const verified = new Set(status.verifiedLogicalIds);
  const pending = validated.manifest.artifacts.filter(
    (artifact) => !verified.has(artifact.logicalId),
  );
  const batches: string[][] = [];
  let batch: string[] = [];
  let batchBytes = 0;
  for (const artifact of pending) {
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
          candidateId: receipt.candidate.candidateId,
          logicalIds,
          verifiedAt: new Date().toISOString(),
        }),
      ),
    );
  }
  status = await call<CandidateStatus>({
    action: "candidate-status",
    candidateId: receipt.candidate.candidateId,
  });
  if (
    status.candidate?.state !== "staging" ||
    status.artifacts.total !== receipt.candidate.artifactCount ||
    status.artifacts.verified !== receipt.candidate.artifactCount
  ) {
    throw new Error(`Remote candidate verification is incomplete: ${JSON.stringify(status)}`);
  }
  state = {
    ...state,
    phase: advanceServingPublicationPhase(state.phase, "candidate_verified"),
    updatedAt: new Date().toISOString(),
  };
  state = await durablePhase({ call, state, phase: state.phase });
  await writeState(statePath, state);
  process.exit(0);
}

if (action === "finalize") {
  if (state.phase === "complete") process.exit(0);
  if (state.outcome === "no_op") {
    const pointer = await call<PointerStatus>({ action: "status" });
    if (canonicalServingJson(pointer) !== canonicalServingJson(state.pointerBefore)) {
      throw new Error("Semantic no-op pointer changed before receipt recording.");
    }
    const completedAt = new Date().toISOString();
    const completion = {
      artifactKind: "bp.ops.serving_publication_completion.v1",
      schemaVersion: 1,
      outcome: "no_op",
      operationId: state.operationId,
      completedAt,
      preparationSha256: state.preparationSha256,
      activeReleaseId: receipt.expected.releaseId,
      activeCandidateId: receipt.expected.candidateId,
      candidateId: receipt.candidate.candidateId,
      semanticInputFingerprint: receipt.candidate.semanticInputFingerprint,
      contentPutCount: 0,
      servingWriteCount: 0,
      releaseWriteCount: 0,
      pointerWriteCount: 0,
      pointer,
    };
    const durable = await call<DurableReceipt>({
      action: "record-receipt",
      operationId: state.operationId,
      receiptKind: "completion",
      createdAt: completedAt,
      receipt: completion,
    });
    state = {
      ...state,
      phase: "complete",
      updatedAt: completedAt,
      durableReceipts: [...state.durableReceipts, durable],
    };
    await writeState(statePath, state);
    console.log(canonicalServingJson({ outcome: "no_op", durable }));
    process.exit(0);
  }
  if (state.phase === "candidate_verified") {
    await call({
      action: "mark-ready",
      candidateId: receipt.candidate.candidateId,
      readyAt: new Date().toISOString(),
    });
  }
  if (state.phase !== "candidate_verified" && state.phase !== "activated") {
    throw new Error("Finalization is out of order.");
  }
  const status = await call<CandidateStatus>({
    action: "candidate-status",
    candidateId: receipt.candidate.candidateId,
  });
  if (
    status.candidate?.state !== "ready" ||
    status.candidate.manifestSha256 !== receipt.candidate.manifestSha256 ||
    status.artifacts.total !== receipt.candidate.artifactCount ||
    status.artifacts.verified !== receipt.candidate.artifactCount
  ) {
    throw new Error("Candidate is not activation-ready.");
  }
  let pointer = await call<PointerStatus>({ action: "status" });
  let release = state.release;
  if (pointer.candidateId === receipt.candidate.candidateId) {
    release = status.releases.find((item) => item.releaseId === pointer.release?.releaseId);
  }
  if (release === undefined) {
    const publishedAt = new Date().toISOString();
    release = {
      releaseId: releaseIdFromPublishedAt(publishedAt),
      publishedAt,
      activatedAt: publishedAt,
    };
  }
  const activation = await call({
    action: "activate",
    operationId: state.operationId,
    expectedReleaseId: receipt.expected.releaseId,
    expectedGeneration: receipt.expected.generation,
    release: {
      schemaVersion: 1,
      candidateId: receipt.candidate.candidateId,
      ...release,
    },
    manifestSha256: receipt.candidate.manifestSha256,
  });
  pointer = await call<PointerStatus>({ action: "status" });
  if (
    pointer.generation !== receipt.expected.generation + 1 ||
    pointer.candidateId !== receipt.candidate.candidateId ||
    pointer.release?.releaseId !== release.releaseId
  ) {
    throw new Error(`Activation pointer drifted: ${JSON.stringify(pointer)}`);
  }
  if (state.phase === "candidate_verified") {
    state = {
      ...state,
      phase: advanceServingPublicationPhase(state.phase, "activated"),
      updatedAt: new Date().toISOString(),
      release,
      activation,
    };
    state = await durablePhase({ call, state, phase: state.phase });
    await writeState(statePath, state);
  }

  const base = "https://bus-priority-impact-studio.c20carroll.workers.dev";
  const paths = [
    "/api/v1/status",
    "/api/v1/map/manifest",
    "/api/v1/studio/routes?schema=3",
    "/api/v1/studio/routes/b44",
    "/api/v1/studio/routes/b44/history",
    "/api/v1/artifacts/studio/v2/interventions/public-episodes-v2.json",
    "/api/v1/artifacts/studio/v2/interventions/route-inventory-index.json",
    "/api/v1/artifacts/studio/v2/interventions/observation-index.json",
  ];
  const evidence = [];
  for (const path of paths) {
    const separator = path.includes("?") ? "&" : "?";
    const { response, body } = await fetchPlan098PublicRead({
      url: `${base}${path}${separator}publication=${crypto.randomUUID()}`,
      label: `serving publication smoke ${path}`,
      expectedStatuses: [200],
    });
    if (path === "/api/v1/status" || path === "/api/v1/map/manifest") {
      const json = JSON.parse(body) as Record<string, unknown>;
      if (json["releaseId"] !== release.releaseId) {
        throw new Error(`Release envelope drifted for ${path}.`);
      }
    }
    evidence.push({
      path,
      status: response.status,
      bytes: new TextEncoder().encode(body).byteLength,
      sha256: sha256(body),
    });
  }
  const protectedAfter = await call<unknown>({ action: "protected-fingerprints" });
  if (canonicalServingJson(protectedAfter) !== canonicalServingJson(state.protectedFingerprints)) {
    throw new Error("Protected current-signal fingerprints changed.");
  }
  state = {
    ...state,
    phase: advanceServingPublicationPhase(state.phase, "production_smoke_passed"),
    updatedAt: new Date().toISOString(),
    evidence,
    release,
    activation,
  };
  const completion = {
    artifactKind: "bp.ops.serving_publication_completion.v1",
    schemaVersion: 1,
    outcome: "published",
    operationId: state.operationId,
    completedAt: state.updatedAt,
    preparationSha256: state.preparationSha256,
    candidateId: state.candidateId,
    release,
    pointer,
    activation,
    evidence,
    protectedFingerprints: protectedAfter,
  };
  const durable = await call<DurableReceipt>({
    action: "record-receipt",
    operationId: state.operationId,
    receiptKind: "completion",
    createdAt: state.updatedAt,
    receipt: completion,
  });
  state = {
    ...state,
    phase: advanceServingPublicationPhase(state.phase, "complete"),
    durableReceipts: [...state.durableReceipts, durable],
  };
  await writeState(statePath, state);
  console.log(
    canonicalServingJson({ outcome: "published", releaseId: release.releaseId, durable }),
  );
  process.exit(0);
}

if (action === "rollback") {
  const pointer = await call<PointerStatus>({ action: "status" });
  if (
    pointer.generation === receipt.expected.generation &&
    pointer.candidateId === receipt.expected.candidateId &&
    pointer.release?.releaseId === receipt.expected.releaseId
  ) {
    console.log(canonicalServingJson({ outcome: "rollback-not-required", pointer }));
    process.exit(0);
  }
  if (
    pointer.generation !== receipt.expected.generation + 1 ||
    pointer.candidateId !== receipt.candidate.candidateId ||
    pointer.release === undefined
  ) {
    throw new Error(`Rollback encountered an unexpected pointer: ${JSON.stringify(pointer)}`);
  }
  const previous = await call<CandidateStatus>({
    action: "candidate-status",
    candidateId: receipt.expected.candidateId,
  });
  const previousRelease = previous.releases.find(
    (item) => item.releaseId === receipt.expected.releaseId,
  );
  if (previous.candidate?.state !== "ready" || previousRelease === undefined) {
    throw new Error("Previous production release is not rollback-ready.");
  }
  const rolledBackAt = new Date().toISOString();
  const transition = await call({
    action: "activate",
    operationId: `${receipt.operationId}-failure-rollback`,
    expectedReleaseId: pointer.release.releaseId,
    expectedGeneration: receipt.expected.generation + 1,
    release: {
      schemaVersion: 1,
      releaseId: receipt.expected.releaseId,
      candidateId: receipt.expected.candidateId,
      publishedAt: previousRelease.publishedAt,
      activatedAt: rolledBackAt,
    },
    manifestSha256: previous.candidate.manifestSha256,
  });
  const after = await call<PointerStatus>({ action: "status" });
  const protectedAfter = await call<unknown>({ action: "protected-fingerprints" });
  if (
    after.generation !== receipt.expected.generation + 2 ||
    after.candidateId !== receipt.expected.candidateId ||
    after.release?.releaseId !== receipt.expected.releaseId ||
    canonicalServingJson(protectedAfter) !== canonicalServingJson(state.protectedFingerprints)
  ) {
    throw new Error("Failure-only pointer rollback did not restore production.");
  }
  const receiptBody = {
    artifactKind: "bp.ops.serving_publication_rollback.v1",
    schemaVersion: 1,
    operationId: receipt.operationId,
    rolledBackAt,
    failedCandidateId: receipt.candidate.candidateId,
    before: pointer,
    transition,
    after,
    protectedFingerprints: protectedAfter,
  };
  const durable = await call<DurableReceipt>({
    action: "record-receipt",
    operationId: receipt.operationId,
    receiptKind: "rollback",
    createdAt: rolledBackAt,
    receipt: receiptBody,
  });
  state = {
    ...state,
    phase: "rolled_back",
    outcome: "rolled_back",
    updatedAt: rolledBackAt,
    durableReceipts: [...state.durableReceipts, durable],
  };
  await writeState(statePath, state);
  console.log(canonicalServingJson({ outcome: "rolled_back", pointer: after, durable }));
}
