import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../lib/head.js";
import {
  fetchNetworkMapGeo,
  fetchStudioRoutes,
  joinNetworkMapBundle,
  staticStudioLoaderStaleTimeMs,
} from "../studio/api-client.js";
import { NetworkMapLoadingPage, NetworkMapPage } from "../studio/pages/network-map.js";

export const Route = createFileRoute("/map")({
  loader: async ({ abortController }) => {
    const options = { signal: abortController.signal };
    const [routes, bundle] = await Promise.all([
      fetchStudioRoutes(options),
      fetchNetworkMapGeo(options),
    ]);
    const joined = joinNetworkMapBundle(bundle);
    const contextMessage =
      bundle?.context.status === "integrity_mismatch"
        ? `Borough context failed integrity verification (expected ${bundle.context.expectedSha256}, received ${bundle.context.actualSha256}).`
        : null;
    return {
      routes: routes.routes,
      network: joined.collection,
      context: bundle?.context.status === "ready" ? bundle.context.data : null,
      mapMessage:
        [joined.message, contextMessage].filter((message) => message !== null).join(" ") || null,
      lanesAvailable:
        bundle?.manifest.layers.some(
          (layer) =>
            layer.layerId === "bus_lanes" &&
            layer.readiness === "available" &&
            layer.currencyStatus === "current" &&
            layer.artifactKey !== null,
        ) ?? false,
    };
  },
  staleTime: staticStudioLoaderStaleTimeMs,
  pendingComponent: NetworkMapLoadingPage,
  head: () => routeHead("Network Map", "Citywide bus route speed map."),
  component: MapRoute,
});

function MapRoute() {
  const data = Route.useLoaderData();
  return (
    <NetworkMapPage
      routes={data.routes}
      network={data.network}
      context={data.context}
      mapMessage={data.mapMessage}
      lanesAvailable={data.lanesAvailable}
    />
  );
}
