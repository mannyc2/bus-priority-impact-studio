// verdict-shell.jsx
// Larger structural primitives for the Verdict layer:
//   JudgedKpiStrip · QuestionTabs (+ TabBadge) · VerdictMiniMap ·
//   StoryStrip (trend-shaded / before-after / stable) · StoryCarpet ·
//   ZeroInsight (checked-clean roster) · VerdictFooter
// Deps: system.jsx, verdict-primitives.jsx, verdict-data.jsx

// ── Judged KPI header — 5 columns, each its own clock + tab link ──
function KpiColumn({ children, tab, first }) {
  return (
    <div style={{
      flex: 1, minWidth: 0, padding: '15px 20px',
      boxShadow: first ? 'none' : `inset 1px 0 0 ${BPI.rule}`,
      position: 'relative', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ flex: 1 }}>{children}</div>
      {tab && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
          <span style={{ fontSize: 10, color: BPI.ink40, fontWeight: 600 }}>{tab} →</span>
        </div>
      )}
    </div>
  );
}
function KpiEyebrow({ children }) {
  return <div className="eyebrow" style={{ fontSize: 10.5, marginBottom: 7 }}>{children}</div>;
}
function JudgedKpiStrip({ route }) {
  const k = route.kpi;
  const trendArrow = k.trend.dir === 'up' ? '↑' : k.trend.dir === 'down' ? '↓' : '→';
  const spark12 = route.spark.slice(-14);
  return (
    <div style={{
      background: BPI.card, borderRadius: 4, boxShadow: `0 0 0 1px ${BPI.rule}`,
      display: 'flex', alignItems: 'stretch',
    }}>
      {/* Condition */}
      <KpiColumn first tab={k.condition.tab}>
        <KpiEyebrow>Condition</KpiEyebrow>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span className="num" style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1, color: k.condition.tone ? vTone(k.condition.tone).fg : BPI.ink }}>{k.condition.value}</span>
          <span style={{ fontSize: 12, color: BPI.ink55 }}>{k.condition.unit}</span>
        </div>
        <div style={{ fontSize: 11, color: BPI.ink55, marginTop: 5, lineHeight: 1.35 }}>{k.condition.peer}</div>
        <div style={{ marginTop: 8 }}><DataAsOf date={k.condition.asOf} fresh={k.condition.fresh} /></div>
      </KpiColumn>

      {/* 6-month trend */}
      <KpiColumn tab={k.trend.tab}>
        <KpiEyebrow>{k.trend.window} trend</KpiEyebrow>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: k.trend.tone ? vTone(k.trend.tone).fg : BPI.ink70, lineHeight: 1 }}>{trendArrow}</span>
          <span className="num" style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.02em', color: k.trend.tone ? vTone(k.trend.tone).fg : BPI.ink }}>{k.trend.pct}</span>
        </div>
        <div style={{ marginTop: 9 }}>
          <Spark data={spark12} width={150} height={30} color={k.trend.tone ? vTone(k.trend.tone).fg : BPI.ink70} fill />
        </div>
        <div style={{ marginTop: 7 }}><DataAsOf date={k.trend.asOf} fresh={k.trend.fresh} /></div>
      </KpiColumn>

      {/* Reliability — honest-building */}
      <KpiColumn tab={k.reliability.tab}>
        <KpiEyebrow>Reliability</KpiEyebrow>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: BPI.ink55 }}>{k.reliability.label}</div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8,
          padding: '3px 8px', borderRadius: 3, background: BPI.ink06,
          alignSelf: 'flex-start',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, border: `1.3px solid ${BPI.ink40}` }} />
          <span style={{ fontSize: 10.5, color: BPI.ink55, fontWeight: 600 }}>{k.reliability.note}</span>
        </div>
        <div style={{ fontSize: 10, color: BPI.ink40, marginTop: 8, lineHeight: 1.4 }}>Grade gated until on-time data lands</div>
        <div style={{ marginTop: 8 }}><DataAsOf date={null} fresh="unknown" /></div>
      </KpiColumn>

      {/* Riders */}
      <KpiColumn tab={k.riders.tab}>
        <KpiEyebrow>Riders</KpiEyebrow>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span className="num" style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1, color: BPI.ink }}>{k.riders.value}</span>
          <span style={{ fontSize: 11, color: BPI.ink55 }}>/ weekday</span>
        </div>
        <div style={{ fontSize: 11, color: BPI.ink55, marginTop: 6 }}>{k.riders.sub}</div>
        <div style={{ marginTop: 10 }}><DataAsOf date={k.riders.asOf} fresh={k.riders.fresh} /></div>
      </KpiColumn>

      {/* Treatment posture */}
      <KpiColumn tab={k.treatment.tab}>
        <KpiEyebrow>Treatment</KpiEyebrow>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: BPI.ink, letterSpacing: '-0.005em' }}>{k.treatment.posture}</span>
          <span style={{ fontSize: 11, color: k.treatment.tone ? vTone(k.treatment.tone).fg : BPI.ink55, fontWeight: 600 }}>· {k.treatment.sub}</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
          {k.treatment.chips.map((c, i) => (
            <span key={i} className="chip" style={{ fontSize: 10, padding: '2px 6px' }}>{c}</span>
          ))}
        </div>
        <div style={{ marginTop: 9 }}><DataAsOf date={k.treatment.asOf} fresh={k.treatment.fresh} /></div>
      </KpiColumn>
    </div>
  );
}

// ── Question-shaped tabs + severity-aware badges ──────────────
const QUESTION_TABS = ['Overview', 'Where & when', 'Riders', 'Treatments & history', 'Evidence'];
function TabBadge({ count, sev }) {
  const c = sev === 'high' ? BPI.bad : sev === 'medium' ? BPI.warn : BPI.ink55;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 6 }}>
      <span style={{ width: 5, height: 5, borderRadius: 3, background: c }} />
      <span className="num" style={{ fontSize: 11, fontWeight: 700, color: BPI.ink70 }}>{count}</span>
    </span>
  );
}
function QuestionTabs({ route, active = 'Overview' }) {
  const flags = route.checked.flagsByTab || {};
  const muted = route.density === 'sparse' ? ['Riders', 'Treatments & history'] : [];
  return (
    <div style={{
      background: BPI.card, boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
      display: 'flex', gap: 26, fontSize: 12.5, padding: '0 28px',
    }}>
      {QUESTION_TABS.map((t) => {
        const isMute = muted.includes(t);
        const f = flags[t];
        return (
          <span key={t} style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '11px 0',
            color: t === active ? BPI.ink : isMute ? BPI.ink40 : BPI.ink55,
            fontWeight: t === active ? 600 : 400,
            boxShadow: t === active ? `inset 0 -2px 0 ${BPI.ink}` : 'none',
            cursor: 'pointer', opacity: isMute ? 0.7 : 1,
          }}>
            {t}
            {isMute && <span style={{ fontSize: 9.5, color: BPI.ink40, marginLeft: 6, fontFamily: BPIMono }}>thin</span>}
            {f && <TabBadge count={f.count} sev={f.sev} />}
          </span>
        );
      })}
    </div>
  );
}

// ── Route title row ───────────────────────────────────────────
function VerdictRouteHeader({ route, w }) {
  return (
    <div style={{ padding: '18px 28px 16px', background: BPI.card }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <RouteBadge route={route.badge.route} sbs={route.badge.sbs} size="xl" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 21, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{route.title}</span>
            <PostureTag posture={route.posture} label={route.postureLabel} />
          </div>
          <div style={{ fontSize: 12.5, color: BPI.ink55, marginTop: 5 }}>{route.geo}</div>
        </div>
        <Button variant="primary">Generate brief →</Button>
      </div>
    </div>
  );
}
function PostureTag({ posture, label }) {
  const tone = posture === 'worsening' ? 'bad' : posture === 'treated-improving' ? 'good' : posture === 'healthy' ? 'good' : 'neutral';
  const t = vTone(tone);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 9px', borderRadius: 100, background: t.bg, color: t.fg,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.01em',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: t.fg }} />
      {label}
    </span>
  );
}

// ── Mini-map — static route shape, segment pace coloring, flagged emphasis ──
// Aspect-fits its frame: pass w OR h and the other is derived from the route's
// viewBox so the route always fills the frame (no letterboxing). Carries street
// context (water band, parallel avenues, cross-street ticks) to read as a real
// basemap excerpt.
function VerdictMiniMap({ route, w, h, showOpen = true }) {
  const g = route.geomini;
  const [vw, vh] = g.vb;
  let W = w, H = h;
  if (w && !h) H = Math.round(w * vh / vw);
  else if (h && !w) W = Math.round(h * vw / vh);
  else if (!w && !h) { W = 300; H = Math.round(300 * vh / vw); }
  const pts = g.pts;
  const flaggedI = g.segs.findIndex((s) => s.flag);
  const tickDir = g.crossAxis === 'diag';
  return (
    <div style={{ position: 'relative', width: W, height: H, background: BPI.paper, borderRadius: 4, boxShadow: `inset 0 0 0 1px ${BPI.rule}`, overflow: 'hidden' }}>
      <svg viewBox={`0 0 ${vw} ${vh}`} width={W} height={H} style={{ display: 'block', position: 'absolute', inset: 0 }} preserveAspectRatio="xMidYMid slice">
        {/* water */}
        {g.water && (
          <g>
            <path d={g.water} fill="oklch(0.905 0.016 232)" />
            <text x={g.crossAxis === 'diag' ? vw * 0.5 : vw - 22} y={g.crossAxis === 'diag' ? vh - 12 : vh * 0.46}
              fill="oklch(0.74 0.03 232)" fontFamily={BPIMono} fontSize="8" fontWeight="700" letterSpacing="0.18em"
              textAnchor="middle" transform={g.crossAxis === 'diag' ? '' : `rotate(90 ${vw - 22} ${vh * 0.46})`}>{g.waterLabel}</text>
          </g>
        )}
        {/* parallel context avenues */}
        {(g.avenues || []).map((ax, i) => (
          <line key={'av' + i} x1={ax} y1={10} x2={ax} y2={vh - 10} stroke={BPI.ink} strokeOpacity="0.06" strokeWidth="1.5" />
        ))}
        {/* cross-street ticks at each stop */}
        {pts.map((p, i) => tickDir
          ? <line key={'t' + i} x1={p[0] - 14} y1={p[1] + 14} x2={p[0] + 14} y2={p[1] - 14} stroke={BPI.ink} strokeOpacity="0.06" strokeWidth="1" />
          : <line key={'t' + i} x1={p[0] - 28} y1={p[1]} x2={p[0] + 28} y2={p[1]} stroke={BPI.ink} strokeOpacity="0.06" strokeWidth="1" />)}
        {/* casing */}
        <path d={pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ',' + p[1]).join(' ')}
          fill="none" stroke={BPI.card} strokeWidth="8.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* flagged glow */}
        {flaggedI >= 0 && (
          <line x1={pts[flaggedI][0]} y1={pts[flaggedI][1]} x2={pts[flaggedI + 1][0]} y2={pts[flaggedI + 1][1]}
            stroke={vTone(g.segs[flaggedI].flag === 'good' ? 'good' : 'bad').fg} strokeWidth="15" strokeLinecap="round" opacity="0.18" />
        )}
        {/* segments colored by pace */}
        {g.segs.map((s, i) => (
          <line key={i} x1={pts[i][0]} y1={pts[i][1]} x2={pts[i + 1][0]} y2={pts[i + 1][1]}
            stroke={s.flag === 'good' ? BPI.good : s.flag === 'bad' ? BPI.bad : vSpeed(s.mph)}
            strokeWidth={s.flag ? 6 : 4.5} strokeLinecap="round" />
        ))}
        {/* stops */}
        {pts.map((p, i) => {
          const term = i === 0 || i === pts.length - 1;
          return <circle key={i} cx={p[0]} cy={p[1]} r={term ? 4.4 : 2.6}
            fill={term ? BPI.ink : BPI.card} stroke={term ? BPI.ink : BPI.ink55} strokeWidth="1.5" />;
        })}
      </svg>
      {/* flag label */}
      {g.flagLabel && flaggedI >= 0 && (
        <div style={{
          position: 'absolute', left: 10,
          top: `${((pts[flaggedI][1] + pts[flaggedI + 1][1]) / 2 / vh) * 100}%`,
          transform: 'translateY(-50%)',
          background: vTone(g.segs[flaggedI].flag === 'good' ? 'good' : 'bad').fg, color: '#fff',
          fontFamily: BPIMono, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.05em',
          padding: '2px 6px', borderRadius: 3,
        }}>{g.flagLabel}</div>
      )}
      {/* open-map affordance — small corner tab */}
      {showOpen && (
        <div style={{
          position: 'absolute', right: 10, bottom: 10,
          display: 'inline-flex', alignItems: 'center',
          background: 'color-mix(in oklch, ' + BPI.card + ' 92%, transparent)',
          backdropFilter: 'blur(2px)', borderRadius: 3, padding: '5px 9px',
          boxShadow: `0 0 0 1px ${BPI.rule}`,
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: BPI.accent, cursor: 'pointer' }}>Open map →</span>
        </div>
      )}
    </div>
  );
}

// Small legend that fills the column beside a portrait mini-map.
function MiniMapLegend({ route }) {
  const g = route.geomini;
  const flagged = g.segs.filter((s) => s.flag);
  const fT = flagged.length ? (flagged[0].flag === 'good' ? 'good' : 'bad') : 'neutral';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 2 }}>
      <div>
        <div className="mono" style={{ fontSize: 9, color: BPI.ink40, letterSpacing: '0.06em', marginBottom: 7 }}>PACE SCALE</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ height: 7, width: 96, borderRadius: 2, background: `linear-gradient(90deg, ${BPI.bad}, ${BPI.warn}, oklch(0.64 0.10 78), ${BPI.good})` }} />
        </div>
        <div className="mono" style={{ fontSize: 9, color: BPI.ink40, display: 'flex', justifyContent: 'space-between', width: 96, marginTop: 4 }}>
          <span>slow</span><span>fast</span>
        </div>
      </div>
      <div>
        <div className="mono" style={{ fontSize: 9, color: BPI.ink40, letterSpacing: '0.06em', marginBottom: 7 }}>FLAGGED</div>
        {flagged.length ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 12, height: 4, borderRadius: 2, background: vTone(fT).fg }} />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: BPI.ink }}>{g.flagLabel}</span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 14, height: 14, borderRadius: 7, background: BPI.goodBg, color: BPI.good, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>✓</span>
            <span style={{ fontSize: 11.5, color: BPI.ink70 }}>none flagged</span>
          </div>
        )}
      </div>
      <div style={{ fontSize: 10.5, color: BPI.ink55, lineHeight: 1.5, maxWidth: 150 }}>
        Every spatial claim on the page has a spatial rendering — tap through to read any segment live.
      </div>
    </div>
  );
}

// ── Story strip — one multi-year figure, chosen by what matters ──
function StoryStrip({ story, w = 760, h = 220 }) {
  const data = story.data;
  const n = data.length;
  const padL = 30, padR = 14, padT = 16, padB = 26;
  const cw = (w - padL - padR) / (n - 1);
  const lo = story.lo, hi = story.hi;
  const yv = (v) => padT + (1 - (v - lo) / (hi - lo)) * (h - padT - padB);
  const xi = (i) => padL + i * cw;
  const pts = data.map((v, i) => [xi(i), yv(v)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const monthLabels = ['36 mo ago', '24', '12', 'now'];
  const monthIdx = [0, 12, 24, n - 1];
  const ticks = [];
  const step = (hi - lo) / 3;
  for (let i = 0; i <= 3; i++) ticks.push(+(lo + step * i).toFixed(1));

  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      {/* gridlines */}
      {ticks.map((v) => (
        <g key={v}>
          <line x1={padL} x2={w - padR} y1={yv(v)} y2={yv(v)} stroke={BPI.rule} />
          <text x={padL - 5} y={yv(v) + 3} fontSize="9" textAnchor="end" fill={BPI.ink40} fontFamily={BPIMono}>{v.toFixed(1)}</text>
        </g>
      ))}

      {/* stable band */}
      {story.kind === 'stable' && (
        <rect x={padL} y={yv(story.bandHi)} width={w - padL - padR} height={yv(story.bandLo) - yv(story.bandHi)}
          fill={BPI.good} opacity="0.10" rx="2" />
      )}

      {/* trend-shaded decline window */}
      {story.kind === 'trend-shaded' && (
        <g>
          <rect x={xi(story.shadeFrom)} y={padT} width={xi(story.shadeTo) - xi(story.shadeFrom)} height={h - padT - padB}
            fill={BPI.bad} opacity="0.06" />
          <text x={(xi(story.shadeFrom) + xi(story.shadeTo)) / 2} y={padT + 12} fontSize="9.5" textAnchor="middle"
            fill={BPI.bad} fontFamily={BPIMono} fontWeight="700" letterSpacing="0.04em">SUSTAINED DECLINE</text>
        </g>
      )}

      {/* before/after split shade */}
      {story.kind === 'beforeafter' && (
        <rect x={xi(story.splitAt)} y={padT} width={(w - padR) - xi(story.splitAt)} height={h - padT - padB}
          fill={BPI.good} opacity="0.07" />
      )}

      {/* the line — split-colored for before/after */}
      {story.kind === 'beforeafter' ? (
        <g>
          <path d={pts.slice(0, story.splitAt + 1).map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}
            fill="none" stroke={BPI.ink40} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <path d={pts.slice(story.splitAt).map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}
            fill="none" stroke={BPI.good} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
        </g>
      ) : (
        <path d={line} fill="none"
          stroke={story.kind === 'stable' ? BPI.good : story.kind === 'trend-shaded' ? BPI.bad : BPI.ink}
          strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      )}

      {/* markers */}
      {(story.markers || []).map((m, i) => {
        const c = vTone(m.tone).fg;
        const labelY = i % 2 === 0 ? padT + 12 : padT + 28;
        const anchorRight = m.i > n * 0.6;
        return (
          <g key={i}>
            <line x1={xi(m.i)} x2={xi(m.i)} y1={padT} y2={h - padB} stroke={c} strokeDasharray="3 2.5" strokeWidth="1.2" opacity="0.8" />
            <text x={xi(m.i) + (anchorRight ? -5 : 5)} y={labelY} fontSize="9" fill={c} fontFamily={BPIMono} fontWeight="600" textAnchor={anchorRight ? 'end' : 'start'}>{m.label}</text>
          </g>
        );
      })}

      {/* end dot + label */}
      <circle cx={pts[n - 1][0]} cy={pts[n - 1][1]} r="3.6"
        fill={story.kind === 'trend-shaded' ? BPI.bad : story.kind === 'stable' ? BPI.good : BPI.good} />
      <text x={pts[n - 1][0] - 6} y={pts[n - 1][1] - 8} fontSize="11" fontWeight="700" textAnchor="end" fontFamily={BPIMono}
        fill={story.kind === 'trend-shaded' ? BPI.bad : BPI.good}>{story.endLabel}</text>

      {/* x labels */}
      {monthIdx.map((mi, i) => (
        <text key={i} x={xi(mi)} y={h - 8} fontSize="9" textAnchor={i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}
          fill={BPI.ink40} fontFamily={BPIMono}>{monthLabels[i]}</text>
      ))}
    </svg>
  );
}

// ── Story carpet — month × hour heat excerpt (episodic framing) ──
function StoryCarpet({ carpet, w = 760, h = 220 }) {
  const { months, parts, grid } = carpet;
  const gutterL = 52, gutterT = 22;
  const cw = (w - gutterL) / parts.length;
  const ch = (h - gutterT) / months.length;
  const all = grid.flat();
  const lo = Math.min(...all), hi = Math.max(...all);
  const colorAt = (v) => {
    const t = Math.max(0, Math.min(1, (v - lo) / ((hi - lo) || 1)));
    return `oklch(${0.55 + t * 0.34} ${0.16 * (1 - t) + 0.02} ${28 + t * 40})`;
  };
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      {parts.map((p, ci) => (
        <text key={ci} x={gutterL + ci * cw + cw / 2} y={14} fontSize="9.5" textAnchor="middle" fill={BPI.ink55} fontFamily={BPIMono}>{p}</text>
      ))}
      {months.map((m, ri) => (
        <text key={ri} x={gutterL - 8} y={gutterT + ri * ch + ch / 2 + 3} fontSize="10" textAnchor="end" fill={BPI.ink55} fontFamily={BPIMono}>{m}</text>
      ))}
      {grid.map((row, ri) => row.map((v, ci) => (
        <g key={ri + '-' + ci}>
          <rect x={gutterL + ci * cw + 1.5} y={gutterT + ri * ch + 1.5} width={cw - 3} height={ch - 3} rx="2.5" fill={colorAt(v)} />
          <text x={gutterL + ci * cw + cw / 2} y={gutterT + ri * ch + ch / 2 + 3.5} fontSize="9.5" textAnchor="middle"
            fontFamily={BPIMono} fontWeight="600" fill={v < (lo + hi) / 2 ? '#fff' : BPI.ink70}>{v.toFixed(1)}</text>
        </g>
      )))}
    </svg>
  );
}

// ── Zero-insight — the checked-clean report card (credibility feature) ──
function ZeroInsight({ route, variant = 'roster' }) {
  const fams = route.checked.families;
  const asOf = route.checked.asOf;
  const monthName = 'May 2026';
  if (variant === 'quiet') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
        background: BPI.goodBg, borderRadius: 4, boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${BPI.good} 22%, transparent)`,
      }}>
        <CheckSeal />
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: BPI.ink }}>No flags raised</div>
          <div style={{ fontSize: 11.5, color: BPI.ink70, marginTop: 2 }}>Checked through {monthName} across {fams.length} detector families.</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{
      background: BPI.card, borderRadius: 4, boxShadow: `0 0 0 1px ${BPI.rule}`, overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '18px 22px',
        background: BPI.goodBg, boxShadow: `inset 0 -1px 0 color-mix(in oklch, ${BPI.good} 20%, transparent)`,
      }}>
        <CheckSeal big />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', color: BPI.ink }}>
            Checked through {monthName} — no flags raised
          </div>
          <div style={{ fontSize: 12.5, color: BPI.ink70, marginTop: 3, lineHeight: 1.5, maxWidth: 620 }}>
            Every detector family ran against this route over the full window and returned clean. On a healthy route the absence of a flag is the finding — not a gap in the data.
          </div>
        </div>
        <DataAsOf date={asOf} fresh="current" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {fams.map((f, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '13px 18px',
            boxShadow: `inset 0 -1px 0 ${BPI.rule}${i % 3 !== 2 ? `, inset -1px 0 0 ${BPI.rule}` : ''}`,
          }}>
            <span style={{
              width: 18, height: 18, borderRadius: 9, background: BPI.goodBg, color: BPI.good,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>✓</span>
            <span style={{ fontSize: 12.5, fontWeight: 500, color: BPI.ink }}>{f}</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 10, color: BPI.good, fontFamily: BPIMono, fontWeight: 600 }}>clean</span>
          </div>
        ))}
      </div>
    </div>
  );
}
function CheckSeal({ big }) {
  const s = big ? 38 : 30;
  return (
    <span style={{
      width: s, height: s, borderRadius: s / 2, flexShrink: 0,
      background: BPI.good, color: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: big ? 20 : 16, fontWeight: 700,
      boxShadow: `0 0 0 4px ${BPI.goodBg}`,
    }}>✓</span>
  );
}

// ── Verdict footer — treatment chips · dataAsOf · what we checked · two-clock ──
function VerdictFooter({ route }) {
  const t = route.kpi.treatment;
  const tc = route.twoClock;
  return (
    <div style={{
      background: BPI.card, borderRadius: 4, boxShadow: `0 0 0 1px ${BPI.rule}`, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10.5, color: BPI.ink40, fontFamily: BPIMono, fontWeight: 700, letterSpacing: '0.06em' }}>POSTURE</span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{t.posture}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {t.chips.map((c, i) => <span key={i} className="chip" style={{ fontSize: 10.5 }}>{c}</span>)}
        </div>
        <DataAsOf date={t.asOf} fresh={t.fresh} />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: BPI.accent, cursor: 'pointer' }}>What we checked →</span>
      </div>
      {/* two-clock reconciliation — one metric, the difference made legible */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '9px 20px',
        background: BPI.paperDeep, boxShadow: `inset 0 1px 0 ${BPI.rule}`,
        fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono, flexWrap: 'wrap',
      }}>
        <FreshDot fresh="current" />
        <span style={{ color: BPI.ink70, fontWeight: 600 }}>{tc.metric}: {tc.dossier}</span>
        <span style={{ color: BPI.ink20 }}>·</span>
        <span>{tc.release}</span>
        <span style={{ color: BPI.accent, fontWeight: 600, cursor: 'pointer' }}>why they differ →</span>
      </div>
    </div>
  );
}

Object.assign(window, {
  JudgedKpiStrip, QuestionTabs, TabBadge, QUESTION_TABS,
  VerdictRouteHeader, PostureTag, VerdictMiniMap, MiniMapLegend,
  StoryStrip, StoryCarpet, ZeroInsight, CheckSeal, VerdictFooter,
});
