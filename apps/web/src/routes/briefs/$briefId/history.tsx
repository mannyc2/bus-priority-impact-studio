import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../../../lib/head.js";
import { BriefHistoryPage } from "../../../studio/pages/brief-workflows.js";
import { getStudioBrief } from "../../../studio/sample-data.js";

export const Route = createFileRoute("/briefs/$briefId/history")({
  head: ({ params }) => {
    const brief = getStudioBrief(params.briefId);
    return routeHead(brief ? `${brief.title} History` : "Brief Not Found");
  },
  component: BriefHistoryRoute,
});

function BriefHistoryRoute() {
  const briefId = Route.useParams({ select: (params) => params.briefId });
  return <BriefHistoryPage briefId={briefId} />;
}
