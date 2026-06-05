import { lazy, Suspense } from "react";
import { ChartFallback } from "./ChartFallback.js";
import type { HourOverlayProps } from "./HourOverlay.chart.js";

// Lazy boundary: keeps Recharts out of the eager bundle. The implementation
// and the chart primitive are only reachable through this dynamic import.
const HourOverlayChart = lazy(() =>
  import("./HourOverlay.chart.js").then((module) => ({ default: module.HourOverlayChart })),
);

export function HourOverlay(props: HourOverlayProps) {
  return (
    <Suspense fallback={<ChartFallback height={props.height ?? 180} />}>
      <HourOverlayChart {...props} />
    </Suspense>
  );
}
