// Thematics — Trading App.
// Wraps the v1 app with a "Compose a position" trade surface, accessible from:
//   1. A "Compose →" pill in the masthead
//   2. ⌘K commands ("buy NVDA", "trade NVDA", "short NVDA", "basket ai-infra")
//   3. A "Compose a position" chip in chat suggestions when a ticker is in context
//   4. The hover popover's "Open position" CTA on inline tickers
//
// This file replaces thematics-app.jsx in the trading prototype HTML; the
// surfaces themselves (home, article, ticker, person, chat) are reused as-is.

const { useState: useTrApp_useState, useMemo: useTrApp_useMemo, useEffect: useTrApp_useEffect, useCallback: useTrApp_useCallback } = React;

function TradingApp() {
  const [surface, setSurface] = useTrApp_useState('home');
  const [articleId, setArticleId] = useTrApp_useState(null);
  const [chatId, setChatId] = useTrApp_useState(null);
  const [tickerSymbol, setTickerSymbol] = useTrApp_useState(null);
  const [personHandle, setPersonHandle] = useTrApp_useState(null);
  const [composeSubject, setComposeSubject] = useTrApp_useState(null);   // { kind, sym?, themeId? }
  const [pinnedTickers, setPinnedTickers] = useTrApp_useState([]);
  const [pinnedPeople,  setPinnedPeople ] = useTrApp_useState([]);
  const [chats, setChats] = useTrApp_useState({});
  const [chatOrder, setChatOrder] = useTrApp_useState([]);
  const [spotlightOpen, setSpotlightOpen] = useTrApp_useState(false);

  // Tweaks — exposed in the Tweaks panel
  const [t, setTweak] = useTweaks(window.TWEAK_DEFAULTS);

  // Apply theme (light / dark / system) to <html data-theme=…> so token
  // overrides in <style> take effect across the whole app.
  useTrApp_useEffect(() => {
    const root = document.documentElement;
    const mode = t.theme || 'light';
    const apply = () => {
      if (mode === 'system') {
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.dataset.theme = prefersDark ? 'dark' : 'light';
      } else {
        root.dataset.theme = mode;
      }
    };
    apply();
    if (mode === 'system' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = () => apply();
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
  }, [t.theme]);

  // Apply card-elevation style to <html data-card-style=…>.
  useTrApp_useEffect(() => {
    document.documentElement.dataset.cardStyle = t.cardStyle || 'hairline';
  }, [t.cardStyle]);

  const findingById = (id) => window.FINDINGS.find(f => f.id === id);

  const goHome      = () => setSurface('home');
  const goMarkets   = () => setSurface('markets');
  const openArticle = (id) => { setArticleId(id); setSurface('article'); };
  const openTicker  = (sym) => { setTickerSymbol(sym); setSurface('ticker'); };
  const openPerson  = (handle) => { setPersonHandle(handle); setSurface('person'); };
  const openChat    = (id) => { setChatId(id); setSurface('chat'); };
  const openCompose = (subject) => { setComposeSubject(subject); setSurface('compose'); };
  const updateChat  = (next) => setChats(prev => ({ ...prev, [next.id]: next }));

  const startChat = useTrApp_useCallback((text, ctxFinding, ctxTicker, ctxPerson) => {
    const id = 'c-' + Date.now();
    const title = generateChatTitle(text);
    const seed = canonicalAnswer(text, ctxFinding, ctxTicker, ctxPerson);
    const newChat = {
      id, title,
      messages: [
        { id: 'u' + Date.now(), role: 'user', text },
        { id: 'a' + Date.now(), role: 'assistant', blocks: seed.blocks, starters: seed.starters },
      ],
      contextFindingId: ctxFinding?.id,
      contextTicker: ctxTicker || undefined,
      contextPerson: ctxPerson || undefined,
      pins: [],
    };
    setChats(prev => ({ ...prev, [id]: newChat }));
    setChatOrder(prev => [id, ...prev]);
    setChatId(id);
    setSurface('chat');
  }, []);

  // Spotlight submit: parse for trade commands first, else open chat.
  const submitFromSpotlight = useTrApp_useCallback((text) => {
    const trade = parseTradeCommand(text);
    if (trade) {
      openCompose(trade);
      setSpotlightOpen(false);
      return;
    }
    // Default: open a chat with current-surface context.
    let ctxF = null, ctxT = null, ctxP = null;
    if (surface === 'article') ctxF = findingById(articleId);
    else if (surface === 'ticker') ctxT = tickerSymbol;
    else if (surface === 'person') ctxP = personHandle;
    else if (surface === 'chat' && chatId && chats[chatId]) {
      const c = chats[chatId];
      if (c.contextFindingId) ctxF = findingById(c.contextFindingId);
      ctxT = c.contextTicker || null;
      ctxP = c.contextPerson || null;
    }
    else if (surface === 'compose' && composeSubject?.kind === 'ticker') {
      ctxT = composeSubject.sym;
    }
    startChat(text, ctxF, ctxT, ctxP);
    setSpotlightOpen(false);
  }, [surface, articleId, tickerSymbol, personHandle, chatId, chats, composeSubject, startChat]);

  const continueChat = useTrApp_useCallback((text) => {
    if (!chatId || !chats[chatId]) return;
    const trade = parseTradeCommand(text);
    if (trade) { openCompose(trade); return; }
    const c = chats[chatId];
    const ctxF = c.contextFindingId ? findingById(c.contextFindingId) : null;
    const next = {
      ...c,
      messages: [
        ...c.messages,
        { id: 'u' + Date.now(), role: 'user', text },
        ...streamAssistant(text, c, ctxF, c.contextTicker, c.contextPerson),
      ],
    };
    updateChat(next);
  }, [chatId, chats]);

  const seedChat = (fromContext, question) => {
    let ctxF = null, ctxT = null, ctxP = null;
    if (fromContext?.kind === 'finding') { setArticleId(fromContext.id); ctxF = findingById(fromContext.id); }
    if (fromContext?.kind === 'ticker')  { setTickerSymbol(fromContext.symbol); ctxT = fromContext.symbol; }
    if (fromContext?.kind === 'person')  { setPersonHandle(fromContext.handle); ctxP = fromContext.handle; }
    startChat(question, ctxF, ctxT, ctxP);
  };

  const togglePinTicker = (symbol) => {
    setPinnedTickers(prev => prev.includes(symbol) ? prev.filter(x => x !== symbol) : [...prev, symbol]);
  };
  const togglePinPerson = (handle) => {
    setPinnedPeople(prev => prev.includes(handle) ? prev.filter(x => x !== handle) : [...prev, handle]);
  };

  // ⌘K / Ctrl-K opens Spotlight. ⇧⌥T opens compose for current ticker.
  useTrApp_useEffect(() => {
    function onKey(e) {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setSpotlightOpen(true);
      } else if (e.key === 'Escape' && spotlightOpen) {
        setSpotlightOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [spotlightOpen]);

  // Expose nav globally for inline ticker hover popovers.
  useTrApp_useEffect(() => {
    window.thematicsNav = {
      openTicker, openArticle, openPerson, openHome: goHome,
      openCompose, // <- new
    };
    return () => { window.thematicsNav = undefined; };
  });

  // Spotlight context label + suggestions
  const spotlightCtx = useTrApp_useMemo(() => {
    if (surface === 'article' && articleId) {
      const f = findingById(articleId);
      return { kind: 'finding', label: '"' + f.title + '"',
        suggestions: [
          ...((f.starters || []).slice(0, 3)),
          ...(f.mentions?.length ? [`Compose a position in #${f.mentions[0]}`] : []),
        ] };
    }
    if (surface === 'ticker' && tickerSymbol) {
      return {
        kind: 'ticker', label: tickerSymbol,
        suggestions: [
          `Buy ${tickerSymbol}`,
          `Short ${tickerSymbol}`,
          `What's the strongest evidence in the bull case for ${tickerSymbol}?`,
          `Which peers de-rate first if ${tickerSymbol} misses?`,
        ],
      };
    }
    if (surface === 'person' && personHandle) {
      return {
        kind: 'person', label: '@' + personHandle,
        suggestions: [
          `What is @${personHandle} most reliably right about?`,
          `Summarise this week's posts from @${personHandle}.`,
        ],
      };
    }
    if (surface === 'compose' && composeSubject) {
      const lbl = composeSubject.sym ? `#${composeSubject.sym}` : composeSubject.themeId;
      return {
        kind: 'compose', label: 'the composition for ' + lbl,
        suggestions: [
          composeSubject.sym ? `Make this a basket instead` : `Make this a single name`,
          composeSubject.sym ? `Show me the bear case for ${composeSubject.sym}` : '',
        ].filter(Boolean),
      };
    }
    if (surface === 'chat' && chatId && chats[chatId]) {
      const c = chats[chatId];
      const baseSugg = [];
      if (c.contextTicker) baseSugg.push(`Buy ${c.contextTicker}`, `Compose a position in ${c.contextTicker}`);
      if (c.contextFindingId) {
        const f = findingById(c.contextFindingId);
        baseSugg.push(...(f.starters || []).slice(0, 2));
      }
      return { kind: c.contextTicker ? 'ticker' : 'finding', label: 'this thread', suggestions: baseSugg };
    }
    return {
      kind: null, label: null,
      suggestions: [
        'Show me the strongest finding this morning',
        'Buy NVDA',
        'Get me exposure to AI infrastructure',
        'Short FSLR — basket',
      ],
    };
  }, [surface, articleId, tickerSymbol, personHandle, chatId, chats, composeSubject]);

  // (Compose pill removed from navbar — Compose is reachable via ⌘K, ticker popovers,
  // chat suggestions, and the Tweaks "Try" buttons.)

  return (
    <div className="tx-app">
      <Header
        onLogo={goHome}
        onSearch={() => setSpotlightOpen(true)}
        currentSurface={surface}
        onNav={(dest) => dest === 'markets' ? goMarkets() : goHome()}
      />
      <main className="tx-main">
        <div className="tx-main-scroller">
          {surface === 'home' && (
            <SurfaceHome onOpenArticle={openArticle} />
          )}
          {surface === 'markets' && (
            <SurfaceMarkets
              view={t.marketsView || 'editorial'}
              onOpenTicker={openTicker}
              onOpenArticle={openArticle}
            />
          )}
          {surface === 'article' && articleId && (
            <SurfaceArticle
              finding={findingById(articleId)}
              onOpenChat={openChat}
              onSeedChat={(fid, q) => seedChat({ kind: 'finding', id: fid }, q)}
            />
          )}
          {surface === 'ticker' && tickerSymbol && (
            <SurfaceTickerWithTrade
              symbol={tickerSymbol}
              pinned={pinnedTickers}
              onTogglePin={togglePinTicker}
              onOpenArticle={openArticle}
              onAskAbout={(q) => seedChat({ kind: 'ticker', symbol: tickerSymbol }, q)}
              onCompose={(sym) => openCompose({ kind: 'ticker', sym })}
            />
          )}
          {surface === 'person' && personHandle && (
            <SurfacePerson
              handle={personHandle}
              pinned={pinnedPeople}
              onTogglePin={togglePinPerson}
              onOpenArticle={openArticle}
              onAskAbout={(q) => seedChat({ kind: 'person', handle: personHandle }, q)}
            />
          )}
          {surface === 'chat' && chatId && chats[chatId] && (
            <SurfaceChat
              chat={chats[chatId]}
              context={chats[chatId].contextFindingId ? findingById(chats[chatId].contextFindingId) : null}
              contextTicker={chats[chatId].contextTicker}
              contextPerson={chats[chatId].contextPerson}
              pins={[]}
              onUpdate={updateChat}
              onContinue={continueChat}
              onOpenArticle={openArticle}
              onOpenTicker={openTicker}
              onOpenPerson={openPerson}
            />
          )}
          {surface === 'compose' && composeSubject && (
            <SurfacePosition
              key={composeSubject.kind + '/' + (composeSubject.sym || composeSubject.themeId) + '/' + composeKey}
              subject={composeSubject}
              tweaks={t}
              onClose={() => { setSurface(tickerSymbol ? 'ticker' : 'home'); }}
              onOpenTicker={openTicker}
              onOpenArticle={openArticle}
              onOpenChat={openChat}
            />
          )}
        </div>
      </main>

      <Spotlight
        open={spotlightOpen}
        onClose={() => setSpotlightOpen(false)}
        onSubmit={submitFromSpotlight}
        contextLabel={spotlightCtx.label}
        suggestions={spotlightCtx.suggestions}
      />

      <TweaksPanel title="Tweaks">
        <TweakSection label="Appearance" />
        <TweakRadio
          label="Theme"
          value={t.theme || 'light'}
          options={['light', 'dark', 'system']}
          onChange={(v) => setTweak('theme', v)}
        />
        <TweakSelect
          label="Card elevation"
          value={t.cardStyle || 'hairline'}
          options={['hairline', 'tonal', 'shadow', 'highlight', 'glow']}
          onChange={(v) => setTweak('cardStyle', v)}
        />

        <TweakSection label="Markets page" />
        <TweakRadio
          label="View"
          value={t.marketsView || 'editorial'}
          options={['editorial', 'tape', 'heatmap']}
          onChange={(v) => setTweak('marketsView', v)}
        />

        <TweakSection label="Composition" />
        <TweakRadio
          label="Density"
          value={t.density}
          options={['terse', 'standard', 'verbose']}
          onChange={(v) => setTweak('density', v)}
        />
        <TweakSlider
          label="Alternatives to show"
          value={t.altsToShow}
          min={0} max={4} step={1}
          onChange={(v) => setTweak('altsToShow', v)}
        />
        <TweakRadio
          label="Tone"
          value={t.tone}
          options={['editorial', 'clinical']}
          onChange={(v) => setTweak('tone', v)}
        />

        <TweakSection label="Confirmation" />
        <TweakRadio
          label="Method"
          value={t.confirmMode}
          options={['hold', 'slide', 'undo']}
          onChange={(v) => setTweak('confirmMode', v)}
        />

        <TweakSection label="Try" />
        <TweakButton label='Compose: "buy NVDA"' onClick={() => openCompose({ kind: 'ticker', sym: 'NVDA' })} />
        <TweakButton label='Compose: basket in AI infra' onClick={() => openCompose({ kind: 'theme', themeId: 'ai-infra' })} />
        <TweakButton label='Compose: "long IBIT"' onClick={() => openCompose({ kind: 'ticker', sym: 'IBIT' })} />
      </TweaksPanel>
    </div>
  );
}

// Force the SurfacePosition to remount when invoked freshly (so animations replay).
let composeKey = 0;

// ── Compose pill in the masthead ──────────────────────────────────────────
function ComposePillStandalone({ onClick }) {
  return (
    <button className="tx-compose-pill" onClick={onClick} title="Compose a position">
      <span className="tx-compose-pill-mark">⁂</span>
      <span>Compose</span>
    </button>
  );
}

// ── Parse a Spotlight command for trade intent ────────────────────────────
function parseTradeCommand(text) {
  if (!text) return null;
  const s = text.trim();
  // basket "<theme>"
  const basketRe = /^(?:basket|theme|expose|get me exposure to|exposure to)\s+(?:#)?(\S[^,]*?)\s*$/i;
  const bm = s.match(basketRe);
  if (bm) {
    const name = bm[1].toLowerCase();
    const themes = window.THEMES || [];
    const theme = themes.find(t => t.id === name || t.name.toLowerCase().includes(name) || name.includes(t.id));
    if (theme) return { kind: 'theme', themeId: theme.id };
  }
  // buy/sell/short/long/trade/compose SYMBOL [basket]
  const tradeRe = /^(?:buy|sell|short|long|trade|compose|file)\s+(?:a\s+position\s+in\s+)?(?:#)?([A-Za-z\-]{1,8})(?:\s+(basket))?\s*$/i;
  const tm = s.match(tradeRe);
  if (tm) {
    const sym = tm[1].toUpperCase();
    if (window.TICKERS && window.TICKERS[sym]) {
      if (tm[2]) {
        // "short FSLR basket" -> theme containing FSLR
        const themes = window.themesFor(sym);
        if (themes[0]) return { kind: 'theme', themeId: themes[0] };
      }
      return { kind: 'ticker', sym };
    }
    // "basket ai-infra"
    const theme = (window.THEMES || []).find(t => t.id.toUpperCase() === sym);
    if (theme) return { kind: 'theme', themeId: theme.id };
  }
  // "compose a position in #NVDA"
  const composeRe = /compose.*(?:position).*?(?:in\s+)?#?([A-Z]{2,6})/i;
  const cm = s.match(composeRe);
  if (cm) {
    const sym = cm[1].toUpperCase();
    if (window.TICKERS && window.TICKERS[sym]) return { kind: 'ticker', sym };
  }
  return null;
}

// ── SurfaceTicker, with a Trade button injected into the actions row ──────
function SurfaceTickerWithTrade(props) {
  // Render the existing SurfaceTicker, then DOM-inject a Trade button into
  // its actions row. Using a useEffect/portal because we don't want to
  // duplicate the entire 110-line component.
  const rootRef = React.useRef(null);
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const actions = root.querySelector('.tx-tk-actions');
    if (!actions || actions.querySelector('.tx-tk-btn-trade')) return;
    const btn = document.createElement('button');
    btn.className = 'tx-tk-btn tx-tk-btn-trade';
    btn.innerHTML = '<span style="font-family: var(--font-mono); font-size: 12px;">+</span> Compose a position';
    btn.addEventListener('click', () => props.onCompose(props.symbol));
    actions.prepend(btn);
    return () => btn.remove();
  });
  return (
    <div ref={rootRef}>
      <SurfaceTicker {...props} />
    </div>
  );
}

function generateChatTitle(text) {
  const cleaned = text.replace(/[#?.]/g, '').trim();
  const words = cleaned.split(/\s+/).slice(0, 7).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Replace ReactDOM root with the trading app.
ReactDOM.createRoot(document.getElementById('root')).render(<TradingApp />);
