import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../../lib/head.js";
import { DocsPage, DOCS_PAGE_ORDER } from "../../studio/pages/docs.js";

export const Route = createFileRoute("/docs/$page")({
  head: ({ params }) => {
    const isValid = (DOCS_PAGE_ORDER as readonly string[]).includes(params.page);
    return routeHead(isValid ? `Docs - ${params.page}` : "Docs", "BPI Studio API docs");
  },
  component: DocsPageRoute,
});

function DocsPageRoute() {
  const page = Route.useParams({ select: (params) => params.page });
  return <DocsPage page={page} />;
}
