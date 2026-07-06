// Thematics — Trade surface.
// "The Position" — an editorial trade composition that streams in
// like an article. Each value in the prose is inline-tweakable.

const { useState: useTr_useState, useEffect: useTr_useEffect, useMemo: useTr_useMemo, useRef: useTr_useRef } = React;

// ───────────────────────────────────────────────────────────────────
// Initial composition from a subject (a ticker, theme, or basket).
// ───────────────────────────────────────────────────────────────────
function initialComposition(subject) {
  if (subject.kind === 'ticker') {
    const t = window.TICKERS[subject.sym];
    const themes = window.themesFor(subject.sym);
    // Default to a notional that brings the user toward the theme target
    // — but bounded by the single-name cap.
    const portfolio = window.ME.portfolioValueUSD;
    const themeId = themes[0];
    const exposure = themeId ? window.ME.themeExposure[themeId] : null;
    let suggestedNotional = 45000;
    if (exposure) {
      const gap = Math.max(0, exposure.target - exposure.current);
      suggestedNotional = Math.min(0.06 * portfolio, Math.max(15000, gap * portfolio * 0.6));
    }
    const qty = Math.max(1, Math.round(suggestedNotional / t.price));
    return {
      kind: 'single',
      sym: subject.sym,
      side: 'buy',
      qty,
      instrument: 'spot',      // 'spot' | 'perp'
      orderType: 'market',     // 'market' | 'limit' | 'stage'
      limitPrice: t.price * 0.995,
      leverage: 1,             // perp only
      ladders: 3,              // staged only
      themeId,
    };
  }
  if (subject.kind === 'theme') {
    const basket = window.THEME_BASKETS[subject.themeId] || [];
    return {
      kind: 'basket',
      themeId: subject.themeId,
      basket,
      side: 'buy',
      notional: 45000,
      instrument: 'spot',
      orderType: 'market',
    };
  }
  return null;
}

// ───────────────────────────────────────────────────────────────────
// Inline tweak — a typeset prose token you click to change.
// ───────────────────────────────────────────────────────────────────
function InlineTweak({ children, kind, value, onChange, options, min, max, step, format, suffix, prefix, label }) {
  const [open, setOpen] = useTr_useState(false);
  const [draft, setDraft] = useTr_useState(value);
  const ref = useTr_useRef(null);

  useTr_useEffect(() => { setDraft(value); }, [value]);

  useTr_useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const commit = (v) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <span className="po-tweak-wrap" ref={ref}>
      <button className={'po-tweak' + (open ? ' open' : '')} onClick={() => setOpen(o => !o)}>
        {prefix}{children ?? (format ? format(value) : value)}{suffix}
      </button>
      {open && (
        <span className="po-tweak-pop" onMouseDown={(e) => e.stopPropagation()}>
          {label && <div className="po-tweak-pop-label">{label}</div>}
          {kind === 'number' && (
            <>
              <div className="po-tweak-pop-row">
                <button className="po-tweak-step" onClick={() => setDraft(Math.max(min ?? 1, draft - (step ?? 1)))}>−</button>
                <input
                  type="number"
                  className="po-tweak-input"
                  value={draft}
                  min={min}
                  max={max}
                  step={step ?? 1}
                  autoFocus
                  onChange={(e) => setDraft(Number(e.target.value))}
                  onKeyDown={(e) => { if (e.key === 'Enter') commit(draft); if (e.key === 'Escape') setOpen(false); }}
                />
                <button className="po-tweak-step" onClick={() => setDraft(Math.min(max ?? 1e9, draft + (step ?? 1)))}>+</button>
              </div>
              <div className="po-tweak-pop-foot">
                <button className="po-tweak-apply" onClick={() => commit(draft)}>Apply</button>
              </div>
            </>
          )}
          {kind === 'select' && (
            <div className="po-tweak-options">
              {options.map(opt => (
                <button
                  key={opt.value}
                  className={'po-tweak-option' + (opt.value === value ? ' on' : '')}
                  onClick={() => commit(opt.value)}>
                  <span className="po-tweak-option-label">{opt.label}</span>
                  {opt.note && <span className="po-tweak-option-note">{opt.note}</span>}
                </button>
              ))}
            </div>
          )}
        </span>
      )}
    </span>
  );
}

// ───────────────────────────────────────────────────────────────────
// SurfacePosition — the main streamed editorial trade composition.
// ───────────────────────────────────────────────────────────────────
function SurfacePosition({ subject, tweaks, onClose, onOpenTicker, onOpenArticle, onOpenChat }) {
  const [comp, setComp] = useTr_useState(() => initialComposition(subject));
  const [stage, setStage] = useTr_useState(0);   // streamed reveal
  const [filled, setFilled] = useTr_useState(null);
  const [undoMs, setUndoMs] = useTr_useState(0);
  const [holdPct, setHoldPct] = useTr_useState(0);
  const holdRef = useTr_useRef(null);
  const undoTimerRef = useTr_useRef(null);

  // Tweaks defaults from outer panel
  const density = tweaks?.density || 'standard';   // terse | standard | verbose
  const altsToShow = tweaks?.altsToShow ?? 3;
  const confirmMode = tweaks?.confirmMode || 'hold';  // hold | slide | undo
  const tone = tweaks?.tone || 'editorial';        // editorial | clinical

  // Stream sections in over ~1.8s
  useTr_useEffect(() => {
    setStage(0);
    const stages = [180, 420, 760, 1100, 1500, 1900];
    const timers = stages.map((delay, i) => setTimeout(() => setStage(i + 1), delay));
    return () => timers.forEach(clearTimeout);
  }, [subject.kind, subject.sym, subject.themeId]);

  if (!comp) return null;

  // Re-stream when major shape changes (single ↔ basket)
  const recompose = (next) => {
    setComp(next);
    // small re-stream pulse: bump stage back to refresh the late sections only
    setStage(s => Math.min(s, 4));
    setTimeout(() => setStage(s => Math.max(s, 5)), 280);
    setTimeout(() => setStage(s => Math.max(s, 6)), 520);
  };

  // ── Derived numbers ──────────────────────────────────────────────
  const t = comp.kind === 'single' ? window.TICKERS[comp.sym] : null;
  const themeId = comp.themeId;
  const theme = themeId ? window.THEMES.find(x => x.id === themeId) : null;
  const existingPos = comp.kind === 'single' ? window.position(comp.sym) : null;

  let notional = 0;
  if (comp.kind === 'single') {
    notional = comp.qty * t.price;
    if (comp.instrument === 'perp') notional = comp.qty * t.price; // notional same, margin differs
  } else if (comp.kind === 'basket') {
    notional = comp.notional;
  }
  const marginUsed = comp.kind === 'single' && comp.instrument === 'perp'
    ? notional / (comp.leverage || 1) : 0;

  const cashImpact = comp.instrument === 'perp' ? 0 : (comp.side === 'buy' ? -notional : notional);
  const cashAfter = window.ME.cashUSD + cashImpact;

  // Theme exposure after
  const themeAfter = themeId && comp.side === 'buy'
    ? window.themeExposureAfter(themeId, comp.sym, notional)
    : null;

  // Single-name % after
  const newSinglePct = comp.kind === 'single' ? (
    (window.currentValue(comp.sym) + (comp.side === 'buy' ? notional : -notional))
    / window.ME.portfolioValueUSD
  ) : null;
  const cappedSingle = newSinglePct && newSinglePct > window.ME.risk.maxSingleName;

  // Liquidation (perp only)
  const liqPrice = comp.instrument === 'perp'
    ? t.price * (1 - 0.85 / (comp.leverage || 1))
    : null;
  // Funding rate — fake but stable
  const fundingRate = comp.instrument === 'perp'
    ? -0.012 + (comp.sym?.charCodeAt(0) % 7) * 0.001
    : null;

  // ── Confirmation logic ──────────────────────────────────────────
  const canExecute = comp.qty > 0 && cashAfter >= -window.ME.marginAvailable;
  function execute() {
    const receipt = window.fillComposition({ ...comp });
    setFilled(receipt || { kind: 'single', sym: comp.sym, qty: comp.qty, side: comp.side, px: t?.price, notional });
    // 4s undo window in undo mode
    if (confirmMode === 'undo') {
      setUndoMs(4000);
      const start = Date.now();
      undoTimerRef.current = setInterval(() => {
        const left = Math.max(0, 4000 - (Date.now() - start));
        setUndoMs(left);
        if (left <= 0) {
          clearInterval(undoTimerRef.current);
          undoTimerRef.current = null;
        }
      }, 50);
    }
  }
  function undoFill() {
    if (filled?._reverse) filled._reverse();
    setFilled(null);
    setUndoMs(0);
    clearInterval(undoTimerRef.current);
    undoTimerRef.current = null;
  }
  // hold-to-confirm
  function startHold() {
    if (holdRef.current) return;
    const start = Date.now();
    holdRef.current = setInterval(() => {
      const dt = Date.now() - start;
      const p = Math.min(1, dt / 1200);
      setHoldPct(p);
      if (p >= 1) { stopHold(true); }
    }, 30);
  }
  function stopHold(execIt) {
    clearInterval(holdRef.current);
    holdRef.current = null;
    if (!execIt) setHoldPct(0);
    else { setHoldPct(1); execute(); }
  }
  useTr_useEffect(() => () => {
    clearInterval(holdRef.current);
    clearInterval(undoTimerRef.current);
  }, []);

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="po-wrap" data-density={density} data-tone={tone}>
      <button className="po-back" onClick={onClose}>← Close composition</button>

      {/* Title block */}
      <header className="po-head">
        <div className="po-kicker">
          <span className="po-kicker-dot" style={{ background: theme ? `var(--tag-${theme.hue}-ink)` : 'var(--foreground)' }} />
          <span>The position · personalized to <em>{window.ME.name}</em></span>
        </div>
        <h1 className="po-title">
          {comp.kind === 'single' && <>A position in <span className="po-title-sym">#{comp.sym}</span></>}
          {comp.kind === 'basket' && <>Exposure to {theme?.name?.toLowerCase()}</>}
        </h1>
        <p className="po-deck">
          {comp.kind === 'single' && t.note.split('.')[0] + '.'}
          {comp.kind === 'basket' && (theme?.blurb || '')}
        </p>
        <p className="po-byline">
          Composed <em>just now</em> ·
          {' '}Cash <span className="po-mono">{window.money(window.ME.cashUSD)}</span> ·
          {' '}Margin <span className="po-mono">{window.money(window.ME.marginAvailable)}</span>
        </p>
      </header>

      {/* Streamed prose body */}
      <article className="po-body">
        {/* Section 1 — what you already have here */}
        {stage >= 1 && (
          <section className={'po-section po-fade-in'}>
            <p className="po-prose">
              {comp.kind === 'single' && existingPos && (
                <>
                  You already hold <span className="po-mono">{Math.round(existingPos.qty)}</span> shares of <Crossref sym={comp.sym} onOpenTicker={onOpenTicker}/>{' '}
                  at a cost basis of <span className="po-mono">{window.money(existingPos.cost)}</span>{' '}
                  — unrealized <span className={'po-mono ' + (window.unrealizedPL(comp.sym) >= 0 ? 'up' : 'down')}>{window.moneySigned(window.unrealizedPL(comp.sym))}</span>{' '}
                  ({window.pctSigned((t.price - existingPos.cost) / existingPos.cost)}).
                  {' '}
                  {theme && (
                    <>
                      {theme.name} is <span className="po-mono">{window.pct(window.ME.themeExposure[themeId].current)}</span>{' '}
                      of the book against a target of <span className="po-mono">{window.pct(window.ME.themeExposure[themeId].target)}</span>.
                    </>
                  )}
                </>
              )}
              {comp.kind === 'single' && !existingPos && (
                <>
                  You don't currently hold <Crossref sym={comp.sym} onOpenTicker={onOpenTicker}/>.
                  {' '}
                  {theme && (
                    <>
                      Theme exposure to {theme.name}: <span className="po-mono">{window.pct(window.ME.themeExposure[themeId].current)}</span>{' '}
                      vs target <span className="po-mono">{window.pct(window.ME.themeExposure[themeId].target)}</span>.
                    </>
                  )}
                </>
              )}
              {comp.kind === 'basket' && (
                <>
                  {theme.name} is currently <span className="po-mono">{window.pct(window.ME.themeExposure[themeId].current)}</span>{' '}
                  of the book; the desk target is <span className="po-mono">{window.pct(window.ME.themeExposure[themeId].target)}</span>.
                  {' '}The basket below brings you toward the target without single-name concentration.
                </>
              )}
            </p>
          </section>
        )}

        {/* Section 2 — small viz: theme exposure bar */}
        {stage >= 2 && themeId && (
          <section className={'po-section po-fade-in po-viz-section'}>
            <ThemeExposureBar
              current={window.ME.themeExposure[themeId].current}
              target={window.ME.themeExposure[themeId].target}
              after={themeAfter ? themeAfter.after : window.ME.themeExposure[themeId].current}
              themeName={theme.name}
              hue={theme.hue}
            />
          </section>
        )}

        {/* Section 3 — THE COMPOSITION — typeset prose with inline tweaks */}
        {stage >= 3 && (
          <section className={'po-section po-fade-in po-composition'}>
            <div className="po-section-flag">The composition</div>
            <p className="po-prose po-prose-large">
              {comp.kind === 'single' && (
                <>
                  <InlineTweak
                    kind="select"
                    value={comp.side}
                    onChange={(v) => recompose({ ...comp, side: v })}
                    options={[
                      { value: 'buy',  label: 'Buy',  note: 'open long' },
                      { value: 'sell', label: 'Sell', note: 'close / short' },
                    ]}
                  >{comp.side === 'buy' ? 'Buy' : 'Sell'}</InlineTweak>
                  {' '}
                  <InlineTweak
                    kind="number"
                    value={comp.qty}
                    onChange={(v) => recompose({ ...comp, qty: v })}
                    min={1}
                    max={5000}
                    step={1}
                    label="Shares / units"
                  >{comp.qty}</InlineTweak>
                  {' '}{comp.qty === 1 ? 'share' : 'shares'} of <Crossref sym={comp.sym} onOpenTicker={onOpenTicker}/>{' '}as a{' '}
                  <InlineTweak
                    kind="select"
                    value={comp.instrument}
                    onChange={(v) => recompose({ ...comp, instrument: v, leverage: v === 'perp' ? 3 : 1 })}
                    options={[
                      { value: 'spot', label: 'spot purchase', note: 'consumes cash' },
                      { value: 'perp', label: 'perpetual',     note: 'leveraged, margin' },
                    ]}
                  >{comp.instrument === 'spot' ? 'spot purchase' : 'perpetual'}</InlineTweak>
                  {comp.instrument === 'perp' && (
                    <>{' '}at{' '}
                      <InlineTweak
                        kind="select"
                        value={comp.leverage}
                        onChange={(v) => recompose({ ...comp, leverage: v })}
                        options={[
                          { value: 2,  label: '2×'  },
                          { value: 3,  label: '3×'  },
                          { value: 5,  label: '5×'  },
                          { value: 10, label: '10×' },
                        ]}
                      >{comp.leverage}×</InlineTweak>{' '}leverage</>
                  )}
                  {', '}
                  <InlineTweak
                    kind="select"
                    value={comp.orderType}
                    onChange={(v) => recompose({ ...comp, orderType: v })}
                    options={[
                      { value: 'market', label: 'at market',  note: 'fills now' },
                      { value: 'limit',  label: 'at a limit', note: 'resting order' },
                      { value: 'stage',  label: 'staged',     note: 'ladder over levels' },
                    ]}
                  >{comp.orderType === 'market' ? 'at market' : comp.orderType === 'limit' ? 'at a limit' : 'staged'}</InlineTweak>
                  {comp.orderType === 'limit' && (
                    <>{' '}of{' '}
                      <InlineTweak
                        kind="number"
                        value={Math.round(comp.limitPrice * 100) / 100}
                        onChange={(v) => recompose({ ...comp, limitPrice: v })}
                        min={1}
                        max={1e6}
                        step={0.05}
                        prefix="$"
                      >${comp.limitPrice.toFixed(2)}</InlineTweak>
                    </>
                  )}
                  {comp.orderType === 'stage' && (
                    <>{' '}across{' '}
                      <InlineTweak
                        kind="number"
                        value={comp.ladders}
                        onChange={(v) => recompose({ ...comp, ladders: v })}
                        min={2}
                        max={8}
                        step={1}
                      >{comp.ladders}</InlineTweak>{' '}lots</>
                  )}
                  . That's{' '}
                  <span className="po-mono po-emph">{window.money(notional)}</span>
                  {comp.instrument === 'perp' && (
                    <> of notional, holding <span className="po-mono">{window.money(marginUsed)}</span> of margin</>
                  )}
                  {comp.instrument === 'spot' && (
                    <> against your <span className="po-mono">{window.money(window.ME.cashUSD)}</span> in cash</>
                  )}
                  .
                </>
              )}
              {comp.kind === 'basket' && (
                <>
                  {comp.side === 'buy' ? 'Buy' : 'Sell'} a{' '}
                  <InlineTweak
                    kind="number"
                    value={comp.notional}
                    onChange={(v) => recompose({ ...comp, notional: v })}
                    min={1000}
                    max={500000}
                    step={1000}
                    prefix="$"
                    format={(v) => v.toLocaleString()}
                  >${comp.notional.toLocaleString()}</InlineTweak>
                  {' '}weighted basket across{' '}
                  {comp.basket.map((b, i) => (
                    <React.Fragment key={b.sym}>
                      {i > 0 && (i === comp.basket.length - 1 ? ' and ' : ', ')}
                      <span className="po-mono">#{b.sym}</span>{' '}
                      ({window.pct(b.weight)})
                    </React.Fragment>
                  ))}
                  . The fill goes against <InlineTweak
                    kind="select"
                    value={comp.instrument}
                    onChange={(v) => recompose({ ...comp, instrument: v })}
                    options={[
                      { value: 'spot', label: 'cash',   note: 'spot' },
                    ]}
                  >cash</InlineTweak>, {comp.orderType === 'market' ? 'filled' : 'staged'} now.
                </>
              )}
            </p>

            {density !== 'terse' && (
              <p className="po-prose po-prose-quiet">
                {comp.kind === 'single' && comp.orderType === 'market' && (
                  <>The order is well inside the last hour's volume on <span className="po-mono">{comp.sym}</span>; expect minimal slippage.</>
                )}
                {comp.kind === 'single' && comp.orderType === 'limit' && (
                  <>Resting bid is <span className="po-mono">{window.pctSigned((comp.limitPrice - t.price) / t.price)}</span> from spot; the order sits until filled or cancelled.</>
                )}
                {comp.kind === 'single' && comp.instrument === 'perp' && fundingRate !== null && (
                  <>{' '}Funding rate is <span className={'po-mono ' + (fundingRate < 0 ? 'up' : 'down')}>{(fundingRate * 100).toFixed(3)}%</span> — {fundingRate < 0 ? 'you\u2019re paid to be long' : 'longs pay shorts'}.{' '}
                  Liquidation around <span className="po-mono">{window.money(liqPrice)}</span>.</>
                )}
                {cappedSingle && (
                  <>{' '}<em>Note —</em> after fill, <span className="po-mono">{comp.sym}</span> would be <span className="po-mono">{window.pct(newSinglePct)}</span> of the book, above your <span className="po-mono">{window.pct(window.ME.risk.maxSingleName)}</span> single-name cap.</>
                )}
              </p>
            )}
          </section>
        )}

        {/* Section 4 — Alternatives */}
        {stage >= 4 && altsToShow > 0 && comp.kind === 'single' && (
          <section className={'po-section po-fade-in'}>
            <div className="po-section-flag">Or, instead</div>
            <ol className="po-alts">
              {buildAlternatives(comp, t, themeId, theme).slice(0, altsToShow).map((alt, i) => (
                <li key={i} className="po-alt">
                  <p className="po-prose"><span className="po-alt-num">{i + 1}</span> <strong>{alt.title}.</strong> <span className="po-alt-blurb">{alt.blurb}</span></p>
                  <button className="po-alt-apply" onClick={() => recompose(alt.apply(comp))}>
                    → {alt.cta}
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Section 5 — If filled */}
        {stage >= 5 && (
          <section className={'po-section po-fade-in'}>
            <div className="po-section-flag">If this fills</div>
            <div className="po-implications">
              <ImplicationRow
                label="Cash"
                before={window.money(window.ME.cashUSD)}
                after={window.money(cashAfter)}
                delta={cashImpact !== 0 ? window.moneySigned(cashImpact) : null}
                changed={cashImpact !== 0}
              />
              {comp.instrument === 'perp' && (
                <ImplicationRow
                  label="Margin used"
                  before={window.money(0)}
                  after={window.money(marginUsed)}
                  delta={'+' + window.money(marginUsed)}
                  changed
                />
              )}
              {themeId && (
                <ImplicationRow
                  label={`${theme.name} exposure`}
                  before={window.pct(window.ME.themeExposure[themeId].current)}
                  after={window.pct(themeAfter.after)}
                  delta={window.pctSigned(themeAfter.after - window.ME.themeExposure[themeId].current)}
                  changed
                />
              )}
              {comp.kind === 'single' && (
                <ImplicationRow
                  label={`${comp.sym} position`}
                  before={`${Math.round(existingPos?.qty || 0)} shares`}
                  after={`${Math.round((existingPos?.qty || 0) + (comp.side === 'buy' ? comp.qty : -comp.qty))} shares`}
                  delta={`${comp.side === 'buy' ? '+' : '−'}${comp.qty}`}
                  changed
                />
              )}
              {newSinglePct !== null && (
                <ImplicationRow
                  label={`${comp.sym} % of book`}
                  before={window.pct(window.currentValue(comp.sym) / window.ME.portfolioValueUSD)}
                  after={window.pct(newSinglePct)}
                  delta={null}
                  warn={cappedSingle}
                />
              )}
            </div>
          </section>
        )}

        {/* Section 6 — Confirm */}
        {stage >= 6 && !filled && (
          <section className={'po-section po-fade-in po-confirm-section'}>
            <div className="po-section-flag">File the order</div>
            {confirmMode === 'hold' && (
              <div className="po-hold-confirm">
                <button
                  className="po-hold-btn"
                  onMouseDown={startHold}
                  onMouseUp={() => stopHold(false)}
                  onMouseLeave={() => stopHold(false)}
                  onTouchStart={startHold}
                  onTouchEnd={() => stopHold(false)}
                  disabled={!canExecute}>
                  <span className="po-hold-fill" style={{ width: `${holdPct * 100}%` }} />
                  <span className="po-hold-label">{holdPct >= 1 ? 'Filed' : 'Press & hold to file'}</span>
                </button>
                <div className="po-hold-note">Release to cancel · ∼1.2s</div>
              </div>
            )}
            {confirmMode === 'slide' && (
              <SlideToConfirm onConfirm={execute} disabled={!canExecute} />
            )}
            {confirmMode === 'undo' && (
              <div className="po-undo-confirm">
                <button
                  className="po-file-btn"
                  disabled={!canExecute}
                  onClick={execute}>
                  <span>File the order</span>
                  <span className="po-file-btn-arrow">→</span>
                </button>
                <div className="po-hold-note">You'll have 4 seconds to undo.</div>
              </div>
            )}
            <button className="po-cancel" onClick={onClose}>Or cancel — close the composition</button>
          </section>
        )}

        {/* Receipt — after fill */}
        {filled && (
          <section className="po-receipt po-fade-in">
            <div className="po-section-flag po-section-flag-receipt">Filed ·  <em>just now</em></div>
            {filled.kind === 'single' && (
              <p className="po-prose po-prose-large">
                <span className="po-receipt-mark">⁂</span>{' '}
                <strong>{filled.side === 'buy' ? 'Bought' : 'Sold'} {filled.qty} {filled.qty === 1 ? 'share' : 'shares'} of <span className="po-mono">#{filled.sym}</span></strong>{' '}
                at <span className="po-mono">{window.money(filled.px)}</span> — notional{' '}
                <span className="po-mono">{window.money(filled.notional)}</span>.
              </p>
            )}
            {filled.kind === 'basket' && (
              <p className="po-prose po-prose-large">
                <span className="po-receipt-mark">⁂</span>{' '}
                <strong>Filed a {window.money(filled.notional)} basket across {filled.count} names.</strong>
              </p>
            )}
            {confirmMode === 'undo' && undoMs > 0 && (
              <div className="po-undo-bar">
                <button className="po-undo-btn" onClick={undoFill}>↺ Undo</button>
                <div className="po-undo-track">
                  <div className="po-undo-fill" style={{ width: `${(undoMs / 4000) * 100}%` }} />
                </div>
                <div className="po-undo-secs po-mono">{(undoMs / 1000).toFixed(1)}s</div>
              </div>
            )}
            {!(confirmMode === 'undo' && undoMs > 0) && (
              <p className="po-prose po-prose-quiet">
                The fill is on the desk. The drawer now carries a new entry under <em>Recent</em>; the margin rail on related entries will update on next read.
              </p>
            )}
            <div className="po-receipt-actions">
              <button className="po-receipt-action" onClick={onClose}>Back to where I was</button>
              {comp.kind === 'single' && (
                <button className="po-receipt-action" onClick={() => onOpenTicker(comp.sym)}>Open {comp.sym} page →</button>
              )}
            </div>
          </section>
        )}
      </article>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Build alternatives for a single-stock composition.
// ───────────────────────────────────────────────────────────────────
function buildAlternatives(comp, t, themeId, theme) {
  const alts = [];
  const basket = window.THEME_BASKETS[themeId] || [];
  if (basket.length > 1 && comp.kind === 'single') {
    alts.push({
      title: 'Express it as a basket',
      blurb: `Spread the same ${window.money(comp.qty * t.price)} across the ${basket.length} names in the ${theme?.name?.toLowerCase()} basket. Same theme exposure, less single-name concentration.`,
      cta: 'Recompose as basket',
      apply: (c) => ({
        kind: 'basket',
        themeId,
        basket,
        side: c.side,
        notional: Math.round(c.qty * t.price / 1000) * 1000,
        instrument: 'spot',
        orderType: 'market',
      }),
    });
  }
  if (comp.instrument !== 'perp') {
    alts.push({
      title: 'Use the perp instead of spot',
      blurb: `Take 3× exposure for ${window.money(comp.qty * t.price / 3)} of margin. Funding rate currently negative — you're paid to be long. Liquidation around ${window.money(t.price * (1 - 0.85/3))}.`,
      cta: 'Switch to perp',
      apply: (c) => ({ ...c, instrument: 'perp', leverage: 3, orderType: 'market' }),
    });
  }
  if (comp.orderType !== 'stage') {
    alts.push({
      title: 'Stage the entry',
      blurb: `Buy a third of the position now and ladder the rest as resting bids ${window.pctSigned(-0.01)}, ${window.pctSigned(-0.025)} below spot. Average cost lower if the print stays soft.`,
      cta: 'Stage the entry',
      apply: (c) => ({ ...c, orderType: 'stage', ladders: 3 }),
    });
  }
  if (comp.orderType !== 'limit') {
    alts.push({
      title: 'Set a resting limit instead',
      blurb: `Rest a bid ${window.pctSigned(-0.015)} below spot at ${window.money(t.price * 0.985)}. The order sits until filled or cancelled — no slippage if it triggers.`,
      cta: 'Switch to limit',
      apply: (c) => ({ ...c, orderType: 'limit', limitPrice: t.price * 0.985 }),
    });
  }
  return alts;
}

// ───────────────────────────────────────────────────────────────────
// Helpers — visualizations + sub-components
// ───────────────────────────────────────────────────────────────────
function ThemeExposureBar({ current, target, after, themeName, hue }) {
  const max = Math.max(target, after, current) * 1.15;
  const w = (v) => `${(v / max) * 100}%`;
  return (
    <div className="po-exp-bar">
      <div className="po-exp-bar-label">
        <span>{themeName} — current <span className="po-mono">{window.pct(current)}</span> · target <span className="po-mono">{window.pct(target)}</span> · after fill <span className="po-mono po-emph">{window.pct(after)}</span></span>
      </div>
      <div className="po-exp-track">
        <div className="po-exp-target" style={{ left: w(target) }}>
          <span className="po-exp-target-tick" />
          <span className="po-exp-target-label">target</span>
        </div>
        <div className="po-exp-current" style={{ width: w(current), background: `var(--tag-${hue}-soft)` }} />
        <div className="po-exp-after" style={{ width: w(after), background: `var(--tag-${hue}-ink)` }} />
      </div>
    </div>
  );
}

function ImplicationRow({ label, before, after, delta, changed, warn }) {
  return (
    <div className={'po-impl-row' + (changed ? ' changed' : '') + (warn ? ' warn' : '')}>
      <div className="po-impl-label">{label}</div>
      <div className="po-impl-before"><span className="po-mono">{before}</span></div>
      <div className="po-impl-arrow">→</div>
      <div className="po-impl-after"><span className="po-mono">{after}</span></div>
      <div className="po-impl-delta">{delta && <span className="po-mono">{delta}</span>}</div>
    </div>
  );
}

function Crossref({ sym, onOpenTicker }) {
  return (
    <button className="po-crossref" onClick={() => onOpenTicker?.(sym)}>#{sym}</button>
  );
}

function SlideToConfirm({ onConfirm, disabled }) {
  const [pos, setPos] = useTr_useState(0);
  const trackRef = useTr_useRef(null);
  const drag = useTr_useRef(null);

  function onPointerDown(e) {
    if (disabled) return;
    const trackRect = trackRef.current.getBoundingClientRect();
    drag.current = { startX: e.clientX, startPos: pos, trackW: trackRect.width - 56 };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }
  function onPointerMove(e) {
    const d = drag.current;
    if (!d) return;
    const next = Math.max(0, Math.min(1, d.startPos + (e.clientX - d.startX) / d.trackW));
    setPos(next);
  }
  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    if (pos > 0.92) { setPos(1); onConfirm(); }
    else setPos(0);
  }

  return (
    <div className="po-slide-confirm" ref={trackRef}>
      <div className="po-slide-fill" style={{ width: `calc(${pos * 100}% + 56px)` }} />
      <div className="po-slide-label">{pos > 0.7 ? 'release' : 'slide right to file'}</div>
      <div
        className="po-slide-thumb"
        style={{ left: `calc(${pos * 100}% )` }}
        onPointerDown={onPointerDown}>
        →
      </div>
    </div>
  );
}

Object.assign(window, { SurfacePosition, initialComposition });
