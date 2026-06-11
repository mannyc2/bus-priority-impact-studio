import { Area, AreaChart, ReferenceLine, XAxis, YAxis } from "recharts";

export type SparkProps = {
  data: readonly number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  baseline?: number;
};

// Fixed-size, decorative micro-sparkline. Rendered non-responsively (explicit
// width/height, hidden axes) so it stays cheap inline in metric strips and prose
// rather than measuring a ResponsiveContainer per instance.
export function SparkChart({
  data,
  width = 80,
  height = 22,
  color = "var(--bp-color-ink)",
  fill = false,
  baseline,
}: SparkProps) {
  const min = Math.min(...data, baseline ?? Number.POSITIVE_INFINITY);
  const max = Math.max(...data, baseline ?? Number.NEGATIVE_INFINITY);
  const rows = data.map((value, index) => ({ index, value }));

  return (
    <span className="inline-block overflow-visible align-middle leading-none" aria-hidden="true">
      <AreaChart
        width={width}
        height={height}
        data={rows}
        margin={{ top: 2, right: 0, bottom: 2, left: 0 }}
      >
        <XAxis hide dataKey="index" />
        <YAxis hide width={0} domain={[min, max]} />
        {baseline !== undefined ? (
          <ReferenceLine
            y={baseline}
            stroke="var(--bp-color-ink-20)"
            strokeDasharray="2 2"
            strokeWidth={1}
          />
        ) : null}
        <Area
          dataKey="value"
          type="linear"
          stroke={color}
          strokeWidth={1.4}
          strokeLinejoin="round"
          fill={color}
          fillOpacity={fill ? 0.12 : 0}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </span>
  );
}
