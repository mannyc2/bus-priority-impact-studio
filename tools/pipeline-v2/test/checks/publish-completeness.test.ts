import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("publish completeness", () => {
  test("rejects demo and unverified map manifests before publication", async () => {
    const root = await mkdtemp(join(tmpdir(), "bp-publish-completeness-"));
    roots.push(root);
    const artifactRoot = join(root, "artifacts");
    const month = "2026-03";
    await mkdir(join(artifactRoot, "map", month), { recursive: true });
    await mkdir(join(artifactRoot, "studio", "v1"), { recursive: true });
    await Bun.write(
      join(artifactRoot, "map", month, "manifest.json"),
      JSON.stringify({
        releaseProfile: "demo",
        buildStatus: "pass",
        verificationStatus: "not_run",
        analysisPeriod: month,
        routeFacts: { status: "unavailable", reason: "fixture" },
        artifacts: [],
      }),
    );
    await Bun.write(
      join(artifactRoot, "studio", "v1", "routes.json"),
      JSON.stringify({ baselineMonth: month }),
    );
    const output = join(root, "report.json");
    const process = Bun.spawn(
      [
        "bun",
        "run",
        "tools/pipeline-v2/src/checks/check-publish-completeness.ts",
        "--month",
        month,
        "--artifact-root",
        artifactRoot,
        "--export-root",
        join(root, "exports"),
        "--output",
        output,
      ],
      { cwd: join(import.meta.dir, "../../../.."), stdout: "pipe", stderr: "pipe" },
    );
    expect(await process.exited).toBe(1);
    const report = JSON.parse(await readFile(output, "utf8")) as { conflicts: string[] };
    expect(report.conflicts).toEqual(
      expect.arrayContaining([
        "Map manifest is not a full release.",
        "Map manifest verificationStatus is not pass.",
        "Map route facts are unavailable.",
        "Verified D1 schema and seed exports are unavailable.",
      ]),
    );
  });
});
