import { MapRouteSegmentFeatureCollectionSchema } from "@bp/domain/maps";
import {
  StudioRouteDetailResponseSchema,
  StudioRouteSpeedHistoryResponseSchema,
} from "@bp/domain/studio/routes";
import { decodeSchemaStrict } from "../lib/schema-decode.ts";

type IdentityMap = {
  features: readonly {
    properties: {
      routeId: string;
      month: string;
      studioSegmentId: string;
      spineSegmentId: string | null;
      spineJoinStatus: "matched" | "unmatched" | "ambiguous" | "not_built";
    };
  }[];
};

type IdentityDetail = {
  route: { routeId: string };
  segments: readonly {
    id: string;
    spineSegmentId: string | null;
    spineJoinStatus: "matched" | "unmatched" | "ambiguous" | "not_built";
  }[];
};

type IdentityHistory = {
  routeId: string;
  spineReadiness: string | null;
  dimensions: { segments: readonly { segmentId: string }[] };
};

export type MapSegmentIdentityReport = {
  routeId: string;
  month: string;
  mapFeatureCount: number;
  detailSegmentCount: number;
  mapDetailExactMatchCount: number;
  historyEligibleDetailSegmentCount: number;
  historyDetailStableMatchCount: number;
  ambiguousSourceKeyCount: number;
  duplicateStudioSegmentIdCount: number;
  duplicateSpineSegmentIdCount: number;
  positionalFallbackUseCount: 0;
  spineReadiness: string | null;
  issues: string[];
  status: "pass" | "fail";
};

function duplicateCount(values: readonly string[]): number {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return duplicates.size;
}

export function checkMapSegmentIdentity(input: {
  routeId: string;
  month: string;
  map: IdentityMap;
  detail: IdentityDetail;
  history: IdentityHistory;
}): MapSegmentIdentityReport {
  const routeId = input.routeId.trim().toUpperCase();
  const detailIds = new Set(input.detail.segments.map((segment) => segment.id));
  const historyIds = new Set(input.history.dimensions.segments.map((segment) => segment.segmentId));
  const mapStudioIds = input.map.features.map((feature) => feature.properties.studioSegmentId);
  const detailSpineIds = input.detail.segments.flatMap((segment) =>
    segment.spineSegmentId === null ? [] : [segment.spineSegmentId],
  );
  const mapDetailExactMatchCount = mapStudioIds.filter((id) => detailIds.has(id)).length;
  const historyEligible = input.detail.segments.filter(
    (segment) => segment.spineJoinStatus === "matched" && segment.spineSegmentId !== null,
  );
  const historyDetailStableMatchCount = historyEligible.filter(
    (segment) => segment.spineSegmentId !== null && historyIds.has(segment.spineSegmentId),
  ).length;
  const ambiguousSourceKeyCount = [
    ...input.map.features.map((feature) => feature.properties.spineJoinStatus),
    ...input.detail.segments.map((segment) => segment.spineJoinStatus),
  ].filter((status) => status === "ambiguous").length;
  const duplicateStudioSegmentIdCount = duplicateCount(mapStudioIds);
  const duplicateSpineSegmentIdCount = duplicateCount(detailSpineIds);
  const issues: string[] = [];

  if (input.detail.route.routeId.trim().toUpperCase() !== routeId) {
    issues.push("detail_route_mismatch");
  }
  if (input.history.routeId.trim().toUpperCase() !== routeId) {
    issues.push("history_route_mismatch");
  }
  if (
    input.map.features.some(
      (feature) =>
        feature.properties.routeId.trim().toUpperCase() !== routeId ||
        feature.properties.month !== input.month,
    )
  ) {
    issues.push("map_route_or_month_mismatch");
  }
  if (mapDetailExactMatchCount !== input.map.features.length) issues.push("map_detail_join_gap");
  if (historyDetailStableMatchCount !== historyEligible.length) {
    issues.push("history_detail_join_gap");
  }
  if (ambiguousSourceKeyCount > 0) issues.push("ambiguous_source_key");
  if (duplicateStudioSegmentIdCount > 0) issues.push("duplicate_studio_segment_id");
  if (duplicateSpineSegmentIdCount > 0) issues.push("duplicate_spine_segment_id");

  return {
    routeId,
    month: input.month,
    mapFeatureCount: input.map.features.length,
    detailSegmentCount: input.detail.segments.length,
    mapDetailExactMatchCount,
    historyEligibleDetailSegmentCount: historyEligible.length,
    historyDetailStableMatchCount,
    ambiguousSourceKeyCount,
    duplicateStudioSegmentIdCount,
    duplicateSpineSegmentIdCount,
    positionalFallbackUseCount: 0,
    spineReadiness: input.history.spineReadiness,
    issues,
    status: issues.length === 0 ? "pass" : "fail",
  };
}

function option(argv: readonly string[], name: string): string {
  const index = argv.indexOf(`--${name}`);
  const value = index < 0 ? undefined : argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing required --${name} option.`);
  }
  return value;
}

async function main(): Promise<void> {
  const argv = Bun.argv.slice(2);
  const [map, detail, history] = await Promise.all([
    Bun.file(option(argv, "map")).json(),
    Bun.file(option(argv, "detail")).json(),
    Bun.file(option(argv, "history")).json(),
  ]);
  const report = checkMapSegmentIdentity({
    routeId: option(argv, "route"),
    month: option(argv, "month"),
    map: decodeSchemaStrict(MapRouteSegmentFeatureCollectionSchema, map),
    detail: decodeSchemaStrict(StudioRouteDetailResponseSchema, detail),
    history: decodeSchemaStrict(StudioRouteSpeedHistoryResponseSchema, history),
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.status === "fail") process.exitCode = 1;
}

if (import.meta.main) {
  await main();
}
