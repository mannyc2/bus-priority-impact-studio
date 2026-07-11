import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runPublishR2Artifacts,
  type S3Driver,
} from "../../../src/commands/publish/r2-artifacts.ts";

type DriverCall = {
  kind: "stat" | "put";
  key: string;
};

function recordingDriver(remoteIndex: Map<string, { size: number; etag: string }>): {
  driver: S3Driver;
  calls: DriverCall[];
} {
  const calls: DriverCall[] = [];
  const driver: S3Driver = {
    tracksRemoteCosts: true,
    async stat(key) {
      calls.push({ kind: "stat", key });
      return remoteIndex.get(key) ?? null;
    },
    async put(key) {
      calls.push({ kind: "put", key });
    },
  };
  return { driver, calls };
}

async function seedArtifacts(root: string, month: string): Promise<void> {
  await mkdir(join(root, "map", month), { recursive: true });
  await mkdir(join(root, "studio"), { recursive: true });
  await writeFile(
    join(root, "map", month, "tiles.geojson"),
    '{"type":"FeatureCollection","features":[]}',
  );
  await writeFile(join(root, "studio", "index.json"), '{"v":1}');
}

async function seedStudioSpeedHistoryArtifact(root: string): Promise<void> {
  const dir = join(root, "studio", "v2", "routes", "m15-sbs");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "speed-history.json"), '{"artifactKind":"studio_route_speed_history"}');
}

async function seedStudioRouteEvidenceArtifacts(root: string): Promise<void> {
  const dir = join(root, "studio", "v2", "wiki", "routes");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(root, "studio", "v2", "wiki", "index.json"),
    '{"artifactKind":"bp.studio.route_evidence_index.v1"}',
  );
  await writeFile(join(dir, "m15-sbs.json"), '{"routeId":"M15+","routeSlug":"m15-sbs"}');
}

async function seedStudioDetectorReadinessManifest(root: string): Promise<void> {
  const dir = join(root, "studio", "v2", "detectors");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "route-detector-readiness-manifest.json"),
    '{"artifactKind":"detector_readiness_serving_manifest","schemaVersion":1}',
  );
}

const MONTH = "2026-03";
const publishArtifactKeysPath = join(
  import.meta.dir,
  "../../../src/commands/publish/publish-artifact-keys.ts",
);

function baseOptions(input: {
  artifactRoot: string;
  outputPath: string;
  driver: S3Driver;
  dryRun?: boolean;
  force?: boolean;
}) {
  return {
    month: MONTH,
    bucket: "bus-priority-test",
    endpoint: "",
    accessKeyId: "",
    secretAccessKey: "",
    concurrency: 4,
    maxAttempts: 1,
    backoffMsBase: 1,
    prefixes: ["map", "studio"] as const,
    manifestDirs: [] as const,
    d1SchemaPath: join(input.artifactRoot, "missing-schema.sql"),
    d1SeedPath: join(input.artifactRoot, "missing-seed.sql"),
    artifactRoot: input.artifactRoot,
    outputPath: input.outputPath,
    dryRun: input.dryRun ?? false,
    force: input.force ?? false,
    driver: input.driver,
  };
}

describe("runPublishR2Artifacts", () => {
  it("collects D1 artifact keys through the Effect D1 replay boundary", () => {
    const source = readFileSync(publishArtifactKeysPath, "utf8");

    expect(source).toContain("runD1ReplayBoundary({");
    expect(source).toContain("runPipelineFileSystemBoundary({");
    expect(source).not.toContain('from "node:fs/promises"');
    expect(source).not.toContain('from "bun:sqlite"');
    expect(source).not.toContain("new Database");
    expect(source).not.toContain("createBunSqliteServingDb");
  });

  it("uploads every candidate when remote is empty", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "publish-r2-"));
    try {
      const artifactRoot = join(tmp, "artifacts");
      const outputPath = join(tmp, "report.json");
      await seedArtifacts(artifactRoot, MONTH);

      const { driver, calls } = recordingDriver(new Map());
      const report = await runPublishR2Artifacts(baseOptions({ artifactRoot, outputPath, driver }));

      expect(report.status).toBe("pass");
      expect(report.candidateCount).toBe(2);
      expect(report.uploadedCount).toBe(2);
      expect(report.skippedCount).toBe(0);
      expect(report.failedCount).toBe(0);
      expect(report.r2ClassBOperationCount).toBe(2);
      const statKeys = calls
        .filter((c) => c.kind === "stat")
        .map((c) => c.key)
        .sort();
      const putKeys = calls
        .filter((c) => c.kind === "put")
        .map((c) => c.key)
        .sort();
      expect(statKeys).toEqual([`map/${MONTH}/tiles.geojson`, "studio/index.json"]);
      expect(putKeys).toEqual([`map/${MONTH}/tiles.geojson`, "studio/index.json"]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("rejects a demo map manifest before remote HEAD or PUT calls", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "publish-r2-demo-manifest-"));
    try {
      const artifactRoot = join(tmp, "artifacts");
      const outputPath = join(tmp, "report.json");
      await seedArtifacts(artifactRoot, MONTH);
      await writeFile(
        join(artifactRoot, "map", MONTH, "manifest.json"),
        JSON.stringify({
          releaseProfile: "demo",
          buildStatus: "pass",
          verificationStatus: "not_run",
          analysisPeriod: MONTH,
          routeFacts: { status: "unavailable", reason: "fixture" },
          artifacts: [],
        }),
      );
      const { driver, calls } = recordingDriver(new Map());
      await expect(
        runPublishR2Artifacts({
          ...baseOptions({ artifactRoot, outputPath, driver, dryRun: true }),
          manifestDirs: ["map"],
        }),
      ).rejects.toThrow("Map manifest is not publishable");
      expect(calls).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("rejects a content-addressed filename whose token does not match the body", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "publish-r2-hash-mismatch-"));
    try {
      const artifactRoot = join(tmp, "artifacts");
      const outputPath = join(tmp, "report.json");
      const directory = join(artifactRoot, "map", MONTH);
      await mkdir(directory, { recursive: true });
      const key = `map/${MONTH}/network.${"a".repeat(64)}.geojson`;
      await writeFile(join(artifactRoot, key), '{"type":"FeatureCollection","features":[]}');
      const { driver, calls } = recordingDriver(new Map());
      const report = await runPublishR2Artifacts(
        baseOptions({ artifactRoot, outputPath, driver, dryRun: true }),
      );

      expect(report.status).toBe("fail");
      expect(report.failed[0]?.error).toContain("content-addressed filename hash mismatch");
      expect(calls).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("includes nested Studio v2 route speed-history artifacts under the default studio prefix", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "publish-r2-studio-v2-"));
    try {
      const artifactRoot = join(tmp, "artifacts");
      const outputPath = join(tmp, "report.json");
      await seedArtifacts(artifactRoot, MONTH);
      await seedStudioSpeedHistoryArtifact(artifactRoot);

      const { driver, calls } = recordingDriver(new Map());
      const report = await runPublishR2Artifacts(
        baseOptions({ artifactRoot, outputPath, driver, dryRun: true }),
      );

      expect(report.status).toBe("pass");
      expect(report.candidateCount).toBe(3);
      expect(calls.map((c) => c.key)).toContain("studio/v2/routes/m15-sbs/speed-history.json");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("includes split Studio wiki route-evidence artifacts under the default studio prefix", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "publish-r2-studio-wiki-"));
    try {
      const artifactRoot = join(tmp, "artifacts");
      const outputPath = join(tmp, "report.json");
      await seedArtifacts(artifactRoot, MONTH);
      await seedStudioRouteEvidenceArtifacts(artifactRoot);

      const { driver, calls } = recordingDriver(new Map());
      const report = await runPublishR2Artifacts(
        baseOptions({ artifactRoot, outputPath, driver, dryRun: true }),
      );

      expect(report.status).toBe("pass");
      expect(calls.map((c) => c.key)).toEqual(
        expect.arrayContaining(["studio/v2/wiki/index.json", "studio/v2/wiki/routes/m15-sbs.json"]),
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("includes the staged Studio v2 detector readiness manifest under the default studio prefix", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "publish-r2-studio-v2-detectors-"));
    try {
      const artifactRoot = join(tmp, "artifacts");
      const outputPath = join(tmp, "report.json");
      await seedArtifacts(artifactRoot, MONTH);
      await seedStudioDetectorReadinessManifest(artifactRoot);

      const { driver, calls } = recordingDriver(new Map());
      const report = await runPublishR2Artifacts(
        baseOptions({ artifactRoot, outputPath, driver, dryRun: true }),
      );

      expect(report.status).toBe("pass");
      expect(calls.map((c) => c.key)).toContain(
        "studio/v2/detectors/route-detector-readiness-manifest.json",
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("skips uploads when remote etag matches local md5 and size", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "publish-r2-skip-"));
    try {
      const artifactRoot = join(tmp, "artifacts");
      const outputPath = join(tmp, "report.json");
      await seedArtifacts(artifactRoot, MONTH);

      const studioBody = '{"v":1}';
      const studioMd5 = await Bun.MD5.hash(studioBody, "hex");
      const remote = new Map<string, { size: number; etag: string }>([
        ["studio/index.json", { size: studioBody.length, etag: studioMd5 }],
      ]);

      const { driver } = recordingDriver(remote);
      const report = await runPublishR2Artifacts(baseOptions({ artifactRoot, outputPath, driver }));

      expect(report.uploadedCount).toBe(1);
      expect(report.skippedCount).toBe(1);
      expect(report.candidateCount).toBe(2);
      expect(report.status).toBe("pass");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("reports would-uploads in dry-run mode without calling put", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "publish-r2-dry-"));
    try {
      const artifactRoot = join(tmp, "artifacts");
      const outputPath = join(tmp, "report.json");
      await seedArtifacts(artifactRoot, MONTH);

      const { driver, calls } = recordingDriver(new Map());
      const report = await runPublishR2Artifacts(
        baseOptions({ artifactRoot, outputPath, driver, dryRun: true }),
      );

      expect(report.dryRunCount).toBe(2);
      expect(report.uploadedCount).toBe(0);
      expect(report.status).toBe("pass");
      expect(calls.some((c) => c.kind === "put")).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("force mode skips HEAD and re-uploads every candidate", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "publish-r2-force-"));
    try {
      const artifactRoot = join(tmp, "artifacts");
      const outputPath = join(tmp, "report.json");
      await seedArtifacts(artifactRoot, MONTH);

      const remote = new Map<string, { size: number; etag: string }>([
        ["studio/index.json", { size: 7, etag: "0".repeat(32) }],
      ]);
      const { driver, calls } = recordingDriver(remote);
      const report = await runPublishR2Artifacts(
        baseOptions({ artifactRoot, outputPath, driver, force: true }),
      );

      expect(report.uploadedCount).toBe(2);
      expect(report.skippedCount).toBe(0);
      expect(report.r2ClassBOperationCount).toBe(0);
      expect(calls.some((c) => c.kind === "stat")).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
