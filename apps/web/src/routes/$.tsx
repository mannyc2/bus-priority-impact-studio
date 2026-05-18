import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../lib/head.js";
import { NotFoundPage } from "../studio/pages/not-found.js";

export const Route = createFileRoute("/$")({
  head: () => routeHead("Not Found"),
  component: NotFoundPage,
});
