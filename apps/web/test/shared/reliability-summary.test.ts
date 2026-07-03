import { describe, expect, test } from "bun:test";
import {
  reliabilityInsightRows,
  reliabilitySummary,
} from "../../src/components/route/reliability-summary";
import type {
  RouteSurfaceCapability,
  StudioRoute,
  StudioRouteInsight,
} from "../../src/studio/api-contract";

const building = {
  state: "building",
  reason: "Reliability detector output is still being prepared.",
  depth: null,
  dataAsOf: "2026-03",
  freshness: "current",
} satisfies RouteSurfaceCapability;

const observed = {
  month: "2026-03",
  runId: "bus-observatory-2026-03",
  source: "third_party_recovered",
  releaseLayer: "observed_release",
  reliabilityStatus: "observed",
  sampleCount: 5848,
  medianObservedHeadwayMinutes: 7.25,
  p90ObservedHeadwayMinutes: 19.9,
  observedBunchingShare: 0.121,
  observedLongGapShare: 0.314,
  excessWaitMinutes: 6.72,
  caveats: ["Recovered GTFS-RT evidence has separate provenance."],
} satisfies NonNullable<StudioRoute["observedReliability"]>;

describe("reliabilitySummary", () => {
  test("labels missing observed rows as manifest-gated building work", () => {
    expect(reliabilitySummary({ observed: null, capability: building })).toMatchObject({
      kpiValue: "Building",
      kpiSub: "Reliability detector output is still being prepared.",
      statusLabel: "building",
      sampleLabel: "n/a",
      dataAsOf: "2026-03",
      hasObservedMetrics: false,
    });
  });

  test("summarizes observed reliability without claiming an official grade", () => {
    expect(reliabilitySummary({ observed, capability: null })).toMatchObject({
      kpiValue: "6.7 min",
      kpiSub: "31% long gaps · 5,848 samples",
      kpiTone: "bad",
      statusLabel: "Published",
      sampleLabel: "5,848",
      sampleDetail: "2026-03 · third-party recovered GTFS-RT",
      medianHeadwayLabel: "7.3 min",
      p90HeadwayLabel: "19.9 min",
      bunchingLabel: "12%",
      longGapLabel: "31%",
      excessWaitLabel: "6.7 min",
      caveat: "Recovered GTFS-RT evidence has separate provenance.",
      hasObservedMetrics: true,
    });
  });

  test("keeps insufficient-sample rows factual", () => {
    expect(
      reliabilitySummary({
        observed: {
          ...observed,
          reliabilityStatus: "insufficient_gtfs_rt_samples",
          sampleCount: 42,
          medianObservedHeadwayMinutes: null,
          p90ObservedHeadwayMinutes: null,
          observedBunchingShare: null,
          observedLongGapShare: null,
          excessWaitMinutes: null,
        },
        capability: null,
      }),
    ).toMatchObject({
      kpiValue: "Low sample",
      kpiSub: "42 samples; headway stats withheld",
      statusLabel: "Insufficient samples",
      medianHeadwayLabel: "n/a",
      longGapLabel: "n/a",
      hasObservedMetrics: false,
    });
  });
});

describe("reliabilityInsightRows", () => {
  const base = {
    routeId: "BX41",
    kind: "performance_annotation",
    placement: "overview",
    title: "Observed reliability risk",
    shortText: "Observed headway data shows elevated long-gap risk.",
    severity: "high",
    detectorId: "observed_reliability",
    refs: [],
  } satisfies StudioRouteInsight;

  test("uses shared severity and month order for reliability cards", () => {
    const rows = reliabilityInsightRows([
      { ...base, severity: "medium", asOfMonth: "2026-01" },
      {
        ...base,
        detectorId: "headway_reliability_ewt",
        title: "Wait reliability context",
        severity: "medium",
        asOfMonth: "2026-03",
      },
      {
        ...base,
        detectorId: "bunching_hotspots",
        title: "Bunching reliability context",
        severity: "high",
        asOfMonth: "2025-12",
      },
      {
        ...base,
        detectorId: "speed_pace",
        title: "Reliability context from title",
        severity: "low",
        asOfMonth: "2026-04",
      },
      { ...base, detectorId: "speed_pace", title: "Speed context" },
    ]);

    expect(rows.map((row) => row.title)).toEqual([
      "Bunching reliability context",
      "Wait reliability context",
      "Observed reliability risk",
    ]);
  });
});
