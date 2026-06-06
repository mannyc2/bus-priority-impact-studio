import { describe, expect, test } from "bun:test";
import {
  expressBusCapacityContextPath,
  expressRouteAnalysisAuditPath,
  expressRouteAnalysisPath,
} from "../src/artifacts";
import {
  auditExpressRouteAnalysisArtifact,
  buildExpressBusCapacityContextArtifact,
  buildExpressRouteAnalysisArtifact,
  buildExpressRouteAnalysisAuditArtifact,
  type ExpressBusCapacitySourceRow,
  summarizeExpressRouteSpeedRows,
} from "../src/feature-history";

const capacityRows: ExpressBusCapacitySourceRow[] = [
  {
    weekStartDate: "2023-04-03",
    routeId: "BXM1",
    direction: "NB",
    dayType: "Weekday",
    hourOfDay: 8,
    loadPercentage: 0.2,
    tripsWithApc: 4,
  },
  {
    weekStartDate: "2023-04-10",
    routeId: "BXM1",
    direction: "NB",
    dayType: "Weekday",
    hourOfDay: 8,
    loadPercentage: 0.4,
    tripsWithApc: 6,
  },
  {
    weekStartDate: "2023-04-03",
    routeId: "SIM1C",
    direction: "NB",
    dayType: "Weekday",
    hourOfDay: 7,
    loadPercentage: 0.9,
    tripsWithApc: 10,
  },
];

describe("express route analysis applied-research builders", () => {
  test("builds route-hour capacity context from normalized capacity rows", () => {
    const artifact = buildExpressBusCapacityContextArtifact({
      rows: capacityRows,
      generatedAt: "2026-06-06T00:00:00.000Z",
    });

    expect(artifact.rows).toEqual([
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
  });

  test("aggregates raw speed rows and builds screening-grade load/speed analysis", () => {
    const speedRows = [
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
    ];

    expect(summarizeExpressRouteSpeedRows(speedRows)[0]).toEqual(
      expect.objectContaining({
        routeId: "BXM1",
        averageSpeedMph: 8,
      }),
    );

    const artifact = buildExpressRouteAnalysisArtifact({
      capacityRows,
      speedRows,
      generatedAt: "2026-06-06T00:00:00.000Z",
    });

    expect(artifact.routeSummaries[0]).toEqual(
      expect.objectContaining({
        routeId: "SIM1C",
        highLoadSlowSpeedCandidateCount: 1,
        maxWeightedLoadPercentage: 0.9,
        minAverageSpeedMph: 7,
      }),
    );
    expect(artifact.rows.find((row) => row.routeId === "SIM1C")).toMatchObject({
      screening: {
        loadBand: "very_high",
        speedBand: "slow",
        highLoadSlowSpeedCandidate: true,
      },
    });
    expect(auditExpressRouteAnalysisArtifact(artifact)).toEqual([]);
  });

  test("builds audit artifacts and catches candidate tampering", () => {
    const artifact = buildExpressRouteAnalysisArtifact({
      capacityRows,
      speedRows: [
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
      ],
      generatedAt: "2026-06-06T00:00:00.000Z",
    });
    const audit = buildExpressRouteAnalysisAuditArtifact({
      artifact,
      inputPath: "data/artifacts/express-route-analysis/load-speed-context-2023-04-2023-09.json",
      generatedAt: "2026-06-06T00:01:00.000Z",
    });

    expect(audit).toMatchObject({
      status: "warn",
      warningCount: 1,
      candidateWindowCount: 1,
    });

    const tampered = structuredClone(artifact);
    const candidate = tampered.rows.find((row) => row.screening.highLoadSlowSpeedCandidate);
    if (candidate === undefined) throw new Error("fixture should include a candidate");
    candidate.screening.highLoadSlowSpeedCandidate = false;

    expect(auditExpressRouteAnalysisArtifact(tampered)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "candidate_flag_mismatch" })]),
    );
  });

  test("owns express route analysis artifact paths", () => {
    expect(expressBusCapacityContextPath({ artifactRoot: "data/artifacts" })).toBe(
      "data/artifacts/express-bus-capacity/route-hour-summary-2023-04-2023-09.json",
    );
    expect(expressRouteAnalysisPath({ artifactRoot: "data/artifacts" })).toBe(
      "data/artifacts/express-route-analysis/load-speed-context-2023-04-2023-09.json",
    );
    expect(expressRouteAnalysisAuditPath({ artifactRoot: "data/artifacts" })).toBe(
      "data/artifacts/express-route-analysis/audit-2023-04-2023-09.json",
    );
  });
});
