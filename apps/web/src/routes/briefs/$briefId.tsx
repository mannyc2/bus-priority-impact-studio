import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../../lib/head.js";
import { BriefReadingPage } from "../../studio/pages/briefs.js";
import { getStudioBrief } from "../../studio/sample-data.js";

export const Route = createFileRoute("/briefs/$briefId")({
  head: ({ params }) => routeHead(getStudioBrief(params.briefId)?.title ?? "Brief Not Found"),
  component: BriefRoute,
});

function BriefRoute() {
  const briefId = Route.useParams({ select: (params) => params.briefId });
  return <BriefReadingPage briefId={briefId} />;
}
