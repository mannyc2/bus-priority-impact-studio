import { describe, expect, test } from "bun:test";
import { decodeStrict } from "@bp/domain/decode";
import { RouteScorecardSchema } from "@bp/domain/routes";
import {
  deserializeRouteScorecard,
  serializeRouteScorecard,
  serializeRouteScorecardCitations,
} from "../src/d1/index.js";

const scorecard = decodeStrict(RouteScorecardSchema)({
  schemaVersion: 1,
  routeId: "M1",
  month: "2026-01",
  routeScore: 80,
  coverageStatus: "full",
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
    const citations = serializeRouteScorecardCitations(scorecard);
    const parsed = deserializeRouteScorecard(row, citations);

    expect(parsed).toEqual(scorecard);
  });

  test("rejects missing citation child rows at the repository boundary", () => {
    const row = serializeRouteScorecard(scorecard);

    expect(() => deserializeRouteScorecard(row, [])).toThrow();
  });
});
