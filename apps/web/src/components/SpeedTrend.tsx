import { lazy, Suspense } from "react";
import { ChartFallback } from "./ChartFallback.js";
import type { SpeedTrendProps } from "./SpeedTrend.chart.js";

// Lazy boundary: keeps Recharts out of the eager bundle, matching the other charts.
const SpeedTrendChart = lazy(() =>
  import("./SpeedTrend.chart.js").then((module) => ({ default: module.SpeedTrendChart })),
);

export function SpeedTrend(props: SpeedTrendProps) {
  return (
    <Suspense fallback={<ChartFallback height={props.height ?? 150} />}>
      <SpeedTrendChart {...props} />
    </Suspense>
  );
}
