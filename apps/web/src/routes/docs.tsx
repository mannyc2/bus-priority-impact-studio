import { createFileRoute, redirect } from "@tanstack/react-router";
import { routeHead } from "../lib/head.js";

export const Route = createFileRoute("/docs")({
  beforeLoad: ({ location }) => {
    if (location.pathname === "/docs" || location.pathname === "/docs/") {
      throw redirect({ to: "/docs/$page", params: { page: "overview" }, replace: true });
    }
  },
  head: () => routeHead("Docs", "BPI Studio API docs"),
});
