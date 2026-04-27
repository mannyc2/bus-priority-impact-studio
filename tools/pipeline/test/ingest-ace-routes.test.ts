import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { ingestAceRoutes } from "../src/jobs/ingest/ingest-ace-routes.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const rawDir = fromRepoRoot(join("data/raw/interventions"));
const workingDir = fromRepoRoot(join("data/working/interventions"));

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(rawDir, { force: true, recursive: true }),
    rm(workingDir, { force: true, recursive: true }),
  ]);
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("ACE route ingestion", () => {
  test("fetches and normalizes ACE route implementation rows", async () => {
    await removeFixtureArtifacts();

    const result = await ingestAceRoutes({
      fetchedAt: new Date("2026-04-27T12:00:00.000Z"),
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
    const working = await Bun.file(result.workingPath).json();
    const summary = await Bun.file(result.summaryPath).json();

    expect(result).toEqual(
      expect.objectContaining({
        routeCount: 2,
        aceCount: 1,
        ableCount: 1,
      }),
    );
    expect(working.rows).toEqual([
      {
        schemaVersion: 1,
        routeId: "M1",
        program: "ACE",
        implementationDate: "2024-06-20T00:00:00.000Z",
      },
      {
        schemaVersion: 1,
        routeId: "M14+",
        program: "ABLE",
        implementationDate: "2019-10-07T00:00:00.000Z",
      },
    ]);
    expect(summary).toEqual(
      expect.objectContaining({
        rowCount: 2,
        routeCount: 2,
        aceCount: 1,
        ableCount: 1,
      }),
    );
  });
});
