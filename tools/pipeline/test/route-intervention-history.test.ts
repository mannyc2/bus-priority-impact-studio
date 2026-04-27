import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildRouteInterventionHistory } from "../src/jobs/build/route-intervention-history.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const isoMonth = "2026-11";
const batchDir = fromRepoRoot(join("data/artifacts/route-batches", isoMonth));
const routeDir = fromRepoRoot(join("data/artifacts/route-slices/t1-2026-11"));

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(batchDir, { force: true, recursive: true }),
    rm(routeDir, { force: true, recursive: true }),
  ]);
}

async function writeFixtureArtifacts(): Promise<void> {
  await removeFixtureArtifacts();
  await mkdir(batchDir, { recursive: true });
  await mkdir(routeDir, { recursive: true });
  await Bun.write(
    join(batchDir, "batch-summary.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        analysisPeriod: isoMonth,
        routes: [{ routeId: "T1", isoMonth }],
      },
      null,
      2,
    )}\n`,
  );
  await Bun.write(
    join(routeDir, "intervention-overlay.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        routeId: "T1",
        analysisPeriod: isoMonth,
        ace: {
          routeMatched: true,
          routeMatchCount: 1,
          activeDuringAnalysisPeriod: true,
          activePrograms: [
            {
              schemaVersion: 1,
              routeId: "T1",
              program: "ACE",
              implementationDate: "2025-01-15T00:00:00.000Z",
            },
          ],
          futurePrograms: [],
        },
        violations: {
          routeViolationCount: 42,
          groupedRowCount: 2,
        },
      },
      null,
      2,
    )}\n`,
  );
  await Bun.write(
    join(routeDir, "bus-lane-overlay.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        routeId: "T1",
        analysisPeriod: isoMonth,
        matchedLaneCount: 2,
        matchedStreetCount: 1,
        matchedLanes: [
          {
            segmentId: "1",
            street: "MAIN STREET",
            facility: "Main Street",
            laneType: "Curbside",
            laneSubtype: "Bus Lane",
            openDate: "2024-06-01T00:00:00.000",
          },
          {
            segmentId: "2",
            street: "MAIN STREET",
            facility: "Main Street",
            laneType: "Offset",
            laneSubtype: "Bus Lane",
            openDate: null,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("route intervention history", () => {
  test("builds batch-level ACE and bus-lane timeline coverage", async () => {
    await writeFixtureArtifacts();

    const result = await buildRouteInterventionHistory({ year: 2026, month: 11 });
    const history = await Bun.file(result.historyPath).json();
    const summary = await Bun.file(result.summaryPath).json();

    expect(result).toEqual(
      expect.objectContaining({
        routeCount: 1,
        aceMatchedRouteCount: 1,
        busLaneMatchedRouteCount: 1,
      }),
    );
    expect(history.rows[0]).toEqual(
      expect.objectContaining({
        routeId: "T1",
        ace: expect.objectContaining({
          firstImplementationDate: "2025-01-15T00:00:00.000Z",
          activeProgramCount: 1,
        }),
        enforcement: expect.objectContaining({
          aceViolationCount: 42,
        }),
        busLanes: expect.objectContaining({
          matchedLaneCount: 2,
          openDateCount: 1,
          missingOpenDateCount: 1,
          earliestOpenDate: "2024-06-01T00:00:00.000",
        }),
      }),
    );
    expect(summary.sourceReadiness).toEqual(
      expect.objectContaining({
        signalPriority: "not_ingested",
        busLaneOpenDates: "available_where_published",
      }),
    );
  });
});
