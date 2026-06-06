import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../../lib/head.js";
import { fetchStudioRouteSections, fetchStudioRoutes } from "../../studio/api-client.js";
import { RoutesHomeLoadingPage, RoutesHomePage } from "../../studio/pages/routes-home.js";

export const Route = createFileRoute("/routes/")({
  loader: async () => {
    const [routes, routeSections] = await Promise.all([
      fetchStudioRoutes(),
      fetchStudioRouteSections().catch(() => null),
    ]);
    return { routeSections, routes };
  },
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
