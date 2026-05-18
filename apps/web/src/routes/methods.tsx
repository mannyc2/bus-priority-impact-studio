import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../lib/head.js";
import { fetchStudioMethods } from "../studio/api-client.js";
import { MethodsPage } from "../studio/pages/methods.js";

export const Route = createFileRoute("/methods")({
  loader: fetchStudioMethods,
  head: () => routeHead("Methods"),
  component: MethodsRoute,
});

function MethodsRoute() {
  const data = Route.useLoaderData();
  return <MethodsPage data={data} />;
}
