import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../../../lib/head.js";
import { requireAuthenticatedRoute } from "../../../lib/route-auth.js";
import { fetchStudioBrief } from "../../../studio/api-client.js";
import { BriefComposerPage } from "../../../studio/pages/brief-workflows.js";

export const Route = createFileRoute("/briefs/$briefId/edit")({
  beforeLoad: ({ location }) => requireAuthenticatedRoute({ location, scopes: ["write:briefs"] }),
  loader: ({ params }) => fetchStudioBrief(params.briefId),
  head: () => routeHead("Brief Composer"),
  component: BriefEditRoute,
});

function BriefEditRoute() {
  const data = Route.useLoaderData();
  return <BriefComposerPage data={data} mode="edit" />;
}
