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
        const sub = metric.sub(route);
        return (
          <MetricColumn key={metric.key} label={metric.label} divider={i < 4}>
            <MetricStat
              value={metric.value(route)}
              unit={metric.unit}
              color={metricToneColor[tone]}
              trailing={
                metric.key === "speed" && route.spark !== null ? (
                  <Spark
                    data={route.spark}
                    width={68}
                    height={20}
                    color={
                      route.weightedAvgSpeed < 6 ? "var(--bp-color-bad)" : "var(--bp-color-warn)"
                    }
                    {...(route.scheduledMph === null ? {} : { baseline: route.scheduledMph })}
                  />
                ) : undefined
              }
            />
            {sub ? (
              <div className="mt-[3px] text-[11px] text-[var(--bp-color-ink-55)]">{sub}</div>
            ) : null}
          </MetricColumn>
        );
      })}
    </MetricColumns>
  );
}
