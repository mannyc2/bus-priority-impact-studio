import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../lib/head.js";
import { fetchStudioCompare } from "../studio/api-client.js";
import { ComparePage } from "../studio/pages/compare.js";

type CompareSearch = {
  a: string;
  b: string;
};

export const Route = createFileRoute("/compare")({
  validateSearch: (search: { a?: unknown; b?: unknown }): CompareSearch => ({
    a: typeof search.a === "string" ? search.a : "m15-sbs",
    b: typeof search.b === "string" ? search.b : "bx12-sbs",
  }),
  loaderDeps: ({ search }) => ({ a: search.a, b: search.b }),
  loader: ({ deps }) => fetchStudioCompare(deps.a, deps.b),
  head: () => routeHead("Compare Routes"),
  component: CompareRoute,
});

function CompareRoute() {
  const data = Route.useLoaderData();
  return <ComparePage data={data} />;
}
