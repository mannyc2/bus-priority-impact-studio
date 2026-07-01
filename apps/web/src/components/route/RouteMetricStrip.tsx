import {
  MetricColumn,
  MetricColumns,
  MetricStat,
  metricToneColor,
} from "@/components/route/MetricColumns";
import { Spark } from "@/components/Spark";
import type { StudioRoute } from "@/studio/api-contract";
import { ROUTE_METRICS } from "@/studio/metric-model";

/**
 * Single-route KPI strip for the route detail header.
 */
export function RouteMetricStrip({ route }: { route: StudioRoute }) {
  return (
    <MetricColumns>
      {ROUTE_METRICS.map((metric, i) => {
        const tone = metric.tone?.(route) ?? "ink";
        return (
          <MetricColumn key={metric.key} label={metric.label} divider={i < 4}>
            <MetricStat
              value={metric.value(route)}
              unit={metric.unit}
              color={metricToneColor[tone]}
              trailing={
                metric.key === "speed" ? (
                  <Spark
                    data={route.spark}
                    width={68}
                    height={20}
                    color={
                      route.weightedAvgSpeed < 6 ? "var(--bp-color-bad)" : "var(--bp-color-warn)"
                    }
                    baseline={route.scheduledMph}
                  />
                ) : undefined
              }
            />
            <div className="mt-[3px] text-[11px] text-[var(--bp-color-ink-55)]">
              {metric.sub(route)}
            </div>
          </MetricColumn>
        );
      })}
    </MetricColumns>
  );
}
