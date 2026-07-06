// findings.jsx — Findings feed · public-facing edition.
//
// Earlier draft had analyst chrome: an "◆ AI-ANALYZED" mono kicker, a
// chip-dense card row, mono "N sources" badges. Truthful, but cold.
// This version reframes the page as a weekly civic dispatch — a regular
// New Yorker (or journalist, or advocate) could land here cold and walk
// away with the finding intact.
//
// Structure:
//   • Header — issue date + plain-language title + small stat strip
//   • Sidebar — type + sort filters (kept; the shell works)
//   • Feed — one featured story up top, then a 2-up grid of cards
//
// Card language: route badge + borough + category as a single quiet meta
// line. Headline gets room. Body reads as prose. Metric is part of a
// hairline-separated footer, not a chip pile.

const FW = 1320, FH = 880;

const CATEGORY_META = {
  anomaly: {
    label: 'Anomaly',
    chip: 'ANOMALY',
    color: BPI.warn,
    bg: BPI.warnBg,
    desc: 'Behaving unexpectedly given treatments in place',
  },
  gap: {
    label: 'Treatment gap',
    chip: 'TREATMENT GAP',
    color: BPI.bad,
    bg: BPI.badBg,
    desc: 'Needs intervention that isn’t currently scheduled',
  },
  risk: {
    label: 'Emerging risk',
    chip: 'EMERGING RISK',
    color: BPI.accent,
    bg: BPI.accentBg,
    desc: 'Trending toward significant deterioration',
  },
};

// Borough color helper — mirrors RouteBadge's inference.
function findingBorColor(route) {
  const m = String(route).match(/^(BxM|BM|QM|Bx|SI|M|B|Q|S|X)/);
  const prefix = m ? m[1] : 'M';
  return ({
    M: BPI.bx.manhattan, Bx: BPI.bx.bronx, B: BPI.bx.brooklyn,
    Q: BPI.bx.queens, SI: BPI.bx.si, S: BPI.bx.si,
    X: BPI.bx.express, BM: BPI.bx.express, BxM: BPI.bx.express, QM: BPI.bx.express,
  })[prefix] || BPI.bx.manhattan;
}

const ALL_FINDINGS = [
  {
    id: 'f1',
    category: 'anomaly',
    route: 'M15', sbs: true,
    headline: 'The M15 has every tool to speed up. It’s still slowing down.',
    body: 'M15 SBS has bus lanes, all-day camera enforcement, and signal priority across 72% of its route — the best-equipped Select Bus corridor in Manhattan. Yet evening-rush speed has fallen 0.6 mph over fourteen months. Six of eight comparable routes recovered within sixty days of the same treatment. The Madison Av stretch shows no matching drop in violations.',
    metric: { val: '−0.6', unit: 'mph', label: 'PM-peak slowdown, 14 months' },
    trend: [6.8, 6.8, 6.7, 6.6, 6.55, 6.5, 6.5, 6.45, 6.4, 6.35, 6.3, 6.25, 6.2, 6.2],
    confidence: 'high',
    sources: 14,
    riderImpact: 'high',
    borough: 'Manhattan',
    featured: true,
  },
  {
    id: 'f2',
    category: 'anomaly',
    route: 'B41', sbs: false,
    headline: 'Fewer riders, but slower buses — the opposite of what we’d expect.',
    body: 'Ridership on the B41 is down 8% year-over-year, which usually means faster boarding and quicker trips. Instead, segment speeds are also declining. The pattern fits construction or signal-retiming events on the corridor, not a demand shift. No DOT intervention is currently logged here.',
    metric: { val: '↓ both', unit: '', label: 'Speed and ridership falling together' },
    confidence: 'moderate',
    sources: 7,
    riderImpact: 'medium',
    borough: 'Brooklyn',
  },
  {
    id: 'f3',
    category: 'gap',
    route: 'Bx12', sbs: true,
    headline: 'Eighteen months of camera enforcement. Violations look the same.',
    body: 'Automated enforcement has run on the Pelham Pkwy stretch of the Bx12 SBS since November 2023. Weekly violations are up 2% from pre-enforcement levels — essentially unchanged. On comparable corridors, the same program cuts violations 40 to 65% within three months. The likely explanation is structural blockage cameras alone cannot address.',
    metric: { val: '+2%', unit: '', label: 'Violations vs. pre-enforcement baseline' },
    confidence: 'high',
    sources: 9,
    riderImpact: 'high',
    borough: 'Bronx',
  },
  {
    id: 'f4',
    category: 'gap',
    route: 'M101', sbs: false,
    headline: 'The bus lane ends right where the slow blocks begin.',
    body: 'The M101 bus lane on 3rd Avenue terminates at E 59th Street — precisely where the route’s three slowest timepoints start. Lane coverage drops to 38% on those segments. No extension is funded in the FY26–28 capital plan, and neither signal priority nor enforcement fills the gap.',
    metric: { val: '38%', unit: '', label: 'Lane coverage on slowest segments' },
    confidence: 'high',
    sources: 4,
    riderImpact: 'medium',
    borough: 'Manhattan',
  },
  {
    id: 'f5',
    category: 'risk',
    route: 'B46', sbs: true,
    headline: 'Congestion pricing may be splitting this corridor in half.',
    body: 'The B46 SBS crosses the congestion-pricing boundary on Utica Avenue. Speed improved below the boundary after January 2025 — but worsened by 0.4 mph above it, likely as displaced traffic moves onto Brooklyn surface streets. No comparable displacement was flagged in the city’s FY25 congestion-pricing impact assessment.',
    metric: { val: '−0.4', unit: 'mph', label: 'Slowdown north of the cordon' },
    confidence: 'moderate',
    sources: 11,
    riderImpact: 'medium',
    borough: 'Brooklyn',
  },
  {
    id: 'f6',
    category: 'risk',
    route: 'Q58', sbs: false,
    headline: 'Three years of decline, and nothing on the books to fix it.',
    body: 'The Q58 has slowed steadily since 2023, with no bus lane, no enforcement, and no signal priority planned in any active capital cycle. At the current rate, it reaches the bottom decile of NYC local routes by Q3 2026. With 21,500 daily riders, the rider-hour impact will be material.',
    metric: { val: 'Q3 2026', unit: '', label: 'When the route hits the bottom decile' },
    confidence: 'moderate',
    sources: 6,
    riderImpact: 'high',
    borough: 'Queens',
  },
];

// ─────────────────────────────────────────────────────────────
// FindingsFeed — main view
// ─────────────────────────────────────────────────────────────
function FindingsFeed() {
  const [filter, setFilter] = React.useState('all');
  const [sort, setSort] = React.useState('impact');
  const [borough, setBorough] = React.useState('All');

  const categories = [
    { id: 'all',     label: 'All findings',     count: ALL_FINDINGS.length },
    { id: 'anomaly', label: 'Anomalies',        count: ALL_FINDINGS.filter((f) => f.category === 'anomaly').length },
    { id: 'gap',     label: 'Treatment gaps',   count: ALL_FINDINGS.filter((f) => f.category === 'gap').length },
    { id: 'risk',    label: 'Emerging risks',   count: ALL_FINDINGS.filter((f) => f.category === 'risk').length },
  ];
  const boroughs = ['All', 'Manhattan', 'Brooklyn', 'Bronx', 'Queens'];

  const filtered = ALL_FINDINGS
    .filter((f) => filter === 'all' || f.category === filter)
    .filter((f) => borough === 'All' || f.borough === borough);

  // Featured = first finding in the filtered set (M15 by default).
  const [featured, ...rest] = filtered;

  const highConf = ALL_FINDINGS.filter((f) => f.confidence === 'high').length;

  return (
    <div className="bpi" style={{ width: FW, height: FH, display: 'flex', flexDirection: 'column' }}>
      <StudioBar active="Findings" />

      {/* ── Page header ──────────────────────────────────────── */}
      <div style={{
        padding: '36px 36px 22px', background: BPI.card,
        boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 36 }}>
          <div style={{ flex: 1, maxWidth: 760 }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: BPI.ink55,
              letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 12,
            }}>
              Findings · Issue 47 · Week of May 12, 2026
            </div>
            <div style={{
              fontSize: 34, fontWeight: 600, letterSpacing: '-0.026em',
              lineHeight: 1.08, marginBottom: 12, textWrap: 'balance',
            }}>
              Where New York’s buses are stalling, and why.
            </div>
            <div style={{
              fontSize: 14.5, color: BPI.ink70, lineHeight: 1.55,
              textWrap: 'pretty', maxWidth: 660,
            }}>
              Notable speed patterns across all 340 NYC bus routes, surfaced weekly. Every finding traces back to the same public data the city uses — sources are linked on each story.
            </div>
          </div>

          {/* Right-side stat strip — replaces the old mono kicker */}
          <div style={{
            display: 'flex', gap: 36, flexShrink: 0,
            paddingTop: 4,
          }}>
            {[
              { v: filtered.length, l: 'this week' },
              { v: highConf, l: 'high confidence' },
              { v: 340, l: 'routes covered' },
            ].map((s) => (
              <div key={s.l} style={{ textAlign: 'right' }}>
                <div className="num" style={{
                  fontSize: 30, fontWeight: 600, color: BPI.ink,
                  letterSpacing: '-0.02em', lineHeight: 1,
                }}>{s.v}</div>
                <div style={{
                  fontSize: 11, color: BPI.ink55, marginTop: 8, lineHeight: 1.3,
                }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Borough filter row */}
        <div style={{
          display: 'flex', gap: 6, alignItems: 'center',
          marginTop: 26, paddingTop: 18,
          boxShadow: `inset 0 1px 0 ${BPI.rule}`,
        }}>
          <span style={{
            fontSize: 11, color: BPI.ink55, marginRight: 8,
            letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600,
          }}>Borough</span>
          {boroughs.map((b) => (
            <span key={b} className="chip" onClick={() => setBorough(b)} style={{
              cursor: 'pointer',
              ...(borough === b ? { background: BPI.ink, color: BPI.paper } : {}),
            }}>{b}</span>
          ))}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11.5, color: BPI.ink55 }}>
            Showing <strong style={{ color: BPI.ink }}>{filtered.length}</strong> of {ALL_FINDINGS.length}
          </span>
        </div>
      </div>

      {/* ── Body — sidebar + feed ─────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '210px 1fr' }}>

        {/* Sidebar */}
        <div style={{
          background: BPI.paper, boxShadow: `inset -1px 0 0 ${BPI.rule}`,
          padding: '24px 14px', display: 'flex', flexDirection: 'column', gap: 2, overflow: 'auto',
        }}>
          <div className="eyebrow" style={{ marginBottom: 10, paddingLeft: 8 }}>Type</div>
          {categories.map((c) => (
            <div key={c.id} onClick={() => setFilter(c.id)} style={{
              padding: '9px 10px', borderRadius: 3, cursor: 'pointer',
              background: filter === c.id ? BPI.ink : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              transition: 'background .1s',
            }}>
              <span style={{
                fontSize: 13, fontWeight: filter === c.id ? 600 : 400,
                color: filter === c.id ? BPI.paper : BPI.ink,
              }}>{c.label}</span>
              <span style={{
                fontSize: 11, fontWeight: 600, fontFamily: BPIMono,
                color: filter === c.id ? 'rgba(244,241,234,.55)' : BPI.ink40,
              }}>{c.count}</span>
            </div>
          ))}

          <div className="rule" style={{ margin: '18px 0' }} />
          <div className="eyebrow" style={{ marginBottom: 10, paddingLeft: 8 }}>Sort</div>
          {[['impact', 'Rider impact'], ['confidence', 'Confidence'], ['recent', 'Recently added']].map(([id, label]) => (
            <div key={id} onClick={() => setSort(id)} style={{
              padding: '8px 10px', borderRadius: 3, cursor: 'pointer',
              fontSize: 12.5,
              color: sort === id ? BPI.ink : BPI.ink55,
              fontWeight: sort === id ? 600 : 400,
              background: sort === id ? BPI.ink10 : 'transparent',
            }}>{label}</div>
          ))}

          <div style={{ flex: 1 }} />

          {/* About card — friendlier copy */}
          <div style={{
            padding: 14, background: BPI.card, borderRadius: 3,
            boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
            fontSize: 11.5, color: BPI.ink70, lineHeight: 1.6,
          }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: BPI.ink, marginBottom: 6 }}>
              How a finding ends up here
            </div>
            A route shows up when its behaviour drifts from what its bus-priority treatments would predict. The same public data the city uses backs every claim — and a human reviewer signs off before publication.
          </div>
        </div>

        {/* Feed */}
        <div style={{
          overflow: 'auto', padding: '28px 30px 40px',
          background: BPI.paper,
          display: 'flex', flexDirection: 'column', gap: 18,
        }}>
          {filtered.length === 0 && (
            <EmptyState
              title="No findings match this filter"
              body="Try a different borough or category. Findings refresh weekly as new speed data arrives."
              primary="Clear filters"
            />
          )}

          {featured && <FeaturedFindingCard f={featured} />}

          {rest.length > 0 && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 16,
            }}>
              {rest.map((f) => <FindingCard key={f.id} f={f} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FeaturedFindingCard — the lede story. Two-column: prose on the left,
// metric showcase + trend sparkline on the right.
// ─────────────────────────────────────────────────────────────
function FeaturedFindingCard({ f }) {
  const meta = CATEGORY_META[f.category];
  const borColor = findingBorColor(f.route);
  return (
    <div style={{
      background: BPI.card, borderRadius: 4,
      boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
      display: 'grid', gridTemplateColumns: '1.55fr 1fr',
      overflow: 'hidden', position: 'relative',
    }}>
      {/* Left edge color bar */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: 4, background: borColor,
      }} />

      {/* Left — story */}
      <div style={{ padding: '28px 32px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, color: BPI.accent,
            letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>Lead story</span>
          <span style={{ width: 3, height: 3, borderRadius: 1.5, background: BPI.ink20 }} />
          <RouteBadge route={f.route} sbs={f.sbs} size="md" />
          <span style={{ fontSize: 12, color: BPI.ink55 }}>
            {f.borough} · <span style={{ color: meta.color, fontWeight: 600 }}>{meta.label}</span>
          </span>
        </div>

        <div style={{
          fontSize: 28, fontWeight: 600, letterSpacing: '-0.024em',
          lineHeight: 1.15, marginBottom: 14, textWrap: 'balance',
        }}>
          {f.headline}
        </div>

        <div style={{
          fontSize: 14, color: BPI.ink70, lineHeight: 1.65,
          textWrap: 'pretty', marginBottom: 22,
        }}>
          {f.body}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="primary" size="md">Read full finding →</Button>
          <Button variant="secondary" size="md">Open {f.route} {f.sbs ? 'SBS' : ''}</Button>
        </div>
      </div>

      {/* Right — metric showcase */}
      <div style={{
        padding: '28px 32px',
        background: BPI.paperDeep,
        boxShadow: `inset 1px 0 0 ${BPI.rule}`,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 22,
      }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 14 }}>{f.metric.label}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, lineHeight: 1 }}>
            <span className="num" style={{
              fontSize: 60, fontWeight: 600, letterSpacing: '-0.035em', color: meta.color,
            }}>{f.metric.val}</span>
            {f.metric.unit && (
              <span style={{ fontSize: 22, color: BPI.ink55, fontWeight: 500 }}>{f.metric.unit}</span>
            )}
          </div>
        </div>

        {/* Trend sparkline */}
        {f.trend && (
          <div>
            <Spark data={f.trend} width={300} height={48} color={meta.color} fill />
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono,
              marginTop: 8, letterSpacing: '0.04em',
            }}>
              <span>mar 2025</span>
              <span style={{ color: BPI.ink40 }}>evening rush, mph</span>
              <span>apr 2026</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FindingCard — secondary story card. Reads like a magazine brief:
// borough-color rule at top, single meta line, headline gets room,
// prose body, hairline footer with metric + read link.
// ─────────────────────────────────────────────────────────────
function FindingCard({ f }) {
  const meta = CATEGORY_META[f.category];
  const borColor = findingBorColor(f.route);

  return (
    <div style={{
      background: BPI.card, borderRadius: 4,
      boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
      cursor: 'pointer',
    }}>
      {/* Top color rule */}
      <div style={{ height: 3, background: borColor }} />

      <div style={{
        padding: '22px 24px 18px', flex: 1,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Meta line — single, quiet */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <RouteBadge route={f.route} sbs={f.sbs} size="sm" />
          <span style={{ fontSize: 11.5, color: BPI.ink55 }}>{f.borough}</span>
          <span style={{ width: 3, height: 3, borderRadius: 1.5, background: BPI.ink20 }} />
          <span style={{ fontSize: 11.5, color: meta.color, fontWeight: 600 }}>{meta.label}</span>
          <div style={{ flex: 1 }} />
          {f.confidence === 'high' && (
            <span style={{
              fontSize: 10, fontWeight: 600, color: BPI.good,
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>High confidence</span>
          )}
          {f.confidence === 'moderate' && (
            <span style={{
              fontSize: 10, fontWeight: 600, color: BPI.ink55,
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>Moderate confidence</span>
          )}
        </div>

        {/* Headline */}
        <div style={{
          fontSize: 19, fontWeight: 600, letterSpacing: '-0.018em',
          lineHeight: 1.22, marginBottom: 12, textWrap: 'balance',
          color: BPI.ink,
        }}>
          {f.headline}
        </div>

        {/* Body */}
        <div style={{
          fontSize: 13, color: BPI.ink70, lineHeight: 1.65,
          textWrap: 'pretty', marginBottom: 18, flex: 1,
        }}>
          {f.body}
        </div>

        {/* Footer — metric + read link */}
        <div style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          gap: 14, paddingTop: 14,
          boxShadow: `inset 0 1px 0 ${BPI.rule}`,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, lineHeight: 1 }}>
              <span className="num" style={{
                fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', color: meta.color,
              }}>{f.metric.val}</span>
              {f.metric.unit && (
                <span style={{ fontSize: 13, color: BPI.ink55, fontWeight: 500 }}>{f.metric.unit}</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: BPI.ink55, marginTop: 6, lineHeight: 1.4, maxWidth: 240 }}>
              {f.metric.label}
            </div>
          </div>
          <span style={{
            fontSize: 12.5, color: BPI.ink, fontWeight: 600,
            paddingBottom: 4, flexShrink: 0,
          }}>
            Read finding →
          </span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FindingDetail — kept as-is: the original reasoning-trail page.
// (The public-facing detail page lives in finding-detail-audit.jsx.)
// ─────────────────────────────────────────────────────────────
function FindingDetail() {
  const f = ALL_FINDINGS[0];
  const meta = CATEGORY_META[f.category];

  const steps = [
    {
      step: '01',
      label: 'Observed behavior',
      text: 'M15 SBS PM-peak speed: 6.2 mph (Mar 2026 median). Route-wide 14-month trend: −0.6 mph.',
      src: 'MTA Bus Speeds · segment-level · Mar 2026',
      tone: 'ink',
    },
    {
      step: '02',
      label: 'Treatment inventory',
      text: 'Bus lane (72% of route), ACE enforcement (active since Nov 2019, extended to all-day May 2025), TSP (partial).',
      src: 'NYC DOT bus lane GIS · MTA ACE program record',
      tone: 'ink',
    },
    {
      step: '03',
      label: 'Expected behavior',
      text: 'Routes with this treatment stack typically stabilize or improve within 60 days of full enforcement. 6 of 8 comparable routes did so.',
      src: 'Internal comparison · 8 SBS routes, 2019–2026',
      tone: 'ink',
    },
    {
      step: '04',
      label: 'Gap identified',
      text: 'Madison Av segment (E 28–58 St) shows no correlated violation reduction despite adjacent ACE coverage. Lane is painted-only on the southern third — not concrete.',
      src: 'MTA ACE violations · NYC DOT lane type classification',
      tone: 'warn',
    },
    {
      step: '05',
      label: 'Conclusion',
      text: 'Structural lane-blockage on Madison Av is the most consistent explanation (seen in 4/8 comparable anomalies). Signal timing lag is second (2/8).',
      src: 'Pattern match across anomaly library · May 2026',
      tone: 'accent',
    },
  ];

  return (
    <div className="bpi" style={{ width: FW, height: FH, display: 'flex', flexDirection: 'column' }}>
      <StudioBar active="Findings" breadcrumb="Findings / M15 SBS — full treatment stack, still declining" />

      <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 340px' }}>

        <div style={{ overflow: 'auto', padding: '28px 36px', display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <RouteBadge route="M15" sbs size="lg" />
            <span style={{
              fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em',
              padding: '2px 7px', background: meta.bg, color: meta.color, borderRadius: 2,
            }}>{meta.chip}</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.15, marginBottom: 6, maxWidth: 680 }}>
            {f.headline}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
            <span style={{ fontSize: 10, fontFamily: BPIMono, fontWeight: 700, color: BPI.ink55 }}>◆ AI reasoning trail</span>
            <span style={{ fontSize: 10, color: BPI.ink40, fontFamily: BPIMono }}>{f.sources} sources · high confidence</span>
          </div>

          <div style={{ position: 'relative', paddingLeft: 32 }}>
            <div style={{
              position: 'absolute', left: 9, top: 8, bottom: 8,
              width: 1, background: BPI.rule,
            }} />

            {steps.map((s, i) => {
              const dotColor = s.tone === 'warn' ? BPI.warn : s.tone === 'accent' ? BPI.accent : BPI.ink40;
              return (
                <div key={i} style={{ position: 'relative', marginBottom: 28 }}>
                  <div style={{
                    position: 'absolute', left: -32, top: 4,
                    width: 10, height: 10, borderRadius: 5,
                    background: dotColor,
                    boxShadow: `0 0 0 3px ${BPI.paper}`,
                  }} />
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: BPI.ink55,
                    fontFamily: BPIMono, letterSpacing: '0.04em', marginBottom: 4,
                  }}>
                    {s.step} · {s.label}
                  </div>
                  <div style={{
                    fontSize: 14, color: BPI.ink, lineHeight: 1.55, marginBottom: 6,
                    fontWeight: s.tone === 'accent' ? 500 : 400,
                  }}>
                    {s.text}
                  </div>
                  <div style={{
                    fontSize: 11, color: BPI.ink55, fontFamily: BPIMono,
                    padding: '4px 8px', background: BPI.ink06, borderRadius: 3,
                    display: 'inline-block',
                  }}>
                    {s.src}
                  </div>
                </div>
              );
            })}
          </div>

          <Caveat tone="warn" title="What this finding cannot tell you">
            The congestion pricing launch (Jan 2025) coincides with part of the observation window.
            This finding controls for ACE-segment-specific data only — route-wide congestion effects
            are not disaggregated here. Use the route view to inspect individual segment trends.
          </Caveat>
        </div>

        <div style={{
          background: BPI.paper, boxShadow: `inset 1px 0 0 ${BPI.rule}`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            padding: '24px 24px 20px', background: BPI.card,
            boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
          }}>
            <div className="num" style={{ fontSize: 40, fontWeight: 700, color: meta.color, letterSpacing: '-0.03em', lineHeight: 1 }}>
              −0.6 <span style={{ fontSize: 16, fontWeight: 500 }}>mph</span>
            </div>
            <div style={{ fontSize: 12, color: BPI.ink55, marginTop: 6 }}>PM-peak trend over 14 months</div>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              <Button variant="primary" size="md" full>Open M15 SBS route →</Button>
              <Button variant="secondary" size="md" full>Start brief from this finding</Button>
              <Button variant="ghost" size="sm" full>Save to workspace</Button>
            </div>

            <div className="rule" style={{ marginBottom: 20 }} />

            <div className="eyebrow" style={{ marginBottom: 12 }}>Comparable routes</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { route: 'M14A', sbs: true, outcome: 'Reversed', delta: '+0.8 mph', tone: 'good', note: 'ACE activated May 2023' },
                { route: 'M14D', sbs: true, outcome: 'Reversed', delta: '+0.5 mph', tone: 'good', note: 'ACE activated May 2023' },
                { route: 'Bx41', sbs: true, outcome: 'Flat',     delta: '±0.1 mph', tone: 'warn', note: '18 months post-ACE' },
                { route: 'B46',  sbs: true, outcome: 'Reversed', delta: '+0.3 mph', tone: 'good', note: 'ACE + TSP together' },
              ].map((r, i) => (
                <div key={i} style={{
                  padding: '10px 12px', background: BPI.card, borderRadius: 3,
                  boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
                  display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'center',
                }}>
                  <RouteBadge route={r.route} sbs={r.sbs} size="sm" />
                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 500, color: BPI.ink }}>{r.outcome}</div>
                    <div style={{ fontSize: 10, color: BPI.ink55 }}>{r.note}</div>
                  </div>
                  <div className="num" style={{
                    fontSize: 12, fontWeight: 700,
                    color: r.tone === 'good' ? BPI.good : r.tone === 'warn' ? BPI.warn : BPI.bad,
                  }}>{r.delta}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { FindingsFeed, FindingDetail });
