import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../lib/head.js";
import { RoutesHomePage } from "../studio/pages/routes-home.js";

export const Route = createFileRoute("/")({
  head: () =>
    routeHead(
      "Routes",
      "Search routes and open evidence-backed route pages in Bus Priority Impact Studio.",
    ),
  component: RoutesHomePage,
});
