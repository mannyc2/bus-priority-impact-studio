import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";
import { hourLabel, SPEED_CLASS_COLORS, speedClass } from "@/components/route/network-map-model";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

export type MapHourStripProps = {
  hourlySpeedMph: readonly (number | null)[];
  /** Hours at or under this speed render at full strength (slowest-window emphasis). */
  emphasisMaxMph: number | null;
};

const config = {
  share: { label: "Speed" },
} satisfies ChartConfig;

/**
 * The popup's 24-hour micro strip: same bar geometry and attention colors as
 * the hand-drawn comp, but rendered through the shared chart primitives so
 * hovering an hour gets the standard styled tooltip instead of a browser
 * `title` hint. The 12A/6A/12P/6P footer stays with the popup, outside the
 * chart.
 */
export function MapHourStripChart({ hourlySpeedMph, emphasisMaxMph }: MapHourStripProps) {
  const rows = hourlySpeedMph.slice(0, 24).map((mph, hour) => {
    const cls = speedClass(mph);
    return {
      label: hourLabel(hour),
      // Mirrors the comp's pixel scale: 3–15 mph spans the strip, no-data is a stub.
      share: mph === null ? 2 / 26 : Math.max(3 / 26, Math.min(1, (mph - 3) / 12)),
      mph,
      fill:
        cls === null
          ? "var(--bp-color-ink-06)"
          : (SPEED_CLASS_COLORS[cls] ?? "var(--bp-color-ink-06)"),
      emphasized: emphasisMaxMph !== null && mph !== null && mph <= emphasisMaxMph,
    };
  });
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: 30 }}>
      <BarChart data={rows} margin={{ top: 2, right: 0, bottom: 0, left: 0 }} barCategoryGap={1}>
        <XAxis dataKey="label" hide />
        <YAxis hide domain={[0, 1]} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              className="min-w-0"
              formatter={(_value, _name, item) => {
                const datum = item.payload as (typeof rows)[number] | undefined;
                if (datum === undefined) return null;
                if (datum.mph === null) {
                  return <span className="text-[var(--bp-color-ink-55)]">No data</span>;
                }
                return (
                  <span className="flex w-full items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: datum.fill }}
                    />
                    <span className="font-mono font-semibold tabular-nums text-[var(--bp-color-ink)]">
                      {datum.mph.toFixed(1)} mph
                    </span>
                  </span>
                );
              }}
            />
          }
        />
        <Bar dataKey="share" radius={[1, 1, 0, 0]} isAnimationActive={false}>
          {rows.map((row) => (
            <Cell key={row.label} fill={row.fill} fillOpacity={row.emphasized ? 1 : 0.45} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
