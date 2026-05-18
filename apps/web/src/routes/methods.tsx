import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../lib/head.js";
import { MethodsPage } from "../studio/pages/methods.js";

export const Route = createFileRoute("/methods")({
  head: () => routeHead("Methods"),
  component: MethodsPage,
});
