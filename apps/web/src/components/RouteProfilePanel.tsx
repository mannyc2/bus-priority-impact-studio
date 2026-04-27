import { useState } from "react";
import { type RouteData, routes } from "../fixtures/routes.js";
import { bucketColor, colors, gradeColor } from "../lib/tokens.js";
import { GradeBadge } from "./GradeBadge.js";
import { Pill } from "./Pill.js";
import { ReactionRow } from "./ReactionRow.js";
import { SpeedBar } from "./SpeedBar.js";
import { StatCard } from "./StatCard.js";

type Tab = "overview" | "segments" | "reports";

const SEGMENTS = [
  { label: "Eastern Pkwy \u2192 Crown St", speed: 4.2 },
  { label: "Crown St \u2192 Empire Blvd", speed: 5.1 },
  { label: "Empire Blvd \u2192 Flatbush", speed: 6.8 },
  { label: "Flatbush \u2192 Church Ave", speed: 7.2 },
];

const RIDER_REPORTS = [
  {
    author: "RiderJ",
    time: "2h ago",
    body: "Two B46 buses came back to back at Utica/Eastern Pkwy, then nothing for 20 min.",
    reactions: [14, 8, 3] as [number, number, number],
  },
  {
    author: "BKCommuter",
    time: "5h ago",
    body: "Bus stuck behind double-parked car on Utica near Crown St for 4 minutes.",
    reactions: [9, 12, 2] as [number, number, number],
  },
  {
    author: "TransitFan44",
    time: "1d ago",
    body: "SBS enforcement officers spotted at Empire Blvd stop. Speeds improved during that hour.",
    reactions: [6, 1, 18] as [number, number, number],
  },
];

export function RouteProfilePanel({
  route: routeProp,
  onClose,
  onCompare,
  compact,
}: {
  route: { name: string; grade: string } | null;
  onClose: () => void;
  onCompare?: (route: RouteData) => void;
  compact?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("overview");

  if (!routeProp) return null;

  const route = routes.find((r) => r.name === routeProp.name);
  if (!route) return null;

  const isSlow = route.speed < 6;
  const isBunching = route.bunching > 20;
  const trendUp = route.trend > 0;

  return (
    <div className="bp-panel-profile">
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          paddingBottom: 12,
          borderBottom: `1px solid ${colors.light}`,
        }}
      >
        <GradeBadge grade={route.grade} size={compact ? 48 : 56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 18, color: colors.ink }}>{route.name}</div>
          <div style={{ fontSize: 13, color: colors.muted }}>
            {route.corridor} &middot; {route.borough}
          </div>

          {/* Status pills */}
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {isSlow && (
              <Pill variant="warning" color={colors.hot} active>
                Slow
              </Pill>
            )}
            {isBunching && (
              <Pill variant="warning" color={colors.warm} active>
                Bunching
              </Pill>
            )}
            <Pill>{route.type}</Pill>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {onCompare && (
            <button
              type="button"
              onClick={() => onCompare(route)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "none",
                background: "#f0f0f0",
                fontSize: 12,
                fontWeight: 500,
                fontFamily: "inherit",
                cursor: "pointer",
                color: "#666",
              }}
            >
              Compare
            </button>
          )}
          <button
            type="button"
            aria-label="Close route profile"
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              border: "none",
              background: "#f0f0f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: 14,
              color: "#888",
            }}
          >
            &#x2715;
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderBottom: `1px solid ${colors.light}`,
          marginTop: 12,
        }}
      >
        {(["overview", "segments", "reports"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: "8px 0",
              border: "none",
              borderBottom: tab === t ? `2px solid ${colors.accent}` : "2px solid transparent",
              background: "none",
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: tab === t ? 700 : 500,
              color: tab === t ? colors.accent : colors.muted,
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ paddingTop: 12 }}>
        {tab === "overview" && <OverviewTab route={route} trendUp={trendUp} />}
        {tab === "segments" && <SegmentsTab />}
        {tab === "reports" && <ReportsTab reportCount={route.reports} />}
      </div>
    </div>
  );
}

/* ---- Overview ---- */
function OverviewTab({ route, trendUp }: { route: RouteData; trendUp: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Speed chart */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Speed today</div>
        <div
          style={{
            height: 80,
            background: "#f8f8f8",
            borderRadius: 12,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <svg
            role="img"
            aria-label={`${route.name} speed trend today`}
            width="100%"
            height="80"
            preserveAspectRatio="none"
          >
            <title>{`${route.name} speed trend today`}</title>
            <path
              d="M 0 60 Q 40 55 80 40 T 160 30 T 240 50 T 335 65"
              stroke={gradeColor(route.grade)}
              strokeWidth="2.5"
              fill="none"
            />
            <path
              d="M 0 60 Q 40 55 80 40 T 160 30 T 240 50 T 335 65 L 335 80 L 0 80 Z"
              fill={gradeColor(route.grade)}
              opacity="0.08"
            />
            <line
              x1="0"
              y1="35"
              x2="335"
              y2="35"
              stroke="#ddd"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          </svg>
          <div
            style={{
              position: "absolute",
              bottom: 4,
              left: 8,
              display: "flex",
              justifyContent: "space-between",
              width: "calc(100% - 16px)",
            }}
          >
            {["6a", "9a", "12p", "3p", "6p", "9p"].map((t) => (
              <div
                key={t}
                style={{ fontSize: 9, color: "#bbb", fontFamily: "var(--bp-font-mono)" }}
              >
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div
        style={{
          display: "flex",
          gap: 8,
        }}
      >
        <StatCard
          label="Avg speed"
          value={`${route.speed} mph`}
          sub={
            route.speed < route.cityAvg
              ? `${(route.cityAvg - route.speed).toFixed(1)} below avg`
              : "Above avg"
          }
          bad={route.speed < route.cityAvg}
        />
        <StatCard
          label="Bunching"
          value={`${route.bunching}%`}
          sub={route.bunching > 25 ? "Worst 10%" : route.bunching > 15 ? "Below avg" : "Good"}
          bad={route.bunching > 20}
        />
        <StatCard
          label="Trend"
          value={`${trendUp ? "+" : ""}${route.trend}%`}
          sub="This week"
          bad={!trendUp}
        />
      </div>

      {/* Follow CTA */}
      <div
        style={{
          padding: 14,
          borderRadius: 14,
          background: "linear-gradient(135deg, #0055FF08, #E040FB08)",
          border: "1px solid #0055FF18",
          textAlign: "center",
          cursor: "pointer",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: colors.accent }}>
          Follow {route.name}
        </div>
        <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
          {route.followers.toLocaleString()} riders &middot; weekly updates &amp; alerts
        </div>
      </div>

      {/* Latest report */}
      <div
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: `1px solid ${colors.light}`,
        }}
      >
        <div style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>Latest report</div>
        <div style={{ fontSize: 13, color: colors.ink, lineHeight: 1.5 }}>
          "Two buses bunched at Utica/Eastern Pkwy, 20 min gap after."
        </div>
        <div style={{ marginTop: 8 }}>
          <ReactionRow counts={[14, 8, 3]} size="sm" />
        </div>
      </div>
    </div>
  );
}

/* ---- Segments ---- */
function SegmentsTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {SEGMENTS.map((seg) => (
        <div key={seg.label}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: colors.slate,
              marginBottom: 4,
            }}
          >
            {seg.label}
          </div>
          <SpeedBar
            pct={(seg.speed / 10) * 100}
            color={bucketColor(seg.speed)}
            value={`${seg.speed} mph`}
          />
        </div>
      ))}
    </div>
  );
}

/* ---- Reports ---- */
function ReportsTab({ reportCount }: { reportCount: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 13, color: "#888" }}>{reportCount} reports this month</div>
      {RIDER_REPORTS.map((report) => (
        <div
          key={report.author}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: `1px solid ${colors.light}`,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>
              {report.author}
            </span>
            <span style={{ fontSize: 11, color: colors.muted }}>{report.time}</span>
          </div>
          <div style={{ fontSize: 13, color: colors.slate, lineHeight: 1.5 }}>{report.body}</div>
          <div style={{ marginTop: 8 }}>
            <ReactionRow counts={report.reactions} size="sm" />
          </div>
        </div>
      ))}
    </div>
  );
}
