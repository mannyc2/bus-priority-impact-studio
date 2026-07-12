import { SectionHeader } from "@/components/SectionHeader";
import { Spark } from "@/components/Spark";
import { demoSpark } from "@/fixtures/demo-snippets";

export function MetricsDemo() {
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <SectionHeader title="Metrics" sub="Compact, source-aware metric blocks." />
      <div className="flex flex-col gap-3">
        <Spark data={demoSpark} baseline={6} fill />
      </div>
    </div>
  );
}
