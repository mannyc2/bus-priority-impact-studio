import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../../lib/head.js";
import { FindingDetailPage } from "../../studio/pages/finding-detail.js";
import { getStudioFinding } from "../../studio/sample-data.js";

export const Route = createFileRoute("/findings/$findingId")({
  head: ({ params }) => routeHead(getStudioFinding(params.findingId)?.title ?? "Finding Not Found"),
  component: FindingRoute,
});

function FindingRoute() {
  const findingId = Route.useParams({ select: (params) => params.findingId });
  return <FindingDetailPage findingId={findingId} />;
}
