import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { RouteScorecardSchema } from "@bp/domain";
import { buildM1RouteBriefInputFromCli } from "../src/jobs/build/m1-route-brief-input.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const routeId = "T1";
const isoMonth = "2026-03";
const sliceKey = `${routeId.toLowerCase()}-${isoMonth}`;
const artifactDir = fromRepoRoot(join("data/artifacts/route-slices", sliceKey));

async function removeFixtureArtifacts(): Promise<void> {
  await rm(artifactDir, { force: true, recursive: true });
}

async function writeArtifactFixtures(): Promise<void> {
  await removeFixtureArtifacts();
  await mkdir(artifactDir, { recursive: true });
  await Bun.write(
    join(artifactDir, "summary.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        routeId,
        isoMonth,
        generatedAt: "2026-04-27T12:00:00.000Z",
        routeWeightedAverageSpeedMph: 6,
        observationCount: 20,
        busTripCount: 200,
        ridershipWeighted: true,
        ridershipWindowCount: 2,
        ridershipMatchedObservationCount: 20,
        ridershipExposure: 1000,
        segmentCount: 4,
        hotspotCount: 2,
        topHotspots: [
          {
            segmentId: "T1:2026-03:N:1:A:B",
            direction: "N",
            stopOrder: 1,
            timepointStopName: "A stop",
            nextTimepointStopName: "B stop",
            observationCount: 10,
            busTripCount: 100,
            weightedAverageSpeedMph: 4,
            weightedAverageTravelTimeMinutes: 15,
            averageRoadDistanceMiles: 1,
            slowWindowShare: 0.8,
            speedSeverity: 0.5,
            hotspotScore: 68,
            ridershipExposure: 100,
            riderImpactScore: 79,
          },
          {
            segmentId: "T1:2026-03:N:2:B:C",
            direction: "N",
            stopOrder: 2,
            timepointStopName: "B stop",
            nextTimepointStopName: "C stop",
            observationCount: 10,
            busTripCount: 100,
            weightedAverageSpeedMph: 6,
            weightedAverageTravelTimeMinutes: 10,
            averageRoadDistanceMiles: 1,
            slowWindowShare: 0.4,
            hotspotScore: 42,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  await Bun.write(
    join(artifactDir, "route-scorecard.json"),
    `${JSON.stringify(
      RouteScorecardSchema.parse({
        schemaVersion: 1,
        routeId,
        month: isoMonth,
        routeScore: 40,
        coverageStatus: "full",
        averageSpeedMph: 6,
        hotspotCount: 2,
        citations: [
          {
            sourceId: "fixture.segment_speeds",
            title: "Fixture segment speeds",
            url: "https://example.test/segment-speeds",
            verifiedAt: "2026-04-27T12:00:00.000Z",
          },
        ],
      }),
      null,
      2,
    )}\n`,
  );
  await Bun.write(
    join(artifactDir, "intervention-overlay.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        routeId,
        analysisPeriod: isoMonth,
        generatedAt: "2026-04-27T12:00:00.000Z",
        sources: [
          {
            sourceId: "fixture.ace_routes",
            title: "Fixture ACE routes",
            url: "https://example.test/ace-routes",
            verifiedAt: "2026-04-27T12:00:00.000Z",
          },
        ],
        ace: {
          routeMatched: true,
          routeMatchCount: 1,
          activeDuringAnalysisPeriod: true,
          activePrograms: [],
          futurePrograms: [],
        },
        violations: {
          analysisPeriod: isoMonth,
          routeViolationCount: 12,
          groupedRowCount: 1,
          violationTypeCounts: [],
        },
        caveats: ["ACE route matching is route-level only."],
      },
      null,
      2,
    )}\n`,
  );
  await Bun.write(
    join(artifactDir, "bus-lane-overlay.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        routeId,
        analysisPeriod: isoMonth,
        generatedAt: "2026-04-27T12:00:00.000Z",
        matchedLaneCount: 3,
        matchedStreetCount: 1,
        matchedStreets: ["5 AVENUE"],
        sources: [
          {
            sourceId: "fixture.bus_lanes",
            title: "Fixture bus lanes",
            url: "https://example.test/bus-lanes",
            verifiedAt: "2026-04-27T12:00:00.000Z",
          },
        ],
        caveats: ["Bus-lane overlay is a proximity match."],
      },
      null,
      2,
    )}\n`,
  );
  await Bun.write(
    join(artifactDir, "schedule-comparison.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        routeId,
        analysisPeriod: isoMonth,
        generatedAt: "2026-04-27T12:00:00.000Z",
        scheduleFetchedAt: "2026-04-27T12:00:00.000Z",
        scheduledPairCount: 1,
        hotspotCount: 1,
        matchedHotspotCount: 1,
        hotspotComparisons: [
          {
            segmentId: "T1:2026-03:N:1:A:B",
            scheduledMedianTravelTimeMinutes: 10,
            observedMinusScheduledMinutes: 4,
          },
        ],
        caveats: ["Schedule comparison is fixture-backed."],
      },
      null,
      2,
    )}\n`,
  );
  await Bun.write(
    join(artifactDir, "ridership-profile.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        routeId,
        analysisPeriod: isoMonth,
        generatedAt: "2026-04-27T12:00:00.000Z",
        ridershipWindowCount: 2,
        speedWindowCount: 1,
        totalRidership: 1400,
        totalTransfers: 125,
        peakRidershipWindow: {
          dayOfWeek: "Monday",
          hourOfDay: 8,
          ridership: 1000,
          transfers: 100,
          matchedObservationCount: 2,
          busTripCount: 20,
          weightedAverageSpeedMph: 7.5,
          slowObservationShare: 0.5,
        },
        topRidershipWindows: [
          {
            dayOfWeek: "Monday",
            hourOfDay: 8,
            ridership: 1000,
            transfers: 100,
          },
        ],
        slowCrowdedWindows: [
          {
            dayOfWeek: "Monday",
            hourOfDay: 8,
            ridership: 1000,
            transfers: 100,
            weightedAverageSpeedMph: 7.5,
            slowObservationShare: 0.5,
          },
        ],
        caveats: ["Ridership profile is fixture-backed."],
      },
      null,
      2,
    )}\n`,
  );
  await Bun.write(
    join(artifactDir, "speed-profile.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        routeId,
        analysisPeriod: isoMonth,
        generatedAt: "2026-04-27T12:00:00.000Z",
        slowSpeedThresholdMph: 8,
        observationCount: 20,
        directionProfiles: [
          {
            direction: "N",
            observationCount: 10,
            busTripCount: 100,
            segmentCount: 2,
            weightedAverageSpeedMph: 5,
            weightedAverageTravelTimeMinutes: 12,
            slowObservationShare: 1,
          },
        ],
        daypartProfiles: [
          {
            direction: "N",
            daypart: "AM peak",
            observationCount: 10,
            busTripCount: 100,
            segmentCount: 2,
            weightedAverageSpeedMph: 5,
            weightedAverageTravelTimeMinutes: 12,
            slowObservationShare: 1,
          },
        ],
        slowestDayHourWindows: [
          {
            dayOfWeek: "Monday",
            hourOfDay: 8,
            observationCount: 10,
            busTripCount: 100,
            segmentCount: 2,
            weightedAverageSpeedMph: 5,
            weightedAverageTravelTimeMinutes: 12,
            slowObservationShare: 1,
          },
        ],
        caveats: ["Speed profile is fixture-backed."],
      },
      null,
      2,
    )}\n`,
  );
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("M1 route brief input build", () => {
  test("combines scorecard and hotspot artifacts into deterministic brief input", async () => {
    await writeArtifactFixtures();

    const result = await buildM1RouteBriefInputFromCli([
      "--route",
      routeId,
      "--year",
      "2026",
      "--month",
      "3",
      "--top-segments",
      "1",
    ]);
    const briefInput = await Bun.file(result.briefInputPath).json();

    expect(result).toEqual(
      expect.objectContaining({
        routeId,
        isoMonth,
        topSegmentCount: 1,
      }),
    );
    expect(briefInput.metrics).toEqual(
      expect.objectContaining({
        routeScore: 40,
        averageSpeedMph: 6,
        hotspotCount: 2,
        ridershipWeighted: true,
        totalRidership: 1400,
        totalTransfers: 125,
        scheduledPairCount: 1,
        scheduleMatchedHotspotCount: 1,
      }),
    );
    expect(briefInput.interventionStatus).toEqual(
      expect.objectContaining({
        aceRouteMatched: true,
        aceActiveDuringAnalysisPeriod: true,
        aceRouteMatchCount: 1,
        aceViolationCount: 12,
        aceViolationGroupedRowCount: 1,
        busLaneMatchedLaneCount: 3,
        busLaneMatchedStreetCount: 1,
      }),
    );
    expect(briefInput.interventionStatus.busLaneMatchedStreets).toEqual(["5 AVENUE"]);
    expect(briefInput.ridershipProfile.peakRidershipWindow).toEqual(
      expect.objectContaining({
        dayOfWeek: "Monday",
        hourOfDay: 8,
        ridership: 1000,
      }),
    );
    expect(briefInput.ridershipProfile.slowCrowdedWindows).toHaveLength(1);
    expect(briefInput.speedProfile.directionProfiles).toHaveLength(1);
    expect(briefInput.speedProfile.slowestDayHourWindows[0]).toEqual(
      expect.objectContaining({
        dayOfWeek: "Monday",
        hourOfDay: 8,
        weightedAverageSpeedMph: 5,
      }),
    );
    expect(briefInput.scheduleComparisons).toHaveLength(1);
    expect(briefInput.topSegments).toEqual([
      expect.objectContaining({
        from: "A stop",
        to: "B stop",
        slowWindowPercent: 80,
        riderImpactScore: 79,
      }),
    ]);
    expect(briefInput.caveats).toContain(
      "Route score is a deterministic prioritization heuristic, not an official MTA grade.",
    );
    expect(briefInput.caveats).toContain("ACE route matching is route-level only.");
    expect(briefInput.caveats).toContain("Bus-lane overlay is a proximity match.");
    expect(briefInput.caveats).toContain("Schedule comparison is fixture-backed.");
    expect(briefInput.caveats).toContain("Ridership profile is fixture-backed.");
    expect(briefInput.caveats).toContain("Speed profile is fixture-backed.");
    expect(briefInput.sources).toHaveLength(3);
  });
});
