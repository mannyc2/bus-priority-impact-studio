import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../lib/head.js";
import {
  fetchStudioRouteEvidence,
  fetchStudioRoutes,
  staticStudioLoaderStaleTimeMs,
} from "../studio/api-client.js";
import { InterventionsLoadingPage, InterventionsPage } from "../studio/pages/interventions.js";

export const Route = createFileRoute("/interventions")({
  loader: async ({ abortController }) => {
    const routes = await fetchStudioRoutes({ signal: abortController.signal });
    const evidence = await Promise.all(
      routes.routes.map((route) =>
        fetchStudioRouteEvidence(route.slug, { signal: abortController.signal }),
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
