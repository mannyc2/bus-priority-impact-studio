import { lazy, Suspense } from "react";
import { ChartFallback } from "@/components/ChartFallback";
import type { MapHourStripProps } from "./MapHourStrip.chart.js";

// Lazy boundary: keeps Recharts out of the map page chunk until a route popup
// actually renders the hourly strip.
const MapHourStripChart = lazy(() =>
  import("./MapHourStrip.chart.js").then((module) => ({ default: module.MapHourStripChart })),
);

export function MapHourStrip(props: MapHourStripProps) {
  return (
    <Suspense fallback={<ChartFallback height={30} />}>
      <MapHourStripChart {...props} />
    </Suspense>
  );
}
