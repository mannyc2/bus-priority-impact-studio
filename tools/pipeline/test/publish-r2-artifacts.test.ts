import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  type PublishR2Options,
  publishR2Artifacts,
  type S3Driver,
} from "../src/jobs/publish/publish-r2-artifacts.js";

const artifactRoot = join(import.meta.dir, ".tmp-publish-r2");
const month = "2099-01";

function makeOptions(overrides: Partial<PublishR2Options> = {}): PublishR2Options {
  return {
    month,
    bucket: "test-bucket",
    endpoint: "https://example.invalid",
    accessKeyId: "id",
    secretAccessKey: "secret",
    concurrency: 4,
    maxAttempts: 3,
    backoffMsBase: 1,
    prefixes: ["studio"] as const,
    manifestDirs: ["briefs"] as const,
    artifactRoot,
    outputPath: join(artifactRoot, "audits", `publish-r2-${month}.json`),
    dryRun: false,
    force: false,
    ...overrides,
  };
}

async function writeManifest(month_: string, keys: string[]): Promise<void> {
  const dir = join(artifactRoot, "briefs", month_);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      artifactKind: "brief_artifact_manifest",
      analysisPeriod: month_,
      artifacts: keys.map((k) => ({ artifactKey: k, byteLength: 1, sha256: "x" })),
    }),
  );
}

function md5(body: string): string {
  return createHash("md5").update(body).digest("hex");
}

function makeStubDriver(): {
  driver: S3Driver;
  remote: Map<string, { size: number; etag: string; body: Uint8Array }>;
  putCalls: string[];
  failNextPuts: Map<string, number>;
} {
  const remote = new Map<string, { size: number; etag: string; body: Uint8Array }>();
  const putCalls: string[] = [];
  const failNextPuts = new Map<string, number>();
  const driver: S3Driver = {
    async stat(key) {
      const hit = remote.get(key);
      if (!hit) return null;
      return { size: hit.size, etag: hit.etag };
    },
    async put(key, body, _ct) {
      putCalls.push(key);
      const remaining = failNextPuts.get(key) ?? 0;
      if (remaining > 0) {
        failNextPuts.set(key, remaining - 1);
        throw new Error("transient 502");
      }
      remote.set(key, {
        size: body.byteLength,
        etag: createHash("md5").update(body).digest("hex"),
        body,
      });
    },
  };
  return { driver, remote, putCalls, failNextPuts };
}

describe("publishR2Artifacts", () => {
  beforeEach(async () => {
    await rm(artifactRoot, { force: true, recursive: true });
    await mkdir(artifactRoot, { recursive: true });
  });
  afterEach(async () => {
    await rm(artifactRoot, { force: true, recursive: true });
  });

  test("uploads keys absent from remote and writes a passing audit report", async () => {
    await writeManifest(month, [`briefs/routes/r1/${month}/brief.json`]);
    await mkdir(join(artifactRoot, "briefs", "routes", "r1", month), { recursive: true });
    await writeFile(join(artifactRoot, "briefs", "routes", "r1", month, "brief.json"), '{"ok":1}');
    await mkdir(join(artifactRoot, "studio", "v1"), { recursive: true });
    await writeFile(join(artifactRoot, "studio", "v1", "release.json"), '{"v":1}');

    const stub = makeStubDriver();
    const report = await publishR2Artifacts(makeOptions({ driver: stub.driver }));

    expect(report.status).toBe("pass");
    expect(report.candidateCount).toBe(2);
    expect(report.uploadedCount).toBe(2);
    expect(report.skippedCount).toBe(0);
    expect(report.failedCount).toBe(0);
    expect(stub.putCalls.sort()).toEqual([
      `briefs/routes/r1/${month}/brief.json`,
      "studio/v1/release.json",
    ]);
  });

  test("skips keys whose remote size+etag match the local file", async () => {
    await mkdir(join(artifactRoot, "studio", "v1"), { recursive: true });
    const body = '{"v":1}';
    await writeFile(join(artifactRoot, "studio", "v1", "release.json"), body);

    const stub = makeStubDriver();
    stub.remote.set("studio/v1/release.json", {
      size: Buffer.byteLength(body),
      etag: md5(body),
      body: new TextEncoder().encode(body),
    });

    const report = await publishR2Artifacts(makeOptions({ driver: stub.driver }));

    expect(report.uploadedCount).toBe(0);
    expect(report.skippedCount).toBe(1);
    expect(stub.putCalls).toEqual([]);
  });

  test("re-uploads when remote size differs from local", async () => {
    await mkdir(join(artifactRoot, "studio", "v1"), { recursive: true });
    const body = '{"v":2}';
    await writeFile(join(artifactRoot, "studio", "v1", "release.json"), body);

    const stub = makeStubDriver();
    stub.remote.set("studio/v1/release.json", {
      size: 1,
      etag: md5("x"),
      body: new TextEncoder().encode("x"),
    });

    const report = await publishR2Artifacts(makeOptions({ driver: stub.driver }));

    expect(report.uploadedCount).toBe(1);
    expect(report.skippedCount).toBe(0);
    expect(stub.remote.get("studio/v1/release.json")?.size).toBe(Buffer.byteLength(body));
  });

  test("retries transient put failures and ultimately succeeds", async () => {
    await mkdir(join(artifactRoot, "studio", "v1"), { recursive: true });
    const body = '{"flaky":true}';
    await writeFile(join(artifactRoot, "studio", "v1", "release.json"), body);

    const stub = makeStubDriver();
    stub.failNextPuts.set("studio/v1/release.json", 1);

    const report = await publishR2Artifacts(makeOptions({ driver: stub.driver, maxAttempts: 3 }));

    expect(report.status).toBe("pass");
    expect(report.uploadedCount).toBe(1);
    expect(stub.putCalls.filter((k) => k === "studio/v1/release.json")).toHaveLength(2);
  });

  test("marks status fail when retries are exhausted", async () => {
    await mkdir(join(artifactRoot, "studio", "v1"), { recursive: true });
    await writeFile(join(artifactRoot, "studio", "v1", "release.json"), '{"x":1}');

    const stub = makeStubDriver();
    stub.failNextPuts.set("studio/v1/release.json", 99);

    const report = await publishR2Artifacts(makeOptions({ driver: stub.driver, maxAttempts: 2 }));

    expect(report.status).toBe("fail");
    expect(report.failedCount).toBe(1);
    expect(report.failed[0]?.key).toBe("studio/v1/release.json");
    expect(stub.putCalls.filter((k) => k === "studio/v1/release.json")).toHaveLength(2);
  });

  test("force flag bypasses the idempotency skip", async () => {
    await mkdir(join(artifactRoot, "studio", "v1"), { recursive: true });
    const body = '{"v":1}';
    await writeFile(join(artifactRoot, "studio", "v1", "release.json"), body);

    const stub = makeStubDriver();
    stub.remote.set("studio/v1/release.json", {
      size: Buffer.byteLength(body),
      etag: md5(body),
      body: new TextEncoder().encode(body),
    });

    const report = await publishR2Artifacts(makeOptions({ driver: stub.driver, force: true }));

    expect(report.uploadedCount).toBe(1);
    expect(report.skippedCount).toBe(0);
  });

  test("dry-run reports would-upload without calling put", async () => {
    await mkdir(join(artifactRoot, "studio", "v1"), { recursive: true });
    await writeFile(join(artifactRoot, "studio", "v1", "release.json"), '{"v":1}');

    const stub = makeStubDriver();
    const report = await publishR2Artifacts(makeOptions({ driver: stub.driver, dryRun: true }));

    expect(report.status).toBe("pass");
    expect(report.dryRunCount).toBe(1);
    expect(report.uploadedCount).toBe(0);
    expect(stub.putCalls).toEqual([]);
  });
});
