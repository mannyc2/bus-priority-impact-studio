import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import { preloadNetworkMap } from "../components/route/NetworkMapLibre.js";
import { validateNetworkMapSearch } from "../components/route/network-map-search.js";
import { routeHead } from "../lib/head.js";
import {
  fetchNetworkMapGeo,
  fetchStudioRoutes,
  fetchStudioStudiesIndex,
  joinNetworkMapBundle,
  staticStudioLoaderStaleTimeMs,
} from "../studio/api-client.js";
import { NetworkMapLoadingPage, NetworkMapPage } from "../studio/pages/network-map.js";

export const Route = createFileRoute("/map")({
  validateSearch: validateNetworkMapSearch,
  loader: async ({ abortController }) => {
    preloadNetworkMap();
    const options = { signal: abortController.signal };
    const [routes, bundle, studyIndex] = await Promise.all([
      fetchStudioRoutes(options),
      fetchNetworkMapGeo(options),
      // The studies index only feeds popup links; a failure never blocks the map.
      fetchStudioStudiesIndex(options).catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") throw error;
        console.warn("Studies index request failed; map popups render without study links.", {
          error,
        });
        return null;
      }),
    ]);
    const joined = joinNetworkMapBundle(bundle);
    const contextMessage =
      bundle?.context.status === "integrity_mismatch"
        ? `Borough context failed integrity verification (expected ${bundle.context.expectedSha256}, received ${bundle.context.actualSha256}).`
        : null;
    return {
      routes: routes.routes,
      network: joined.collection,
      studyIndex: studyIndex?.studies ?? null,
      context: bundle?.context.status === "ready" ? bundle.context.data : null,
      mapMessage:
        [joined.message, contextMessage].filter((message) => message !== null).join(" ") || null,
      manifest: bundle?.manifest ?? null,
      // Coverage window of the served delay facts (unanimous analysis period);
      // null keeps the rider-delay lens hidden without weakening its gate.
      coverageEnd: joined.delayCoverageEnd,
      completeFactCount: joined.completeFactCount,
      factsStatus: joined.factsStatus,
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
  head: () => routeHead("Network Map", "Citywide bus route speed and rider-delay map."),
  component: MapRoute,
});

function MapRoute() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const onSearchChange = useCallback(
    (next: Parameters<typeof NetworkMapPage>[0]["search"], options: { replace: boolean }) =>
      navigate({ search: next, replace: options.replace }),
    [navigate],
  );
  return (
    <NetworkMapPage
      routes={data.routes}
      network={data.network}
      context={data.context}
      mapMessage={data.mapMessage}
      manifest={data.manifest}
      coverageEnd={data.coverageEnd}
      lanesAvailable={data.lanesAvailable}
      studyIndex={data.studyIndex}
      completeFactCount={data.completeFactCount}
      factsStatus={data.factsStatus}
      search={search}
      onSearchChange={onSearchChange}
    />
  );
}
