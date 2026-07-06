// Thematics — Markets surface.
// Three explorations of what "Markets" looks like in a theme-first app:
//   1. editorial — "The Open": theme-organized digest with prose blurbs
//   2. tape       — dense terminal: sortable, filterable ticker table
//   3. heatmap    — grouped tiles colored by delta
// View toggled via Tweak `marketsView`.

const { useState: useMk_useState, useMemo: useMk_useMemo } = React;

// Aggregate per-theme stats (used by all variants)
function themeAggregate(themeId) {
  const basket = window.THEME_BASKETS[themeId] || [];
  let weightedDelta = 0;
  let totalWeight = 0;
  basket.forEach(b => {
    const t = window.TICKERS[b.sym];
    if (!t) return;
    weightedDelta += b.weight * t.deltaPct;
    totalWeight += b.weight;
  });
  const avg = totalWeight ? weightedDelta / totalWeight : 0;
  return { delta: avg, count: basket.length };
}

// Theme-level blurbs for the day (editorial flavor; static for this prototype)
const MARKET_NOTES = {
  'ai-infra':  "Sold-out on N3, but the second derivative is bending. Memory bid is fading; ASIC names take the print.",
  'fed':       "Operations desk lean is the tell, not the rate path. Belly bid quiet but persistent.",
  'energy':    "Module ASPs at $0.27. Two procedural votes from the carve-out lapsing.",
  'crypto':    "Spot up, ETFs out. The basis trade is mechanically unwinding into the print.",
  'consumer':  "Top three deciles de-levered. Bottom four are the chart.",
};

// Day index strip — one cell per theme (used in editorial + tape)
function MarketsStrip({ onOpenTheme }) {
  return (
    <div className="mk-strip">
      {window.THEMES.map(theme => {
        const agg = themeAggregate(theme.id);
        const up = agg.delta >= 0;
        return (
          <button key={theme.id} className="mk-strip-cell" onClick={() => onOpenTheme && onOpenTheme(theme.id)}>
            <div className="mk-strip-name">
              <span className="mk-strip-name-dot" style={{ background: `var(--tag-${theme.hue}-ink)` }} />
              <span>{theme.name}</span>
            </div>
            <div className={'mk-strip-val ' + (up ? 'up' : 'down')}>
              {(up ? '+' : '') + agg.delta.toFixed(2) + '%'}
            </div>
            <div className="mk-strip-cap">
              {agg.count} {agg.count === 1 ? 'name' : 'names'}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// Markets masthead — title + timestamp + lede
function MarketsMasthead() {
  const allTickers = Object.values(window.TICKERS);
  const up = allTickers.filter(t => t.deltaPct > 0).length;
  const down = allTickers.length - up;
  const breadthLede = up > down
    ? "Breadth is wider than the index suggests — winners outnumber losers by a comfortable margin."
    : "The index is fine. Breadth is not.";
  return (
    <div className="mk-masthead">
      <div>
        <div className="mk-flag">
          <span>The desk's read</span>
          <span>·</span>
          <em>Markets</em>
        </div>
        <h1 className="mk-title">The Open.</h1>
        <p className="mk-deck">{breadthLede}</p>
      </div>
      <div className="mk-stamp">
        <div>Tuesday · 09:42 ET</div>
        <div style={{ marginTop: 4 }}><em>Mar 18, 2026</em></div>
      </div>
    </div>
  );
}

// Movers — top up/down across all tickers
function MarketsMovers({ onOpenTicker }) {
  const sorted = Object.entries(window.TICKERS)
    .map(([sym, t]) => ({ sym, ...t }))
    .sort((a, b) => b.deltaPct - a.deltaPct);
  const up = sorted.slice(0, 4);
  const down = sorted.slice(-4).reverse();
  const renderRow = (t) => (
    <button key={t.sym} className="mk-mover" onClick={() => onOpenTicker(t.sym)}>
      <span className="mk-mover-sym">{t.sym}</span>
      <span className="mk-mover-name">{t.name}</span>
      <span className={'mk-mover-d ' + (t.deltaPct >= 0 ? 'up' : 'down')}>
        {(t.deltaPct >= 0 ? '+' : '') + t.deltaPct.toFixed(2) + '%'}
      </span>
    </button>
  );
  return (
    <div className="mk-movers">
      <div className="mk-movers-col">
        <div className="mk-movers-flag">Leaders</div>
        {up.map(renderRow)}
      </div>
      <div className="mk-movers-col">
        <div className="mk-movers-flag">Laggards</div>
        {down.map(renderRow)}
      </div>
    </div>
  );
}

// ── Variant 1: Editorial digest ─────────────────────────────────────────
function MarketsEditorial({ onOpenTicker, onOpenArticle }) {
  return (
    <div>
      <MarketsStrip />
      <MarketsMovers onOpenTicker={onOpenTicker} />
      {window.THEMES.map(theme => {
        const basket = window.THEME_BASKETS[theme.id] || [];
        const agg = themeAggregate(theme.id);
        const up = agg.delta >= 0;
        const blurb = MARKET_NOTES[theme.id] || theme.blurb;
        return (
          <section key={theme.id} className="mk-section">
            <div className="mk-sec-head">
              <h2 className="mk-sec-name">
                <span className="mk-sec-name-dot" style={{ background: `var(--tag-${theme.hue}-ink)` }} />
                {theme.name}
                <span className="mk-sec-count">· {basket.length} names</span>
              </h2>
              <p className="mk-sec-blurb">{blurb}</p>
              <span className={'mk-sec-delta ' + (up ? 'up' : 'down')}>
                {(up ? '+' : '') + agg.delta.toFixed(2) + '%'}
              </span>
            </div>
            <div>
              {basket.map(({ sym }) => {
                const t = window.TICKERS[sym];
                if (!t) return null;
                const up = t.deltaPct >= 0;
                return (
                  <button key={sym} className="mk-row" onClick={() => onOpenTicker(sym)}>
                    <span className="mk-row-sym">{sym}</span>
                    <span className="mk-row-name">{t.name}</span>
                    <span className="mk-row-note">{t.sector}</span>
                    <span className={'mk-row-spark ' + (up ? 'up' : 'down')}>
                      <Sparkline data={t.spark} width={110} height={26} stroke="currentColor" dot={false} />
                    </span>
                    <span className="mk-row-price">${t.price.toFixed(2)}</span>
                    <span className={'mk-row-delta ' + (up ? 'up' : 'down')}>
                      {(up ? '+' : '') + t.deltaPct.toFixed(2) + '%'}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ── Variant 2: Dense tape ───────────────────────────────────────────────
function MarketsTape({ onOpenTicker }) {
  const [filter, setFilter] = useMk_useState(new Set());     // theme ids
  const [sortKey, setSortKey] = useMk_useState('deltaPct');
  const [sortDir, setSortDir] = useMk_useState('desc');

  const rows = useMk_useMemo(() => {
    let arr = Object.entries(window.TICKERS).map(([sym, t]) => {
      const themes = window.themesFor(sym);
      return { sym, ...t, themes };
    });
    if (filter.size) {
      arr = arr.filter(r => r.themes.some(th => filter.has(th)));
    }
    arr.sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (typeof va === 'string') {
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return arr;
  }, [filter, sortKey, sortDir]);

  const toggleFilter = (id) => {
    setFilter(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const onSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };
  const Th = ({ k, label, align }) => {
    const sorted = sortKey === k;
    return (
      <span
        className={'mk-th ' + (align || '') + ' ' + (sorted ? 'sorted ' + sortDir : '')}
        onClick={() => onSort(k)}>
        {label}
      </span>
    );
  };

  return (
    <div>
      <MarketsStrip />
      <div className="mk-tape-filters">
        <span style={{ font: 'italic 400 13px var(--font-serif)', color: 'var(--muted-foreground)', marginRight: 8 }}>
          Filter by theme
        </span>
        {window.THEMES.map(theme => (
          <button
            key={theme.id}
            className={'mk-tape-filter ' + (filter.has(theme.id) ? 'on' : '')}
            onClick={() => toggleFilter(theme.id)}>
            <span className="mk-tape-filter-dot" style={{ background: `var(--tag-${theme.hue}-ink)` }} />
            {theme.name}
          </button>
        ))}
        {filter.size > 0 && (
          <button
            className="mk-tape-filter"
            style={{ marginLeft: 4 }}
            onClick={() => setFilter(new Set())}>
            Clear
          </button>
        )}
      </div>
      <div className="mk-tape">
        <div className="mk-tape-head">
          <Th k="sym"      label="Symbol" />
          <Th k="name"     label="Name" />
          <Th k="sector"   label="Sector" />
          <Th k="price"    label="Last"  align="right" />
          <Th k="deltaPct" label="Chg %" align="right" />
          <span className="mk-th hide-sm">5-day</span>
          <Th k="range52"  label="52-wk range" align="right" />
        </div>
        {rows.map(t => {
          const up = t.deltaPct >= 0;
          // parse "low – high" then locate price in range
          let pct = 0.5;
          const m = (t.range52 || '').match(/([\d.]+)\s*[–-]\s*([\d.]+)/);
          if (m) {
            const lo = parseFloat(m[1]), hi = parseFloat(m[2]);
            pct = Math.max(0, Math.min(1, (t.price - lo) / (hi - lo)));
          }
          return (
            <button key={t.sym} className="mk-tape-row" onClick={() => onOpenTicker(t.sym)}>
              <span className="c-sym">{t.sym}</span>
              <span className="c-name">
                <span className="c-name-text">{t.name}</span>
                {t.themes[0] && (() => {
                  const tm = window.THEMES.find(x => x.id === t.themes[0]);
                  return tm ? (
                    <span className="mk-tape-theme-tag">
                      <span className="mk-tape-theme-tag-dot" style={{ background: `var(--tag-${tm.hue}-ink)` }} />
                    </span>
                  ) : null;
                })()}
              </span>
              <span className="c-sector hide-sm">{t.sector}</span>
              <span className="c-px">${t.price.toFixed(2)}</span>
              <span className={'c-chg ' + (up ? 'up' : 'down')}>
                {(up ? '+' : '') + t.deltaPct.toFixed(2) + '%'}
              </span>
              <span className={'c-spark hide-sm ' + (up ? 'up' : 'down')}>
                <Sparkline data={t.spark} width={140} height={22} stroke="currentColor" dot={false} />
              </span>
              <span className="c-range">
                <span className="c-range-track">
                  <span className="c-range-fill" style={{ left: 0, width: (pct * 100) + '%' }} />
                </span>
                <span className="c-range-marks">
                  {m ? (<><span>${m[1]}</span><span>${m[2]}</span></>) : <span>—</span>}
                </span>
              </span>
            </button>
          );
        })}
        {rows.length === 0 && (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--muted-foreground)', font: 'italic 400 15px var(--font-serif)' }}>
            Nothing matches that filter.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Variant 3: Heatmap ──────────────────────────────────────────────────
function MarketsHeatmap({ onOpenTicker }) {
  // Lay out themes with hand-chosen column spans for visual rhythm.
  // 12-column grid; sum of spans = 12 per row.
  const layout = {
    'ai-infra':  'span-7',
    'fed':       'span-5',
    'energy':    'span-7',
    'crypto':    'span-5',
    'consumer':  'span-12',
  };
  function deltaClass(d) {
    if (d >=  1.5) return 'up-strong';
    if (d >=  0.3) return 'up-mild';
    if (d <= -1.5) return 'down-strong';
    if (d <= -0.3) return 'down-mild';
    return 'flat';
  }
  return (
    <div>
      <MarketsStrip />
      <div className="mk-heat-grid">
        {window.THEMES.map(theme => {
          const basket = window.THEME_BASKETS[theme.id] || [];
          const agg = themeAggregate(theme.id);
          const span = layout[theme.id] || 'span-6';
          return (
            <div key={theme.id} className={'mk-heat-theme ' + span}>
              <div className="mk-heat-theme-head">
                <span className="mk-heat-theme-name">
                  <span className="mk-heat-theme-name-dot" style={{ background: `var(--tag-${theme.hue}-ink)` }} />
                  {theme.name}
                </span>
                <span className={'mk-heat-theme-delta ' + (agg.delta >= 0 ? 'up' : 'down')}>
                  {(agg.delta >= 0 ? '+' : '') + agg.delta.toFixed(2) + '%'}
                </span>
              </div>
              <div className="mk-heat-cells">
                {basket.map(({ sym }) => {
                  const t = window.TICKERS[sym];
                  if (!t) return null;
                  const cls = deltaClass(t.deltaPct);
                  return (
                    <button key={sym} className={'mk-heat-cell ' + cls} onClick={() => onOpenTicker(sym)}>
                      <div>
                        <div className="mk-hc-sym">{sym}</div>
                        <div className="mk-hc-name">{t.name}</div>
                      </div>
                      <div className="mk-hc-delta">
                        {(t.deltaPct >= 0 ? '+' : '') + t.deltaPct.toFixed(2) + '%'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Surface entry — branches by view ────────────────────────────────────
function SurfaceMarkets({ view, onOpenTicker, onOpenArticle }) {
  return (
    <div className="mk-wrap" data-screen-label={'Markets · ' + (view || 'editorial')}>
      <MarketsMasthead />
      {view === 'tape'    && <MarketsTape onOpenTicker={onOpenTicker} />}
      {view === 'heatmap' && <MarketsHeatmap onOpenTicker={onOpenTicker} />}
      {(view === 'editorial' || !view) && <MarketsEditorial onOpenTicker={onOpenTicker} onOpenArticle={onOpenArticle} />}
    </div>
  );
}

Object.assign(window, { SurfaceMarkets });
