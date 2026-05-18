import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../../../lib/head.js";
import { RouteLadderPage } from "../../../studio/pages/route-ladder.js";
import { getStudioRoute } from "../../../studio/sample-data.js";

export const Route = createFileRoute("/routes/$routeId/ladder")({
  head: ({ params }) => {
    const route = getStudioRoute(params.routeId);
    return routeHead(route ? `${route.label} Route Ladder` : "Route Not Found");
  },
  component: RouteLadderRoute,
});

function RouteLadderRoute() {
  const routeId = Route.useParams({ select: (params) => params.routeId });
  return <RouteLadderPage routeSlug={routeId} />;
}
