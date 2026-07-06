// verdict-primitives.jsx
// Building blocks for the Verdict layer. Depends on system.jsx (BPI, RouteBadge,
// Spark, Button, BPIMono…) and verdict-data.jsx.
//
// Honesty doctrine baked in:
//   • every data block can carry a DataAsOf chip (date + freshness dot)
//   • severity and confidence are TWO distinct channels — colored blocks vs
//     ink pips — and never collapse into one
//   • the zero-insight state is a credibility feature, not an apology
//   • single clock: the verdict reads the dossier; release-grain numbers are
//     reconciled with a chip, never shown as a second unexplained figure

// ── color helpers ─────────────────────────────────────────────
const V_TONE = {
  bad:     { fg: BPI.bad,    bg: BPI.badBg },
  warn:    { fg: BPI.warn,   bg: BPI.warnBg },
  good:    { fg: BPI.good,   bg: BPI.goodBg },
  accent:  { fg: BPI.accent, bg: BPI.accentBg },
  neutral: { fg: BPI.ink70,  bg: BPI.ink06 },
};
function vTone(t) { return V_TONE[t] || V_TONE.neutral; }
function vSpeed(mph) {
  if (mph < 5)   return BPI.bad;
  if (mph < 6.5) return BPI.warn;
  if (mph < 9)   return 'oklch(0.64 0.10 78)';
  return BPI.good;
}
const SEV_LABEL  = { high: 'High', medium: 'Moderate', low: 'Low' };
const CONF_LABEL = { high: 'Well-evidenced', medium: 'Suggestive', low: 'Tentative' };
const CONF_SHORT = { high: 'High', medium: 'Medium', low: 'Low' };

// ── freshness dot + DataAsOf chip ─────────────────────────────
function FreshDot({ fresh, size = 6 }) {
  const map = { current: BPI.good, recent: 'oklch(0.66 0.11 78)', stale: BPI.bad };
  const c = map[fresh];
  const hollow = fresh === 'unknown' || !c;
  return (
    <span style={{
      width: size, height: size, borderRadius: size / 2, flexShrink: 0,
      background: hollow ? 'transparent' : c,
      boxShadow: hollow ? `inset 0 0 0 1.3px ${BPI.ink40}` : 'none',
    }} />
  );
}
function DataAsOf({ date, fresh = 'current', prefix = 'as of', mute }) {
  return (
    <span className="mono" style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 10, color: mute ? BPI.ink40 : BPI.ink55, letterSpacing: '0.02em',
      whiteSpace: 'nowrap',
    }}>
      <FreshDot fresh={fresh} />
      {date ? `${prefix} ${date}` : 'in development'}
    </span>
  );
}

// ── the two channels: severity (colored blocks) vs confidence (ink pips) ──
function SeverityMeter({ severity, tone, label = true }) {
  const n = severity === 'high' ? 3 : severity === 'medium' ? 2 : 1;
  const c = vTone(tone).fg;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {label && <span className="mono" style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', color: BPI.ink40 }}>SEV</span>}
      <span style={{ display: 'inline-flex', gap: 2 }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 7, height: 9, borderRadius: 1, background: i < n ? c : BPI.ink10 }} />
        ))}
      </span>
    </span>
  );
}
function ConfidenceMeter({ confidence, label = true, variant = 'pips' }) {
  const n = confidence === 'high' ? 3 : confidence === 'medium' ? 2 : 1;
  if (variant === 'bracket') {
    return (
      <span className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: BPI.ink55, letterSpacing: '0.04em' }}>
        {label && <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', color: BPI.ink40 }}>CONF</span>}
        <span style={{ color: BPI.ink70 }}>[{[0, 1, 2].map((i) => (i < n ? '●' : '○')).join('')}]</span>
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {label && <span className="mono" style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', color: BPI.ink40 }}>CONF</span>}
      <span style={{ display: 'inline-flex', gap: 3 }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{
            width: 7, height: 7, borderRadius: 4,
            background: i < n ? BPI.ink70 : 'transparent',
            boxShadow: i < n ? 'none' : `inset 0 0 0 1.2px ${BPI.ink20}`,
          }} />
        ))}
      </span>
    </span>
  );
}
// Paired channel readout — used in card meta lines. Keeps the two channels
// visibly different (colored blocks vs hollow pips) so they never read as one.
function ChannelPair({ severity, tone, confidence, confVariant, words }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <SeverityMeter severity={severity} tone={tone} />
        {words && <span style={{ fontSize: 10.5, color: vTone(tone).fg, fontWeight: 600 }}>{SEV_LABEL[severity]}</span>}
      </span>
      <span style={{ width: 1, height: 11, background: BPI.ink10 }} />
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <ConfidenceMeter confidence={confidence} variant={confVariant} />
        {words && <span style={{ fontSize: 10.5, color: BPI.ink55, fontWeight: 500 }}>{CONF_LABEL[confidence]}</span>}
      </span>
    </span>
  );
}

// ── micro-figures inside insight cards ────────────────────────
function InsightFigure({ figure, tone, w = 184, h = 46 }) {
  const c = vTone(tone).fg;
  if (figure.kind === 'spark') {
    return <Spark data={figure.data} width={w} height={h} color={c} fill baseline={undefined} />;
  }
  if (figure.kind === 'persist') {
    const cells = figure.data;
    const cw = w / cells.length;
    return (
      <svg width={w} height={h} style={{ display: 'block' }}>
        {cells.map((v, i) => (
          <rect key={i} x={i * cw + 0.6} y={(h - 14) / 2} width={cw - 1.2} height={14} rx={1.5}
            fill={v ? c : 'transparent'}
            stroke={v ? 'none' : BPI.ink20} strokeWidth={v ? 0 : 1} />
        ))}
      </svg>
    );
  }
  if (figure.kind === 'hours') {
    const data = figure.data;
    const cw = w / 24;
    const lo = 3.5, hi = 8.6;
    const bh = (v) => ((v - lo) / (hi - lo)) * (h - 14);
    return (
      <svg width={w} height={h} style={{ display: 'block' }}>
        {data.map((v, i) => {
          const isPeak = (i >= 7 && i <= 9) || (i >= 16 && i <= 19);
          const hh = Math.max(2, bh(v));
          return <rect key={i} x={i * cw + 1} y={h - hh} width={cw - 2} height={hh}
            fill={isPeak ? c : BPI.ink20} />;
        })}
      </svg>
    );
  }
  if (figure.kind === 'beforeafter') {
    const max = Math.max(figure.before, figure.after) * 1.12;
    const bw = (v) => (v / max) * (w - 30);
    const delta = (figure.after - figure.before).toFixed(1);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: w }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span className="mono" style={{ fontSize: 8.5, color: BPI.ink40, width: 30 }}>before</span>
          <span style={{ height: 7, width: bw(figure.before), background: BPI.ink40, borderRadius: 1 }} />
          <span className="num" style={{ fontSize: 10, color: BPI.ink55 }}>{figure.before.toFixed(1)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span className="mono" style={{ fontSize: 8.5, color: BPI.ink40, width: 30 }}>since</span>
          <span style={{ height: 7, width: bw(figure.after), background: c, borderRadius: 1 }} />
          <span className="num" style={{ fontSize: 10, color: c, fontWeight: 700 }}>{figure.after.toFixed(1)} <span style={{ color: BPI.ink40, fontWeight: 500 }}>+{delta}</span></span>
        </div>
      </div>
    );
  }
  return null;
}

// ── caveat "why?" affordance + subtle send-to-brief (author-only) ──
function WhyChip({ open }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 600, color: BPI.ink55, cursor: 'help',
      borderBottom: `1px dotted ${BPI.ink20}`, lineHeight: 1.1, paddingBottom: 1,
    }}>why?</span>
  );
}
function CaveatNote({ text }) {
  return (
    <div style={{
      marginTop: 9, display: 'flex', gap: 8, alignItems: 'flex-start',
      padding: '8px 11px', background: BPI.warnBg, borderRadius: 3,
      fontSize: 11, color: BPI.ink70, lineHeight: 1.5, maxWidth: 560,
    }}>
      <span style={{ color: BPI.warn, fontWeight: 700, flexShrink: 0, fontSize: 11 }}>caveat</span>
      <span style={{ textWrap: 'pretty' }}>{text}</span>
    </div>
  );
}
function DeepLink({ tab }) {
  return (
    <span style={{ fontSize: 11.5, fontWeight: 600, color: BPI.accent, cursor: 'pointer', whiteSpace: 'nowrap' }}>
      {tab} →
    </span>
  );
}
// Author-only: quiet by default, legible to an evidence author, invisible noise
// to a public reader. Rendered as a faint bracketed glyph + label.
function SendToBrief({ compact }) {
  return (
    <span title="Send to brief (author)" style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 10.5, fontWeight: 600, color: BPI.ink40, cursor: 'pointer',
      fontFamily: BPIMono, letterSpacing: '0.02em',
    }}>
      <span style={{
        width: 15, height: 15, borderRadius: 3, border: `1px dashed ${BPI.ink20}`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, lineHeight: 1, color: BPI.ink40,
      }}>+</span>
      {!compact && <span>brief</span>}
    </span>
  );
}

Object.assign(window, {
  vTone, vSpeed, V_TONE, SEV_LABEL, CONF_LABEL, CONF_SHORT,
  FreshDot, DataAsOf, SeverityMeter, ConfidenceMeter, ChannelPair,
  InsightFigure, WhyChip, CaveatNote, DeepLink, SendToBrief,
});
