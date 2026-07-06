// verdict-editorial.jsx
// The card-free redo of the Verdict Overview.
//   D — Ruled dossier   (editorial column: hairlines + type carry structure)
//   E — Map-led         (corridor strip-map leads; no verdict paragraph at all)
// No 1px-outlined cards anywhere. Severity/confidence are quiet words.
// Deps: system.jsx, verdict-primitives.jsx, verdict-shell.jsx, verdict-data.jsx

// ── corridor strip-map geometry (horizontal, drawn on the page) ──
const VERDICT_BANDS = {
  m15: {
    waterLabel: 'EAST RIVER', waterL: 0.86, waterR: 0.74,
    dirNote: 'pace by stretch · north at left',
    compass: '← N',
    stops: [
      { f: 0.00, yf: 0.40, label: 'E 126 ST', terminal: true },
      { f: 0.11, yf: 0.42, label: '116 ST' },
      { f: 0.23, yf: 0.41, label: '96 ST' },
      { f: 0.36, yf: 0.44, label: '72 ST' },
      { f: 0.48, yf: 0.46, label: '58 ST' },
      { f: 0.60, yf: 0.48, label: '28 ST' },
      { f: 0.70, yf: 0.51, label: '14 ST' },
      { f: 0.80, yf: 0.55, label: 'HOUSTON ST' },
      { f: 0.90, yf: 0.61, label: 'CITY HALL' },
      { f: 1.00, yf: 0.68, label: 'SOUTH FERRY', terminal: true },
    ],
    segs: [
      { mph: 7.4 }, { mph: 6.8 }, { mph: 6.6 }, { mph: 6.1 },
      { mph: 4.6, flag: 'bad' }, { mph: 5.2 }, { mph: 6.4 }, { mph: 6.9 }, { mph: 7.6 },
    ],
    flagTitle: 'MADISON AV · 4.6 mph',
    flagSub: 'slowest stretch — 11 mo below 5 mph',
    neighborhoods: [
      { f: 0.05, label: 'EAST HARLEM' },
      { f: 0.27, label: 'UPPER EAST SIDE' },
      { f: 0.44, label: 'MIDTOWN' },
      { f: 0.76, label: 'EAST VILLAGE' },
      { f: 0.95, label: 'LOWER MANHATTAN' },
    ],
  },
  s79: {
    waterLabel: 'LOWER BAY', waterL: 0.82, waterR: 0.72,
    dirNote: 'pace by stretch · Bay Ridge at left',
    compass: null,
    stops: [
      { f: 0.00, yf: 0.42, label: 'BAY RIDGE', terminal: true },
      { f: 0.13, yf: 0.45, label: 'VERRAZZANO BR' },
      { f: 0.27, yf: 0.44, label: 'CLOVE RD' },
      { f: 0.42, yf: 0.47, label: 'RICHMOND RD' },
      { f: 0.57, yf: 0.50, label: 'NEW DORP LN' },
      { f: 0.73, yf: 0.53, label: 'GREAT KILLS' },
      { f: 0.87, yf: 0.56, label: 'ANNADALE RD' },
      { f: 1.00, yf: 0.58, label: 'ELTINGVILLE', terminal: true },
    ],
    segs: [
      { mph: 12.4 }, { mph: 11.8 }, { mph: 11.2 }, { mph: 12.1 },
      { mph: 11.9 }, { mph: 12.3 }, { mph: 11.6 },
    ],
    flagTitle: null, flagSub: null,
    neighborhoods: [
      { f: 0.17, label: 'ROSEBANK' },
      { f: 0.38, label: 'DONGAN HILLS' },
      { f: 0.64, label: 'OAKWOOD' },
    ],
  },
};

// ── CorridorBand — the route drawn directly on the page, no box ──
// A horizontal strip-map: water for ground, cross-street ticks for grid,
// neighborhood names for orientation, the flagged stretch annotated with a
// bracket like a figure in print. Pace-colored segments; "Open map →" tab.
function CorridorBand({ band, w = 1240, h = 230, marks }) {
  const padL = 80, padR = 80;
  const X = (f) => padL + f * (w - padL - padR);
  const Y = (yf) => yf * h;
  const pts = band.stops.map((s) => [X(s.f), Y(s.yf)]);
  const flagI = band.segs.findIndex((s) => s.flag);
  const line = (arr) => arr.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const offPath = (d) => line(pts.map((p) => [p[0], p[1] + d]));
  const waterAt = (x) => (band.waterL + (band.waterR - band.waterL) * (x / w)) * h;
  const waterPath = `M0,${(band.waterL * h).toFixed(1)} C ${(w * 0.33).toFixed(1)},${((band.waterL + 0.025) * h).toFixed(1)} ${(w * 0.66).toFixed(1)},${((band.waterR - 0.035) * h).toFixed(1)} ${w},${(band.waterR * h).toFixed(1)} L ${w},${h} L 0,${h} Z`;
  // flagged-stretch bracket geometry
  let bracket = null;
  if (flagI >= 0 && band.flagTitle) {
    const x1 = pts[flagI][0], x2 = pts[flagI + 1][0];
    const yTop = Math.min(pts[flagI][1], pts[flagI + 1][1]) - 30;
    bracket = { x1, x2, yTop, cx: (x1 + x2) / 2 };
  }
  return (
    <div style={{ position: 'relative', width: w, height: h }}>
      <svg width={w} height={h} style={{ display: 'block' }}>
        {/* water — the only ground the map needs */}
        <path d={waterPath} fill="oklch(0.905 0.016 232)" />
        <text x={w * 0.5} y={h - 13} fill="oklch(0.74 0.03 232)" fontFamily={BPIMono}
          fontSize="9" fontWeight="700" letterSpacing="0.3em" textAnchor="middle">{band.waterLabel}</text>

        {/* cross-street grid — faint verticals at each stop */}
        {pts.map((p, i) => (
          <line key={'g' + i} x1={p[0]} y1={h * 0.09} x2={p[0]} y2={waterAt(p[0]) - 6}
            stroke={BPI.ink} strokeOpacity="0.055" strokeWidth="1" />
        ))}
        {/* parallel avenues — offset echoes of the corridor */}
        <path d={offPath(-34)} fill="none" stroke={BPI.ink} strokeOpacity="0.05" strokeWidth="1.4" />
        <path d={offPath(30)} fill="none" stroke={BPI.ink} strokeOpacity="0.05" strokeWidth="1.4" />

        {/* neighborhoods — orientation, set wide and faint */}
        {band.neighborhoods.map((nb, i) => (
          <text key={'n' + i} x={X(nb.f)} y={h * 0.13} fill={BPI.ink} fillOpacity="0.16"
            fontSize="9.5" fontWeight="700" letterSpacing="0.28em" textAnchor="middle"
            fontFamily="inherit">{nb.label}</text>
        ))}

        {/* flagged glow */}
        {flagI >= 0 && (
          <line x1={pts[flagI][0]} y1={pts[flagI][1]} x2={pts[flagI + 1][0]} y2={pts[flagI + 1][1]}
            stroke={BPI.bad} strokeWidth="16" strokeLinecap="round" opacity="0.13" />
        )}
        {/* casing then pace-colored segments */}
        <path d={line(pts)} fill="none" stroke={BPI.card} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        {band.segs.map((s, i) => (
          <line key={'s' + i} x1={pts[i][0]} y1={pts[i][1]} x2={pts[i + 1][0]} y2={pts[i + 1][1]}
            stroke={s.flag === 'good' ? BPI.good : s.flag === 'bad' ? BPI.bad : vSpeed(s.mph)}
            strokeWidth={s.flag ? 6.5 : 5} strokeLinecap="round" />
        ))}

        {/* stops + labels */}
        {band.stops.map((s, i) => {
          const [x, y] = pts[i];
          return (
            <g key={'p' + i}>
              <circle cx={x} cy={y} r={s.terminal ? 4.6 : 2.8}
                fill={s.terminal ? BPI.ink : BPI.card} stroke={s.terminal ? BPI.ink : BPI.ink55} strokeWidth="1.5" />
              {s.terminal ? (
                <text x={x + (s.f < 0.5 ? 0 : 0)} y={y - 13} fontSize="10" fontWeight="700"
                  fontFamily={BPIMono} fill={BPI.ink70} letterSpacing="0.06em"
                  textAnchor={s.f < 0.5 ? 'start' : 'end'}>{s.label}</text>
              ) : (
                <g>
                  <line x1={x} y1={y + 6} x2={x} y2={y + 13} stroke={BPI.ink} strokeOpacity="0.25" strokeWidth="1" />
                  <text x={x} y={y + 25} fontSize="8.5" fontFamily={BPIMono} fill={BPI.ink40}
                    letterSpacing="0.06em" textAnchor="middle">{s.label}</text>
                </g>
              )}
            </g>
          );
        })}

        {/* flagged-stretch bracket annotation — a printed figure callout */}
        {bracket && (
          <g>
            <path d={`M${bracket.x1},${bracket.yTop + 7} L${bracket.x1},${bracket.yTop} L${bracket.x2},${bracket.yTop} L${bracket.x2},${bracket.yTop + 7}`}
              fill="none" stroke={BPI.bad} strokeWidth="1.3" />
            <text x={bracket.cx} y={bracket.yTop - 20} fontSize="10.5" fontWeight="700"
              fontFamily={BPIMono} fill={BPI.bad} letterSpacing="0.04em" textAnchor="middle">{band.flagTitle}</text>
            <text x={bracket.cx} y={bracket.yTop - 7} fontSize="9" fill={BPI.ink55}
              fontFamily={BPIMono} textAnchor="middle">{band.flagSub}</text>
          </g>
        )}

        {/* finding markers (map-led comp) — hung below the line, clear of the bracket */}
        {(marks || []).map((m, i) => (
          <g key={'m' + i}>
            <line x1={X(m.f)} y1={Y(m.yf) + 8} x2={X(m.f)} y2={Y(m.yf) + 22} stroke={vTone(m.tone).fg} strokeWidth="1.2" />
            <circle cx={X(m.f)} cy={Y(m.yf) + 32} r="10" fill={vTone(m.tone).fg} />
            <text x={X(m.f)} y={Y(m.yf) + 35.5} fontSize="10" fontWeight="700" fill="#fff"
              fontFamily={BPIMono} textAnchor="middle">{m.rank}</text>
          </g>
        ))}
      </svg>

      {/* pace legend — quiet, top right */}
      <div style={{ position: 'absolute', top: 4, right: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="mono" style={{ fontSize: 8.5, color: BPI.ink40, letterSpacing: '0.04em' }}>slow</span>
        <span style={{ height: 5, width: 84, borderRadius: 2, background: `linear-gradient(90deg, ${BPI.bad}, ${BPI.warn}, oklch(0.64 0.10 78), ${BPI.good})` }} />
        <span className="mono" style={{ fontSize: 8.5, color: BPI.ink40, letterSpacing: '0.04em' }}>fast</span>
      </div>

      {/* compass note */}
      {band.compass && (
        <span className="mono" style={{ position: 'absolute', left: 0, bottom: 8, fontSize: 10, color: BPI.ink40, letterSpacing: '0.08em' }}>{band.compass}</span>
      )}

      {/* the small open-map tab */}
      <div style={{
        position: 'absolute', right: 12, bottom: 10,
        display: 'inline-flex', alignItems: 'center',
        background: 'color-mix(in oklch, ' + BPI.card + ' 92%, transparent)',
        backdropFilter: 'blur(2px)', borderRadius: 3, padding: '5px 9px',
        boxShadow: `0 0 0 1px ${BPI.rule}`,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: BPI.accent, cursor: 'pointer' }}>Open map →</span>
      </div>
    </div>
  );
}

// ── ruled section header — label · hairline · note ────────────
function EdH({ label, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
      <span className="mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: BPI.ink55, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: BPI.rule }} />
      {right && <span className="mono" style={{ fontSize: 10, color: BPI.ink40, whiteSpace: 'nowrap' }}>{right}</span>}
    </div>
  );
}
function EdDot() { return <span style={{ color: BPI.ink20 }}>·</span>; }

// ── lede — one quiet paragraph, no label, first sentence carries weight ──
function EdLede({ text }) {
  const m = text.match(/^(.*?\.)\s([\s\S]*)$/);
  const first = m ? m[1] : text;
  const rest = m ? m[2] : '';
  return (
    <div style={{ fontSize: 19, lineHeight: 1.58, letterSpacing: '-0.008em', maxWidth: 920, textWrap: 'pretty' }}>
      <span style={{ fontWeight: 600, color: BPI.ink }}>{first}</span>{' '}
      <span style={{ color: BPI.ink70 }}>{rest}</span>
    </div>
  );
}

// ── finding — editorial row: numeral · claim · figure, ruled apart ──
function EdMeta({ insight }) {
  const t = vTone(insight.tone);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, flexWrap: 'wrap' }}>
      <span style={{ width: 7, height: 7, borderRadius: 1.5, background: t.fg, flexShrink: 0 }} />
      <span style={{ fontWeight: 600, color: t.fg }}>{SEV_LABEL[insight.severity]} severity</span>
      <EdDot />
      <span style={{ color: BPI.ink55 }}>{CONF_LABEL[insight.confidence]}</span>
      {insight.caveat && <React.Fragment><EdDot /><WhyChip /></React.Fragment>}
      <EdDot />
      <DeepLink tab={insight.tab} />
    </div>
  );
}
function EdFinding({ insight, showCaveat, last }) {
  const t = vTone(insight.tone);
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '64px 1fr 250px', columnGap: 26,
      padding: '20px 0 22px',
      boxShadow: last ? 'none' : `inset 0 -1px 0 ${BPI.rule}`,
    }}>
      <div className="mono num" style={{ fontSize: 21, fontWeight: 600, color: t.fg, lineHeight: 1.15, paddingTop: 2 }}>
        {String(insight.rank).padStart(2, '0')}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.5, letterSpacing: '-0.008em', color: BPI.ink, maxWidth: 700, textWrap: 'pretty' }}>
          {insight.claim}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 11 }}>
          <EdMeta insight={insight} />
          <span style={{ flex: 1 }} />
          <SendToBrief />
        </div>
        {showCaveat && insight.caveat && (
          <div style={{ marginTop: 10, fontSize: 12, color: BPI.ink55, lineHeight: 1.55, maxWidth: 660, textWrap: 'pretty' }}>
            <span style={{ color: BPI.warn, fontWeight: 700 }}>caveat — </span>{insight.caveat}
          </div>
        )}
      </div>
      <div style={{ paddingTop: 3 }}>
        <div className="mono" style={{ fontSize: 9, color: BPI.ink40, letterSpacing: '0.04em', marginBottom: 7 }}>{insight.figure.label}</div>
        <InsightFigure figure={insight.figure} tone={insight.tone} w={250} h={50} />
      </div>
    </div>
  );
}

// column variant for the map-led comp — proper cards (these earn the wrap)
function EdFindingCard({ insight }) {
  const t = vTone(insight.tone);
  return (
    <div style={{
      background: BPI.card, borderRadius: 5, boxShadow: `0 0 0 1px ${BPI.rule}`,
      padding: '18px 20px 16px',
      display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
    }}>
      <div className="mono num" style={{ fontSize: 19, fontWeight: 600, color: t.fg, lineHeight: 1 }}>
        {String(insight.rank).padStart(2, '0')}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.52, letterSpacing: '-0.005em', color: BPI.ink, textWrap: 'pretty', flex: 1 }}>
        {insight.claim}
      </div>
      <div>
        <div className="mono" style={{ fontSize: 8.5, color: BPI.ink40, marginBottom: 6 }}>{insight.figure.label}</div>
        <InsightFigure figure={insight.figure} tone={insight.tone} w={250} h={44} />
      </div>
      <EdMeta insight={insight} />
    </div>
  );
}

// ── zero-state — checked clean, flat roster, no box ───────────
function EdZero({ route }) {
  const fams = route.checked.families;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
        <CheckSeal />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>Checked through May 2026 — no flags raised</div>
          <div style={{ fontSize: 12.5, color: BPI.ink55, marginTop: 3, lineHeight: 1.5, maxWidth: 640, textWrap: 'pretty' }}>
            Every detector family ran the full window and returned clean. On a healthy route the absence of a flag is the finding.
          </div>
        </div>
        <DataAsOf date={route.checked.asOf} fresh="current" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', columnGap: 40, marginTop: 12 }}>
        {fams.map((f, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 9, padding: '11px 0',
            boxShadow: i < fams.length - 3 ? `inset 0 -1px 0 ${BPI.rule}` : 'none',
          }}>
            <span style={{ color: BPI.good, fontWeight: 700, fontSize: 12 }}>✓</span>
            <span style={{ fontSize: 12.5, fontWeight: 500 }}>{f}</span>
            <span style={{ flex: 1 }} />
            <span className="mono" style={{ fontSize: 10, color: BPI.good, fontWeight: 600 }}>clean</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── "what we checked" — the one footer survivor, folded into a header ──
function EdChecked() {
  return <span style={{ color: BPI.accent, fontWeight: 600, cursor: 'pointer', fontFamily: BPIMono }}>what we checked →</span>;
}

// ── chrome (same fixed shell; header is canonical, ignore) ────
function EdChrome({ route, children }) {
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

// ═══════════════════════════════════════════════════════════════
// D — Ruled dossier (editorial column)
// ═══════════════════════════════════════════════════════════════
function VerdictScreenD({ route }) {
  const band = VERDICT_BANDS[route.id];
  const n = route.insights.length;
  return (
    <EdChrome route={route}>
      <div style={{ padding: '32px 40px 36px', display: 'flex', flexDirection: 'column', gap: 36 }}>
        <EdLede text={route.lede} />

        <div>
          <EdH
            label={n ? `WHAT STANDS OUT — ${n} FINDING${n === 1 ? '' : 'S'}` : 'WHAT STANDS OUT'}
            right={<span>{n ? 'ranked by severity × confidence · ' : `${route.checked.families.length} detector families · through ${route.checked.asOf} · `}<EdChecked /></span>} />
          {n === 0
            ? <EdZero route={route} />
            : route.insights.map((ins, i) => (
                <EdFinding key={i} insight={ins} showCaveat={i === 0} last={i === n - 1} />
              ))}
        </div>

        <div>
          <EdH label={route.story.title.toUpperCase()} right="weighted weekday speed · 36 months" />
          <StoryStrip story={route.story} w={1240} h={210} />
        </div>

        {band && (
          <div>
            <EdH label="ON THE STREET" right={band.dirNote} />
            <CorridorBand band={band} w={1240} h={230} />
          </div>
        )}
      </div>
      <StudioFooter sources={['MTA Bus Speeds', 'Hourly Ridership', 'NYC DOT bus lanes', 'ACE program']} />
    </EdChrome>
  );
}

// ═══════════════════════════════════════════════════════════════
// E — Map-led (corridor leads; no verdict paragraph at all)
// ═══════════════════════════════════════════════════════════════
function VerdictScreenE({ route }) {
  const band = VERDICT_BANDS[route.id];
  const n = route.insights.length;
  const marks = [];
  if (route.id === 'm15') marks.push({ f: 0.54, yf: 0.47, rank: 1, tone: 'bad' });
  return (
    <EdChrome route={route}>
      <div style={{ padding: '30px 40px 36px', display: 'flex', flexDirection: 'column', gap: 32 }}>
        <div>
          <EdH label={`WHAT STANDS OUT — ${n} FINDINGS`}
            right={<span>ranked by severity × confidence · <EdChecked /></span>} />
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(n, 1)}, 1fr)`, gap: 16, alignItems: 'stretch' }}>
            {route.insights.map((ins, i) => <EdFindingCard key={i} insight={ins} />)}
          </div>
        </div>

        <div>
          <EdH label={route.story.title.toUpperCase()} right="weighted weekday speed · 36 months" />
          <StoryStrip story={route.story} w={1240} h={180} />
        </div>

        <div>
          <EdH label="ON THE STREET" right={<span>{band.dirNote} · ① finding 01</span>} />
          <CorridorBand band={band} w={1240} h={250} marks={marks} />
        </div>
      </div>
      <StudioFooter sources={['MTA Bus Speeds', 'Hourly Ridership', 'NYC DOT bus lanes', 'ACE program']} />
    </EdChrome>
  );
}

// ═══════════════════════════════════════════════════════════
// F — The spread (display verdict · ranked-weight findings · composed evidence)
// ═══════════════════════════════════════════════════════════

// The verdict as display type — two short lines, second line carries the
// judged tone. The rest of the lede becomes the support paragraph.
const ED_HEADLINES = {
  m15: { lines: ['Fully treated.', 'Still losing ground.'], tone: 'bad' },
  b44: { lines: ['Treated —', 'and holding.'], tone: 'good' },
  s79: { lines: ['Running exactly', 'as it should.'], tone: 'good' },
};
function EdHero({ route }) {
  const hl = ED_HEADLINES[route.id];
  const m = route.lede.match(/^(.*?\.)\s([\s\S]*)$/);
  const rest = m ? m[2] : route.lede;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', columnGap: 64, alignItems: 'end' }}>
      <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.06, color: BPI.ink }}>
        <div>{hl.lines[0]}</div>
        <div style={{ color: vTone(hl.tone).fg }}>{hl.lines[1]}</div>
      </div>
      <div style={{ paddingBottom: 5 }}>
        <div style={{ fontSize: 14, lineHeight: 1.62, color: BPI.ink70, textWrap: 'pretty' }}>{rest}</div>
        <div style={{ marginTop: 12 }}><DataAsOf date={route.kpi.condition.asOf} fresh={route.kpi.condition.fresh} /></div>
      </div>
    </div>
  );
}

// Ranked means ranked — the #1 finding is a wide feature card, the rest
// stack compactly beside it. Size encodes rank.
function EdFeatureCard({ insight }) {
  const t = vTone(insight.tone);
  return (
    <div style={{
      background: BPI.card, borderRadius: 5, boxShadow: `0 0 0 1px ${BPI.rule}`,
      padding: '22px 26px 20px', display: 'grid', gridTemplateColumns: '1fr 300px', columnGap: 30,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
        <div className="mono num" style={{ fontSize: 20, fontWeight: 600, color: t.fg, lineHeight: 1, marginBottom: 13 }}>01</div>
        <div style={{ fontSize: 18, fontWeight: 500, lineHeight: 1.52, letterSpacing: '-0.012em', color: BPI.ink, textWrap: 'pretty' }}>
          {insight.claim}
        </div>
        <div><EdMeta insight={insight} /></div>
        {insight.caveat && (
          <div style={{ fontSize: 11.5, color: BPI.ink55, lineHeight: 1.55, maxWidth: 540, textWrap: 'pretty' }}>
            <span style={{ color: BPI.warn, fontWeight: 700 }}>caveat — </span>{insight.caveat}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, borderLeft: `1px solid ${BPI.ink06}`, paddingLeft: 26 }}>
        <div className="mono" style={{ fontSize: 9, color: BPI.ink40, letterSpacing: '0.04em' }}>{insight.figure.label}</div>
        <InsightFigure figure={insight.figure} tone={insight.tone} w={270} h={62} />
      </div>
    </div>
  );
}
function EdMiniCard({ insight }) {
  const t = vTone(insight.tone);
  return (
    <div style={{
      background: BPI.card, borderRadius: 5, boxShadow: `0 0 0 1px ${BPI.rule}`,
      padding: '15px 18px 13px', flex: 1,
      display: 'grid', gridTemplateColumns: '1fr 150px', columnGap: 18,
    }}>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="mono num" style={{ fontSize: 13, fontWeight: 600, color: t.fg, lineHeight: 1, marginBottom: 8 }}>
          {String(insight.rank).padStart(2, '0')}
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.5, letterSpacing: '-0.003em', color: BPI.ink, textWrap: 'pretty', flex: 1 }}>
          {insight.claim}
        </div>
        <div style={{ marginTop: 10 }}><EdMeta insight={insight} /></div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
        <div className="mono" style={{ fontSize: 8.5, color: BPI.ink40 }}>{insight.figure.label}</div>
        <InsightFigure figure={insight.figure} tone={insight.tone} w={150} h={42} />
      </div>
    </div>
  );
}

// The chart and the map composed as ONE evidence figure — time over space,
// findings badged onto both. ① on the street, ② in the trend.
function EdBadge({ n, tone, style }) {
  return (
    <span style={{
      position: 'absolute', width: 20, height: 20, borderRadius: 10,
      background: vTone(tone).fg, color: '#fff', fontFamily: BPIMono,
      fontSize: 10.5, fontWeight: 700, display: 'inline-flex',
      alignItems: 'center', justifyContent: 'center',
      boxShadow: `0 0 0 3px ${BPI.paper}`, ...style,
    }}>{n}</span>
  );
}
function EdEvidence({ route, band }) {
  const isM15 = route.id === 'm15';
  return (
    <div>
      <EdH label="WHERE & WHEN — THE EVIDENCE"
        right={isM15 ? '① on the street · ② in the trend' : 'one figure for time, one for space'} />
      <div style={{ position: 'relative' }}>
        <div className="mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: BPI.ink40, marginBottom: 10 }}>
          THE WHEN · weighted weekday speed · 36 months
        </div>
        <StoryStrip story={route.story} w={1240} h={190} />
        {isM15 && <EdBadge n="2" tone="bad" style={{ left: 795, top: 68 }} />}
      </div>
      <div style={{ position: 'relative', marginTop: 28 }}>
        <div className="mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: BPI.ink40, marginBottom: 6 }}>
          THE WHERE · {band.dirNote.toUpperCase()}
        </div>
        <CorridorBand band={band} w={1240} h={240}
          marks={isM15 ? [{ f: 0.54, yf: 0.47, rank: 1, tone: 'bad' }] : []} />
      </div>
    </div>
  );
}

function VerdictScreenF({ route }) {
  const band = VERDICT_BANDS[route.id];
  const n = route.insights.length;
  return (
    <EdChrome route={route}>
      <div style={{ padding: '44px 40px 40px', display: 'flex', flexDirection: 'column', gap: 40 }}>
        <EdHero route={route} />

        <div>
          <EdH
            label={n ? `WHAT STANDS OUT — ${n} FINDING${n === 1 ? '' : 'S'}` : 'WHAT STANDS OUT'}
            right={<span>{n ? 'ranked by severity × confidence · ' : `${route.checked.families.length} detector families · through ${route.checked.asOf} · `}<EdChecked /></span>} />
          {n === 0 ? (
            <EdZero route={route} />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1.85fr 1fr', gap: 16, alignItems: 'stretch' }}>
              <EdFeatureCard insight={route.insights[0]} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {route.insights.slice(1).map((ins, i) => <EdMiniCard key={i} insight={ins} />)}
              </div>
            </div>
          )}
        </div>

        <EdEvidence route={route} band={band} />
      </div>
      <StudioFooter sources={['MTA Bus Speeds', 'Hourly Ridership', 'NYC DOT bus lanes', 'ACE program']} />
    </EdChrome>
  );
}

Object.assign(window, {
  VERDICT_BANDS, CorridorBand,
  EdH, EdLede, EdFinding, EdFindingCard, EdZero, EdChecked, EdChrome,
  EdHero, EdFeatureCard, EdMiniCard, EdEvidence, EdBadge,
  VerdictScreenD, VerdictScreenE, VerdictScreenF,
});
