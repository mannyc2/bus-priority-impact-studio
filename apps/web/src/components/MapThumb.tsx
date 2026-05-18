export function MapThumb({
  width = 120,
  height = 80,
  label = "segment map",
  emphasis = "var(--bp-color-accent)",
}: {
  width?: number;
  height?: number;
  label?: string;
  emphasis?: string;
}) {
  const stops = [
    [0.1, 0.85],
    [0.3, 0.55],
    [0.75, 0.35],
    [0.92, 0.18],
  ] as const;

  return (
    <div
      className="relative overflow-hidden rounded-[2px] border border-[var(--bp-color-rule)] bg-[var(--bp-color-paper-deep)] font-mono text-[9px] text-[var(--bp-color-ink-55)]"
      style={{
        width,
        height,
        backgroundImage:
          "repeating-linear-gradient(45deg, var(--bp-color-ink-06) 0 6px, transparent 6px 14px)",
      }}
    >
      <svg width={width} height={height} className="absolute inset-0" aria-hidden="true">
        <line
          x1="0"
          y1={height * 0.3}
          x2={width}
          y2={height * 0.3}
          stroke="var(--bp-color-ink-20)"
        />
        <line
          x1="0"
          y1={height * 0.6}
          x2={width}
          y2={height * 0.6}
          stroke="var(--bp-color-ink-20)"
        />
        <line
          x1={width * 0.25}
          y1="0"
          x2={width * 0.25}
          y2={height}
          stroke="var(--bp-color-ink-20)"
        />
        <line
          x1={width * 0.7}
          y1="0"
          x2={width * 0.7}
          y2={height}
          stroke="var(--bp-color-ink-20)"
        />
        <path
          d={`M${width * 0.1},${height * 0.85} L${width * 0.3},${height * 0.55} L${width * 0.75},${height * 0.35} L${width * 0.92},${height * 0.18}`}
          fill="none"
          stroke={emphasis}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.4"
        />
        {stops.map(([x, y]) => (
          <circle
            key={`${x}-${y}`}
            cx={x * width}
            cy={y * height}
            r="2.2"
            fill="white"
            stroke={emphasis}
            strokeWidth="1.4"
          />
        ))}
      </svg>
      <div className="absolute bottom-[3px] left-1 font-mono text-[8.5px] text-[var(--bp-color-ink-55)]">
        {label}
      </div>
    </div>
  );
}
