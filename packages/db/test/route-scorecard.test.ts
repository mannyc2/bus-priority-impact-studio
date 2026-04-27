import { describe, expect, test } from "bun:test";
import { RouteIdCodec, RouteScorecardSchema } from "@bp/domain";
import * as z from "zod";
import { deserializeRouteScorecard, serializeRouteScorecard } from "../src/index.js";

const scorecard = RouteScorecardSchema.parse({
  schemaVersion: 1,
  routeId: z.decode(RouteIdCodec, "m1"),
  month: "2026-01",
  routeScore: 80,
  averageSpeedMph: 8.1,
  hotspotCount: 1,
  citations: [
    {
      sourceId: "fixture.mta.bus.segment_speeds",
      title: "Fixture segment-speed source",
      url: "https://example.test/segment-speeds",
      verifiedAt: "2026-04-27T12:00:00Z",
    },
  ],
});

describe("D1 route scorecard read model", () => {
  test("round-trips scorecards through a compact row shape", () => {
    const row = serializeRouteScorecard(scorecard);
    const parsed = deserializeRouteScorecard(row);

    expect(parsed).toEqual(scorecard);
  });

  test("rejects corrupted citation JSON at the repository boundary", () => {
    const row = serializeRouteScorecard(scorecard);

    expect(() => deserializeRouteScorecard({ ...row, citations_json: "not-json" })).toThrow();
  });
});
