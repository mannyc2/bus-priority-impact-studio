// authoring-v2-corpus.jsx — the "insert from the corpus" surface.
//
// This is the unified AI surface for the converged composer. It does the
// job of v1's evidence inspector AND the write-ahead proposer in one place:
// as you write, AI pre-selects its best corpus match (◆); ⏎ takes it, the
// arrows pick another, typing filters, esc dismisses. No shelf — the
// evidence is self-evident from the figures already in the composition.
//
// The craft here is the PREVIEW PRIMITIVES on the right of each row. v1
// used flat glyphs; these are real, crafted miniature figures — each one a
// faithful, legible shrink of the Embed* figure it will insert.

const AV2C_FRAME = { w: 96, h: 50 };

// Shared thumbnail frame so the previews read as one set.
function ThumbFrame({ children, dark, pad = 0 }) {
  return (
    <div style={{
      width: AV2C_FRAME.w, height: AV2C_FRAME.h, flexShrink: 0,
      background: dark ? BPI.ink : BPI.card,
      borderRadius: 4, padding: pad,
      boxShadow: `inset 0 0 0 1px ${dark ? 'rgba(244,241,234,.14)' : BPI.rule}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }}>{children}</div>
  );
}

// 1 ── Segment card → mini observed-vs-scheduled speed trend.
function PreviewSegment() {
  const d = AV2_MADISON_SPARK;
  const W = 84, H = 38, padX = 5, padT = 6, padB = 7;
  const lo = 4.9, hi = 7.8, sched = 7.4;
  const x = (i) => padX + i * ((W - 2 * padX) / (d.length - 1));
  const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const line = d.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
  const area = line + ` L${x(d.length - 1).toFixed(1)},${H - padB} L${x(0).toFixed(1)},${H - padB} Z`;
  return (
    <ThumbFrame>
      <svg width={W} height={H} style={{ display: 'block' }}>
        <line x1={padX} x2={W - padX} y1={y(sched)} y2={y(sched)} stroke={BPI.ink40} strokeDasharray="3 2.5" strokeWidth="1" />
        <path d={area} fill={BPI.bad} opacity="0.12" />
        <path d={line} fill="none" stroke={BPI.bad} strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(d.length - 1)} cy={y(d[d.length - 1])} r="2.4" fill={BPI.bad} />
      </svg>
    </ThumbFrame>
  );
}

// 2 ── Before / after → two bars on a shared axis + a delta tick.
function PreviewBeforeAfter() {
  return (
    <ThumbFrame>
      <div style={{ width: 76, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ position: 'relative', height: 9, background: BPI.ink06, borderRadius: 2 }}>
          <div style={{ position: 'absolute', inset: 0, width: '58%', background: BPI.ink40, borderRadius: 2 }} />
        </div>
        <div style={{ position: 'relative', height: 9, background: BPI.ink06, borderRadius: 2 }}>
          <div style={{ position: 'absolute', inset: 0, width: '82%', background: BPI.good, borderRadius: 2 }} />
          <div style={{ position: 'absolute', left: '58%', top: -2, bottom: -2, width: 1.5, background: BPI.ink }} />
        </div>
      </div>
    </ThumbFrame>
  );
}

// 3 ── Trace number (lineage) → a derivation flow ending in the result.
function PreviewLineage() {
  const W = 84, H = 36, cy = 18;
  const nodes = [9, 31, 53]; // intermediate x positions
  const resX = 73;
  return (
    <ThumbFrame>
      <svg width={W} height={H} style={{ display: 'block' }}>
        {/* connector */}
        <line x1={9} x2={resX} y1={cy} y2={cy} stroke={BPI.ink20} strokeWidth="1.2" />
        {/* ƒ source */}
        <circle cx={9} cy={cy} r="6.5" fill={BPI.ink} />
        <text x={9} y={cy + 3.4} fontSize="8.5" fontFamily={BPIMono} fontStyle="italic" fontWeight="700" fill={BPI.paper} textAnchor="middle">ƒ</text>
        {/* op nodes */}
        {nodes.slice(1).map((nx, i) => (
          <rect key={i} x={nx - 4} y={cy - 4} width="8" height="8" rx="1.5" fill={BPI.accentBg} stroke={BPI.accent} strokeWidth="1" />
        ))}
        {/* result */}
        <rect x={resX - 9} y={cy - 7} width="18" height="14" rx="3" fill={BPI.accent} />
        <text x={resX} y={cy + 3.2} fontSize="7.5" fontFamily={BPIMono} fontWeight="700" fill="#fff" textAnchor="middle">43%</text>
      </svg>
    </ThumbFrame>
  );
}

// 4 ── Finding → dark chip with ◆ and a confidence micro-bar.
function PreviewFinding() {
  return (
    <ThumbFrame dark pad={9}>
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ color: BPI.accent, fontSize: 9, lineHeight: 1 }}>◆</span>
          <div style={{ height: 2.5, width: 30, background: 'rgba(244,241,234,.5)', borderRadius: 2 }} />
        </div>
        <div style={{ height: 2.5, width: 44, background: 'rgba(244,241,234,.22)', borderRadius: 2 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ flex: 1, height: 3.5, background: 'rgba(244,241,234,.14)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: '82%', height: '100%', background: BPI.good }} />
          </div>
          <span style={{ fontFamily: BPIMono, fontSize: 7.5, fontWeight: 700, color: BPI.paper }}>82</span>
        </div>
      </div>
    </ThumbFrame>
  );
}

// 5 ── Hour pattern → 24-bar day profile, peaks marked.
function PreviewHourPattern() {
  const spd = [8.1, 8.2, 8.3, 8.4, 8.2, 7.6, 6.8, 5.4, 4.9, 5.5, 5.9, 6.0, 5.8, 5.6, 5.4, 5.2, 4.8, 4.2, 4.6, 5.8, 6.5, 7.0, 7.5, 7.8];
  const W = 84, H = 36, padB = 4, padT = 4;
  const lo = 4, hi = 8.6;
  const bw = (W - 4) / 24;
  const h = (v) => Math.max(2, ((v - lo) / (hi - lo)) * (H - padB - padT));
  return (
    <ThumbFrame>
      <svg width={W} height={H} style={{ display: 'block' }}>
        {spd.map((v, i) => {
          const peak = (i >= 7 && i <= 9) || (i >= 16 && i <= 19);
          const bh = h(v);
          return <rect key={i} x={2 + i * bw + 0.4} width={bw - 0.8} y={H - padB - bh} height={bh}
            rx="0.6" fill={peak ? BPI.bad : BPI.ink20} />;
        })}
      </svg>
    </ThumbFrame>
  );
}

// 6 ── Projection → ascending scenario bars approaching a target line.
function PreviewProjection() {
  const bars = [
    { v: 0.46, c: BPI.ink40 },
    { v: 0.60, c: BPI.warn },
    { v: 0.74, c: BPI.warn },
    { v: 0.95, c: BPI.good },
  ];
  return (
    <ThumbFrame>
      <div style={{ width: 76, height: 30, position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 5 }}>
        {bars.map((b, i) => (
          <div key={i} style={{ flex: 1, height: `${b.v * 100}%`, background: b.c, borderRadius: '1.5px 1.5px 0 0' }} />
        ))}
        <div style={{ position: 'absolute', right: 0, top: -2, bottom: -2, width: 1.5, background: BPI.accent }} />
      </div>
    </ThumbFrame>
  );
}

// Canonical corpus options — shared by the composer palette and the
// specimen. `best` marks AI's write-ahead pre-selection for the cursor.
const CORPUS_OPTIONS = [
  { kind: 'SEGMENT CARD', label: 'Madison Av · 28→58 St', src: 'MTA Bus Speeds · 2.4M rows', preview: <PreviewSegment />, best: true },
  { kind: 'HOUR PATTERN', label: 'Madison Av — speed by hour of day', src: 'MTA Bus Speeds · weekday median', preview: <PreviewHourPattern /> },
  { kind: 'BEFORE / AFTER', label: 'ACE all-day on this corridor', src: 'ACE program · 60-day windows', preview: <PreviewBeforeAfter /> },
  { kind: 'TRACE NUMBER', label: '43% — Madison share of route delay', src: 'computed · lineage in 4 steps', preview: <PreviewLineage /> },
  { kind: 'FINDING', label: '“The priority stack isn’t working”', src: 'Findings · confidence 82%', preview: <PreviewFinding /> },
  { kind: 'PROJECTION', label: 'Recovery scenarios for the segment', src: 'studio model · vs pre-decline', preview: <PreviewProjection /> },
];

// The reusable palette. `compact` trims to the first N rows for the inline
// composer; the specimen shows them all.
function CorpusPalette({ query = 'madison', width = 580, options = CORPUS_OPTIONS, max }) {
  const rows = max ? options.slice(0, max) : options;
  return (
    <div style={{
      width, background: BPI.cardRaised, borderRadius: 8,
      boxShadow: `0 22px 56px rgba(22,20,15,.26), inset 0 0 0 1px ${BPI.rule}`,
      overflow: 'hidden',
    }}>
      {/* Search header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 11, padding: '14px 18px',
        boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
      }}>
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke={BPI.accent} strokeWidth="1.9">
          <circle cx="8" cy="8" r="5.5" /><path d="M12.5 12.5L16 16" strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: 14.5, color: BPI.ink, fontWeight: 500 }}>{query}</span>
        <span className="av2-caret" style={{ height: '1.05em' }} />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10.5, color: BPI.ink40, fontFamily: BPIMono, letterSpacing: '0.04em' }}>insert from the corpus</span>
      </div>

      {/* Rows */}
      <div style={{ padding: '6px 0' }}>
        {rows.map((o, i) => {
          const sel = o.best;
          return (
            <div key={i} className="av2-summon-row" style={{
              display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'center',
              padding: '10px 18px',
              background: sel ? BPI.accentBg : 'transparent',
              boxShadow: sel ? `inset 2px 0 0 ${BPI.accent}` : 'none',
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{
                    fontFamily: BPIMono, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                    color: sel ? BPI.accent : BPI.ink55,
                  }}>{o.kind}</span>
                  {o.best && (
                    <span style={{
                      fontFamily: BPIMono, fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
                      color: BPI.accent, background: BPI.card, border: `1px solid ${BPI.accent}`,
                      padding: '1px 5px', borderRadius: 2,
                    }}>◆ BEST MATCH</span>
                  )}
                </div>
                <div style={{
                  fontSize: 13.5, fontWeight: 600, color: BPI.ink, letterSpacing: '-0.005em', lineHeight: 1.3,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{o.label}</div>
                <div style={{ fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono, marginTop: 3 }}>{o.src}</div>
              </div>
              {o.preview}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '10px 18px',
        background: BPI.paperDeep, boxShadow: `inset 0 1px 0 ${BPI.rule}`,
        fontFamily: BPIMono, fontSize: 10, color: BPI.ink55,
      }}>
        <span><b style={{ color: BPI.ink70 }}>⏎</b> take the match</span>
        <span><b style={{ color: BPI.ink70 }}>↑↓</b> pick another</span>
        <span><b style={{ color: BPI.ink70 }}>type</b> to filter</span>
        <span><b style={{ color: BPI.ink70 }}>esc</b> keep writing</span>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// RF_CorpusPalette — specimen: the palette at full height + a labeled
// catalog of the preview primitives, so the craft can be reviewed.
// ═════════════════════════════════════════════════════════════════════════
function RF_CorpusPalette() {
  const catalog = [
    { name: 'Segment card', node: <PreviewSegment />, note: 'Observed speed line against a dashed scheduled baseline, end-point marked.' },
    { name: 'Hour pattern', node: <PreviewHourPattern />, note: '24-bar day profile; AM and PM peak hours marked in red.' },
    { name: 'Before / after', node: <PreviewBeforeAfter />, note: 'Two bars on a shared axis; the tick marks the prior value.' },
    { name: 'Trace number', node: <PreviewLineage />, note: 'ƒ-source → ops → result: the derivation, in miniature.' },
    { name: 'Finding', node: <PreviewFinding />, note: 'Dark chip echoing the figure, with its confidence micro-bar.' },
    { name: 'Projection', node: <PreviewProjection />, note: 'Scenario bars climbing toward the accent target line.' },
  ];
  return (
    <div className="bpi" style={{ width: 1320, minHeight: 880, background: BPI.paper, display: 'flex', flexDirection: 'column' }}>
      <StudioBar active="Briefs" breadcrumb="Briefs / composer · insert-from-corpus" />
      <div style={{ padding: '40px 56px 24px', boxShadow: `inset 0 -1px 0 ${BPI.rule}`, background: BPI.card }}>
        <div className="eyebrow" style={{ letterSpacing: '0.12em', textTransform: 'uppercase', color: BPI.ink55, marginBottom: 12 }}>
          The unified AI surface
        </div>
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.12, color: BPI.ink, maxWidth: 820, textWrap: 'balance' }}>
          Insert from the corpus.
        </h1>
        <div style={{ fontSize: 15, color: BPI.ink70, marginTop: 16, maxWidth: 720, lineHeight: 1.55, textWrap: 'pretty' }}>
          One surface does the work of the old evidence inspector and the write-ahead proposer.
          AI pre-selects its best match for what you're writing; every row is a live, crafted preview
          of the real figure it will stream in. No shelf — the evidence is self-evident once it's on the page.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '620px 1fr', gap: 48, padding: '40px 56px 56px', alignItems: 'start' }}>
        {/* The palette, full */}
        <div>
          <div className="eyebrow" style={{ marginBottom: 14 }}>The palette</div>
          <CorpusPalette width={620} />
        </div>

        {/* Catalog of preview primitives */}
        <div>
          <div className="eyebrow" style={{ marginBottom: 14 }}>Preview primitives — crafted, not glyphs</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, background: BPI.card, borderRadius: 4, boxShadow: `inset 0 0 0 1px ${BPI.rule}`, overflow: 'hidden' }}>
            {catalog.map((c, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 18, alignItems: 'center',
                padding: '16px 20px',
                boxShadow: i < catalog.length - 1 ? `inset 0 -1px 0 ${BPI.rule}` : 'none',
              }}>
                {c.node}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.008em', color: BPI.ink }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: BPI.ink55, marginTop: 3, lineHeight: 1.45 }}>{c.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── BriefInsertPreview — the hero "where it lands" preview for the
// "Send to brief" sheet. A document thumbnail of the chosen brief with the
// captured segment shown inserted at its slot (accent). One confident
// preview on the right of the sheet — not a row of tiny repeats.
function BriefInsertPreview({ variant = 'matched' }) {
  const bar = (w, h, c, k) => <div key={k} style={{ width: w, height: h, borderRadius: 1.5, background: c, flexShrink: 0 }} />;
  const fig = (k) => <div key={k} style={{ height: 20, borderRadius: 2, background: BPI.paperDeep, boxShadow: `inset 0 0 0 1px ${BPI.rule}`, flexShrink: 0 }} />;
  const ghost = (k) => <div key={k} style={{ height: 14, borderRadius: 2, border: `1px dashed ${BPI.ink20}`, flexShrink: 0 }} />;

  // Full-width trend for the inserted figure.
  const TW = 300, TH = 30, tpx = 2, tpt = 4, tpb = 5, tlo = 4.9, thi = 7.8, tsched = 7.4;
  const tx = (i) => tpx + i * ((TW - 2 * tpx) / (AV2_MADISON_SPARK.length - 1));
  const ty = (v) => tpt + (1 - (v - tlo) / (thi - tlo)) * (TH - tpt - tpb);
  const tline = AV2_MADISON_SPARK.map((v, i) => (i ? 'L' : 'M') + tx(i).toFixed(1) + ',' + ty(v).toFixed(1)).join(' ');
  const tarea = tline + ` L${tx(AV2_MADISON_SPARK.length - 1).toFixed(1)},${TH - tpb} L${tx(0).toFixed(1)},${TH - tpb} Z`;

  // The captured segment, rendered as the inserted figure.
  const insert = (
    <div key="ins" style={{
      background: BPI.accentBg, border: `1px solid ${BPI.accent}`,
      borderRadius: 3, padding: '9px 11px', flexShrink: 0,
      boxShadow: `0 4px 12px rgba(22,20,15,.10)`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{
          height: 13, padding: '0 4px', borderRadius: 2, background: BPI.bx.manhattan,
          color: '#fff', fontSize: 7.5, fontWeight: 700, fontFamily: BPIFonts,
          display: 'inline-flex', alignItems: 'center',
        }}>M15</span>
        <span style={{ fontSize: 9.5, fontWeight: 600, color: BPI.ink }}>Madison Av · 28→58 St</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: BPIMono, fontSize: 7.5, fontWeight: 700, color: BPI.accent }}>◆ NEW</span>
      </div>
      <svg viewBox={`0 0 ${TW} ${TH}`} preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: TH }}>
        <line x1={tpx} x2={TW - tpx} y1={ty(tsched)} y2={ty(tsched)} stroke={BPI.ink40} strokeDasharray="3 2.5" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d={tarea} fill={BPI.bad} opacity="0.12" />
        <path d={tline} fill="none" stroke={BPI.bad} strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={tx(AV2_MADISON_SPARK.length - 1)} cy={ty(AV2_MADISON_SPARK[AV2_MADISON_SPARK.length - 1])} r="2.6" fill={BPI.bad} />
      </svg>
    </div>
  );

  let blocks;
  if (variant === 'new') {
    blocks = [
      bar('64%', 6, BPI.accent, 't'),
      bar('40%', 3.5, BPI.ink20, 's'),
      <div key="sp" style={{ height: 4 }} />,
      insert,
      ghost('g1'), ghost('g2'), ghost('g3'),
    ];
  } else if (variant === 'existing') {
    blocks = [
      bar('58%', 6, BPI.ink, 't'),
      bar('36%', 3.5, BPI.ink20, 's'),
      fig(1), fig(2),
      insert,
    ];
  } else { // matched — lands in §2
    blocks = [
      bar('58%', 6, BPI.ink, 't'),
      bar('36%', 3.5, BPI.ink20, 's'),
      bar('22%', 4, BPI.ink40, 'h1'),
      bar('100%', 3, BPI.ink20, 'x1'),
      fig(1),
      bar('28%', 4, BPI.accent, 'h2'),
      insert,
      bar('80%', 3, BPI.ink20, 'x2'),
    ];
  }
  return (
    <div style={{
      background: BPI.card, borderRadius: 5,
      boxShadow: `inset 0 0 0 1px ${BPI.rule}, 0 2px 6px rgba(22,20,15,.06)`,
      padding: 18, height: 300, overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 9,
    }}>{blocks}</div>
  );
}

Object.assign(window, {
  ThumbFrame,
  PreviewSegment, PreviewBeforeAfter, PreviewLineage,
  PreviewFinding, PreviewHourPattern, PreviewProjection,
  BriefInsertPreview,
  CORPUS_OPTIONS, CorpusPalette, RF_CorpusPalette,
});
