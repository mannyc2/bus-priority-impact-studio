import { describe, expect, test } from "bun:test";
import {
  buildRouteSpeedSpineArtifact,
  buildRouteSpeedSpineCrosswalk,
  classifyRouteSegmentSourceKey,
  matchRouteSpeedSpineSegment,
  type RouteSegmentSourceKey,
  type RouteSpeedSpineArtifact,
  type RouteSpeedSpineSourceRow,
  serializeSourceSegmentId,
  serializeStudioSegmentId,
} from "@bp/analytics/feature-history";

function sourceRow(input: {
  month: string;
  stopOrder: number;
  fromStopId: string | null;
  toStopId: string | null;
}): RouteSpeedSpineSourceRow {
  return {
    route_id: "B41",
    month: input.month,
    direction: "S",
    stop_order: input.stopOrder,
    timepoint_stop_id: input.fromStopId,
    timepoint_stop_name: "From",
    timepoint_stop_latitude: 40.61,
    timepoint_stop_longitude: -73.95,
    next_timepoint_stop_id: input.toStopId,
    next_timepoint_stop_name: "To",
    next_timepoint_stop_latitude: 40.6,
    next_timepoint_stop_longitude: -73.94,
    source_row_count: 10,
    bus_trip_count: 25,
    average_road_speed_mph: 7,
    average_travel_time_minutes: 4,
    average_road_distance_miles: 0.5,
  };
}

function artifact(
  rows: readonly RouteSpeedSpineSourceRow[],
): RouteSpeedSpineArtifact {
  return buildRouteSpeedSpineArtifact({
    routeId: "B41",
    rows,
    generatedAt: "2026-07-11T00:00:00.000Z",
    dbPath: "fixture.sqlite",
    artifactPath: "speed-spine.json",
    startMonth: "2026-02",
    endMonth: "2026-03",
  });
}

function key(input: {
  month: string;
  stopOrder: number;
  fromStopId: string;
  toStopId: string;
}): RouteSegmentSourceKey {
  return {
    routeId: "B41",
    direction: "S",
    ...input,
  };
}

describe("route speed spine source crosswalk", () => {
  test("serializes source and current Studio identities canonically", () => {
    const sourceKey = key({
      month: "2026-03",
      stopOrder: 34,
      fromStopId: "303324",
      toStopId: "901681",
    });

    expect(serializeSourceSegmentId(sourceKey)).toBe("S:34:303324:901681");
    expect(serializeStudioSegmentId(sourceKey)).toBe(
      "B41:2026-03:S:34:303324:901681",
    );
  });

  test("matches exact aliases independent of row order and schedule renumbering", () => {
    const february = key({
      month: "2026-02",
      stopOrder: 32,
      fromStopId: "303324-old",
      toStopId: "901681-old",
    });
    const march = key({
      month: "2026-03",
      stopOrder: 34,
      fromStopId: "303324",
      toStopId: "901681",
    });
    const spine = artifact([
      sourceRow({
        month: march.month,
        stopOrder: march.stopOrder,
        fromStopId: march.fromStopId,
        toStopId: march.toStopId,
      }),
      sourceRow({
        month: february.month,
        stopOrder: february.stopOrder,
        fromStopId: february.fromStopId,
        toStopId: february.toStopId,
      }),
    ]);
    const crosswalk = buildRouteSpeedSpineCrosswalk(spine);
    const spineSegmentId = spine.segments[0]?.segmentId;
    if (spineSegmentId === undefined)
      throw new Error("Fixture spine has no segment.");

    expect(matchRouteSpeedSpineSegment(crosswalk, february)).toEqual({
      status: "matched",
      studioSegmentId: serializeStudioSegmentId(february),
      spineSegmentId,
    });
    expect(matchRouteSpeedSpineSegment(crosswalk, march)).toEqual({
      status: "matched",
      studioSegmentId: serializeStudioSegmentId(march),
      spineSegmentId,
    });
  });

  test("keeps concurrent nearby stop variants on distinct spine segments", () => {
    const first = key({
      month: "2026-03",
      stopOrder: 12,
      fromStopId: "503471",
      toStopId: "502992",
    });
    const second = key({
      month: "2026-03",
      stopOrder: 13,
      fromStopId: "504503",
      toStopId: "502992",
    });
    const spine = artifact([
      sourceRow({
        month: first.month,
        stopOrder: first.stopOrder,
        fromStopId: first.fromStopId,
        toStopId: first.toStopId,
      }),
      sourceRow({
        month: second.month,
        stopOrder: second.stopOrder,
        fromStopId: second.fromStopId,
        toStopId: second.toStopId,
      }),
    ]);
    const crosswalk = buildRouteSpeedSpineCrosswalk(spine);
    const firstMatch = matchRouteSpeedSpineSegment(crosswalk, first);
    const secondMatch = matchRouteSpeedSpineSegment(crosswalk, second);

    expect(spine.segments).toHaveLength(2);
    expect(firstMatch.status).toBe("matched");
    expect(secondMatch.status).toBe("matched");
    if (firstMatch.status !== "matched" || secondMatch.status !== "matched")
      return;
    expect(firstMatch.spineSegmentId).not.toBe(secondMatch.spineSegmentId);
  });

  test("returns an explicit unmatched result", () => {
    const spine = artifact([
      sourceRow({
        month: "2026-03",
        stopOrder: 34,
        fromStopId: "a",
        toStopId: "b",
      }),
    ]);
    const unmatched = key({
      month: "2026-03",
      stopOrder: 36,
      fromStopId: "b",
      toStopId: "c",
    });

    expect(
      matchRouteSpeedSpineSegment(
        buildRouteSpeedSpineCrosswalk(spine),
        unmatched,
      ),
    ).toEqual({
      status: "unmatched",
      studioSegmentId: serializeStudioSegmentId(unmatched),
    });
  });

  test("retains a nullable stop pair as unkeyable and publishes no alias", () => {
    const classified = classifyRouteSegmentSourceKey({
      routeId: "B41",
      month: "2026-03",
      direction: "S",
      stopOrder: 34,
      fromStopId: "303324",
      toStopId: null,
    });
    const spine = artifact([
      sourceRow({
        month: "2026-03",
        stopOrder: 34,
        fromStopId: "303324",
        toStopId: null,
      }),
    ]);

    expect(classified.status).toBe("unkeyable_missing_stop_pair");
    expect(spine.sourceKeys?.observed).toContainEqual(classified);
    expect(spine.summary.unkeyableSourceKeyCount).toBe(1);
    expect(buildRouteSpeedSpineCrosswalk(spine).size).toBe(0);
  });

  test("fails deterministically when one exact alias maps to two spine segments", () => {
    const sourceKey = key({
      month: "2026-03",
      stopOrder: 34,
      fromStopId: "303324",
      toStopId: "901681",
    });
    const classified = { status: "keyed", key: sourceKey } as const;
    const spine = artifact([
      sourceRow({
        month: sourceKey.month,
        stopOrder: sourceKey.stopOrder,
        fromStopId: sourceKey.fromStopId,
        toStopId: sourceKey.toStopId,
      }),
    ]);
    const first = spine.segments[0];
    if (first === undefined)
      throw new Error("Fixture did not produce a spine segment.");
    const ambiguous = {
      ...spine,
      segments: [
        {
          ...first,
          segmentId: "spine-a",
          raw: { ...first.raw, sourceKeys: [classified] },
        },
        {
          ...first,
          segmentId: "spine-b",
          raw: { ...first.raw, sourceKeys: [classified] },
        },
      ],
    } satisfies RouteSpeedSpineArtifact;

    expect(() => buildRouteSpeedSpineCrosswalk(ambiguous)).toThrow(
      `Ambiguous route speed spine alias ${serializeStudioSegmentId(sourceKey)}: spine-a and spine-b.`,
    );
  });
});
