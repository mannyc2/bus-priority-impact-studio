import { describe, expect, test } from "bun:test";
import {
  buildNetworkMapIdentityIndex,
  canonicalizeNetworkMapSearch,
  type NetworkMapEligibility,
  type NetworkMapRouteIdentity,
  validateNetworkMapSearch,
} from "../../src/components/route/network-map-search";

const ROUTES: readonly NetworkMapRouteIdentity[] = [
  { routeId: "M15+", slug: "m15-sbs", servedBoroughs: ["Manhattan"] },
  { routeId: "Q32", slug: "q32", servedBoroughs: ["Queens", "Manhattan"] },
];

const ALL_ELIGIBLE: NetworkMapEligibility = {
  delayExposure: true,
  change: true,
  am: true,
  pm: true,
  lanes: true,
};

describe("validateNetworkMapSearch", () => {
  test("keeps only bounded values and omits canonical defaults", () => {
    expect(
      validateNetworkMapSearch({
        lens: "speed",
        period: "all",
        borough: "Manhattan",
        route: "m15-sbs",
        segment: "M15+:NB:stop-a:stop-b",
        lanes: true,
        compare: true,
        ignored: "value",
      }),
    ).toEqual({
      borough: "Manhattan",
      route: "m15-sbs",
      segment: "M15+:NB:stop-a:stop-b",
      lanes: true,
    });
  });

  test("accepts compare only as true for an AM or PM speed view", () => {
    expect(validateNetworkMapSearch({ period: "pm", compare: true })).toEqual({
      period: "pm",
      compare: true,
    });
    expect(validateNetworkMapSearch({ period: "am", compare: "true" })).toEqual({ period: "am" });
    expect(
      validateNetworkMapSearch({ lens: "delay-exposure", period: "pm", compare: true }),
    ).toEqual({ lens: "delay-exposure" });
  });

  test("drops unknown enums and a segment without a canonical route slug", () => {
    expect(
      validateNetworkMapSearch({
        lens: "delay",
        period: "overnight",
        borough: "All",
        route: "M15 SBS",
        segment: "segment-1",
        lanes: false,
      }),
    ).toEqual({});
  });
});

describe("network map identity", () => {
  test("keeps route slugs and source route IDs as exact inverse domains", () => {
    const identity = buildNetworkMapIdentityIndex(ROUTES);
    expect(identity.routeIdBySlug.get("m15-sbs")).toBe("M15+");
    expect(identity.slugByRouteId.get("M15+")).toBe("m15-sbs");
  });

  test("fails closed on an ambiguous slug or source route ID", () => {
    const identity = buildNetworkMapIdentityIndex([
      ...ROUTES,
      { routeId: "OTHER", slug: "m15-sbs", servedBoroughs: ["Manhattan"] },
      { routeId: "M15+", slug: "m15-local", servedBoroughs: ["Manhattan"] },
    ]);
    expect(identity.routeIdBySlug.has("m15-sbs")).toBe(false);
    expect(identity.slugByRouteId.has("M15+")).toBe(false);
  });
});

describe("canonicalizeNetworkMapSearch", () => {
  test("disables unsupported evidence views, periods, and layers", () => {
    expect(
      canonicalizeNetworkMapSearch(
        { lens: "delay-exposure", route: "q32", lanes: true },
        {
          routes: ROUTES,
          eligibility: { ...ALL_ELIGIBLE, delayExposure: false, lanes: false },
        },
      ),
    ).toEqual({
      search: { route: "q32" },
      routeId: "Q32",
      segmentState: "none",
      notices: ["unsupported_lens", "lanes_unavailable"],
    });

    expect(
      canonicalizeNetworkMapSearch(
        { period: "pm", compare: true },
        { routes: ROUTES, eligibility: { ...ALL_ELIGIBLE, pm: false } },
      ),
    ).toEqual({
      search: {},
      routeId: null,
      segmentState: "none",
      notices: ["unsupported_period"],
    });
  });

  test("clears a route and segment when the served-borough filter excludes it", () => {
    expect(
      canonicalizeNetworkMapSearch(
        { borough: "Queens", route: "m15-sbs", segment: "spine-1", lanes: true },
        { routes: ROUTES, eligibility: ALL_ELIGIBLE },
      ),
    ).toEqual({
      search: { borough: "Queens", lanes: true },
      routeId: null,
      segmentState: "none",
      notices: ["route_outside_borough"],
    });
  });

  test("an inbound ?borough= link still filters after the selector was deleted", () => {
    /* Plan 121 removed the borough UI on operator direction; nothing writes the
       param any more, but shared and bookmarked links must keep working. */
    expect(validateNetworkMapSearch({ borough: "Brooklyn" })).toEqual({ borough: "Brooklyn" });
    const canonical = canonicalizeNetworkMapSearch(
      { borough: "Manhattan" },
      { routes: ROUTES, eligibility: ALL_ELIGIBLE },
    );
    expect(canonical.search).toEqual({ borough: "Manhattan" });
    expect(canonical.notices).toEqual([]);
  });

  test("keeps a cross-borough route in each verified served borough", () => {
    const result = canonicalizeNetworkMapSearch(
      { borough: "Manhattan", route: "q32" },
      { routes: ROUTES, eligibility: ALL_ELIGIBLE },
    );
    expect(result.search).toEqual({ borough: "Manhattan", route: "q32" });
    expect(result.routeId).toBe("Q32");
  });

  test("preserves direct reload and Back/Forward links while validation is pending or unavailable", () => {
    const search = { route: "m15-sbs", segment: "spine-1" } as const;
    for (const segmentValidation of [
      { status: "pending", routeSlug: "m15-sbs" } as const,
      { status: "unavailable", routeSlug: "m15-sbs" } as const,
      // A late response for the previous route cannot invalidate this route.
      { status: "ready", routeSlug: "q32", spineIds: [] } as const,
    ]) {
      const result = canonicalizeNetworkMapSearch(search, {
        routes: ROUTES,
        eligibility: ALL_ELIGIBLE,
        segmentValidation,
      });
      expect(result.search).toEqual(search);
      expect(["pending", "unavailable"]).toContain(result.segmentState);
    }
  });

  test("removes only a segment after ready evidence proves it invalid", () => {
    const valid = canonicalizeNetworkMapSearch(
      { route: "m15-sbs", segment: "spine-1", lanes: true },
      {
        routes: ROUTES,
        eligibility: ALL_ELIGIBLE,
        segmentValidation: {
          status: "ready",
          routeSlug: "m15-sbs",
          spineIds: [null, "spine-1", "spine-2"],
        },
      },
    );
    expect(valid.segmentState).toBe("valid");
    expect(valid.search.segment).toBe("spine-1");

    const invalid = canonicalizeNetworkMapSearch(
      { route: "m15-sbs", segment: "missing", lanes: true },
      {
        routes: ROUTES,
        eligibility: ALL_ELIGIBLE,
        segmentValidation: {
          status: "ready",
          routeSlug: "m15-sbs",
          spineIds: [null, "spine-1", "spine-2"],
        },
      },
    );
    expect(invalid).toEqual({
      search: { route: "m15-sbs", lanes: true },
      routeId: "M15+",
      segmentState: "invalid",
      notices: ["segment_invalid"],
    });
  });

  test("treats a duplicated ready spine match as ambiguous", () => {
    const result = canonicalizeNetworkMapSearch(
      { route: "m15-sbs", segment: "spine-1" },
      {
        routes: ROUTES,
        eligibility: ALL_ELIGIBLE,
        segmentValidation: {
          status: "ready",
          routeSlug: "m15-sbs",
          spineIds: ["spine-1", "spine-1"],
        },
      },
    );
    expect(result.search).toEqual({ route: "m15-sbs" });
    expect(result.segmentState).toBe("invalid");
  });
});
