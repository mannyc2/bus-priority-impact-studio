import { describe, expect, test } from "bun:test";
import {
  briefFileMetadata,
  buildObservedReliabilityWindows,
  type CorridorBriefArtifactContext,
  corridorBriefFiles,
  type RouteBriefArtifactContext,
  routeBriefArtifactNames,
  routeBriefFiles,
} from "../src/route-briefs";

function routeContext(): RouteBriefArtifactContext {
  return {
    summary: {
      routeId: "M15",
      month: "2026-03",
      routeScore: 82,
      averageSpeedMph: 6.4,
      hotspotCount: 3,
      totalRidership: 12345,
      totalTransfers: 456,
      publicVisible: true,
      publicVisibilityReason: "standard_route",
      aceActive: true,
      aceViolationCount: 12,
      busLaneMatchedLaneCount: 2,
      scheduleMatchRate: 0.875,
    },
    catalog: {
      routeId: "M15",
      routeShortName: "M15",
      routeLongName: "First and Second Avenues",
      routeTypes: ["local"],
      directions: ["Northbound", "Southbound"],
      shapeCount: 1,
      stopCount: 42,
      timepointStopCount: 12,
      latitudeMin: null,
      latitudeMax: null,
      longitudeMin: null,
      longitudeMax: null,
    },
    hotspots: [
      {
        routeId: "M15",
        isoMonth: "2026-03",
        hotspotRank: 1,
        segmentId: "M15:N:10:401000:401100",
        timepointStopName: "E 14 St",
        nextTimepointStopName: "E 23 St",
        direction: "northbound",
        stopOrder: 10,
        timepointStopId: "401000",
        nextTimepointStopId: "401100",
        observationCount: 80,
        busTripCount: 160,
        weightedAverageSpeedMph: 4.2,
        weightedAverageTravelTimeMinutes: 8,
        averageRoadDistanceMiles: 0.56,
        slowWindowShare: 0.82,
        speedSeverity: 0.9,
        hotspotScore: 91,
        ridershipExposure: 8000,
        transferExposure: 200,
        riderDelayIndex: 75,
        riderImpactShare: 0.8,
        riderWeightedSpeedSeverity: 0.88,
        riderWeightedSlowWindowShare: 0.8,
        riderImpactScore: 88,
      },
    ],
    reliability: null,
    reliabilityCollection: null,
    reliabilityWindows: { topLongGapWindows: [], topBunchingWindows: [] },
    scheduledReliability: null,
    interventions: [],
    generatedAt: "2026-06-06T00:00:00.000Z",
  } as RouteBriefArtifactContext;
}

function corridorContext(): CorridorBriefArtifactContext {
  return {
    corridor: {
      corridorId: "First / Second Ave",
      corridorName: "First / Second Ave",
      corridorKey: "first-second-ave",
      derivationMethod: "route_shape_cluster",
    },
    summary: {
      corridorId: "First / Second Ave",
      month: "2026-03",
      routeCount: 2,
      assignedRouteCount: 2,
      ambiguousRouteCount: 0,
      unassignedRouteCount: 0,
      totalRidership: 20000,
      totalTransfers: 900,
      weightedAverageSpeedMph: 6.1,
      hotspotCount: 4,
      observedReliabilityRouteCount: 1,
      insufficientReliabilityRouteCount: 1,
      interventionComparisonCount: 2,
      evaluatedInterventionComparisonCount: 1,
    },
    members: [
      {
        corridorId: "First / Second Ave",
        month: "2026-03",
        routeId: "M15",
        assignmentStatus: "assigned",
        assignmentReason: "segment_overlap",
        stopCount: 10,
        matchedStopCount: 9,
        hotspotCount: 2,
        matchedSegmentCount: 4,
        segmentEvidenceScore: 0.9,
        totalRidership: 12345,
        averageSpeedMph: 6.4,
      },
    ],
    hotspots: [],
    interventionContext: [],
    generatedAt: "2026-06-06T00:00:00.000Z",
  } as CorridorBriefArtifactContext;
}

describe("route brief artifact files", () => {
  test("builds observed reliability windows from route samples", () => {
    const windows = buildObservedReliabilityWindows({
      reliability: {
        routeId: "M15",
        month: "2026-03",
        runId: "run-1",
        reliabilityStatus: "observed",
        minSampleThreshold: 30,
        sampleCount: 2,
        stopCount: 1,
        directionCount: 1,
        averageObservedHeadwayMinutes: 11,
        medianObservedHeadwayMinutes: 11,
        p90ObservedHeadwayMinutes: 20,
        maxObservedHeadwayMinutes: 20,
        scheduledMedianHeadwayMinutes: 10,
        bunchingThresholdMinutes: 3,
        longGapThresholdMinutes: 15,
        observedBunchingShare: 0.5,
        observedLongGapShare: 0.5,
        expectedWaitMinutes: 9.18,
        scheduledExpectedWaitMinutes: 5,
        excessWaitMinutes: 4.18,
        waitReliabilityRatio: 1.84,
      },
      samples: [
        {
          runId: "run-1",
          sampleRank: 1,
          routeId: "M015",
          sourceRouteId: "M015",
          observedTimestamp: Date.UTC(2026, 2, 2, 14, 0, 0) / 1000,
          directionId: 0,
          stopId: "stop-a",
          previousVehicleKey: "bus-0",
          vehicleKey: "bus-1",
          previousObservedTimestamp: Date.UTC(2026, 2, 2, 13, 58, 0) / 1000,
          headwaySeconds: 120,
          headwayMinutes: 2,
        },
        {
          runId: "run-1",
          sampleRank: 2,
          routeId: "M15",
          sourceRouteId: "M15",
          observedTimestamp: Date.UTC(2026, 2, 2, 14, 5, 0) / 1000,
          directionId: 0,
          stopId: "stop-a",
          previousVehicleKey: "bus-1",
          vehicleKey: "bus-2",
          previousObservedTimestamp: Date.UTC(2026, 2, 2, 13, 45, 0) / 1000,
          headwaySeconds: 1200,
          headwayMinutes: 20,
        },
        {
          runId: "run-1",
          sampleRank: 3,
          routeId: "M15",
          sourceRouteId: "M15",
          observedTimestamp: Date.UTC(2026, 3, 2, 14, 5, 0) / 1000,
          directionId: 0,
          stopId: "stop-a",
          previousVehicleKey: "bus-2",
          vehicleKey: "bus-3",
          previousObservedTimestamp: Date.UTC(2026, 3, 2, 13, 5, 0) / 1000,
          headwaySeconds: 3600,
          headwayMinutes: 60,
        },
      ],
      limit: 1,
    });

    expect(windows.topLongGapWindows).toMatchObject([
      {
        rank: 1,
        directionId: 0,
        stopId: "stop-a",
        sampleCount: 2,
        observedBunchingShare: 0.5,
        observedLongGapShare: 0.5,
      },
    ]);
    expect(windows.topLongGapWindows[0]?.expectedWaitMinutes).toBe(9.18);
    expect(windows.topBunchingWindows[0]?.rank).toBe(1);
  });

  test("renders route brief JSON, Markdown, HTML, and stable metadata", () => {
    const files = routeBriefFiles(routeContext());

    expect(files.map((file) => file.name)).toEqual([...routeBriefArtifactNames]);
    expect(files[0]?.artifactKey).toBe("briefs/routes/m15/2026-03/brief.json");
    expect(files[0]?.content).toContain('"artifactKind": "route_brief"');
    expect(files[1]?.content).toContain("# Route M15: First and Second Avenues");
    expect(files[2]?.content).toContain("<h1>Route M15: First and Second Avenues</h1>");

    const jsonFile = files[0];
    if (jsonFile === undefined) {
      throw new Error("Expected route brief JSON file");
    }
    const metadata = briefFileMetadata(jsonFile);
    expect(metadata.sha256).toHaveLength(64);
    expect(metadata.byteLength).toBe(new TextEncoder().encode(files[0]?.content ?? "").byteLength);
  });

  test("renders corridor brief files with slugged artifact keys", () => {
    const files = corridorBriefFiles(corridorContext());

    expect(files.map((file) => file.name)).toEqual([...routeBriefArtifactNames]);
    expect(files[0]?.artifactKey).toBe("briefs/corridors/first-second-ave/2026-03/brief.json");
    expect(files[0]?.content).toContain('"artifactKind": "corridor_brief"');
    expect(files[1]?.content).toContain("# First / Second Ave Corridor");
  });
});
