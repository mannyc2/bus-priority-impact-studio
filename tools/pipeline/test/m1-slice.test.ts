import { describe, expect, test } from "bun:test";
import { parseM1SliceCliArgs } from "../src/jobs/ingest/m1-slice.js";

describe("M1 route slice CLI", () => {
  test("parses CLI route and month arguments", () => {
    expect(parseM1SliceCliArgs(["--route", "m1", "--year", "2026", "--month", "3"])).toEqual({
      routeId: "m1",
      year: 2026,
      month: 3,
    });
  });
});
