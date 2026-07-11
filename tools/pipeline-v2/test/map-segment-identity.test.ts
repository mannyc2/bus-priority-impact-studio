import { describe, expect, test } from "bun:test";
import {
  buildRouteSpeedSpineCrosswalk,
  type RouteSegmentSourceKey,
  type RouteSpeedSpineArtifact,
  serializeStudioSegmentId,
} from "@bp/analytics/feature-history";

type FixtureSourceKey = {
  routeId: string;
  month: string;
  direction: string;
  stopOrder: number;
  fromStopId: string;
  toStopId: string;
};

const sourceKeys = {
  north: {
    routeId: "B41",
    month: "2026-03",
    direction: "S",
    stopOrder: 30,
    fromStopId: "303310",
    toStopId: "303324",
  },
  geometryless: {
    routeId: "B41",
    month: "2026-03",
    direction: "S",
    stopOrder: 32,
    fromStopId: "303324",
    toStopId: "801144",
  },
  south: {
    routeId: "B41",
    month: "2026-03",
    direction: "S",
    stopOrder: 34,
    fromStopId: "303324",
    toStopId: "901681",
  },
} as const satisfies Record<string, FixtureSourceKey>;

const detailSegments = [
  { label: "North", sourceKey: sourceKeys.north, hasGeometry: true },
  { label: "Geometryless", sourceKey: sourceKeys.geometryless, hasGeometry: false },
  { label: "South", sourceKey: sourceKeys.south, hasGeometry: true },
] as const;

const mapFeatures = [
  { label: "South geometry", sourceKey: sourceKeys.south },
  { label: "North geometry", sourceKey: sourceKeys.north },
] as const;

const spineSegments: readonly {
  spineSegmentId: string;
  aliases: readonly FixtureSourceKey[];
}[] = [
  { spineSegmentId: "b41-s-node-010-node-011", aliases: [sourceKeys.north] },
  { spineSegmentId: "b41-s-node-011-node-012", aliases: [sourceKeys.south] },
];

// Keep the real-data reproduction bounded and read-only:
// bun --eval 'const map=await Bun.file("data/artifacts/map/route-segments/b41/2026-03/all-day.geojson").json(); const detail=await Bun.file("data/artifacts/studio/v1/routes/b41/segments.json").json(); const history=await Bun.file("data/artifacts/studio/v2/routes/b41/speed-history.json").json(); console.log({map:map.features.length,detail:detail.segments.length,history:history.dimensions.segments.length})'

describe("map segment identity fixture", () => {
  test("proves producer position and segment identity disagree", () => {
    const positionalAssociations = mapFeatures.map((feature, index) => ({
      feature,
      detail: detailSegments[index],
    }));

    expect(
      positionalAssociations.some(({ feature, detail }) => feature.sourceKey !== detail?.sourceKey),
    ).toBe(true);
    expect(detailSegments.find((segment) => !segment.hasGeometry)?.label).toBe("Geometryless");
    expect(spineSegments.flatMap((segment) => segment.aliases)).not.toContain(
      sourceKeys.geometryless,
    );
  });

  test("joins reordered map, detail, and history records only by canonical identity", () => {
    const detailById = new Map(
      detailSegments.map((detail) => [serializeStudioSegmentId(detail.sourceKey), detail]),
    );
    const exactMapMatches = mapFeatures.map((feature) =>
      detailById.get(serializeStudioSegmentId(feature.sourceKey)),
    );
    expect(exactMapMatches.map((detail) => detail?.label)).toEqual(["South", "North"]);
    expect(exactMapMatches).not.toContain(undefined);

    const crosswalk = buildRouteSpeedSpineCrosswalk({
      routeId: "B41",
      segments: spineSegments.map((segment) => ({
        segmentId: segment.spineSegmentId,
        raw: {
          sourceKeys: segment.aliases.map((key) => ({
            status: "keyed" as const,
            key: key satisfies RouteSegmentSourceKey,
          })),
        },
      })),
    } as unknown as Pick<RouteSpeedSpineArtifact, "routeId" | "segments">);
    expect(crosswalk.get(serializeStudioSegmentId(sourceKeys.north))).toBe(
      "b41-s-node-010-node-011",
    );
    expect(crosswalk.get(serializeStudioSegmentId(sourceKeys.south))).toBe(
      "b41-s-node-011-node-012",
    );
    expect(crosswalk.get(serializeStudioSegmentId(sourceKeys.geometryless))).toBeUndefined();
  });

  test("map and route-detail producers use the canonical serializers", async () => {
    const [mapSource, detailSource] = await Promise.all([
      Bun.file("tools/pipeline-v2/src/commands/map/artifacts.ts").text(),
      Bun.file("tools/pipeline-v2/src/lib/route-briefs/model.ts").text(),
    ]);

    expect(mapSource).toContain("serializeSourceSegmentId(classified.key)");
    expect(detailSource).toContain("serializeStudioSegmentId(classified.key)");
    expect(mapSource).not.toContain(
      "[row.direction, row.stopOrder, row.timepointStopId, row.nextTimepointStopId].join",
    );
    expect(detailSource).not.toContain(
      "row.routeId,\n    row.isoMonth,\n    row.direction,\n    row.stopOrder",
    );
  });
});
