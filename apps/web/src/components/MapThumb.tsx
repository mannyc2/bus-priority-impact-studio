type LineGeometry = {
  coordinates: ReadonlyArray<readonly [number, number]>;
};

export function MapThumb({
  width = 120,
  height = 80,
  label = "segment map",
  emphasis = "var(--bp-color-accent)",
  line,
}: {
  width?: number;
  height?: number;
  label?: string;
  emphasis?: string;
  line?: LineGeometry | null;
}) {
  const padX = width / 10;
  const padY = height / 10;
  const innerW = width - 2 * padX;
  const innerH = height - 2 * padY;

  const projectedPoints =
    line && line.coordinates.length >= 2
      ? (() => {
          const lngs = line.coordinates.map(([lng]) => lng);
          const lats = line.coordinates.map(([, lat]) => lat);
          const lngMin = Math.min(...lngs);
          const lngMax = Math.max(...lngs);
          const latMin = Math.min(...lats);
          const latMax = Math.max(...lats);
          const lngSpan = lngMax - lngMin;
          const latSpan = latMax - latMin;
          return line.coordinates.map(([lng, lat]) => {
            const x = padX + (lngSpan === 0 ? 0.5 : (lng - lngMin) / lngSpan) * innerW;
            const y = padY + (latSpan === 0 ? 0.5 : 1 - (lat - latMin) / latSpan) * innerH;
            return [x, y] as const;
          });
        })()
      : null;

  const fallbackPath = `M${width * 0.1},${height * 0.85} L${width * 0.3},${height * 0.55} L${width * 0.75},${height * 0.35} L${width * 0.92},${height * 0.18}`;
  const pathD =
    projectedPoints === null
      ? fallbackPath
      : projectedPoints.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x},${y}`).join(" ");

  const firstPoint = projectedPoints?.[0];
  const lastPoint = projectedPoints?.[projectedPoints.length - 1];
  const circleCenters: ReadonlyArray<readonly [number, number]> =
    firstPoint !== undefined && lastPoint !== undefined
      ? [firstPoint, lastPoint]
      : [
          [width * 0.1, height * 0.85],
          [width * 0.92, height * 0.18],
        ];

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
          d={pathD}
          fill="none"
          stroke={emphasis}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.4"
        />
        {circleCenters.map(([cx, cy]) => (
          <circle
            key={`${cx}-${cy}`}
            cx={cx}
            cy={cy}
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
