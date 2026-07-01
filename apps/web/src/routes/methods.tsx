import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../lib/head.js";
import { fetchStudioMethods, staticStudioLoaderStaleTimeMs } from "../studio/api-client.js";
import { MethodsLoadingPage, MethodsPage } from "../studio/pages/methods.js";

export const Route = createFileRoute("/methods")({
  loader: ({ abortController }) => fetchStudioMethods({ signal: abortController.signal }),
  staleTime: staticStudioLoaderStaleTimeMs,
  pendingComponent: MethodsLoadingPage,
  head: () =>
    routeHead(
      "Methods",
      "Sources, caveats, and interpretation rules for Bus Priority Impact Studio.",
    ),
  component: MethodsRoute,
});

function MethodsRoute() {
  const data = Route.useLoaderData();
  return <MethodsPage data={data} />;
}
