import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../lib/head.js";
import { fetchStudioRoutes } from "../studio/api-client.js";
import { HomeLoadingPage, HomePage } from "../studio/pages/home.js";

export const Route = createFileRoute("/")({
  loader: fetchStudioRoutes,
  pendingComponent: HomeLoadingPage,
  head: () =>
    routeHead(
      "Bus Priority Impact Studio",
      "Track every NYC bus route the city's speed-up program has touched — route by route, in plain numbers, from public MTA and NYC DOT data.",
    ),
  component: HomeRoute,
});

function HomeRoute() {
  const routes = Route.useLoaderData({ select: (data) => data.routes });
  return <HomePage routes={routes} />;
}
