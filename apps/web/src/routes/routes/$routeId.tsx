import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../../lib/head.js";
import { fetchStudioRoute } from "../../studio/api-client.js";
import { RouteDetailPage } from "../../studio/pages/route-detail.js";

export const Route = createFileRoute("/routes/$routeId")({
  loader: ({ params }) => fetchStudioRoute(params.routeId),
  head: ({ params }) => routeHead(`${params.routeId} Route Detail`),
  component: RouteDetailRoute,
});

function RouteDetailRoute() {
  const data = Route.useLoaderData();
  return <RouteDetailPage data={data} />;
}
