import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../../lib/head.js";
import {
  fetchStudioRouteSections,
  fetchStudioRoutes,
  staticStudioLoaderStaleTimeMs,
} from "../../studio/api-client.js";
import { RoutesHomeLoadingPage, RoutesHomePage } from "../../studio/pages/routes-home.js";

export const Route = createFileRoute("/routes/")({
  loader: async ({ abortController }) => {
    const options = { signal: abortController.signal };
    const [routes, routeSections] = await Promise.all([
      fetchStudioRoutes(options),
      fetchStudioRouteSections(options).catch(() => null),
    ]);
    return { routeSections, routes };
  },
  staleTime: staticStudioLoaderStaleTimeMs,
  pendingComponent: RoutesHomeLoadingPage,
  head: () =>
    routeHead(
      "Routes",
      "Search routes and open evidence-backed route pages in Bus Priority Impact Studio.",
    ),
  component: RoutesHomeRoute,
});

function RoutesHomeRoute() {
  const { routeSections, routes } = Route.useLoaderData();
  return <RoutesHomePage routeSections={routeSections} routes={routes.routes} />;
}
