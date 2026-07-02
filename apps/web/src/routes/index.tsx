import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../lib/head.js";
import { fetchStudioRoutes, staticStudioLoaderStaleTimeMs } from "../studio/api-client.js";
import { HomeLoadingPage, HomePage } from "../studio/pages/home.js";

export const Route = createFileRoute("/")({
  loader: ({ abortController }) => fetchStudioRoutes({ signal: abortController.signal }),
  staleTime: staticStudioLoaderStaleTimeMs,
  pendingComponent: HomeLoadingPage,
  head: () =>
    routeHead(
      "Bus Priority Impact Studio",
      "Track every NYC bus route the city's speed-up program has touched — route by route, in plain numbers, from public MTA and NYC DOT data.",
    ),
  component: HomeRoute,
});

function HomeRoute() {
  const data = Route.useLoaderData();
  return <HomePage generatedAt={data.generatedAt} routes={data.routes} />;
}
