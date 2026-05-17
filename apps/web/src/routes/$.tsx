import { createFileRoute, Link } from "@tanstack/react-router";
import { PanelHeader } from "../components/PanelHeader.js";
import { routeHead } from "../lib/head.js";
import { DEFAULT_HOTSPOT_FILTER } from "../lib/route-url.js";
import { colors } from "../lib/tokens.js";

export const Route = createFileRoute("/$")({
  head: () => routeHead("Not Found", "That BusPulse view is not available in this workspace yet."),
  component: NotFoundRoutePanel,
});

function NotFoundRoutePanel() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PanelHeader
        title="Route not found"
        subtitle="That view is not available in this workspace yet."
      />
      <Link
        to="/"
        search={{ filter: DEFAULT_HOTSPOT_FILTER }}
        viewTransition
        style={{
          alignSelf: "flex-start",
          borderRadius: 9999,
          background: colors.accent,
          color: "#fff",
          fontWeight: 700,
          padding: "10px 14px",
          textDecoration: "none",
        }}
      >
        Back to map
      </Link>
    </div>
  );
}
