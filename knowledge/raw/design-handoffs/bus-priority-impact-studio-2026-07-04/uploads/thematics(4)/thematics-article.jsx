// Thematics — Article surface.
// Reading column + right rail (mentioned tickers, related signals, conversation starters).
// Question chips expand inline answers; the chat input opens a new Chat with this article seeded.

const { useState: useArt_useState, useMemo: useArt_useMemo } = React;

// Render prose with #TICKER and @handle mentions replaced by their inline primitives.
function ProseLine({ text }) {
  const parts = useArt_useMemo(() => {
    const out = [];
    // Single regex: either #TICKER or @handle (alphanumerics + underscore).
    const re = /(#[A-Z]{1,5}|@[A-Za-z0-9_]{2,32})/g;
    let last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push({ kind: 't', text: text.slice(last, m.index) });
      const tok = m[0];
      if (tok[0] === '#') out.push({ kind: 'ticker', symbol: tok.slice(1) });
      else                 out.push({ kind: 'person', handle: tok.slice(1) });
      last = m.index + tok.length;
    }
    if (last < text.length) out.push({ kind: 't', text: text.slice(last) });
    return out;
  }, [text]);
  return <>{parts.map((p, i) => {
    if (p.kind === 'ticker') return <TickerInline key={i} symbol={p.symbol} />;
    if (p.kind === 'person') return <PersonInline key={i} handle={p.handle} />;
    return <ParseEm key={i} text={p.text} />;
  })}</>;
}

// Render `_italic_` markers as <em>.
function ParseEm({ text }) {
  const out = [];
  const re = /_([^_]+)_/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<em key={out.length}>{m[1]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

function SurfaceArticle({ finding, onOpenChat, onPinFinding, onSeedChat }) {
  const theme = window.THEMES.find(t => t.id === finding.themeId);
  const [openStarter, setOpenStarter] = useArt_useState(null);
  const [sourcesOpen, setSourcesOpen] = useArt_useState(false);

  return (
    <div className="tx-article-layout">
      {/* Main reading column */}
      <article className="tx-article">
        <header className="tx-art-head">
          <Chip hue={theme.hue}>{theme.name}</Chip>
          <h1 className="tx-art-title">{finding.title}</h1>
          <p className="tx-art-lede">{finding.lede}</p>
          <p className="tx-art-byline">{finding.contributor}. {finding.publishedAt}.</p>
        </header>

        <div className="tx-art-body">
          {finding.body.map((block, i) => {
            if (block.kind === 'p') return <p key={i} className="tx-art-p"><ProseLine text={block.text} /></p>;
            if (block.kind === 'viz' || block.kind === 'metric') return <Viz key={i} viz={block.viz} />;
            return null;
          })}
        </div>

        {/* Conversation starters — inline at end of article, not in sidebar */}
        <section className="tx-art-starters">
          <h3 className="tx-art-st-label">Pull on a thread</h3>
          <div className="tx-art-st-chips">
            {finding.starters.map((q, i) => (
              <QuestionChip key={i} onClick={() => setOpenStarter(openStarter === i ? null : i)}>{q}</QuestionChip>
            ))}
          </div>
          {openStarter !== null && (
            <div className="tx-art-st-answer">
              <SimulatedAnswer prompt={finding.starters[openStarter]} finding={finding} />
              <button className="tx-art-st-open" onClick={() => onSeedChat(finding.id, finding.starters[openStarter])}>
                Open this in a chat <Icon name="arrow-right" size={14}/>
              </button>
            </div>
          )}
        </section>

        {/* Sources pill */}
        {finding.sources.length > 0 && (
          <section className="tx-art-sources">
            <button className="tx-art-srcpill" onClick={() => setSourcesOpen(!sourcesOpen)}>
              <Icon name="layers" size={14}/>
              {finding.sources.length} {finding.sources.length === 1 ? 'source' : 'sources'}
              <Icon name={sourcesOpen ? 'chevron-down' : 'chevron-right'} size={14}/>
            </button>
            {sourcesOpen && (
              <ul className="tx-art-srclist">
                {finding.sources.map(s => (
                  <li key={s.id}>
                    <SourcePill source={s}/>
                    <span className="tx-art-srctitle">{s.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </article>

      {/* Right rail */}
      <aside className="tx-art-rail">
        <RailMentioned mentions={finding.mentions} />
        <RailRelated signals={finding.relatedSignals} />
      </aside>
    </div>
  );
}

// ── Right rail: Mentioned tickers (clickable → ticker page) ──────────────
function RailMentioned({ mentions }) {
  return (
    <section className="tx-rail-section">
      <div className="tx-rail-label">Mentioned</div>
      <div className="tx-rail-tickers">
        {mentions.map(sym => {
          const t = window.TICKERS[sym];
          if (!t) return null;
          const up = t.deltaPct >= 0;
          return (
            <button key={sym} className="tx-rail-ticker tx-rail-ticker-btn"
              onClick={() => window.thematicsNav?.openTicker?.(sym)}
              aria-label={`Open ${sym} page`}>
              <div className="tx-rail-tk-left">
                <div className="tx-rail-tk-sym">{sym}</div>
                <div className="tx-rail-tk-name">{t.name}</div>
              </div>
              <div className="tx-rail-tk-spark" style={{ color: up ? 'var(--tag-emerald-ink)' : 'var(--tag-crimson-ink)' }}>
                <Sparkline data={t.spark} width={64} height={22} stroke="currentColor" dot={false}/>
              </div>
              <div className="tx-rail-tk-right">
                <div className="tx-rail-tk-price">{t.price.toFixed(2)}</div>
                <div className={'tx-rail-tk-d ' + (up ? 'up' : 'down')}>{up ? '+' : ''}{t.deltaPct.toFixed(2)}%</div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ── Right rail: Related signals (typography, no card chrome) ─────────────
function RailRelated({ signals }) {
  return (
    <section className="tx-rail-section">
      <div className="tx-rail-label">Related signals</div>
      <ul className="tx-rail-sig-list">
        {signals.map(s => (
          <li key={s.id}>
            <a className="tx-rail-sig-link" href="#" onClick={(e) => e.preventDefault()}>
              <ConfidencePip level={s.confidence} />
              <span>{s.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Simulated inline answer ──────────────────────────────────────────────
function SimulatedAnswer({ prompt, finding }) {
  // Canned content; in real product this calls the LLM via window.claude.
  const text = inlineAnswerFor(prompt, finding);
  return (
    <div className="tx-art-st-body">
      <p className="tx-art-p"><ProseLine text={text} /></p>
    </div>
  );
}

function inlineAnswerFor(prompt, finding) {
  const p = prompt.toLowerCase();
  if (p.includes('buy-side') || p.includes('still modelling'))
    return "The street is still anchored to the FY25 supercycle base rate. Reverse-engineering the median model, the assumption is that the 'sovereign AI' wave repeats the 2024–25 hyperscaler step-up — a roughly $40B addressable swing across the back half of FY27. The trouble is that sovereign budgets are signed once, not annually; the demand curve is order-of-magnitude lumpier than the cloud one. If even three of the eight signed sovereign deals slip past FY27, consensus is unreachable on math alone.";
  if (p.includes('2018') || p.includes('comparable'))
    return "The 2018 cycle hit peak yoy growth of 91% in Q2 2018, ended the year at -8%, and bottomed at -52% in Q3 2019 — fifteen months from peak to trough. The setup rhymes but is not identical: the 2018 cycle was a 'crypto miner' overhang on top of a normalising gaming cycle, with no recurring data-center base. Today the data-center business is structural, but the marginal customer (sovereign, enterprise) is signing slower. A more honest comparable is the 2000 enterprise-IT cycle, which decelerated from 70%+ to single-digits over four quarters.";
  if (p.includes('suppliers') || p.includes('de-rate'))
    return "Three names de-rate before #NVDA does. #AVGO holds up best given diversified ASIC share; #TSM is insulated by pricing power on advanced nodes; #MU is the most exposed and has already started to break the pattern.";
  if (p.includes('hyperscaler') || p.includes('exposed'))
    return "Meta has the highest single-name exposure to a capex pause. #META 2026 guide implies AI-driven capex grows to ~$95B from ~$50B in 2024 — a 90%+ step that the market has accepted on faith. If revenue lift from AI-driven ads doesn't show up by Q2 next year, the call to 'rethink the pace' is the natural pressure-release.";
  if (p.includes('short') || p.includes('pair'))
    return "The cleanest pair is long #AVGO / short #NVDA on a 1:1 dollar basis, sized to two-week realised volatility. The trade expresses the asymmetry: if data-center growth holds, both go up but #AVGO catches up; if it breaks, #AVGO holds because ASIC share is a structural shift.";
  if (p.includes('basis') || p.includes('btc'))
    return "Mechanically: the basis trader is long the spot ETF (#IBIT or peers) and short the CME futures contract at a positive carry. When the carry compresses to within 6% — roughly the cost of capital plus fees — the trade stops being profitable. The unwind is the trader selling ETF and buying back futures, which removes a buyer from spot. Net effect: spot weakens even as headline price 'looks fine' because of organic retail offset.";
  if (p.includes('bills') || p.includes('coupons'))
    return "If the Fed buys bills, the front end stays anchored and the long end widens. If it buys coupons (likely the belly, 2–10y), the curve flattens fast and #TLT outperforms. The minutes language ('shorter-dated securities' was struck) reads as quietly leaning toward bills, but the operating reality of holding portfolio duration means at least 30% of the new buying ends up in coupons.";
  if (p.includes('replaces'))
    return "Reserve maintenance, not stimulus. With the operating range at $3.0T floor and reserves at $3.2T as of last week, the Committee will start adding to maintain the buffer — beginning with bill operations, escalating to coupon purchases if needed. None of this is QE; the framing matters for risk assets.";
  if (p.includes('survives') || p.includes('asp'))
    return "First Solar survives because thin-film is structurally cheaper than crystalline on a per-watt installed basis, even at degraded ASPs. The risk is that a 30% ASP cut compresses gross margin from 47% to ~18% — still profitable, but the multiple compresses to a utility-style 9-10x rather than a growth-stage 18x. Plan around that re-rate.";
  if (p.includes('queue') || p.includes('grid') || p.includes('right-of-way'))
    return "Right-of-way ownership is the underappreciated moat. The cleanest expressions are utility holding companies with both transmission ownership and ratepayer-funded build-out — #NEE leads the pack. The capex itself is unglamorous; the structural barrier to entry is regulatory, not technical.";
  if (p.includes('retail') || p.includes('decile'))
    return "The names most exposed to the bottom four deciles: dollar stores, off-price retail, and the lower-end of consumer staples. #XRT is the cleanest broad expression; selective shorts in the basket pick up more alpha. The signal is concentrated — the top two deciles are growing spend, and the index doesn't disaggregate.";
  return "A short answer would summarise the relevant evidence, cite the underlying data, and offer a directional read. The chat input below opens the full conversation.";
}

Object.assign(window, { SurfaceArticle, ProseLine, inlineAnswerFor });
