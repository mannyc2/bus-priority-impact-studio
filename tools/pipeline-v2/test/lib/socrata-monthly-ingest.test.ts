import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineSocrataMonthlyIngest } from "../../src/lib/socrata-monthly-ingest.ts";

const manifestText = `
verified_at: "2026-06-07T00:00:00.000Z"
sources:
  - id: test_monthly_source
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

function cell(row: Record<string, unknown>, key: string): unknown {
  return row[key];
}

describe("defineSocrataMonthlyIngest", () => {
  test("fetches, normalizes, replaces, and snapshots a monthly Socrata source", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "bp-socrata-monthly-"));
    const replaced: Array<{
      isoMonth: string;
      rows: readonly { routeId: string; month: string }[];
    }> = [];
    try {
      const run = defineSocrataMonthlyIngest<
        { routeId: string; month: string },
        { routeCount: number }
      >({
        sourceId: "test_monthly_source",
        rawDir: "unused",
        rawFilePrefix: "unused",
        queryGrain: "route_id",
        query: ({ year, month }) => ({
          select: "route_id,month",
          where: `month = '${year}-${String(month).padStart(2, "0")}-01T00:00:00'`,
          order: "route_id",
        }),
        normalize: ({ rawRows, isoMonth }) =>
          rawRows
            .map((row) => ({
              routeId: String(cell(row, "route_id") ?? ""),
              month: String(cell(row, "month") ?? "").slice(0, 7),
            }))
            .filter((row) => row.routeId.length > 0 && row.month === isoMonth),
        async replaceRows({ isoMonth, rows }) {
          replaced.push({ isoMonth, rows });
        },
        summarize: ({ rows }) => ({
          routeCount: new Set(rows.map((row) => row.routeId)).size,
        }),
      });

      const result = await run({
        local: {} as never,
        year: 2026,
        month: 3,
        fetchedAt: new Date("2026-06-07T00:00:00.000Z"),
        manifestText,
        snapshotPath: join(tempDir, "snapshot.json"),
        fetcher: async () =>
          new Response(
            JSON.stringify([
              { route_id: "B41", month: "2026-03-01T00:00:00.000" },
              { route_id: "B42", month: "2026-03-01T00:00:00.000" },
              { route_id: "B43", month: "2026-04-01T00:00:00.000" },
            ]),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      });

      expect(result).toEqual({
        rawPath: join(tempDir, "snapshot.json"),
        isoMonth: "2026-03",
        rowCount: 2,
        routeCount: 2,
      });
      expect(replaced).toEqual([
        {
          isoMonth: "2026-03",
          rows: [
            { routeId: "B41", month: "2026-03" },
            { routeId: "B42", month: "2026-03" },
          ],
        },
      ]);
      const snapshot = await Bun.file(join(tempDir, "snapshot.json")).json();
      expect(snapshot).toMatchObject({
        sourceId: "test_monthly_source",
        isoMonth: "2026-03",
        fetchedAt: "2026-06-07T00:00:00.000Z",
        query: { grain: "route_id", month: "2026-03" },
      });
      expect(snapshot.rows).toHaveLength(3);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
