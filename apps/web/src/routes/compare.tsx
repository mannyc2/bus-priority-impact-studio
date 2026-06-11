import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../lib/head.js";
import {
  fetchStudioRoute,
  fetchStudioRouteHistory,
  fetchStudioRoutes,
  StudioApiError,
} from "../studio/api-client.js";
import { ComparePage } from "../studio/pages/compare.js";

type CompareSearch = {
  a: string;
  b: string;
};

async function fetchOptionalRouteHistory(routeId: string) {
  try {
    return await fetchStudioRouteHistory(routeId);
  } catch (error) {
    if (error instanceof StudioApiError && (error.status === 404 || error.status === 503)) {
      return null;
    }
    throw error;
  }
}

export const Route = createFileRoute("/compare")({
  validateSearch: (search: { a?: unknown; b?: unknown }): CompareSearch => ({
    a: typeof search.a === "string" ? search.a : "m15-sbs",
    b: typeof search.b === "string" ? search.b : "bx12-sbs",
  }),
  loaderDeps: ({ search }) => ({ a: search.a, b: search.b }),
  // Both routes' full detail + history, the same cheap static JSON route-detail
  // loads for one route. This is what lets the compare charts use real data
  // (segments / history) instead of synthesizing it.
  loader: ({ deps }) =>
    Promise.all([
      fetchStudioRoute(deps.a),
      fetchStudioRoute(deps.b),
      fetchOptionalRouteHistory(deps.a),
      fetchOptionalRouteHistory(deps.b),
      fetchStudioRoutes(),
    ]).then(([detailA, detailB, historyA, historyB, routes]) => ({
      detailA,
      detailB,
      historyA,
      historyB,
      routes,
    })),
  head: () => routeHead("Compare Routes"),
  component: CompareRoute,
});

function CompareRoute() {
  const data = Route.useLoaderData();
  return (
    <ComparePage
      detailA={data.detailA}
      detailB={data.detailB}
      historyA={data.historyA}
      historyB={data.historyB}
      options={data.routes.routes}
    />
  );
}
