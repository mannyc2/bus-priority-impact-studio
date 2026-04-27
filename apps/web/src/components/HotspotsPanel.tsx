import { useState } from "react";
import { type RouteData, routes } from "../fixtures/routes.js";
import { colors } from "../lib/tokens.js";
import { GradeBadge } from "./GradeBadge.js";
import { PanelHeader } from "./PanelHeader.js";
import { Pill } from "./Pill.js";

type Filter = "all" | "slow" | "bunching" | "my";

const MY_ROUTES = new Set(["B46", "Q58", "B44"]);

function filterRoutes(filter: Filter): readonly RouteData[] {
  switch (filter) {
    case "slow":
      return routes.filter((r) => r.speed < 6);
    case "bunching":
      return routes.filter((r) => r.bunching > 20);
    case "my":
      return routes.filter((r) => MY_ROUTES.has(r.name));
    default:
      return routes;
  }
}

export function HotspotsPanel({
  onRouteClick,
  onClose,
  compact,
  hoveredRoute,
  onHoverRoute,
}: {
  onRouteClick: (route: RouteData) => void;
  onClose?: () => void;
  compact?: boolean;
  hoveredRoute?: string | null;
  onHoverRoute?: (name: string | null) => void;
}) {
  const [active, setActive] = useState<Filter>("all");
  const filtered = filterRoutes(active);
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
        {(
          [
            ["all", "All"],
            ["slow", "Slow"],
            ["bunching", "Bunching"],
            ["my", "My routes"],
          ] as const
        ).map(([key, label]) => (
          <Pill key={key} active={active === key} onClick={() => setActive(key)}>
            {label}
          </Pill>
        ))}
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 16px",
        }}
      >
        {filtered.map((route) => (
          <button
            key={route.name}
            type="button"
            onClick={() => onRouteClick(route)}
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
          </button>
        ))}
      </div>
    </div>
  );
}
