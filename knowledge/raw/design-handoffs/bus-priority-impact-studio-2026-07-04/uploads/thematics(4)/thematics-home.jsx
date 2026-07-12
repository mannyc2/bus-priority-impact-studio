// Thematics — Home surface.
// Editorial feed: lead story up top, then findings grouped by theme.
// No filter chrome; the ⌘K spotlight is the way you slice the feed.

const { useState: useHomeState, useMemo: useHomeMemo } = React;

function SurfaceHome({ onOpenArticle }) {
  const findings = window.FINDINGS;
  const themes = window.THEMES;

  // Featured finding at top — the freshest, highest-confidence one.
  const featured = findings[0];

  // Group remaining findings by theme. Preserve THEMES order.
  const byTheme = useHomeMemo(() => {
    const used = new Set([featured.id]);
    const map = {};
    findings.forEach(f => {
      if (used.has(f.id)) return;
      (map[f.themeId] ||= []).push(f);
    });
    return map;
  }, [findings, featured.id]);

  return (
    <div className="tx-home">
      <div className="tx-home-head">
        <h1 className="tx-home-title">What the desk is reading.</h1>
        <p className="tx-home-sub">A morning's worth of findings, organised by theme. Pull on any one — or press <kbd className="tx-spot-kbd">⌘ K</kbd> to ask the desk for the cross-section.</p>
      </div>

      <FeaturedCard finding={featured} onOpen={() => onOpenArticle(featured.id)} />

      {themes.map(theme => {
        const list = byTheme[theme.id];
        if (!list || list.length === 0) return null;
        return (
          <ThemeSection key={theme.id} theme={theme} findings={list} onOpenArticle={onOpenArticle} />
        );
      })}
    </div>
  );
}

function ThemeSection({ theme, findings, onOpenArticle }) {
  return (
    <section className="tx-home-section">
      <header className="tx-home-section-head">
        <div className="tx-home-section-name">
          <span className="tx-home-section-dot" style={{ background: `var(--tag-${theme.hue}-ink)` }} />
          <span>{theme.name}</span>
          <span className="tx-home-section-count">{findings.length}</span>
        </div>
        <div className="tx-home-section-blurb">{theme.blurb}</div>
      </header>
      <div className="tx-home-grid">
        {findings.map(f => (
          <FindingCard key={f.id} finding={f} onOpen={() => onOpenArticle(f.id)} />
        ))}
      </div>
    </section>
  );
}

function FeaturedCard({ finding, onOpen }) {
  const theme = window.THEMES.find(t => t.id === finding.themeId);
  return (
    <article className="tx-card tx-card-featured" onClick={onOpen} role="link" tabIndex="0" onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <div className="tx-card-cover-wrap">
        <FindingCover cover={finding.cover} theme={theme} height={300} />
      </div>
      <div className="tx-card-body">
        <Chip hue={theme.hue}>{theme.name}</Chip>
        <h2 className="tx-card-featured-title">{finding.title}</h2>
        <p className="tx-card-lede">{finding.lede}</p>
        <p className="tx-card-byline">{finding.contributor}. {finding.publishedAt}.</p>
      </div>
    </article>
  );
}

function FindingCard({ finding, onOpen }) {
  const theme = window.THEMES.find(t => t.id === finding.themeId);
  return (
    <article className="tx-card" onClick={onOpen} role="link" tabIndex="0" onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <div className="tx-card-cover-wrap">
        <FindingCover cover={finding.cover} theme={theme} height={180} />
      </div>
      <div className="tx-card-body">
        <h3 className="tx-card-title">{finding.title}</h3>
        <p className="tx-card-lede">{finding.lede}</p>
        <p className="tx-card-byline">{finding.contributor}. {finding.publishedAt}.</p>
      </div>
    </article>
  );
}

Object.assign(window, { SurfaceHome });
