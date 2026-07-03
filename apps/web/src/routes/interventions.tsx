import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../lib/head.js";
import {
  fetchStudioRouteEvidence,
  fetchStudioRouteIndex,
  fetchStudioRoutes,
  staticStudioLoaderStaleTimeMs,
  timelineEvidenceRouteSlugs,
} from "../studio/api-client.js";
import { InterventionsLoadingPage, InterventionsPage } from "../studio/pages/interventions.js";

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export const Route = createFileRoute("/interventions")({
  loader: async ({ abortController }) => {
    const [routes, routeIndexResult] = await Promise.all([
      fetchStudioRoutes({ signal: abortController.signal }),
      fetchStudioRouteIndex({ signal: abortController.signal }).then(
        (routeIndex) => ({ ok: true, routeIndex }) as const,
        (error: unknown) => ({ ok: false, error }) as const,
      ),
    ]);

    if (!routeIndexResult.ok) {
      if (isAbortError(routeIndexResult.error)) throw routeIndexResult.error;
      console.warn("Interventions route index request failed; skipping route evidence fanout.", {
        error: routeIndexResult.error,
      });
      return { routes, evidence: [] };
    }

    const evidence = await Promise.all(
      timelineEvidenceRouteSlugs(routeIndexResult.routeIndex).map((slug) =>
        fetchStudioRouteEvidence(slug, { signal: abortController.signal }),
      ),
    );
    return { routes, evidence };
  },
  staleTime: staticStudioLoaderStaleTimeMs,
  pendingComponent: InterventionsLoadingPage,
  head: () =>
    routeHead(
      "Interventions",
      "Browse bus-priority intervention timelines and before/after context by route.",
    ),
  component: InterventionsRoute,
});

function InterventionsRoute() {
  const data = Route.useLoaderData();
  return <InterventionsPage routes={data.routes.routes} evidence={data.evidence} />;
}
