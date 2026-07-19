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
    const summary = riderImpactSummary({
      route: {
        dailyRiders: 30000,
        ridersYoyPct: -2.4,
        riderHoursLost: 6200,
      },
      segments: [
        {
          id: "low",
          spineSegmentId: "spine-low",
          from: "A",
          to: "B",
          riderHours: 400,
          flagged: false,
        },
        {
          id: "top",
          spineSegmentId: "spine-top",
          from: "Flatbush Av",
          to: "Church Av",
          riderHours: 3100,
          flagged: true,
        },
      ],
      dossier,
      capability: ridershipCapability,
    });
    expect(summary).toMatchObject({
      dailyRidersLabel: "30.0K",
      dailyRidersDetail: "+3.2% 6 mo ridership trend",
      burdenLabel: "6.2K",
      burdenDetail: "rider-hours lost/day in projection",
      historyLabel: "3 months",
      historyDetail: "2025-10 to 2026-03",
      trendLabel: "+3.2%",
      trendDetail: "6 mo ridership trend",
    });
    expect(summary.topSegment).toMatchObject({
      id: "top",
      from: "Flatbush Av",
      to: "Church Av",
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
      dailyRidersLabel: "980",
      trendLabel: "+1.2%",
      trendDetail: "YoY in current projection",
      burdenDetail: "no rider-hour loss in projection",
      historyLabel: "current",
      historyDetail: "Monthly ridership history has not been built for this route.",
      topSegment: null,
    });
  });

  test("reports absent rider trend and burden without inventing zeroes", () => {
    expect(
      riderImpactSummary({
        route: {
          dailyRiders: 12000,
          ridersYoyPct: null,
          riderHoursLost: null,
        },
        segments: [
          {
            id: "top",
            spineSegmentId: "spine-top",
            from: "A",
            to: "B",
            riderHours: 4200,
            flagged: true,
          },
        ],
        dossier: null,
        capability: ridershipCapability,
      }),
    ).toMatchObject({
      trendLabel: "not measured",
      trendDetail: "trend unavailable",
      dailyRidersDetail: "not measured trend unavailable",
      burdenLabel: "not measured",
      burdenDetail: "rider-hour burden not measured",
    });
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

  test("uses shared severity and month order for rider-impact cards", () => {
    const rows = riderImpactInsightRows([
      { ...base, asOfMonth: "2026-01" },
      {
        ...base,
        kind: "performance_annotation",
        detectorId: "rider_weighted_excess_wait",
        title: "Rider-weighted excess wait",
        severity: "high",
        asOfMonth: "2025-12",
      },
      {
        ...base,
        kind: "performance_annotation",
        title: "Rider delay context",
        asOfMonth: "2026-03",
      },
      {
        ...base,
        detectorId: "speed_pace_hotspot",
        title: "Customer impact context",
        severity: "low",
        asOfMonth: "2026-04",
      },
      { ...base, detectorId: "speed_pace_hotspot", title: "Speed context" },
    ]);

    expect(rows.map((row) => row.title)).toEqual([
      "Rider-weighted excess wait",
      "Rider delay context",
      "Customer journey shortfall",
    ]);
  });
});
