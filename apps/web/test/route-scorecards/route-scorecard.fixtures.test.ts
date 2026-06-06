import { describe, expect, test } from "bun:test";
import { RouteScorecardSchema } from "@bp/domain/routes";
import { routeScorecardFixtures } from "../../src/fixtures/route-scorecards.js";

describe("route scorecard fixtures", () => {
  test("fixtures stay aligned with the public route scorecard contract", () => {
    for (const scorecard of routeScorecardFixtures) {
      expect(RouteScorecardSchema.parse(scorecard)).toEqual(scorecard);
    }
  });
});
