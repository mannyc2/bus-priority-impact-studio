import { describe, expect, test } from "bun:test";
import { buildServingCandidate } from "../../src/lib/serving-candidate.ts";

const hash = (character: string) => character.repeat(64);

function input(sourceCommit = "a".repeat(40)) {
  return {
    schemaVersion: 1 as const,
    semanticInputFingerprint: hash("b"),
    sourceCommit,
    builderVersions: [{ name: "plan098", version: "1" }],
    datasets: [
      {
        datasetId: "route-speed",
        grain: "month" as const,
        coverage: { start: "2023-04", end: "2026-05" },
        sourceSnapshotIds: ["snapshot-a"],
      },
    ],
    artifacts: [
      {
        logicalId: "route/m1/history",
        body: new TextEncoder().encode('{"routeId":"M1"}\n'),
        mediaType: "application/json",
        schemaId: "bp.route-history.v1",
      },
    ],
    d1: {
      projectionSchema: "bp.d1.serving.v2",
      projectionSha256: hash("c"),
      rowCounts: { route_catalog: 1 },
    },
    exactIdentity: { projectionSha256: hash("d"), routeCount: 1 },
  };
}

describe("Plan 098 serving candidate builder", () => {
  test("derives immutable physical keys and a deterministic semantic candidate ID", () => {
    const first = buildServingCandidate(input());
    const second = buildServingCandidate(input("e".repeat(40)));
    expect(second.manifest.candidateId).toBe(first.manifest.candidateId);
    expect(second.manifestSha256).not.toBe(first.manifestSha256);
    expect(first.objects[0]?.key).toContain(first.objects[0]?.sha256 ?? "missing");
    expect(first.manifestKey).toContain(first.manifestSha256);
    expect(buildServingCandidate(input()).manifestBytes).toEqual(first.manifestBytes);
  });

  test("changes candidate identity when semantic bytes change", () => {
    const changed = input();
    const artifact = changed.artifacts[0];
    if (artifact === undefined) throw new Error("Missing artifact fixture.");
    changed.artifacts[0] = {
      ...artifact,
      body: new TextEncoder().encode('{"routeId":"M2"}\n'),
    };
    expect(buildServingCandidate(changed).manifest.candidateId).not.toBe(
      buildServingCandidate(input()).manifest.candidateId,
    );
  });
});
