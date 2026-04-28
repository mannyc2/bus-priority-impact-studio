import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { type LocalCensusTractEquityContext, listCensusTractEquityContext } from "@bp/db/local";
import { ingestEquityContext } from "../src/jobs/ingest/ingest-equity-context.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const rawDir = fromRepoRoot(join("data/raw/test-equity-context"));
const workingDir = fromRepoRoot(join("data/working/test-equity-context"));
const dbPath = join(workingDir, "pipeline.sqlite");

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(rawDir, { force: true, recursive: true }),
    rm(workingDir, { force: true, recursive: true }),
  ]);
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("equity context ingestion", () => {
  test("fetches and summarizes NYC ACS tract context", async () => {
    await removeFixtureArtifacts();

    const result = await ingestEquityContext({
      year: 2024,
      fetchedAt: new Date("2026-04-27T00:00:00.000Z"),
      rawDir,
      workingDir,
      dbPath,
      fetcher: async () =>
        new Response(
          JSON.stringify([
            [
              "NAME",
              "DP05_0001E",
              "DP03_0062E",
              "DP03_0128PE",
              "DP03_0021E",
              "DP03_0021PE",
              "DP04_0045E",
              "DP04_0058E",
              "DP04_0058PE",
              "DP05_0090PE",
              "DP05_0096PE",
              "DP05_0097PE",
              "DP05_0099PE",
              "state",
              "county",
              "tract",
            ],
            [
              "Census Tract 1; Bronx County; New York",
              "1000",
              "50000",
              "20",
              "100",
              "40",
              "400",
              "200",
              "50",
              "55",
              "10",
              "30",
              "5",
              "36",
              "005",
              "000100",
            ],
            [
              "Census Tract 2; Kings County; New York",
              "2000",
              "70000",
              "10",
              "200",
              "30",
              "600",
              "150",
              "25",
              "20",
              "35",
              "25",
              "15",
              "36",
              "047",
              "000200",
            ],
          ]),
          { status: 200 },
        ),
    });
    const working = await Bun.file(result.workingPath).json();
    const summary = await Bun.file(result.summaryPath).json();
    const local = await openLocalPipelineDb(dbPath);
    let rows: LocalCensusTractEquityContext[];
    try {
      rows = await listCensusTractEquityContext(local.db, 2024);
    } finally {
      local.sqlite.close();
    }

    expect(result).toEqual(
      expect.objectContaining({
        acsYear: 2024,
        dbPath,
        tractCount: 2,
        totalPopulation: 3000,
        noVehicleHouseholds: 350,
      }),
    );
    expect(working.rows).toHaveLength(2);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        geoid: "36005000100",
        countyName: "Bronx County",
        noVehicleHouseholds: 200,
      }),
    );
    expect(summary).toEqual(
      expect.objectContaining({
        tractCount: 2,
        totalPopulation: 3000,
        occupiedHousingUnits: 1000,
        noVehicleHouseholdShare: 0.35,
        medianTractMedianHouseholdIncome: 60000,
      }),
    );
    expect(summary.sourceReadiness).toEqual(
      expect.objectContaining({
        demographics: "available",
        jobAccess: "not_ingested_lehd_lodes_or_travel_time_model",
      }),
    );
  });
});
