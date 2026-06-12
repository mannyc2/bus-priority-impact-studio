import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../../../lib/head.js";
import { fetchStudioRoute, mutableStudioLoaderStaleTimeMs } from "../../../studio/api-client.js";
import { RouteAnnotatePage } from "../../../studio/pages/route-annotate.js";

export const Route = createFileRoute("/routes/$routeId/annotate")({
  loader: ({ abortController, params }) =>
    fetchStudioRoute(params.routeId, { signal: abortController.signal }),
  staleTime: mutableStudioLoaderStaleTimeMs,
  head: ({ params }) => routeHead(`${params.routeId} Annotate`),
  component: RouteAnnotateRoute,
});

function RouteAnnotateRoute() {
  const data = Route.useLoaderData();
  return <RouteAnnotatePage data={data} />;
}
