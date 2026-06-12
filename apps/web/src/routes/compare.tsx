import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../lib/head.js";
import {
  fetchStudioRoute,
  fetchStudioRouteHistory,
  fetchStudioRoutes,
  StudioApiError,
  staticStudioLoaderStaleTimeMs,
} from "../studio/api-client.js";
import { ComparePage } from "../studio/pages/compare.js";

type CompareSearch = {
  a: string;
  b: string;
};

async function fetchOptionalRouteHistory(routeId: string, signal: AbortSignal) {
  try {
    return await fetchStudioRouteHistory(routeId, { signal });
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
  loader: ({ abortController, deps }) =>
    Promise.all([
      fetchStudioRoute(deps.a, { signal: abortController.signal }),
      fetchStudioRoute(deps.b, { signal: abortController.signal }),
      fetchOptionalRouteHistory(deps.a, abortController.signal),
      fetchOptionalRouteHistory(deps.b, abortController.signal),
      fetchStudioRoutes({ signal: abortController.signal }),
    ]).then(([detailA, detailB, historyA, historyB, routes]) => ({
      detailA,
      detailB,
      historyA,
      historyB,
      routes,
    })),
  staleTime: staticStudioLoaderStaleTimeMs,
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
