import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../../../lib/head.js";
import { fetchStudioRouteLadder } from "../../../studio/api-client.js";
import { RouteLadderPage } from "../../../studio/pages/route-ladder.js";

export const Route = createFileRoute("/routes/$routeId/ladder")({
  loader: ({ params }) => fetchStudioRouteLadder(params.routeId),
  head: ({ params }) => routeHead(`${params.routeId} Route Ladder`),
  component: RouteLadderRoute,
});

function RouteLadderRoute() {
  const data = Route.useLoaderData();
  return <RouteLadderPage data={data} />;
}
