import { describe, expect, test } from "bun:test";
import {
  whereWhenSegmentBadge,
  whereWhenSummary,
} from "../../src/components/route/where-when-summary";
import type { RouteDossierSummaryForDetail } from "../../src/studio/api-contract";

const dossier = {
  artifactKind: "studio_route_dossier_summary",
  schemaVersion: 1,
  generatedAt: "2026-06-12T00:00:00.000Z",
  routeId: "M15+",
  routeSlug: "m15-sbs",
  releaseMonth: "2026-03",
  dataAsOf: "2026-03",
  speed: {
    current: 5.75,
    movement6mPct: -8.2,
    peerPercentile: 12,
    dataAsOf: "2026-03",
    sparkline: [
      { month: "2026-01", value: 6.2 },
      { month: "2026-02", value: null },
      { month: "2026-03", value: 5.75 },
    ],
  },
  ridership: {
    current: 57000,
    movement6mPct: 1.1,
    peerPercentile: 90,
    dataAsOf: "2026-03",
    sparkline: [],
  },
  worstSegment: {
    segmentId: "M15+:2026-03:N:19:100:200",
    direction: "N",
    label: "First Avenue 67 St to 79 St",
    averageSpeedMph: 4.8,
    persistenceMonths: 4,
    dataAsOf: "2026-03",
  },
  treatmentPosture: {
    aceActive: true,
    aceSince: "2023-09",
    busLaneMatchedLaneCount: 8,
    latestEvents: [],
    dataAsOf: "2026-03",
  },
} satisfies RouteDossierSummaryForDetail;

describe("whereWhenSummary", () => {
  test("summarizes the dossier speed window and persistent worst segment", () => {
    expect(
      whereWhenSummary({
        route: { weightedAvgSpeed: 6.4 },
        segments: [{ from: "A", to: "B", riderHours: 1200, speedMph: 4.9 }],
        dossier,
      }),
    ).toEqual({
      currentSpeedLabel: "5.8 mph",
      peerLabel: "slower than 88% of local routes",
      movementLabel: "-8.2%",
      movementDetail: "slower over 6 mo",
      movementTone: "bad",
      coverageLabel: "2 months speed history",
      windowLabel: "2026-01 to 2026-03",
      worstSegmentLabel: "First Avenue 67 St to 79 St",
      worstSegmentDetail: "4 months slowest",
      dataAsOf: "2026-03",
      sectionSubtitle: "1 segment with 2 months speed history (2026-01 to 2026-03).",
    });
  });

  test("falls back to current projection labels when no dossier exists", () => {
    expect(
      whereWhenSummary({
        route: { weightedAvgSpeed: 7.123 },
        segments: [
          { from: "Low", to: "Impact", riderHours: 150, speedMph: 4.5 },
          { from: "High", to: "Impact", riderHours: 12345, speedMph: 5.5 },
        ],
        dossier: null,
      }),
    ).toMatchObject({
      currentSpeedLabel: "7.1 mph",
      peerLabel: "no peer ranking yet",
      movementLabel: "n/a",
      movementDetail: "not enough 6-month history",
      movementTone: "neutral",
      coverageLabel: "2 timepoint segments",
      windowLabel: "current projection",
      worstSegmentLabel: "High to Impact",
      worstSegmentDetail: "12.3K rider-hr/day",
      dataAsOf: null,
    });
  });

  test("badges the segment that matches the dossier persistent worst segment", () => {
    expect(
      whereWhenSegmentBadge({
        segment: { id: "M15+:2026-03:N:19:100:200" },
        dossier,
      }),
    ).toBe("4 mo worst");
  });

  test("does not badge unrelated segments", () => {
    expect(
      whereWhenSegmentBadge({
        segment: { id: "M15+:2026-03:S:19:100:200" },
        dossier,
      }),
    ).toBeNull();
  });
});
