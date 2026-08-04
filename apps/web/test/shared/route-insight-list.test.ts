import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RouteInsightList } from "../../src/components/route/RouteInsightList";
import type { StudioRouteInsight } from "../../src/studio/api-contract";

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
        onNavigate: () => undefined,
      }),
    );

    expect(markup).toContain("What stands out");
    expect(markup).toContain("Top 5 of 6 detector findings.");
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
        onNavigate: () => undefined,
      }),
    );

    expect(markup).toContain("Slow segments →");
  });

  test("renders nothing at all when there are no insights", () => {
    /* The "No flags raised … across N checked surfaces" card was never planned
       or comped and put detector vocabulary on a public face. With findings
       empty citywide it rendered on essentially every route. */
    const markup = renderToStaticMarkup(
      createElement(RouteInsightList, { insights: [], onNavigate: () => undefined }),
    );
    expect(markup).toBe("");
  });
});
