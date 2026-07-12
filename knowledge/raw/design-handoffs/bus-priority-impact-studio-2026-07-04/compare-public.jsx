// compare-public.jsx — Compare · public-facing edition.
//
// The default RF_Compare is the analyst's stress-test view: paired KPI
// strips, dense segment tables, intervention timelines on each side. This
// version is the same M15-vs-Bx12 material rewritten as a public-facing
// story — a side-by-side editorial argument that asks "what does the data
// look like when one corridor recovered and the other didn't?"
//
// Editorial structure mirrors the other public pages (home-public,
// route-public, finding-detail-audit) so they read as siblings.

const CPUB_W = 1320, CPUB_H = 2520;

// ─────────────────────────────────────────────────────────────
// Atoms — local; sized for the dual-column rhythm.
// ─────────────────────────────────────────────────────────────

function CPubHeader({ kicker, title, sub }) {
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

// Compact stat — labeled value, used in the dual-column stat strip.
function CPubStat({ value, unit, label, tone }) {
  const color = tone === 'bad' ? BPI.bad : tone === 'good' ? BPI.good : tone === 'warn' ? BPI.warn : BPI.ink;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, lineHeight: 1 }}>
        <span className="num" style={{ fontSize: 36, fontWeight: 600, letterSpacing: '-0.025em', color }}>{value}</span>
        {unit && (<span style={{ fontSize: 13, color: BPI.ink55, letterSpacing: '-0.005em' }}>{unit}</span>)}
      </div>
      <div style={{ fontSize: 11.5, color: BPI.ink55, marginTop: 8, letterSpacing: '0.04em', fontWeight: 500, textTransform: 'uppercase' }}>{label}</div>
    </div>
  );
}

// Side card — the master container for each route's column. Borough stripe + content.
function CPubSide({ borColor, badge, name, span, deck, role, children }) {
  return (
    <div style={{
      background: BPI.card, borderRadius: 4,
      boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
      display: 'grid', gridTemplateColumns: '6px 1fr',
      overflow: 'hidden',
    }}>
      <div style={{ background: borColor }} />
      <div style={{ padding: '28px 30px 26px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <RouteBadge route={badge.route} sbs={badge.sbs} size="md" />
          <span style={{
            fontFamily: BPIMono, fontSize: 10, fontWeight: 700,
            color: role === 'subject' ? BPI.bad : BPI.good,
            background: role === 'subject' ? BPI.badBg : BPI.goodBg,
            padding: '3px 8px', borderRadius: 2, letterSpacing: '0.08em',
          }}>{role === 'subject' ? 'THE OUTLIER' : 'THE COUNTER-EXAMPLE'}</span>
        </div>
        <div>
          <div style={{ fontSize: 21, fontWeight: 600, letterSpacing: '-0.018em', lineHeight: 1.2, color: BPI.ink, marginBottom: 4 }}>{name}</div>
          <div style={{ fontSize: 12.5, color: BPI.ink55 }}>{span}</div>
        </div>
        <div style={{ fontSize: 13.5, color: BPI.ink70, lineHeight: 1.6, textWrap: 'pretty' }}>{deck}</div>
        {children}
      </div>
    </div>
  );
}

// Year-band timeline — horizontal scale from 2010 → 2026 with dots for events.
// Used for the intervention-rhythm comparison. Both timelines share an axis
// so the eye can see when each corridor got each tool.
function CPubTimeline({ events, accent, yearMin = 2010, yearMax = 2026, width = 520, height = 70 }) {
  const padL = 8, padR = 8, padT = 8, padB = 24;
  const yMid = (height - padB + padT) / 2 + 4;
  const xv = (yr, m = 0) => padL + ((yr - yearMin) + m / 12) / (yearMax - yearMin) * (width - padL - padR);
  const yearTicks = [];
  for (let y = yearMin; y <= yearMax; y += 4) yearTicks.push(y);
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {/* Baseline */}
      <line x1={padL} x2={width - padR} y1={yMid} y2={yMid} stroke={BPI.rule} strokeWidth="1" />
      {/* Year ticks */}
      {yearTicks.map((y) => (
        <g key={y}>
          <line x1={xv(y)} x2={xv(y)} y1={yMid - 3} y2={yMid + 3} stroke={BPI.ink20} />
          <text x={xv(y)} y={height - 8} fontSize="9.5" textAnchor="middle" fill={BPI.ink55} fontFamily={BPIMono}>{y}</text>
        </g>
      ))}
      {/* Events */}
      {events.map((e, i) => {
        const cx = xv(e.yr, e.m || 0);
        const above = i % 2 === 0;
        const cy = above ? yMid - 16 : yMid + 16;
        const ty = above ? yMid - 22 : yMid + 26;
        return (
          <g key={i}>
            <line x1={cx} x2={cx} y1={yMid} y2={cy} stroke={accent || BPI.accent} strokeWidth="1" opacity="0.7" />
            <circle cx={cx} cy={cy} r="3.5" fill={accent || BPI.accent} />
            <text x={cx} y={ty} fontSize="9.5" textAnchor="middle" fill={BPI.ink70} fontFamily={BPIFonts} fontWeight="600">{e.t}</text>
          </g>
        );
      })}
    </svg>
  );
}

// Twin trend lines — both routes' 14-month evening-rush speed on one chart.
// The shared chart is the visual centerpiece of this page.
function CPubTwinChart({ width = 1040, height = 320 }) {
  const labels = ['Apr 25', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan 26', 'Feb', 'Mar', 'Apr', 'May'];
  const m15  = [7.9, 7.7, 7.6, 7.4, 7.1, 6.9, 6.8, 6.7, 6.8, 6.9, 6.8, 6.6, 6.4, 6.3];
  const bx12 = [8.5, 8.5, 8.4, 8.3, 8.3, 8.2, 8.4, 8.5, 8.5, 8.5, 8.6, 8.6, 8.6, 8.7];
  const padL = 56, padR = 28, padT = 44, padB = 56;
  const n = labels.length;
  const cw = (width - padL - padR) / (n - 1);
  const lo = 5.8, hi = 9.2;
  const yv = (v) => padT + (1 - (v - lo) / (hi - lo)) * (height - padT - padB);
  const mkPath = (data) => data.map((v, i) => (i ? 'L' : 'M') + (padL + i * cw).toFixed(1) + ',' + yv(v).toFixed(1)).join(' ');
  const mkArea = (data) => mkPath(data) + ` L${(padL + (n - 1) * cw).toFixed(1)},${height - padB} L${padL},${height - padB} Z`;
  const yticks = [6.0, 7.0, 8.0, 9.0];
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {/* Gridlines */}
      {yticks.map((v) => (
        <g key={v}>
          <line x1={padL} x2={width - padR} y1={yv(v)} y2={yv(v)} stroke={BPI.rule} />
          <text x={padL - 8} y={yv(v) + 3} fontSize="10.5" textAnchor="end" fill={BPI.ink55} fontFamily={BPIMono}>{v.toFixed(1)}</text>
        </g>
      ))}
      {/* y-axis title */}
      <text x={padL - 38} y={(padT + height - padB) / 2} fontSize="9.5" fill={BPI.ink40} fontFamily={BPIMono} transform={`rotate(-90, ${padL - 38}, ${(padT + height - padB) / 2})`} textAnchor="middle">mph · PM rush</text>

      {/* Event annotation */}
      {(() => {
        const idx = 7; // Nov / ACE all-day window roughly
        const cx = padL + idx * cw;
        return (
          <g>
            <line x1={cx} x2={cx} y1={padT} y2={height - padB} stroke={BPI.accent} strokeDasharray="3 3" strokeWidth="1" opacity="0.6" />
            <text x={cx + 6} y={padT + 14} fontSize="11" fill={BPI.accent} fontFamily={BPIFonts} fontWeight="600">M15 enters all-day ACE</text>
          </g>
        );
      })()}

      {/* Areas */}
      <path d={mkArea(m15)} fill={BPI.bad} opacity="0.07" />
      <path d={mkArea(bx12)} fill={BPI.good} opacity="0.07" />

      {/* Lines */}
      <path d={mkPath(m15)} fill="none" stroke={BPI.bad} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d={mkPath(bx12)} fill="none" stroke={BPI.good} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />

      {/* End markers + labels */}
      <circle cx={padL + (n - 1) * cw} cy={yv(m15[n - 1])} r="4.5" fill={BPI.bad} />
      <text x={padL + (n - 1) * cw - 10} y={yv(m15[n - 1]) + 6} fontSize="13" fontWeight="700" fill={BPI.bad} fontFamily={BPIMono} textAnchor="end">6.3 · M15</text>

      <circle cx={padL + (n - 1) * cw} cy={yv(bx12[n - 1])} r="4.5" fill={BPI.good} />
      <text x={padL + (n - 1) * cw - 10} y={yv(bx12[n - 1]) - 8} fontSize="13" fontWeight="700" fill={BPI.good} fontFamily={BPIMono} textAnchor="end">8.7 · Bx12</text>

      {/* X labels */}
      {labels.map((l, i) => i % 2 === 0 && (
        <text key={i} x={padL + i * cw} y={height - padB + 18} fontSize="10.5" textAnchor="middle" fill={BPI.ink55} fontFamily={BPIMono}>{l}</text>
      ))}
    </svg>
  );
}

// Stacked-bar — coverage strip; used to compare treatment density.
function CPubCoverageStrip({ values, color, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 11, color: BPI.ink55, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
        <span className="num" style={{ fontSize: 12.5, fontWeight: 600, color: BPI.ink, letterSpacing: '-0.01em' }}>{values[0]}% <span style={{ color: BPI.ink40 }}>/</span> {values[1]}%</span>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <div style={{ flex: 1, height: 7, background: BPI.ink06, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${values[0]}%`, background: BPI.bad, opacity: 0.78 }} />
        </div>
        <div style={{ flex: 1, height: 7, background: BPI.ink06, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${values[1]}%`, background: BPI.good, opacity: 0.78 }} />
        </div>
      </div>
    </div>
  );
}

// Segment-rank dot row — visualizes the top-5 slow segments per route.
function CPubSegRow({ rank, name, mph, sched, rh, accent }) {
  const gap = sched - mph;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '22px 1fr 70px 80px',
      gap: 10, alignItems: 'baseline',
      padding: '10px 0',
      boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
    }}>
      <span className="num" style={{
        fontSize: 10.5, fontFamily: BPIMono, fontWeight: 700, color: accent || BPI.bad,
        letterSpacing: '0.04em',
      }}>0{rank}</span>
      <span style={{ fontSize: 12, fontWeight: 500, color: BPI.ink }}>{name}</span>
      <span className="num" style={{ fontSize: 13, fontWeight: 600, color: BPI.bad, textAlign: 'right' }}>
        {mph.toFixed(1)}<span style={{ color: BPI.ink55, fontSize: 10, fontWeight: 400 }}> / {sched.toFixed(1)}</span>
      </span>
      <span className="num" style={{ fontSize: 11, color: BPI.ink70, textAlign: 'right' }}>
        {(rh / 1000).toFixed(1)}K rh
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RF_ComparePublic
// ─────────────────────────────────────────────────────────────
function RF_ComparePublic() {
  return (
    <div className="bpi" style={{
      width: CPUB_W, height: CPUB_H,
      display: 'flex', flexDirection: 'column',
      background: BPI.paper,
    }}>
      <StudioBar active="Routes" breadcrumb="Routes / Compare · M15 SBS ↔ Bx12 SBS" />

      <div style={{ flex: 1, overflow: 'auto' }}>

        {/* ── HERO ───────────────────────────────────────────────── */}
        <div style={{ background: BPI.card, boxShadow: `inset 0 -1px 0 ${BPI.rule}` }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '64px 36px 48px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: BPI.accent, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 18 }}>
              A comparison · Manhattan ↔ Bronx
            </div>
            <h1 style={{
              margin: 0,
              fontSize: 48, fontWeight: 600, letterSpacing: '-0.03em',
              lineHeight: 1.05, color: BPI.ink,
              maxWidth: 1000, textWrap: 'balance', marginBottom: 22,
            }}>
              Same toolkit. Same rider counts. One corridor got faster, the other did not.
            </h1>
            <div style={{ fontSize: 18, color: BPI.ink70, lineHeight: 1.55, maxWidth: 880, textWrap: 'pretty' }}>
              The M15 SBS and the Bx12 SBS are two of the busiest Select Bus routes in New York. Both carry around forty thousand riders a day. Both received the same set of priority treatments — bus lanes, all-day camera enforcement, signal priority — within months of each other. Three years later, the Bx12 is half a mile per hour faster than its own schedule. The M15 is half a mile per hour slower. This is a comparison of what happened in between.
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 18, marginTop: 28,
              paddingTop: 22, boxShadow: `inset 0 1px 0 ${BPI.rule}`,
            }}>
              <span style={{ fontSize: 12.5, color: BPI.ink55, fontFamily: BPIMono }}>
                Reviewed by M. Okafor · Published May 12, 2026 · 8 min read
              </span>
              <span style={{ flex: 1 }} />
              <Button variant="secondary" size="md">Pick a different route to compare ↻</Button>
              <Button variant="primary" size="md">Open analyst view</Button>
            </div>
          </div>
        </div>

        {/* ── THE TWO ROUTES ─────────────────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 36px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

            {/* M15 — subject */}
            <CPubSide
              borColor={BPI.bx.manhattan}
              badge={{ route: 'M15', sbs: true }}
              name="1st Avenue / 2nd Avenue"
              span="Manhattan · South Ferry ↔ East 126 St · 8.4 mi"
              deck="A fully-equipped corridor that has lost ground every quarter since mid-2024. The route\u2019s southern half — particularly Madison Avenue — is the slowest 1.5 miles of any SBS in the city."
              role="subject"
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginTop: 6 }}>
                <CPubStat value="6.3"  unit="mph"  label="Current PM speed"   tone="bad" />
                <CPubStat value="−1.6" unit="mph"  label="Δ vs. 14 mo ago"   tone="bad" />
                <CPubStat value="42.1" unit="K/d"  label="Riders / day"      />
                <CPubStat value="4,310" unit="rh/d" label="Lost weekday hours" tone="warn" />
              </div>
            </CPubSide>

            {/* Bx12 — counter-example */}
            <CPubSide
              borColor={BPI.bx.bronx}
              badge={{ route: 'Bx12', sbs: true }}
              name="Fordham Rd / Pelham Pkwy"
              span="Bronx · Inwood ↔ Pelham Bay Park · 7.9 mi"
              deck="The closest thing the city has to a controlled experiment in the bus-priority stack. Concrete lanes, all-day ACE, TSP at every major intersection — and three years of speed gains that have held."
              role="control"
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginTop: 6 }}>
                <CPubStat value="8.7"  unit="mph"  label="Current PM speed"   tone="good" />
                <CPubStat value="+0.4" unit="mph"  label="Δ vs. 14 mo ago"   tone="good" />
                <CPubStat value="41.0" unit="K/d"  label="Riders / day"      />
                <CPubStat value="1,850" unit="rh/d" label="Lost weekday hours" />
              </div>
            </CPubSide>
          </div>
        </div>

        {/* ── SHARED TREND CHART ─────────────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 36px 20px' }}>
          <CPubHeader
            kicker="The shape of the divergence"
            title="The two routes were close. Then one turned, and the other did not."
            sub="Evening-rush weighted speed by month. Both lines start from approximately the same place — both routes had bus lanes and limited enforcement in spring 2025. What followed is the difference."
          />
          <div style={{
            background: BPI.card, padding: '28px 32px',
            boxShadow: `inset 0 0 0 1px ${BPI.rule}`, borderRadius: 4,
          }}>
            <CPubTwinChart width={1108} height={320} />
            <div style={{
              marginTop: 16, paddingTop: 14,
              boxShadow: `inset 0 1px 0 ${BPI.rule}`,
              display: 'flex', gap: 28, fontSize: 13, color: BPI.ink70, lineHeight: 1.6,
            }}>
              <div style={{ flex: 1, maxWidth: 540 }}>
                The Bx12 enters its third year of post-treatment plateau in spring 2026 — about half a mile per hour above the SBS network median and consistently above its own scheduled timepoints.
              </div>
              <div style={{ width: 1, background: BPI.rule }} />
              <div style={{ flex: 1, maxWidth: 540 }}>
                The M15 holds steady through the first months of all-day enforcement, then resumes the downward trajectory it had before. The intervention slowed the slowdown, but did not reverse it.
              </div>
            </div>
          </div>
        </div>

        {/* ── COVERAGE COMPARISON ────────────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 36px 20px' }}>
          <CPubHeader
            kicker="What\u2019s on each corridor"
            title="The toolkit, side by side."
            sub="Bars show the share of each route covered by each priority treatment. Red is the M15; green is the Bx12. The two are close to even on ACE coverage and not far apart on bus-lane share — the gap is in lane type, signal priority, and how continuously each tool runs along the corridor."
          />
          <div style={{
            background: BPI.card, borderRadius: 4,
            boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
            padding: '28px 32px',
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <CPubCoverageStrip label="Bus lane (any type)"          values={[72, 94]} />
              <CPubCoverageStrip label="Concrete-buffered (subset)"   values={[18, 81]} />
              <CPubCoverageStrip label="ACE camera enforcement"       values={[84, 100]} />
              <CPubCoverageStrip label="Signal priority (TSP)"        values={[42, 76]} />
              <div style={{
                marginTop: 12, paddingTop: 14,
                boxShadow: `inset 0 1px 0 ${BPI.rule}`,
                fontSize: 12, color: BPI.ink55, fontFamily: BPIMono, lineHeight: 1.5,
              }}>
                M15 % · Bx12 %
              </div>
            </div>

            <div style={{ fontSize: 14, color: BPI.ink70, lineHeight: 1.7, textWrap: 'pretty' }}>
              The M15 is well-equipped by any external measure — almost three-quarters of its mileage is laned, four-fifths is camera-enforced, and roughly half its intersections have signal priority. On paper the toolkit is dense.
              <br /><br />
              The Bx12\u2019s difference is that <b style={{ color: BPI.ink }}>almost all of its lane is concrete-buffered</b>, that ACE coverage is continuous (no gaps), and that TSP rides on every intersection across the busiest stretch. The toolkit is not just denser — it runs together.
              <br /><br />
              Continuity is its own variable. The M15\u2019s painted lane on Madison Av and the gap in its TSP between 28th and 60th Street are where its biggest losses sit.
            </div>
          </div>
        </div>

        {/* ── WORST SEGMENTS ─────────────────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 36px 20px' }}>
          <CPubHeader
            kicker="Where the rider feels it"
            title="The five slowest segments on each route."
            sub="Sorted by rider-hours of delay per weekday. Speed shown as observed / scheduled. The M15\u2019s worst segments fall short of schedule by 2–3 mph; the Bx12\u2019s worst still meet or beat what its schedule asks for."
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

            {/* M15 segments */}
            <div style={{ background: BPI.card, borderRadius: 4, boxShadow: `inset 0 0 0 1px ${BPI.rule}`, padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <RouteBadge route="M15" sbs size="sm" />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Top-5 slowdowns on the M15</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono, letterSpacing: '0.04em' }}>mph obs / sch · rh/day</span>
              </div>
              <CPubSegRow rank={1} name="Madison Av · 28→58" mph={4.2} sched={7.1} rh={18420} />
              <CPubSegRow rank={2} name="1 Av · 14→34"        mph={4.9} sched={7.6} rh={14110} />
              <CPubSegRow rank={3} name="2 Av · 60→42"        mph={5.2} sched={7.8} rh={12880} />
              <CPubSegRow rank={4} name="1 Av · 86→96"        mph={5.8} sched={7.5} rh={ 9640} />
              <CPubSegRow rank={5} name="2 Av · 23→14"        mph={6.1} sched={7.4} rh={ 8210} />
              <div style={{
                marginTop: 14, padding: '10px 12px',
                background: BPI.badBg, color: BPI.bad,
                fontSize: 12, fontWeight: 500, lineHeight: 1.5,
                borderLeft: `3px solid ${BPI.bad}`, borderRadius: '0 3px 3px 0',
              }}>
                Top 5 segments together: <b className="num">63,260 rh/day</b> of delay — about 78% of the route\u2019s total.
              </div>
            </div>

            {/* Bx12 segments */}
            <div style={{ background: BPI.card, borderRadius: 4, boxShadow: `inset 0 0 0 1px ${BPI.rule}`, padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <RouteBadge route="Bx12" sbs size="sm" />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Top-5 slowdowns on the Bx12</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono, letterSpacing: '0.04em' }}>mph obs / sch · rh/day</span>
              </div>
              <CPubSegRow rank={1} name="Fordham · GC↔Webster" mph={5.4} sched={6.8} rh={11820} accent={BPI.warn} />
              <CPubSegRow rank={2} name="Fordham · 3 Av↔Park"  mph={6.3} sched={7.2} rh={ 9210} accent={BPI.warn} />
              <CPubSegRow rank={3} name="Pelham · East→Bxdale" mph={6.7} sched={7.6} rh={ 8420} accent={BPI.warn} />
              <CPubSegRow rank={4} name="Pelham · Westch→East" mph={7.2} sched={7.4} rh={ 7100} accent={BPI.warn} />
              <CPubSegRow rank={5} name="Fordham · Bx P↔3 Av"  mph={7.5} sched={7.4} rh={ 6210} accent={BPI.good} />
              <div style={{
                marginTop: 14, padding: '10px 12px',
                background: BPI.goodBg, color: BPI.good,
                fontSize: 12, fontWeight: 500, lineHeight: 1.5,
                borderLeft: `3px solid ${BPI.good}`, borderRadius: '0 3px 3px 0',
              }}>
                Top 5 segments together: <b className="num">42,760 rh/day</b> — the route\u2019s worst hot spot is still better than the M15\u2019s typical hour.
              </div>
            </div>
          </div>
        </div>

        {/* ── INTERVENTION TIMELINES — shared axis ───────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 36px 20px' }}>
          <CPubHeader
            kicker="The road to here"
            title="What each corridor has had done to it, on the same axis."
            sub="Both routes received Select Bus designation in the early 2010s and a comparable enforcement program rollout in the 2019–2020 window. Where they diverge is in lane upgrades: the Bx12 got concrete-buffered lanes in 2022, the M15 got partial paint-to-concrete upgrades in 2023 — but only below 23rd Street."
          />
          <div style={{
            background: BPI.card, borderRadius: 4,
            boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
            padding: '24px 28px',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', alignItems: 'center', gap: 18, marginBottom: 24 }}>
              <RouteBadge route="M15" sbs size="md" />
              <CPubTimeline
                width={1000} height={70}
                accent={BPI.bx.manhattan}
                events={[
                  { yr: 2010, m: 9,  t: 'SBS launch' },
                  { yr: 2019, m: 11, t: 'ACE begins' },
                  { yr: 2023, m: 4,  t: 'Bus lane 23↔14' },
                  { yr: 2025, m: 1,  t: 'Congestion pricing' },
                  { yr: 2025, m: 5,  t: 'ACE all-day' },
                ]}
              />
            </div>
            <div className="rule" />
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', alignItems: 'center', gap: 18, marginTop: 24 }}>
              <RouteBadge route="Bx12" sbs size="md" />
              <CPubTimeline
                width={1000} height={70}
                accent={BPI.bx.bronx}
                events={[
                  { yr: 2013, m: 6,  t: 'SBS launch' },
                  { yr: 2020, m: 6,  t: 'ACE begins' },
                  { yr: 2022, m: 7,  t: 'Concrete lane upgrade' },
                  { yr: 2023, m: 11, t: 'TSP across Fordham' },
                  { yr: 2025, m: 1,  t: 'ACE all-day' },
                ]}
              />
            </div>
          </div>
        </div>

        {/* ── TAKEAWAY ───────────────────────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 36px 12px' }}>
          <div style={{
            background: BPI.ink, color: BPI.paper,
            borderRadius: 4, padding: '48px 52px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(244,241,234,.55)', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 14 }}>
              What this comparison shows
            </div>
            <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.022em', lineHeight: 1.2, color: BPI.paper, maxWidth: 920, textWrap: 'balance', marginBottom: 22 }}>
              Two equally-treated routes diverged not because one got more tools than the other, but because one got the tools <em style={{ color: BPI.warn, fontStyle: 'normal' }}>laid down continuously</em>.
            </div>
            <div style={{ fontSize: 15.5, color: 'rgba(244,241,234,.78)', lineHeight: 1.65, maxWidth: 880, textWrap: 'pretty' }}>
              The M15\u2019s painted-only lane on Madison Avenue is geographically small — about 1.5 miles. But it sits in the middle of the route\u2019s busiest segment, and the toolkit on either side of it is no longer making up for what happens in between. The Bx12 has no such gap. That, more than anything else in the data, is what separates the two routes today.
            </div>
            <div style={{ marginTop: 28, display: 'flex', gap: 14 }}>
              <Button variant="paper" size="md">Read the full M15 brief →</Button>
              <Button variant="ghost" size="md" style={{ color: 'rgba(244,241,234,.7)' }}>Compare another pair</Button>
            </div>
          </div>
        </div>

        {/* ── METHODS NOTE ───────────────────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '48px 36px 8px' }}>
          <CPubHeader
            kicker="How we matched these routes"
            title="A descriptive pair, not a controlled experiment."
            sub="The M15 and Bx12 are paired here on length (within half a mile of each other), ridership (within 3%), and treatment history (both have ACE since 2019–20 and lane upgrades since 2022–23). They are not a randomized comparison; no two NYC bus corridors are. The studio publishes the matching method and a list of candidate pairs the M15 could be compared against."
          />
          <div style={{
            background: BPI.paperDeep, borderRadius: 4,
            padding: '20px 24px',
            boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
            display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
            fontSize: 12.5, fontFamily: BPIMono, color: BPI.ink55,
          }}>
            <span style={{ color: BPI.ink40, fontWeight: 700, letterSpacing: '0.08em' }}>METHOD</span>
            <span style={{ color: BPI.ink }}>peer_match v2.1 · length_km ± 1, riders_d ± 5%, ace_active=true, sbs=true</span>
            <span style={{ color: BPI.ink20 }}>·</span>
            <span style={{ color: BPI.accent, fontWeight: 600, cursor: 'pointer' }}>See full methods →</span>
            <span style={{ color: BPI.ink20 }}>·</span>
            <span style={{ color: BPI.accent, fontWeight: 600, cursor: 'pointer' }}>Download pairing CSV</span>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '28px 36px 28px',
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

Object.assign(window, { RF_ComparePublic });
