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
      "Speed and reliability for every NYC bus route — monthly speeds, slow segments, ridership, and documented street treatments from public MTA and NYC DOT data.",
    ),
  component: HomeRoute,
});

function HomeRoute() {
  const data = Route.useLoaderData();
  return <HomePage routes={data.routes} />;
}
