import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { buildExpressBusCapacityContext } from "../../../src/commands/build/express-bus-capacity-context.ts";
import {
  auditExpressRouteAnalysis,
  buildExpressRouteAnalysis,
} from "../../../src/commands/build/express-route-analysis.ts";
import { ingestExpressBusCapacity } from "../../../src/commands/ingest/express-bus-capacity.ts";
import { fromRepoRoot } from "../../../src/lib/paths.ts";

const manifestText = `verified_at: 2026-05-25
sources:
  - id: mta_express_bus_capacity_2023
    type: socrata_dataset
    priority: optional
    purpose: Express bus capacity context.
    status: active
    domain: data.ny.gov
    dataset_id: 4tpr-3bvc
    url: https://data.ny.gov/d/4tpr-3bvc
    api: soda3
    default_access:
      kind: query
      format: json
    backfill:
      kind: soda3_export
      format: csv
      supportsByteRange: false
  - id: bus_segment_speeds_2023_2024
    type: socrata_dataset
    priority: core
    purpose: Bus segment speeds 2023-2024.
    status: active
    domain: data.ny.gov
    dataset_id: 58t6-89vi
    url: https://data.ny.gov/d/58t6-89vi
    api: soda3
    default_access:
      kind: query
      format: json
    backfill:
      kind: soda3_export
      format: csv
      supportsByteRange: false
`;

const root = fromRepoRoot(join("data/working/test-express-bus-capacity"));
const rawPath = join(root, "raw.json");
const normalizedPath = join(root, "normalized.json");
const summaryPath = join(root, "summary.json");
const analysisPath = join(root, "analysis.json");
const analysisAuditPath = join(root, "analysis-audit.json");
const badAnalysisPath = join(root, "analysis-bad.json");

const fixtureRows = [
  {
    week: "2023-04-03T00:00:00.000",
    day_type: "Weekday",
    borough: "Bronx",
    route: "BXM1",
    direction: "NB",
    hour: "8",
    load_percentage: "0.20",
    trips_with_apc: "4",
  },
  {
    week: "2023-04-10T00:00:00.000",
    day_type: "Weekday",
    borough: "Bronx",
    route: "BXM1",
    direction: "NB",
    hour: "8",
    load_percentage: "0.40",
    trips_with_apc: "6",
  },
  {
    week: "2023-04-03T00:00:00.000",
    day_type: "Weekend",
    borough: "Queens",
    route: "QM2",
    direction: "SB",
    hour: "17",
    load_percentage: "0.75",
    trips_with_apc: "3",
  },
  {
    week: "2023-04-03T00:00:00.000",
    day_type: "Weekday",
    borough: "Staten Island",
    route: "SIM1C",
    direction: "NB",
    hour: "7",
    load_percentage: "0.90",
    trips_with_apc: "10",
  },
];

describe("express bus capacity pipeline artifacts", () => {
  test("keeps express capacity analysis policy in applied-research", () => {
    const contextSource = readFileSync(
      fromRepoRoot("tools/pipeline-v2/src/commands/build/express-bus-capacity-context.ts"),
      "utf8",
    );
    const analysisSource = readFileSync(
      fromRepoRoot("tools/pipeline-v2/src/commands/build/express-route-analysis.ts"),
      "utf8",
    );

    expect(contextSource).toContain('from "@bp/applied-research/feature-history"');
    expect(contextSource).not.toContain("function groupKey");
    expect(contextSource).not.toContain("function roundLoad");
    expect(analysisSource).toContain('from "@bp/applied-research/feature-history"');
    expect(analysisSource).not.toContain("function joinWindows");
    expect(analysisSource).not.toContain("function routeSummaries");
    expect(analysisSource).not.toContain("function auditArtifact");
    expect(analysisSource).not.toContain("const highLoadThreshold");
  });

  test("ingests optional source rows and builds route-hour capacity context", async () => {
    await rm(root, { force: true, recursive: true });

    const ingestResult = await ingestExpressBusCapacity({
      rawPath,
      normalizedPath,
      fetchedAt: new Date("2026-05-25T00:00:00.000Z"),
      fetcher: async () => Response.json(fixtureRows),
      manifestText,
    });

    expect(ingestResult).toEqual({
      rawPath,
      normalizedPath,
      rawRowCount: 4,
      normalizedRowCount: 4,
      routeCount: 3,
    });

    const normalized = await Bun.file(normalizedPath).json();
    expect(normalized.caveat).toContain("Express-only");
    expect(normalized.rows[0]).toEqual(
      expect.objectContaining({ routeId: "BXM1", loadPercentage: 0.2 }),
    );

    const buildResult = await buildExpressBusCapacityContext({
      inputPath: normalizedPath,
      outputPath: summaryPath,
      generatedAt: new Date("2026-05-25T00:00:00.000Z"),
    });

    expect(buildResult).toEqual({
      outputPath: summaryPath,
      rowCount: 4,
      summaryCount: 3,
      routeCount: 3,
    });

    const summary = await Bun.file(summaryPath).json();
    expect(summary.caveats).toContain("Express bus routes only.");
    expect(summary.rows).toEqual([
      {
        routeId: "BXM1",
        direction: "NB",
        dayType: "Weekday",
        hourOfDay: 8,
        weekCount: 2,
        totalTripsWithApc: 10,
        weightedLoadPercentage: 0.32,
        peakLoadPercentage: 0.4,
        lowSample: false,
      },
      {
        routeId: "QM2",
        direction: "SB",
        dayType: "Weekend",
        hourOfDay: 17,
        weekCount: 1,
        totalTripsWithApc: 3,
        weightedLoadPercentage: 0.75,
        peakLoadPercentage: 0.75,
        lowSample: true,
      },
      {
        routeId: "SIM1C",
        direction: "NB",
        dayType: "Weekday",
        hourOfDay: 7,
        weekCount: 1,
        totalTripsWithApc: 10,
        weightedLoadPercentage: 0.9,
        peakLoadPercentage: 0.9,
        lowSample: false,
      },
    ]);

    const analysisResult = await buildExpressRouteAnalysis({
      inputPath: normalizedPath,
      outputPath: analysisPath,
      generatedAt: new Date("2026-05-25T00:00:00.000Z"),
      manifestText,
      fetcher: async () =>
        Response.json([
          {
            route_id: "BXM1",
            year: "2023",
            month: "4",
            direction: "N",
            day_of_week: "Monday",
            hour_of_day: "8",
            observation_count: "5",
            bus_trip_count: "10",
            average_speed_mph: "7",
          },
          {
            route_id: "BXM1",
            year: "2023",
            month: "4",
            direction: "N",
            day_of_week: "Tuesday",
            hour_of_day: "8",
            observation_count: "5",
            bus_trip_count: "10",
            average_speed_mph: "9",
          },
          {
            route_id: "QM2",
            year: "2023",
            month: "4",
            direction: "S",
            day_of_week: "Saturday",
            hour_of_day: "17",
            observation_count: "3",
            bus_trip_count: "3",
            average_speed_mph: "6",
          },
          {
            route_id: "SIM1C",
            year: "2023",
            month: "4",
            direction: "N",
            day_of_week: "Monday",
            hour_of_day: "7",
            observation_count: "5",
            bus_trip_count: "10",
            average_speed_mph: "7",
          },
        ]),
    });

    expect(analysisResult).toEqual({
      outputPath: analysisPath,
      routeCount: 3,
      windowCount: 3,
      matchedSpeedWindowCount: 3,
      candidateWindowCount: 1,
    });

    const analysis = await Bun.file(analysisPath).json();
    expect(analysis.routeSummaries[0]).toEqual(
      expect.objectContaining({
        routeId: "SIM1C",
        highLoadSlowSpeedCandidateCount: 1,
        maxWeightedLoadPercentage: 0.9,
      }),
    );
    expect(analysis.routeSummaries[1]).toEqual(
      expect.objectContaining({
        routeId: "QM2",
        highLoadSlowSpeedCandidateCount: 0,
        maxWeightedLoadPercentage: 0.75,
      }),
    );
    expect(analysis.routeSummaries[2]).toEqual(
      expect.objectContaining({
        routeId: "BXM1",
        highLoadSlowSpeedCandidateCount: 0,
        maxWeightedLoadPercentage: 0.32,
      }),
    );
    expect(analysis.rows[0]).toEqual(
      expect.objectContaining({
        routeId: "BXM1",
        isoMonth: "2023-04",
        direction: "NB",
        dayType: "Weekday",
        hourOfDay: 8,
        speed: expect.objectContaining({ averageSpeedMph: 8 }),
        screening: {
          loadBand: "lower",
          speedBand: "moderate",
          highLoadSlowSpeedCandidate: false,
        },
      }),
    );

    const auditResult = await auditExpressRouteAnalysis({
      inputPath: analysisPath,
      outputPath: analysisAuditPath,
      generatedAt: new Date("2026-05-25T00:00:00.000Z"),
    });
    expect(auditResult).toEqual(
      expect.objectContaining({
        status: "pass",
        errorCount: 0,
        warningCount: 0,
        routeCount: 3,
        windowCount: 3,
        matchedSpeedWindowCount: 3,
        speedMatchShare: 1,
        candidateWindowCount: 1,
        issues: [],
      }),
    );

    const tampered = structuredClone(analysis);
    const candidate = tampered.rows.find(
      (row: { screening?: { highLoadSlowSpeedCandidate?: boolean } }) =>
        row.screening?.highLoadSlowSpeedCandidate === true,
    );
    if (candidate === undefined) {
      throw new Error("Fixture analysis should include a screening candidate.");
    }
    candidate.screening.highLoadSlowSpeedCandidate = false;
    await Bun.write(badAnalysisPath, `${JSON.stringify(tampered, null, 2)}\n`);
    await expect(
      auditExpressRouteAnalysis({
        inputPath: badAnalysisPath,
        outputPath: join(root, "analysis-bad-audit.json"),
        generatedAt: new Date("2026-05-25T00:00:00.000Z"),
      }),
    ).rejects.toThrow("Express route analysis audit failed");
  });
});
