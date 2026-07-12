// Thematics — Person surface.
// One page per popular X account: avatar, name, handle, role; Pin / Follow buttons;
// engagement sparkline; recent posts; findings that cite this account; conversation starters.

const { useState: usePn_useState, useMemo: usePn_useMemo } = React;

function SurfacePerson({ handle, pinned, onTogglePin, onOpenArticle, onAskAbout }) {
  const key = (handle || '').replace(/^@/, '').toLowerCase();
  const p = window.PEOPLE?.[key];
  if (!p) return <div style={{ padding: 40 }}>Unknown handle.</div>;

  // Findings whose prose mentions this person (best-effort scan)
  const related = usePn_useMemo(() => {
    const mark = '@' + key;
    return window.FINDINGS.filter(f =>
      f.body?.some(b => b.kind === 'p' && b.text.toLowerCase().includes(mark)));
  }, [key]);

  const isPinned = pinned.includes(key);

  return (
    <div className="tx-ticker-page tx-person-page">

      <header className="tx-tk-head-section">
        <div className="tx-tk-head-row">
          <div className="tx-pn-id-big">
            <span className="tx-pn-avatar-xl" aria-hidden="true">{p.initials}</span>
            <div>
              <div className="tx-pn-name-big">{p.name}</div>
              <div className="tx-pn-handle-big">{p.handle}</div>
              <div className="tx-tk-sub">{p.role}</div>
            </div>
          </div>
          <div className="tx-tk-actions">
            <button className={'tx-tk-btn ' + (isPinned ? 'on' : '')} onClick={() => onTogglePin(key)}>
              <Icon name="bookmark" size={14}/>
              {isPinned ? 'Pinned' : 'Pin'}
            </button>
            <button className="tx-tk-btn">
              <Icon name="bell" size={14}/>
              Notify
            </button>
          </div>
        </div>

        <div className="tx-pn-stats-row">
          <div><div className="k">Followers</div><div className="v">{p.followers}</div></div>
          <div><div className="k">Posts this week</div><div className="v">{p.postsWeek}</div></div>
          <div><div className="k">Focus</div><div className="v">
            {p.focus.map(fid => {
              const theme = window.THEMES.find(t => t.id === fid);
              return theme ? <Chip key={fid} hue={theme.hue}>{theme.name}</Chip> : null;
            })}
          </div></div>
        </div>

        <div className="tx-pn-chart">
          <div className="tx-pn-chart-label">Engagement, last fifteen posts</div>
          <div style={{ color: 'var(--tag-violet-ink)' }}>
            <Sparkline data={p.spark} width={720} height={120} stroke="currentColor" fill="currentColor"/>
          </div>
        </div>
      </header>

      <section className="tx-tk-note">
        <div className="tx-tk-note-eyebrow">Desk note</div>
        <p>{p.note.split(/(#[A-Z]{1,5}|@[A-Za-z0-9_]+)/).map((seg, i) => {
          if (seg.startsWith('#')) return <TickerInline key={i} symbol={seg.slice(1)} />;
          if (seg.startsWith('@')) return <PersonInline key={i} handle={seg.slice(1)} />;
          return <React.Fragment key={i}>{seg}</React.Fragment>;
        })}</p>
      </section>

      {/* Recent posts */}
      <section className="tx-pn-posts">
        <h2 className="tx-tk-h2">Recent posts</h2>
        <div className="tx-pn-posts-list">
          {p.posts.map((post, i) => (
            <article className="tx-pn-post" key={i}>
              <div className="tx-pn-post-head">
                <span className="tx-pn-avatar" aria-hidden="true">{p.initials}</span>
                <div>
                  <div className="tx-pn-post-name">{p.name}</div>
                  <div className="tx-pn-post-handle">{p.handle} · {post.when}</div>
                </div>
              </div>
              <p className="tx-pn-post-text">{post.text.split(/(#[A-Z]{1,5}|@[A-Za-z0-9_]+)/).map((seg, j) => {
                if (seg.startsWith('#')) return <TickerInline key={j} symbol={seg.slice(1)} />;
                if (seg.startsWith('@')) return <PersonInline key={j} handle={seg.slice(1)} />;
                return <React.Fragment key={j}>{seg}</React.Fragment>;
              })}</p>
              <div className="tx-pn-post-eng">{post.eng} reads</div>
            </article>
          ))}
        </div>
      </section>

      {related.length > 0 && (
        <section className="tx-tk-related">
          <h2 className="tx-tk-h2">Cited in findings</h2>
          <div className="tx-tk-rel-list">
            {related.map(f => {
              const theme = window.THEMES.find(t => t.id === f.themeId);
              return (
                <button key={f.id} className="tx-tk-rel-row" onClick={() => onOpenArticle(f.id)}>
                  <div className="tx-tk-rel-cover"><FindingCover cover={f.cover} theme={theme} height={88}/></div>
                  <div className="tx-tk-rel-body">
                    <div className="tx-tk-rel-chip"><Chip hue={theme.hue}>{theme.name}</Chip></div>
                    <div className="tx-tk-rel-title">{f.title}</div>
                    <div className="tx-tk-rel-byline">{f.contributor}. {f.publishedAt}.</div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="tx-tk-starters">
        <h2 className="tx-tk-h2">Pull on a thread</h2>
        <div className="tx-tk-starters-list">
          <QuestionChip onClick={() => onAskAbout(`What is ${p.handle} most reliably right about?`)}>What is {p.handle} most reliably right about?</QuestionChip>
          <QuestionChip onClick={() => onAskAbout(`Where does ${p.handle} disagree with the desk consensus right now?`)}>Where does {p.handle} disagree with the desk consensus right now?</QuestionChip>
          <QuestionChip onClick={() => onAskAbout(`Summarise this week\u2019s posts from ${p.handle}.`)}>Summarise this week's posts from {p.handle}.</QuestionChip>
        </div>
      </section>

    </div>
  );
}

Object.assign(window, { SurfacePerson });
