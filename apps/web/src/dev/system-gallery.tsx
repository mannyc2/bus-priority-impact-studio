import { ChartsDemo } from "@/dev/examples/charts-demo";
import { ClaimsDemo } from "@/dev/examples/claims-demo";
import { FoundationsDemo } from "@/dev/examples/foundations-demo";
import { MetricsDemo } from "@/dev/examples/metrics-demo";
import { SegmentRowDemo } from "@/dev/examples/segment-row-demo";
import { StatesDemo } from "@/dev/examples/states-demo";
import { StudioBarDemo } from "@/dev/examples/studio-bar-demo";
import { TreatmentsDemo } from "@/dev/examples/treatments-demo";

export function SystemGallery() {
  return (
    <div className="flex flex-col gap-6 bg-[var(--bp-color-paper)] p-6 text-[var(--bp-color-ink)]">
      <StudioBarDemo />
      <div className="grid gap-4 xl:grid-cols-3">
        <FoundationsDemo />
        <MetricsDemo />
        <TreatmentsDemo />
      </div>
      <SegmentRowDemo />
      <ChartsDemo />
      <div className="grid gap-4 xl:grid-cols-2">
        <ClaimsDemo />
        <StatesDemo />
      </div>
    </div>
  );
}
