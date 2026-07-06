import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { routeHead } from "../../lib/head.js";
import { fetchStudioRoutes, staticStudioLoaderStaleTimeMs } from "../../studio/api-client.js";

const RoutesDirectoryPage = lazy(() =>
  import("../../studio/pages/routes-directory.js").then((module) => ({
    default: module.RoutesDirectoryPage,
  })),
);

export const Route = createFileRoute("/routes/")({
  // The directory page holds the full ~380-row table; keep it lazy so it stays
  // out of the entry chunk (loader/head import no VALUE from the page module).
  loader: ({ abortController }) => fetchStudioRoutes({ signal: abortController.signal }),
  staleTime: staticStudioLoaderStaleTimeMs,
  validateSearch: (search: Record<string, unknown>) => {
    const q = search["q"];
    const borough = search["borough"];
    return {
      ...(typeof q === "string" && q ? { q } : {}),
      ...(typeof borough === "string" && borough ? { borough } : {}),
    };
  },
  pendingComponent: RoutesDirectoryRouteFallback,
  head: () =>
    routeHead(
      "Routes",
      "Browse every NYC bus route in the index — grouped by borough, sorted by daily riders, filterable by route, corridor, or borough.",
    ),
  component: RoutesDirectoryRoute,
});

function RoutesDirectoryRoute() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  return (
    <Suspense fallback={<RoutesDirectoryRouteFallback />}>
      <RoutesDirectoryPage
        routes={data.routes}
        initialQuery={search.q}
        initialBorough={search.borough}
      />
    </Suspense>
  );
}

function RoutesDirectoryRouteFallback() {
  return (
    <main className="min-h-full bg-[var(--bp-color-paper)] p-7 text-[var(--bp-color-ink)]">
      <div className="mx-auto max-w-[1180px] space-y-3">
        <div className="h-7 w-40 animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]" />
        <div className="mt-4 space-y-3 rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="h-11 animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
