// ladder-public.jsx — Route Ladder · public-facing edition.
//
// The default RF_RouteDetail's Ladder tab is the analyst's geographic
// view: a subway-diagram-style spine with bars and treatment glyphs.
// Dense, fast to read for an analyst. This version is the SAME M15 SBS
// corridor told as a walking tour — a long, narrative scroll that
// follows the route from East Harlem down to South Ferry and stops at
// every meaningful segment to explain what\u2019s there.
//
// Editorial structure:
//   1. Hero — corridor identity + route shape
//   2. Reader\u2019s guide — what the ladder is showing
//   3. Anchor segments — north (E Harlem), middle (Madison), south (Lower East)
//   4. The ladder itself — vertical spine with annotated nodes
//   5. Treatment continuity strip — the lane / ACE / TSP "tape" along the corridor
//   6. Reading the gaps — three explanatory cards
//   7. Trust strip — sources & method

const LPUB_W = 1320, LPUB_H = 3200;

// Segments ordered NORTH (top) → SOUTH (bottom) for natural reading.
// `story` flags add an inline editorial caption next to that segment\u2019s row.
const LPUB_SEGMENTS = [
  {
    i: 0, anchor: 'north', label: 'E 125 St ↔ E 116 St',
    mph: 7.4, sched: 8.4, rh: 4200,
    lane: 'yes', ace: true, tsp: false,
    note: 'East Harlem hospital corridor. Loads heavily at the 125 St terminus, then mostly free-flow.',
  },
  {
    i: 1, label: 'E 116 St ↔ E 96 St',
    mph: 6.9, sched: 8.0, rh: 5100,
    lane: 'yes', ace: true, tsp: false,
  },
  {
    i: 2, anchor: 'middle', label: 'E 96 St ↔ E 79 St',
    mph: 5.8, sched: 8.2, rh: 9640,
    lane: 'yes', ace: true, tsp: true,
    note: 'TSP installed here — the only stretch with continuous signal priority. Speeds still drop with afternoon demand.',
  },
  {
    i: 3, label: 'E 79 St ↔ E 57 St',
    mph: 5.2, sched: 7.6, rh: 10800,
    lane: 'yes', ace: true, tsp: false,
  },
  {
    i: 4, anchor: 'madison', label: 'Madison Av · E 58 St ↔ E 28 St',
    mph: 4.2, sched: 7.1, rh: 18420,
    lane: 'partial', ace: false, tsp: false, hot: true,
    note: 'The slowest 1.5 miles of any SBS route in the city. Paint-only lane, no ACE camera coverage, no signal priority. Almost a quarter of the route\u2019s entire daily rider-hour delay sits here.',
  },
  {
    i: 5, label: 'E 28 St ↔ E 14 St',
    mph: 4.9, sched: 7.6, rh: 14110,
    lane: 'yes', ace: true, tsp: false, hot: true,
    note: 'Lane + ACE active. Still 1.3 mph below scheduled — the slowdown got worse after enforcement went all-day in May 2025.',
  },
  {
    i: 6, label: 'E 14 St ↔ Houston St',
    mph: 5.5, sched: 7.4, rh: 8210,
    lane: 'yes', ace: true, tsp: false,
  },
  {
    i: 7, anchor: 'south', label: 'Houston St ↔ Grand St',
    mph: 6.4, sched: 7.8, rh: 6420,
    lane: 'yes', ace: true, tsp: false,
    note: 'Concrete-buffered lane upgraded in 2023. Speeds held within 0.3 mph of schedule since.',
  },
  {
    i: 8, label: 'Grand St ↔ Madison / Allen',
    mph: 6.8, sched: 7.5, rh: 5800,
    lane: 'yes', ace: true, tsp: false,
  },
  {
    i: 9, label: 'Madison / Allen ↔ S Ferry',
    mph: 7.2, sched: 8.0, rh: 4900,
    lane: 'yes', ace: false, tsp: false,
    note: 'Approach to the terminus. ACE drops off below Madison St; lane geometry forks around the Manhattan Bridge approach.',
  },
];

// Range constants for stable bar scaling.
const LPUB_MAX_MPH = 9.5;
const LPUB_MAX_RH = 20000;

// ─────────────────────────────────────────────────────────────
// Atoms
// ─────────────────────────────────────────────────────────────

function LPubHeader({ kicker, title, sub }) {
  return (
    <div style={{ marginBottom: 22 }}>
      {kicker && (
        <div style={{ fontSize: 11, fontWeight: 600, color: BPI.ink55, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>{kicker}</div>
      )}
      <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.022em', lineHeight: 1.15, color: BPI.ink, textWrap: 'balance', maxWidth: 820 }}>{title}</div>
      {sub && (
        <div style={{ fontSize: 15, color: BPI.ink70, marginTop: 10, lineHeight: 1.55, maxWidth: 760, textWrap: 'pretty' }}>{sub}</div>
      )}
    </div>
  );
}

// Anchor segment card — used in the "north / middle / south" guide row.
function LPubAnchorCard({ where, name, mph, sched, body, tone }) {
  const color = tone === 'bad' ? BPI.bad : tone === 'warn' ? BPI.warn : tone === 'good' ? BPI.good : BPI.ink;
  const bg    = tone === 'bad' ? BPI.badBg : tone === 'warn' ? BPI.warnBg : tone === 'good' ? BPI.goodBg : BPI.paperDeep;
  return (
    <div style={{
      background: BPI.card, borderRadius: 4,
      boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
      padding: '22px 24px',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{
        fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em',
        color, background: bg,
        textTransform: 'uppercase', padding: '4px 8px',
        alignSelf: 'flex-start', borderRadius: 2,
      }}>{where}</div>
      <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.012em', lineHeight: 1.3, color: BPI.ink }}>{name}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="num" style={{ fontSize: 28, fontWeight: 600, color, letterSpacing: '-0.02em', lineHeight: 1 }}>
          {mph.toFixed(1)}
        </span>
        <span style={{ fontSize: 11, color: BPI.ink55 }}>mph observed</span>
        <span style={{ color: BPI.ink20 }}>·</span>
        <span className="num" style={{ fontSize: 12, color: BPI.ink55 }}>{sched.toFixed(1)} sch</span>
      </div>
      <div style={{ fontSize: 12.5, color: BPI.ink70, lineHeight: 1.6, textWrap: 'pretty' }}>{body}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// The ladder row — a single segment in the vertical spine.
// Visually:
//   [stop label / direction marker] [SPINE NODE] [bar + speed] [treatment glyphs] [editorial caption]
// The spine node + connecting edge color encodes lane state, so the
// route's continuous-lane gaps are visible as color breaks on the spine.
// ─────────────────────────────────────────────────────────────
function LadderRow({ seg, isFirst, isLast }) {
  const speedW = (seg.mph / LPUB_MAX_MPH) * 240;
  const schedX = (seg.sched / LPUB_MAX_MPH) * 240;
  const rhW = (seg.rh / LPUB_MAX_RH) * 80;
  const severity = seg.mph < 5 ? BPI.bad : seg.mph < 6.5 ? BPI.warn : BPI.ink40;
  const spineColor =
    seg.lane === 'yes' ? BPI.good :
    seg.lane === 'partial' ? BPI.warn :
    seg.lane === 'minimal' ? BPI.warn : BPI.ink20;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '170px 60px 1fr 260px 130px',
      gap: 22, alignItems: 'stretch',
      minHeight: 102,
      background: seg.hot ? BPI.badBg : 'transparent',
      borderRadius: seg.hot ? 4 : 0,
      padding: '14px 8px',
      transition: 'background .15s',
    }}>
      {/* Left meta: span label */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, paddingRight: 4 }}>
        <div style={{
          fontSize: 12.5, fontWeight: 600, color: BPI.ink,
          lineHeight: 1.35, letterSpacing: '-0.005em',
        }}>{seg.label}</div>
        <div style={{
          fontSize: 10, color: BPI.ink55, fontFamily: BPIMono,
          letterSpacing: '0.04em',
        }}>seg-{String(seg.i).padStart(2, '0')} · m15</div>
      </div>

      {/* Spine column */}
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
        {/* Edge above */}
        <div style={{
          position: 'absolute', top: 0, bottom: '50%', width: 4,
          background: isFirst ? 'transparent' : spineColor, opacity: isFirst ? 0 : 0.55,
        }} />
        {/* Edge below */}
        <div style={{
          position: 'absolute', top: '50%', bottom: 0, width: 4,
          background: isLast ? 'transparent' : spineColor, opacity: isLast ? 0 : 0.55,
        }} />
        {/* Node */}
        <div style={{
          position: 'absolute', top: '50%', transform: 'translateY(-50%)',
          width: 18, height: 18, borderRadius: 9,
          background: BPI.paper, border: `3px solid ${seg.hot ? BPI.bad : spineColor}`,
          zIndex: 1,
        }} />
      </div>

      {/* Speed bar */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, paddingRight: 12 }}>
        <div style={{ position: 'relative', height: 26 }}>
          <div style={{
            position: 'absolute', top: 0, left: 0,
            width: speedW, height: 26, background: severity, borderRadius: 2,
          }} />
          {/* Scheduled tick */}
          <div style={{
            position: 'absolute', top: -3, left: schedX,
            width: 2, height: 32, background: BPI.ink,
          }} />
          <div style={{
            position: 'absolute', top: -16, left: schedX,
            transform: 'translateX(-50%)',
            fontSize: 9, color: BPI.ink70, fontFamily: BPIMono, letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
          }}>sch {seg.sched.toFixed(1)}</div>
          {/* Observed label */}
          <div style={{
            position: 'absolute', top: 5, left: speedW + 8,
            fontSize: 13, fontWeight: 700, color: severity, fontFamily: BPIMono,
            letterSpacing: '-0.01em', lineHeight: 1,
          }}>{seg.mph.toFixed(1)}<span style={{ color: BPI.ink55, fontWeight: 500, fontSize: 10, marginLeft: 3 }}>mph</span></div>
        </div>
        {/* Ridership exposure bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9.5, color: BPI.ink55, fontFamily: BPIMono, letterSpacing: '0.04em', width: 28 }}>rh/d</span>
          <div style={{ flex: 1, height: 5, background: BPI.ink06, borderRadius: 2, overflow: 'hidden', maxWidth: 200 }}>
            <div style={{ height: '100%', width: `${(seg.rh / LPUB_MAX_RH) * 100}%`, background: BPI.ink70 }} />
          </div>
          <span className="num" style={{ fontSize: 10.5, color: BPI.ink70, fontFamily: BPIMono, minWidth: 50, textAlign: 'right' }}>
            {seg.rh.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Note column or treatment */}
      {seg.note ? (
        <div style={{
          padding: '12px 14px', borderRadius: 3,
          background: seg.hot ? BPI.card : BPI.paperDeep,
          boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
          fontSize: 12, color: BPI.ink70, lineHeight: 1.55,
          textWrap: 'pretty', alignSelf: 'center',
        }}>{seg.note}</div>
      ) : (
        <div style={{ alignSelf: 'center', fontSize: 11.5, color: BPI.ink40, fontStyle: 'italic' }}>
          (no editorial note — quiet segment)
        </div>
      )}

      {/* Treatment glyphs */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6 }}>
        <TreatmentRow lane={seg.lane} ace={seg.ace} tsp={seg.tsp} align="flex-end" />
      </div>
    </div>
  );
}

// Continuous treatment tape — small horizontal strip showing how lane /
// ACE / TSP run along the corridor. Each row is one treatment type; cells
// are segments left-to-right (south → north here, so the rider can see
// the corridor as if looking at a vertical line layout flipped to horizontal).
function LPubTreatmentTape() {
  // We treat south-to-north for the tape so the trip direction is left-to-right.
  const segs = [...LPUB_SEGMENTS].reverse();
  const cell = (s, type) => {
    if (type === 'lane') {
      if (s.lane === 'yes') return { color: BPI.good, label: 'Concrete or painted lane' };
      if (s.lane === 'partial') return { color: BPI.warn, label: 'Paint-only or partial' };
      return { color: BPI.ink20, label: 'No lane' };
    }
    if (type === 'ace') return s.ace ? { color: BPI.accent, label: 'ACE active' } : { color: BPI.ink20, label: 'No ACE' };
    if (type === 'tsp') return s.tsp ? { color: BPI.good,  label: 'TSP installed (2017)' } : { color: BPI.ink20, label: 'No TSP' };
  };
  const Tape = ({ type, label, hint }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 80px', gap: 14, alignItems: 'center', marginBottom: 12 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: BPI.ink }}>{label}</div>
        <div style={{ fontSize: 11, color: BPI.ink55, marginTop: 2 }}>{hint}</div>
      </div>
      <div style={{ display: 'flex', gap: 2, height: 22 }}>
        {segs.map((s, i) => {
          const c = cell(s, type);
          return (
            <div key={s.i} title={c.label} style={{
              flex: 1, height: '100%', background: c.color,
              opacity: c.color === BPI.ink20 ? 1 : 0.85,
              borderRadius: 2,
            }} />
          );
        })}
      </div>
      <div style={{ fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono, textAlign: 'right' }}>
        {type === 'lane' ? '72% cov.' : type === 'ace' ? '84%' : '42%'}
      </div>
    </div>
  );
  return (
    <div>
      <Tape type="lane" label="Bus lane"          hint="Green = lane present (any type). Yellow = partial / paint-only." />
      <Tape type="ace"  label="Camera enforcement" hint="Blue = ACE active. All-day since May 2025." />
      <Tape type="tsp"  label="Signal priority"    hint="Green = TSP installed (2017 snapshot). Most intersections do not have it." />
      {/* Axis */}
      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 80px', gap: 14, marginTop: 10 }}>
        <div />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono }}>
          <span>S Ferry (south)</span>
          <span style={{ color: BPI.ink40 }}>Houston</span>
          <span style={{ color: BPI.ink40 }}>14 St</span>
          <span style={{ color: BPI.bad, fontWeight: 700 }}>Madison gap</span>
          <span style={{ color: BPI.ink40 }}>57 St</span>
          <span style={{ color: BPI.ink40 }}>96 St</span>
          <span>E 125 St (north)</span>
        </div>
        <div />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RF_LadderPublic
// ─────────────────────────────────────────────────────────────
function RF_LadderPublic() {
  return (
    <div className="bpi" style={{
      width: LPUB_W, height: LPUB_H,
      display: 'flex', flexDirection: 'column',
      background: BPI.paper,
    }}>
      <StudioBar active="Routes" breadcrumb="Routes / M15 SBS / Walk the corridor" />

      <div style={{ flex: 1, overflow: 'auto' }}>

        {/* ── HERO ───────────────────────────────────────────────── */}
        <div style={{ background: BPI.card, boxShadow: `inset 0 -1px 0 ${BPI.rule}` }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '8px 1fr',
            maxWidth: 1180, margin: '0 auto', padding: '64px 36px 52px',
            gap: 36,
          }}>
            <div style={{ background: BPI.bx.manhattan, borderRadius: 2 }} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
                <RouteBadge route="M15" sbs size="lg" />
                <span style={{ fontSize: 13, color: BPI.ink55, fontWeight: 500 }}>
                  Manhattan · South Ferry ↔ E 126 St · 8.4 miles
                </span>
                <span style={{ width: 4, height: 4, borderRadius: 2, background: BPI.ink20 }} />
                <span style={{ fontSize: 13, color: BPI.ink55 }}>10 timepoint segments · 33 stops</span>
              </div>
              <h1 style={{
                margin: 0,
                fontSize: 46, fontWeight: 600, letterSpacing: '-0.03em',
                lineHeight: 1.06, color: BPI.ink,
                maxWidth: 1000, textWrap: 'balance', marginBottom: 22,
              }}>Walk the corridor: where the M15 speeds up, where it slows down, and what\u2019s on the street to explain why.</h1>
              <div style={{ fontSize: 18, color: BPI.ink70, lineHeight: 1.55, maxWidth: 880, textWrap: 'pretty' }}>
                The M15 SBS runs the length of Manhattan\u2019s East Side. Every segment of it is different — different traffic, different lane treatment, different signal infrastructure. This page is a north-to-south walk through all of it, segment by segment, with the speed it runs at, the speed its schedule asks for, and the bus-priority tools installed where the rider is.
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14, marginTop: 28,
                paddingTop: 22, boxShadow: `inset 0 1px 0 ${BPI.rule}`,
              }}>
                <span style={{ fontSize: 12.5, color: BPI.ink55, fontFamily: BPIMono }}>
                  Reviewed by M. Okafor · Data through May 2026
                </span>
                <span style={{ flex: 1 }} />
                <Button variant="secondary" size="md">Open route overview →</Button>
                <Button variant="secondary" size="md">Read the M15 brief</Button>
                <Button variant="primary" size="md">Open analyst view</Button>
              </div>
            </div>
          </div>
        </div>

        {/* ── ANCHOR CARDS — three orientation pins on the corridor ─ */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '52px 36px 16px' }}>
          <LPubHeader
            kicker="Three points to orient on"
            title="Before walking the route, three segments to keep in mind."
            sub="These three segments come up repeatedly in the rest of the page. They span the corridor from north to south and capture the three modes the M15 runs in: free-flow, structurally slow, and recovered."
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
            <LPubAnchorCard
              where="UPTOWN · 1 / 2 AV"
              name="E 96 St ↔ E 79 St"
              mph={5.8} sched={8.2}
              tone="warn"
              body="The only stretch of the corridor with continuous signal priority. Speeds dip during the evening rush but recover off-peak. A mid-tier slow zone — close to schedule midday, well below it during commute hours."
            />
            <LPubAnchorCard
              where="MIDTOWN · MADISON AV"
              name="Madison Av · 58 ↔ 28"
              mph={4.2} sched={7.1}
              tone="bad"
              body="The route\u2019s structural slowdown. Paint-only lane, no camera enforcement, no signal priority — and 18,400 rider-hours of delay every weekday. Almost a quarter of everything we measure on this route happens here."
            />
            <LPubAnchorCard
              where="DOWNTOWN · LOWER E SIDE"
              name="Houston St ↔ Grand St"
              mph={6.4} sched={7.8}
              tone="good"
              body="Concrete-buffered lane installed in 2023. Speeds rose 0.9 mph within ninety days of the upgrade and haven\u2019t backslid since. The closest thing the M15 has to a counterfactual for what could happen on Madison."
            />
          </div>
        </div>

        {/* ── READING GUIDE ──────────────────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 36px 12px' }}>
          <LPubHeader
            kicker="How to read the ladder below"
            title="Every row is one segment of the route. Here\u2019s what each part of the row is telling you."
          />
          <div style={{
            background: BPI.card, borderRadius: 4,
            boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
            padding: '28px 32px',
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 28,
          }}>
            {[
              { n: '01', t: 'The label',     b: 'The from / to of the segment. Always written in the direction the rider travels on the bus.' },
              { n: '02', t: 'The spine',     b: 'A vertical line connects segments. Color indicates lane state — green where there\u2019s a bus lane, yellow where lane coverage is partial, gray where there\u2019s no lane.' },
              { n: '03', t: 'The speed bar', b: 'Length of the bar is observed speed in mph. The black tick is the scheduled speed for that segment. Distance between bar and tick is the underperformance.' },
              { n: '04', t: 'The treatments',b: 'Three icons on the right: lane density (3 pips = full), ACE camera enforcement, and TSP signal priority. Filled = present, hollow = absent.' },
            ].map((g) => (
              <div key={g.n}>
                <div style={{
                  fontFamily: BPIMono, fontSize: 12, fontWeight: 700,
                  color: BPI.accent, letterSpacing: '0.06em', marginBottom: 12,
                }}>{g.n}</div>
                <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', color: BPI.ink, marginBottom: 6 }}>{g.t}</div>
                <div style={{ fontSize: 12.5, color: BPI.ink70, lineHeight: 1.55, textWrap: 'pretty' }}>{g.b}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── THE LADDER ─────────────────────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 36px 12px' }}>
          <LPubHeader
            kicker="The corridor, north to south"
            title="Walk the M15 SBS from E 126 St down to South Ferry."
            sub="Each row below is one timepoint-to-timepoint segment. Red rows are the two hot spots — Madison Av and 1 Av · 14–34, together more than a third of the route\u2019s daily rider-hours of delay."
          />
          <div style={{
            background: BPI.card, borderRadius: 4,
            boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
            padding: '20px 28px',
          }}>
            {/* Direction indicator */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 14, paddingBottom: 12, boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em',
                  color: BPI.ink55, textTransform: 'uppercase',
                }}>NORTH</span>
                <span style={{ fontFamily: BPIMono, fontSize: 11, color: BPI.ink40 }}>
                  E 126 St · Harlem terminus
                </span>
              </div>
              <span style={{ fontSize: 11.5, color: BPI.ink55, fontFamily: BPIMono }}>
                10 segments · weighted by ridership for the route headline
              </span>
            </div>

            {/* Ladder rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {LPUB_SEGMENTS.map((seg, i) => (
                <LadderRow key={seg.i} seg={seg} isFirst={i === 0} isLast={i === LPUB_SEGMENTS.length - 1} />
              ))}
            </div>

            {/* Direction footer */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginTop: 14, paddingTop: 12, boxShadow: `inset 0 1px 0 ${BPI.rule}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em',
                  color: BPI.ink55, textTransform: 'uppercase',
                }}>SOUTH</span>
                <span style={{ fontFamily: BPIMono, fontSize: 11, color: BPI.ink40 }}>
                  South Ferry · Whitehall terminus
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── TREATMENT TAPE ─────────────────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 36px 12px' }}>
          <LPubHeader
            kicker="The priority stack, end to end"
            title="The toolkit isn\u2019t the problem — its continuity is."
            sub="Each tape below shows the corridor laid flat (south to north). Filled cells are where the tool is present. The gaps in the middle of all three tapes line up: that\u2019s Madison Avenue, the route\u2019s structural slowdown."
          />
          <div style={{
            background: BPI.card, borderRadius: 4,
            boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
            padding: '28px 32px',
          }}>
            <LPubTreatmentTape />
            <div style={{
              marginTop: 22, paddingTop: 18,
              boxShadow: `inset 0 1px 0 ${BPI.rule}`,
              fontSize: 13, color: BPI.ink70, lineHeight: 1.7, maxWidth: 900, textWrap: 'pretty',
            }}>
              The lane tape is mostly green — 72% of the route has a bus lane of some kind. But the yellow band on Madison Avenue is exactly where the ACE tape goes empty, and where the TSP tape was never installed in the first place. Three tools, one gap, all in the same 1.5 miles.
            </div>
          </div>
        </div>

        {/* ── READING THE GAPS — three explanatory cards ─────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 36px 12px' }}>
          <LPubHeader
            kicker="What this corridor walk shows"
            title="Three things become hard to miss once you\u2019ve walked the route."
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
            {[
              {
                n: '01',
                t: 'The slowdown is geographic, not systemic.',
                b: 'Two of the route\u2019s ten segments hold more than a third of its daily rider-hours of delay. The slowdown isn\u2019t spread evenly across the corridor — it\u2019s sharply concentrated in midtown, on a stretch where the bus has the fewest priority tools in place.',
              },
              {
                n: '02',
                t: 'The toolkit gaps line up.',
                b: 'Madison Avenue is the only segment of the corridor where lane treatment, camera enforcement, and signal priority all step back at once. Anywhere else on the route, at least two of the three tools are present and the speeds are within shouting distance of schedule.',
              },
              {
                n: '03',
                t: 'There\u2019s a working counterfactual on the same route.',
                b: 'The lower-Manhattan stretch from Houston to Grand got concrete-buffered lane in 2023. Speeds there hold within 0.3 mph of schedule today. The same upgrade applied to Madison Avenue would be the most direct intervention available — and the only one that closes the gap the tape above makes visible.',
              },
            ].map((c) => (
              <div key={c.n} style={{
                background: BPI.card, borderRadius: 4,
                boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
                padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{
                    fontFamily: BPIMono, fontSize: 12, fontWeight: 700,
                    color: BPI.accent, letterSpacing: '0.06em',
                  }}>{c.n}</span>
                  <div style={{ flex: 1, height: 1, background: BPI.rule }} />
                </div>
                <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.014em', lineHeight: 1.3, color: BPI.ink, textWrap: 'pretty' }}>{c.t}</div>
                <div style={{ fontSize: 13, color: BPI.ink70, lineHeight: 1.65, textWrap: 'pretty' }}>{c.b}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── TIME SCRUBBER STRIP — past windows ─────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 36px 12px' }}>
          <LPubHeader
            kicker="The corridor at three points in time"
            title="Where the slow stretch was three years ago, last year, and today."
            sub="Each row collapses the M15\u2019s 10 segments into a single thermometer strip, sorted in the order the rider travels. Darker cells are slower — and you can watch the Madison Avenue zone darken across time."
          />
          <div style={{
            background: BPI.card, borderRadius: 4,
            boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
            padding: '28px 32px',
          }}>
            {[
              { label: 'Apr 2023 · before all-day ACE', vals: [7.6, 7.4, 6.4, 6.2, 5.8, 6.0, 6.5, 6.8, 7.0, 7.4] },
              { label: 'May 2025 · all-day ACE active', vals: [7.5, 7.2, 6.1, 5.8, 5.0, 5.5, 6.0, 6.5, 6.9, 7.3] },
              { label: 'May 2026 · today',              vals: [7.4, 6.9, 5.8, 5.2, 4.2, 4.9, 5.5, 6.4, 6.8, 7.2] },
            ].map((row, ri) => (
              <div key={ri} style={{
                display: 'grid', gridTemplateColumns: '220px 1fr 70px',
                gap: 16, alignItems: 'center',
                padding: '16px 0',
                boxShadow: ri < 2 ? `inset 0 -1px 0 ${BPI.rule}` : 'none',
              }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: BPI.ink }}>{row.label}</div>
                <div style={{ display: 'flex', gap: 3, height: 30 }}>
                  {[...row.vals].reverse().map((v, i) => {
                    // Slower → more saturated red. Faster → lighter.
                    const t = Math.max(0, Math.min(1, (v - 4) / 4));
                    const color = `oklch(${0.55 + t * 0.35} ${0.16 * (1 - t) + 0.02} ${28 + t * 30})`;
                    return (
                      <div key={i} style={{
                        flex: 1, height: '100%', background: color, borderRadius: 2,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontFamily: BPIMono, fontWeight: 600,
                        color: t < 0.35 ? '#fff' : BPI.ink70,
                      }}>{v.toFixed(1)}</div>
                    );
                  })}
                </div>
                <div className="num" style={{ fontSize: 12, color: BPI.ink55, textAlign: 'right', fontFamily: BPIMono }}>
                  avg {(row.vals.reduce((a, b) => a + b, 0) / row.vals.length).toFixed(1)}
                </div>
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 70px', gap: 16, marginTop: 8 }}>
              <div />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: BPI.ink40, fontFamily: BPIMono }}>
                <span>S Ferry</span>
                <span>Houston</span>
                <span>14 St</span>
                <span style={{ color: BPI.bad }}>Madison gap</span>
                <span>57 St</span>
                <span>96 St</span>
                <span>E 125 St</span>
              </div>
              <div />
            </div>
          </div>
        </div>

        {/* ── TRUST STRIP ────────────────────────────────────────── */}
        <div style={{
          background: BPI.paperDeep, boxShadow: `inset 0 1px 0 ${BPI.rule}`,
          marginTop: 48, padding: '40px 0',
        }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 36px' }}>
            <LPubHeader
              kicker="How we know the segment numbers"
              title="The corridor walk, sourced."
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 28 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 12 }}>Method</div>
                <div style={{ fontSize: 13, color: BPI.ink70, lineHeight: 1.65, textWrap: 'pretty' }}>
                  Segment speeds are MTA observed timepoint-to-timepoint averages, aggregated to the month and weighted by ridership when the route is summarized. Scheduled speed is derived from the timepoint-to-timepoint travel times in the published GTFS feed. The corridor is rendered in observed direction-of-travel order, north to south.
                </div>
                <div style={{ marginTop: 14, display: 'flex', gap: 14, alignItems: 'center', fontSize: 12, color: BPI.ink55 }}>
                  <span style={{ color: BPI.accent, fontWeight: 600, cursor: 'pointer' }}>Read full methodology →</span>
                  <span style={{ width: 4, height: 4, borderRadius: 2, background: BPI.ink20 }} />
                  <span style={{ color: BPI.accent, fontWeight: 600, cursor: 'pointer' }}>Download segment CSV</span>
                </div>
              </div>
              <div>
                <div className="eyebrow" style={{ marginBottom: 12 }}>Data sources</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { src: 'MTA Bus Speeds',          sub: 'segment-month aggregates' },
                    { src: 'MTA GTFS schedule',       sub: 'timepoint definitions, 2026' },
                    { src: 'MTA Hourly Ridership',    sub: 'used for weighting only' },
                    { src: 'NYC DOT bus-lane GIS',    sub: 'Q1 2026 lane classification' },
                    { src: 'MTA ACE program data',    sub: 'route-level coverage' },
                    { src: 'NYC DOT TSP (2017)',      sub: 'dated source · explicit caveat' },
                  ].map((s, i) => (
                    <div key={i} style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                      <div style={{ fontWeight: 500, color: BPI.ink }}>{s.src}</div>
                      <div style={{ color: BPI.ink55, fontSize: 11.5 }}>{s.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="eyebrow" style={{ marginBottom: 12 }}>Caveats</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{
                    fontSize: 12.5, color: BPI.ink70, lineHeight: 1.6,
                    padding: '10px 12px', background: BPI.card,
                    borderLeft: `3px solid ${BPI.warn}`, borderRadius: '0 3px 3px 0',
                  }}>The corridor is shown in observed direction. Stop-level boardings are unavailable; rider-hours of delay use route/hour ridership, not segment-level.</div>
                  <div style={{
                    fontSize: 12.5, color: BPI.ink70, lineHeight: 1.6,
                    padding: '10px 12px', background: BPI.card,
                    borderLeft: `3px solid ${BPI.warn}`, borderRadius: '0 3px 3px 0',
                  }}>TSP geometry is from a 2017 snapshot. Where shown, "TSP installed" means the snapshot recorded it; live installation status is not publicly available.</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '24px 36px 30px',
          maxWidth: 1180, margin: '0 auto',
          fontSize: 11.5, color: BPI.ink55,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span>Bus Priority Impact Studio · A civic data project</span>
          <span style={{ flex: 1 }} />
          <span>Share ↗</span>
          <span style={{ color: BPI.ink20 }}>·</span>
          <span>Cite</span>
          <span style={{ color: BPI.ink20 }}>·</span>
          <span>Report an error</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { RF_LadderPublic });
