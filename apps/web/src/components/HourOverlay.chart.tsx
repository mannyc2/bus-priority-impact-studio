import { OverlayChart } from "@/components/OverlayChart";

type Series = {
  label: string;
  color: string;
  hours: readonly number[];
};

export type HourOverlayProps = {
  a: Series;
  b: Series;
  height?: number;
};

export function HourOverlayChart({ a, b, height = 180 }: HourOverlayProps) {
  const n = Math.min(a.hours.length, b.hours.length);
  if (n === 0) return null;

  const rows = Array.from({ length: n }, (_, hour) => {
    const av = Number((a.hours[hour] ?? 0).toFixed(1));
    const bv = Number((b.hours[hour] ?? 0).toFixed(1));
    return {
      hour: String(hour),
      a: av,
      b: bv,
      band: [Math.min(av, bv), Math.max(av, bv)] as [number, number],
    };
  });

  return (
    <OverlayChart
      rows={rows}
      series={[
        { key: "a", label: a.label, color: a.color },
        { key: "b", label: b.label, color: b.color, dashed: true },
      ]}
      xKey="hour"
      xInterval={3}
      xTickFormatter={(hour) => `${hour}:00`}
      tooltipLabel={(value) => `${value}:00`}
      yDomain={[0, "auto"]}
      height={height}
    />
  );
}
