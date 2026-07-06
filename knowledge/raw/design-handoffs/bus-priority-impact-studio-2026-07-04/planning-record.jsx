// planning-record.jsx — deep dive on the "Planning record" concept.
// Four directions for turning the corpus's dated, typed, cited event stream
// into the studio's strongest surface. Loads after corpus-ideas.jsx
// (ConceptFrame, TruthBadge, SourceRef, FamilyTag, RouteBadge live on window).

// ─────────────────────────────────────────────────────────────
// Shared: confidence pips + corridor dataset
// ─────────────────────────────────────────────────────────────
function ConfPips({ level }) {
  const n = level === 'high' ? 3 : level === 'medium' ? 2 : 1;
  const tone = level === 'high' ? BPI.good : level === 'medium' ? BPI.warn : BPI.bad;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: BPIMono, fontSize: 9.5, color: BPI.ink40, letterSpacing: '0.04em' }}>
      <span style={{ display: 'inline-flex', gap: 1.5 }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 4, height: 8, borderRadius: 1, background: i < n ? tone : BPI.ink10 }} />
        ))}
      </span>
      conf {level}
    </span>
  );
}

// Slide / page placeholder — striped, reads as "a deck page", not finished
// art. Used in the event-detail atom to stand in for the source page image.
function SlideThumb({ w = 150, h = 100, label = 'deck p.12' }) {
  return (
    <div style={{
      width: w, height: h, position: 'relative', flexShrink: 0,
      background: `repeating-linear-gradient(135deg, ${BPI.ink06} 0 7px, transparent 7px 16px), ${BPI.paperDeep}`,
      border: `1px solid ${BPI.rule}`, borderRadius: 2,
    }}>
      <div style={{ position: 'absolute', inset: 10, border: `1px dashed ${BPI.ink20}`, borderRadius: 1 }} />
      <div style={{ position: 'absolute', left: 8, bottom: 6, fontFamily: BPIMono, fontSize: 8.5, color: BPI.ink55 }}>{label}</div>
    </div>
  );
}

// Canonical phase model — the lifecycle arc the corpus lets us assemble.
const PR_PHASES = {
  studied:  { label: 'Studied',  tone: BPI.ink55,  fill: BPI.ink40 },
  promised: { label: 'Promised', tone: BPI.accent, fill: BPI.accent },
  built:    { label: 'Built',    tone: BPI.good,   fill: BPI.good },
  measured: { label: 'Measured', tone: BPI.good,   fill: BPI.good },
};

// Woodhaven / Cross Bay Blvd SBS (Q52/Q53) — a corridor with a full arc.
// Each event carries family, phase, what it put on record, and provenance.
const WD_EVENTS = [
  { date: '2014-04', phase: 'studied', family: 'planning', title: 'DOT & MTA NYCT launch Woodhaven / Cross Bay SBS study', doc: 'Study kickoff deck', page: 2, conf: 'high', carries: '2 context signals' },
  { date: '2014-06', phase: 'studied', family: 'community_outreach', title: 'Public workshop #1 — corridor problems mapped with riders', doc: 'Planning workshop boards', page: 5, conf: 'high', carries: '4 problem statements' },
  { date: '2014-10', phase: 'studied', family: 'traffic_analysis', title: 'Existing conditions documented', doc: 'Existing-conditions report', page: 18, conf: 'high', carries: '1 metric', metric: { status: 'statement', stat: '6.4 mph', unit: 'avg peak bus speed, baseline', quote: 'Buses on Woodhaven Blvd average 6.4 mph during the PM peak' } },
  { date: '2015-03', phase: 'promised', family: 'proposed_design', title: 'Three lane-configuration options presented', doc: 'Public-workshop boards', page: 8, conf: 'high', gate: true, carries: '3 treatment options' },
  { date: '2015-06', phase: 'promised', family: 'proposed_design', title: 'Offset bus lanes + turn bays chosen as preferred design', doc: 'Project newsletter #2', page: 1, conf: 'high', carries: '5 treatment components' },
  { date: '2015-09', phase: 'promised', family: 'proposed_benefit', title: 'DOT projects faster trips for the preferred design', doc: 'Open-house deck', page: 12, conf: 'medium', key: true, carries: '1 projected benefit', metric: { status: 'proposed', stat: '15–25%', unit: 'projected faster trips', quote: 'The preferred design is projected to speed buses 15–25% along the corridor' } },
  { date: '2016-02', phase: 'promised', family: 'community_outreach', title: 'CB9 & CB10 transportation-committee presentations', doc: 'CB9 / CB10 decks', page: 4, conf: 'medium', carries: '6 public-feedback notes' },
  { date: '2017-11', phase: 'built', family: 'service_launch', title: 'Q52 / Q53 SBS service begins', doc: 'Service-change notice', page: 2, conf: 'high', carries: '1 service change' },
  { date: '2018-01', phase: 'built', family: 'street_design', title: 'Bus lanes + transit signal priority installed corridor-wide', doc: 'Implementation update', page: 4, conf: 'high', carries: '4 treatment components' },
  { date: '2018-10', phase: 'measured', family: 'performance_monitoring', title: 'DOT reports measured speed & ridership gains', doc: 'SBS progress report', page: 12, conf: 'high', key: true, carries: '2 metrics', metric: { status: 'measured', stat: '15–23%', unit: 'faster speeds · ridership +9%', quote: 'SBS has brought 15–23% faster bus speeds on the corridor' } },
];

// Gap (in months) between two YYYY-MM strings.
function monthsBetween(a, b) {
  const [ay, am] = a.split('-').map(Number); const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}
function gapLabel(m) {
  const y = Math.floor(m / 12), mo = m % 12;
  return (y ? y + ' yr ' : '') + (mo ? mo + ' mo' : '') || '0 mo';
}

// ═════════════════════════════════════════════════════════════
// A1 · Phased timeline — the lead direction.
// The stream banded into lifecycle phases, gaps made explicit, and each
// event showing the depth (extracted claims/metrics + a cited quote) that
// makes this more than a Wikipedia timeline.
// ═════════════════════════════════════════════════════════════
function MetricInset({ m }) {
  const tone = m.status === 'measured' ? BPI.good : m.status === 'proposed' ? BPI.accent : BPI.ink40;
  return (
    <div style={{ marginTop: 10, background: BPI.paperDeep, borderRadius: 3, padding: '11px 13px', borderLeft: `2px solid ${tone}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 5 }}>
        <span className="num" style={{ fontSize: 19, fontWeight: 600, color: tone, letterSpacing: '-0.02em', lineHeight: 1 }}>{m.stat}</span>
        <span style={{ fontSize: 11, color: BPI.ink55 }}>{m.unit}</span>
      </div>
      <div style={{ fontSize: 11.5, color: BPI.ink70, fontStyle: 'italic', lineHeight: 1.45 }}>“{m.quote}”</div>
    </div>
  );
}

function PR_PhasedTimeline() {
  // Build a flat render list with phase-band headers inserted.
  const rows = [];
  let lastPhase = null, lastDate = null;
  WD_EVENTS.forEach((e) => {
    // Quiet-period marker — checked across phase boundaries, since the most
    // telling gap (the 21 months before launch) coincides with one.
    if (lastDate) {
      const gap = monthsBetween(lastDate, e.date);
      if (gap >= 12) rows.push({ gap: gapLabel(gap) });
    }
    if (e.phase !== lastPhase) {
      const phaseEvents = WD_EVENTS.filter((x) => x.phase === e.phase);
      rows.push({ band: e.phase, span: phaseEvents[0].date + ' – ' + phaseEvents[phaseEvents.length - 1].date, n: phaseEvents.length });
      lastPhase = e.phase;
    }
    rows.push({ event: e });
    lastDate = e.date;
  });

  return (
    <ConceptFrame
      tag="A1"
      title="Phased planning record"
      intent="The lead direction. The agency's dated public record for one corridor, banded into the lifecycle arc — Studied → Promised → Built → Measured — with the silent gaps made explicit and every event opening onto the claims and metrics extracted from it, in DOT's own cited words.">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <RouteBadge route="Q52" size="md" sbs />
        <RouteBadge route="Q53" size="md" sbs />
        <span style={{ fontSize: 13, color: BPI.ink70 }}>Woodhaven / Cross Bay Blvd</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: BPIMono, fontSize: 10.5, color: BPI.ink55 }}>NYC DOT public record · 11 events · 2014–2018</span>
      </div>

      <div style={{ position: 'relative', paddingLeft: 112 }}>
        <div style={{ position: 'absolute', left: 104, top: 4, bottom: 4, width: 1, background: BPI.rule }} />
        {rows.map((r, i) => {
          if (r.band) {
            const ph = PR_PHASES[r.band];
            return (
              <div key={i} style={{ position: 'relative', margin: i === 0 ? '0 0 14px' : '22px 0 14px' }}>
                <div style={{ position: 'absolute', left: -12.5, top: 2, width: 11, height: 11, borderRadius: 2, background: ph.fill, boxShadow: `0 0 0 2px ${BPI.paper}` }} />
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: ph.tone, letterSpacing: '-0.01em' }}>{ph.label}</span>
                  <span className="num" style={{ fontFamily: BPIMono, fontSize: 10.5, color: BPI.ink40 }}>{r.span} · {r.n}</span>
                </div>
              </div>
            );
          }
          if (r.gap) {
            return (
              <div key={i} style={{ position: 'relative', padding: '4px 0 14px' }}>
                <div style={{ position: 'absolute', left: -9, top: 0, bottom: 8, width: 1, background: 'transparent', borderLeft: `1px dashed ${BPI.ink20}` }} />
                <span style={{ fontFamily: BPIMono, fontSize: 10, color: BPI.ink40, fontStyle: 'italic', background: BPI.paper, paddingRight: 6 }}>↕ {r.gap} — no public activity on record</span>
              </div>
            );
          }
          const e = r.event;
          const ph = PR_PHASES[e.phase];
          return (
            <div key={i} style={{ position: 'relative', paddingBottom: 18 }}>
              <div className="num" style={{ position: 'absolute', left: -112, top: 1, width: 92, textAlign: 'right', fontFamily: BPIMono, fontSize: 11, color: BPI.ink55, fontWeight: 600 }}>{e.date}</div>
              <div style={{ position: 'absolute', left: -11, top: 4, width: 8, height: 8, borderRadius: 5, background: e.phase === 'built' || e.phase === 'measured' ? ph.fill : BPI.card, boxShadow: `0 0 0 2px ${BPI.paper}, inset 0 0 0 ${e.phase === 'built' || e.phase === 'measured' ? 0 : 1.5}px ${ph.fill}` }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                <FamilyTag family={e.family} />
                {e.metric && (e.metric.status === 'proposed' || e.metric.status === 'measured') && <TruthBadge status={e.metric.status} />}
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.35, marginBottom: 7 }}>{e.title}</div>
              <SourceRef doc={e.doc} page={e.page} />
              {e.key && e.metric && <MetricInset m={e.metric} />}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 6 }}>
        <Caveat tone="info">
          The two highlighted events are the spine of the story: in 2015 DOT <b style={{ color: BPI.accent }}>projected</b> 15–25% faster trips; in 2018 it <b style={{ color: BPI.good }}>measured</b> 15–23%. The promise and the receipt, three years apart, both cited.
        </Caveat>
      </div>
    </ConceptFrame>
  );
}

window.PR_PhasedTimeline = PR_PhasedTimeline;
window.PR_PHASES = PR_PHASES;
window.WD_EVENTS = WD_EVENTS;
window.ConfPips = ConfPips;
window.SlideThumb = SlideThumb;
window.monthsBetween = monthsBetween;
window.gapLabel = gapLabel;
