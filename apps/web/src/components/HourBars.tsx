export function HourBars({
  data,
  sched,
  width = 600,
  height = 200,
  min,
  max,
}: {
  data: readonly number[];
  sched?: number;
  width?: number;
  height?: number;
  min?: number;
  max?: number;
}) {
  const lo = min ?? Math.floor(Math.min(...data, sched ?? Number.POSITIVE_INFINITY) - 0.5);
  const hi = max ?? Math.ceil(Math.max(...data, sched ?? Number.NEGATIVE_INFINITY) + 0.5);
  const padL = 36;
  const padR = 12;
  const padT = 12;
  const padB = 24;
  const cw = (width - padL - padR) / 24;
  const y = (value: number) => padT + (1 - (value - lo) / (hi - lo || 1)) * (height - padT - padB);
  const step = Math.max(1, Math.round((hi - lo) / 4));
  const ticks: number[] = [];
  for (let value = Math.ceil(lo / step) * step; value <= hi; value += step) ticks.push(value);

  return (
    <svg width={width} height={height} className="block font-mono" aria-hidden="true">
      {ticks.map((value) => (
        <g key={value}>
          <line
            x1={padL}
            x2={width - padR}
            y1={y(value)}
            y2={y(value)}
            stroke="var(--bp-color-rule)"
          />
          <text
            x={padL - 6}
            y={y(value) + 3}
            fontSize="10"
            textAnchor="end"
            fill="var(--bp-color-ink-55)"
          >
            {value}
          </text>
        </g>
      ))}
      {sched !== undefined ? (
        <>
          <line
            x1={padL}
            x2={width - padR}
            y1={y(sched)}
            y2={y(sched)}
            stroke="var(--bp-color-accent)"
            strokeDasharray="4 3"
            strokeWidth="1.5"
          />
          <text
            x={width - padR - 4}
            y={y(sched) - 5}
            fontSize="10"
            textAnchor="end"
            fill="var(--bp-color-accent)"
            fontWeight="600"
          >
            scheduled {sched.toFixed(1)}
          </text>
        </>
      ) : null}
      {data.slice(0, 24).map((value, index) => {
        const top = y(value);
        const bottom = y(lo);
        const fill =
          value < 5
            ? "var(--bp-color-bad)"
            : value < 6.5
              ? "var(--bp-color-warn)"
              : "var(--bp-color-ink-40)";
        return (
          <rect
            key={`${index}-${value}`}
            x={padL + index * cw + 1.5}
            width={cw - 3}
            y={top}
            height={bottom - top}
            fill={fill}
          />
        );
      })}
      {[0, 6, 12, 18].map((hour) => (
        <text
          key={hour}
          x={padL + hour * cw + cw / 2}
          y={height - padB + 14}
          fontSize="10"
          textAnchor="middle"
          fill="var(--bp-color-ink-55)"
        >
          {hour}:00
        </text>
      ))}
    </svg>
  );
}
