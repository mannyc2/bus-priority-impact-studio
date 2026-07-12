// brief-primitives.jsx — Rich brief primitives.
//
// The first generation of brief widgets (KPI cards, BPubMiniTrend,
// BPubCoverageBar, BPubClaim) is good for the editorial spine of a
// published brief, but it can't carry an analytical *figure* — a thing
// the reader can interrogate without leaving the paragraph.
//
// This file adds two layers of new primitives:
//
//   1. INLINE — chips that sit inside running text and carry real
//      data with them (route + current speed, segment reference with
//      a sparkline icon, evidence-id pill, delta-aware metric).
//   2. EMBEDDED — figure-sized widgets that break the prose like a
//      block quote or chart: segment card, before/after, projection,
//      data lineage, mentioned-routes rail, finding callout, three-
//      column rich card.
//
// Exposed:
//   <BriefPrimitivesCatalog />  — specimen page (one artboard)
//   <RF_BriefRich />            — sample reading view using primitives
//                                 inline, in a real article shape.

// ─────────────────────────────────────────────────────────────
// 1. INLINE PRIMITIVES — drop into running text
// ─────────────────────────────────────────────────────────────

// Inline route chip with current state. Reads like "M15 SBS · 6.3 mph".
// Use in paragraphs where the route is the subject of the sentence.
function InlineRoute({ route, sbs, value, unit, tone, cite }) {
  const color = tone === 'bad' ? BPI.bad : tone === 'good' ? BPI.good : tone === 'warn' ? BPI.warn : BPI.ink70;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      verticalAlign: 'baseline', padding: '1px 6px 2px 3px',
      borderRadius: 3, background: BPI.ink06,
      lineHeight: 1.3,
    }}>
      <RouteBadge route={route} sbs={sbs} size="sm" />
      {value !== undefined && (
        <>
          <span className="num" style={{ fontSize: 12.5, fontWeight: 600, color, letterSpacing: '-0.005em' }}>
            {value}
          </span>
          {unit && <span style={{ fontSize: 10.5, color: BPI.ink55 }}>{unit}</span>}
        </>
      )}
      {cite && <Cite n={cite} />}
    </span>
  );
}

// Inline segment reference — a way to drop "Madison Av 28→58 St" into a
// sentence and have it carry a 6-point sparkline of recent speed with it.
function InlineSegment({ name, dir, spark, mph, cite }) {
  const sev = mph !== undefined ? (mph < 5 ? BPI.bad : mph < 6 ? BPI.warn : BPI.ink) : BPI.ink;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      verticalAlign: 'middle', padding: '0 6px',
      background: BPI.paperDeep, borderRadius: 3,
      boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
      fontSize: 12, lineHeight: 1.5,
      fontFamily: BPIMono,
    }}>
      {dir && <DirIndicator dir={dir} />}
      <span style={{ color: BPI.ink, fontWeight: 500 }}>{name}</span>
      {spark && <Spark data={spark} width={36} height={12} color={sev} />}
      {mph !== undefined && (
        <span className="num" style={{ color: sev, fontWeight: 700, fontSize: 11.5 }}>
          {mph.toFixed(1)}
        </span>
      )}
      {cite && <Cite n={cite} />}
    </span>
  );
}

// Inline metric chip — number + unit + delta. The unit modifier is what
// makes this different from just writing the number bold: it ties the
// number to its scale so the reader doesn't have to remember whether
// 6.74 is mph or rider-hours.
function InlineMetric({ value, unit, delta, deltaUnit, tone, cite }) {
  const color = tone === 'bad' ? BPI.bad : tone === 'good' ? BPI.good : tone === 'warn' ? BPI.warn : BPI.ink;
  const deltaColor = !delta ? BPI.ink55
    : (delta.startsWith('+') ? BPI.good
    : delta.startsWith('−') || delta.startsWith('-') ? BPI.bad
    : BPI.ink70);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 4,
      verticalAlign: 'baseline', padding: '0 4px',
      borderRadius: 2,
    }}>
      <span className="num" style={{ fontSize: 14, fontWeight: 600, color, letterSpacing: '-0.01em' }}>
        {value}
      </span>
      {unit && <span style={{ fontSize: 10.5, color: BPI.ink55, fontWeight: 500 }}>{unit}</span>}
      {delta && (
        <span className="num" style={{
          fontSize: 11, fontWeight: 600, color: deltaColor,
          fontFamily: BPIMono, marginLeft: 2,
        }}>{delta}{deltaUnit && <span style={{ color: BPI.ink40, marginLeft: 1 }}>{deltaUnit}</span>}</span>
      )}
      {cite && <Cite n={cite} />}
    </span>
  );
}

// Inline source / evidence pill — a clickable [EV-1041] in running text.
// Hover reveals the dataset + retrieval timestamp; click jumps to the
// catalog. Replaces awkward parenthetical citations in tight prose.
function InlineSource({ id, src, retrieved }) {
  return (
    <span title={src ? `${src}${retrieved ? ' · ' + retrieved : ''}` : id}
      style={{
        display: 'inline-flex', alignItems: 'baseline', gap: 4,
        verticalAlign: 'baseline', padding: '0 5px',
        background: BPI.accentBg, color: BPI.accent,
        borderRadius: 2, cursor: 'help',
        fontFamily: BPIMono, fontSize: 10.5, fontWeight: 700,
        letterSpacing: '0.04em', lineHeight: 1.5,
      }}>
      {id}
    </span>
  );
}

// Inline keyboard / shorthand annotation — for marking up phrases that
// appear elsewhere in the brief glossary or the corpus.
function InlineTag({ children, tone }) {
  const palette = tone === 'warn' ? { bg: BPI.warnBg, fg: BPI.warn }
    : tone === 'good' ? { bg: BPI.goodBg, fg: BPI.good }
    : { bg: BPI.ink06, fg: BPI.ink70 };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'baseline',
      verticalAlign: 'baseline', padding: '0 6px',
      background: palette.bg, color: palette.fg,
      borderRadius: 2, fontSize: 11, fontWeight: 600,
      letterSpacing: '0.01em', lineHeight: 1.5,
    }}>{children}</span>
  );
}

// ─────────────────────────────────────────────────────────────
// 2. EMBEDDED BLOCK PRIMITIVES — figures inside prose
// ─────────────────────────────────────────────────────────────

// EmbedSegmentCard — pulls one segment out of the route into a card,
// the way an editorial would lift a single statistic into a sidebar.
// Two-row layout: a header strip (route + segment + treatments), a
// stats row (observed, scheduled, gap, rider-hours), and a full-width
// sparkline footer captioned with the 14-day window.
function EmbedSegmentCard({ route, sbs, dir, from, to, mph, sched, spark, lane, ace, tsp, riderHours, note }) {
  const sev = mph < 5 ? BPI.bad : mph < 6 ? BPI.warn : BPI.ink;
  const gap = sched - mph;
  const gapPct = sched > 0 ? Math.round((gap / sched) * 100) : 0;
  return (
    <figure style={{
      margin: '20px 0',
      background: BPI.card, borderRadius: 4,
      boxShadow: `inset 0 0 0 1px ${BPI.rule}, inset 4px 0 0 ${sev}`,
      overflow: 'hidden',
    }}>
      {/* Header strip */}
      <div style={{
        padding: '14px 20px 14px 22px',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
      }}>
        <RouteBadge route={route} sbs={sbs} size="sm" />
        <DirIndicator dir={dir} />
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.005em', color: BPI.ink }}>
          {from} <span style={{ color: BPI.ink40, margin: '0 4px' }}>→</span> {to}
        </span>
        <span style={{ flex: 1, minWidth: 12 }} />
        <TreatmentRow lane={lane} ace={ace} tsp={tsp} align="flex-end" />
      </div>

      {/* Stats row */}
      <div style={{
        padding: '18px 22px 16px',
        display: 'grid',
        gridTemplateColumns: 'auto 1px auto 1px auto auto',
        columnGap: 22, rowGap: 4,
        alignItems: 'baseline',
      }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6, color: BPI.ink55 }}>Observed</div>
          <div className="num" style={{
            fontSize: 32, fontWeight: 600, color: sev,
            letterSpacing: '-0.022em', lineHeight: 1,
          }}>
            {mph.toFixed(1)}<span style={{ fontSize: 13, color: BPI.ink55, fontWeight: 500, marginLeft: 4 }}>mph</span>
          </div>
        </div>
        <div style={{ alignSelf: 'stretch', background: BPI.rule, marginTop: 6 }} />
        <div>
          <div className="eyebrow" style={{ marginBottom: 6, color: BPI.ink55 }}>Scheduled</div>
          <div className="num" style={{
            fontSize: 20, fontWeight: 500, color: BPI.ink70,
            letterSpacing: '-0.014em', lineHeight: 1,
          }}>
            {sched.toFixed(1)}<span style={{ fontSize: 11, color: BPI.ink55, marginLeft: 4 }}>mph</span>
          </div>
        </div>
        <div style={{ alignSelf: 'stretch', background: BPI.rule, marginTop: 6 }} />
        <div>
          <div className="eyebrow" style={{ marginBottom: 6, color: BPI.ink55 }}>Gap to schedule</div>
          <div className="num" style={{
            fontSize: 20, fontWeight: 500, color: sev,
            letterSpacing: '-0.014em', lineHeight: 1, fontFamily: BPIMono,
          }}>
            −{gap.toFixed(1)}<span style={{ fontSize: 11, color: BPI.ink55, marginLeft: 4 }}>mph · {gapPct}%</span>
          </div>
        </div>
        {riderHours !== undefined && (
          <div style={{ textAlign: 'right' }}>
            <div className="eyebrow" style={{ marginBottom: 6, color: BPI.ink55 }}>Rider-hrs lost / day</div>
            <div className="num" style={{
              fontSize: 20, fontWeight: 500, color: BPI.ink,
              letterSpacing: '-0.014em', lineHeight: 1, fontFamily: BPIMono,
            }}>
              {riderHours.toLocaleString()}
            </div>
          </div>
        )}
      </div>

      {/* Sparkline footer */}
      {spark && (
        <div style={{
          padding: '14px 22px 16px',
          background: BPI.paperDeep,
          boxShadow: `inset 0 1px 0 ${BPI.rule}`,
        }}>
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            marginBottom: 8,
          }}>
            <div style={{ fontSize: 10, color: BPI.ink55, fontFamily: BPIMono, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              14-day median speed
            </div>
            <div style={{ fontSize: 10, color: BPI.ink55, fontFamily: BPIMono, display: 'flex', gap: 12 }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 0, borderTop: `1px dashed ${BPI.ink40}`, verticalAlign: 'middle', marginRight: 4 }} />scheduled {sched.toFixed(1)}</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 2, background: sev, verticalAlign: 'middle', marginRight: 4 }} />observed</span>
            </div>
          </div>
          <ResponsiveSpark data={spark} height={48} color={sev} baseline={sched} fill />
        </div>
      )}

      {note && (
        <div style={{
          padding: '12px 22px',
          fontSize: 12, color: BPI.ink70, lineHeight: 1.55,
          fontStyle: 'italic', textWrap: 'pretty',
          boxShadow: `inset 0 1px 0 ${BPI.rule}`,
        }}>
          {note}
        </div>
      )}
    </figure>
  );
}

// Responsive sparkline — scales with container width via viewBox.
function ResponsiveSpark({ data, height = 48, color, baseline, fill }) {
  if (!data || !data.length) return null;
  const W = 1000;
  const min = Math.min(...data, baseline ?? Infinity);
  const max = Math.max(...data, baseline ?? -Infinity);
  const range = (max - min) || 1;
  const dx = W / (data.length - 1 || 1);
  const y = (v) => height - 2 - ((v - min) / range) * (height - 4);
  const pts = data.map((v, i) => [i * dx, y(v)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const area = d + ` L${W},${height} L0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none"
      style={{ display: 'block', width: '100%', height, overflow: 'visible' }}>
      {baseline !== undefined && (
        <line x1="0" x2={W} y1={y(baseline)} y2={y(baseline)}
          stroke={BPI.ink40} strokeDasharray="3 3" strokeWidth="1"
          vectorEffect="non-scaling-stroke" />
      )}
      {fill && <path d={area} fill={color} opacity="0.10" />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.6"
        strokeLinejoin="round" strokeLinecap="round"
        vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// EmbedBeforeAfter — a self-contained before/after intervention figure.
// Single shared axis with two stacked bars so the magnitude of change
// reads geometrically. Header carries the intervention; a delta chip
// sits at the right; a caveat lives in a yellow note at the bottom.
function EmbedBeforeAfter({ intervention, when, before, after, unit, delta, caveat, citeBefore, citeAfter }) {
  const max = Math.max(before.v, after.v) * 1.18;
  const positive = delta && (delta.startsWith('+') || delta.startsWith('↑'));
  const deltaColor = positive ? BPI.good : BPI.bad;
  const beforePct = (before.v / max) * 100;
  const afterPct  = (after.v  / max) * 100;
  return (
    <figure style={{
      margin: '20px 0',
      background: BPI.card, borderRadius: 4,
      boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 22px',
        background: BPI.paperDeep,
        boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <span style={{
          fontFamily: BPIMono, fontSize: 10, fontWeight: 700,
          color: BPI.accent, letterSpacing: '0.1em',
        }}>INTERVENTION</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: BPI.ink, letterSpacing: '-0.008em' }}>
          {intervention}
        </span>
        <span style={{ flex: 1, minWidth: 8 }} />
        <span style={{ fontSize: 11, color: BPI.ink55, fontFamily: BPIMono }}>{when}</span>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', borderRadius: 12,
          background: positive ? BPI.goodBg : BPI.badBg,
          color: deltaColor, fontFamily: BPIMono,
          fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
        }}>
          <span style={{ fontSize: 13, lineHeight: 1 }}>{positive ? '↑' : '↓'}</span>
          {delta}
        </span>
      </div>

      {/* Chart */}
      <div style={{ padding: '20px 22px 18px' }}>
        {/* Before row */}
        <div style={{
          display: 'grid', gridTemplateColumns: '120px 1fr 92px',
          alignItems: 'center', gap: 14, marginBottom: 6,
        }}>
          <div>
            <div className="eyebrow" style={{ color: BPI.ink55 }}>{before.label || 'Before'}</div>
          </div>
          <div style={{ position: 'relative', height: 22 }}>
            <div style={{
              position: 'absolute', inset: 0,
              background: BPI.ink06, borderRadius: 2,
            }} />
            <div style={{
              position: 'absolute', top: 0, left: 0, bottom: 0,
              width: `${beforePct}%`,
              background: BPI.ink40, borderRadius: 2,
            }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, justifyContent: 'flex-end' }}>
            <span className="num" style={{
              fontSize: 22, fontWeight: 600, color: BPI.ink70,
              letterSpacing: '-0.018em', lineHeight: 1, fontFamily: BPIMono,
            }}>{before.v}</span>
            <span style={{ fontSize: 11, color: BPI.ink55 }}>{unit}</span>
            {citeBefore && <Cite n={citeBefore} />}
          </div>
        </div>
        {before.sub && (
          <div style={{ paddingLeft: 134, fontSize: 11, color: BPI.ink55, lineHeight: 1.5, marginBottom: 12 }}>
            {before.sub}
          </div>
        )}

        {/* After row */}
        <div style={{
          display: 'grid', gridTemplateColumns: '120px 1fr 92px',
          alignItems: 'center', gap: 14, marginBottom: 6,
        }}>
          <div>
            <div className="eyebrow" style={{ color: BPI.ink55 }}>{after.label || 'After'}</div>
          </div>
          <div style={{ position: 'relative', height: 22 }}>
            <div style={{
              position: 'absolute', inset: 0,
              background: BPI.ink06, borderRadius: 2,
            }} />
            <div style={{
              position: 'absolute', top: 0, left: 0, bottom: 0,
              width: `${afterPct}%`,
              background: deltaColor, borderRadius: 2,
            }} />
            {/* Reference tick at before value to show delta visually */}
            <div style={{
              position: 'absolute', left: `${beforePct}%`, top: -3, bottom: -3,
              width: 1, background: BPI.ink70,
            }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, justifyContent: 'flex-end' }}>
            <span className="num" style={{
              fontSize: 22, fontWeight: 600, color: deltaColor,
              letterSpacing: '-0.018em', lineHeight: 1, fontFamily: BPIMono,
            }}>{after.v}</span>
            <span style={{ fontSize: 11, color: BPI.ink55 }}>{unit}</span>
            {citeAfter && <Cite n={citeAfter} />}
          </div>
        </div>
        {after.sub && (
          <div style={{ paddingLeft: 134, fontSize: 11, color: BPI.ink55, lineHeight: 1.5 }}>
            {after.sub}
          </div>
        )}
      </div>

      {caveat && (
        <div style={{
          padding: '12px 22px',
          background: BPI.warnBg,
          boxShadow: `inset 0 1px 0 ${BPI.rule}, inset 3px 0 0 ${BPI.warn}`,
          display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10, alignItems: 'baseline',
          fontSize: 12, lineHeight: 1.5, color: BPI.ink70,
        }}>
          <span style={{
            fontFamily: BPIMono, fontSize: 9.5, fontWeight: 700,
            color: BPI.warn, letterSpacing: '0.1em',
          }}>CAVEAT</span>
          <span style={{ textWrap: 'pretty' }}>{caveat}</span>
        </div>
      )}
    </figure>
  );
}

// EmbedProjection — a what-if scenario card. Each row is a scenario
// (baseline, planned, target). Bars are drawn to a common scale so the
// reader sees the gap, not just the numbers.
function EmbedProjection({ title, sub, unit, scenarios, target }) {
  const max = Math.max(...scenarios.map((s) => s.v), target ?? 0) * 1.05;
  return (
    <figure style={{
      margin: '20px 0', padding: '20px 22px',
      background: BPI.card, borderRadius: 4,
      boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div className="eyebrow" style={{ color: BPI.accent, marginBottom: 6 }}>SCENARIOS</div>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.012em' }}>{title}</div>
          {sub && <div style={{ fontSize: 11.5, color: BPI.ink55, marginTop: 4, lineHeight: 1.45, maxWidth: 460 }}>{sub}</div>}
        </div>
        {target !== undefined && (
          <div style={{ textAlign: 'right' }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Pre-decline target</div>
            <div className="num" style={{ fontSize: 14, fontWeight: 600, color: BPI.accent, fontFamily: BPIMono }}>
              {target.toFixed(1)} {unit}
            </div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {scenarios.map((s, i) => {
          const pct = (s.v / max) * 100;
          const targetPct = target !== undefined ? (target / max) * 100 : null;
          const reaches = target !== undefined && s.v >= target;
          const barColor = s.kind === 'current' ? BPI.ink40
            : s.kind === 'target' ? BPI.good
            : reaches ? BPI.good : BPI.warn;
          return (
            <div key={i}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: BPI.ink }}>
                  {s.label}
                  {s.kind === 'current' && <span className="chip" style={{ marginLeft: 8, fontSize: 9, padding: '1px 5px' }}>OBSERVED</span>}
                </span>
                <span className="num" style={{ fontSize: 13, fontWeight: 600, color: BPI.ink, fontFamily: BPIMono, letterSpacing: '-0.005em' }}>
                  {s.v.toFixed(1)}<span style={{ fontSize: 10.5, color: BPI.ink55, marginLeft: 3 }}>{unit}</span>
                </span>
              </div>
              <div style={{ position: 'relative', height: 12, background: BPI.ink06, borderRadius: 2 }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${pct}%`, background: barColor,
                  borderRadius: 2,
                  transition: 'width .3s',
                }} />
                {targetPct !== null && (
                  <div style={{
                    position: 'absolute', left: `${targetPct}%`, top: -3, bottom: -3,
                    width: 2, background: BPI.accent,
                  }} />
                )}
              </div>
              {s.sub && (
                <div style={{ fontSize: 10.5, color: BPI.ink55, marginTop: 5, lineHeight: 1.45 }}>{s.sub}</div>
              )}
            </div>
          );
        })}
      </div>
    </figure>
  );
}

// EmbedDataLineage — provenance card. "How this number was built": the
// source dataset, the projection, the filter, the rows, the retrieval
// timestamp. Reads top-to-bottom as a recipe.
function EmbedDataLineage({ metric, source, steps, retrieved, rowCount }) {
  return (
    <figure style={{
      margin: '20px 0',
      background: BPI.card, borderRadius: 4,
      boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        background: BPI.ink, color: BPI.paper,
        display: 'grid', gridTemplateColumns: '32px 1fr auto', gap: 12,
        alignItems: 'center',
      }}>
        <span style={{
          width: 32, height: 32, borderRadius: 16,
          background: 'rgba(244,241,234,.10)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: BPIMono, fontSize: 15, fontWeight: 700,
          color: BPI.paper, fontStyle: 'italic',
        }}>ƒ</span>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 9.5, fontFamily: BPIMono, fontWeight: 700,
            letterSpacing: '0.1em', color: 'rgba(244,241,234,.55)',
            textTransform: 'uppercase',
          }}>How this number was built</div>
          <div style={{
            fontSize: 14, fontWeight: 600, marginTop: 3,
            letterSpacing: '-0.008em', color: BPI.paper,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{metric}</div>
        </div>
        <span style={{
          fontFamily: BPIMono, fontSize: 10.5, fontWeight: 600,
          color: 'rgba(244,241,234,.82)',
          padding: '4px 8px', borderRadius: 2,
          background: 'rgba(244,241,234,.08)', whiteSpace: 'nowrap',
        }}>{rowCount}</span>
      </div>

      {/* Source row */}
      <div style={{
        padding: '12px 20px',
        background: BPI.paperDeep,
        boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
        display: 'grid', gridTemplateColumns: '44px 1fr', gap: 10,
        alignItems: 'baseline',
      }}>
        <span style={{
          fontFamily: BPIMono, fontSize: 9.5, fontWeight: 700,
          color: BPI.accent, letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>Source</span>
        <span style={{ fontSize: 13, fontWeight: 500, color: BPI.ink, letterSpacing: '-0.005em' }}>
          {source}
        </span>
      </div>

      {/* Steps */}
      <ol style={{
        margin: 0, padding: '14px 20px 16px',
        listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 0,
      }}>
        {steps.map((s, i) => (
          <li key={i} style={{
            display: 'grid', gridTemplateColumns: '32px 84px 1fr', gap: 10,
            alignItems: 'baseline', padding: '8px 0',
            boxShadow: i < steps.length - 1 ? `inset 0 -1px 0 ${BPI.rule}` : 'none',
          }}>
            <span style={{
              fontFamily: BPIMono, fontSize: 10.5, fontWeight: 700,
              color: BPI.ink40, letterSpacing: '0.04em',
            }}>{(i + 1).toString().padStart(2, '0')}</span>
            <span style={{
              fontFamily: BPIMono, fontSize: 11, fontWeight: 700,
              color: BPI.accent, background: BPI.accentBg,
              padding: '2px 8px', borderRadius: 2,
              letterSpacing: '0.02em', textAlign: 'center',
              width: 'fit-content',
            }}>{s.op}</span>
            <span style={{
              fontSize: 12.5, lineHeight: 1.55, color: BPI.ink70, fontFamily: BPIMono,
            }}>{s.detail}</span>
          </li>
        ))}
      </ol>

      {/* Footer */}
      <div style={{
        padding: '10px 20px',
        background: BPI.paperDeep,
        boxShadow: `inset 0 1px 0 ${BPI.rule}`,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono,
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 6, height: 6, borderRadius: 3, background: BPI.good,
            display: 'inline-block',
          }} />
          retrieved {retrieved}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{
          color: BPI.accent, fontWeight: 700, cursor: 'pointer',
          letterSpacing: '0.02em',
        }}>Open in evidence catalog →</span>
      </div>
    </figure>
  );
}

// EmbedFinding — an AI-surfaced finding callout. The brief references a
// finding from the Findings feed and pulls it inline with the reasoning
// trail visible.
function EmbedFinding({ confidence, title, claim, supports, route, sbs }) {
  return (
    <figure style={{
      margin: '20px 0', padding: '20px 22px',
      background: BPI.ink, color: BPI.paper, borderRadius: 4,
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute', top: 18, right: 22,
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 9.5, fontFamily: BPIMono, fontWeight: 700,
        letterSpacing: '0.1em',
        color: 'rgba(244,241,234,.55)',
      }}>
        <span style={{ color: BPI.accent }}>◆</span>
        AI-SURFACED FINDING
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        {route && <RouteBadge route={route} sbs={sbs} size="sm" />}
        <span style={{ fontSize: 10.5, fontFamily: BPIMono, color: 'rgba(244,241,234,.55)', letterSpacing: '0.06em' }}>
          {title}
        </span>
      </div>
      <div style={{
        fontSize: 20, fontWeight: 600, lineHeight: 1.3,
        letterSpacing: '-0.015em', color: BPI.paper,
        maxWidth: 640, textWrap: 'pretty', marginBottom: 16,
      }}>{claim}</div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18,
        paddingTop: 14, boxShadow: 'inset 0 1px 0 rgba(244,241,234,.16)',
      }}>
        {supports.map((s, i) => (
          <div key={i}>
            <div style={{
              fontSize: 9.5, fontFamily: BPIMono, fontWeight: 700,
              letterSpacing: '0.1em', color: 'rgba(244,241,234,.45)',
              marginBottom: 6,
            }}>SUPPORT {(i + 1).toString().padStart(2, '0')}</div>
            <div style={{ fontSize: 11.5, lineHeight: 1.5, color: 'rgba(244,241,234,.82)' }}>{s}</div>
          </div>
        ))}
      </div>
      <div style={{
        marginTop: 16, paddingTop: 12,
        boxShadow: 'inset 0 1px 0 rgba(244,241,234,.16)',
        display: 'flex', alignItems: 'center', gap: 12,
        fontSize: 11, color: 'rgba(244,241,234,.55)', fontFamily: BPIMono,
      }}>
        <span>confidence</span>
        <div style={{ width: 120, height: 4, background: 'rgba(244,241,234,.12)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${confidence}%`,
            background: confidence >= 75 ? BPI.good : confidence >= 50 ? BPI.warn : BPI.bad,
          }} />
        </div>
        <span style={{ color: BPI.paper, fontWeight: 700 }}>{confidence}%</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: BPI.paper, cursor: 'pointer', fontWeight: 600 }}>Open finding ↗</span>
      </div>
    </figure>
  );
}

// EmbedKeyTakeaways — a pull-out box. Three bullets that summarize the
// argument so far. Each one carries an icon corresponding to its tone.
function EmbedKeyTakeaways({ title, items }) {
  return (
    <figure style={{
      margin: '20px 0', padding: '22px 26px',
      background: BPI.accentBg, borderRadius: 4,
      boxShadow: `inset 3px 0 0 ${BPI.accent}, inset 0 0 0 1px ${BPI.rule}`,
    }}>
      <div className="eyebrow" style={{ color: BPI.accent, marginBottom: 14, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {title || 'Key takeaways'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '26px 1fr', gap: 10, alignItems: 'baseline' }}>
            <span className="num" style={{
              fontFamily: BPIMono, fontSize: 13, fontWeight: 700,
              color: BPI.accent, letterSpacing: '0.02em',
            }}>0{i + 1}</span>
            <span style={{ fontSize: 14, lineHeight: 1.5, color: BPI.ink, fontWeight: 500, textWrap: 'pretty' }}>{it}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

// EmbedMentionedRoutes — right-rail card listing every route referenced
// in the brief, with a tiny sparkline next to each. Modeled on the
// "mentioned tickers" panel in editorial-financial layouts. Two-line
// rows so multi-character route badges don't crowd the borough caption.
function EmbedMentionedRoutes({ routes }) {
  return (
    <aside style={{
      background: BPI.card, borderRadius: 4,
      boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 16px',
        background: BPI.paperDeep,
        boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{
          fontFamily: BPIMono, fontSize: 10, fontWeight: 700,
          color: BPI.ink, letterSpacing: '0.12em', textTransform: 'uppercase',
        }}>
          Mentioned in this brief
        </span>
        <span style={{
          fontFamily: BPIMono, fontSize: 10, color: BPI.ink55,
        }}>{routes.length}</span>
      </div>
      <div>
        {routes.map((r, i) => {
          const tone = r.delta > 0 ? BPI.good : r.delta < 0 ? BPI.bad : BPI.ink70;
          return (
            <div key={i} style={{
              padding: '12px 16px',
              boxShadow: i < routes.length - 1 ? `inset 0 -1px 0 ${BPI.rule}` : 'none',
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto',
              columnGap: 12, rowGap: 8,
              alignItems: 'center',
            }}>
              {/* Row 1: badge + name + current value */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <RouteBadge route={r.route} sbs={r.sbs} size="sm" />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 12.5, fontWeight: 600, color: BPI.ink,
                  letterSpacing: '-0.005em',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {r.name}
                </div>
                <div style={{
                  fontSize: 10.5, color: BPI.ink55, marginTop: 2,
                  fontFamily: BPIMono,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {r.borough}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="num" style={{
                  fontSize: 16, fontWeight: 600, color: BPI.ink,
                  fontFamily: BPIMono, letterSpacing: '-0.01em', lineHeight: 1,
                }}>
                  {r.mph.toFixed(1)}
                  <span style={{ fontSize: 10, color: BPI.ink55, fontWeight: 500, marginLeft: 3 }}>mph</span>
                </div>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  marginTop: 4,
                  fontFamily: BPIMono, fontSize: 10.5, fontWeight: 700,
                  color: tone,
                }}>
                  <span style={{ fontSize: 10 }}>{r.delta > 0 ? '↑' : r.delta < 0 ? '↓' : '·'}</span>
                  {Math.abs(r.delta).toFixed(1)}
                </div>
              </div>
              {/* Row 2: full-width sparkline */}
              <div style={{ gridColumn: '1 / -1' }}>
                <ResponsiveSpark data={r.spark} height={26} color={tone} />
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

// EmbedRichSubBrief — multi-column themed card (architecture-history
// shape from the reference image). Three sub-claims share a single
// frame, divided by hairlines rather than nested boxes, color-coded only
// on the labels — the way a table of contents would mark sections.
function EmbedRichSubBrief({ title, sub, columns }) {
  return (
    <figure style={{
      margin: '20px 0', background: BPI.card, borderRadius: 4,
      boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
      overflow: 'hidden',
    }}>
      <div style={{ padding: '18px 22px', boxShadow: `inset 0 -1px 0 ${BPI.rule}` }}>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.012em', color: BPI.ink }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: BPI.ink55, marginTop: 4, fontStyle: 'italic' }}>{sub}</div>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
        {columns.map((c, i) => (
          <div key={i} style={{
            padding: '18px 22px',
            boxShadow: i < columns.length - 1 ? `inset -1px 0 0 ${BPI.rule}` : 'none',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: 4, background: c.color }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: c.color, letterSpacing: '-0.005em' }}>{c.label}</span>
            </div>
            {c.items.map((it, j) => (
              <div key={j} style={{ fontSize: 13, lineHeight: 1.45, color: BPI.ink, textWrap: 'pretty' }}>{it}</div>
            ))}
          </div>
        ))}
      </div>
    </figure>
  );
}

// EmbedHourFigure — a small inline 24h pattern, captioned, that can be
// dropped into prose. Reuses HourBars under the hood but adds a caption
// and gentler frame than ChartFrame.
function EmbedHourFigure({ caption, data, sched, height = 160 }) {
  return (
    <figure style={{
      margin: '20px 0', padding: '18px 20px',
      background: BPI.card, borderRadius: 4,
      boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
    }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>{caption}</div>
      <HourBars data={data} sched={sched} width={620} height={height} />
    </figure>
  );
}

// Expose all new primitives.
Object.assign(window, {
  InlineRoute, InlineSegment, InlineMetric, InlineSource, InlineTag,
  EmbedSegmentCard, EmbedBeforeAfter, EmbedProjection, EmbedDataLineage,
  EmbedFinding, EmbedKeyTakeaways, EmbedMentionedRoutes,
  EmbedRichSubBrief, EmbedHourFigure,
});
