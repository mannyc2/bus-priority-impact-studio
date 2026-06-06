import { ChartFrame } from "@/components/ChartFrame";
import { Heatmap } from "@/components/Heatmap";
import { HourBars } from "@/components/HourBars";
import { demoHeatmap, demoHourBars } from "@/fixtures/demo-snippets";

export function ChartsDemo() {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ChartFrame title="Speed by direction and hour" source="MTA Bus Speeds">
        <Heatmap rows={demoHeatmap.rows} cols={demoHeatmap.cols} values={demoHeatmap.values} />
      </ChartFrame>
      <ChartFrame title="PM peak profile" source="March 2026 baseline">
        <HourBars data={demoHourBars} sched={7.1} />
      </ChartFrame>
    </div>
  );
}
