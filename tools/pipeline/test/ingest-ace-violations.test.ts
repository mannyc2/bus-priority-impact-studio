import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { listAceViolationSummariesForRoute } from "@bp/db/local";
import { ingestAceViolationSummary } from "../src/jobs/ingest/ingest-ace-violations.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const rawDir = fromRepoRoot(join("data/raw/interventions"));
const workingDir = fromRepoRoot(join("data/working/interventions"));
const dbPath = fromRepoRoot(join("data/working/test-ace-violations/pipeline.sqlite"));

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(rawDir, { force: true, recursive: true }),
    rm(workingDir, { force: true, recursive: true }),
    rm(dbPath, { force: true }),
  ]);
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("ACE violation summary ingestion", () => {
  test("fetches monthly grouped violation counts", async () => {
    await removeFixtureArtifacts();

    const result = await ingestAceViolationSummary({
      year: 2026,
      month: 3,
      fetchedAt: new Date("2026-04-27T12:00:00.000Z"),
      dbPath,
      fetcher: async () =>
        Response.json([
          {
            bus_route_id: "M15+",
            violation_type: "MOBILE BUS LANE",
            violation_status: "EXEMPT - OTHER",
            violation_count: "12",
          },
          {
            bus_route_id: "B25",
            violation_type: "MOBILE BUS STOP",
            violation_status: "TECHNICAL ISSUE/OTHER",
            violation_count: "5",
          },
        ]),
    });
    const summary = await Bun.file(result.summaryPath).json();
    const local = await openLocalPipelineDb(dbPath);
    const m15Rows = await listAceViolationSummariesForRoute(local.db, "M15+", "2026-03");
    local.sqlite.close();

    expect(result).toEqual(
      expect.objectContaining({
        isoMonth: "2026-03",
        routeCount: 2,
        groupedRowCount: 2,
        violationCount: 17,
      }),
    );
    expect(summary.topRoutes).toEqual([
      { routeId: "M15+", violationCount: 12 },
      { routeId: "B25", violationCount: 5 },
    ]);
    expect(m15Rows).toEqual([
      expect.objectContaining({
        routeId: "M15+",
        month: "2026-03",
        violationCount: 12,
      }),
    ]);
  });
});
