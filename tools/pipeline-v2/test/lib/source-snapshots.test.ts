import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { readJsonIfExists } from "../../src/lib/json.ts";
import { writeRawSourceSnapshot } from "../../src/lib/source-snapshots.ts";

describe("source snapshot writer", () => {
  test("writes snapshot payloads through the shared JSON helper", async () => {
    const root = await mkdtemp(join(tmpdir(), "bp-source-snapshot-"));
    try {
      const path = join(root, "snapshots", "source.json");
      await writeRawSourceSnapshot({
        path,
        sourceId: "fixture-source",
        fetchedAt: new Date("2025-01-02T03:04:05.000Z"),
        query: { borough: "MN" },
        rows: [{ id: 1 }],
        extra: { agency: "MTA" },
      });

      await expect(readJsonIfExists(path)).resolves.toEqual({
        schemaVersion: 1,
        sourceId: "fixture-source",
        agency: "MTA",
        fetchedAt: "2025-01-02T03:04:05.000Z",
        query: { borough: "MN" },
        rows: [{ id: 1 }],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("keeps direct filesystem writes out of the source snapshot helper", async () => {
    const source = await readFile(
      resolve(import.meta.dir, "../../src/lib/source-snapshots.ts"),
      "utf8",
    );

    expect(source).toContain("writeJson");
    expect(source).not.toContain("Bun.write");
    expect(source).not.toContain('from "node:fs/promises"');
  });
});
