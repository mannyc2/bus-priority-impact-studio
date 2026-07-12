// Thematics v2 — App root.
// Surfaces: folio (home) · broadsheet (article) · thread (chat) · ticker · person.
// Global Spotlight (⌘K) replaces the bottom chat bar; Drawer (Y or right-edge link) holds your desk.

const { useState: useV2A_useState, useEffect: useV2A_useEffect, useMemo: useV2A_useMemo, useCallback: useV2A_useCallback } = React;

function AppV2() {
  const [surface, setSurface] = useV2A_useState('home');
  const [section, setSection] = useV2A_useState('front');
  const [articleId, setArticleId] = useV2A_useState(null);
  const [chatId, setChatId] = useV2A_useState(null);
  const [tickerSymbol, setTickerSymbol] = useV2A_useState(null);
  const [personHandle, setPersonHandle] = useV2A_useState(null);

  const [pinnedFindingIds, setPinnedFindingIds] = useV2A_useState(window.PINNED || []);
  const [pinnedTickers, setPinnedTickers] = useV2A_useState(['NVDA', 'TLT']);
  const [pinnedPeople, setPinnedPeople] = useV2A_useState(['alphaprime']);

  const [chats, setChats] = useV2A_useState({});
  const [chatOrder, setChatOrder] = useV2A_useState([]);

  const [spotlightOpen, setSpotlightOpen] = useV2A_useState(false);
  const [drawerOpen, setDrawerOpen] = useV2A_useState(false);

  const findingById = (id) => window.FINDINGS.find(f => f.id === id);

  // Surface transitions
  const goHome = useV2A_useCallback(() => { setSurface('home'); setSection('front'); window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);
  const openSection = useV2A_useCallback((s) => { setSurface('home'); setSection(s); window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);
  const openArticle = useV2A_useCallback((id) => { setArticleId(id); setSurface('article'); window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);
  const openTicker = useV2A_useCallback((sym) => { setTickerSymbol(sym); setSurface('ticker'); window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);
  const openPerson = useV2A_useCallback((handle) => { setPersonHandle(handle); setSurface('person'); window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);
  const openChat = useV2A_useCallback((id) => { setChatId(id); setSurface('chat'); window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);

  // Pin toggles
  const togglePinTicker = (s) => setPinnedTickers(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  const togglePinPerson = (h) => setPinnedPeople(prev => prev.includes(h) ? prev.filter(x => x !== h) : [...prev, h]);

  // Submit a question — open or extend a chat depending on context.
  const handleSubmit = useV2A_useCallback((text) => {
    let ctxFinding = null, ctxTicker = null, ctxPerson = null;
    if (surface === 'article' && articleId) ctxFinding = findingById(articleId);
    if (surface === 'ticker' && tickerSymbol) ctxTicker = tickerSymbol;
    if (surface === 'person' && personHandle) ctxPerson = personHandle;
    if (surface === 'chat' && chatId && chats[chatId]) {
      // Continue current thread
      const c = chats[chatId];
      const f = c.contextFindingId ? findingById(c.contextFindingId) : null;
      const next = {
        ...c,
        messages: [
          ...c.messages,
          { id: 'u' + Date.now(), role: 'user', text },
          ...streamAssistant(text, c, f, c.contextTicker, c.contextPerson),
        ],
      };
      setChats(prev => ({ ...prev, [chatId]: next }));
      return;
    }
    const id = 'c-' + Date.now();
    const title = chatTitleFrom(text);
    const seed = canonicalAnswer(text, ctxFinding, ctxTicker, ctxPerson);
    const newChat = {
      id, title,
      when: 'Today',
      messages: [
        { id: 'u' + Date.now(), role: 'user', text },
        { id: 'a' + Date.now(), role: 'assistant', blocks: seed.blocks, starters: seed.starters },
      ],
      contextFindingId: ctxFinding?.id,
      contextTicker: ctxTicker || undefined,
      contextPerson: ctxPerson || undefined,
    };
    setChats(prev => ({ ...prev, [id]: newChat }));
    setChatOrder(prev => [id, ...prev]);
    setChatId(id);
    setSurface('chat');
    setSpotlightOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [surface, articleId, tickerSymbol, personHandle, chatId, chats]);

  // Seed a chat from a question chip click — set context, then submit.
  const seedChat = useV2A_useCallback((findingId, question) => {
    setArticleId(findingId);
    setSurface('article'); // ensures context is correct
    // Wait a tick so context state lands before handleSubmit reads it.
    setTimeout(() => {
      // Bypass surface check by going through chat path directly.
      const ctxFinding = findingById(findingId);
      const id = 'c-' + Date.now();
      const title = chatTitleFrom(question);
      const seed = canonicalAnswer(question, ctxFinding, null, null);
      const newChat = {
        id, title, when: 'Today',
        messages: [
          { id: 'u' + Date.now(), role: 'user', text: question },
          { id: 'a' + Date.now(), role: 'assistant', blocks: seed.blocks, starters: seed.starters },
        ],
        contextFindingId: ctxFinding?.id,
      };
      setChats(prev => ({ ...prev, [id]: newChat }));
      setChatOrder(prev => [id, ...prev]);
      setChatId(id);
      setSurface('chat');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 0);
  }, []);

  // Spotlight context
  const spotlightCtx = useV2A_useMemo(() => {
    if (surface === 'article' && articleId) return { kind: 'finding', finding: findingById(articleId), label: findingById(articleId)?.title };
    if (surface === 'ticker' && tickerSymbol) return { kind: 'ticker', symbol: tickerSymbol, label: tickerSymbol };
    if (surface === 'person' && personHandle) return { kind: 'person', handle: personHandle, label: '@' + personHandle };
    return null;
  }, [surface, articleId, tickerSymbol, personHandle]);

  const suggestions = useV2A_useMemo(() => defaultSuggestions(surface, spotlightCtx), [surface, spotlightCtx]);

  // ⌘K / Y keyboard
  useV2A_useEffect(() => {
    function onKey(e) {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setSpotlightOpen(true);
        setDrawerOpen(false);
      } else if (e.key === '/' && !e.metaKey && !e.ctrlKey && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setSpotlightOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Expose a tiny global for inline atoms (TickerInline, PersonInline) to navigate.
  useV2A_useEffect(() => {
    window.thematicsNav = { openTicker, openArticle, openPerson, openHome: goHome };
    window.foNav = { openTicker, openArticle, openPerson, openChat, section: openSection, openSpotlight: () => setSpotlightOpen(true), openDrawer: () => setDrawerOpen(true) };
    return () => { window.thematicsNav = undefined; window.foNav = undefined; };
  });

  // Active section for the masthead
  const activeSection = surface === 'home' ? section
    : surface === 'article' && articleId ? findingById(articleId)?.themeId
    : surface === 'person' ? 'people'
    : null;

  const recentChats = chatOrder.map(id => chats[id]).filter(Boolean);
  const pinnedFindings = pinnedFindingIds.map(id => findingById(id)).filter(Boolean);

  // Tweaks
  const t = useTweaks ? useTweaks(window.TWEAK_DEFAULTS || {}) : { tweaks: {}, setTweak: () => {} };
  const tweaks = t.tweaks;

  return (
    <div className="fo-app" data-dropcap={tweaks.dropcap || 'on'} data-leadsize={tweaks.leadSize || 'display'}>
      <Masthead
        activeSection={activeSection}
        onSection={openSection}
        onSpotlight={() => setSpotlightOpen(true)}
        onDrawer={() => setDrawerOpen(true)}
      />

      <div className="fo-shell">
        {surface === 'home' && (
          <SurfaceFolio
            onOpenArticle={openArticle}
            sectionFilter={section}
            tweaks={tweaks}
          />
        )}

        {surface === 'article' && articleId && (
          <SurfaceBroadsheet
            finding={findingById(articleId)}
            onBack={goHome}
            onOpenChat={openChat}
            onSeedChat={seedChat}
            onOpenSpotlight={() => setSpotlightOpen(true)}
          />
        )}

        {surface === 'chat' && chatId && chats[chatId] && (
          <SurfaceThread
            chat={chats[chatId]}
            context={chats[chatId].contextFindingId ? findingById(chats[chatId].contextFindingId) : null}
            contextTicker={chats[chatId].contextTicker}
            contextPerson={chats[chatId].contextPerson}
            onUpdate={(next) => setChats(prev => ({ ...prev, [next.id]: next }))}
            onOpenArticle={openArticle}
            onOpenTicker={openTicker}
            onOpenPerson={openPerson}
            onBack={goHome}
          />
        )}

        {surface === 'ticker' && tickerSymbol && (
          <div className="fo-page-wrap">
            <div className="fo-page-inner">
              <a onClick={goHome} style={{ font: 'italic 500 13px var(--font-serif)', color: 'var(--muted-foreground)', marginBottom: 20, display: 'inline-block', cursor: 'pointer' }}>
                ← The front page
              </a>
              <SurfaceTicker
                symbol={tickerSymbol}
                pinned={pinnedTickers}
                onTogglePin={togglePinTicker}
                onOpenArticle={openArticle}
                onAskAbout={(q) => { setSurface('ticker'); handleSubmitWithCtx(q, null, tickerSymbol, null); }}
              />
            </div>
          </div>
        )}

        {surface === 'person' && personHandle && (
          <div className="fo-page-wrap">
            <div className="fo-page-inner">
              <a onClick={goHome} style={{ font: 'italic 500 13px var(--font-serif)', color: 'var(--muted-foreground)', marginBottom: 20, display: 'inline-block', cursor: 'pointer' }}>
                ← The front page
              </a>
              <SurfacePerson
                handle={personHandle}
                pinned={pinnedPeople}
                onTogglePin={togglePinPerson}
                onOpenArticle={openArticle}
                onAskAbout={(q) => { setSurface('person'); handleSubmitWithCtx(q, null, null, personHandle); }}
              />
            </div>
          </div>
        )}
      </div>

      <Spotlight
        open={spotlightOpen}
        onClose={() => setSpotlightOpen(false)}
        onSubmit={handleSubmit}
        contextLabel={spotlightCtx?.label}
        suggestions={suggestions}
      />

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        pinnedFindings={pinnedFindings}
        pinnedTickers={pinnedTickers}
        pinnedPeople={pinnedPeople}
        recentChats={recentChats}
        onOpenArticle={openArticle}
        onOpenTicker={openTicker}
        onOpenPerson={openPerson}
        onOpenChat={openChat}
      />

      {/* Tweaks */}
      {t.tweaks !== undefined && <FolioTweaks t={t} />}
    </div>
  );

  function handleSubmitWithCtx(text, ctxFinding, ctxTicker, ctxPerson) {
    const id = 'c-' + Date.now();
    const title = chatTitleFrom(text);
    const seed = canonicalAnswer(text, ctxFinding, ctxTicker, ctxPerson);
    const newChat = {
      id, title, when: 'Today',
      messages: [
        { id: 'u' + Date.now(), role: 'user', text },
        { id: 'a' + Date.now(), role: 'assistant', blocks: seed.blocks, starters: seed.starters },
      ],
      contextFindingId: ctxFinding?.id,
      contextTicker: ctxTicker || undefined,
      contextPerson: ctxPerson || undefined,
    };
    setChats(prev => ({ ...prev, [id]: newChat }));
    setChatOrder(prev => [id, ...prev]);
    setChatId(id);
    setSurface('chat');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function chatTitleFrom(text) {
  const cleaned = text.replace(/[#?.]/g, '').trim();
  const words = cleaned.split(/\s+/).slice(0, 7).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// ── Tweaks ──────────────────────────────────────────────────────────────
// Simple hand-rolled because we don't have the starter component here.
function useTweaks(defaults) {
  const [tweaks, setTweaks] = React.useState(() => ({ ...defaults }));
  const setTweak = React.useCallback((keyOrObj, val) => {
    setTweaks(prev => {
      const edit = typeof keyOrObj === 'string' ? { [keyOrObj]: val } : keyOrObj;
      const next = { ...prev, ...edit };
      try { window.parent.postMessage({ type: '__edit_mode_set_keys', edits: edit }, '*'); } catch {}
      return next;
    });
  }, []);
  return { tweaks, setTweak };
}

function FolioTweaks({ t }) {
  const [open, setOpen] = React.useState(false);
  // Edit-mode protocol
  React.useEffect(() => {
    function onMsg(e) {
      if (e.data?.type === '__activate_edit_mode') setOpen(true);
      if (e.data?.type === '__deactivate_edit_mode') setOpen(false);
    }
    window.addEventListener('message', onMsg);
    try { window.parent.postMessage({ type: '__edit_mode_available' }, '*'); } catch {}
    return () => window.removeEventListener('message', onMsg);
  }, []);

  if (!open) return null;

  const close = () => {
    setOpen(false);
    try { window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*'); } catch {}
  };

  return (
    <div style={{
      position: 'fixed', right: 24, bottom: 24, width: 280,
      background: 'var(--background)', border: '1px solid var(--foreground)',
      boxShadow: 'var(--shadow-3)', zIndex: 200, padding: 16,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--foreground)' }}>
        <div style={{ font: '600 14px var(--font-serif)' }}>Tweaks</div>
        <button onClick={close} style={{ font: '500 10px var(--font-mono)', letterSpacing: '0.08em', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Close</button>
      </div>
      <Row label="Drop cap">
        <Seg value={t.tweaks.dropcap || 'on'} options={['on','off']} onChange={(v) => t.setTweak('dropcap', v)} />
      </Row>
      <Row label="Wires strip">
        <Seg value={t.tweaks.wires || 'on'} options={['on','off']} onChange={(v) => t.setTweak('wires', v)} />
      </Row>
    </div>
  );
}
function Row({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ font: '500 11px/1 var(--font-mono)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  );
}
function Seg({ value, options, onChange }) {
  return (
    <div style={{ display: 'flex', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      {options.map(o => (
        <button key={o} onClick={() => onChange(o)}
                style={{
                  flex: 1, padding: '6px 0',
                  font: '500 12px var(--font-sans)',
                  textTransform: 'capitalize',
                  background: value === o ? 'var(--foreground)' : 'transparent',
                  color: value === o ? 'var(--background)' : 'var(--foreground)',
                }}>{o}</button>
      ))}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<AppV2 />);
