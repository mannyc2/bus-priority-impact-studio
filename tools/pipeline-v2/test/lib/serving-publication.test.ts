import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalServingJson, canonicalServingJsonBytes } from "@bp/domain/studio/serving-release";
import {
  canonicalReceiptText,
  prepareServingPublication,
  sha256,
} from "../../src/lib/serving-publication.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<{
  root: string;
  expectedCandidateId: string;
  manifest: Record<string, unknown>;
}> {
  const root = await mkdtemp(join(tmpdir(), "serving-publication-"));
  roots.push(root);
  const body = canonicalServingJsonBytes({ routeId: "B44", values: [1, 2] });
  const bodySha = sha256(body);
  const key = `serving/blobs/sha256/${bodySha.slice(0, 2)}/${bodySha}.json`;
  const candidateId = "a".repeat(64);
  const semanticInputFingerprint = "b".repeat(64);
  const sourceCommit = "c".repeat(40);
  const manifest = {
    schemaVersion: 1,
    candidateId,
    semanticInputFingerprint,
    sourceCommit,
    builderVersions: [{ name: "fixture", version: "1" }],
    datasets: [
      {
        datasetId: "reviewed-serving",
        grain: "month",
        coverage: { start: "2023-04", end: "2026-06" },
        sourceSnapshotIds: ["snapshot"],
      },
    ],
    artifacts: [
      {
        logicalId: "routes/b44.json",
        key,
        sha256: bodySha,
        bytes: body.byteLength,
        mediaType: "application/json",
        schemaId: "route",
      },
    ],
    d1: {
      projectionSchema: "bp.d1.serving.v2",
      projectionSha256: "d".repeat(64),
      rowCounts: { route: 1 },
    },
    exactIdentity: { projectionSha256: "e".repeat(64), routeCount: 1 },
  };
  const manifestBytes = canonicalServingJsonBytes(manifest);
  const seedBytes = new TextEncoder().encode("SELECT 1;\n");
  const inventory = { schemaVersion: 1, entries: [manifest.artifacts[0]] };
  const inventoryBytes = canonicalServingJsonBytes(inventory);
  const stagePlan = {
    candidateId,
    candidateManifestKey: `serving/candidates/${candidateId}/manifest.${sha256(manifestBytes)}.json`,
    candidateManifestSha256: sha256(manifestBytes),
    candidateSeedBytes: seedBytes.byteLength,
    candidateSeedSha256: sha256(seedBytes),
    artifactCount: 1,
    uploadArtifactCount: 1,
    uploadBytes: body.byteLength,
    semanticInputFingerprint,
    sourceCommit,
    d1: { projectionSha256: "d".repeat(64), rowCounts: { route: 1 } },
  };
  await mkdir(join(root, "objects", key.substring(0, key.lastIndexOf("/"))), {
    recursive: true,
  });
  await Promise.all([
    writeFile(join(root, "candidate.manifest.json"), manifestBytes),
    writeFile(join(root, "candidate-seed.sql"), seedBytes),
    writeFile(join(root, "upload-inventory.json"), inventoryBytes),
    writeFile(join(root, "stage-plan.json"), canonicalServingJsonBytes(stagePlan)),
    writeFile(join(root, "objects", key), body),
  ]);
  return { root, expectedCandidateId: "f".repeat(64), manifest };
}

describe("serving publication preparation", () => {
  test("strictly closes candidate bytes into a canonical zero-mutation receipt", async () => {
    const seeded = await fixture();
    const receipt = await prepareServingPublication({
      candidateRoot: seeded.root,
      releaseTag: "candidate-a",
      archiveAsset: "candidate-a.tar.zst",
      archiveSha256: "1".repeat(64),
      expectedReleaseId: "pub_20260802T000000000Z",
      expectedCandidateId: seeded.expectedCandidateId,
      expectedGeneration: 5,
      repoSha: "2".repeat(40),
      preparedAt: "2026-08-02T00:00:00.000Z",
      workerdParity: true,
    });

    expect(receipt.operationId).toBe(`serving-publication-${"a".repeat(20)}-6`);
    expect(receipt.candidate.artifactCount).toBe(1);
    expect(receipt.candidate.uploadArtifactCount).toBe(1);
    expect(receipt.localProof).toEqual({
      closedManifest: true,
      canonicalBytes: true,
      verifiedHashSkip: true,
      workerdParity: true,
    });
    expect(canonicalReceiptText(receipt)).toBe(`${canonicalServingJson(receipt)}\n`);
    expect(canonicalReceiptText(receipt)).not.toContain(seeded.root);
  });

  test("refuses missing workerd proof and object drift", async () => {
    const seeded = await fixture();
    const base = {
      candidateRoot: seeded.root,
      releaseTag: "candidate-a",
      archiveAsset: "candidate-a.tar.zst",
      archiveSha256: "1".repeat(64),
      expectedReleaseId: "pub_20260802T000000000Z",
      expectedCandidateId: seeded.expectedCandidateId,
      expectedGeneration: 5,
      repoSha: "2".repeat(40),
      preparedAt: "2026-08-02T00:00:00.000Z",
    } as const;
    await expect(prepareServingPublication({ ...base, workerdParity: false })).rejects.toThrow(
      "workerd parity",
    );
    const artifact = (seeded.manifest["artifacts"] as Array<{ key: string }>)[0];
    if (artifact === undefined) throw new Error("fixture artifact absent");
    await writeFile(join(seeded.root, "objects", artifact.key), "drift");
    await expect(prepareServingPublication({ ...base, workerdParity: true })).rejects.toThrow(
      "Closed candidate object drifted",
    );
  });
});
