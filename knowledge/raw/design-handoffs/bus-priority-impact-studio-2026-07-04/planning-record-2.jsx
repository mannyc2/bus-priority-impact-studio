// planning-record-2.jsx — directions A2, A3, A4. Loads after planning-record.jsx.

// ═════════════════════════════════════════════════════════════
// A2 · Activity spine — the compact, header-ready read.
// A horizontal year axis with per-quarter event density, colored by phase,
// plus milestone pins. Shows the bursts of engagement and the long quiet
// gaps at a glance — sized to sit at the top of a route page.
// ═════════════════════════════════════════════════════════════
function PR_ActivitySpine() {
  // Quarter buckets 2014 Q1 → 2019 Q1. Each: count + dominant phase.
  const years = [2014, 2015, 2016, 2017, 2018];
  const quarters = [];
  years.forEach((y) => [1, 2, 3, 4].forEach((q) => quarters.push({ y, q })));
  quarters.push({ y: 2019, q: 1 });
  // Map WD_EVENTS into quarter index.
  const qi = (date) => {
    const [yy, mm] = date.split('-').map(Number);
    return quarters.findIndex((c) => c.y === yy && c.q === Math.ceil(mm / 3));
  };
  const counts = quarters.map(() => ({ n: 0, phase: null }));
  WD_EVENTS.forEach((e) => { const idx = qi(e.date); if (idx >= 0) { counts[idx].n += 1; counts[idx].phase = e.phase; } });
  const maxN = Math.max(...counts.map((c) => c.n), 1);

  const milestones = [
    { date: '2015-09', label: 'Design chosen', tone: BPI.accent },
    { date: '2017-11', label: 'SBS launch', tone: BPI.good },
  ];

  const W = 680, padL = 8, padR = 8, axisY = 132, barMax = 92;
  const cw = (W - padL - padR) / quarters.length;
  const xAt = (idx) => padL + idx * cw + cw / 2;

  const Spine = ({ height }) => (
    <div style={{ background: BPI.card, borderRadius: 3, boxShadow: `0 0 0 1px ${BPI.rule}`, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <RouteBadge route="Q52" size="sm" sbs />
        <RouteBadge route="Q53" size="sm" sbs />
        <span style={{ fontSize: 12.5, color: BPI.ink70 }}>Woodhaven / Cross Bay Blvd</span>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 12 }}>
          {[['studied', 'Studied'], ['promised', 'Promised'], ['built', 'Built'], ['measured', 'Measured']].map(([k, l]) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: BPI.ink55 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: PR_PHASES[k].fill }} />{l}
            </span>
          ))}
        </div>
      </div>
      <svg width={W} height={height} style={{ display: 'block', overflow: 'visible' }}>
        {/* milestone pins */}
        {milestones.map((m, i) => {
          const idx = qi(m.date); const x = xAt(idx);
          return (
            <g key={i}>
              <line x1={x} x2={x} y1={6} y2={axisY} stroke={m.tone} strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
              <circle cx={x} cy={6} r="3.5" fill={m.tone} />
              <text x={x} y={-4} fontSize="10" fontWeight="600" textAnchor={idx > quarters.length - 4 ? 'end' : 'middle'} fill={m.tone}>{m.label}</text>
            </g>
          );
        })}
        {/* bars */}
        {counts.map((c, i) => {
          if (!c.n) return null;
          const h = (c.n / maxN) * barMax;
          return <rect key={i} x={xAt(i) - cw * 0.32} width={cw * 0.64} y={axisY - h} height={h} rx="1.5" fill={PR_PHASES[c.phase].fill} />;
        })}
        {/* axis */}
        <line x1={padL} x2={W - padR} y1={axisY} y2={axisY} stroke={BPI.rule} />
        {years.concat(2019).map((y) => {
          const idx = quarters.findIndex((c) => c.y === y && c.q === 1);
          const x = padL + idx * cw;
          return (
            <g key={y}>
              <line x1={x} x2={x} y1={axisY} y2={axisY + 4} stroke={BPI.ink20} />
              <text x={x} y={axisY + 16} fontSize="10" fill={BPI.ink55} fontFamily={BPIMono}>{y}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );

  return (
    <ConceptFrame
      tag="A2"
      title="Activity spine"
      intent="The same record compressed to a band for the route header and search rows. Quarterly event density colored by phase, with milestone pins — you instantly see the two engagement bursts (2014–15 planning, 2017–18 build) and the quiet 18 months in between where the project went dark.">
      <Spine height={axisY + 24} />
      <div style={{ marginTop: 24 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>HOW IT READS IN A SEARCH ROW (compact)</div>
        <div style={{ background: BPI.card, borderRadius: 3, boxShadow: `0 0 0 1px ${BPI.rule}`, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 18 }}>
          <RouteBadge route="Utica" size="sm" />
          <div style={{ width: 150 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Utica Ave BRT</div>
            <div style={{ fontSize: 11, color: BPI.ink55, marginTop: 2 }}>studied, never built</div>
          </div>
          {/* mini spine: dense studied bars, then nothing */}
          <svg width={320} height={40} style={{ display: 'block' }}>
            {[3, 5, 4, 6, 4, 2].map((n, i) => (
              <rect key={i} x={i * 22 + 4} width={12} y={36 - n * 4.5} height={n * 4.5} rx="1.5" fill={PR_PHASES.studied.fill} />
            ))}
            <line x1={0} x2={320} y1={37} y2={37} stroke={BPI.rule} />
            <text x={150} y={20} fontSize="10" fill={BPI.ink40} fontFamily={BPIMono} fontStyle="italic">— stalled after 2015 —</text>
          </svg>
          <div style={{ marginLeft: 'auto' }}><Caveat tone="warn" inline>never built</Caveat></div>
        </div>
      </div>
    </ConceptFrame>
  );
}

// ═════════════════════════════════════════════════════════════
// A3 · Promised → built track
// Treatments as spans: where a proposed design element was first promised,
// and when (or whether) it was built. The lag, and the danglers, are the
// point — only possible because every proposal and build is dated + cited.
// ═════════════════════════════════════════════════════════════
const WD_TREATMENTS = [
  { name: 'Offset bus lanes', proposed: '2015-06', built: '2018-01' },
  { name: 'Transit signal priority', proposed: '2015-06', built: '2018-01' },
  { name: 'Turn bays at 5 intersections', proposed: '2015-03', built: '2018-01' },
  { name: 'Pedestrian islands', proposed: '2015-09', built: null },
  { name: 'Curb extensions at stops', proposed: '2015-09', built: null },
];
function PR_PromisedBuiltTrack() {
  const t0 = '2015-01', t1 = '2018-06';
  const span = monthsBetween(t0, t1);
  const x = (d) => (monthsBetween(t0, d) / span) * 100;
  const W = 560;
  return (
    <ConceptFrame
      tag="A3"
      title="Promised → built track"
      intent="Each street-design element drawn as a span from the date it was first proposed to the date it was built — or left dangling if it never was. The corpus dates both ends, so the delivery lag (and the quiet drop of pedestrian islands) becomes visible instead of buried.">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <RouteBadge route="Q52" size="sm" sbs />
        <span style={{ fontSize: 13, color: BPI.ink70 }}>Woodhaven / Cross Bay Blvd</span>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 14, fontSize: 10.5, color: BPI.ink55 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: BPI.accent }} />proposed</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: BPI.good }} />built</span>
        </div>
      </div>
      {/* year scale */}
      <div style={{ position: 'relative', marginLeft: 220, height: 18, marginBottom: 6 }}>
        {['2015', '2016', '2017', '2018'].map((y) => (
          <div key={y} style={{ position: 'absolute', left: x(y + '-01') + '%', fontFamily: BPIMono, fontSize: 10, color: BPI.ink40, transform: 'translateX(-50%)' }}>{y}</div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {WD_TREATMENTS.map((tr, i) => {
          const px = x(tr.proposed), bx = tr.built ? x(tr.built) : 100;
          const lag = tr.built ? gapLabel(monthsBetween(tr.proposed, tr.built)) : null;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '9px 0', boxShadow: i < WD_TREATMENTS.length - 1 ? `inset 0 -1px 0 ${BPI.rule}` : 'none' }}>
              <div style={{ width: 210, paddingRight: 10, fontSize: 12.5, fontWeight: 500, color: tr.built ? BPI.ink : BPI.ink70 }}>{tr.name}</div>
              <div style={{ position: 'relative', flex: 1, height: 22 }}>
                {/* track line */}
                <div style={{ position: 'absolute', left: px + '%', right: (100 - bx) + '%', top: 9, height: 4, borderRadius: 2, background: tr.built ? BPI.good : 'transparent', backgroundImage: tr.built ? 'none' : `repeating-linear-gradient(90deg, ${BPI.warn} 0 4px, transparent 4px 8px)`, opacity: tr.built ? 0.5 : 0.7 }} />
                {/* proposed node */}
                <div style={{ position: 'absolute', left: px + '%', top: 5, width: 11, height: 11, borderRadius: 6, background: BPI.accent, transform: 'translateX(-50%)', boxShadow: `0 0 0 2px ${BPI.paper}` }} />
                {/* built node or dangling */}
                {tr.built ? (
                  <>
                    <div style={{ position: 'absolute', left: bx + '%', top: 5, width: 11, height: 11, borderRadius: 6, background: BPI.good, transform: 'translateX(-50%)', boxShadow: `0 0 0 2px ${BPI.paper}` }} />
                    <div style={{ position: 'absolute', left: ((px + bx) / 2) + '%', top: -8, transform: 'translateX(-50%)', fontFamily: BPIMono, fontSize: 9, color: BPI.ink40 }}>{lag}</div>
                  </>
                ) : (
                  <div style={{ position: 'absolute', right: 0, top: 3, fontFamily: BPIMono, fontSize: 10, fontWeight: 700, color: BPI.warn }}>not built →</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 16 }}>
        <Caveat tone="warn">
          Two pedestrian treatments proposed in 2015 never appear in any build record — exactly the kind of dropped promise that's invisible when the planning history lives in 100 separate PDFs.
        </Caveat>
      </div>
    </ConceptFrame>
  );
}

// ═════════════════════════════════════════════════════════════
// A4 · Event detail — the atom behind one timeline dot.
// What opens when you click an event: the source page, the verbatim record,
// every claim/metric extracted from it, authority + confidence.
// ═════════════════════════════════════════════════════════════
function ExtractRow({ kind, status, text }) {
  const tone = status === 'measured' ? BPI.good : status === 'proposed' ? BPI.accent : BPI.ink40;
  return (
    <div style={{ display: 'flex', gap: 10, padding: '10px 0', boxShadow: `inset 0 -1px 0 ${BPI.rule}` }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: tone, marginTop: 5, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: BPI.ink55, letterSpacing: '0.01em' }}>{kind}</span>
          {status && <TruthBadge status={status} />}
        </div>
        <div style={{ fontSize: 12.5, color: BPI.ink, lineHeight: 1.45 }}>{text}</div>
      </div>
    </div>
  );
}
function PR_EventDetail() {
  return (
    <ConceptFrame
      tag="A4"
      title="Event detail — the atom"
      intent="What opens when an analyst clicks a single dot. One event resolves to its source page, the agency's verbatim wording, and every atomic record extracted from it — each truth-tagged and traceable. This is the depth that backs every dot in the timeline above.">
      <div style={{ background: BPI.card, borderRadius: 3, boxShadow: `0 0 0 1px ${BPI.rule}`, padding: 20 }}>
        <div style={{ display: 'flex', gap: 18 }}>
          <SlideThumb w={172} h={116} label="open-house deck · p.12" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <FamilyTag family="proposed_benefit" />
              <TruthBadge status="proposed" />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.25, marginBottom: 8 }}>DOT projects faster trips for the preferred design</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <SourceRef doc="Open-house deck" page={12} date="Sep 2015" authority="NYC DOT" />
            </div>
          </div>
        </div>

        <div style={{ marginTop: 18, padding: '13px 15px', background: BPI.paperDeep, borderRadius: 3, borderLeft: `2px solid ${BPI.ink20}` }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>VERBATIM ON THE PAGE</div>
          <div style={{ fontSize: 13.5, color: BPI.ink, lineHeight: 1.55 }}>“The preferred design is projected to speed buses 15–25% along the corridor, with the largest gains on the busiest segments.”</div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>WHAT THIS EVENT PUT ON THE RECORD — 3 ITEMS</div>
          <ExtractRow kind="Metric" status="proposed" text="15–25% projected faster trips · bus travel time · Woodhaven corridor · post-build projection" />
          <ExtractRow kind="Claim · projected benefit" status="proposed" text="The preferred design will deliver the largest time savings on the corridor's busiest segments." />
          <ExtractRow kind="Route match" text="Linked to Q52 / Q53 SBS" />
        </div>

        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: BPI.ink55 }}>
          <span style={{ color: BPI.accent, fontWeight: 600 }}>On NYC DOT&rsquo;s public record</span>
          <span style={{ color: BPI.ink20 }}>·</span>
          <span>stated as projected, not yet measured</span>
          <span style={{ color: BPI.ink20 }}>·</span>
          <span>safe to paraphrase</span>
        </div>
      </div>
    </ConceptFrame>
  );
}

window.PR_ActivitySpine = PR_ActivitySpine;
window.PR_PromisedBuiltTrack = PR_PromisedBuiltTrack;
window.PR_EventDetail = PR_EventDetail;
