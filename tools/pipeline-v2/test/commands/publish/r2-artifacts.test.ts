import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { canonicalServingJsonBytes } from "@bp/domain/studio/serving-release";
import {
  runPublishR2Artifacts,
  runPublishR2ArtifactsCommand,
  type S3Driver,
} from "../../../src/commands/publish/r2-artifacts.ts";
import { buildServingCandidate } from "../../../src/lib/serving-candidate.ts";

type DriverCall = { kind: "get" | "put-if-absent"; key: string };

function recordingDriver(initial: ReadonlyMap<string, Uint8Array> = new Map()): {
  driver: S3Driver;
  calls: DriverCall[];
  objects: Map<string, Uint8Array>;
} {
  const calls: DriverCall[] = [];
  const objects = new Map(initial);
  return {
    calls,
    objects,
    driver: {
      tracksRemoteCosts: true,
      async get(key) {
        calls.push({ kind: "get", key });
        return objects.get(key) ?? null;
      },
      async putIfAbsent(key, body) {
        calls.push({ kind: "put-if-absent", key });
        if (objects.has(key)) return false;
        objects.set(key, Uint8Array.from(body));
        return true;
      },
    },
  };
}

function candidate() {
  return buildServingCandidate({
    schemaVersion: 1,
    semanticInputFingerprint: "b".repeat(64),
    sourceCommit: "c".repeat(40),
    builderVersions: [{ name: "fixture", version: "1" }],
    datasets: [
      {
        datasetId: "route-speed",
        grain: "month",
        coverage: { start: "2023-04", end: "2026-07" },
        sourceSnapshotIds: ["speed-2026-07"],
      },
    ],
    artifacts: [
      {
        logicalId: "route/m1/speed-history",
        body: canonicalServingJsonBytes({ routeId: "M1", values: [1, 2] }),
        mediaType: "application/json",
        schemaId: "bp.route-speed-history.v2",
      },
      {
        logicalId: "map/network",
        body: canonicalServingJsonBytes({ type: "FeatureCollection", features: [] }),
        mediaType: "application/geo+json",
        schemaId: "bp.map-network.v3",
        extension: "geojson",
      },
    ],
    d1: {
      projectionSchema: "bp.d1.serving.v2",
      projectionSha256: "d".repeat(64),
      rowCounts: { route_catalog: 1 },
    },
    exactIdentity: { projectionSha256: "e".repeat(64), routeCount: 1 },
  });
}

async function seedCandidate(tmp: string) {
  const built = candidate();
  const artifactRoot = join(tmp, "artifacts");
  const candidateManifestPath = join(tmp, "candidate.manifest.json");
  const outputPath = join(tmp, "report.json");
  await writeFile(candidateManifestPath, built.manifestBytes);
  for (const object of built.objects) {
    const path = join(artifactRoot, object.key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, object.body);
  }
  return { built, artifactRoot, candidateManifestPath, outputPath };
}

function options(
  seeded: Awaited<ReturnType<typeof seedCandidate>>,
  driver: S3Driver,
  dryRun = false,
) {
  return {
    bucket: "fixture-bucket",
    endpoint: "",
    accessKeyId: "",
    secretAccessKey: "",
    concurrency: 4,
    maxAttempts: 1,
    backoffMsBase: 1,
    candidateManifestPath: seeded.candidateManifestPath,
    artifactRoot: seeded.artifactRoot,
    outputPath: seeded.outputPath,
    dryRun,
    driver,
  };
}

describe("publish r2-artifacts candidate uploader", () => {
  it("uploads only manifest-declared objects and reports artifact families", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "publish-candidate-"));
    try {
      const seeded = await seedCandidate(tmp);
      await writeFile(join(seeded.artifactRoot, "undeclared.json"), "{}");
      const remote = recordingDriver();

      const report = await runPublishR2Artifacts(options(seeded, remote.driver));

      expect(report.status).toBe("pass");
      expect(report.uploadedCount).toBe(2);
      expect(report.candidateId).toBe(seeded.built.manifest.candidateId);
      expect(Object.keys(report.families)).toEqual(["map", "route"]);
      expect(remote.calls.filter((call) => call.kind === "put-if-absent")).toHaveLength(2);
      expect(remote.calls.some((call) => call.key === "undeclared.json")).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("skips every object only after GET bytes verify to the declared SHA-256", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "publish-candidate-reuse-"));
    try {
      const seeded = await seedCandidate(tmp);
      const remote = recordingDriver(
        new Map(seeded.built.objects.map((object) => [object.key, object.body])),
      );

      const report = await runPublishR2Artifacts(options(seeded, remote.driver));

      expect(report.skippedCount).toBe(2);
      expect(report.skippedByteCount).toBe(report.candidateByteCount);
      expect(report.uploadedByteCount).toBe(0);
      expect(remote.calls.filter((call) => call.kind === "get")).toHaveLength(2);
      expect(remote.calls.some((call) => call.kind === "put-if-absent")).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("blocks same-size corrupt immutable bytes and never overwrites the key", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "publish-candidate-corrupt-"));
    try {
      const seeded = await seedCandidate(tmp);
      const object = seeded.built.objects[0];
      if (object === undefined) throw new Error("Missing fixture object.");
      const corrupt = Uint8Array.from(object.body, (byte, index) =>
        index === 0 ? byte ^ 1 : byte,
      );
      const remote = recordingDriver(new Map([[object.key, corrupt]]));

      const report = await runPublishR2Artifacts(options(seeded, remote.driver));

      expect(report.status).toBe("fail");
      expect(report.failed[0]?.error).toContain("immutable object corruption");
      expect(
        remote.calls.some((call) => call.kind === "put-if-absent" && call.key === object.key),
      ).toBe(false);
      await expect(runPublishR2ArtifactsCommand(options(seeded, remote.driver))).rejects.toThrow(
        "candidate objects",
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("fails a conditional-upload race when the winning immutable bytes are corrupt", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "publish-candidate-race-"));
    try {
      const seeded = await seedCandidate(tmp);
      const object = seeded.built.objects[0];
      if (object === undefined) throw new Error("Missing fixture object.");
      const corrupt = Uint8Array.from(object.body, (byte, index) =>
        index === 0 ? byte ^ 1 : byte,
      );
      let getCount = 0;
      const driver: S3Driver = {
        async get(key) {
          if (key !== object.key) return null;
          getCount += 1;
          return getCount === 1 ? null : corrupt;
        },
        async putIfAbsent() {
          return false;
        },
      };

      const report = await runPublishR2Artifacts(options(seeded, driver));

      expect(report.status).toBe("fail");
      expect(report.failed.find((failure) => failure.key === object.key)?.error).toContain(
        "conditional-upload race",
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("rejects local bytes that drift from the candidate before any remote call", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "publish-candidate-local-drift-"));
    try {
      const seeded = await seedCandidate(tmp);
      const object = seeded.built.objects[0];
      if (object === undefined) throw new Error("Missing fixture object.");
      await writeFile(join(seeded.artifactRoot, object.key), "wrong");
      const remote = recordingDriver();

      const report = await runPublishR2Artifacts(options(seeded, remote.driver));

      expect(report.status).toBe("fail");
      expect(report.failed.some((failure) => failure.key === object.key)).toBe(true);
      expect(remote.calls.some((call) => call.key === object.key)).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("dry-run verifies existing bytes and performs no PUT for absent objects", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "publish-candidate-dry-run-"));
    try {
      const seeded = await seedCandidate(tmp);
      const remote = recordingDriver();

      const report = await runPublishR2Artifacts(options(seeded, remote.driver, true));

      expect(report.dryRunCount).toBe(2);
      expect(report.uploadedCount).toBe(0);
      expect(remote.calls.some((call) => call.kind === "put-if-absent")).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("rejects a traversing physical key even when its hash token is well formed", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "publish-candidate-traversal-"));
    try {
      const seeded = await seedCandidate(tmp);
      const manifest = {
        ...seeded.built.manifest,
        artifacts: seeded.built.manifest.artifacts.map((artifact, index) =>
          index === 0 ? { ...artifact, key: `../${artifact.key}` } : artifact,
        ),
      };
      await writeFile(seeded.candidateManifestPath, canonicalServingJsonBytes(manifest));
      const remote = recordingDriver();

      await expect(runPublishR2Artifacts(options(seeded, remote.driver))).rejects.toThrow("unsafe");
      expect(remote.calls).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
