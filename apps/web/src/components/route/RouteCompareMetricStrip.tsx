import { MetricColumn, MetricColumns, metricFigureClass } from "@/components/route/MetricColumns";
import type { StudioRoute } from "@/studio/api-contract";
import { ROUTE_METRICS } from "@/studio/metric-model";

// Both figures share one responsive size so they stay visually equal; they
// shrink on narrow columns so two values plus the unit still fit. Only the "vs"
// is set apart (smaller, muted).
const figureSize = "text-[16px] md:text-[20px] xl:text-[22px]";

/**
 * Two-route inline metric strip for the compare header. Explicit variant of the
 * shared ROUTE_METRICS model over the same MetricColumns frame as
 * RouteMetricStrip. Each cell shows both routes' figures at the same size and
 * color, separated by a "vs"; the metric label, unit, and sub appear once.
 */
export function RouteCompareMetricStrip({ a, b }: { a: StudioRoute; b: StudioRoute }) {
  return (
    <MetricColumns>
      {ROUTE_METRICS.map((metric, i) => (
        <MetricColumn key={metric.key} label={metric.label} divider={i < 4}>
          <div className="flex items-baseline gap-1.5 whitespace-nowrap text-[var(--bp-color-ink)]">
            <span className={`${metricFigureClass} ${figureSize}`}>{metric.value(a)}</span>
            <span className="text-[11px] font-medium text-[var(--bp-color-ink-40)] md:text-[12px]">
              vs
            </span>
            <span className={`${metricFigureClass} ${figureSize}`}>{metric.value(b)}</span>
            {metric.unit ? (
              <span className="text-[11px] tracking-[0.03em] text-[var(--bp-color-ink-55)]">
                {metric.unit}
              </span>
            ) : null}
          </div>
          <div className="mt-[3px] text-[11px] text-[var(--bp-color-ink-55)]">{metric.sub(a)}</div>
        </MetricColumn>
      ))}
    </MetricColumns>
  );
}
