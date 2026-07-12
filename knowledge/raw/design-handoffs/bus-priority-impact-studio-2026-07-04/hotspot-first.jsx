// Hotspot-first concept: ranked feed of worst segments → segment detail → roll-up brief.
// Triage-style. Severity-led, not search-led.

const HW = 1320, HHGT = 880;

// ─────────────────────────────────────────────────────────────
// Screen 1 — Hotspot home (ranked feed)
// ─────────────────────────────────────────────────────────────
function HS_Home() {
  // ── Configurable rank axis ────────────────────────────────────
  // "Chart as search tool" pattern: let analysts reconfigure which
  // metric drives the ranking so they can hunt for different kinds
  // of outliers. Segments extreme on any given metric are often the
  // most actionable ones — the axis choice IS the research question.
  const [rankBy, setRankBy] = React.useState('riderHours');
  const hotspots = [
    {
      rank: 1, sev: 94, dir: 'NB',
      from: 'Madison Av / E 28 St', to: 'Madison Av / E 58 St',
      route: 'M15', sbs: true, alsoRoutes: ['M101', 'M102', 'M103'],
      mph: 4.2, sched: 7.1,
      riderHours: 18420, ridersMo: 207870,
      ace: 'partial', lane: 'partial',
      hours: ham(0.85),
      delta14: -0.6,
      spark: trend(7.1, -0.04, 14, 0.05),
    },
    {
      rank: 2, sev: 89, dir: 'NB',
      from: '1 Av / E 14 St', to: '1 Av / E 34 St',
      route: 'M15', sbs: true, alsoRoutes: ['M14A'],
      mph: 4.9, sched: 7.6,
      riderHours: 14110, ridersMo: 156430,
      ace: 'yes', lane: 'yes',
      hours: ham(0.78),
      delta14: -0.3,
      spark: trend(7.8, -0.025, 14, 0.04),
    },
    {
      rank: 3, sev: 86, dir: 'WB',
      from: 'Flatbush Av / Av H', to: 'Flatbush Av / Empire Bl',
      route: 'B41', sbs: false, alsoRoutes: ['B44'],
      mph: 5.0, sched: 8.0,
      riderHours: 12640, ridersMo: 138210,
      ace: 'no', lane: 'partial',
      hours: ham(0.75, 0.55, 0.7),
      delta14: -0.5,
      spark: trend(7.3, -0.03, 14, 0.04),
    },
    {
      rank: 4, sev: 81, dir: 'EB',
      from: 'Fordham Rd / Grand Concourse', to: 'Fordham Rd / Webster Av',
      route: 'Bx12', sbs: true, alsoRoutes: ['Bx9'],
      mph: 5.4, sched: 8.4,
      riderHours: 11820, ridersMo: 128400,
      ace: 'yes', lane: 'yes',
      hours: ham(0.6, 0.7, 0.65),
      delta14: +0.1,
      spark: trend(8.0, 0.005, 14, 0.05),
    },
    {
      rank: 5, sev: 78, dir: 'SB',
      from: '2 Av / E 60 St', to: '2 Av / E 42 St',
      route: 'M15', sbs: true, alsoRoutes: [],
      mph: 5.2, sched: 7.8,
      riderHours: 11410, ridersMo: 122110,
      ace: 'yes', lane: 'yes',
      hours: ham(0.55, 0.65, 0.7),
      delta14: -0.2,
      spark: trend(7.9, -0.015, 14, 0.03),
    },
    {
      rank: 6, sev: 76, dir: 'EB',
      from: '14 St / 6 Av', to: '14 St / 1 Av',
      route: 'M14A', sbs: true, alsoRoutes: ['M14D'],
      mph: 5.8, sched: 8.6,
      riderHours: 10210, ridersMo: 116020,
      ace: 'yes', lane: 'yes',
      hours: ham(0.65, 0.5, 0.7),
      delta14: +0.4,
      spark: trend(7.8, 0.02, 14, 0.04),
    },
    {
      rank: 7, sev: 74, dir: 'NB',
      from: 'Utica Av / Empire Bl', to: 'Utica Av / Eastern Pkwy',
      route: 'B46', sbs: true, alsoRoutes: [],
      mph: 6.0, sched: 8.3,
      riderHours: 9610, ridersMo: 106240,
      ace: 'yes', lane: 'yes',
      hours: ham(0.55, 0.6, 0.65),
      delta14: -0.1,
      spark: trend(8.0, -0.008, 14, 0.04),
    },
  ];
  function ham(am, mid, pm) {
    mid = mid ?? am * 0.6;
    pm = pm ?? am * 0.95;
    return Array.from({ length: 24 }, (_, h) => {
      let v = 0.1;
      if (h >= 7 && h <= 9) v = am;
      else if (h >= 11 && h <= 14) v = mid;
      else if (h >= 16 && h <= 19) v = pm;
      else if (h >= 6 && h <= 21) v = 0.3;
      return v + Math.sin(h * 1.6) * 0.04;
    });
  }
  function trend(base, slope, n, jit) {
    return Array.from({ length: n }, (_, i) => base + slope * i + (Math.sin(i * 2.1) - 0.5) * jit);
  }

  const sortedHotspots = React.useMemo(() => {
    const list = [...hotspots];
    switch (rankBy) {
      case 'severity':     return list.sort((a, b) => b.sev - a.sev);
      case 'decline':      return list.sort((a, b) => a.delta14 - b.delta14);
      case 'treatmentGap': return list.sort((a, b) => {
        const gap = h =>
          (h.lane === 'no' ? 3 : h.lane === 'partial' ? 2 : 0) +
          (h.ace  === 'no' ? 2 : h.ace  === 'partial' ? 1 : 0);
        return gap(b) - gap(a) || b.riderHours - a.riderHours;
      });
      default:             return list; // riderHours — already sorted desc
    }
  }, [rankBy]);

  return (
    <div className="bpi" style={{ width: HW, height: HHGT, display: 'flex', flexDirection: 'column' }}>
      <StudioBar active="Hotspots" breadcrumb="Hotspots / current month" />

      <div style={{
        padding: '20px 28px 16px', background: BPI.card,
        boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 28 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Triage</div>
            <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em' }}>
              The worst-performing bus segments right now
            </div>
            <div style={{ fontSize: 13, color: BPI.ink55, marginTop: 4 }}>
              Ranked by rider-hours lost vs. scheduled timepoint. 13,948 segments scanned · Mar 2026 window.
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { k: 'riderHours',   label: 'By rider-hours' },
              { k: 'severity',     label: 'By severity score' },
              { k: 'decline',      label: 'By 14-day decline' },
              { k: 'treatmentGap', label: 'By treatment gap' },
            ].map((opt) => (
              <span
                key={opt.k}
                onClick={() => setRankBy(opt.k)}
                className="bpi"
                style={{
                  display: 'inline-block',
                  padding: '4px 10px',
                  borderRadius: 3,
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  userSelect: 'none',
                  background:   rankBy === opt.k ? BPI.ink : 'transparent',
                  color:        rankBy === opt.k ? BPI.paper : BPI.ink70,
                  boxShadow:    `inset 0 0 0 1px ${rankBy === opt.k ? BPI.ink : BPI.rule}`,
                  transition:   'background .15s ease, color .15s ease',
                }}>{opt.label}</span>
            ))}
          </div>
        </div>

        {/* Filter strip */}
        <div style={{
          display: 'flex', gap: 18, marginTop: 18, alignItems: 'center',
          fontSize: 12.5,
        }}>
          {[
            { lbl: 'Borough', val: 'All' },
            { lbl: 'Window', val: 'AM + PM peak' },
            { lbl: 'Treatment', val: 'Any' },
            { lbl: 'Min riders/day', val: '5,000' },
            { lbl: 'Direction', val: 'Both' },
          ].map((f, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 12px', background: BPI.paper, borderRadius: 3,
              boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
            }}>
              <span style={{ color: BPI.ink55, fontSize: 11 }}>{f.lbl}</span>
              <span style={{ fontWeight: 600 }}>{f.val}</span>
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke={BPI.ink40} strokeWidth="1.4"><path d="M2 3.5L4.5 6 7 3.5" /></svg>
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 11, color: BPI.ink55, fontFamily: BPIMono }}>847 segments match</div>
        </div>
      </div>

      {/* Table head */}
      <div style={{
        padding: '10px 28px', background: BPI.paperDeep,
        display: 'grid',
        gridTemplateColumns: '28px 28px 1.5fr 1fr 72px 92px 168px 130px 100px',
        gap: 14, fontSize: 10, color: BPI.ink55, letterSpacing: '0.06em',
        textTransform: 'uppercase', fontWeight: 600,
        boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
      }}>
        <span>#</span>
        <span style={{ color: rankBy === 'severity' ? BPI.accent : undefined, transition: 'color .2s' }}>●</span>
        <span>Segment</span>
        <span>Routes</span>
        <span style={{ textAlign: 'right' }}>MPH</span>
        <span style={{ textAlign: 'right', color: rankBy === 'riderHours' ? BPI.accent : undefined, transition: 'color .2s' }}>RH/day ↓</span>
        <span>Severity by hour</span>
        <span style={{ color: rankBy === 'decline' ? BPI.accent : undefined, transition: 'color .2s' }}>14-day speed{rankBy === 'decline' ? ' ↑' : ''}</span>
        <span style={{ textAlign: 'right', color: rankBy === 'treatmentGap' ? BPI.accent : undefined, transition: 'color .2s' }}>Treatments{rankBy === 'treatmentGap' ? ' ↑' : ''}</span>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', background: BPI.card }}>
        {sortedHotspots.map((s, i) => (
          <div key={s.from + s.dir} style={{
            padding: '14px 28px',
            display: 'grid',
            gridTemplateColumns: '28px 28px 1.5fr 1fr 72px 92px 168px 130px 100px',
            gap: 14, alignItems: 'center',
            boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
            cursor: 'pointer',
            background: i === 0 ? BPI.accentBg : BPI.card,
          }}>
            <div className="num" style={{
              fontSize: 14, fontWeight: 600, color: i < 3 ? BPI.ink : BPI.ink55,
            }}>{i + 1}</div>
            <div style={{
              width: 26, height: 26, borderRadius: 13,
              background: s.sev > 85 ? BPI.bad : s.sev > 75 ? BPI.warn : BPI.ink40,
              color: '#fff', fontSize: 10.5, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontVariantNumeric: 'tabular-nums',
            }}>{s.sev}</div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span style={{
                  fontFamily: BPIMono, fontSize: 9.5, color: BPI.ink55,
                  background: BPI.ink06, borderRadius: 2, padding: '1px 4px',
                }}>{s.dir}</span>
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>
                  {s.from} <span style={{ color: BPI.ink40 }}>→</span> {s.to}
                </span>
              </div>
              <div style={{ fontSize: 10.5, color: BPI.ink55 }}>
                <span className="num">{s.ridersMo.toLocaleString()}</span> rider-trips / month
                {s.delta14 < -0.4 && <span style={{ color: BPI.bad, marginLeft: 8, fontWeight: 600 }}>· slowing</span>}
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              <RouteBadge route={s.route} sbs={s.sbs} size="sm" />
              {s.alsoRoutes.map((r) => <RouteBadge key={r} route={r} size="sm" />)}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="num" style={{ fontSize: 16, fontWeight: 600, color: BPI.bad, lineHeight: 1 }}>{s.mph.toFixed(1)}</div>
              <div className="num" style={{ fontSize: 9.5, color: BPI.ink55, marginTop: 2 }}>vs {s.sched.toFixed(1)} sch</div>
            </div>
            <div className="num" style={{ fontSize: 13, fontWeight: 600, textAlign: 'right' }}>
              {s.riderHours.toLocaleString()}
            </div>
            <HourStrip hours={s.hours} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Spark data={s.spark} width={86} height={28} color={s.delta14 < 0 ? BPI.bad : BPI.good} />
              <div className="num" style={{
                fontSize: 11, fontWeight: 600,
                color: s.delta14 < 0 ? BPI.bad : BPI.good,
              }}>{s.delta14 > 0 ? '+' : ''}{s.delta14.toFixed(1)}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              {s.lane === 'yes' && <span className="chip good" style={{ fontSize: 9 }}>LANE</span>}
              {s.lane === 'partial' && <span className="chip warn" style={{ fontSize: 9 }}>LANE: PARTIAL</span>}
              {s.lane === 'no' && <span className="chip bad" style={{ fontSize: 9 }}>NO LANE</span>}
              {s.ace === 'yes' && <span className="chip accent" style={{ fontSize: 9 }}>ACE</span>}
              {s.ace === 'partial' && <span className="chip" style={{ fontSize: 9 }}>ACE: PARTIAL</span>}
              {s.ace === 'no' && <span className="chip" style={{ fontSize: 9, color: BPI.ink55 }}>NO ACE</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Screen 2 — Hotspot segment detail
// ─────────────────────────────────────────────────────────────
function HS_SegmentDetail() {
  return (
    <div className="bpi" style={{ width: HW, height: HHGT, display: 'flex', flexDirection: 'column' }}>
      <StudioBar active="Hotspots" breadcrumb="Hotspots / #1 Madison Av · 28→58 St NB" />

      {/* Hero band */}
      <div style={{
        padding: '24px 28px', background: BPI.ink, color: BPI.paper,
        display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 32,
      }}>
        <div>
          <div className="eyebrow" style={{ color: 'rgba(244,241,234,.65)', marginBottom: 8 }}>
            #1 Hotspot · Mar 2026
          </div>
          <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 8 }}>
            Madison Av · E&nbsp;28&nbsp;St → E&nbsp;58&nbsp;St (NB)
          </div>
          <div style={{ fontSize: 13, opacity: 0.75 }}>
            1.5 mi · 4 timepoints · Manhattan ·  primary route <span style={{
              display: 'inline-flex', verticalAlign: 'middle', marginLeft: 2,
            }}><RouteBadge route="M15" sbs size="sm" /></span> &nbsp;
            also <RouteBadge route="M101" size="sm" /> <RouteBadge route="M102" size="sm" /> <RouteBadge route="M103" size="sm" />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
          {[
            { lbl: 'Severity', val: '94', sub: '/ 100' },
            { lbl: 'Avg speed', val: '4.2', sub: 'mph · NB · weekday' },
            { lbl: 'Rider-hours / day', val: '18.4K', sub: 'lost vs. scheduled' },
          ].map((k, i) => (
            <div key={i}>
              <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>{k.lbl}</div>
              <div className="num" style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em', marginTop: 2 }}>{k.val}</div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{k.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: 28, display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 28, overflow: 'hidden' }}>
        {/* Left: speed × hour matrix + map */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, minHeight: 0 }}>
          <div>
            <H title="Speed by hour × day of week"
              sub="Median segment speed, mph. Last 8 weeks. Darker = slower." />
            <SpeedHeatmap />
          </div>
          <div>
            <H title="Segment context"
              right={<span className="chip">expand map →</span>} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 18 }}>
              <div style={{ fontSize: 13, color: BPI.ink, lineHeight: 1.55 }}>
                Madison Avenue, northbound. Painted bus lane on E&nbsp;28–38&nbsp;St only;
                E&nbsp;38–58&nbsp;St is a shared general-traffic lane with right-turn pockets.
                <span style={{ color: BPI.ink55 }}><br />
                  4 timepoints · 6 intervening stops · 5 traffic signals.
                </span>
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { lbl: 'Bus lane coverage', val: '33%', tone: 'warn' },
                    { lbl: 'ACE enforcement', val: 'Adjacent only', tone: 'warn' },
                    { lbl: 'Signal priority', val: 'None scheduled', tone: 'bad' },
                  ].map((t, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 6, height: 6, borderRadius: 3, background: t.tone === 'bad' ? BPI.bad : BPI.warn }} />
                      <div style={{ fontSize: 12, color: BPI.ink70 }}>{t.lbl}:</div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{t.val}</div>
                    </div>
                  ))}
                </div>
              </div>
              <MapThumb width={220} height={160} emphasis={BPI.bad} label="Madison Av NB" />
            </div>
          </div>
        </div>

        {/* Right: who's affected + intervention suggestions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, minHeight: 0 }}>
          <div>
            <H title="Rider profile" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {[
                { lbl: 'Rider-trips / month', val: '207,870', sub: 'across primary route' },
                { lbl: 'Median delay / trip', val: '6.3', sub: 'minutes vs. scheduled', tone: 'bad' },
                { lbl: '90th pct delay', val: '14.1', sub: 'minutes', tone: 'bad' },
                { lbl: 'Peak hour share', val: '63%', sub: 'of rider-hours lost' },
              ].map((k, i) => (
                <div key={i} style={{ padding: 14, background: BPI.card, boxShadow: `0 0 0 1px ${BPI.rule}`, borderRadius: 3 }}>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>{k.lbl}</div>
                  <div className="num" style={{
                    fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em',
                    color: k.tone === 'bad' ? BPI.bad : BPI.ink, lineHeight: 1,
                  }}>{k.val}</div>
                  <div style={{ fontSize: 11, color: BPI.ink55, marginTop: 4 }}>{k.sub}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <H title="Defensible interventions"
              sub="What the data supports saying — ranked by evidence strength." />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                {
                  ttl: 'Extend bus lane to E 58 St',
                  why: 'Speed gap inside vs. outside painted-lane portion is +1.4 mph<Cite n=2 />. On 0.9 mi of upgrade.',
                  conf: 'high',
                },
                {
                  ttl: 'Add ACE enforcement on Madison Av',
                  why: 'On adjacent corridors with ACE, violations dropped 68%<Cite n=3 /> and average speed rose 0.7 mph<Cite n=3 />.',
                  conf: 'medium',
                },
                {
                  ttl: 'Signal priority (TSP) pilot',
                  why: 'No comparable NYC TSP data on Madison Av; would need a controlled rollout to attribute effect.',
                  conf: 'low',
                },
              ].map((s, i) => (
                <div key={i} style={{
                  padding: '12px 14px', background: BPI.card,
                  boxShadow: `0 0 0 1px ${BPI.rule}`, borderRadius: 3,
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{s.ttl}</div>
                    <span className={`chip ${s.conf === 'high' ? 'good' : s.conf === 'medium' ? 'warn' : ''}`}
                      style={{ fontSize: 9.5 }}>
                      {s.conf === 'high' ? 'EVIDENCE: STRONG' : s.conf === 'medium' ? 'EVIDENCE: MIXED' : 'EVIDENCE: WEAK'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: BPI.ink70, lineHeight: 1.45 }}>
                    {s.why.replace(/<Cite n=(\d+) \/>/g, ($0, n) => '')}
                  </div>
                </div>
              ))}
            </div>
            <button className="txt" style={{
              marginTop: 14, padding: '10px 14px', background: BPI.ink, color: BPI.paper,
              borderRadius: 3, fontSize: 12.5, fontWeight: 600, width: '100%',
            }}>Roll this hotspot up into the M15 brief →</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Speed × hour × day heatmap delegated to the shared <Heatmap> primitive.
function SpeedHeatmap() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const hours = Array.from({ length: 18 }, (_, i) => i + 5); // 05–22
  function val(d, h) {
    let base = 7.5;
    if (d <= 4 && (h >= 7 && h <= 9)) base = 4.5;
    else if (d <= 4 && (h >= 16 && h <= 19)) base = 3.9;
    else if (d <= 4 && (h >= 12 && h <= 14)) base = 6.0;
    else if (d >= 5 && (h >= 12 && h <= 18)) base = 6.6;
    return base + (Math.sin(d * 1.5 + h * 0.7) * 0.4);
  }
  const colLabels = hours.map((h) => (h % 12 || 12).toString());
  const values = days.map((_, di) => hours.map((h) => val(di, h)));
  return (
    <div style={{
      background: BPI.card, padding: 14, boxShadow: `0 0 0 1px ${BPI.rule}`,
      borderRadius: 3, display: 'inline-block',
    }}>
      <Heatmap rows={days} cols={colLabels} values={values}
        min={3.5} max={8.5} cellW={38} cellH={22} labelGutter={40} colTickEvery={3} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Screen 3 — Brief, rolled up from hotspot
// ─────────────────────────────────────────────────────────────
function HS_BriefRollup() {
  return (
    <div className="bpi" style={{ width: HW, height: HHGT, display: 'flex', flexDirection: 'column' }}>
      <StudioBar active="Briefs" breadcrumb="Briefs / new / from hotspot #1" />
      <div style={{ flex: 1, padding: '28px 64px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span className="chip accent">NEW BRIEF</span>
          <span style={{ fontSize: 12, color: BPI.ink55 }}>Rolled up from Hotspot #1, Mar 2026</span>
        </div>
        <div style={{
          fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.1,
          marginBottom: 8, maxWidth: 840,
        }}>
          We found a 1.5-mile corridor responsible for 43% of the M15's measured delay. What's the&nbsp;story?
        </div>
        <div style={{ fontSize: 13, color: BPI.ink55, marginBottom: 24 }}>
          Pick which strands of the evidence to include. Citations are kept automatically.
        </div>

        {/* Evidence cards picker */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16,
          flex: 1, overflow: 'hidden',
        }}>
          {[
            {
              ttl: 'Severity is real and current',
              picked: true,
              body: 'Speed averaged 4.2 mph in March 2026 — slower than NYC pedestrian median (3.1 mph) for half the day.',
              cites: ['Bus Speeds Mar 2026', 'DOT walk-speed study'],
            },
            {
              ttl: 'Rider impact is large',
              picked: true,
              body: '18,420 rider-hours lost per weekday on this segment alone; 207,870 rider-trips per month.',
              cites: ['Hourly Ridership 2025+', 'M1 pilot Mar 2026'],
            },
            {
              ttl: 'Treatments don\'t fully cover it',
              picked: true,
              body: 'Painted bus lane on 33% of segment; no ACE enforcement on Madison Av; no signal priority.',
              cites: ['DOT bus lane geom.', 'ACE program record'],
            },
            {
              ttl: 'ACE works on adjacent corridors',
              picked: true,
              body: 'On ACE-enforced M15 segments, violations dropped 68% and PM-peak speed rose 0.7 mph since rollout.',
              cites: ['ACE violations May 2024–Apr 2026'],
              caveat: 'Overlaps congestion pricing rollout — attribution is partial.',
            },
            {
              ttl: 'Bus lane delivers within-segment',
              picked: true,
              body: 'Speed gap inside vs. outside painted portion of the segment is +1.4 mph, consistent over 14 weeks.',
              cites: ['Bus Speeds 2025–2026, segment-level'],
            },
            {
              ttl: 'TSP — evidence is thin',
              picked: false,
              body: 'No comparable NYC Transit Signal Priority data exists for Madison Av. Including this section would require a controlled pilot.',
              cites: [],
              warn: true,
            },
          ].map((c, i) => (
            <div key={i} style={{
              padding: 16,
              background: c.picked ? BPI.card : BPI.paperDeep,
              boxShadow: c.picked ? `0 0 0 1px ${BPI.ink}` : `0 0 0 1px ${BPI.rule}`,
              borderRadius: 3,
              opacity: c.picked ? 1 : 0.7,
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{
                  marginTop: 2,
                  width: 16, height: 16, borderRadius: 2,
                  border: `1.5px solid ${c.picked ? BPI.ink : BPI.ink40}`,
                  background: c.picked ? BPI.ink : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {c.picked && <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke={BPI.paper} strokeWidth="2"><path d="M1.5 5L4 7.5 8.5 2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.25 }}>{c.ttl}</div>
              </div>
              <div style={{ fontSize: 12.5, color: BPI.ink70, marginTop: 10, lineHeight: 1.5, flex: 1 }}>{c.body}</div>
              {c.cites && c.cites.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {c.cites.map((s) => (
                    <span key={s} className="chip" style={{ fontSize: 9.5 }}>{s}</span>
                  ))}
                </div>
              )}
              {c.caveat && (
                <div style={{ marginTop: 8, fontSize: 11, color: BPI.warn, fontStyle: 'italic' }}>⚠ {c.caveat}</div>
              )}
              {c.warn && (
                <div style={{ marginTop: 8, fontSize: 11, color: BPI.bad, fontStyle: 'italic' }}>Excluded — evidence does not support claim</div>
              )}
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 18, padding: '14px 18px', background: BPI.card,
          boxShadow: `0 0 0 1px ${BPI.rule}`, borderRadius: 3,
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, color: BPI.ink70 }}>
              <span style={{ fontWeight: 600, color: BPI.ink }}>5 of 6</span> evidence sections included ·
              <span className="num" style={{ marginLeft: 8 }}>14</span> citations attached ·
              <span style={{ marginLeft: 8, color: BPI.warn, fontWeight: 600 }}>1 weak-evidence section excluded</span>
            </div>
          </div>
          <button className="txt" style={{
            padding: '10px 14px', border: `1px solid ${BPI.ink20}`, borderRadius: 3,
            fontSize: 12.5, fontWeight: 500,
          }}>Save draft</button>
          <button className="txt" style={{
            padding: '10px 16px', background: BPI.ink, color: BPI.paper,
            borderRadius: 3, fontSize: 12.5, fontWeight: 600,
          }}>Generate brief →</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { HS_Home, HS_SegmentDetail, HS_BriefRollup });
