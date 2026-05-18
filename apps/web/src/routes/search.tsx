import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../lib/head.js";
import { SearchResultsPage } from "../studio/pages/search-results.js";

type SearchParams = {
  q: string;
};

export const Route = createFileRoute("/search")({
  validateSearch: (search: { q?: unknown }): SearchParams => ({
    q: typeof search.q === "string" && search.q.trim().length > 0 ? search.q : "manhattan ace",
  }),
  head: ({ match }) => routeHead(`Search: ${match.search.q}`),
  component: SearchRoute,
});

function SearchRoute() {
  const q = Route.useSearch({ select: (search) => search.q });
  return <SearchResultsPage query={q} />;
}
