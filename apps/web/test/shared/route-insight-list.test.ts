import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RouteInsightList } from "../../src/components/route/RouteInsightList";
import type {
  RouteSurfaceCapability,
  StudioRouteCapability,
  StudioRouteInsight,
} from "../../src/studio/api-contract";

const baseInsight = {
  routeId: "M15+",
  kind: "performance_annotation",
  placement: "overview",
  title: "Base insight",
  shortText: "A public detector finding for this route.",
  severity: "low",
  detectorId: "speed_pace_hotspot",
  refs: [],
} satisfies StudioRouteInsight;

const readySurface = {
  state: "ready",
  reason: null,
  depth: { monthsCovered: 6, grains: ["route_month"] },
  dataAsOf: "2026-03",
  freshness: "current",
} satisfies RouteSurfaceCapability;

const cleanCapability = {
  overallState: "ready",
  surfaces: {
    speedHistory: { ...readySurface, state: "checked_clean" },
    ridership: readySurface,
  },
  caveats: [],
} satisfies StudioRouteCapability;

function insight(input: Partial<StudioRouteInsight>): StudioRouteInsight {
  return { ...baseInsight, ...input };
}

describe("RouteInsightList", () => {
  test("orders findings by severity and caps the ranked list at five", () => {
    const markup = renderToStaticMarkup(
      createElement(RouteInsightList, {
        insights: [
          insight({ title: "Low", severity: "low", detectorId: "a-low-signal" }),
          insight({ title: "High", severity: "high", detectorId: "reliability" }),
          insight({
            title: "Medium",
            severity: "medium",
            detectorId: "rider_weighted_excess_wait",
          }),
          insight({ title: "Extra one", severity: "low", detectorId: "extra-1" }),
          insight({ title: "Extra two", severity: "low", detectorId: "extra-2" }),
          insight({ title: "Extra three", severity: "low", detectorId: "extra-3" }),
        ],
        capability: cleanCapability,
        onNavigate: () => undefined,
      }),
    );

    expect(markup).toContain("5 ranked findings");
    expect(markup).toContain("1 more in sections");
    expect(markup.indexOf("High")).toBeLessThan(markup.indexOf("Medium"));
    expect(markup.indexOf("Medium")).toBeLessThan(markup.indexOf("Low"));
    expect(markup).toContain("01");
    expect(markup).toContain("05");
    expect(markup).not.toContain("Extra three");
  });

  test("routes map-segment findings to where-when links", () => {
    const markup = renderToStaticMarkup(
      createElement(RouteInsightList, {
        insights: [
          insight({
            title: "Segment target",
            kind: "map_segment",
            placement: "map_segment",
            severity: "high",
          }),
        ],
        capability: cleanCapability,
        onNavigate: () => undefined,
      }),
    );

    expect(markup).toContain("Slow segments →");
  });

  test("renders a clean card only when capability surfaces show checked-clean evidence", () => {
    const cleanMarkup = renderToStaticMarkup(
      createElement(RouteInsightList, {
        insights: [],
        capability: cleanCapability,
        onNavigate: () => undefined,
      }),
    );
    const unavailableMarkup = renderToStaticMarkup(
      createElement(RouteInsightList, {
        insights: [],
        capability: {
          overallState: "building",
          surfaces: {
            speedHistory: { ...readySurface, state: "building", reason: "Still building." },
          },
          caveats: [],
        },
        onNavigate: () => undefined,
      }),
    );

    expect(cleanMarkup).toContain("No flags raised");
    expect(cleanMarkup).toContain("No detector flags raised for this route");
    expect(unavailableMarkup).toBe("");
  });
});
