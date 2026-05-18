import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { AppShell } from "../App.js";
import { routeHead } from "../lib/head.js";

export const Route = createRootRoute({
  head: () =>
    routeHead(
      "Bus Priority Impact Studio",
      "Build evidence-backed NYC bus priority route pages, findings, and cited briefs.",
    ),
  component: RootComponent,
  notFoundComponent: RootComponent,
});

function RootComponent() {
  return (
    <>
      <HeadContent />
      <AppShell />
      <Scripts />
    </>
  );
}
