// route-compare-inline.jsx
// ─────────────────────────────────────────────────────────────
// Compare, built ON TOP of the regular route page (not a separate
// workbench). You're on M15's detail page; clicking "Compare with…"
// layers a second route onto the SAME surface:
//   • the header gains a second route badge + a picker
//   • the KPI strip flips from absolute → relative (signed deltas)
//   • the Overview visualizations get the peer drawn on top of them
//     (corridor benchmark line, overlaid speed trend & hour profile,
//      a head-to-head ledger)
// Exit compare and you're back to the plain route page.
//
// Deps (resolved at render via shared global scope): system.jsx,
// corridor-map.jsx, route-detail-tabs.jsx, route-first.jsx helpers.
// ─────────────────────────────────────────────────────────────

const RCI_W = 1320, RCI_H = 880;

// ── The subject route (M15 SBS) — mirrors the route-detail page ──
const RCI_PRIMARY = {
  id: 'M15', badge: { route: 'M15', sbs: true },
  name: '1st Avenue / 2nd Avenue Select Bus Service',
  meta: 'Manhattan · East Harlem ↔ South Ferry · 8.4 mi · 33 stops',
  speed: 6.74, riders: 37200, lost: 4310, lane: 72, tsp: 18,
  length: '8.4 mi', stops: 33, ace: { on: true, since: 'Nov 2019' },
  trend: [7.9, 7.7, 7.6, 7.4, 7.1, 6.9, 6.8, 6.7, 6.8, 6.9, 6.8, 6.6, 6.4, 6.3],
  hour: [8.1, 8.2, 8.3, 8.4, 8.2, 7.6, 6.8, 5.4, 4.9, 5.5, 5.9, 6.0, 5.8, 5.6, 5.4, 5.2, 4.8, 4.2, 4.6, 5.8, 6.5, 7.0, 7.5, 7.8],
};

// ── Routes you can lay over it ────────────────────────────────
// M15 Local is the headline case: SAME street, SAME lane, SAME ACE —
// it just stops everywhere the SBS skips, so it isolates the service
// pattern. The three SBS peers are positive controls.
const RCI_COMPARE = {
  M15L: {
    id: 'M15L', badge: { route: 'M15', sbs: false }, kind: 'Local sibling',
    name: 'M15 Local · 1 Av / 2 Av', meta: 'Same corridor · stops every 2–3 blocks',
    speed: 5.10, riders: 11400, lost: 3950, lane: 72, tsp: 18,
    length: '8.4 mi', stops: 99, ace: { on: true, since: 'Nov 2019' },
    trend: [6.2, 6.1, 6.0, 5.9, 5.7, 5.5, 5.4, 5.3, 5.4, 5.4, 5.3, 5.2, 5.1, 5.0],
    hour: [6.5, 6.6, 6.7, 6.8, 6.6, 6.0, 5.2, 4.0, 3.6, 4.1, 4.4, 4.5, 4.3, 4.2, 4.0, 3.9, 3.5, 3.1, 3.4, 4.3, 4.9, 5.4, 5.9, 6.2],
  },
  Bx12: {
    id: 'Bx12', badge: { route: 'Bx12', sbs: true }, kind: 'Positive control',
    name: 'Bx12 SBS · Fordham Rd / Pelham Pkwy', meta: 'Bronx · fully-treated exemplar',
    speed: 8.61, riders: 41000, lost: 1850, lane: 94, tsp: 46,
    length: '7.9 mi', stops: 31, ace: { on: true, since: 'Jun 2020' },
    trend: [8.2, 8.3, 8.3, 8.4, 8.5, 8.5, 8.6, 8.6, 8.7, 8.6, 8.6, 8.6, 8.6, 8.6],
    hour: [8.4, 8.6, 8.7, 8.9, 8.8, 8.4, 6.9, 6.4, 6.5, 7.3, 7.5, 7.2, 7.0, 7.0, 7.1, 6.8, 6.3, 6.0, 6.2, 6.9, 7.8, 8.2, 8.4, 8.5],
  },
  M14: {
    id: 'M14', badge: { route: 'M14', sbs: true }, kind: 'Busway exemplar',
    name: 'M14 SBS · 14th Street busway', meta: 'Manhattan · car-free spine',
    speed: 7.92, riders: 28800, lost: 2100, lane: 88, tsp: 30,
    length: '2.1 mi', stops: 22, ace: { on: true, since: 'Mar 2021' },
    trend: [7.6, 7.7, 7.8, 7.9, 8.0, 7.9, 7.9, 8.0, 7.9, 7.9, 7.9, 7.9, 7.9, 7.9],
    hour: [7.8, 8.0, 8.2, 8.4, 8.3, 7.9, 7.0, 6.6, 6.8, 7.4, 7.6, 7.3, 7.1, 7.0, 7.1, 6.9, 6.4, 6.1, 6.3, 7.0, 7.7, 8.0, 8.1, 8.2],
  },
  Q44: {
    id: 'Q44', badge: { route: 'Q44', sbs: true }, kind: 'Slow peer',
    name: 'Q44 SBS · Main St / White Plains Rd', meta: 'Queens ↔ Bronx · congested',
    speed: 5.18, riders: 44100, lost: 4980, lane: 61, tsp: 20,
    length: '9.2 mi', stops: 38, ace: { on: true, since: 'Sep 2021' },
    trend: [5.6, 5.5, 5.5, 5.4, 5.3, 5.3, 5.2, 5.2, 5.2, 5.2, 5.2, 5.2, 5.2, 5.18],
    hour: [6.6, 6.8, 7.0, 7.2, 7.0, 6.2, 4.8, 4.3, 4.5, 5.1, 5.3, 5.0, 4.9, 4.8, 4.9, 4.5, 3.9, 3.6, 3.9, 4.7, 5.6, 6.2, 6.4, 6.6],
  },
};
const RCI_COMPARE_ORDER = ['M15L', 'Bx12', 'M14', 'Q44'];
const RCI_TREND_LABELS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];

// Comparison overlay color — the peer route always reads in civic blue
// so the subject (warm ink / red) stays visually primary.
const RCI_PEER = BPI.accent;

// ── Metric model — single source for the KPI strip + the ledger ──
const RCI_METRICS = [
  { key: 'speed',  label: 'Weighted avg speed',   unit: 'mph',    dir: 'up',   fmt: (v) => v.toFixed(2),                 d: (v) => v.toFixed(2) },
  { key: 'riders', label: 'Daily riders',         unit: '/ day',  dir: 'up',   fmt: (v) => (v / 1000).toFixed(1) + 'K',  d: (v) => (v / 1000).toFixed(1) + 'K' },
  { key: 'lost',   label: 'Rider-hours lost / day', unit: 'RH',   dir: 'down', fmt: (v) => v.toLocaleString(),           d: (v) => v.toLocaleString() },
  { key: 'lane',   label: 'Bus-lane coverage',    unit: '%',      dir: 'up',   fmt: (v) => v.toFixed(0),                 d: (v) => v.toFixed(0) },
];

function rciDiff(m, a, b) {
  const av = a[m.key], bv = b[m.key];
  const raw = av - bv;                                  // subject minus peer
  const tie = Math.abs(raw) < 1e-9;
  const better = m.dir === 'up' ? raw > 0 : raw < 0;
  const pct = bv !== 0 ? Math.abs(raw) / bv * 100 : 0;
  return { av, bv, raw, tie, better, pct };
}

// ── DeltaPill — signed difference, colored by whether the subject wins ──
function DeltaPill({ raw, tie, better, text, size = 'md' }) {
  const color = tie ? BPI.ink40 : better ? BPI.good : BPI.bad;
  const bg = tie ? BPI.ink06 : better ? BPI.goodBg : BPI.badBg;
  const fs = size === 'sm' ? 10 : 11;
  return (
    <span className="num" style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: fs, fontWeight: 700, fontFamily: BPIMono, color,
      background: bg, borderRadius: 3, padding: size === 'sm' ? '2px 6px' : '3px 7px',
      whiteSpace: 'nowrap', letterSpacing: '0.01em',
    }}>
      <span style={{ fontSize: fs - 2.5 }}>{tie ? '·' : raw > 0 ? '▲' : '▼'}</span>
      {text}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// CompareSpeedTrend — M15 trend with the peer's trend drawn on top.
// ─────────────────────────────────────────────────────────────
function CompareSpeedTrend({ primary, comp, width = 560, height = 184 }) {
  const padL = 30, padR = 64, padT = 16, padB = 24;
  const n = primary.trend.length;
  const cw = (width - padL - padR) / (n - 1);
  const all = [...primary.trend, ...comp.trend];
  const lo = Math.floor(Math.min(...all) - 0.4);
  const hi = Math.ceil(Math.max(...all) + 0.4);
  const yv = (v) => padT + (1 - (v - lo) / (hi - lo)) * (height - padT - padB);
  const path = (arr) => arr.map((v, i) => (i ? 'L' : 'M') + (padL + i * cw).toFixed(1) + ',' + yv(v).toFixed(1)).join(' ');
  const ticks = [];
  for (let v = lo; v <= hi; v += 1) ticks.push(v);
  const endA = primary.trend[n - 1], endB = comp.trend[n - 1];
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={padL} x2={width - padR} y1={yv(v)} y2={yv(v)} stroke={BPI.rule} />
          <text x={padL - 5} y={yv(v) + 3} fontSize="9" textAnchor="end" fill={BPI.ink55} fontFamily={BPIMono}>{v.toFixed(0)}</text>
        </g>
      ))}
      {/* gap band between the two routes */}
      <path
        d={path(primary.trend) + ' ' +
           comp.trend.slice().reverse().map((v, i) => 'L' + (padL + (n - 1 - i) * cw).toFixed(1) + ',' + yv(v).toFixed(1)).join(' ') + ' Z'}
        fill={RCI_PEER} opacity="0.06" />
      {/* peer */}
      <path d={path(comp.trend)} fill="none" stroke={RCI_PEER} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      {/* subject */}
      <path d={path(primary.trend)} fill="none" stroke={BPI.ink} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {[[endB, RCI_PEER, comp.badge.route], [endA, BPI.ink, primary.badge.route]].map(([v, c, lbl], i) => (
        <g key={i}>
          <circle cx={padL + (n - 1) * cw} cy={yv(v)} r="3.4" fill={c} />
          <text x={padL + (n - 1) * cw + 8} y={yv(v) + 3.5} fontSize="10.5" fontWeight="700" fill={c} fontFamily={BPIMono}>{v.toFixed(1)}</text>
        </g>
      ))}
      {RCI_TREND_LABELS.map((l, i) => i % 3 === 0 && (
        <text key={i} x={padL + i * cw} y={height - padB + 14} fontSize="9" textAnchor="middle" fill={BPI.ink55} fontFamily={BPIMono}>{l}</text>
      ))}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// CompareHourSpeed — both routes' hour-of-day profiles overlaid.
// ─────────────────────────────────────────────────────────────
function CompareHourSpeed({ primary, comp, width = 560, height = 184 }) {
  const padL = 30, padR = 14, padT = 16, padB = 24;
  const cw = (width - padL - padR) / 23;
  const min = 3, max = 9;
  const yv = (v) => padT + (1 - (Math.max(min, Math.min(max, v)) - min) / (max - min)) * (height - padT - padB);
  const path = (arr) => arr.map((v, i) => (i ? 'L' : 'M') + (padL + i * cw).toFixed(1) + ',' + yv(v).toFixed(1)).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {[3, 5, 7, 9].map((v) => (
        <g key={v}>
          <line x1={padL} x2={width - padR} y1={yv(v)} y2={yv(v)} stroke={BPI.rule} />
          <text x={padL - 5} y={yv(v) + 3} fontSize="9" textAnchor="end" fill={BPI.ink55} fontFamily={BPIMono}>{v}</text>
        </g>
      ))}
      <path
        d={path(primary.hour) + ' ' +
           comp.hour.slice().reverse().map((v, i) => 'L' + (padL + (23 - i) * cw).toFixed(1) + ',' + yv(v).toFixed(1)).join(' ') + ' Z'}
        fill={RCI_PEER} opacity="0.06" />
      <path d={path(comp.hour)} fill="none" stroke={RCI_PEER} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <path d={path(primary.hour)} fill="none" stroke={BPI.ink} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {[0, 6, 12, 18].map((h0) => (
        <text key={h0} x={padL + h0 * cw} y={height - padB + 14} fontSize="9" textAnchor="middle" fill={BPI.ink55} fontFamily={BPIMono}>{h0}:00</text>
      ))}
    </svg>
  );
}

// Two-swatch legend used under the overlay charts.
function RCILegend({ primary, comp }) {
  const Item = ({ color, label, dash }) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, color: BPI.ink70 }}>
      <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke={color} strokeWidth="2.2" strokeDasharray={dash || 'none'} strokeLinecap="round" /></svg>
      {label}
    </span>
  );
  return (
    <div style={{ display: 'flex', gap: 18, marginTop: 10 }}>
      <Item color={BPI.ink} label={`${primary.badge.route} SBS — this route`} />
      <Item color={RCI_PEER} label={comp.name.split(' · ')[0]} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CompareHeadToHead — the relative ledger as a compact table. Numeric
// rows carry a signed delta; categorical rows show both sides plainly.
// ─────────────────────────────────────────────────────────────
function CompareHeadToHead({ primary, comp }) {
  const numRows = [
    { label: 'Weighted avg speed', unit: 'mph', dir: 'up',   a: primary.speed, b: comp.speed, fmt: (v) => v.toFixed(2) },
    { label: 'Daily riders',       unit: '',    dir: 'up',   a: primary.riders, b: comp.riders, fmt: (v) => (v / 1000).toFixed(1) + 'K' },
    { label: 'Rider-hours lost / day', unit: '', dir: 'down', a: primary.lost, b: comp.lost, fmt: (v) => v.toLocaleString() },
    { label: 'Bus-lane coverage',  unit: '%',   dir: 'up',   a: primary.lane, b: comp.lane, fmt: (v) => v.toFixed(0) + '%' },
    { label: 'Signal priority (TSP)', unit: '%', dir: 'up',  a: primary.tsp, b: comp.tsp, fmt: (v) => v.toFixed(0) + '%' },
  ];
  const catRows = [
    { label: 'Corridor length', a: primary.length, b: comp.length },
    { label: 'Stops', a: String(primary.stops), b: String(comp.stops) },
    { label: 'ACE enforcement', a: `Active · ${primary.ace.since}`, b: `Active · ${comp.ace.since}` },
  ];
  const Head = () => (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 132px 132px 150px', alignItems: 'center',
      padding: '11px 18px', background: BPI.paperDeep, boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
      fontSize: 9.5, color: BPI.ink55, letterSpacing: '0.08em', fontWeight: 700, textTransform: 'uppercase',
    }}>
      <span>Metric</span>
      <span style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end' }}>
        <RouteBadge route={primary.badge.route} sbs={primary.badge.sbs} size="sm" />
      </span>
      <span style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end' }}>
        <RouteBadge route={comp.badge.route} sbs={comp.badge.sbs} size="sm" />
      </span>
      <span style={{ textAlign: 'right' }}>Δ vs {comp.badge.route}{comp.badge.sbs ? '' : ' Local'}</span>
    </div>
  );
  return (
    <div style={{ background: BPI.card, borderRadius: 4, boxShadow: `0 0 0 1px ${BPI.rule}`, overflow: 'hidden' }}>
      <Head />
      {numRows.map((r, i) => {
        const raw = r.a - r.b, tie = Math.abs(raw) < 1e-9;
        const better = r.dir === 'up' ? raw > 0 : raw < 0;
        const dtxt = (raw > 0 ? '+' : '−') + r.fmt(Math.abs(raw)).replace('%', '') + (r.unit === '%' ? ' pts' : r.unit ? ' ' + r.unit : '');
        return (
          <div key={r.label} style={{
            display: 'grid', gridTemplateColumns: '1fr 132px 132px 150px', alignItems: 'center',
            padding: '13px 18px', boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
          }}>
            <span style={{ fontSize: 12.5, fontWeight: 500, color: BPI.ink70 }}>{r.label}</span>
            <span className="num" style={{ textAlign: 'right', fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', color: tie ? BPI.ink : better ? BPI.ink : BPI.ink55 }}>{r.fmt(r.a)}</span>
            <span className="num" style={{ textAlign: 'right', fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', color: tie ? BPI.ink : !better ? BPI.ink : BPI.ink55 }}>{r.fmt(r.b)}</span>
            <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <DeltaPill raw={raw} tie={tie} better={better} text={tie ? 'even' : dtxt} />
            </span>
          </div>
        );
      })}
      {catRows.map((r, i) => (
        <div key={r.label} style={{
          display: 'grid', gridTemplateColumns: '1fr 132px 132px 150px', alignItems: 'center',
          padding: '11px 18px', boxShadow: i < catRows.length - 1 ? `inset 0 -1px 0 ${BPI.rule}` : 'none',
          background: BPI.paper,
        }}>
          <span style={{ fontSize: 12.5, fontWeight: 500, color: BPI.ink70 }}>{r.label}</span>
          <span className="num" style={{ textAlign: 'right', fontSize: 12.5, color: BPI.ink }}>{r.a}</span>
          <span className="num" style={{ textAlign: 'right', fontSize: 12.5, color: BPI.ink }}>{r.b}</span>
          <span style={{ textAlign: 'right', fontSize: 10.5, color: BPI.ink40, fontFamily: BPIMono }}>—</span>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, {
  RCI_PRIMARY, RCI_COMPARE, RCI_COMPARE_ORDER, RCI_METRICS, RCI_PEER,
  rciDiff, DeltaPill, CompareSpeedTrend, CompareHourSpeed, RCILegend, CompareHeadToHead,
});
