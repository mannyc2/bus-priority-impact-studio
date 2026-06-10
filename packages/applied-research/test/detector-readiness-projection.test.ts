import { describe, expect, test } from "bun:test";
import {
  detectorScopeIdentityKey,
  emptyDetectorReadinessBucketCounts,
  sortedDetectorBucketRecord,
} from "../src/evaluation/detector-readiness-projection";

describe("detector readiness projection helpers", () => {
  test("builds stable detector/scope identity keys", () => {
    expect(
      detectorScopeIdentityKey({
        detectorId: "customer_journey_shortfall",
        scopeId: "B41:2026-04:Peak:LCL/LTD",
      }),
    ).toBe("customer_journey_shortfall\0B41:2026-04:Peak:LCL/LTD");
  });

  test("starts every readiness bucket at zero and sorts detector records", () => {
    const counts = emptyDetectorReadinessBucketCounts();
    counts.review_queue += 1;
    const sorted = sortedDetectorBucketRecord(
      new Map([
        ["z_detector", counts],
        ["a_detector", emptyDetectorReadinessBucketCounts()],
      ]),
    );

    expect(counts).toEqual({
      public_finding_candidate: 0,
      route_context: 0,
      review_queue: 1,
      suppressed: 0,
    });
    expect(Object.keys(sorted)).toEqual(["a_detector", "z_detector"]);
  });
});
