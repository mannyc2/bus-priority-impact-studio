import { createFileRoute } from "@tanstack/react-router";
import { useAppPanelContext } from "../App.js";
import { ComparisonPanel } from "../components/ComparisonPanel.js";
import { routeHead } from "../lib/head.js";
import { loadCompareData } from "../lib/panel-data.js";
import { asCompareRouteName, DEFAULT_COMPARE_ROUTES } from "../lib/route-url.js";

type CompareSearch = {
  a: string;
  b: string;
};

export const Route = createFileRoute("/compare")({
  validateSearch: (search: { a?: unknown; b?: unknown }): CompareSearch => ({
    a: asCompareRouteName(search.a, DEFAULT_COMPARE_ROUTES[0]),
    b: asCompareRouteName(search.b, DEFAULT_COMPARE_ROUTES[1]),
  }),
  loaderDeps: ({ search: { a, b } }) => ({ a, b }),
  loader: ({ deps: { a, b } }) => loadCompareData(a, b),
  staleTime: 30_000,
  head: ({ match }) =>
    routeHead(
      `${match.search.a} vs ${match.search.b}`,
      `Compare reliability, speed, bunching, reports, and ridership signals for ${match.search.a} and ${match.search.b}.`,
    ),
  component: CompareRoutePanel,
});

function CompareRoutePanel() {
  const { routeA, routeB } = Route.useLoaderData();
  const { compact, onClosePanel } = useAppPanelContext();

  return (
    <ComparisonPanel routeA={routeA} routeB={routeB} compact={compact} onClose={onClosePanel} />
  );
}
