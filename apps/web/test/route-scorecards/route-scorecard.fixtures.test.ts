import { describe, expect, test } from "bun:test";
import { RouteScorecardSchema } from "@bp/domain/routes";
import { routeScorecardFixtures } from "../../src/fixtures/route-scorecards.js";
import { decodeSchemaStrict } from "../schema-decode.js";

describe("route scorecard fixtures", () => {
  test("fixtures stay aligned with the public route scorecard contract", () => {
    for (const scorecard of routeScorecardFixtures) {
      expect(() => decodeSchemaStrict(RouteScorecardSchema, scorecard)).not.toThrow();
    }
  });
});
