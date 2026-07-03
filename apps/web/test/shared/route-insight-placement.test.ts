import { describe, expect, test } from "bun:test";
import {
  insightTargetsSegment,
  routeInsightPlacements,
  routeSectionBadges,
  routeSectionForInsight,
  safeInsightCaveats,
} from "../../src/components/route/route-insight-placement";
import type { StudioRouteInsight } from "../../src/studio/api-contract";

function insight(input: Partial<StudioRouteInsight> & Pick<StudioRouteInsight, "placement">) {
  return {
    routeId: "B48",
    kind: "customer_journey",
    title: "Fixture",
    shortText: "Fixture insight.",
    severity: "medium",
    detectorId: "customer_journey_shortfall",
    refs: [],
    ...input,
  } satisfies StudioRouteInsight;
}

describe("route insight placement", () => {
  test("selects top overview insights while preserving section placements", () => {
    const placements = routeInsightPlacements([
      insight({ placement: "overview", severity: "low", scopeId: "low" }),
      insight({ placement: "map_segment", severity: "medium", scopeId: "map" }),
      insight({ placement: "overview", severity: "high", scopeId: "high" }),
      insight({ placement: "chart_annotation", severity: "low", scopeId: "chart" }),
      insight({ placement: "overview", severity: "medium", scopeId: "medium" }),
      insight({ placement: "overview", severity: "medium", scopeId: "medium-2" }),
      insight({ placement: "timeline", severity: "medium", scopeId: "timeline" }),
    ]);

    expect(placements.overview.map((row) => row.scopeId)).toEqual(["high", "map", "medium"]);
    expect(placements.mapSegment.map((row) => row.scopeId)).toEqual(["map"]);
    expect(placements.chartAnnotation.map((row) => row.scopeId)).toEqual(["chart"]);
    expect(placements.timeline.map((row) => row.scopeId)).toEqual(["timeline"]);
  });

  test("filters caveats that still look internal", () => {
    expect(
      safeInsightCaveats({
        caveatsForTooltip: [
          "Wait-time evidence is the main contributor.",
          "Internal caveat: geometry join NOT bad.",
          "fit_status:true_uncovered",
          "review_queue_count",
          "Reviewed as not just a terminal or layover artifact.",
        ],
      }),
    ).toEqual([
      "Wait-time evidence is the main contributor.",
      "Reviewed as not just a terminal or layover artifact.",
    ]);
  });

  test("matches map insights through deterministic segment targets before legacy scope fallback", () => {
    expect(
      insightTargetsSegment(
        insight({
          placement: "map_segment",
          scopeId: "BX12:2026-03:W:19:103999:104235",
          target: {
            segmentIds: ["BX12:2026-03:W:19:103999:104235", "BX12+:2026-03:W:19:103999:104235"],
          },
        }),
        "BX12+:2026-03:W:19:103999:104235",
      ),
    ).toBe(true);

    expect(
      insightTargetsSegment(
        insight({
          placement: "map_segment",
          scopeId: "B48:2026-03:S:19:303861:307169",
        }),
        "B48:2026-03:S:19:303861:307169",
      ),
    ).toBe(true);
  });

  test("routes insights to the section that explains them", () => {
    expect(
      routeSectionForInsight(
        insight({
          kind: "map_segment",
          placement: "map_segment",
          detectorId: "speed_pace_hotspot",
        }),
      ),
    ).toBe("map");
    expect(
      routeSectionForInsight(
        insight({
          kind: "performance_annotation",
          placement: "chart_annotation",
          detectorId: "headway_reliability_ewt",
        }),
      ),
    ).toBe("reliability");
    expect(
      routeSectionForInsight(
        insight({
          kind: "performance_annotation",
          placement: "overview",
          detectorId: "rider_weighted_excess_wait",
        }),
      ),
    ).toBe("riders");
    expect(
      routeSectionForInsight(
        insight({
          kind: "performance_annotation",
          placement: "overview",
          detectorId: "source_gap",
        }),
      ),
    ).toBe("evidence");
    expect(
      routeSectionForInsight(
        insight({
          kind: "treatment_scope",
          placement: "timeline",
          detectorId: "treatment_scope_gap",
        }),
      ),
    ).toBe("treatments");
  });

  test("counts section badges and keeps the strongest severity per section", () => {
    expect(
      routeSectionBadges([
        insight({
          kind: "performance_annotation",
          placement: "chart_annotation",
          detectorId: "speed_pace_hotspot",
          severity: "medium",
        }),
        insight({
          kind: "performance_annotation",
          placement: "overview",
          detectorId: "degradation_trend",
          severity: "high",
        }),
        insight({
          kind: "performance_annotation",
          placement: "chart_annotation",
          detectorId: "headway_reliability_ewt",
          severity: "medium",
        }),
        insight({
          kind: "customer_journey",
          placement: "overview",
          detectorId: "customer_journey_shortfall",
          severity: "low",
        }),
      ]),
    ).toMatchObject({
      "where-when": { count: 2, severity: "high" },
      reliability: { count: 1, severity: "medium" },
      riders: { count: 1, severity: "low" },
    });
  });
});
