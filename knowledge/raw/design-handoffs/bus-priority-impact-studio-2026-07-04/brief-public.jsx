// brief-public.jsx — Brief · public-facing edition.
//
// The default RF_Brief is the analyst's draft view: claims rail, evidence
// columns, strength bars. This page is the SAME brief once it's been
// reviewed, approved, and published — what a reader of buspriority.nyc
// actually sees when they open Brief 023.
//
// Reads as a longform civic-data story with numbered claims rendered as
// pull-quote sections, evidence as quiet citations in the margin, and a
// reviewer trust strip at the bottom. Same M15 SBS material the route
// page tells, but as a focused editorial argument, not a fact sheet.
//
// Editorial structure:
//   1. Hero — kicker (brief edition #) · headline · byline · lede
//   2. TL;DR — three pull-quote claims
//   3. Key numbers — four big stats
//   4. Body — five numbered sections, each one a claim with evidence
//   5. What comes next — a "so what" closer
//   6. Evidence catalog — every source used, with retrieval timestamps
//   7. Review trail — reviewer, approver, audit IDs
//   8. Related briefs

const BPUB_W = 1320, BPUB_H = 2780;

// ─────────────────────────────────────────────────────────────
// Atoms — local to keep this file self-contained.
// ─────────────────────────────────────────────────────────────

function BPubBigStat({ value, unit, label, sub, tone }) {
  const color = tone === 'bad' ? BPI.bad : tone === 'good' ? BPI.good : tone === 'warn' ? BPI.warn : BPI.ink;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, lineHeight: 1 }}>
        <span className="num" style={{ fontSize: 58, fontWeight: 600, letterSpacing: '-0.035em', color }}>{value}</span>
        {unit && (
          <span style={{ fontSize: 20, fontWeight: 500, color: BPI.ink55, letterSpacing: '-0.01em' }}>{unit}</span>
        )}
      </div>
      <div style={{ fontSize: 13.5, color: BPI.ink, fontWeight: 600, marginTop: 12, letterSpacing: '-0.005em', lineHeight: 1.3, maxWidth: 240 }}>{label}</div>
      {sub && (
        <div style={{ fontSize: 12, color: BPI.ink55, marginTop: 6, lineHeight: 1.5, maxWidth: 260 }}>{sub}</div>
      )}
    </div>
  );
}

function BPubSectionHeader({ kicker, title, sub }) {
  return (
    <div style={{ marginBottom: 22 }}>
      {kicker && (
        <div style={{ fontSize: 11, fontWeight: 600, color: BPI.ink55, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>{kicker}</div>
      )}
      <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.022em', lineHeight: 1.15, color: BPI.ink, textWrap: 'balance', maxWidth: 820 }}>{title}</div>
      {sub && (
        <div style={{ fontSize: 15, color: BPI.ink70, marginTop: 10, lineHeight: 1.55, maxWidth: 720, textWrap: 'pretty' }}>{sub}</div>
      )}
    </div>
  );
}

// Numbered claim section — the editorial unit of a published brief.
// Two-column layout: claim body on the left, an evidence sidecar on the right.
function BPubClaim({ n, title, body, evidence, chart }) {
  return (
    <article style={{
      display: 'grid', gridTemplateColumns: '1fr 320px', gap: 36,
      padding: '40px 0', boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
    }}>
      <div style={{ minWidth: 0 }}>
        {/* Claim number */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <span className="num" style={{
            fontSize: 13, fontWeight: 700, letterSpacing: '0.06em',
            color: BPI.accent, fontFamily: BPIMono,
            padding: '4px 10px', background: BPI.accentBg, borderRadius: 2,
          }}>CLAIM 0{n}</span>
          <div style={{ flex: 1, height: 1, background: BPI.rule }} />
        </div>
        <h2 style={{
          margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: '-0.022em',
          lineHeight: 1.2, color: BPI.ink, textWrap: 'balance', marginBottom: 16,
        }}>{title}</h2>
        <div style={{
          fontSize: 15, lineHeight: 1.7, color: BPI.ink70,
          maxWidth: 660, textWrap: 'pretty',
        }}>{body}</div>
        {chart && <div style={{ marginTop: 24 }}>{chart}</div>}
      </div>

      {/* Evidence sidecar */}
      <aside style={{
        background: BPI.paperDeep, borderRadius: 4,
        padding: '20px 22px', height: 'fit-content',
        boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
          color: BPI.ink55, textTransform: 'uppercase', marginBottom: 14,
        }}>Evidence for this claim</div>
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {evidence.map((e, i) => (
            <li key={i} style={{
              display: 'grid', gridTemplateColumns: '22px 1fr', gap: 10,
              fontSize: 12, lineHeight: 1.5, color: BPI.ink70,
            }}>
              <span style={{
                fontFamily: BPIMono, fontWeight: 700, color: BPI.accent,
                fontSize: 10.5, paddingTop: 2,
              }}>[{i + 1}]</span>
              <div>
                <div style={{ color: BPI.ink, fontWeight: 500 }}>{e.title}</div>
                <div style={{ color: BPI.ink55, fontSize: 11, marginTop: 2 }}>{e.where}</div>
              </div>
            </li>
          ))}
        </ol>
      </aside>
    </article>
  );
}

// Pull-quote — used for the TL;DR row up top.
function BPubPullQuote({ n, text }) {
  return (
    <div style={{
      background: BPI.card, borderRadius: 4,
      boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
      padding: '24px 26px',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <span className="num" style={{
        fontSize: 11.5, fontWeight: 700, letterSpacing: '0.06em',
        color: BPI.accent, fontFamily: BPIMono,
      }}>0{n}</span>
      <div style={{ fontSize: 17, fontWeight: 500, lineHeight: 1.35, letterSpacing: '-0.012em', color: BPI.ink, textWrap: 'pretty' }}>{text}</div>
    </div>
  );
}

// Small inline trend chart — used inside a claim body to visualize one line.
function BPubMiniTrend({ data, labels, baseline, baselineLabel, height = 180, width = 600 }) {
  const lo = Math.min(...data, baseline ?? Infinity) - 0.3;
  const hi = Math.max(...data, baseline ?? -Infinity) + 0.3;
  const padL = 38, padR = 22, padT = 16, padB = 26;
  const n = data.length;
  const cw = (width - padL - padR) / (n - 1);
  const yv = (v) => padT + (1 - (v - lo) / (hi - lo)) * (height - padT - padB);
  const pts = data.map((v, i) => [padL + i * cw, yv(v)]);
  const line = pts.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1)).join(' ');
  const area = line + ` L${pts[n - 1][0].toFixed(1)},${height - padB} L${padL},${height - padB} Z`;
  const yticks = [];
  const step = Math.max(0.5, Math.round((hi - lo) / 4 * 2) / 2);
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) yticks.push(v);
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {yticks.map((v) => (
        <g key={v}>
          <line x1={padL} x2={width - padR} y1={yv(v)} y2={yv(v)} stroke={BPI.rule} />
          <text x={padL - 6} y={yv(v) + 3} fontSize="9.5" textAnchor="end" fill={BPI.ink55} fontFamily={BPIMono}>{v.toFixed(1)}</text>
        </g>
      ))}
      {baseline !== undefined && (
        <>
          <line x1={padL} x2={width - padR} y1={yv(baseline)} y2={yv(baseline)} stroke={BPI.ink40} strokeDasharray="3 3" />
          {baselineLabel && (
            <text x={width - padR - 4} y={yv(baseline) - 5} fontSize="10" textAnchor="end" fill={BPI.ink55} fontFamily={BPIMono} fontWeight="600">{baselineLabel}</text>
          )}
        </>
      )}
      <path d={area} fill={BPI.bad} opacity="0.06" />
      <path d={line} fill="none" stroke={BPI.bad} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {labels.map((l, i) => i % 3 === 0 && (
        <text key={i} x={padL + i * cw} y={height - padB + 14} fontSize="10" textAnchor="middle" fill={BPI.ink55} fontFamily={BPIMono}>{l}</text>
      ))}
      <circle cx={pts[n - 1][0]} cy={yv(data[n - 1])} r="3.5" fill={BPI.bad} />
    </svg>
  );
}

// Treatment-stack bar — visualizes the lane / ACE / TSP coverage on the route.
function BPubCoverageBar({ label, value, max = 100, color, sub }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: BPI.ink }}>{label}</span>
        <span className="num" style={{ fontSize: 12, fontWeight: 600, color, letterSpacing: '-0.01em' }}>{value}%</span>
      </div>
      <div style={{ height: 6, background: BPI.ink06, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(value / max) * 100}%`, background: color, borderRadius: 3 }} />
      </div>
      {sub && <div style={{ fontSize: 10.5, color: BPI.ink55, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RF_BriefPublic
// ─────────────────────────────────────────────────────────────
function RF_BriefPublic() {
  const brief = {
    edition: 'Brief 023',
    route: { route: 'M15', sbs: true },
    borColor: BPI.bx.manhattan,
    span: 'South Ferry ↔ E 126 St · Manhattan East Side',
    published: 'May 12, 2026',
    readTime: '11 min',
    headline: 'When the priority stack stops working: the M15 SBS, fifteen years in.',
    deck: 'New York has spent more on this corridor than any other Select Bus route — bus lanes on three-quarters of its mileage, automated camera enforcement around the clock, signal priority at four in ten intersections. Over the past fourteen months, the M15 has slowed down anyway. This brief makes the case that the slowdown is structural, that it sits on Madison Avenue, and that the city\u2019s usual toolkit can\u2019t reach it.',
    author: { name: 'Maya Okafor', role: 'Senior Analyst' },
    coAuthor: { name: 'Diego Ramirez', role: 'Enforcement & Findings' },
    reviewer: { name: 'Jordan Bellamy', role: 'Editor at Large', initials: 'JB' },
  };

  // 14-month evening-rush speed trend
  const trend  = [7.9, 7.7, 7.6, 7.4, 7.1, 6.9, 6.8, 6.7, 6.8, 6.9, 6.8, 6.6, 6.4, 6.3];
  const labels = ['Apr 25', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan 26', 'Feb', 'Mar', 'Apr', 'May'];

  return (
    <div className="bpi" style={{
      width: BPUB_W, height: BPUB_H,
      display: 'flex', flexDirection: 'column',
      background: BPI.paper,
    }}>
      <StudioBar active="Briefs" breadcrumb={`Briefs / ${brief.edition} · M15 SBS`} />

      <div style={{ flex: 1, overflow: 'auto' }}>

        {/* ── HERO ───────────────────────────────────────────────── */}
        <div style={{ background: BPI.card, boxShadow: `inset 0 -1px 0 ${BPI.rule}` }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '8px 1fr',
            maxWidth: 1100, margin: '0 auto', padding: '72px 36px 60px',
            gap: 36,
          }}>
            <div style={{ background: brief.borColor, borderRadius: 2 }} />
            <div>
              {/* Edition tag */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28, flexWrap: 'wrap' }}>
                <span style={{
                  fontFamily: BPIMono, fontSize: 11.5, fontWeight: 700,
                  color: BPI.paper, background: BPI.ink,
                  padding: '5px 10px', borderRadius: 2,
                  letterSpacing: '0.08em',
                }}>{brief.edition.toUpperCase()}</span>
                <RouteBadge route={brief.route.route} sbs={brief.route.sbs} size="md" />
                <span style={{ fontSize: 12.5, color: BPI.ink55, fontWeight: 500 }}>
                  {brief.span}
                </span>
                <span style={{ width: 4, height: 4, borderRadius: 2, background: BPI.ink20 }} />
                <span style={{ fontSize: 12.5, color: BPI.ink55, fontFamily: BPIMono }}>
                  Published {brief.published} · {brief.readTime}
                </span>
              </div>

              {/* Headline */}
              <h1 style={{
                margin: 0,
                fontSize: 52, fontWeight: 600, letterSpacing: '-0.03em',
                lineHeight: 1.05, color: BPI.ink,
                maxWidth: 900, textWrap: 'balance', marginBottom: 24,
              }}>{brief.headline}</h1>

              {/* Deck */}
              <div style={{
                fontSize: 19, color: BPI.ink70, lineHeight: 1.55,
                maxWidth: 820, textWrap: 'pretty',
              }}>{brief.deck}</div>

              {/* Byline + actions */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 18,
                marginTop: 36, paddingTop: 22,
                boxShadow: `inset 0 1px 0 ${BPI.rule}`,
                flexWrap: 'wrap',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 18,
                    background: BPI.ink, color: BPI.paper,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 600,
                  }}>MO</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>By {brief.author.name}</div>
                    <div style={{ fontSize: 11, color: BPI.ink55 }}>{brief.author.role}</div>
                  </div>
                </div>
                <div style={{ width: 1, height: 28, background: BPI.rule }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 18,
                    background: BPI.paperDeep, color: BPI.ink,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 600,
                    border: `1px solid ${BPI.ink20}`,
                  }}>DR</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>with {brief.coAuthor.name}</div>
                    <div style={{ fontSize: 11, color: BPI.ink55 }}>{brief.coAuthor.role}</div>
                  </div>
                </div>
                <span style={{ flex: 1 }} />
                <Button variant="secondary" size="md">Share ↗</Button>
                <Button variant="secondary" size="md">Cite this brief</Button>
                <Button variant="primary" size="md">Download (PDF)</Button>
              </div>
            </div>
          </div>
        </div>

        {/* ── TL;DR — three pull-quote claims ────────────────────── */}
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '56px 36px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: BPI.ink55, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>The argument, in three sentences</div>
              <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.018em', lineHeight: 1.2, color: BPI.ink, maxWidth: 720 }}>
                The whole brief boils down to this. The body below shows the data behind each one.
              </div>
            </div>
            <span style={{ fontSize: 12, color: BPI.ink55, fontFamily: BPIMono }}>
              5 claims · 14 sources · approved May 12
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <BPubPullQuote n={1} text="The M15 SBS has lost 1.6 mph at evening rush over fourteen months — the steepest decline of any Select Bus route in the city." />
            <BPubPullQuote n={2} text="Three of thirteen timepoint segments — all on the southern half of the route — account for 53% of the rider-hours lost to delay." />
            <BPubPullQuote n={3} text="The two segments where treatment density is highest are slowing fastest. Enforcement isn\u2019t reaching the cause." />
          </div>
        </div>

        {/* ── KEY NUMBERS ────────────────────────────────────────── */}
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '56px 36px 12px' }}>
          <BPubSectionHeader
            kicker="The numbers"
            title="What this corridor looks like today."
            sub="All figures cover the past fourteen months of observed segment-level speed and ridership data. Speed is measured from the rider\u2019s seat — time at stops and lights included — and weighted by ridership when aggregated."
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 32 }}>
            <BPubBigStat
              value="6.3" unit="mph" tone="bad"
              label="Current evening-rush speed"
              sub="One mile per hour below scheduled. Seventh percentile among NYC SBS routes."
            />
            <BPubBigStat
              value="−1.6" unit="mph" tone="bad"
              label="Lost over 14 months"
              sub="Roughly half a mile per hour every year. No comparable corridor has fallen this far."
            />
            <BPubBigStat
              value="42K"
              label="Riders on a typical weekday"
              sub="Third-busiest local bus in the city. 34% pay reduced fare; median age 49."
            />
            <BPubBigStat
              value="4,310" unit="rider-hrs" tone="warn"
              label="Lost each weekday to slowdowns"
              sub="A regular five-day commuter now loses one full work week of time per year."
            />
          </div>
        </div>

        {/* ── BODY — five numbered claims ────────────────────────── */}
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 36px 0' }}>
          <BPubSectionHeader
            kicker="The argument"
            title="Five claims, each grounded in one source of evidence."
          />

          <BPubClaim
            n={1}
            title="The slowdown is real, statistically clear, and outside the pattern of comparable corridors."
            body={
              <>
                Evening-rush weighted speed on the M15 SBS has fallen in thirteen of the last fourteen months. The drop totals roughly 1.6 mph from its post-treatment plateau, putting the route at the seventh percentile of New York City SBS corridors today.
                <br /><br />
                The fall is not noise. A Mann-Kendall trend test on the route\u2019s monthly mean speeds returns p&nbsp;&lt;&nbsp;0.002 — the kind of one-direction trajectory you would expect from a structural change, not random variation. Comparable Select Bus corridors with the same enforcement stack reversed this pattern within sixty days of program activation. The M15 is one of two corridors to keep falling.
              </>
            }
            evidence={[
              { title: 'MTA Bus Speeds, segment-level', where: 'monthly aggregate · Apr 2025 – May 2026' },
              { title: 'NYC SBS percentile-of-speed cohort', where: 'studio internal projection · v3' },
              { title: 'M14A, M14D, Bx12 SBS comparable corridors', where: 'matched on length, treatment stack' },
            ]}
            chart={
              <div style={{
                background: BPI.card, padding: '22px 24px',
                boxShadow: `inset 0 0 0 1px ${BPI.rule}`, borderRadius: 4,
              }}>
                <div style={{ fontSize: 12, color: BPI.ink70, marginBottom: 14, fontWeight: 500 }}>
                  M15 SBS · evening-rush weighted speed, by month
                </div>
                <BPubMiniTrend data={trend} labels={labels} baseline={7.4} baselineLabel="scheduled · 7.4 mph" width={620} height={180} />
              </div>
            }
          />

          <BPubClaim
            n={2}
            title="Three corridors do most of the damage, and all three are on the southern half of the route."
            body={
              <>
                Of the thirteen timepoint-to-timepoint segments the M15 traverses, three of them — Madison Av from 28th to 58th Street, 1st Av from 14th to 34th, and 2nd Av from 42nd to 60th — together account for 53% of the rider-hours of delay we measure on the route each weekday.
                <br /><br />
                Two of those three segments have a bus lane, all-day enforcement, and a steady fall in violations. The third — Madison Avenue — has a painted lane only, no concrete buffer, and weekly violation counts that have barely moved in twelve months. It is also the slowest 1.5 miles of any Select Bus route in the city.
              </>
            }
            evidence={[
              { title: 'Route-slice delay exposure, top-3 segments', where: 'studio projection · M15 segment-month' },
              { title: 'ACE violation weekly counts by segment', where: 'MTA ACE program · downloaded 2026-05-08' },
              { title: 'NYC DOT bus-lane type classification', where: 'Q1 2026 lane-type GIS feed' },
            ]}
          />

          <BPubClaim
            n={3}
            title="Where the toolkit is densest, the slowdown is steepest."
            body={
              <>
                The intuition behind New York\u2019s bus-priority program is additive — every layer (lane, enforcement, signal priority) should compound the gains. On the M15 it does not. The two segments with the deepest stack of priority treatments (1 Av from 14th to 34th and 2 Av from 42nd to 60th) are also the segments where speed is falling fastest, year over year.
                <br /><br />
                We are careful here. This is not evidence that any one treatment failed. Each one made the corridor faster than it would have been without it. The pattern is consistent with a structural drag — congestion, construction, or signal-cycle pressure — that the toolkit was not designed to address.
              </>
            }
            evidence={[
              { title: 'Treatment-stack density × Δspeed by segment', where: 'studio cross-tab · M15 14-month window' },
              { title: 'NYC DOT bus-lane type and hours', where: 'matched DOT bus-lane records, Q1 2026' },
              { title: 'NYC DOT TSP status snapshot (2017)', where: 'caveat: dated source · used only for presence/absence' },
            ]}
          />

          <BPubClaim
            n={4}
            title="The slowdown began before congestion pricing — and continued through it."
            body={
              <>
                Congestion pricing on the Manhattan central business district launched in January 2025 and was billed by its proponents as a likely bus speed-up. On segments below 60th Street, we see a small, transient gain in the first six weeks — about 0.2 mph — that does not survive past March.
                <br /><br />
                Above 60th Street, where the pricing zone does not apply, speeds continue to fall at the same trajectory as before. The picture is consistent with no detectable effect from the pricing intervention on this corridor. Congestion pricing has done many things in the central business district. Speeding up the M15 is not one of them.
              </>
            }
            evidence={[
              { title: 'M15 NB segment speeds, split by CBD geometry', where: 'studio projection · M15 sub-corridor view' },
              { title: 'MTA GTFS route shape × CBD polygon overlay', where: 'studio join · CBD boundary v1' },
              { title: 'Citywide CBD entries (TLC)', where: 'context only · not used in headline number' },
            ]}
          />

          <BPubClaim
            n={5}
            title="No new tool from the existing program is likely to be enough. This corridor needs a structural decision."
            body={
              <>
                If we model the gain the M15 might see from an upgrade of Madison Av to concrete-buffered lane (the most likely next intervention given current DOT capital plans), we estimate a recovery of 0.3–0.6 mph in the affected window — back to roughly where the route stood a year ago, but not past it.
                <br /><br />
                The deeper choice is structural: whether to dedicate a continuous concrete-buffered lane along Madison and the southern half of 1st and 2nd Avenues, with paired signal-priority installation, and accept the parking, loading, and Vision Zero geometry tradeoffs that come with it. The current toolkit cannot reach the cause on its own.
              </>
            }
            evidence={[
              { title: 'M15 segment-level treatment counterfactual', where: 'descriptive estimate · not causal' },
              { title: 'DOT capital plan FY26–FY29 intersection inventory', where: 'NYC DOT public capital plan, Apr 2026' },
              { title: 'Comparable corridor lane-upgrade evaluations', where: 'M14A 2023 · Bx12 2022 · before/after windows' },
            ]}
          />
        </div>

        {/* ── COVERAGE BREAKDOWN ─────────────────────────────────── */}
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 36px 12px' }}>
          <BPubSectionHeader
            kicker="What\u2019s on this corridor"
            title="The priority stack, by share of route mileage."
            sub="The M15 SBS has more bus-priority infrastructure than almost any other route in New York. The map below isn\u2019t the problem; how the map maps to reality on Madison Avenue is."
          />
          <div style={{
            background: BPI.card, borderRadius: 4,
            boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
            padding: '28px 32px',
            display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 36,
          }}>
            <div>
              <BPubCoverageBar label="Bus lane — any type" value={72} color={BPI.accent}
                sub="Painted or concrete. Coverage above the SBS network median (61%)." />
              <BPubCoverageBar label="Concrete-buffered lane (subset)" value={18} color={BPI.good}
                sub="Below 23rd Street and around Houston. Speeds here held within 0.3 mph of schedule." />
              <BPubCoverageBar label="ACE camera enforcement" value={84} color={BPI.accent}
                sub="All-day since May 2025. Violations route-wide fell 68% YoY." />
              <BPubCoverageBar label="Signal priority (TSP)" value={42} color={BPI.warn}
                sub="At intersections, not segments. Concentrated above 57th Street." />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <MapThumb width={420} height={220} label="m15 sbs · south ferry ↔ e 126 st · 8.4 mi" emphasis={brief.borColor} />
              <div style={{ fontSize: 12.5, color: BPI.ink70, lineHeight: 1.6, textWrap: 'pretty' }}>
                The corridor stretches 8.4 miles down the East Side. Three of its slowest segments cluster between 28th and 60th Street — exactly where the lane drops from concrete to paint and TSP coverage falls off.
              </div>
            </div>
          </div>
        </div>

        {/* ── SO WHAT ─────────────────────────────────────────────── */}
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '56px 36px 8px' }}>
          <div style={{
            background: BPI.ink, color: BPI.paper,
            borderRadius: 4, padding: '48px 52px',
          }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: 'rgba(244,241,234,.55)',
              letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 14,
            }}>What this means for the city</div>
            <div style={{
              fontSize: 32, fontWeight: 600, letterSpacing: '-0.024em',
              lineHeight: 1.18, color: BPI.paper,
              maxWidth: 860, textWrap: 'balance', marginBottom: 22,
            }}>
              The M15 SBS is not a failure of any one tool. It is a test of whether the city\u2019s assembled toolkit can keep speeding up a fully-treated corridor that is still being slowed down by something the toolkit was not built to fix.
            </div>
            <div style={{
              fontSize: 15.5, color: 'rgba(244,241,234,.78)', lineHeight: 1.65,
              maxWidth: 800, textWrap: 'pretty',
            }}>
              On the data we publish, the answer so far is no. A continuous concrete-buffered lane along the southern half of the route, paired with the existing enforcement and signal priority, is the most likely intervention to recover ground. Anything short of that should be expected to bend the trend, not reverse it.
            </div>
          </div>
        </div>

        {/* ── EVIDENCE CATALOG ───────────────────────────────────── */}
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 36px 12px' }}>
          <BPubSectionHeader
            kicker="The evidence catalog"
            title="Every source used in this brief, with retrieval timestamps."
            sub="Each row points to a stable evidence ID in the studio\u2019s catalog. Click through for the raw row, the SQL projection, or the file artifact backing the number."
          />
          <div style={{
            background: BPI.card, borderRadius: 4,
            boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '60px 1fr 200px 140px 90px',
              gap: 18, padding: '12px 22px',
              background: BPI.paperDeep,
              boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
              fontSize: 9.5, color: BPI.ink55, letterSpacing: '0.08em',
              fontWeight: 700, textTransform: 'uppercase',
            }}>
              <span>Evidence</span>
              <span>Source</span>
              <span>Grain</span>
              <span>Retrieved</span>
              <span style={{ textAlign: 'right' }}>Use</span>
            </div>
            {[
              { id: 'EV-1041', src: 'MTA Bus Speeds (segment-level monthly aggregate)',           grain: 'segment-month',          ret: '2026-05-10', claims: 'C1, C2, C3' },
              { id: 'EV-1042', src: 'MTA Hourly Ridership (OMNY + MetroCard aggregate)',          grain: 'route-hour',             ret: '2026-05-08', claims: 'C1, C2' },
              { id: 'EV-1043', src: 'MTA ACE program (weekly violations, route × segment)',      grain: 'segment-week',           ret: '2026-05-08', claims: 'C2, C3' },
              { id: 'EV-1044', src: 'NYC DOT bus-lane GIS (Q1 2026 lane-type classification)',   grain: 'route-shape overlap',    ret: '2026-04-27', claims: 'C2, C3, C5' },
              { id: 'EV-1045', src: 'NYC DOT TSP status snapshot (2017)',                         grain: 'route × intersection',   ret: '2026-04-27', claims: 'C3 (caveated)' },
              { id: 'EV-1046', src: 'MTA GTFS schedule × CBD polygon overlay (studio join)',     grain: 'route segment × geom',   ret: '2026-05-10', claims: 'C4' },
              { id: 'EV-1047', src: 'NYC SBS percentile-of-speed cohort (studio projection v3)', grain: 'route-month',            ret: '2026-05-10', claims: 'C1' },
              { id: 'EV-1048', src: 'M14A 2023 lane-upgrade before/after evaluation',            grain: 'route-month',            ret: '2026-04-26', claims: 'C5' },
              { id: 'EV-1049', src: 'Bx12 2022 lane-upgrade before/after evaluation',            grain: 'route-month',            ret: '2026-04-26', claims: 'C5' },
              { id: 'EV-1050', src: 'DOT capital plan FY26–FY29 (intersection inventory)',       grain: 'capital line item',      ret: '2026-04-22', claims: 'C5 (context only)' },
            ].map((e, i, arr) => (
              <div key={e.id} style={{
                display: 'grid',
                gridTemplateColumns: '60px 1fr 200px 140px 90px',
                gap: 18, padding: '11px 22px', alignItems: 'baseline',
                boxShadow: i < arr.length - 1 ? `inset 0 -1px 0 ${BPI.rule}` : 'none',
                fontSize: 12.5,
              }}>
                <span className="num" style={{ fontFamily: BPIMono, color: BPI.accent, fontWeight: 700, fontSize: 11 }}>{e.id}</span>
                <span style={{ color: BPI.ink, fontWeight: 500 }}>{e.src}</span>
                <span style={{ color: BPI.ink55, fontFamily: BPIMono, fontSize: 11 }}>{e.grain}</span>
                <span style={{ color: BPI.ink70, fontFamily: BPIMono, fontSize: 11 }}>{e.ret}</span>
                <span style={{ color: BPI.ink55, fontFamily: BPIMono, fontSize: 10.5, textAlign: 'right' }}>{e.claims}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── REVIEW TRAIL ───────────────────────────────────────── */}
        <div style={{ background: BPI.paperDeep, boxShadow: `inset 0 1px 0 ${BPI.rule}`, marginTop: 56, padding: '48px 0' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 36px' }}>
            <BPubSectionHeader
              kicker="How this brief was reviewed"
              title="The audit trail."
              sub="Every brief on this site goes through editorial review before publication. The trail below lives in the studio\u2019s public review log and is permanently linked to the published artifact ID."
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 28 }}>
              {[
                {
                  who: 'Maya Okafor', initials: 'MO', role: 'Senior Analyst — primary author',
                  at: 'May 8, 2026 · 14:22 ET', state: 'submitted',
                  quote: '“Five claims, all grounded in single-source evidence. Madison Av framing held structural — paint vs. concrete — not enforcement failure.”',
                  color: BPI.accent,
                },
                {
                  who: 'Diego Ramirez', initials: 'DR', role: 'Co-author — enforcement & findings',
                  at: 'May 10, 2026 · 09:48 ET', state: 'co-signed',
                  quote: '“Confirmed treatment-stack × Δspeed cross-tab. ACE violation series cleared for use; segment-level attribution caveat retained in C2.”',
                  color: BPI.accent,
                },
                {
                  who: 'Jordan Bellamy', initials: 'JB', role: 'Editor at Large — review & approval',
                  at: 'May 12, 2026 · 11:05 ET', state: 'approved for publication',
                  quote: '“Argument is structural, not partisan. Language on congestion pricing kept descriptive. C5 explicitly non-causal. Approve.”',
                  color: BPI.good,
                },
              ].map((r) => (
                <div key={r.initials} style={{
                  background: BPI.card, borderRadius: 4,
                  boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
                  padding: '22px 24px',
                  display: 'flex', flexDirection: 'column', gap: 12,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 18,
                      background: BPI.ink, color: BPI.paper,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 600,
                    }}>{r.initials}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: BPI.ink }}>{r.who}</div>
                      <div style={{ fontSize: 11, color: BPI.ink55 }}>{r.role}</div>
                    </div>
                  </div>
                  <div style={{
                    fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em',
                    color: r.color, textTransform: 'uppercase',
                    padding: '4px 8px', background: r.color === BPI.good ? BPI.goodBg : BPI.accentBg,
                    borderRadius: 2, alignSelf: 'flex-start',
                  }}>{r.state}</div>
                  <div style={{
                    fontSize: 12.5, color: BPI.ink70, lineHeight: 1.6,
                    fontStyle: 'italic', textWrap: 'pretty',
                    padding: '10px 12px',
                    borderLeft: `3px solid ${r.color}`,
                    background: BPI.paperDeep,
                    borderRadius: '0 3px 3px 0',
                  }}>{r.quote}</div>
                  <div style={{
                    fontSize: 10.5, color: BPI.ink40, fontFamily: BPIMono,
                    marginTop: 'auto', paddingTop: 8,
                  }}>{r.at}</div>
                </div>
              ))}
            </div>

            {/* Artifact ID strip */}
            <div style={{
              marginTop: 28, padding: '14px 18px',
              background: BPI.card, borderRadius: 3,
              boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
              display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
              fontSize: 11.5, fontFamily: BPIMono, color: BPI.ink55,
            }}>
              <span style={{ color: BPI.ink40, fontWeight: 700, letterSpacing: '0.08em' }}>ARTIFACT</span>
              <span style={{ color: BPI.ink }}>brief_m15_sbs_2026_05_023</span>
              <span style={{ color: BPI.ink20 }}>·</span>
              <span>sha256:8a1f…c39e</span>
              <span style={{ color: BPI.ink20 }}>·</span>
              <span>release_2026_05_12</span>
              <span style={{ flex: 1 }} />
              <span style={{ color: BPI.accent, fontWeight: 600, cursor: 'pointer' }}>View full revision history →</span>
            </div>
          </div>
        </div>

        {/* ── RELATED BRIEFS ─────────────────────────────────────── */}
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '56px 36px 8px' }}>
          <BPubSectionHeader
            kicker="Related reading"
            title="Other briefs on this corridor and method."
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
            {[
              { edn: 'Brief 019', route: 'Bx12', sbs: true,  color: BPI.bx.bronx,    title: 'The Bx12 SBS, three years after concrete: what stuck and what didn\u2019t.', date: 'Mar 24, 2026' },
              { edn: 'Brief 017', route: 'M14A', sbs: true,  color: BPI.bx.manhattan,title: '14th Street\u2019s busway, five years in.',                          date: 'Feb 10, 2026' },
              { edn: 'Brief 014', route: 'B41',  sbs: false, color: BPI.bx.brooklyn, title: 'Flatbush Avenue without any of the city\u2019s priority tools.',     date: 'Dec 02, 2025' },
            ].map((b, i) => (
              <div key={i} style={{
                background: BPI.card, borderRadius: 4,
                boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
                display: 'grid', gridTemplateColumns: '6px 1fr',
                overflow: 'hidden',
                cursor: 'pointer',
              }}>
                <div style={{ background: b.color }} />
                <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      fontFamily: BPIMono, fontSize: 10, fontWeight: 700,
                      color: BPI.ink55, letterSpacing: '0.08em',
                    }}>{b.edn.toUpperCase()}</span>
                    <RouteBadge route={b.route} sbs={b.sbs} size="sm" />
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.012em', lineHeight: 1.3, color: BPI.ink, textWrap: 'pretty' }}>{b.title}</div>
                  <div style={{ fontSize: 11.5, color: BPI.ink55, fontFamily: BPIMono, marginTop: 'auto' }}>Published {b.date}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '32px 36px 36px',
          maxWidth: 1100, margin: '0 auto',
          fontSize: 11.5, color: BPI.ink55,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span>Bus Priority Impact Studio · A civic data project</span>
          <span style={{ color: BPI.ink20 }}>·</span>
          <span>This brief is CC&nbsp;BY 4.0 — cite freely</span>
          <span style={{ flex: 1 }} />
          <span>Share ↗</span>
          <span style={{ color: BPI.ink20 }}>·</span>
          <span>Cite (BibTeX)</span>
          <span style={{ color: BPI.ink20 }}>·</span>
          <span>Report an error</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { RF_BriefPublic });
