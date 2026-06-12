import { describe, expect, test } from "bun:test";
import { routeMapHighlight } from "../../src/components/route/RouteMapSection";
import type { StudioRouteInsight, StudioSegment } from "../../src/studio/api-contract";

function segment(input: Partial<StudioSegment> & Pick<StudioSegment, "id">): StudioSegment {
  const fixture: StudioSegment = {
    id: input.id,
    routeSlug: "m14a-sbs",
    direction: "NB",
    from: "A",
    to: "B",
    speedMph: 6.4,
    scheduledMph: 8.2,
    riderHours: 1200,
    lane: "none",
    ace: false,
    tsp: false,
    hours: [],
  };
  return {
    ...fixture,
    ...input,
    id: input.id,
    routeSlug: input.routeSlug ?? fixture.routeSlug,
  };
}

function insight(input: Partial<StudioRouteInsight> = {}): StudioRouteInsight {
  const fixture: StudioRouteInsight = {
    routeId: "M14A+",
    kind: "map_segment",
    placement: "map_segment",
    title: "Fixture map signal",
    shortText: "Fixture signal.",
    severity: "medium",
    detectorId: "speed_pace_hotspot",
    refs: [],
  };
  return { ...fixture, ...input, routeId: input.routeId ?? fixture.routeId };
}

describe("routeMapHighlight", () => {
  test("uses sorted detector-targeted map segments before generic flagged fallback", () => {
    const result = routeMapHighlight(
      [segment({ id: "flagged", flagged: true }), segment({ id: "target" })],
      [
        insight({ severity: "low", target: { segmentIds: ["flagged"] } }),
        insight({ severity: "high", target: { segmentIds: ["target"] } }),
      ],
    );

    expect(result).toMatchObject({
      signalCount: 2,
      segment: { id: "target" },
    });
  });

  test("falls back to the route flagged segment when map signals do not match", () => {
    const result = routeMapHighlight(
      [segment({ id: "slow", flagged: true }), segment({ id: "other" })],
      [insight({ target: { segmentIds: ["missing"] } })],
    );

    expect(result).toMatchObject({
      signalCount: 1,
      segment: { id: "slow" },
    });
  });

  test("reports no highlight when no signal or flagged segment exists", () => {
    expect(routeMapHighlight([segment({ id: "plain" })], [])).toEqual({
      signalCount: 0,
      segment: null,
    });
  });
});
