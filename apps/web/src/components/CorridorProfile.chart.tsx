import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  bandColor,
  type ChartBand,
  type ChartConfig,
  ChartContainer,
  ChartLegendContent,
  ChartTooltip,
} from "@/components/ui/chart";
import type { CorridorRow } from "./CorridorProfile";

const config = {
  observed: { label: "Observed mph", color: "var(--bp-color-ink)" },
} satisfies ChartConfig;

// Single source of truth for the speed-band encoding: drives the bar fills, the
// tooltip accent, and the legend below the chart.
const SPEED_BANDS: ChartBand[] = [
  { label: "6.5+ mph", color: "var(--bp-color-good)", test: (v) => v >= 6.5 },
  { label: "5–6.5 mph", color: "var(--bp-color-warn)", test: (v) => v >= 5 },
  { label: "< 5 mph", color: "var(--bp-color-bad)", test: () => true },
];

const ROW_HEIGHT = 34;
const MARGIN = { top: 18, right: 44, bottom: 4, left: 4 } as const;
const Y_AXIS_WIDTH = 132;

export type CorridorProfileChartProps = {
  rows: readonly CorridorRow[];
  lo: number;
  hi: number;
  scheduledTarget: number | null;
};

export function CorridorProfileChart({ rows, lo, hi, scheduledTarget }: CorridorProfileChartProps) {
  const worstLabel = rows.find((row) => row.isWorst)?.label;
  const height = Math.max(170, rows.length * ROW_HEIGHT + 56);

  return (
    <div className="flex flex-col gap-1">
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
        <BarChart accessibilityLayer layout="vertical" data={[...rows]} margin={MARGIN}>
          <CartesianGrid horizontal={false} />
          <XAxis
            type="number"
            domain={[lo, hi]}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            allowDecimals={false}
            tickCount={5}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={Y_AXIS_WIDTH}
            interval={0}
            tickLine={false}
            axisLine={false}
            tick={<StopTick worstLabel={worstLabel} />}
          />
          <ChartTooltip cursor={{ fill: "var(--bp-color-ink-06)" }} content={<CorridorTooltip />} />
          <Bar dataKey="observed" radius={[0, 3, 3, 0]} isAnimationActive={false} barSize={14}>
            {rows.map((row) => (
              <Cell
                key={row.key}
                fill={bandColor(SPEED_BANDS, row.observed)}
                fillOpacity={row.isWorst ? 1 : 0.85}
              />
            ))}
            <LabelList
              dataKey="observed"
              position="right"
              offset={8}
              fontSize={10.5}
              className="fill-[var(--bp-color-ink-70)] font-mono tabular-nums"
              formatter={(value) => (typeof value === "number" ? value.toFixed(1) : value)}
            />
          </Bar>
          {scheduledTarget === null ? null : (
            <ReferenceLine
              x={scheduledTarget}
              stroke="var(--bp-color-ink-55)"
              strokeDasharray="4 3"
              strokeWidth={1.25}
              label={{
                value: `scheduled ${scheduledTarget.toFixed(1)}`,
                position: "top",
                fill: "var(--bp-color-ink-55)",
                fontSize: 10,
                fontWeight: 600,
              }}
            />
          )}
        </BarChart>
      </ChartContainer>
      <ChartLegendContent
        className="flex-wrap"
        items={[
          ...SPEED_BANDS,
          ...(scheduledTarget === null
            ? []
            : [{ label: "scheduled", shape: "dashed" as const, color: "var(--bp-color-ink-55)" }]),
        ]}
      />
    </div>
  );
}

type TickProps = {
  x?: number;
  y?: number;
  payload?: { value?: string };
  worstLabel?: string | undefined;
};

function StopTick({ x, y, payload, worstLabel }: TickProps) {
  if (x === undefined || y === undefined) return null;
  const value = payload?.value ?? "";
  const isWorst = value === worstLabel;
  return (
    <text
      x={x - 4}
      y={y}
      textAnchor="end"
      dominantBaseline="central"
      fontSize="11"
      fontWeight={isWorst ? 700 : 400}
      fill={isWorst ? "var(--bp-color-ink)" : "var(--bp-color-ink-55)"}
    >
      {value}
    </text>
  );
}

type TooltipLike = {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: CorridorRow }>;
};

function CorridorTooltip({ active, payload }: TooltipLike) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  const delta = row.scheduled === null ? null : row.observed - row.scheduled;
  const treatments = [
    row.lane === "yes" ? "Bus lane" : row.lane === "none" ? null : `Bus lane (${row.lane})`,
    row.ace ? "ACE" : null,
    row.tsp ? "TSP" : null,
  ].filter((value): value is string => value !== null);

  return (
    <div className="grid min-w-[11rem] gap-1.5 rounded-[3px] border border-[var(--bp-color-rule)] bg-[var(--bp-color-card-raised)] px-2.5 py-2 text-[11px] shadow-[var(--bp-shadow-lg)]">
      <div className="font-semibold text-[var(--bp-color-ink)]">
        {row.from} <span className="text-[var(--bp-color-ink-40)]">→</span> {row.to}
      </div>
      <Stat
        label="Observed"
        value={`${row.observed.toFixed(1)} mph`}
        color={bandColor(SPEED_BANDS, row.observed)}
      />
      {row.scheduled === null ? null : (
        <Stat label="Scheduled" value={`${row.scheduled.toFixed(1)} mph`} />
      )}
      {delta === null ? null : (
        <Stat label="vs scheduled" value={`${delta >= 0 ? "+" : ""}${delta.toFixed(1)} mph`} />
      )}
      <Stat label="Rider-hours lost" value={row.riderHours.toLocaleString()} />
      <div className="mt-0.5 border-t border-[var(--bp-color-rule)] pt-1.5 text-[10.5px] text-[var(--bp-color-ink-55)]">
        {treatments.length ? treatments.join(" · ") : "No segment-level treatments"}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[var(--bp-color-ink-55)]">{label}</span>
      <span
        className="font-mono font-semibold tabular-nums"
        style={{ color: color ?? "var(--bp-color-ink-70)" }}
      >
        {value}
      </span>
    </div>
  );
}
