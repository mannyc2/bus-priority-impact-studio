import type { RouteScorecard } from "@bp/domain";
import { MetricCard } from "./MetricCard.js";
import { Pill } from "./Pill.js";

function getScoreVariant(score: number): "neutral" | "success" | "warning" {
  if (score < 45) return "warning";
  if (score >= 70) return "success";
  return "neutral";
}

export function RouteScorePreview({ scorecard }: { scorecard: RouteScorecard }) {
  const variant = getScoreVariant(scorecard.routeScore);
  const hasObservedSpeed = scorecard.coverageStatus === "full";

  return (
    <section className="bp-route-preview">
      <div className="bp-route-preview-header">
        <div>
          <Pill variant={variant}>Route scorecard</Pill>
          <h3 className="bp-route-preview-title">{scorecard.routeId}</h3>
        </div>
        <Pill>{scorecard.month}</Pill>
      </div>
      <div className="bp-route-preview-grid">
        <MetricCard
          label="Score"
          note="Lower score means stronger intervention review signal."
          variant={variant}
          value={`${scorecard.routeScore}/100`}
        />
        <MetricCard
          label="Avg speed"
          note={
            hasObservedSpeed
              ? "Public segment-speed read model, rounded for demo display."
              : "No observed segment-speed rows were available for this route and month."
          }
          value={
            hasObservedSpeed ? `${scorecard.averageSpeedMph.toFixed(1)} mph` : "No observed speed"
          }
        />
        <MetricCard
          label="Hotspots"
          note="Persistent slow segments flagged by the local analytics pipeline."
          value={String(scorecard.hotspotCount)}
        />
      </div>
    </section>
  );
}
