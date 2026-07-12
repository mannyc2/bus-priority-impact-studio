// Shared visual system for the Bus Priority Impact Studio explorations.
// Type, color, route badges, small data viz, and tiny SVG glyphs.
// Exposed on window so other Babel-transpiled files can read them.

const BPI = {
  // Surfaces — four-tier warm white hierarchy.
  // canvas (#f0eee9) → paper → card → cardRaised
  // Each tier is ~3–4% lighter with consistent warm undertone (hue ~75).
  // Cold #ffffff is never used as a surface; it's reserved for semantic
  // whites only (SBS pill outline, map stop dots).
  paper:      '#f4f1ea',
  paperDeep:  '#ece7db',
  card:       'oklch(0.99 0.007 75)',   // ≈ #fdfcf8 — primary elevated surface
  cardRaised: 'oklch(0.995 0.004 75)', // ≈ #fefef9 — highest elevation (modals, popovers)
  ink:       '#16140f',
  ink70:     'rgba(22,20,15,.70)',
  ink55:     'rgba(22,20,15,.55)',
  ink40:     'rgba(22,20,15,.40)',
  ink20:     'rgba(22,20,15,.20)',
  ink10:     'rgba(22,20,15,.10)',
  ink06:     'rgba(22,20,15,.06)',
  rule:      'rgba(22,20,15,.14)',
  // Civic accent — single deep blue used sparingly
  accent:    'oklch(0.42 0.13 252)',
  accentBg:  'oklch(0.95 0.04 252)',
  // Status hues
  bad:       'oklch(0.52 0.16 28)',
  badBg:     'oklch(0.95 0.05 28)',
  warn:      'oklch(0.65 0.13 70)',
  warnBg:    'oklch(0.96 0.05 80)',
  good:      'oklch(0.55 0.12 155)',
  goodBg:    'oklch(0.95 0.04 155)',
  // Borough route colors — the public MTA convention; redrawn in our own
  // shape language (rounded rect, our type).
  bx: {
    manhattan: '#0039A6', // blue
    bronx:     '#EE352E', // red
    brooklyn:  '#6CBE45', // local Brooklyn uses brown traditionally but
                          // we'll use a warm earth — see below
    queens:    '#FF6319', // orange
    si:        '#6E4C9F', // purple
    express:   '#00933C', // green
    sbsAccent: '#0039A6',
  },
};
// Use the canonical Brooklyn brown:
BPI.bx.brooklyn = '#6E3219';
// Express green stripe color for express buses

const BPIFonts = `
  'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', sans-serif
`;
const BPIMono = `
  'SF Mono', ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace
`;

// One-time global CSS for the studio
if (typeof document !== 'undefined' && !document.getElementById('bpi-styles')) {
  const s = document.createElement('style');
  s.id = 'bpi-styles';
  s.textContent = `
    .bpi { font-family: ${BPIFonts}; color: ${BPI.ink}; background: ${BPI.paper}; }
    .bpi, .bpi * { box-sizing: border-box; }
    .bpi .num { font-variant-numeric: tabular-nums; }
    .bpi .mono { font-family: ${BPIMono}; font-variant-numeric: tabular-nums; }
    .bpi .eyebrow {
      font-size: 11.5px; font-weight: 600;
      color: ${BPI.ink70};
      letter-spacing: -0.003em;
    }
    .bpi .rule { height: 1px; background: ${BPI.rule}; }
    .bpi .hairline { box-shadow: inset 0 -1px 0 ${BPI.rule}; }
    .bpi sup.cite {
      font-size: 0.62em; font-weight: 600; color: ${BPI.accent};
      vertical-align: super; line-height: 0; margin-left: 1px;
      cursor: help;
    }
    .bpi .chip {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 7px; border-radius: 3px;
      font-size: 11px; font-weight: 500;
      background: ${BPI.ink06}; color: ${BPI.ink70};
      letter-spacing: 0.02em;
    }
    .bpi .chip.bad   { background: ${BPI.badBg};  color: ${BPI.bad};  }
    .bpi .chip.warn  { background: ${BPI.warnBg}; color: ${BPI.warn}; }
    .bpi .chip.good  { background: ${BPI.goodBg}; color: ${BPI.good}; }
    .bpi .chip.accent{ background: ${BPI.accentBg}; color: ${BPI.accent}; }
    .bpi button.txt {
      background: none; border: none; padding: 0; cursor: pointer;
      font-family: inherit; color: inherit; font: inherit;
    }
  `;
  document.head.appendChild(s);
}

// ─────────────────────────────────────────────────────────────
// StudioMark — the studio's logo. A bus front silhouette inside a rounded
// ink square, with a single accent priority stripe. Designed legible at
// 18–32px; for larger placements scale via the `size` prop.
// ─────────────────────────────────────────────────────────────
function StudioMark({ size = 22, tone = 'dark' }) {
  // tone: 'dark' (ink bg, paper bus) for light surfaces;
  //       'light' (paper bg, ink bus) for dark surfaces (rare)
  const bg = tone === 'dark' ? BPI.ink : BPI.paper;
  const fg = tone === 'dark' ? BPI.paper : BPI.ink;
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" style={{ display: 'block', flexShrink: 0 }}>
      <rect width="22" height="22" rx="3.5" fill={bg} />
      {/* Bus body */}
      <rect x="4" y="4.5" width="14" height="13" rx="1.8" fill={fg} />
      {/* Windows */}
      <rect x="5.5" y="6.5"  width="4"   height="3" rx="0.6" fill={bg} />
      <rect x="12.5" y="6.5" width="4"   height="3" rx="0.6" fill={bg} />
      {/* Mid divider line */}
      <rect x="4" y="11.5"   width="14"  height="0.6" fill={bg} opacity="0.35" />
      {/* Priority stripe — accent */}
      <rect x="4" y="14.5"   width="14"  height="1.6" fill={BPI.accent} />
      {/* Wheels */}
      <rect x="5.5"  y="17.4" width="2.6" height="1.4" rx="0.5" fill={fg} />
      <rect x="13.9" y="17.4" width="2.6" height="1.4" rx="0.5" fill={fg} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Route badge — rounded rect, borough-colored. Our own shape & type.
// ─────────────────────────────────────────────────────────────
// Width is bucketed by character count so all same-length route codes
// share a fixed width within each size tier. Eliminates the content-driven
// width variation that made M15, Bx12, M101 each a different size.
// SBS pill uses the same font size as the badge (no separate sbsFs scale)
// and a fixed width matching the 3ch bucket. tabular-nums on all badges.
const BADGE_SIZES = {
  //       h    fs     gap  r   w:[2ch, 3ch, 4ch, 5ch+]   sbsW (= 3ch bucket)
  sm: { h: 18, fs: 10.5, gap: 3, r: 3, w: [24, 32, 40,  50], sbsW: 32 },
  md: { h: 22, fs: 12.5, gap: 4, r: 3, w: [30, 40, 50,  62], sbsW: 40 },
  lg: { h: 28, fs: 15,   gap: 5, r: 3, w: [38, 51, 64,  79], sbsW: 51 },
  xl: { h: 36, fs: 19,   gap: 6, r: 4, w: [48, 65, 81, 100], sbsW: 65 },
};
function badgeWidth(sz, charCount) {
  if (charCount <= 2) return sz.w[0];
  if (charCount === 3) return sz.w[1];
  if (charCount === 4) return sz.w[2];
  return sz.w[3];
}
function RouteBadge({ route, size = 'md', sbs = false, express = false }) {
  const sz = BADGE_SIZES[size] || BADGE_SIZES.md;
  // Infer borough from route prefix — longer prefixes matched first
  const m = String(route).match(/^(BxM|BM|QM|Bx|SI|M|B|Q|S|X)/);
  const prefix = m ? m[1] : 'M';
  const bxMap = {
    M: BPI.bx.manhattan, Bx: BPI.bx.bronx, B: BPI.bx.brooklyn,
    Q: BPI.bx.queens, SI: BPI.bx.si, S: BPI.bx.si,
    X: BPI.bx.express, BM: BPI.bx.express, BxM: BPI.bx.express, QM: BPI.bx.express,
  };
  const bg = express ? BPI.bx.express : bxMap[prefix] || BPI.bx.manhattan;
  const shared = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    height: sz.h, borderRadius: sz.r, fontFamily: BPIFonts,
    fontWeight: 700, fontSize: sz.fs, letterSpacing: '0.01em',
    lineHeight: 1, fontVariantNumeric: 'tabular-nums',
    boxSizing: 'border-box',
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: sz.gap, verticalAlign: 'middle' }}>
      <span style={{ ...shared, width: badgeWidth(sz, String(route).length), background: bg, color: '#fff' }}>
        {route}
      </span>
      {sbs && (
        <span style={{ ...shared, width: sz.sbsW, background: '#fff', color: bg, border: `1.5px solid ${bg}`, letterSpacing: '0.06em' }}>
          SBS
        </span>
      )}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Studio top bar — shared across every screen
// ─────────────────────────────────────────────────────────────
function StudioBar({ active, breadcrumb }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 32,
      padding: '14px 28px', background: BPI.card,
      boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <StudioMark size={22} />
        <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>
          Bus Priority <span style={{ color: BPI.ink55, fontWeight: 400 }}>Impact Studio</span>
        </div>
      </div>
      <nav style={{ display: 'flex', gap: 22, fontSize: 13 }}>
        {['Routes', 'Map', 'Findings', 'Briefs'].map((n) => (
          <span key={n} style={{
            color: n === active ? BPI.ink : BPI.ink55,
            fontWeight: n === active ? 600 : 400,
            paddingBottom: 2,
            boxShadow: n === active ? `inset 0 -2px 0 ${BPI.ink}` : 'none',
            cursor: 'pointer',
          }}>{n}</span>
        ))}
      </nav>
      <div style={{ flex: 1 }} />
      {breadcrumb && (
        <div style={{ fontSize: 12, color: BPI.ink55, fontFamily: BPIMono }}>{breadcrumb}</div>
      )}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 11, color: BPI.ink55, fontFamily: BPIMono,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: 3, background: BPI.good }} />
        data current to 2026-05-12
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Citation superscript
// ─────────────────────────────────────────────────────────────
function Cite({ n }) {
  return <sup className="cite">{n}</sup>;
}

// ─────────────────────────────────────────────────────────────
// Sparkline — simple SVG line
// ─────────────────────────────────────────────────────────────
function Spark({ data, width = 80, height = 22, color = BPI.ink, fill = false, baseline }) {
  if (!data || !data.length) return null;
  const min = Math.min(...data, baseline ?? Infinity);
  const max = Math.max(...data, baseline ?? -Infinity);
  const range = (max - min) || 1;
  const dx = width / (data.length - 1 || 1);
  const y = (v) => height - 2 - ((v - min) / range) * (height - 4);
  const pts = data.map((v, i) => [i * dx, y(v)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const area = d + ` L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      {baseline !== undefined && (
        <line x1="0" x2={width} y1={y(baseline)} y2={y(baseline)}
          stroke={BPI.ink20} strokeDasharray="2 2" strokeWidth="1" />
      )}
      {fill && <path d={area} fill={color} opacity="0.12" />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Severity dot-strip — visualizes a segment's slowness over the day.
// Each cell is an hour; color = severity tier.
// ─────────────────────────────────────────────────────────────
function HourStrip({ hours, width = 168, height = 14 }) {
  // hours: array of 24 numbers in [0,1] severity
  const cw = width / 24;
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {hours.map((v, i) => {
        let fill = BPI.ink10;
        if (v > 0.75) fill = BPI.bad;
        else if (v > 0.5) fill = BPI.warn;
        else if (v > 0.25) fill = 'oklch(0.78 0.08 60)';
        return <rect key={i} x={i * cw + 0.5} y="0" width={cw - 1} height={height}
          fill={fill} rx="1.5" />;
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Before/after bar — used in intervention impact rows
// ─────────────────────────────────────────────────────────────
function BeforeAfter({ before, after, max, width = 140, height = 26 }) {
  const w1 = (before / max) * width;
  const w2 = (after / max) * width;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 36, fontSize: 10, color: BPI.ink55 }}>before</div>
        <div style={{ height: 8, width: w1, background: BPI.ink40 }} />
        <div className="num" style={{ fontSize: 11, color: BPI.ink70 }}>{before.toFixed(1)}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 36, fontSize: 10, color: BPI.ink55 }}>after</div>
        <div style={{ height: 8, width: w2, background: after > before ? BPI.good : BPI.bad }} />
        <div className="num" style={{ fontSize: 11, color: BPI.ink, fontWeight: 600 }}>{after.toFixed(1)}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Map thumbnail placeholder — striped to read as "map", not finished art.
// A polyline + a few "stops" suggest a route segment.
// ─────────────────────────────────────────────────────────────
function MapThumb({ width = 120, height = 80, label = 'segment map', emphasis }) {
  return (
    <div style={{
      width, height, position: 'relative', overflow: 'hidden',
      background: `repeating-linear-gradient(45deg, ${BPI.ink06} 0 6px, transparent 6px 14px), ${BPI.paperDeep}`,
      border: `1px solid ${BPI.rule}`,
      borderRadius: 2,
      fontFamily: BPIMono, fontSize: 9, color: BPI.ink55,
    }}>
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        {/* Streets */}
        <line x1="0" y1={height * 0.3} x2={width} y2={height * 0.3} stroke={BPI.ink20} strokeWidth="1" />
        <line x1="0" y1={height * 0.6} x2={width} y2={height * 0.6} stroke={BPI.ink20} strokeWidth="1" />
        <line x1={width * 0.25} y1="0" x2={width * 0.25} y2={height} stroke={BPI.ink20} strokeWidth="1" />
        <line x1={width * 0.7} y1="0" x2={width * 0.7} y2={height} stroke={BPI.ink20} strokeWidth="1" />
        {/* Route */}
        <path d={`M${width * 0.1},${height * 0.85} L${width * 0.3},${height * 0.55} L${width * 0.75},${height * 0.35} L${width * 0.92},${height * 0.18}`}
          fill="none" stroke={emphasis || BPI.accent} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        {/* Stops */}
        {[[0.1, 0.85], [0.3, 0.55], [0.75, 0.35], [0.92, 0.18]].map(([x, y], i) => (
          <circle key={i} cx={x * width} cy={y * height} r="2.2" fill="#fff" stroke={emphasis || BPI.accent} strokeWidth="1.4" />
        ))}
      </svg>
      <div style={{
        position: 'absolute', left: 4, bottom: 3, fontSize: 8.5,
        color: BPI.ink55, fontFamily: BPIMono,
      }}>{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Section header inside a screen
// ─────────────────────────────────────────────────────────────
// Section header inside a screen. Just title + optional sub + right-rail.
// Earlier versions had an uppercase-tracked "eyebrow" prelude above the
// title; that styling was retired — titles should carry their own weight.
function H({ title, sub, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14, gap: 16 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.2 }}>{title}</div>
        {sub && <div style={{ fontSize: 12.5, color: BPI.ink70, marginTop: 5, lineHeight: 1.45, maxWidth: 620 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Footer used across screens. Compact single-line by default — names the
// underlying data sources and links to methodology, nothing more. Brief
// views render their own numbered citation panel inline in the body.
// ─────────────────────────────────────────────────────────────
function StudioFooter({ sources, updated = '2026-05-12' }) {
  const list = sources || ['MTA Bus Speeds', 'Hourly Ridership', 'ACE program', 'NYC DOT bus lanes'];
  return (
    <div style={{
      padding: '10px 28px', background: BPI.card,
      fontSize: 11, color: BPI.ink55,
      borderTop: `1px solid ${BPI.rule}`,
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    }}>
      <span style={{ color: BPI.ink40 }}>Data</span>
      {list.map((s, i, arr) => (
        <React.Fragment key={i}>
          <span style={{ color: BPI.ink70 }}>{s}</span>
          {i < arr.length - 1 && <span style={{ color: BPI.ink20 }}>·</span>}
        </React.Fragment>
      ))}
      <div style={{ flex: 1 }} />
      <span style={{ fontFamily: BPIMono }}>updated {updated}</span>
      <span style={{ color: BPI.ink20 }}>·</span>
      <span style={{ color: BPI.accent, cursor: 'pointer', fontWeight: 600 }}>Methodology →</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Button — primary / secondary / ghost / danger. Single source of truth.
// ─────────────────────────────────────────────────────────────
function Button({ variant = 'secondary', size = 'md', children, full, onClick, style }) {
  const sizes = {
    sm: { p: '6px 10px', fs: 11.5 },
    md: { p: '9px 14px', fs: 12.5 },
    lg: { p: '12px 18px', fs: 13.5 },
  };
  const variants = {
    primary:   { bg: BPI.ink,         fg: BPI.paper, bd: BPI.ink,         fw: 600 },
    secondary: { bg: 'transparent',   fg: BPI.ink,   bd: BPI.ink20,       fw: 500 },
    ghost:     { bg: 'transparent',   fg: BPI.ink70, bd: 'transparent',   fw: 500 },
    accent:    { bg: BPI.accent,      fg: '#fff',    bd: BPI.accent,      fw: 600 },
    paper:     { bg: BPI.paper,       fg: BPI.ink,   bd: BPI.paper,       fw: 600 },
    danger:    { bg: 'transparent',   fg: BPI.bad,   bd: BPI.bad,         fw: 500 },
  };
  const v = variants[variant], sz = sizes[size];
  return (
    <button onClick={onClick} style={{
      padding: sz.p, fontSize: sz.fs, fontWeight: v.fw,
      background: v.bg, color: v.fg,
      border: v.bd === 'transparent' ? 'none' : `1px solid ${v.bd}`,
      borderRadius: 3, fontFamily: 'inherit', cursor: 'pointer',
      width: full ? '100%' : 'auto',
      letterSpacing: '0.005em', lineHeight: 1.2,
      ...style,
    }}>{children}</button>
  );
}

// ─────────────────────────────────────────────────────────────
// Tabs — underline-style. Single source of truth for in-page tabs.
// ─────────────────────────────────────────────────────────────
function Tabs({ items, active, padded }) {
  return (
    <div style={{
      padding: padded ? '0 28px' : 0,
      background: BPI.card,
      boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
      display: 'flex', gap: 24, fontSize: 12.5,
    }}>
      {items.map((t) => (
        <span key={t} style={{
          padding: '10px 0',
          color: t === active ? BPI.ink : BPI.ink55,
          fontWeight: t === active ? 600 : 400,
          boxShadow: t === active ? `inset 0 -2px 0 ${BPI.ink}` : 'none',
          cursor: 'pointer',
        }}>{t}</span>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// KPI — metric block with eyebrow / value / unit / sub
// ─────────────────────────────────────────────────────────────
function KPI({ label, value, unit, sub, tone, trend, citeN, size = 'md' }) {
  const sizes = { md: { v: 26, u: 11, e: 6 }, lg: { v: 30, u: 12, e: 8 } };
  const sz = sizes[size];
  const color = tone === 'bad' ? BPI.bad : tone === 'good' ? BPI.good : tone === 'warn' ? BPI.warn : BPI.ink;
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: sz.e }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <div className="num" style={{ fontSize: sz.v, fontWeight: 600, letterSpacing: '-0.02em', color, lineHeight: 1 }}>{value}</div>
        {unit && <div style={{ fontSize: sz.u, color: BPI.ink55, letterSpacing: '0.03em' }}>{unit}</div>}
        {citeN && <Cite n={citeN} />}
        {trend && <div style={{ marginLeft: 'auto' }}>{trend}</div>}
      </div>
      {sub && <div style={{ fontSize: 11, color: BPI.ink55, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Caveat — inline callout used in briefs to flag interpretation.
// ─────────────────────────────────────────────────────────────
function Caveat({ tone = 'warn', title, children, inline }) {
  const palette = {
    warn: { bg: BPI.warnBg, fg: BPI.warn },
    bad:  { bg: BPI.badBg,  fg: BPI.bad },
    info: { bg: BPI.accentBg, fg: BPI.accent },
  }[tone];
  if (inline) {
    return (
      <span style={{
        background: palette.bg, color: palette.fg,
        padding: '2px 8px', borderRadius: 3, fontSize: 11.5, fontWeight: 500,
      }}>{children}</span>
    );
  }
  return (
    <aside style={{
      padding: '12px 14px', background: palette.bg, color: BPI.ink70,
      borderLeft: `3px solid ${palette.fg}`, fontSize: 12.5, lineHeight: 1.55,
    }}>
      {title && <div style={{ fontWeight: 600, color: palette.fg, marginBottom: 4 }}>⚠ {title}</div>}
      {children}
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────
// SearchField — single-style search input (the one on RF Home).
// ─────────────────────────────────────────────────────────────
function SearchField({ placeholder, defaultValue, shortcut }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: BPI.card, border: `1.5px solid ${BPI.ink}`,
      padding: '14px 18px', borderRadius: 4,
      boxShadow: '0 2px 0 ' + BPI.ink,
    }}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke={BPI.ink} strokeWidth="1.8">
        <circle cx="8" cy="8" r="5.5" /><path d="M12.5 12.5L16 16" strokeLinecap="round" />
      </svg>
      <input style={{
        flex: 1, border: 'none', outline: 'none', fontFamily: 'inherit',
        fontSize: 17, background: 'transparent', color: BPI.ink,
      }} defaultValue={defaultValue} placeholder={placeholder} />
      {shortcut && (
        <span className="mono" style={{
          fontSize: 11, color: BPI.ink40, padding: '2px 6px',
          border: `1px solid ${BPI.ink20}`, borderRadius: 3,
        }}>{shortcut}</span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DirIndicator — compass-letter + arrow, used inline with segment names.
// Replaces the old mono "SB" pill, which read as a placeholder.
// ─────────────────────────────────────────────────────────────
function DirIndicator({ dir, muted }) {
  const arrow = { NB: '↑', SB: '↓', EB: '→', WB: '←' }[dir] || '·';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 3,
      fontSize: 10.5, fontWeight: 700,
      color: muted ? BPI.ink40 : BPI.ink55,
      fontFamily: BPIMono, letterSpacing: '0.04em',
      lineHeight: 1,
    }}>
      <span style={{ fontSize: 13, lineHeight: 1, transform: 'translateY(1px)' }}>{arrow}</span>
      <span>{dir}</span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Treatment glyphs — small visual indicators for what's in place on a
// segment. Three primitives compose into TreatmentRow. All three share a
// column-aligned layout (label below the glyph) so a row of them reads as
// a tiny status board, not a chip pile.
// ─────────────────────────────────────────────────────────────
function LaneGlyph({ state, label = 'LANE' }) {
  const count = state === 'yes' ? 3 : state === 'partial' ? 2 : state === 'minimal' ? 1 : 0;
  const color = state === 'yes' ? BPI.good : state === 'partial' ? BPI.warn : state === 'minimal' ? BPI.warn : BPI.ink20;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ display: 'flex', gap: 1.5, height: 10 }}>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} style={{
            width: 5, height: 10, borderRadius: 1,
            background: i < count ? color : 'transparent',
            boxShadow: i < count ? 'none' : `inset 0 0 0 1px ${BPI.ink20}`,
          }} />
        ))}
      </div>
      <div style={{
        fontSize: 8.5, color: BPI.ink55, letterSpacing: '0.08em',
        fontWeight: 700, fontFamily: BPIFonts,
      }}>{label}</div>
    </div>
  );
}
function DotGlyph({ label, on, tone = 'good' }) {
  const color = tone === 'good' ? BPI.good : tone === 'accent' ? BPI.accent : BPI.warn;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ height: 10, display: 'flex', alignItems: 'center' }}>
        <div style={{
          width: 9, height: 9, borderRadius: 5,
          background: on ? color : 'transparent',
          boxShadow: on ? 'none' : `inset 0 0 0 1.2px ${BPI.ink20}`,
        }} />
      </div>
      <div style={{
        fontSize: 8.5, color: on ? BPI.ink70 : BPI.ink40, letterSpacing: '0.08em',
        fontWeight: 700, fontFamily: BPIFonts,
      }}>{label}</div>
    </div>
  );
}
// TreatmentRow — legacy 3-slot wrapper. Forwards to TreatmentBadgeStrip
// (the new G1-pattern badge slots) so every analyst row picks up the
// seven-family slot model and the badge primitive in one place. Old
// callers passing {lane, ace, tsp} keep working via the badge strip's
// legacy prop; new callers should pass a treatments array instead.
function TreatmentRow({ lane, ace, tsp, treatments, align = 'flex-end' }) {
  if (treatments && treatments.length) {
    return <TreatmentBadgeStrip treatments={treatments} align={align} />;
  }
  return <TreatmentBadgeStrip legacy={{ lane, ace, tsp }} align={align} />;
}

// ─────────────────────────────────────────────────────────────
// SegmentRow — the canonical row layout used by route detail and any
// other segment list. Direction inline, treatments rendered as glyphs.
// ─────────────────────────────────────────────────────────────
function SegmentRow({ dir, from, to, mph, sched, rh, hours, lane, ace, tsp, treatments, flag, hasNote, noteOpen, onClick }) {
  const sev = mph < 5 ? BPI.bad : mph < 6 ? BPI.warn : BPI.ink;
  return (
    <div onClick={onClick} style={{
      display: 'grid',
      gridTemplateColumns: '1fr 84px 92px 168px 132px',
      gap: 18, alignItems: 'center',
      padding: '14px 12px',
      margin: '0 -12px',
      boxShadow: noteOpen ? 'none' : `inset 0 -1px 0 ${BPI.rule}`,
      background: flag === 'top' ? BPI.accentBg : noteOpen ? BPI.ink06 : 'transparent',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'background .15s',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <DirIndicator dir={dir} />
          <span style={{
            fontSize: 13.5, fontWeight: 500, lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1,
          }}>
            {from} <span style={{ color: BPI.ink40 }}>→</span> {to}
          </span>
          {hasNote && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontFamily: BPIMono, fontSize: 9, fontWeight: 700,
              color: BPI.accent,
              background: noteOpen ? BPI.accent : BPI.accentBg,
              borderRadius: 2, padding: '2px 5px',
              flexShrink: 0, letterSpacing: '0.06em',
              transition: 'background .15s, color .15s',
            }}>
              <span style={{
                color: noteOpen ? '#fff' : BPI.accent,
                transition: 'color .15s',
              }}>◆</span>
              <span style={{
                color: noteOpen ? '#fff' : BPI.accent,
                transition: 'color .15s',
              }}>AI</span>
              <span style={{
                color: noteOpen ? '#fff' : BPI.accent,
                fontSize: 8, lineHeight: 1,
                transform: noteOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform .2s, color .15s',
              }}>▾</span>
            </span>
          )}
        </div>
        {flag === 'top' && (
          <div style={{ fontSize: 10.5, color: BPI.accent, marginTop: 4, fontWeight: 600, letterSpacing: '0.02em', marginLeft: 28 }}>
            ↑ Top rider-impact segment
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
        <div className="num" style={{ fontSize: 16, fontWeight: 600, color: sev, lineHeight: 1 }}>{mph.toFixed(1)}</div>
        {sched !== undefined && (
          <div className="num" style={{ fontSize: 9.5, color: BPI.ink55 }}>vs {sched.toFixed(1)} sch</div>
        )}
      </div>
      <div className="num" style={{ fontSize: 13, textAlign: 'right', fontWeight: 500 }}>
        {rh.toLocaleString()}
      </div>
      <HourStrip hours={hours} />
      <TreatmentRow lane={lane} ace={ace} tsp={tsp} treatments={treatments} />
    </div>
  );
}
function SegmentRowHeader({ showSched = true }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 84px 92px 168px 132px',
      gap: 18, padding: '0 12px 8px',
      margin: '0 -12px',
      fontSize: 10, color: BPI.ink55, letterSpacing: '0.08em',
      textTransform: 'uppercase', fontWeight: 700,
      boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
    }}>
      <span>Segment</span>
      <span style={{ textAlign: 'right' }}>MPH{showSched && <span style={{ color: BPI.ink40, fontWeight: 500 }}> / sch</span>}</span>
      <span style={{ textAlign: 'right' }}>RH / day</span>
      <span>Severity by hour</span>
      <span style={{ textAlign: 'right' }}>Treatments</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Timeline — intervention timeline (vertical, dotted).
// ─────────────────────────────────────────────────────────────
function Timeline({ events }) {
  return (
    <div style={{ position: 'relative', paddingLeft: 16 }}>
      <div style={{ position: 'absolute', left: 4, top: 6, bottom: 6, width: 1, background: BPI.rule }} />
      {events.map((e, i) => (
        <div key={i} style={{ position: 'relative', paddingBottom: 14 }}>
          <div style={{
            position: 'absolute', left: -16, top: 5, width: 9, height: 9, borderRadius: 5,
            background: e.tone === 'good' ? BPI.good : e.tone === 'bad' ? BPI.bad : BPI.accent,
            boxShadow: `0 0 0 2px ${BPI.paper}`,
          }} />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="num" style={{ fontSize: 11, color: BPI.ink55, fontWeight: 600 }}>{e.date}</span>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>{e.title}</span>
          </div>
          {e.detail && <div style={{ fontSize: 11.5, color: BPI.ink70, marginTop: 2, lineHeight: 1.4 }}>{e.detail}</div>}
        </div>
      ))}
    </div>
  );
}

Object.assign(window, {
  BPI, BPIFonts, BPIMono,
  StudioMark, RouteBadge, StudioBar, StudioFooter, Cite,
  // cardRaised exposed so component files can use the highest-elevation tier
  // without importing BPI directly.
  Spark, HourStrip, BeforeAfter, MapThumb, H,
  Button, Tabs, KPI, Caveat, SearchField, Timeline,
  DirIndicator, LaneGlyph, DotGlyph, TreatmentRow,
  SegmentRow, SegmentRowHeader,
});

// ─────────────────────────────────────────────────────────────
// SKELETON / EMPTY / ERROR STATES
//
// One source of truth for placeholder content so loading and empty rows
// never look improvised. <Skeleton> is the atom; the higher-level state
// components compose it.
// ─────────────────────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('bpi-skel-styles')) {
  const s = document.createElement('style');
  s.id = 'bpi-skel-styles';
  s.textContent = `
    @keyframes bpi-skel-shimmer { 0% { background-position: -200px 0; } 100% { background-position: 200px 0; } }
    .bpi-skel {
      display: inline-block;
      background:
        linear-gradient(90deg, rgba(22,20,15,.04) 0%, rgba(22,20,15,.10) 50%, rgba(22,20,15,.04) 100%);
      background-size: 200px 100%;
      background-repeat: no-repeat;
      background-color: rgba(22,20,15,.06);
      animation: bpi-skel-shimmer 1.2s linear infinite;
      border-radius: 3px;
    }
  `;
  document.head.appendChild(s);
}

function Skeleton({ w = '100%', h = 12, radius = 3, style }) {
  return <span className="bpi-skel" style={{ width: w, height: h, borderRadius: radius, ...style }} />;
}
function SkeletonText({ lines = 1, w = '100%' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} w={i === lines - 1 && lines > 1 ? '60%' : w} h={lines === 1 ? 12 : 10} />
      ))}
    </div>
  );
}
function SkeletonKPI() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Skeleton w={88} h={10} />
      <Skeleton w={120} h={26} />
      <Skeleton w={140} h={9} />
    </div>
  );
}
function SkeletonSegmentRow() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 84px 92px 168px 132px',
      gap: 18, alignItems: 'center',
      padding: '14px 12px',
      margin: '0 -12px',
      boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Skeleton w={28} h={12} />
        <Skeleton w={260} h={14} />
      </div>
      <Skeleton w={48} h={18} style={{ marginLeft: 'auto' }} />
      <Skeleton w={64} h={14} style={{ marginLeft: 'auto' }} />
      <Skeleton w={168} h={14} />
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <Skeleton w={20} h={10} /><Skeleton w={20} h={10} /><Skeleton w={20} h={10} />
      </div>
    </div>
  );
}

// EmptyState — neutral, opinionated. Always has an icon, a title, a
// short explanation, and one or two recovery actions. Never shippable
// as bare text.
function EmptyState({ icon, title, body, primary, secondary, tone = 'neutral' }) {
  const palette = tone === 'warn'
    ? { ring: BPI.warnBg, fg: BPI.warn }
    : { ring: BPI.ink06, fg: BPI.ink55 };
  return (
    <div style={{
      padding: '40px 28px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 12, textAlign: 'center',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 22, background: palette.ring,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: palette.fg, fontSize: 20, lineHeight: 1,
      }}>{icon || '∅'}</div>
      <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>{title}</div>
      {body && <div style={{ fontSize: 12.5, color: BPI.ink70, lineHeight: 1.55, maxWidth: 360 }}>{body}</div>}
      {(primary || secondary) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          {secondary && <Button variant="secondary" size="sm">{secondary}</Button>}
          {primary && <Button variant="primary" size="sm">{primary}</Button>}
        </div>
      )}
    </div>
  );
}

// ErrorState — for retriable failures. Same shape as EmptyState; just a
// different rhetorical posture.
function ErrorState({ title, body, retry }) {
  return (
    <div style={{
      padding: '32px 24px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 10, textAlign: 'center',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 20, background: BPI.badBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: BPI.bad, fontSize: 18, fontWeight: 700,
      }}>!</div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{title || 'Could not load data'}</div>
      {body && <div style={{ fontSize: 12, color: BPI.ink70, lineHeight: 1.55, maxWidth: 320 }}>{body}</div>}
      {retry && <Button size="sm" variant="secondary">{retry}</Button>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CHART COMPONENTS — generalized, with shared axis/legend conventions
//
// Heatmap   — rows × cols × values. Color scale chosen via `scheme`.
// HourBars  — 24-hour bar chart with optional scheduled baseline.
// Both share a small ChartFrame for axis & caption.
// ─────────────────────────────────────────────────────────────

function ChartFrame({ title, source, right, height = 220, children }) {
  return (
    <div style={{
      background: BPI.card, padding: 18, borderRadius: 3,
      boxShadow: `0 0 0 1px ${BPI.rule}`,
      display: 'flex', flexDirection: 'column',
    }}>
      {title && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.005em' }}>{title}</div>
            {source && <div style={{ fontSize: 11, color: BPI.ink55, marginTop: 3 }}>{source}</div>}
          </div>
          {right}
        </div>
      )}
      <div style={{ minHeight: height }}>{children}</div>
    </div>
  );
}

// Heatmap — rows × cols (numbers or array of [r,c,v]).
// rows/cols are label arrays. Values is a 2-d array[rows.length][cols.length].
// scheme: 'severity' (red → neutral → faint) is the only one we use.
function Heatmap({ rows, cols, values, min, max, cellW = 36, cellH = 22, labelGutter = 56, colTickEvery = 6, valueFormat = (v) => v.toFixed(1) }) {
  const lo = min ?? Math.min(...values.flat());
  const hi = max ?? Math.max(...values.flat());
  const range = (hi - lo) || 1;
  const colorAt = (v) => {
    const t = Math.max(0, Math.min(1, (v - lo) / range));
    // Inverted severity: low value = bad (red); high value = ok (warm cream)
    return `oklch(${0.55 + t * 0.35} ${0.16 * (1 - t) + 0.02} ${28 + t * 30})`;
  };
  return (
    <div style={{ display: 'inline-block' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `${labelGutter}px repeat(${cols.length}, ${cellW}px)` }}>
        <div />
        {cols.map((c, i) => (
          <div key={i} style={{
            fontSize: 9.5, color: BPI.ink55, textAlign: 'center',
            fontFamily: BPIMono, paddingBottom: 4, height: 16,
          }}>{(i % colTickEvery === 0 || i === cols.length - 1) ? c : ''}</div>
        ))}
        {rows.map((rowLbl, ri) => (
          <React.Fragment key={ri}>
            <div style={{
              fontSize: 10.5, color: BPI.ink55, fontWeight: 500,
              display: 'flex', alignItems: 'center', height: cellH,
            }}>{rowLbl}</div>
            {cols.map((_, ci) => {
              const v = values[ri][ci];
              const t = Math.max(0, Math.min(1, (v - lo) / range));
              return (
                <div key={ci} style={{
                  height: cellH, width: cellW - 2, marginRight: 2, marginBottom: 2,
                  background: colorAt(v), borderRadius: 2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, color: t < 0.4 ? '#fff' : BPI.ink70,
                  fontFamily: BPIMono, fontWeight: 500,
                }}>{valueFormat(v)}</div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 10, color: BPI.ink55 }}>
        <span>slower</span>
        <div style={{
          height: 8, width: 120,
          background: 'linear-gradient(90deg, oklch(0.55 0.16 28), oklch(0.85 0.04 60), oklch(0.9 0.02 58))',
          borderRadius: 2,
        }} />
        <span>faster</span>
        <span style={{ marginLeft: 14, fontFamily: BPIMono }}>{valueFormat(lo)} → {valueFormat(hi)}</span>
      </div>
    </div>
  );
}

// HourBars — 24-hour bar chart. Color-tiers values automatically.
function HourBars({ data, sched, width = 600, height = 200, min, max, yLabel = 'mph' }) {
  const lo = min ?? Math.floor(Math.min(...data, sched ?? Infinity) - 0.5);
  const hi = max ?? Math.ceil(Math.max(...data, sched ?? -Infinity) + 0.5);
  const padL = 36, padR = 12, padT = 12, padB = 24;
  const cw = (width - padL - padR) / 24;
  const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (height - padT - padB);
  // Pick ~4 y-grid values
  const ticks = [];
  const step = Math.max(1, Math.round((hi - lo) / 4));
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={padL} x2={width - padR} y1={y(v)} y2={y(v)} stroke={BPI.rule} />
          <text x={padL - 6} y={y(v) + 3} fontSize="10" textAnchor="end" fill={BPI.ink55} fontFamily={BPIMono}>{v}</text>
        </g>
      ))}
      {sched !== undefined && (
        <>
          <line x1={padL} x2={width - padR} y1={y(sched)} y2={y(sched)} stroke={BPI.accent} strokeDasharray="4 3" strokeWidth="1.5" />
          <text x={width - padR - 4} y={y(sched) - 5} fontSize="10" textAnchor="end" fill={BPI.accent} fontWeight="600">scheduled {sched.toFixed(1)}</text>
        </>
      )}
      {data.map((v, i) => {
        const yt = y(v); const yb = y(lo);
        return (
          <rect key={i}
            x={padL + i * cw + 1.5} width={cw - 3}
            y={yt} height={yb - yt}
            fill={v < 5 ? BPI.bad : v < 6.5 ? BPI.warn : BPI.ink40} />
        );
      })}
      {[0, 6, 12, 18].map((h0) => (
        <text key={h0} x={padL + h0 * cw + cw / 2} y={height - padB + 14}
          fontSize="10" textAnchor="middle" fill={BPI.ink55} fontFamily={BPIMono}>{h0}:00</text>
      ))}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// ClaimRow / ClaimList — the canonical way to render a claim in any
// list context. Used by:
//   • RF_Annotate · "Brief in progress" right rail
//   • RF_Authoring · "Outline" left rail
// Variants (state, drag handle, density) are props on a single
// primitive so the two screens stay visually consistent.
//
// State precedence (highest first):
//   editing  — currently being composed   (accent border + accent bg)
//   active   — currently in view          (ink ring + card bg)
//   weak     — flagged, but otherwise idle (no border)
//   default
// ─────────────────────────────────────────────────────────────
function ClaimRow({
  n, title, strength, evidence, caveats,
  active, editing, weak,
  reorderable, density = 'comfortable', onClick,
}) {
  const dense = density === 'compact';
  const pad = dense ? '8px 10px' : '11px 12px';
  const titleSize = dense ? 12 : 13;
  const numSize = dense ? 10 : 11;
  const metaSize = dense ? 9.5 : 10.5;

  // Border / bg by state
  let border = '1px solid transparent';
  let bg = 'transparent';
  if (editing)      { border = `1.5px solid ${BPI.accent}`; bg = BPI.accentBg; }
  else if (active)  { border = `1.5px solid ${BPI.ink}`;    bg = BPI.card; }

  return (
    <div onClick={onClick} style={{
      display: 'flex', gap: 8, padding: pad, borderRadius: 3,
      background: bg, border,
      marginBottom: 4, cursor: onClick ? 'pointer' : 'default',
      transition: 'background .12s ease, box-shadow .12s ease',
    }}>
      {reorderable && (
        <span style={{
          color: BPI.ink20, fontSize: 12, marginTop: 2, cursor: 'grab',
          letterSpacing: '-0.1em', userSelect: 'none', lineHeight: 1,
        }}>⋮⋮</span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Number + title share the top line — number aligned tight to title */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="num" style={{
            fontSize: numSize, fontWeight: 700, color: BPI.ink55,
            fontFamily: BPIMono, letterSpacing: '0.02em', flexShrink: 0,
          }}>0{n}</span>
          <span style={{
            fontSize: titleSize, fontWeight: active || editing ? 600 : 500,
            lineHeight: 1.35, color: BPI.ink, flex: 1, letterSpacing: '-0.005em',
          }}>{title}</span>
          {editing && (
            <span className="chip accent" style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
              padding: '2px 6px', flexShrink: 0,
            }}>EDITING</span>
          )}
        </div>
        {/* Strength + metadata on a single second line */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginTop: 6, fontSize: metaSize, color: BPI.ink55,
          fontFamily: BPIMono,
        }}>
          <StrengthBars strength={strength} size="sm" />
          {evidence !== undefined && (
            <span>{evidence} evidence</span>
          )}
          {caveats !== undefined && (
            <>
              <span style={{ color: BPI.ink20 }}>·</span>
              <span>{caveats} caveat{caveats === 1 ? '' : 's'}</span>
            </>
          )}
          {weak && (
            <>
              <span style={{ color: BPI.ink20 }}>·</span>
              <span style={{ color: BPI.warn, fontWeight: 700 }}>weak</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ClaimList — wraps ClaimRows + an "+ Add claim" action and an
// optional summary footer (avg strength · citation totals).
function ClaimList({
  claims, reorderable, density,
  onAdd, summary, onSelect,
}) {
  return (
    <div>
      {claims.map((c) => (
        <ClaimRow key={c.n} {...c} reorderable={reorderable} density={density}
          onClick={onSelect ? () => onSelect(c) : undefined} />
      ))}
      {onAdd && (
        <button className="bpi" onClick={onAdd} style={{
          marginTop: 6, padding: density === 'compact' ? '8px 10px' : '10px 12px',
          width: '100%', background: 'transparent', color: BPI.ink55,
          fontFamily: 'inherit', border: `1.5px dashed ${BPI.ink20}`,
          borderRadius: 3, fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
          textAlign: 'left',
        }}>+ Add claim</button>
      )}
      {summary && (
        <div style={{
          marginTop: 10, padding: '10px 12px',
          fontSize: 11, color: BPI.ink55, fontFamily: BPIMono,
          background: BPI.ink06, borderRadius: 3, lineHeight: 1.6,
        }}>{summary}</div>
      )}
    </div>
  );
}
// rest of the brief. Used inline next to claim numbers and big enough on
// its own to stand as a chip in the strength callout.
// ─────────────────────────────────────────────────────────────
function StrengthBars({ strength = 0, max = 5, size = 'sm' }) {
  const tone = strength >= 4 ? BPI.good : strength >= 3 ? BPI.accent : strength >= 2 ? BPI.warn : BPI.bad;
  const sz = size === 'lg'
    ? { pip: 14, h: 4, gap: 2.5 }
    : size === 'md'
      ? { pip: 10, h: 3, gap: 2 }
      : { pip: 7,  h: 3, gap: 1.5 };
  return (
    <div style={{ display: 'inline-flex', gap: sz.gap, alignItems: 'center' }}>
      {Array.from({ length: max }, (_, i) => (
        <div key={i} style={{
          width: sz.pip, height: sz.h, borderRadius: 1,
          background: i < strength ? tone : BPI.ink10,
        }} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CodeBlock styles — injected once
// ─────────────────────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('bpi-cb-styles')) {
  const cbS = document.createElement('style');
  cbS.id = 'bpi-cb-styles';
  cbS.textContent = `
    .bpi-cb {
      background: #ece7db;
      border-radius: 4px;
      overflow: hidden;
      font-size: 12.5px;
    }
    .bpi-cb-hd {
      display: flex; align-items: center;
      padding: 6px 12px;
      border-bottom: 1px solid rgba(22,20,15,.09);
      min-height: 32px;
    }
    .bpi-cb-lang {
      font-family: 'SF Mono', ui-monospace, Menlo, Consolas, monospace;
      font-size: 10.5px; font-weight: 500;
      color: rgba(22,20,15,.42); letter-spacing: 0.02em;
      flex: 1;
    }
    .bpi-cb pre {
      padding: 14px 16px; margin: 0;
      overflow-x: auto;
      font-family: 'SF Mono', ui-monospace, Menlo, Consolas, monospace;
      font-size: 12.5px; line-height: 1.58; color: #16140f;
      tab-size: 2;
    }
    .bpi-copy-btn {
      background: none; border: none; padding: 4px 5px;
      display: flex; align-items: center; gap: 5px;
      cursor: pointer; border-radius: 3px;
      font-family: 'SF Mono', ui-monospace, Menlo, Consolas, monospace;
      font-size: 10.5px; font-weight: 500;
      color: rgba(22,20,15,.35);
      transition: color .1s, background .1s;
    }
    .bpi-copy-btn:hover {
      color: rgba(22,20,15,.68);
      background: rgba(22,20,15,.07);
    }
    .bpi-copy-btn.copied { color: oklch(0.45 0.12 155); }
    .bpi-copy-btn .label { line-height: 1; }
    /* CodeTabs */
    .bpi-ct-bar {
      display: flex; align-items: center;
      border-bottom: 1px solid rgba(22,20,15,.14);
    }
    .bpi-ct-tab {
      background: none; border: none; cursor: pointer;
      font-family: 'SF Mono', ui-monospace, Menlo, Consolas, monospace;
      font-size: 11.5px; font-weight: 500;
      color: rgba(22,20,15,.42); padding: 6px 14px;
      border-bottom: 2px solid transparent; margin-bottom: -1px;
      letter-spacing: 0.01em; transition: color .1s;
    }
    .bpi-ct-tab:hover { color: rgba(22,20,15,.72); }
    .bpi-ct-tab.active {
      color: oklch(0.42 0.13 252);
      border-bottom-color: oklch(0.42 0.13 252);
    }
    .bpi-ct-spacer { flex: 1; }
    .bpi-ct .bpi-cb { border-radius: 0 4px 4px 4px; }
  `;
  document.head.appendChild(cbS);
}

// ─────────────────────────────────────────────────────────────
// Internal icon helpers (uppercase = React component, not DOM)
// ─────────────────────────────────────────────────────────────
function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ display: 'block' }}>
      <rect x="4" y="4" width="7.5" height="7.5" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1.5 9V1.5H9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ display: 'block' }}>
      <path d="M2 6.5l3 3 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// useCopy — shared copy logic
// ─────────────────────────────────────────────────────────────
function useCopy(getText) {
  const [copied, setCopied] = React.useState(false);
  function handleCopy() {
    const text = getText();
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1500); };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(done).catch(done);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(ta); done();
    }
  }
  return [copied, handleCopy];
}

// ─────────────────────────────────────────────────────────────
// CopyBtn — the shared copy button primitive
// ─────────────────────────────────────────────────────────────
function CopyBtn({ copied, onCopy, showLabel }) {
  return (
    <button
      className={`bpi-copy-btn${copied ? ' copied' : ''}`}
      onClick={onCopy}
      title={copied ? 'Copied!' : 'Copy'}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {showLabel && <span className="label">{copied ? 'Copied' : 'Copy'}</span>}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// CodeBlock
//
// lang       short language label: "bash" "json" "typescript" etc.
// label      override label for custom headers: "response shape" "config"
//            if neither lang nor label: header shows copy btn only
// copyText   explicit text to copy (omit → uses pre innerText)
// noHeader   suppress the header bar entirely
// children   code content — plain string or JSX with syntax-highlight spans
// ─────────────────────────────────────────────────────────────
function CodeBlock({ lang, label, copyText, noHeader, children }) {
  const preRef = React.useRef(null);
  const [copied, handleCopy] = useCopy(() =>
    copyText != null ? copyText : (preRef.current ? preRef.current.innerText : '')
  );

  return (
    <div className="bpi-cb">
      {!noHeader && (
        <div className="bpi-cb-hd">
          <span className="bpi-cb-lang">{label || lang || ''}</span>
          <CopyBtn copied={copied} onCopy={handleCopy} />
        </div>
      )}
      <pre ref={preRef}>{children}</pre>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CodeTabs
//
// tabs  [{ lang, label, children, copyText }]
//        lang/label used as the tab button text
//        copy button lives in the tab bar (right side)
// ─────────────────────────────────────────────────────────────
function CodeTabs({ tabs }) {
  const [active, setActive] = React.useState(0);
  const preRef = React.useRef(null);
  const [copied, handleCopy] = useCopy(() => {
    const t = tabs[active];
    return t.copyText != null ? t.copyText : (preRef.current ? preRef.current.innerText : '');
  });

  return (
    <div className="bpi-ct">
      <div className="bpi-ct-bar">
        {tabs.map((t, i) => (
          <button
            key={i}
            className={`bpi-ct-tab${i === active ? ' active' : ''}`}
            onClick={() => { setActive(i); }}
          >
            {t.label || t.lang}
          </button>
        ))}
        <span className="bpi-ct-spacer" />
        <CopyBtn copied={copied} onCopy={handleCopy} showLabel />
      </div>
      <div className="bpi-cb" style={{ borderRadius: '0 4px 4px 4px' }}>
        <pre ref={preRef}>{tabs[active].children}</pre>
      </div>
    </div>
  );
}

Object.assign(window, {
  Skeleton, SkeletonText, SkeletonKPI, SkeletonSegmentRow,
  EmptyState, ErrorState,
  ChartFrame, Heatmap, HourBars,
  StrengthBars,
  ClaimRow, ClaimList,
  CodeBlock, CodeTabs,
});
