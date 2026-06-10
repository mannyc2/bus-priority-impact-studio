import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { routeHead } from "../../lib/head.js";
import { fetchStudioRoute } from "../../studio/api-client.js";

const RouteDetailPage = lazy(() =>
  import("../../studio/pages/route-detail.js").then((module) => ({
    default: module.RouteDetailPage,
  })),
);

export const Route = createFileRoute("/routes/$routeId")({
  // One Tier-1 fetch (C2): history series ride in on the detail dossier.
  loader: ({ params }) => fetchStudioRoute(params.routeId).then((detail) => ({ detail })),
  pendingComponent: RouteDetailRouteFallback,
  head: ({ params }) => routeHead(`${params.routeId} Route Detail`),
  component: RouteDetailRoute,
});

function RouteDetailRoute() {
  const data = Route.useLoaderData();
  return (
    <Suspense fallback={<RouteDetailRouteFallback />}>
      <RouteDetailPage data={data.detail} />
    </Suspense>
  );
}

function RouteDetailRouteFallback() {
  return (
    <main className="min-h-full bg-[var(--bp-color-paper)] p-7 text-[var(--bp-color-ink)]">
      <div className="rounded-[3px] bg-[var(--bp-color-card)] p-5 shadow-[0_0_0_1px_var(--bp-color-rule)]">
        <div className="h-6 w-64 animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]" />
        <div className="mt-4 grid grid-cols-5 gap-6 max-lg:grid-cols-2 max-sm:grid-cols-1">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <div className="h-3 w-24 animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]" />
              <div className="h-7 w-28 animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]" />
              <div className="h-3 w-32 animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]" />
            </div>
          ))}
        </div>
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
