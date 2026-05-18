import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../lib/head.js";
import { fetchStudioRoutes } from "../studio/api-client.js";
import { RoutesHomePage } from "../studio/pages/routes-home.js";

export const Route = createFileRoute("/")({
  loader: fetchStudioRoutes,
  head: () =>
    routeHead(
      "Routes",
      "Search routes and open evidence-backed route pages in Bus Priority Impact Studio.",
    ),
  component: RoutesHomeRoute,
});

function RoutesHomeRoute() {
  const routes = Route.useLoaderData({ select: (data) => data.routes });
  return <RoutesHomePage routes={routes} />;
}
