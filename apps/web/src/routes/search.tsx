import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../lib/head.js";
import { fetchStudioRoutes, fetchStudioSearch } from "../studio/api-client.js";
import { SearchResultsPage } from "../studio/pages/search-results.js";

type SearchParams = {
  q: string;
};

export const Route = createFileRoute("/search")({
  validateSearch: (search: { q?: unknown }): SearchParams => ({
    q: typeof search.q === "string" && search.q.trim().length > 0 ? search.q : "manhattan ace",
  }),
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: async ({ deps }) => {
    const [data, routes] = await Promise.all([fetchStudioSearch(deps.q), fetchStudioRoutes()]);
    return { data, allRoutes: routes.routes };
  },
  head: ({ match }) => routeHead(`Search: ${match.search.q}`),
  component: SearchRoute,
});

function SearchRoute() {
  const { data, allRoutes } = Route.useLoaderData();
  return <SearchResultsPage data={data} allRoutes={allRoutes} />;
}
