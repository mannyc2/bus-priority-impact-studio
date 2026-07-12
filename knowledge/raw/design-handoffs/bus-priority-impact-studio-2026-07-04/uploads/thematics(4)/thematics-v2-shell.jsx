// Thematics v2 — Shell.
// Masthead (date + edition + section nav), Spotlight (⌘K), Drawer (your desk).

const { useState: useV2Sh_useState, useEffect: useV2Sh_useEffect, useRef: useV2Sh_useRef, useCallback: useV2Sh_useCallback } = React;

const TODAY = new Date('2026-05-21T16:00:00');
const TODAY_LONG = TODAY.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const TODAY_SHORT = TODAY.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

function Masthead({ activeSection, onSection, onSpotlight, onDrawer }) {
  return (
    <header className="fo-mast">
      <div className="fo-mast-inner">
        <div className="fo-mast-meta">
          <div className="fo-mast-edition">Edition No. 1,418 · Closing wrap</div>
          <div className="fo-mast-date">{TODAY_LONG}</div>
          <div className="fo-mast-right">
            <a onClick={onSpotlight} role="button" tabIndex="0">
              Ask the desk
              <span className="fo-mast-kbd">⌘ K</span>
            </a>
            <a onClick={onDrawer} role="button" tabIndex="0">Your desk</a>
          </div>
        </div>

        <div className="fo-wordmark">
          <div className="fo-wordmark-name">thematics</div>
          <div className="fo-wordmark-tagline">A daily folio for the desk — reading, not feeds.</div>
        </div>

        <nav className="fo-mast-sections" aria-label="Sections">
          <a className={'fo-mast-section ' + (activeSection === 'front' ? 'active' : '')}
             onClick={() => onSection('front')}>The front page</a>
          {window.THEMES.map(t => (
            <a key={t.id}
               className={'fo-mast-section ' + (activeSection === t.id ? 'active' : '')}
               onClick={() => onSection(t.id)}>
              {t.name}
            </a>
          ))}
          <a className={'fo-mast-section ' + (activeSection === 'people' ? 'active' : '')}
             onClick={() => onSection('people')}>The desk</a>
        </nav>
      </div>
    </header>
  );
}

// ── Spotlight (⌘K) ──────────────────────────────────────────────────────
function Spotlight({ open, onClose, onSubmit, contextLabel, suggestions }) {
  const [v, setV] = useV2Sh_useState('');
  const inputRef = useV2Sh_useRef(null);

  useV2Sh_useEffect(() => {
    if (!open) return;
    setV('');
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onClose?.(); }
    }
    document.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(id); document.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  if (!open) return null;

  function submit(text) {
    const t = (text ?? v).trim();
    if (!t) return;
    onSubmit?.(t);
    setV('');
  }

  function onKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  }

  function backdropClick(e) {
    if (e.target === e.currentTarget) onClose?.();
  }

  return (
    <div className="sp-backdrop" onMouseDown={backdropClick}>
      <div className="sp-wrap" role="dialog" aria-label="Ask the desk">
        <div className="sp-eyebrow">
          <span>Ask the desk</span>
          <span className="sp-esc">esc to dismiss</span>
        </div>

        {contextLabel && (
          <div className="sp-context">
            <span className="sp-context-dot" aria-hidden="true" />
            <span>Reading with <em>{contextLabel}</em>.</span>
          </div>
        )}

        <input
          ref={inputRef}
          className="sp-input"
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={onKey}
          placeholder="What are you looking at this morning?"
        />

        <div className="sp-suggest-head">Try a line of inquiry —</div>
        <div className="sp-suggest-list">
          {suggestions.map((s, i) => (
            <button key={i} className="sp-suggest-item" onClick={() => submit(s)}>
              <span className="sp-suggest-text">{s}</span>
              <span className="sp-suggest-arrow">→</span>
            </button>
          ))}
        </div>

        <div className="sp-foot">
          <span><kbd>↵</kbd> to ask · <kbd>↑↓</kbd> for history</span>
          <span>Reading across {window.FINDINGS.length} findings, {Object.keys(window.TICKERS).length} tickers, {Object.keys(window.PEOPLE).length} authors</span>
        </div>
      </div>
    </div>
  );
}

// ── Drawer ("your desk") ────────────────────────────────────────────────
function Drawer({ open, onClose, pinnedFindings, pinnedTickers, pinnedPeople, recentChats, onOpenArticle, onOpenTicker, onOpenPerson, onOpenChat }) {
  useV2Sh_useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="dr-backdrop" onMouseDown={onClose} />
      <aside className="dr-panel" role="complementary" aria-label="Your desk">
        <div className="dr-head">
          <div className="dr-title">Your desk</div>
          <button className="dr-close" onClick={onClose}>Close · Esc</button>
        </div>
        <div className="dr-body">
          <section className="dr-section">
            <div className="dr-section-label">Pinned findings</div>
            {pinnedFindings.length === 0 && (
              <div className="dr-empty">Pull a finding to your desk to keep it close. The fold doesn't refresh while it's here.</div>
            )}
            {pinnedFindings.map(f => {
              const theme = window.THEMES.find(t => t.id === f.themeId);
              return (
                <button key={f.id} className="dr-row" onClick={() => { onOpenArticle(f.id); onClose(); }}>
                  <span className="dr-row-dot" style={{ background: `var(--tag-${theme.hue}-ink)` }} />
                  <span className="dr-row-title">{f.title}</span>
                </button>
              );
            })}
          </section>

          <section className="dr-section">
            <div className="dr-section-label">Pinned tickers</div>
            {pinnedTickers.length === 0 && (
              <div className="dr-empty">Tickers you mark from a name page land here. None yet today.</div>
            )}
            {pinnedTickers.map(sym => {
              const t = window.TICKERS[sym];
              if (!t) return null;
              const up = t.deltaPct >= 0;
              return (
                <button key={sym} className="dr-row" onClick={() => { onOpenTicker(sym); onClose(); }}>
                  <span style={{ font: '500 13px var(--font-mono)', minWidth: 56 }}>{sym}</span>
                  <span style={{ font: 'italic 400 12px var(--font-serif)', color: 'var(--muted-foreground)', flex: 1, marginLeft: 6 }}>{t.name}</span>
                  <span style={{ font: '500 12px var(--font-mono)', color: up ? 'var(--tag-emerald-ink)' : 'var(--tag-crimson-ink)' }}>
                    {up ? '+' : ''}{t.deltaPct.toFixed(2)}%
                  </span>
                </button>
              );
            })}
          </section>

          <section className="dr-section">
            <div className="dr-section-label">Recent threads</div>
            {recentChats.length === 0 && (
              <div className="dr-empty">No conversations yet. Press <kbd style={{ font: '500 10px var(--font-mono)', background: 'var(--surface-2)', padding: '1px 5px', borderRadius: '4px' }}>⌘ K</kbd> to begin.</div>
            )}
            {recentChats.map(c => (
              <button key={c.id} className="dr-row" onClick={() => { onOpenChat(c.id); onClose(); }}>
                <span className="dr-row-chat">{c.title}</span>
              </button>
            ))}
          </section>

          <section className="dr-section">
            <div className="dr-section-label">Pinned authors</div>
            {pinnedPeople.length === 0 && (
              <div className="dr-empty">The desk's regulars. Mark one from their page to keep it surfaced.</div>
            )}
            {pinnedPeople.map(handle => {
              const p = window.PEOPLE[handle];
              if (!p) return null;
              return (
                <button key={handle} className="dr-row" onClick={() => { onOpenPerson(handle); onClose(); }}>
                  <span style={{ font: '600 11px var(--font-sans)', minWidth: 26, height: 26, borderRadius: '50%',
                    background: 'var(--ramp-violet-100)', color: 'var(--ramp-violet-800)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', letterSpacing: '0.02em' }}>{p.initials}</span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', font: '600 13px var(--font-serif)' }}>{p.name}</span>
                    <span style={{ display: 'block', font: '500 11px var(--font-mono)', color: 'var(--muted-foreground)' }}>{p.handle}</span>
                  </span>
                </button>
              );
            })}
          </section>
        </div>
      </aside>
    </>
  );
}

// Default suggestions for the Spotlight, varied by surface.
function defaultSuggestions(surface, ctx) {
  if (surface === 'article' && ctx?.kind === 'finding') {
    const f = ctx.finding;
    return (f.starters || []).slice(0, 4);
  }
  if (surface === 'ticker' && ctx?.symbol) {
    return [
      `What's the strongest evidence in the bull case for ${ctx.symbol}?`,
      `Which peers de-rate first if ${ctx.symbol} misses?`,
      `What does the chart look like at half multiple?`,
    ];
  }
  if (surface === 'person' && ctx?.handle) {
    return [
      `What is @${ctx.handle} most reliably right about?`,
      `Summarise this week's posts from @${ctx.handle}.`,
      `Where does @${ctx.handle} disagree with the desk?`,
    ];
  }
  return [
    'Show me the strongest finding this morning',
    "What's contentious on the desk right now?",
    'Cross-section: where do AI and macro intersect?',
    'A pair trade I should be looking at?',
  ];
}

Object.assign(window, { Masthead, Spotlight, Drawer, defaultSuggestions, TODAY_LONG, TODAY_SHORT });
