// Thematics — App root. Routing + chat creation + ticker navigation.
// v1 design language with two updates from the v2 exploration:
//   1. ⌘K Spotlight replaces the persistent bottom chat input.
//   2. Findings on home are grouped by theme.

const { useState: useApp_useState, useMemo: useApp_useMemo, useEffect: useApp_useEffect, useCallback: useApp_useCallback } = React;

function App() {
  const [surface, setSurface] = useApp_useState('home');
  const [articleId, setArticleId] = useApp_useState(null);
  const [chatId, setChatId] = useApp_useState(null);
  const [tickerSymbol, setTickerSymbol] = useApp_useState(null);
  const [personHandle, setPersonHandle] = useApp_useState(null);
  const [pinnedTickers, setPinnedTickers] = useApp_useState([]);
  const [pinnedPeople,  setPinnedPeople ] = useApp_useState([]);
  const [chats, setChats] = useApp_useState({});
  const [chatOrder, setChatOrder] = useApp_useState([]);

  const [spotlightOpen, setSpotlightOpen] = useApp_useState(false);

  const findingById = (id) => window.FINDINGS.find(f => f.id === id);

  const goHome      = () => setSurface('home');
  const openArticle = (id) => { setArticleId(id); setSurface('article'); };
  const openTicker  = (sym) => { setTickerSymbol(sym); setSurface('ticker'); };
  const openPerson  = (handle) => { setPersonHandle(handle); setSurface('person'); };
  const openChat    = (id) => { setChatId(id); setSurface('chat'); };
  const updateChat  = (next) => setChats(prev => ({ ...prev, [next.id]: next }));

  // Always start a new chat (used by Spotlight + question-chip seeding).
  const startChat = useApp_useCallback((text, ctxFinding, ctxTicker, ctxPerson) => {
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

  // Submit from Spotlight — uses current surface for context, always new chat.
  const submitFromSpotlight = useApp_useCallback((text) => {
    let ctxF = null, ctxT = null, ctxP = null;
    if (surface === 'article') ctxF = findingById(articleId);
    else if (surface === 'ticker') ctxT = tickerSymbol;
    else if (surface === 'person') ctxP = personHandle;
    else if (surface === 'chat' && chatId && chats[chatId]) {
      // From an existing chat, preserve its context for the new chat.
      const c = chats[chatId];
      if (c.contextFindingId) ctxF = findingById(c.contextFindingId);
      ctxT = c.contextTicker || null;
      ctxP = c.contextPerson || null;
    }
    startChat(text, ctxF, ctxT, ctxP);
    setSpotlightOpen(false);
  }, [surface, articleId, tickerSymbol, personHandle, chatId, chats, startChat]);

  // Continue the current chat — used by the inline input on the chat surface.
  const continueChat = useApp_useCallback((text) => {
    if (!chatId || !chats[chatId]) return;
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

  // Seed a chat from a question-chip click on an article, ticker, or person page.
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

  // ⌘K / Ctrl-K opens Spotlight from anywhere.
  useApp_useEffect(() => {
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

  // Expose a tiny global so inline components (TickerInline, PersonInline) can navigate.
  useApp_useEffect(() => {
    window.thematicsNav = { openTicker, openArticle, openPerson, openHome: goHome };
    return () => { window.thematicsNav = undefined; };
  });

  // Spotlight context label + suggestions
  const spotlightCtx = useApp_useMemo(() => {
    if (surface === 'article' && articleId) {
      const f = findingById(articleId);
      return { kind: 'finding', label: '“' + f.title + '”', suggestions: (f.starters || []).slice(0, 4) };
    }
    if (surface === 'ticker' && tickerSymbol) {
      return {
        kind: 'ticker',
        label: tickerSymbol,
        suggestions: [
          `What's the strongest evidence in the bull case for ${tickerSymbol}?`,
          `Which peers de-rate first if ${tickerSymbol} misses?`,
          `Compare ${tickerSymbol} to its sector peers.`,
        ],
      };
    }
    if (surface === 'person' && personHandle) {
      return {
        kind: 'person',
        label: '@' + personHandle,
        suggestions: [
          `What is @${personHandle} most reliably right about?`,
          `Summarise this week's posts from @${personHandle}.`,
          `Where does @${personHandle} disagree with the desk?`,
        ],
      };
    }
    if (surface === 'chat' && chatId && chats[chatId]) {
      const c = chats[chatId];
      if (c.contextFindingId) {
        const f = findingById(c.contextFindingId);
        return { kind: 'finding', label: 'the loaded finding', suggestions: (f.starters || []).slice(0, 4) };
      }
      if (c.contextTicker) return { kind: 'ticker', label: c.contextTicker, suggestions: [] };
      if (c.contextPerson) return { kind: 'person', label: '@' + c.contextPerson, suggestions: [] };
    }
    // Default — home / chat-no-context
    return {
      kind: null, label: null,
      suggestions: [
        'Show me the strongest finding this morning',
        "What's contentious on the desk right now?",
        'Cross-section: where do AI and macro intersect?',
        'A pair trade I should be looking at?',
      ],
    };
  }, [surface, articleId, tickerSymbol, personHandle, chatId, chats]);

  return (
    <div className="tx-app">
      <Header onLogo={goHome} onSearch={() => setSpotlightOpen(true)} />
      <main className="tx-main">
        <div className="tx-main-scroller">
          {surface === 'home' && (
            <SurfaceHome onOpenArticle={openArticle} />
          )}
          {surface === 'article' && articleId && (
            <SurfaceArticle
              finding={findingById(articleId)}
              onOpenChat={openChat}
              onSeedChat={(fid, q) => seedChat({ kind: 'finding', id: fid }, q)}
            />
          )}
          {surface === 'ticker' && tickerSymbol && (
            <SurfaceTicker
              symbol={tickerSymbol}
              pinned={pinnedTickers}
              onTogglePin={togglePinTicker}
              onOpenArticle={openArticle}
              onAskAbout={(q) => seedChat({ kind: 'ticker', symbol: tickerSymbol }, q)}
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
        </div>
      </main>

      <Spotlight
        open={spotlightOpen}
        onClose={() => setSpotlightOpen(false)}
        onSubmit={submitFromSpotlight}
        contextLabel={spotlightCtx.label}
        suggestions={spotlightCtx.suggestions}
      />
    </div>
  );
}

function generateChatTitle(text) {
  const cleaned = text.replace(/[#?.]/g, '').trim();
  const words = cleaned.split(/\s+/).slice(0, 7).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
