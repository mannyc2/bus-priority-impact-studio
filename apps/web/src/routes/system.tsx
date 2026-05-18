import { createFileRoute } from "@tanstack/react-router";
import { DesignSystemPanel } from "../components/DesignSystemPanel.js";
import { routeHead } from "../lib/head.js";

export const Route = createFileRoute("/system")({
  head: () =>
    routeHead(
      "Design System",
      "Review the Bus Priority Impact Studio design-system primitives ported from the design bundle.",
    ),
  component: DesignSystemRoutePanel,
});

function DesignSystemRoutePanel() {
  return <DesignSystemPanel />;
}
