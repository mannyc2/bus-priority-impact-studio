import { lazy, Suspense } from "react";
import type { SparkProps } from "./Spark.chart.js";

// Lazy boundary: keeps Recharts out of the eager bundle. Sparklines render at
// fixed pixel sizes, so the fallback is an inline-block placeholder of the same
// footprint to avoid layout shift in metric strips and inline prose.
const SparkChart = lazy(() =>
  import("./Spark.chart.js").then((module) => ({ default: module.SparkChart })),
);

export function Spark(props: SparkProps) {
  const { data, width = 80, height = 22 } = props;
  if (data.length === 0) return null;
  return (
    <Suspense
      fallback={
        <span
          className="inline-block animate-pulse rounded-[2px] bg-[var(--bp-color-ink-06)] align-middle"
          style={{ width, height }}
          aria-hidden="true"
        />
      }
    >
      <SparkChart {...props} />
    </Suspense>
  );
}
