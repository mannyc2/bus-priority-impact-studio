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
  fetchStudioRouteInterventionInventory,
  fetchStudioRouteInterventionObservations,
  fetchStudioRouteStudies,
  staticStudioLoaderStaleTimeMs,
} from "../../studio/api-client.js";

const RouteDetailPage = lazy(() =>
  import("../../studio/pages/route-detail.js").then((module) => ({
    default: module.RouteDetailPage,
  })),
);

export type RouteDetailPageSearch = RouteDetailSearch & { record?: string };

export function validateRouteDetailPageSearch(
  search: Record<string, unknown>,
): RouteDetailPageSearch {
  const validated = validateRouteDetailSearch(search);
  if (validated.tab !== "history") return validated;
  const { study: studyValue, record: recordValue } = search;
  const study = boundedHistoryTarget(studyValue);
  const record = boundedHistoryTarget(recordValue);
  if (study !== undefined) return { tab: "history", study };
  return record === undefined ? { tab: "history" } : { tab: "history", record };
}

function boundedHistoryTarget(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 160) return undefined;
  for (const character of trimmed) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) return undefined;
  }
  return trimmed;
}

export const Route = createFileRoute("/routes/$routeId")({
  // Detail and route evidence stay Worker-served; heavy route artifacts remain lazy.
  loader: ({ abortController, params }) =>
    Promise.all([
      fetchStudioRoute(params.routeId, { signal: abortController.signal }),
      fetchStudioRouteEvidence(params.routeId, { signal: abortController.signal }),
      fetchStudioRouteInterventionInventory(params.routeId, {
        signal: abortController.signal,
      }).catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") throw error;
        console.warn("Route intervention inventory request failed; rendering without inventory.", {
          error,
        });
        return null;
      }),
      // Studies rollup is small and nullable; a failure never blocks the page.
      fetchStudioRouteStudies(params.routeId, { signal: abortController.signal }).catch(
        (error: unknown) => {
          if (error instanceof Error && error.name === "AbortError") throw error;
          console.warn("Route studies request failed; rendering without studies.", { error });
          return null;
        },
      ),
      fetchStudioRouteInterventionObservations(params.routeId, {
        signal: abortController.signal,
      }).catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") throw error;
        console.warn(
          "Route intervention observations request failed; rendering without observations.",
          { error },
        );
        return null;
      }),
      import("../../studio/public-intervention-api.js")
        .then((module) =>
          module.fetchPublicRouteInterventionHistory(params.routeId, {
            signal: abortController.signal,
          }),
        )
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === "AbortError") throw error;
          console.warn(
            "Public route intervention history request failed; rendering the legacy history.",
            { error },
          );
          return null;
        }),
    ]).then(([detail, evidence, inventory, studies, observations, publicHistory]) => ({
      detail,
      evidence,
      inventory,
      studies,
      observations,
      publicHistory,
    })),
  validateSearch: (search: Record<string, unknown>): RouteDetailPageSearch =>
    validateRouteDetailPageSearch(search),
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
        inventory={data.inventory}
        observations={data.observations}
        studies={data.studies}
        publicHistory={data.publicHistory}
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
