// Route-first concept: search-first home → route detail → brief.
// The atomic unit is a route; segments are evidence inside a route page.

const W = 1320,HGT = 880;

// ─────────────────────────────────────────────────────────────
// Screen 1 — Home (search-first)
// ─────────────────────────────────────────────────────────────
function RF_Home() {
  const needsAttention = [
  { route: 'M15', sbs: true, name: '1 Av / 2 Av', mph: 5.8, delta: -0.4, riders: '37.2K/day', flags: ['ACE active', 'Bus lane'] },
  { route: 'B41', sbs: false, name: 'Flatbush Av', mph: 5.1, delta: -0.6, riders: '24.8K/day', flags: ['No ACE'] },
  { route: 'Bx12', sbs: true, name: 'Fordham Rd / Pelham', mph: 6.9, delta: +0.1, riders: '41.0K/day', flags: ['ACE active', 'Bus lane'] },
  { route: 'M14', sbs: true, name: '14 St crosstown', mph: 7.4, delta: +0.8, riders: '27.6K/day', flags: ['ACE active', 'Busway'] },
  { route: 'Q58', sbs: false, name: 'Corona — Ridgewood', mph: 6.3, delta: -0.2, riders: '21.5K/day', flags: ['No ACE'] },
  { route: 'B46', sbs: true, name: 'Utica Av', mph: 6.7, delta: -0.1, riders: '38.4K/day', flags: ['ACE active', 'Bus lane'] },
  { route: 'Bx41', sbs: true, name: 'Webster Av', mph: 7.1, delta: +0.3, riders: '19.2K/day', flags: ['ACE active', 'Bus lane'] },
  { route: 'M101', sbs: false, name: '3 Av / Lexington Av', mph: 6.0, delta: -0.3, riders: '29.7K/day', flags: ['Bus lane'] }];

  const recent = ['M15 +SBS', 'B41', 'M14 +SBS', 'Bx12 +SBS'];
  return (
    <div className="bpi" style={{ width: W, height: HGT, display: 'flex', flexDirection: 'column' }}>
      <StudioBar active="Routes" />
      <div style={{ flex: 1, padding: '52px 80px 0', display: 'flex', flexDirection: 'column' }}>
        {/* Hero */}
        <div style={{ maxWidth: 760 }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>Route Evidence Brief Builder</div>
          <div style={{
            fontSize: 44, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.05,
            marginBottom: 14, textWrap: 'pretty'
          }}>
            Pick a route. See where it fails, who is&nbsp;affected, and whether the evidence supports action.
          </div>
          <div style={{ fontSize: 14.5, color: BPI.ink70, lineHeight: 1.5, maxWidth: 620 }}>
            Built from public MTA bus speed, ridership, and schedule data; NYC DOT bus lane geometry;
            and the MTA Automated Camera Enforcement program record. <span style={{ color: BPI.accent, cursor: 'pointer' }}>Methodology →</span>
          </div>
        </div>
        {/* Search */}
        <div style={{ marginTop: 36, maxWidth: 760 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: BPI.card, border: `1.5px solid ${BPI.ink}`,
            padding: '14px 18px', borderRadius: 4,
            boxShadow: '0 2px 0 ' + BPI.ink
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke={BPI.ink} strokeWidth="1.8">
              <circle cx="8" cy="8" r="5.5" /><path d="M12.5 12.5L16 16" strokeLinecap="round" />
            </svg>
            <input style={{
              flex: 1, border: 'none', outline: 'none', fontFamily: 'inherit',
              fontSize: 17, background: 'transparent', color: BPI.ink
            }} defaultValue="M15" placeholder="Search by route number, street, or borough…" />
            <span className="mono" style={{ fontSize: 11, color: BPI.ink40, padding: '2px 6px', border: `1px solid ${BPI.ink20}`, borderRadius: 3 }}>⌘K</span>
          </div>
          {/* Suggestion dropdown */}
          <div style={{
            marginTop: 8, background: BPI.card,
            boxShadow: '0 2px 0 ' + BPI.ink20 + ', 0 0 0 1px ' + BPI.rule,
            borderRadius: 4
          }}>
            {[
            { route: 'M15', sbs: true, name: '1 Av / 2 Av', hint: '37.2K daily riders · ACE active' },
            { route: 'M15', sbs: false, name: '1 Av / 2 Av Local', hint: '11.4K daily riders' },
            { route: 'M14A', sbs: true, name: '14 St Crosstown', hint: '17.8K daily riders · Busway' },
            { route: 'M14D', sbs: true, name: '14 St Crosstown', hint: '9.8K daily riders · Busway' }].
            map((row, i) =>
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '11px 18px',
              boxShadow: i ? `inset 0 1px 0 ${BPI.rule}` : 'none',
              background: i === 0 ? BPI.ink06 : 'transparent'
            }}>
                <RouteBadge route={row.route} sbs={row.sbs} />
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{row.name}</div>
                <div style={{ flex: 1 }} />
                <div style={{ fontSize: 12, color: BPI.ink55 }}>{row.hint}</div>
                {i === 0 && <span style={{ fontSize: 11, color: BPI.ink40, fontFamily: BPIMono }}>↵</span>}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, fontSize: 12, color: BPI.ink55 }}>
            <span>Recent:</span>
            {recent.map((r) => {
              const parts = r.split(' +');
              return (
                <span key={r} style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                  <RouteBadge route={parts[0]} sbs={parts[1] === 'SBS'} size="sm" />
                </span>);

            })}
          </div>
        </div>

        {/* Secondary: needs attention */}
        <div style={{ marginTop: 56, flex: 1, display: 'flex', flexDirection: 'column' }}>
          <H title="Routes needing attention this month"
          sub="Surfaced by week-over-week speed decline weighted by daily riders. Not a recommendation — a triage list."
          right={<div style={{ display: 'flex', gap: 6 }}>
              {['All boroughs', 'AM peak', 'PM peak', 'SBS only', 'No bus lane'].map((t, i) =>
            <span key={t} className="chip" style={i === 0 ? { background: BPI.ink, color: BPI.paper } : {}}>{t}</span>
            )}
            </div>} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>
            {needsAttention.map((r, i) =>
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: '90px 1fr 76px 60px 100px',
              gap: 14, alignItems: 'center',
              padding: '13px 0', boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
              cursor: 'pointer'
            }}>
                <RouteBadge route={r.route} sbs={r.sbs} />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 2 }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: BPI.ink55 }}>{r.flags.join(' · ')}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="num" style={{ fontSize: 16, fontWeight: 600 }}>{r.mph.toFixed(1)}</div>
                  <div style={{ fontSize: 9, color: BPI.ink55, letterSpacing: '0.04em' }}>MPH</div>
                </div>
                <div className="num" style={{
                fontSize: 12, fontWeight: 600, textAlign: 'right',
                color: r.delta < 0 ? BPI.bad : BPI.good
              }}>{r.delta > 0 ? '+' : ''}{r.delta.toFixed(1)}</div>
                <div className="num" style={{ fontSize: 11, color: BPI.ink55, textAlign: 'right' }}>{r.riders}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>);

}

// ─────────────────────────────────────────────────────────────
// AIDiagnosisStrip — proactive AI observation, shown inline on the
// route detail page without a chat interface. Reads as editorial
// analysis; the analyst doesn't have to ask for it.
// "What explains this?" is the on-demand trigger for deeper reasoning.
// ─────────────────────────────────────────────────────────────
function AIDiagnosisStrip() {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <div style={{
      padding: expanded ? '14px 28px 16px' : '11px 28px',
      background: BPI.accentBg,
      boxShadow: `inset 0 -1px 0 oklch(0.88 0.07 252)`,
      display: 'flex', gap: 14, alignItems: 'flex-start',
      transition: 'padding .2s'
    }}>
      {/* Glyph */}
      <div style={{
        fontSize: 10, color: BPI.accent, fontWeight: 700,
        fontFamily: BPIMono, letterSpacing: '0.04em',
        marginTop: 3, flexShrink: 0, lineHeight: 1
      }}>◆</div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: BPI.ink, lineHeight: 1.6 }}>
          Full treatment stack (bus lane + ACE + TSP on 72% of route), yet PM-peak speed has declined 0.6 mph over 14 months.{' '}
          Of 8 comparable routes, 6 reversed this pattern within 60 days of enforcement.{' '}
          <span style={{ color: BPI.accent, fontWeight: 500 }}>
            Madison Av shows no correlated violation reduction — unusual for ACE corridors.
          </span>
        </div>
        {expanded &&
        <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: BPI.ink, marginBottom: 8 }}>
              Most likely drivers — ranked by frequency in comparable cases:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
            { rank: '01', text: 'Signal timing not yet adjusted for lane geometry', freq: '4 of 8 comparable routes' },
            { rank: '02', text: 'Commercial loading blockage in ACE-exempt categories', freq: '2 of 8' },
            { rank: '03', text: 'Through-traffic displacement post-congestion pricing', freq: '2 of 8' }].
            map((d) =>
            <div key={d.rank} style={{
              display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 10,
              alignItems: 'baseline',
              padding: '8px 12px', background: 'rgba(255,255,255,.5)', borderRadius: 3
            }}>
                  <span style={{ fontFamily: BPIMono, fontSize: 10, fontWeight: 700, color: BPI.accent }}>{d.rank}</span>
                  <span style={{ fontSize: 12.5, color: BPI.ink }}>{d.text}</span>
                  <span style={{ fontSize: 11, color: BPI.ink55, fontFamily: BPIMono, whiteSpace: 'nowrap' }}>{d.freq}</span>
                </div>
            )}
            </div>
            <div style={{ fontSize: 10.5, color: BPI.ink55, marginTop: 10, fontFamily: BPIMono }}>
              Based on 14 months of speed + violation data · 8 comparable SBS routes · confidence: high
              <span style={{ color: BPI.accent, marginLeft: 12, cursor: 'pointer', fontWeight: 600 }}>
                See full reasoning in Findings →
              </span>
            </div>
          </div>
        }
      </div>

      {/* Trigger */}
      <button className="bpi" onClick={() => setExpanded(!expanded)} style={{
        flexShrink: 0, padding: '5px 11px',
        background: expanded ? 'transparent' : BPI.accent,
        color: expanded ? BPI.accent : '#fff',
        border: `1px solid ${BPI.accent}`, borderRadius: 3,
        fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
        fontFamily: 'inherit', whiteSpace: 'nowrap', lineHeight: 1.4,
        transition: 'background .15s, color .15s'
      }}>
        {expanded ? 'Collapse' : 'What explains this? →'}
      </button>
    </div>);

}

// ─────────────────────────────────────────────────────────────
// AINotePanel — inline expansion shown directly below a SegmentRow when
// it has an AI-flagged observation. Designed to feel "tucked into" the
// row above (no border-radius on top, left accent rule, soft bg) and to
// give the analyst clear next-step affordances rather than just text.
// ─────────────────────────────────────────────────────────────
function AINotePanel({ note, topFlag }) {
  return (
    <div style={{
      margin: '0 -12px',
      padding: '4px 12px 16px',
      background: topFlag ? BPI.accentBg : BPI.ink06,
      boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
    }}>
      <div style={{
        marginLeft: 38,                                     // align under segment text (past DirIndicator)
        paddingLeft: 14,
        borderLeft: `2px solid ${BPI.accent}`,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: BPIMono, fontSize: 9.5, fontWeight: 700,
            color: BPI.accent, letterSpacing: '0.08em',
          }}>◆ AI OBSERVATION</span>
          <span style={{ width: 3, height: 3, borderRadius: 2, background: BPI.ink40 }} />
          <span style={{
            fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono, letterSpacing: '0.02em',
          }}>{note.aiBasis || 'segment data'}</span>
          <span style={{ width: 3, height: 3, borderRadius: 2, background: BPI.ink40 }} />
          <span style={{
            fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: note.aiConfidence === 'high' ? BPI.good : BPI.warn,
            background: note.aiConfidence === 'high' ? BPI.goodBg : BPI.warnBg,
            padding: '2px 6px', borderRadius: 2,
          }}>{note.aiConfidence || 'moderate'} confidence</span>
        </div>
        <div style={{
          fontSize: 13, color: BPI.ink, lineHeight: 1.6, maxWidth: 760,
        }}>{note.aiNote}</div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          fontSize: 11.5, flexWrap: 'wrap',
        }}>
          <span style={{ color: BPI.accent, fontWeight: 600, cursor: 'pointer' }}>Start a claim from this →</span>
          <span style={{ width: 1, height: 11, background: BPI.ink20 }} />
          <span style={{ color: BPI.ink70, fontWeight: 500, cursor: 'pointer' }}>See similar segments</span>
          <span style={{ width: 1, height: 11, background: BPI.ink20 }} />
          <span style={{ color: BPI.ink70, fontWeight: 500, cursor: 'pointer' }}>Why this conclusion?</span>
          <span style={{ flex: 1 }} />
          <span style={{ color: BPI.ink55, cursor: 'pointer', fontSize: 11 }}>Dismiss</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Screen 2 — Route detail (M15 SBS)
// ─────────────────────────────────────────────────────────────
function RF_RouteDetail({ initialTab = 'Slow segments' }) {
  const [expandedNote, setExpandedNote] = React.useState(null);
  const [activeTab, setActiveTab] = React.useState(initialTab);
  const [visibleCount, setVisibleCount] = React.useState(5);
  const [segSort, setSegSort] = React.useState('rh'); // 'rh' | 'mph'
  const speedTrend = [7.9, 7.7, 7.6, 7.4, 7.1, 6.9, 6.8, 6.7, 6.8, 6.9, 6.8, 6.6, 6.4, 6.3];
  function gen(am, mid, pm) {
    const arr = [];
    for (let h = 0; h < 24; h++) {
      let v = 0.1;
      if (h >= 7 && h <= 9) v = am;else
      if (h >= 11 && h <= 14) v = mid;else
      if (h >= 16 && h <= 19) v = pm;else
      if (h >= 6 && h <= 21) v = 0.3;
      arr.push(v + Math.sin(h * 1.7) * 0.04);
    }
    return arr;
  }
  // Build a richer treatments array per segment. The M15 carries an SBS
  // service pattern, off-board fare, all-door boarding, and stop
  // consolidation across the whole route — those flow into every segment.
  // Lane / ACE / TSP / bus bulbs / daylighting / TSP pilot vary segment to
  // segment. The `extras` array per segment captures the segment-specific
  // additions (or substitutions).
  function txM15(lane, ace, tsp, extras = []) {
    const out = [];
    // Street priority
    if (lane === 'yes')         out.push({ type: 'bus_lane', state: 'active', coverage: 1.0 });
    else if (lane === 'partial') out.push({ type: 'bus_lane', state: 'active', coverage: 0.5 });
    else if (lane === 'no')     out.push({ type: 'bus_lane', state: 'historical_context' });
    // Enforcement — ACE
    if (ace)  out.push({ type: 'ace', state: 'active' });
    else      out.push({ type: 'ace', state: 'source_gap' });
    // Signals — TSP
    if (tsp)  out.push({ type: 'tsp', state: 'active' });
    // Always-on whole-route treatments
    out.push({ type: 'sbs',                state: 'active' });
    out.push({ type: 'off_board_fare',     state: 'active' });
    out.push({ type: 'all_door',           state: 'active' });
    out.push({ type: 'stop_consolidation', state: 'active' });
    return out.concat(extras);
  }

  // aiNote: AI-flagged observations on specific segments (proactive, inline)
  const segments = [
  { dir: 'NB', from: 'Madison Av / E 28 St', to: 'Madison Av / E 58 St', mph: 4.2, sched: 7.1, rh: 18420, hours: gen(0.7, 0.5, 0.9), lane: 'partial', ace: false, tsp: false, flag: 'top',
    treatments: txM15('partial', false, false, [
      { type: 'capital_milestone', state: 'planned', detail: 'concrete-lane extension 23→34 St' },
    ]),
    aiNote: 'No violation reduction despite ACE active on adjacent blocks. Painted-only lane may be structurally unenforceable here.',
    aiBasis: '14 mo · 8 comparable corridors', aiConfidence: 'high' },
  { dir: 'NB', from: '1 Av / E 14 St', to: '1 Av / E 34 St', mph: 4.9, sched: 7.6, rh: 14110, hours: gen(0.6, 0.5, 0.85), lane: 'yes', ace: true, tsp: false,
    treatments: txM15('yes', true, false, [
      { type: 'bus_bulb', state: 'active', coverage: 0.4 },
    ]),
    aiNote: 'Speed is 1.3 mph below comparable fully-laned M15 segments. Decline accelerated after May 2025.',
    aiBasis: '12 mo · 4 comparable segments', aiConfidence: 'high' },
  { dir: 'SB', from: '2 Av / E 60 St', to: '2 Av / E 42 St', mph: 5.2, sched: 7.8, rh: 12880, hours: gen(0.55, 0.6, 0.7), lane: 'yes', ace: true, tsp: false,
    treatments: txM15('yes', true, false) },
  { dir: 'NB', from: '1 Av / E 86 St', to: '1 Av / E 96 St', mph: 5.8, sched: 8.2, rh: 9640, hours: gen(0.5, 0.4, 0.6), lane: 'yes', ace: true, tsp: true,
    treatments: txM15('yes', true, true, [
      { type: 'queue_jump',  state: 'active' },
      { type: 'daylighting', state: 'active' },
    ]) },
  { dir: 'SB', from: '2 Av / E 23 St', to: '2 Av / E 14 St', mph: 6.1, sched: 8.0, rh: 8210, hours: gen(0.4, 0.5, 0.55), lane: 'yes', ace: true, tsp: false,
    treatments: txM15('yes', true, false, [
      { type: 'offset_lane',       state: 'active', coverage: 1.0, detail: 'concrete buffer · Q4 2023' },
      { type: 'capital_milestone', state: 'historical_context', detail: 'concrete-lane upgrade Q4 2023' },
    ]),
    aiNote: 'Concrete-lane upgrade Q4 2023; expected speed gain of +0.6 mph not observed. Worth investigating commercial-loading exemptions on E 18–E 14 St.',
    aiBasis: '24 mo · pre/post window', aiConfidence: 'moderate' },
  { dir: 'SB', from: '1 Av / E 96 St', to: '1 Av / E 110 St', mph: 6.4, sched: 8.0, rh: 7820, hours: gen(0.4, 0.4, 0.55), lane: 'yes', ace: true, tsp: true,
    treatments: txM15('yes', true, true, [
      { type: 'daylighting', state: 'planned', detail: 'FY27' },
    ]) },
  { dir: 'NB', from: '2 Av / E 79 St', to: '2 Av / E 86 St', mph: 6.6, sched: 8.4, rh: 6940, hours: gen(0.4, 0.3, 0.55), lane: 'yes', ace: true, tsp: false,
    treatments: txM15('yes', true, false, [
      { type: 'tsp', state: 'proposed', detail: '2027 capital request' },
    ]) },
  { dir: 'SB', from: '2 Av / E 14 St', to: '2 Av / Houston', mph: 6.9, sched: 8.6, rh: 5980, hours: gen(0.3, 0.4, 0.5), lane: 'partial', ace: false, tsp: false,
    treatments: txM15('partial', false, false),
    aiNote: 'Speed dip clusters around 17:30 — likely outbound flow at 14 St busway junction. Not unique to this route.',
    aiBasis: '6 mo · 3 routes share pattern', aiConfidence: 'moderate' },
  { dir: 'NB', from: '1 Av / Houston', to: '1 Av / E 14 St', mph: 7.1, sched: 8.7, rh: 5410, hours: gen(0.35, 0.3, 0.5), lane: 'yes', ace: true, tsp: false,
    treatments: txM15('yes', true, false) },
  { dir: 'SB', from: '2 Av / E 110 St', to: '2 Av / E 96 St', mph: 7.3, sched: 8.5, rh: 4980, hours: gen(0.3, 0.3, 0.45), lane: 'yes', ace: true, tsp: true,
    treatments: txM15('yes', true, true) },
  { dir: 'NB', from: '1 Av / E 34 St', to: '1 Av / E 42 St', mph: 7.4, sched: 8.5, rh: 4220, hours: gen(0.3, 0.35, 0.4), lane: 'yes', ace: true, tsp: false,
    treatments: txM15('yes', true, false) },
  { dir: 'SB', from: '2 Av / E 42 St', to: '2 Av / E 23 St', mph: 7.6, sched: 8.8, rh: 3890, hours: gen(0.3, 0.3, 0.4), lane: 'yes', ace: true, tsp: false,
    treatments: txM15('yes', true, false) },
  { dir: 'NB', from: 'Allen / Houston', to: '1 Av / Houston', mph: 7.9, sched: 8.9, rh: 2860, hours: gen(0.25, 0.3, 0.4), lane: 'no', ace: false, tsp: false,
    treatments: txM15('no', false, false) }];

  const sortedSegments = React.useMemo(() => {
    const arr = [...segments];
    if (segSort === 'mph') arr.sort((a, b) => a.mph - b.mph);
    else arr.sort((a, b) => b.rh - a.rh);
    return arr;
  }, [segSort]);
  const displayedSegments = sortedSegments.slice(0, visibleCount);
  const remaining = segments.length - visibleCount;

  return (
    <div className="bpi" style={{ width: W, height: HGT, display: 'flex', flexDirection: 'column' }}>
      <StudioBar active="Routes" breadcrumb="Routes / M15 +SBS" />
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Route header */}
        <div style={{ padding: '24px 28px 18px', background: BPI.card, boxShadow: `inset 0 -1px 0 ${BPI.rule}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginBottom: 18 }}>
            <RouteBadge route="M15" sbs size="xl" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                1st Avenue / 2nd Avenue Select Bus Service
              </div>
              <div style={{ fontSize: 13, color: BPI.ink55, marginTop: 4 }}>
                Manhattan · East Harlem ↔ South Ferry · 8.4 mi · 33 stops
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="txt" style={{
                padding: '8px 14px', border: `1px solid ${BPI.ink20}`, borderRadius: 3,
                fontSize: 12.5, fontWeight: 500
              }}>Compare with M15 local</button>
              <button className="txt" style={{
                padding: '8px 14px', background: BPI.ink, color: BPI.paper, borderRadius: 3,
                fontSize: 12.5, fontWeight: 600
              }}>Generate brief →</button>
            </div>
          </div>
          {/* KPI strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 24 }}>
            {[
            { lbl: 'Weighted avg speed', val: '6.74', unit: 'mph', sub: '7th percentile of NYC SBS routes', spark: speedTrend, trend: true },
            { lbl: 'Daily riders', val: '37.2K', sub: '−4.1% YoY' },
            { lbl: 'Rider-hours lost / day', val: '4,310', sub: 'vs. scheduled timepoints', tone: 'bad' },
            { lbl: 'Bus lane coverage', val: '72%', sub: 'of route mileage' },
            { lbl: 'ACE status', val: 'Active', sub: 'since Nov 2019', tone: 'good' }].
            map((k, i) =>
            <div key={i} style={{ paddingRight: 18, borderRight: i < 4 ? `1px solid ${BPI.rule}` : 'none' }}>
                <div className="eyebrow" style={{ marginBottom: 6 }}>{k.lbl}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <div className="num" style={{
                  fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em',
                  color: k.tone === 'bad' ? BPI.bad : k.tone === 'good' ? BPI.good : BPI.ink
                }}>{k.val}</div>
                  {k.unit && <div style={{ fontSize: 11, color: BPI.ink55, letterSpacing: '0.03em' }}>{k.unit}</div>}
                  {k.trend && <div style={{ marginLeft: 'auto' }}><Spark data={k.spark} width={68} height={20} color={BPI.bad} /></div>}
                </div>
                <div style={{ fontSize: 11, color: BPI.ink55, marginTop: 3 }}>{k.sub}</div>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ padding: '0 28px', background: BPI.card, boxShadow: `inset 0 -1px 0 ${BPI.rule}`, display: 'flex', gap: 24, fontSize: 12.5 }}>
          {['Overview', 'Slow segments', 'Riders', 'Interventions', 'Timeline', 'Data notes'].map((t) =>
          <span key={t} onClick={() => setActiveTab(t)} style={{
            padding: '10px 0', color: t === activeTab ? BPI.ink : BPI.ink55,
            fontWeight: t === activeTab ? 600 : 400,
            boxShadow: t === activeTab ? `inset 0 -2px 0 ${BPI.ink}` : 'none',
            cursor: 'pointer'
          }}>{t}</span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: '28px 32px 32px', overflow: 'auto' }}>
          {activeTab === 'Overview'      && <RouteTabOverview />}
          {activeTab === 'Riders'        && <RouteTabRiders />}
          {activeTab === 'Interventions' && <RouteTabInterventions />}
          {activeTab === 'Timeline'      && <RouteTabTimeline />}
          {activeTab === 'Data notes'    && <RouteTabDataNotes />}
          {activeTab === 'Slow segments' && <RouteTabSlowSegments
            segments={segments}
            sortedSegments={sortedSegments}
            displayedSegments={displayedSegments}
            visibleCount={visibleCount}
            setVisibleCount={setVisibleCount}
            segSort={segSort}
            setSegSort={setSegSort}
            expandedNote={expandedNote}
            setExpandedNote={setExpandedNote}
            remaining={remaining}
          />}
        </div>
      </div>
    </div>);

}


// ─────────────────────────────────────────────────────────────
// HorizontalTimeline — a row of events along a horizontal axis. Used on
// the Route Detail page to give the route's intervention history a single
// editorial spread.
// ─────────────────────────────────────────────────────────────
function HorizontalTimeline({ events }) {
  return (
    <div style={{ position: 'relative', padding: '12px 0 4px' }}>
      <div style={{
        position: 'absolute', left: 4, right: 4, top: 50,
        height: 2, background: BPI.rule
      }} />
      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${events.length}, 1fr)`, gap: 12
      }}>
        {events.map((e, i) =>
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0 }}>
            <div style={{
            fontSize: 11, color: BPI.ink55, fontWeight: 600,
            fontFamily: BPIMono, marginBottom: 8, letterSpacing: '0.02em'
          }}>{e.yr}</div>
            <div style={{
            position: 'relative', width: '100%', height: 22
          }}>
              <div style={{
              width: 14, height: 14, borderRadius: 7,
              background: e.tone === 'good' ? BPI.good : e.tone === 'warn' ? BPI.warn : BPI.accent,
              boxShadow: `0 0 0 3px ${BPI.paper}`
            }} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25, marginTop: 6, letterSpacing: '-0.005em' }}>{e.t}</div>
            <div style={{ fontSize: 11.5, color: BPI.ink70, marginTop: 4, lineHeight: 1.45, paddingRight: 12 }}>{e.d}</div>
          </div>
        )}
      </div>
    </div>);

}

// ─────────────────────────────────────────────────────────────
// Screen 3 — Brief (cited narrative)
// ─────────────────────────────────────────────────────────────
function RF_Brief() {
  // ── Claims strength panel ─────────────────────────────────────
  // "Hand the reader the scalpel": let the analyst decide which
  // claims are strong enough to include. The strength meter gives
  // real-time feedback on brief defensibility as they toggle.
  const [railMode, setRailMode] = React.useState('brief');
  const [activeClaims, setActiveClaims] = React.useState([0, 1, 2, 3]);
  const toggleClaim = (id) => setActiveClaims((prev) =>
  prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
  );
  const briefStrength = 10 + (
  activeClaims.includes(0) ? 25 : 0) + (
  activeClaims.includes(1) ? 25 : 0) + (
  activeClaims.includes(2) ? 25 : 0) + (
  activeClaims.includes(3) ? 15 : 0);
  const strengthColor = briefStrength >= 75 ? BPI.good : briefStrength >= 50 ? BPI.warn : BPI.bad;
  const strengthBg = briefStrength >= 75 ? BPI.goodBg : briefStrength >= 50 ? BPI.warnBg : BPI.badBg;
  return (
    <div className="bpi" style={{ width: W, height: HGT, display: 'flex', flexDirection: 'column' }}>
      <StudioBar active="Briefs" breadcrumb="Briefs / M15 +SBS / draft.04" />
      <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 320px' }}>
        {/* Brief body */}
        <div style={{ overflow: 'hidden', padding: '36px 64px 24px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <RouteBadge route="M15" sbs size="lg" />
            <span className="chip">DRAFT v0.4</span>
            <span style={{ fontSize: 11, color: BPI.ink55, fontFamily: BPIMono }}>generated 2026-05-12</span>
          </div>
          <div style={{
            fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.1,
            marginBottom: 12, textWrap: 'pretty'
          }}>
            M15 SBS is the slowest SBS route in Manhattan, and the&nbsp;evidence points to one corridor.
          </div>
          <div style={{ fontSize: 14.5, color: BPI.ink70, lineHeight: 1.5, marginBottom: 24, maxWidth: 720 }}>
            Across March 2026, the M15 SBS ran at <b style={{ color: BPI.ink }}>6.74 mph weighted average</b><Cite n={1} /> — slower than every other Manhattan SBS route.<Cite n={2} /> A single corridor, Madison Avenue between 28th and 58th Streets, accounted for <b style={{ color: BPI.ink }}>18,420 rider-hours of delay per weekday</b><Cite n={5} /> — roughly 43% of the route's total measured lost time.<Cite n={5} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18, marginBottom: 26 }}>
            {[
            { lbl: 'Weighted avg speed', val: '6.74', unit: 'mph', cite: 1 },
            { lbl: 'Worst-segment riders / day', val: '18.4K', unit: 'rider-hours lost', cite: 5 },
            { lbl: 'ACE violations Y/Y', val: '−68%', unit: 'enforcement effect', tone: 'good', cite: 3 }].
            map((k, i) =>
            <div key={i} style={{
              padding: 14, background: BPI.card,
              boxShadow: `0 0 0 1px ${BPI.rule}`,
              borderRadius: 3
            }}>
                <div className="eyebrow" style={{ marginBottom: 6 }}>{k.lbl}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <div className="num" style={{
                  fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em',
                  color: k.tone === 'good' ? BPI.good : BPI.ink
                }}>{k.val}</div>
                  <Cite n={k.cite} />
                </div>
                <div style={{ fontSize: 11, color: BPI.ink55, marginTop: 2 }}>{k.unit}</div>
              </div>
            )}
          </div>

          <H title="The slow corridor"
          sub="Madison Av / E 28 St ↔ Madison Av / E 58 St (northbound)" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 24, marginBottom: 18 }}>
            <div style={{ fontSize: 13.5, color: BPI.ink, lineHeight: 1.65, maxWidth: 560 }}>
              On this 1.5-mile stretch, M15 SBS buses average <b>4.2 mph</b><Cite n={5} /> — slower than walking pace<Cite n={4} /> for the median rider, and well below the corridor's own scheduled timepoint expectation of 7.1 mph.<Cite n={5} /> The slowest hours are 16:00–19:00, when severity exceeds the route's 90th percentile for 11 consecutive hour-blocks.<Cite n={1} />
              <br /><br />
              The segment is currently a painted bus lane only on the southern third (E 28–38 St). DOT has no concrete-lane upgrade scheduled in the FY26–28 capital plan.<Cite n={7} />
            </div>
            <MapThumb width={280} height={170} emphasis={BPI.bad} label="Madison Av · 28→58 St · NB" />
          </div>

          <div style={{
            padding: '12px 14px', background: BPI.warnBg, borderRadius: 3, fontSize: 11.5,
            color: BPI.warn, marginBottom: 18, lineHeight: 1.45,
            display: 'flex', gap: 10, alignItems: 'flex-start'
          }}>
            <div style={{ marginTop: 1 }}>⚠</div>
            <div>
              <b>What "speed" means here.</b> MTA segment speeds reflect real rider experience — they include dwell time, traffic, signals, and stops.<Cite n={8} /> Read as <i>observed bus travel speed</i>, not pure traffic speed. Bus-lane installs raise this number; route restructurings can lower it without buses being slower.
            </div>
          </div>

          <H title="What's been tried, and what we can defend saying" />
          <div style={{ fontSize: 13.5, color: BPI.ink, lineHeight: 1.65, maxWidth: 760 }}>
            ACE all-day enforcement (rolled out May 2025) coincides with a 0.7 mph PM-peak speed gain on ACE-monitored M15 segments.<Cite n={3} /> However, this period overlaps with the launch of Manhattan congestion pricing.<Cite n={6} /> We do not claim ACE alone caused the gain — only that the two effects move together, and that on segments where neither intervention applies the gain is not observed.<Cite n={3} />
          </div>
        </div>

        {/* Right rail: mode-switched between outline/sources and claims workbench */}
        <div style={{
          background: BPI.card, boxShadow: `inset 1px 0 0 ${BPI.rule}`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}>
          {/* Mode tabs */}
          <div style={{
            padding: '0 28px', display: 'flex', gap: 20, fontSize: 12.5,
            boxShadow: `inset 0 -1px 0 ${BPI.rule}`, flexShrink: 0
          }}>
            {[['brief', 'Outline & sources'], ['claims', 'Claims & strength']].map(([m, label]) =>
            <span key={m} onClick={() => setRailMode(m)} style={{
              padding: '14px 0', cursor: 'pointer',
              color: railMode === m ? BPI.ink : BPI.ink55,
              fontWeight: railMode === m ? 600 : 400,
              boxShadow: railMode === m ? `inset 0 -2px 0 ${BPI.ink}` : 'none'
            }}>{label}</span>
            )}
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
            {railMode === 'brief' ?
            <>
                <div className="eyebrow" style={{ marginBottom: 14 }}>Outline</div>
                {[
              { n: 1, t: 'The slow corridor', active: true },
              { n: 2, t: "What's been tried" },
              { n: 3, t: 'Riders affected' },
              { n: 4, t: 'What would the evidence support?' }].
              map((s) =>
              <div key={s.n} style={{
                padding: '8px 10px', marginLeft: -10, marginRight: -10, marginBottom: 2,
                background: s.active ? BPI.ink06 : 'transparent',
                borderLeft: s.active ? `2px solid ${BPI.ink}` : '2px solid transparent',
                fontSize: 13, fontWeight: s.active ? 600 : 400, cursor: 'pointer'
              }}><span style={{ color: BPI.ink55, marginRight: 8 }}>0{s.n}</span>{s.t}</div>
              )}
                <div className="rule" style={{ margin: '24px 0' }} />
                <div className="eyebrow" style={{ marginBottom: 10 }}>Sources (23)</div>
                <div style={{ fontSize: 11.5, lineHeight: 1.5, color: BPI.ink70 }}>
                  {[
                ['1', 'MTA Bus Speeds, segment-level — Mar 2026 window'],
                ['2', 'MTA Bus Speeds, all Manhattan SBS routes — Mar 2026'],
                ['3', 'MTA ACE program violations — May 2024–Apr 2026'],
                ['4', 'NYC DOT pedestrian study — avg walking pace 3.1 mph'],
                ['5', 'M1 pilot — 2,003 obs, 168 ridership windows'],
                ['6', 'TBTA congestion pricing introduction — Jan 5, 2025'],
                ['7', 'NYCDOT FY26–28 capital plan, bus-priority section'],
                ['8', 'MTA Open Data blog — "How we compute segment speeds"']].
                map(([n, t]) =>
                <div key={n} style={{ display: 'grid', gridTemplateColumns: '22px 1fr', marginBottom: 8 }}>
                      <span style={{ color: BPI.accent, fontWeight: 600 }}>[{n}]</span>
                      <span>{t}</span>
                    </div>
                )}
                  <div style={{ color: BPI.ink40, marginTop: 4 }}>+ 15 more…</div>
                </div>
                <div className="rule" style={{ margin: '24px 0' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button className="txt" style={{ padding: '10px 14px', background: BPI.ink, color: BPI.paper, borderRadius: 3, fontSize: 12.5, fontWeight: 600 }}>Export as PDF brief</button>
                  <button className="txt" style={{ padding: '10px 14px', border: `1px solid ${BPI.ink20}`, borderRadius: 3, fontSize: 12.5, fontWeight: 500 }}>Open in route view</button>
                  <button className="txt" style={{ padding: '10px 14px', border: `1px solid ${BPI.ink20}`, borderRadius: 3, fontSize: 12.5, fontWeight: 500 }}>Share read-only link</button>
                </div>
              </> : (

            /* ── Claims workbench ───────────────────────────────── */
            <>
                {/* Strength meter */}
                <div style={{
                padding: '14px 16px', background: strengthBg, borderRadius: 4, marginBottom: 20,
                boxShadow: `inset 0 0 0 1px ${strengthColor}33`
              }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div className="eyebrow" style={{ color: strengthColor }}>Brief strength</div>
                    <div className="num" style={{ fontSize: 24, fontWeight: 700, color: strengthColor, letterSpacing: '-0.02em' }}>
                      {briefStrength}<span style={{ fontSize: 12, fontWeight: 500 }}>%</span>
                    </div>
                  </div>
                  <div style={{ height: 6, background: 'rgba(22,20,15,.10)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                    height: '100%', borderRadius: 3, width: `${briefStrength}%`,
                    background: strengthColor,
                    transition: 'width .4s cubic-bezier(.4,.2,.1,1), background .3s'
                  }} />
                  </div>
                  <div style={{ fontSize: 11, color: strengthColor, marginTop: 6, opacity: 0.9 }}>
                    {briefStrength >= 75 ? 'Defensible — all major claims supported' :
                  briefStrength >= 50 ? 'Reviewable — key claims missing' :
                  'Thin — missing core evidence'}
                  </div>
                </div>

                <div className="eyebrow" style={{ marginBottom: 12 }}>Toggle claims to include</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                { id: 0, label: 'Opening statement', text: 'M15 SBS runs at 6.74 mph — slowest Manhattan SBS', strength: 'strong', cites: 2, weight: 25 },
                { id: 1, label: 'The slow corridor', text: 'Madison Av accounts for 43% of total route delay', strength: 'strong', cites: 3, weight: 25 },
                { id: 2, label: 'Intervention evidence', text: 'ACE rollout coincides with +0.7 mph PM-peak gain', strength: 'moderate', cites: 2, weight: 25, caveat: 'Overlaps congestion pricing' },
                { id: 3, label: 'Treatment gap', text: 'No concrete lane upgrade on Madison scheduled', strength: 'strong', cites: 1, weight: 15 }].
                map((claim) => {
                  const on = activeClaims.includes(claim.id);
                  const sc = claim.strength === 'strong' ? BPI.good : BPI.warn;
                  return (
                    <div key={claim.id} onClick={() => toggleClaim(claim.id)} style={{
                      padding: '12px 14px', borderRadius: 4, cursor: 'pointer',
                      background: on ? BPI.paper : BPI.ink06,
                      boxShadow: `inset 0 0 0 1px ${on ? BPI.rule : 'transparent'}`,
                      opacity: on ? 1 : 0.5,
                      transition: 'opacity .2s, background .2s',
                      display: 'flex', gap: 12, alignItems: 'flex-start'
                    }}>
                        <div style={{
                        width: 18, height: 18, borderRadius: 9, flexShrink: 0, marginTop: 1,
                        background: on ? BPI.ink : 'transparent',
                        boxShadow: `inset 0 0 0 1.5px ${on ? BPI.ink : BPI.ink40}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background .15s'
                      }}>
                          {on && <div style={{ width: 6, height: 6, borderRadius: 3, background: BPI.paper }} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: BPI.ink55 }}>{claim.label}</span>
                            <span style={{
                            fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                            textTransform: 'uppercase', color: sc,
                            background: `${sc}22`, padding: '1px 5px', borderRadius: 2
                          }}>{claim.strength}</span>
                          </div>
                          <div style={{ fontSize: 12, color: BPI.ink70, lineHeight: 1.45 }}>{claim.text}</div>
                          <div style={{ display: 'flex', gap: 10, marginTop: 5, fontSize: 10.5, color: BPI.ink55 }}>
                            <span>{claim.cites} citation{claim.cites !== 1 ? 's' : ''}</span>
                            <span style={{ fontWeight: 600, color: sc }}>+{claim.weight}pts</span>
                            {claim.caveat && <span style={{ color: BPI.warn }}>⚠ {claim.caveat}</span>}
                          </div>
                        </div>
                      </div>);

                })}
                </div>
                <div style={{ marginTop: 18, fontSize: 11.5, color: BPI.ink55, lineHeight: 1.6 }}>
                  Toggle claims off to see how brief strength changes. A brief with only weak or disputed claims should not be published.
                </div>
              </>)
            }
          </div>
        </div>
      </div>
    </div>);

}

Object.assign(window, { RF_Home, RF_RouteDetail, RF_Brief });