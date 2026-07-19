import { describe, expect, test } from "bun:test";
import {
  prototypeExactAliasCanonicalization,
  prototypeRecurringPatternProfiles,
  type RouteSpeedSpineArtifact,
  type RouteSpeedSpineSegment,
} from "@bp/analytics/feature-history";

type SegmentFixture = {
  segmentId: string;
  months: string[];
  fromStopId: string;
  toStopId: string;
  stopOrder?: number;
};

function fixtureSegment(input: SegmentFixture): RouteSpeedSpineSegment {
  const stopOrder = input.stopOrder ?? 1;
  return {
    segmentId: input.segmentId,
    direction: "N",
    displayOrder: stopOrder,
    fromNodeId: `node-${input.fromStopId}`,
    toNodeId: `node-${input.toStopId}`,
    label: `${input.fromStopId} to ${input.toStopId}`,
    months: input.months,
    monthCount: input.months.length,
    sourceRowCount: input.months.length,
    busTripCount: input.months.length,
    averageRoadDistanceMiles: 1,
    averageSpeedMph: 8,
    stopOrder: {
      min: stopOrder,
      median: stopOrder,
      max: stopOrder,
      values: [stopOrder],
      changed: false,
    },
    raw: {
      rawSegmentKeyCount: input.months.length,
      rawStopPairCount: 1,
      sourceStopPairs: [
        {
          fromStopId: input.fromStopId,
          fromStopName: input.fromStopId,
          toStopId: input.toStopId,
          toStopName: input.toStopId,
          stopOrders: [stopOrder],
          months: input.months,
          sourceRowCount: input.months.length,
        },
      ],
      sourceKeys: input.months.map((month) => ({
        status: "keyed" as const,
        key: {
          routeId: "B1",
          month,
          direction: "N",
          stopOrder,
          fromStopId: input.fromStopId,
          toStopId: input.toStopId,
        },
      })),
    },
  };
}

function fixtureArtifact(segmentFixtures: SegmentFixture[]): RouteSpeedSpineArtifact {
  const segments = segmentFixtures.map(fixtureSegment);
  const months = [...new Set(segments.flatMap((segment) => segment.months))].toSorted();
  const monthCoverage = months.map((month) => {
    const observedSegmentCount = segments.filter((segment) =>
      segment.months.includes(month),
    ).length;
    return {
      month,
      sourceRowCount: observedSegmentCount,
      busTripCount: observedSegmentCount,
      rawSegmentKeyCount: observedSegmentCount,
      rawStopPairCount: observedSegmentCount,
      spineSegmentCount: observedSegmentCount,
      coverageShare: observedSegmentCount / segments.length,
    };
  });
  return {
    artifactKind: "studio_route_speed_spine",
    schemaVersion: 1,
    generatedAt: "2026-07-19T00:00:00.000Z",
    routeId: "B1",
    routeSlug: "b1",
    source: {
      table: "local_route_segment_speed",
      dbPath: "fixture.sqlite",
      startMonth: months[0] ?? "2026-01",
      endMonth: months.at(-1) ?? null,
      toleranceMeters: 110,
      artifactPath: "fixture.json",
    },
    summary: {
      monthCount: months.length,
      sourceRowCount: monthCoverage.reduce((sum, row) => sum + row.sourceRowCount, 0),
      busTripCount: monthCoverage.reduce((sum, row) => sum + row.busTripCount, 0),
      nodeCount: 0,
      spineSegmentCount: segments.length,
      rawSegmentKeyCount: segments.reduce(
        (sum, segment) => sum + segment.raw.rawSegmentKeyCount,
        0,
      ),
      rawStopPairCount: segments.length,
      monthsWithRawKeyDriftCount: 0,
      monthsWithPartialSpineCoverageCount: monthCoverage.filter((row) => row.coverageShare < 1)
        .length,
      mergedNodeCount: 0,
      segmentWithRawVariantCount: 0,
      issueCount: 0,
      keyedSourceKeyCount: segments.reduce(
        (sum, segment) => sum + (segment.raw.sourceKeys?.length ?? 0),
        0,
      ),
      unkeyableSourceKeyCount: 0,
    },
    sourceKeys: {
      observed: segments.flatMap((segment) => segment.raw.sourceKeys ?? []),
    },
    nodes: [],
    segments,
    monthCoverage,
    validation: { status: "pass", issues: [] },
  };
}

describe("exact alias-set canonicalization prototype", () => {
  test("flips a rename-only route with exact endpoints and disjoint months", () => {
    const result = prototypeExactAliasCanonicalization(
      fixtureArtifact([
        {
          segmentId: "old-key",
          months: ["2026-01", "2026-02"],
          fromStopId: "A",
          toStopId: "B",
          stopOrder: 1,
        },
        {
          segmentId: "new-key",
          months: ["2026-03", "2026-04"],
          fromStopId: "A",
          toStopId: "B",
          stopOrder: 4,
        },
      ]),
    );

    expect(result.before.readiness).toBe("needs_pattern_review");
    expect(result.after.readiness).toBe("series_ready");
    expect(result.acceptedAliasGroups).toHaveLength(1);
    expect(result.monthCoverage.every((month) => month.afterCoverageShare === 1)).toBe(true);
  });

  test("rejects exact endpoint aliases observed concurrently", () => {
    const result = prototypeExactAliasCanonicalization(
      fixtureArtifact([
        {
          segmentId: "first",
          months: ["2026-01", "2026-02"],
          fromStopId: "A",
          toStopId: "B",
        },
        {
          segmentId: "second",
          months: ["2026-02", "2026-03"],
          fromStopId: "A",
          toStopId: "B",
        },
      ]),
    );

    expect(result.acceptedAliasGroups).toEqual([]);
    expect(result.rejectedConcurrentPairs).toEqual([["first", "second"]]);
    expect(result.after.readiness).toBe("needs_pattern_review");
  });

  test("rejects a globally non-unique endpoint even when one disjoint pair looks unique", () => {
    const result = prototypeExactAliasCanonicalization(
      fixtureArtifact([
        {
          segmentId: "old",
          months: ["2026-01", "2026-02"],
          fromStopId: "A",
          toStopId: "B",
        },
        { segmentId: "new-a", months: ["2026-03"], fromStopId: "A", toStopId: "B" },
        {
          segmentId: "new-b",
          months: ["2026-02", "2026-03"],
          fromStopId: "A",
          toStopId: "B",
        },
      ]),
    );

    expect(result.acceptedAliasGroups).toEqual([]);
    expect(result.rejectedAmbiguousSegmentIds).toEqual(["new-a", "new-b", "old"]);
    expect(result.after.readiness).toBe("needs_pattern_review");
  });

  test("does not repair a genuinely missing distinct segment", () => {
    const result = prototypeExactAliasCanonicalization(
      fixtureArtifact([
        {
          segmentId: "always",
          months: ["2026-01", "2026-02", "2026-03", "2026-04"],
          fromStopId: "A",
          toStopId: "B",
        },
        { segmentId: "missing", months: ["2026-01"], fromStopId: "B", toStopId: "C" },
      ]),
    );

    expect(result.acceptedAliasGroups).toEqual([]);
    expect(result.after.readiness).toBe("needs_pattern_review");
  });
});

describe("recurring exact pattern-profile prototype", () => {
  test("flips two recurring exact service patterns without merging identities", () => {
    const result = prototypeRecurringPatternProfiles(
      fixtureArtifact([
        {
          segmentId: "core",
          months: ["2026-01", "2026-02", "2026-03", "2026-04"],
          fromStopId: "A",
          toStopId: "B",
        },
        {
          segmentId: "branch",
          months: ["2026-01", "2026-03"],
          fromStopId: "B",
          toStopId: "C",
        },
      ]),
    );

    expect(result.before.readiness).toBe("needs_pattern_review");
    expect(result.after.readiness).toBe("series_ready");
    expect(result.profiles).toHaveLength(2);
    expect(result.profiledMonthCount).toBe(4);
  });

  test("does not promote a persistent single-profile data gap", () => {
    const result = prototypeRecurringPatternProfiles(
      fixtureArtifact([
        {
          segmentId: "core",
          months: ["2026-01", "2026-02", "2026-03", "2026-04"],
          fromStopId: "A",
          toStopId: "B",
        },
        { segmentId: "missing", months: ["2026-01"], fromStopId: "B", toStopId: "C" },
      ]),
    );

    expect(result.profiles).toEqual([]);
    expect(result.rejectedReason).toBe("fewer_than_two_recurring_profiles");
    expect(result.after.readiness).toBe("needs_pattern_review");
  });

  test("rejects recurring profiles whose union omits a rare segment", () => {
    const result = prototypeRecurringPatternProfiles(
      fixtureArtifact([
        {
          segmentId: "core",
          months: ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"],
          fromStopId: "A",
          toStopId: "B",
        },
        {
          segmentId: "branch",
          months: ["2026-01", "2026-03"],
          fromStopId: "B",
          toStopId: "C",
        },
        { segmentId: "rare", months: ["2026-05"], fromStopId: "C", toStopId: "D" },
      ]),
    );

    expect(result.profiles).toEqual([]);
    expect(result.rejectedReason).toBe("recurring_profiles_do_not_cover_union");
    expect(result.after.readiness).toBe("needs_pattern_review");
  });

  test("is deterministic under segment input reordering", () => {
    const fixtures: SegmentFixture[] = [
      {
        segmentId: "core",
        months: ["2026-01", "2026-02", "2026-03", "2026-04"],
        fromStopId: "A",
        toStopId: "B",
      },
      {
        segmentId: "branch",
        months: ["2026-01", "2026-03"],
        fromStopId: "B",
        toStopId: "C",
      },
    ];

    const forward = prototypeRecurringPatternProfiles(fixtureArtifact(fixtures));
    const reverse = prototypeRecurringPatternProfiles(fixtureArtifact(fixtures.toReversed()));

    expect(reverse.profiles).toEqual(forward.profiles);
    expect(reverse.monthCoverage).toEqual(forward.monthCoverage);
    expect(reverse.after).toEqual(forward.after);
  });
});
