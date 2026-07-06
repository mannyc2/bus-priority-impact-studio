// Thematics v2 — Broadsheet article.
// Reading column with drop cap + margin pull-quote + footnoted sources.

const { useState: useV2Ar_useState } = React;

function SurfaceBroadsheet({ finding, onBack, onOpenChat, onSeedChat, onOpenSpotlight }) {
  const theme = window.THEMES.find(t => t.id === finding.themeId);
  const [openStarter, setOpenStarter] = useV2Ar_useState(null);

  // Choose one paragraph from the body to render as a pull-quote.
  const pull = pickPullQuote(finding);

  return (
    <div className="bs-layout">
      <a className="bs-back" onClick={onBack}>← The front page</a>

      <article className="bs-article">
        <header className="bs-head">
          <div className="bs-kicker">
            <span className="bs-kicker-dot" style={{ background: `var(--tag-${theme.hue}-ink)` }} />
            <span>{theme.name} · finding</span>
          </div>
          <h1 className="bs-title">{finding.title}</h1>
          <p className="bs-deck">{finding.lede}</p>
          <p className="bs-byline">By <em>{finding.contributor}</em> · Filed {finding.publishedAt} · Confidence <em>{finding.confidence}</em></p>
        </header>

        <div className="bs-body">
          {finding.body.map((block, i) => {
            if (block.kind === 'p') {
              const isPullSource = pull && pull.index === i;
              return (
                <React.Fragment key={i}>
                  <p><ProseLine text={block.text} /></p>
                  {isPullSource && (
                    <div className="bs-pullquote" aria-hidden="true">
                      “{pull.text}”
                      <div className="bs-pullquote-attr">From this finding.</div>
                    </div>
                  )}
                </React.Fragment>
              );
            }
            if (block.kind === 'viz' || block.kind === 'metric') {
              return (
                <figure key={i} className="bs-viz" style={{ margin: '30px 0' }}>
                  <Viz viz={block.viz} />
                </figure>
              );
            }
            return null;
          })}
        </div>

        {/* Conversation starters */}
        <section className="bs-thread">
          <h3 className="bs-thread-label">Pull on a thread —</h3>
          <div className="bs-thread-list">
            {finding.starters.map((q, i) => (
              <button key={i} className="bs-thread-q"
                onClick={() => setOpenStarter(openStarter === i ? null : i)}>
                <span className="bs-thread-q-text">{q}</span>
                <span className="bs-thread-q-arrow">{openStarter === i ? '×' : 'read →'}</span>
              </button>
            ))}
          </div>
          {openStarter !== null && (
            <div className="bs-thread-answer">
              <p><ProseLine text={window.inlineAnswerFor
                ? window.inlineAnswerFor(finding.starters[openStarter], finding)
                : 'A short answer would summarise the relevant evidence and cite the underlying data.'}/></p>
              <button className="bs-thread-open" onClick={() => onSeedChat(finding.id, finding.starters[openStarter])}>
                Open this in a full thread →
              </button>
            </div>
          )}
        </section>

        {/* Footnoted sources */}
        {finding.sources.length > 0 && (
          <section className="bs-foot">
            <div className="bs-foot-label">Sources</div>
            <ol className="bs-foot-list">
              {finding.sources.map(s => (
                <li key={s.id} className="bs-foot-item">
                  <div>
                    <span className="bs-foot-pub">{s.publisher}</span>
                    {s.title && (<>, <span className="bs-foot-title">{s.title}</span></>)}
                    {s.quote && <span className="bs-foot-quote">“{s.quote}”</span>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        <div style={{ marginTop: 36 }}>
          <button onClick={() => onOpenSpotlight(finding)}
                  style={{ font: 'italic 500 14px var(--font-serif)', color: 'var(--primary)', cursor: 'pointer' }}>
            Or open a free-form question → ⌘ K
          </button>
        </div>
      </article>

      {/* Margin rail — mentioned tickers + related signals */}
      <aside className="bs-margin">
        {finding.mentions.length > 0 && (
          <section className="bs-margin-section">
            <div className="bs-margin-label">Names mentioned</div>
            {finding.mentions.map(sym => {
              const t = window.TICKERS[sym];
              if (!t) return null;
              const up = t.deltaPct >= 0;
              return (
                <div key={sym} className="bs-margin-row"
                     onClick={() => window.foNav?.openTicker?.(sym)}>
                  <div>
                    <span className="bs-margin-row-sym">{sym}</span>
                    <div className="bs-margin-row-name">{t.name}</div>
                  </div>
                  <div>
                    <div className="bs-margin-row-price">${t.price.toFixed(2)}</div>
                    <div className={'bs-margin-row-d ' + (up ? 'up' : 'down')}>
                      {up ? '+' : ''}{t.deltaPct.toFixed(2)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {finding.relatedSignals.length > 0 && (
          <section className="bs-margin-section">
            <div className="bs-margin-label">Adjacent signals</div>
            {finding.relatedSignals.map(s => (
              <div key={s.id} className="bs-margin-signal">
                <ConfidencePip level={s.confidence} />
                <span>{s.label}</span>
              </div>
            ))}
          </section>
        )}

        <section className="bs-margin-section">
          <div className="bs-margin-label">In this fold</div>
          <div style={{ font: 'italic 400 13px/1.5 var(--font-serif)', color: 'var(--muted-foreground)' }}>
            Pull this finding to your desk to keep it visible across sessions — the asterism mark in the masthead opens the drawer.
          </div>
        </section>
      </aside>
    </div>
  );
}

// Choose the paragraph to elevate into a pull-quote. Prefer one with a
// punchy short sentence in the middle of the article.
function pickPullQuote(finding) {
  const proseBlocks = finding.body.map((b, i) => ({ b, i })).filter(({ b }) => b.kind === 'p');
  if (proseBlocks.length < 2) return null;
  // Take the second prose block; clamp to first short sentence
  const { b, i } = proseBlocks[Math.min(1, proseBlocks.length - 1)];
  const sentences = b.text.split(/(?<=[.])\s+/).map(s => s.replace(/[#@](\w+)/g, '$1'));
  const pick = sentences.find(s => s.length > 40 && s.length < 180) || sentences[0];
  return { text: pick, index: i };
}

Object.assign(window, { SurfaceBroadsheet });
