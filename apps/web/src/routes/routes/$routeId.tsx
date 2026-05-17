import { createFileRoute } from "@tanstack/react-router";
import { useAppPanelContext } from "../../App.js";
import { RouteProfilePanel } from "../../components/RouteProfilePanel.js";
import { routeHead } from "../../lib/head.js";
import { loadRouteProfileData } from "../../lib/panel-data.js";
import { asRouteProfileTab, type RouteProfileTab, routeFromUrlId } from "../../lib/route-url.js";

type RouteDetailSearch = {
  tab: RouteProfileTab;
};

export const Route = createFileRoute("/routes/$routeId")({
  params: {
    parse: ({ routeId }) => ({ routeId: routeId.toLowerCase() }),
    stringify: ({ routeId }) => ({ routeId }),
  },
  validateSearch: (search: { tab?: unknown }): RouteDetailSearch => ({
    tab: asRouteProfileTab(search.tab),
  }),
  loader: ({ params: { routeId } }) => loadRouteProfileData(routeId),
  staleTime: 30_000,
  head: ({ match, params }) => {
    const route = routeFromUrlId(params.routeId);
    if (!route) return routeHead("Route Profile");

    const tabLabel = match.search.tab === "overview" ? "Profile" : match.search.tab;
    return routeHead(
      `${route.name} ${tabLabel}`,
      `${route.name} on ${route.corridor}: ${route.speed} mph average speed, ${route.bunching}% bunching, and ${route.reports} rider reports.`,
    );
  },
  component: RouteDetailRoutePanel,
});

function RouteDetailRoutePanel() {
  const route = Route.useLoaderData();
  const { tab } = Route.useSearch();
  const { compact, onClosePanel, onCompareRoute } = useAppPanelContext();

  return (
    <RouteProfilePanel
      compact={compact}
      onClose={onClosePanel}
      onCompare={onCompareRoute}
      route={route}
      tab={tab}
    />
  );
}
