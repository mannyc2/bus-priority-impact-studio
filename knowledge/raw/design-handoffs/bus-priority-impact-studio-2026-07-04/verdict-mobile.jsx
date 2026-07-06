// verdict-mobile.jsx
// Real 390px mobile verdict frame. `lead` controls reading order:
//   'insights'  — KPI snapshot → verdict → what stands out (comp-A posture)
//   'masthead'  — verdict sentence first, big → KPI → what stands out (comp-C posture)
// Healthy routes (no insights) render the checked-clean state inline.
// Deps: system.jsx, verdict-primitives.jsx, verdict-shell.jsx, verdict-data.jsx

function MStatusBar() {
  return (
    <div style={{
      height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 22px', background: BPI.card,
    }}>
      <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>9:41</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 11 }}>▮▮▮</span>
        <span style={{ fontSize: 11 }}>◊</span>
        <span style={{ width: 20, height: 11, borderRadius: 3, border: `1px solid ${BPI.ink40}`, display: 'inline-block', position: 'relative' }}>
          <span style={{ position: 'absolute', inset: 1.5, right: 5, background: BPI.ink, borderRadius: 1 }} />
        </span>
      </div>
    </div>
  );
}

function MAppBar({ route }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px 12px',
      background: BPI.card, boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
    }}>
      <span style={{ fontSize: 19, color: BPI.ink70 }}>‹</span>
      <RouteBadge route={route.badge.route} sbs={route.badge.sbs} size="sm" />
      <span style={{ fontSize: 13, fontWeight: 600 }}>Route detail</span>
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 12, fontWeight: 600, color: BPI.accent }}>Brief</span>
    </div>
  );
}

function MRouteTitle({ route }) {
  return (
    <div style={{ padding: '14px 16px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
        <PostureTag posture={route.posture} label={route.postureLabel} />
        <span style={{ fontSize: 10.5, color: BPI.ink40, fontFamily: BPIMono }}>{route.densityLabel}</span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.2 }}>{route.title}</div>
      <div style={{ fontSize: 11.5, color: BPI.ink55, marginTop: 4 }}>{route.geo}</div>
    </div>
  );
}

// condensed judged KPI snapshot
function MKpi({ route, small }) {
  const k = route.kpi;
  const trendArrow = k.trend.dir === 'up' ? '↑' : k.trend.dir === 'down' ? '↓' : '→';
  return (
    <div style={{ margin: '0 16px', background: BPI.card, borderRadius: 4, boxShadow: `0 0 0 1px ${BPI.rule}`, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', boxShadow: `inset 0 -1px 0 ${BPI.rule}` }}>
        <div style={{ padding: '13px 15px', boxShadow: `inset -1px 0 0 ${BPI.rule}` }}>
          <div className="eyebrow" style={{ fontSize: 10, marginBottom: 5 }}>Condition</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span className="num" style={{ fontSize: small ? 24 : 28, fontWeight: 600, letterSpacing: '-0.025em', color: k.condition.tone ? vTone(k.condition.tone).fg : BPI.ink, lineHeight: 1 }}>{k.condition.value}</span>
            <span style={{ fontSize: 11, color: BPI.ink55 }}>{k.condition.unit}</span>
          </div>
          <div style={{ fontSize: 10, color: BPI.ink55, marginTop: 4, lineHeight: 1.3 }}>{k.condition.peer}</div>
          <div style={{ marginTop: 6 }}><DataAsOf date={k.condition.asOf} fresh={k.condition.fresh} /></div>
        </div>
        <div style={{ padding: '13px 15px' }}>
          <div className="eyebrow" style={{ fontSize: 10, marginBottom: 5 }}>{k.trend.window} trend</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: k.trend.tone ? vTone(k.trend.tone).fg : BPI.ink70 }}>{trendArrow}</span>
            <span className="num" style={{ fontSize: 16, fontWeight: 600, color: k.trend.tone ? vTone(k.trend.tone).fg : BPI.ink }}>{k.trend.pct}</span>
          </div>
          <div style={{ marginTop: 6 }}><Spark data={route.spark.slice(-14)} width={130} height={24} color={k.trend.tone ? vTone(k.trend.tone).fg : BPI.ink70} fill /></div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
        {[
          { lbl: 'Riders', val: k.riders.value, sub: k.riders.sub, fresh: k.riders.fresh, asOf: k.riders.asOf },
          { lbl: 'Treatment', val: k.treatment.posture, sub: k.treatment.sub, tone: k.treatment.tone, fresh: k.treatment.fresh, asOf: k.treatment.asOf, sm: true },
          { lbl: 'Reliability', val: k.reliability.note, sub: 'building', fresh: 'unknown', asOf: null, sm: true },
        ].map((c, i) => (
          <div key={i} style={{ padding: '11px 13px', boxShadow: i < 2 ? `inset -1px 0 0 ${BPI.rule}` : 'none' }}>
            <div className="eyebrow" style={{ fontSize: 9.5, marginBottom: 4 }}>{c.lbl}</div>
            <div className="num" style={{ fontSize: c.sm ? 12.5 : 16, fontWeight: 600, color: c.tone ? vTone(c.tone).fg : BPI.ink, lineHeight: 1.15 }}>{c.val}</div>
            <div style={{ fontSize: 9.5, color: BPI.ink55, marginTop: 3 }}>{c.sub}</div>
            <div style={{ marginTop: 5 }}><DataAsOf date={c.asOf} fresh={c.fresh} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MTabs({ route }) {
  const flags = route.checked.flagsByTab || {};
  const muted = route.density === 'sparse' ? ['Riders', 'Treatments & history'] : [];
  return (
    <div style={{ display: 'flex', gap: 18, overflowX: 'auto', padding: '12px 16px 0', background: BPI.card, boxShadow: `inset 0 -1px 0 ${BPI.rule}` }}>
      {QUESTION_TABS.map((t) => {
        const f = flags[t]; const isMute = muted.includes(t);
        return (
          <span key={t} style={{
            display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap', paddingBottom: 10,
            fontSize: 12.5, color: t === 'Overview' ? BPI.ink : isMute ? BPI.ink40 : BPI.ink55,
            fontWeight: t === 'Overview' ? 600 : 400,
            boxShadow: t === 'Overview' ? `inset 0 -2px 0 ${BPI.ink}` : 'none',
          }}>{t}{f && <TabBadge count={f.count} sev={f.sev} />}</span>
        );
      })}
    </div>
  );
}

function MLede({ route, big }) {
  return (
    <div style={{ padding: big ? '18px 16px' : '16px 16px 6px' }}>
      <div className="eyebrow" style={{ marginBottom: 7, letterSpacing: '0.04em' }}>THE VERDICT</div>
      <div style={{ fontSize: big ? 17 : 14.5, color: BPI.ink, lineHeight: big ? 1.5 : 1.55, textWrap: 'pretty', fontWeight: big ? 500 : 400, letterSpacing: '-0.005em' }}>
        {route.lede}
      </div>
    </div>
  );
}

function MInsightCard({ insight }) {
  const t = insight.tone;
  return (
    <div style={{ background: BPI.card, borderRadius: 4, boxShadow: `0 0 0 1px ${BPI.rule}`, display: 'grid', gridTemplateColumns: '4px 1fr', overflow: 'hidden' }}>
      <div style={{ background: vTone(t).fg }} />
      <div style={{ padding: '13px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className="num" style={{ fontSize: 12, fontWeight: 700, color: vTone(t).fg, fontFamily: BPIMono }}>{String(insight.rank).padStart(2, '0')}</span>
          <SeverityMeter severity={insight.severity} tone={t} label={false} />
          <span style={{ fontSize: 9.5, fontWeight: 700, color: vTone(t).fg }}>{SEV_LABEL[insight.severity]}</span>
          <span style={{ width: 1, height: 10, background: BPI.ink10 }} />
          <ConfidenceMeter confidence={insight.confidence} label={false} />
          <span style={{ flex: 1 }} />
          <SendToBrief compact />
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: BPI.ink, lineHeight: 1.5, letterSpacing: '-0.005em', textWrap: 'pretty' }}>{insight.claim}</div>
        <div style={{ margin: '11px 0 10px' }}>
          <div className="mono" style={{ fontSize: 8.5, color: BPI.ink40, marginBottom: 5 }}>{insight.figure.label}</div>
          <InsightFigure figure={insight.figure} tone={t} w={326} h={42} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 10, boxShadow: `inset 0 1px 0 ${BPI.rule}` }}>
          {insight.caveat && <WhyChip />}
          <DeepLink tab={insight.tab} />
        </div>
      </div>
    </div>
  );
}

function VerdictMobile({ route, lead = 'insights' }) {
  const n = route.insights.length;
  const masthead = lead === 'masthead';
  const StandsOut = (
    <div style={{ padding: '4px 16px 0' }}>
      <H title="What stands out" sub={n ? `${n} ranked ${n === 1 ? 'finding' : 'findings'}.` : 'Nothing tripped a detector.'} />
      {n === 0
        ? <ZeroInsight route={route} variant="quiet" />
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{route.insights.map((ins, i) => <MInsightCard key={i} insight={ins} />)}</div>}
    </div>
  );

  return (
    <div style={{ width: 390, background: BPI.ink, borderRadius: 30, padding: 5, boxShadow: '0 12px 40px rgba(22,20,15,0.22)' }}>
      <div className="bpi" style={{ width: 380, background: BPI.paper, borderRadius: 26, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <MStatusBar />
        <MAppBar route={route} />
        <MRouteTitle route={route} />

        {masthead && (
          <div style={{ padding: '0 16px 14px' }}>
            <div style={{ background: BPI.card, borderRadius: 4, boxShadow: `0 0 0 1px ${BPI.rule}`, padding: '16px 16px' }}>
              <div className="eyebrow" style={{ marginBottom: 8, letterSpacing: '0.04em' }}>THE VERDICT</div>
              <div style={{ fontSize: 17.5, fontWeight: 500, color: BPI.ink, lineHeight: 1.45, letterSpacing: '-0.01em', textWrap: 'pretty' }}>{route.lede}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 14, paddingTop: 12, boxShadow: `inset 0 1px 0 ${BPI.rule}` }}>
                <span className="num" style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.03em', color: route.kpi.condition.tone ? vTone(route.kpi.condition.tone).fg : BPI.ink, lineHeight: 1 }}>{route.kpi.condition.value}</span>
                <span style={{ fontSize: 12, color: BPI.ink55 }}>{route.kpi.condition.unit}</span>
                <span style={{ fontSize: 11, color: BPI.ink55, marginLeft: 4 }}>· {route.kpi.condition.peer}</span>
                <span style={{ flex: 1 }} />
                <DataAsOf date={route.kpi.condition.asOf} fresh={route.kpi.condition.fresh} />
              </div>
            </div>
          </div>
        )}

        <div style={{ marginBottom: 14 }}><MKpi route={route} small={masthead} /></div>
        <MTabs route={route} />

        {!masthead && <MLede route={route} />}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '14px 0 8px' }}>
          {StandsOut}

          <div style={{ padding: '0 16px' }}>
            <H title={route.story.title} sub={route.story.sub} />
            <ChartFrame height={180}><StoryStrip story={route.story} w={326} h={178} /></ChartFrame>
          </div>

          <div style={{ padding: '0 16px' }}>
            <H title="On the street" sub="Tap through to the live map." />
            <VerdictMiniMap route={route} w={348} h={210} />
          </div>

          <div style={{ padding: '0 16px 8px' }}>
            <VerdictFooter route={route} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 12px' }}>
          <div style={{ width: 130, height: 5, borderRadius: 3, background: BPI.ink20 }} />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { VerdictMobile });
