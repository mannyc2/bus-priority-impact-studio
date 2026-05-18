import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../lib/head.js";
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
  head: () => routeHead("Compare Routes"),
  component: CompareRoute,
});

function CompareRoute() {
  const a = Route.useSearch({ select: (search) => search.a });
  const b = Route.useSearch({ select: (search) => search.b });
  return <ComparePage a={a} b={b} />;
}
