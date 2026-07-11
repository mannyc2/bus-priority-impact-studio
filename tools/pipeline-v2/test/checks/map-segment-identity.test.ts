import { describe, expect, test } from "bun:test";
import { checkMapSegmentIdentity } from "../../src/checks/check-map-segment-identity.ts";

function fixture() {
  return {
    routeId: "B41",
    month: "2026-03",
    map: {
      features: [
        {
          properties: {
            routeId: "B41",
            month: "2026-03",
            studioSegmentId: "current-a",
            spineSegmentId: "spine-a",
            spineJoinStatus: "matched" as const,
          },
        },
        {
          properties: {
            routeId: "B41",
            month: "2026-03",
            studioSegmentId: "current-b",
            spineSegmentId: "spine-b",
            spineJoinStatus: "matched" as const,
          },
        },
      ],
    },
    detail: {
      route: { routeId: "B41" },
      segments: [
        { id: "current-b", spineSegmentId: "spine-b", spineJoinStatus: "matched" as const },
        { id: "detail-only", spineSegmentId: null, spineJoinStatus: "unmatched" as const },
        { id: "current-a", spineSegmentId: "spine-a", spineJoinStatus: "matched" as const },
      ],
    },
    history: {
      routeId: "B41",
      spineReadiness: "series_ready_with_gaps",
      dimensions: { segments: [{ segmentId: "spine-a" }, { segmentId: "spine-b" }] },
    },
  };
}

describe("map segment identity checker", () => {
  test("passes reordered exact joins and a detail-only unmatched segment", () => {
    const report = checkMapSegmentIdentity(fixture());
    expect(report).toMatchObject({
      status: "pass",
      mapDetailExactMatchCount: 2,
      historyDetailStableMatchCount: 2,
      positionalFallbackUseCount: 0,
    });
  });

  test("fails duplicate current and stable identities", () => {
    const input = fixture();
    const mapFeature = input.map.features[1];
    const detailSegment = input.detail.segments[2];
    if (mapFeature === undefined || detailSegment === undefined) {
      throw new Error("Identity fixture is incomplete.");
    }
    mapFeature.properties.studioSegmentId = "current-a";
    detailSegment.spineSegmentId = "spine-b";
    const report = checkMapSegmentIdentity(input);
    expect(report.status).toBe("fail");
    expect(report.issues).toContain("duplicate_studio_segment_id");
    expect(report.issues).toContain("duplicate_spine_segment_id");
  });
});
