// ─────────────────────────────────────────────────────────────
// TREATMENT BADGES
//
// Typographic marks instead of literal-shape glyphs. A treatment badge
// is a small rounded rect with a 2–3 character code, sized like an MTA
// route bullet but in ink (or its state variant).
//
// Why badges:
//   • Glyphs got fussy at small sizes; hand-drawn SVGs read as illustration.
//   • Badges read as code — the same visual class as route bullets, which
//     is already the system's signature.
//   • State (active / planned / source_gap) is encoded by fill / dash /
//     border so a mixed-state row still reads coherently.
//
// One typographic decision: monospace, bold, tabular-nums. This locks
// every 2-char badge to the same width and every 3-char badge to a wider
// one — a wall of badges aligns into a grid automatically.
// ─────────────────────────────────────────────────────────────

// ── CODES ───────────────────────────────────────────────────
// 2–3 character mark per treatment. Where an acronym is already
// canonical to NYC riders (ACE, TSP, SBS), we use it. Otherwise the
// code is a tight initialism — read repeatedly, learned quickly.
const TREATMENT_CODES = {
  // Street priority
  bus_lane:           'BL',
  offset_lane:        'OL',
  busway:             'BWY',
  boarding_island:    'BI',
  median_station:     'MS',
  // Enforcement
  ace:                'ACE',
  bus_mounted_cam:    'BCM',
  nypd_enforcement:   'PD',
  // Signals
  tsp:                'TSP',
  queue_jump:         'QJ',
  dedicated_phase:    'BP',
  signal_retiming:    'SR',
  turn_restriction:   'NT',
  // Stops & boarding
  stop_consolidation: 'SC',
  bus_bulb:           'BB',
  off_board_fare:     'OBF',
  all_door:           'AD',
  shelter_rtpi:       'RTPI',
  // Service pattern
  sbs:                'SBS',
  limited:            'LTD',
  route_restructure:  'RR',
  // Curb & safety
  daylighting:        'DL',
  hardened_center:    'HC',
  curb_management:    'CR',
  loading_zone:       'LZ',
  // Program / capital
  capital_milestone:  'CAP',
  proposal:           'PR',
};

// ── SIZE TIERS ──────────────────────────────────────────────
// Mirrors the existing RouteBadge sizing scale so badges sit cleanly
// next to route bullets. `w` is bucketed by character count.
const TBADGE_SIZES = {
  //       h   fs    pad   r    w:[2ch, 3ch, 4ch]
  xs: { h: 16, fs: 9,    pad: 0, r: 2, w: [22, 28, 36] },
  sm: { h: 18, fs: 10,   pad: 0, r: 2.5, w: [26, 32, 40] },
  md: { h: 22, fs: 11.5, pad: 0, r: 3, w: [30, 38, 48] },
  lg: { h: 28, fs: 14,   pad: 0, r: 3, w: [38, 48, 60] },
};
function tbadgeWidth(sz, charCount) {
  if (charCount <= 2) return sz.w[0];
  if (charCount === 3) return sz.w[1];
  return sz.w[2];
}


// ── TreatmentBadge ─────────────────────────────────────────
// The atom. Renders a single treatment as a mono code in a rounded rect.
//
// Props:
//   type:  treatment type key (e.g. 'bus_lane')
//   state: 'active' | 'planned' | 'proposed' | 'source_gap' | …
//   size:  'xs' | 'sm' | 'md' | 'lg'
//   tone:  optional override — 'ink' (default) | 'accent' | 'good' | 'warn'
//          'family' colors active badges by the treatment's family
function TreatmentBadge({ type, state = 'active', size = 'md', tone = 'ink' }) {
  const def = TREATMENTS[type];
  const code = TREATMENT_CODES[type] || (type ? type.slice(0, 2).toUpperCase() : '?');
  const sz = TBADGE_SIZES[size] || TBADGE_SIZES.md;
  const w = tbadgeWidth(sz, code.length);

  // Tone palette resolver. 'family' picks per-family.
  const familyToneMap = {
    street: 'ink',
    enf:    'accent',
    sig:    'ink',
    stop:   'ink',
    svc:    'ink',
    curb:   'warn',
    prog:   'ink',
  };
  const effectiveTone =
    tone === 'family'
      ? (def ? familyToneMap[def.family] || 'ink' : 'ink')
      : tone;

  const toneFill =
    effectiveTone === 'accent' ? BPI.accent :
    effectiveTone === 'good'   ? BPI.good   :
    effectiveTone === 'warn'   ? BPI.warn   :
    BPI.ink;

  const isActive       = STATES[state]?.present === true;
  const isGap          = state === 'source_gap';
  const isProspective  = state === 'planned' || state === 'proposed';
  const isFuture       = state === 'future';
  const isHistorical   = state === 'historical_context';

  let bg, color, border, fontStyle = 'normal';
  if (isActive) {
    bg = toneFill;
    color = BPI.paper;
    border = 'none';
  } else if (isGap) {
    bg = 'transparent';
    color = BPI.warn;
    border = `1.4px dashed ${BPI.warn}`;
  } else if (isProspective) {
    bg = 'transparent';
    color = toneFill;
    border = `1.4px dashed ${toneFill}`;
  } else if (isFuture) {
    bg = 'transparent';
    color = BPI.ink55;
    border = `1.4px dashed ${BPI.ink40}`;
    fontStyle = 'italic';
  } else if (isHistorical) {
    bg = 'transparent';
    color = BPI.ink40;
    border = `1px solid ${BPI.ink20}`;
  } else {
    // unknown
    bg = 'transparent';
    color = BPI.ink40;
    border = `1px solid ${BPI.ink20}`;
  }

  return (
    <span title={def ? def.label : code} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      height: sz.h, width: w,
      borderRadius: sz.r,
      background: bg, color, border,
      fontFamily: BPIMono, fontWeight: 700, fontSize: sz.fs,
      letterSpacing: '0.04em', lineHeight: 1, fontStyle,
      fontVariantNumeric: 'tabular-nums',
      whiteSpace: 'nowrap', flexShrink: 0,
      boxSizing: 'border-box',
    }}>
      {code}
    </span>
  );
}


// ── TreatmentBadgeStrip ────────────────────────────────────
// V3 of the compact strip. Three family slots — Street · Enforcement ·
// Signals — each showing the headline treatment's badge, with +N for
// the rest. Tiny family label below each slot so the column is named.
//
// Replaces TreatmentStrip / TreatmentIconStrip on SegmentRow.
function TreatmentBadgeStrip({
  treatments,
  legacy,
  size = 'md',
  align = 'flex-end',
  showFamilyLabels = true,
  tone = 'ink',
}) {
  const data = treatments && treatments.length ? treatments
              : legacy ? legacyToTreatments(legacy) : [];
  const groups = groupByFamily(data);
  const [open, setOpen] = React.useState(false);
  const hidden = FAMILY_ORDER.filter(f => !VISIBLE_FAMILIES.includes(f));
  const hiddenCount = hidden.reduce((n, fid) => n + (groups[fid]?.length || 0), 0);

  return (
    <div style={{
      position: 'relative', display: 'flex',
      alignItems: 'flex-start', gap: 8, justifyContent: align,
    }}>
      {VISIBLE_FAMILIES.map(fid => {
        const head = familyHeadline(groups[fid]);
        const fam = FAMILY_BY_ID[fid];
        return (
          <div key={fid} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            minWidth: 32,
          }}>
            {head ? (
              <TreatmentBadge type={head.type} state={head.state} size={size} tone={tone} />
            ) : (
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                height: TBADGE_SIZES[size].h,
                width: TBADGE_SIZES[size].w[0],
                borderRadius: TBADGE_SIZES[size].r,
                border: `1px dashed ${BPI.ink20}`,
                color: BPI.ink40, fontFamily: BPIMono, fontSize: TBADGE_SIZES[size].fs,
                fontWeight: 700, letterSpacing: '0.04em',
              }}>—</span>
            )}
            {showFamilyLabels && (
              <span style={{
                fontSize: 8.5, color: head ? BPI.ink55 : BPI.ink40,
                letterSpacing: '0.08em', fontWeight: 700,
                textTransform: 'uppercase', fontFamily: BPIFonts,
              }}>{fam.short}</span>
            )}
          </div>
        );
      })}
      {hiddenCount > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 32 }}>
          <button onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }} style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            height: TBADGE_SIZES[size].h,
            minWidth: TBADGE_SIZES[size].w[0],
            padding: '0 6px',
            borderRadius: TBADGE_SIZES[size].r,
            background: BPI.ink06, border: 'none', cursor: 'pointer',
            color: BPI.ink70, fontFamily: BPIMono,
            fontWeight: 700, fontSize: TBADGE_SIZES[size].fs,
            letterSpacing: '0.04em',
          }}>+{hiddenCount}</button>
          {showFamilyLabels && (
            <span style={{
              fontSize: 8.5, color: BPI.ink55,
              letterSpacing: '0.08em', fontWeight: 700,
              textTransform: 'uppercase', fontFamily: BPIFonts,
            }}>MORE</span>
          )}
        </div>
      )}
      {open && (
        <OverflowPopover
          groups={groups}
          hiddenFamilies={hidden}
          onClose={() => setOpen(false)}
          anchorRight={align !== 'flex-start'}
        />
      )}
    </div>
  );
}


// ── TreatmentBadgeRow ──────────────────────────────────────
// All present treatments as badges in flow, sorted by family. Densest
// reading; for tight contexts (search results, ladder rungs, table cells).
function TreatmentBadgeRow({ treatments, legacy, max = 6, size = 'sm', align = 'flex-end', tone = 'ink' }) {
  const data = treatments && treatments.length ? treatments
              : legacy ? legacyToTreatments(legacy) : [];
  const sorted = [...data]
    .map(t => ({ ...t, def: TREATMENTS[t.type] }))
    .filter(t => t.def)
    .sort((a, b) => {
      const aPres = STATES[a.state]?.present === true ? 0 : 1;
      const bPres = STATES[b.state]?.present === true ? 0 : 1;
      if (aPres !== bPres) return aPres - bPres;
      const fa = FAMILY_ORDER.indexOf(a.def.family);
      const fb = FAMILY_ORDER.indexOf(b.def.family);
      if (fa !== fb) return fa - fb;
      return a.def.headlinePriority - b.def.headlinePriority;
    });
  const visible = sorted.slice(0, max);
  const overflow = sorted.length - visible.length;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      justifyContent: align, flexWrap: 'wrap',
    }}>
      {visible.map((t, i) => (
        <TreatmentBadge key={i} type={t.type} state={t.state} size={size} tone={tone} />
      ))}
      {overflow > 0 && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          height: TBADGE_SIZES[size].h,
          minWidth: TBADGE_SIZES[size].w[0],
          padding: '0 6px',
          borderRadius: TBADGE_SIZES[size].r,
          background: BPI.ink06, color: BPI.ink70,
          fontFamily: BPIMono, fontWeight: 700, fontSize: TBADGE_SIZES[size].fs,
          letterSpacing: '0.04em',
        }}>+{overflow}</span>
      )}
    </div>
  );
}


// ── TreatmentBadgeChip ─────────────────────────────────────
// Badge + full name pill — for inventories, popovers, and copy where
// the label needs to read in full. Same visual class as TreatmentChip
// but built on the badge instead of an SVG glyph.
function TreatmentBadgeChip({ type, state = 'active', size = 'sm', showLabel = true }) {
  const def = TREATMENTS[type];
  if (!def) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: BPIFonts, fontSize: 12, color: BPI.ink,
    }}>
      <TreatmentBadge type={type} state={state} size={size} />
      {showLabel && (
        <span style={{
          fontWeight: 500,
          color: STATES[state]?.present ? BPI.ink : BPI.ink55,
          letterSpacing: '-0.005em',
        }}>{def.label}</span>
      )}
    </span>
  );
}


// ── TreatmentBadgeChipStack ────────────────────────────────
// Like TreatmentChipStack but using badges. Each present treatment
// appears as `[BADGE] Label`, sorted by family/priority. Overflow → +N.
function TreatmentBadgeChipStack({ treatments, legacy, max = 4, align = 'flex-start' }) {
  const data = treatments && treatments.length ? treatments
              : legacy ? legacyToTreatments(legacy) : [];
  const groups = groupByFamily(data);
  const [open, setOpen] = React.useState(false);
  const sorted = [...data]
    .map(t => ({ ...t, def: TREATMENTS[t.type] }))
    .filter(t => t.def)
    .sort((a, b) => {
      const aPres = STATES[a.state]?.present === true ? 0 : 1;
      const bPres = STATES[b.state]?.present === true ? 0 : 1;
      if (aPres !== bPres) return aPres - bPres;
      const fa = FAMILY_ORDER.indexOf(a.def.family);
      const fb = FAMILY_ORDER.indexOf(b.def.family);
      if (fa !== fb) return fa - fb;
      return a.def.headlinePriority - b.def.headlinePriority;
    });
  const visible = sorted.slice(0, max);
  const overflow = sorted.length - visible.length;
  const overflowFamilies = Array.from(new Set(sorted.slice(max).map(t => t.def.family)));
  const hiddenGroups = Object.fromEntries(
    overflowFamilies.map(fid => [fid, sorted.slice(max).filter(t => t.def.family === fid)])
  );
  return (
    <div style={{
      position: 'relative',
      display: 'inline-flex', alignItems: 'center',
      gap: 12, flexWrap: 'wrap', justifyContent: align,
    }}>
      {visible.map((t, i) => (
        <TreatmentBadgeChip key={i} type={t.type} state={t.state} size="sm" />
      ))}
      {overflow > 0 && (
        <button onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }} style={{
          display: 'inline-flex', alignItems: 'center', height: 22,
          padding: '0 8px', borderRadius: 3,
          background: BPI.ink06, border: 'none', cursor: 'pointer',
          fontFamily: BPIMono, fontSize: 11, fontWeight: 700,
          color: BPI.ink70, letterSpacing: '0.04em',
        }}>
          +{overflow} more
        </button>
      )}
      {open && overflow > 0 && (
        <OverflowPopover
          groups={hiddenGroups}
          hiddenFamilies={overflowFamilies}
          onClose={() => setOpen(false)}
          anchorRight={align !== 'flex-start'}
        />
      )}
    </div>
  );
}


// Exports
Object.assign(window, {
  TREATMENT_CODES, TBADGE_SIZES,
  TreatmentBadge,
  TreatmentBadgeStrip, TreatmentBadgeRow,
  TreatmentBadgeChip, TreatmentBadgeChipStack,
});
