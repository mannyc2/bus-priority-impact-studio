import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../lib/head.js";
import { fetchStudioFindings } from "../studio/api-client.js";
import { FindingsFeedLoadingPage, FindingsFeedPage } from "../studio/pages/findings-feed.js";

export const Route = createFileRoute("/findings")({
  loader: fetchStudioFindings,
  pendingComponent: FindingsFeedLoadingPage,
  head: () => routeHead("Findings"),
  component: FindingsRoute,
});

function FindingsRoute() {
  const data = Route.useLoaderData();
  return <FindingsFeedPage data={data} />;
}
