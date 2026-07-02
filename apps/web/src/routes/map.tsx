import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../lib/head.js";
import {
  fetchMapContext,
  fetchNetworkMapGeo,
  fetchStudioRoutes,
  staticStudioLoaderStaleTimeMs,
} from "../studio/api-client.js";
import { NetworkMapLoadingPage, NetworkMapPage } from "../studio/pages/network-map.js";

export const Route = createFileRoute("/map")({
  loader: async ({ abortController }) => {
    const options = { signal: abortController.signal };
    const [routes, network, context] = await Promise.all([
      fetchStudioRoutes(options),
      fetchNetworkMapGeo(options),
      fetchMapContext(options).catch(() => null),
    ]);
    return { routes: routes.routes, network, context };
  },
  staleTime: staticStudioLoaderStaleTimeMs,
  pendingComponent: NetworkMapLoadingPage,
  head: () => routeHead("Network Map", "Citywide bus route speed map."),
  component: MapRoute,
});

function MapRoute() {
  const data = Route.useLoaderData();
  return <NetworkMapPage routes={data.routes} network={data.network} context={data.context} />;
}
