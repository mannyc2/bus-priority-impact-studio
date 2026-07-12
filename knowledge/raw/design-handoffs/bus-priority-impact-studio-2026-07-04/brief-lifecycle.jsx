// Brief lifecycle screens — what happens after authoring.
//
//   RF_BriefReview   — published brief receiving reviewer comments
//   RF_BriefHistory  — version history + side-by-side diff
//
// Both reuse <ClaimList> for the outline so the visual continuity from
// composer → review → published holds.

const BLW = 1320, BLH = 880;

// ─────────────────────────────────────────────────────────────
// BriefHeaderBar — shared by both review and history. Title + status +
// reviewer chips + actions.
// ─────────────────────────────────────────────────────────────
// BriefHeaderBar — shared by both review and history.
// Status chip + version + one purposeful meta fact compose on the
// sub-line. No subtitle prop — that was a dot-dump entry point.
function BriefHeaderBar({ status, statusTone, version, meta, actions }) {
  const bg = statusTone === 'good' ? BPI.goodBg : statusTone === 'warn' ? BPI.warnBg : BPI.ink06;
  const fg = statusTone === 'good' ? BPI.good   : statusTone === 'warn' ? BPI.warn   : BPI.ink55;
  return (
    <div style={{
      padding: '16px 28px', background: BPI.card,
      boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
      display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <RouteBadge route="M15" sbs size="md" />
      <div>
        <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.015em' }}>
          The Madison corridor problem
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <span style={{
            fontSize: 9.5, letterSpacing: '0.12em', fontWeight: 700,
            padding: '2px 7px', background: bg, color: fg, borderRadius: 2,
          }}>{status}</span>
          <span style={{ fontSize: 11, color: BPI.ink55, fontFamily: BPIMono }}>{version}</span>
          {meta && <span style={{ fontSize: 11, color: BPI.ink40, fontFamily: BPIMono }}>{meta}</span>}
        </div>
      </div>
      <div style={{ flex: 1 }} />
      {actions}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// RF_BriefReview
// ═════════════════════════════════════════════════════════════
function RF_BriefReview() {
  const claims = [
    { n: 1, title: 'M15 SBS is the slowest SBS route in Manhattan',          strength: 5, evidence: 3, caveats: 1, comments: 1 },
    { n: 2, title: 'A single corridor accounts for 43% of measured delay',   strength: 4, evidence: 4, caveats: 2, active: true, comments: 4 },
    { n: 3, title: 'ACE rollout coincides with +0.7 mph PM-peak gain',       strength: 3, evidence: 3, caveats: 2, comments: 3 },
    { n: 4, title: 'Treatment gap on Madison Av',                            strength: 2, evidence: 1, caveats: 0, weak: true, comments: 2 },
  ];
  const reviewers = [
    { i: 'JL', name: 'J. Lim',     state: 'reviewing'    },
    { i: 'SR', name: 'S. Rivera',  state: 'approved'     },
    { i: 'CP', name: 'C. Pherson', state: 'requested-changes' },
  ];
  return (
    <div className="bpi" style={{ width: BLW, height: BLH, display: 'flex', flexDirection: 'column' }}>
      <StudioBar active="Briefs" breadcrumb="Briefs / M15 SBS · Madison corridor · review" />
      <BriefHeaderBar
        status="IN REVIEW" statusTone="warn"
        version="v0.4" meta="sent 2 days ago"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <ReviewerStack reviewers={reviewers} />
            <Button variant="primary" size="sm">Resolve C. Pherson's changes →</Button>
          </div>
        } />

      <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '240px 1fr 360px' }}>
        {/* Left — outline */}
        <div style={{
          background: BPI.paper, boxShadow: `inset -1px 0 0 ${BPI.rule}`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{ padding: '18px 18px 12px', boxShadow: `inset 0 -1px 0 ${BPI.rule}` }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Outline</div>
            <div style={{ fontSize: 11, color: BPI.ink55 }}>Comment counts shown</div>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px' }}>
            {claims.map((c) => <OutlineRowWithComments key={c.n} claim={c} />)}
          </div>
        </div>

        {/* Center — brief reading view with the active claim's evidence */}
        <div style={{ overflow: 'auto', padding: '32px 48px', background: BPI.card }}>
          <span className="chip" style={{ fontSize: 10, background: BPI.accentBg, color: BPI.accent, fontWeight: 700 }}>CLAIM 02 · IN REVIEW</span>
          <div style={{
            fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2,
            marginTop: 12, marginBottom: 18, maxWidth: 640, textWrap: 'pretty',
          }}>
            A single corridor accounts for 43% of measured delay.
          </div>
          <p style={{ fontSize: 14.5, lineHeight: 1.65, color: BPI.ink, marginBottom: 16, maxWidth: 600 }}>
            <CommentedSpan id="span-a">On the 1.5 miles of Madison Avenue between East 28th and East 58th Streets, M15 SBS buses average 4.2 mph northbound on weekdays,<Cite n={5} /></CommentedSpan> approximately 43% of the route's total measured rider-hour delay.<Cite n={5} />
          </p>

          <figure style={{
            margin: '8px 0 22px', background: BPI.paper,
            padding: '16px 16px 12px', borderRadius: 3,
            boxShadow: `0 0 0 1px ${BPI.rule}`, position: 'relative',
          }}>
            <CommentMark id="fig-a" count={2} />
            <div className="eyebrow" style={{ marginBottom: 8 }}>Figure 1 · Madison Av NB severity by hour</div>
            <HourStrip hours={Array.from({ length: 24 }, (_, h) => {
              if (h >= 7 && h <= 9) return 0.7;
              if (h >= 11 && h <= 14) return 0.5;
              if (h >= 16 && h <= 19) return 0.9;
              if (h >= 6 && h <= 21) return 0.3;
              return 0.1;
            })} width={520} height={24} />
            <div style={{ fontSize: 11, color: BPI.ink55, marginTop: 8, fontStyle: 'italic' }}>
              Source: MTA Bus Speeds, March 2026.<Cite n={2} />
            </div>
          </figure>

          <p style={{ fontSize: 14.5, lineHeight: 1.65, color: BPI.ink, maxWidth: 600 }}>
            What distinguishes this stretch from the rest of the M15 corridor is its <CommentedSpan id="span-b">treatment gap</CommentedSpan>.
            The route is otherwise heavily equipped — dedicated bus lanes on the East Side avenues, all-day Automated
            Camera Enforcement since May 2025. <CommentedSpan id="span-c">On Madison Avenue, the bus lane covers only the southernmost third of this segment; ACE enforcement does not extend to Madison Av at all.</CommentedSpan><Cite n={7} />
          </p>
        </div>

        {/* Right — comment thread */}
        <CommentThread />
      </div>
    </div>
  );
}

// Avatar chip
function ReviewerChip({ r, ringTone }) {
  const ring = ringTone === 'good' ? BPI.good : ringTone === 'bad' ? BPI.bad : ringTone === 'warn' ? BPI.warn : BPI.ink40;
  return (
    <div title={`${r.name} — ${r.state}`} style={{
      width: 26, height: 26, borderRadius: 13,
      background: BPI.paper, color: BPI.ink,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 10, fontWeight: 700, letterSpacing: '0.01em',
      boxShadow: `inset 0 0 0 1.5px ${ring}, 0 0 0 1.5px ${BPI.card}`,
    }}>{r.i}</div>
  );
}
function ReviewerStack({ reviewers }) {
  const toneFor = (s) => s === 'approved' ? 'good' : s === 'requested-changes' ? 'bad' : 'warn';
  return (
    <div style={{ display: 'flex' }}>
      {reviewers.map((r, i) => (
        <div key={i} style={{ marginLeft: i ? -6 : 0 }}>
          <ReviewerChip r={r} ringTone={toneFor(r.state)} />
        </div>
      ))}
    </div>
  );
}

// Outline row that adds a comment badge to the right of metadata.
// Reuses ClaimRow visual via a thin wrapper since comments aren't a
// core ClaimRow concern.
function OutlineRowWithComments({ claim }) {
  const active = claim.active;
  return (
    <div style={{
      display: 'flex', gap: 8, padding: '10px 10px', borderRadius: 3,
      background: active ? BPI.card : 'transparent',
      boxShadow: active ? `0 0 0 1.5px ${BPI.ink}` : 'none',
      marginBottom: 4, cursor: 'pointer', position: 'relative',
    }}>
      <span className="num" style={{ fontSize: 10, fontWeight: 700, color: BPI.ink55, fontFamily: BPIMono, paddingTop: 3 }}>0{claim.n}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: active ? 600 : 500, lineHeight: 1.35 }}>{claim.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9.5, color: BPI.ink55, fontFamily: BPIMono, marginTop: 5 }}>
          <StrengthBars strength={claim.strength} size="sm" />
          <span>{claim.evidence} ev</span>
          <span style={{ color: BPI.ink20 }}>·</span>
          <span>{claim.caveats} cav</span>
          {claim.weak && <><span style={{ color: BPI.ink20 }}>·</span><span style={{ color: BPI.warn, fontWeight: 700 }}>weak</span></>}
        </div>
      </div>
      {claim.comments > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 3,
          padding: '2px 6px', background: claim.comments >= 3 ? BPI.warnBg : BPI.ink06,
          color: claim.comments >= 3 ? BPI.warn : BPI.ink70,
          borderRadius: 10, fontSize: 10, fontWeight: 700, height: 'fit-content', marginTop: 2,
        }}>
          <svg width="9" height="9" viewBox="0 0 12 12" fill="currentColor"><path d="M2 2h8a1 1 0 011 1v5a1 1 0 01-1 1H6l-3 2V9H2a1 1 0 01-1-1V3a1 1 0 011-1z" /></svg>
          {claim.comments}
        </div>
      )}
    </div>
  );
}

// Inline annotation in body copy: underline + numbered marker, hover-tinted.
function CommentedSpan({ id, children }) {
  const active = id === 'span-b';
  return (
    <span style={{
      background: active ? BPI.warnBg : 'transparent',
      boxShadow: `inset 0 -2px 0 ${active ? BPI.warn : BPI.accent}`,
      cursor: 'pointer', padding: '1px 0',
    }}>{children}</span>
  );
}
// Marker beside a figure
function CommentMark({ count }) {
  return (
    <div style={{
      position: 'absolute', top: 8, right: 8,
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', background: BPI.ink, color: BPI.paper,
      borderRadius: 12, fontSize: 10, fontWeight: 700, fontFamily: BPIMono,
    }}>
      <svg width="9" height="9" viewBox="0 0 12 12" fill="currentColor"><path d="M2 2h8a1 1 0 011 1v5a1 1 0 01-1 1H6l-3 2V9H2a1 1 0 01-1-1V3a1 1 0 011-1z" /></svg>
      {count}
    </div>
  );
}

// Right rail — threaded comments on the active claim
function CommentThread() {
  return (
    <div style={{
      background: BPI.paper, boxShadow: `inset 1px 0 0 ${BPI.rule}`,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 18px', boxShadow: `inset 0 -1px 0 ${BPI.rule}` }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>Comments on claim 02</div>
        <div style={{ fontSize: 11, color: BPI.ink55 }}>C. Pherson requested changes · 1 unresolved</div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {[
          {
            kind: 'change',
            on: 'treatment gap',
            who: { i: 'CP', name: 'C. Pherson' },
            at: '2 hours ago',
            body: 'The phrase "treatment gap" is doing a lot of work here. Can we be specific about which treatment is missing — bus lane, ACE, or both — and quantify the gap?',
            replies: [
              { who: { i: 'JL', name: 'J. Lim' }, at: '1 hour ago', body: 'Good catch. Madison Av is missing both, but the lane gap is the more measurable one. I\'ll split this into two sub-claims.' },
            ],
          },
          {
            kind: 'comment',
            on: 'Figure 1',
            who: { i: 'SR', name: 'S. Rivera' },
            at: '4 hours ago',
            body: 'The PM peak severity here is much sharper than the AM peak. Worth calling that out in the body — could affect intervention timing.',
            replies: [],
          },
          {
            kind: 'comment',
            on: 'Madison Avenue',
            who: { i: 'SR', name: 'S. Rivera' },
            at: '4 hours ago',
            body: 'Should we say "Madison Avenue" or "Madison Av" consistently? Style guide says "Avenue" in body, "Av" in labels.',
            replies: [],
            resolved: true,
          },
        ].map((t, i) => <CommentThreadItem key={i} thread={t} />)}
      </div>

      <div style={{
        padding: '12px 16px', boxShadow: `inset 0 1px 0 ${BPI.rule}`,
        background: BPI.card,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <textarea
          placeholder="Add a comment on this claim…"
          style={{
            width: '100%', padding: '10px 12px', resize: 'none',
            border: `1px solid ${BPI.rule}`, borderRadius: 3,
            fontFamily: 'inherit', fontSize: 12.5, color: BPI.ink,
            background: BPI.paper, minHeight: 60,
          }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="bpi" style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: BPI.ink55, fontSize: 11, fontFamily: 'inherit',
          }}>@ mention</button>
          <div style={{ flex: 1 }} />
          <Button variant="secondary" size="sm">Request change</Button>
          <Button variant="primary" size="sm">Comment</Button>
        </div>
      </div>
    </div>
  );
}
function CommentThreadItem({ thread }) {
  const tone = thread.kind === 'change' ? 'warn' : 'neutral';
  const ring = tone === 'warn' ? BPI.warn : BPI.rule;
  return (
    <div style={{
      marginBottom: 12, padding: '12px 14px',
      background: BPI.card, borderRadius: 3,
      boxShadow: `0 0 0 1px ${ring}${tone === 'warn' ? '' : ''}`,
      opacity: thread.resolved ? 0.55 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <ReviewerChip r={thread.who} ringTone={tone === 'warn' ? 'bad' : 'neutral'} />
        <div style={{ fontSize: 12, fontWeight: 600 }}>{thread.who.name}</div>
        <span className="chip" style={{
          fontSize: 9, padding: '1px 6px',
          background: tone === 'warn' ? BPI.warnBg : BPI.ink06,
          color: tone === 'warn' ? BPI.warn : BPI.ink70,
          fontWeight: 700,
        }}>{thread.kind === 'change' ? 'CHANGE REQUESTED' : 'COMMENT'}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: BPI.ink55, fontFamily: BPIMono }}>{thread.at}</span>
      </div>
      <div style={{
        fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono, marginBottom: 6,
        background: BPI.paper, padding: '4px 8px', borderRadius: 2,
        boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
        display: 'inline-block',
      }}>on "{thread.on}"</div>
      <div style={{ fontSize: 12.5, color: BPI.ink, lineHeight: 1.55 }}>{thread.body}</div>
      {thread.replies && thread.replies.length > 0 && (
        <div style={{
          marginTop: 10, paddingTop: 10, paddingLeft: 14,
          boxShadow: `inset 0 1px 0 ${BPI.rule}, inset 2px 0 0 ${BPI.rule}`,
        }}>
          {thread.replies.map((r, i) => (
            <div key={i}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <ReviewerChip r={r.who} ringTone="warn" />
                <div style={{ fontSize: 11.5, fontWeight: 600 }}>{r.who.name}</div>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 10, color: BPI.ink55, fontFamily: BPIMono }}>{r.at}</span>
              </div>
              <div style={{ fontSize: 12, color: BPI.ink70, lineHeight: 1.5 }}>{r.body}</div>
            </div>
          ))}
        </div>
      )}
      {!thread.resolved && (
        <div style={{ display: 'flex', gap: 10, marginTop: 10, fontSize: 11, color: BPI.ink55 }}>
          <button className="bpi" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: BPI.accent, fontWeight: 600, fontFamily: 'inherit', fontSize: 11 }}>Reply</button>
          <span style={{ color: BPI.ink20 }}>·</span>
          <button className="bpi" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: BPI.ink70, fontFamily: 'inherit', fontSize: 11 }}>Mark resolved</button>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// RF_BriefHistory — version timeline + diff
// ═════════════════════════════════════════════════════════════
const VERSIONS = [
  {
    v: 'v0.4', when: 'May 12 · today',     who: { i: 'CP', name: 'C. Pherson' }, claims: 4, cites: 23, caveats: 3, status: 'IN REVIEW',
    changes: { added: 0, edited: 2, removed: 0, evidenceAdded: 4, caveatsAdded: 1 },
    note: 'Madison-corridor framing tightened; added before/after rider-hours figure.',
  },
  {
    v: 'v0.3', when: 'May 8 · 4 days ago', who: { i: 'JL', name: 'J. Lim' },     claims: 4, cites: 19, caveats: 2, status: 'DRAFT',
    changes: { added: 1, edited: 1, removed: 0, evidenceAdded: 3, caveatsAdded: 0 },
    note: 'Added the treatment-gap claim (later flagged weak).',
  },
  {
    v: 'v0.2', when: 'Apr 30',             who: { i: 'CP', name: 'C. Pherson' }, claims: 3, cites: 16, caveats: 2, status: 'DRAFT',
    changes: { added: 0, edited: 3, removed: 1, evidenceAdded: 2, caveatsAdded: 1 },
    note: 'Pulled the TSP claim; evidence base was too thin.',
  },
  {
    v: 'v0.1', when: 'Apr 24',             who: { i: 'CP', name: 'C. Pherson' }, claims: 4, cites: 11, caveats: 1, status: 'DRAFT',
    changes: { added: 4, edited: 0, removed: 0, evidenceAdded: 11, caveatsAdded: 1 },
    note: 'Initial draft from Madison-corridor hotspot.',
  },
];

function RF_BriefHistory() {
  return (
    <div className="bpi" style={{ width: BLW, height: BLH, display: 'flex', flexDirection: 'column' }}>
      <StudioBar active="Briefs" breadcrumb="Briefs / M15 SBS · Madison corridor · history" />
      <BriefHeaderBar
        status="IN REVIEW" statusTone="warn"
        version="v0.4" meta="last edit 2 hours ago"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Button variant="primary" size="sm">Open in composer →</Button>
          </div>
        } />

      {/* Version selector — pick A vs B to diff */}
      <VersionPicker />

      <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '280px 1fr' }}>
        {/* Left rail — full version list */}
        <VersionList />
        {/* Center — diff body */}
        <DiffBody />
      </div>
    </div>
  );
}

function VersionPicker() {
  return (
    <div style={{
      padding: '12px 28px', background: BPI.paperDeep,
      boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
      display: 'flex', alignItems: 'center', gap: 16, fontSize: 12,
    }}>
      <span className="eyebrow">Comparing</span>
      <VersionChip v="v0.3" when="May 8" who="J. Lim" />
      <span style={{ fontSize: 14, color: BPI.ink40 }}>→</span>
      <VersionChip v="v0.4" when="May 12" who="C. Pherson" highlight />
      <div style={{ flex: 1 }} />
      <span style={{ fontFamily: BPIMono, color: BPI.ink55 }}>
        +<b style={{ color: BPI.good }}>4</b> evidence ·
        +<b style={{ color: BPI.warn }}>1</b> caveat ·
        <b style={{ color: BPI.ink70, marginLeft: 4 }}>2</b> claims edited
      </span>
    </div>
  );
}
function VersionChip({ v, when, who, highlight }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 10px',
      background: highlight ? BPI.card : 'transparent',
      border: `1px solid ${highlight ? BPI.ink : BPI.rule}`,
      borderRadius: 3, cursor: 'pointer',
    }}>
      <span className="num" style={{ fontSize: 12, fontWeight: 700, fontFamily: BPIMono }}>{v}</span>
      <span style={{ fontSize: 11, color: BPI.ink55, fontFamily: BPIMono }}>· {when} · {who}</span>
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke={BPI.ink40} strokeWidth="1.4"><path d="M2 3.5L4.5 6 7 3.5" /></svg>
    </div>
  );
}

function VersionList() {
  return (
    <div style={{
      background: BPI.paper, boxShadow: `inset -1px 0 0 ${BPI.rule}`,
      overflow: 'auto', padding: '20px 14px',
    }}>
      <div className="eyebrow" style={{ marginBottom: 12, paddingLeft: 4 }}>Versions</div>
      <div style={{ position: 'relative' }}>
        <div style={{
          position: 'absolute', left: 16, top: 8, bottom: 8, width: 1, background: BPI.rule,
        }} />
        {VERSIONS.map((v, i) => {
          const isB = i === 0, isA = i === 1;
          return (
            <div key={v.v} style={{
              position: 'relative', paddingLeft: 32, marginBottom: 14, cursor: 'pointer',
            }}>
              <div style={{
                position: 'absolute', left: 11, top: 8, width: 11, height: 11, borderRadius: 6,
                background: isA || isB ? BPI.accent : BPI.card,
                boxShadow: `0 0 0 1.5px ${BPI.ink40}, 0 0 0 3px ${BPI.paper}`,
                zIndex: 1,
              }} />
              <div style={{
                padding: '10px 12px',
                background: isB ? BPI.card : 'transparent',
                border: isB || isA ? `1px solid ${BPI.accent}` : '1px solid transparent',
                borderRadius: 3,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span className="num" style={{ fontSize: 12, fontWeight: 700, fontFamily: BPIMono }}>{v.v}</span>
                  {(isA || isB) && (
                    <span className="chip accent" style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px' }}>
                      {isB ? 'B (this)' : 'A (compare)'}
                    </span>
                  )}
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 10, color: BPI.ink55, fontFamily: BPIMono }}>{v.when}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <ReviewerChip r={v.who} ringTone="neutral" />
                  <div style={{ fontSize: 11, color: BPI.ink70 }}>{v.who.name}</div>
                </div>
                <div style={{ fontSize: 11.5, color: BPI.ink70, lineHeight: 1.45, marginTop: 4 }}>{v.note}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, fontSize: 9.5, color: BPI.ink55, fontFamily: BPIMono }}>
                  <span>{v.claims} claims</span>
                  <span style={{ color: BPI.ink20 }}>·</span>
                  <span>{v.cites} cites</span>
                  <span style={{ color: BPI.ink20 }}>·</span>
                  <span>{v.caveats} caveats</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DiffBody() {
  return (
    <div style={{ overflow: 'auto', padding: '24px 32px' }}>
      <div style={{ marginBottom: 18, fontSize: 13.5, color: BPI.ink70, lineHeight: 1.6, maxWidth: 720 }}>
        Differences between <b>v0.3</b> (J. Lim, May 8) and <b>v0.4</b> (C. Pherson, today).
        Showing only claims that changed.
      </div>

      <DiffClaim
        n={2}
        title="A single corridor accounts for 43% of measured delay"
        kind="edited"
        before="On the 1.5 miles of Madison Avenue between East 28 and East 58, M15 SBS buses are noticeably slower than the rest of the route. This corridor accounts for a large share of the route's total delay."
        after={<>On the 1.5 miles of Madison Avenue between East 28th and East 58th Streets, M15 SBS buses <ins>average <b>4.2 mph northbound</b> on weekdays</ins>,<sup style={{ color: BPI.accent, fontWeight: 700, fontSize: '0.7em' }}>5</sup> approximately <ins><b>43%</b></ins> of the route's total measured rider-hour delay.<sup style={{ color: BPI.accent, fontWeight: 700, fontSize: '0.7em' }}>5</sup></>}
        evidenceAdded={['18,420 RH/day · Madison segment (computed)', 'Hour-by-hour speed figure', 'M1 pilot windowing']}
        caveatAdded='"Speed" includes rider experience'
      />

      <DiffClaim
        n={4}
        title="Treatment gap on Madison Av"
        kind="edited"
        before="The bus lane gap on Madison Av is a likely contributor to the slowdown."
        after={<>On Madison Avenue, the bus lane covers <ins><b>only the southernmost third</b> of this segment</ins>; <ins>ACE enforcement does not extend to Madison Av at all.</ins><sup style={{ color: BPI.accent, fontWeight: 700, fontSize: '0.7em' }}>7</sup></>}
        evidenceAdded={['DOT bus-lane geometry · Madison Av']}
        flagAdded="strength dropped from 3 → 2 (weak)"
      />
    </div>
  );
}

function DiffClaim({ n, title, kind, before, after, evidenceAdded, caveatAdded, flagAdded }) {
  return (
    <div style={{
      marginBottom: 28, padding: '20px 22px',
      background: BPI.card, borderRadius: 3,
      boxShadow: `0 0 0 1px ${BPI.rule}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
        <span className="num" style={{ fontSize: 11, fontWeight: 700, color: BPI.ink55, fontFamily: BPIMono }}>0{n}</span>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>{title}</div>
        <div style={{ flex: 1 }} />
        <span className="chip" style={{
          fontSize: 10, fontWeight: 700,
          background: kind === 'added' ? BPI.goodBg : kind === 'removed' ? BPI.badBg : BPI.warnBg,
          color:      kind === 'added' ? BPI.good   : kind === 'removed' ? BPI.bad   : BPI.warn,
        }}>{kind.toUpperCase()}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>v0.3 · before</div>
          <div style={{
            padding: 12, background: BPI.badBg, color: BPI.ink70,
            borderRadius: 3, fontSize: 13, lineHeight: 1.6,
            textDecoration: 'line-through', textDecorationColor: 'rgba(0,0,0,0.25)',
          }}>{before}</div>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>v0.4 · after</div>
          <div style={{
            padding: 12, background: BPI.goodBg, color: BPI.ink,
            borderRadius: 3, fontSize: 13, lineHeight: 1.6,
          }}>{after}</div>
        </div>
      </div>

      <style>{`.bpi ins { background: oklch(0.92 0.09 155); padding: 0 2px; border-radius: 2px; text-decoration: none; color: ${BPI.ink}; font-weight: 600; }`}</style>

      {(evidenceAdded || caveatAdded || flagAdded) && (
        <div style={{
          marginTop: 16, paddingTop: 14, boxShadow: `inset 0 1px 0 ${BPI.rule}`,
          display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12,
        }}>
          {evidenceAdded && evidenceAdded.map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="chip good" style={{ fontSize: 9, fontWeight: 700 }}>+ EVIDENCE</span>
              <span style={{ color: BPI.ink70 }}>{e}</span>
            </div>
          ))}
          {caveatAdded && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="chip warn" style={{ fontSize: 9, fontWeight: 700 }}>+ CAVEAT</span>
              <span style={{ color: BPI.ink70 }}>{caveatAdded}</span>
            </div>
          )}
          {flagAdded && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="chip" style={{ fontSize: 9, fontWeight: 700, background: BPI.warnBg, color: BPI.warn }}>FLAG</span>
              <span style={{ color: BPI.ink70 }}>{flagAdded}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { RF_BriefReview, RF_BriefHistory });
