// home-public.jsx — Routes · Home, public-facing edition.
//
// The default RF_Home is the analyst's landing: search bar in the chrome,
// auto-suggest dropdown, "needs attention" triage list. This variant is
// the studio's front door for a public audience — a civic-data project
// homepage in the same editorial voice as the public-facing finding
// detail and the public-facing route page.
//
// Structure:
//   1. Hero — what this project is, who it serves
//   2. Citywide topline — four oversized numbers
//   3. In focus this month — three featured route stories
//   4. Browse by borough — chip filter + lightweight route index
//   5. How to use this site — three role-based entry cards
//   6. How we know this — methodology + sources + contact strip

const HPUB_W = 1320, HPUB_H = 2700;

// ─────────────────────────────────────────────────────────────
// Atoms — kept local for independent iteration.
// ─────────────────────────────────────────────────────────────

function HPubBigStat({ value, unit, label, sub, tone }) {
  const color = tone === 'bad' ? BPI.bad : tone === 'good' ? BPI.good : tone === 'warn' ? BPI.warn : BPI.ink;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, lineHeight: 1 }}>
        <span className="num" style={{
          fontSize: 62, fontWeight: 600, letterSpacing: '-0.035em', color,
        }}>{value}</span>
        {unit && (
          <span style={{ fontSize: 22, fontWeight: 500, color: BPI.ink55, letterSpacing: '-0.01em' }}>{unit}</span>
        )}
      </div>
      <div style={{
        fontSize: 14, color: BPI.ink, fontWeight: 600, marginTop: 14,
        letterSpacing: '-0.005em', lineHeight: 1.3, maxWidth: 280,
      }}>{label}</div>
      {sub && (
        <div style={{ fontSize: 12.5, color: BPI.ink55, marginTop: 6, lineHeight: 1.5, maxWidth: 280 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function HPubHeader({ kicker, title, sub, right }) {
  return (
    <div style={{ marginBottom: 22, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        {kicker && (
          <div style={{
            fontSize: 11, fontWeight: 600, color: BPI.ink55,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            marginBottom: 10,
          }}>{kicker}</div>
        )}
        <div style={{
          fontSize: 26, fontWeight: 600, letterSpacing: '-0.022em',
          lineHeight: 1.15, color: BPI.ink, textWrap: 'balance',
          maxWidth: 820,
        }}>{title}</div>
        {sub && (
          <div style={{
            fontSize: 15, color: BPI.ink70, marginTop: 10,
            lineHeight: 1.55, maxWidth: 720, textWrap: 'pretty',
          }}>{sub}</div>
        )}
      </div>
      {right}
    </div>
  );
}

// Featured route story card — magazine-style, one route highlighted with
// a narrative angle, a small stat block, and a borough-color stripe.
function HPubFeaturedCard({ route, sbs, borColor, kicker, headline, body, status, statusTone, mph, riders, delta14mo }) {
  const tColor = statusTone === 'bad' ? BPI.bad : statusTone === 'good' ? BPI.good : statusTone === 'warn' ? BPI.warn : BPI.ink70;
  const tBg    = statusTone === 'bad' ? BPI.badBg : statusTone === 'good' ? BPI.goodBg : statusTone === 'warn' ? BPI.warnBg : BPI.ink06;
  return (
    <div style={{
      background: BPI.card, borderRadius: 4,
      boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
      display: 'grid', gridTemplateColumns: '6px 1fr',
      overflow: 'hidden',
    }}>
      <div style={{ background: borColor }} />
      <div style={{ padding: '24px 26px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <RouteBadge route={route} sbs={sbs} size="md" />
          <span style={{
            fontFamily: BPIMono, fontSize: 10.5, fontWeight: 700,
            color: BPI.ink55, letterSpacing: '0.06em',
          }}>{kicker}</span>
          <span style={{ flex: 1 }} />
          <span style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em',
            textTransform: 'uppercase', color: tColor,
            background: tBg, padding: '3px 8px', borderRadius: 2,
          }}>{status}</span>
        </div>

        {/* Headline */}
        <div style={{
          fontSize: 19, fontWeight: 600, letterSpacing: '-0.015em',
          lineHeight: 1.25, color: BPI.ink, textWrap: 'pretty',
        }}>{headline}</div>

        {/* Body */}
        <div style={{
          fontSize: 13, color: BPI.ink70, lineHeight: 1.6, textWrap: 'pretty',
          flex: 1, minHeight: 80,
        }}>{body}</div>

        {/* Stat strip */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14,
          paddingTop: 14, boxShadow: `inset 0 1px 0 ${BPI.rule}`,
        }}>
          <div>
            <div style={{ fontSize: 9.5, color: BPI.ink40, letterSpacing: '0.08em', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Current</div>
            <div className="num" style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', color: BPI.ink, lineHeight: 1 }}>
              {mph}<span style={{ fontSize: 10.5, color: BPI.ink55, marginLeft: 2 }}>mph</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9.5, color: BPI.ink40, letterSpacing: '0.08em', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>14-mo Δ</div>
            <div className="num" style={{
              fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1,
              color: delta14mo.startsWith('−') || delta14mo.startsWith('-') ? BPI.bad : BPI.good,
            }}>
              {delta14mo}<span style={{ fontSize: 10.5, color: BPI.ink55, marginLeft: 2 }}>mph</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9.5, color: BPI.ink40, letterSpacing: '0.08em', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Riders / day</div>
            <div className="num" style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', color: BPI.ink, lineHeight: 1 }}>
              {riders}
            </div>
          </div>
        </div>

        {/* Read more */}
        <div style={{
          marginTop: 4, fontSize: 12, color: BPI.accent, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
        }}>Read the full story →</div>
      </div>
    </div>
  );
}

// Lightweight route-index row for the borough browser.
function HPubIndexRow({ route, sbs, name, mph, riders, trendData, status, statusTone }) {
  const tColor = statusTone === 'bad' ? BPI.bad : statusTone === 'good' ? BPI.good : statusTone === 'warn' ? BPI.warn : BPI.ink70;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '90px 1fr 90px 110px 120px 90px 16px',
      gap: 16, alignItems: 'center',
      padding: '14px 18px',
      boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
      cursor: 'pointer',
    }}>
      <RouteBadge route={route} sbs={sbs} size="md" />
      <div style={{ fontSize: 13.5, fontWeight: 500, color: BPI.ink }}>{name}</div>
      <div style={{ textAlign: 'right' }}>
        <div className="num" style={{ fontSize: 15, fontWeight: 600, color: BPI.ink, lineHeight: 1 }}>{mph.toFixed(1)}</div>
        <div style={{ fontSize: 9.5, color: BPI.ink40, letterSpacing: '0.06em', fontWeight: 700, textTransform: 'uppercase', marginTop: 3 }}>mph today</div>
      </div>
      <div>
        <Spark data={trendData} width={104} height={22} color={tColor} fill />
      </div>
      <div className="num" style={{ fontSize: 12, color: BPI.ink70, textAlign: 'right' }}>{riders}</div>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: tColor, textAlign: 'right',
      }}>{status}</div>
      <div style={{ fontSize: 14, color: BPI.ink40, textAlign: 'right' }}>→</div>
    </div>
  );
}

// Role-card — "How to use this site" entry points.
function HPubRoleCard({ role, body, links }) {
  return (
    <div style={{
      background: BPI.card, borderRadius: 4,
      boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
      padding: '24px 26px 22px',
      display: 'flex', flexDirection: 'column', gap: 12,
      minHeight: 200,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
        color: BPI.accent, textTransform: 'uppercase',
      }}>{role}</div>
      <div style={{
        fontSize: 13.5, color: BPI.ink70, lineHeight: 1.6,
        textWrap: 'pretty', flex: 1,
      }}>{body}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
        {links.map((l, i) => (
          <div key={i} style={{
            fontSize: 12.5, color: BPI.ink, fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          }}>
            <span style={{ color: BPI.accent }}>→</span>
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RF_HomePublic — the public-facing landing page.
// ─────────────────────────────────────────────────────────────
function RF_HomePublic() {
  const [borough, setBorough] = React.useState('All boroughs');

  // Made-up but plausible 12-month trend sparks for the index table.
  const dn  = [7.4, 7.3, 7.3, 7.2, 7.1, 7.0, 6.9, 6.8, 6.7, 6.5, 6.4, 6.3];
  const dn2 = [6.0, 5.9, 5.8, 5.8, 5.7, 5.6, 5.5, 5.4, 5.3, 5.2, 5.1, 5.1];
  const flt = [6.7, 6.7, 6.6, 6.7, 6.7, 6.7, 6.7, 6.6, 6.7, 6.7, 6.7, 6.7];
  const up  = [6.5, 6.6, 6.65, 6.7, 6.75, 6.8, 6.85, 6.85, 6.9, 6.9, 6.9, 6.9];
  const up2 = [6.3, 6.4, 6.5, 6.55, 6.6, 6.65, 6.7, 6.75, 6.8, 6.85, 6.9, 7.0];

  const allRoutes = [
    { route: 'M15',  sbs: true,  borough: 'Manhattan', name: '1 Av / 2 Av',                  mph: 6.3, riders: '42.1K', trend: dn,  status: 'Declining', statusTone: 'bad' },
    { route: 'B41',  sbs: false, borough: 'Brooklyn',  name: 'Flatbush Av',                  mph: 5.1, riders: '24.8K', trend: dn2, status: 'Declining', statusTone: 'bad' },
    { route: 'Bx12', sbs: true,  borough: 'Bronx',     name: 'Fordham Rd / Pelham',          mph: 6.9, riders: '41.0K', trend: up,  status: 'Improving', statusTone: 'good' },
    { route: 'M14A', sbs: true,  borough: 'Manhattan', name: '14 St Crosstown',              mph: 7.4, riders: '17.8K', trend: up2, status: 'Improving', statusTone: 'good' },
    { route: 'M14D', sbs: true,  borough: 'Manhattan', name: '14 St Crosstown',              mph: 7.0, riders: '9.8K',  trend: up,  status: 'Improving', statusTone: 'good' },
    { route: 'Q58',  sbs: false, borough: 'Queens',    name: 'Corona — Ridgewood',           mph: 6.3, riders: '21.5K', trend: dn,  status: 'Declining', statusTone: 'bad' },
    { route: 'B46',  sbs: true,  borough: 'Brooklyn',  name: 'Utica Av',                     mph: 6.7, riders: '38.4K', trend: flt, status: 'Steady',    statusTone: 'warn' },
    { route: 'Bx41', sbs: true,  borough: 'Bronx',     name: 'Webster Av',                   mph: 7.1, riders: '19.2K', trend: flt, status: 'Steady',    statusTone: 'warn' },
    { route: 'M101', sbs: false, borough: 'Manhattan', name: '3 Av / Lexington Av',          mph: 6.0, riders: '29.7K', trend: dn,  status: 'Declining', statusTone: 'bad' },
    { route: 'Q44',  sbs: true,  borough: 'Queens',    name: 'Main St / Flushing — Jamaica', mph: 6.4, riders: '26.3K', trend: flt, status: 'Steady',    statusTone: 'warn' },
  ];

  const filteredRoutes = borough === 'All boroughs'
    ? allRoutes
    : allRoutes.filter(r => r.borough === borough);

  const boroughs = ['All boroughs', 'Manhattan', 'Brooklyn', 'Bronx', 'Queens', 'Staten Island'];

  return (
    <div className="bpi" style={{
      width: HPUB_W, height: HPUB_H,
      display: 'flex', flexDirection: 'column',
      background: BPI.paper,
    }}>
      <StudioBar />

      <div style={{ flex: 1, overflow: 'auto' }}>

        {/* ── HERO ──────────────────────────────────────────────── */}
        <div style={{ background: BPI.card, boxShadow: `inset 0 -1px 0 ${BPI.rule}` }}>
          <div style={{
            maxWidth: 1180, margin: '0 auto',
            padding: '72px 36px 64px',
            display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 56, alignItems: 'flex-end',
          }}>
            <div>
              <div style={{
                fontSize: 11, fontWeight: 600, color: BPI.accent,
                letterSpacing: '0.16em', textTransform: 'uppercase',
                marginBottom: 18,
              }}>Bus Priority Impact Studio · A civic data project</div>

              <div style={{
                fontSize: 52, fontWeight: 600, letterSpacing: '-0.03em',
                lineHeight: 1.05, color: BPI.ink,
                maxWidth: 900, textWrap: 'balance', marginBottom: 22,
              }}>
                We track every bus route in New York that should be moving faster than it is.
              </div>

              <div style={{
                fontSize: 18, color: BPI.ink70, lineHeight: 1.55,
                maxWidth: 720, textWrap: 'pretty',
              }}>
                The city has spent the last fifteen years building tools to speed up its slowest buses — bus lanes, automated camera enforcement, signal priority. Some routes have moved faster because of it. Others have kept slowing down. This site tells the story of every route the program has touched, route by route, in plain numbers, from public data.
              </div>

              {/* CTAs */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14, marginTop: 32,
              }}>
                <Button variant="primary" size="lg">Browse all 327 routes →</Button>
                <Button variant="secondary" size="lg">Read this month's findings</Button>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 12, color: BPI.ink55, fontFamily: BPIMono }}>
                  updated weekly · last refresh May 12, 2026
                </span>
              </div>
            </div>

            {/* Right rail: search affordance */}
            <div style={{
              background: BPI.paperDeep, borderRadius: 4,
              padding: '24px 24px 22px',
              boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
            }}>
              <div className="eyebrow" style={{ marginBottom: 14 }}>Find a route</div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: BPI.card, border: `1.5px solid ${BPI.ink}`,
                padding: '12px 14px', borderRadius: 4,
                boxShadow: '0 2px 0 ' + BPI.ink,
              }}>
                <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke={BPI.ink} strokeWidth="1.8">
                  <circle cx="8" cy="8" r="5.5" /><path d="M12.5 12.5L16 16" strokeLinecap="round" />
                </svg>
                <input style={{
                  flex: 1, border: 'none', outline: 'none', fontFamily: 'inherit',
                  fontSize: 14, background: 'transparent', color: BPI.ink,
                }} placeholder="Route number, street, or borough…" />
              </div>
              <div style={{ fontSize: 11.5, color: BPI.ink55, marginTop: 12, marginBottom: 8, lineHeight: 1.5 }}>
                Try one of these:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[
                  { r: 'M15', s: true  },
                  { r: 'B41', s: false },
                  { r: 'Bx12', s: true },
                  { r: 'M14A', s: true },
                  { r: 'Q58', s: false },
                ].map((row, i) => (
                  <span key={i} style={{ cursor: 'pointer' }}>
                    <RouteBadge route={row.r} sbs={row.s} size="sm" />
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── CITYWIDE TOPLINE ───────────────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 36px 12px' }}>
          <HPubHeader
            kicker="The picture today"
            title="What the data says about New York's buses right now."
            sub="Numbers below cover all 327 local and Select Bus routes citywide, measured against their own scheduled timepoints across the past fourteen months."
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 36, marginTop: 24 }}>
            <HPubBigStat
              value="327"
              label="Routes tracked across all five boroughs"
              sub="Every local and Select Bus route the MTA operates, including weekend-only and rush-only services."
            />
            <HPubBigStat
              value="88"
              tone="bad"
              label="Routes slower than they were 14 months ago"
              sub="More than one in four. About a third of those have lost more than half a mile per hour."
            />
            <HPubBigStat
              value="11.4M"
              unit="hrs"
              tone="warn"
              label="Rider-hours lost across the system, every year"
              sub="The collective time New Yorkers spend on buses beyond what the schedule promises."
            />
            <HPubBigStat
              value="6.1"
              unit="mph"
              label="Median bus speed in the Bronx, the slowest borough"
              sub="Manhattan: 6.4 mph · Brooklyn: 6.6 · Queens: 7.2 · Staten Island: 9.8."
            />
          </div>
        </div>

        {/* ── IN FOCUS THIS MONTH ─────────────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '72px 36px 20px' }}>
          <HPubHeader
            kicker="In focus this month"
            title="Three routes telling three different stories."
            sub="Each of these has been reviewed by a studio analyst and reads as a self-contained finding. Each links to the route's full page with charts, segments, and methodology."
            right={
              <span style={{ fontSize: 12, color: BPI.accent, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                See all 14 findings →
              </span>
            }
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
            <HPubFeaturedCard
              route="M15" sbs borColor={BPI.bx.manhattan}
              kicker="THE OUTLIER"
              status="Declining" statusTone="bad"
              headline="The slowest Select Bus in Manhattan, and it's still getting slower."
              body="The M15 has every tool the city uses to speed up buses — concrete and painted lanes on 72% of its route, all-day camera enforcement, signal priority at four in ten intersections. Six of eight comparable routes sped up after enforcement turned on. This one didn't. Madison Avenue is the reason."
              mph="6.3" delta14mo="−1.6" riders="42.1K"
            />
            <HPubFeaturedCard
              route="Bx12" sbs borColor={BPI.bx.bronx}
              kicker="THE COUNTER-EXAMPLE"
              status="Improving" statusTone="good"
              headline="The route that figured it out — and stayed faster three years later."
              body="The Bx12 SBS got concrete-buffered lanes on Fordham Road in 2022, all-day enforcement in 2024, and signal priority at every major intersection by mid-2025. Speed rose 0.8 mph and hasn't backslid since. The closest thing the city has to a controlled experiment in stacked bus priority."
              mph="6.9" delta14mo="+0.4" riders="41.0K"
            />
            <HPubFeaturedCard
              route="B41" sbs={false} borColor={BPI.bx.brooklyn}
              kicker="THE UNTOUCHED CORRIDOR"
              status="Declining" statusTone="bad"
              headline="Flatbush Avenue has lost a mile per hour, and nothing has been tried."
              body="Twenty-five thousand riders a day, no bus lane, no enforcement program, no signal priority. The B41 is what the studio's data looks like in absence of any intervention at all. The slowdown is the steadiest of any corridor we track."
              mph="5.1" delta14mo="−1.0" riders="24.8K"
            />
          </div>
        </div>

        {/* ── BROWSE BY BOROUGH ────────────────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '72px 36px 12px' }}>
          <HPubHeader
            kicker="Every route"
            title="Browse the full index."
            sub="Sorted by daily ridership. Sparkline shows the route's 12-month speed trend; the status column groups routes by direction of travel."
            right={
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {boroughs.map((b) => (
                  <span key={b} onClick={() => setBorough(b)} style={{
                    padding: '6px 12px', borderRadius: 3, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer',
                    background: borough === b ? BPI.ink : 'transparent',
                    color: borough === b ? BPI.paper : BPI.ink70,
                    boxShadow: borough === b ? 'none' : `inset 0 0 0 1px ${BPI.ink20}`,
                    transition: 'background .15s',
                  }}>{b}</span>
                ))}
              </div>
            }
          />

          {/* Index table */}
          <div style={{
            background: BPI.card, borderRadius: 4,
            boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
            overflow: 'hidden',
          }}>
            {/* Header row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '90px 1fr 90px 110px 120px 90px 16px',
              gap: 16, alignItems: 'center',
              padding: '12px 18px',
              background: BPI.paperDeep,
              boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
              fontSize: 9.5, color: BPI.ink55, letterSpacing: '0.08em',
              fontWeight: 700, textTransform: 'uppercase',
            }}>
              <span>Route</span>
              <span>Corridor</span>
              <span style={{ textAlign: 'right' }}>Speed</span>
              <span>12-mo trend</span>
              <span style={{ textAlign: 'right' }}>Riders / day</span>
              <span style={{ textAlign: 'right' }}>Direction</span>
              <span />
            </div>
            {filteredRoutes.map((r, i) => (
              <HPubIndexRow key={r.route + r.name + i} {...r} trendData={r.trend} />
            ))}
            {/* Load-more footer */}
            <div style={{
              padding: '14px 18px', fontSize: 12, color: BPI.ink55,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span>Showing {filteredRoutes.length} of {borough === 'All boroughs' ? 327 : filteredRoutes.length * 30} routes</span>
              <span style={{ flex: 1 }} />
              <span style={{ color: BPI.accent, fontWeight: 600, cursor: 'pointer' }}>Load 20 more →</span>
              <span style={{ color: BPI.ink20 }}>·</span>
              <span style={{ color: BPI.accent, fontWeight: 600, cursor: 'pointer' }}>Download full CSV</span>
            </div>
          </div>
        </div>

        {/* ── HOW TO USE THIS SITE ─────────────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '72px 36px 12px' }}>
          <HPubHeader
            kicker="How to use this site"
            title="The same data, three different entry points."
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
            <HPubRoleCard
              role="If you ride the bus"
              body="Look up your route. Each route page tells you how fast it's moving now, how that compares to what the schedule promises, and where on the line the worst slowdowns happen."
              links={[
                'Find your route',
                'Browse routes by borough',
                "See what's changing this month",
              ]}
            />
            <HPubRoleCard
              role="If you cover transit"
              body="Every page on this site is built to be cited. Findings have an analyst byline, sourced data, and an audit trail. Charts are downloadable; underlying data is published as CSV."
              links={[
                "This month's findings",
                'Methodology in full',
                'Download data',
              ]}
            />
            <HPubRoleCard
              role="If you work in city government"
              body="The data is the same one your agencies publish — we've just made it route-shaped and comparable. Each route page identifies the segments where time is being lost, and the interventions already in place."
              links={[
                'Compare routes side-by-side',
                'Intervention timelines',
                'Get in touch about a brief',
              ]}
            />
          </div>
        </div>

        {/* ── COLOPHON / ABOUT THE STUDIO ───────────────────────────
            This is the landing-page trust strip — different in kind from
            the per-page "how we know this" blocks on findings & routes.
            Those answer "how do we know this finding?". This one answers
            "who runs this project, and how do they work?" Built as a
            colophon: editorial standards prose, project-level stats,
            named analysts, data sources, contact. ────────────────────── */}
        <div style={{
          background: BPI.ink,
          color: BPI.paper,
          marginTop: 64,
        }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '64px 36px 56px' }}>

            {/* Header band */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56,
              alignItems: 'flex-end', marginBottom: 48,
              paddingBottom: 32, borderBottom: `1px solid rgba(244,241,234,.18)`,
            }}>
              <div>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: 'rgba(244,241,234,.55)',
                  letterSpacing: '0.16em', textTransform: 'uppercase',
                  marginBottom: 14,
                }}>Colophon</div>
                <div style={{
                  fontSize: 38, fontWeight: 600, letterSpacing: '-0.025em',
                  lineHeight: 1.1, color: BPI.paper,
                  textWrap: 'balance', maxWidth: 540,
                }}>
                  Built in the open, reviewed by name, updated weekly.
                </div>
              </div>
              <div style={{
                fontSize: 15, color: 'rgba(244,241,234,.72)',
                lineHeight: 1.6, maxWidth: 480, textWrap: 'pretty',
              }}>
                The Bus Priority Impact Studio is an independent civic-data project staffed by four named analysts. Everything we publish goes through editorial review before it appears on this site. The data underneath is public; the methodology is open; the people are accountable.
              </div>
            </div>

            {/* Project-level stats */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24,
              marginBottom: 56,
            }}>
              {[
                { v: '142', l: 'Findings published since launch',  s: 'All reviewed by a named analyst.' },
                { v: '327', l: 'Routes covered by at least one brief', s: 'Every MTA local and Select Bus route.' },
                { v: '4',   l: 'Analysts on staff',                 s: 'Disclosure of priors in each byline.' },
                { v: '6',   l: 'Public datasets ingested weekly',   s: 'MTA Open Data + NYC DOT GIS feeds.' },
              ].map((k, i) => (
                <div key={i}>
                  <div className="num" style={{
                    fontSize: 48, fontWeight: 600, letterSpacing: '-0.03em',
                    lineHeight: 1, color: BPI.paper,
                  }}>{k.v}</div>
                  <div style={{
                    fontSize: 13, fontWeight: 600, marginTop: 12,
                    color: BPI.paper, lineHeight: 1.35, maxWidth: 230,
                  }}>{k.l}</div>
                  <div style={{
                    fontSize: 11.5, color: 'rgba(244,241,234,.55)',
                    marginTop: 6, lineHeight: 1.5, maxWidth: 230,
                  }}>{k.s}</div>
                </div>
              ))}
            </div>

            {/* Standards + Team */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 56,
              marginBottom: 56,
            }}>
              {/* Editorial standards */}
              <div>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: 'rgba(244,241,234,.55)',
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  marginBottom: 16,
                }}>Editorial standards</div>
                <ol style={{
                  margin: 0, padding: 0, listStyle: 'none',
                  display: 'flex', flexDirection: 'column', gap: 16,
                }}>
                  {[
                    { n: '01', t: 'Every finding is signed.',         b: 'A named analyst takes responsibility for every claim. Bylines link to the analyst’s page, including prior employers and any disclosed conflicts of interest.' },
                    { n: '02', t: 'Every claim traces to data.',      b: 'Citations in the body of a brief link directly to the row, segment, or aggregate they came from. Numbers we cannot defend, we do not publish.' },
                    { n: '03', t: 'Mistakes get corrected in 48 hrs.', b: 'Errors are flagged at the top of the affected page until repaired, then logged in our public corrections record. We have never quietly edited a published finding.' },
                    { n: '04', t: 'No commercial work.',              b: 'We do not take money from agencies, advocacy groups, or operators. The studio is supported by a single donor-advised fund, disclosed on our about page.' },
                  ].map((row) => (
                    <li key={row.n} style={{
                      display: 'grid', gridTemplateColumns: '40px 1fr', gap: 18,
                      paddingBottom: 16,
                      boxShadow: 'inset 0 -1px 0 rgba(244,241,234,.12)',
                    }}>
                      <span style={{
                        fontFamily: BPIMono, fontSize: 12, fontWeight: 700,
                        color: 'rgba(244,241,234,.45)', letterSpacing: '0.06em',
                        paddingTop: 2,
                      }}>{row.n}</span>
                      <div>
                        <div style={{
                          fontSize: 15, fontWeight: 600, color: BPI.paper,
                          marginBottom: 6, letterSpacing: '-0.01em',
                        }}>{row.t}</div>
                        <div style={{
                          fontSize: 12.5, color: 'rgba(244,241,234,.7)',
                          lineHeight: 1.6, textWrap: 'pretty',
                        }}>{row.b}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Named team */}
              <div>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: 'rgba(244,241,234,.55)',
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  marginBottom: 16,
                }}>The analysts</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[
                    { i: 'MO', n: 'Maya Okafor',     r: 'Senior Analyst',   note: 'Routes, methodology' },
                    { i: 'DR', n: 'Diego Ramirez',   r: 'Senior Analyst',   note: 'Enforcement, findings' },
                    { i: 'AC', n: 'Anika Chen',      r: 'Data Engineer',    note: 'Pipelines, GTFS, GIS' },
                    { i: 'JB', n: 'Jordan Bellamy',  r: 'Editor at Large',  note: 'Briefs, public writing' },
                  ].map((p) => (
                    <div key={p.i} style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      paddingBottom: 14,
                      boxShadow: 'inset 0 -1px 0 rgba(244,241,234,.12)',
                    }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 20, flexShrink: 0,
                        background: BPI.paper, color: BPI.ink,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 600,
                      }}>{p.i}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: BPI.paper }}>{p.n}</div>
                        <div style={{ fontSize: 11.5, color: 'rgba(244,241,234,.6)', marginTop: 2 }}>
                          {p.r} · {p.note}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 11, color: 'rgba(244,241,234,.45)',
                        cursor: 'pointer', fontWeight: 600,
                      }}>Bio →</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sources + contact row */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 56,
              paddingTop: 32, borderTop: `1px solid rgba(244,241,234,.18)`,
            }}>
              {/* Data sources */}
              <div>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: 'rgba(244,241,234,.55)',
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  marginBottom: 16,
                }}>Data sources</div>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 28px',
                }}>
                  {[
                    { src: 'MTA Bus Speeds',                  sub: 'segment-level, daily aggregates' },
                    { src: 'MTA Hourly Ridership',            sub: 'OMNY + MetroCard aggregate' },
                    { src: 'MTA Automated Camera Enforcement', sub: 'weekly violation counts' },
                    { src: 'MTA GTFS schedule',               sub: 'timepoint definitions, 2026' },
                    { src: 'NYC DOT bus-lane GIS',            sub: 'Q1 2026 lane-type classification' },
                    { src: 'NYC DOT signal-timing log',       sub: 'TSP intersection roster' },
                  ].map((s, i) => (
                    <div key={i} style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                      <div style={{ fontWeight: 500, color: BPI.paper }}>{s.src}</div>
                      <div style={{ color: 'rgba(244,241,234,.55)', fontSize: 11.5, marginTop: 2 }}>{s.sub}</div>
                    </div>
                  ))}
                </div>
                <div style={{
                  marginTop: 18, fontSize: 12,
                  display: 'flex', gap: 14, flexWrap: 'wrap',
                }}>
                  <span style={{ color: BPI.paper, fontWeight: 600, cursor: 'pointer' }}>Read full methodology →</span>
                  <span style={{ color: 'rgba(244,241,234,.3)' }}>·</span>
                  <span style={{ color: BPI.paper, fontWeight: 600, cursor: 'pointer' }}>Citation guide</span>
                  <span style={{ color: 'rgba(244,241,234,.3)' }}>·</span>
                  <span style={{ color: BPI.paper, fontWeight: 600, cursor: 'pointer' }}>Bulk data download (CSV)</span>
                </div>
              </div>

              {/* Get in touch */}
              <div>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: 'rgba(244,241,234,.55)',
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  marginBottom: 16,
                }}>Get in touch</div>
                <div style={{
                  background: 'rgba(244,241,234,.06)',
                  padding: '18px 20px', borderRadius: 3,
                  border: '1px solid rgba(244,241,234,.12)',
                }}>
                  <div style={{ fontFamily: BPIMono, fontSize: 13, color: BPI.paper, marginBottom: 14 }}>
                    studio@buspriority.nyc
                  </div>
                  <div style={{ fontSize: 11.5, color: 'rgba(244,241,234,.7)', lineHeight: 1.6 }}>
                    Story tips welcome. We respond to error reports within 48 hours and publish a correction at the top of the affected page until repaired.
                  </div>
                  <div style={{
                    marginTop: 14, paddingTop: 14,
                    borderTop: '1px solid rgba(244,241,234,.12)',
                    display: 'flex', alignItems: 'center', gap: 12,
                    fontSize: 11.5, color: 'rgba(244,241,234,.7)',
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: 3, background: BPI.good }} />
                    All systems operational · last ingest 2026-05-12
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '20px 36px 28px',
          maxWidth: 1180, margin: '0 auto',
          fontSize: 11.5, color: BPI.ink55,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span>Bus Priority Impact Studio · A civic data project</span>
          <span style={{ color: BPI.ink20 }}>·</span>
          <span>Public-domain data, MIT-licensed code</span>
          <span style={{ flex: 1 }} />
          <span>Share ↗</span>
          <span style={{ color: BPI.ink20 }}>·</span>
          <span>Cite</span>
          <span style={{ color: BPI.ink20 }}>·</span>
          <span>RSS</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { RF_HomePublic });
