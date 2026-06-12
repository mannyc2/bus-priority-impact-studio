import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../../lib/head.js";
import { fetchStudioFinding, staticStudioLoaderStaleTimeMs } from "../../studio/api-client.js";
import { FindingDetailPage } from "../../studio/pages/finding-detail.js";

export const Route = createFileRoute("/findings/$findingId")({
  loader: ({ abortController, params }) =>
    fetchStudioFinding(params.findingId, { signal: abortController.signal }),
  staleTime: staticStudioLoaderStaleTimeMs,
  head: () => routeHead("Finding"),
  component: FindingRoute,
});

function FindingRoute() {
  const data = Route.useLoaderData();
  return <FindingDetailPage data={data} />;
}
