import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import {
  type RouteDetailSearch,
  validateRouteDetailSearch,
} from "../../components/route/route-segment-explorer.js";
import { routeHead } from "../../lib/head.js";
import {
  fetchStudioRoute,
  fetchStudioRouteEvidence,
  fetchStudioRouteStudies,
  staticStudioLoaderStaleTimeMs,
} from "../../studio/api-client.js";

const RouteDetailPage = lazy(() =>
  import("../../studio/pages/route-detail.js").then((module) => ({
    default: module.RouteDetailPage,
  })),
);

export const Route = createFileRoute("/routes/$routeId")({
  // Detail and route evidence stay Worker-served; heavy route artifacts remain lazy.
  loader: ({ abortController, params }) =>
    Promise.all([
      fetchStudioRoute(params.routeId, { signal: abortController.signal }),
      fetchStudioRouteEvidence(params.routeId, { signal: abortController.signal }),
      // Studies rollup is small and nullable; a failure never blocks the page.
      fetchStudioRouteStudies(params.routeId, { signal: abortController.signal }).catch(
        (error: unknown) => {
          if (error instanceof Error && error.name === "AbortError") throw error;
          console.warn("Route studies request failed; rendering without studies.", { error });
          return null;
        },
      ),
    ]).then(([detail, evidence, studies]) => ({
      detail,
      evidence,
      studies,
    })),
  validateSearch: (search: Record<string, unknown>): RouteDetailSearch =>
    validateRouteDetailSearch(search),
  staleTime: staticStudioLoaderStaleTimeMs,
  pendingComponent: RouteDetailRouteFallback,
  head: ({ params }) => routeHead(`${params.routeId} Route Detail`),
  component: RouteDetailRoute,
});

function RouteDetailRoute() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  return (
    <Suspense fallback={<RouteDetailRouteFallback />}>
      <RouteDetailPage
        data={data.detail}
        evidence={data.evidence}
        studies={data.studies}
        search={search}
      />
    </Suspense>
  );
}

function RouteDetailRouteFallback() {
  return (
    <main className="min-h-full bg-[var(--bp-color-paper)] p-7 text-[var(--bp-color-ink)]">
      <div className="rounded-[3px] bg-[var(--bp-color-card)] p-5 shadow-[0_0_0_1px_var(--bp-color-rule)]">
        <div className="h-6 w-64 animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]" />
        <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]" />
        <div className="mt-4 h-8 w-72 max-w-full animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]" />
      </div>
      <div className="mt-4 rounded-[3px] bg-[var(--bp-color-card)] p-5 shadow-[0_0_0_1px_var(--bp-color-rule)]">
        <div className="h-4 w-80 animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-12 animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
