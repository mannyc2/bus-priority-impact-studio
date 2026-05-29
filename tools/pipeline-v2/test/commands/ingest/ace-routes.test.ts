import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAceRoutesIngest } from "../../../src/commands/ingest/ace-routes.ts";
import { openLocalPipelineDb } from "../../../src/lib/local-db.ts";

const manifestYaml = `verified_at: 2026-01-01
sources:
  - id: ace_routes
    type: socrata_dataset
    priority: core
    domain: data.ny.gov
    dataset_id: ki2b-sg5y
    url: https://data.ny.gov/x
    api_json: https://data.ny.gov/resource/ki2b-sg5y.json
    columns_json: https://data.ny.gov/api/views/ki2b-sg5y/columns.json
    rows_csv: https://data.ny.gov/api/views/ki2b-sg5y/rows.csv
    purpose: test
    status: active
`;

function fakeFetcher(rows: readonly unknown[]) {
  return async (input: string | URL) => {
    const url = new URL(input);
    const offset = Number(url.searchParams.get("$offset") ?? "0");
    const limit = Number(url.searchParams.get("$limit") ?? "5000");
    const page = rows.slice(offset, offset + limit);
    return new Response(JSON.stringify(page), {
      headers: { "content-type": "application/json" },
    });
  };
}

describe("runAceRoutesIngest", () => {
  it("normalizes Socrata rows, writes snapshot, and replaces the local table", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "ace-routes-"));
    const dbPath = join(tmp, "pipeline.sqlite");
    const snapshotPath = join(tmp, "ace-routes.json");

    const rows = [
      { route: "B41", program: "ABLE", implementation_date: "2024-01-01T00:00:00.000" },
      { route: "M14A", program: "ACE", implementation_date: "2019-10-07T00:00:00.000" },
      { route: "M14A", program: "ABLE", implementation_date: "2024-04-01T00:00:00.000" },
    ];

    const local = await openLocalPipelineDb(dbPath);
    try {
      const result = await runAceRoutesIngest({
        local,
        fetchedAt: new Date("2026-05-27T00:00:00.000Z"),
        fetcher: fakeFetcher(rows),
        manifestText: manifestYaml,
        snapshotPath,
      });

      expect(result.routeCount).toBe(3);
      expect(result.aceCount).toBe(1);
      expect(result.ableCount).toBe(2);
      expect(result.rawPath).toBe(snapshotPath);

      const snapshot = JSON.parse(await Bun.file(snapshotPath).text());
      expect(snapshot.sourceId).toBe("ace_routes");
      expect(snapshot.fetchedAt).toBe("2026-05-27T00:00:00.000Z");
      expect(snapshot.rows).toHaveLength(3);
      expect(snapshot.query).toEqual({ order: "route, implementation_date" });
    } finally {
      local.sqlite.close();
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
