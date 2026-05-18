type Series = {
  label: string;
  color: string;
  hours: readonly number[];
};

export function HourOverlay({
  a,
  b,
  width = 520,
  height = 180,
  pad = 28,
}: {
  a: Series;
  b: Series;
  width?: number;
  height?: number;
  pad?: number;
}) {
  const n = Math.min(a.hours.length, b.hours.length);
  if (n === 0) return null;

  const aHours = a.hours.slice(0, n);
  const bHours = b.hours.slice(0, n);
  const max = Math.max(...aHours, ...bHours, 1);
  const innerW = width - pad * 2;
  const innerH = height - pad - 14;
  const step = innerW / (n - 1 || 1);

  function pointsFor(series: Series): string {
    return series.hours
      .map((v, i) => {
        const x = pad + i * step;
        const y = pad + innerH - (v / max) * innerH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  const aPoints = pointsFor({ ...a, hours: aHours });
  const bPoints = pointsFor({ ...b, hours: bHours });

  let fillPath = "";
  for (let i = 0; i < n; i += 1) {
    const x = pad + i * step;
    const aY = pad + innerH - ((aHours[i] ?? 0) / max) * innerH;
    const bY = pad + innerH - ((bHours[i] ?? 0) / max) * innerH;
    const hi = Math.min(aY, bY);
    const lo = Math.max(aY, bY);
    if (i === 0) {
      fillPath += `M ${x},${hi} L ${x},${lo} `;
    } else {
      fillPath += `L ${x},${lo} `;
    }
  }
  for (let i = n - 1; i >= 0; i -= 1) {
    const x = pad + i * step;
    const aY = pad + innerH - ((aHours[i] ?? 0) / max) * innerH;
    const bY = pad + innerH - ((bHours[i] ?? 0) / max) * innerH;
    const hi = Math.min(aY, bY);
    fillPath += `L ${x},${hi} `;
  }
  fillPath += "Z";

  return (
    <svg width={width} height={height} className="font-mono" role="img" aria-label="Hour overlay">
      <title>{`${a.label} vs ${b.label} by hour`}</title>
      <line
        x1={pad}
        y1={pad + innerH}
        x2={pad + innerW}
        y2={pad + innerH}
        stroke="var(--bp-color-ink-20)"
        strokeWidth={1}
      />
      <path d={fillPath} fill="var(--bp-color-accent-bg)" opacity={0.7} />
      <polyline points={aPoints} fill="none" stroke={a.color} strokeWidth={1.8} />
      <polyline points={bPoints} fill="none" stroke={b.color} strokeWidth={1.8} />
      {Array.from({ length: n }).map((_, i) => {
        if (i % 4 !== 0) return null;
        const x = pad + i * step;
        const label = `${i}:00`;
        return (
          <text
            key={`hour-${i}`}
            x={x}
            y={height - 2}
            fontSize={9}
            fill="var(--bp-color-ink-55)"
            textAnchor="middle"
          >
            {label}
          </text>
        );
      })}
      <g fontSize={10}>
        <rect x={pad} y={4} width={9} height={3} fill={a.color} />
        <text x={pad + 12} y={9} fill="var(--bp-color-ink-70)">
          {a.label}
        </text>
        <rect x={pad + 90} y={4} width={9} height={3} fill={b.color} />
        <text x={pad + 102} y={9} fill="var(--bp-color-ink-70)">
          {b.label}
        </text>
      </g>
    </svg>
  );
}
