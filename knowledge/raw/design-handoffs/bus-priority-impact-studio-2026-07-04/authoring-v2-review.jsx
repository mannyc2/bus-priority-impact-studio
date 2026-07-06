// authoring-v2-review.jsx — review & triage, downstream of authoring-v2.
//
// ─────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS
// ─────────────────────────────────────────────────────────────────────────
// The redesigned authoring flow makes a brief ONE editable editorial column:
// §-numbered prose, inline metrics, and figures that ARE the evidence. The
// old review/history screens (brief-lifecycle.jsx) predate that — they carry
// a 3-rail claims outline with StrengthBars and "3 ev · 2 cav" counts, all of
// which authoring-v2 retired. These two screens bring review into the same
// language:
//
//   RF_BriefReview2 — REVIEWER's view. The brief reads exactly as authored;
//                     comments pin to the prose in the right margin, expand
//                     into threads, and can be plain comments OR suggested
//                     edits. Approve / Request-changes workflow + reviewer
//                     assignment ("who still needs to look").
//
//   RF_BriefTriage  — AUTHOR's view of the same brief: incoming comments as a
//                     resolve queue. Accept a suggested edit and it lands in
//                     the prose; resolve a comment and it collapses; a quiet
//                     progress meter gates "Resubmit for review".
//
// Banned, as upstream: StrengthBars, evidence/caveat counts, claim scoring,
// "drag to reorder", tabbed inspectors. Rigor lives in the prose + figures.
// ─────────────────────────────────────────────────────────────────────────

const RV_W = 1320, RV_H = 880;

// People in play. state: reviewing | approved | requested-changes | (none = not yet assigned)
const RV_PEOPLE = {
  CP: { i: 'CP', name: 'C. Pherson', role: 'Sr. analyst' },
  SR: { i: 'SR', name: 'S. Rivera',  role: 'Data' },
  JL: { i: 'JL', name: 'J. Lim',     role: 'Author' },
  AO: { i: 'AO', name: 'A. Okafor',  role: 'Policy' },
  DT: { i: 'DT', name: 'D. Tran',    role: 'Planning' },
};

// ── Avatar with a state ring ─────────────────────────────────────────────
function RvAvatar({ p, size = 26, state }) {
  const ring = state === 'approved' ? BPI.good
    : state === 'requested-changes' ? BPI.bad
    : state === 'reviewing' ? BPI.warn
    : BPI.ink40;
  return (
    <div title={`${p.name}${state ? ' — ' + state.replace('-', ' ') : ''}`} style={{
      width: size, height: size, borderRadius: size / 2, flexShrink: 0,
      background: BPI.paper, color: BPI.ink,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, letterSpacing: '0.01em',
      boxShadow: `inset 0 0 0 1.5px ${ring}, 0 0 0 1.5px ${BPI.card}`,
    }}>{p.i}</div>
  );
}

// ── A tiny undo/redo history hook, shared by the editing surfaces. ───────
// Versioning, lightweight: no autosave-scrubber screen — just a real
// past/future stack the chrome's undo/redo buttons drive.
function useHistory(initial, seedPast = []) {
  const [h, setH] = React.useState({ past: seedPast, present: initial, future: [] });
  const set = (next) => setH((s) => ({ past: [...s.past, s.present], present: typeof next === 'function' ? next(s.present) : next, future: [] }));
  const undo = () => setH((s) => s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s);
  const redo = () => setH((s) => s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s);
  return { state: h.present, set, undo, redo, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}

// ── Undo / redo control for the editing chrome (composer + resolve). ─────
function ChromeUndoRedo({ canUndo, canRedo, onUndo, onRedo }) {
  const Btn = ({ on, can, d, title }) => (
    <button className="bpi" title={title} onClick={can ? on : undefined} disabled={!can} style={{
      width: 28, height: 28, borderRadius: 6, border: 'none', padding: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: can ? 'pointer' : 'default', background: 'transparent',
      color: can ? BPI.ink70 : BPI.ink20, transition: 'background .12s, color .12s',
    }}
      onMouseEnter={(e) => { if (can) e.currentTarget.style.background = BPI.ink06; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
    </button>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Btn on={onUndo} can={canUndo} title="Undo" d={<React.Fragment><path d="M6 4L2.5 7.5 6 11" /><path d="M2.5 7.5H10a3.5 3.5 0 0 1 0 7H7" /></React.Fragment>} />
      <Btn on={onRedo} can={canRedo} title="Redo" d={<React.Fragment><path d="M10 4l3.5 3.5L10 11" /><path d="M13.5 7.5H6a3.5 3.5 0 0 0 0 7h3" /></React.Fragment>} />
    </div>
  );
}

// ── People control — the avatar stack that opens a popover. Two variants:
//   review → reviewers + their state ("N of M reviewed") + assign suggestions.
//   share  → who has access, their access level, and an invite row (composer).
// Self-contained: owns its open state with a click-away backdrop, so it drops
// into any chrome. The component the manager liked, generalized. ───────────
function BriefPeople({ variant = 'review', people, linkAccess }) {
  const [open, setOpen] = React.useState(false);
  const done = variant === 'review'
    ? people.filter((a) => a.state === 'approved' || a.state === 'requested-changes').length : 0;
  return (
    <div style={{ position: 'relative' }}>
      <div onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} style={{
        display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer',
        padding: '5px 11px 5px 6px', borderRadius: 18,
        boxShadow: `inset 0 0 0 1px ${open ? BPI.ink40 : BPI.rule}`,
        background: open ? BPI.paper : 'transparent', transition: 'box-shadow .12s',
      }}>
        <div style={{ display: 'flex' }}>
          {people.slice(0, 4).map((a, i) => (
            <div key={a.k} style={{ marginLeft: i ? -7 : 0 }}>
              <RvAvatar p={RV_PEOPLE[a.k]} state={a.state} size={24} />
            </div>
          ))}
        </div>
        {variant === 'share' && (
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke={BPI.ink70} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="5" r="2.4" /><path d="M2 13c0-2.2 1.8-3.6 4-3.6" /><path d="M12 5.2v4.6M9.7 7.5h4.6" />
          </svg>
        )}
        <span style={{ fontSize: 11.5, color: variant === 'share' ? BPI.ink70 : BPI.ink55, fontFamily: variant === 'review' ? BPIMono : 'inherit', fontWeight: variant === 'share' ? 600 : 400, whiteSpace: 'nowrap' }}>
          {variant === 'review' ? `${done} of ${people.length} reviewed` : 'Share'}
        </span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke={BPI.ink40} strokeWidth="1.4"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .12s' }}>
          <path d="M2.5 4L5 6.5 7.5 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {open && (
        <React.Fragment>
          <div onClick={(e) => { e.stopPropagation(); setOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 25 }} />
          <div className="av2-rise" style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 30, width: 304,
            background: BPI.cardRaised, borderRadius: 8,
            boxShadow: `0 18px 44px rgba(22,20,15,.26), inset 0 0 0 1px ${BPI.rule}`, overflow: 'hidden',
          }} onClick={(e) => e.stopPropagation()}>
            {variant === 'review'
              ? <RvReviewersPopover people={people} />
              : <RvSharePopover people={people} linkAccess={linkAccess} />}
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

function RvReviewersPopover({ people }) {
  return (
    <React.Fragment>
      <div style={{ padding: '12px 14px 8px', boxShadow: `inset 0 -1px 0 ${BPI.rule}` }}>
        <div className="eyebrow">Reviewers</div>
      </div>
      <div style={{ padding: '6px 8px' }}>
        {people.map((a) => <RvAssignRow key={a.k} p={RV_PEOPLE[a.k]} state={a.state} assigned />)}
      </div>
      <div style={{ padding: '4px 8px 8px', boxShadow: `inset 0 1px 0 ${BPI.rule}` }}>
        <div className="eyebrow" style={{ padding: '8px 6px 4px', color: BPI.ink40 }}>Suggested</div>
        {['AO', 'DT'].map((k) => <RvAssignRow key={k} p={RV_PEOPLE[k]} />)}
      </div>
    </React.Fragment>
  );
}

function RvSharePopover({ people, linkAccess = 'Anyone at MTA with the link can comment' }) {
  return (
    <React.Fragment>
      <div style={{ padding: '12px 14px 11px', boxShadow: `inset 0 -1px 0 ${BPI.rule}` }}>
        <div className="eyebrow" style={{ marginBottom: 9 }}>Share this brief</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '8px 10px', borderRadius: 6, background: BPI.paper, boxShadow: `inset 0 0 0 1px ${BPI.rule}`, fontSize: 12, color: BPI.ink40 }}>
            Add people or teams…<span className="av2-caret" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 10px', borderRadius: 6, background: BPI.paper, boxShadow: `inset 0 0 0 1px ${BPI.rule}`, fontSize: 11.5, color: BPI.ink70, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer' }}>
            Comment
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke={BPI.ink40} strokeWidth="1.4"><path d="M2.5 4L5 6.5 7.5 4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
        </div>
      </div>
      <div style={{ padding: '6px 8px', maxHeight: 204, overflow: 'auto' }}>
        {people.map((a) => {
          const p = RV_PEOPLE[a.k];
          return (
            <div key={a.k} className="av2-summon-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px', borderRadius: 5 }}>
              <RvAvatar p={p} size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.2 }}>{p.name}{a.you ? ' (you)' : ''}</div>
                <div style={{ fontSize: 10.5, color: BPI.ink55 }}>{p.role}</div>
              </div>
              <span style={{ fontSize: 11, color: a.access === 'Owner' ? BPI.ink55 : BPI.ink70, fontWeight: a.access === 'Owner' ? 400 : 600, display: 'inline-flex', alignItems: 'center', gap: 3, cursor: a.access === 'Owner' ? 'default' : 'pointer' }}>
                {a.access}
                {a.access !== 'Owner' && <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke={BPI.ink40} strokeWidth="1.4"><path d="M2.5 4L5 6.5 7.5 4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ padding: '10px 14px', boxShadow: `inset 0 1px 0 ${BPI.rule}`, display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ width: 26, height: 26, borderRadius: 13, background: BPI.accentBg, color: BPI.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="8" cy="8" r="6.4" /><path d="M1.6 8h12.8M8 1.6c2 2 2 10.8 0 12.8M8 1.6c-2 2-2 10.8 0 12.8" /></svg>
        </span>
        <div style={{ flex: 1, fontSize: 11.5, color: BPI.ink70, lineHeight: 1.35 }}>{linkAccess}</div>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: BPI.accent, cursor: 'pointer', whiteSpace: 'nowrap' }}>Copy link</span>
      </div>
    </React.Fragment>
  );
}
function RvAssignRow({ p, state, assigned }) {
  const label = state === 'approved' ? 'approved'
    : state === 'requested-changes' ? 'changes' : state === 'reviewing' ? 'reviewing' : null;
  const lc = state === 'approved' ? BPI.good : state === 'requested-changes' ? BPI.bad : BPI.warn;
  return (
    <div className="av2-summon-row" style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px', borderRadius: 5,
    }}>
      <RvAvatar p={p} state={state} size={26} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.2 }}>{p.name}</div>
        <div style={{ fontSize: 10.5, color: BPI.ink55 }}>{p.role}</div>
      </div>
      {assigned ? (
        label && <span style={{ fontSize: 10, fontFamily: BPIMono, fontWeight: 700, color: lc }}>{label}</span>
      ) : (
        <span style={{
          fontSize: 11, fontWeight: 600, color: BPI.accent,
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>+ assign</span>
      )}
    </div>
  );
}

// ── Anchored phrase in the prose — the thing a comment is pinned to. ──────
// Always carries a quiet underline in its tone; goes solid/tinted when its
// comment is active. `replaceWith` (+ accepted) renders an applied suggestion.
function RvAnchor({ id, tone = 'accent', active, accepted, replaceWith, onClick, children }) {
  const c = tone === 'warn' ? BPI.warn : tone === 'good' ? BPI.good : BPI.accent;
  const bg = tone === 'warn' ? BPI.warnBg : tone === 'good' ? BPI.goodBg : BPI.accentBg;
  if (accepted && replaceWith) {
    return (
      <span style={{ background: BPI.goodBg, boxShadow: `inset 0 -2px 0 ${BPI.good}`, borderRadius: 2, padding: '0 1px' }}>
        {replaceWith}
      </span>
    );
  }
  return (
    <span
      data-anchor={id}
      onClick={onClick}
      style={{
        cursor: 'pointer', padding: '0 1px', borderRadius: 2,
        background: active ? bg : 'transparent',
        boxShadow: `inset 0 -2px 0 ${active ? c : 'color-mix(in oklch, ' + c + ' 45%, transparent)'}`,
        transition: 'background .12s ease, box-shadow .12s ease',
      }}>
      {children}
    </span>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Shared brief body — the Madison-corridor brief in its authored shape.
// `anchors` maps anchor-id → { tone, active, accepted, replaceWith, onClick }.
// `figurePin` renders a small comment marker on the figure.
// `faded` continues the document past the visible section.
// ═════════════════════════════════════════════════════════════════════════
function MadisonBriefBody({ anchors = {}, figurePin, dimUnanchored }) {
  const A = (id, tone, children) => {
    const a = anchors[id];
    if (!a) return children;
    return <RvAnchor id={id} tone={tone} {...a} children={children} />;
  };
  const proseColor = BPI.ink70;
  return (
    <article style={{ width: 660, maxWidth: '100%', paddingLeft: 8, position: 'relative' }}>
      <h2 style={{ margin: '0 0 14px', fontSize: 23, fontWeight: 600, letterSpacing: '-0.018em', color: BPI.ink, lineHeight: 1.18, textWrap: 'balance' }}>
        02 · Three corridors do most of the damage.
      </h2>

      <p style={{ fontSize: 16, lineHeight: 1.72, color: proseColor, textWrap: 'pretty', margin: '0 0 18px' }}>
        Of the thirteen timepoint-to-timepoint segments the route traverses, three account for{' '}
        {A('m53', 'accent', <InlineMetric value="53" unit="%" tone="warn" />)} of measured rider-hours
        of delay every weekday. The worst of the three runs up Madison Avenue — and it is also{' '}
        {A('slowest', 'warn', 'the slowest 1.5 miles of any Select Bus route in the city')}.
      </p>

      <figure style={{ margin: '0 0 20px', position: 'relative' }}>
        {figurePin}
        <EmbedSegmentCard
          route="M15" sbs dir="NB"
          from="Madison Av / E 28 St" to="Madison Av / E 58 St"
          mph={5.2} sched={7.4}
          spark={AV2_MADISON_SPARK}
          lane="partial" ace tsp={false}
          riderHours={18420}
          note="Slowest 1.5 miles of any Select Bus route in the city. Painted lane only — no concrete buffer."
        />
      </figure>

      <p style={{ fontSize: 16, lineHeight: 1.72, color: proseColor, textWrap: 'pretty', margin: '0 0 18px' }}>
        The hour-by-hour pattern makes the shape of the problem visible:{' '}
        {A('peak', 'accent', 'speeds collapse around 9 AM and stay below scheduled pace straight through the evening rush')}.
        On the worst weekday afternoons the bus is slower than a brisk walk for minutes at a time.
      </p>

      <div style={{ opacity: dimUnanchored ? 0.4 : 1, pointerEvents: dimUnanchored ? 'none' : 'auto' }}>
        <h2 style={{ margin: '28px 0 14px', fontSize: 23, fontWeight: 600, letterSpacing: '-0.018em', color: BPI.ink, lineHeight: 1.18 }}>
          03 · Where the toolkit is densest, the slowdown is steepest.
        </h2>
        <p style={{ fontSize: 16, lineHeight: 1.72, color: proseColor, margin: 0 }}>
          The intuition behind New York's bus-priority program is additive. Every layer — bus lane,
          ACE enforcement, signal priority — should compound the gain.{' '}
          {A('additive', 'accent', 'On the M15 it does not')}.
        </p>
      </div>
    </article>
  );
}

// A small comment marker pinned to a figure's corner.
function RvFigurePin({ n, tone = 'accent', active, onClick }) {
  const c = tone === 'warn' ? BPI.warn : BPI.accent;
  return (
    <div onClick={onClick} style={{
      position: 'absolute', top: 10, right: 10, zIndex: 2, cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '3px 8px 3px 6px', borderRadius: 12,
      background: active ? c : BPI.cardRaised,
      color: active ? '#fff' : c,
      boxShadow: active ? 'none' : `inset 0 0 0 1px ${c}`,
      fontSize: 10.5, fontWeight: 700, fontFamily: BPIMono,
    }}>
      <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor"><path d="M2 2h8a1 1 0 011 1v5a1 1 0 01-1 1H6l-3 2V9H2a1 1 0 01-1-1V3a1 1 0 011-1z" /></svg>
      {n}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// RF_BriefReview2 — the REVIEWER reading and marking up the brief.
// ═════════════════════════════════════════════════════════════════════════
function RF_BriefReview2() {
  const [active, setActive] = React.useState('slowest');
  const [mode, setMode] = React.useState('comment');  // composer: comment | suggest

  const assigned = [
    { k: 'CP', state: 'requested-changes' },
    { k: 'SR', state: 'approved' },
    { k: 'JL', state: 'reviewing' },
  ];

  // Comment state lives in an undo/redo history — resolving is an action you
  // can take back, same model as the composer's edits.
  const review = useHistory(RV_REVIEW_COMMENTS);
  const comments = review.state;
  const resolve = (id) => review.set((cs) => cs.map((c) => c.id === id ? { ...c, resolved: true } : c));

  return (
    <div className="bpi" style={{ width: RV_W, height: RV_H, display: 'flex', flexDirection: 'column', background: BPI.paper }}>
      <StudioBar active="Briefs" breadcrumb="Briefs / Brief 023 · Madison corridor · review" />

      {/* Review sub-bar — calm single line, reviewer's workflow on the right */}
      <div style={{ padding: '11px 28px', background: BPI.card, boxShadow: `inset 0 -1px 0 ${BPI.rule}`, display: 'flex', alignItems: 'center', gap: 14 }}>
        <RouteBadge route="M15" sbs size="md" />
        <div style={{ fontSize: 16.5, fontWeight: 600, letterSpacing: '-0.012em' }}>When the priority stack stops working</div>
        <span style={{ fontFamily: BPIMono, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: BPI.warn, background: BPI.warnBg, padding: '3px 7px', borderRadius: 2 }}>IN REVIEW</span>
        <span style={{ width: 1, height: 22, background: BPI.rule }} />
        <ChromeUndoRedo canUndo={review.canUndo} canRedo={review.canRedo} onUndo={review.undo} onRedo={review.redo} />
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BriefPeople variant="review" people={assigned} />
          <span style={{ width: 1, height: 24, background: BPI.rule }} />
          <Button variant="secondary" size="sm">Request changes</Button>
          <Button variant="primary" size="sm">Approve →</Button>
        </div>
      </div>

      {/* Body — brief column + comment margin */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 384px' }}>
        {/* Editorial column */}
        <div style={{ overflow: 'auto', padding: '46px 40px 80px', display: 'flex', justifyContent: 'center' }}>
          <MadisonBriefBody
            anchors={Object.fromEntries(comments.filter((c) => c.anchor).map((c) => [c.anchor, {
              tone: c.kind === 'suggest' ? 'accent' : c.tone || 'accent',
              active: active === c.id,
              onClick: () => setActive(c.id),
            }]))}
            figurePin={(() => {
              const fc = comments.find((c) => c.anchor === 'figure');
              return fc ? <RvFigurePin n={fc.pin} tone={fc.tone} active={active === fc.id} onClick={() => setActive(fc.id)} /> : null;
            })()}
          />
        </div>

        {/* Comment margin */}
        <div style={{ background: BPI.paper, boxShadow: `inset 1px 0 0 ${BPI.rule}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '15px 18px 13px', boxShadow: `inset 0 -1px 0 ${BPI.rule}`, display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div className="eyebrow">Comments</div>
            <span style={{ fontFamily: BPIMono, fontSize: 11, color: BPI.ink55 }}>
              {comments.filter((c) => !c.resolved).length} open · {comments.filter((c) => c.resolved).length} resolved
            </span>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px' }}>
            {comments.map((c) => (
              <RvCommentCard key={c.id} c={c} active={active === c.id} onClick={() => setActive(c.id)} onResolve={() => resolve(c.id)} />
            ))}
          </div>

          {/* Reviewer composer */}
          <div style={{ padding: '12px 14px', background: BPI.card, boxShadow: `inset 0 1px 0 ${BPI.rule}` }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 8, padding: 3, background: BPI.paperDeep, borderRadius: 7, width: 'fit-content' }}>
              {[['comment', 'Comment'], ['suggest', 'Suggest edit']].map(([m, label]) => (
                <button key={m} className="bpi" onClick={() => setMode(m)} style={{
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 11.5, fontWeight: 600, padding: '5px 11px', borderRadius: 5,
                  background: mode === m ? BPI.card : 'transparent',
                  color: mode === m ? BPI.ink : BPI.ink55,
                  boxShadow: mode === m ? `0 1px 2px rgba(22,20,15,.12)` : 'none',
                }}>{label}</button>
              ))}
            </div>
            <div style={{
              padding: '10px 12px', borderRadius: 6, background: BPI.paper,
              boxShadow: `inset 0 0 0 1px ${BPI.rule}`, fontSize: 12.5, color: BPI.ink40, lineHeight: 1.5,
            }}>
              {mode === 'suggest'
                ? 'Replace the selected text with…'
                : 'Comment on “the slowest 1.5 miles…”'}
              <span className="av2-caret" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <span style={{ fontSize: 11, color: BPI.ink40 }}>Pinned to your selection</span>
              <div style={{ flex: 1 }} />
              <Button variant={mode === 'suggest' ? 'secondary' : 'ghost'} size="sm">Cancel</Button>
              <Button variant="primary" size="sm">{mode === 'suggest' ? 'Suggest' : 'Comment'}</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Comment data — shared shape used by review (read) and triage (act).
const RV_REVIEW_COMMENTS = [
  {
    id: 'c-53', anchor: 'm53', pin: 1, tone: 'accent', kind: 'comment',
    who: 'SR', at: '4h ago',
    body: 'Is 53% the share of the worst three combined, or Madison alone? The sentence reads like it could be either.',
    replies: [{ who: 'JL', at: '3h ago', body: 'Combined — the three together. I’ll add “together” to be unambiguous.' }],
  },
  {
    id: 'slowest', anchor: 'slowest', pin: 2, tone: 'warn', kind: 'suggest', requested: true,
    who: 'CP', at: '2h ago',
    body: '“Slowest in the city” is a strong superlative for a reviewer to wave through. Soften unless we can cite the citywide ranking.',
    suggest: { from: 'the slowest 1.5 miles of any Select Bus route in the city', to: 'among the slowest stretches of any Select Bus route in the city' },
    replies: [],
  },
  {
    id: 'figure', anchor: 'figure', pin: 3, tone: 'accent', kind: 'comment',
    who: 'SR', at: '4h ago',
    body: 'The PM dip in the sparkline is sharper than the AM one — worth saying so in the body; it changes when an intervention would bite.',
    replies: [],
  },
  {
    id: 'peak', anchor: 'peak', pin: 4, tone: 'accent', kind: 'suggest',
    who: 'CP', at: '2h ago',
    body: '“Around 9 AM” undersells it — the collapse starts at the AM peak and never recovers.',
    suggest: { from: 'speeds collapse around 9 AM', to: 'speeds collapse at the morning peak' },
    replies: [],
  },
  {
    id: 'style', anchor: null, pin: null, kind: 'comment', resolved: true,
    who: 'SR', at: 'yesterday',
    body: 'Style guide: “Avenue” in body, “Av” in labels. Fixed throughout.',
    replies: [],
  },
];

// A comment card in the margin. Collapsed = preview; active = full thread.
function RvCommentCard({ c, active, onClick, onResolve }) {
  const who = RV_PEOPLE[c.who];
  const isChange = c.requested;
  const accent = isChange ? BPI.bad : c.kind === 'suggest' ? BPI.accent : BPI.ink40;
  return (
    <div onClick={onClick} style={{
      marginBottom: 10, padding: '12px 13px', borderRadius: 8, cursor: 'pointer',
      background: c.resolved ? 'transparent' : BPI.card,
      opacity: c.resolved && !active ? 0.6 : 1,
      boxShadow: active ? `0 6px 18px rgba(22,20,15,.10), inset 0 0 0 1.5px ${accent}`
        : `inset 0 0 0 1px ${BPI.rule}`,
      transition: 'box-shadow .14s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {c.pin != null && (
          <span style={{
            width: 18, height: 18, borderRadius: 9, flexShrink: 0,
            background: accent, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700, fontFamily: BPIMono,
          }}>{c.pin}</span>
        )}
        <RvAvatar p={who} size={22} />
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{who.name}</span>
        {c.kind === 'suggest' && (
          <span className="chip accent" style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.06em' }}>SUGGEST</span>
        )}
        {isChange && (
          <span className="chip bad" style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.06em' }}>CHANGE</span>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: BPI.ink40, fontFamily: BPIMono }}>{c.at}</span>
      </div>

      <div style={{
        fontSize: 12.5, color: BPI.ink, lineHeight: 1.55, marginTop: 8,
        ...(active ? {} : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
      }}>{c.body}</div>

      {/* Suggested-edit diff preview */}
      {c.suggest && active && (
        <div style={{ marginTop: 9, fontSize: 12.5, lineHeight: 1.5 }}>
          <span style={{ textDecoration: 'line-through', textDecorationColor: BPI.ink40, color: BPI.ink55 }}>{c.suggest.from}</span>{' '}
          <span style={{ background: BPI.goodBg, boxShadow: `inset 0 -2px 0 ${BPI.good}`, borderRadius: 2, padding: '0 2px', color: BPI.ink, fontWeight: 600 }}>{c.suggest.to}</span>
        </div>
      )}

      {active && c.replies && c.replies.map((r, i) => (
        <div key={i} style={{ marginTop: 10, paddingLeft: 10, boxShadow: `inset 2px 0 0 ${BPI.rule}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <RvAvatar p={RV_PEOPLE[r.who]} size={18} />
            <span style={{ fontSize: 11.5, fontWeight: 600 }}>{RV_PEOPLE[r.who].name}</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 9.5, color: BPI.ink40, fontFamily: BPIMono }}>{r.at}</span>
          </div>
          <div style={{ fontSize: 12, color: BPI.ink70, lineHeight: 1.5 }}>{r.body}</div>
        </div>
      ))}

      {active && !c.resolved && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 11, fontSize: 11.5 }}>
          <span style={{ color: BPI.accent, fontWeight: 600, cursor: 'pointer' }}>Reply</span>
          <span onClick={(e) => { e.stopPropagation(); onResolve && onResolve(); }} style={{ color: BPI.ink55, cursor: 'pointer' }}>Resolve</span>
        </div>
      )}
      {c.resolved && (
        <div style={{ marginTop: 8, fontSize: 10.5, color: BPI.good, fontWeight: 600, fontFamily: BPIMono }}>✓ resolved</div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// RF_BriefTriage — the AUTHOR resolving incoming review comments.
// ═════════════════════════════════════════════════════════════════════════
function RF_BriefTriage() {
  // Each open item carries a resolution state the author drives.
  const initial = RV_REVIEW_COMMENTS.filter((c) => c.anchor || c.kind).map((c) => ({
    ...c, status: c.resolved ? 'resolved' : 'open',
  }));
  const tri = useHistory(initial);
  const items = tri.state;
  const [active, setActive] = React.useState('slowest');

  const setStatus = (id, status) => tri.set((xs) => xs.map((x) => x.id === id ? { ...x, status } : x));
  const open = items.filter((x) => x.status === 'open');
  const done = items.length - open.length;
  const allClear = open.length === 0;

  // anchors reflect accepted suggestions (prose updates in place)
  const anchorMap = Object.fromEntries(items.filter((i) => i.anchor && i.anchor !== 'figure').map((i) => [i.anchor, {
    tone: i.requested ? 'warn' : 'accent',
    active: active === i.id,
    accepted: i.status === 'accepted',
    replaceWith: i.suggest ? i.suggest.to : undefined,
    onClick: () => setActive(i.id),
  }]));
  const figItem = items.find((i) => i.anchor === 'figure');

  return (
    <div className="bpi" style={{ width: RV_W, height: RV_H, display: 'flex', flexDirection: 'column', background: BPI.paper }}>
      <StudioBar active="Briefs" breadcrumb="Briefs / Brief 023 · Madison corridor · resolve" />

      {/* Author sub-bar — status + the gated resubmit action */}
      <div style={{ padding: '11px 28px', background: BPI.card, boxShadow: `inset 0 -1px 0 ${BPI.rule}`, display: 'flex', alignItems: 'center', gap: 14 }}>
        <RouteBadge route="M15" sbs size="md" />
        <div style={{ fontSize: 16.5, fontWeight: 600, letterSpacing: '-0.012em' }}>When the priority stack stops working</div>
        <span style={{ fontFamily: BPIMono, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: BPI.bad, background: BPI.badBg, padding: '3px 7px', borderRadius: 2 }}>CHANGES REQUESTED</span>
        <span style={{ fontSize: 11.5, color: BPI.ink55 }}>
          <b style={{ color: BPI.ink }}>C. Pherson</b> asked for changes
        </span>
        <span style={{ width: 1, height: 22, background: BPI.rule }} />
        <ChromeUndoRedo canUndo={tri.canUndo} canRedo={tri.canRedo} onUndo={tri.undo} onRedo={tri.redo} />
        <div style={{ flex: 1 }} />
        <Button variant="ghost" size="sm">Open in composer</Button>
        <Button variant="primary" size="sm" style={allClear ? {} : { opacity: 0.45, pointerEvents: 'none' }}>
          {allClear ? 'Resubmit for review →' : `Resolve ${open.length} to resubmit`}
        </Button>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 408px' }}>
        {/* Editorial column — accepted suggestions land here */}
        <div style={{ overflow: 'auto', padding: '46px 40px 80px', display: 'flex', justifyContent: 'center' }}>
          <MadisonBriefBody
            anchors={anchorMap}
            figurePin={figItem ? <RvFigurePin n={figItem.pin} tone={figItem.requested ? 'warn' : 'accent'} active={active === figItem.id} onClick={() => setActive(figItem.id)} /> : null}
          />
        </div>

        {/* Resolve queue */}
        <div style={{ background: BPI.paper, boxShadow: `inset 1px 0 0 ${BPI.rule}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Progress header */}
          <div style={{ padding: '15px 18px 14px', boxShadow: `inset 0 -1px 0 ${BPI.rule}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 9 }}>
              <div className="eyebrow">To resolve</div>
              <span style={{ fontFamily: BPIMono, fontSize: 11, color: allClear ? BPI.good : BPI.ink55 }}>
                {done} of {items.length} done
              </span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: BPI.ink10, overflow: 'hidden' }}>
              <div style={{ width: `${(done / items.length) * 100}%`, height: '100%', background: allClear ? BPI.good : BPI.accent, transition: 'width .25s ease' }} />
            </div>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px' }}>
            {items.map((it) => (
              <RvTriageCard key={it.id} it={it} active={active === it.id}
                onClick={() => setActive(it.id)} setStatus={setStatus} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Author-side card: same comment, but with resolution actions.
function RvTriageCard({ it, active, onClick, setStatus }) {
  const who = RV_PEOPLE[it.who];
  const resolved = it.status !== 'open';
  const accent = it.requested ? BPI.bad : it.kind === 'suggest' ? BPI.accent : BPI.ink40;
  const statusLabel = it.status === 'accepted' ? '✓ applied'
    : it.status === 'resolved' ? '✓ resolved'
    : it.status === 'dismissed' ? '· dismissed' : null;
  const statusColor = it.status === 'dismissed' ? BPI.ink40 : BPI.good;
  return (
    <div onClick={onClick} style={{
      marginBottom: 10, padding: '12px 13px', borderRadius: 8, cursor: 'pointer',
      background: resolved ? 'transparent' : BPI.card,
      opacity: resolved && !active ? 0.62 : 1,
      boxShadow: active ? `0 6px 18px rgba(22,20,15,.10), inset 0 0 0 1.5px ${accent}` : `inset 0 0 0 1px ${BPI.rule}`,
      transition: 'box-shadow .14s ease, opacity .14s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {it.pin != null && (
          <span style={{ width: 18, height: 18, borderRadius: 9, flexShrink: 0, background: accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, fontFamily: BPIMono }}>{it.pin}</span>
        )}
        <RvAvatar p={who} size={22} />
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{who.name}</span>
        {it.kind === 'suggest' && <span className="chip accent" style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.06em' }}>SUGGEST</span>}
        {it.requested && <span className="chip bad" style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.06em' }}>CHANGE</span>}
        <div style={{ flex: 1 }} />
        {statusLabel
          ? <span style={{ fontSize: 10, fontWeight: 700, fontFamily: BPIMono, color: statusColor }}>{statusLabel}</span>
          : <span style={{ fontSize: 10, color: BPI.ink40, fontFamily: BPIMono }}>{it.at}</span>}
      </div>

      <div style={{
        fontSize: 12.5, color: BPI.ink, lineHeight: 1.55, marginTop: 8,
        ...(active ? {} : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
      }}>{it.body}</div>

      {it.suggest && active && (
        <div style={{ marginTop: 9, fontSize: 12.5, lineHeight: 1.5 }}>
          <span style={{ textDecoration: 'line-through', textDecorationColor: BPI.ink40, color: BPI.ink55 }}>{it.suggest.from}</span>{' '}
          <span style={{ background: BPI.goodBg, boxShadow: `inset 0 -2px 0 ${BPI.good}`, borderRadius: 2, padding: '0 2px', color: BPI.ink, fontWeight: 600 }}>{it.suggest.to}</span>
        </div>
      )}

      {/* Actions — only while open and active */}
      {active && it.status === 'open' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          {it.suggest ? (
            <React.Fragment>
              <Button variant="primary" size="sm" onClick={() => setStatus(it.id, 'accepted')}>Accept edit</Button>
              <Button variant="ghost" size="sm" onClick={() => setStatus(it.id, 'dismissed')}>Dismiss</Button>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <Button variant="secondary" size="sm" onClick={() => setStatus(it.id, 'resolved')}>Reply</Button>
              <Button variant="ghost" size="sm" onClick={() => setStatus(it.id, 'resolved')}>Mark resolved</Button>
            </React.Fragment>
          )}
        </div>
      )}
      {active && resolved && (
        <div style={{ marginTop: 10 }}>
          <button className="bpi" onClick={(e) => { e.stopPropagation(); setStatus(it.id, 'open'); }} style={{
            border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
            color: BPI.ink55, fontSize: 11.5, fontFamily: 'inherit', fontWeight: 600,
          }}>Reopen</button>
        </div>
      )}
    </div>
  );
}

Object.assign(window, {
  RF_BriefReview2, RF_BriefTriage,
  MadisonBriefBody, RvAvatar, RvAnchor,
  useHistory, ChromeUndoRedo, BriefPeople,
});
