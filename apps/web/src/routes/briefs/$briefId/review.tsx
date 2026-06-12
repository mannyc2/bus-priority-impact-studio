import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../../../lib/head.js";
import { requireAuthenticatedRoute } from "../../../lib/route-auth.js";
import { fetchStudioBrief, mutableStudioLoaderStaleTimeMs } from "../../../studio/api-client.js";
import { BriefReviewPage } from "../../../studio/pages/brief-workflows.js";

export const Route = createFileRoute("/briefs/$briefId/review")({
  beforeLoad: ({ location }) => requireAuthenticatedRoute({ location, scopes: ["review:briefs"] }),
  loader: ({ abortController, params }) =>
    fetchStudioBrief(params.briefId, { signal: abortController.signal }),
  staleTime: mutableStudioLoaderStaleTimeMs,
  head: () => routeHead("Brief Review"),
  component: BriefReviewRoute,
});

function BriefReviewRoute() {
  const data = Route.useLoaderData();
  return <BriefReviewPage data={data} />;
}
