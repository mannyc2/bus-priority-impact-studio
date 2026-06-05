import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../../../lib/head.js";
import { requireAuthenticatedRoute } from "../../../lib/route-auth.js";
import { fetchStudioRoute } from "../../../studio/api-client.js";
import { RouteAnnotatePage } from "../../../studio/pages/route-annotate.js";

export const Route = createFileRoute("/routes/$routeId/annotate")({
  beforeLoad: ({ location }) => requireAuthenticatedRoute({ location, scopes: ["write:briefs"] }),
  loader: ({ params }) => fetchStudioRoute(params.routeId),
  head: ({ params }) => routeHead(`${params.routeId} Annotate`),
  component: RouteAnnotateRoute,
});

function RouteAnnotateRoute() {
  const data = Route.useLoaderData();
  return <RouteAnnotatePage data={data} />;
}
