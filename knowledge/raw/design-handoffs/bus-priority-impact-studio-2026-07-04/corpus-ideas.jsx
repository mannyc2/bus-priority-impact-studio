// corpus-ideas.jsx — LOW-FIDELITY concept directions for surfacing the
// Tier-2 planning-record corpus inside the Bus Priority Impact Studio.
// Reads BPI tokens + primitives off window (system.jsx must load first).
//
// These are IDEAS, not specs. The cited-evidence chip + corridor timeline
// patterns are "safe bets" (they don't depend on final field names); the
// structured "What we know" panel is intentionally left rough because the
// event/claim payload isn't schema-frozen yet.

// ─────────────────────────────────────────────────────────────
// Concept primitives
// ─────────────────────────────────────────────────────────────

// TruthBadge — the single most important new affordance. Every fact pulled
// from the corpus carries a truth status; the UI must never let a proposal
// or a methodology definition read as a measured outcome. Four postures.
function TruthBadge({ status }) {
  const map = {
    measured:   { label: 'MEASURED',  bg: BPI.goodBg,   fg: BPI.good,   dot: BPI.good },
    proposed:   { label: 'PROPOSED',  bg: BPI.accentBg, fg: BPI.accent, dot: BPI.accent },
    statement:  { label: 'ON RECORD', bg: BPI.ink06,    fg: BPI.ink70,  dot: BPI.ink40 },
    method:     { label: 'METHOD',    bg: BPI.ink06,    fg: BPI.ink55,  dot: BPI.ink20 },
  };
  const v = map[status] || map.statement;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: v.bg, color: v.fg, borderRadius: 3,
      padding: '2px 7px 2px 6px', fontSize: 9.5, fontWeight: 700,
      letterSpacing: '0.07em', fontFamily: BPIMono, lineHeight: 1,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: 3, background: v.dot }} />
      {v.label}
    </span>
  );
}

// SourceRef — provenance pointer. Doc + page + date, mono, quiet. This is
// what makes a stat trustworthy: it traces back to the exact PDF page.
// authority is opt-in (pass it where the agency framing matters, e.g. a
// standalone callout) so it isn't repeated on every row of a timeline.
function SourceRef({ doc, page, date, authority }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      fontFamily: BPIMono, fontSize: 10.5, color: BPI.ink55, lineHeight: 1.3,
    }}>
      <svg width="11" height="13" viewBox="0 0 11 13" fill="none" style={{ flexShrink: 0, marginTop: -1 }}>
        <path d="M1 1h6l3 3v8H1z" stroke={BPI.ink40} strokeWidth="1" />
        <path d="M7 1v3h3" stroke={BPI.ink40} strokeWidth="1" />
        <path d="M3 6.5h5M3 9h5" stroke={BPI.ink40} strokeWidth="0.8" />
      </svg>
      <span style={{ color: BPI.ink70 }}>{doc}</span>
      {page && <span style={{ color: BPI.ink40 }}>· p.{page}</span>}
      {date && <span style={{ color: BPI.ink40 }}>· {date}</span>}
      {authority && <span style={{
        color: BPI.accent, fontWeight: 600, letterSpacing: '0.02em',
      }}>{authority}</span>}
    </span>
  );
}

// EvidenceCallout — the core reusable unit. A claim or metric, rendered as
// "DOT reported X" with the verbatim quote, truth status, and provenance.
// `quoteGated` flips presentation to a literal blockquote (publication
// wording gate = "must be quoted, not paraphrased").
function EvidenceCallout({ status, stat, statUnit, body, quote, doc, page, date, route, sbs, quoteGated }) {
  const accent = status === 'measured' ? BPI.good : status === 'proposed' ? BPI.accent : BPI.ink40;
  return (
    <div style={{
      background: BPI.card, borderRadius: 3,
      boxShadow: `0 0 0 1px ${BPI.rule}`,
      borderLeft: `3px solid ${accent}`,
      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {route && <RouteBadge route={route} size="sm" sbs={sbs} />}
        <TruthBadge status={status} />
        <div style={{ flex: 1 }} />
      </div>
      {stat !== undefined && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span className="num" style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em', color: accent, lineHeight: 1 }}>{stat}</span>
          {statUnit && <span style={{ fontSize: 13, color: BPI.ink55 }}>{statUnit}</span>}
        </div>
      )}
      {body && <div style={{ fontSize: 13, color: BPI.ink, lineHeight: 1.5, letterSpacing: '-0.003em' }}>{body}</div>}
      {quote && (
        <div style={{
          fontSize: quoteGated ? 13.5 : 12, lineHeight: 1.55,
          color: quoteGated ? BPI.ink : BPI.ink70,
          fontStyle: quoteGated ? 'normal' : 'italic',
          paddingLeft: quoteGated ? 12 : 0,
          borderLeft: quoteGated ? `2px solid ${BPI.ink20}` : 'none',
        }}>{quoteGated ? '“' : ''}{quote}{quoteGated ? '”' : ''}</div>
      )}
      <div className="rule" />
      <SourceRef doc={doc} page={page} date={date} />
    </div>
  );
}

// CorpusChip — the inline form: a fact dropped inside a sentence. Carries a
// hover-able cite marker + truth dot so the reader knows its standing without
// breaking the prose line.
function CorpusChip({ children, status = 'measured', n }) {
  const dot = status === 'measured' ? BPI.good : status === 'proposed' ? BPI.accent : BPI.ink40;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: BPI.ink06, borderRadius: 3, padding: '1px 7px',
      fontSize: 'inherit', fontWeight: 500, lineHeight: 1.5,
      boxShadow: `inset 0 0 0 1px ${BPI.ink10}`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: 3, background: dot, flexShrink: 0 }} />
      {children}
      {n && <Cite n={n} />}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// ConceptFrame — consistent shell for each idea: eyebrow + intent line.
// ─────────────────────────────────────────────────────────────
function ConceptFrame({ tag, title, intent, fidelity = 'concept', children }) {
  const fid = {
    concept: { label: 'CONCEPT', fg: BPI.accent },
    rough:   { label: 'ROUGH · payload not frozen', fg: BPI.warn },
  }[fidelity];
  return (
    <div className="bpi" style={{ height: '100%', background: BPI.paper, padding: 28, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span style={{ fontFamily: BPIMono, fontSize: 10.5, fontWeight: 700, color: BPI.ink40, letterSpacing: '0.1em' }}>{tag}</span>
        <span style={{
          fontFamily: BPIMono, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
          color: fid.fg, border: `1px solid ${fid.fg}`, borderRadius: 2, padding: '1px 5px',
        }}>{fid.label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.018em', lineHeight: 1.15 }}>{title}</div>
      <div style={{ fontSize: 13, color: BPI.ink70, marginTop: 7, lineHeight: 1.5, maxWidth: 640 }}>{intent}</div>
      <div className="rule" style={{ margin: '18px 0 20px' }} />
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// CONCEPT A · Corridor planning record
// A dated, typed, source-cited stream of what the agency promised, studied,
// and built for a corridor — pulled straight from event_candidate rows.
// ═════════════════════════════════════════════════════════════
const FAMILY_TONE = {
  planning:               BPI.ink40,
  community_outreach:     BPI.accent,
  proposed_design:        BPI.accent,
  street_design:          BPI.accent,
  service_launch:         BPI.good,
  performance_monitoring: BPI.good,
};
// Human labels for the canonical event families. The raw snake_case enums
// are internal plumbing — never shown. Category reads as a calm eyebrow;
// phase colour lives on the spine node + truth badge, not here.
const FAMILY_LABEL = {
  planning:               'Study milestone',
  community_outreach:     'Public outreach',
  proposed_design:        'Design proposal',
  proposed_benefit:       'Projected benefit',
  traffic_analysis:       'Corridor analysis',
  street_design:          'Construction',
  service_launch:         'Service launch',
  performance_monitoring: 'Monitoring',
};
function FamilyTag({ family }) {
  const label = FAMILY_LABEL[family] || family.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, color: BPI.ink55,
      letterSpacing: '0.01em', whiteSpace: 'nowrap',
    }}>{label}</span>
  );
}

const WOODHAVEN_EVENTS = [
  { date: '2014-05', family: 'planning', phase: 'studied', title: 'Woodhaven / Cross Bay SBS study kickoff', doc: 'Woodhaven kickoff deck', page: 3 },
  { date: '2014-09', family: 'community_outreach', phase: 'studied', title: 'Planning workshop #1 — corridor conditions', doc: 'Planning workshop boards', page: 11 },
  { date: '2015-03', family: 'proposed_design', phase: 'promised', title: 'Offset bus lanes + turn bays presented as conceptual option', doc: 'Public-workshop boards', page: 8, gate: true },
  { date: '2015-06', family: 'community_outreach', phase: 'promised', title: 'Open-house newsletter mailed to corridor', doc: 'Project newsletter #2', page: 1 },
  { date: '2017-11', family: 'service_launch', phase: 'built', title: 'Q52 / Q53 SBS service launched', doc: 'Service-change notice', page: 2 },
  { date: '2018-10', family: 'performance_monitoring', phase: 'measured', title: 'DOT reports 15–23% faster speeds corridor-wide', doc: 'SBS progress report', page: 12, measured: true },
];

function CI_PlanningRecord() {
  return (
    <ConceptFrame
      tag="A1"
      title="Corridor planning record"
      intent="A new route-detail tab. Every dated event the agency put on the public record — kickoff, workshops, proposed designs, launch, monitoring — typed by canonical family and traced to the exact PDF page. This is the “what was promised, studied, and built” layer you can’t get without reading 100 decks.">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <RouteBadge route="Q52" size="md" sbs />
        <RouteBadge route="Q53" size="md" sbs />
        <span style={{ fontSize: 13, color: BPI.ink70 }}>Woodhaven / Cross Bay Blvd</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: BPIMono, fontSize: 10.5, color: BPI.ink55 }}>6 events · 5 source docs · 2014–2018</span>
      </div>
      <div style={{ position: 'relative', paddingLeft: 116 }}>
        <div style={{ position: 'absolute', left: 108, top: 8, bottom: 8, width: 1, background: BPI.rule }} />
        {WOODHAVEN_EVENTS.map((e, i) => (
          <div key={i} style={{ position: 'relative', paddingBottom: i === WOODHAVEN_EVENTS.length - 1 ? 0 : 20 }}>
            <div className="num" style={{ position: 'absolute', left: -116, top: 1, width: 96, textAlign: 'right', fontFamily: BPIMono, fontSize: 11, color: BPI.ink55, fontWeight: 600 }}>{e.date}</div>
            <div style={{
              position: 'absolute', left: -12.5, top: 3, width: 11, height: 11, borderRadius: 6,
              background: e.measured ? BPI.good : e.family === 'service_launch' ? BPI.good : BPI.card,
              boxShadow: `0 0 0 2px ${BPI.paper}, inset 0 0 0 ${e.measured || e.family === 'service_launch' ? 0 : 1.5}px ${FAMILY_TONE[e.family] || BPI.ink40}`,
            }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <FamilyTag family={e.family} />
              {e.measured && <TruthBadge status="measured" />}
              {e.gate && <TruthBadge status="proposed" />}
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.35, marginBottom: 6 }}>{e.title}</div>
            <SourceRef doc={e.doc} page={e.page} />
          </div>
        ))}
      </div>
    </ConceptFrame>
  );
}

// A2 · Phase ribbon — the same lifecycle compressed to a glanceable band,
// for the route header. Shows where a corridor actually is: many have a rich
// "promised/studied" record but never reached "built".
const PHASES = [
  { key: 'studied',  label: 'Studied',  n: 14 },
  { key: 'promised', label: 'Promised', n: 9 },
  { key: 'built',    label: 'Built',    n: 3 },
  { key: 'measured', label: 'Measured', n: 2 },
];
function PhaseRibbon({ reached, counts }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {PHASES.map((p, i) => {
        const on = i <= reached;
        const tone = p.key === 'measured' || p.key === 'built' ? BPI.good : BPI.accent;
        return (
          <div key={p.key} style={{ flex: 1 }}>
            <div style={{ height: 6, borderRadius: 2, background: on ? tone : BPI.ink10, opacity: on ? (i === reached ? 1 : 0.55) : 1 }} />
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: on ? 600 : 400, color: on ? BPI.ink : BPI.ink40 }}>{p.label}</div>
            <div className="num" style={{ fontSize: 11, fontFamily: BPIMono, color: on ? BPI.ink55 : BPI.ink20, marginTop: 2 }}>{counts[i]} events</div>
          </div>
        );
      })}
    </div>
  );
}
function CI_PhaseRibbon() {
  const rows = [
    { route: 'Q52', sbs: true, name: 'Woodhaven / Cross Bay', reached: 3, counts: [14, 9, 3, 2] },
    { route: 'B44', sbs: true, name: 'Nostrand Ave', reached: 3, counts: [22, 11, 5, 4] },
    { route: 'Utica', sbs: false, name: 'Utica Ave BRT', reached: 1, counts: [18, 6, 0, 0] },
    { route: 'M60', sbs: true, name: '125th St / LaGuardia', reached: 3, counts: [9, 5, 4, 3] },
  ];
  return (
    <ConceptFrame
      tag="A2"
      title="Lifecycle ribbon"
      intent="A compressed read of the same record for the route header and search results. Promised → studied → built → measured, with event counts. Surfaces the corridors that were heavily planned but never built — Utica Ave BRT stalled at “studied,” and the corpus proves it.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ background: BPI.card, borderRadius: 3, boxShadow: `0 0 0 1px ${BPI.rule}`, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <RouteBadge route={r.route} size="sm" sbs={r.sbs} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</span>
              {r.reached === 1 && <span style={{ marginLeft: 'auto' }}><Caveat tone="warn" inline>never built</Caveat></span>}
            </div>
            <PhaseRibbon reached={r.reached} counts={r.counts} />
          </div>
        ))}
      </div>
    </ConceptFrame>
  );
}

window.CI_PlanningRecord = CI_PlanningRecord;
window.CI_PhaseRibbon = CI_PhaseRibbon;
window.TruthBadge = TruthBadge;
window.SourceRef = SourceRef;
window.EvidenceCallout = EvidenceCallout;
window.CorpusChip = CorpusChip;
window.ConceptFrame = ConceptFrame;
window.FamilyTag = FamilyTag;
