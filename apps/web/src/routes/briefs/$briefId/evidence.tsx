import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../../../lib/head.js";
import { BriefEvidencePage } from "../../../studio/pages/brief-workflows.js";
import { getStudioBrief } from "../../../studio/sample-data.js";

export const Route = createFileRoute("/briefs/$briefId/evidence")({
  head: ({ params }) => {
    const brief = getStudioBrief(params.briefId);
    return routeHead(brief ? `${brief.title} Evidence` : "Brief Not Found");
  },
  component: BriefEvidenceRoute,
});

function BriefEvidenceRoute() {
  const briefId = Route.useParams({ select: (params) => params.briefId });
  return <BriefEvidencePage briefId={briefId} />;
}
