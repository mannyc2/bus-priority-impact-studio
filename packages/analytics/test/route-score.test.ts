import { describe, expect, test } from "bun:test";
import { RouteIdCodec } from "@bp/domain";
import * as z from "zod";
import { calculateRouteScore } from "../src/index.js";

const citation = {
  sourceId: "fixture.mta.bus.segment_speeds",
  title: "Fixture segment-speed source",
  url: "https://example.test/segment-speeds",
  verifiedAt: "2026-04-27T12:00:00Z",
};

describe("route scoring", () => {
  test("produces a validated route scorecard", () => {
    const scorecard = calculateRouteScore({
      routeId: z.decode(RouteIdCodec, "m1"),
      month: "2026-01",
      coverageStatus: "full",
      averageSpeedMph: 9,
      hotspotCount: 2,
      citations: [citation],
    });

    expect(scorecard.routeScore).toBe(65);
    expect(scorecard.coverageStatus).toBe("full");
  });

  test("does not produce impossible scores", () => {
    const scorecard = calculateRouteScore({
      routeId: z.decode(RouteIdCodec, "m1"),
      month: "2026-01",
      coverageStatus: "no_observed_speed",
      averageSpeedMph: 99,
      hotspotCount: 999,
      citations: [citation],
    });

    expect(scorecard.routeScore).toBeGreaterThanOrEqual(0);
    expect(scorecard.routeScore).toBeLessThanOrEqual(100);
    expect(scorecard.coverageStatus).toBe("no_observed_speed");
  });
});
