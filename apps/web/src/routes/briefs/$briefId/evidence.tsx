import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../../../lib/head.js";
import {
  editorialStudioLoaderStaleTimeMs,
  fetchStudioBriefEvidence,
} from "../../../studio/api-client.js";
import { BriefEvidencePage } from "../../../studio/pages/brief-workflows.js";

export const Route = createFileRoute("/briefs/$briefId/evidence")({
  loader: ({ abortController, params }) =>
    fetchStudioBriefEvidence(params.briefId, { signal: abortController.signal }),
  staleTime: editorialStudioLoaderStaleTimeMs,
  head: () => routeHead("Brief Evidence"),
  component: BriefEvidenceRoute,
});

function BriefEvidenceRoute() {
  const data = Route.useLoaderData();
  return <BriefEvidencePage data={data} />;
}
