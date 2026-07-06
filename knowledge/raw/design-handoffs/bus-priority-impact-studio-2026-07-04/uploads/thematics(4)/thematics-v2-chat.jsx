// Thematics v2 — Chat surface.
// Conversation column + a local typographic continuation input (no global bar).

const { useState: useV2Ch_useState, useEffect: useV2Ch_useEffect, useRef: useV2Ch_useRef } = React;

function SurfaceThread({ chat, context, contextTicker, contextPerson, onUpdate, onOpenArticle, onOpenTicker, onOpenPerson, onBack }) {
  const scrollerRef = useV2Ch_useRef(null);

  useV2Ch_useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [chat.messages.length]);

  function submit(text) {
    if (!text.trim()) return;
    const next = [...chat.messages,
      { id: 'u' + Date.now(), role: 'user', text },
      ...streamAssistant(text, chat, context, contextTicker, contextPerson),
    ];
    onUpdate({ ...chat, messages: next });
  }

  const theme = context ? window.THEMES.find(t => t.id === context.themeId) : null;

  return (
    <div className="ch-wrap" ref={scrollerRef}>
      <div className="ch-main">
        <a onClick={onBack}
           style={{ font: 'italic 500 13px var(--font-serif)', color: 'var(--muted-foreground)', marginBottom: 14, display: 'inline-block', cursor: 'pointer' }}>
          ← The front page
        </a>
        <div className="ch-eyebrow">A thread · opened today</div>
        <h1 className="ch-title">{chat.title}</h1>

        {chat.messages.map(m => (
          <ThreadMessage key={m.id} msg={m} onAskFollowup={submit} />
        ))}

        <ContinueInput onSubmit={submit} contextLabel={
          context ? 'this finding' : contextTicker ? contextTicker : contextPerson ? '@' + contextPerson : null
        }/>
      </div>

      <aside className="ch-aside">
        <section className="ch-aside-section">
          <div className="ch-aside-label">Reading with</div>
          {context && theme && (
            <div className="ch-aside-context" onClick={() => onOpenArticle(context.id)}>
              <div className="ch-aside-context-kicker">
                <span className="ch-aside-context-kicker-dot" style={{ background: `var(--tag-${theme.hue}-ink)` }} />
                <span>{theme.name}</span>
              </div>
              <div className="ch-aside-context-title">{context.title}</div>
              <p className="ch-aside-context-lede">{context.lede}</p>
              <button className="ch-aside-context-open">Open the finding →</button>
            </div>
          )}
          {contextTicker && (
            <div className="ch-aside-context" onClick={() => onOpenTicker(contextTicker)}>
              <div className="ch-aside-context-kicker">
                <span className="ch-aside-context-kicker-dot" style={{ background: 'var(--foreground)' }} />
                <span>Name page</span>
              </div>
              <div className="ch-aside-context-title">{contextTicker} · {window.TICKERS[contextTicker]?.name}</div>
              <p className="ch-aside-context-lede">{window.TICKERS[contextTicker]?.note}</p>
              <button className="ch-aside-context-open">Open {contextTicker} →</button>
            </div>
          )}
          {contextPerson && (
            <div className="ch-aside-context" onClick={() => onOpenPerson(contextPerson)}>
              <div className="ch-aside-context-kicker">
                <span className="ch-aside-context-kicker-dot" style={{ background: 'var(--ramp-violet-800)' }} />
                <span>Author</span>
              </div>
              <div className="ch-aside-context-title">{window.PEOPLE[contextPerson]?.name}</div>
              <p className="ch-aside-context-lede">{window.PEOPLE[contextPerson]?.note}</p>
              <button className="ch-aside-context-open">Open @{contextPerson} →</button>
            </div>
          )}
          {!context && !contextTicker && !contextPerson && (
            <div style={{ font: 'italic 400 13px/1.5 var(--font-serif)', color: 'var(--subtle-foreground)' }}>
              A clean thread. Nothing loaded — the desk answers from the whole folio.
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}

function ThreadMessage({ msg, onAskFollowup }) {
  if (msg.role === 'user') {
    return (
      <div className="ch-msg ch-msg-user">
        <p>“{msg.text}”</p>
      </div>
    );
  }
  return (
    <div className="ch-msg ch-msg-asst">
      <div className="ch-msg-asst-meta">Thematics, reading across the corpus</div>
      <div>
        {msg.blocks.map((b, i) => {
          if (b.kind === 'p') return <p key={i}><ProseLine text={b.text} /></p>;
          if (b.kind === 'viz') return <Viz key={i} viz={b.viz} />;
          if (b.kind === 'list') return (
            <ul key={i}>
              {b.items.map((it, j) => <li key={j}><ProseLine text={it} /></li>)}
            </ul>
          );
          return null;
        })}
        {msg.starters && msg.starters.length > 0 && (
          <div className="ch-followups">
            {msg.starters.map((q, i) => (
              <button key={i} className="ch-followup" onClick={() => onAskFollowup(q)}>
                <span className="ch-followup-text">{q}</span>
                <span className="ch-followup-arrow">ask →</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ContinueInput({ onSubmit, contextLabel }) {
  const [v, setV] = useV2Ch_useState('');
  const ref = useV2Ch_useRef(null);

  function autoGrow(e) {
    setV(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(200, el.scrollHeight) + 'px';
  }
  function submit() {
    const t = v.trim();
    if (!t) return;
    onSubmit(t);
    setV('');
    if (ref.current) ref.current.style.height = 'auto';
  }
  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  }

  return (
    <div className="ch-continue">
      <div className="ch-continue-label">
        Continue the thread{contextLabel ? ' — reading with ' : ''}
        {contextLabel && <em style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--font-serif)' }}>{contextLabel}</em>}
      </div>
      <textarea
        ref={ref}
        className="ch-continue-input"
        rows="1"
        placeholder="A follow-on question, or refine the read…"
        value={v}
        onChange={autoGrow}
        onKeyDown={onKey}
      />
      <div className="ch-continue-row">
        <div className="ch-continue-hint">
          <kbd>↵</kbd> to ask · <kbd>⇧↵</kbd> for a new line
        </div>
        <button className="ch-continue-send" onClick={submit} disabled={!v.trim()}>
          Ask the desk →
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { SurfaceThread });
