// Thematics — Ticker surface.
// One stock-page per symbol: name + price + delta header, Pin / Alert top-right,
// a larger sparkline, key metrics row, brief note, and related findings.

const { useState: useTk_useState, useMemo: useTk_useMemo } = React;

function SurfaceTicker({ symbol, pinned, onTogglePin, onOpenArticle, onAskAbout }) {
  const t = window.TICKERS?.[symbol];
  if (!t) return <div style={{ padding: 40 }}>Unknown ticker.</div>;
  const up = t.deltaPct >= 0;

  // Findings that mention this ticker
  const related = useTk_useMemo(() => window.FINDINGS.filter(f => f.mentions?.includes(symbol)), [symbol]);
  const isPinned = pinned.includes(symbol);

  return (
    <div className="tx-ticker-page">

      {/* Header */}
      <header className="tx-tk-head-section">
        <div className="tx-tk-head-row">
          <div className="tx-tk-head-id">
            <div className="tx-tk-sym-big">{symbol}</div>
            <div className="tx-tk-name-big">{t.name}</div>
            <div className="tx-tk-sub">{t.ex} · {t.sector}</div>
          </div>
          <div className="tx-tk-actions">
            <button className={'tx-tk-btn ' + (isPinned ? 'on' : '')} onClick={() => onTogglePin(symbol)}>
              <Icon name="bookmark" size={14}/>
              {isPinned ? 'Pinned' : 'Pin'}
            </button>
            <button className="tx-tk-btn">
              <Icon name="bell" size={14}/>
              Set alert
            </button>
          </div>
        </div>

        <div className="tx-tk-price-row">
          <div className="tx-tk-price-big">${t.price.toFixed(2)}</div>
          <div className={'tx-tk-delta-big ' + (up ? 'up' : 'down')}>
            {up ? '+' : ''}{(t.price * t.deltaPct / 100).toFixed(2)} ({up ? '+' : ''}{t.deltaPct.toFixed(2)}%)
          </div>
          <div className="tx-tk-asof">today</div>
        </div>

        <div className="tx-tk-chart" style={{ color: up ? 'var(--tag-emerald-ink)' : 'var(--tag-crimson-ink)' }}>
          <Sparkline data={t.spark} width={680} height={180} stroke="currentColor" fill="currentColor"/>
        </div>

        <div className="tx-tk-metrics">
          <div><div className="k">Market cap</div><div className="v">{t.mcap}</div></div>
          <div><div className="k">P / E</div><div className="v">{t.pe}</div></div>
          <div><div className="k">52-week range</div><div className="v">{t.range52}</div></div>
          <div><div className="k">Sector</div><div className="v">{t.sector}</div></div>
        </div>
      </header>

      {/* Desk note */}
      <section className="tx-tk-note">
        <div className="tx-tk-note-eyebrow">Desk note</div>
        <p>{t.note}</p>
      </section>

      {/* Related findings */}
      {related.length > 0 && (
        <section className="tx-tk-related">
          <h2 className="tx-tk-h2">In recent findings</h2>
          <div className="tx-tk-rel-list">
            {related.map(f => (
              <RelatedFindingRow key={f.id} finding={f} onOpen={() => onOpenArticle(f.id)} />
            ))}
          </div>
        </section>
      )}

      {/* Conversation starters */}
      <section className="tx-tk-starters">
        <h2 className="tx-tk-h2">Pull on a thread</h2>
        <div className="tx-tk-starters-list">
          <QuestionChip onClick={() => onAskAbout(`What\u2019s the strongest piece of evidence in the bull case for ${symbol}?`)}>What's the strongest evidence in the bull case for {symbol}?</QuestionChip>
          <QuestionChip onClick={() => onAskAbout(`Which peers de-rate first if ${symbol} misses next quarter?`)}>Which peers de-rate first if {symbol} misses next quarter?</QuestionChip>
          <QuestionChip onClick={() => onAskAbout(`How does ${symbol} compare to its sector on the metrics that matter?`)}>How does {symbol} compare to its sector on the metrics that matter?</QuestionChip>
        </div>
      </section>

    </div>
  );
}

function RelatedFindingRow({ finding, onOpen }) {
  const theme = window.THEMES.find(t => t.id === finding.themeId);
  return (
    <button className="tx-tk-rel-row" onClick={onOpen}>
      <div className="tx-tk-rel-cover">
        <FindingCover cover={finding.cover} theme={theme} height={88}/>
      </div>
      <div className="tx-tk-rel-body">
        <div className="tx-tk-rel-chip">
          <Chip hue={theme.hue}>{theme.name}</Chip>
        </div>
        <div className="tx-tk-rel-title">{finding.title}</div>
        <div className="tx-tk-rel-byline">{finding.contributor}. {finding.publishedAt}.</div>
      </div>
    </button>
  );
}

Object.assign(window, { SurfaceTicker });
