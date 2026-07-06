// corpus-ideas-2.jsx — concepts B, C, D. Loads after corpus-ideas.jsx.

// ═════════════════════════════════════════════════════════════
// CONCEPT B · Cited-evidence primitive
// The backing unit for the authoring "insert from the corpus" flow and for
// any stat callout. One claim/metric, rendered with verbatim quote, truth
// status, and a pointer to the page it came from. Several postures.
// ═════════════════════════════════════════════════════════════
function CI_EvidenceSpecimens() {
  return (
    <ConceptFrame
      tag="B1"
      title="Cited-evidence primitive"
      intent="The reusable unit behind “insert from the corpus.” A metric or claim becomes a callout that shows the number, the agency’s own words, and the page it came from — and that knows whether it’s safe to restate as fact. Same data, four postures depending on truth status and wording gate.">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>

        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>MEASURED OUTCOME — the money shot</div>
          <EvidenceCallout
            status="measured" route="M60" sbs
            stat="32–34%" statUnit="faster in bus-lane section"
            body="DOT reported SBS trips ran faster after the bus lane, comparing like months a year apart."
            quote="SBS trips are 32–34% faster in bus lane section"
            doc="M60 SBS report" page={9} date="Oct 2013 → Oct 2014" />
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>PROPOSED TREATMENT — not yet built</div>
          <EvidenceCallout
            status="proposed" route="B41" sbs
            body="NYC DOT proposes a dedicated bus lane and pedestrian crosswalk at Glenwood Rd & E 98 St."
            quote="NYC DOT proposes a dedicated bus lane and pedestrian crosswalk at Glenwood Rd and E 98 St"
            doc="Flatbush Ave CAB2 deck" page={14} date="2024" />
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>QUOTE-GATED — must be quoted, not paraphrased</div>
          <EvidenceCallout
            status="statement" route="B82" sbs quoteGated
            quote="Offset bus lanes with 1 general traffic lane in each direction"
            doc="B82 SBS CB18 deck" page={6} date="2017" />
          <div style={{ fontSize: 11, color: BPI.ink55, marginTop: 8, lineHeight: 1.45 }}>
            Wording gate flips the body to a literal blockquote — the composer inserts it verbatim, never reworded.
          </div>
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>METHODOLOGY — never shown as an outcome</div>
          <EvidenceCallout
            status="method"
            body="Level-of-Service thresholds for the 34th St PM analysis: A–B ≤20s delay, C–D 20–45s, E 46–80s, F 80s+."
            quote="A methodology definition provided by the joint NYC DOT / MTA NYCT study team — not observed traffic data."
            doc="34th St SBS LOS analysis" page={22} date="2012 no-build" />
        </div>

      </div>

      {/* Inline form */}
      <div className="rule" style={{ margin: '22px 0 16px' }} />
      <div className="eyebrow" style={{ marginBottom: 12 }}>INLINE FORM — a corpus fact dropped inside brief prose</div>
      <div style={{ fontSize: 15, lineHeight: 1.85, color: BPI.ink, maxWidth: 720 }}>
        On the M86, the agency&rsquo;s own monitoring found{' '}
        <CorpusChip status="measured" n="4">ridership grew ~7% in the first 11 months</CorpusChip>{' '}
        of SBS service, while across the program DOT reports{' '}
        <CorpusChip status="measured" n="5">15–23% faster bus speeds</CorpusChip>. On Flatbush, the agency has only{' '}
        <CorpusChip status="proposed" n="6">proposed offset bus lanes</CorpusChip>{' '}
        &mdash; a conceptual option, not a commitment.
      </div>
    </ConceptFrame>
  );
}

// ═════════════════════════════════════════════════════════════
// CONCEPT C · Promised vs. delivered
// The analysis this corpus uniquely unlocks: put the agency's own promised /
// reported benefit next to our independently measured trend.
// ═════════════════════════════════════════════════════════════
function ReconRow({ route, sbs, metric, promised, promisedKind, measured, measuredVal, agree }) {
  return (
    <div style={{ background: BPI.card, borderRadius: 3, boxShadow: `0 0 0 1px ${BPI.rule}`, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <RouteBadge route={route} size="sm" sbs={sbs} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>{metric}</span>
        <div style={{ flex: 1 }} />
        <span style={{
          fontFamily: BPIMono, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
          color: agree ? BPI.good : BPI.warn,
          background: agree ? BPI.goodBg : BPI.warnBg, borderRadius: 2, padding: '2px 7px',
        }}>{agree ? '✓ CONSISTENT' : '⚠ DIVERGES'}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ paddingRight: 16, borderRight: `1px solid ${BPI.rule}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
            <TruthBadge status={promisedKind} />
            <span style={{ fontSize: 10.5, color: BPI.ink55 }}>agency, on record</span>
          </div>
          <div className="num" style={{ fontSize: 26, fontWeight: 600, color: BPI.accent, letterSpacing: '-0.02em', lineHeight: 1 }}>{promised}</div>
          <div style={{ fontSize: 11, color: BPI.ink55, marginTop: 6 }}>{promisedKind === 'proposed' ? 'projected benefit' : 'agency-reported'}</div>
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
            <span style={{ width: 5, height: 5, borderRadius: 3, background: BPI.ink, marginLeft: 1 }} />
            <span style={{ fontFamily: BPIMono, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.07em', color: BPI.ink70 }}>OUR DATA</span>
          </div>
          <div className="num" style={{ fontSize: 26, fontWeight: 600, color: agree ? BPI.good : BPI.ink, letterSpacing: '-0.02em', lineHeight: 1 }}>{measuredVal}</div>
          <div style={{ fontSize: 11, color: BPI.ink55, marginTop: 6 }}>{measured}</div>
        </div>
      </div>
    </div>
  );
}
function CI_PromisedVsDelivered() {
  return (
    <ConceptFrame
      tag="C1"
      title="Promised vs. delivered"
      intent="The join the corpus makes possible: set the agency’s own promised or reported number beside our independent measurement. Did the treatment do what DOT said it would? Each agency figure stays cited and truth-tagged; the verdict is ours.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <ReconRow route="M60" sbs metric="Bus speed, bus-lane section" agree
          promised="+32–34%" promisedKind="measured"
          measuredVal="+29%" measured="our AVL speeds, same months" />
        <ReconRow route="M86" sbs metric="Weekday ridership" agree
          promised="+7%" promisedKind="measured"
          measuredVal="+6.4%" measured="our APC counts, yr 1" />
        <ReconRow route="B44" sbs metric="Corridor speed (projected)"
          promised="+15–23%" promisedKind="proposed"
          measuredVal="+11%" measured="our AVL speeds, post-launch" />
      </div>
      <div style={{ marginTop: 16 }}>
        <Caveat tone="info" title="Why this is safe">
          The agency figure is always shown as a quote with its truth status — a <b>projected</b> benefit is never silently compared as if it were measured. The “diverges” verdict points the analyst at a gap to investigate, not a conclusion to publish.
        </Caveat>
      </div>
    </ConceptFrame>
  );
}

// C2 · Chart annotation — drop a dated event marker on the existing speed
// chart and pin the agency's own reported outcome to it.
function CI_ChartAnnotation() {
  const speeds = [6.8, 6.9, 6.7, 7.0, 7.1, 7.3, 7.0, 8.9, 9.1, 9.0, 9.3, 9.2];
  const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  const W = 700, H = 240, padL = 34, padR = 16, padT = 16, padB = 28;
  const lo = 6, hi = 10;
  const cw = (W - padL - padR) / (speeds.length - 1);
  const x = (i) => padL + i * cw;
  const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const launchIdx = 7;
  const d = speeds.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
  return (
    <ConceptFrame
      tag="C2"
      title="Event markers on the charts we already have"
      intent="Our speed and ridership charts are missing the “why.” Drop the corpus’s dated events onto the existing timeline as markers, and pin the agency’s own reported outcome right where the line moves.">
      <div style={{ background: BPI.card, borderRadius: 3, boxShadow: `0 0 0 1px ${BPI.rule}`, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <RouteBadge route="M60" size="sm" sbs />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Weekday AM speed, bus-lane section</span>
          <span style={{ fontFamily: BPIMono, fontSize: 10.5, color: BPI.ink55, marginLeft: 'auto' }}>mph · 2013–2014</span>
        </div>
        <div style={{ position: 'relative' }}>
          <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
            {[6, 7, 8, 9, 10].map((v) => (
              <g key={v}>
                <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke={BPI.rule} />
                <text x={padL - 7} y={y(v) + 3} fontSize="10" textAnchor="end" fill={BPI.ink55} fontFamily={BPIMono}>{v}</text>
              </g>
            ))}
            {/* launch marker */}
            <line x1={x(launchIdx)} x2={x(launchIdx)} y1={padT} y2={H - padB} stroke={BPI.good} strokeWidth="1.5" strokeDasharray="4 3" />
            <circle cx={x(launchIdx)} cy={y(speeds[launchIdx])} r="4" fill={BPI.good} stroke={BPI.card} strokeWidth="1.5" />
            <path d={d} fill="none" stroke={BPI.ink} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {months.map((m, i) => (
              <text key={i} x={x(i)} y={H - padB + 16} fontSize="9.5" textAnchor="middle" fill={BPI.ink40} fontFamily={BPIMono}>{m}</text>
            ))}
          </svg>
          {/* pinned agency callout */}
          <div style={{ position: 'absolute', left: 360, top: 6, width: 250 }}>
            <div style={{ background: BPI.goodBg, borderRadius: 3, padding: '10px 12px', boxShadow: `0 0 0 1px ${BPI.good}33` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                <TruthBadge status="measured" />
                <span style={{ fontFamily: BPIMono, fontSize: 10, color: BPI.ink55 }}>bus lane opens</span>
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.45, color: BPI.ink, fontStyle: 'italic' }}>“SBS trips are 32–34% faster in bus lane section”</div>
              <div style={{ marginTop: 8 }}><SourceRef doc="M60 SBS report" page={9} date="2014" /></div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 16, fontSize: 12.5, color: BPI.ink70, lineHeight: 1.5 }}>
        Our line shows the jump. The corpus says <b>when</b> and <b>why</b>, in the agency&rsquo;s own cited words — and lets the reader compare the agency&rsquo;s 32–34% to the +29% in our series.
      </div>
    </ConceptFrame>
  );
}

// ═════════════════════════════════════════════════════════════
// CONCEPT D · "What we know" panel — DELIBERATELY ROUGH
// The brief warns the event/claim payload isn't schema-frozen; so this is a
// wireframe, not a spec, to have the conversation without buying rework.
// ═════════════════════════════════════════════════════════════
function WireRow({ label, status }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '11px 12px', border: `1px dashed ${BPI.ink20}`, borderRadius: 3,
      marginBottom: 8, background: 'transparent',
    }}>
      <div style={{ width: 7, height: 7, borderRadius: 4, background: status === 'measured' ? BPI.good : status === 'proposed' ? BPI.accent : BPI.ink20, flexShrink: 0 }} />
      <span style={{ fontSize: 12.5, color: BPI.ink70 }}>{label}</span>
      <div style={{ flex: 1 }} />
      <Skeleton w={88} h={9} />
    </div>
  );
}
function WireGroup({ kind, count, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <span style={{ fontFamily: BPIMono, fontSize: 11, fontWeight: 700, color: BPI.ink70, letterSpacing: '0.02em' }}>{kind}</span>
        <span className="num" style={{ fontFamily: BPIMono, fontSize: 10.5, color: BPI.ink40 }}>{count}</span>
      </div>
      {children}
    </div>
  );
}
function CI_WhatWeKnow() {
  return (
    <ConceptFrame
      tag="D1"
      title="“What we know” panel"
      intent="Everything the corpus holds for one route, grouped by canonical claim kind — proposed treatments, performance observations, key findings — each cited. Kept as a wireframe on purpose: the event/claim payload isn’t schema-frozen, so resolving this now would buy rework. Structure only; spacing and exact fields are placeholders."
      fidelity="rough">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <RouteBadge route="B44" size="md" sbs />
        <span style={{ fontSize: 13, color: BPI.ink70 }}>Nostrand Ave</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: BPIMono, fontSize: 10.5, color: BPI.ink40 }}>42 records · 6 docs</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
        <div>
          <WireGroup kind="proposed_treatment" count="5">
            <WireRow label="Offset bus lanes, Flatbush → Av H" status="proposed" />
            <WireRow label="Transit signal priority at 8 intersections" status="proposed" />
            <WireRow label="Pedestrian islands at major crossings" status="proposed" />
          </WireGroup>
          <WireGroup kind="key_finding" count="7">
            <WireRow label="Corridor carries 40k+ weekday riders" status="statement" />
            <WireRow label="Slowest segment: Empire → Eastern Pkwy" status="statement" />
          </WireGroup>
        </div>
        <div>
          <WireGroup kind="performance_observation" count="4">
            <WireRow label="15–23% faster speeds after SBS" status="measured" />
            <WireRow label="Ridership up ~10% program-wide" status="measured" />
          </WireGroup>
          <WireGroup kind="problem_statement" count="6">
            <WireRow label="Double-parking blocks the curb lane" status="statement" />
            <WireRow label="Long dwell at high-volume stops" status="statement" />
          </WireGroup>
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <Caveat tone="warn" title="Hold for schema freeze">
          Don&rsquo;t pixel-perfect this until <span className="mono">event_candidate</span> / claim payloads are frozen and route-linkage is validated end-to-end. The grouping-by-canonical-kind idea is the thing to react to here — not the layout.
        </Caveat>
      </div>
    </ConceptFrame>
  );
}

window.CI_EvidenceSpecimens = CI_EvidenceSpecimens;
window.CI_PromisedVsDelivered = CI_PromisedVsDelivered;
window.CI_ChartAnnotation = CI_ChartAnnotation;
window.CI_WhatWeKnow = CI_WhatWeKnow;
