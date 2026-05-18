import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../../../lib/head.js";
import { BriefComposerPage } from "../../../studio/pages/brief-workflows.js";
import { getStudioBrief } from "../../../studio/sample-data.js";

export const Route = createFileRoute("/briefs/$briefId/edit")({
  head: ({ params }) => {
    const brief = getStudioBrief(params.briefId);
    return routeHead(brief ? `${brief.title} Composer` : "Brief Not Found");
  },
  component: BriefEditRoute,
});

function BriefEditRoute() {
  const briefId = Route.useParams({ select: (params) => params.briefId });
  return <BriefComposerPage briefId={briefId} />;
}
