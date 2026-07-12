// Compare — interactive side-by-side comparison of two routes.
//
// The studio's "stress test" view. Pick a route under examination + a
// positive control (or a peer). Both route slots are switchable; the
// whole page recomputes off the selection.
//
// Layout:
//   • Top:    two switchable route headers w/ a swap button between them
//   • Body:   metric ledger (number-vs-number, signed diffs) · speed×hour
//             overlay · ranked segments (sortable) · lane coverage ·
//             intervention timelines · synthesized verdict + actions

const CMW = 1320, CMH = 880;

// ─────────────────────────────────────────────────────────────
// Route library — four routes set up so the contrast is meaningful.
//   M15 SBS  — slow, partially-treated (route under examination)
//   Bx12 SBS — fast, fully-treated (positive control)
//   M14 SBS  — fast busway exemplar
//   Q44 SBS  — slow, congested Flushing corridor
// ─────────────────────────────────────────────────────────────
const ROUTES = {
  M15: {
    id: 'M15', badge: { route: 'M15', sbs: true },
    name: '1st Avenue / 2nd Avenue',
    meta: 'Manhattan · East Harlem ↔ South Ferry · 8.4 mi',
    speed: 6.74, riders: 37200, lost: 4310, lane: 72, ace: { on: true, since: 'Nov 2019' },
    hour: [7.4, 7.6, 7.8, 8.1, 7.9, 7.0, 5.4, 4.7, 5.0, 5.9, 6.0, 5.8, 5.6, 5.4, 5.5, 5.0, 4.2, 3.8, 4.1, 5.2, 6.4, 7.0, 7.2, 7.4],
    segs: [
      { dir: 'NB', from: 'Madison · 28', to: 'Madison · 58', mph: 4.2, rh: 18420, lane: 'partial', ace: false, tsp: false },
      { dir: 'NB', from: '1 Av · 14', to: '1 Av · 34', mph: 4.9, rh: 14110, lane: 'yes', ace: true, tsp: false },
      { dir: 'SB', from: '2 Av · 60', to: '2 Av · 42', mph: 5.2, rh: 12880, lane: 'yes', ace: true, tsp: false },
      { dir: 'NB', from: '1 Av · 86', to: '1 Av · 96', mph: 5.8, rh: 9640, lane: 'yes', ace: true, tsp: true },
      { dir: 'SB', from: '2 Av · 23', to: '2 Av · 14', mph: 6.1, rh: 8210, lane: 'yes', ace: true, tsp: false },
    ],
    interventions: [
      { yr: 2010, t: 'SBS launches', tone: 'accent' },
      { yr: 2019, t: 'ACE begins', tone: 'accent' },
      { yr: 2023, t: 'Bus lane: 23→14', tone: 'good' },
      { yr: 2025, t: 'ACE all-day', tone: 'accent' },
    ],
  },
  Bx12: {
    id: 'Bx12', badge: { route: 'Bx12', sbs: true },
    name: 'Fordham Rd / Pelham Pkwy',
    meta: 'Bronx · Inwood ↔ Pelham Bay Park · 7.9 mi',
    speed: 8.61, riders: 41000, lost: 1850, lane: 94, ace: { on: true, since: 'Jun 2020' },
    hour: [8.4, 8.6, 8.7, 8.9, 8.8, 8.4, 6.9, 6.4, 6.5, 7.3, 7.5, 7.2, 7.0, 7.0, 7.1, 6.8, 6.3, 6.0, 6.2, 6.9, 7.8, 8.2, 8.4, 8.5],
    segs: [
      { dir: 'EB', from: 'Fordham · GC', to: 'Fordham · Webster', mph: 5.4, rh: 11820, lane: 'yes', ace: true, tsp: true },
      { dir: 'EB', from: 'Fordham · 3 Av', to: 'Fordham · Bronx P', mph: 6.3, rh: 9210, lane: 'yes', ace: true, tsp: false },
      { dir: 'WB', from: 'Pelham · East', to: 'Pelham · Bronxdal', mph: 6.7, rh: 8420, lane: 'yes', ace: true, tsp: false },
      { dir: 'EB', from: 'Pelham · Westch', to: 'Pelham · East', mph: 7.2, rh: 7100, lane: 'yes', ace: true, tsp: true },
      { dir: 'WB', from: 'Fordham · Bronx', to: 'Fordham · 3 Av', mph: 7.5, rh: 6210, lane: 'yes', ace: true, tsp: true },
    ],
    interventions: [
      { yr: 2013, t: 'SBS launches', tone: 'accent' },
      { yr: 2020, t: 'ACE begins', tone: 'accent' },
      { yr: 2022, t: 'Concrete lane upgrade', tone: 'good' },
      { yr: 2023, t: 'TSP installed (Bronx P)', tone: 'good' },
      { yr: 2025, t: 'ACE all-day', tone: 'accent' },
    ],
  },
  M14: {
    id: 'M14', badge: { route: 'M14', sbs: true },
    name: '14th Street busway',
    meta: 'Manhattan · Chelsea ↔ Alphabet City · 2.1 mi',
    speed: 7.92, riders: 28800, lost: 2100, lane: 88, ace: { on: true, since: 'Mar 2021' },
    hour: [7.8, 8.0, 8.2, 8.4, 8.3, 7.9, 7.0, 6.6, 6.8, 7.4, 7.6, 7.3, 7.1, 7.0, 7.1, 6.9, 6.4, 6.1, 6.3, 7.0, 7.7, 8.0, 8.1, 8.2],
    segs: [
      { dir: 'EB', from: '14 St · Union Sq', to: '14 St · 6 Av', mph: 5.6, rh: 9120, lane: 'yes', ace: true, tsp: false },
      { dir: 'WB', from: '14 St · 3 Av', to: '14 St · Union Sq', mph: 6.1, rh: 7840, lane: 'yes', ace: true, tsp: false },
      { dir: 'EB', from: '14 St · 8 Av', to: '14 St · 6 Av', mph: 6.8, rh: 6210, lane: 'yes', ace: true, tsp: true },
      { dir: 'WB', from: 'Av A · 14', to: '1 Av · 14', mph: 7.0, rh: 5180, lane: 'partial', ace: true, tsp: false },
      { dir: 'EB', from: '14 St · 9 Av', to: '14 St · 8 Av', mph: 7.4, rh: 4020, lane: 'yes', ace: true, tsp: false },
    ],
    interventions: [
      { yr: 2019, t: '14 St busway opens', tone: 'good' },
      { yr: 2019, t: 'SBS launches', tone: 'accent' },
      { yr: 2021, t: 'ACE begins', tone: 'accent' },
      { yr: 2024, t: 'Boarding islands added', tone: 'good' },
    ],
  },
  Q44: {
    id: 'Q44', badge: { route: 'Q44', sbs: true },
    name: 'Main St / White Plains Rd',
    meta: 'Queens ↔ Bronx · Jamaica ↔ Williamsbridge · 9.2 mi',
    speed: 5.18, riders: 44100, lost: 4980, lane: 61, ace: { on: true, since: 'Sep 2021' },
    hour: [6.6, 6.8, 7.0, 7.2, 7.0, 6.2, 4.8, 4.3, 4.5, 5.1, 5.3, 5.0, 4.9, 4.8, 4.9, 4.5, 3.9, 3.6, 3.9, 4.7, 5.6, 6.2, 6.4, 6.6],
    segs: [
      { dir: 'NB', from: 'Main · Roosevelt', to: 'Main · Northern', mph: 3.9, rh: 16240, lane: 'partial', ace: true, tsp: false },
      { dir: 'SB', from: 'Main · Kissena', to: 'Main · Roosevelt', mph: 4.4, rh: 13180, lane: 'minimal', ace: false, tsp: false },
      { dir: 'NB', from: 'Main · Sanford', to: 'Main · Kissena', mph: 4.8, rh: 11020, lane: 'partial', ace: true, tsp: false },
      { dir: 'SB', from: 'WPR · Pelham', to: 'WPR · Gun Hill', mph: 5.5, rh: 9210, lane: 'yes', ace: true, tsp: false },
      { dir: 'NB', from: 'WPR · 180', to: 'WPR · Gun Hill', mph: 6.0, rh: 7640, lane: 'yes', ace: true, tsp: true },
    ],
    interventions: [
      { yr: 2012, t: 'SBS launches', tone: 'accent' },
      { yr: 2021, t: 'ACE begins', tone: 'accent' },
      { yr: 2023, t: 'Main St lane repaint', tone: 'good' },
    ],
  },
};
const ROUTE_ORDER = ['M15', 'Bx12', 'M14', 'Q44'];

// ─────────────────────────────────────────────────────────────
// Metric definitions — single source of truth for the ledger, diffs,
// and the verdict. `dir` = which direction is better.
// ─────────────────────────────────────────────────────────────
const METRICS = [
  { key: 'speed',  label: 'Weighted speed',   unit: 'mph',    dir: 'up',   fmt: (v) => v.toFixed(2),         dfmt: (v) => v.toFixed(2) },
  { key: 'riders', label: 'Daily riders',     unit: '/ day',  dir: 'up',   fmt: (v) => (v / 1000).toFixed(1) + 'K', dfmt: (v) => (v / 1000).toFixed(1) + 'K' },
  { key: 'lost',   label: 'Rider-hours lost', unit: 'RH/day', dir: 'down', fmt: (v) => v.toLocaleString(),   dfmt: (v) => v.toLocaleString() },
  { key: 'lane',   label: 'Lane coverage',    unit: '%',      dir: 'up',   fmt: (v) => v.toFixed(0),         dfmt: (v) => v.toFixed(0) },
];

// ─────────────────────────────────────────────────────────────
// RoutePicker — header slot that opens a dropdown of the other routes.
// ─────────────────────────────────────────────────────────────
function RoutePicker({ route, side, otherId, open, onToggle, onPick }) {
  const reverse = side === 'right';
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <button
        className="bpi"
        onClick={onToggle}
        style={{
          width: '100%', background: open ? BPI.ink06 : 'transparent',
          border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          padding: '20px 28px', textAlign: reverse ? 'right' : 'left',
          display: 'flex', flexDirection: reverse ? 'row-reverse' : 'row',
          alignItems: 'center', gap: 14,
          transition: 'background .12s',
        }}
      >
        <RouteBadge route={route.badge.route} sbs={route.badge.sbs} size="lg" />
        <div style={{ flex: 1, textAlign: reverse ? 'right' : 'left', minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.2 }}>
            {route.name}
          </div>
          <div style={{ fontSize: 11.5, color: BPI.ink55, marginTop: 3 }}>{route.meta}</div>
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
          fontSize: 10.5, fontWeight: 600, color: BPI.ink55, fontFamily: BPIMono,
          letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>
          {side === 'left' ? 'A' : 'B'}
          <span style={{
            fontSize: 8, transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform .15s', color: BPI.ink40,
          }}>▼</span>
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', zIndex: 30,
          [reverse ? 'right' : 'left']: 22, marginTop: -2,
          width: 300, background: BPI.cardRaised || '#fefef9',
          borderRadius: 5, boxShadow: `0 0 0 1px ${BPI.rule}, 0 18px 44px -18px rgba(22,20,15,.4)`,
          overflow: 'hidden', padding: 4,
        }}>
          <div style={{
            fontSize: 9.5, fontWeight: 700, color: BPI.ink40, letterSpacing: '0.08em',
            textTransform: 'uppercase', padding: '8px 10px 6px',
          }}>Compare against</div>
          {ROUTE_ORDER.map((id) => {
            const r = ROUTES[id];
            const selected = id === route.id;
            const isOther = id === otherId;
            return (
              <button
                key={id}
                className="bpi"
                onClick={() => onPick(id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 11,
                  padding: '9px 10px', borderRadius: 3, border: 'none',
                  background: selected ? BPI.accentBg : 'transparent',
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  transition: 'background .1s',
                }}
                onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = BPI.ink06; }}
                onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
              >
                <RouteBadge route={r.badge.route} sbs={r.badge.sbs} size="sm" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12.5, fontWeight: selected ? 600 : 500, color: BPI.ink,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{r.name}</div>
                  <div className="num" style={{ fontSize: 10.5, color: BPI.ink55, marginTop: 1 }}>
                    {r.speed.toFixed(2)} mph · {(r.riders / 1000).toFixed(0)}K riders
                  </div>
                </div>
                {selected && <span style={{ fontSize: 11, color: BPI.accent, fontWeight: 700 }}>✓</span>}
                {isOther && !selected && (
                  <span style={{
                    fontSize: 8.5, fontWeight: 700, color: BPI.ink40, fontFamily: BPIMono,
                    letterSpacing: '0.06em', border: `1px solid ${BPI.ink20}`,
                    borderRadius: 2, padding: '1px 4px',
                  }}>SWAP</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MetricLedger — the number-vs-number block. Each metric is a row:
// A value | diverging bar (winner highlighted) | B value, with a signed
// diff pill (absolute + %) in the gutter. Replaces the old cramped strip.
// ─────────────────────────────────────────────────────────────
function diffMeta(m, a, b) {
  const av = a[m.key], bv = b[m.key];
  const raw = av - bv;                        // A minus B
  const aWins = m.dir === 'up' ? av > bv : av < bv;
  const tie = Math.abs(raw) < 1e-9;
  const pct = bv !== 0 ? Math.abs(raw) / bv * 100 : 0;
  return { av, bv, raw, aWins, tie, pct };
}

function MetricLedger({ a, b }) {
  return (
    <div style={{
      background: BPI.card, borderRadius: 4,
      boxShadow: `0 0 0 1px ${BPI.rule}`, overflow: 'hidden',
    }}>
      {/* Column heads */}
      <div style={{
        display: 'grid', gridTemplateColumns: '150px 1fr 150px',
        alignItems: 'center', padding: '12px 20px',
        boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <RouteBadge route={a.badge.route} sbs={a.badge.sbs} size="sm" />
        </div>
        <div style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: BPI.ink40, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          A vs B
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <RouteBadge route={b.badge.route} sbs={b.badge.sbs} size="sm" />
        </div>
      </div>

      {METRICS.map((m, i) => {
        const { av, bv, raw, aWins, tie, pct } = diffMeta(m, a, b);
        const max = Math.max(av, bv) || 1;
        const aFrac = av / max, bFrac = bv / max;
        const aColor = tie ? BPI.ink40 : aWins ? BPI.good : BPI.ink20;
        const bColor = tie ? BPI.ink40 : !aWins ? BPI.good : BPI.ink20;
        return (
          <div key={m.key} style={{
            display: 'grid', gridTemplateColumns: '150px 1fr 150px',
            alignItems: 'center', padding: '16px 20px',
            boxShadow: i < METRICS.length - 1 ? `inset 0 -1px 0 ${BPI.rule}` : 'none',
          }}>
            {/* A value */}
            <div style={{ textAlign: 'left' }}>
              <div className="num" style={{
                fontSize: 25, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1,
                color: tie ? BPI.ink : aWins ? BPI.ink : BPI.ink55,
              }}>{m.fmt(av)}</div>
            </div>

            {/* Center: label, diverging bars, diff pill */}
            <div style={{ padding: '0 22px' }}>
              <div style={{ textAlign: 'center', fontSize: 11.5, fontWeight: 600, color: BPI.ink70, marginBottom: 7 }}>
                {m.label} <span style={{ color: BPI.ink40, fontWeight: 400 }}>· {m.unit}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 84px 1fr', alignItems: 'center', gap: 10 }}>
                {/* A bar grows left from center */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ width: `${aFrac * 100}%`, height: 8, background: aColor, borderRadius: '2px 0 0 2px', transition: 'width .35s ease, background .2s' }} />
                </div>
                {/* diff pill */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    fontSize: 10.5, fontWeight: 700, fontFamily: BPIMono,
                    color: tie ? BPI.ink40 : BPI.ink, background: BPI.paper,
                    boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
                    borderRadius: 3, padding: '3px 7px', whiteSpace: 'nowrap',
                  }}>
                    <span style={{ fontSize: 8, color: tie ? BPI.ink40 : raw > 0 ? BPI.good : BPI.bad }}>
                      {tie ? '·' : raw > 0 ? '▲' : '▼'}
                    </span>
                    {tie ? 'even' : `${m.dfmt(Math.abs(raw))}`}
                  </span>
                </div>
                {/* B bar grows right from center */}
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ width: `${bFrac * 100}%`, height: 8, background: bColor, borderRadius: '0 2px 2px 0', transition: 'width .35s ease, background .2s' }} />
                </div>
              </div>
              <div style={{ textAlign: 'center', fontSize: 10, color: BPI.ink40, fontFamily: BPIMono, marginTop: 6 }}>
                {tie ? 'no difference' : `${pct.toFixed(0)}% ${aWins ? 'better' : 'worse'} on A`}
              </div>
            </div>

            {/* B value */}
            <div style={{ textAlign: 'right' }}>
              <div className="num" style={{
                fontSize: 25, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1,
                color: tie ? BPI.ink : !aWins ? BPI.ink : BPI.ink55,
              }}>{m.fmt(bv)}</div>
            </div>
          </div>
        );
      })}

      {/* ACE status row — categorical, no bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: '150px 1fr 150px',
        alignItems: 'center', padding: '14px 20px',
        boxShadow: `inset 0 1px 0 ${BPI.rule}`, background: BPI.paper,
      }}>
        <div>{aceCell(a, 'left')}</div>
        <div style={{ textAlign: 'center', fontSize: 11.5, fontWeight: 600, color: BPI.ink70 }}>
          ACE enforcement <span style={{ color: BPI.ink40, fontWeight: 400 }}>· status</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{aceCell(b, 'right')}</div>
      </div>
    </div>
  );
}
function aceCell(r, side) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: side === 'right' ? 'flex-end' : 'flex-start', gap: 3 }}>
      <span className="chip good" style={{ fontSize: 10.5 }}>active</span>
      <span className="num" style={{ fontSize: 10, color: BPI.ink55 }}>since {r.ace.since}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// HourOverlay — two hour-by-hour speed lines on one chart. Takes a/b.
// ─────────────────────────────────────────────────────────────
function HourOverlay({ a, b }) {
  const w = 600, h = 180, padL = 36, padR = 12, padT = 12, padB = 24;
  const cw = (w - padL - padR) / 23;
  const min = 3, max = 9;
  const y = (v) => padT + (1 - (Math.max(min, Math.min(max, v)) - min) / (max - min)) * (h - padT - padB);
  const line = (data, color) => {
    const d = data.map((v, i) => (i ? 'L' : 'M') + (padL + i * cw).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
    return <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />;
  };
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      {[3, 5, 7, 9].map((v) => (
        <g key={v}>
          <line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} stroke={BPI.rule} />
          <text x={padL - 6} y={y(v) + 3} fontSize="10" textAnchor="end" fill={BPI.ink55} fontFamily={BPIMono}>{v}</text>
        </g>
      ))}
      <path
        d={
          a.hour.map((v, i) => (i ? 'L' : 'M') + (padL + i * cw).toFixed(1) + ',' + y(v).toFixed(1)).join(' ') +
          ' ' +
          b.hour.slice().reverse().map((v, i) => 'L' + (padL + (23 - i) * cw).toFixed(1) + ',' + y(v).toFixed(1)).join(' ') +
          ' Z'
        }
        fill={BPI.bad} opacity="0.07"
      />
      {line(b.hour, BPI.good)}
      {line(a.hour, BPI.bad)}
      {[0, 6, 12, 18].map((h0) => (
        <text key={h0} x={padL + h0 * cw + cw / 2} y={h - padB + 14}
          fontSize="10" textAnchor="middle" fill={BPI.ink55} fontFamily={BPIMono}>{h0}:00</text>
      ))}
      <g transform={`translate(${w - padR - 184}, 6)`}>
        <rect width="184" height="40" fill={BPI.paper} stroke={BPI.rule} />
        <g transform="translate(8, 16)">
          <line x1="0" x2="14" y1="0" y2="0" stroke={BPI.bad} strokeWidth="2" />
          <text x="20" y="3" fontSize="10.5" fill={BPI.ink}>{a.badge.route} (A)</text>
        </g>
        <g transform="translate(8, 32)">
          <line x1="0" x2="14" y1="0" y2="0" stroke={BPI.good} strokeWidth="2" />
          <text x="20" y="3" fontSize="10.5" fill={BPI.ink}>{b.badge.route} (B)</text>
        </g>
      </g>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// SegBar — segment with an inline speed bar on a shared 0–10 scale so
// the eye compares slowness directly across both routes.
// ─────────────────────────────────────────────────────────────
const SEG_SCALE = 10;
function sevColor(mph) { return mph < 5 ? BPI.bad : mph < 6.5 ? BPI.warn : BPI.good; }

function SegBar({ s }) {
  const c = sevColor(s.mph);
  return (
    <div style={{ padding: '10px 0', boxShadow: `inset 0 -1px 0 ${BPI.rule}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <DirIndicator dir={s.dir} />
        <span style={{ fontSize: 12.5, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {s.from} <span style={{ color: BPI.ink40 }}>→</span> {s.to}
        </span>
        <span className="num" style={{ fontSize: 13.5, fontWeight: 700, color: c }}>{s.mph.toFixed(1)}</span>
        <span className="num" style={{ fontSize: 10.5, color: BPI.ink55, width: 64, textAlign: 'right' }}>
          {(s.rh / 1000).toFixed(1)}K RH
        </span>
      </div>
      <div style={{ position: 'relative', height: 6, background: BPI.ink06, borderRadius: 2, marginTop: 7, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, width: `${(s.mph / SEG_SCALE) * 100}%`, background: c, borderRadius: 2, transition: 'width .35s ease' }} />
      </div>
    </div>
  );
}

function SegColumn({ route, sort }) {
  const segs = [...route.segs].sort((x, y) => sort === 'mph' ? x.mph - y.mph : y.rh - x.rh);
  const totalRH = route.segs.reduce((s, x) => s + x.rh, 0);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <RouteBadge route={route.badge.route} sbs={route.badge.sbs} size="sm" />
        <span style={{ fontSize: 11.5, color: BPI.ink70 }}>
          top 5 · {(totalRH / 1000).toFixed(1)}K RH/day lost here
        </span>
      </div>
      <div>{segs.map((s, i) => <SegBar key={i} s={s} />)}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LaneCoverageBar
// ─────────────────────────────────────────────────────────────
function LaneCoverageBar({ route, hint }) {
  const frac = route.lane / 100;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <RouteBadge route={route.badge.route} sbs={route.badge.sbs} size="sm" />
        <div style={{ fontSize: 11.5, color: BPI.ink70, flex: 1 }}>{hint}</div>
        <div className="num" style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>
          {route.lane}<span style={{ fontSize: 11, color: BPI.ink55 }}>%</span>
        </div>
      </div>
      <div style={{ position: 'relative', height: 18, background: BPI.ink06, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${frac * 100}%`, background: BPI.good, transition: 'width .35s ease' }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// InterventionRow
// ─────────────────────────────────────────────────────────────
function InterventionRow({ events }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {events.map((e, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="num" style={{ fontSize: 11, fontWeight: 600, color: BPI.ink55, fontFamily: BPIMono, width: 36 }}>{e.yr}</span>
          <span style={{ width: 7, height: 7, borderRadius: 4, background: e.tone === 'good' ? BPI.good : BPI.accent }} />
          <span style={{ fontSize: 12, color: BPI.ink70 }}>{e.t}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Verdict — synthesized takeaway + actions. Reworked from the dark
// "=" band into an editorial card: a labelled gap headline, three
// signed diff stats on their own baseline, and a clear action row.
// ─────────────────────────────────────────────────────────────
function Verdict({ a, b }) {
  const faster = a.speed >= b.speed ? a : b;
  const slower = a.speed >= b.speed ? b : a;
  const speedGap = Math.abs(a.speed - b.speed);
  const lostHigh = Math.max(a.lost, b.lost), lostLow = Math.min(a.lost, b.lost);
  const lostPct = lostHigh ? Math.round((lostHigh - lostLow) / lostHigh * 100) : 0;
  const lanePts = Math.abs(a.lane - b.lane);
  const fasterLeadsLane = faster.lane >= slower.lane;

  const stats = [
    { v: `+${speedGap.toFixed(2)}`, unit: 'mph faster', up: true },
    { v: `−${lostPct}%`, unit: 'rider-hours lost / day', up: true },
    { v: `${fasterLeadsLane ? '+' : '−'}${lanePts}`, unit: 'pts lane coverage', up: fasterLeadsLane },
  ];

  return (
    <div style={{
      position: 'relative', background: BPI.card, borderRadius: 4,
      boxShadow: `0 0 0 1px ${BPI.rule}`, overflow: 'hidden',
      display: 'grid', gridTemplateColumns: '1fr 300px',
    }}>
      {/* accent spine */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: BPI.accent }} />

      <div style={{ padding: '22px 26px 22px 30px' }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: BPI.accent, letterSpacing: '0.1em',
          textTransform: 'uppercase', marginBottom: 10,
        }}>
          What this comparison shows
        </div>
        <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.3, textWrap: 'balance' }}>
          Where <RouteBadge route={slower.badge.route} sbs={slower.badge.sbs} size="md" /> needs to
          be is where <RouteBadge route={faster.badge.route} sbs={faster.badge.sbs} size="md" /> already is.
        </div>

        <div style={{ display: 'flex', gap: 0, marginTop: 20 }}>
          {stats.map((st, i) => (
            <div key={i} style={{
              flex: 1, paddingRight: 22, marginRight: 22,
              boxShadow: i < stats.length - 1 ? `inset -1px 0 0 ${BPI.rule}` : 'none',
            }}>
              <div className="num" style={{
                fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1,
                color: st.up ? BPI.good : BPI.bad,
              }}>{st.v}</div>
              <div style={{ fontSize: 11, color: BPI.ink70, marginTop: 5, lineHeight: 1.35 }}>{st.unit}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: BPI.ink55, marginTop: 16, lineHeight: 1.5 }}>
          Differences are {faster.badge.route} relative to {slower.badge.route}, weighted by ridership across the corridor.
        </div>
      </div>

      {/* action rail */}
      <div style={{
        background: BPI.paper, boxShadow: `inset 1px 0 0 ${BPI.rule}`,
        padding: '22px 24px', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', gap: 10,
      }}>
        <button className="bpi" style={{
          width: '100%', padding: '12px 14px', fontSize: 13, fontWeight: 600,
          fontFamily: 'inherit', background: BPI.accent, color: '#fff',
          border: 'none', borderRadius: 4, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          Draft a brief from this gap
          <span style={{ fontSize: 14 }}>→</span>
        </button>
        <button className="bpi" style={{
          width: '100%', padding: '12px 14px', fontSize: 13, fontWeight: 500,
          fontFamily: 'inherit', background: 'transparent', color: BPI.ink,
          border: `1px solid ${BPI.ink20}`, borderRadius: 4, cursor: 'pointer',
        }}>
          Save comparison
        </button>
        <div style={{ fontSize: 10.5, color: BPI.ink40, textAlign: 'center', fontFamily: BPIMono, marginTop: 2 }}>
          pre-fills {faster.badge.route} as the control
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────
function RF_Compare() {
  const [aId, setAId] = React.useState('M15');
  const [bId, setBId] = React.useState('Bx12');
  const [open, setOpen] = React.useState(null); // 'A' | 'B' | null
  const [sort, setSort] = React.useState('rh');  // 'rh' | 'mph'

  const a = ROUTES[aId], b = ROUTES[bId];

  function pick(side, id) {
    if (side === 'A') { if (id === bId) setBId(aId); setAId(id); }
    else { if (id === aId) setAId(bId); setBId(id); }
    setOpen(null);
  }
  function swap() { setAId(bId); setBId(aId); setOpen(null); }

  return (
    <div className="bpi" style={{ width: CMW, height: CMH, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <StudioBar active="Routes" breadcrumb={`Routes / compare · ${a.badge.route} ↔ ${b.badge.route}`} />

      {/* click-away layer for the pickers */}
      {open && (
        <div onClick={() => setOpen(null)} style={{ position: 'absolute', inset: 0, zIndex: 20 }} />
      )}

      {/* Pickers — A vs B with swap */}
      <div style={{
        position: 'relative', zIndex: 25,
        background: BPI.card, boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
        display: 'grid', gridTemplateColumns: '1fr 56px 1fr', alignItems: 'stretch',
      }}>
        <RoutePicker route={a} side="left" otherId={bId} open={open === 'A'}
          onToggle={() => setOpen(open === 'A' ? null : 'A')} onPick={(id) => pick('A', id)} />
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRight: `1px solid ${BPI.rule}`, borderLeft: `1px solid ${BPI.rule}`,
        }}>
          <button className="bpi" onClick={swap} title="Swap A and B" style={{
            width: 36, height: 36, borderRadius: 18, background: BPI.paper,
            border: `1px solid ${BPI.rule}`, fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: BPI.ink70, fontSize: 15,
          }}>⇄</button>
        </div>
        <RoutePicker route={b} side="right" otherId={aId} open={open === 'B'}
          onToggle={() => setOpen(open === 'B' ? null : 'B')} onPick={(id) => pick('B', id)} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: 28 }}>

        {/* Metric ledger */}
        <div style={{ marginBottom: 32 }}>
          <H title="Metrics" sub="Both routes on every headline metric, with the signed gap between them. Green marks the better side; the pill shows the absolute difference." />
          <MetricLedger a={a} b={b} />
        </div>

        {/* Speed × hour overlay */}
        <div style={{ marginBottom: 32 }}>
          <H title="Speed by hour"
            sub="Both routes on the same chart. The shaded band is the per-hour gap — summed across hours and weighted by riders, it becomes the rider-hour difference above." />
          <ChartFrame title=" " height={200}>
            <HourOverlay a={a} b={b} />
          </ChartFrame>
        </div>

        {/* Ranked segments — sortable */}
        <div style={{ marginBottom: 32 }}>
          <H title="Worst segments, head to head"
            sub="Top five segments on each route, on a shared 0–10 mph scale so the bars compare directly."
            right={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono, letterSpacing: '0.04em' }}>RANK BY</span>
                <div style={{ display: 'inline-flex', background: BPI.ink06, borderRadius: 4, padding: 2 }}>
                  {[['rh', 'Rider-hours'], ['mph', 'Slowest']].map(([k, lbl]) => (
                    <button key={k} className="bpi" onClick={() => setSort(k)} style={{
                      padding: '5px 12px', fontSize: 11.5, fontWeight: sort === k ? 600 : 500,
                      fontFamily: 'inherit', border: 'none', borderRadius: 3, cursor: 'pointer',
                      background: sort === k ? BPI.card : 'transparent',
                      color: sort === k ? BPI.ink : BPI.ink55,
                      boxShadow: sort === k ? `0 0 0 1px ${BPI.rule}` : 'none',
                    }}>{lbl}</button>
                  ))}
                </div>
              </div>
            } />
          <div style={{
            background: BPI.card, borderRadius: 4, boxShadow: `0 0 0 1px ${BPI.rule}`,
            padding: '4px 22px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 36,
          }}>
            <SegColumn route={a} sort={sort} />
            <SegColumn route={b} sort={sort} />
          </div>
          <div style={{ display: 'flex', gap: 18, marginTop: 10, fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono }}>
            <Legend color={BPI.bad} label="< 5 mph" />
            <Legend color={BPI.warn} label="5–6.5 mph" />
            <Legend color={BPI.good} label="> 6.5 mph" />
          </div>
        </div>

        {/* Lane coverage */}
        <div style={{ marginBottom: 32 }}>
          <H title="Bus-lane coverage" sub="Share of route mileage with dedicated bus-lane treatment (painted or concrete)." />
          <div style={{ background: BPI.card, padding: 22, borderRadius: 4, boxShadow: `0 0 0 1px ${BPI.rule}`, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <LaneCoverageBar route={a} hint={`${a.segs.filter(s => s.lane === 'yes').length} of 5 top segments fully laned`} />
            <LaneCoverageBar route={b} hint={`${b.segs.filter(s => s.lane === 'yes').length} of 5 top segments fully laned`} />
          </div>
        </div>

        {/* Intervention timelines */}
        <div style={{ marginBottom: 32 }}>
          <H title="Interventions in place" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
            {[a, b].map((r, idx) => (
              <div key={idx} style={{ padding: 18, background: BPI.card, borderRadius: 4, boxShadow: `0 0 0 1px ${BPI.rule}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <RouteBadge route={r.badge.route} sbs={r.badge.sbs} size="sm" />
                  <span style={{ fontSize: 12, color: BPI.ink70 }}>
                    {r.interventions.length} interventions · {r.segs.some(s => s.tsp) ? 'TSP present' : 'no TSP'}
                  </span>
                </div>
                <InterventionRow events={r.interventions} />
              </div>
            ))}
          </div>
        </div>

        {/* Verdict + actions */}
        <Verdict a={a} b={b} />
      </div>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 10, height: 6, borderRadius: 1, background: color }} />
      {label}
    </span>
  );
}

Object.assign(window, { RF_Compare });
