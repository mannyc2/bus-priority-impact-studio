// Search Results — full results page when a query has many matches.
// The dropdown on the home screen handles the top 4-5; this is the
// "user pressed Enter on 'manhattan ace'" view.

const SRW = 1320, SRH = 880;

// ─────────────────────────────────────────────────────────────
// Result renderers — one per result type so the row layout matches
// the underlying thing's natural shape.
// ─────────────────────────────────────────────────────────────
function RouteResult({ r }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '110px 1fr 80px 110px 132px',
      gap: 16, alignItems: 'center', padding: '14px 16px',
      boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
      cursor: 'pointer',
    }}>
      <RouteBadge route={r.route} sbs={r.sbs} size="md" />
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 2 }}>
          {r.name} · <span style={{ color: BPI.ink70, fontWeight: 400 }}>{r.where}</span>
        </div>
        <div style={{ fontSize: 11, color: BPI.ink55 }}>
          {r.riders} daily riders · matches: <i style={{ color: BPI.accent }}>{r.matches.join(' · ')}</i>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="num" style={{ fontSize: 15, fontWeight: 600, color: r.mph < 5 ? BPI.bad : r.mph < 6.5 ? BPI.warn : BPI.ink, lineHeight: 1 }}>{r.mph.toFixed(1)}</div>
        <div className="num" style={{ fontSize: 9.5, color: BPI.ink55, marginTop: 2 }}>mph</div>
      </div>
      <div className="num" style={{ fontSize: 11, color: BPI.ink70, textAlign: 'right' }}>
        {r.rh.toLocaleString()} RH/day
      </div>
      <TreatmentRow lane={r.lane} ace={r.ace} tsp={r.tsp} />
    </div>
  );
}

function SegmentResult({ s }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '28px 110px 1fr 80px 110px 132px',
      gap: 14, alignItems: 'center', padding: '14px 16px',
      boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
      cursor: 'pointer',
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: 11,
        background: s.sev > 85 ? BPI.bad : s.sev > 75 ? BPI.warn : BPI.ink40,
        color: '#fff', fontSize: 9.5, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontVariantNumeric: 'tabular-nums',
      }}>{s.sev}</div>
      <RouteBadge route={s.route} sbs={s.sbs} size="sm" />
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <DirIndicator dir={s.dir} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>
            {s.from} <span style={{ color: BPI.ink40 }}>→</span> {s.to}
          </span>
        </div>
        <div style={{ fontSize: 11, color: BPI.ink55, marginTop: 2, marginLeft: 32 }}>
          matches: <i style={{ color: BPI.accent }}>{s.matches.join(' · ')}</i>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="num" style={{ fontSize: 15, fontWeight: 600, color: BPI.bad, lineHeight: 1 }}>{s.mph.toFixed(1)}</div>
        <div className="num" style={{ fontSize: 9.5, color: BPI.ink55, marginTop: 2 }}>mph</div>
      </div>
      <div className="num" style={{ fontSize: 11, color: BPI.ink70, textAlign: 'right' }}>
        {s.rh.toLocaleString()} RH/day
      </div>
      <TreatmentRow lane={s.lane} ace={s.ace} tsp={s.tsp} />
    </div>
  );
}

function BriefResult({ b }) {
  const statusBg = b.status === 'PUBLISHED' ? BPI.goodBg : b.status === 'IN REVIEW' ? BPI.warnBg : BPI.ink06;
  const statusFg = b.status === 'PUBLISHED' ? BPI.good   : b.status === 'IN REVIEW' ? BPI.warn   : BPI.ink55;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '90px 96px 1fr 140px',
      gap: 14, alignItems: 'center', padding: '14px 16px',
      boxShadow: `inset 0 -1px 0 ${BPI.rule}`, cursor: 'pointer',
    }}>
      <span style={{
        fontSize: 9.5, letterSpacing: '0.12em', fontWeight: 700,
        padding: '3px 7px', background: statusBg, color: statusFg, borderRadius: 2,
        width: 'fit-content',
      }}>{b.status}</span>
      {b.route ? <RouteBadge route={b.route} sbs={b.sbs} size="sm" /> : <span />}
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 3, letterSpacing: '-0.005em' }}>
          {b.title}
        </div>
        <div style={{ fontSize: 11.5, color: BPI.ink55 }}>
          {b.authors} · {b.cites} citations · matches: <i style={{ color: BPI.accent }}>{b.matches.join(' · ')}</i>
        </div>
      </div>
      <div style={{ textAlign: 'right', fontFamily: BPIMono, fontSize: 11, color: BPI.ink55 }}>
        {b.date}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Facet rail
// ─────────────────────────────────────────────────────────────
function FacetGroup({ title, items, selected = [] }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((it) => {
          const isOn = selected.includes(it.label);
          return (
            <label key={it.label} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 0', cursor: 'pointer', fontSize: 12,
              color: BPI.ink, lineHeight: 1.4,
            }}>
              <span style={{
                width: 14, height: 14, borderRadius: 2,
                border: `1.5px solid ${isOn ? BPI.ink : BPI.ink20}`,
                background: isOn ? BPI.ink : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {isOn && <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke={BPI.paper} strokeWidth="2"><path d="M1.5 5L4 7.5 8.5 2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </span>
              <span style={{ flex: 1 }}>{it.label}</span>
              <span className="num" style={{ fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono }}>{it.count}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Result group container
// ─────────────────────────────────────────────────────────────
function ResultGroup({ label, count, columns, onShowAll, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 12,
        padding: '0 16px 8px',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.005em' }}>{label}</div>
        <span className="num" style={{ fontSize: 11, color: BPI.ink55, fontFamily: BPIMono }}>
          {count} {count === 1 ? 'match' : 'matches'}
        </span>
        <div style={{ flex: 1 }} />
        {onShowAll && (
          <button className="bpi" style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: BPI.accent, fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit',
          }}>Show all {count} →</button>
        )}
      </div>
      {columns && (
        <div style={{
          padding: '0 16px 6px', display: 'grid',
          gridTemplateColumns: columns.template, gap: columns.gap || 16,
          fontSize: 10.5, color: BPI.ink55, fontWeight: 600,
          boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
          letterSpacing: '-0.003em',
        }}>{columns.headers.map((h, i) => <span key={i} style={{ textAlign: h.align || 'left' }}>{h.label}</span>)}</div>
      )}
      <div style={{ background: BPI.card, boxShadow: `0 0 0 1px ${BPI.rule}`, borderRadius: 3 }}>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────
function RF_SearchResults() {
  const routes = [
    { route: 'M15', sbs: true,  name: '1 Av / 2 Av',          where: 'Manhattan',  riders: '37.2K', mph: 6.7, rh: 4310, lane: 'partial', ace: true, tsp: false, matches: ['Manhattan', 'ACE active'] },
    { route: 'M14A',sbs: true,  name: '14 St Crosstown',      where: 'Manhattan',  riders: '17.8K', mph: 7.4, rh: 2410, lane: 'yes',     ace: true, tsp: false, matches: ['Manhattan', 'ACE active', 'SBS'] },
    { route: 'M14D',sbs: true,  name: '14 St Crosstown',      where: 'Manhattan',  riders:  '9.8K', mph: 7.1, rh: 1620, lane: 'yes',     ace: true, tsp: false, matches: ['Manhattan', 'ACE active', 'SBS'] },
    { route: 'M101',sbs: false, name: '3 Av / Lexington Av',  where: 'Manhattan',  riders: '29.7K', mph: 6.0, rh: 3120, lane: 'yes',     ace: true, tsp: false, matches: ['Manhattan', 'ACE active'] },
    { route: 'M102',sbs: false, name: '3 Av / Lexington Av',  where: 'Manhattan',  riders: '14.2K', mph: 5.8, rh: 1840, lane: 'yes',     ace: true, tsp: false, matches: ['Manhattan', 'ACE active'] },
    { route: 'M103',sbs: false, name: '3 Av / Lexington Av',  where: 'Manhattan',  riders: '11.5K', mph: 5.7, rh: 1530, lane: 'yes',     ace: true, tsp: false, matches: ['Manhattan', 'ACE active'] },
    { route: 'M125',sbs: false, name: '125 St Crosstown',     where: 'Manhattan',  riders:  '8.4K', mph: 6.2, rh: 1010, lane: 'partial', ace: true, tsp: false, matches: ['Manhattan', 'ACE active'] },
    { route: 'M86', sbs: true,  name: '86 St Crosstown',      where: 'Manhattan',  riders: '14.8K', mph: 6.5, rh: 1480, lane: 'yes',     ace: true, tsp: false, matches: ['Manhattan', 'ACE active', 'SBS'] },
  ];
  const segments = [
    { route: 'M15', sbs: true,  dir: 'NB', from: 'Madison · 28', to: 'Madison · 58', sev: 94, mph: 4.2, rh: 18420, lane: 'partial', ace: false, tsp: false, matches: ['Manhattan', 'no ACE'] },
    { route: 'M15', sbs: true,  dir: 'NB', from: '1 Av · 14',    to: '1 Av · 34',    sev: 89, mph: 4.9, rh: 14110, lane: 'yes',     ace: true,  tsp: false, matches: ['Manhattan', 'ACE active'] },
    { route: 'M101',sbs: false, dir: 'SB', from: '3 Av · 60',    to: '3 Av · 42',    sev: 81, mph: 5.0, rh: 11020, lane: 'yes',     ace: true,  tsp: false, matches: ['Manhattan', 'ACE active'] },
    { route: 'M14A',sbs: true,  dir: 'EB', from: '14 · 6 Av',    to: '14 · 1 Av',    sev: 76, mph: 5.8, rh: 10210, lane: 'yes',     ace: true,  tsp: false, matches: ['Manhattan', 'ACE active', 'SBS'] },
  ];
  const briefs = [
    { status: 'PUBLISHED', route: 'M15',  sbs: true,  title: 'M15 SBS: The Madison corridor problem',          authors: 'C. Pherson · J. Lim', cites: 23, matches: ['Manhattan', 'ACE'], date: 'May 2026' },
    { status: 'PUBLISHED', route: 'M14',  sbs: true,  title: 'ACE on the M14: a year-one review',              authors: 'S. Rivera',           cites: 31, matches: ['Manhattan', 'ACE'], date: 'Apr 2026' },
    { status: 'IN REVIEW', route: null,   sbs: false, title: 'When does congestion pricing show up in the bus data?', authors: 'S. Rivera',     cites:  9, matches: ['Manhattan', 'ACE rollout'], date: 'May 2026' },
  ];
  return (
    <div className="bpi" style={{ width: SRW, height: SRH, display: 'flex', flexDirection: 'column' }}>
      <StudioBar active="Routes" breadcrumb="Search" />

      {/* Header — search field + result tally */}
      <div style={{
        padding: '20px 28px 16px', background: BPI.card,
        boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: BPI.paper, border: `1.5px solid ${BPI.ink}`,
          padding: '11px 16px', borderRadius: 4, maxWidth: 720,
          boxShadow: '0 2px 0 ' + BPI.ink,
        }}>
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke={BPI.ink} strokeWidth="1.8">
            <circle cx="8" cy="8" r="5.5" /><path d="M12.5 12.5L16 16" strokeLinecap="round" />
          </svg>
          <input style={{
            flex: 1, border: 'none', outline: 'none', fontFamily: 'inherit',
            fontSize: 15, background: 'transparent', color: BPI.ink, fontWeight: 500,
          }} defaultValue="manhattan ace" />
          <button className="bpi" style={{
            background: BPI.ink06, border: 'none', borderRadius: '50%',
            width: 18, height: 18, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: BPI.ink55,
            padding: 0, fontSize: 11, lineHeight: 1, fontFamily: 'inherit',
          }}>×</button>
        </div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: BPI.ink70 }}>
          <span><b style={{ color: BPI.ink }}>23 results</b> for "manhattan ace"</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: BPIMono, color: BPI.ink55 }}>sorted by relevance</span>
          <button className="bpi" style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: BPI.accent, fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
          }}>Change sort →</button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '240px 1fr' }}>

        {/* Left rail — facets */}
        <div style={{
          padding: '22px 22px', overflow: 'auto',
          background: BPI.paper, boxShadow: `inset -1px 0 0 ${BPI.rule}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-0.005em' }}>Filter results</div>
            <button className="bpi" style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: BPI.accent, fontSize: 11.5, fontWeight: 500, fontFamily: 'inherit',
            }}>Reset</button>
          </div>
          <FacetGroup title="Borough" items={[
            { label: 'Manhattan', count: 23 },
            { label: 'Bronx',     count: 0 },
            { label: 'Brooklyn',  count: 0 },
            { label: 'Queens',    count: 0 },
            { label: 'Staten Is.',count: 0 },
          ]} selected={['Manhattan']} />
          <FacetGroup title="Service type" items={[
            { label: 'Local',         count: 5 },
            { label: 'Select Bus (SBS)', count: 4 },
            { label: 'Express',       count: 0 },
          ]} />
          <FacetGroup title="Treatment" items={[
            { label: 'ACE active',    count: 8 },
            { label: 'Bus lane (full)',count: 6 },
            { label: 'Bus lane (partial)', count: 2 },
            { label: 'TSP installed', count: 0 },
          ]} selected={['ACE active']} />
          <FacetGroup title="Performance" items={[
            { label: 'Below scheduled pace', count: 19 },
            { label: 'Slowing 14-day',       count: 6 },
            { label: 'Top decile delay',     count: 3 },
          ]} />
          <div className="rule" style={{ marginTop: 16, marginBottom: 14 }} />
          <div className="eyebrow" style={{ marginBottom: 8 }}>Save this search</div>
          <Button variant="secondary" size="sm" full>Save as alert →</Button>
          <div style={{ fontSize: 10.5, color: BPI.ink55, marginTop: 6, lineHeight: 1.5 }}>
            Email or RSS digest when these results change week-over-week.
          </div>
        </div>

        {/* Center — results */}
        <div style={{ overflow: 'auto', padding: '22px 28px 32px' }}>

          <ResultGroup label="Routes" count={8} onShowAll
            columns={{
              template: '110px 1fr 80px 110px 132px',
              headers: [
                { label: '' },
                { label: 'Route' },
                { label: 'Avg mph', align: 'right' },
                { label: 'Lost RH / day', align: 'right' },
                { label: 'Treatments' },
              ],
            }}>
            {routes.slice(0, 4).map((r, i) => <RouteResult key={i} r={r} />)}
          </ResultGroup>

          <ResultGroup label="Segments" count={9} onShowAll
            columns={{
              template: '28px 110px 1fr 80px 110px 132px',
              headers: [
                { label: '' },
                { label: '' },
                { label: 'Segment' },
                { label: 'mph', align: 'right' },
                { label: 'RH / day', align: 'right' },
                { label: 'Treatments' },
              ],
            }}>
            {segments.map((s, i) => <SegmentResult key={i} s={s} />)}
          </ResultGroup>

          <ResultGroup label="Briefs" count={3}>
            {briefs.map((b, i) => <BriefResult key={i} b={b} />)}
          </ResultGroup>

          <ResultGroup label="Methodology notes" count={3}>
            {[
              { title: 'ACE program — methodology and scope',           where: 'Methods / Datasets', preview: 'How the ACE coverage flag is derived, including handling of partial-day enforcement periods.' },
              { title: 'Speed includes rider experience',               where: 'Methods / Caveats',  preview: 'Why we use "observed bus travel speed" instead of "speed" throughout the studio.' },
              { title: 'Congestion pricing overlap with ACE all-day',   where: 'Methods / Caveats',  preview: 'Why M15 numbers below 60th St in 2025+ can\'t cleanly attribute speed gains.' },
            ].map((m, i) => (
              <div key={i} style={{
                padding: '12px 16px',
                boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
                cursor: 'pointer',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 11, color: BPI.ink55, fontFamily: BPIMono }}>§</span>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{m.title}</div>
                  <div style={{ flex: 1 }} />
                  <div style={{ fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono }}>{m.where}</div>
                </div>
                <div style={{ fontSize: 11.5, color: BPI.ink70, marginTop: 4, marginLeft: 18, lineHeight: 1.5 }}>
                  {m.preview}
                </div>
              </div>
            ))}
          </ResultGroup>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { RF_SearchResults });
