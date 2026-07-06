import { describe, expect, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { StudioRoute } from "../../src/studio/api-contract";
import { filterRoutesForIndex, ROUTE_INDEX_ALL_BOROUGHS } from "../../src/studio/home-route-index";
import { HomePage } from "../../src/studio/pages/home";
import {
  RoutesDirectoryLoadingPage,
  RoutesDirectoryPage,
} from "../../src/studio/pages/routes-directory";

// RoutesDirectoryPage and HomePage render TanStack <Link>s, which need a router
// context. A minimal loaded memory router lets renderToStaticMarkup resolve them.
async function renderWithRouter(node: ReactNode): Promise<string> {
  const rootRoute = createRootRoute({ component: () => node });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return renderToStaticMarkup(createElement(RouterProvider, { router }));
}

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

const routes: StudioRoute[] = [
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
    slug: "m101",
    label: "M101",
    borough: "Manhattan",
    corridorFull: "Third and Lexington Avenues",
    dailyRiders: 12000,
  }),
];

describe("RoutesDirectoryPage", () => {
  test("renders a borough group header for each borough present", async () => {
    const html = await renderWithRouter(createElement(RoutesDirectoryPage, { routes }));

    expect(html).toContain("First and Second Avenues");
    expect(html).toContain("Flatbush Avenue");
    // The BoroughBadge group-header dot color is unique to a rendered group
    // (the always-present borough filter buttons carry no dot color).
    expect(html).toContain("background-color:var(--bp-route-manhattan)");
    expect(html).toContain("background-color:var(--bp-route-brooklyn)");
    expect(html).not.toContain("background-color:var(--bp-route-queens)");
    expect(html).not.toContain("background-color:var(--bp-route-si)");
  });

  test("applies the initialQuery search param as the starting filter", async () => {
    const html = await renderWithRouter(
      createElement(RoutesDirectoryPage, { routes, initialQuery: "flatbush" }),
    );

    expect(html).toContain("Flatbush Avenue");
    expect(html).not.toContain("First and Second Avenues");
    expect(html).not.toContain("Third and Lexington Avenues");
    // Only the Brooklyn group renders; no Manhattan group header.
    expect(html).toContain("background-color:var(--bp-route-brooklyn)");
    expect(html).not.toContain("background-color:var(--bp-route-manhattan)");
  });

  test("loading page renders skeletons without route data", () => {
    const html = renderToStaticMarkup(createElement(RoutesDirectoryLoadingPage));
    expect(html).toContain('data-slot="skeleton"');
  });
});

describe("filterRoutesForIndex", () => {
  test("borough filter narrows to matching routes", () => {
    expect(
      filterRoutesForIndex(routes, { borough: "Manhattan", query: "" }).map((r) => r.slug),
    ).toEqual(["m15-sbs", "m101"]);
  });

  test("token filter matches corridor text", () => {
    expect(
      filterRoutesForIndex(routes, { borough: ROUTE_INDEX_ALL_BOROUGHS, query: "flatbush" }).map(
        (r) => r.slug,
      ),
    ).toEqual(["b41"]);
  });

  test("empty query returns all routes", () => {
    expect(
      filterRoutesForIndex(routes, { borough: ROUTE_INDEX_ALL_BOROUGHS, query: "" }),
    ).toHaveLength(3);
  });
});

describe("HomePage", () => {
  test("renders without banned doctrine strings", async () => {
    const html = await renderWithRouter(createElement(HomePage, { routes }));

    expect(html).toContain("Speed and reliability for every NYC bus route.");
    expect(html).not.toContain("civic data project");
    expect(html).not.toContain("generated");
    expect(html).not.toContain("·");
  });
});
