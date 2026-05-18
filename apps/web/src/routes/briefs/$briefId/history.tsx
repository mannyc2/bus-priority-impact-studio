import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../../../lib/head.js";
import { fetchStudioBriefHistory } from "../../../studio/api-client.js";
import { BriefHistoryPage } from "../../../studio/pages/brief-workflows.js";

export const Route = createFileRoute("/briefs/$briefId/history")({
  loader: ({ params }) => fetchStudioBriefHistory(params.briefId),
  head: () => routeHead("Brief History"),
  component: BriefHistoryRoute,
});

function BriefHistoryRoute() {
  const data = Route.useLoaderData();
  return <BriefHistoryPage data={data} />;
}
