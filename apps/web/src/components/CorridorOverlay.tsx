import { lazy, Suspense } from "react";
import { ChartFallback } from "./ChartFallback.js";
import type { CorridorOverlayProps } from "./CorridorOverlay.chart.js";

// Lazy boundary: keeps Recharts out of the eager bundle.
const CorridorOverlayChart = lazy(() =>
  import("./CorridorOverlay.chart.js").then((module) => ({
    default: module.CorridorOverlayChart,
  })),
);

export function CorridorOverlay(props: CorridorOverlayProps) {
  return (
    <Suspense fallback={<ChartFallback height={props.height ?? 200} />}>
      <CorridorOverlayChart {...props} />
    </Suspense>
  );
}
