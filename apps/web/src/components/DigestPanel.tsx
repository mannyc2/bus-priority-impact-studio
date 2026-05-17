import { Link } from "@tanstack/react-router";
import type { DigestMiniRoute } from "../lib/panel-data.js";
import { routeToPathParams } from "../lib/route-url.js";
import { colors } from "../lib/tokens.js";
import { PanelHeader } from "./PanelHeader.js";
import { Pill } from "./Pill.js";
import { ReactionRow } from "./ReactionRow.js";

const UPDATES: {
  icon: string;
  title: string;
  subtitle: string;
  accent: string;
  note?: string;
  reactions?: [number, number, number];
}[] = [
  {
    icon: "\uD83D\uDCF7", // camera
    title: "ACE cameras activated on B44",
    subtitle: "Nostrand Ave corridor \u00b7 Apr 24",
    accent: colors.good,
    note: "Expect speed improvement in 2\u20134 weeks",
  },
  {
    icon: "\uD83D\uDC0C", // slow
    title: "B46 hit new monthly low",
    subtitle: "Avg speed 5.1 mph \u00b7 worst since Jan",
    accent: colors.hot,
    reactions: [24, 31, 5],
  },
  {
    icon: "\uD83D\uDCCA", // chart
    title: "Q58 bunching improved 12%",
    subtitle: "Fresh Pond Rd segment \u00b7 since Apr 14",
    accent: colors.accent,
  },
];

export function DigestPanel({
  miniRoutes,
  onRouteActivate,
  onClose,
  compact,
  onHoverRoute,
}: {
  miniRoutes: readonly DigestMiniRoute[];
  onRouteActivate?: () => void;
  onClose?: () => void;
  compact?: boolean;
  onHoverRoute?: (name: string | null) => void;
}) {
  void compact;

  return (
    <div className="bp-panel-digest">
      <PanelHeader
        title="This week"
        subtitle="Apr 21-27 \u00b7 Your 3 routes"
        {...(onClose ? { onClose } : {})}
      />

      {/* Summary card */}
      <div
        style={{
          padding: 16,
          borderRadius: 14,
          background: "#f0f7ff",
          border: "1px solid #0055FF18",
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
          Your routes are 3% faster this week
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {miniRoutes.map((r) => {
            const up = r.trend > 0;
            return (
              <Link
                key={r.name}
                to="/routes/$routeId"
                params={routeToPathParams(r.name)}
                search={{ tab: "overview" }}
                viewTransition
                onClick={onRouteActivate}
                onMouseEnter={() => onHoverRoute?.(r.name)}
                onMouseLeave={() => onHoverRoute?.(null)}
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: 10,
                  border: "none",
                  background: "#fff",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "center",
                  textDecoration: "none",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 15 }}>{r.name}</div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    marginTop: 2,
                    color: up ? colors.good : colors.hot,
                  }}
                >
                  {up ? "\u2191" : "\u2193"} {Math.abs(r.trend)}%
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* UPDATES section */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1.5,
          textTransform: "uppercase" as const,
          color: colors.muted,
          marginBottom: 8,
        }}
      >
        Updates
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginBottom: 16,
        }}
      >
        {UPDATES.map((update) => (
          <div
            key={update.title}
            style={{
              padding: 14,
              borderRadius: 14,
              background: "#fff",
              border: "1px solid #eee",
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: `${update.accent}18`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  flexShrink: 0,
                }}
              >
                {update.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{update.title}</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{update.subtitle}</div>
                {update.note && (
                  <div style={{ fontSize: 12, color: update.accent, marginTop: 4 }}>
                    {update.note}
                  </div>
                )}
                {update.reactions && (
                  <div style={{ marginTop: 6 }}>
                    <ReactionRow counts={update.reactions} size="sm" />
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* COMMUNITY section */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1.5,
          textTransform: "uppercase" as const,
          color: colors.muted,
          marginBottom: 8,
        }}
      >
        Community
      </div>

      <div
        style={{
          padding: 14,
          background: "#faf5ff",
          borderRadius: 14,
          border: "1px solid #E040FB18",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>42 reports on your routes this week</div>
        <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
          Top issue: buses skipping stops on B46 (18 reports)
        </div>
        <div style={{ marginTop: 8 }}>
          <Pill color={colors.pop} active>
            View reports &rarr;
          </Pill>
        </div>
      </div>
    </div>
  );
}
