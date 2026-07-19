import type { MapManifestResponse, MapRouteFact, MapRouteFactsResponse } from "@bp/domain/maps";
import type { StudioRouteDetailResponse } from "@/studio/api-contract";

type ComparableFactValue = string | number | boolean | null;

export type RouteFactParityInput = {
  coverageEnd: string;
  route: Pick<
    StudioRouteDetailResponse["route"],
    | "routeId"
    | "slug"
    | "label"
    | "corridor"
    | "borough"
    | "sbs"
    | "speedMph"
    | "dailyRiders"
    | "reliability"
    | "movement6mPct"
    | "riderHoursLost"
    | "laneCoverage"
    | "aceStatus"
  >;
};

export type RouteFactMismatch = {
  field: string;
  expected: ComparableFactValue;
  actual: ComparableFactValue;
};

export type RouteFactEvidenceState =
  | { status: "pending" }
  | {
      status: "available";
      fact: MapRouteFact;
      release: Pick<MapRouteFactsResponse, "releaseId" | "publishedAt" | "coverage">;
    }
  | {
      status: "unavailable";
      kind:
        | "manifest_unavailable"
        | "route_facts_unavailable"
        | "route_facts_missing"
        | "route_absent";
      reason: string;
    }
  | {
      status: "error";
      kind:
        | "manifest_request_failed"
        | "route_facts_request_failed"
        | "request_failed"
        | "invalid_contract"
        | "integrity_mismatch";
      reason: string;
    }
  | { status: "mismatch"; mismatches: readonly RouteFactMismatch[]; reason: string };

export type ResolvedRouteFactEvidence = Extract<
  RouteFactEvidenceState,
  { status: "available" | "unavailable" | "mismatch" }
>;

/** Snapshot only the Studio fields that participate in route-fact parity. */
export function routeFactParityInput(data: StudioRouteDetailResponse): RouteFactParityInput {
  const { route } = data;
  return {
    coverageEnd: data.baselineMonth,
    route: {
      routeId: route.routeId,
      slug: route.slug,
      label: route.label,
      corridor: route.corridor,
      borough: route.borough,
      sbs: route.sbs,
      speedMph: route.speedMph,
      dailyRiders: route.dailyRiders,
      reliability: route.reliability,
      movement6mPct: route.movement6mPct,
      riderHoursLost: route.riderHoursLost,
      laneCoverage: route.laneCoverage,
      aceStatus: route.aceStatus,
    },
  };
}

/**
 * Accept a route fact only when it belongs to the manifest release and exactly
 * matches every compact Studio summary field. Available evidence-only fields
 * must also match; unavailable lane/ACE evidence stays unavailable/unknown.
 */
export function resolveRouteFactEvidence(
  detail: RouteFactParityInput,
  manifest: Pick<MapManifestResponse, "releaseId" | "publishedAt" | "coverage">,
  response: MapRouteFactsResponse,
): ResolvedRouteFactEvidence {
  const fact = response.routes.find(
    (candidate) => candidate.route.routeId === detail.route.routeId,
  );
  if (fact === undefined) {
    return {
      status: "unavailable",
      kind: "route_absent",
      reason: `Map route facts do not include ${detail.route.routeId}.`,
    };
  }

  const comparisons: Array<
    readonly [field: string, expected: ComparableFactValue, actual: ComparableFactValue]
  > = [
    ["releaseId", manifest.releaseId, response.releaseId],
    ["publishedAt", manifest.publishedAt, response.publishedAt],
    ["release.coverage.start", manifest.coverage.start, response.coverage.start],
    ["release.coverage.end", manifest.coverage.end, response.coverage.end],
    ["coverage.end", detail.coverageEnd, response.coverage.end],
    ["route.routeId", detail.route.routeId, fact.route.routeId],
    ["route.slug", detail.route.slug, fact.route.slug],
    ["route.label", detail.route.label, fact.route.label],
    ["route.corridor", detail.route.corridor, fact.route.corridor],
    ["route.borough", detail.route.borough, fact.route.borough],
    ["route.sbs", detail.route.sbs, fact.route.sbs],
    ["route.speedMph", detail.route.speedMph, fact.route.speedMph],
    ["route.dailyRiders", detail.route.dailyRiders, fact.route.dailyRiders],
    ["route.reliability", detail.route.reliability, fact.route.reliability],
    ["route.movement6mPct", detail.route.movement6mPct, fact.route.movement6mPct],
  ];

  if (fact.delayExposure.status === "available") {
    comparisons.push([
      "delayExposure.valueRiderHours",
      detail.route.riderHoursLost,
      fact.delayExposure.valueRiderHours,
    ]);
  }
  if (fact.provenance.lane.status === "available") {
    comparisons.push([
      "provenance.lane.valuePct",
      detail.route.laneCoverage,
      fact.provenance.lane.valuePct,
    ]);
  }
  if (fact.provenance.ace.sourceStatus === "available") {
    comparisons.push(["provenance.ace.status", detail.route.aceStatus, fact.provenance.ace.status]);
  }

  const mismatches = comparisons.flatMap(([field, expected, actual]) =>
    Object.is(expected, actual) ? [] : [{ field, expected, actual }],
  );
  if (mismatches.length > 0) {
    return {
      status: "mismatch",
      mismatches,
      reason: `Map route facts disagree with Studio route detail at ${mismatches
        .map((mismatch) => mismatch.field)
        .join(", ")}.`,
    };
  }

  return {
    status: "available",
    fact,
    release: {
      releaseId: response.releaseId,
      publishedAt: response.publishedAt,
      coverage: response.coverage,
    },
  };
}
