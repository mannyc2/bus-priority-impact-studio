// route-compare-inline-screen.jsx
// The assembled comparison-mode route page. Reuses the data + primitives
// from route-compare-inline.jsx and the tab bodies from
// route-detail-tabs.jsx; only the header, KPI strip and Overview are
// re-authored to carry the overlay.

// ── Picker: switch which route is laid over M15 ──────────────
function ComparePicker({ compId, open, onToggle, onPick }) {
  const comp = RCI_COMPARE[compId];
  return (
    <div style={{ position: 'relative' }}>
      <button className="bpi" onClick={onToggle} style={{
        display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
        background: open ? BPI.ink06 : BPI.card, border: `1px solid ${open ? BPI.ink20 : BPI.rule}`,
        borderRadius: 4, padding: '7px 10px 7px 11px', fontFamily: 'inherit',
      }}>
        <RouteBadge route={comp.badge.route} sbs={comp.badge.sbs} size="sm" />
        <div style={{ textAlign: 'left', minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.1, color: BPI.ink, whiteSpace: 'nowrap' }}>{comp.name.split(' · ')[0]}</div>
          <div style={{ fontSize: 9.5, color: BPI.ink55, fontFamily: BPIMono, letterSpacing: '0.04em', textTransform: 'uppercase', marginTop: 2 }}>{comp.kind}</div>
        </div>
        <span style={{ fontSize: 8, color: BPI.ink40, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', marginLeft: 2 }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 40, width: 320,
          background: BPI.cardRaised, borderRadius: 6, padding: 5,
          boxShadow: `0 0 0 1px ${BPI.rule}, 0 20px 46px -20px rgba(22,20,15,.45)`,
        }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: BPI.ink40, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '8px 10px 6px' }}>Lay another route on top</div>
          {RCI_COMPARE_ORDER.map((id) => {
            const r = RCI_COMPARE[id]; const sel = id === compId;
            return (
              <button key={id} className="bpi" onClick={() => onPick(id)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px',
                borderRadius: 4, border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                background: sel ? BPI.accentBg : 'transparent',
              }}
                onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = BPI.ink06; }}
                onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = 'transparent'; }}>
                <RouteBadge route={r.badge.route} sbs={r.badge.sbs} size="sm" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: sel ? 600 : 500, color: BPI.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name.split(' · ')[0]} <span style={{ color: BPI.ink40, fontWeight: 400 }}>· {r.kind}</span></div>
                  <div className="num" style={{ fontSize: 10.5, color: BPI.ink55, marginTop: 1 }}>{r.speed.toFixed(2)} mph · {(r.riders / 1000).toFixed(0)}K riders</div>
                </div>
                {sel && <span style={{ fontSize: 11, color: BPI.accent, fontWeight: 700 }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── KPI strip — absolute when solo, relative when comparing ──
function CompareKPIStrip({ primary, comp, comparing }) {
  const speedTrend = primary.trend;
  const cells = [
    { key: 'speed',  lbl: 'Weighted avg speed', val: primary.speed.toFixed(2), unit: 'mph', soloSub: '7th percentile of NYC SBS', spark: true },
    { key: 'riders', lbl: 'Daily riders',        val: (primary.riders / 1000).toFixed(1) + 'K', soloSub: '−4.1% YoY' },
    { key: 'lost',   lbl: 'Rider-hours lost / day', val: primary.lost.toLocaleString(), tone: 'bad', soloSub: 'vs. scheduled timepoints' },
    { key: 'lane',   lbl: 'Bus-lane coverage',   val: primary.lane + '%', soloSub: 'of route mileage' },
    { key: 'ace',    lbl: 'ACE status',          val: 'Active', tone: 'good', soloSub: 'since ' + primary.ace.since },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 24 }}>
      {cells.map((k, i) => {
        const m = RCI_METRICS.find((x) => x.key === k.key);
        let sub = k.soloSub;
        if (comparing && m) {
          const { raw, tie, better, pct } = rciDiff(m, primary, comp);
          const dtxt = (raw > 0 ? '+' : '−') + m.d(Math.abs(raw)) + (k.key === 'lane' ? ' pts' : k.unit && k.unit !== '/ day' ? ' ' + k.unit : '');
          sub = (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 7 }}>
              <DeltaPill raw={raw} tie={tie} better={better} size="sm" text={`${tie ? 'even' : dtxt}${tie ? '' : ` · ${pct.toFixed(0)}%`}`} />
              <span style={{ fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: RCI_PEER }} />
                {comp.badge.route}{comp.badge.sbs ? '' : ' Loc'} {m.fmt(comp[k.key])}{k.key === 'speed' ? '' : k.key === 'lane' ? '%' : ''}
              </span>
            </div>
          );
        } else if (comparing && k.key === 'ace') {
          sub = (
            <div style={{ fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono, marginTop: 9, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: 2, background: RCI_PEER }} />
              {comp.badge.route} also active · {comp.ace.since}
            </div>
          );
        }
        return (
          <div key={i} style={{ paddingRight: 18, borderRight: i < 4 ? `1px solid ${BPI.rule}` : 'none' }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>{k.lbl}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <div className="num" style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', color: k.tone === 'bad' ? BPI.bad : k.tone === 'good' ? BPI.good : BPI.ink }}>{k.val}</div>
              {k.unit && <div style={{ fontSize: 11, color: BPI.ink55, letterSpacing: '0.03em' }}>{k.unit}</div>}
              {k.spark && <div style={{ marginLeft: 'auto' }}><Spark data={speedTrend} width={68} height={20} color={BPI.bad} /></div>}
            </div>
            {typeof sub === 'string'
              ? <div style={{ fontSize: 11, color: BPI.ink55, marginTop: 3 }}>{sub}</div>
              : sub}
          </div>
        );
      })}
    </div>
  );
}

// ── Compare-mode framing sentence for the Overview lede ──
function compareLede(primary, comp) {
  if (comp.id === 'M15L') {
    return (
      <span>
        Same street, same painted lane, same camera enforcement — <b>M15 Local</b> just stops everywhere the SBS skips.
        Holding the corridor constant, the <b style={{ color: BPI.ink }}>SBS service pattern alone is worth +{(primary.speed - comp.speed).toFixed(2)} mph</b> of observed speed.
      </span>
    );
  }
  const faster = comp.speed > primary.speed;
  if (faster) {
    return (
      <span>
        <b>{comp.name.split(' · ')[0]}</b> runs <b style={{ color: BPI.good }}>{(comp.speed - primary.speed).toFixed(2)} mph faster</b> than M15 on a comparable treatment stack —
        a positive control for what this corridor could reach. The overlays below show the gap, hour by hour and month by month.
      </span>
    );
  }
  return (
    <span>
      M15 already runs <b style={{ color: BPI.good }}>{(primary.speed - comp.speed).toFixed(2)} mph faster</b> than <b>{comp.name.split(' · ')[0]}</b> —
      a slower peer facing the same congestion. The overlays below isolate where the two diverge.
    </span>
  );
}

// ── Comparison-aware Overview tab ──
function CompareOverview({ primary, comp }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* compare lede */}
      <div style={{ padding: '14px 18px', background: BPI.accentBg, borderRadius: 3, boxShadow: `inset 0 0 0 1px oklch(0.88 0.05 252)`, display: 'grid', gridTemplateColumns: '4px 1fr', gap: 14 }}>
        <div style={{ background: RCI_PEER, borderRadius: 2 }} />
        <div>
          <div className="eyebrow" style={{ marginBottom: 4, color: RCI_PEER }}>Comparing against {comp.name.split(' · ')[0]} · {comp.kind}</div>
          <div style={{ fontSize: 13.5, color: BPI.ink, lineHeight: 1.6, maxWidth: 980, textWrap: 'pretty' }}>{compareLede(primary, comp)}</div>
        </div>
      </div>

      {/* corridor with the peer's average laid over it */}
      <div>
        <H title={`The corridor, against ${comp.badge.route}${comp.badge.sbs ? '' : ' Local'}`}
          sub={`M15's observed speed segment by segment. The dashed blue line is ${comp.name.split(' · ')[0]}'s weighted average — every segment below it is running slower than the peer's all-route mean.`}
          right={<span style={{ fontSize: 11, color: BPI.accent, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>Open full corridor view →</span>} />
        <div style={{ background: BPI.card, borderRadius: 3, boxShadow: `0 0 0 1px ${BPI.rule}`, padding: '14px 22px 18px' }}>
          <CorridorMap width={1200} height={326} benchmark={{ value: comp.speed, label: `${comp.badge.route}${comp.badge.sbs ? ' SBS' : ' LOCAL'} AVG`, color: RCI_PEER }} />
        </div>
      </div>

      {/* the two overlay charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <H title="Speed trend, both routes" sub="14 months, weighted average. The shaded band is the running gap between the two." />
          <ChartFrame height={184}><CompareSpeedTrend primary={primary} comp={comp} /></ChartFrame>
          <RCILegend primary={primary} comp={comp} />
        </div>
        <div>
          <H title="Speed by hour, both routes" sub="Weekday median. The gap widens at the PM peak — the slowest hours for both." />
          <ChartFrame height={184}><CompareHourSpeed primary={primary} comp={comp} /></ChartFrame>
          <RCILegend primary={primary} comp={comp} />
        </div>
      </div>

      {/* head to head ledger */}
      <div>
        <H title="Head to head" sub="Every headline metric on both routes, with the signed gap. Green marks the side that's ahead." />
        <CompareHeadToHead primary={primary} comp={comp} />
      </div>
    </div>
  );
}

// ── Segment data for the Slow-segments tab (mirrors the route page) ──
function rciBuildSegments() {
  function gen(am, mid, pm) {
    const arr = [];
    for (let h = 0; h < 24; h++) {
      let v = 0.1;
      if (h >= 7 && h <= 9) v = am; else if (h >= 11 && h <= 14) v = mid;
      else if (h >= 16 && h <= 19) v = pm; else if (h >= 6 && h <= 21) v = 0.3;
      arr.push(v + Math.sin(h * 1.7) * 0.04);
    }
    return arr;
  }
  function tx(lane, ace, tsp, extras = []) {
    const out = [];
    if (lane === 'yes') out.push({ type: 'bus_lane', state: 'active', coverage: 1.0 });
    else if (lane === 'partial') out.push({ type: 'bus_lane', state: 'active', coverage: 0.5 });
    else if (lane === 'no') out.push({ type: 'bus_lane', state: 'historical_context' });
    out.push(ace ? { type: 'ace', state: 'active' } : { type: 'ace', state: 'source_gap' });
    if (tsp) out.push({ type: 'tsp', state: 'active' });
    out.push({ type: 'sbs', state: 'active' }, { type: 'off_board_fare', state: 'active' },
      { type: 'all_door', state: 'active' }, { type: 'stop_consolidation', state: 'active' });
    return out.concat(extras);
  }
  return [
    { dir: 'NB', from: 'Madison Av / E 28 St', to: 'Madison Av / E 58 St', mph: 4.2, sched: 7.1, rh: 18420, hours: gen(0.7, 0.5, 0.9), lane: 'partial', ace: false, tsp: false, flag: 'top', treatments: tx('partial', false, false, [{ type: 'capital_milestone', state: 'planned', detail: 'concrete-lane extension 23→34 St' }]), aiNote: 'No violation reduction despite ACE active on adjacent blocks. Painted-only lane may be structurally unenforceable here.', aiBasis: '14 mo · 8 comparable corridors', aiConfidence: 'high' },
    { dir: 'NB', from: '1 Av / E 14 St', to: '1 Av / E 34 St', mph: 4.9, sched: 7.6, rh: 14110, hours: gen(0.6, 0.5, 0.85), lane: 'yes', ace: true, tsp: false, treatments: tx('yes', true, false, [{ type: 'bus_bulb', state: 'active', coverage: 0.4 }]), aiNote: 'Speed is 1.3 mph below comparable fully-laned M15 segments. Decline accelerated after May 2025.', aiBasis: '12 mo · 4 comparable segments', aiConfidence: 'high' },
    { dir: 'SB', from: '2 Av / E 60 St', to: '2 Av / E 42 St', mph: 5.2, sched: 7.8, rh: 12880, hours: gen(0.55, 0.6, 0.7), lane: 'yes', ace: true, tsp: false, treatments: tx('yes', true, false) },
    { dir: 'NB', from: '1 Av / E 86 St', to: '1 Av / E 96 St', mph: 5.8, sched: 8.2, rh: 9640, hours: gen(0.5, 0.4, 0.6), lane: 'yes', ace: true, tsp: true, treatments: tx('yes', true, true, [{ type: 'queue_jump', state: 'active' }, { type: 'daylighting', state: 'active' }]) },
    { dir: 'SB', from: '2 Av / E 23 St', to: '2 Av / E 14 St', mph: 6.1, sched: 8.0, rh: 8210, hours: gen(0.4, 0.5, 0.55), lane: 'yes', ace: true, tsp: false, treatments: tx('yes', true, false, [{ type: 'offset_lane', state: 'active', coverage: 1.0, detail: 'concrete buffer · Q4 2023' }, { type: 'capital_milestone', state: 'historical_context', detail: 'concrete-lane upgrade Q4 2023' }]), aiNote: 'Concrete-lane upgrade Q4 2023; expected speed gain of +0.6 mph not observed.', aiBasis: '24 mo · pre/post window', aiConfidence: 'moderate' },
    { dir: 'SB', from: '1 Av / E 96 St', to: '1 Av / E 110 St', mph: 6.4, sched: 8.0, rh: 7820, hours: gen(0.4, 0.4, 0.55), lane: 'yes', ace: true, tsp: true, treatments: tx('yes', true, true, [{ type: 'daylighting', state: 'planned', detail: 'FY27' }]) },
    { dir: 'NB', from: '2 Av / E 79 St', to: '2 Av / E 86 St', mph: 6.6, sched: 8.4, rh: 6940, hours: gen(0.4, 0.3, 0.55), lane: 'yes', ace: true, tsp: false, treatments: tx('yes', true, false, [{ type: 'tsp', state: 'proposed', detail: '2027 capital request' }]) },
    { dir: 'SB', from: '2 Av / E 14 St', to: '2 Av / Houston', mph: 6.9, sched: 8.6, rh: 5980, hours: gen(0.3, 0.4, 0.5), lane: 'partial', ace: false, tsp: false, treatments: tx('partial', false, false), aiNote: 'Speed dip clusters around 17:30 — likely outbound flow at 14 St busway junction.', aiBasis: '6 mo · 3 routes share pattern', aiConfidence: 'moderate' },
    { dir: 'NB', from: '1 Av / Houston', to: '1 Av / E 14 St', mph: 7.1, sched: 8.7, rh: 5410, hours: gen(0.35, 0.3, 0.5), lane: 'yes', ace: true, tsp: false, treatments: tx('yes', true, false) },
    { dir: 'SB', from: '2 Av / E 110 St', to: '2 Av / E 96 St', mph: 7.3, sched: 8.5, rh: 4980, hours: gen(0.3, 0.3, 0.45), lane: 'yes', ace: true, tsp: true, treatments: tx('yes', true, true) },
    { dir: 'NB', from: '1 Av / E 34 St', to: '1 Av / E 42 St', mph: 7.4, sched: 8.5, rh: 4220, hours: gen(0.3, 0.35, 0.4), lane: 'yes', ace: true, tsp: false, treatments: tx('yes', true, false) },
    { dir: 'SB', from: '2 Av / E 42 St', to: '2 Av / E 23 St', mph: 7.6, sched: 8.8, rh: 3890, hours: gen(0.3, 0.3, 0.4), lane: 'yes', ace: true, tsp: false, treatments: tx('yes', true, false) },
    { dir: 'NB', from: 'Allen / Houston', to: '1 Av / Houston', mph: 7.9, sched: 8.9, rh: 2860, hours: gen(0.25, 0.3, 0.4), lane: 'no', ace: false, tsp: false, treatments: tx('no', false, false) },
  ];
}

// ─────────────────────────────────────────────────────────────
// RF_RouteCompareInline — the page
// ─────────────────────────────────────────────────────────────
function RF_RouteCompareInline({ initialComparing = true, initialCompId = 'M15L' }) {
  const [comparing, setComparing] = React.useState(initialComparing);
  const [compId, setCompId] = React.useState(initialCompId);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('Overview');
  const [visibleCount, setVisibleCount] = React.useState(5);
  const [segSort, setSegSort] = React.useState('rh');
  const [expandedNote, setExpandedNote] = React.useState(null);

  const primary = RCI_PRIMARY;
  const comp = RCI_COMPARE[compId];

  const segments = React.useMemo(rciBuildSegments, []);
  const sortedSegments = React.useMemo(() => {
    const arr = [...segments];
    if (segSort === 'mph') arr.sort((a, b) => a.mph - b.mph); else arr.sort((a, b) => b.rh - a.rh);
    return arr;
  }, [segSort, segments]);

  function enter(id) { setCompId(id); setComparing(true); setPickerOpen(false); setActiveTab('Overview'); }

  return (
    <div className="bpi" style={{ width: RCI_W, height: RCI_H, display: 'flex', flexDirection: 'column' }}>
      <StudioBar active="Routes" breadcrumb={comparing ? `Routes / M15 +SBS vs ${comp.badge.route}${comp.badge.sbs ? ' +SBS' : ' Local'}` : 'Routes / M15 +SBS'} />

      {pickerOpen && <div onClick={() => setPickerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />}

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Route header — gains a second route when comparing */}
        <div style={{ padding: '22px 28px 18px', background: BPI.card, boxShadow: `inset 0 -1px 0 ${BPI.rule}`, position: 'relative', zIndex: 35 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginBottom: 18 }}>
            <RouteBadge route="M15" sbs size="xl" />
            <div style={{ flex: comparing ? 'none' : 1, minWidth: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.1 }}>1st Avenue / 2nd Avenue SBS</div>
              <div style={{ fontSize: 12.5, color: BPI.ink55, marginTop: 4 }}>{primary.meta}</div>
            </div>

            {comparing && (
              <>
                <div style={{ alignSelf: 'stretch', display: 'flex', alignItems: 'center', color: BPI.ink40, fontSize: 12, fontWeight: 600, fontFamily: BPIMono, padding: '0 4px' }}>vs</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div>
                    <div className="eyebrow" style={{ fontSize: 9.5, color: RCI_PEER, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Comparing with</div>
                    <ComparePicker compId={compId} open={pickerOpen} onToggle={() => setPickerOpen(!pickerOpen)} onPick={enter} />
                  </div>
                  <button className="txt" onClick={() => { setComparing(false); setPickerOpen(false); }} title="Exit comparison" style={{
                    width: 30, height: 30, borderRadius: 15, border: `1px solid ${BPI.rule}`, background: BPI.paper,
                    color: BPI.ink55, fontSize: 15, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    alignSelf: 'flex-end', cursor: 'pointer',
                  }}>×</button>
                </div>
              </>
            )}

            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: 8, alignSelf: comparing ? 'flex-end' : 'flex-start' }}>
              {!comparing && (
                <button className="txt" onClick={() => enter('M15L')} style={{ padding: '8px 14px', border: `1px solid ${BPI.ink20}`, borderRadius: 3, fontSize: 12.5, fontWeight: 500 }}>Compare with M15 local</button>
              )}
              <button className="txt" style={{ padding: '8px 14px', background: BPI.ink, color: BPI.paper, borderRadius: 3, fontSize: 12.5, fontWeight: 600 }}>{comparing ? 'Draft brief from gap →' : 'Generate brief →'}</button>
            </div>
          </div>

          <CompareKPIStrip primary={primary} comp={comp} comparing={comparing} />
        </div>

        {/* Tabs */}
        <div style={{ padding: '0 28px', background: BPI.card, boxShadow: `inset 0 -1px 0 ${BPI.rule}`, display: 'flex', gap: 24, fontSize: 12.5, alignItems: 'center' }}>
          {['Overview', 'Slow segments', 'Riders', 'Interventions', 'Timeline', 'Data notes'].map((t) => (
            <span key={t} onClick={() => setActiveTab(t)} style={{
              padding: '10px 0', color: t === activeTab ? BPI.ink : BPI.ink55, fontWeight: t === activeTab ? 600 : 400,
              boxShadow: t === activeTab ? `inset 0 -2px 0 ${BPI.ink}` : 'none', cursor: 'pointer',
            }}>{t}</span>
          ))}
          <div style={{ flex: 1 }} />
          {comparing && activeTab !== 'Overview' && (
            <span style={{ fontSize: 10.5, color: BPI.ink40, fontFamily: BPIMono, letterSpacing: '0.02em' }}>overlay lives on Overview · this tab shows M15</span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: '28px 32px 32px', overflow: 'auto' }}>
          {activeTab === 'Overview' && (comparing
            ? <CompareOverview primary={primary} comp={comp} />
            : <RouteTabOverview />)}
          {activeTab === 'Riders' && <RouteTabRiders />}
          {activeTab === 'Interventions' && <RouteTabInterventions />}
          {activeTab === 'Timeline' && <RouteTabTimeline />}
          {activeTab === 'Data notes' && <RouteTabDataNotes />}
          {activeTab === 'Slow segments' && <RouteTabSlowSegments
            segments={segments} sortedSegments={sortedSegments}
            displayedSegments={sortedSegments.slice(0, visibleCount)}
            visibleCount={visibleCount} setVisibleCount={setVisibleCount}
            segSort={segSort} setSegSort={setSegSort}
            expandedNote={expandedNote} setExpandedNote={setExpandedNote}
            remaining={segments.length - visibleCount} />}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { RF_RouteCompareInline, ComparePicker, CompareKPIStrip, CompareOverview });
