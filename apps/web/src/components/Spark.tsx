export function Spark({
  data,
  width = 80,
  height = 22,
  color = "var(--bp-color-ink)",
  fill = false,
  baseline,
}: {
  data: readonly number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  baseline?: number;
}) {
  if (data.length === 0) return null;
  const min = Math.min(...data, baseline ?? Number.POSITIVE_INFINITY);
  const max = Math.max(...data, baseline ?? Number.NEGATIVE_INFINITY);
  const range = max - min || 1;
  const dx = width / (data.length - 1 || 1);
  const y = (value: number) => height - 2 - ((value - min) / range) * (height - 4);
  const points = data.map((value, index) => [index * dx, y(value)] as const);
  const path = points
    .map(([x, pointY], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${pointY.toFixed(1)}`)
    .join(" ");

  return (
    <svg width={width} height={height} className="block overflow-visible" aria-hidden="true">
      {baseline !== undefined ? (
        <line
          x1="0"
          x2={width}
          y1={y(baseline)}
          y2={y(baseline)}
          stroke="var(--bp-color-ink-20)"
          strokeDasharray="2 2"
          strokeWidth="1"
        />
      ) : null}
      {fill ? (
        <path d={`${path} L${width},${height} L0,${height} Z`} fill={color} opacity="0.12" />
      ) : null}
      <path d={path} fill="none" stroke={color} strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  );
}
