import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../../../lib/head.js";
import {
  fetchStudioBriefHistory,
  mutableStudioLoaderStaleTimeMs,
} from "../../../studio/api-client.js";
import { BriefHistoryPage } from "../../../studio/pages/brief-workflows.js";

export const Route = createFileRoute("/briefs/$briefId/history")({
  loader: ({ abortController, params }) =>
    fetchStudioBriefHistory(params.briefId, { signal: abortController.signal }),
  staleTime: mutableStudioLoaderStaleTimeMs,
  head: () => routeHead("Brief History"),
  component: BriefHistoryRoute,
});

function BriefHistoryRoute() {
  const data = Route.useLoaderData();
  return <BriefHistoryPage data={data} />;
}
