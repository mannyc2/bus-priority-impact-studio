import { ChartFrame } from "@/components/ChartFrame";
import { HourBars } from "@/components/HourBars";
import { demoHourBars } from "@/fixtures/demo-snippets";

export function ChartsDemo() {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ChartFrame title="PM peak profile" source="March 2026 baseline">
        <HourBars data={demoHourBars} sched={7.1} />
      </ChartFrame>
    </div>
  );
}
