import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../../lib/head.js";
import { editorialStudioLoaderStaleTimeMs, fetchStudioBrief } from "../../studio/api-client.js";
import { BriefReadingPage } from "../../studio/pages/briefs.js";

export const Route = createFileRoute("/briefs/$briefId")({
  loader: ({ abortController, params }) =>
    fetchStudioBrief(params.briefId, { signal: abortController.signal }),
  staleTime: editorialStudioLoaderStaleTimeMs,
  head: () => routeHead("Brief"),
  component: BriefRoute,
});

function BriefRoute() {
  const data = Route.useLoaderData();
  return <BriefReadingPage data={data} />;
}
