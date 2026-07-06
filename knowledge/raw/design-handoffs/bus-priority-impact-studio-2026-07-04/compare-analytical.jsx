// Compare · Analytical — the analyst workbench variant.
//
// Denser, more rigorous take on the side-by-side compare. Where the
// standard view is editorial (one number vs another, a verdict), this
// is a working surface: every headline metric in a matrix with signed
// deltas, % change, and where each route sits in the *system* (percentile),
// driven by real controls — time window, normalization, direction — that
// recompute the numbers off the underlying hourly + segment data.

const CAW = 1480, CAH = 980;

// ─────────────────────────────────────────────────────────────
// Enriched route library (self-contained). Adds the analytical fields:
// miles, sample size, reliability (CV), on-time %, stops/mi, ACE captures,
// 8-week trends, system percentiles, and per-segment length + scheduled mph.
// ─────────────────────────────────────────────────────────────
const RX = {
  M15: {
    id: 'M15', badge: { route: 'M15', sbs: true }, name: '1st Av / 2nd Av', boro: 'Manhattan',
    miles: 8.4, days: 42, speed: 6.74, riders: 37200, lost: 4310, lane: 72,
    relCV: 0.41, onTime: 68, stopsPerMi: 4.8, aceCaptures: 1120,
    hour: [7.4, 7.6, 7.8, 8.1, 7.9, 7.0, 5.4, 4.7, 5.0, 5.9, 6.0, 5.8, 5.6, 5.4, 5.5, 5.0, 4.2, 3.8, 4.1, 5.2, 6.4, 7.0, 7.2, 7.4],
    trendSpeed: [7.0, 6.9, 6.8, 6.85, 6.7, 6.8, 6.75, 6.74],
    trendLost: [3900, 4050, 4100, 4200, 4180, 4260, 4290, 4310],
    pct: { speed: 22, ttP85: 25, reliability: 30, onTime: 34, riders: 88, lost: 18, lane: 55, stopsPerMi: 40 },
    segs: [
      { dir: 'NB', from: 'Madison · 28', to: 'Madison · 58', mph: 4.2, sched: 6.8, len: 1.5, rh: 18420, lane: 'partial', ace: false, tsp: false },
      { dir: 'NB', from: '1 Av · 14', to: '1 Av · 34', mph: 4.9, sched: 6.5, len: 1.0, rh: 14110, lane: 'yes', ace: true, tsp: false },
      { dir: 'SB', from: '2 Av · 60', to: '2 Av · 42', mph: 5.2, sched: 6.6, len: 0.9, rh: 12880, lane: 'yes', ace: true, tsp: false },
      { dir: 'NB', from: '1 Av · 86', to: '1 Av · 96', mph: 5.8, sched: 6.9, len: 0.5, rh: 9640, lane: 'yes', ace: true, tsp: true },
      { dir: 'SB', from: '2 Av · 23', to: '2 Av · 14', mph: 6.1, sched: 6.7, len: 0.5, rh: 8210, lane: 'yes', ace: true, tsp: false },
    ],
  },
  Bx12: {
    id: 'Bx12', badge: { route: 'Bx12', sbs: true }, name: 'Fordham / Pelham', boro: 'Bronx',
    miles: 7.9, days: 42, speed: 8.61, riders: 41000, lost: 1850, lane: 94,
    relCV: 0.24, onTime: 81, stopsPerMi: 3.9, aceCaptures: 640,
    hour: [8.4, 8.6, 8.7, 8.9, 8.8, 8.4, 6.9, 6.4, 6.5, 7.3, 7.5, 7.2, 7.0, 7.0, 7.1, 6.8, 6.3, 6.0, 6.2, 6.9, 7.8, 8.2, 8.4, 8.5],
    trendSpeed: [8.3, 8.4, 8.5, 8.45, 8.55, 8.5, 8.6, 8.61],
    trendLost: [2100, 2000, 1980, 1920, 1900, 1880, 1860, 1850],
    pct: { speed: 74, ttP85: 78, reliability: 80, onTime: 79, riders: 92, lost: 82, lane: 96, stopsPerMi: 70 },
    segs: [
      { dir: 'EB', from: 'Fordham · GC', to: 'Fordham · Webster', mph: 5.4, sched: 6.4, len: 0.8, rh: 11820, lane: 'yes', ace: true, tsp: true },
      { dir: 'EB', from: 'Fordham · 3 Av', to: 'Fordham · Bronx P', mph: 6.3, sched: 6.9, len: 0.7, rh: 9210, lane: 'yes', ace: true, tsp: false },
      { dir: 'WB', from: 'Pelham · East', to: 'Pelham · Bronxdal', mph: 6.7, sched: 7.0, len: 0.9, rh: 8420, lane: 'yes', ace: true, tsp: false },
      { dir: 'EB', from: 'Pelham · Westch', to: 'Pelham · East', mph: 7.2, sched: 7.4, len: 0.8, rh: 7100, lane: 'yes', ace: true, tsp: true },
      { dir: 'WB', from: 'Fordham · Bronx', to: 'Fordham · 3 Av', mph: 7.5, sched: 7.6, len: 0.7, rh: 6210, lane: 'yes', ace: true, tsp: true },
    ],
  },
  M14: {
    id: 'M14', badge: { route: 'M14', sbs: true }, name: '14 St busway', boro: 'Manhattan',
    miles: 2.1, days: 40, speed: 7.92, riders: 28800, lost: 2100, lane: 88,
    relCV: 0.29, onTime: 77, stopsPerMi: 6.1, aceCaptures: 410,
    hour: [7.8, 8.0, 8.2, 8.4, 8.3, 7.9, 7.0, 6.6, 6.8, 7.4, 7.6, 7.3, 7.1, 7.0, 7.1, 6.9, 6.4, 6.1, 6.3, 7.0, 7.7, 8.0, 8.1, 8.2],
    trendSpeed: [7.6, 7.7, 7.8, 7.85, 7.9, 7.88, 7.9, 7.92],
    trendLost: [2400, 2300, 2250, 2200, 2150, 2120, 2110, 2100],
    pct: { speed: 66, ttP85: 70, reliability: 68, onTime: 72, riders: 64, lost: 75, lane: 90, stopsPerMi: 25 },
    segs: [
      { dir: 'EB', from: '14 St · Union Sq', to: '14 St · 6 Av', mph: 5.6, sched: 6.6, len: 0.4, rh: 9120, lane: 'yes', ace: true, tsp: false },
      { dir: 'WB', from: '14 St · 3 Av', to: '14 St · Union Sq', mph: 6.1, sched: 6.8, len: 0.4, rh: 7840, lane: 'yes', ace: true, tsp: false },
      { dir: 'EB', from: '14 St · 8 Av', to: '14 St · 6 Av', mph: 6.8, sched: 7.1, len: 0.3, rh: 6210, lane: 'yes', ace: true, tsp: true },
      { dir: 'WB', from: 'Av A · 14', to: '1 Av · 14', mph: 7.0, sched: 7.2, len: 0.3, rh: 5180, lane: 'partial', ace: true, tsp: false },
      { dir: 'EB', from: '14 St · 9 Av', to: '14 St · 8 Av', mph: 7.4, sched: 7.5, len: 0.3, rh: 4020, lane: 'yes', ace: true, tsp: false },
    ],
  },
  Q44: {
    id: 'Q44', badge: { route: 'Q44', sbs: true }, name: 'Main St / WPR', boro: 'Queens–Bronx',
    miles: 9.2, days: 41, speed: 5.18, riders: 44100, lost: 4980, lane: 61,
    relCV: 0.47, onTime: 61, stopsPerMi: 4.2, aceCaptures: 1340,
    hour: [6.6, 6.8, 7.0, 7.2, 7.0, 6.2, 4.8, 4.3, 4.5, 5.1, 5.3, 5.0, 4.9, 4.8, 4.9, 4.5, 3.9, 3.6, 3.9, 4.7, 5.6, 6.2, 6.4, 6.6],
    trendSpeed: [5.4, 5.3, 5.35, 5.25, 5.2, 5.22, 5.19, 5.18],
    trendLost: [4600, 4700, 4750, 4820, 4880, 4920, 4960, 4980],
    pct: { speed: 14, ttP85: 16, reliability: 20, onTime: 24, riders: 96, lost: 12, lane: 42, stopsPerMi: 50 },
    segs: [
      { dir: 'NB', from: 'Main · Roosevelt', to: 'Main · Northern', mph: 3.9, sched: 6.2, len: 1.1, rh: 16240, lane: 'partial', ace: true, tsp: false },
      { dir: 'SB', from: 'Main · Kissena', to: 'Main · Roosevelt', mph: 4.4, sched: 6.0, len: 0.9, rh: 13180, lane: 'minimal', ace: false, tsp: false },
      { dir: 'NB', from: 'Main · Sanford', to: 'Main · Kissena', mph: 4.8, sched: 6.1, len: 0.8, rh: 11020, lane: 'partial', ace: true, tsp: false },
      { dir: 'SB', from: 'WPR · Pelham', to: 'WPR · Gun Hill', mph: 5.5, sched: 6.5, len: 1.0, rh: 9210, lane: 'yes', ace: true, tsp: false },
      { dir: 'NB', from: 'WPR · 180', to: 'WPR · Gun Hill', mph: 6.0, sched: 6.7, len: 0.9, rh: 7640, lane: 'yes', ace: true, tsp: true },
    ],
  },
};
const RX_ORDER = ['M15', 'Bx12', 'M14', 'Q44'];

// ─────────────────────────────────────────────────────────────
// Window / normalization model — recompute metrics off hour data.
// ─────────────────────────────────────────────────────────────
const WINDOWS = [['all', 'All day'], ['am', 'AM peak'], ['mid', 'Midday'], ['pm', 'PM peak'], ['late', 'Evening']];
const WIN_HOURS = { am: [7, 9], mid: [11, 14], pm: [17, 19], late: [20, 23] };
const LOST_SHARE = { all: 1, am: 0.30, mid: 0.22, pm: 0.34, late: 0.14 };
const REL_FACT = { all: 1, am: 1.18, mid: 0.92, pm: 1.22, late: 0.85 };
const OT_FACT = { all: 1, am: 0.88, mid: 1.06, pm: 0.84, late: 1.10 };

function windowSpeed(route, win) {
  if (win === 'all' || !WIN_HOURS[win]) return route.speed;
  const [a, b] = WIN_HOURS[win];
  let s = 0, n = 0;
  for (let i = a; i <= b; i++) { s += route.hour[i]; n++; }
  return s / n;
}

// Returns { key: {v, pct} } of displayed values under window+norm.
function metricsFor(route, win, norm) {
  const speed = windowSpeed(route, win);
  const ttP50 = route.miles / speed * 60;
  const rel = route.relCV * (REL_FACT[win] ?? 1);
  const ttP85 = ttP50 * (1 + rel);
  const onTime = Math.min(99, route.onTime * (OT_FACT[win] ?? 1));
  let riders = route.riders;
  let lost = route.lost * (LOST_SHARE[win] ?? 1);
  if (norm === 'permi') { riders = riders / route.miles; lost = lost / route.miles; }
  else if (norm === 'perrider') { lost = lost * 60 / route.riders; } // min / rider / day
  const p = route.pct;
  return {
    speed: { v: speed, pct: p.speed },
    ttP85: { v: ttP85, pct: p.ttP85 },
    reliability: { v: rel, pct: p.reliability },
    onTime: { v: onTime, pct: p.onTime },
    riders: { v: riders, pct: p.riders },
    lost: { v: lost, pct: p.lost },
    lane: { v: route.lane, pct: p.lane },
    stopsPerMi: { v: route.stopsPerMi, pct: p.stopsPerMi },
    aceCaptures: { v: route.aceCaptures, pct: null },
  };
}

// Metric row config
const MX = [
  { key: 'speed', label: 'Weighted speed', unit: 'mph', dir: 'up', dec: 2, spark: 'trendSpeed' },
  { key: 'ttP85', label: 'Travel time · p85', unit: 'min', dir: 'down', dec: 1 },
  { key: 'reliability', label: 'Headway reliability', sub: 'CV', unit: '', dir: 'down', dec: 2 },
  { key: 'onTime', label: 'On-time performance', unit: '%', dir: 'up', dec: 0 },
  { key: 'riders', label: 'Daily riders', unit: '', dir: 'up' },
  { key: 'lost', label: 'Rider-hours lost', unit: 'RH/day', dir: 'down', spark: 'trendLost' },
  { key: 'lane', label: 'Lane coverage', unit: '%', dir: 'up', dec: 0 },
  { key: 'stopsPerMi', label: 'Stops per mile', unit: '/mi', dir: 'down', dec: 1 },
  { key: 'aceCaptures', label: 'ACE captures', unit: '/day', dir: null, dec: 0 },
];

function unitFor(row, norm) {
  if (row.key === 'riders') return norm === 'permi' ? '/mi' : '';
  if (row.key === 'lost') return norm === 'perrider' ? 'min/rider' : (norm === 'permi' ? 'RH/mi' : 'RH/day');
  return row.unit;
}
function fmtVal(row, v, norm) {
  if (row.key === 'riders') return norm === 'permi' ? Math.round(v).toLocaleString() : (v / 1000).toFixed(1) + 'K';
  if (row.key === 'lost') return norm === 'perrider' ? v.toFixed(1) : Math.round(v).toLocaleString();
  return v.toFixed(row.dec ?? 0);
}

// ─────────────────────────────────────────────────────────────
// Generic segmented control
// ─────────────────────────────────────────────────────────────
function SegX({ value, onChange, options, size = 'md' }) {
  const pad = size === 'sm' ? '4px 9px' : '5px 11px';
  const fs = size === 'sm' ? 11 : 11.5;
  return (
    <div style={{ display: 'inline-flex', background: BPI.ink06, borderRadius: 4, padding: 2 }}>
      {options.map(([k, l]) => {
        const on = value === k;
        return (
          <button key={k} className="bpi" onClick={() => onChange(k)} style={{
            padding: pad, fontSize: fs, fontWeight: on ? 600 : 500, fontFamily: 'inherit',
            border: 'none', borderRadius: 3, cursor: 'pointer', whiteSpace: 'nowrap',
            background: on ? BPI.card : 'transparent', color: on ? BPI.ink : BPI.ink55,
            boxShadow: on ? `0 0 0 1px ${BPI.rule}` : 'none', transition: 'background .1s',
          }}>{l}</button>
        );
      })}
    </div>
  );
}

function ControlGroup({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 9.5, fontWeight: 700, color: BPI.ink40, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: BPIMono }}>{label}</span>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Compact route picker for the analytical header
// ─────────────────────────────────────────────────────────────
function PickerX({ route, slot, otherId, open, onToggle, onPick }) {
  return (
    <div style={{ position: 'relative' }}>
      <button className="bpi" onClick={onToggle} style={{
        display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px',
        background: open ? BPI.ink06 : 'transparent', border: `1px solid ${open ? BPI.ink20 : 'transparent'}`,
        borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit',
      }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: BPI.ink40, fontFamily: BPIMono }}>{slot}</span>
        <RouteBadge route={route.badge.route} sbs={route.badge.sbs} size="md" />
        <span style={{ fontSize: 13, fontWeight: 600, color: BPI.ink }}>{route.name}</span>
        <span style={{ fontSize: 8, color: BPI.ink40, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 40, width: 268,
          background: BPI.cardRaised || '#fefef9', borderRadius: 5, padding: 4,
          boxShadow: `0 0 0 1px ${BPI.rule}, 0 18px 40px -18px rgba(22,20,15,.4)`,
        }}>
          {RX_ORDER.map((id) => {
            const r = RX[id]; const selected = id === route.id;
            return (
              <button key={id} className="bpi" onClick={() => onPick(id)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 9px',
                borderRadius: 3, border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                background: selected ? BPI.accentBg : 'transparent',
              }}
                onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = BPI.ink06; }}
                onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = 'transparent'; }}>
                <RouteBadge route={r.badge.route} sbs={r.badge.sbs} size="sm" />
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: selected ? 600 : 500 }}>{r.name}</span>
                {selected ? <span style={{ fontSize: 11, color: BPI.accent, fontWeight: 700 }}>✓</span>
                  : id === otherId ? <span style={{ fontSize: 8.5, fontWeight: 700, color: BPI.ink40, fontFamily: BPIMono, border: `1px solid ${BPI.ink20}`, borderRadius: 2, padding: '1px 4px' }}>SWAP</span> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SystemTrack — both routes' percentile standing on a 0–100 axis.
// ─────────────────────────────────────────────────────────────
function SystemTrack({ aPct, bPct }) {
  if (aPct == null && bPct == null) {
    return <div style={{ fontSize: 10.5, color: BPI.ink20, fontFamily: BPIMono, textAlign: 'center' }}>—</div>;
  }
  const Dot = ({ p, color, letter }) => (
    <div style={{ position: 'absolute', left: `${p}%`, top: '50%', transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <span style={{ width: 11, height: 11, borderRadius: 6, background: color, boxShadow: `0 0 0 2px ${BPI.card}` }} />
      <span style={{ position: 'absolute', top: 12, fontSize: 8, fontWeight: 700, color, fontFamily: BPIMono }}>{letter}</span>
    </div>
  );
  return (
    <div style={{ position: 'relative', height: 22, display: 'flex', alignItems: 'center' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, background: 'linear-gradient(90deg, ' + BPI.badBg + ', ' + BPI.ink06 + ' 50%, ' + BPI.goodBg + ')' }} />
      <div style={{ position: 'absolute', left: '50%', top: 2, bottom: 2, width: 1, background: BPI.ink20 }} />
      {bPct != null && <Dot p={bPct} color={BPI.accent} letter="B" />}
      {aPct != null && <Dot p={aPct} color={BPI.ink} letter="A" />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MetricMatrix — the dense table.
// ─────────────────────────────────────────────────────────────
const MX_COLS = '1.7fr 1.25fr 1.25fr 0.95fr 0.7fr 1.5fr';
function MetricMatrix({ a, b, win, norm }) {
  const ma = metricsFor(a, win, norm), mb = metricsFor(b, win, norm);
  return (
    <div style={{ background: BPI.card, borderRadius: 4, boxShadow: `0 0 0 1px ${BPI.rule}`, overflow: 'hidden' }}>
      {/* header */}
      <div style={{
        display: 'grid', gridTemplateColumns: MX_COLS, gap: 14, alignItems: 'center',
        padding: '11px 22px', boxShadow: `inset 0 -1px 0 ${BPI.rule}`, background: BPI.paper,
        fontSize: 9.5, fontWeight: 700, color: BPI.ink55, letterSpacing: '0.07em', textTransform: 'uppercase', fontFamily: BPIMono,
      }}>
        <span>Metric</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 5, background: BPI.ink }} /> {a.badge.route} <span style={{ color: BPI.ink40 }}>(A)</span></span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 5, background: BPI.accent }} /> {b.badge.route} <span style={{ color: BPI.ink40 }}>(B)</span></span>
        <span style={{ textAlign: 'right' }}>Δ A−B</span>
        <span style={{ textAlign: 'right' }}>Δ%</span>
        <span style={{ textAlign: 'center' }}>Position in system →</span>
      </div>

      {MX.map((row, i) => {
        const av = ma[row.key].v, bv = mb[row.key].v;
        const raw = av - bv;
        const tie = Math.abs(raw) < 1e-9;
        const aWins = row.dir == null ? null : (row.dir === 'up' ? av > bv : av < bv);
        const pct = bv !== 0 ? Math.abs(raw) / bv * 100 : 0;
        const unit = unitFor(row, norm);
        const cellColor = (mine) => row.dir == null ? BPI.ink : (mine ? BPI.ink : BPI.ink55);
        return (
          <div key={row.key} style={{
            display: 'grid', gridTemplateColumns: MX_COLS, gap: 14, alignItems: 'center',
            padding: '13px 22px', boxShadow: i < MX.length - 1 ? `inset 0 -1px 0 ${BPI.rule}` : 'none',
          }}>
            {/* metric label */}
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: BPI.ink }}>
                {row.label}{row.sub && <span style={{ color: BPI.ink40, fontWeight: 400 }}> · {row.sub}</span>}
              </div>
              <div style={{ fontSize: 10, color: BPI.ink40, fontFamily: BPIMono, marginTop: 2 }}>
                {unit || '—'}{row.dir && <span> · {row.dir === 'up' ? 'higher better' : 'lower better'}</span>}
              </div>
            </div>
            {/* A */}
            <MetricCell row={row} value={av} norm={norm} spark={a[row.spark]} color={BPI.ink} bold={aWins === true} dim={aWins === false} />
            {/* B */}
            <MetricCell row={row} value={bv} norm={norm} spark={b[row.spark]} color={BPI.accent} bold={aWins === false} dim={aWins === true} />
            {/* Δ */}
            <div className="num" style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, fontFamily: BPIMono, color: tie || row.dir == null ? BPI.ink55 : (aWins ? BPI.good : BPI.bad), whiteSpace: 'nowrap' }}>
              {tie ? '0' : (raw > 0 ? '+' : '−') + fmtVal(row, Math.abs(raw), norm)}
            </div>
            {/* Δ% */}
            <div className="num" style={{ textAlign: 'right', fontSize: 11.5, fontWeight: 600, fontFamily: BPIMono, color: tie || row.dir == null ? BPI.ink40 : (aWins ? BPI.good : BPI.bad) }}>
              {tie ? '—' : pct.toFixed(0) + '%'}
            </div>
            {/* system position */}
            <SystemTrack aPct={ma[row.key].pct} bPct={mb[row.key].pct} />
          </div>
        );
      })}
    </div>
  );
}
function MetricCell({ row, value, norm, spark, color, bold, dim }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ minWidth: 58 }}>
        <span className="num" style={{ fontSize: 18, fontWeight: bold ? 700 : 600, letterSpacing: '-0.01em', color: dim ? BPI.ink55 : BPI.ink }}>
          {fmtVal(row, value, norm)}
        </span>
      </div>
      {spark && <Spark data={spark} width={56} height={20} color={color} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// GapByHour — diverging bars of (B − A) speed per hour. Positive = B
// faster. The active window's hours are shaded.
// ─────────────────────────────────────────────────────────────
function GapByHour({ a, b, win }) {
  const w = 1380, h = 150, padL = 40, padR = 14, padT = 14, padB = 22;
  const cw = (w - padL - padR) / 24;
  const gaps = a.hour.map((v, i) => b.hour[i] - v);
  const mx = Math.max(0.5, ...gaps.map(Math.abs));
  const mid = padT + (h - padT - padB) / 2;
  const y = (v) => mid - (v / mx) * ((h - padT - padB) / 2);
  const winRange = WIN_HOURS[win];
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      {winRange && (
        <rect x={padL + winRange[0] * cw} y={padT - 4} width={(winRange[1] - winRange[0] + 1) * cw} height={h - padT - padB + 8} fill={BPI.accentBg} opacity="0.6" />
      )}
      <line x1={padL} x2={w - padR} y1={mid} y2={mid} stroke={BPI.ink20} />
      <text x={padL - 6} y={padT + 4} fontSize="9.5" textAnchor="end" fill={BPI.good} fontFamily={BPIMono}>+{mx.toFixed(1)}</text>
      <text x={padL - 6} y={h - padB} fontSize="9.5" textAnchor="end" fill={BPI.bad} fontFamily={BPIMono}>−{mx.toFixed(1)}</text>
      {gaps.map((g, i) => {
        const yy = y(g);
        return <rect key={i} x={padL + i * cw + 2} width={cw - 4} y={Math.min(mid, yy)} height={Math.abs(yy - mid)} rx="1" fill={g >= 0 ? BPI.accent : BPI.bad} opacity={g >= 0 ? 0.85 : 0.8} />;
      })}
      {[0, 6, 12, 18, 23].map((h0) => (
        <text key={h0} x={padL + h0 * cw + cw / 2} y={h - padB + 14} fontSize="9.5" textAnchor="middle" fill={BPI.ink55} fontFamily={BPIMono}>{h0}:00</text>
      ))}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// SegmentScatter — all segments, speed (x) vs rider-hours (y), by route.
// ─────────────────────────────────────────────────────────────
function SegmentScatter({ a, b, dirFilter }) {
  const w = 620, h = 300, padL = 48, padR = 16, padT = 16, padB = 36;
  const inDir = (d) => dirFilter === 'both' || (dirFilter === 'fwd' ? (d === 'NB' || d === 'EB') : (d === 'SB' || d === 'WB'));
  const pts = [
    ...a.segs.filter(s => inDir(s.dir)).map(s => ({ ...s, route: 'A' })),
    ...b.segs.filter(s => inDir(s.dir)).map(s => ({ ...s, route: 'B' })),
  ];
  const xmin = 3, xmax = 9;
  const ymax = Math.max(...[...a.segs, ...b.segs].map(s => s.rh)) * 1.08;
  const X = (v) => padL + (Math.max(xmin, Math.min(xmax, v)) - xmin) / (xmax - xmin) * (w - padL - padR);
  const Y = (v) => padT + (1 - v / ymax) * (h - padT - padB);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      {/* worst quadrant shading: slow (left) + high RH (top) */}
      <rect x={padL} y={padT} width={X(5.5) - padL} height={Y(ymax * 0.45) - padT} fill={BPI.badBg} opacity="0.5" />
      <text x={padL + 6} y={padT + 14} fontSize="9.5" fill={BPI.bad} fontFamily={BPIMono} fontWeight="700">worst: slow · high ridership</text>
      {/* gridlines */}
      {[3, 4, 5, 6, 7, 8, 9].map(v => (
        <g key={v}><line x1={X(v)} x2={X(v)} y1={padT} y2={h - padB} stroke={BPI.rule} opacity="0.5" />
          <text x={X(v)} y={h - padB + 14} fontSize="9.5" textAnchor="middle" fill={BPI.ink55} fontFamily={BPIMono}>{v}</text></g>
      ))}
      {[0.25, 0.5, 0.75, 1].map(f => (
        <g key={f}><line x1={padL} x2={w - padR} y1={Y(ymax * f)} y2={Y(ymax * f)} stroke={BPI.rule} opacity="0.5" />
          <text x={padL - 6} y={Y(ymax * f) + 3} fontSize="9" textAnchor="end" fill={BPI.ink55} fontFamily={BPIMono}>{(ymax * f / 1000).toFixed(0)}K</text></g>
      ))}
      <text x={(padL + w - padR) / 2} y={h - 4} fontSize="10" textAnchor="middle" fill={BPI.ink55}>segment speed (mph) →</text>
      {pts.map((p, i) => (
        <circle key={i} cx={X(p.mph)} cy={Y(p.rh)} r="6"
          fill={p.route === 'A' ? BPI.ink : BPI.accent} opacity="0.78"
          stroke={BPI.card} strokeWidth="1.5" />
      ))}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// SegmentTable — dense, sortable, both routes interleaved.
// ─────────────────────────────────────────────────────────────
function TreatPip({ on, label, tone }) {
  const c = tone || BPI.good;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 16, height: 16, borderRadius: 3, fontSize: 9, fontWeight: 700, fontFamily: BPIMono,
      background: on ? c : 'transparent', color: on ? '#fff' : BPI.ink20,
      boxShadow: on ? 'none' : `inset 0 0 0 1px ${BPI.ink20}`,
    }}>{label}</span>
  );
}
const ST_COLS = '64px 44px 1fr 70px 76px 84px 60px 78px';
function SegmentTable({ a, b, dirFilter, sortKey, sortDir, onSort }) {
  const inDir = (d) => dirFilter === 'both' || (dirFilter === 'fwd' ? (d === 'NB' || d === 'EB') : (d === 'SB' || d === 'WB'));
  let rows = [
    ...a.segs.filter(s => inDir(s.dir)).map(s => ({ ...s, rt: a })),
    ...b.segs.filter(s => inDir(s.dir)).map(s => ({ ...s, rt: b })),
  ].map(s => ({ ...s, delta: s.mph - s.sched }));
  rows.sort((x, y) => {
    const k = sortKey;
    const xv = k === 'seg' ? x.from : x[k];
    const yv = k === 'seg' ? y.from : y[k];
    if (xv < yv) return sortDir === 'asc' ? -1 : 1;
    if (xv > yv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });
  const Head = ({ k, children, align = 'right' }) => (
    <button className="bpi" onClick={() => onSort(k)} style={{
      background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: BPIMono,
      fontSize: 9.5, fontWeight: 700, color: sortKey === k ? BPI.ink : BPI.ink55, letterSpacing: '0.06em',
      textTransform: 'uppercase', textAlign: align, justifySelf: align === 'right' ? 'end' : 'start',
      display: 'inline-flex', alignItems: 'center', gap: 3,
    }}>
      {children}
      <span style={{ fontSize: 7, opacity: sortKey === k ? 1 : 0.3 }}>{sortKey === k && sortDir === 'asc' ? '▲' : '▼'}</span>
    </button>
  );
  return (
    <div style={{ background: BPI.card, borderRadius: 4, boxShadow: `0 0 0 1px ${BPI.rule}`, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: ST_COLS, gap: 12, alignItems: 'center', padding: '10px 18px', background: BPI.paper, boxShadow: `inset 0 -1px 0 ${BPI.rule}` }}>
        <Head k="route" align="left">Route</Head>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: BPI.ink55, fontFamily: BPIMono, letterSpacing: '0.06em' }}>DIR</span>
        <Head k="seg" align="left">Segment</Head>
        <Head k="mph">mph</Head>
        <Head k="delta">vs sched</Head>
        <Head k="rh">RH/day</Head>
        <Head k="len">length</Head>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: BPI.ink55, fontFamily: BPIMono, letterSpacing: '0.06em', textAlign: 'right', justifySelf: 'end' }}>L · A · T</span>
      </div>
      <div style={{ maxHeight: 360, overflow: 'auto' }}>
        {rows.map((s, i) => {
          const sev = s.mph < 5 ? BPI.bad : s.mph < 6.5 ? BPI.warn : BPI.good;
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: ST_COLS, gap: 12, alignItems: 'center', padding: '9px 18px', boxShadow: i < rows.length - 1 ? `inset 0 -1px 0 ${BPI.rule}` : 'none', fontSize: 12 }}>
              <RouteBadge route={s.rt.badge.route} sbs={s.rt.badge.sbs} size="sm" />
              <DirIndicator dir={s.dir} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.from} <span style={{ color: BPI.ink40 }}>→</span> {s.to}</span>
              <span className="num" style={{ textAlign: 'right', fontWeight: 700, color: sev }}>{s.mph.toFixed(1)}</span>
              <span className="num" style={{ textAlign: 'right', fontWeight: 600, color: s.delta < 0 ? BPI.bad : BPI.good }}>{s.delta >= 0 ? '+' : '−'}{Math.abs(s.delta).toFixed(1)}</span>
              <span className="num" style={{ textAlign: 'right', color: BPI.ink70 }}>{s.rh.toLocaleString()}</span>
              <span className="num" style={{ textAlign: 'right', color: BPI.ink55 }}>{s.len.toFixed(1)} mi</span>
              <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                <TreatPip on={s.lane === 'yes'} label="L" tone={s.lane === 'yes' ? BPI.good : BPI.warn} />
                <TreatPip on={s.ace} label="A" tone={BPI.accent} />
                <TreatPip on={s.tsp} label="T" tone={BPI.good} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SynthBar — compact analyst synthesis + actions.
// ─────────────────────────────────────────────────────────────
function SynthBar({ a, b, win, norm }) {
  const ma = metricsFor(a, win, norm), mb = metricsFor(b, win, norm);
  let aWins = 0, bWins = 0;
  MX.forEach(r => {
    if (r.dir == null) return;
    const better = r.dir === 'up' ? ma[r.key].v > mb[r.key].v : ma[r.key].v < mb[r.key].v;
    if (Math.abs(ma[r.key].v - mb[r.key].v) < 1e-9) return;
    better ? aWins++ : bWins++;
  });
  const leader = bWins >= aWins ? b : a;
  const lead = bWins >= aWins ? bWins : aWins;
  const total = aWins + bWins;
  const winLbl = WINDOWS.find(([k]) => k === win)[1].toLowerCase();
  const speedGap = Math.abs(ma.speed.v - mb.speed.v);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'center', background: BPI.card, borderRadius: 4, boxShadow: `0 0 0 1px ${BPI.rule}`, padding: '16px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, color: BPI.ink }}>
          <RouteBadge route={leader.badge.route} sbs={leader.badge.sbs} size="sm" />
          leads on <span className="num">{lead} of {total}</span> metrics
        </div>
        <span style={{ width: 1, height: 26, background: BPI.rule }} />
        <div style={{ fontSize: 12, color: BPI.ink70, lineHeight: 1.4 }}>
          {speedGap.toFixed(2)} mph speed gap in the <b style={{ color: BPI.ink }}>{winLbl}</b> window;
          rider-hours diverge most in the AM &amp; PM peaks.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 9 }}>
        <button className="bpi" style={{ padding: '9px 14px', fontSize: 12, fontWeight: 500, fontFamily: 'inherit', background: 'transparent', color: BPI.ink, border: `1px solid ${BPI.ink20}`, borderRadius: 4, cursor: 'pointer' }}>Export matrix · CSV</button>
        <button className="bpi" style={{ padding: '9px 16px', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', background: BPI.accent, color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Draft a brief →</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
function RF_CompareAnalytical() {
  const [aId, setAId] = React.useState('Q44');
  const [bId, setBId] = React.useState('Bx12');
  const [open, setOpen] = React.useState(null);
  const [win, setWin] = React.useState('all');
  const [norm, setNorm] = React.useState('abs');
  const [dir, setDir] = React.useState('both');
  const [sortKey, setSortKey] = React.useState('rh');
  const [sortDir, setSortDir] = React.useState('desc');

  const a = RX[aId], b = RX[bId];
  function pick(slot, id) {
    if (slot === 'A') { if (id === bId) setBId(aId); setAId(id); }
    else { if (id === aId) setAId(bId); setBId(id); }
    setOpen(null);
  }
  function swap() { setAId(bId); setBId(aId); setOpen(null); }
  function onSort(k) {
    if (k === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir(k === 'seg' || k === 'route' ? 'asc' : 'desc'); }
  }

  return (
    <div className="bpi" style={{ width: CAW, height: CAH, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <StudioBar active="Routes" breadcrumb={`Routes / compare · analytical · ${a.badge.route} ↔ ${b.badge.route}`} />
      {open && <div onClick={() => setOpen(null)} style={{ position: 'absolute', inset: 0, zIndex: 30 }} />}

      {/* Header: pickers + controls */}
      <div style={{ position: 'relative', zIndex: 35, background: BPI.card, boxShadow: `inset 0 -1px 0 ${BPI.rule}`, padding: '14px 28px', display: 'flex', alignItems: 'flex-end', gap: 26, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PickerX route={a} slot="A" otherId={bId} open={open === 'A'} onToggle={() => setOpen(open === 'A' ? null : 'A')} onPick={(id) => pick('A', id)} />
          <button className="bpi" onClick={swap} title="Swap A and B" style={{ width: 30, height: 30, borderRadius: 15, background: BPI.paper, border: `1px solid ${BPI.rule}`, cursor: 'pointer', color: BPI.ink70, fontSize: 13 }}>⇄</button>
          <PickerX route={b} slot="B" otherId={aId} open={open === 'B'} onToggle={() => setOpen(open === 'B' ? null : 'B')} onPick={(id) => pick('B', id)} />
        </div>
        <div style={{ flex: 1 }} />
        <ControlGroup label="Time window">
          <SegX value={win} onChange={setWin} options={WINDOWS} />
        </ControlGroup>
        <ControlGroup label="Normalize">
          <SegX value={norm} onChange={setNorm} options={[['abs', 'Absolute'], ['permi', 'Per mile'], ['perrider', 'Per rider']]} />
        </ControlGroup>
        <ControlGroup label="Direction">
          <SegX value={dir} onChange={setDir} options={[['both', 'Both'], ['fwd', 'NB/EB'], ['rev', 'SB/WB']]} />
        </ControlGroup>
      </div>

      {/* sample-size strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '7px 28px', background: BPI.paper, boxShadow: `inset 0 -1px 0 ${BPI.rule}`, fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: 3, background: BPI.good }} /> {Math.min(a.days, b.days)} matched weekdays · Apr–May 2026</span>
        <span style={{ color: BPI.ink20 }}>·</span>
        <span>GTFS-RT + ridership join</span>
        <span style={{ color: BPI.ink20 }}>·</span>
        <span>values recompute with window &amp; normalization</span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: 28 }}>
        <div style={{ marginBottom: 26 }}>
          <H title="Metric matrix" sub="Every headline metric, signed Δ and Δ% (A relative to B), and where each route stands across all SBS routes in the system. Green wins; the position track plots A (ink) and B (blue) on a worse→better axis." />
          <MetricMatrix a={a} b={b} win={win} norm={norm} />
        </div>

        <div style={{ marginBottom: 26 }}>
          <H title="Speed gap by hour" sub="B minus A, per hour. Bars above the line are hours where B is faster. The shaded band marks the selected time window." />
          <div style={{ background: BPI.card, borderRadius: 4, boxShadow: `0 0 0 1px ${BPI.rule}`, padding: '14px 14px 6px' }}>
            <GapByHour a={a} b={b} win={win} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '620px 1fr', gap: 24, marginBottom: 26, alignItems: 'start' }}>
          <div>
            <H title="Segment distribution" sub="Each top segment by speed × rider-hours. Top-left is the worst: slow and heavily ridden." />
            <div style={{ background: BPI.card, borderRadius: 4, boxShadow: `0 0 0 1px ${BPI.rule}`, padding: 14 }}>
              <SegmentScatter a={a} b={b} dirFilter={dir} />
              <div style={{ display: 'flex', gap: 18, padding: '8px 6px 2px', fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 5, background: BPI.ink }} /> {a.badge.route} (A)</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 5, background: BPI.accent }} /> {b.badge.route} (B)</span>
              </div>
            </div>
          </div>
          <div>
            <H title="Segment ledger" sub="Both routes interleaved. Click any column to sort; direction filter applies." />
            <SegmentTable a={a} b={b} dirFilter={dir} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
          </div>
        </div>

        <SynthBar a={a} b={b} win={win} norm={norm} />
      </div>
    </div>
  );
}

Object.assign(window, { RF_CompareAnalytical });
