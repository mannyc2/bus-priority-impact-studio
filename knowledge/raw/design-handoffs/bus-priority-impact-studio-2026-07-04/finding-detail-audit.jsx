// finding-detail-audit.jsx — Finding detail · v2 · public-facing edition.
//
// Earlier draft was an audit dossier: every contract field surfaced as
// monospace, hashes and role chips dominant. Truthful, but unreadable.
// This version reframes the page as a public-facing story — the kind of
// page a journalist, advocate, or rider could land on cold and walk away
// with the finding intact. The audit content still lives here, but in a
// trust strip near the bottom, not the lede.
//
// Editorial structure:
//   1. Hero — borough color stripe · plain-language headline · lede
//   2. Three key numbers — oversized, no chart chrome
//   3. What we found — three explanatory cards, prose first
//   4. How this compares — sparkline row across 4 similar corridors
//   5. About this corridor — friendly route fact sheet
//   6. How we know this — methods + reviewer in one trust strip

const FDP_W = 1320, FDP_H = 1800;

// Reuse the M15 SBS payload from the public-facing rewrite.
const FDP_FINDING = {
  id: 'fnd_2026_05_12_m15sbs_pm_anomaly_03',
  route: 'M15', sbs: true, borough: 'Manhattan',
  span: 'South Ferry ↔ E 126 St',
  borColor: BPI.bx.manhattan,
  category: 'anomaly',
  scanned: 'May 12, 2026',
  reviewer: { name: 'M. Okafor', role: 'Senior Analyst, Bus Priority Studio', at: 'May 12, 2026' },
  headline: 'The M15 has every tool the city uses to speed up buses. It’s still slowing down.',
  lede: 'Despite a bus lane on 72% of its route, all-day camera enforcement, and traffic-signal priority at four in ten intersections, the M15 Select Bus Service has lost six-tenths of a mile per hour during the evening rush over the past 14 months. The slowdown points to a structural problem on Madison Avenue that enforcement alone cannot fix.',
};

// ─────────────────────────────────────────────────────────────
// Atoms
// ─────────────────────────────────────────────────────────────

// Big editorial number — the headline-stat unit used in the key-facts row.
function FDPBigStat({ value, unit, label, sub, tone }) {
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

// Editorial section header
function FDPHeader({ kicker, title, sub }) {
  return (
    <div style={{ marginBottom: 22 }}>
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
  );
}

// Finding card — one explanatory paragraph with a quiet source line.
function FDPFindingCard({ n, title, body, src, accent }) {
  return (
    <div style={{
      background: BPI.card, borderRadius: 4,
      boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
      padding: '26px 26px 22px',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="num" style={{
          fontSize: 13, fontWeight: 700, letterSpacing: '0.04em',
          color: accent || BPI.accent, fontFamily: BPIMono,
        }}>0{n}</span>
        <div style={{ flex: 1, height: 1, background: BPI.rule }} />
      </div>
      <div style={{
        fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em',
        lineHeight: 1.3, color: BPI.ink, textWrap: 'pretty',
      }}>{title}</div>
      <div style={{
        fontSize: 13.5, color: BPI.ink70, lineHeight: 1.65,
        textWrap: 'pretty',
      }}>{body}</div>
      <div style={{
        marginTop: 'auto', paddingTop: 12,
        boxShadow: `inset 0 1px 0 ${BPI.rule}`,
        fontSize: 11, color: BPI.ink55, lineHeight: 1.5,
      }}>
        <span style={{
          fontFamily: BPIMono, color: BPI.ink40,
          letterSpacing: '0.06em', marginRight: 8,
        }}>SOURCE</span>
        {src}
      </div>
    </div>
  );
}

// Comparable corridor row — sparkline + outcome
function FDPCompareRow({ route, sbs, sched, line, outcome, tone, note, current }) {
  const color = tone === 'good' ? BPI.good : tone === 'warn' ? BPI.warn : tone === 'bad' ? BPI.bad : BPI.ink70;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '110px 1fr 220px 130px',
      gap: 20, alignItems: 'center',
      padding: '18px 4px',
      boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
      background: current ? BPI.ink06 : 'transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <RouteBadge route={route} sbs={sbs} size="md" />
      </div>
      <div style={{ position: 'relative' }}>
        <Spark data={line} width={420} height={36} color={color} fill baseline={sched} />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: BPI.ink }}>{outcome}</div>
        <div style={{ fontSize: 11.5, color: BPI.ink55, marginTop: 2, lineHeight: 1.4 }}>{note}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        {current ? (
          <span style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em',
            color: BPI.ink, padding: '4px 10px',
            background: BPI.paper, border: `1px solid ${BPI.ink20}`,
            borderRadius: 2,
          }}>THIS ROUTE</span>
        ) : (
          <span style={{
            fontSize: 12.5, color: BPI.ink55, cursor: 'pointer',
            textDecoration: 'underline', textDecorationColor: BPI.ink20,
          }}>View →</span>
        )}
      </div>
    </div>
  );
}

// Treatment coverage card — used in the route fact sheet
function FDPTreatmentItem({ label, value, sub }) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 6 }}>{label}</div>
      <div className="num" style={{
        fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em',
        color: BPI.ink, lineHeight: 1,
      }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 11.5, color: BPI.ink55, marginTop: 6, lineHeight: 1.45 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FindingDetailAudit — the public-facing finding page
// ─────────────────────────────────────────────────────────────
function FindingDetailAudit() {
  const f = FDP_FINDING;

  // 14-month trend lines (one value per month). The "this route" line
  // declines, the comparable lines mostly recover after their treatment.
  const m15Line   = [6.8, 6.8, 6.7, 6.65, 6.6, 6.55, 6.5, 6.45, 6.4, 6.35, 6.3, 6.25, 6.2, 6.2];
  const m14ALine  = [5.9, 6.1, 6.4, 6.5, 6.6, 6.6, 6.7, 6.7, 6.7, 6.75, 6.7, 6.7, 6.75, 6.7];
  const m14DLine  = [6.1, 6.2, 6.3, 6.4, 6.4, 6.45, 6.5, 6.5, 6.5, 6.5, 6.55, 6.6, 6.6, 6.6];
  const bx41Line  = [6.5, 6.45, 6.5, 6.5, 6.55, 6.5, 6.55, 6.5, 6.6, 6.55, 6.6, 6.55, 6.6, 6.6];
  const b46Line   = [6.3, 6.35, 6.4, 6.45, 6.5, 6.5, 6.55, 6.55, 6.6, 6.6, 6.6, 6.6, 6.6, 6.6];

  return (
    <div className="bpi" style={{
      width: FDP_W, height: FDP_H,
      display: 'flex', flexDirection: 'column',
      background: BPI.paper,
    }}>
      <StudioBar active="Findings" breadcrumb={`Findings / ${f.route} ${f.sbs ? 'SBS' : ''}`} />

      <div style={{ flex: 1, overflow: 'auto' }}>

        {/* ── HERO ──────────────────────────────────────────────── */}
        <div style={{ background: BPI.card, boxShadow: `inset 0 -1px 0 ${BPI.rule}` }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '8px 1fr',
            maxWidth: 1180, margin: '0 auto', padding: '64px 36px 56px',
            gap: 36,
          }}>
            <div style={{ background: f.borColor, borderRadius: 2 }} />
            <div>
              {/* Tag row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
                <RouteBadge route={f.route} sbs={f.sbs} size="lg" />
                <span style={{ fontSize: 13, color: BPI.ink55, fontWeight: 500 }}>
                  {f.borough} · {f.span}
                </span>
                <span style={{ width: 4, height: 4, borderRadius: 2, background: BPI.ink20 }} />
                <span style={{ fontSize: 13, color: BPI.ink55 }}>
                  Published {f.scanned}
                </span>
              </div>

              {/* Headline */}
              <div style={{
                fontSize: 46, fontWeight: 600, letterSpacing: '-0.03em',
                lineHeight: 1.08, color: BPI.ink,
                maxWidth: 900, textWrap: 'balance', marginBottom: 22,
              }}>
                {f.headline}
              </div>

              {/* Lede */}
              <div style={{
                fontSize: 18, color: BPI.ink70, lineHeight: 1.55,
                maxWidth: 760, textWrap: 'pretty',
              }}>
                {f.lede}
              </div>

              {/* Byline + actions */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 24,
                marginTop: 32, paddingTop: 22,
                boxShadow: `inset 0 1px 0 ${BPI.rule}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 16,
                    background: BPI.ink, color: BPI.paper,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11.5, fontWeight: 600,
                  }}>MO</div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>Reviewed by {f.reviewer.name}</div>
                    <div style={{ fontSize: 11, color: BPI.ink55 }}>{f.reviewer.role}</div>
                  </div>
                </div>
                <div style={{ flex: 1 }} />
                <Button variant="primary" size="md">Open M15 SBS route →</Button>
                <Button variant="secondary" size="md">Start a brief from this</Button>
              </div>
            </div>
          </div>
        </div>

        {/* ── KEY NUMBERS ───────────────────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 36px 8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 48 }}>
            <FDPBigStat
              value="−0.6"
              unit="mph"
              tone="bad"
              label="Slower at the evening rush than 14 months ago"
              sub="That is a 9% drop in speed where the route is already moving at jogging pace."
            />
            <FDPBigStat
              value="470K"
              unit="hrs"
              tone="warn"
              label="Rider-hours lost each year, route-wide"
              sub="Time spent on the bus beyond what the schedule promises — about a full work-week per regular rider, annually."
            />
            <FDPBigStat
              value="6 of 8"
              label="Similar Select Bus routes sped up after camera enforcement turned on"
              sub="The M15 is one of two outliers. Every other route in its peer group reversed within sixty days."
            />
          </div>
        </div>

        {/* ── WHAT WE FOUND ─────────────────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 36px 20px' }}>
          <FDPHeader
            kicker="What we found"
            title="Three signals, pointing in the same direction."
            sub="Each card below is one piece of the picture. Together they suggest the slowdown is structural — the kind enforcement alone cannot fix."
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginTop: 12 }}>
            <FDPFindingCard
              n={1}
              accent={f.borColor}
              title="The slowdown is steady, not a one-off."
              body="Evening-rush speed on the M15 has fallen in a near-straight line since early 2025 — about half a mile per hour per year. A linear trend that strong, across fourteen months of data, is unlikely to be noise: the chance of seeing it by accident is less than one in a hundred."
              src="MTA Bus Speeds, daily aggregates, March 2025 – April 2026"
            />
            <FDPFindingCard
              n={2}
              accent={f.borColor}
              title="Camera enforcement isn’t cutting violations on Madison."
              body="When automated bus-lane enforcement expanded to all-day in May 2025, weekly violations on the Madison Av segment went from 52 to 51. Effectively unchanged. On comparable corridors, the same program cut violations by forty to sixty-five percent within a quarter."
              src="MTA Automated Camera Enforcement program, weekly violations"
            />
            <FDPFindingCard
              n={3}
              accent={f.borColor}
              title="The painted lane on the southern third may be why."
              body="The bus lane on Madison Av between 28th and 58th Street is paint-only — no concrete buffer, no physical separation from car traffic. Cameras can ticket vehicles, but they cannot prevent the lane from being blocked in the first place. The other two-thirds of the corridor, with concrete-buffered lanes, do not show the same pattern."
              src="NYC DOT bus-lane GIS classification, Q1 2026 snapshot"
            />
          </div>
        </div>

        {/* ── HOW THIS COMPARES ─────────────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 36px 20px' }}>
          <FDPHeader
            kicker="How this compares"
            title="Speed trends on similar Select Bus corridors, 14 months."
            sub="Comparable routes share the same treatment stack — bus lane, automated enforcement, signal priority. They went one way. The M15 went the other."
          />
          <div style={{
            background: BPI.card, padding: '8px 22px',
            boxShadow: `inset 0 0 0 1px ${BPI.rule}`, borderRadius: 4,
          }}>
            <FDPCompareRow current
              route={f.route} sbs={f.sbs} sched={7.4}
              line={m15Line} tone="bad"
              outcome="Declining"
              note="Speed down 0.6 mph over 14 months."
            />
            <FDPCompareRow
              route="M14A" sbs sched={7.0}
              line={m14ALine} tone="good"
              outcome="Reversed"
              note="ACE activated May 2023; +0.8 mph since."
            />
            <FDPCompareRow
              route="M14D" sbs sched={7.0}
              line={m14DLine} tone="good"
              outcome="Reversed"
              note="ACE activated May 2023; +0.5 mph since."
            />
            <FDPCompareRow
              route="Bx41" sbs sched={6.8}
              line={bx41Line} tone="warn"
              outcome="Flat"
              note="18 months post-ACE, no clear direction."
            />
            <FDPCompareRow
              route="B46" sbs sched={6.7}
              line={b46Line} tone="good"
              outcome="Reversed"
              note="ACE + signal priority together; +0.3 mph."
            />
          </div>
        </div>

        {/* ── ABOUT THIS CORRIDOR ───────────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 36px 20px' }}>
          <FDPHeader
            kicker="About this corridor"
            title="The M15 SBS, in plain numbers."
          />
          <div style={{
            background: BPI.card, borderRadius: 4,
            boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
            padding: '32px 36px',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 36, marginBottom: 28 }}>
              <FDPTreatmentItem
                label="Daily riders"
                value="42,100"
                sub="Third-busiest local route in the city."
              />
              <FDPTreatmentItem
                label="Current speed"
                value="6.2 mph"
                sub="Schedule promises 7.4 mph at the same hour."
              />
              <FDPTreatmentItem
                label="Bus lane coverage"
                value="72%"
                sub="Of the route mileage, concrete or painted."
              />
              <FDPTreatmentItem
                label="Camera enforcement"
                value="84%"
                sub="Of the route, all-day since May 2025."
              />
            </div>
            <div className="rule" style={{ marginBottom: 28 }} />
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 36 }}>
              <div style={{ flex: 1 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>What this means for a typical rider</div>
                <div style={{ fontSize: 14, color: BPI.ink70, lineHeight: 1.65, maxWidth: 640, textWrap: 'pretty' }}>
                  A weekday round-trip on the M15 SBS now takes about eight minutes longer than it did fourteen months ago. Multiplied across 42,000 riders a day, that adds up to roughly 470,000 rider-hours of lost time per year — and the curve is still bending the wrong way.
                </div>
              </div>
              <div style={{ width: 240, flexShrink: 0 }}>
                <MapThumb width={240} height={130} label="madison av · 28–58 st" emphasis={f.borColor} />
                <div style={{ fontSize: 10.5, color: BPI.ink55, marginTop: 6, fontFamily: BPIMono, textAlign: 'right' }}>
                  segment in focus
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── HOW WE KNOW THIS — trust strip ────────────────────── */}
        <div style={{
          background: BPI.paperDeep,
          boxShadow: `inset 0 1px 0 ${BPI.rule}`,
          marginTop: 48, padding: '40px 0',
        }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 36px' }}>
            <FDPHeader
              kicker="How we know this"
              title="The data, the review, and the audit trail."
            />
            <div style={{
              display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 28,
            }}>

              {/* Methods */}
              <div>
                <div className="eyebrow" style={{ marginBottom: 12 }}>Methodology</div>
                <div style={{ fontSize: 13, color: BPI.ink70, lineHeight: 1.65, textWrap: 'pretty' }}>
                  This finding compares the M15’s speed trend against eight Select Bus corridors with similar enforcement and lane treatment. The slowdown is measured during evenings (4 PM – 7 PM) only, where ridership and congestion are highest. The comparison controls for route length and ACE activation date.
                </div>
                <div style={{ marginTop: 14, display: 'flex', gap: 14, alignItems: 'center', fontSize: 12, color: BPI.ink55 }}>
                  <span style={{ color: BPI.accent, fontWeight: 600, cursor: 'pointer' }}>Read full methodology →</span>
                  <span style={{ width: 4, height: 4, borderRadius: 2, background: BPI.ink20 }} />
                  <span style={{ color: BPI.accent, fontWeight: 600, cursor: 'pointer' }}>Download data (CSV)</span>
                </div>
              </div>

              {/* Sources */}
              <div>
                <div className="eyebrow" style={{ marginBottom: 12 }}>Data sources</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { src: 'MTA Bus Speeds', sub: 'segment-level, daily aggregates' },
                    { src: 'MTA Automated Camera Enforcement', sub: 'weekly violation counts' },
                    { src: 'NYC DOT bus-lane GIS', sub: 'Q1 2026 lane-type classification' },
                    { src: 'NYC DOT signal-timing log', sub: 'TSP intersection roster' },
                    { src: 'MTA Hourly Ridership', sub: 'OMNY + MetroCard aggregate' },
                  ].map((s, i) => (
                    <div key={i} style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                      <div style={{ fontWeight: 500, color: BPI.ink }}>{s.src}</div>
                      <div style={{ color: BPI.ink55, fontSize: 11.5 }}>{s.sub}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Review trail */}
              <div>
                <div className="eyebrow" style={{ marginBottom: 12 }}>Review</div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 18, flexShrink: 0,
                    background: BPI.ink, color: BPI.paper,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 600,
                  }}>MO</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{f.reviewer.name}</div>
                    <div style={{ fontSize: 11, color: BPI.ink55 }}>{f.reviewer.role}</div>
                    <div style={{ fontSize: 11, color: BPI.ink55, marginTop: 2 }}>Approved {f.reviewer.at}</div>
                  </div>
                </div>
                <div style={{
                  fontSize: 12, color: BPI.ink70, lineHeight: 1.6,
                  padding: 12, background: BPI.card,
                  borderLeft: `3px solid ${BPI.good}`, borderRadius: '0 3px 3px 0',
                  textWrap: 'pretty',
                }}>
                  “Detector output matches the segment-level evidence. Approve for public use, framed as a structural lane condition — not an enforcement-program failure.”
                </div>
                <div style={{
                  marginTop: 14, display: 'flex', alignItems: 'center', gap: 10,
                  fontSize: 11, color: BPI.ink40, fontFamily: BPIMono,
                }}>
                  <span>ID {f.id.slice(-12)}</span>
                  <span style={{ color: BPI.ink20 }}>·</span>
                  <span style={{ color: BPI.accent, cursor: 'pointer', fontWeight: 600 }}>View full audit trail →</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer line */}
        <div style={{
          padding: '20px 36px 28px',
          maxWidth: 1180, margin: '0 auto',
          fontSize: 11.5, color: BPI.ink55,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span>Bus Priority Impact Studio · A civic data project</span>
          <span style={{ flex: 1 }} />
          <span>Share this finding ↗</span>
          <span style={{ color: BPI.ink20 }}>·</span>
          <span>Cite</span>
          <span style={{ color: BPI.ink20 }}>·</span>
          <span>Report an error</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { FindingDetailAudit });
