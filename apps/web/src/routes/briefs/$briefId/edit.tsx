import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../../../lib/head.js";
import { fetchStudioBrief, mutableStudioLoaderStaleTimeMs } from "../../../studio/api-client.js";
import { BriefComposerPage } from "../../../studio/pages/brief-workflows.js";

export const Route = createFileRoute("/briefs/$briefId/edit")({
  loader: ({ abortController, params }) =>
    fetchStudioBrief(params.briefId, { signal: abortController.signal }),
  staleTime: mutableStudioLoaderStaleTimeMs,
  head: () => routeHead("Brief Composer"),
  component: BriefEditRoute,
});

function BriefEditRoute() {
  const data = Route.useLoaderData();
  return <BriefComposerPage data={data} mode="edit" />;
}
