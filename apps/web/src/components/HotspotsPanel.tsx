import { Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import type { RouteData } from "../fixtures/routes.js";
import { type HotspotFilter, routeToPathParams } from "../lib/route-url.js";
import { colors } from "../lib/tokens.js";
import { GradeBadge } from "./GradeBadge.js";
import { PanelHeader } from "./PanelHeader.js";

const FILTERS: ReadonlyArray<[HotspotFilter, string]> = [
  ["all", "All"],
  ["slow", "Slow"],
  ["bunching", "Bunching"],
  ["my", "My routes"],
];

export function HotspotsPanel({
  activeFilter,
  routes,
  onRouteActivate,
  onClose,
  compact,
  hoveredRoute,
  onHoverRoute,
}: {
  activeFilter: HotspotFilter;
  routes: readonly RouteData[];
  onRouteActivate?: (route: RouteData) => void;
  onClose?: () => void;
  compact?: boolean;
  hoveredRoute?: string | null;
  onHoverRoute?: (name: string | null) => void;
}) {
  const badgeSize = compact ? 32 : 40;

  return (
    <div
      className="bp-panel-hotspots"
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
    >
      <PanelHeader
        title="Nearby hotspots"
        subtitle="Routes with issues right now"
        {...(onClose ? { onClose } : {})}
      />

      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "8px 16px",
          overflowX: "auto",
          flexShrink: 0,
        }}
      >
        {FILTERS.map(([key, label]) => (
          <Link
            key={key}
            to="/"
            search={{ filter: key }}
            viewTransition
            className="bp-pill"
            style={activeFilter === key ? activePillStyle : pillLinkStyle}
          >
            {label}
          </Link>
        ))}
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 16px",
        }}
      >
        {routes.map((route) => (
          <Link
            key={route.name}
            to="/routes/$routeId"
            params={routeToPathParams(route.name)}
            search={{ tab: "overview" }}
            viewTransition
            onClick={() => onRouteActivate?.(route)}
            onMouseEnter={() => onHoverRoute?.(route.name)}
            onMouseLeave={() => onHoverRoute?.(null)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 10px",
              borderBottom: "1px solid #f0f0f0",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              borderRadius: 10,
              background: hoveredRoute === route.name ? "#f4f7ff" : "transparent",
              cursor: "pointer",
              textAlign: "left",
              width: "100%",
              fontFamily: "inherit",
              textDecoration: "none",
              transition: "background 0.15s ease",
            }}
          >
            <GradeBadge grade={route.grade} size={badgeSize as 32 | 40} />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{route.name}</div>
                <div
                  style={{
                    fontSize: 12,
                    color: colors.muted,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {route.corridor}
                </div>
              </div>
              <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                {route.speed} mph &middot; {route.bunching}% bunching
              </div>
            </div>

            <div
              style={{
                flexShrink: 0,
                fontSize: 12,
                fontWeight: 600,
                color: route.trend > 0 ? colors.good : route.trend < 0 ? colors.hot : colors.muted,
              }}
            >
              {route.trend > 0 ? "\u2191" : route.trend < 0 ? "\u2193" : "\u2192"}{" "}
              {Math.abs(route.trend)}%
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

const pillLinkStyle: CSSProperties = {
  textDecoration: "none",
};

const activePillStyle: CSSProperties = {
  background: colors.accent,
  borderColor: colors.accent,
  color: "#fff",
  textDecoration: "none",
};
