import { createHash } from "node:crypto";
import { join } from "node:path";
import { canonicalServingJson } from "@bp/domain/studio/serving-release";
import { releaseIdFromPublishedAt } from "@bp/domain/studio/shared";
import {
  createPlan098OperatorClient,
  fetchPlan098PublicRead,
} from "../src/lib/plan098-operator-client.ts";

const CANDIDATE_ID = "afa266944bc3e85d13c0ffd3c9a012acd9e2d9f01d965942d7ebf3b805f82ccf";
const MANIFEST_SHA256 = "843892c29e371e287dde1e6e0b6ac46445304b1550e239115582f58a1862cd9e";
const ACTIVE_CANDIDATE_ID = "a8a3747fc2889d8d32daab2b5705efc2991349732c5cf991f1a6b271d2d226d5";
const ACTIVE_RELEASE_ID = "pub_20260801T232501631Z";
const ARTIFACT_COUNT = 4_247;

type CandidateStatus = {
  candidate: null | { state: "staging" | "ready" | "rejected"; manifestSha256: string };
  artifacts: { total: number; verified: number };
  releases: Array<{ releaseId: string; publishedAt: string; activatedAt: string }>;
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

const root = option("--candidate-root");
const output = option("--output");
const endpoint = process.env.PLAN098_ENDPOINT;
const token = process.env.PLAN098_TOKEN;
if (endpoint === undefined || token === undefined) {
  throw new Error("PLAN098_ENDPOINT and PLAN098_TOKEN are required.");
}
const stagingText = await Bun.file(join(root, "production-staging.json")).text();
const staging = JSON.parse(stagingText) as {
  candidateId: string;
  manifestSha256: string;
  candidateArtifactCount: number;
  protectedFingerprints: unknown;
};
if (
  staging.candidateId !== CANDIDATE_ID ||
  staging.manifestSha256 !== MANIFEST_SHA256 ||
  staging.candidateArtifactCount !== ARTIFACT_COUNT
) {
  throw new Error("Production staging receipt drifted.");
}

const call = createPlan098OperatorClient({ endpoint, token });
let status = await call<CandidateStatus>({ action: "candidate-status", candidateId: CANDIDATE_ID });
if (
  status.candidate?.state === "staging" &&
  status.artifacts.total === ARTIFACT_COUNT &&
  status.artifacts.verified === ARTIFACT_COUNT
) {
  await call({
    action: "mark-ready",
    candidateId: CANDIDATE_ID,
    readyAt: new Date().toISOString(),
  });
  status = await call<CandidateStatus>({ action: "candidate-status", candidateId: CANDIDATE_ID });
}
if (
  status.candidate?.state !== "ready" ||
  status.candidate.manifestSha256 !== MANIFEST_SHA256 ||
  status.artifacts.total !== ARTIFACT_COUNT ||
  status.artifacts.verified !== ARTIFACT_COUNT
) {
  throw new Error(`Catch-up candidate is not ready: ${JSON.stringify(status)}`);
}

let pointer = await call<PointerStatus>({ action: "status" });
let release = status.releases[0];
let activation: unknown = null;
if (pointer.candidateId !== CANDIDATE_ID) {
  if (
    pointer.kind !== "pointed" ||
    pointer.generation !== 4 ||
    pointer.release?.releaseId !== ACTIVE_RELEASE_ID ||
    pointer.candidateId !== ACTIVE_CANDIDATE_ID
  ) {
    throw new Error(`Activation CAS prerequisite drifted: ${JSON.stringify(pointer)}`);
  }
  const publishedAt = new Date().toISOString();
  release = {
    releaseId: releaseIdFromPublishedAt(publishedAt),
    publishedAt,
    activatedAt: publishedAt,
  };
  activation = await call({
    action: "activate",
    operationId: `gen17-catchup-${CANDIDATE_ID.slice(0, 20)}`,
    expectedReleaseId: ACTIVE_RELEASE_ID,
    expectedGeneration: 4,
    release: { schemaVersion: 1, candidateId: CANDIDATE_ID, ...release },
    manifestSha256: MANIFEST_SHA256,
  });
  pointer = await call<PointerStatus>({ action: "status" });
}
if (pointer.generation !== 5 || pointer.candidateId !== CANDIDATE_ID || release === undefined) {
  throw new Error(`Final pointer drifted: ${JSON.stringify(pointer)}`);
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
    url: `${base}${path}${separator}gen17=${crypto.randomUUID()}`,
    label: `Generation-17 smoke ${path}`,
    expectedStatuses: [200],
  });
  const json = JSON.parse(body) as Record<string, unknown>;
  if (path === "/api/v1/status" || path === "/api/v1/map/manifest") {
    const coverage = json.coverage as { end?: string } | undefined;
    if (json.releaseId !== release.releaseId || coverage?.end !== "2026-06") {
      throw new Error(`Release envelope drifted for ${path}.`);
    }
  }
  if (path.includes("public-episodes")) {
    const candidate = json.candidate as { candidateId?: string } | undefined;
    const episodes = json.episodes as unknown[] | undefined;
    if (
      episodes?.length !== 222 ||
      candidate?.candidateId !== "b647f0f12a5dc037e0e9776e03c0cf9a4f78081728b7f4470e58e4558e4e77ef"
    ) {
      throw new Error("Plan 106 overlay smoke failed.");
    }
  }
  if (path.endsWith("route-inventory-index.json")) {
    const routes = json.routes as unknown[] | undefined;
    if (routes?.length !== 375) throw new Error("Plan 091 smoke failed.");
  }
  if (path.endsWith("observation-index.json")) {
    const events = json.events as unknown[] | undefined;
    if (events?.length !== 456) throw new Error("Plan 090 smoke failed.");
  }
  evidence.push({
    path,
    status: response.status,
    bytes: new TextEncoder().encode(body).byteLength,
    sha256: sha256(body),
  });
}
const protectedAfter = await call<unknown>({ action: "protected-fingerprints" });
if (canonicalServingJson(protectedAfter) !== canonicalServingJson(staging.protectedFingerprints)) {
  throw new Error("Protected current-signal fingerprints changed.");
}
const completion = {
  artifactKind: "bp.ops.gen17.catchup_completion.v1",
  schemaVersion: 1,
  completedAt: new Date().toISOString(),
  candidateId: CANDIDATE_ID,
  manifestSha256: MANIFEST_SHA256,
  pointer,
  release,
  activation,
  artifactCount: ARTIFACT_COUNT,
  stagingReceiptSha256: sha256(stagingText),
  protectedFingerprints: protectedAfter,
  evidence,
};
const completionText = `${canonicalServingJson(completion)}\n`;
const completionSha256 = sha256(completionText);
const durable = await call({
  action: "record-receipt",
  operationId: `gen17-catchup-complete-${CANDIDATE_ID.slice(0, 20)}`,
  receiptKind: "completion",
  createdAt: completion.completedAt,
  receipt: completion,
});
await Bun.write(output, completionText);
console.log(
  JSON.stringify({
    releaseId: release.releaseId,
    candidateId: CANDIDATE_ID,
    completionSha256,
    durable,
  }),
);
