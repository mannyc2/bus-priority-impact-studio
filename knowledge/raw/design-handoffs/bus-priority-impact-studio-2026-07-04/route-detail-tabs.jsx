// route-detail-tabs.jsx
// Tab body components for the Route Detail page.
// Deps: system.jsx only. Free-variable refs to LadderTabContent etc.
// resolve at render time (all scripts loaded before React renders).

// ─── M15 SBS data ─────────────────────────────────────────────

const RDT_SPEED_HISTORY = [7.9,7.7,7.6,7.4,7.1,6.9,6.8,6.7,6.8,6.9,6.8,6.6,6.4,6.3];
const RDT_TREND_LABELS  = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May'];

const RDT_HOUR_SPEED = [
  8.1,8.2,8.3,8.4,8.2,7.6,
  6.8,5.4,4.9,5.5,5.9,6.0,
  5.8,5.6,5.4,5.2,4.8,4.2,
  4.6,5.8,6.5,7.0,7.5,7.8,
];

const RDT_BOARDINGS_TREND  = [38.1,37.8,36.9,35.2,34.8,35.5,36.2,37.0,37.4,37.2,36.8,37.2];
const RDT_BOARDINGS_LABELS = ['Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May'];

const RDT_HOURLY_BRDGS = [
  0.20,0.15,0.10,0.12,0.32,0.78,
  2.40,3.20,2.80,2.10,1.80,1.95,
  2.00,2.10,2.20,2.40,2.80,3.10,
  2.70,2.20,1.60,1.10,0.70,0.40,
];

const RDT_TOP_STOPS = [
  { name: 'E 125 St / 1 Av',   brdgs: 4200 },
  { name: 'E 86 St / 1 Av',    brdgs: 3810 },
  { name: 'E 14 St / 1 Av',    brdgs: 3120 },
  { name: 'S Ferry Terminal',   brdgs: 2940 },
  { name: 'E 57 St / 1 Av',    brdgs: 2820 },
  { name: 'Grand Central (NB)', brdgs: 2640 },
];

const RDT_INTERVENTIONS = [
  { date: '2010',     title: 'M15 SBS launches',         detail: 'Off-board fare, limited stops, painted lanes on most of corridor.',                                            tone: 'accent' },
  { date: '2019',     title: 'ACE begins (peak-only)',    detail: 'Camera enforcement at peak hours. Violations drop ~40% in year 1.',                                           tone: 'accent' },
  { date: '2023',     title: 'Concrete lane · 14→23 St', detail: 'NYC DOT upgrade on lower corridor. Speed on this segment +0.9 mph within 90 days.',                           tone: 'good'   },
  { date: 'Jan 2025', title: 'Congestion pricing',        detail: 'CBD-wide effect below 60 St. Attribution with ACE is not clean for this corridor.',                           tone: 'warn'   },
  { date: 'May 2025', title: 'ACE all-day rollout',       detail: 'Enforcement extended to all hours. Violations −68% YoY. Madison Av speed unchanged — painted lane may not enforce.', tone: 'accent' },
];

const RDT_DATASETS = [
  { name: 'Bus segment speeds',       publisher: 'MTA Open Data', window: 'Mar 2026 · 30-day',       cites: 14 },
  { name: 'Hourly ridership',         publisher: 'MTA Open Data', window: 'Mar 2026 · weekday avg',   cites:  9 },
  { name: 'Schedule timepoints',      publisher: 'MTA GTFS',      window: '2026 schedule (Apr)',       cites:  6 },
  { name: 'ACE program & violations', publisher: 'MTA Open Data', window: 'May 2024 – Apr 2026',       cites: 11 },
  { name: 'Bus lane geometry',        publisher: 'NYC DOT',       window: 'as of Mar 2026',            cites:  8 },
];

const RDT_CAVEATS = [
  {
    name: '"Speed" is observed bus travel speed',
    body: 'MTA segment speeds include dwell time, traffic, signals, and stops. Always use "observed bus travel speed" in any brief. Read 6.74 mph as "buses moved at 6.74 mph all-in," not "traffic moved at 6.74 mph."',
    scope: 'M15 · all uses',
  },
  {
    name: 'M15 timepoint definitions changed Aug 2024',
    body: 'Segment boundaries were redefined in the Aug 2024 GTFS release. Data before Aug 2024 is not directly comparable to current segments without re-projection. Do not compare across this boundary without noting it.',
    scope: 'M15-specific',
  },
  {
    name: 'Congestion pricing overlaps ACE all-day (2025)',
    body: 'CBD congestion pricing (Jan 2025) and ACE all-day enforcement (May 2025) overlap on M15 below 60 St. Both are plausible drivers of the 2025 speed gain. No causal claim for either alone is defensible.',
    scope: 'M15 · Manhattan below 60 St · 2025+',
  },
  {
    name: 'Weekday-only baseline',
    body: 'All metrics use weekday filters. The "37.2K daily riders" figure is a weekday average. Weekend patterns are catalogued but not surfaced in this view.',
    scope: 'All route views',
  },
];

// ─── Private chart helpers ─────────────────────────────────────

function RDT_SpeedTrend({ width = 1178, height = 112 }) {
  const data = RDT_SPEED_HISTORY;
  const labels = RDT_TREND_LABELS;
  const padL = 28, padR = 12, padT = 14, padB = 22;
  const n = data.length;
  const cw = (width - padL - padR) / (n - 1);
  const lo = 5.8, hi = 8.6;
  const yv = (v) => padT + (1 - (v - lo) / (hi - lo)) * (height - padT - padB);
  const pts = data.map((v, i) => [padL + i * cw, yv(v)]);
  const line = pts.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1)).join(' ');
  const area = line + ` L${pts[n-1][0].toFixed(1)},${height-padB} L${padL},${height-padB} Z`;
  const events = { 7: { label: 'ACE all-day', color: BPI.accent }, 9: { label: 'Cong. pricing', color: BPI.warn } };
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {[6.5, 7.0, 7.5, 8.0].map(v => (
        <g key={v}>
          <line x1={padL} x2={width-padR} y1={yv(v)} y2={yv(v)} stroke={BPI.rule} />
          <text x={padL-4} y={yv(v)+3} fontSize="9" textAnchor="end" fill={BPI.ink55} fontFamily={BPIMono}>{v.toFixed(1)}</text>
        </g>
      ))}
      <path d={area} fill={BPI.bad} opacity="0.07" />
      <path d={line} fill="none" stroke={BPI.bad} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      {Object.entries(events).map(([idx, ev]) => {
        const cx = padL + parseInt(idx) * cw;
        return (
          <g key={idx}>
            <line x1={cx} x2={cx} y1={padT} y2={height-padB} stroke={ev.color} strokeDasharray="3 2.5" strokeWidth="1.2" opacity="0.7" />
            <text x={cx+4} y={padT+9} fontSize="8.5" fill={ev.color} fontFamily={BPIMono} fontWeight="600">{ev.label}</text>
          </g>
        );
      })}
      {labels.map((l, i) => i % 2 === 0 && (
        <text key={i} x={padL + i*cw} y={height-padB+14} fontSize="9" textAnchor="middle" fill={BPI.ink55} fontFamily={BPIMono}>{l}</text>
      ))}
      <circle cx={pts[n-1][0]} cy={yv(data[n-1])} r="3.5" fill={BPI.bad} />
      <text x={pts[n-1][0]-6} y={yv(data[n-1])-7} fontSize="10" fontWeight="700" fill={BPI.bad} fontFamily={BPIMono} textAnchor="end">{data[n-1].toFixed(1)} mph</text>
    </svg>
  );
}

function RDT_BoardingsTrend({ width = 556, height = 130 }) {
  const data = RDT_BOARDINGS_TREND;
  const labels = RDT_BOARDINGS_LABELS;
  const padL = 32, padR = 8, padT = 10, padB = 22;
  const n = data.length;
  const cw = (width - padL - padR) / (n - 1);
  const lo = 33.5, hi = 39.5;
  const yv = (v) => padT + (1 - (v - lo) / (hi - lo)) * (height - padT - padB);
  const pts = data.map((v, i) => [padL + i * cw, yv(v)]);
  const line = pts.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1)).join(' ');
  const area = line + ` L${pts[n-1][0].toFixed(1)},${height-padB} L${padL},${height-padB} Z`;
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {[35, 37, 39].map(v => (
        <g key={v}>
          <line x1={padL} x2={width-padR} y1={yv(v)} y2={yv(v)} stroke={BPI.rule} />
          <text x={padL-4} y={yv(v)+3} fontSize="9" textAnchor="end" fill={BPI.ink55} fontFamily={BPIMono}>{v}K</text>
        </g>
      ))}
      <path d={area} fill={BPI.ink} opacity="0.05" />
      <path d={line} fill="none" stroke={BPI.ink} strokeWidth="1.6" strokeLinejoin="round" />
      {labels.map((l, i) => i % 2 === 0 && (
        <text key={i} x={padL + i*cw} y={height-padB+14} fontSize="9" textAnchor="middle" fill={BPI.ink55} fontFamily={BPIMono}>{l}</text>
      ))}
      <circle cx={pts[n-1][0]} cy={yv(data[n-1])} r="3" fill={BPI.ink} />
    </svg>
  );
}

function RDT_HourBoardings({ width = 1178, height = 100 }) {
  const data = RDT_HOURLY_BRDGS;
  const padL = 28, padR = 8, padT = 10, padB = 20;
  const maxV = Math.max(...data);
  const cw = (width - padL - padR) / 24;
  const barMaxH = height - padT - padB;
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {data.map((v, i) => {
        const bh = (v / maxV) * barMaxH;
        const isPeak = (i >= 7 && i <= 9) || (i >= 16 && i <= 19);
        return (
          <rect key={i}
            x={padL + i * cw + 1.5} width={cw - 3}
            y={height - padB - bh} height={bh}
            fill={isPeak ? BPI.bad : BPI.ink40}
            opacity={isPeak ? 0.72 : 0.42}
          />
        );
      })}
      {[0, 6, 12, 18].map(h => (
        <text key={h} x={padL + h*cw + cw/2} y={height-padB+14}
          fontSize="9" textAnchor="middle" fill={BPI.ink55} fontFamily={BPIMono}>{h}:00</text>
      ))}
      <text x={padL + 8.5*cw} y={padT+9} fontSize="8.5" fill={BPI.bad} fontFamily={BPIMono} fontWeight="600" textAnchor="middle">AM peak</text>
      <text x={padL + 17.5*cw} y={padT+9} fontSize="8.5" fill={BPI.bad} fontFamily={BPIMono} fontWeight="600" textAnchor="middle">PM peak</text>
    </svg>
  );
}

// ─── Overview tab ──────────────────────────────────────────────

// One treatment, spelled out — dot keyed to state, coverage inline,
// non-present items tagged. No decoder ring of two-letter codes.
function TxItem({ t }) {
  const def = TREATMENTS[t.type];
  if (!def) return null;
  const st = STATES[t.state] || STATES.unknown;
  const present = st.present === true;
  const gap = t.state === 'source_gap';
  const tone = gap ? BPI.warn : t.state === 'pilot' ? BPI.accent : present ? BPI.good : BPI.warn;
  const cov = (t.coverage !== undefined && t.coverage < 1) ? `${Math.round(t.coverage * 100)}%` : null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <span style={{
        width: 8, height: 8, borderRadius: 4, flexShrink: 0,
        background: present ? tone : 'transparent',
        boxShadow: present ? 'none' : `inset 0 0 0 1.4px ${tone}`,
      }} />
      <span style={{ fontSize: 12.5, fontWeight: 500, color: present ? BPI.ink : BPI.ink55, letterSpacing: '-0.005em' }}>
        {def.label}
      </span>
      {cov && <span className="num" style={{ fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono }}>{cov}</span>}
      {!present && (
        <span style={{
          fontSize: 8.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          color: tone, background: BPI.warnBg, padding: '1px 5px', borderRadius: 2,
        }}>{st.short}</span>
      )}
    </span>
  );
}

// Grouped inventory of everything present on the route. Reads as a spec
// sheet — family label left, treatments spelled out right.
function RouteWhatsInPlace() {
  const groups = groupByFamily(M15_ROUTE_TREATMENTS);
  const fams = FAMILY_ORDER.filter((fid) => groups[fid] && groups[fid].length);
  const counts = M15_ROUTE_TREATMENTS.reduce((a, t) => {
    const st = STATES[t.state]; if (!st) return a;
    if (t.state === 'source_gap') a.gap++;
    else if (st.present === true) a.inPlace++;
    else a.planned++;
    return a;
  }, { inPlace: 0, planned: 0, gap: 0 });
  const Dot = () => <span style={{ width: 3, height: 3, borderRadius: 2, background: BPI.ink20 }} />;
  return (
    <div style={{ background: BPI.card, borderRadius: 3, boxShadow: `0 0 0 1px ${BPI.rule}` }}>
      {fams.map((fid, idx) => (
        <div key={fid} style={{
          display: 'grid', gridTemplateColumns: '96px 1fr', gap: 18, alignItems: 'baseline',
          padding: '13px 18px',
          boxShadow: idx < fams.length - 1 ? `inset 0 -1px 0 ${BPI.rule}` : 'none',
        }}>
          <div style={{
            fontSize: 10, color: BPI.ink55, fontFamily: BPIMono, letterSpacing: '0.08em',
            fontWeight: 700, textTransform: 'uppercase',
          }}>{FAMILY_BY_ID[fid].short}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '9px 22px' }}>
            {groups[fid].map((t, i) => <TxItem key={i} t={t} />)}
          </div>
        </div>
      ))}
      <div style={{
        padding: '12px 18px', background: BPI.paperDeep, boxShadow: `inset 0 1px 0 ${BPI.rule}`,
        display: 'flex', alignItems: 'center', gap: 14, fontSize: 11.5, color: BPI.ink55,
      }}>
        <span><b style={{ color: BPI.good }}>{counts.inPlace}</b> in place</span>
        <Dot />
        <span><b style={{ color: BPI.warn }}>{counts.planned}</b> planned / proposed</span>
        {counts.gap > 0 && <><Dot /><span><b style={{ color: BPI.warn }}>{counts.gap}</b> source gap</span></>}
        <span style={{ flex: 1 }} />
        <span style={{ color: BPI.accent, fontWeight: 600, cursor: 'pointer' }}>See timeline of changes →</span>
      </div>
    </div>
  );
}

// Clean editorial key/value list — no cramped micro-labels.
function RouteVitals() {
  const rows = [
    ['Borough', 'Manhattan'],
    ['Length', '8.4 mi'],
    ['Stops', '33 (NB + SB)'],
    ['Peak frequency', '6–8 min'],
    ['Service type', 'Select Bus Service'],
    ['Corridor', '1 Av / 2 Av · N–S'],
  ];
  return (
    <div style={{ background: BPI.card, borderRadius: 3, boxShadow: `0 0 0 1px ${BPI.rule}`, padding: '4px 18px' }}>
      {rows.map(([k, v], i) => (
        <div key={k} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16,
          padding: '12.5px 0',
          boxShadow: i < rows.length - 1 ? `inset 0 -1px 0 ${BPI.rule}` : 'none',
        }}>
          <span style={{ fontSize: 12.5, color: BPI.ink55 }}>{k}</span>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: BPI.ink, textAlign: 'right', letterSpacing: '-0.005em' }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function RouteTabOverview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Editorial lede — single sentence framing the route. Sits between
          the AI Diagnosis strip (above the tabs) and the data. */}
      <div style={{
        padding: '14px 18px', background: BPI.card, borderRadius: 3,
        boxShadow: `0 0 0 1px ${BPI.rule}`,
        display: 'grid', gridTemplateColumns: '4px 1fr', gap: 14,
      }}>
        <div style={{ background: BPI.ink, borderRadius: 2 }} />
        <div style={{ paddingLeft: 2 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>The route in one paragraph</div>
          <div style={{ fontSize: 13.5, color: BPI.ink, lineHeight: 1.6, maxWidth: 980, textWrap: 'pretty' }}>
            M15 SBS runs the East Side of Manhattan from East Harlem to South Ferry along 1 Av and 2 Av. The route carries 37.2K riders a weekday and is among the slowest Select Bus routes in the city. Its worst stretch —
            <b style={{ color: BPI.bad }}> Madison Av between 28 and 58 St </b>
            — is the only segment without a continuous bus lane, and accounts for 43% of the route's total rider-hour delay.
          </div>
        </div>
      </div>

      {/* Corridor map — the visual anchor. */}
      <div>
        <H title="The corridor"
          sub="The line is observed weekday speed; the dashed line is the scheduled timepoint — the gap is lost time. Slow zones are shaded. The three rails below show where the segment-varying treatments (bus lane, ACE, signal priority) are in place — the full inventory is in “What's in place,” below."
          right={<span style={{
            fontSize: 11, color: BPI.accent, fontWeight: 600,
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}>Open full corridor view →</span>} />
        <div style={{
          background: BPI.card, borderRadius: 3,
          boxShadow: `0 0 0 1px ${BPI.rule}`,
          padding: '14px 22px 18px',
        }}>
          <CorridorMap width={1200} height={326} />
        </div>
      </div>

      {/* Time-series + hour profile, side by side. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <H title="Speed trend" sub="14 months · weighted avg. The route has declined 1.6 mph despite a full treatment stack." />
          <ChartFrame height={172}>
            <RDT_SpeedTrend width={580} height={172} />
          </ChartFrame>
        </div>
        <div>
          <H title="Speed by hour of day" sub="Weekday median, Mar 2026. Dashed line = scheduled 7.6 mph." />
          <ChartFrame height={172}>
            <HourBars data={RDT_HOUR_SPEED} sched={7.6} width={580} height={172} min={3.5} max={9.5} />
          </ChartFrame>
        </div>
      </div>

      {/* What's in place + route vitals. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, alignItems: 'start' }}>
        <div>
          <H title="What's in place on this corridor"
            sub="Every priority treatment on the M15 today, grouped by family and spelled out. Planned and proposed items are marked."
            right={<span style={{
              fontSize: 11, color: BPI.accent, fontWeight: 600,
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}>Open Interventions tab →</span>} />
          <RouteWhatsInPlace />
        </div>
        <div>
          <H title="Route vitals" sub="Service & geography." />
          <RouteVitals />
        </div>
      </div>

    </div>
  );
}

// Canonical M15 treatments — used by Overview's inventory display.
// Sources from the refactor sample data when available so the analyst
// surface and the canvas exploration stay in sync.
const M15_ROUTE_TREATMENTS = (typeof SAMPLE_M15_TREATMENTS !== 'undefined')
  ? SAMPLE_M15_TREATMENTS
  : [
    { type: 'bus_lane',           state: 'active', coverage: 0.72 },
    { type: 'ace',                state: 'active' },
    { type: 'tsp',                state: 'active', coverage: 0.05 },
    { type: 'sbs',                state: 'active' },
    { type: 'off_board_fare',     state: 'active' },
    { type: 'all_door',           state: 'active' },
    { type: 'stop_consolidation', state: 'active' },
  ];

// ─── Riders tab ───────────────────────────────────────────────

function RouteTabRiders() {
  const maxBrdgs = Math.max(...RDT_TOP_STOPS.map(s => s.brdgs));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* KPI strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        background: BPI.card, borderRadius: 3, boxShadow: `0 0 0 1px ${BPI.rule}`,
      }}>
        {[
          { label: 'Daily boardings',        val: '37.2K', sub: '−4.1% year over year',                         tone: null  },
          { label: 'Rider-hours lost / day', val: '4,310', sub: 'vs. scheduled timepoints',                     tone: 'bad' },
          { label: 'Madison Av alone',       val: '18.4K', sub: 'rider-hours / day · 43 % of total route delay', tone: 'bad' },
        ].map((k, i) => (
          <div key={i} style={{ padding: '20px 24px', borderRight: i < 2 ? `1px solid ${BPI.rule}` : 'none' }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>{k.label}</div>
            <div className="num" style={{
              fontSize: 30, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1,
              color: k.tone === 'bad' ? BPI.bad : BPI.ink,
            }}>{k.val}</div>
            <div style={{ fontSize: 11, color: BPI.ink55, marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* 2-col: trend + top stops */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <H title="Monthly boardings" sub="Jun 2025 – May 2026 · weekday average." />
          <ChartFrame height={130}><RDT_BoardingsTrend /></ChartFrame>
        </div>
        <div>
          <H title="Top stops by daily boardings" sub="Weekday average, Mar 2026." />
          <div style={{ background: BPI.card, borderRadius: 3, boxShadow: `0 0 0 1px ${BPI.rule}` }}>
            {RDT_TOP_STOPS.map((s, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1fr 52px', gap: 12, alignItems: 'center',
                padding: '10px 16px',
                boxShadow: i < RDT_TOP_STOPS.length - 1 ? `inset 0 -1px 0 ${BPI.rule}` : 'none',
              }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 4 }}>{s.name}</div>
                  <div style={{ height: 4, background: BPI.ink06, borderRadius: 2 }}>
                    <div style={{ height: '100%', borderRadius: 2, width: `${(s.brdgs / maxBrdgs) * 100}%`, background: BPI.ink40 }} />
                  </div>
                </div>
                <div className="num" style={{ textAlign: 'right', fontSize: 13, fontWeight: 600 }}>
                  {(s.brdgs / 1000).toFixed(1)}K
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hourly boardings */}
      <div>
        <H
          title="Boardings by hour"
          sub="PM peak matches or exceeds AM peak — the slowest hours hit at maximum load. Red bars = AM and PM peaks."
        />
        <ChartFrame height={100}><RDT_HourBoardings /></ChartFrame>
      </div>

      <Caveat tone="info" title="How to read rider-hours lost">
        A 1-minute delay affecting 1,000 riders = 16.7 rider-hours. The 4,310 RH/day total
        means riders collectively lose the equivalent of 180 rider-days every weekday.
        The Madison Av segment alone causes <b>as much delay as the other 6.9 miles combined</b>.
      </Caveat>

    </div>
  );
}

// ─── Interventions tab ────────────────────────────────────────

function RouteTabInterventions() {
  // Canonical treatment inventory for M15 SBS. Drawn from the refactor's
  // sample data so the tab and the canvas variations stay in sync.
  const M15_TREATMENTS = (typeof SAMPLE_M15_TREATMENTS !== 'undefined')
    ? SAMPLE_M15_TREATMENTS : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

      {/* Family-grouped treatment inventory */}
      <div>
        <H title="What's in place today"
           sub="Every treatment on the M15 by family — May 2026. State (active / planned / source gap) and evaluation are separate axes."
           right={<TreatmentStrip treatments={M15_TREATMENTS} align="flex-end" />} />
        <TreatmentInventory treatments={M15_TREATMENTS} scope="route" />
      </div>

      <div style={{
        padding: '12px 16px', background: BPI.paperDeep, borderRadius: 3,
        fontSize: 12, color: BPI.ink70, display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span>Looking for when each of these arrived and what it did to speed?</span>
        <span style={{ color: BPI.accent, fontWeight: 600, cursor: 'pointer' }}>See the Timeline tab →</span>
      </div>

    </div>
  );
}

// ─── Timeline tab ─────────────────────────────────────────────
//
// The route's history gets its own surface: a speed-over-time spine with
// dated interventions marked, the source-backed event list, and the one
// clean before/after we can defend (ACE all-day).

// A designed horizontal timeline — dated node on a shared axis, card
// below, tone-colored by event type. Reads as an editorial spread.
function HorizontalTimelineRich({ events }) {
  const n = events.length;
  const inset = `${(100 / n) / 2}%`;
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', left: inset, right: inset, top: 30, height: 2, background: BPI.rule }} />
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, gap: 14, alignItems: 'stretch' }}>
        {events.map((e, i) => {
          const c = toneColors(e.tone || 'accent');
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ height: 22, textAlign: 'center', fontFamily: BPIMono, fontSize: 11, fontWeight: 700, color: c.ink, letterSpacing: '0.04em' }}>{e.date}</div>
              <div style={{ height: 16, display: 'flex', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
                <div style={{ width: 13, height: 13, borderRadius: 7, background: c.fg, boxShadow: `0 0 0 3px ${BPI.paper}` }} />
              </div>
              <div style={{ width: 2, height: 14, background: c.fg, opacity: 0.4, alignSelf: 'center' }} />
              <div style={{
                flex: 1, background: BPI.card, borderRadius: 3, boxShadow: `0 0 0 1px ${BPI.rule}`,
                borderTop: `2px solid ${c.fg}`, padding: '11px 13px 12px',
                display: 'flex', flexDirection: 'column', gap: 5,
              }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.25, letterSpacing: '-0.005em' }}>{e.title}</div>
                {e.detail && <div style={{ fontSize: 11, color: BPI.ink70, lineHeight: 1.5 }}>{e.detail}</div>}
                {e.source && (
                  <div style={{ marginTop: 'auto', paddingTop: 6, fontSize: 9.5, color: BPI.ink55, fontFamily: BPIMono, letterSpacing: '0.02em' }}>
                    src · {e.source}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RouteTabTimeline() {
  const M15_HISTORY = (typeof SAMPLE_M15_INTERVENTIONS !== 'undefined')
    ? SAMPLE_M15_INTERVENTIONS : RDT_INTERVENTIONS;
  const BEFORE_AFTER = [
    { lbl: 'PM-peak avg speed', b: 6.2,  a: 6.9,  max: 8,    better: true  },
    { lbl: 'Slow-window share', b: 41,   a: 33,   max: 50,   better: false },
    { lbl: 'Violations / day',  b: 1840, a: 590,  max: 2000, better: false },
  ];
  const toneLegend = [
    ['accent', 'Service / enforcement'],
    ['good', 'Measured improvement'],
    ['warn', 'Attribution caution'],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Hero — designed horizontal timeline of every intervention */}
      <div>
        <H title="The corridor's history"
          sub={`Every dated, source-backed intervention on the M15 — ${M15_HISTORY[0].date} to today. ${M15_HISTORY.length} events; sequence matters for attribution.`}
          right={
            <div style={{ display: 'flex', gap: 14 }}>
              {toneLegend.map(([t, lbl]) => (
                <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: BPI.ink70 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 5, background: toneColors(t).fg }} />
                  {lbl}
                </span>
              ))}
            </div>
          } />
        <div style={{ padding: '6px 4px 4px' }}>
          <HorizontalTimelineRich events={M15_HISTORY} />
        </div>
      </div>

      {/* Recent speed + before/after */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 24, alignItems: 'start' }}>
        <div>
          <H title="Speed since the 2025 changes"
            sub="Weighted-average mph over the last 14 months. The two 2025 interventions are marked — note speed kept falling." />
          <ChartFrame height={196}>
            <RDT_SpeedTrend width={720} height={196} />
          </ChartFrame>
        </div>
        <div>
          <H
            title="Before / after — ACE all-day"
            sub="May 2025 · 60-day windows on ACE segments."
            right={<span className="chip warn" style={{ fontSize: 10.5 }}>Overlaps cong. pricing</span>}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {BEFORE_AFTER.map((r, i) => {
              const improved = r.better ? r.a > r.b : r.a < r.b;
              const tone = improved ? BPI.good : BPI.bad;
              const toneBg = improved ? BPI.goodBg : BPI.badBg;
              const delta = r.better
                ? `+${(r.a - r.b).toFixed(1)}`
                : `−${((1 - r.a / r.b) * 100).toFixed(0)}%`;
              return (
                <div key={i} style={{ padding: '14px 16px', background: BPI.card, borderRadius: 3, boxShadow: `0 0 0 1px ${BPI.rule}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{r.lbl}</div>
                    <div style={{ padding: '3px 8px', borderRadius: 3, background: toneBg, fontSize: 11, fontWeight: 700, color: tone, fontFamily: BPIMono }}>{delta}</div>
                  </div>
                  <BeforeAfter before={r.b} after={r.a} max={r.max} width={240} />
                </div>
              );
            })}
            <Caveat tone="warn">
              ACE all-day (May 2025) and congestion pricing (Jan 2025) overlap on M15. Attribution is not clean for CBD segments below 60 St.
            </Caveat>
          </div>
        </div>
      </div>

    </div>
  );
}

// ─── Data notes tab ───────────────────────────────────────────

function RouteTabDataNotes() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Data window header */}
      <div style={{
        padding: '18px 22px', background: BPI.card, borderRadius: 3,
        boxShadow: `0 0 0 1px ${BPI.rule}`,
        display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap',
      }}>
        {[
          { label: 'Primary window', val: 'March 2026',          sub: '30-day weekday · 2,892 obs. for M15' },
          { label: 'Trend window',   val: 'Apr 2025 – May 2026', sub: '14 monthly snapshots' },
          { label: 'Last refreshed', val: '2026-05-12',          sub: 'all datasets current', good: true },
        ].map((k, i) => (
          <React.Fragment key={i}>
            {i > 0 && <div style={{ width: 1, height: 36, background: BPI.rule, flexShrink: 0 }} />}
            <div>
              <div className="eyebrow" style={{ marginBottom: 3 }}>{k.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div className="num" style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.015em' }}>{k.val}</div>
                {k.good && <span style={{ width: 6, height: 6, borderRadius: 3, background: BPI.good, flexShrink: 0 }} />}
              </div>
              <div style={{ fontSize: 11, color: k.good ? BPI.good : BPI.ink55, marginTop: 2 }}>{k.sub}</div>
            </div>
          </React.Fragment>
        ))}
        <div style={{ flex: 1 }} />
        <a href="Docs.html" style={{
          padding: '9px 14px', border: `1px solid ${BPI.accent}`, borderRadius: 3,
          fontSize: 12.5, fontWeight: 600, color: BPI.accent, textDecoration: 'none', whiteSpace: 'nowrap',
        }}>Full methodology in Docs →</a>
      </div>

      {/* Route-specific caveats */}
      <div>
        <H title="Route-specific caveats" sub="These apply specifically to M15 SBS. Always cite the relevant caveat when publishing a brief." />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {RDT_CAVEATS.map((c, i) => (
            <div key={i} style={{
              padding: '14px 18px', background: BPI.card, borderRadius: 3,
              boxShadow: `0 0 0 1px ${BPI.rule}`,
              display: 'flex', gap: 14, alignItems: 'flex-start',
            }}>
              <div style={{ width: 5, height: 5, borderRadius: 3, background: BPI.warn, marginTop: 8, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 5, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-0.005em' }}>{c.name}</div>
                  <span className="chip" style={{ fontSize: 10 }}>scope · {c.scope}</span>
                </div>
                <div style={{ fontSize: 12.5, color: BPI.ink70, lineHeight: 1.55 }}>{c.body}</div>
              </div>
              <button className="bpi" style={{
                fontFamily: 'inherit', flexShrink: 0, background: 'transparent',
                border: `1px solid ${BPI.ink20}`, borderRadius: 3,
                padding: '6px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer',
              }}>Apply to brief</button>
            </div>
          ))}
        </div>
      </div>

      {/* Datasets in use */}
      <div>
        <H title="Datasets in use for this route" sub="5 of 6 studio datasets contribute to this view." />
        <div style={{ background: BPI.card, borderRadius: 3, boxShadow: `0 0 0 1px ${BPI.rule}` }}>
          {RDT_DATASETS.map((d, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '240px 160px 1fr 80px',
              gap: 18, alignItems: 'center', padding: '11px 18px',
              boxShadow: i < RDT_DATASETS.length - 1 ? `inset 0 -1px 0 ${BPI.rule}` : 'none',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</div>
              <div style={{ fontSize: 11.5, color: BPI.ink55, fontFamily: BPIMono }}>{d.publisher}</div>
              <div style={{ fontSize: 11.5, color: BPI.ink55 }}>{d.window}</div>
              <div style={{ textAlign: 'right', fontSize: 11.5, fontWeight: 600, color: BPI.accent, fontFamily: BPIMono }}>cited {d.cites}×</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

// ─── Slow segments tab ────────────────────────────────────────
//
// Worst three segments get featured-card treatment (numbered, big speed
// number, AI note inline if flagged, mini corridor map showing where on
// the line). The rest sit in a tighter sortable table below.

// Map a slow-segments row to a corridor-map segment index, when it
// corresponds cleanly. Hardcoded — segment taxonomies in the analyst
// table and the corridor map diverge by design (analyst rows are
// directional and 1Av/2Av-specific, corridor map is whole-route).
function corridorIndexFor(seg) {
  const k = `${seg.from} → ${seg.to}`;
  if (/Madison Av \/ E 28/.test(seg.from) && /Madison Av \/ E 58/.test(seg.to)) return 4;
  if (/1 Av \/ E 14/.test(seg.from)       && /1 Av \/ E 34/.test(seg.to))       return 5;
  if (/2 Av \/ E 60/.test(seg.from)       && /2 Av \/ E 42/.test(seg.to))       return 3;
  if (/1 Av \/ E 86/.test(seg.from))                                            return 2;
  if (/2 Av \/ E 23/.test(seg.from))                                            return 5;
  if (/1 Av \/ E 96/.test(seg.from))                                            return 1;
  if (/2 Av \/ E 79/.test(seg.from))                                            return 3;
  return null;
}

function SlowSegmentFeaturedCard({ rank, seg }) {
  const corridorI = corridorIndexFor(seg);
  const tone = seg.mph < 5 ? BPI.bad : seg.mph < 6 ? BPI.warn : BPI.ink;
  const deltaSched = seg.sched - seg.mph;
  return (
    <div style={{
      background: BPI.card, borderRadius: 3,
      boxShadow: `0 0 0 1px ${BPI.rule}`,
      display: 'grid', gridTemplateColumns: '44px 1fr',
      overflow: 'hidden',
    }}>
      {/* Rank stripe */}
      <div style={{
        background: rank === 1 ? BPI.bad : rank === 2 ? BPI.warn : BPI.ink70,
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: BPIMono, fontWeight: 700, fontSize: 16, letterSpacing: '0.04em',
      }}>{String(rank).padStart(2, '0')}</div>

      {/* Body */}
      <div style={{ padding: '16px 18px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <DirIndicator dir={seg.dir} />
              <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>
                {seg.from} <span style={{ color: BPI.ink40 }}>→</span> {seg.to}
              </span>
            </div>
            <div style={{ fontSize: 11, color: BPI.ink55, fontFamily: BPIMono, letterSpacing: '0.02em' }}>
              {seg.dir === 'NB' ? 'Northbound' : seg.dir === 'SB' ? 'Southbound' : seg.dir} ·
              {' '}weekday avg · Mar 2026
            </div>
          </div>
          <TreatmentRow lane={seg.lane} ace={seg.ace} tsp={seg.tsp} treatments={seg.treatments} align="flex-end" />
        </div>

        {/* Stats + map row */}
        <div style={{
          display: 'grid', gridTemplateColumns: '110px 110px 110px 1fr',
          gap: 18, alignItems: 'center',
          paddingTop: 8, boxShadow: `inset 0 1px 0 ${BPI.rule}`,
        }}>
          <div>
            <div style={{ fontSize: 9.5, color: BPI.ink40, letterSpacing: '0.08em', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Observed</div>
            <div className="num" style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.025em', color: tone, lineHeight: 1 }}>
              {seg.mph.toFixed(1)}<span style={{ fontSize: 13, color: BPI.ink55, marginLeft: 3, fontWeight: 500 }}>mph</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9.5, color: BPI.ink40, letterSpacing: '0.08em', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>vs scheduled</div>
            <div className="num" style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.022em', color: BPI.bad, lineHeight: 1 }}>
              −{deltaSched.toFixed(1)}<span style={{ fontSize: 11, color: BPI.ink55, marginLeft: 3, fontWeight: 500 }}>mph</span>
            </div>
            <div style={{ fontSize: 10, color: BPI.ink55, marginTop: 4, fontFamily: BPIMono }}>sched {seg.sched.toFixed(1)} mph</div>
          </div>
          <div>
            <div style={{ fontSize: 9.5, color: BPI.ink40, letterSpacing: '0.08em', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Rider-hours / day</div>
            <div className="num" style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.022em', color: BPI.ink, lineHeight: 1 }}>
              {(seg.rh / 1000).toFixed(1)}<span style={{ fontSize: 11, color: BPI.ink55, marginLeft: 3, fontWeight: 500 }}>K</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9.5, color: BPI.ink40, letterSpacing: '0.08em', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Where on the route</div>
            {corridorI != null
              ? <CorridorMapMini highlightI={corridorI} width={260} height={22} />
              : <div style={{ fontSize: 11, color: BPI.ink55, fontStyle: 'italic' }}>not in main corridor</div>}
          </div>
        </div>

        {/* AI note inline */}
        {seg.aiNote && (
          <div style={{
            marginTop: 2, padding: '12px 14px',
            background: seg.flag === 'top' ? BPI.accentBg : BPI.ink06,
            borderRadius: 3, borderLeft: `2px solid ${BPI.accent}`,
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{
                fontFamily: BPIMono, fontSize: 9.5, fontWeight: 700,
                color: BPI.accent, letterSpacing: '0.08em',
              }}>◆ AI OBSERVATION</span>
              <span style={{ width: 3, height: 3, borderRadius: 2, background: BPI.ink40 }} />
              <span style={{ fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono, letterSpacing: '0.02em' }}>
                {seg.aiBasis}
              </span>
              <span style={{ width: 3, height: 3, borderRadius: 2, background: BPI.ink40 }} />
              <span style={{
                fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: seg.aiConfidence === 'high' ? BPI.good : BPI.warn,
                background: seg.aiConfidence === 'high' ? BPI.goodBg : BPI.warnBg,
                padding: '2px 6px', borderRadius: 2,
              }}>{seg.aiConfidence || 'moderate'} confidence</span>
            </div>
            <div style={{ fontSize: 12.5, color: BPI.ink, lineHeight: 1.55, maxWidth: 880 }}>
              {seg.aiNote}
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12 }}>
          <span style={{ color: BPI.accent, fontWeight: 600, cursor: 'pointer' }}>Send to brief →</span>
          <span style={{ color: BPI.ink20 }}>·</span>
          <span style={{ color: BPI.ink70, fontWeight: 500, cursor: 'pointer' }}>See similar segments</span>
          <span style={{ color: BPI.ink20 }}>·</span>
          <span style={{ color: BPI.ink70, fontWeight: 500, cursor: 'pointer' }}>Hour breakdown</span>
        </div>
      </div>
    </div>
  );
}

// Compact row for the "rest" of the segments — ranks 4 through 13.
function SlowSegmentRow({ rank, seg }) {
  const tone = seg.mph < 5 ? BPI.bad : seg.mph < 6 ? BPI.warn : BPI.ink;
  const deltaSched = seg.sched - seg.mph;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '36px 36px 1fr 70px 80px 84px 128px 14px',
      gap: 14, alignItems: 'center',
      padding: '12px 18px',
      boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
      cursor: 'pointer',
    }}>
      <span style={{ fontFamily: BPIMono, fontSize: 11, fontWeight: 700, color: BPI.ink40, letterSpacing: '0.06em' }}>
        {String(rank).padStart(2, '0')}
      </span>
      <DirIndicator dir={seg.dir} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, letterSpacing: '-0.005em' }}>
          {seg.from} <span style={{ color: BPI.ink40 }}>→</span> {seg.to}
        </div>
        {seg.aiNote && (
          <div style={{ fontSize: 10.5, color: BPI.accent, fontFamily: BPIMono, fontWeight: 600, marginTop: 3, letterSpacing: '0.04em' }}>
            ◆ AI NOTE
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="num" style={{ fontSize: 14, fontWeight: 600, color: tone, lineHeight: 1 }}>{seg.mph.toFixed(1)}</div>
        <div style={{ fontSize: 9, color: BPI.ink40, letterSpacing: '0.06em', fontWeight: 700, textTransform: 'uppercase', marginTop: 3 }}>mph</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="num" style={{ fontSize: 12.5, fontWeight: 600, color: BPI.bad, lineHeight: 1 }}>−{deltaSched.toFixed(1)}</div>
        <div style={{ fontSize: 9, color: BPI.ink40, letterSpacing: '0.06em', fontWeight: 700, textTransform: 'uppercase', marginTop: 3 }}>vs sched</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="num" style={{ fontSize: 12.5, fontWeight: 600, color: BPI.ink, lineHeight: 1 }}>
          {(seg.rh / 1000).toFixed(1)}<span style={{ fontSize: 10, color: BPI.ink55, marginLeft: 2 }}>K</span>
        </div>
        <div style={{ fontSize: 9, color: BPI.ink40, letterSpacing: '0.06em', fontWeight: 700, textTransform: 'uppercase', marginTop: 3 }}>RH / day</div>
      </div>
      <TreatmentRow lane={seg.lane} ace={seg.ace} tsp={seg.tsp} treatments={seg.treatments} />
      <div style={{ fontSize: 14, color: BPI.ink40, textAlign: 'right' }}>→</div>
    </div>
  );
}

function RouteTabSlowSegments({
  segments, sortedSegments, displayedSegments,
  visibleCount, setVisibleCount,
  segSort, setSegSort,
  expandedNote, setExpandedNote,
  remaining,
}) {
  const featured = sortedSegments.slice(0, 3);
  const rest = sortedSegments.slice(3, visibleCount);
  const restRemaining = sortedSegments.length - visibleCount;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Featured top 3 */}
      <div>
        <H
          title="The three segments dragging this route down"
          sub="Ranked by rider-hours lost per weekday. Together they account for 51,000 rider-hours — more than two-thirds of the route's total daily delay."
          right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="chip accent">Mar 2026</span>
              <span style={{ width: 1, height: 16, background: BPI.rule, margin: '0 4px' }} />
              <span style={{ fontSize: 10.5, color: BPI.ink55, letterSpacing: '0.06em', fontWeight: 700, textTransform: 'uppercase' }}>Sort</span>
              <div style={{ display: 'flex', background: BPI.ink06, borderRadius: 3, padding: 2, gap: 2 }}>
                {[['rh', 'Rider-hours'], ['mph', 'Slowest mph']].map(([k, label]) => (
                  <span key={k} onClick={() => { setSegSort(k); setExpandedNote(null); }} style={{
                    padding: '4px 9px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    borderRadius: 2,
                    background: segSort === k ? BPI.paper : 'transparent',
                    color: segSort === k ? BPI.ink : BPI.ink55,
                    boxShadow: segSort === k ? `0 0 0 1px ${BPI.rule}` : 'none',
                  }}>{label}</span>
                ))}
              </div>
            </div>
          } />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {featured.map((s, i) => (
            <SlowSegmentFeaturedCard key={`${s.from}-${s.to}`} rank={i + 1} seg={s} />
          ))}
        </div>
      </div>

      {/* Rest of the segments */}
      <div>
        <H
          title="Other slow segments"
          sub={`Ranks 4 through ${segments.length} — the long tail of underperforming timepoints on the route.`}
        />
        <div style={{ background: BPI.card, borderRadius: 3, boxShadow: `0 0 0 1px ${BPI.rule}`, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '36px 36px 1fr 70px 80px 84px 128px 14px',
            gap: 14, alignItems: 'center',
            padding: '11px 18px',
            background: BPI.paperDeep,
            boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
            fontSize: 9.5, color: BPI.ink55, letterSpacing: '0.08em',
            fontWeight: 700, textTransform: 'uppercase',
          }}>
            <span>Rank</span>
            <span>Dir</span>
            <span>Segment</span>
            <span style={{ textAlign: 'right' }}>Speed</span>
            <span style={{ textAlign: 'right' }}>Sched Δ</span>
            <span style={{ textAlign: 'right' }}>Riders</span>
            <span>Treatments</span>
            <span />
          </div>
          {rest.map((s, i) => (
            <SlowSegmentRow key={`${s.from}-${s.to}`} rank={i + 4} seg={s} />
          ))}
          {rest.length === 0 && (
            <div style={{ padding: '20px 18px', fontSize: 12.5, color: BPI.ink55, textAlign: 'center' }}>
              All segments shown above as featured.
            </div>
          )}
          {/* Footer */}
          <div style={{
            padding: '12px 18px', fontSize: 11.5, color: BPI.ink55,
            background: BPI.paperDeep, boxShadow: `inset 0 1px 0 ${BPI.rule}`,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span>Showing {visibleCount} of {segments.length} timepoint segments.</span>
            <span style={{ flex: 1 }} />
            {restRemaining > 0 ? (
              <span onClick={() => setVisibleCount(Math.min(segments.length, visibleCount + 5))} style={{
                color: BPI.accent, cursor: 'pointer', fontWeight: 600,
              }}>Load {Math.min(5, restRemaining)} more →</span>
            ) : visibleCount > 5 ? (
              <span onClick={() => setVisibleCount(5)} style={{
                color: BPI.accent, cursor: 'pointer', fontWeight: 600,
              }}>Collapse to top 5 →</span>
            ) : null}
            <span style={{ color: BPI.ink20 }}>·</span>
            <span style={{ color: BPI.accent, cursor: 'pointer', fontWeight: 600 }}>Download segments CSV ↓</span>
          </div>
        </div>
      </div>

    </div>
  );
}

Object.assign(window, {
  RouteTabOverview,
  RouteTabRiders,
  RouteTabInterventions,
  RouteTabTimeline,
  RouteTabDataNotes,
  RouteTabSlowSegments,
});
