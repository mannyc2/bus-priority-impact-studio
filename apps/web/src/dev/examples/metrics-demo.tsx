import { BeforeAfter } from "@/components/BeforeAfter";
import { ConfidenceBar } from "@/components/ConfidenceBar";
import { KPI } from "@/components/KPI";
import { SectionHeader } from "@/components/SectionHeader";
import { Spark } from "@/components/Spark";
import { demoSpark } from "@/fixtures/demo-snippets";

export function MetricsDemo() {
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <SectionHeader title="Metrics" sub="Compact, source-aware metric blocks." />
      <div className="grid grid-cols-2 gap-4">
        <KPI label="Route score" value="42" tone="warn" sub="baseline release" />
        <KPI label="Observed samples" value="2.57M" tone="good" sub="recovered GTFS-RT" />
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <Spark data={demoSpark} baseline={6} fill />
        <BeforeAfter before={7.4} after={5.8} max={9} />
        <ConfidenceBar value={68} />
      </div>
    </div>
  );
}
