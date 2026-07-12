// authoring-v2.jsx — Briefs · Authoring, redesigned.
//
// ─────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS  (reasoning for the manager)
// ─────────────────────────────────────────────────────────────────────────
// The v1 flow had two screens we're retiring:
//
//   • RF_Annotate  — seeded a claim from a dark popover on the OLD route
//                    detail page. The route page has since been rebuilt
//                    (tabbed, featured slow-segment cards). And forcing
//                    "public page → brief" as the only on-ramp was wrong:
//                    analysts capture evidence from everywhere.
//   • RF_Authoring — a 3-rail composer (outline · editor · evidence
//                    inspector) carrying every banned pattern we have:
//                    strength bars, "3 evidence · 2 caveats" counts,
//                    "drag to reorder", tabbed inspectors, ugly rails.
//
// New thesis, in the user's words: "AI works magically for you — not
// through a chat interface, but through purposeful, perfect design. It
// streams the brief primitives we already have, drawing on the entire
// data corpus."
//
// So the redesign is built on two moves:
//
//   1. CAPTURE FROM ANYWHERE  (RF_SendToBrief)
//      One affordance — "Send to brief" — lives on every object in the
//      studio (slow-segment cards, findings, metrics, charts). It opens a
//      calm sheet that previews exactly what will be inserted and lets AI
//      route it to a new or existing brief at the right place. No dark
//      popover, no "claim seeds", no scoring.
//
//   2. THE BRIEF WRITES WITH YOU  (RF_ComposeBrief — resolved direction)
//      The composer IS the reading view. You write prose in the published
//      shape; AI — having already read the corpus — recognises the claim
//      and STREAMS the matching primitive in as a real figure. The seam is
//      nearly invisible: a quiet ◆ in the gutter, a ghosted proposal you
//      accept with ⏎, a figure that materialises from the data.
//
//      Two alternates explore the same thesis from other angles
//      (authoring-v2-alts.jsx): ASSEMBLE (evidence-first → AI drafts the
//      narrative) and SUMMON (a rich, data-aware insertion palette at the
//      cursor). All three stream the same primitives. None is a chatbox.
//
// Banned and absent here: StrengthBars, evidence/caveat counts, "drag to
// reorder", tabbed evidence inspectors. Rigor is preserved as prose +
// quiet inline marks (lineage figures, caveat notes), never as a score.
// ─────────────────────────────────────────────────────────────────────────

const AV2_W = 1320;

// Shared corpus sample — the Madison-corridor brief, matching RF_BriefRich.
const AV2_MADISON_SPARK = [7.6, 7.4, 7.1, 6.9, 6.8, 6.7, 6.4, 6.2, 6.1, 5.9, 5.8, 5.6, 5.4, 5.2];

// ── One-time CSS: caret blink, streaming sweep, settle-in rise ───────────
if (typeof document !== 'undefined' && !document.getElementById('av2-styles')) {
  const s = document.createElement('style');
  s.id = 'av2-styles';
  s.textContent = `
    @keyframes av2-caret { 0%, 48% { opacity: 1; } 50%, 100% { opacity: 0; } }
    @keyframes av2-sweep {
      0%   { transform: translateX(-60%); }
      100% { transform: translateX(160%); }
    }
    @keyframes av2-rise {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: none; }
    }
    @keyframes av2-pulse {
      0%, 100% { opacity: 1; }
      50%      { opacity: .35; }
    }
    .av2-caret {
      display: inline-block; width: 2px; height: 1.05em;
      background: ${BPI.accent}; vertical-align: -0.16em;
      margin-left: 1px; border-radius: 1px;
      animation: av2-caret 1.05s steps(1) infinite;
    }
    .av2-pulse-dot { animation: av2-pulse 1.6s ease-in-out infinite; }
    .av2-rise { animation: av2-rise .5s cubic-bezier(.2,.7,.3,1) both; }
    .av2-stream-wrap { position: relative; overflow: hidden; border-radius: 4px; }
    .av2-stream-wrap > .av2-sweep {
      position: absolute; inset: 0; pointer-events: none; z-index: 3;
      background: linear-gradient(100deg,
        transparent 0%, transparent 38%,
        ${'rgba(244,241,234,.0)'} 42%,
        rgba(255,255,255,.62) 50%,
        ${'rgba(244,241,234,.0)'} 58%,
        transparent 62%, transparent 100%);
      animation: av2-sweep 1.5s ease-in-out infinite;
    }
    .av2-summon-row { cursor: pointer; transition: background .1s; }
    .av2-summon-row:hover { background: ${BPI.ink06}; }
  `;
  document.head.appendChild(s);
}

// ── Blinking text caret ──────────────────────────────────────────────────
function Caret() {
  return <span className="av2-caret" aria-hidden="true" />;
}

// ── A live "AI is reading the corpus" status pill for the composer bar ───
function CorpusStatus({ label = 'reading corpus', count = '6 datasets' }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      padding: '5px 10px', borderRadius: 13,
      background: BPI.accentBg, color: BPI.accent,
      fontFamily: BPIMono, fontSize: 10.5, fontWeight: 700,
      letterSpacing: '0.04em',
    }}>
      <span className="av2-pulse-dot" style={{ fontSize: 11, lineHeight: 1 }}>◆</span>
      {label}
      <span style={{ color: BPI.ink40, fontWeight: 500 }}>· {count}</span>
    </span>
  );
}

// ── Shared composer chrome: StudioBar + a quiet brief-title sub-bar ───────
// Replaces the v1 sub-bar that carried a "DRAFT v0.4 · auto-saved" stack and
// a "Send for review" button crammed together. Calmer, single line.
function ComposerTopBar({ breadcrumb, title, saved = 'saved just now', tools, status, action }) {
  return (
    <React.Fragment>
      <StudioBar active="Briefs" breadcrumb={breadcrumb} />
      <div style={{
        padding: '13px 28px', background: BPI.card,
        boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <RouteBadge route="M15" sbs size="md" />
        <div style={{ fontSize: 16.5, fontWeight: 600, letterSpacing: '-0.012em' }}>{title}</div>
        <span style={{
          fontFamily: BPIMono, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
          color: BPI.ink55, background: BPI.ink06, padding: '3px 7px', borderRadius: 2,
        }}>DRAFT</span>
        <span style={{ fontSize: 11, color: BPI.ink40, fontFamily: BPIMono }}>{saved}</span>
        {tools && (
          <React.Fragment>
            <span style={{ width: 1, height: 22, background: BPI.rule }} />
            {tools}
          </React.Fragment>
        )}
        <div style={{ flex: 1 }} />
        {status}
        {action}
      </div>
    </React.Fragment>
  );
}

// ── A left-gutter AI mark — a quiet ◆ that pins AI activity to a block ────
function GutterMark({ tone = 'accent', top = 2 }) {
  const color = tone === 'accent' ? BPI.accent : BPI.ink40;
  return (
    <span style={{
      position: 'absolute', left: -34, top,
      color, fontSize: 11, lineHeight: 1,
      display: 'inline-flex', alignItems: 'center', gap: 0,
    }}>◆</span>
  );
}

// ── Editorial block with optional gutter mark ────────────────────────────
function Block({ mark, markTone, children, style }) {
  return (
    <div style={{ position: 'relative', ...style }}>
      {mark && <GutterMark tone={markTone} />}
      {children}
    </div>
  );
}

// ── A figure mid-stream: real primitive, dimmed, with a sweeping shimmer ──
function StreamingFigure({ source, children }) {
  return (
    <Block mark>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
        fontFamily: BPIMono, fontSize: 10.5, fontWeight: 700,
        color: BPI.accent, letterSpacing: '0.04em',
      }}>
        <span className="av2-pulse-dot">◆</span>
        composing figure
        <span style={{ color: BPI.ink40, fontWeight: 500 }}>· {source}</span>
      </div>
      <div className="av2-stream-wrap" style={{ opacity: 0.62 }}>
        <div className="av2-sweep" />
        <div style={{ pointerEvents: 'none' }}>{children}</div>
      </div>
    </Block>
  );
}

// ── Direct text editing: a selected phrase + a floating format/AI bar ────
// Proves "you write and edit it yourself" — the document is real text, not
// a read-only render. The contextual ◆ action lets AI act on a selection
// (e.g. trace a number, tighten a sentence) without leaving the prose.
function SelectedText({ children }) {
  return (
    <span style={{ position: 'relative', background: 'oklch(0.42 0.13 252 / 0.20)', borderRadius: 2, padding: '0 1px' }}>
      <span style={{
        position: 'absolute', bottom: 'calc(100% + 8px)', left: -2,
        display: 'flex', alignItems: 'center', gap: 2,
        background: BPI.cardRaised, borderRadius: 6, padding: 4,
        boxShadow: `0 10px 28px rgba(22,20,15,.24), inset 0 0 0 1px ${BPI.rule}`,
        whiteSpace: 'nowrap', zIndex: 4,
      }}>
        {[['B', { fontWeight: 800 }], ['I', { fontStyle: 'italic' }]].map(([g, st], i) => (
          <span key={i} style={{
            width: 26, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, color: BPI.ink70, borderRadius: 3, cursor: 'pointer', ...st,
          }}>{g}</span>
        ))}
        <span style={{ width: 26, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke={BPI.ink70} strokeWidth="1.6">
            <path d="M7.5 10.5a3 3 0 0 0 4.2 0l2.3-2.3a3 3 0 0 0-4.2-4.2l-1 1" strokeLinecap="round" />
            <path d="M10.5 7.5a3 3 0 0 0-4.2 0L4 9.8a3 3 0 0 0 4.2 4.2l1-1" strokeLinecap="round" />
          </svg>
        </span>
        <span style={{ width: 1, height: 16, background: BPI.rule, margin: '0 3px' }} />
        <span style={{
          height: 24, display: 'flex', alignItems: 'center', gap: 5, padding: '0 9px',
          fontSize: 11.5, fontWeight: 600, color: BPI.accent, borderRadius: 3, cursor: 'pointer',
        }}>
          <span style={{ fontSize: 10 }}>◆</span> Trace this number
        </span>
        {/* pointer */}
        <span style={{
          position: 'absolute', top: '100%', left: 18, width: 0, height: 0,
          borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
          borderTop: `5px solid ${BPI.cardRaised}`,
        }} />
      </span>
      {children}
    </span>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// SCREEN 1 — RF_SendToBrief  (universal capture, replaces RF_Annotate)
// ═════════════════════════════════════════════════════════════════════════
function RF_SendToBrief() {
  // Dimmed backdrop = the CURRENT route detail (Slow segments tab), so the
  // capture clearly originates from a real object, not a bespoke page.
  const seg = {
    dir: 'NB', from: 'Madison Av / E 28 St', to: 'Madison Av / E 58 St',
    mph: 5.2, sched: 7.4, rh: 18420,
  };
  const [dest, setDest] = React.useState('b023');
  const chosen = AV2_DESTS.find((d) => d.id === dest);
  return (
    <div className="bpi" style={{ width: AV2_W, minHeight: 880, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* ── Backdrop: route detail, dimmed ───────────────────────────── */}
      <div style={{ filter: 'saturate(0.9)', pointerEvents: 'none' }}>
        <StudioBar active="Routes" breadcrumb="Routes / M15 +SBS / Slow segments" />
        <div style={{ padding: '24px 28px 40px' }}>
          <H title="The three segments dragging this route down"
             sub="Ranked by rider-hours lost per weekday. Hit “Send to brief” on any card to capture it." />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
            {[
              { rank: 1, ...seg, active: true },
              { rank: 2, dir: 'SB', from: '2 Av / E 60 St', to: '2 Av / E 42 St', mph: 5.2, sched: 7.8, rh: 12880 },
              { rank: 3, dir: 'NB', from: '1 Av / E 14 St', to: '1 Av / E 34 St', mph: 4.9, sched: 7.6, rh: 14110 },
            ].map((s) => (
              <CaptureSourceCard key={s.rank} seg={s} active={s.active} />
            ))}
          </div>
        </div>
      </div>

      {/* Scrim */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(22,20,15,.34)', zIndex: 5 }} />

      {/* ── The capture sheet ─────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', zIndex: 6,
        top: 96, left: '50%', transform: 'translateX(-50%)',
        width: 520, background: BPI.cardRaised, borderRadius: 7,
        boxShadow: '0 24px 64px rgba(22,20,15,.32), 0 2px 0 rgba(22,20,15,.04)',
        overflow: 'hidden',
      }}>
        {/* Header — the captured object is the subject of the sheet */}
        <div style={{ padding: '17px 24px 16px', boxShadow: `inset 0 -1px 0 ${BPI.rule}` }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 13 }}>
            <span className="eyebrow" style={{ letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: 10.5, color: BPI.ink55 }}>
              Send to brief
            </span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 16, color: BPI.ink40, cursor: 'pointer', lineHeight: 1 }}>×</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <RouteBadge route="M15" sbs size="md" />
            <DirIndicator dir={seg.dir} />
            <span style={{ fontSize: 16.5, fontWeight: 600, letterSpacing: '-0.012em' }}>
              {seg.from} <span style={{ color: BPI.ink40 }}>→</span> {seg.to}
            </span>
            <span style={{ flex: 1 }} />
            <Spark data={AV2_MADISON_SPARK} width={88} height={28} color={BPI.bad} />
            <span className="num" style={{ fontSize: 20, fontWeight: 600, color: BPI.bad, letterSpacing: '-0.02em' }}>
              5.2<span style={{ fontSize: 11, color: BPI.ink55, marginLeft: 3, fontWeight: 500 }}>mph</span>
            </span>
          </div>
        </div>

        {/* Body — choose a destination. Real radio selection: click a row to
            move the target. "Where it lands" is the accent, not a glyph. */}
        <div style={{ padding: '16px 16px 18px' }}>
          <div className="eyebrow" style={{ margin: '0 6px 8px', color: BPI.ink55 }}>Add to</div>
          <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column' }}>
            {AV2_DESTS.map((d) => (
              <DestRow key={d.id} dest={d} selected={dest === d.id} onSelect={() => setDest(d.id)} />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '13px 24px', background: BPI.card,
          boxShadow: `inset 0 1px 0 ${BPI.rule}`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 10.5, color: BPI.ink40, lineHeight: 1.4, flex: 1 }}>
            Also on findings, metrics, and charts across the studio.
          </span>
          <Button variant="ghost" size="md">Cancel</Button>
          <Button variant="primary" size="md">
            {chosen && chosen.isNew ? 'Create brief →' : `Add to ${chosen ? chosen.title : 'brief'} →`}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Backdrop slow-segment card (compact echo of the route-detail featured card).
function CaptureSourceCard({ seg, active }) {
  const tone = seg.mph < 5 ? BPI.bad : seg.mph < 6 ? BPI.warn : BPI.ink;
  return (
    <div style={{
      background: BPI.card, borderRadius: 3,
      boxShadow: active ? `0 0 0 2px ${BPI.accent}` : `0 0 0 1px ${BPI.rule}`,
      display: 'grid', gridTemplateColumns: '44px 1fr', overflow: 'hidden',
    }}>
      <div style={{
        background: seg.rank === 1 ? BPI.bad : seg.rank === 2 ? BPI.warn : BPI.ink70,
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: BPIMono, fontWeight: 700, fontSize: 16,
      }}>{String(seg.rank).padStart(2, '0')}</div>
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 3 }}>
            <DirIndicator dir={seg.dir} />
            <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>
              {seg.from} <span style={{ color: BPI.ink40 }}>→</span> {seg.to}
            </span>
          </div>
          <div style={{ fontSize: 11, color: BPI.ink55, fontFamily: BPIMono }}>
            weekday avg · Mar 2026
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="num" style={{ fontSize: 24, fontWeight: 600, color: tone, letterSpacing: '-0.02em', lineHeight: 1 }}>
            {seg.mph.toFixed(1)}<span style={{ fontSize: 12, color: BPI.ink55, marginLeft: 3 }}>mph</span>
          </div>
        </div>
        <div className="num" style={{ fontSize: 15, fontWeight: 600, textAlign: 'right', width: 64 }}>
          {(seg.rh / 1000).toFixed(1)}K
        </div>
        <span style={{
          fontSize: 12, fontWeight: 600,
          color: active ? BPI.accent : BPI.ink55,
          display: 'inline-flex', alignItems: 'center', gap: 5,
          whiteSpace: 'nowrap',
        }}>
          {active && <span>◆</span>}
          Send to brief →
        </span>
      </div>
    </div>
  );
}

// Destination data for the Send-to-brief sheet.
const AV2_DESTS = [
  { id: 'b023', title: 'Brief 023', sub: 'M15 SBS — fifteen years in', segs: 4, recommended: true },
  { id: 'b019', title: 'Brief 019', sub: 'East Side speed decline, 2024–26', segs: 2 },
  { id: 'new', title: 'New brief', suggestion: 'The Madison corridor problem', isNew: true },
];

// A destination row — a real, clickable radio item. Hover lifts the row;
// selection fills it with the accent wash and ring. No thumbnail glyph —
// "where it lands" is the selection itself.
function DestRow({ dest, selected, onSelect }) {
  const [hover, setHover] = React.useState(false);
  const { title, sub, suggestion, recommended, isNew } = dest;
  const bg = selected ? BPI.accentBg : hover ? BPI.paperDeep : 'transparent';
  const ring = selected ? `inset 0 0 0 1.5px ${BPI.accent}`
    : hover ? `inset 0 0 0 1px ${BPI.ink20}`
    : `inset 0 0 0 1px ${BPI.rule}`;
  return (
    <div
      role="radio" aria-checked={selected} tabIndex={0}
      onClick={onSelect}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 13,
        padding: '13px 14px', marginBottom: 7, borderRadius: 6,
        background: bg, boxShadow: ring, cursor: 'pointer',
        transition: 'background .14s ease, box-shadow .14s ease',
      }}
    >
      {/* selector — radio for existing briefs, a + for a new one */}
      {isNew ? (
        <span style={{
          width: 18, height: 18, borderRadius: 9, flexShrink: 0,
          border: `1.5px ${selected ? 'solid' : 'dashed'} ${selected ? BPI.accent : BPI.ink40}`,
          color: selected ? BPI.accent : BPI.ink55,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 500, lineHeight: 1,
        }}>+</span>
      ) : (
        <span style={{
          width: 18, height: 18, borderRadius: 9, flexShrink: 0,
          border: `1.5px solid ${selected ? BPI.accent : BPI.ink20}`,
          background: selected ? BPI.accent : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'border-color .14s ease, background .14s ease',
        }}>
          {selected && <span style={{ width: 6, height: 6, borderRadius: 3, background: '#fff' }} />}
        </span>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.006em' }}>{title}</span>
          {recommended && (
            <span style={{
              fontFamily: BPIMono, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.08em',
              color: BPI.accent, background: BPI.card, border: `1px solid ${BPI.accent}`,
              padding: '1px 5px', borderRadius: 2,
            }}>◆ AI MATCH</span>
          )}
        </div>
        {sub && <div style={{ fontSize: 12, color: BPI.ink55, marginTop: 2, lineHeight: 1.35 }}>{sub}</div>}
        {suggestion && (
          <div style={{ fontSize: 12, color: selected ? BPI.accent : BPI.ink55, fontWeight: selected ? 600 : 500, marginTop: 2, lineHeight: 1.35, transition: 'color .14s ease' }}>
            “{suggestion}”
          </div>
        )}
      </div>

      {/* trailing meta — segment count for existing briefs, quiet */}
      {!isNew && (
        <span style={{ fontFamily: BPIMono, fontSize: 10.5, color: BPI.ink40, whiteSpace: 'nowrap' }}>
          {dest.segs} seg{dest.segs === 1 ? '' : 's'}
        </span>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// SCREEN 2 — RF_ComposeBrief  (RESOLVED · combines A + B + C)
// "The brief writes with you." You edit real text directly; AI streams the
// matching primitives in; one unified surface — "insert from the corpus" —
// proposes its best match as you write (write-ahead) and is also summonable
// on demand. No evidence shelf: the evidence is the figures on the page.
// ═════════════════════════════════════════════════════════════════════════
function RF_ComposeBrief() {
  // The active paragraph is real, editable text — so undo/redo operates on it.
  // Seeded with one step in the past (the sentence before the last clause was
  // typed) so undo is live immediately; redo restores it.
  const PARA_FULL = 'The hour-by-hour pattern makes the shape of the problem visible: speeds collapse around 9\u00A0AM and stay below scheduled pace straight through the evening rush. Worth seeing in full —';
  const PARA_PREV = 'The hour-by-hour pattern makes the shape of the problem visible: speeds collapse around 9\u00A0AM and stay below scheduled pace straight through the evening rush.';
  const edit = useHistory(PARA_FULL, [PARA_PREV]);

  return (
    <div className="bpi" style={{ width: AV2_W, minHeight: 880, background: BPI.paper, display: 'flex', flexDirection: 'column' }}>
      <ComposerTopBar
        breadcrumb="Briefs / Brief 023 · composing"
        title="When the priority stack stops working"
        tools={<ChromeUndoRedo canUndo={edit.canUndo} canRedo={edit.canRedo} onUndo={edit.undo} onRedo={edit.redo} />}
        status={<CorpusStatus />}
        action={<div style={{ display: 'flex', alignItems: 'center', gap: 11, marginLeft: 14 }}>
          <BriefPeople variant="share" people={[
            { k: 'JL', access: 'Owner', you: true },
            { k: 'CP', access: 'Can edit' },
            { k: 'SR', access: 'Can comment' },
          ]} />
          <span style={{ width: 1, height: 22, background: BPI.rule }} />
          <Button variant="secondary" size="sm">Preview</Button>
          <Button variant="primary" size="sm">Send for review →</Button>
        </div>}
      />

      {/* Editorial column — the brief, in its published shape, fully editable. */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '52px 28px 64px' }}>
        <article style={{ width: 780, maxWidth: '100%', paddingLeft: 44, position: 'relative' }}>

          {/* Section heading */}
          <h2 style={{
            margin: '0 0 14px', fontSize: 23, fontWeight: 600,
            letterSpacing: '-0.018em', color: BPI.ink, textWrap: 'balance', lineHeight: 1.18,
          }}>
            02 · Three corridors do most of the damage.
          </h2>

          {/* Written paragraph — with a live text selection + editing toolbar */}
          <p style={{ fontSize: 16, lineHeight: 1.72, color: BPI.ink70, textWrap: 'pretty', margin: '0 0 4px' }}>
            Of the thirteen timepoint-to-timepoint segments the route traverses, three account for{' '}
            <InlineMetric value="53" unit="%" tone="warn" /> of measured rider-hours of delay every weekday.
            The worst of the three runs up Madison Avenue — and it is also{' '}
            <SelectedText>the slowest 1.5 miles of any Select Bus route in the city</SelectedText>.
          </p>

          {/* A figure currently materialising from the corpus */}
          <StreamingFigure source="MTA Bus Speeds · 2.4M rows">
            <EmbedSegmentCard
              route="M15" sbs dir="NB"
              from="Madison Av / E 28 St" to="Madison Av / E 58 St"
              mph={5.2} sched={7.4}
              spark={AV2_MADISON_SPARK}
              lane="partial" ace tsp={false}
              riderHours={18420}
              note="Slowest 1.5 miles of any Select Bus route in the city. Painted lane only — no concrete buffer."
            />
          </StreamingFigure>

          {/* Active paragraph being typed — caret + gutter mark. Its text is
              the undo/redo subject. */}
          <Block mark style={{ marginTop: 22 }}>
            <p style={{ fontSize: 16, lineHeight: 1.72, color: BPI.ink70, textWrap: 'pretty', margin: 0 }}>
              {edit.state}<Caret />
            </p>
          </Block>

          {/* The unified AI surface, open at the cursor with AI's best match preselected */}
          <div style={{ position: 'relative', marginTop: 14 }}>
            {/* connector from the caret line into the palette */}
            <div style={{ position: 'absolute', left: -34, top: 2 }}>
              <GutterMark />
            </div>
            <div className="av2-rise">
              <CorpusPalette width={560} query="madison" />
            </div>
          </div>

          {/* Continuation, faded to imply the rest of the brief */}
          <div style={{ opacity: 0.4, marginTop: 30, pointerEvents: 'none' }}>
            <h2 style={{
              margin: '0 0 14px', fontSize: 23, fontWeight: 600,
              letterSpacing: '-0.018em', color: BPI.ink, lineHeight: 1.18,
            }}>
              03 · Where the toolkit is densest, the slowdown is steepest.
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.72, color: BPI.ink70, margin: 0 }}>
              The intuition behind New York's bus-priority program is additive. Every layer — bus lane,
              ACE enforcement, signal priority — should compound the gain. On the M15 it does not.
            </p>
          </div>

        </article>
      </div>

      {/* Footnote explaining the converged interaction, for the canvas reader */}
      <div style={{
        padding: '12px 28px', background: BPI.card,
        boxShadow: `inset 0 1px 0 ${BPI.rule}`,
        fontSize: 11.5, color: BPI.ink55, display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ color: BPI.accent }}>◆</span>
        You write and edit the prose directly (select any text to format it or ask AI to act on it). As you write,
        the corpus surface proposes its best-matching figure — <kbd style={{ fontFamily: BPIMono, fontSize: 10.5, border: `1px solid ${BPI.ink20}`, borderRadius: 3, padding: '1px 5px' }}>⏎</kbd> takes it,
        or summon it any time to insert a specific figure. It streams in as a real primitive. Never a chat turn.
      </div>
    </div>
  );
}

Object.assign(window, {
  RF_SendToBrief, RF_ComposeBrief,
  // shared, for the corpus + (future) alt files
  ComposerTopBar, CorpusStatus, Caret, GutterMark, Block,
  StreamingFigure, SelectedText,
  AV2_MADISON_SPARK,
});
