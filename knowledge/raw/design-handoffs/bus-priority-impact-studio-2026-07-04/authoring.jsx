// Route-first authoring flow: annotation → claim composer.
//
// RF_Annotate    — Route detail with a segment selected and a popover
//                  offering to seed a claim from the selection. Right rail
//                  shows the brief-in-progress.
// RF_Authoring   — The full brief composition workspace. Left rail =
//                  claim outline, center = claim editor with attached
//                  evidence, right rail = evidence inspector (Numbers,
//                  Charts, Sources, Caveats).

const AUW = 1320,AUH = 880;

// Compact route header used by both authoring screens — narrower than the
// full one so the right rail has room.
function RouteHeaderCompact() {
  return (
    <div style={{
      padding: '18px 28px 14px', background: BPI.card,
      boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
      display: 'flex', alignItems: 'center', gap: 16
    }}>
      <RouteBadge route="M15" sbs size="lg" />
      <div>
        <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>
          1st Avenue / 2nd Avenue Select Bus Service
        </div>
        <div style={{ fontSize: 11.5, color: BPI.ink55, marginTop: 2 }}>
          Manhattan · East Harlem ↔ South Ferry · 8.4 mi · 33 stops
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', gap: 22 }}>
        {[
        { lbl: 'Speed', val: '6.74', unit: 'mph' },
        { lbl: 'Riders / day', val: '37.2K' },
        { lbl: 'Lost / day', val: '4,310', tone: 'bad' }].
        map((k, i, a) =>
        <div key={i} style={{ borderRight: i < a.length - 1 ? `1px solid ${BPI.rule}` : 'none', paddingRight: 22 }}>
            <KPI label={k.lbl} value={k.val} unit={k.unit} tone={k.tone} />
          </div>
        )}
      </div>
    </div>);

}

// ─────────────────────────────────────────────────────────────
// Screen — RF_Annotate (annotation on route detail)
// ─────────────────────────────────────────────────────────────
function RF_Annotate() {
  function gen(am, mid, pm) {
    const arr = [];
    for (let h = 0; h < 24; h++) {
      let v = 0.1;
      if (h >= 7 && h <= 9) v = am;else
      if (h >= 11 && h <= 14) v = mid;else
      if (h >= 16 && h <= 19) v = pm;else
      if (h >= 6 && h <= 21) v = 0.3;
      arr.push(v + Math.sin(h * 1.7) * 0.04);
    }
    return arr;
  }
  const segments = [
  { dir: 'NB', from: 'Madison Av / E 28 St', to: 'Madison Av / E 58 St', mph: 4.2, sched: 7.1, rh: 18420, hours: gen(0.7, 0.5, 0.9), lane: 'partial', ace: false, tsp: false, selected: true },
  { dir: 'NB', from: '1 Av / E 14 St', to: '1 Av / E 34 St', mph: 4.9, sched: 7.6, rh: 14110, hours: gen(0.6, 0.5, 0.85), lane: 'yes', ace: true, tsp: false },
  { dir: 'SB', from: '2 Av / E 60 St', to: '2 Av / E 42 St', mph: 5.2, sched: 7.8, rh: 12880, hours: gen(0.55, 0.6, 0.7), lane: 'yes', ace: true, tsp: false },
  { dir: 'NB', from: '1 Av / E 86 St', to: '1 Av / E 96 St', mph: 5.8, sched: 8.2, rh: 9640, hours: gen(0.5, 0.4, 0.6), lane: 'yes', ace: true, tsp: true }];

  return (
    <div className="bpi" style={{ width: AUW, height: AUH, display: 'flex', flexDirection: 'column' }}>
      <StudioBar active="Routes" breadcrumb="Routes / M15 +SBS · annotating" />
      <RouteHeaderCompact />

      <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 360px' }}>
        {/* Left — route detail with annotation */}
        <div style={{ padding: 28, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', position: 'relative' }}>
          <H title="Top slow segments by rider-hours lost"
          sub="Select a segment to start a claim from it. Click any metric to attach as evidence."
          right={<span className="chip accent">SELECT MODE</span>} />

          <SegmentRowHeader />
          {segments.map((s, i) =>
          <React.Fragment key={i}>
              <div style={{
              outline: s.selected ? `2px solid ${BPI.accent}` : 'none',
              outlineOffset: -1,
              position: 'relative',
              zIndex: s.selected ? 2 : 1
            }}>
                <SegmentRow {...s} />
              </div>
              {s.selected && <InlineClaimSeed />}
            </React.Fragment>
          )}

          <div style={{ marginTop: 10, fontSize: 11, color: BPI.ink55 }}>
            Showing 4 of 13 timepoint segments.
          </div>
        </div>

        {/* Right — Brief in progress */}
        <BriefInProgress />
      </div>
    </div>);

}

// Popover offering claim seeds from the selected segment, rendered inline
// below the selected row so it can't be clipped by the column. Pushes the
// rows below it down, like an expanded detail panel.
function InlineClaimSeed() {
  const seeds = [
  { t: 'This segment accounts for 43% of route delay', primary: true },
  { t: 'Buses run slower than walking pace 11 hours/day' },
  { t: 'Bus lane coverage is incomplete on this corridor' },
  { t: 'ACE enforcement does not extend to Madison Av' }];

  return (
    <div style={{
      position: 'relative',
      background: BPI.ink, color: BPI.paper, borderRadius: 4,
      margin: '8px 0 16px',
      padding: '18px 22px 16px',
      boxShadow: '0 8px 28px rgba(0,0,0,.2)'
    }}>
      {/* Pointer triangle pointing up */}
      <div style={{
        position: 'absolute', top: -7, left: 36, width: 0, height: 0,
        borderLeft: '7px solid transparent', borderRight: '7px solid transparent',
        borderBottom: `7px solid ${BPI.ink}`
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div className="eyebrow" style={{ color: 'rgba(244,241,234,.55)', marginBottom: 4 }}>
            Start a claim
          </div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>
            from Madison Av · E 28 St → E 58 St (NB)
            <span style={{ opacity: 0.6, marginLeft: 8 }}>· 1.5 mi · 4 timepoints</span>
          </div>
        </div>
        <button className="bpi" style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'rgba(244,241,234,.55)', fontSize: 16, padding: 4, lineHeight: 1,
          fontFamily: 'inherit'
        }}>×</button>
      </div>

      <div style={{
        fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase',
        fontWeight: 700, color: 'rgba(244,241,234,.55)', marginBottom: 8
      }}>
        Suggested claim seeds
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {seeds.map((s, i) =>
        <div key={i} style={{
          padding: '10px 12px', borderRadius: 3,
          background: s.primary ? 'rgba(244,241,234,.10)' : 'transparent',
          fontSize: 12, lineHeight: 1.4, cursor: 'pointer',
          border: `1px solid ${s.primary ? 'rgba(244,241,234,.20)' : 'rgba(244,241,234,.08)'}`
        }}>{s.t}</div>
        )}
      </div>

      <div className="rule" style={{ background: 'rgba(244,241,234,.15)', margin: '14px 0 12px' }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="bpi" style={{
          padding: '9px 14px', background: BPI.paper, color: BPI.ink,
          border: 'none', borderRadius: 3, fontSize: 12, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit'
        }}>Open in composer →</button>
        <button className="bpi" style={{
          padding: '9px 14px', background: 'transparent', color: BPI.paper,
          border: '1px solid rgba(244,241,234,.25)', borderRadius: 3,
          fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit'
        }}>Custom claim</button>
        <div style={{ flex: 1 }} />
        <button className="bpi" style={{
          padding: '9px 14px', background: 'transparent', color: 'rgba(244,241,234,.65)',
          border: 'none', borderRadius: 3, fontSize: 11.5, cursor: 'pointer',
          fontFamily: 'inherit'
        }}>Attach as evidence only</button>
      </div>
    </div>);

}

// Brief-in-progress right rail (used by RF_Annotate).
// Uses the shared <ClaimList> primitive so this view stays visually
// consistent with the full composer's outline.
function BriefInProgress() {
  const claims = [
  { n: 1, title: 'M15 SBS is the slowest SBS route in Manhattan', strength: 5, evidence: 3, caveats: 1 },
  { n: 2, title: 'A single corridor accounts for 43% of measured delay', strength: 4, evidence: 4, caveats: 2, editing: true },
  { n: 3, title: 'ACE rollout coincides with +0.7 mph PM-peak gain', strength: 3, evidence: 3, caveats: 2 },
  { n: 4, title: 'Treatment gap on Madison Av', strength: 2, evidence: 1, caveats: 0, weak: true }];

  return (
    <div style={{
      background: BPI.paper, boxShadow: `inset 1px 0 0 ${BPI.rule}`,
      display: 'flex', flexDirection: 'column', overflow: 'hidden'
    }}>
      <div style={{ padding: '18px 22px 12px', boxShadow: `inset 0 -1px 0 ${BPI.rule}` }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Brief in progress</div>
        <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', textWrap: 'pretty' }}>
          M15 SBS · Madison corridor
        </div>
        <div style={{ fontSize: 11, color: BPI.ink55, marginTop: 4, fontFamily: BPIMono }}>
          draft v0.4
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px' }}>
        <ClaimList claims={claims} onAdd={() => {}} />
      </div>

      <div style={{
        padding: '12px 16px', background: BPI.card,
        boxShadow: `inset 0 1px 0 ${BPI.rule}`,
        display: 'flex', flexDirection: 'column', gap: 8
      }}>
        <Button variant="primary" size="md" full>Open full composer →</Button>
        <Button variant="ghost" size="sm" full>Preview brief</Button>
      </div>
    </div>);

}

// Five-bar strength indicator — now lives in system.jsx as a primitive.

// ─────────────────────────────────────────────────────────────
// Screen — RF_Authoring (full brief composer)
// ─────────────────────────────────────────────────────────────
function RF_Authoring() {
  return (
    <div className="bpi" style={{ width: AUW, height: AUH, display: 'flex', flexDirection: 'column' }}>
      <StudioBar active="Routes" breadcrumb="Routes / M15 +SBS / brief · draft v0.4" />

      {/* Brief title sub-bar */}
      <div style={{
        padding: '14px 28px', background: BPI.card,
        boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
        display: 'flex', alignItems: 'center', gap: 16
      }}>
        <RouteBadge route="M15" sbs size="md" />
        <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>
          The Madison corridor problem
        </div>
        <span className="chip accent" style={{ marginLeft: 6 }}>DRAFT v0.4</span>
        <span style={{ fontSize: 11, color: BPI.ink40, fontFamily: BPIMono }}>
          auto-saved 12s ago
        </span>
        <div style={{ flex: 1 }} />
        <Button variant="primary" size="sm">Send for review →</Button>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '240px 1fr 360px' }}>
        {/* Left — outline */}
        <AuthoringOutline />
        {/* Center — claim editor */}
        <ClaimEditor />
        {/* Right — evidence inspector */}
        <EvidenceInspector />
      </div>
    </div>);

}

function AuthoringOutline() {
  const claims = [
  { n: 1, title: 'M15 SBS is the slowest SBS route in Manhattan', strength: 5, evidence: 3, caveats: 1 },
  { n: 2, title: 'A single corridor accounts for 43% of measured delay', strength: 4, evidence: 4, caveats: 2, editing: true },
  { n: 3, title: 'ACE rollout coincides with +0.7 mph PM-peak gain', strength: 3, evidence: 3, caveats: 2 },
  { n: 4, title: 'Treatment gap on Madison Av', strength: 2, evidence: 1, caveats: 0, weak: true }];

  const avg = (claims.reduce((s, c) => s + c.strength, 0) / claims.length).toFixed(1);
  const totalEv = claims.reduce((s, c) => s + c.evidence, 0);
  const totalCa = claims.reduce((s, c) => s + c.caveats, 0);
  return (
    <div style={{
      background: BPI.paper, boxShadow: `inset -1px 0 0 ${BPI.rule}`,
      display: 'flex', flexDirection: 'column', overflow: 'hidden'
    }}>
      <div style={{ padding: '18px 18px 12px', boxShadow: `inset 0 -1px 0 ${BPI.rule}` }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>Outline</div>
        <div style={{ fontSize: 11, color: BPI.ink55 }}>Drag to reorder</div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px' }}>
        <ClaimList
          claims={claims} reorderable density="compact" onAdd={() => {}}
          summary={<>Avg strength <b style={{ color: BPI.ink }}>{avg}</b> / 5<br />{totalEv} evidence · {totalCa} caveats</>} />
        
      </div>
    </div>);

}

function ClaimEditor() {
  return (
    <div style={{ overflow: 'auto', padding: '24px 32px', background: BPI.card, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span className="eyebrow" style={{ color: BPI.accent }}>Claim 02 of 5</span>
        <span style={{ fontSize: 11, color: BPI.ink55, fontFamily: BPIMono }}>· seeded from Madison Av selection</span>
      </div>

      {/* Statement */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Statement</div>
        <div style={{
          padding: '16px 18px', background: BPI.paper, borderRadius: 3,
          fontSize: 18, fontWeight: 500, lineHeight: 1.5, letterSpacing: '-0.005em',
          boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
          textWrap: 'pretty'
        }}>
          A 1.5-mile stretch of Madison Avenue (E&nbsp;28&nbsp;St → E&nbsp;58&nbsp;St, NB) accounts for <span style={{ background: BPI.accentBg, color: BPI.accent, padding: '0 4px', borderRadius: 2, fontWeight: 600 }}>43%<Cite n={5} /></span> of the M15 SBS's total measured rider-hour delay<Cite n={5} />.
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: BPI.ink55, marginTop: 6 }}>
          <span>42 words</span><span>·</span>
          <span>2 inline citations</span><span>·</span>
          <span style={{ color: BPI.good }}>✓ no normative language</span>
        </div>
      </div>

      {/* Evidence */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="eyebrow">Evidence attached (4)</div>
          <button className="bpi" style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 11, color: BPI.accent, fontWeight: 600, fontFamily: 'inherit'
          }}>+ from inspector →</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
          { kind: 'metric', glyph: '#', name: '43% — Madison share of route delay', src: 'computed: 18,420 / 42,890 RH per day · M1 pilot' },
          { kind: 'chart', glyph: '▤', name: 'Rider-hours by segment, Mar 2026', src: 'MTA Bus Speeds · weekday median, n = 2,003' },
          { kind: 'metric', glyph: '#', name: '18,420 rider-hours / day · Madison segment', src: 'M1 pilot · 168 ridership windows' },
          { kind: 'source', glyph: '¶', name: 'M15 SBS Wiki — Madison corridor analysis', src: 'Project wiki · last edited Apr 28, 2026' }].
          map((e, i) =>
          <div key={i} style={{
            padding: '12px 14px', background: BPI.paper, borderRadius: 3,
            boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
            display: 'flex', alignItems: 'flex-start', gap: 12
          }}>
              <div style={{
              width: 24, height: 24, borderRadius: 3,
              background: BPI.card, color: BPI.ink70,
              fontFamily: BPIMono, fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `inset 0 0 0 1px ${BPI.rule}`
            }}>{e.glyph}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{e.name}</div>
                <div style={{ fontSize: 11, color: BPI.ink55, fontFamily: BPIMono }}>{e.src}</div>
              </div>
              <span className="chip" style={{ fontSize: 9.5, textTransform: 'uppercase' }}>{e.kind}</span>
              <button className="bpi" style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: BPI.ink40, fontSize: 14, padding: 2, lineHeight: 1
            }}>×</button>
            </div>
          )}
        </div>
      </div>

      {/* Caveats */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="eyebrow">Caveats applied (2)</div>
          <button className="bpi" style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 11, color: BPI.accent, fontWeight: 600, fontFamily: 'inherit'
          }}>+ from library →</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Caveat tone="warn" title='"Speed" includes rider experience'>
            MTA segment speeds reflect dwell time, traffic, signals, and stops. The brief uses
            the phrase "observed bus travel speed" wherever this metric appears.<Cite n={6} />
          </Caveat>
          <Caveat tone="warn" title="Single-month window">
            Numbers are drawn from the March 2026 pilot. Comparable Feb 2026 numbers exist
            but were not used; a multi-month baseline is planned for v0.5.
          </Caveat>
        </div>
      </div>

      {/* Strength */}
      <div style={{
        padding: '14px 16px', background: BPI.goodBg, borderRadius: 3,
        display: 'flex', alignItems: 'center', gap: 14,
        boxShadow: `inset 0 0 0 1px oklch(0.85 0.05 155)`
      }}>
        <StrengthBars strength={4} size="lg" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: BPI.good, marginBottom: 2 }}>
            Strength · 4 of 5 — defensible
          </div>
          <div style={{ fontSize: 11.5, color: BPI.ink70, lineHeight: 1.5 }}>
            4 primary sources · 2 caveats acknowledged · no contradicting data found.
            Add a multi-month baseline to reach 5/5.
          </div>
        </div>
        <Button variant="ghost" size="sm">How is this scored?</Button>
      </div>
    </div>);

}

function EvidenceInspector() {
  const [tab, setTab] = React.useState('Numbers');
  return (
    <div style={{
      background: BPI.paper, boxShadow: `inset 1px 0 0 ${BPI.rule}`,
      display: 'flex', flexDirection: 'column', overflow: 'hidden'
    }}>
      <div style={{ padding: '18px 18px 0' }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Evidence inspector</div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: BPI.card, border: `1px solid ${BPI.rule}`,
          padding: '7px 10px', borderRadius: 3, marginBottom: 12
        }}>
          <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke={BPI.ink55} strokeWidth="1.8">
            <circle cx="8" cy="8" r="5.5" /><path d="M12.5 12.5L16 16" strokeLinecap="round" />
          </svg>
          <input style={{
            flex: 1, border: 'none', outline: 'none', fontFamily: 'inherit',
            fontSize: 12, background: 'transparent', color: BPI.ink
          }} placeholder="Filter evidence…" />
        </div>
      </div>
      <div style={{
        display: 'flex', gap: 16, padding: '0 18px',
        boxShadow: `inset 0 -1px 0 ${BPI.rule}`, fontSize: 12
      }}>
        {['Numbers', 'Charts', 'Sources', 'Caveats'].map((t) =>
        <span key={t} onClick={() => setTab(t)} style={{
          padding: '8px 0', color: t === tab ? BPI.ink : BPI.ink55,
          fontWeight: t === tab ? 600 : 400,
          boxShadow: t === tab ? `inset 0 -2px 0 ${BPI.ink}` : 'none',
          cursor: 'pointer'
        }}>{t}</span>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px' }}>
        {tab === 'Numbers' && <EvidenceList items={[
        { n: '18,420', u: 'rider-hours / day', t: 'Madison segment, weekday', src: 'M1 pilot', attached: true },
        { n: '43%', u: 'share of route delay', t: 'Madison vs. route total', src: 'computed', attached: true },
        { n: '4.2', u: 'mph weekday avg', t: 'Madison Av NB · Mar 2026', src: 'Bus Speeds' },
        { n: '7.1', u: 'mph scheduled', t: 'Madison Av NB timepoint pace', src: 'GTFS Mar 2026' },
        { n: '207,870', u: 'rider-trips / month', t: 'Madison Av · M15 SBS', src: 'Ridership 2026' },
        { n: '4,310', u: 'rider-hours / day', t: 'Whole-route lost time', src: 'M1 pilot' },
        { n: '−68%', u: 'violations Y/Y', t: 'ACE-enforced M15 segments', src: 'ACE program' },
        { n: '+0.7', u: 'mph PM-peak', t: 'ACE-enforced segments, post-rollout', src: 'Bus Speeds' }]
        } />}
        {tab === 'Charts' && <ChartList />}
        {tab === 'Sources' && <SourceList />}
        {tab === 'Caveats' && <CaveatLibrary />}
      </div>

      <div style={{
        padding: '10px 16px', background: BPI.card,
        boxShadow: `inset 0 1px 0 ${BPI.rule}`,
        fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono,
        display: 'flex', alignItems: 'center', gap: 8
      }}>
        <span style={{ color: BPI.ink40 }}>drag</span>
        <span>any item into the claim editor to attach as evidence</span>
      </div>
    </div>);

}

function EvidenceList({ items }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.map((e, i) =>
      <div key={i} style={{
        padding: '10px 12px', background: e.attached ? BPI.accentBg : BPI.card,
        borderRadius: 3, cursor: 'grab',
        boxShadow: e.attached ? `inset 0 0 0 1px ${BPI.accent}` : `inset 0 0 0 1px ${BPI.rule}`
      }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span className="num" style={{ fontSize: 16, fontWeight: 600, color: BPI.ink, letterSpacing: '-0.01em' }}>{e.n}</span>
            <span style={{ fontSize: 10.5, color: BPI.ink55 }}>{e.u}</span>
            {e.attached && <span className="chip accent" style={{ fontSize: 9, marginLeft: 'auto' }}>ATTACHED</span>}
          </div>
          <div style={{ fontSize: 11.5, color: BPI.ink70, marginTop: 3 }}>{e.t}</div>
          <div style={{ fontSize: 10, color: BPI.ink55, fontFamily: BPIMono, marginTop: 2 }}>{e.src}</div>
        </div>
      )}
    </div>);

}
function ChartList() {
  const charts = [
  { name: 'Hour-by-hour speed, Madison NB', meta: 'HourBars · 24h', attached: true },
  { name: 'Rider-hours by segment, all', meta: 'Bar chart · 13 rows' },
  { name: 'Speed × hour × day · 8 weeks', meta: 'Heatmap · 7 × 18' },
  { name: 'Spark · 14-day rolling speed', meta: 'Spark · 14 points' },
  { name: 'Before/after — ACE rollout', meta: 'BeforeAfter · 3 metrics' }];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {charts.map((c, i) =>
      <div key={i} style={{
        padding: 10, background: c.attached ? BPI.accentBg : BPI.card, borderRadius: 3,
        boxShadow: c.attached ? `inset 0 0 0 1px ${BPI.accent}` : `inset 0 0 0 1px ${BPI.rule}`,
        display: 'flex', alignItems: 'center', gap: 10, cursor: 'grab'
      }}>
          <MapThumb width={62} height={36} emphasis={c.attached ? BPI.accent : BPI.ink40} label="" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.3 }}>{c.name}</div>
            <div style={{ fontSize: 10, color: BPI.ink55, fontFamily: BPIMono, marginTop: 2 }}>{c.meta}</div>
          </div>
          {c.attached && <span className="chip accent" style={{ fontSize: 9 }}>✓</span>}
        </div>
      )}
    </div>);

}
function SourceList() {
  const sources = [
  { name: 'MTA Bus Speeds — segment, 2023–2026', meta: '18.9M rows · cited 7×' },
  { name: 'MTA Hourly Ridership — 2025+', meta: '115.1M rows · cited 2×' },
  { name: 'NYC DOT Local-Street Bus Lanes', meta: '4,068 segments · cited 1×' },
  { name: 'MTA ACE program & violations', meta: '5.25M rows · cited 3×' },
  { name: 'M1 March 2026 pilot — 2,003 obs', meta: 'wiki/m1-pilot-mar2026 · cited 4×' },
  { name: 'M15 SBS Wiki — Madison corridor', meta: 'project wiki · cited 1×' }];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {sources.map((s, i) =>
      <div key={i} style={{
        padding: '10px 12px', background: BPI.card, borderRadius: 3,
        boxShadow: `inset 0 0 0 1px ${BPI.rule}`, cursor: 'grab'
      }}>
          <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.35 }}>{s.name}</div>
          <div style={{ fontSize: 10, color: BPI.ink55, fontFamily: BPIMono, marginTop: 3 }}>{s.meta}</div>
        </div>
      )}
    </div>);

}
function CaveatLibrary() {
  const cavs = [
  { name: '"Speed" includes rider experience', meta: 'general · methodology', applied: true },
  { name: 'Single-month window', meta: 'data scope', applied: true },
  { name: 'Congestion pricing overlap', meta: 'attribution · 2025+' },
  { name: 'Timepoint definitions changed Aug 2024', meta: 'baseline · M15 specifically' },
  { name: 'Off-board fare → on-board not modeled', meta: 'dwell-time methodology' },
  { name: 'Weekday vs. weekend not segmented', meta: 'data scope' }];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {cavs.map((c, i) =>
      <div key={i} style={{
        padding: '10px 12px', background: c.applied ? BPI.warnBg : BPI.card,
        borderRadius: 3, cursor: 'grab',
        boxShadow: c.applied ? `inset 0 0 0 1px ${BPI.warn}` : `inset 0 0 0 1px ${BPI.rule}`,
        display: 'flex', alignItems: 'flex-start', gap: 10
      }}>
          <span style={{ color: c.applied ? BPI.warn : BPI.ink40, fontSize: 13, lineHeight: 1.2 }}>⚠</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.35, color: c.applied ? BPI.warn : BPI.ink }}>{c.name}</div>
            <div style={{ fontSize: 10, color: BPI.ink55, fontFamily: BPIMono, marginTop: 2 }}>{c.meta}</div>
          </div>
          {c.applied && <span className="chip warn" style={{ fontSize: 9 }}>APPLIED</span>}
        </div>
      )}
    </div>);

}

Object.assign(window, { RF_Annotate, RF_Authoring });