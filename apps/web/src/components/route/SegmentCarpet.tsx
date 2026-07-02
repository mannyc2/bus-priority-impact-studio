import { lazy, Suspense } from "react";
import type { SegmentCarpetModel } from "@/components/route/segment-carpet-data";

const SegmentCarpetChart = lazy(() =>
  import("./SegmentCarpet.chart.js").then((module) => ({ default: module.SegmentCarpetChart })),
);

function SegmentCarpetSkeleton() {
  return (
    <div
      className="h-[300px] animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]"
      aria-hidden
    />
  );
}

export function SegmentCarpet({ model }: { model: SegmentCarpetModel }) {
  if (model.months.length === 0 || model.rows.length === 0) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-[3px] bg-[var(--bp-color-paper-deep)] px-4 text-center text-[12.5px] text-[var(--bp-color-ink-55)]">
        Segment speed history is not available for this route.
      </div>
    );
  }

  return (
    <Suspense fallback={<SegmentCarpetSkeleton />}>
      <SegmentCarpetChart model={model} />
    </Suspense>
  );
}
