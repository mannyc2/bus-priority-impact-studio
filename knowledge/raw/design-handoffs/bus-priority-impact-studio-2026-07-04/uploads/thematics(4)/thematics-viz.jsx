// Thematics — inline viz primitives for articles and chat.
// Three families: metric (single fact), comparative (relationships), temporal (trend).
// Plus FindingCover — the generated SVG cover used on Home feed cards.

const { useId: useViz_useId } = React;

// ─── Metric row — one to four "single fact" tiles in serif ────────────────
function MetricRow({ items, source }) {
  return (
    <figure className="tx-viz tx-viz-metric">
      <div className="tx-metric-row">
        {items.map((it, i) => (
          <div key={i} className="tx-metric-tile">
            <div className="tx-metric-label">{it.label}</div>
            <div className="tx-metric-value">{it.value}</div>
            <div className="tx-metric-caption">{it.caption}</div>
          </div>
        ))}
      </div>
      {source && <figcaption className="tx-viz-caption">{source}</figcaption>}
    </figure>
  );
}

// ─── Comparative — horizontal bars in a single hue ────────────────────────
function BarsRow({ title, series, labels, hue = 'ocean', unit = '', source }) {
  const max = Math.max(...series);
  return (
    <figure className="tx-viz tx-viz-bars">
      {title && <div className="tx-viz-title">{title}</div>}
      <div className="tx-bars">
        {series.map((v, i) => {
          const w = (v / max) * 100;
          return (
            <div className="tx-bar-row" key={i}>
              <div className="tx-bar-label">{labels[i]}</div>
              <div className="tx-bar-track">
                <div className="tx-bar-fill" style={{
                  width: w + '%',
                  background: `var(--ramp-${hue}-500)`,
                }} />
              </div>
              <div className="tx-bar-val">{unit === '$' ? '$' + v : v}{unit && unit !== '$' ? unit : ''}{unit === '$' ? 'B' : ''}</div>
            </div>
          );
        })}
      </div>
      {source && <figcaption className="tx-viz-caption">{source}</figcaption>}
    </figure>
  );
}

// ─── Temporal — small line chart with a soft fill band ────────────────────
function SparklineBand({ title, series, labels, unit = '', source }) {
  const w = 600, h = 180, pad = 32;
  const max = Math.max(...series), min = Math.min(...series);
  const range = Math.max(1, max - min);
  const stepX = (w - pad * 2) / (series.length - 1);
  const pts = series.map((v, i) => [pad + i * stepX, h - pad - ((v - min) / range) * (h - pad * 2)]);
  const dPath = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const closed = `${dPath} L ${w - pad} ${h - pad} L ${pad} ${h - pad} Z`;

  // Reference grid: top, midline, baseline.
  const lines = [pad, (h - pad + pad) / 2, h - pad];

  return (
    <figure className="tx-viz tx-viz-line">
      {title && <div className="tx-viz-title">{title}</div>}
      <svg viewBox={`0 0 ${w} ${h}`} className="tx-line-svg" role="img" aria-label={title || 'line chart'}>
        {lines.map((y, i) => (
          <line key={i} x1={pad} x2={w - pad} y1={y} y2={y} stroke="var(--divider)" strokeWidth="1" />
        ))}
        <path d={closed} fill="var(--primary-soft)" opacity="0.55" />
        <path d={dPath} fill="none" stroke="var(--primary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="var(--background)" stroke="var(--primary)" strokeWidth="1.5" />
        ))}
        {/* Y-axis range labels */}
        <text x={pad - 8} y={pad + 4} className="tx-line-yLabel" textAnchor="end">{max}{unit}</text>
        <text x={pad - 8} y={h - pad + 4} className="tx-line-yLabel" textAnchor="end">{min}{unit}</text>
        {/* X-axis labels */}
        {pts.map((p, i) => (
          <text key={i} x={p[0]} y={h - pad + 18} className="tx-line-xLabel" textAnchor="middle">{labels[i]}</text>
        ))}
        {/* Last value pin */}
        <text x={pts[pts.length - 1][0]} y={pts[pts.length - 1][1] - 10} className="tx-line-pin" textAnchor="middle">
          {series[series.length - 1]}{unit}
        </text>
      </svg>
      {source && <figcaption className="tx-viz-caption">{source}</figcaption>}
    </figure>
  );
}

// ─── Renderer ────────────────────────────────────────────────────────────
function Viz({ viz }) {
  if (!viz) return null;
  if (viz.type === 'metric-row')     return <MetricRow {...viz} />;
  if (viz.type === 'bars-row')        return <BarsRow {...viz} />;
  if (viz.type === 'sparkline-band')  return <SparklineBand {...viz} />;
  return null;
}

// ─── FindingCover — generated SVG for feed cards ──────────────────────────
// Four kinds match data.cover.kind: sparkline / bars / distribution / gauge.
function FindingCover({ cover, theme, height = 200 }) {
  if (!cover) return null;
  const hue = cover.hue || theme?.hue || 'ocean';
  const fill = `var(--ramp-${hue}-50)`;
  const stroke = `var(--ramp-${hue}-500)`;
  const ink = `var(--ramp-${hue}-800)`;
  const soft = `var(--ramp-${hue}-200)`;

  // 16:9 ratio derived from height
  const w = 480, h = Math.round(w * (height / 320));
  const finalH = h; // px hint
  return (
    <div className="tx-cover" style={{ background: fill, height }}>
      <svg viewBox={`0 0 ${w} ${finalH}`} preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden="true">
        {cover.kind === 'sparkline' && <CoverSparkline w={w} h={finalH} stroke={stroke} ink={ink} soft={soft}/>}
        {cover.kind === 'bars'      && <CoverBars       w={w} h={finalH} stroke={stroke} ink={ink} soft={soft}/>}
        {cover.kind === 'distribution' && <CoverDist    w={w} h={finalH} stroke={stroke} ink={ink} soft={soft}/>}
        {cover.kind === 'gauge'     && <CoverGauge      w={w} h={finalH} stroke={stroke} ink={ink} soft={soft}/>}
      </svg>
      <div className="tx-cover-label" style={{ color: ink }}>{cover.label}</div>
    </div>
  );
}

function CoverSparkline({ w, h, stroke, ink, soft }) {
  const pts = [10, 18, 14, 22, 30, 26, 38, 42, 52, 48, 60, 70, 64, 78, 86, 80, 92];
  const pad = 40;
  const max = Math.max(...pts), min = Math.min(...pts);
  const range = max - min;
  const stepX = (w - pad * 2) / (pts.length - 1);
  const yy = (v) => h - pad - ((v - min) / range) * (h - pad * 2);
  const d = pts.map((v, i) => (i ? 'L' : 'M') + (pad + i * stepX).toFixed(1) + ' ' + yy(v).toFixed(1)).join(' ');
  const closed = `${d} L ${w - pad} ${h - pad} L ${pad} ${h - pad} Z`;
  return <>
    <path d={closed} fill={soft} opacity="0.55" />
    <path d={d} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round"/>
    <circle cx={pad + (pts.length - 1) * stepX} cy={yy(pts[pts.length - 1])} r="4" fill={ink}/>
  </>;
}

function CoverBars({ w, h, stroke, ink, soft }) {
  const data = [22, 38, 56, 78, 100];
  const pad = 40;
  const innerW = w - pad * 2, innerH = h - pad * 2;
  const bw = innerW / (data.length * 1.8);
  const gap = innerW / data.length - bw;
  return <>
    {data.map((v, i) => {
      const x = pad + i * (bw + gap);
      const bh = (v / 100) * innerH;
      return <rect key={i} x={x} y={h - pad - bh} width={bw} height={bh} fill={i === data.length - 1 ? ink : stroke} opacity={i === data.length - 1 ? 1 : 0.55} rx="2"/>;
    })}
    <line x1={pad - 4} x2={w - pad} y1={h - pad} y2={h - pad} stroke={soft} strokeWidth="1"/>
  </>;
}

function CoverDist({ w, h, stroke, ink, soft }) {
  // Distribution-of-dots
  const dots = [];
  const cols = 18, rows = 7;
  const pad = 40;
  const sx = (w - pad * 2) / (cols - 1);
  const sy = (h - pad * 2) / (rows - 1);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Bell-shape probability
      const mid = (cols - 1) / 2;
      const d = Math.abs(c - mid) / mid;
      const intensity = Math.max(0, 1 - d * d);
      const opacity = (Math.random() < intensity) ? (0.4 + intensity * 0.6) : 0;
      dots.push(<circle key={r + '-' + c} cx={pad + c * sx} cy={pad + r * sy} r={3 + intensity * 2} fill={stroke} opacity={opacity}/>);
    }
  }
  // Highlight median column
  dots.push(<circle key="med" cx={w / 2} cy={pad + ((rows - 1) / 2) * sy} r="6" fill={ink}/>);
  return <>{dots}</>;
}

function CoverGauge({ w, h, stroke, ink, soft }) {
  // Half-circle gauge with one needle
  const cx = w / 2, cy = h - 40, r = Math.min(w, h * 1.6) / 2 - 40;
  const arc = (ang) => {
    const a = (Math.PI * (180 + ang)) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const [x1, y1] = arc(0), [x2, y2] = arc(180);
  const needleAng = 130; // 0–180
  const [nx, ny] = arc(needleAng);
  return <>
    <path d={`M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`} fill="none" stroke={soft} strokeWidth="10" strokeLinecap="round"/>
    <path d={`M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 0 1 ${nx.toFixed(1)} ${ny.toFixed(1)}`} fill="none" stroke={stroke} strokeWidth="10" strokeLinecap="round"/>
    <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={ink} strokeWidth="2.5" strokeLinecap="round"/>
    <circle cx={cx} cy={cy} r="6" fill={ink}/>
  </>;
}

Object.assign(window, { Viz, MetricRow, BarsRow, SparklineBand, FindingCover });
