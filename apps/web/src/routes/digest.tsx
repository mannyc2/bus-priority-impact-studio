import { createFileRoute } from "@tanstack/react-router";
import { useAppPanelContext } from "../App.js";
import { DigestPanel } from "../components/DigestPanel.js";
import { routeHead } from "../lib/head.js";
import { loadDigestData } from "../lib/panel-data.js";

export const Route = createFileRoute("/digest")({
  loader: loadDigestData,
  staleTime: 60_000,
  head: () =>
    routeHead("Weekly Digest", "See the latest NYC bus priority updates for followed routes."),
  component: DigestRoutePanel,
});

function DigestRoutePanel() {
  const { miniRoutes } = Route.useLoaderData();
  const { compact, onHoverRoute, onRouteLinkActivate } = useAppPanelContext();

  return (
    <DigestPanel
      compact={compact}
      miniRoutes={miniRoutes}
      onHoverRoute={onHoverRoute}
      onRouteActivate={onRouteLinkActivate}
    />
  );
}
