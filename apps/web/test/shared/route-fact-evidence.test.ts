import { describe, expect, test } from "bun:test";
import type { MapManifestResponse, MapRouteFact, MapRouteFactsResponse } from "@bp/domain/maps";
import {
  type RouteFactParityInput,
  resolveRouteFactEvidence,
} from "../../src/components/route/route-fact-evidence";
import { loadRouteFactEvidence } from "../../src/components/route/use-route-fact-evidence";

const identity = {
  releaseId: "pub_20260401T000000123Z",
  publishedAt: "2026-04-01T00:00:00.123Z",
  coverage: { start: null, end: "2026-03" },
} as const;

const detail: RouteFactParityInput = {
  coverageEnd: "2026-03",
  route: {
    routeId: "M15+",
    slug: "m15-sbs",
    label: "M15 SBS",
    corridor: "First / Second",
    borough: "Manhattan",
    sbs: true,
    speedMph: 7.2,
    dailyRiders: 45_000,
    reliability: "79%",
    movement6mPct: -3.4,
    riderHoursLost: 4_310,
    laneCoverage: 65,
    aceStatus: "active",
  },
};

function routeFact(
  input: {
    route?: Partial<MapRouteFact["route"]>;
    delayExposure?: Partial<MapRouteFact["delayExposure"]>;
    lane?: Partial<MapRouteFact["provenance"]["lane"]>;
    ace?: Partial<MapRouteFact["provenance"]["ace"]>;
  } = {},
): MapRouteFact {
  return {
    route: {
      routeId: "M15+",
      slug: "m15-sbs",
      label: "M15 SBS",
      corridor: "First / Second",
      borough: "Manhattan",
      sbs: true,
      speedMph: 7.2,
      dailyRiders: 45_000,
      reliability: "79%",
      movement6mPct: -3.4,
      ...input.route,
    },
    delayExposure: {
      valueRiderHours: 4_310,
      status: "available",
      coverage: { start: null, end: "2026-03" },
      grain: "all_observed_timepoint_segments",
      source: "mta_bus_segment_speeds",
      segmentCount: 18,
      ridershipDenominator: "average_service_day_route_hourly_ridership",
      serviceDayRidershipCoverage: "available",
      hourlyPassengerDelayCoverage: "available",
      unavailableReason: null,
      ...input.delayExposure,
    },
    provenance: {
      lane: {
        status: "available",
        valuePct: 65,
        method: "route_shape_proximity_overlap",
        sourceId: "nyc_dot_bus_lanes_local_streets",
        unavailableReason: null,
        ...input.lane,
      },
      ace: {
        status: "active",
        grain: "route_month",
        sourceId: "ace_routes",
        sourceAsOf: "2026-03",
        sourceStatus: "available",
        unavailableReason: null,
        ...input.ace,
      },
      tsp: {
        status: "installed",
        grain: "route_or_corridor",
        sourceId: "nyc_dot_tsp_status_2017",
        sourceDate: "2017-12-31",
        corridor: "First Avenue",
        matchMethod: "route_id",
      },
    },
  } as MapRouteFact;
}

function response(fact: MapRouteFact = routeFact()): MapRouteFactsResponse {
  return {
    schemaVersion: 2,
    ...identity,
    routes: [fact],
  } as MapRouteFactsResponse;
}

function mismatchFields(result: ReturnType<typeof resolveRouteFactEvidence>): string[] {
  expect(result.status).toBe("mismatch");
  return result.status === "mismatch" ? result.mismatches.map((mismatch) => mismatch.field) : [];
}

describe("resolveRouteFactEvidence", () => {
  test("returns the selected route fact only after exact parity", () => {
    const result = resolveRouteFactEvidence(detail, identity, response());
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.fact.route.routeId).toBe("M15+");
    expect(result.fact.provenance.tsp).toMatchObject({
      status: "installed",
      sourceDate: "2017-12-31",
    });
  });

  test("rejects a baseline mismatch", () => {
    const result = resolveRouteFactEvidence(
      { ...detail, coverageEnd: "2026-02" },
      identity,
      response(),
    );
    expect(mismatchFields(result)).toContain("coverage.end");
  });

  test("rejects route facts from a different manifest release", () => {
    const result = resolveRouteFactEvidence(detail, identity, {
      ...response(),
      coverage: { start: "2025-01", end: "2026-03" },
    });
    expect(mismatchFields(result)).toContain("release.coverage.start");
  });

  test("rejects every compact summary-field mismatch", () => {
    const summaryMismatches: Array<
      [keyof MapRouteFact["route"], MapRouteFact["route"][keyof MapRouteFact["route"]], string]
    > = [
      ["slug", "other-route", "route.slug"],
      ["label", "M15", "route.label"],
      ["corridor", "Other corridor", "route.corridor"],
      ["borough", "Brooklyn", "route.borough"],
      ["sbs", false, "route.sbs"],
      ["speedMph", 7.1, "route.speedMph"],
      ["dailyRiders", 44_999, "route.dailyRiders"],
      ["reliability", "80%", "route.reliability"],
      ["movement6mPct", null, "route.movement6mPct"],
    ];
    for (const [field, value, mismatchField] of summaryMismatches) {
      const result = resolveRouteFactEvidence(
        detail,
        identity,
        response(routeFact({ route: { [field]: value } })),
      );
      expect(mismatchFields(result)).toContain(mismatchField);
    }
  });

  test("rejects available delay, lane, and ACE values that disagree with Studio", () => {
    expect(
      mismatchFields(
        resolveRouteFactEvidence(
          detail,
          identity,
          response(routeFact({ delayExposure: { valueRiderHours: 4_309 } })),
        ),
      ),
    ).toContain("delayExposure.valueRiderHours");
    expect(
      mismatchFields(
        resolveRouteFactEvidence(detail, identity, response(routeFact({ lane: { valuePct: 64 } }))),
      ),
    ).toContain("provenance.lane.valuePct");
    expect(
      mismatchFields(
        resolveRouteFactEvidence(
          detail,
          identity,
          response(routeFact({ ace: { status: "none" } })),
        ),
      ),
    ).toContain("provenance.ace.status");
  });

  test("preserves unavailable lane and ACE provenance instead of comparing fallback values", () => {
    const fact = routeFact({
      lane: {
        status: "unavailable",
        valuePct: null,
        method: null,
        sourceId: null,
        unavailableReason: "Lane source unavailable.",
      },
      ace: {
        status: "unknown",
        sourceId: null,
        sourceAsOf: null,
        sourceStatus: "unavailable",
        unavailableReason: "ACE source unavailable.",
      },
    });
    const result = resolveRouteFactEvidence(detail, identity, response(fact));
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.fact.provenance.lane.status).toBe("unavailable");
    expect(result.fact.provenance.ace.status).toBe("unknown");
  });

  test("keeps an absent route distinct from parity mismatch", () => {
    const result = resolveRouteFactEvidence(detail, identity, {
      ...response(),
      routes: [],
    });
    expect(result).toMatchObject({ status: "unavailable", kind: "route_absent" });
  });
});

describe("loadRouteFactEvidence", () => {
  const manifest = identity as unknown as MapManifestResponse;

  test("preserves unavailable and request-error states", async () => {
    await expect(
      loadRouteFactEvidence(
        detail,
        {},
        {
          fetchManifest: async () => null,
          fetchRouteFacts: async () => {
            throw new Error("must not run");
          },
        },
      ),
    ).resolves.toMatchObject({ status: "unavailable", kind: "manifest_unavailable" });

    await expect(
      loadRouteFactEvidence(
        detail,
        {},
        {
          fetchManifest: async () => manifest,
          fetchRouteFacts: async () => ({
            status: "request_failed",
            path: "/map-route-facts.json",
            httpStatus: 503,
            reason: "Temporarily unavailable.",
          }),
        },
      ),
    ).resolves.toMatchObject({ status: "error", kind: "request_failed" });
  });

  test("passes one abort signal through both stages and stops before facts when aborted", async () => {
    const controller = new AbortController();
    let factsCallCount = 0;
    const promise = loadRouteFactEvidence(
      detail,
      { signal: controller.signal },
      {
        fetchManifest: async (options) => {
          expect(options?.signal).toBe(controller.signal);
          controller.abort();
          return manifest;
        },
        fetchRouteFacts: async () => {
          factsCallCount += 1;
          return {
            status: "ready",
            data: response(),
            path: "/map-route-facts.json",
            expectedSha256: "a".repeat(64),
            actualSha256: "a".repeat(64),
          };
        },
      },
    );

    await expect(promise).rejects.toThrow("abort");
    expect(factsCallCount).toBe(0);
  });
});
