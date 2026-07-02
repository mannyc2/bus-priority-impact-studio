import {
  createRootRoute,
  type ErrorComponentProps,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { AppShell } from "../App.js";
import { routeHead } from "../lib/head.js";
import { StudioRouteErrorPage } from "../studio/pages/error.js";

export const Route = createRootRoute({
  head: () =>
    routeHead(
      "Bus Priority Impact Studio",
      "Build evidence-backed NYC bus route pages, intervention timelines, maps, and methods.",
    ),
  component: RootComponent,
  errorComponent: RootErrorComponent,
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

function RootErrorComponent({ error, reset }: ErrorComponentProps) {
  return (
    <>
      <HeadContent />
      <AppShell>
        <StudioRouteErrorPage error={error} reset={reset} />
      </AppShell>
      <Scripts />
    </>
  );
}
