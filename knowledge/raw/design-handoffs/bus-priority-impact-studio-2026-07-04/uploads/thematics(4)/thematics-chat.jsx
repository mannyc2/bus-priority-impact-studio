// Thematics — Chat surface.
// Conversation + context rail (loaded article OR loaded ticker + pins).

const { useState: useChat_useState, useEffect: useChat_useEffect, useRef: useChat_useRef } = React;

function SurfaceChat({ chat, context, contextTicker, contextPerson, pins, onUpdate, onContinue, onOpenArticle, onOpenTicker, onOpenPerson }) {
  const scrollerRef = useChat_useRef(null);

  useChat_useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [chat.messages.length]);

  return (
    <div className="tx-chat-layout">
      <div ref={scrollerRef} className="tx-chat-scroller">
        <div className="tx-chat-inner">
          <div className="tx-chat-head">
            <div className="tx-chat-eyebrow">A conversation</div>
            <h1 className="tx-chat-title">{chat.title}</h1>
          </div>

          {chat.messages.map((m, i) => (
            <Message key={m.id} msg={m} onAskFollowup={(q) => {
              const next = [...chat.messages,
                { id: 'u' + Date.now(), role: 'user', text: q },
                ...streamAssistant(q, chat, context, contextTicker, contextPerson),
              ];
              onUpdate({ ...chat, messages: next });
            }} />
          ))}

          {/* Inline continuation input — replaces v1's global bottom bar */}
          <div className="tx-chat-continue">
            <div className="tx-chat-continue-label">Continue the thread</div>
            <ChatInput
              placeholder="A follow-on, or refine the question…"
              onSubmit={onContinue}
            />
          </div>
        </div>
      </div>

      <aside className="tx-chat-rail">
        <section className="tx-rail-section">
          <div className="tx-rail-label">Loaded context</div>
          {context ? (
            <ContextCard finding={context} onOpen={() => onOpenArticle(context.id)} />
          ) : contextTicker ? (
            <TickerContextCard symbol={contextTicker} onOpen={() => onOpenTicker(contextTicker)}/>
          ) : contextPerson ? (
            <PersonContextCard handle={contextPerson} onOpen={() => onOpenPerson(contextPerson)}/>
          ) : (
            <p className="tx-rail-empty">A clean conversation — nothing pinned.</p>
          )}
        </section>
        {pins.length > 0 && (
          <section className="tx-rail-section">
            <div className="tx-rail-label">Also loaded</div>
            <div className="tx-rail-pins">
              {pins.map(p => (
                <a key={p.id} className="tx-rail-pin" href="#" onClick={(e) => { e.preventDefault(); onOpenArticle(p.id); }}>
                  <span className="tx-rail-pin-dot" style={{ background: `var(--tag-${window.THEMES.find(t => t.id === p.themeId).hue}-ink)` }}/>
                  <span>{p.title}</span>
                </a>
              ))}
            </div>
          </section>
        )}
      </aside>
    </div>
  );
}

function ContextCard({ finding, onOpen }) {
  const theme = window.THEMES.find(t => t.id === finding.themeId);
  return (
    <div className="tx-ctx-card" onClick={onOpen} role="link" tabIndex="0">
      <Chip hue={theme.hue}>{theme.name}</Chip>
      <div className="tx-ctx-title">{finding.title}</div>
      <div className="tx-ctx-lede">{finding.lede}</div>
      <button className="tx-ctx-open">Open in reader <Icon name="arrow-right" size={12}/></button>
    </div>
  );
}

function TickerContextCard({ symbol, onOpen }) {
  const t = window.TICKERS[symbol];
  if (!t) return null;
  const up = t.deltaPct >= 0;
  return (
    <div className="tx-ctx-card tx-ctx-ticker" onClick={onOpen} role="link" tabIndex="0">
      <div className="tx-ctx-tk-row">
        <div>
          <div className="tx-ctx-tk-sym">{symbol}</div>
          <div className="tx-ctx-tk-name">{t.name}</div>
        </div>
        <div className="tx-ctx-tk-pricecol">
          <div className="tx-ctx-tk-price">${t.price.toFixed(2)}</div>
          <div className={'tx-ctx-tk-d ' + (up ? 'up' : 'down')}>{up ? '+' : ''}{t.deltaPct.toFixed(2)}%</div>
        </div>
      </div>
      <div style={{ color: up ? 'var(--tag-emerald-ink)' : 'var(--tag-crimson-ink)', margin: '6px -2px 4px' }}>
        <Sparkline data={t.spark} width={252} height={36} stroke="currentColor" fill="currentColor" />
      </div>
      <button className="tx-ctx-open">Open {symbol} page <Icon name="arrow-right" size={12}/></button>
    </div>
  );
}

function PersonContextCard({ handle, onOpen }) {
  const key = (handle || '').replace(/^@/, '').toLowerCase();
  const p = window.PEOPLE?.[key];
  if (!p) return null;
  return (
    <div className="tx-ctx-card tx-ctx-person" onClick={onOpen} role="link" tabIndex="0">
      <div className="tx-ctx-pn-row">
        <span className="tx-pn-avatar-lg" aria-hidden="true">{p.initials}</span>
        <div>
          <div className="tx-ctx-pn-name">{p.name}</div>
          <div className="tx-ctx-pn-handle">{p.handle}</div>
          <div className="tx-ctx-pn-role">{p.role}</div>
        </div>
      </div>
      <button className="tx-ctx-open">Open {p.handle} page <Icon name="arrow-right" size={12}/></button>
    </div>
  );
}

function Message({ msg, onAskFollowup }) {
  if (msg.role === 'user') {
    return (
      <div className="tx-msg tx-msg-user">
        <div className="tx-msg-body"><p>{msg.text}</p></div>
      </div>
    );
  }
  return (
    <div className="tx-msg tx-msg-asst">
      <div className="tx-msg-meta">
        <span className="tx-msg-asterism" aria-hidden="true">⁂</span> <span>Thematics, reading across the corpus</span>
      </div>
      <div className="tx-msg-body">
        {msg.blocks.map((b, i) => {
          if (b.kind === 'p')  return <p key={i} className="tx-msg-p"><ProseLine text={b.text}/></p>;
          if (b.kind === 'viz') return <Viz key={i} viz={b.viz}/>;
          if (b.kind === 'list') return (
            <ul key={i} className="tx-msg-list">
              {b.items.map((it, j) => <li key={j}><ProseLine text={it}/></li>)}
            </ul>
          );
          return null;
        })}
        {msg.starters && msg.starters.length > 0 && (
          <div className="tx-msg-starters">
            {msg.starters.map((q, i) => (
              <QuestionChip key={i} onClick={() => onAskFollowup(q)}>{q}</QuestionChip>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function streamAssistant(prompt, chat, context, contextTicker, contextPerson) {
  const a = canonicalAnswer(prompt, context, contextTicker, contextPerson);
  return [{ id: 'a' + Date.now(), role: 'assistant', blocks: a.blocks, starters: a.starters }];
}

function canonicalAnswer(prompt, context, contextTicker, contextPerson) {
  const p = prompt.toLowerCase();
  // Person-context conversations
  if (contextPerson) {
    const person = window.PEOPLE[contextPerson];
    if (p.includes('right about') || p.includes('reliably') || p.includes('track record')) {
      return {
        blocks: [
          { kind: 'p', text: `${person.handle} is most reliably right on the second derivative — the rate of change of growth, not the growth rate itself. The desk has caught two cycle turns from these annotations in the last twelve months.` },
          { kind: 'p', text: `${person.note}` },
        ],
        starters: [
          `Where does ${person.handle} disagree with the desk?`,
          `Summarise this week's posts from ${person.handle}.`,
        ],
      };
    }
    if (p.includes('disagree') || p.includes('contrarian')) {
      return {
        blocks: [
          { kind: 'p', text: `On the desk, two of ${person.handle}'s current calls are non-consensus: a faster-than-modelled deceleration in their primary coverage, and the structural take that the next leg of the cycle is composition rather than amplitude.` },
          { kind: 'p', text: 'Worth reading even when you disagree — the model is transparent and the receipts are public.' },
        ],
        starters: [`Summarise this week's posts from ${person.handle}.`],
      };
    }
    if (p.includes('summarise') || p.includes('summary') || p.includes('this week')) {
      return {
        blocks: [
          { kind: 'p', text: `Three posts from ${person.handle} this week stand out:` },
          { kind: 'list', items: person.posts.map(post => `“${post.text}” — ${post.when}, ${post.eng} reads`) },
          { kind: 'p', text: 'A pattern: each post is a model annotation, not an opinion. That’s why the desk reads them.' },
        ],
        starters: [`Pull related findings to these posts →`],
      };
    }
    return {
      blocks: [
        { kind: 'p', text: `Reading off the ${person.handle} page. ${person.note}` },
        { kind: 'p', text: 'Pull on a thread below, or refine.' },
      ],
      starters: [
        `What is ${person.handle} most reliably right about?`,
        `Summarise this week’s posts from ${person.handle}.`,
      ],
    };
  }

  // Ticker-context conversations
  if (contextTicker) {
    const t = window.TICKERS[contextTicker];
    if (p.includes('bull') || p.includes('strongest') || p.includes('evidence')) {
      return {
        blocks: [
          { kind: 'p', text: `The strongest piece of bull evidence for #${contextTicker} is the one most easily measured. ${t.note}` },
          { kind: 'p', text: 'On the desk, the read that ages best is structural rather than cyclical — the question is whether the position is large enough to ride a multi-quarter compounding versus a re-rate.' },
        ],
        starters: [
          `Which peers de-rate first if ${contextTicker} misses?`,
          `What\u2019s the bear case for ${contextTicker}?`,
        ],
      };
    }
    if (p.includes('peer') || p.includes('compare') || p.includes('sector')) {
      return {
        blocks: [
          { kind: 'p', text: `Inside ${t.sector}, the cleanest comp set is two or three names with the same revenue exposure but a different gross-margin profile.` },
          { kind: 'viz', viz: { type:'bars-row', title: `${contextTicker} vs peer set, multiples`, series: [parseFloat(t.pe) || 24, 22, 28, 31], labels: [contextTicker, 'Peer A', 'Peer B', 'Peer C'], hue: 'ocean', source:'Desk model' }},
          { kind: 'p', text: `${contextTicker} trades at a premium that the desk can defend or fade depending on the next earnings print — the relative-value pair is the cleaner expression of the view than the outright.` },
        ],
        starters: [`What does the chart look like at half multiple?`],
      };
    }
    return {
      blocks: [
        { kind: 'p', text: `Reading off the ${contextTicker} page. ${t.note}` },
        { kind: 'p', text: 'There\u2019s a longer answer here than the input asks for — pull on a thread below or refine.' },
      ],
      starters: [
        `What\u2019s the strongest evidence in the bull case for ${contextTicker}?`,
        `Which peers de-rate first if ${contextTicker} misses?`,
      ],
    };
  }

  if (p.includes('sector') || p.includes('cross') || (p.includes('what') && !context)) {
    return {
      blocks: [
        { kind: 'p', text: 'Three findings on the desk this morning move the needle most. The first sits in #NVDA — the data-center growth curve has bent twice. The second is the end of QT and what replaces it; the operating bias is now a slow re-expansion of the Fed balance sheet. The third is the consumer signal: bottom-decile credit-card delinquencies have crossed 2009 levels.' },
        { kind: 'viz', viz: { type:'metric-row', items: [
          { label: 'High-confidence findings', value: '3', caption: 'this morning' },
          { label: 'Median time to read',       value: '8m', caption: 'across the queue' },
          { label: 'Tickers in play',           value: '12', caption: 'across the three' },
        ]}},
        { kind: 'p', text: 'A coherent cross-finding read is that the macro impulse is rolling over even as the AI capex cycle accelerates — a divergence the market has not yet had to price.' },
      ],
      starters: [
        'How would I express the divergence as a single trade?',
        'Which of the three is most actionable in the next two weeks?',
      ],
    };
  }
  if (context) {
    return {
      blocks: [
        { kind: 'p', text: 'Reading off the loaded article. The core claim is that #NVDA data-center growth is decelerating faster than the buy-side expects. The strongest piece of evidence is the published yoy print: 94% last quarter, down from a peak of 162% three quarters back.' },
        { kind: 'viz', viz: { type: 'sparkline-band', title: 'Nvidia data-center revenue, year-on-year growth', series: [134, 154, 162, 141, 122, 109, 94], labels: ['Q1','Q2','Q3','Q4','Q1','Q2','Q3'], unit:'%', source: 'Nvidia quarterly filings' } },
        { kind: 'p', text: "The article's base case (58% in mid-FY27) sits 54 points below the street median. The asymmetry favours the short side, but the right expression is the relative-value pair (long ASIC / short NVDA) rather than the outright fade." },
      ],
      starters: [
        'What is the 2018 cycle base rate for this?',
        'Which suppliers de-rate first if NVDA misses?',
        'Pair-trade sizing notes →',
      ],
    };
  }
  return {
    blocks: [
      { kind: 'p', text: "There's an answer here that takes more than one paragraph. Pull on whichever of the threads below moves your read forward, or refine the question in the input." },
    ],
    starters: [
      'Show me the strongest finding this morning',
      "What's contentious on the desk right now?",
    ],
  };
}

Object.assign(window, { SurfaceChat, canonicalAnswer, streamAssistant });
