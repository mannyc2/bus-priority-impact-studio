import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../lib/head.js";
import { fetchStudioSearch } from "../studio/api-client.js";
import { SearchResultsPage } from "../studio/pages/search-results.js";

type SearchParams = {
  q: string;
};

export const Route = createFileRoute("/search")({
  validateSearch: (search: { q?: unknown }): SearchParams => ({
    q: typeof search.q === "string" && search.q.trim().length > 0 ? search.q : "manhattan ace",
  }),
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: ({ deps }) => fetchStudioSearch(deps.q),
  head: ({ match }) => routeHead(`Search: ${match.search.q}`),
  component: SearchRoute,
});

function SearchRoute() {
  const data = Route.useLoaderData();
  return <SearchResultsPage data={data} />;
}
