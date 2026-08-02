import { createHash } from "node:crypto";
import { join } from "node:path";
import { D1_CANDIDATE_PROJECTION_TABLES } from "@bp/db/d1";
import { decodeStrict } from "@bp/domain/decode";
import {
  type ServingCandidateManifestV1,
  ServingCandidateManifestV1Schema,
} from "@bp/domain/studio/serving-release";
import { releaseIdFromPublishedAt } from "@bp/domain/studio/shared";
import {
  createPlan098OperatorClient,
  fetchPlan098PublicRead,
} from "../src/lib/plan098-operator-client.ts";

type Args = {
  endpoint: string;
  token: string;
  candidateRoot: string;
  baseUrl: string;
  output: string;
};

type StagePlan = {
  baselineReleaseId: string;
  candidateA: {
    artifactCount: number;
    candidateId: string;
    manifestKey: string;
    manifestSha256: string;
  };
  candidateB: {
    artifactCount: number;
    candidateId: string;
    manifestKey: string;
    manifestSha256: string;
  };
};

type UploadEntry = {
  logicalId: string;
  sourcePath: string;
  bytes: number;
};

type PointerStatus =
  | { kind: "legacy"; generation: 0 }
  | {
      kind: "pointed";
      generation: number;
      release: { releaseId: string; candidateId: string; publishedAt: string };
      candidateId: string;
      artifactCount: number;
    };

type CandidateStatus = {
  candidateId: string;
  candidate: {
    state: "staging" | "ready" | "rejected";
    manifestKey: string;
    manifestSha256: string;
  } | null;
  artifacts: { total: number; verified: number };
  releases: Array<{ releaseId: string; publishedAt: string; activatedAt: string }>;
};

function parseArgs(argv: readonly string[]): Args {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === undefined || value === undefined) throw new Error("Missing Plan 098 argument.");
    values.set(key, value);
  }
  const required = (key: string) => {
    const value = values.get(key);
    if (value === undefined || value.length === 0) throw new Error(`Missing ${key}.`);
    return value;
  };
  return {
    endpoint: required("--endpoint"),
    token: required("--token"),
    candidateRoot: required("--candidate-root"),
    baseUrl: required("--base-url").replace(/\/$/u, ""),
    output: required("--output"),
  };
}

function now(): string {
  return new Date().toISOString();
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const operatorJson = createPlan098OperatorClient({ endpoint: args.endpoint, token: args.token });
  const [stagePlan, manifestAValue, manifestBValue, uploadInventory] = await Promise.all([
    Bun.file(join(args.candidateRoot, "stage-plan.json")).json() as Promise<StagePlan>,
    Bun.file(join(args.candidateRoot, "candidate-a.manifest.json")).json(),
    Bun.file(join(args.candidateRoot, "candidate-b.manifest.json")).json(),
    Bun.file(join(args.candidateRoot, "plan106-upload-inventory.json")).json() as Promise<{
      entries: UploadEntry[];
    }>,
  ]);
  const manifestA = decodeStrict(ServingCandidateManifestV1Schema)(manifestAValue);
  const manifestB = decodeStrict(ServingCandidateManifestV1Schema)(manifestBValue);
  if (
    manifestA.candidateId !== stagePlan.candidateA.candidateId ||
    manifestB.candidateId !== stagePlan.candidateB.candidateId ||
    stagePlan.candidateA.artifactCount !== 3002 ||
    stagePlan.candidateB.artifactCount !== 3191 ||
    stagePlan.baselineReleaseId !== "pub_20260725T164123260Z"
  ) {
    throw new Error("Plan 098 stage plan does not bind the exact candidate manifests.");
  }

  const candidateStatus = (candidateId: string) =>
    operatorJson<CandidateStatus>({ action: "candidate-status", candidateId });
  const pointerStatus = () => operatorJson<PointerStatus>({ action: "status" });
  const phaseReceipts: unknown[] = [];

  const registeredManifest = async (
    name: "a" | "b",
    candidateId: string,
    expectedArtifactCount: number,
  ) => {
    const status = await candidateStatus(candidateId);
    if (
      status.candidate?.state !== "ready" ||
      !/^[0-9a-f]{64}$/u.test(status.candidate.manifestSha256) ||
      status.artifacts.total !== expectedArtifactCount ||
      status.artifacts.verified !== status.artifacts.total
    ) {
      throw new Error(`Candidate ${name} registered manifest is not exactly ready.`);
    }
    return {
      manifestKey: status.candidate.manifestKey,
      manifestSha256: status.candidate.manifestSha256,
    };
  };

  const recordReceipt = async (operationId: string, receiptKind: string, receipt: unknown) => {
    const result = await operatorJson({
      action: "record-receipt",
      operationId,
      receiptKind,
      createdAt: now(),
      receipt,
    });
    phaseReceipts.push(result);
  };

  const stageCandidate = async (input: {
    name: "a" | "b";
    manifest: ServingCandidateManifestV1;
    manifestKey: string;
    manifestSha256: string;
    sourceCandidateId: string | null;
    uploads: readonly UploadEntry[];
  }) => {
    let status = await candidateStatus(input.manifest.candidateId);
    if (status.candidate?.state === "ready") return status;
    if (status.candidate?.state === "rejected")
      throw new Error(`Candidate ${input.name} rejected.`);
    await operatorJson({
      action: "register-candidate",
      manifest: input.manifest,
      manifestKey: input.manifestKey,
      manifestSha256: input.manifestSha256,
      stagedAt: now(),
    });
    for (const table of D1_CANDIDATE_PROJECTION_TABLES) {
      const copied = await operatorJson<{ table: string; rowCount: number }>({
        action: "copy-d1-table",
        candidateId: input.manifest.candidateId,
        sourceCandidateId: input.sourceCandidateId,
        coverageEnd: "2026-05",
        table,
      });
      if (copied.rowCount !== input.manifest.d1.rowCounts[table]) {
        throw new Error(`Candidate ${input.name} D1 count mismatch for ${table}.`);
      }
    }
    const uploadOne = async (entry: UploadEntry) => {
      const body = new Uint8Array(await Bun.file(entry.sourcePath).arrayBuffer());
      if (body.byteLength !== entry.bytes)
        throw new Error(`Upload bytes drifted for ${entry.logicalId}.`);
      const response = await fetch(args.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${args.token}`,
          "Content-Type": "application/octet-stream",
          "X-Plan098-Action": "upload-artifact",
          "X-Plan098-Candidate-Id": input.manifest.candidateId,
          "X-Plan098-Logical-Id": entry.logicalId,
          "X-Plan098-Verified-At": now(),
        },
        body: new Blob([Uint8Array.from(body)]),
      });
      if (!response.ok) throw new Error(`Artifact upload failed: ${await response.text()}`);
    };
    for (let offset = 0; offset < input.uploads.length; offset += 6) {
      await Promise.all(input.uploads.slice(offset, offset + 6).map(uploadOne));
    }

    const batches: string[][] = [];
    let batch: string[] = [];
    let batchBytes = 0;
    for (const artifact of input.manifest.artifacts) {
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
          operatorJson({
            action: "verify-artifacts",
            candidateId: input.manifest.candidateId,
            verifiedAt: now(),
            logicalIds,
          }),
        ),
      );
      console.log(
        `Plan 098 candidate ${input.name}: verified ${Math.min(offset + 6, batches.length)}/${batches.length} artifact batches`,
      );
    }
    await operatorJson({
      action: "mark-ready",
      candidateId: input.manifest.candidateId,
      readyAt: now(),
    });
    status = await candidateStatus(input.manifest.candidateId);
    if (
      status.candidate?.state !== "ready" ||
      status.artifacts.total !== input.manifest.artifacts.length ||
      status.artifacts.verified !== status.artifacts.total
    ) {
      throw new Error(`Candidate ${input.name} did not reach exact readiness.`);
    }
    await recordReceipt(
      `plan098-stage-${input.name}-${input.manifest.candidateId.slice(0, 16)}`,
      "ready",
      {
        artifactKind: "bp.ops.plan098.candidate-ready.v1",
        schemaVersion: 1,
        candidateId: input.manifest.candidateId,
        manifestSha256: input.manifestSha256,
        artifactCount: status.artifacts.total,
        d1RowCounts: input.manifest.d1.rowCounts,
        readyAt: status.candidate,
      },
    );
    return status;
  };

  const smoke = async (phase: string, expectedReleaseId: string, expectedCandidateId: string) => {
    const paths = [
      "/api/v1/status",
      "/api/v1/map/manifest",
      "/api/v1/studio/routes?schema=3",
      "/api/v1/studio/routes/b44",
      "/api/v1/studio/routes/b44-sbs",
      "/api/v1/studio/routes/b44-sbs/history",
      "/api/v1/artifacts/studio/v2/interventions/public-episodes-v2.json",
    ];
    const evidence = [];
    for (const path of paths) {
      const separator = path.includes("?") ? "&" : "?";
      const { response, body } = await fetchPlan098PublicRead({
        url: `${args.baseUrl}${path}${separator}plan098=${crypto.randomUUID()}`,
        label: `${phase} smoke ${path}`,
      });
      if (path === "/api/v1/status" || path === "/api/v1/map/manifest") {
        const parsed = JSON.parse(body) as { releaseId?: string };
        if (parsed.releaseId !== expectedReleaseId) {
          throw new Error(`Plan 098 ${phase} ${path} elected ${parsed.releaseId ?? "none"}.`);
        }
      }
      if (path.includes("public-episodes") && expectedCandidateId === manifestB.candidateId) {
        const parsed = JSON.parse(body) as {
          candidate?: { candidateId?: string };
          episodes?: unknown[];
        };
        if (
          parsed.candidate?.candidateId !==
            "b647f0f12a5dc037e0e9776e03c0cf9a4f78081728b7f4470e58e4558e4e77ef" ||
          parsed.episodes?.length !== 222
        ) {
          throw new Error("Plan 106 public intervention artifact failed 222-episode smoke.");
        }
      }
      evidence.push({
        path,
        status: response.status,
        bodySha256: sha256(body),
        cacheControl: response.headers.get("Cache-Control"),
        workerVersionId: response.headers.get("X-BP-Worker-Version"),
      });
    }
    const receipt = {
      artifactKind: "bp.ops.plan098.http-smoke.v1",
      schemaVersion: 1,
      phase,
      checkedAt: now(),
      expectedReleaseId,
      expectedCandidateId,
      evidence,
    };
    await recordReceipt(
      `plan098-${phase}-${expectedCandidateId.slice(0, 16)}`,
      "http-smoke",
      receipt,
    );
    return receipt;
  };

  let pointer = await pointerStatus();
  const startingGeneration = pointer.generation;
  const supersededRollbackIntent =
    pointer.generation === 2
      ? await operatorJson<{
          operationId: string;
          outcome: "absent" | "failed" | "already_failed";
        }>({
          action: "fail-prepared-intent",
          operationId: `plan098-rollback-a-${manifestB.candidateId.slice(0, 16)}`,
        })
      : null;
  if (pointer.generation === 0) {
    await stageCandidate({
      name: "a",
      manifest: manifestA,
      manifestKey: stagePlan.candidateA.manifestKey,
      manifestSha256: stagePlan.candidateA.manifestSha256,
      sourceCandidateId: null,
      uploads: [],
    });
    await operatorJson({ action: "bootstrap-current-signals", coverageEnd: "2026-05" });
  }
  const fingerprintsBefore = await operatorJson<{
    absentTables: string[];
    fingerprints: unknown[];
  }>({
    action: "protected-fingerprints",
  });
  if (pointer.generation === 0) {
    await operatorJson({
      action: "activate",
      operationId: `plan098-adopt-a-${manifestA.candidateId.slice(0, 16)}`,
      expectedReleaseId: null,
      expectedGeneration: 0,
      release: {
        schemaVersion: 1,
        releaseId: stagePlan.baselineReleaseId,
        candidateId: manifestA.candidateId,
        publishedAt: "2026-07-25T16:41:23.260Z",
        activatedAt: now(),
      },
      manifestSha256: (
        await registeredManifest("a", manifestA.candidateId, stagePlan.candidateA.artifactCount)
      ).manifestSha256,
    });
    await smoke("adopt-a", stagePlan.baselineReleaseId, manifestA.candidateId);
    pointer = await pointerStatus();
  }
  if (pointer.generation === 1) {
    await stageCandidate({
      name: "b",
      manifest: manifestB,
      manifestKey: stagePlan.candidateB.manifestKey,
      manifestSha256: stagePlan.candidateB.manifestSha256,
      sourceCandidateId: manifestA.candidateId,
      uploads: uploadInventory.entries,
    });
    const publishedAt = now();
    const releaseId = releaseIdFromPublishedAt(publishedAt);
    await operatorJson({
      action: "activate",
      operationId: `plan098-activate-b-${manifestB.candidateId.slice(0, 16)}`,
      expectedReleaseId: stagePlan.baselineReleaseId,
      expectedGeneration: 1,
      release: {
        schemaVersion: 1,
        releaseId,
        candidateId: manifestB.candidateId,
        publishedAt,
        activatedAt: publishedAt,
      },
      manifestSha256: (
        await registeredManifest("b", manifestB.candidateId, stagePlan.candidateB.artifactCount)
      ).manifestSha256,
    });
    await smoke("activate-b", releaseId, manifestB.candidateId);
    pointer = await pointerStatus();
  }
  const candidateBStatus = await candidateStatus(manifestB.candidateId);
  const releaseB = candidateBStatus.releases[0];
  if (releaseB === undefined) throw new Error("Candidate B has no immutable release event.");
  const [registeredManifestA, registeredManifestB] = await Promise.all([
    registeredManifest("a", manifestA.candidateId, stagePlan.candidateA.artifactCount),
    registeredManifest("b", manifestB.candidateId, stagePlan.candidateB.artifactCount),
  ]);
  if (pointer.generation === 2 && startingGeneration === 2) {
    await smoke("activate-b-resume", releaseB.releaseId, manifestB.candidateId);
  }
  if (pointer.generation === 2) {
    await operatorJson({
      action: "activate",
      operationId: `plan098-rollback-a-r${registeredManifestA.manifestSha256.slice(0, 16)}`,
      expectedReleaseId: releaseB.releaseId,
      expectedGeneration: 2,
      release: {
        schemaVersion: 1,
        releaseId: stagePlan.baselineReleaseId,
        candidateId: manifestA.candidateId,
        publishedAt: "2026-07-25T16:41:23.260Z",
        activatedAt: now(),
      },
      manifestSha256: registeredManifestA.manifestSha256,
    });
    await smoke("rollback-a", stagePlan.baselineReleaseId, manifestA.candidateId);
    pointer = await pointerStatus();
  }
  if (pointer.generation === 3 && startingGeneration === 3) {
    await smoke("rollback-a-resume", stagePlan.baselineReleaseId, manifestA.candidateId);
  }
  if (pointer.generation === 3) {
    await operatorJson({
      action: "activate",
      operationId: `plan098-reactivate-b-r${registeredManifestB.manifestSha256.slice(0, 16)}`,
      expectedReleaseId: stagePlan.baselineReleaseId,
      expectedGeneration: 3,
      release: {
        schemaVersion: 1,
        releaseId: releaseB.releaseId,
        candidateId: manifestB.candidateId,
        publishedAt: releaseB.publishedAt,
        activatedAt: now(),
      },
      manifestSha256: registeredManifestB.manifestSha256,
    });
    await smoke("reactivate-b", releaseB.releaseId, manifestB.candidateId);
    pointer = await pointerStatus();
  }
  if (pointer.generation === 4 && startingGeneration === 4) {
    await smoke("reactivate-b-resume", releaseB.releaseId, manifestB.candidateId);
  }
  if (
    pointer.generation !== 4 ||
    pointer.kind !== "pointed" ||
    pointer.candidateId !== manifestB.candidateId
  ) {
    throw new Error(`Plan 098 drill ended in unexpected pointer generation ${pointer.generation}.`);
  }
  const fingerprintsAfter = await operatorJson<{
    absentTables: string[];
    fingerprints: unknown[];
  }>({
    action: "protected-fingerprints",
  });
  if (JSON.stringify(fingerprintsAfter) !== JSON.stringify(fingerprintsBefore)) {
    throw new Error("Protected live/current fingerprints changed during the pointer drill.");
  }
  const finalReceipt = {
    artifactKind: "bp.ops.plan098.production-completion.v1",
    schemaVersion: 1,
    completedAt: now(),
    pointer,
    candidateA: { ...stagePlan.candidateA, registeredManifest: registeredManifestA },
    candidateB: { ...stagePlan.candidateB, registeredManifest: registeredManifestB },
    releaseB,
    supersededRollbackIntent,
    protectedFingerprints: fingerprintsAfter,
    phaseReceipts,
  };
  await recordReceipt(
    `plan098-complete-${manifestB.candidateId.slice(0, 16)}`,
    "completion",
    finalReceipt,
  );
  await Bun.write(args.output, `${JSON.stringify(finalReceipt, null, 2)}\n`);
  console.log(
    JSON.stringify({ releaseId: releaseB.releaseId, candidateId: manifestB.candidateId }),
  );
}

await main();
