import { lazy, Suspense } from "react";
import { ChartFallback } from "./ChartFallback.js";
import type { WhenRidersRideProps } from "./WhenRidersRide.chart.js";

// Lazy boundary: keeps Recharts out of the eager bundle, matching the other charts.
const WhenRidersRideChart = lazy(() =>
  import("./WhenRidersRide.chart.js").then((module) => ({ default: module.WhenRidersRideChart })),
);

export function WhenRidersRide(props: WhenRidersRideProps) {
  return (
    <Suspense fallback={<ChartFallback height={props.height ?? 148} />}>
      <WhenRidersRideChart {...props} />
    </Suspense>
  );
}
