import { lazy, Suspense } from "react";
import { ChartFallback } from "./ChartFallback.js";
import type { HourBarsProps } from "./HourBars.chart.js";

// Lazy boundary: keeps Recharts out of the eager bundle. The implementation
// and the chart primitive are only reachable through this dynamic import.
const HourBarsChart = lazy(() =>
  import("./HourBars.chart.js").then((module) => ({ default: module.HourBarsChart })),
);

export function HourBars(props: HourBarsProps) {
  return (
    <Suspense fallback={<ChartFallback height={props.height ?? 200} />}>
      <HourBarsChart {...props} />
    </Suspense>
  );
}
