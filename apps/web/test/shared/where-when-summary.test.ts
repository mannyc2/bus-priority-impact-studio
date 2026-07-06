import { describe, expect, test } from "bun:test";
import { whereWhenSegmentBadge } from "../../src/components/route/where-when-summary";
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

describe("whereWhenSegmentBadge", () => {
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
