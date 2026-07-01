import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../lib/head.js";
import { fetchStudioRoutes, staticStudioLoaderStaleTimeMs } from "../studio/api-client.js";
import {
  InterventionsLoadingPage,
  InterventionsPage,
} from "../studio/pages/interventions.js";

export const Route = createFileRoute("/interventions")({
  loader: ({ abortController }) => fetchStudioRoutes({ signal: abortController.signal }),
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
  const routes = Route.useLoaderData({ select: (data) => data.routes });
  return <InterventionsPage routes={routes} />;
}
