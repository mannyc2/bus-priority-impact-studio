// Brief-first concept: gallery of briefs → reading view → drill into evidence.
// The brief IS the product. Maps and tables appear inside briefs as evidence.

const BW = 1320, BHGT = 880;

// ─────────────────────────────────────────────────────────────
// Screen 1 — Brief gallery
// ─────────────────────────────────────────────────────────────
function BF_Gallery() {
  const briefs = [
    {
      status: 'PUBLISHED',
      ttl: 'M15 SBS: The Madison corridor problem',
      sub: '1.5 miles account for 43% of measured route delay. Bus lane coverage stops at E 38 St.',
      route: 'M15', sbs: true,
      authored: 'C. Pherson · J. Lim',
      date: 'May 2026',
      reads: 4810, cites: 23,
      tags: ['Bus lanes', 'Manhattan', 'SBS'],
      featured: true,
    },
    {
      status: 'PUBLISHED',
      ttl: 'ACE on the M14: a year-one review',
      sub: 'Twelve months in, what the violation and speed data does and does not let us claim.',
      route: 'M14', sbs: true,
      authored: 'S. Rivera',
      date: 'Apr 2026',
      reads: 3120, cites: 31,
      tags: ['ACE', 'Manhattan', 'Causal caveats'],
    },
    {
      status: 'IN REVIEW',
      ttl: 'B41 Flatbush: speed has slipped, no intervention scheduled',
      sub: '−0.6 mph rolling 14-day; no bus lane upgrade or ACE in FY26 plan. 24K daily riders.',
      route: 'B41', sbs: false,
      authored: 'C. Pherson',
      date: 'May 2026 · v0.3',
      reads: 0, cites: 14,
      tags: ['Brooklyn', 'No-intervention'],
    },
    {
      status: 'IN REVIEW',
      ttl: 'Bx12 SBS: a working route, and the contrast it provides',
      sub: 'Used as positive control in three other briefs. What it has that slower SBS routes lack.',
      route: 'Bx12', sbs: true,
      authored: 'J. Lim',
      date: 'May 2026 · v0.6',
      reads: 0, cites: 18,
      tags: ['Bronx', 'Comparison'],
    },
    {
      status: 'DRAFT',
      ttl: 'Q58 Corona–Ridgewood: an untreated rider-impact corridor',
      sub: 'Top-20 in rider-hours lost city-wide. No SBS designation. No bus lane on most slow segments.',
      route: 'Q58', sbs: false,
      authored: 'C. Pherson',
      date: 'May 2026 · v0.1',
      reads: 0, cites: 6,
      tags: ['Queens', 'Untreated'],
    },
    {
      status: 'DRAFT',
      ttl: 'When does congestion pricing show up in the bus data?',
      sub: 'Methodological — separating CBD pricing effect from concurrent ACE rollout.',
      route: null,
      authored: 'S. Rivera',
      date: 'May 2026 · v0.2',
      reads: 0, cites: 9,
      tags: ['Methods', 'Causal caveats'],
    },
  ];
  const featured = briefs.find((b) => b.featured);
  return (
    <div className="bpi" style={{ width: BW, height: BHGT, display: 'flex', flexDirection: 'column' }}>
      <StudioBar active="Briefs" />

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Title strip */}
        <div style={{
          padding: '24px 28px 16px', background: BPI.card,
          boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
          display: 'flex', alignItems: 'flex-end', gap: 24,
        }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Route Evidence Briefs</div>
            <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em' }}>
              What the public data lets us say
            </div>
            <div style={{ fontSize: 13, color: BPI.ink55, marginTop: 4, maxWidth: 620 }}>
              Cited route-level arguments built from MTA bus speed, ridership, and ACE data,
              plus NYC DOT bus-lane geometry. Each brief carries its own caveats.
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            {['All (24)', 'Published (8)', 'In review (6)', 'Drafts (10)', 'Methods (4)'].map((t, i) => (
              <span key={t} className="chip" style={i === 0 ? { background: BPI.ink, color: BPI.paper } : {}}>{t}</span>
            ))}
            <button className="txt" style={{
              padding: '6px 12px', background: BPI.ink, color: BPI.paper,
              borderRadius: 3, fontSize: 12, fontWeight: 600, marginLeft: 8,
            }}>+ New brief</button>
          </div>
        </div>

        {/* Featured */}
        <div style={{ padding: '24px 28px 8px', display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 28, alignItems: 'stretch' }}>
          <div style={{
            background: BPI.ink, color: BPI.paper,
            padding: 28, borderRadius: 4,
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                fontSize: 9.5, letterSpacing: '0.15em', fontWeight: 700,
                padding: '3px 7px', background: BPI.paper, color: BPI.ink, borderRadius: 2,
              }}>{featured.status}</span>
              <RouteBadge route={featured.route} sbs={featured.sbs} size="sm" />
              <span style={{ fontSize: 11, opacity: 0.6 }}>{featured.date}</span>
            </div>
            <div style={{
              fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.15,
              textWrap: 'pretty',
            }}>{featured.ttl}</div>
            <div style={{ fontSize: 13.5, opacity: 0.75, lineHeight: 1.55, maxWidth: 560 }}>
              {featured.sub} The brief breaks down rider-hour impact by segment, contrasts ACE-enforced
              vs. unenforced portions of the route, and identifies the one defensible intervention claim.
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11.5, opacity: 0.7 }}>
              <span>{featured.authored}</span>
              <span>·</span>
              <span className="num">{featured.reads.toLocaleString()} reads</span>
              <span>·</span>
              <span className="num">{featured.cites} citations</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="txt" style={{
                padding: '10px 16px', background: BPI.paper, color: BPI.ink,
                borderRadius: 3, fontSize: 12.5, fontWeight: 600,
              }}>Read brief →</button>
              <button className="txt" style={{
                padding: '10px 16px', border: `1px solid rgba(244,241,234,.3)`,
                color: BPI.paper, borderRadius: 3, fontSize: 12.5, fontWeight: 500,
              }}>Open evidence panel</button>
            </div>
          </div>
          {/* Featured viz preview */}
          <div style={{
            background: BPI.card, padding: 22, borderRadius: 4,
            boxShadow: `0 0 0 1px ${BPI.rule}`,
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <div className="eyebrow">Evidence at a glance</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <div className="num" style={{ fontSize: 44, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1, color: BPI.bad }}>4.2</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>mph weekday average</div>
                <div style={{ fontSize: 10.5, color: BPI.ink55 }}>Madison Av · 28→58 St NB</div>
              </div>
              <div style={{ flex: 1 }} />
              <Spark data={[7.1, 6.8, 6.7, 6.5, 6.0, 5.4, 5.0, 4.8, 4.6, 4.4, 4.3, 4.2, 4.2, 4.2]} width={120} height={40} color={BPI.bad} fill />
            </div>
            <div className="rule" />
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Share of route's measured delay</div>
              <div style={{ display: 'flex', height: 14, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: '43%', background: BPI.bad }} />
                <div style={{ width: '15%', background: BPI.warn }} />
                <div style={{ width: '10%', background: BPI.warn, opacity: 0.7 }} />
                <div style={{ flex: 1, background: BPI.ink20 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10.5, color: BPI.ink55 }}>
                <span><b style={{ color: BPI.bad }}>43%</b> Madison Av 28–58</span>
                <span>15% 1 Av 14–34</span>
                <span>10% 2 Av 60–42</span>
                <span>32% other</span>
              </div>
            </div>
          </div>
        </div>

        {/* Brief list */}
        <div style={{ padding: '20px 28px 0', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <H title="In review and draft" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, flex: 1, overflow: 'hidden' }}>
            {briefs.filter((b) => !b.featured).slice(0, 5).map((b, i) => (
              <div key={i} style={{
                padding: 16, background: BPI.card,
                boxShadow: `0 0 0 1px ${BPI.rule}`, borderRadius: 3,
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 9, letterSpacing: '0.12em', fontWeight: 700,
                    padding: '2px 6px', borderRadius: 2,
                    background: b.status === 'PUBLISHED' ? BPI.goodBg : b.status === 'IN REVIEW' ? BPI.warnBg : BPI.ink06,
                    color: b.status === 'PUBLISHED' ? BPI.good : b.status === 'IN REVIEW' ? BPI.warn : BPI.ink55,
                  }}>{b.status}</span>
                  {b.route && <RouteBadge route={b.route} sbs={b.sbs} size="sm" />}
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono }}>{b.date}</span>
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.25, textWrap: 'pretty' }}>{b.ttl}</div>
                <div style={{ fontSize: 12, color: BPI.ink70, lineHeight: 1.5, flex: 1 }}>{b.sub}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {b.tags.map((t) => <span key={t} className="chip" style={{ fontSize: 10 }}>{t}</span>)}
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  paddingTop: 8, fontSize: 11, color: BPI.ink55,
                  boxShadow: `inset 0 1px 0 ${BPI.rule}`,
                }}>
                  <span>{b.authored}</span>
                  <span>·</span>
                  <span className="num">{b.cites} cites</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Screen 2 — Brief reading view (narrative-led)
// ─────────────────────────────────────────────────────────────
function BF_Reading() {
  return (
    <div className="bpi" style={{ width: BW, height: BHGT, display: 'flex', flexDirection: 'column' }}>
      <StudioBar active="Briefs" breadcrumb="Briefs / M15 SBS · Madison corridor" />
      <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '220px 1fr 280px' }}>
        {/* Left rail — outline + meta */}
        <div style={{
          padding: '40px 22px', boxShadow: `inset -1px 0 0 ${BPI.rule}`,
          background: BPI.paper, overflow: 'auto',
        }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>Contents</div>
          {[
            ['01', 'Summary', false],
            ['02', 'The slow corridor', true],
            ['03', 'Treatments in place', false],
            ['04', 'What ACE has and has not done', false],
            ['05', 'Defensible claims', false],
            ['06', 'Caveats', false],
            ['07', 'Sources', false],
          ].map(([n, t, a]) => (
            <div key={n} style={{
              padding: '7px 10px', marginLeft: -10, marginRight: -10, marginBottom: 1,
              background: a ? BPI.card : 'transparent',
              borderLeft: a ? `2px solid ${BPI.ink}` : '2px solid transparent',
              fontSize: 12.5, fontWeight: a ? 600 : 400,
              cursor: 'pointer',
            }}>
              <span className="num" style={{ color: BPI.ink55, marginRight: 8 }}>{n}</span>
              {t}
            </div>
          ))}
          <div className="rule" style={{ margin: '24px 0' }} />
          <div className="eyebrow" style={{ marginBottom: 10 }}>Meta</div>
          <div style={{ fontSize: 11.5, color: BPI.ink70, lineHeight: 1.6 }}>
            <div><b style={{ color: BPI.ink }}>Authors</b> C. Pherson, J. Lim</div>
            <div><b style={{ color: BPI.ink }}>Published</b> May 12, 2026</div>
            <div><b style={{ color: BPI.ink }}>Revision</b> v1.2</div>
            <div><b style={{ color: BPI.ink }}>Citations</b> 23</div>
            <div><b style={{ color: BPI.ink }}>Caveats</b> 4 flagged</div>
            <div style={{ marginTop: 8 }}>
              <b style={{ color: BPI.ink }}>Data window</b><br />
              Mar 1 – Mar 31, 2026<br />
              <span style={{ color: BPI.ink55 }}>Comparison: Mar 2025</span>
            </div>
          </div>
        </div>

        {/* Center — reading column */}
        <div style={{ padding: '40px 56px', overflow: 'auto', background: BPI.card }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <RouteBadge route="M15" sbs size="lg" />
            <span className="chip good" style={{ fontSize: 10 }}>PUBLISHED · v1.2</span>
          </div>
          <div style={{
            fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.1,
            marginBottom: 14, textWrap: 'pretty',
          }}>
            The Madison corridor problem
          </div>
          <div style={{ fontSize: 16, color: BPI.ink70, lineHeight: 1.55, marginBottom: 28, fontWeight: 400, maxWidth: 600 }}>
            A 1.5-mile stretch of Madison Avenue accounts for nearly half of all measured delay on the M15 SBS,
            New York City's busiest Select Bus Service route.<Cite n={1} /> The treatments that fixed the rest of the corridor have not&nbsp;been&nbsp;extended here.
          </div>

          <div className="rule" style={{ marginBottom: 28 }} />

          <h2 style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: BPI.ink55, marginBottom: 16 }}>
            <span className="num" style={{ marginRight: 10 }}>02</span>The slow corridor
          </h2>
          <p style={{ fontSize: 14.5, lineHeight: 1.7, color: BPI.ink, marginBottom: 18, maxWidth: 600 }}>
            On weekdays in March 2026, M15 SBS buses traversed Madison Avenue between East 28th Street and East 58th Street at <b>4.2 mph northbound</b>,<Cite n={2} /> slower than the median NYC pedestrian walking pace of 3.1 mph for almost no portion of the day above that figure.<Cite n={3} /> The slowest hours are between 16:00 and 19:00; severity remains in the route's worst decile for eleven consecutive hour-blocks.<Cite n={2} />
          </p>

          {/* Inline evidence figure */}
          <figure style={{
            margin: '8px 0 24px', background: BPI.paper,
            padding: '18px 18px 14px', borderRadius: 3,
            boxShadow: `0 0 0 1px ${BPI.rule}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 14 }}>
              <div className="eyebrow">Figure 1</div>
              <div style={{ fontSize: 12, fontWeight: 500 }}>Hour-by-hour speed, Madison Av NB · 28→58 St</div>
              <div style={{ flex: 1 }} />
              <button className="txt" style={{ fontSize: 11, color: BPI.accent, fontWeight: 600 }}>
                Open evidence ↗
              </button>
            </div>
            <HourStrip hours={Array.from({ length: 24 }, (_, h) => {
              if (h >= 7 && h <= 9) return 0.7;
              if (h >= 11 && h <= 14) return 0.5;
              if (h >= 16 && h <= 19) return 0.9;
              if (h >= 6 && h <= 21) return 0.3;
              return 0.1;
            })} width={520} height={28} />
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 10, color: BPI.ink55, marginTop: 6, fontFamily: BPIMono,
            }}>
              {['0:00', '6:00', '12:00', '18:00', '24:00'].map((t) => <span key={t}>{t}</span>)}
            </div>
            <div style={{ fontSize: 11, color: BPI.ink55, marginTop: 10, fontStyle: 'italic' }}>
              Color encodes deviation from segment's scheduled timepoint pace.
              Source: MTA Bus Speeds, Mar 2026.<Cite n={2} />
            </div>
          </figure>

          <p style={{ fontSize: 14.5, lineHeight: 1.7, color: BPI.ink, marginBottom: 18, maxWidth: 600 }}>
            The segment carries roughly <b>207,870 rider-trips per month</b><Cite n={4} /> on the M15 SBS alone, plus additional volume on local M101, M102, and M103 buses that share this avenue. Across this single corridor the M15 SBS loses <b>18,420 rider-hours per weekday</b><Cite n={5} /> relative to its own scheduled timepoint pace — approximately 43% of the route's total measured rider-hour delay.<Cite n={5} />
          </p>

          {/* Caveat callout */}
          <aside style={{
            margin: '8px 0 24px', padding: '14px 16px',
            background: BPI.warnBg, color: BPI.ink70,
            borderLeft: `3px solid ${BPI.warn}`,
            fontSize: 12.5, lineHeight: 1.55,
          }}>
            <div style={{ fontWeight: 600, color: BPI.warn, marginBottom: 4 }}>Caveat — what "speed" means</div>
            MTA segment speeds include real rider-experience factors: dwell time, traffic, signals,
            and stop spacing.<Cite n={6} /> We use the term <i>observed bus travel speed</i> throughout.
            A bus-lane install can raise this metric; a route restructuring can lower it without
            buses being slower.
          </aside>

          <p style={{ fontSize: 14.5, lineHeight: 1.7, color: BPI.ink, maxWidth: 600 }}>
            What distinguishes this stretch from the rest of the M15 corridor is its <b>treatment&nbsp;gap</b>. The route is otherwise heavily equipped — dedicated bus lanes on the East Side avenues, all-day Automated Camera Enforcement since May 2025.<Cite n={7} /> On Madison Avenue, the bus lane covers only the southernmost third of this segment; ACE enforcement does not extend to Madison Av at all.<Cite n={7,8} />
          </p>
        </div>

        {/* Right rail — evidence panel */}
        <div style={{
          padding: '40px 22px', boxShadow: `inset 1px 0 0 ${BPI.rule}`,
          background: BPI.paper, overflow: 'auto',
        }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>Evidence in view</div>
          <div style={{ fontSize: 11, color: BPI.ink55, marginBottom: 10 }}>Pinned to ¶ being read</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { n: '02', ttl: 'Hour-by-hour speed', src: 'Bus Speeds Mar 2026' },
              { n: '04', ttl: 'Monthly rider-trips', src: 'Hourly Ridership 2026' },
              { n: '05', ttl: 'M1 pilot rider-hours', src: '2,003-obs pilot' },
            ].map((e, i) => (
              <div key={i} style={{
                padding: 12, background: BPI.card, borderRadius: 3,
                boxShadow: `0 0 0 1px ${BPI.rule}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: BPI.accent, fontFamily: BPIMono }}>[{e.n}]</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600 }}>{e.ttl}</span>
                </div>
                <MapThumb width={186} height={66} emphasis={BPI.accent} label={e.src} />
              </div>
            ))}
          </div>
          <div className="rule" style={{ margin: '20px 0' }} />
          <button className="txt" style={{
            padding: '10px 14px', background: BPI.ink, color: BPI.paper,
            borderRadius: 3, fontSize: 12, fontWeight: 600, width: '100%',
            marginBottom: 8,
          }}>Drill into route view ↗</button>
          <button className="txt" style={{
            padding: '10px 14px', border: `1px solid ${BPI.ink20}`,
            borderRadius: 3, fontSize: 12, fontWeight: 500, width: '100%',
          }}>Replicate methodology</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Screen 3 — Drill-down: evidence panel expanded
// ─────────────────────────────────────────────────────────────
function BF_Evidence() {
  return (
    <div className="bpi" style={{ width: BW, height: BHGT, display: 'flex', flexDirection: 'column' }}>
      <StudioBar active="Briefs" breadcrumb="Briefs / M15 SBS · Madison corridor / evidence" />
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          padding: '18px 28px', background: BPI.card,
          boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <button className="txt" style={{ fontSize: 13, color: BPI.accent, fontWeight: 600 }}>
            ← Back to brief
          </button>
          <div style={{ width: 1, height: 18, background: BPI.rule }} />
          <div>
            <div className="eyebrow" style={{ marginBottom: 2 }}>Citation [2]</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Hour-by-hour speed, Madison Av NB · 28→58 St</div>
          </div>
          <div style={{ flex: 1 }} />
          <span className="chip">Mar 2026</span>
          <span className="chip">NB only</span>
          <span className="chip">Weekday</span>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: 28, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 28, overflow: 'hidden' }}>
          {/* Chart */}
          <div style={{ background: BPI.card, padding: 22, borderRadius: 3, boxShadow: `0 0 0 1px ${BPI.rule}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>Median speed by hour</div>
                <div style={{ fontSize: 11.5, color: BPI.ink55, marginTop: 3 }}>
                  Madison Av NB, E 28 St → E 58 St · weekdays · n = 2,003 observations
                </div>
              </div>
              <div className="num" style={{ fontSize: 11, color: BPI.ink55, fontFamily: BPIMono }}>
                source: MTA Bus Speeds segment table
              </div>
            </div>
            <HourChart />
            <div className="rule" style={{ margin: '14px 0' }} />
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18,
            }}>
              {[
                { lbl: 'AM peak (7–9)', val: '4.8' },
                { lbl: 'Mid-day (11–14)', val: '5.6' },
                { lbl: 'PM peak (16–19)', val: '3.9' },
                { lbl: 'Evening (20–22)', val: '6.4' },
              ].map((s, i) => (
                <div key={i}>
                  <div className="eyebrow" style={{ marginBottom: 4 }}>{s.lbl}</div>
                  <div className="num" style={{
                    fontSize: 22, fontWeight: 600, color: parseFloat(s.val) < 5 ? BPI.bad : BPI.ink, lineHeight: 1,
                  }}>{s.val} <span style={{ fontSize: 10, color: BPI.ink55 }}>mph</span></div>
                </div>
              ))}
            </div>
          </div>

          {/* Citation provenance */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minHeight: 0 }}>
            <div style={{ background: BPI.card, padding: 18, borderRadius: 3, boxShadow: `0 0 0 1px ${BPI.rule}` }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>How this number was computed</div>
              <ol style={{ paddingLeft: 18, margin: 0, fontSize: 12.5, color: BPI.ink70, lineHeight: 1.7 }}>
                <li>Filter MTA Bus Speeds segment table to route_id = M15+ (SBS) and timepoint pairs entirely within E 28 St – E 58 St, NB direction.</li>
                <li>Restrict to weekdays in Mar 1 – Mar 31, 2026 (n = 2,003 segment observations).</li>
                <li>For each hour of day, compute the median observed speed across observations falling in that hour.</li>
                <li>Compare against scheduled timepoint pace (GTFS, Mar 2026): 7.1 mph segment-wide.</li>
              </ol>
              <button className="txt" style={{
                marginTop: 12, fontSize: 11, color: BPI.accent, fontWeight: 600,
              }}>Open replicable query ↗</button>
            </div>

            <div style={{ background: BPI.card, padding: 18, borderRadius: 3, boxShadow: `0 0 0 1px ${BPI.rule}` }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Caveats attached to this number</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { tone: 'warn', t: 'Includes dwell time, signals, and traffic.', d: 'Per MTA methodology blog. Not pure traffic speed.' },
                  { tone: 'warn', t: 'Construction on E 51 St, Apr 8–14.', d: 'Six days excluded from comparison windows.' },
                  { tone: 'bad', t: 'No 2024 baseline for this exact segment pair.', d: 'M15 SBS timepoint definitions changed Aug 2024; pre/post comparisons require segment alignment.' },
                ].map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ marginTop: 4, width: 6, height: 6, borderRadius: 3, background: c.tone === 'bad' ? BPI.bad : BPI.warn, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{c.t}</div>
                      <div style={{ fontSize: 11, color: BPI.ink55, marginTop: 1 }}>{c.d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="txt" style={{
                flex: 1, padding: '10px 14px', border: `1px solid ${BPI.ink20}`,
                borderRadius: 3, fontSize: 12.5, fontWeight: 500,
              }}>Export CSV</button>
              <button className="txt" style={{
                flex: 1, padding: '10px 14px', background: BPI.ink, color: BPI.paper,
                borderRadius: 3, fontSize: 12.5, fontWeight: 600,
              }}>Open in route view →</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HourChart() {
  const data = [
    7.4, 7.6, 7.8, 8.1, 7.9, 7.0, 5.4, 4.7, 5.0, 5.9,
    6.0, 5.8, 5.6, 5.4, 5.5, 5.0, 4.2, 3.8, 4.1, 5.2,
    6.4, 7.0, 7.2, 7.4,
  ];
  return <HourBars data={data} sched={7.1} width={600} height={220} min={3} max={9} />;
}

Object.assign(window, { BF_Gallery, BF_Reading, BF_Evidence });
