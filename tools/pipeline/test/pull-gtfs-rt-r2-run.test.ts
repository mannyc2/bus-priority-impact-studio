import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  pullGtfsRtR2Run,
  pullGtfsRtR2RunFromCli,
} from "../src/jobs/ops/pull-gtfs-rt-r2-run.js";

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

  test("parses --execute as a boolean CLI flag", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "bp-r2-helper-"));
    const manifestList = join(tempDir, "manifests.txt");
    await writeFile(manifestList, "gtfs-rt/vehicle_positions/run-a/sample.json\n");
    const priorEndpoint = process.env["R2_ENDPOINT"];
    const priorAccessKeyId = process.env["R2_ACCESS_KEY_ID"];
    const priorSecretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];
    delete process.env["R2_ENDPOINT"];
    delete process.env["R2_ACCESS_KEY_ID"];
    delete process.env["R2_SECRET_ACCESS_KEY"];

    try {
      await expect(
        pullGtfsRtR2RunFromCli([
          "--r2",
          "bus-priority-gtfs-rt-raw",
          "--run-id",
          "run-a",
          "--manifest-list",
          manifestList,
          "--execute",
        ]),
      ).rejects.toThrow("Missing R2 endpoint");
    } finally {
      if (priorEndpoint === undefined) delete process.env["R2_ENDPOINT"];
      else process.env["R2_ENDPOINT"] = priorEndpoint;
      if (priorAccessKeyId === undefined) delete process.env["R2_ACCESS_KEY_ID"];
      else process.env["R2_ACCESS_KEY_ID"] = priorAccessKeyId;
      if (priorSecretAccessKey === undefined) delete process.env["R2_SECRET_ACCESS_KEY"];
      else process.env["R2_SECRET_ACCESS_KEY"] = priorSecretAccessKey;
    }
  });
});
