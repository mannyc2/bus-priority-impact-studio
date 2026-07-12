import { lazy, Suspense } from "react";
import { ChartFallback } from "@/components/ChartFallback";
import type { StudyEventChartProps } from "./StudyEventChart.chart.js";

// Lazy boundary: keeps Recharts out of the eager bundle, matching the other charts.
const StudyEventChartInner = lazy(() =>
  import("./StudyEventChart.chart.js").then((module) => ({ default: module.StudyEventChart })),
);

export function StudyEventChart(props: StudyEventChartProps) {
  return (
    <Suspense fallback={<ChartFallback height={props.height ?? 200} />}>
      <StudyEventChartInner {...props} />
    </Suspense>
  );
}
