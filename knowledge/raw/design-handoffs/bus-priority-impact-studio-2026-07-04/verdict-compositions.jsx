// verdict-compositions.jsx
// The three divergent desktop verdict compositions + their insight-card variants.
//   A — Ranked column   (insights-first; sparse-safe default)
//   B — Story spread     (story-figure-first; flagship dossier)
//   C — Masthead + grid  (verdict-sentence-first; report card)
// Deps: system.jsx, verdict-primitives.jsx, verdict-shell.jsx, verdict-data.jsx

// ── shared top chrome (the fixed shell the verdict sits inside) ──
function VerdictChrome({ route, children }) {
  return (
    <div className="bpi" style={{ width: 1320, background: BPI.paper, display: 'flex', flexDirection: 'column', minHeight: 200 }}>
      <StudioBar active="Routes" breadcrumb={`Routes / ${route.badge.route} +SBS`} />
      <VerdictRouteHeader route={route} />
      <div style={{ padding: '0 28px 18px', background: BPI.card, boxShadow: `inset 0 -1px 0 ${BPI.rule}` }}>
        <JudgedKpiStrip route={route} />
      </div>
      <QuestionTabs route={route} active="Overview" />
      {children}
    </div>
  );
}

// ── lede block — the verdict in one paragraph ─────────────────
function VerdictLede({ route, size = 'md' }) {
  const big = size === 'lg';
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '4px 1fr', gap: 16,
      padding: big ? '4px 0' : 0,
    }}>
      <div style={{ background: BPI.ink, borderRadius: 2 }} />
      <div>
        <div className="eyebrow" style={{ marginBottom: 6, letterSpacing: '0.04em' }}>THE VERDICT</div>
        <div style={{
          fontSize: big ? 19 : 16, color: BPI.ink, lineHeight: big ? 1.5 : 1.55,
          maxWidth: 940, textWrap: 'pretty', fontWeight: big ? 500 : 400, letterSpacing: '-0.005em',
        }}>{route.lede}</div>
      </div>
    </div>
  );
}

// ── INSIGHT CARD · variant A (full-width ranked row) ──────────
function InsightCardRow({ insight, showCaveat }) {
  const t = insight.tone;
  return (
    <div style={{
      background: BPI.card, borderRadius: 4, boxShadow: `0 0 0 1px ${BPI.rule}`,
      display: 'grid', gridTemplateColumns: '4px 46px 1fr 226px', overflow: 'hidden',
    }}>
      <div style={{ background: vTone(t).fg }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 16 }}>
        <span className="num" style={{ fontSize: 19, fontWeight: 700, color: vTone(t).fg, fontFamily: BPIMono }}>
          {String(insight.rank).padStart(2, '0')}
        </span>
      </div>
      <div style={{ padding: '16px 18px 15px 4px', minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 500, color: BPI.ink, lineHeight: 1.5, letterSpacing: '-0.005em', textWrap: 'pretty', maxWidth: 660 }}>
          {insight.claim}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
          <ChannelPair severity={insight.severity} tone={t} confidence={insight.confidence} words />
          <span style={{ width: 1, height: 12, background: BPI.ink10 }} />
          {insight.caveat && <WhyChip />}
          <DeepLink tab={insight.tab} />
          <span style={{ flex: 1 }} />
          <SendToBrief />
        </div>
        {showCaveat && insight.caveat && <CaveatNote text={insight.caveat} />}
      </div>
      <div style={{ padding: '16px 18px', borderLeft: `1px solid ${BPI.rule}`, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
        <div className="mono" style={{ fontSize: 9, color: BPI.ink40, letterSpacing: '0.04em' }}>{insight.figure.label}</div>
        <InsightFigure figure={insight.figure} tone={t} w={190} h={48} />
      </div>
    </div>
  );
}

// ── INSIGHT CARD · variant B (compact stacked, accent top) ────
function InsightCardCompact({ insight }) {
  const t = insight.tone;
  return (
    <div style={{ background: BPI.card, borderRadius: 4, boxShadow: `0 0 0 1px ${BPI.rule}`, overflow: 'hidden' }}>
      <div style={{ height: 3, background: vTone(t).fg }} />
      <div style={{ padding: '13px 15px 13px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
          <span className="num" style={{ fontSize: 11, fontWeight: 700, color: vTone(t).fg, fontFamily: BPIMono }}>{String(insight.rank).padStart(2, '0')}</span>
          <span style={{
            fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: vTone(t).fg, background: vTone(t).bg, padding: '2px 6px', borderRadius: 2,
          }}>{SEV_LABEL[insight.severity]} severity</span>
          <span style={{ flex: 1 }} />
          <SendToBrief compact />
        </div>
        <div style={{ fontSize: 13, fontWeight: 500, color: BPI.ink, lineHeight: 1.48, letterSpacing: '-0.005em', textWrap: 'pretty' }}>
          {insight.claim}
        </div>
        <div style={{ margin: '12px 0 11px' }}>
          <div className="mono" style={{ fontSize: 8.5, color: BPI.ink40, marginBottom: 5 }}>{insight.figure.label}</div>
          <InsightFigure figure={insight.figure} tone={t} w={236} h={42} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 10, boxShadow: `inset 0 1px 0 ${BPI.rule}`, flexWrap: 'wrap' }}>
          <ConfidenceMeter confidence={insight.confidence} />
          <span style={{ fontSize: 10.5, color: BPI.ink55 }}>{CONF_LABEL[insight.confidence]}</span>
          <span style={{ flex: 1 }} />
          {insight.caveat && <WhyChip />}
          <DeepLink tab={insight.tab} />
        </div>
      </div>
    </div>
  );
}

// ── INSIGHT CARD · variant C (equal grid cell, bracket conf) ──
function InsightCardGrid({ insight }) {
  const t = insight.tone;
  return (
    <div style={{ background: BPI.card, borderRadius: 4, boxShadow: `0 0 0 1px ${BPI.rule}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px', background: vTone(t).bg, boxShadow: `inset 0 -1px 0 color-mix(in oklch, ${vTone(t).fg} 18%, transparent)` }}>
        <span className="num" style={{ fontSize: 13, fontWeight: 700, color: vTone(t).fg, fontFamily: BPIMono }}>{String(insight.rank).padStart(2, '0')}</span>
        <SeverityMeter severity={insight.severity} tone={t} label={false} />
        <span style={{ fontSize: 10.5, fontWeight: 700, color: vTone(t).fg }}>{SEV_LABEL[insight.severity]}</span>
        <span style={{ flex: 1 }} />
        <ConfidenceMeter confidence={insight.confidence} variant="bracket" label={false} />
      </div>
      <div style={{ padding: '15px 16px 14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: BPI.ink, lineHeight: 1.5, letterSpacing: '-0.005em', textWrap: 'pretty', flex: 1 }}>
          {insight.claim}
        </div>
        <div style={{ margin: '13px 0 12px' }}>
          <div className="mono" style={{ fontSize: 8.5, color: BPI.ink40, marginBottom: 5 }}>{insight.figure.label}</div>
          <InsightFigure figure={insight.figure} tone={t} w={236} h={44} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 11, boxShadow: `inset 0 1px 0 ${BPI.rule}` }}>
          {insight.caveat && <WhyChip />}
          <DeepLink tab={insight.tab} />
          <span style={{ flex: 1 }} />
          <SendToBrief compact />
        </div>
      </div>
    </div>
  );
}

// ── "What stands out" section wrapper (renders cards OR zero-state) ──
function WhatStandsOut({ route, render }) {
  const n = route.insights.length;
  return (
    <div>
      <H title="What stands out"
        sub={n ? `${n} ranked ${n === 1 ? 'finding' : 'findings'} — severity and confidence shown as separate channels.` : 'The detectors ran the full window and surfaced nothing.'}
        right={n ? <span className="mono" style={{ fontSize: 10.5, color: BPI.ink40 }}>ranked by severity × confidence</span> : null} />
      {n === 0
        ? <ZeroInsight route={route} variant="roster" />
        : render()}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMPOSITION A — Ranked column (insights-first)
// ═══════════════════════════════════════════════════════════════
function VerdictScreenA({ route }) {
  return (
    <VerdictChrome route={route}>
      <div style={{ padding: '24px 28px 30px', display: 'flex', flexDirection: 'column', gap: 26 }}>
        <VerdictLede route={route} />

        <WhatStandsOut route={route} render={() => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {route.insights.map((ins, i) => (
              <InsightCardRow key={i} insight={ins} showCaveat={i === 0} />
            ))}
          </div>
        )} />

        <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 22, alignItems: 'start' }}>
          <div>
            <H title={route.story.title} sub={route.story.sub} />
            <ChartFrame height={222}>
              <StoryStrip story={route.story} w={740} h={222} />
            </ChartFrame>
          </div>
          <div>
            <H title="On the street" sub="Segment pace; flagged stretch emphasized. Static — the live map is one tap away." />
            <VerdictMiniMap route={route} w={420} h={300} />
          </div>
        </div>

        <VerdictFooter route={route} />
      </div>
      <StudioFooter sources={['MTA Bus Speeds', 'Hourly Ridership', 'NYC DOT bus lanes', 'ACE program']} />
    </VerdictChrome>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMPOSITION B — Story spread (story-figure-first, flagship)
// ═══════════════════════════════════════════════════════════════
function VerdictScreenB({ route }) {
  const useCarpet = route.id === 'm15' && route.carpet;
  return (
    <VerdictChrome route={route}>
      <div style={{ padding: '24px 28px 30px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <VerdictLede route={route} size="lg" />

        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 24, alignItems: 'start' }}>
          {/* LEFT — story hero leads */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div>
              <H title={useCarpet ? 'The day, month over month' : route.story.title}
                sub={useCarpet ? 'Weekday speed by day-part across recent months — the PM-peak column is where the route is bleeding time. Episodic framing of the same decline.' : route.story.sub} />
              <ChartFrame height={useCarpet ? 232 : 222}>
                {useCarpet
                  ? <StoryCarpet carpet={route.carpet} w={720} h={224} />
                  : <StoryStrip story={route.story} w={720} h={222} />}
              </ChartFrame>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>
              <div>
                <H title="On the street" sub="Flagged stretch emphasized." />
                <VerdictMiniMap route={route} w={300} h={250} />
              </div>
              <div>
                <H title={route.id === 'm15' ? 'And the long arc' : 'Speed, 36 months'} sub="The multi-year line, for the record." />
                <ChartFrame height={250}>
                  <StoryStrip story={route.story} w={420} h={236} />
                </ChartFrame>
              </div>
            </div>
          </div>

          {/* RIGHT — what stands out, compact stack */}
          <div>
            <WhatStandsOut route={route} render={() => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {route.insights.map((ins, i) => <InsightCardCompact key={i} insight={ins} />)}
              </div>
            )} />
          </div>
        </div>

        <VerdictFooter route={route} />
      </div>
      <StudioFooter sources={['MTA Bus Speeds', 'Hourly Ridership', 'NYC DOT bus lanes', 'ACE program']} />
    </VerdictChrome>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMPOSITION C — Masthead + 3-up grid (verdict-sentence-first)
// ═══════════════════════════════════════════════════════════════
function VerdictScreenC({ route }) {
  const k = route.kpi;
  const n = route.insights.length;
  return (
    <VerdictChrome route={route}>
      <div style={{ padding: '24px 28px 30px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Masthead — the verdict as a headline with the hero number inline */}
        <div style={{
          background: BPI.card, borderRadius: 4, boxShadow: `0 0 0 1px ${BPI.rule}`,
          display: 'grid', gridTemplateColumns: '232px 1fr', overflow: 'hidden',
        }}>
          <div style={{ padding: '22px 24px', background: BPI.paperDeep, boxShadow: `inset -1px 0 0 ${BPI.rule}`, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Condition · one clock</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span className="num" style={{ fontSize: 52, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 0.9, color: k.condition.tone ? vTone(k.condition.tone).fg : BPI.ink }}>{k.condition.value}</span>
              <span style={{ fontSize: 15, color: BPI.ink55 }}>{k.condition.unit}</span>
            </div>
            <div style={{ fontSize: 12, color: BPI.ink70, marginTop: 8, lineHeight: 1.4 }}>{k.condition.peer}</div>
            <div style={{ marginTop: 10 }}><DataAsOf date={k.condition.asOf} fresh={k.condition.fresh} /></div>
          </div>
          <div style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div className="eyebrow" style={{ marginBottom: 10, letterSpacing: '0.04em' }}>THE VERDICT</div>
            <div style={{ fontSize: 22, fontWeight: 500, color: BPI.ink, lineHeight: 1.42, letterSpacing: '-0.012em', textWrap: 'pretty', maxWidth: 820 }}>
              {route.lede}
            </div>
          </div>
        </div>

        {/* What stands out — 3-up grid */}
        <WhatStandsOut route={route} render={() => (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, n)}, 1fr)`, gap: 14, alignItems: 'stretch' }}>
            {route.insights.map((ins, i) => <InsightCardGrid key={i} insight={ins} />)}
          </div>
        )} />

        {/* story + map, two-up */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 22, alignItems: 'start' }}>
          <div>
            <H title={route.story.title} sub={route.story.sub} />
            <ChartFrame height={210}><StoryStrip story={route.story} w={740} h={210} /></ChartFrame>
          </div>
          <div>
            <H title="On the street" sub="Segment pace; tap through to the live map." />
            <VerdictMiniMap route={route} w={420} h={250} />
          </div>
        </div>

        <VerdictFooter route={route} />
      </div>
      <StudioFooter sources={['MTA Bus Speeds', 'Hourly Ridership', 'NYC DOT bus lanes', 'ACE program']} />
    </VerdictChrome>
  );
}

Object.assign(window, {
  VerdictChrome, VerdictLede, WhatStandsOut,
  InsightCardRow, InsightCardCompact, InsightCardGrid,
  VerdictScreenA, VerdictScreenB, VerdictScreenC,
});
