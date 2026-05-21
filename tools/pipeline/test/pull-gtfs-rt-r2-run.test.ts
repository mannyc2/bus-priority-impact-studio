import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pullGtfsRtR2Run } from "../src/jobs/ops/pull-gtfs-rt-r2-run.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir !== undefined) {
    await rm(tempDir, { force: true, recursive: true });
    tempDir = undefined;
  }
});

describe("pull GTFS-RT R2 run helper", () => {
  test("summarizes a manifest-list dry run without requiring R2 credentials", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "bp-r2-helper-"));
    const manifestList = join(tempDir, "manifests.txt");
    const output = join(tempDir, "mirror");
    await writeFile(
      manifestList,
      [
        "# comment",
        "gtfs-rt/vehicle_positions/run-a/2026-05-17T17-13-54Z.json",
        "",
        "gtfs-rt/vehicle_positions/run-a/2026-05-17T17-14-24Z.json",
      ].join("\n"),
    );

    const result = await pullGtfsRtR2Run({
      bucket: "bus-priority-gtfs-rt-raw",
      runId: "run-a",
      manifestList,
      output,
    });

    expect(result).toEqual(
      expect.objectContaining({
        runId: "run-a",
        bucket: "bus-priority-gtfs-rt-raw",
        outputDir: output,
        manifestRoot: join(output, "gtfs-rt", "vehicle_positions"),
        manifestCount: 2,
        downloadedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        dryRun: true,
      }),
    );
    expect(result.nextCommand).toContain("--run-id run-a");
    expect(result.nextCommand).toContain(`--manifest-root ${join(output, "gtfs-rt", "vehicle_positions")}`);
    expect(result.nextCommand).toContain(`--raw-root ${output}`);
  });
});
