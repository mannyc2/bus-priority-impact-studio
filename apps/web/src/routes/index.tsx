import { createFileRoute } from "@tanstack/react-router";
import { useAppPanelContext } from "../App.js";
import { HotspotsPanel } from "../components/HotspotsPanel.js";
import { routeHead } from "../lib/head.js";
import { loadHotspotsData } from "../lib/panel-data.js";
import { asHotspotFilter, type HotspotFilter } from "../lib/route-url.js";

type HotspotsSearch = {
  filter: HotspotFilter;
};

const FILTER_HEAD: Record<HotspotFilter, { title: string; description: string }> = {
  all: {
    title: "Map",
    description: "Scan active NYC bus reliability hotspots and route grades on the map.",
  },
  slow: {
    title: "Slow Routes",
    description: "Review NYC bus routes currently running below expected speeds.",
  },
  bunching: {
    title: "Bunching Hotspots",
    description: "Find NYC bus routes with active bunching and service spacing issues.",
  },
  my: {
    title: "My Routes",
    description: "Review saved bus routes and the reliability issues affecting them now.",
  },
};

export const Route = createFileRoute("/")({
  validateSearch: (search: { filter?: unknown }): HotspotsSearch => ({
    filter: asHotspotFilter(search.filter),
  }),
  loaderDeps: ({ search: { filter } }) => ({ filter }),
  loader: ({ deps: { filter } }) => loadHotspotsData(filter),
  staleTime: 30_000,
  head: ({ match }) => {
    const head = FILTER_HEAD[match.search.filter];
    return routeHead(head.title, head.description);
  },
  component: HotspotsRoutePanel,
});

function HotspotsRoutePanel() {
  const data = Route.useLoaderData();
  const { compact, hoveredRoute, onHoverRoute, onRouteLinkActivate } = useAppPanelContext();

  return (
    <HotspotsPanel
      activeFilter={data.filter}
      compact={compact}
      hoveredRoute={hoveredRoute}
      onHoverRoute={onHoverRoute}
      onRouteActivate={onRouteLinkActivate}
      routes={data.routes}
    />
  );
}
