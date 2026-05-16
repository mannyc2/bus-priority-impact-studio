import { describe, expect, test } from "bun:test";
import { parseRouteSliceCliArgs } from "../src/jobs/ingest/route-slice.js";

describe("route slice CLI", () => {
  test("parses CLI route and month arguments", () => {
    expect(parseRouteSliceCliArgs(["--route", "m1", "--year", "2026", "--month", "3"])).toEqual({
      routeId: "m1",
      year: 2026,
      month: 3,
    });
  });
});
