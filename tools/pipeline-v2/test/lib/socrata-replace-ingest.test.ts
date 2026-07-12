import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineSocrataReplaceIngest } from "../../src/lib/socrata-replace-ingest.ts";

const manifestText = `
verified_at: "2026-07-11T00:00:00.000Z"
sources:
  - id: test_replace_source
    type: socrata_dataset
    priority: secondary
    domain: data.ny.gov
    dataset_id: abcd-1234
    url: https://data.ny.gov/resource/abcd-1234
    api: soda3
    default_access:
      kind: query
      format: json
    purpose: Test source.
    status: active
`;

describe("defineSocrataReplaceIngest", () => {
  test("fetches, normalizes, replaces, and snapshots a full Socrata source", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "bp-socrata-replace-"));
    const replaced: Array<readonly { routeId: string }[]> = [];
    try {
      const run = defineSocrataReplaceIngest({
        sourceId: "test_replace_source",
        rawDir: "unused",
        rawFileName: "unused.json",
        query: { order: "route_id" },
        normalize: (rows) => rows.map((row) => ({ routeId: String(row["route_id"] ?? "") })),
        replaceRows: ({ rows }) => {
          replaced.push(rows);
        },
        summarize: ({ rows }) => ({ routeCount: rows.length }),
      });
      const snapshotPath = join(tempDir, "snapshot.json");

      await expect(
        run({
          local: {} as never,
          fetchedAt: new Date("2026-07-11T00:00:00.000Z"),
          manifestText,
          snapshotPath,
          fetcher: async () => Response.json([{ route_id: "B41" }, { route_id: "M15" }]),
        }),
      ).resolves.toEqual({ rawPath: snapshotPath, routeCount: 2 });
      expect(replaced).toEqual([[{ routeId: "B41" }, { routeId: "M15" }]]);
      await expect(Bun.file(snapshotPath).json()).resolves.toMatchObject({
        sourceId: "test_replace_source",
        fetchedAt: "2026-07-11T00:00:00.000Z",
        query: { order: "route_id" },
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
