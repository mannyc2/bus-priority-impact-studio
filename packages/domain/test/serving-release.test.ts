import { describe, expect, test } from "bun:test";
import { decodeStrict } from "@bp/domain/decode";
import {
  ServingCandidateManifestV1Schema,
  servingCandidateSemanticPayload,
} from "@bp/domain/studio/serving-release";

const sha = "a".repeat(64);

function validCandidate() {
  return {
    schemaVersion: 1 as const,
    candidateId: sha,
    semanticInputFingerprint: "b".repeat(64),
    sourceCommit: "c".repeat(40),
    builderVersions: [{ name: "serving-projection", version: "1" }],
    datasets: [
      {
        datasetId: "route-speed",
        grain: "month" as const,
        coverage: { start: "2025-01", end: "2026-06" },
        sourceSnapshotIds: ["snapshot-b", "snapshot-a"],
      },
    ],
    artifacts: [
      {
        logicalId: "route/bx38/speed-history",
        key: `serving/blobs/sha256/aa/${sha}.json`,
        sha256: sha,
        bytes: 42,
        mediaType: "application/json",
        schemaId: "bp.route-speed-history.v1",
      },
    ],
    d1: {
      projectionSchema: "bp.d1.serving.v2",
      projectionSha256: "d".repeat(64),
      rowCounts: { route_catalog: 375 },
    },
    exactIdentity: { projectionSha256: "e".repeat(64), routeCount: 375 },
  };
}

function first<T>(values: T[]): T {
  const value = values[0];
  if (value === undefined) throw new Error("Expected fixture member.");
  return value;
}

describe("Plan 098 serving contracts", () => {
  test("strictly decodes a candidate and excludes provenance from semantic identity", () => {
    const candidate = decodeStrict(ServingCandidateManifestV1Schema)(validCandidate());
    const semantic = servingCandidateSemanticPayload(candidate);

    expect("candidateId" in semantic).toBe(false);
    expect("sourceCommit" in semantic).toBe(false);
    expect(semantic.datasets[0]?.sourceSnapshotIds).toEqual(["snapshot-a", "snapshot-b"]);
  });

  test("rejects duplicate logical IDs and non-hash-bearing physical keys", () => {
    const candidate = validCandidate();
    candidate.artifacts.push({ ...first(candidate.artifacts), key: "serving/not-addressed.json" });
    expect(() => decodeStrict(ServingCandidateManifestV1Schema)(candidate)).toThrow();
  });

  test("rejects inverted coverage and conflicting physical metadata", () => {
    const candidate = validCandidate();
    first(candidate.datasets).coverage = { start: "2026-07", end: "2026-06" };
    candidate.artifacts.push({
      ...first(candidate.artifacts),
      logicalId: "route/bx39/speed-history",
      bytes: 43,
    });
    expect(() => decodeStrict(ServingCandidateManifestV1Schema)(candidate)).toThrow();
  });
});
