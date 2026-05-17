import type { RouteData } from "../fixtures/routes.js";
import { colors, gradeColor } from "../lib/tokens.js";
import { GradeBadge } from "./GradeBadge.js";
import { PanelHeader } from "./PanelHeader.js";

interface Metric {
  label: string;
  key: "speed" | "bunching" | "trend" | "followers" | "reports";
  unit: string;
  max: number;
  invert?: boolean;
  signed?: boolean;
}

const METRICS: Metric[] = [
  { label: "Avg speed", key: "speed", unit: " mph", max: 12 },
  { label: "Bunching rate", key: "bunching", unit: "%", max: 50, invert: true },
  { label: "Weekly trend", key: "trend", unit: "%", max: 15, signed: true },
  { label: "Followers", key: "followers", unit: "", max: 4000 },
  { label: "Reports", key: "reports", unit: "", max: 250, invert: true },
];

export function ComparisonPanel({
  routeA,
  routeB,
  onClose,
  compact,
}: {
  routeA: RouteData;
  routeB: RouteData;
  onClose: () => void;
  compact?: boolean;
}) {
  return (
    <div className="bp-panel-comparison">
      <PanelHeader
        title="Compare routes"
        subtitle={`${routeA.name} vs ${routeB.name}`}
        onClose={onClose}
      />

      {/* Grade badges side by side */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: compact ? 24 : 32,
          padding: "16px 0",
          borderBottom: `1px solid ${colors.light}`,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <GradeBadge grade={routeA.grade} size={compact ? 48 : 56} />
          <div
            style={{
              marginTop: 6,
              fontSize: 14,
              fontWeight: 700,
              color: colors.ink,
            }}
          >
            {routeA.name}
          </div>
          <div style={{ fontSize: 12, color: colors.muted }}>{routeA.corridor}</div>
        </div>

        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: colors.muted,
          }}
        >
          vs
        </div>

        <div style={{ textAlign: "center" }}>
          <GradeBadge grade={routeB.grade} size={compact ? 48 : 56} />
          <div
            style={{
              marginTop: 6,
              fontSize: 14,
              fontWeight: 700,
              color: colors.ink,
            }}
          >
            {routeB.name}
          </div>
          <div style={{ fontSize: 12, color: colors.muted }}>{routeB.corridor}</div>
        </div>
      </div>

      {/* Comparison metrics */}
      <div style={{ paddingTop: 16 }}>
        {METRICS.map((metric) => {
          const routeData = [routeA, routeB];
          return (
            <div key={metric.key} style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#888",
                  marginBottom: 6,
                }}
              >
                {metric.label}
              </div>
              {routeData.map((r) => {
                const val = r[metric.key];
                const pct = (Math.abs(val) / metric.max) * 100;
                const bad = metric.invert ? val > metric.max * 0.5 : val < 0;
                return (
                  <div
                    key={r.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <div style={{ width: 50, fontSize: 12, fontWeight: 600 }}>{r.name}</div>
                    <div
                      style={{
                        flex: 1,
                        height: 8,
                        background: "#f0f0f0",
                        borderRadius: 4,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(pct, 100)}%`,
                          height: "100%",
                          background: gradeColor(r.grade),
                          borderRadius: 4,
                        }}
                      />
                    </div>
                    <div
                      style={{
                        width: 60,
                        fontSize: 12,
                        fontWeight: 600,
                        color: bad ? colors.hot : colors.good,
                        fontFamily: "var(--bp-font-mono)",
                        textAlign: "right",
                      }}
                    >
                      {metric.signed && val > 0 ? "+" : ""}
                      {val}
                      {metric.unit}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
