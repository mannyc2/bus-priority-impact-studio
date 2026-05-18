import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../lib/head.js";
import { DocsPage } from "../studio/pages/docs.js";

export const Route = createFileRoute("/docs")({
  head: () =>
    routeHead(
      "Docs",
      "API, CLI, data credits, and quickstart documentation for Bus Priority Impact Studio.",
    ),
  component: DocsPage,
});
