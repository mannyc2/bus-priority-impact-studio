// Thematics — shared components.
// Header, Tray (left rail), ChatInput (fixed bottom), inline atoms:
//   Chip · TickerInline · SourcePill · QuestionChip · Sparkline · Popover · Icon.

const { useState, useRef, useEffect, useLayoutEffect, useCallback } = React;

// ── Icons (Lucide-style, hand-inlined so React re-renders don't nuke them) ──
const ICONS = {
  search:        'M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm10 2-4.35-4.35',
  bell:          'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  bookmark:      'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z',
  'bookmark-filled': 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z',
  message:       'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z',
  plus:          'M12 5v14M5 12h14',
  'arrow-right': 'M5 12h14M12 5l7 7-7 7',
  'arrow-up':    'M12 19V5M5 12l7-7 7 7',
  'chevron-right':'m9 18 6-6-6-6',
  'chevron-down':'m6 9 6 6 6-6',
  'chevron-left':'m15 18-6-6 6-6',
  'external-link':'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
  more:          'M5 12h.01M12 12h.01M19 12h.01',
  x:             'M18 6 6 18M6 6l12 12',
  link:          'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  pin:           'M12 17v5M5 12h14M9 12V7a3 3 0 0 1 6 0v5',
  quote:         'M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1zM15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z',
  layers:        'M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5',
  'corner-down': 'M9 10l-5 5 5 5M20 4v7a4 4 0 0 1-4 4H4',
  alert:         'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0ZM12 9v4M12 17h.01',
  trending:      'm22 7-8.5 8.5-5-5L2 17',
  thumb:         'M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3',
};

function Icon({ name, size = 16, className = '', style = {}, ...rest }) {
  const d = ICONS[name];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      className={className} style={{ flex: '0 0 ' + size + 'px', ...style }} aria-hidden="true" {...rest}>
      <path d={d} />
    </svg>
  );
}

// ── Tag/chip — subject hue ────────────────────────────────────────────────
function Chip({ hue = 'amber', children, size = 'sm', as = 'span' }) {
  const Tag = as;
  const style = {
    background: `var(--tag-${hue}-soft)`,
    color: `var(--tag-${hue}-ink)`,
    height: size === 'lg' ? 24 : 22,
    fontSize: size === 'lg' ? 13 : 12,
  };
  return (
    <Tag className="tx-chip" style={style}>
      <span className="tx-chip-dot" style={{ background: `var(--tag-${hue}-ink)` }} />
      {children}
    </Tag>
  );
}

// ── Confidence pip — for related signals ─────────────────────────────────
function ConfidencePip({ level = 'medium' }) {
  const fills = level === 'high' ? 3 : level === 'medium' ? 2 : 1;
  return (
    <span className="tx-conf" aria-label={'confidence ' + level}>
      {[0,1,2].map(i => (
        <span key={i} className="tx-conf-dot" style={{ opacity: i < fills ? 1 : 0.18 }} />
      ))}
    </span>
  );
}

// ── Sparkline (small) ─────────────────────────────────────────────────────
function Sparkline({ data, width = 120, height = 30, stroke = 'currentColor', fill, dot = true }) {
  if (!data?.length) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const range = Math.max(1, max - min);
  const stepX = width / (data.length - 1);
  const pts = data.map((v, i) => [i * stepX, height - 4 - ((v - min) / range) * (height - 8)]);
  const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const last = pts[pts.length - 1];
  const closed = `${d} L ${width} ${height} L 0 ${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {fill && <path d={closed} fill={fill} opacity="0.35" />}
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      {dot && <circle cx={last[0]} cy={last[1]} r="2.4" fill={stroke}/>}
    </svg>
  );
}

// ── Popover — anchored, click-outside to dismiss ──────────────────────────
function Popover({ open, onClose, anchorRect, placement = 'bottom', children, width = 320 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e) { if (ref.current && !ref.current.contains(e.target)) onClose?.(); }
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, onClose]);
  if (!open || !anchorRect) return null;
  const r = anchorRect;
  let top = r.bottom + 8, left = r.left;
  if (placement === 'top') top = r.top - 8;
  // Clamp to viewport width
  const vw = window.innerWidth;
  if (left + width > vw - 16) left = vw - 16 - width;
  if (left < 16) left = 16;
  const style = {
    position: 'fixed', top, left, width,
    background: 'var(--background)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-2)',
    zIndex: 1000, padding: 14,
  };
  if (placement === 'top') style.transform = 'translateY(-100%)';
  return ReactDOM.createPortal(<div ref={ref} style={style}>{children}</div>, document.body);
}

// ── Inline ticker — hover-card preview + click to navigate to ticker page ──
function TickerInline({ symbol }) {
  const t = window.TICKERS?.[symbol];
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const ref = useRef(null);
  const hideTimer = useRef(null);
  if (!t) return <span className="tx-ticker">{symbol}</span>;
  const up = t.deltaPct >= 0;
  function show() {
    clearTimeout(hideTimer.current);
    setRect(ref.current.getBoundingClientRect());
    setOpen(true);
  }
  function hide() {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setOpen(false), 80);
  }
  function navigate(e) {
    e.preventDefault();
    setOpen(false);
    window.thematicsNav?.openTicker?.(symbol);
  }
  return (<>
    <button
      ref={ref}
      type="button"
      className="tx-ticker"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onClick={navigate}
      aria-label={`Open ${symbol} page`}>
      <span className="tx-ticker-sym">{symbol}</span>
      <span className={'tx-ticker-delta ' + (up ? 'up' : 'down')}>{up ? '+' : ''}{t.deltaPct.toFixed(2)}%</span>
    </button>
    <Popover open={open} onClose={() => setOpen(false)} anchorRect={rect} width={300}>
      <div className="tx-tk-pop" onMouseEnter={show} onMouseLeave={hide}>
        <div className="tx-tk-head">
          <div>
            <div className="tx-tk-name">{t.name}</div>
            <div className="tx-tk-mono">{symbol} · {t.ex}</div>
          </div>
          <div className="tx-tk-price">
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 500 }}>${t.price.toFixed(2)}</div>
            <div className={up ? 'up' : 'down'} style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>{up ? '+' : ''}{t.deltaPct.toFixed(2)}%</div>
          </div>
        </div>
        <div style={{ margin: '10px -2px 12px', color: up ? 'var(--tag-emerald-ink)' : 'var(--tag-crimson-ink)' }}>
          <Sparkline data={t.spark} width={272} height={48} stroke="currentColor" fill="currentColor" />
        </div>
        <button className="tx-tk-cta" onClick={navigate}>Open {symbol} page <Icon name="arrow-right" size={13}/></button>
      </div>
    </Popover>
  </>);
}

// ── Inline person — hover-card preview + click navigates to person page ──
function PersonInline({ handle }) {
  const key = (handle || '').replace(/^@/, '').toLowerCase();
  const p = window.PEOPLE?.[key];
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const ref = useRef(null);
  const hideTimer = useRef(null);
  if (!p) return <span className="tx-person">@{key}</span>;
  function show() {
    clearTimeout(hideTimer.current);
    setRect(ref.current.getBoundingClientRect());
    setOpen(true);
  }
  function hide() {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setOpen(false), 80);
  }
  function navigate(e) {
    e.preventDefault();
    setOpen(false);
    window.thematicsNav?.openPerson?.(key);
  }
  return (<>
    <button
      ref={ref}
      type="button"
      className="tx-person"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onClick={navigate}
      aria-label={`Open ${p.handle} page`}>
      <span className="tx-person-avatar" aria-hidden="true">{p.initials}</span>
      <span>{p.handle}</span>
    </button>
    <Popover open={open} onClose={() => setOpen(false)} anchorRect={rect} width={300}>
      <div className="tx-pn-pop" onMouseEnter={show} onMouseLeave={hide}>
        <div className="tx-pn-head">
          <span className="tx-pn-avatar-lg" aria-hidden="true">{p.initials}</span>
          <div className="tx-pn-id">
            <div className="tx-pn-name">{p.name}</div>
            <div className="tx-pn-handle">{p.handle}</div>
          </div>
        </div>
        <div className="tx-pn-role">{p.role}</div>
        <div className="tx-pn-stats">
          <span><b>{p.followers}</b> followers</span>
          <span><b>{p.postsWeek}</b> posts this week</span>
        </div>
        <button className="tx-tk-cta" onClick={navigate}>Open {p.handle} page <Icon name="arrow-right" size={13}/></button>
      </div>
    </Popover>
  </>);
}
function SourcePill({ source }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const ref = useRef(null);
  if (!source) return null;
  function show() { setRect(ref.current.getBoundingClientRect()); setOpen(true); }
  return (<>
    <button ref={ref} type="button" className="tx-src" onClick={show} aria-label={`Open quote from ${source.publisher}`}>
      <span className="tx-src-mark" aria-hidden="true">{source.publisherMark}</span>
      <span className="tx-src-name">{source.publisher}</span>
    </button>
    <Popover open={open} onClose={() => setOpen(false)} anchorRect={rect} width={360}>
      <div className="tx-src-pop">
        <div className="tx-src-pop-head">
          <span className="tx-src-mark" aria-hidden="true">{source.publisherMark}</span>
          <div>
            <div className="tx-src-pop-pub">{source.publisher}</div>
            <div className="tx-src-pop-title">{source.title}</div>
          </div>
        </div>
        <blockquote className="tx-src-quote">{source.quote}</blockquote>
      </div>
    </Popover>
  </>);
}

// ── Question chip — opens chat / expands inline ──────────────────────────
function QuestionChip({ children, onClick }) {
  return (
    <button type="button" className="tx-qchip" onClick={onClick}>
      <span>{children}</span>
      <Icon name="arrow-up" size={14} style={{ transform: 'rotate(45deg)' }} />
    </button>
  );
}

// ── Header — top nav ──────────────────────────────────────────────────────
function Header({ onLogo, onSearch, currentSurface, onNav }) {
  // Treat 'home' and 'markets' as top-level destinations; article/ticker/etc
  // still belong under Home conceptually (you got there from Home).
  const homeActive    = currentSurface === 'home' || currentSurface === 'article' || currentSurface === 'chat' || currentSurface === 'compose';
  const marketsActive = currentSurface === 'markets' || currentSurface === 'ticker' || currentSurface === 'person';
  return (
    <header className="tx-header">
      <button className="tx-wordmark" onClick={onLogo} aria-label="Home">
        <svg viewBox="0 0 64 64" width="22" height="22" aria-hidden="true">
          <g fill="currentColor"><circle cx="20" cy="22" r="6"/><circle cx="44" cy="22" r="6"/><circle cx="32" cy="44" r="6"/></g>
        </svg>
        <span>thematics</span>
      </button>
      <nav className="tx-nav" aria-label="Primary">
        <button
          className={'tx-nav-item ' + (homeActive ? 'active' : '')}
          onClick={() => onNav && onNav('home')}>
          Home
        </button>
        <button
          className={'tx-nav-item ' + (marketsActive ? 'active' : '')}
          onClick={() => onNav && onNav('markets')}>
          Markets
        </button>
      </nav>
      <div style={{ flex: 1 }} />
      <button className="tx-search" onClick={onSearch} aria-label="Ask the desk">
        <Icon name="search" size={14} />
        <span>Ask the desk</span>
        <span className="tx-kbd">⌘K</span>
      </button>
      <button className="tx-icon-btn" aria-label="Alerts"><Icon name="bell" size={16} /></button>
      <div className="tx-avatar" aria-hidden="true">AR</div>
    </header>
  );
}

// ── Tray rail (left) — pinned + recent chats ──────────────────────────────
function Tray({ pinned, chats, currentSurface, currentArticleId, currentChatId, onOpenArticle, onOpenChat, onUnpinFinding }) {
  return (
    <aside className="tx-tray">
      <div className="tx-tray-section">
        <div className="tx-tray-label">Pinned</div>
        {pinned.length === 0 && <div className="tx-tray-empty">Findings you keep close.</div>}
        <div className="tx-tray-list">
          {pinned.map(f => {
            const theme = window.THEMES.find(t => t.id === f.themeId);
            const active = currentSurface === 'article' && currentArticleId === f.id;
            return (
              <button key={f.id}
                className={'tx-tray-item ' + (active ? 'active' : '')}
                onClick={() => onOpenArticle(f.id)}>
                <span className="tx-tray-dot" style={{ background: `var(--tag-${theme.hue}-ink)` }} />
                <span className="tx-tray-title">{f.title}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="tx-tray-divider" />
      <div className="tx-tray-section">
        <div className="tx-tray-label">Recent chats</div>
        {chats.length === 0 && <div className="tx-tray-empty">No chats yet.</div>}
        <div className="tx-tray-list">
          {chats.map(c => {
            const active = currentSurface === 'chat' && currentChatId === c.id;
            return (
              <button key={c.id}
                className={'tx-tray-item tx-tray-chat ' + (active ? 'active' : '')}
                onClick={() => onOpenChat(c.id)}>
                <Icon name="message" size={13} />
                <span className="tx-tray-title">{c.title}</span>
                <span className="tx-tray-when">{c.when}</span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

// ── ChatInput — fixed bottom, with context badge + multiline textarea ─────
function ChatInput({ context, placeholder, onSubmit, onClearContext, autoFocus }) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const taRef = useRef(null);

  useEffect(() => { if (autoFocus) taRef.current?.focus(); }, [autoFocus]);

  // Auto-grow textarea up to ~ 4 lines.
  function onInput(e) {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(120, el.scrollHeight) + 'px';
  }
  function submit() {
    const v = value.trim();
    if (!v) return;
    onSubmit?.(v);
    setValue('');
    if (taRef.current) taRef.current.style.height = 'auto';
  }
  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  }

  return (
    <div className={'tx-chat-input ' + (focused ? 'focused' : '')}>
      {context && (
        <div className="tx-chat-ctx" role="status">
          <Icon name="link" size={13} />
          <span>{context.label}</span>
          {onClearContext && (
            <button className="tx-chat-ctx-x" onClick={onClearContext} aria-label="Drop context"><Icon name="x" size={12} /></button>
          )}
        </div>
      )}
      <textarea ref={taRef} rows="1"
        placeholder={placeholder || 'Ask about a sector, a ticker, or a theme.'}
        value={value}
        onChange={onInput}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onKey}
      />
      <button className="tx-chat-send" onClick={submit} aria-label="Send"
        disabled={!value.trim()}>
        <Icon name="arrow-up" size={16} />
      </button>
    </div>
  );
}

// ── Spotlight (⌘K) — modal command palette ───────────────────────────────
function Spotlight({ open, onClose, onSubmit, contextLabel, suggestions = [] }) {
  const [v, setV] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setV('');
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    document.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(id); document.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  if (!open) return null;

  function submit(text) {
    const t = (text ?? v).trim();
    if (!t) return;
    onSubmit?.(t);
  }
  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  }
  function autoGrow(e) {
    setV(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(120, el.scrollHeight) + 'px';
  }
  function backdropClick(e) { if (e.target === e.currentTarget) onClose?.(); }

  return ReactDOM.createPortal(
    <div className="tx-spot-backdrop" onMouseDown={backdropClick}>
      <div className="tx-spot" role="dialog" aria-label="Ask the desk">
        <div className="tx-spot-eyebrow">
          <span className="tx-spot-eyebrow-left">
            <Icon name="search" size={13} />
            Ask the desk
          </span>
          <span className="tx-spot-esc">esc</span>
        </div>
        {contextLabel && (
          <div className="tx-spot-ctx">
            <Icon name="link" size={12} />
            <span>Reading with {contextLabel}.</span>
          </div>
        )}
        <div className="tx-spot-input-wrap">
          <textarea
            ref={inputRef}
            className="tx-spot-input"
            rows="1"
            placeholder="Ask about a sector, a ticker, or a theme."
            value={v}
            onChange={autoGrow}
            onKeyDown={onKey}
          />
        </div>
        {suggestions.length > 0 && (
          <>
            <div className="tx-spot-sug-label">Or pull a thread —</div>
            <div className="tx-spot-sug-list">
              {suggestions.map((s, i) => (
                <QuestionChip key={i} onClick={() => submit(s)}>{s}</QuestionChip>
              ))}
            </div>
          </>
        )}
        <div className="tx-spot-foot">
          <span><kbd className="tx-spot-kbd">↵</kbd> to ask</span>
          <span>{window.FINDINGS?.length || 0} findings · {Object.keys(window.TICKERS || {}).length} tickers · {Object.keys(window.PEOPLE || {}).length} authors</span>
        </div>
      </div>
    </div>,
    document.body
  );
}

Object.assign(window, {
  Icon, Chip, ConfidencePip, Sparkline, Popover,
  TickerInline, PersonInline, SourcePill, QuestionChip,
  Header, Tray, ChatInput, Spotlight,
});
