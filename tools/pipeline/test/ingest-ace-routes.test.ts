import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { listAceRoutesForRoute } from "@bp/db/local";
import { ingestAceRoutes } from "../src/jobs/ingest/ingest-ace-routes.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const rawDir = fromRepoRoot(join("data/raw/interventions"));
const dbPath = fromRepoRoot(join("data/working/test-ace-routes/pipeline.sqlite"));

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([rm(rawDir, { force: true, recursive: true }), rm(dbPath, { force: true })]);
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("ACE route ingestion", () => {
  test("fetches and normalizes ACE route implementation rows", async () => {
    await removeFixtureArtifacts();

    const result = await ingestAceRoutes({
      fetchedAt: new Date("2026-04-27T12:00:00.000Z"),
      dbPath,
      fetcher: async () =>
        Response.json([
          {
            route: "M1",
            program: "ACE",
            implementation_date: "2024-06-20T00:00:00.000",
          },
          {
            route: "M14+",
            program: "ABLE",
            implementation_date: "2019-10-07T00:00:00.000",
          },
        ]),
    });
    const local = await openLocalPipelineDb(dbPath);
    const [m1Routes, m14Routes] = await Promise.all([
      listAceRoutesForRoute(local.db, "M1"),
      listAceRoutesForRoute(local.db, "M14+"),
    ]);
    local.sqlite.close();

    expect(result).toEqual(
      expect.objectContaining({
        routeCount: 2,
        aceCount: 1,
        ableCount: 1,
      }),
    );
    expect([...m1Routes, ...m14Routes]).toEqual([
      {
        routeId: "M1",
        program: "ACE",
        implementationDate: "2024-06-20T00:00:00.000Z",
      },
      {
        routeId: "M14+",
        program: "ABLE",
        implementationDate: "2019-10-07T00:00:00.000Z",
      },
    ]);
  });
});
