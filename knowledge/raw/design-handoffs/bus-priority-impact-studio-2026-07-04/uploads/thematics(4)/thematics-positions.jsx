// Thematics — Positions (design exploration)
// All static artboards laid out on a design canvas.
//
// Recommended treatment is Take A — "the resolution" — used in the primary
// surface mocks. Takes B and C sit alongside for comparison.

/* ─────────────────────────────────────────────────────────────────
 * Reusable fragments
 * ─────────────────────────────────────────────────────────────── */

function Mast({ section }) {
  return (
    <header className="pg-mast">
      <div className="pg-mast-inner">
        <div>The Folio · {section || 'Position'}</div>
        <div className="pg-mast-name">thematics</div>
        <div className="pg-mast-right">
          <span>Search</span>
          <span>Your book</span>
          <span className="lit">M. Reader</span>
        </div>
      </div>
      <div className="pg-mast-rule" />
    </header>
  );
}

function Kicker({ theme, kind }) {
  const colors = {
    'ai-infra': '#2A6EA8',
    'energy':   '#1F7A55',
    'fed':      '#8C6E2D',
    'consumer': '#B83A4F',
    'crypto':   '#6B4FB8',
  };
  return (
    <div className="pg-kicker">
      <span className="pg-kicker-dot" style={{ background: colors[theme] || '#2A6EA8' }} />
      <span>{themeName(theme)}</span>
      <span className="sep">·</span>
      <span>{kind || 'position'}</span>
    </div>
  );
}

function themeName(t) {
  return {
    'ai-infra': 'AI infrastructure',
    'energy':   'Energy transition',
    'fed':      'Federal balance sheet',
    'consumer': 'Consumer signal',
    'crypto':   'Crypto market structure',
  }[t] || 'AI infrastructure';
}

/* Prose body used as the working example. The expression block falls in
 * after the second paragraph — the moment the contributor commits.        */
function ThesisProseTop() {
  return (
    <>
      <p className="dc">
        Two quarters ago, data-center revenue at <span className="crossref sym">NVDA</span> was
        growing 134% year-on-year. Last quarter it printed 94%. The street's consensus model still
        has it returning to 110%+ by the second half of FY27. That re-acceleration is the load-bearing
        assumption inside almost every long thesis on the name — and it does not survive contact with
        the data the company itself published last week.
      </p>
      <p>
        What is plausible is that growth lands around 60% next quarter and decelerates from there —
        still a remarkable business, but not the curve baked into a $3T market cap. The question isn't
        whether AI infrastructure is real. It is whether one company can keep capturing this share of
        the spend. Margins inside the supply chain say no. The cleanest second read here is from{' '}
        <span className="crossref">@alphaprime</span>, whose model annotations on the published prints
        catch the second derivative the consensus still smooths over.
      </p>
    </>
  );
}

function ThesisProseBottom() {
  return (
    <>
      <p>
        Two adjacent reads worth tracking. First, <span className="crossref sym">TSM</span> monthly revenue
        is decoupling from the headline AI server cycle — the foundry is now sold-out on N3 capacity, but
        the marginal customer (sovereign clouds, enterprise) is paying lower take-rates. Second,{' '}
        <span className="crossref sym">AVGO</span> continues to take ASIC share for every hyperscaler with
        the engineering depth to design its own silicon. The numbers are small today; the curve is the
        wrong direction for Nvidia ASPs.
      </p>
      <p>
        The trade isn't a fade of Nvidia at this level — too crowded, too dependent on quarter timing.
        It is a relative-value short against a long basket of ASIC and memory winners that benefit from
        a flatter, longer-duration capex cycle. Compositional risk; modest sizing.
      </p>
    </>
  );
}

function Sources() {
  return (
    <section className="pg-foot">
      <div className="pg-foot-label">Sources</div>
      <ol className="pg-foot-list">
        <li className="pg-foot-item">
          <div>
            <span className="pg-foot-pub">Nvidia</span>, <span className="pg-foot-title">Q3 FY26 earnings release</span>
            <span className="pg-foot-quote">"Data Center revenue of $30.8B grew 17% sequentially and 94% year-over-year."</span>
          </div>
        </li>
        <li className="pg-foot-item">
          <div>
            <span className="pg-foot-pub">TSMC</span>, <span className="pg-foot-title">monthly revenue release, November</span>
            <span className="pg-foot-quote">"Net revenue for November 2025 was approximately NT$276.06B."</span>
          </div>
        </li>
        <li className="pg-foot-item">
          <div>
            <span className="pg-foot-pub">IDC</span>, <span className="pg-foot-title">worldwide AI server tracker</span>
            <span className="pg-foot-quote">"AI server shipment growth is forecast to slow to 24% in 2026 from 71% in 2025."</span>
          </div>
        </li>
      </ol>
    </section>
  );
}

/* Margin rail — different content per state.                              */
function MarginContributor({ track }) {
  return (
    <div className="mg-section">
      <div className="mg-label">Contributor</div>
      <div className="mg-contrib">
        <span className="mg-mono">AR</span>
        <div>
          <div className="mg-cn-name">A. Reyes</div>
          <div className="mg-cn-handle">@alpharyes</div>
        </div>
      </div>
      <div className="mg-cn-stats">
        Seventy-two positions since launch. <em>Forty-three open</em>, twenty-seven closed,
        two revised. Aggregate book {track || 'up against benchmark on twelve of the last fourteen months'}.
      </div>
      <div className="mg-spark" aria-hidden="true">
        {Array.from({ length: 16 }).map((_, i) => (
          <span key={i} style={{ height: `${[10,12,14,16,15,18,17,19,20,18,22,21,23,24,26,28][i]}px` }} />
        ))}
      </div>
      <button className="mg-cn-cta">Subscribe — $32/month →</button>
      <button className="mg-cn-cta secondary" style={{ marginTop: 8 }}>Read more from A. Reyes</button>
    </div>
  );
}

function MarginRelated() {
  return (
    <div className="mg-section">
      <div className="mg-label">In this theme</div>
      <div className="mg-rel">
        <div className="mg-rel-title">Why the hyperscaler capex cycle hasn't peaked</div>
        <div className="mg-rel-meta">L. Park · open · two days</div>
      </div>
      <div className="mg-rel">
        <div className="mg-rel-title">Memory pricing is the contrarian short for 2026</div>
        <div className="mg-rel-meta">D. Singh · open · three days</div>
      </div>
      <div className="mg-rel">
        <div className="mg-rel-title">Solar manufacturing margins are about to compress</div>
        <div className="mg-rel-meta">N. Okoye · open · last week</div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * Expression block — Take A ("the resolution")
 * The recommended treatment: column-bleeds, double rule top & bottom,
 * sans labels + mono numbers, ends with a "take it →" CTA.
 * Has three modes: redacted (anonymous), full (subscribed), track (returning).
 * ─────────────────────────────────────────────────────────────── */

function ExpressionTakeA({ mode }) {
  return (
    <div className={'ex-a' + (mode === 'redacted' ? ' redacted' : '')}>
      <div className="ex-flag">
        <div className="ex-flag-name">The position</div>
        <div className="ex-flag-stamp">Set Tue 18 Nov 2025 · 09:47 ET · public, tamper-evident</div>
      </div>
      <div className="ex-headline">
        Relative-value short of <em>one name</em> against a six-name long basket. Equal-weighted
        on the long leg, three-month horizon, modest sizing.
      </div>

      {mode === 'track' ? (
        <ExpressionTrack />
      ) : mode === 'redacted' ? (
        <ExpressionTableRedacted />
      ) : (
        <ExpressionTableFull />
      )}

      {mode === 'redacted' && (
        <div className="ex-paywall">
          <div className="ex-paywall-lock">⁂</div>
          <div className="ex-paywall-msg">
            The names and weights sit behind A. Reyes' subscription —
            <em> $32/month, cancel any time</em>.
          </div>
          <div className="ex-cta">Subscribe to read &amp; take →</div>
        </div>
      )}

      {mode !== 'redacted' && (
        <div className="ex-foot">
          <div className="ex-summary">
            {mode === 'track'
              ? <>Position has been live <em>six weeks</em>. Trimmed once. Open.</>
              : <>Filled with sensible defaults, this would size to roughly <em>0.6% of book</em> on the
                short leg and 0.1% per name on the long leg.</>}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {mode === 'track' && <div className="ex-cta secondary">View your fill →</div>}
            <div className="ex-cta">
              {mode === 'track' ? 'Adjust your fill →' : 'Take this position →'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const POSITION_NAMES = [
  { side: 's', sym: 'NVDA', name: 'NVIDIA',        weight: '40%', as: '0.6%' },
  { side: 'l', sym: 'AVGO', name: 'Broadcom',      weight: '15%', as: '0.1%' },
  { side: 'l', sym: 'TSM',  name: 'TSMC',          weight: '15%', as: '0.1%' },
  { side: 'l', sym: 'MSFT', name: 'Microsoft',     weight: '10%', as: '0.1%' },
  { side: 'l', sym: 'META', name: 'Meta',          weight: '10%', as: '0.1%' },
  { side: 'l', sym: 'GOOG', name: 'Alphabet',      weight: '10%', as: '0.1%' },
];

function ExpressionTableFull() {
  return (
    <div className="ex-table">
      <div className="ex-h">Side</div>
      <div className="ex-h">Name</div>
      <div className="ex-h r">Weight</div>
      <div className="ex-h r">% of book</div>
      <div className="ex-h r">Range, set</div>
      {POSITION_NAMES.map((n, i) => (
        <React.Fragment key={i}>
          <div className={'ex-c ex-side ' + (n.side === 's' ? 's' : 'l')}>{n.side === 's' ? 'Short' : 'Long'}</div>
          <div className="ex-c">
            <span className="ex-sym">{n.sym}</span>
            <span className="ex-name">{n.name}</span>
          </div>
          <div className="ex-c r">{n.weight}</div>
          <div className="ex-c r">{n.as}</div>
          <div className="ex-c r">
            {['$1,118 – 1,131','$1,612 – 1,629','$177.40 – 179.95','$466.50 – 470.10','$610.20 – 614.80','$197.10 – 199.40'][i]}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

function ExpressionTableRedacted() {
  return (
    <div className="ex-table">
      <div className="ex-h">Side</div>
      <div className="ex-h">Name</div>
      <div className="ex-h r">Weight</div>
      <div className="ex-h r">% of book</div>
      <div className="ex-h r">Range, set</div>
      {POSITION_NAMES.map((n, i) => (
        <React.Fragment key={i}>
          <div className={'ex-c ex-side ' + (n.side === 's' ? 's' : 'l')}>{n.side === 's' ? 'Short' : 'Long'}</div>
          <div className="ex-c redact"><span className="ex-sym">XXXX</span><span className="ex-name">redacted name</span></div>
          <div className="ex-c redact r">XX%</div>
          <div className="ex-c redact r">X.X%</div>
          <div className="ex-c redact r">$X,XXX – X,XXX</div>
        </React.Fragment>
      ))}
    </div>
  );
}

function ExpressionTrack() {
  const rows = [
    { side: 's', sym: 'NVDA', wAtSet: '40%', wNow: '30%', last: '$1,089.40', pnl: '+8.2%', up: true },
    { side: 'l', sym: 'AVGO', wAtSet: '15%', wNow: '15%', last: '$1,684.30', pnl: '+3.9%', up: true },
    { side: 'l', sym: 'TSM',  wAtSet: '15%', wNow: '15%', last: '$182.45',   pnl: '+1.9%', up: true },
    { side: 'l', sym: 'MSFT', wAtSet: '10%', wNow: '10%', last: '$472.10',   pnl: '+0.8%', up: true },
    { side: 'l', sym: 'META', wAtSet: '10%', wNow: '10%', last: '$606.00',   pnl: '-1.0%', up: false },
    { side: 'l', sym: 'GOOG', wAtSet: '10%', wNow: '10%', last: '$202.80',   pnl: '+2.2%', up: true },
  ];
  return (
    <>
      <div className="ex-track-summary">
        <div>
          <div className="k">Track, since set</div>
          <div className="v up">+4.2%</div>
          <div className="c">vs. benchmark +1.1%</div>
        </div>
        <div>
          <div className="k">Days open</div>
          <div className="v">42</div>
          <div className="c">set 18 Nov · 09:47 ET</div>
        </div>
        <div>
          <div className="k">Largest contributor</div>
          <div className="v">NVDA</div>
          <div className="c">short leg, +8.2% on entry</div>
        </div>
        <div>
          <div className="k">State</div>
          <div className="v" style={{ fontStyle: 'italic' }}>Open</div>
          <div className="c">last touched 10 days ago</div>
        </div>
      </div>

      <div className="ex-track-row">
        <div className="ex-h">Side</div>
        <div className="ex-h">Name</div>
        <div className="ex-h r">At set</div>
        <div className="ex-h r">Now</div>
        <div className="ex-h r">Last</div>
        <div className="ex-h r">P&amp;L</div>
        {rows.map((r, i) => (
          <React.Fragment key={i}>
            <div className={'ex-c ex-side ' + (r.side === 's' ? 's' : 'l')}>{r.side === 's' ? 'Short' : 'Long'}</div>
            <div className="ex-c"><span className="ex-sym">{r.sym}</span></div>
            <div className="ex-c r" style={{ color: 'var(--muted-foreground)' }}>{r.wAtSet}</div>
            <div className="ex-c r">{r.wNow}</div>
            <div className="ex-c r">{r.last}</div>
            <div className={'ex-c r pnl ' + (r.up ? 'up' : 'down')}>{r.pnl}</div>
          </React.Fragment>
        ))}
      </div>

      <div className="ex-adjust-log">
        <strong>Ten days ago</strong> — A. Reyes trimmed the <em>NVDA</em> short from 40% to 30%
        of the position, citing the November <em>TSM</em> revenue release and a tighter stop on
        the relative trade. The long leg is unchanged.
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * Expression block — Take B ("the setting")
 * Stays at column width. Hairline rules. Summary line in serif on top,
 * a compact two-column list below. The most conservative take.
 * ─────────────────────────────────────────────────────────────── */

function ExpressionTakeB() {
  return (
    <div className="ex-b">
      <div className="ex-flag">
        <span>The position</span>
        <span className="ex-stamp">Set 18 Nov · 09:47 ET</span>
      </div>
      <p className="ex-summary-line">
        <em>Short</em> NVDA, <em>40%</em> of position; <em>long</em> AVGO TSM MSFT META GOOG and a tail
        name, equal-weighted at 12% each. Three-month horizon.
      </p>
      <div className="ex-list">
        {POSITION_NAMES.map((n, i) => (
          <div className="ex-item" key={i}>
            <div className="ex-item-name">
              <span className={'ex-item-side ' + (n.side === 's' ? 's' : 'l')}>{n.side === 's' ? 'S' : 'L'}</span>
              <span className="ex-item-sym">{n.sym}</span>
              <span style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13 }}>
                {n.name}
              </span>
            </div>
            <span className="ex-item-w">{n.weight}</span>
          </div>
        ))}
      </div>
      <div className="ex-foot">
        <span className="ex-cta">Take this position →</span>
        <span className="ex-stamp">⁂ public, tamper-evident</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * Expression block — Take C ("the inline ledger")
 * No chrome. Each name is a single line of serif type. Reads as an
 * appendix that earned its way into the article body.
 * ─────────────────────────────────────────────────────────────── */

function ExpressionTakeC() {
  return (
    <div className="ex-c">
      <div className="ex-c-flag">The position — set 18 Nov, 09:47 ET, public.</div>
      {POSITION_NAMES.map((n, i) => (
        <div className="ex-c-line" key={i}>
          <span className="ex-c-side">
            {n.side === 's' ? <><em>Short.</em></> : <><em>Long.</em></>}
          </span>
          <span className="ex-c-name">
            <span className="sym">{n.sym}</span>, <span className="nm">{n.name}</span>.
            {n.side === 's' && ' Forty per cent of the position.'}
            {n.side === 'l' && ' Twelve per cent of the position.'}
          </span>
          <span className="ex-c-w">{n.weight}</span>
        </div>
      ))}
      <div className="ex-c-foot">
        <span>Three-month horizon. Compositional risk; modest sizing.</span>
        <span className="ex-c-cta">Take this position →</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * Primary surface — reader view of a position. Three states.
 * ─────────────────────────────────────────────────────────────── */

function PositionPage({ state }) {
  const stateName =
    state === 'anonymous' ? 'Anonymous reader'
    : state === 'subscribed' ? 'Subscribed reader'
    : 'Returning reader, six weeks later';

  const stateStamp =
    state === 'anonymous' ? <span className="stamp muted">⁂  set Tue 18 Nov 2025 · 09:47 ET</span>
    : state === 'subscribed' ? <span className="stamp">⁂  set Tue 18 Nov 2025 · 09:47 ET</span>
    : <span className="stamp">⁂  set Tue 18 Nov 2025 · open six weeks</span>;

  const exMode =
    state === 'anonymous' ? 'redacted'
    : state === 'subscribed' ? 'full'
    : 'track';

  return (
    <div className="pg">
      <Mast section={stateName} />
      <div className="pg-layout">
        <a className="pg-back">← The front page</a>

        <article className="pg-article">
          <header className="pg-head">
            <Kicker theme="ai-infra" kind="position" />
            <h1 className="pg-title">Nvidia data-center growth is decelerating faster than the buy-side expects</h1>
            <p className="pg-deck">
              Year-on-year growth has bent twice in two quarters. The street is still modelling a third
              re-acceleration into FY27. The shape of the curve disagrees.
            </p>
            <div className="pg-byline">
              <span>By <em>A. Reyes</em></span>
              <span className="sep">·</span>
              <span>5,200 words</span>
              <span className="sep">·</span>
              {stateStamp}
              {state === 'returning' && (
                <>
                  <span className="sep">·</span>
                  <span style={{ color: 'var(--tag-emerald-ink)' }}>open · up 4.2%</span>
                </>
              )}
            </div>
          </header>

          <div className="pg-body">
            <ThesisProseTop />
            <ExpressionTakeA mode={exMode} />
            <ThesisProseBottom />
          </div>

          {state === 'returning' && (
            <div className="pg-revisions">
              <span className="pg-revisions-label">Revision</span>
              <span className="pg-revisions-title">
                The contributor has not revised this position. <em>The thesis above is set as published; the track below it is the living half.</em>
              </span>
              <span className="pg-revisions-cta">Notify me if revised →</span>
            </div>
          )}

          <Sources />
        </article>

        <aside className="pg-margin">
          <MarginContributor track={state === 'returning' ? 'up against benchmark on twelve of the last fourteen months' : undefined} />
          <MarginRelated />
        </aside>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * Contributor page — two variants (unsubscribed, subscribed)
 * ─────────────────────────────────────────────────────────────── */

function ContributorPage({ subscribed }) {
  return (
    <div className="pg">
      <Mast section="Contributor" />
      <div className="cn">
        <header className="cn-head">
          <span className="cn-mono">AR</span>
          <div>
            <h1 className="cn-name">A. Reyes</h1>
            <div className="cn-handle">@alpharyes</div>
            <p className="cn-role">Quantitative researcher. Semiconductors and the AI capex cycle.</p>
          </div>
          <div className="cn-actions">
            {subscribed ? (
              <>
                <button className="btn">Notify on new position</button>
                <button className="btn muted">Subscribed · $32/mo</button>
              </>
            ) : (
              <>
                <button className="btn">Notify</button>
                <button className="btn primary">Subscribe — $32/month</button>
              </>
            )}
          </div>
        </header>

        <p className="cn-record">
          <em>Seventy-two positions</em> since launch in March 2024.
          {' '}<em>Forty-three open</em>, twenty-seven closed, two revised.
          The aggregate book is{' '}<span className="pnl-up">up 18.4%</span> against the
          desk benchmark's <span className="pnl-down">+11.2%</span> over the same window —
          and up on twelve of the last fourteen months.
          Strongest in <em>AI infrastructure</em>; weakest in <em>energy transition</em>,
          where the two revisions both sit.
        </p>

        <div className="cn-table-flag">
          <h2>Positions</h2>
          <div className="filter">
            <span className="on">All</span>
            <span>Open</span>
            <span>Closed</span>
            <span>Revised</span>
            <span>by theme</span>
          </div>
        </div>

        <div className="cn-row head">
          <div className="h">State</div>
          <div className="h">Title</div>
          <div className="h">Side</div>
          <div className="h">Theme</div>
          <div className="h r">Track</div>
          <div className="h r">vs. bench</div>
          <div className="h r">Days</div>
        </div>

        {[
          { state: 'open',    side: 'rv',    theme: 'ai-infra', title: 'Nvidia data-center growth is decelerating faster than the buy-side expects', when: '18 Nov · two hours', pnl: '+4.2%', vs: '+3.1%', d: '42', up: true },
          { state: 'open',    side: 'long',  theme: 'ai-infra', title: 'Why the hyperscaler capex cycle has not peaked', when: '14 Nov · yesterday', pnl: '+1.8%', vs: '+0.7%', d: '38', up: true },
          { state: 'open',    side: 'short', theme: 'ai-infra', title: 'Memory pricing is the contrarian short for 2026', when: '02 Nov · three weeks', pnl: '+6.4%', vs: '+5.0%', d: '54', up: true },
          { state: 'revised', side: 'long',  theme: 'ai-infra', title: 'The unappreciated grid-bottleneck winner', when: '14 Oct · revised 2 Nov', pnl: '-2.1%', vs: '-3.4%', d: '70', up: false },
          { state: 'closed',  side: 'short', theme: 'consumer', title: 'Card delinquencies divergence by income decile', when: 'Closed 28 Oct', pnl: '+11.4%', vs: '+9.2%', d: '92', up: true },
          { state: 'open',    side: 'long',  theme: 'fed',      title: 'Bills, not coupons — the QT-end composition trade', when: '07 Oct · five weeks', pnl: '+2.6%', vs: '+1.4%', d: '64', up: true },
          { state: 'closed',  side: 'short', theme: 'energy',   title: 'Solar manufacturer margins compress on tariff sunset', when: 'Closed 18 Sep', pnl: '-4.0%', vs: '-1.7%', d: '110', up: false },
        ].map((r, i) => (
          <div key={i} className="cn-row">
            <div><span className={'stamp ' + r.state}>{r.state}</span></div>
            <div>
              <div className="title">{r.title}</div>
              <div className="when">{r.when}</div>
            </div>
            <div>
              <span className={'side ' + (r.side === 'long' ? 'l' : r.side === 'short' ? 's' : 'x')}>
                {r.side === 'rv' ? 'RV' : r.side}
              </span>
            </div>
            <div className="theme">
              <span className="dot" style={{
                background:
                  r.theme === 'ai-infra' ? '#2A6EA8'
                : r.theme === 'fed' ? '#8C6E2D'
                : r.theme === 'energy' ? '#1F7A55'
                : r.theme === 'consumer' ? '#B83A4F' : '#6B4FB8'
              }}/>
              {themeName(r.theme)}
            </div>
            <div className={'num ' + (r.up ? 'up' : 'down')}>{r.pnl}</div>
            <div className="num r">{r.vs}</div>
            <div className="num r">{r.d}</div>
          </div>
        ))}

        {!subscribed && (
          <div className="cn-paywall-card">
            <div>
              <h3 className="cn-paywall-h">Subscribe to read the names</h3>
              <p className="cn-paywall-d">
                You can read the full thesis on every position above. The expression — the names, weights,
                and adjustments — sits behind A. Reyes' subscription.
              </p>
              <div className="cn-paywall-price">$32 / month · cancel any time · ⁂  monthly receipt</div>
            </div>
            <button className="btn primary" style={{ font: '500 14px var(--font-sans)', padding: '14px 22px', border: '1px solid var(--primary)', background: 'var(--primary)', color: 'var(--on-primary)' }}>
              Subscribe →
            </button>
          </div>
        )}

        <div className="cn-notes-flag">
          <h3>Notes — prose without a position. Read-only; cannot be taken.</h3>
        </div>
        <div className="cn-note">
          <span className="when">Mon 16 Nov</span>
          A short note on why I'm still <em>not</em> publishing on Tesla. The thesis I want to make
          requires sourcing I do not yet have; until that lands, this is op-ed, not a position.
        </div>
        <div className="cn-note">
          <span className="when">Thu 12 Nov</span>
          The 2018 GPU cycle is the wrong analogue for today; it is the 2014 cycle that rhymes,
          and it ended in a thirty-month sideways print, not a crash. Mentioned for the next position.
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * Front page — folio variant ("the desk takes")
 * ─────────────────────────────────────────────────────────────── */

function FrontPage() {
  return (
    <div className="pg">
      <Mast section="The front page" />
      <div className="fl">
        <div className="fl-mast">
          <div style={{ font: '500 11px var(--font-mono)', letterSpacing: '0.22em', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
            ⁂ &nbsp;&nbsp;The Folio &nbsp;&nbsp; ⁂
          </div>
          <div className="fl-mast-name">thematics</div>
          <div className="fl-mast-tag">positions published by the desk · tamper-evident · taken into your book</div>
          <div className="fl-mast-meta">
            Edition <em>1,182</em> &nbsp;&nbsp;·&nbsp;&nbsp; <em>Tuesday</em>, 18 November 2025 &nbsp;&nbsp;·&nbsp;&nbsp; 64 contributors &nbsp;&nbsp;·&nbsp;&nbsp; <em>187</em> positions open
          </div>
        </div>

        <div className="fl-banner">
          The desk <strong>takes</strong> positions today; it does not just read.
          Every headline below is a thesis the contributor is willing to be wrong about, in public, with a date and a fill.
        </div>

        <section className="fl-lead">
          <div className="fl-lead-main">
            <div className="fl-stamp-row">
              <span className="stamp open">open</span>
              <span>AI infrastructure · the lead</span>
              <span>·</span>
              <span style={{ color: 'var(--tag-emerald-ink)' }}>up 4.2% since 09:47</span>
            </div>
            <h1 className="fl-lead-title">Nvidia data-center growth is decelerating faster than the buy-side expects</h1>
            <p className="fl-lead-deck">
              Year-on-year growth has bent twice in two quarters. The street is still modelling a third
              re-acceleration into FY27. The shape of the curve disagrees.
            </p>
            <p className="fl-lead-byline">By <em>A. Reyes</em> · two hours ago · 5,200 words</p>
            <p className="fl-lead-excerpt">
              Two quarters ago, data-center revenue at NVDA was growing 134% year-on-year. Last quarter it
              printed 94%. The street's consensus model still has it returning to 110%+ by the second half
              of FY27. That re-acceleration is the load-bearing assumption inside almost every long thesis
              on the name — and it does not survive contact with the data the company itself published…
            </p>
            <div className="fl-lead-expression">
              <div className="flag">The position — set 09:47 ET</div>
              <div className="line">
                <em>Short</em> NVDA against a long basket of six ASIC and memory winners,
                equal-weighted, <em>three-month horizon</em>.
              </div>
            </div>
            <a className="fl-readon">Read the thesis and take the position →</a>
          </div>
          <div className="fl-lead-side">
            <div className="fl-side-flag">Also set this morning</div>
            {[
              { theme: 'fed', name: 'Federal balance sheet', title: 'Balance-sheet runoff is ending. What replaces it matters more than the rate path.', tag: 'Long TLT against a steepener; 6-month horizon.', by: 'E. Mendes', when: 'three hours · open', stamp: 'open' },
              { theme: 'crypto', name: 'Crypto market structure', title: 'ETF flows tell a different story than spot price', tag: 'Spread the basis: long ETF, short CME front; tactical.', by: 'J. Wei', when: 'this morning · open', stamp: 'open' },
              { theme: 'consumer', name: 'Consumer signal', title: 'Credit-card delinquencies are diverging by income decile', tag: 'Short XRT, paired against the staples leader.', by: 'R. Chen', when: 'yesterday · revised today', stamp: 'revised' },
            ].map((s, i) => (
              <article key={i} className="fl-side-item">
                <div className="fl-side-stamps">
                  <span className="dot" style={{
                    background: s.theme === 'fed' ? '#8C6E2D'
                              : s.theme === 'crypto' ? '#6B4FB8'
                              : s.theme === 'consumer' ? '#B83A4F' : '#2A6EA8'
                  }} />
                  <span>{s.name}</span>
                  <span>·</span>
                  <span className={'stamp ' + s.stamp}>{s.stamp}</span>
                </div>
                <h3 className="fl-side-title">{s.title}</h3>
                <p className="fl-side-tag"><em>The position —</em> {s.tag}</p>
                <p className="fl-side-by">By <em>{s.by}</em> · {s.when}</p>
              </article>
            ))}
          </div>
        </section>

        <div className="fl-grid-flag">
          <h2>Below the fold — positions set this week</h2>
          <div className="blurb">Newest first. Each carries its track since set.</div>
        </div>

        <div className="fl-grid">
          {[
            { stamp: 'open',    pnl: '+1.8%',  vs: '+0.7%', title: 'Why the hyperscaler capex cycle has not peaked', tag: 'Long basket of four hyperscalers, equal-weighted.', by: 'L. Park', when: 'yesterday', up: true },
            { stamp: 'open',    pnl: '+6.4%',  vs: '+5.0%', title: 'Memory pricing is the contrarian short for 2026', tag: 'Short MU outright; tighter stop than usual.', by: 'D. Singh', when: 'three days', up: true },
            { stamp: 'revised', pnl: '-2.1%',  vs: '-3.4%', title: 'The unappreciated grid-bottleneck winner', tag: 'Long NEE; revised down on weights after FERC ruling.', by: 'N. Okoye', when: 'four days · revised', up: false },
            { stamp: 'open',    pnl: '+2.6%',  vs: '+1.4%', title: 'Bills, not coupons — the QT-end composition trade', tag: 'Curve steepener via 2y/10y, modest sizing.', by: 'E. Mendes', when: 'five days', up: true },
            { stamp: 'open',    pnl: '-0.4%',  vs: '-1.1%', title: 'Why First Solar\u2019s ASP protection is two votes from sunset', tag: 'Short FSLR, paired against the foreign incumbent.', by: 'N. Okoye', when: 'last week', up: false },
            { stamp: 'open',    pnl: '+0.9%',  vs: '+0.2%', title: 'TSMC monthly revenue is decoupling from the AI cycle', tag: 'Long TSM, short the second-derivative names; expression.', by: 'A. Reyes', when: 'last week', up: true },
          ].map((g, i) => (
            <article key={i} className="fl-grid-item">
              <div className="fl-grid-pnl">
                <span className={g.up ? 'up' : 'down'}>{g.pnl}</span>
                <span style={{ color: 'var(--subtle-foreground)' }}> &nbsp;· vs. bench {g.vs}</span>
              </div>
              <div style={{ marginBottom: 10 }}>
                <span className={'stamp ' + g.stamp}>{g.stamp}</span>
              </div>
              <h3 className="fl-grid-title">{g.title}</h3>
              <p className="fl-grid-deck">{g.tag}</p>
              <p className="fl-grid-by">By <em>{g.by}</em> · {g.when}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * Your book
 * ─────────────────────────────────────────────────────────────── */

function YourBook() {
  return (
    <div className="pg">
      <Mast section="Your book" />
      <div className="yb">
        <header className="yb-mast">
          <div>
            <h1>Your book</h1>
            <p className="deck">
              Eleven positions taken since you joined in August. Grouped by the contributor whose
              thesis you bought into. The original argument is always one click away.
            </p>
          </div>
          <div className="agg">
            <div>
              <div className="k">Aggregate</div>
              <div className="v up">+7.4%</div>
              <div className="c">since you joined</div>
            </div>
            <div>
              <div className="k">vs. benchmark</div>
              <div className="v up">+3.1%</div>
              <div className="c">over same window</div>
            </div>
            <div>
              <div className="k">Open</div>
              <div className="v">8</div>
              <div className="c">of eleven taken</div>
            </div>
          </div>
        </header>

        {[
          {
            mono: 'AR', name: 'A. Reyes', handle: '@alpharyes',
            note: '4 positions taken — 3 open, 1 closed. Up 9.1% in aggregate; +5.4% vs. benchmark over the same window.',
            items: [
              { title: 'Nvidia data-center growth is decelerating faster than the buy-side expects', arg: '"The street is still modelling a third re-acceleration into FY27. The shape of the curve disagrees."', when: 'Taken 18 Nov · open · two hours', pnl: '+4.2%', up: true, days: '42' },
              { title: 'Memory pricing is the contrarian short for 2026', arg: '"The market reads sold-out as bullish. It is not — it is a backward-looking statement."', when: 'Taken 02 Nov · open · three weeks', pnl: '+6.4%', up: true, days: '54' },
              { title: 'Card delinquencies divergence by income decile', arg: '"The aggregate prints look stable because the top three deciles have de-levered."', when: 'Closed 28 Oct · realised', pnl: '+11.4%', up: true, days: '92' },
            ]
          },
          {
            mono: 'EM', name: 'E. Mendes', handle: '@themacrodesk',
            note: '2 positions taken — both open. Up 3.0% in aggregate; +1.4% vs. benchmark.',
            items: [
              { title: 'Balance-sheet runoff is ending. What replaces it matters more than the rate path.', arg: '"With reserves now within $200B of the bottom of the working range, the Committee will need to start buying again."', when: 'Taken 07 Oct · open · five weeks', pnl: '+2.6%', up: true, days: '64' },
              { title: 'The bills-vs-coupons composition trade', arg: '"The curve does not steepen on the rate cut; it steepens on the buy-back mix."', when: 'Taken 14 Sep · open · ten weeks', pnl: '+3.4%', up: true, days: '88' },
            ]
          },
          {
            mono: 'NO', name: 'N. Okoye', handle: '@nokoye',
            note: '3 positions taken — 2 open, 1 closed at a loss. Down 1.4% in aggregate; -0.3% vs. benchmark.',
            items: [
              { title: 'The unappreciated grid-bottleneck winner', arg: '"Generation isn\u2019t the constraint — the interconnect is."', when: 'Taken 14 Oct · revised 2 Nov · open', pnl: '-2.1%', up: false, days: '70' },
              { title: 'Why First Solar\u2019s ASP protection is two votes from sunset', arg: '"Two regulatory votes from sunset — and the market is still pricing the old structure."', when: 'Taken last week · open', pnl: '-0.4%', up: false, days: '8' },
              { title: 'Solar margins compress on tariff sunset', arg: '"A short note: the protective structure is two regulatory votes from sunset."', when: 'Closed 18 Sep · realised', pnl: '-4.0%', up: false, days: '110' },
            ]
          },
        ].map((g, gi) => (
          <section key={gi} className="yb-group">
            <header className="yb-group-head">
              <span className="yb-group-mono">{g.mono}</span>
              <div>
                <div className="yb-group-name">{g.name}</div>
                <div className="yb-group-handle">{g.handle}</div>
              </div>
              <div className="yb-group-agg">{g.note}</div>
            </header>
            {g.items.map((it, i) => (
              <article key={i} className="yb-item">
                <div>
                  <div className="yb-item-title">{it.title}</div>
                  <div className="yb-item-meta">
                    {it.when} &nbsp;·&nbsp; <span className="crossref">read the thesis →</span>
                  </div>
                </div>
                <div className="yb-item-arg">{it.arg}</div>
                <div>
                  <div className={'yb-item-num ' + (it.up ? 'up' : 'down')}>{it.pnl}</div>
                  <div className="yb-item-c">since you took</div>
                </div>
                <div>
                  <div className="yb-item-num" style={{ color: 'var(--muted-foreground)' }}>{it.days}</div>
                  <div className="yb-item-c">days open</div>
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * Side-by-side expression-block artboards (compact, just the block)
 * ─────────────────────────────────────────────────────────────── */

function ExpressionStudy({ take }) {
  return (
    <div style={{ background: 'var(--background)', padding: '48px 48px 56px', fontFamily: 'var(--font-serif)' }}>
      <div style={{
        font: '500 10px/1 var(--font-mono)', letterSpacing: '0.22em', textTransform: 'uppercase',
        color: 'var(--muted-foreground)', marginBottom: 12
      }}>
        Take {take} · expression inside thesis
      </div>
      <div style={{
        font: '600 26px/1.18 var(--font-serif)', letterSpacing: '-0.012em',
        margin: '0 0 24px', maxWidth: '28ch'
      }}>
        {take === 'A' && 'A column-bleed double-rule resolution'}
        {take === 'B' && 'A column-width hairline setting'}
        {take === 'C' && 'An inline serif ledger'}
      </div>

      <div style={{ maxWidth: 720, font: '400 18px/1.7 var(--font-serif)' }}>
        <p style={{ margin: '0 0 18px' }}>
          …<em>Nvidia</em> still printed 94% year-on-year. The street's model has it returning to 110%+
          by the second half of FY27. That re-acceleration is the load-bearing assumption inside almost
          every long thesis on the name — and it does not survive contact with the data.
        </p>
        <p style={{ margin: '0 0 18px' }}>
          The trade isn't a fade of Nvidia outright. It is a relative-value short against a long basket
          of ASIC and memory winners that benefit from a flatter, longer-duration capex cycle.
        </p>

        {take === 'A' && <ExpressionTakeA mode="full" />}
        {take === 'B' && <ExpressionTakeB />}
        {take === 'C' && <ExpressionTakeC />}

        <p style={{ margin: '0 0 18px' }}>
          Compositional risk; modest sizing. The cleanest second read here is from <em>@alphaprime</em>,
          whose model annotations on the published prints catch the second derivative the consensus model
          still smooths over.
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * Brief overview / typographic note / vocabulary cards
 * ─────────────────────────────────────────────────────────────── */

function BriefCard() {
  return (
    <div className="note-card">
      <div className="kicker">Brief, in one paragraph</div>
      <h2>The thesis and the position are one published object.</h2>
      <p>
        Every published artifact has both halves. The thesis sets the conviction in serif prose at the
        720-pixel reading column; the expression — the trade or basket — sits inside the article at the
        moment in the argument where the contributor commits. Without both, the thing is not publishable.
        Prose without an expression demotes to a notes lane that cannot be taken.
      </p>
      <p>
        Three reader states. <em>Anonymous</em> reads the full thesis and sees the shape of the expression
        (direction, theme, contributor's running track) but not the names or weights. <em>Subscribed</em>
        reads the names, the weights, and every adjustment. <em>Returning, weeks later</em> sees the same
        immutable thesis with the living track overlaid on the expression block.
      </p>
      <p className="sig">
        See the artboards to the right: expression-block typography (three takes), then the primary
        surface, then secondary surfaces — contributor, folio, your book.
      </p>
    </div>
  );
}

function TypographicNote() {
  return (
    <div className="note-card">
      <div className="kicker">Typographic note · ≤ 300 words</div>
      <h2>How the expression block sits inside the thesis prose.</h2>
      <p>
        The expression is the article's <em>resolution</em>. The reader arrives at it the way a reader of
        an argument arrives at a conclusion — having earned it. So it cannot sit in a side rail (read
        before the argument) or below the article (read after, as documentation). It has to fall inside
        the prose, at the moment of commitment.
      </p>
      <p>
        Three takes are explored. <em>Take A — the resolution</em> breaks the column, sets in sans labels
        and mono figures between two 3px double rules, and ends with a primary "take this position"
        action. It feels like a printed footer-of-record dropped into the article body. <em>Take B — the
        setting</em> stays at column width with hairline rules and a single serif summary line above a
        compact list. The most conservative. <em>Take C — the inline ledger</em> uses no chrome at all:
        each name is a single line of serif type with mono weights, separated by a dotted hairline. The
        most editorial; closest to an appendix that earned its way into the body.
      </p>
      <p>
        <em>Recommend Take A.</em> The brief insists the position is not optional — it is the <em>point</em>
        of the article. Take B reads as a sidebar the reader can skip; Take C reads as a citation. Take A
        is the only one that visibly stops the prose, sets, and resumes — which is what is true of the
        commitment itself. The column-bleed is the rule. The double-rule and asterism stamp are the
        signal of immutability, lifted from the printed broadsheet vocabulary already established. The
        primary blue CTA is the only "lit" moment on the page, which keeps the rest of the article ink.
      </p>
      <p className="sig">
        Take A used throughout the primary surface mocks. Takes B and C remain in the canvas for
        comparison.
      </p>
    </div>
  );
}

function VocabCard() {
  return (
    <div className="vocab-card">
      <div className="kicker">Vocabulary · three sets, with arguments</div>
      <h2>What we call it.</h2>

      <div className="vocab-set">
        <h3>The unit itself</h3>
        <div className="vocab-opt">
          <span className="word pick">a position</span>
          <span className="arg">The everyday financial sense already insists on both halves: you cannot have a position without expressing it. <em>Recommended.</em></span>
        </div>
        <div className="vocab-opt">
          <span className="word">a call</span>
          <span className="arg">Short and clear, but reads as a macroeconomic forecast — pundit-flavored, and not transitively about a trade.</span>
        </div>
        <div className="vocab-opt">
          <span className="word">a take</span>
          <span className="arg">Too casual; evokes hot-takes and signals-group voice. Out.</span>
        </div>
        <div className="vocab-opt">
          <span className="word">a play</span>
          <span className="arg">Retail-trader register. Exactly the framing we are trying to escape.</span>
        </div>
      </div>

      <div className="vocab-set">
        <h3>The verb a reader does when they accept it</h3>
        <div className="vocab-opt">
          <span className="word pick">take it</span>
          <span className="arg">Direct, transitive, has the right ownership flavor — you <em>take a position into</em> your book. <em>Recommended.</em></span>
        </div>
        <div className="vocab-opt">
          <span className="word">mirror</span>
          <span className="arg">Reads as copy-trade. Exactly what the brief asks us to refuse.</span>
        </div>
        <div className="vocab-opt">
          <span className="word">hold</span>
          <span className="arg">Too passive. Holding is what you do <em>after</em> taking.</span>
        </div>
        <div className="vocab-opt">
          <span className="word">join</span>
          <span className="arg">Wrong relation — you join a movement, not a single thesis.</span>
        </div>
      </div>

      <div className="vocab-set">
        <h3>The aggregate of positions over time</h3>
        <div className="vocab-opt">
          <span className="word pick">the book</span>
          <span className="arg">Trading-desk language — <em>"what's on your book"</em>. Warm without being chummy; not "portfolio." <em>Recommended.</em></span>
        </div>
        <div className="vocab-opt">
          <span className="word">record</span>
          <span className="arg">Confuses with track record. The book contains the record but is not it.</span>
        </div>
        <div className="vocab-opt">
          <span className="word">ledger</span>
          <span className="arg">Too accountant; weight without warmth.</span>
        </div>
        <div className="vocab-opt">
          <span className="word">run</span>
          <span className="arg">Sporting register — wrong for the brand.</span>
        </div>
      </div>

      <p className="vocab-rec">→ Position. Take. Book.</p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * Composition — the design canvas
 * ─────────────────────────────────────────────────────────────── */

function PositionsExploration() {
  return (
    <DesignCanvas>
      <DCSection id="brief" title="Thematics — Positions" subtitle="The thesis-position fused into one published object. Reader view in three states, plus contributor, folio, and your-book.">
        <DCArtboard id="brief" label="The brief, in one paragraph" width={920} height={620}>
          <BriefCard />
        </DCArtboard>
        <DCArtboard id="vocab" label="Vocabulary — three sets" width={860} height={760}>
          <VocabCard />
        </DCArtboard>
        <DCArtboard id="note" label="Typographic note · the single most important visual decision" width={920} height={760}>
          <TypographicNote />
        </DCArtboard>
      </DCSection>

      <DCSection id="expression" title="The expression block — three takes" subtitle="Where the expression sits inside the thesis. Recommendation: Take A.">
        <DCArtboard id="take-a" label="A · the resolution — column-bleed, double rule" width={920} height={1100}>
          <ExpressionStudy take="A" />
        </DCArtboard>
        <DCArtboard id="take-b" label="B · the setting — column-width, hairline" width={920} height={800}>
          <ExpressionStudy take="B" />
        </DCArtboard>
        <DCArtboard id="take-c" label="C · the inline ledger — no chrome" width={920} height={900}>
          <ExpressionStudy take="C" />
        </DCArtboard>
      </DCSection>

      <DCSection id="primary" title="Primary surface — reader view of a position, three states" subtitle="The thesis half is set on publication; only the track half is living. All three use Take A for the expression block.">
        <DCArtboard id="anon" label="01 · Anonymous reader — expression redacted; mirror affordance paywalled" width={1240} height={2100}>
          <PositionPage state="anonymous" />
        </DCArtboard>
        <DCArtboard id="sub" label="02 · Subscribed reader — full expression, fill via agent" width={1240} height={2280}>
          <PositionPage state="subscribed" />
        </DCArtboard>
        <DCArtboard id="ret" label="03 · Returning reader, six weeks later — track + adjustment log" width={1240} height={2480}>
          <PositionPage state="returning" />
        </DCArtboard>
      </DCSection>

      <DCSection id="contrib" title="Contributor page — two variants" subtitle="Subscribe is the dominant action. Prose-only notes are demoted.">
        <DCArtboard id="cn-un" label="Unsubscribed — thesis readable, expression paywalled" width={1240} height={1640}>
          <ContributorPage subscribed={false} />
        </DCArtboard>
        <DCArtboard id="cn-sub" label="Subscribed — full track at each row" width={1240} height={1480}>
          <ContributorPage subscribed={true} />
        </DCArtboard>
      </DCSection>

      <DCSection id="folio" title="Front page — folio, reframed" subtitle="The desk takes positions today; it does not just read. Lead-spread treatment with the expression line surfacing in the lede.">
        <DCArtboard id="fl" label="Folio · taking, not just reading" width={1240} height={2240}>
          <FrontPage />
        </DCArtboard>
      </DCSection>

      <DCSection id="book" title="Your book — arguments you have bought into" subtitle="Grouped by contributor; original thesis always one click away. Reads as a roundup of arguments, not a portfolio statement.">
        <DCArtboard id="yb" label="Your book" width={1240} height={1640}>
          <YourBook />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

Object.assign(window, {
  PositionsExploration,
  Mast, Kicker, ThesisProseTop, ThesisProseBottom, Sources,
  MarginContributor, MarginRelated,
  ExpressionTakeA, ExpressionTakeB, ExpressionTakeC,
  ExpressionStudy,
  PositionPage, ContributorPage, FrontPage, YourBook,
  BriefCard, VocabCard, TypographicNote,
});
