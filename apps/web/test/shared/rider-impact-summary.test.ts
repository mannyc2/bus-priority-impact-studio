import { describe, expect, test } from "bun:test";
import {
  riderImpactInsightRows,
  riderImpactSummary,
} from "../../src/components/route/rider-impact-summary";
import type {
  RouteDossierSummaryForDetail,
  RouteSurfaceCapability,
  StudioRouteInsight,
} from "../../src/studio/api-contract";

const ridershipCapability = {
  state: "ready",
  reason: "Ridership history is available.",
  depth: { monthsCovered: 4, grains: ["route_month"] },
  dataAsOf: "2026-03",
  freshness: "current",
} satisfies RouteSurfaceCapability;

const dossier = {
  artifactKind: "studio_route_dossier_summary",
  schemaVersion: 1,
  generatedAt: "2026-06-12T00:00:00.000Z",
  routeId: "B41",
  routeSlug: "b41",
  releaseMonth: "2026-03",
  dataAsOf: "2026-03",
  speed: {
    current: 5.8,
    movement6mPct: -4.2,
    peerPercentile: 15,
    dataAsOf: "2026-03",
    sparkline: [],
  },
  ridership: {
    current: 900000,
    movement6mPct: 3.2,
    peerPercentile: 88,
    dataAsOf: "2026-03",
    sparkline: [
      { month: "2025-10", value: 830000 },
      { month: "2025-11", value: null },
      { month: "2026-01", value: 880000 },
      { month: "2026-03", value: 900000 },
    ],
  },
  worstSegment: null,
  treatmentPosture: {
    aceActive: false,
    aceSince: null,
    busLaneMatchedLaneCount: 0,
    latestEvents: [],
    dataAsOf: "2026-03",
  },
} satisfies RouteDossierSummaryForDetail;

describe("riderImpactSummary", () => {
  test("summarizes rider burden with dossier ridership history", () => {
    expect(
      riderImpactSummary({
        route: {
          dailyRiders: 30000,
          ridersYoyPct: -2.4,
          riderHoursLost: 6200,
        },
        segments: [
          { id: "low", from: "A", to: "B", riderHours: 400, flagged: false },
          { id: "top", from: "Flatbush Av", to: "Church Av", riderHours: 3100, flagged: true },
        ],
        dossier,
        capability: ridershipCapability,
      }),
    ).toMatchObject({
      kpiValue: "30.0K",
      kpiSub: "6.2K rider-hours lost/day",
      kpiTone: "bad",
      dailyRidersLabel: "30.0K",
      dailyRidersDetail: "+3.2% over 6 months in the dossier ridership series",
      burdenLabel: "6.2K",
      historyLabel: "3 months",
      historyDetail: "2025-10 to 2026-03",
      topSegmentLabel: "3.1K",
      topSegmentDetail: "Flatbush Av to Church Av",
      topSegmentShareLabel: "50% of route burden",
      dataAsOf: "2026-03",
    });
  });

  test("falls back to current projection wording without dossier history", () => {
    expect(
      riderImpactSummary({
        route: {
          dailyRiders: 980,
          ridersYoyPct: 1.2,
          riderHoursLost: 0,
        },
        dossier: null,
        capability: {
          ...ridershipCapability,
          reason: "Monthly ridership history has not been built for this route.",
        },
      }),
    ).toMatchObject({
      kpiValue: "980",
      kpiSub: "+1.2% rider trend",
      kpiTone: "ink",
      historyLabel: "current",
      historyDetail: "Monthly ridership history has not been built for this route.",
      topSegmentLabel: "n/a",
      topSegmentDetail: "no segment data",
      dataAsOf: "2026-03",
    });
  });

  test("does not compute impossible top-segment shares", () => {
    expect(
      riderImpactSummary({
        route: {
          dailyRiders: 12000,
          ridersYoyPct: 0,
          riderHoursLost: 1000,
        },
        segments: [{ id: "top", from: "A", to: "B", riderHours: 4200, flagged: true }],
        dossier: null,
        capability: ridershipCapability,
      }).topSegmentShareLabel,
    ).toBe("route-leading segment");
  });
});

describe("riderImpactInsightRows", () => {
  const base = {
    routeId: "B41",
    kind: "customer_journey",
    placement: "overview",
    title: "Customer journey shortfall",
    shortText: "Rider-weighted evidence points to a route-level burden.",
    severity: "medium",
    detectorId: "customer_journey_shortfall",
    refs: [],
  } satisfies StudioRouteInsight;

  test("keeps customer journey and rider-titled rows without pulling generic speed rows", () => {
    const rows = riderImpactInsightRows([
      base,
      { ...base, kind: "performance_annotation", title: "Rider delay context" },
      { ...base, detectorId: "speed_pace_hotspot", title: "Customer impact context" },
      { ...base, detectorId: "speed_pace_hotspot", title: "Speed context" },
    ]);

    expect(rows.map((row) => row.title)).toEqual([
      "Customer journey shortfall",
      "Rider delay context",
      "Customer impact context",
    ]);
  });
});
