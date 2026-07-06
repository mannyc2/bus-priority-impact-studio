// Thematics v2 — "The Folio" home surface.
// Typeset broadsheet. Lead spread + below-the-fold sections + wires strip.

const { useMemo: useV2Ho_useMemo } = React;

function SurfaceFolio({ onOpenArticle, sectionFilter, tweaks }) {
  const findings = window.FINDINGS;
  const themes = window.THEMES;

  // The lead spread.
  const lead = findings[0];
  const ofNote = findings.slice(1, 4);

  // Below the fold — group remaining by theme.
  const usedIds = new Set([lead.id, ...ofNote.map(f => f.id)]);
  const byTheme = useV2Ho_useMemo(() => {
    const map = {};
    findings.forEach(f => {
      if (usedIds.has(f.id)) return;
      (map[f.themeId] ||= []).push(f);
    });
    return map;
  }, [findings]);

  // Section filter
  if (sectionFilter && sectionFilter !== 'front' && sectionFilter !== 'people') {
    const theme = themes.find(t => t.id === sectionFilter);
    const all = findings.filter(f => f.themeId === sectionFilter);
    if (theme && all.length) {
      return (
        <main className="fo-folio">
          <FolioSection theme={theme} findings={all} onOpenArticle={onOpenArticle} headline />
          <div className="fo-asterism" aria-hidden="true">⁂</div>
          <BackToFront />
        </main>
      );
    }
  }
  if (sectionFilter === 'people') {
    return (
      <main className="fo-folio">
        <FolioDesk />
        <div className="fo-asterism" aria-hidden="true">⁂</div>
        <BackToFront />
      </main>
    );
  }

  return (
    <main className="fo-folio">
      <LeadSpread lead={lead} ofNote={ofNote} onOpenArticle={onOpenArticle} tweaks={tweaks} />

      <div className="fo-fold-mark" aria-hidden="true">
        <span>The fold</span>
      </div>

      {themes.map(theme => {
        const list = byTheme[theme.id];
        if (!list || list.length === 0) return null;
        return <FolioSection key={theme.id} theme={theme} findings={list} onOpenArticle={onOpenArticle} />;
      })}

      {tweaks.wires === 'on' && <WiresStrip findings={findings} />}

      <div className="fo-asterism" aria-hidden="true">⁂</div>
      <div className="fo-colophon">
        Thematics · Tuesday closing edition · Printed for the desk
      </div>
    </main>
  );
}

function BackToFront() {
  return (
    <div style={{ textAlign: 'center', marginTop: 24 }}>
      <a onClick={() => window.foNav?.section?.('front')}
         style={{ font: 'italic 500 14px var(--font-serif)', color: 'var(--primary)', cursor: 'pointer' }}>
        ← Back to the front page
      </a>
    </div>
  );
}

function LeadSpread({ lead, ofNote, onOpenArticle, tweaks }) {
  const theme = window.THEMES.find(t => t.id === lead.themeId);
  return (
    <section className="fo-lead">
      <div className="fo-lead-main">
        <div className="fo-kicker">
          <span className="fo-kicker-dot" style={{ background: `var(--tag-${theme.hue}-ink)` }} />
          <span>{theme.name} · the lead</span>
        </div>
        <h1 className="fo-lead-title" onClick={() => onOpenArticle(lead.id)} style={{ cursor: 'pointer' }}>
          {lead.title}
        </h1>
        <p className="fo-lede" style={{ font: 'italic 400 22px/1.42 var(--font-serif)', color: 'color-mix(in oklab, var(--foreground) 78%, transparent)', margin: '0 0 18px', maxWidth: '56ch' }}>
          {lead.lede}
        </p>
        <p className="fo-byline">
          By <em>{lead.contributor}</em> · {lead.publishedAt}
        </p>

        <div className="fo-lead-excerpt">
          {excerptParagraphs(lead, 2).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        <a className="fo-readon" onClick={() => onOpenArticle(lead.id)}>
          Read the full finding →
        </a>
      </div>

      <div className="fo-lead-aside">
        <div className="fo-aside-flag">Of note this morning</div>
        <div className="fo-aside-items">
          {ofNote.map(f => {
            const t = window.THEMES.find(x => x.id === f.themeId);
            return (
              <article key={f.id} className="fo-aside-item" onClick={() => onOpenArticle(f.id)}>
                <div className="fo-kicker">
                  <span className="fo-kicker-dot" style={{ background: `var(--tag-${t.hue}-ink)` }} />
                  <span>{t.name}</span>
                </div>
                <h3 className="fo-aside-title">{f.title}</h3>
                <p className="fo-aside-deck">{f.lede}</p>
                <p className="fo-byline">By <em>{f.contributor}</em></p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FolioSection({ theme, findings, onOpenArticle, headline = false }) {
  return (
    <section className="fo-section">
      <header className="fo-section-flag">
        <div className="fo-section-flag-name">
          <span className="fo-section-flag-dot" style={{ background: `var(--tag-${theme.hue}-ink)` }} />
          <span>{theme.name}</span>
        </div>
        <div className="fo-section-flag-blurb">{theme.blurb}</div>
      </header>

      {headline && findings[0] && (
        <article style={{ marginBottom: 28, paddingBottom: 28, borderBottom: '1px solid var(--border)' }}
                 onClick={() => onOpenArticle(findings[0].id)}>
          <h2 className="fo-section-title"
              style={{ font: '600 36px/1.1 var(--font-serif)', letterSpacing: '-0.018em', margin: '0 0 12px', cursor: 'pointer' }}>
            {findings[0].title}
          </h2>
          <p className="fo-section-deck" style={{ fontSize: 17 }}>{findings[0].lede}</p>
          <p className="fo-byline">By <em>{findings[0].contributor}</em> · {findings[0].publishedAt}</p>
        </article>
      )}

      <div className="fo-section-grid">
        {(headline ? findings.slice(1) : findings).map(f => (
          <article key={f.id} className="fo-section-item" onClick={() => onOpenArticle(f.id)}>
            <h3 className="fo-section-title">{f.title}</h3>
            <p className="fo-section-deck">{f.lede}</p>
            <p className="fo-byline">By <em>{f.contributor}</em> · {f.publishedAt}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function FolioDesk() {
  const people = Object.entries(window.PEOPLE);
  return (
    <section className="fo-section">
      <header className="fo-section-flag">
        <div className="fo-section-flag-name">
          <span className="fo-section-flag-dot" style={{ background: 'var(--foreground)' }} />
          <span>The desk reads</span>
        </div>
        <div className="fo-section-flag-blurb">Six authors the desk reads first, in their own voice.</div>
      </header>

      <div className="fo-section-grid">
        {people.map(([key, p]) => (
          <article key={key} className="fo-section-item"
                   onClick={() => window.foNav?.openPerson?.(key)}>
            <div className="fo-kicker">
              <span className="fo-kicker-dot" style={{ background: 'var(--ramp-violet-800)' }} />
              <span>{p.role}</span>
            </div>
            <h3 className="fo-section-title">{p.name}</h3>
            <p className="fo-section-deck">{p.note}</p>
            <p className="fo-byline">{p.handle} · {p.followers} readers · {p.postsWeek} this week</p>
          </article>
        ))}
      </div>
    </section>
  );
}

// One-line wire briefs — pulled from related signals across findings.
function WiresStrip({ findings }) {
  const wires = useV2Ho_useMemo(() => {
    const list = [];
    findings.forEach(f => {
      const theme = window.THEMES.find(t => t.id === f.themeId);
      (f.relatedSignals || []).forEach(s => {
        list.push({
          time: themeTimecode(theme.id, list.length),
          conf: s.confidence,
          text: s.label,
          themeId: f.themeId,
          findingId: f.id,
        });
      });
    });
    return list.slice(0, 9);
  }, [findings]);

  if (wires.length === 0) return null;

  return (
    <section className="fo-wires">
      <div className="fo-wires-head">From the wires — desk-side, today</div>
      <div className="fo-wires-grid">
        {wires.map((w, i) => (
          <div key={i} className="fo-wire">
            <span className="fo-wire-time">{w.time}</span>
            <span className="fo-wire-conf"><ConfidencePip level={w.conf} /></span>
            <span className="fo-wire-text">{w.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function themeTimecode(themeId, i) {
  // Slightly varied hh:mm stamps so wires feel real.
  const seed = (themeId.charCodeAt(0) + i * 17) % 6;
  const hours = ['06:14','07:32','08:47','09:18','10:05','11:42','13:08','14:21','15:36'];
  return hours[(seed + i) % hours.length];
}

// Build a short excerpt for the lead. Pulls first N prose paragraphs from the
// finding body, falling back to lede repeats if necessary.
function excerptParagraphs(finding, n) {
  const paras = (finding.body || []).filter(b => b.kind === 'p').map(b => b.text);
  if (paras.length >= n) return paras.slice(0, n).map(stripTags);
  return paras.map(stripTags).concat(Array(Math.max(0, n - paras.length)).fill(finding.lede));
}
function stripTags(s) {
  return (s || '').replace(/#([A-Z]{1,5})/g, '$1').replace(/@([A-Za-z0-9_]{2,32})/g, '$1');
}

Object.assign(window, { SurfaceFolio });
