import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../../../lib/head.js";
import { BriefReviewPage } from "../../../studio/pages/brief-workflows.js";
import { getStudioBrief } from "../../../studio/sample-data.js";

export const Route = createFileRoute("/briefs/$briefId/review")({
  head: ({ params }) => {
    const brief = getStudioBrief(params.briefId);
    return routeHead(brief ? `${brief.title} Review` : "Brief Not Found");
  },
  component: BriefReviewRoute,
});

function BriefReviewRoute() {
  const briefId = Route.useParams({ select: (params) => params.briefId });
  return <BriefReviewPage briefId={briefId} />;
}
