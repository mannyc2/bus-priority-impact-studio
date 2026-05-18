import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../lib/head.js";
import { FindingsFeedPage } from "../studio/pages/findings-feed.js";

export const Route = createFileRoute("/findings")({
  head: () => routeHead("Findings"),
  component: FindingsFeedPage,
});
