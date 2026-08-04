import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from "recharts";
import { formatCompactCount, formatHourShort } from "@/components/route/route-segment-explorer";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

export type WhenRidersRideProps = {
  /** Boardings for hours 0–23, in order. */
  boardings: readonly number[];
  height?: number;
  /** The busiest window, emphasized on the chart itself. */
  peak?: { hourOfDay: number; label: string } | undefined;
};

const config = {
  value: { label: "Boardings", color: "var(--bp-color-accent)" },
} satisfies ChartConfig;

/** Ticks the hand-rolled block drew by hand; kept so the axis reads the same. */
export const WHEN_RIDERS_RIDE_HOUR_TICKS = ["0", "6", "12", "18", "23"];

export type WhenRidersRideRow = { hour: string; value: number; isPeak: boolean };

/** Recharts renders nothing without layout, so the row/emphasis contract is a
 * pure function the tests can pin (same shape as buildSpeedTrendChartModel). */
export function whenRidersRideRows(
  boardings: readonly number[],
  peak?: { hourOfDay: number } | undefined,
): WhenRidersRideRow[] {
  return boardings.slice(0, 24).map((value, hour) => ({
    hour: String(hour),
    value,
    isPeak: peak !== undefined && hour === peak.hourOfDay,
  }));
}

export function WhenRidersRideChart({ boardings, height = 148, peak }: WhenRidersRideProps) {
  const rows = whenRidersRideRows(boardings, peak);

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart accessibilityLayer data={rows} margin={{ top: 18, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="hour"
          ticks={WHEN_RIDERS_RIDE_HOUR_TICKS}
          tickFormatter={(hour) => formatHourShort(Number(hour))}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis
          width={38}
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          tickFormatter={(value) => formatCompactCount(Number(value))}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(hour) => formatHourShort(Number(hour))}
              formatter={(value) => `${formatCompactCount(Number(value))} boardings`}
            />
          }
        />
        {peak === undefined ? null : (
          <ReferenceLine
            x={String(peak.hourOfDay)}
            stroke="var(--bp-color-accent)"
            strokeWidth={1}
            label={{
              value: peak.label,
              position: "top",
              fill: "var(--bp-color-ink)",
              fontSize: 10,
              fontWeight: 700,
            }}
          />
        )}
        <Bar dataKey="value" radius={[2, 2, 0, 0]} isAnimationActive={false}>
          {rows.map((row) => (
            <Cell
              key={row.hour}
              fill="var(--bp-color-accent)"
              fillOpacity={row.isPeak ? 1 : 0.72}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
