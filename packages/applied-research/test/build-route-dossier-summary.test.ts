import { describe, expect, test } from "bun:test";
import { RouteDossierSummarySchema } from "@bp/domain/studio";
import {
  buildRouteDossierSummaries,
  type RouteDossierInputRow,
  type RouteDossierTrendPoint,
} from "../src/evaluation/build-route-dossier-summary";

function trendMonths(
  months: readonly string[],
  speed: (i: number) => number | null,
  ridership: (i: number) => number | null,
): RouteDossierTrendPoint[] {
  return months.map((month, i) => ({
    month,
    averageSpeedMph: speed(i),
    ridership: ridership(i),
  }));
}

const MONTHS_2025_2026 = [
  "2025-04",
  "2025-05",
  "2025-06",
  "2025-07",
  "2025-08",
  "2025-09",
  "2025-10",
  "2025-11",
  "2025-12",
  "2026-01",
  "2026-02",
  "2026-03",
];

function inputRow(overrides: Partial<RouteDossierInputRow> = {}): RouteDossierInputRow {
  return {
    routeId: "ROUTE",
    routeSlug: "route",
    trend: [],
    worstSegmentByMonth: [],
    treatment: {
      aceActive: false,
      aceSince: null,
      busLaneMatchedLaneCount: 0,
      events: [],
      dataAsOf: null,
    },
    ...overrides,
  };
}

// Three contrast routes: rich (full series, persistent worst segment, treatments) /
// clean (series, no worst segment, no treatments) / sparse (no data at all).
const rich = inputRow({
  routeId: "M15+",
  routeSlug: "m15-sbs",
  trend: trendMonths(
    MONTHS_2025_2026,
    (i) => 8 - i * 0.1, // 8.0 → 6.9: degrading speed
    (i) => 40000 + i * 500,
  ),
  worstSegmentByMonth: [
    { month: "2025-12", segmentId: "seg-other", direction: "NB", label: "23rd–34th", averageSpeedMph: 4.1 },
    { month: "2026-01", segmentId: "seg-1", direction: "NB", label: "14th–23rd", averageSpeedMph: 3.9 },
    { month: "2026-02", segmentId: "seg-1", direction: "NB", label: "14th–23rd", averageSpeedMph: 3.8 },
    { month: "2026-03", segmentId: "seg-1", direction: "NB", label: "14th–23rd", averageSpeedMph: 3.7 },
  ],
  treatment: {
    aceActive: true,
    aceSince: "2024-06",
    busLaneMatchedLaneCount: 5,
    events: [
      { date: "2024-06-01", kind: "ace", label: "ACE enforcement began" },
      { date: "2023-09-15", kind: "bus_lane", label: "Offset bus lane installed" },
      { date: "2024-08-01", kind: "tsp", label: "TSP activated" },
      { date: "2022-01-01", kind: "bus_lane", label: "Curbside lane" },
      { date: "2021-01-01", kind: "other", label: "Stop consolidation" },
      { date: "2020-01-01", kind: "other", label: "Oldest event, capped out" },
    ],
    dataAsOf: "2026-03",
  },
});

const clean = inputRow({
  routeId: "Q1",
  routeSlug: "q1",
  trend: trendMonths(
    MONTHS_2025_2026,
    (i) => 10 + i * 0.05,
    () => null,
  ),
  treatment: {
    aceActive: false,
    aceSince: null,
    busLaneMatchedLaneCount: 0,
    events: [],
    dataAsOf: "2026-03",
  },
});

const sparse = inputRow({ routeId: "BX99", routeSlug: "bx99" });

describe("buildRouteDossierSummaries", () => {
  const summaries = buildRouteDossierSummaries({
    generatedAt: "2026-06-10T00:00:00.000Z",
    releaseMonth: "2026-03",
    rows: [rich, clean, sparse],
  });
  const bySlug = new Map(summaries.map((summary) => [summary.routeSlug, summary]));

  test("every summary satisfies the authoritative domain schema", () => {
    for (const summary of summaries) {
      expect(() => RouteDossierSummarySchema.parse(summary)).not.toThrow();
    }
  });

  test("rich route: series, movement, persistence, treatment posture", () => {
    const summary = bySlug.get("m15-sbs");
    expect(summary).toBeDefined();
    if (summary === undefined) throw new Error("expected summary");

    expect(summary.speed.current).toBeCloseTo(6.9, 5);
    expect(summary.speed.dataAsOf).toBe("2026-03");
    // 6 months earlier (2025-09): 8 - 5*0.1 = 7.5 → (6.9-7.5)/7.5
    expect(summary.speed.movement6mPct).toBeCloseTo(-8, 0);
    expect(summary.speed.sparkline).toHaveLength(12);
    expect(summary.speed.sparkline[0]).toEqual({ month: "2025-04", value: 8 });
    expect(summary.ridership.current).toBe(45500);

    // Worst segment held for 3 consecutive trailing months (2026-01..03); the
    // different December segment breaks the streak.
    expect(summary.worstSegment).toEqual({
      segmentId: "seg-1",
      direction: "NB",
      label: "14th–23rd",
      averageSpeedMph: 3.7,
      persistenceMonths: 3,
      dataAsOf: "2026-03",
    });

    expect(summary.treatmentPosture.aceActive).toBe(true);
    expect(summary.treatmentPosture.latestEvents).toHaveLength(5);
    expect(summary.treatmentPosture.latestEvents[0]?.date).toBe("2024-08-01");
    expect(summary.dataAsOf).toBe("2026-03");
  });

  test("peer percentiles rank currents across the row set", () => {
    const richSummary = bySlug.get("m15-sbs");
    const cleanSummary = bySlug.get("q1");
    // Speed currents: m15-sbs=6.9, q1=10.55 → m15 below q1.
    expect(richSummary?.speed.peerPercentile).toBe(0);
    expect(cleanSummary?.speed.peerPercentile).toBe(50);
    // Only one route has ridership → unranked.
    expect(richSummary?.ridership.peerPercentile).toBeNull();
  });

  test("clean route: null ridership stays null without inventing movement", () => {
    const summary = bySlug.get("q1");
    expect(summary?.ridership.current).toBeNull();
    expect(summary?.ridership.movement6mPct).toBeNull();
    expect(summary?.ridership.dataAsOf).toBeNull();
    expect(summary?.worstSegment).toBeNull();
  });

  test("sparse route: honest empty dossier", () => {
    const summary = bySlug.get("bx99");
    expect(summary?.speed.current).toBeNull();
    expect(summary?.speed.sparkline).toEqual([]);
    expect(summary?.worstSegment).toBeNull();
    expect(summary?.dataAsOf).toBeNull();
  });

  test("sparkline caps at 36 monthly points, keeping the newest", () => {
    const months: string[] = [];
    for (let year = 2023; year <= 2026; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        if (year === 2026 && month > 3) break;
        months.push(`${year}-${String(month).padStart(2, "0")}`);
      }
    }
    const [summary] = buildRouteDossierSummaries({
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      rows: [
        inputRow({
          trend: trendMonths(months, () => 7, () => null),
        }),
      ],
    });
    expect(summary?.speed.sparkline).toHaveLength(36);
    expect(summary?.speed.sparkline[0]?.month).toBe("2023-04");
    expect(summary?.speed.sparkline[35]?.month).toBe("2026-03");
    expect(() => RouteDossierSummarySchema.parse(summary)).not.toThrow();
  });
});
