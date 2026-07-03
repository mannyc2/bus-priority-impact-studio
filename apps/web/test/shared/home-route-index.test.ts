import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { StudioRoute } from "../../src/studio/api-contract";
import {
  filterRoutesForIndex,
  groupRoutesForIndex,
  orderRoutesForIndex,
  ROUTE_INDEX_ALL_BOROUGHS,
} from "../../src/studio/home-route-index";
import { HomeRoleCards, HomeTrustStrip } from "../../src/studio/pages/home";

function route(input: {
  slug: string;
  routeId?: string;
  label: string;
  borough: string;
  corridorFull?: string;
  dailyRiders: number;
}): StudioRoute {
  return {
    slug: input.slug,
    routeId: input.routeId ?? input.label,
    label: input.label,
    corridor: input.corridorFull ?? `${input.label} corridor`,
    corridorFull: input.corridorFull ?? `${input.label} corridor`,
    borough: input.borough,
    sbs: input.label.includes("SBS"),
    speedMph: 7.1,
    scheduledMph: 8.4,
    weightedAvgSpeed: 7.1,
    speedPercentile: 40,
    dailyRiders: input.dailyRiders,
    ridersYoyPct: 0,
    riderHoursLost: 0,
    laneCoverage: 0,
    aceStatus: "none",
    aceSince: null,
    tspCoverage: "none",
    reliability: "No observed reliability summary",
    observedReliability: null,
    diagnosis: "steady",
    spark: [7, 7.1],
    termini: { north: "North", south: "South" },
    miles: 1,
    stops: 2,
    flags: [],
    peerSlug: null,
    interventions: [],
    movement6mPct: null,
    context12mPct: null,
  };
}

describe("home route index helpers", () => {
  const routes = [
    route({
      slug: "m15-sbs",
      routeId: "M15+",
      label: "M15 SBS",
      borough: "Manhattan",
      corridorFull: "First and Second Avenues",
      dailyRiders: 52000,
    }),
    route({
      slug: "b41",
      label: "B41",
      borough: "Brooklyn",
      corridorFull: "Flatbush Avenue",
      dailyRiders: 41000,
    }),
    route({
      slug: "q58",
      label: "Q58",
      borough: "Queens",
      corridorFull: "Corona Avenue",
      dailyRiders: 41000,
    }),
    route({
      slug: "m101",
      label: "M101",
      borough: "Manhattan",
      corridorFull: "Third and Lexington Avenues",
      dailyRiders: 12000,
    }),
  ];

  test("orders by riders, then route label, then slug", () => {
    expect(orderRoutesForIndex(routes).map((item) => item.slug)).toEqual([
      "m15-sbs",
      "b41",
      "q58",
      "m101",
    ]);
  });

  test("filters by borough and route text", () => {
    expect(
      filterRoutesForIndex(routes, {
        borough: "Manhattan",
        query: "avenues",
      }).map((item) => item.slug),
    ).toEqual(["m15-sbs", "m101"]);

    expect(
      filterRoutesForIndex(routes, {
        borough: ROUTE_INDEX_ALL_BOROUGHS,
        query: "flat b41",
      }).map((item) => item.slug),
    ).toEqual(["b41"]);
  });

  test("groups filtered routes by borough without reordering rows", () => {
    expect(
      groupRoutesForIndex(orderRoutesForIndex(routes)).map((group) => ({
        borough: group.borough,
        routes: group.routes.map((item) => item.slug),
      })),
    ).toEqual([
      { borough: "Manhattan", routes: ["m15-sbs", "m101"] },
      { borough: "Brooklyn", routes: ["b41"] },
      { borough: "Queens", routes: ["q58"] },
    ]);
  });

  test("renders public role cards and trust strip with served counts", () => {
    const roleMarkup = renderToStaticMarkup(
      createElement(HomeRoleCards, { flagshipRouteSlug: "m15-sbs" }),
    );
    const trustMarkup = renderToStaticMarkup(
      createElement(HomeTrustStrip, {
        routeCount: 381,
        sourceGroupCount: 7,
        generatedLabel: "Jul 3, 2026",
      }),
    );

    expect(roleMarkup).toContain("If you ride the bus");
    expect(roleMarkup).toContain("If you plan service");
    expect(roleMarkup).toContain("If you report on transit");
    expect(roleMarkup).toContain("/routes/m15-sbs");
    expect(trustMarkup).toContain("381 route pages");
    expect(trustMarkup).toContain("7 methods source groups");
    expect(trustMarkup).toContain("Methods and source catalog");
  });
});
