import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { AppShell } from "../App.js";
import { routeHead } from "../lib/head.js";

export const Route = createRootRoute({
  head: () =>
    routeHead(
      "BusPulse",
      "Track NYC bus priority, route reliability, hotspots, comparisons, and rider reports.",
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
