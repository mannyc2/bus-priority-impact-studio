import { lazy, Suspense } from "react";
import { ChartFallback } from "./ChartFallback.js";
import type { TrendOverlayProps } from "./TrendOverlay.chart.js";

// Lazy boundary: keeps Recharts out of the eager bundle.
const TrendOverlayChart = lazy(() =>
  import("./TrendOverlay.chart.js").then((module) => ({ default: module.TrendOverlayChart })),
);

export function TrendOverlay(props: TrendOverlayProps) {
  return (
    <Suspense fallback={<ChartFallback height={props.height ?? 180} />}>
      <TrendOverlayChart {...props} />
    </Suspense>
  );
}
