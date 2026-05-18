import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../../lib/head.js";
import { RouteDetailPage } from "../../studio/pages/route-detail.js";
import { getStudioRoute } from "../../studio/sample-data.js";

export const Route = createFileRoute("/routes/$routeId")({
  head: ({ params }) => {
    const route = getStudioRoute(params.routeId);
    return routeHead(route ? `${route.label} Route Detail` : "Route Not Found", route?.diagnosis);
  },
  component: RouteDetailRoute,
});

function RouteDetailRoute() {
  const routeId = Route.useParams({ select: (params) => params.routeId });
  return <RouteDetailPage routeSlug={routeId} />;
}
