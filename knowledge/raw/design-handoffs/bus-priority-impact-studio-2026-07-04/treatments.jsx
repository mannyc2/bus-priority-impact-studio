// ─────────────────────────────────────────────────────────────
// TREATMENTS & INTERVENTIONS
//
// Two-layer model:
//   • Interventions = dated, source-backed events / milestones.
//     (launches, scope changes, capital project milestones, proposals)
//   • Treatments    = physical / operational things present today
//                     on a route, corridor, segment, stop, or intersection.
//
// One canonical taxonomy. Families control compact display order.
// Compact display = max 3 family slots visible (Street · Enforcement ·
// Signals) + `+N` overflow chip. The +N opens a popover grouped by family.
//
// State vocabulary on each treatment:
//   active · implemented · pilot · planned · proposed
//   future · historical_context · source_gap · unknown
//
// Scope vocabulary (where it applies):
//   route · corridor · segment · stop · intersection · zone
//
// IMPORTANT: this module is conservative — it does not assert sources.
// Treatments are tagged with `source` or `evidence` separately by callers.
// ─────────────────────────────────────────────────────────────

// ── FAMILIES ────────────────────────────────────────────────
// Priority order is fixed: this is the order they appear in compact rows,
// the order they sort in the inventory, and which three claim the visible
// slots before overflow kicks in.
const FAMILIES = [
  { id: 'street', label: 'Street priority',    short: 'Street'    },
  { id: 'enf',    label: 'Enforcement',         short: 'Enforce'   },
  { id: 'sig',    label: 'Signals',             short: 'Signals'   },
  { id: 'stop',   label: 'Stops & boarding',    short: 'Stops'     },
  { id: 'svc',    label: 'Service pattern',     short: 'Service'   },
  { id: 'curb',   label: 'Curb & safety',       short: 'Curb'      },
  { id: 'prog',   label: 'Program / capital',   short: 'Program'   },
];
const FAMILY_BY_ID = Object.fromEntries(FAMILIES.map(f => [f.id, f]));
const FAMILY_ORDER = FAMILIES.map(f => f.id);

// ── TREATMENT CATALOG ───────────────────────────────────────
// Every supported treatment type. `headlinePriority` orders treatments
// within a family when picking the "headline" item for compact display.
// `scopes` lists where it can apply (any subset of the scope vocabulary).
const TREATMENTS = {
  // STREET PRIORITY ─────────────────────────────────
  busway:          { family: 'street', label: 'Busway',             scopes: ['segment','corridor'],    headlinePriority: 1, intensity: 4 },
  offset_lane:     { family: 'street', label: 'Offset bus lane',    scopes: ['segment','corridor'],    headlinePriority: 2, intensity: 3 },
  bus_lane:        { family: 'street', label: 'Bus lane',           scopes: ['segment','corridor'],    headlinePriority: 3, intensity: 2 },
  median_station:  { family: 'street', label: 'Median station',     scopes: ['stop','corridor'],       headlinePriority: 4, intensity: 3 },
  boarding_island: { family: 'street', label: 'Boarding island',    scopes: ['stop'],                  headlinePriority: 5, intensity: 2 },

  // ENFORCEMENT ─────────────────────────────────────
  ace:             { family: 'enf',    label: 'ACE cameras',        scopes: ['route','corridor'],      headlinePriority: 1, intensity: 3 },
  bus_mounted_cam: { family: 'enf',    label: 'Bus-mounted camera', scopes: ['route'],                 headlinePriority: 2, intensity: 2 },
  nypd_enforcement:{ family: 'enf',    label: 'NYPD enforcement',   scopes: ['segment','corridor'],    headlinePriority: 3, intensity: 1 },

  // SIGNALS ─────────────────────────────────────────
  tsp:             { family: 'sig',    label: 'TSP',                scopes: ['intersection','corridor'], headlinePriority: 1, intensity: 3 },
  queue_jump:      { family: 'sig',    label: 'Queue jump',         scopes: ['intersection'],          headlinePriority: 2, intensity: 2 },
  dedicated_phase: { family: 'sig',    label: 'Dedicated bus phase',scopes: ['intersection'],          headlinePriority: 3, intensity: 2 },
  signal_retiming: { family: 'sig',    label: 'Signal retiming',    scopes: ['corridor','intersection'], headlinePriority: 4, intensity: 1 },
  turn_restriction:{ family: 'sig',    label: 'Turn restriction',   scopes: ['intersection','segment'], headlinePriority: 5, intensity: 1 },

  // STOPS & BOARDING ────────────────────────────────
  stop_consolidation:{ family: 'stop', label: 'Stop consolidation', scopes: ['route','corridor'],      headlinePriority: 1, intensity: 2 },
  off_board_fare:    { family: 'stop', label: 'Off-board fare',     scopes: ['route'],                 headlinePriority: 2, intensity: 2 },
  all_door:          { family: 'stop', label: 'All-door boarding',  scopes: ['route'],                 headlinePriority: 3, intensity: 2 },
  bus_bulb:          { family: 'stop', label: 'Bus bulb',           scopes: ['stop'],                  headlinePriority: 4, intensity: 1 },
  shelter_rtpi:      { family: 'stop', label: 'Shelter / RTPI',     scopes: ['stop'],                  headlinePriority: 5, intensity: 1 },

  // SERVICE PATTERN ─────────────────────────────────
  sbs:             { family: 'svc',    label: 'SBS',                scopes: ['route','corridor'],      headlinePriority: 1, intensity: 3 },
  limited:         { family: 'svc',    label: 'Limited',            scopes: ['route'],                 headlinePriority: 2, intensity: 2 },
  route_restructure:{ family: 'svc',   label: 'Route restructure',  scopes: ['route'],                 headlinePriority: 3, intensity: 2 },

  // CURB / ACCESS / SAFETY ──────────────────────────
  daylighting:     { family: 'curb',   label: 'Daylighting',        scopes: ['intersection'],          headlinePriority: 1, intensity: 1 },
  hardened_center: { family: 'curb',   label: 'Hardened centerline',scopes: ['segment'],               headlinePriority: 2, intensity: 1 },
  curb_management: { family: 'curb',   label: 'Curb management',    scopes: ['segment'],               headlinePriority: 3, intensity: 1 },
  loading_zone:    { family: 'curb',   label: 'Loading-zone change',scopes: ['segment'],               headlinePriority: 4, intensity: 1 },

  // PROGRAM / CAPITAL MILESTONE ─────────────────────
  capital_milestone:{ family: 'prog',  label: 'Capital milestone',  scopes: ['corridor','zone'],       headlinePriority: 1, intensity: 1 },
  proposal:         { family: 'prog',  label: 'Proposal',           scopes: ['corridor','zone'],       headlinePriority: 2, intensity: 1 },
};

// ── STATE VOCABULARY ────────────────────────────────────────
// Tone is the visual key. Filled/outlined comes from `present`.
// `present` = is this thing real on the ground right now? Active &
// implemented are. Proposed, planned, future, historical, gaps are not.
const STATES = {
  active:             { label: 'Active',             tone: 'good',   present: true,  short: 'Active'  },
  implemented:        { label: 'Implemented',        tone: 'good',   present: true,  short: 'In place'},
  pilot:              { label: 'Pilot',              tone: 'accent', present: true,  short: 'Pilot'   },
  planned:            { label: 'Planned',            tone: 'warn',   present: false, short: 'Planned' },
  proposed:           { label: 'Proposed',           tone: 'warn',   present: false, short: 'Proposed'},
  future:             { label: 'Future',             tone: 'neutral',present: false, short: 'Future'  },
  historical_context: { label: 'Historical context', tone: 'neutral',present: false, short: 'Hist.'   },
  source_gap:         { label: 'Source gap',         tone: 'gap',    present: null,  short: 'Source gap' },
  unknown:            { label: 'Unknown',            tone: 'neutral',present: null,  short: 'Unknown' },
};

// Evaluation states — separate axis. A treatment can be active+not_evaluated.
const EVAL_STATES = {
  evaluated:                 { label: 'Evaluated',                 tone: 'good'    },
  insufficient_pre_data:     { label: 'Insufficient pre-data',     tone: 'warn'    },
  insufficient_post_data:    { label: 'Insufficient post-data',    tone: 'warn'    },
  not_evaluated_future:      { label: 'Not yet — future',          tone: 'neutral' },
  not_evaluated_source_gap:  { label: 'Not evaluated — source gap',tone: 'gap'     },
};

// ── HELPERS ─────────────────────────────────────────────────
// Tone → palette resolver. Single point of truth for tone colors.
function toneColors(tone) {
  const map = {
    good:    { fg: BPI.good,    bg: BPI.goodBg,   ink: BPI.good   },
    warn:    { fg: BPI.warn,    bg: BPI.warnBg,   ink: BPI.warn   },
    bad:     { fg: BPI.bad,     bg: BPI.badBg,    ink: BPI.bad    },
    accent:  { fg: BPI.accent,  bg: BPI.accentBg, ink: BPI.accent },
    neutral: { fg: BPI.ink55,   bg: BPI.ink06,    ink: BPI.ink70  },
    gap:     { fg: BPI.warn,    bg: BPI.warnBg,   ink: BPI.warn   },
  };
  return map[tone] || map.neutral;
}

// Group a list of {type, state, ...} treatments by family.
// Preserves family order and headlinePriority within each family.
function groupByFamily(treatments = []) {
  const groups = Object.fromEntries(FAMILIES.map(f => [f.id, []]));
  for (const t of treatments) {
    const def = TREATMENTS[t.type];
    if (!def) continue;
    groups[def.family].push({ ...t, def });
  }
  for (const id of Object.keys(groups)) {
    groups[id].sort((a, b) => a.def.headlinePriority - b.def.headlinePriority);
  }
  return groups;
}

// Pick the "headline" treatment for a family for compact display.
// Prefers treatments that are present (active/implemented/pilot) over
// non-present ones, then sorts by headlinePriority. Returns undefined
// if the family is empty.
function headlineFor(familyGroup) {
  if (!familyGroup || !familyGroup.length) return undefined;
  const present = familyGroup.filter(t => STATES[t.state]?.present === true);
  const pool = present.length ? present : familyGroup;
  return pool[0];
}

// Summary for a single family slot: returns
//   { presence: 'full' | 'partial' | 'none' | 'gap', headline, count, present, total }
// presence rules:
//   full    — at least one present treatment, no source gap
//   partial — there are treatments but headline is non-present (planned/etc)
//   gap     — at least one treatment is a source gap and nothing is present
//   none    — family is empty
function familySummary(familyGroup) {
  if (!familyGroup || !familyGroup.length) {
    return { presence: 'none', headline: undefined, count: 0, present: 0, total: 0 };
  }
  const total = familyGroup.length;
  const present = familyGroup.filter(t => STATES[t.state]?.present === true).length;
  const anyGap = familyGroup.some(t => t.state === 'source_gap');
  const headline = headlineFor(familyGroup);
  let presence = 'none';
  if (present > 0) presence = present === total ? 'full' : 'partial';
  else if (anyGap) presence = 'gap';
  else presence = 'partial'; // there are planned/proposed/etc.
  return { presence, headline, count: total, present, total };
}

// Coerce legacy {lane, ace, tsp} shorthand into the canonical treatments
// array. Used for backward compatibility on surfaces that haven't migrated.
function legacyToTreatments({ lane = 'none', ace = false, tsp = false } = {}) {
  const out = [];
  if (lane === 'yes')      out.push({ type: 'bus_lane', state: 'active',      coverage: 1.0 });
  else if (lane === 'partial') out.push({ type: 'bus_lane', state: 'active', coverage: 0.5 });
  else if (lane === 'minimal') out.push({ type: 'bus_lane', state: 'active', coverage: 0.2 });
  if (ace === true || ace === 'yes')     out.push({ type: 'ace', state: 'active' });
  else if (ace === 'partial')             out.push({ type: 'ace', state: 'active', note: 'Peak only' });
  if (tsp === true || tsp === 'yes')     out.push({ type: 'tsp', state: 'active' });
  return out;
}


// ─────────────────────────────────────────────────────────────
// COMPACT PRIMITIVES
// ─────────────────────────────────────────────────────────────

// FamilyGlyph — a small visual indicator for one family slot.
// Style variants (`variant` prop):
//   'bar'  — three-tick coverage bar (default; matches legacy LaneGlyph)
//   'dot'  — single filled/outlined dot (matches legacy DotGlyph)
//   'mono' — small mono letter chip (compact for tight rows)
//
// Presence states:
//   full    — solid filled
//   partial — half-filled / outlined fill
//   gap     — dashed outline
//   none    — outlined, ink20
function FamilyGlyph({ variant = 'bar', presence = 'none', tone = 'good', label }) {
  const c = toneColors(tone);
  const color =
    presence === 'full'    ? c.fg :
    presence === 'partial' ? c.fg :
    presence === 'gap'     ? BPI.warn :
                              BPI.ink20;
  if (variant === 'dot') {
    const filled = presence === 'full' || presence === 'partial';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <div style={{ height: 10, display: 'flex', alignItems: 'center' }}>
          <div style={{
            width: 9, height: 9, borderRadius: 5,
            background: filled ? color : 'transparent',
            boxShadow: filled
              ? 'none'
              : presence === 'gap'
                ? `inset 0 0 0 1.2px ${BPI.warn}`
                : `inset 0 0 0 1.2px ${BPI.ink20}`,
            opacity: presence === 'partial' ? 0.55 : 1,
          }} />
        </div>
        {label && <GlyphLabel text={label} presence={presence} />}
      </div>
    );
  }
  if (variant === 'mono') {
    const filled = presence === 'full' || presence === 'partial';
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center',
        height: 18, padding: '0 6px', borderRadius: 2,
        background: filled ? c.bg : 'transparent',
        boxShadow: filled ? `inset 0 0 0 1px ${c.fg}` : `inset 0 0 0 1px ${BPI.ink20}`,
        fontFamily: BPIMono, fontSize: 10, fontWeight: 700,
        letterSpacing: '0.06em', color: filled ? c.fg : BPI.ink40,
      }}>{label || '·'}</div>
    );
  }
  // 'bar' (default) — three ticks; fill count reflects presence
  const fillCount =
    presence === 'full'    ? 3 :
    presence === 'partial' ? 2 :
    presence === 'gap'     ? 0 : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ display: 'flex', gap: 1.5, height: 10 }}>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} style={{
            width: 5, height: 10, borderRadius: 1,
            background: i < fillCount ? color : 'transparent',
            boxShadow: i < fillCount
              ? 'none'
              : presence === 'gap'
                ? `inset 0 0 0 1px ${BPI.warn}`
                : `inset 0 0 0 1px ${BPI.ink20}`,
            opacity: presence === 'gap' && i < 3 ? 0.6 : 1,
          }} />
        ))}
      </div>
      {label && <GlyphLabel text={label} presence={presence} />}
    </div>
  );
}

function GlyphLabel({ text, presence }) {
  const dim = presence === 'none' || presence === 'gap';
  return (
    <div style={{
      fontSize: 8.5, color: dim ? BPI.ink40 : BPI.ink70,
      letterSpacing: '0.08em', fontWeight: 700, fontFamily: BPIFonts,
      whiteSpace: 'nowrap',
    }}>{text}</div>
  );
}

// OverflowChip — `+N` for treatments beyond the three visible family slots.
// Click opens a popover listing remaining families and their treatments.
function OverflowChip({ groups, hiddenFamilies, onClick }) {
  const totalHidden = hiddenFamilies.reduce(
    (n, fid) => n + (groups[fid]?.length || 0), 0
  );
  if (totalHidden === 0) return null;
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      height: 18, padding: '0 6px', borderRadius: 2,
      background: BPI.ink06, border: 'none',
      fontFamily: BPIMono, fontSize: 10, fontWeight: 700,
      color: BPI.ink70, cursor: 'pointer',
      letterSpacing: '0.04em',
    }} title={`${totalHidden} more across ${hiddenFamilies.filter(f => groups[f]?.length).length} more families`}>
      +{totalHidden}
    </button>
  );
}

// OverflowPopover — small panel listing the remaining families' treatments.
// Caller controls open/close. Position-absolute so it floats above the row.
function OverflowPopover({ groups, hiddenFamilies, onClose, anchorRight }) {
  const present = hiddenFamilies.filter(f => groups[f]?.length);
  if (!present.length) return null;
  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 40, background: 'transparent',
      }} />
      <div style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        [anchorRight ? 'right' : 'left']: 0,
        zIndex: 41,
        minWidth: 240, maxWidth: 320,
        background: BPI.cardRaised,
        boxShadow: `0 0 0 1px ${BPI.rule}, 0 12px 32px rgba(22,20,15,.10)`,
        borderRadius: 4, padding: 12,
      }}>
        <div className="eyebrow" style={{ marginBottom: 8, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Other treatments
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {present.map(fid => {
            const fam = FAMILY_BY_ID[fid];
            return (
              <div key={fid}>
                <div style={{ fontSize: 10, color: BPI.ink55, letterSpacing: '0.06em',
                  textTransform: 'uppercase', fontWeight: 700, marginBottom: 4,
                }}>{fam.label}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {groups[fid].map((t, i) => (
                    <TreatmentLine key={i} t={t} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function TreatmentLine({ t }) {
  const st = STATES[t.state] || STATES.unknown;
  const c = toneColors(st.tone);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <div style={{
        width: 7, height: 7, borderRadius: 4,
        background: st.present ? c.fg : 'transparent',
        boxShadow: st.present ? 'none' : `inset 0 0 0 1.2px ${st.tone === 'gap' ? BPI.warn : BPI.ink20}`,
        flexShrink: 0,
      }} />
      <span style={{ color: BPI.ink, flex: 1, lineHeight: 1.3 }}>{t.def.label}</span>
      <span style={{
        fontSize: 10, fontFamily: BPIMono, color: c.ink,
        letterSpacing: '0.04em', fontWeight: 600,
      }}>{st.short}</span>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// TREATMENT STRIP — the canonical compact display.
// Always renders Street · Enforcement · Signals as the three visible
// slots (in that order). Other families fold into the +N chip.
//
// `treatments`: array of { type, state, ... } objects (preferred)
// `legacy`:     { lane, ace, tsp } shorthand (fallback)
//
// `variant` selects the glyph style ('bar' | 'dot' | 'mono' | 'mixed').
// 'mixed' (default) uses bar for street (carries coverage), dot for
// enforcement, dot for signals — matches the existing visual DNA.
// ─────────────────────────────────────────────────────────────
const VISIBLE_FAMILIES = ['street', 'enf', 'sig'];

function TreatmentStrip({
  treatments,
  legacy,
  variant = 'mixed',
  align = 'flex-end',
  showLabels = true,
}) {
  const data = treatments && treatments.length ? treatments
              : legacy ? legacyToTreatments(legacy) : [];
  const groups = groupByFamily(data);
  const [open, setOpen] = React.useState(false);

  const slot = (fid, glyphVariant, label) => {
    const summary = familySummary(groups[fid]);
    const headlineLabel = summary.headline?.def.label || label;
    // Short label rule: use treatment label if present, else the family short
    // (capped to keep glyph column tidy). Lane-coverage tweaks the bar fill.
    return (
      <FamilyGlyph
        key={fid}
        variant={glyphVariant}
        presence={summary.presence}
        tone={fid === 'enf' ? 'accent' : 'good'}
        label={showLabels ? abbrev(headlineLabel) : undefined}
      />
    );
  };

  const variants = variant === 'mixed'
    ? { street: 'bar', enf: 'dot', sig: 'dot' }
    : { street: variant, enf: variant, sig: variant };

  const hidden = FAMILY_ORDER.filter(f => !VISIBLE_FAMILIES.includes(f));
  const hiddenCount = hidden.reduce((n, fid) => n + (groups[fid]?.length || 0), 0);

  return (
    <div style={{ position: 'relative', display: 'flex',
      alignItems: 'flex-start', gap: 14, justifyContent: align,
    }}>
      {slot('street', variants.street, 'Lane')}
      {slot('enf',    variants.enf,    'ACE')}
      {slot('sig',    variants.sig,    'TSP')}
      {hiddenCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', height: 18 }}>
          <OverflowChip
            groups={groups}
            hiddenFamilies={hidden}
            onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
          />
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

// Abbreviate treatment labels for compact glyph captions.
// Keeps them readable when shoved into a tight column.
function abbrev(label) {
  if (!label) return label;
  const map = {
    'Bus lane': 'LANE',
    'Offset bus lane': 'OFFSET',
    'Busway': 'BUSWAY',
    'Median station': 'MEDIAN',
    'Boarding island': 'ISLAND',
    'ACE cameras': 'ACE',
    'Bus-mounted camera': 'BUS-CAM',
    'NYPD enforcement': 'NYPD',
    'TSP': 'TSP',
    'Queue jump': 'QJUMP',
    'Dedicated bus phase': 'PHASE',
    'Signal retiming': 'RETIME',
    'Turn restriction': 'TURN',
  };
  return map[label] || label.toUpperCase();
}


// ─────────────────────────────────────────────────────────────
// V2 COMPACT PRIMITIVES — glyph-aware.
//
// These use TreatmentIcon (from treatment-glyphs.jsx) so each treatment
// renders with its own distinct visual identity instead of a generic
// bar/dot. The "3 visible + N" structural rule is preserved.
// ─────────────────────────────────────────────────────────────

// Resolve the headline treatment for a family slot. Returns
// { type, state, def } or null if the family is empty.
function familyHeadline(familyGroup) {
  if (!familyGroup || !familyGroup.length) return null;
  const present = familyGroup.filter(t => STATES[t.state]?.present === true);
  const pool = present.length ? present : familyGroup;
  return pool[0];
}

// One slot in the icon trio — renders the family's headline glyph with
// its real treatment label below. Empty slot is a thin outlined square
// so the row keeps its rhythm.
function TreatmentSlot({ familyId, group, showLabel = true }) {
  const head = familyHeadline(group);
  const fam = FAMILY_BY_ID[familyId];
  if (!head) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 4, opacity: 0.45,
      }}>
        <div style={{
          width: 20, height: 20, borderRadius: 2,
          boxShadow: `inset 0 0 0 1px ${BPI.ink20}`,
        }} />
        {showLabel && (
          <div style={{
            fontSize: 8.5, color: BPI.ink40, letterSpacing: '0.08em',
            fontWeight: 700, fontFamily: BPIFonts,
          }}>—</div>
        )}
      </div>
    );
  }
  const isPresent = STATES[head.state]?.present === true;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    }} title={`${fam.label} · ${head.def.label}`}>
      <TreatmentIcon type={head.type} state={head.state} size={20} />
      {showLabel && (
        <div style={{
          fontSize: 8.5,
          color: isPresent ? BPI.ink70 : BPI.ink40,
          letterSpacing: '0.06em', fontWeight: 700, fontFamily: BPIFonts,
          whiteSpace: 'nowrap',
        }}>
          {abbrev(head.def.label)}
        </div>
      )}
    </div>
  );
}

// TreatmentIconStrip — V2 of the compact strip. Three family slots
// (Street · Enforcement · Signals) each showing the headline treatment's
// real glyph, with +N chip for the rest.
function TreatmentIconStrip({ treatments, legacy, align = 'flex-end', showLabels = true }) {
  const data = treatments && treatments.length ? treatments
              : legacy ? legacyToTreatments(legacy) : [];
  const groups = groupByFamily(data);
  const [open, setOpen] = React.useState(false);
  const hidden = FAMILY_ORDER.filter(f => !VISIBLE_FAMILIES.includes(f));
  const hiddenCount = hidden.reduce((n, fid) => n + (groups[fid]?.length || 0), 0);
  return (
    <div style={{
      position: 'relative', display: 'flex',
      alignItems: 'flex-start', gap: 14, justifyContent: align,
    }}>
      {VISIBLE_FAMILIES.map(fid => (
        <TreatmentSlot key={fid} familyId={fid} group={groups[fid]} showLabel={showLabels} />
      ))}
      {hiddenCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', height: 20 }}>
          <OverflowChip
            groups={groups}
            hiddenFamilies={hidden}
            onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
          />
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

// TreatmentChip — a single small pill carrying a glyph + label, state-aware.
// Drop-in for compact contexts where one or two treatments need to be named.
function TreatmentChip({ type, state = 'active', size = 16, showLabel = true }) {
  const def = TREATMENTS[type];
  if (!def) return null;
  const st = STATES[state] || STATES.unknown;
  const c = toneColors(st.tone);
  const present = st.present === true;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 7px 2px 4px', borderRadius: 3,
      background: present ? c.bg : 'transparent',
      boxShadow: `inset 0 0 0 1px ${present ? c.fg : BPI.ink20}`,
      color: present ? c.ink : BPI.ink55,
      fontSize: 11, fontWeight: 600,
      letterSpacing: '-0.005em', whiteSpace: 'nowrap',
      lineHeight: 1, fontFamily: BPIFonts,
    }}>
      <TreatmentIcon type={type} state={state} size={size} />
      {showLabel && <span>{def.label}</span>}
    </span>
  );
}

// TreatmentChipStack — horizontal flow of TreatmentChips, sorted by
// family then headline priority, with +N overflow. Public-facing-friendly
// alternative to the icon strip.
function TreatmentChipStack({ treatments, legacy, max = 4, showLabels = true, align = 'flex-start' }) {
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
  // Build hiddenFamilies for the popover from the overflow tail
  const overflowFamilies = Array.from(new Set(sorted.slice(max).map(t => t.def.family)));
  const hiddenGroups = Object.fromEntries(
    overflowFamilies.map(fid => [fid, sorted.slice(max).filter(t => t.def.family === fid)])
  );
  return (
    <div style={{
      position: 'relative',
      display: 'inline-flex', alignItems: 'center', gap: 5,
      flexWrap: 'wrap', justifyContent: align,
    }}>
      {visible.map((t, i) => (
        <TreatmentChip key={i} type={t.type} state={t.state} showLabel={showLabels} />
      ))}
      {overflow > 0 && (
        <button onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }} style={{
          display: 'inline-flex', alignItems: 'center', height: 22,
          padding: '0 8px', borderRadius: 3,
          background: BPI.ink06, border: 'none', cursor: 'pointer',
          fontFamily: BPIMono, fontSize: 10.5, fontWeight: 700,
          color: BPI.ink70, letterSpacing: '0.04em',
        }}>
          +{overflow}
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

// TreatmentIconRow — all present treatments as glyph-only icons, no labels.
// Densest reading; use when there's no room for text but the user can
// hover to learn what each is. Caps at `max` then +N.
function TreatmentIconRow({ treatments, legacy, max = 6, size = 18, align = 'flex-end' }) {
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
      display: 'inline-flex', alignItems: 'center', gap: 8,
      justifyContent: align,
    }}>
      {visible.map((t, i) => (
        <span key={i} title={`${t.def.label}${t.state !== 'active' ? ` · ${STATES[t.state]?.label || t.state}` : ''}`}>
          <TreatmentIcon type={t.type} state={t.state} size={size} />
        </span>
      ))}
      {overflow > 0 && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', height: 20,
          padding: '0 6px', borderRadius: 2, background: BPI.ink06,
          fontFamily: BPIMono, fontSize: 10, fontWeight: 700,
          color: BPI.ink70, letterSpacing: '0.04em',
        }}>+{overflow}</span>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// COMPACT VARIATIONS — alternates to the headline-glyph strip,
// for the design-canvas exploration section.
// ─────────────────────────────────────────────────────────────

// Variation B — Family-bar: 7 ticks, one per family, no labels.
// Reads as a holistic priority "fingerprint" — dense, abstract.
function FamilyFingerprint({ treatments, legacy }) {
  const data = treatments && treatments.length ? treatments
              : legacy ? legacyToTreatments(legacy) : [];
  const groups = groupByFamily(data);
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2,
      padding: '4px 6px', background: BPI.paper, borderRadius: 2,
      boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
    }} title={FAMILIES.map(f => `${f.short}: ${groups[f.id].length}`).join('  ·  ')}>
      {FAMILIES.map(f => {
        const s = familySummary(groups[f.id]);
        const filled = s.presence === 'full' || s.presence === 'partial';
        const color = filled ? BPI.ink : BPI.ink20;
        return (
          <div key={f.id} style={{
            width: 4, height: 12, borderRadius: 1,
            background: filled ? color : 'transparent',
            boxShadow: filled ? 'none' : `inset 0 0 0 1px ${BPI.ink20}`,
            opacity: s.presence === 'partial' ? 0.55 : 1,
          }} />
        );
      })}
    </div>
  );
}

// Variation C — Pill stack: enumerated present treatments as mono pills,
// +N for overflow. Most informative, takes the most horizontal space.
function TreatmentPillStack({ treatments, legacy, max = 3 }) {
  const data = treatments && treatments.length ? treatments
              : legacy ? legacyToTreatments(legacy) : [];
  // Sort by family order, then headlinePriority. Present ones first.
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
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {visible.map((t, i) => {
        const st = STATES[t.state] || STATES.unknown;
        const c = toneColors(st.tone);
        return (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', height: 18,
            padding: '0 7px', borderRadius: 2,
            background: st.present ? c.bg : 'transparent',
            boxShadow: `inset 0 0 0 1px ${st.present ? c.fg : BPI.ink20}`,
            fontFamily: BPIMono, fontSize: 10, fontWeight: 700,
            color: st.present ? c.ink : BPI.ink40,
            letterSpacing: '0.04em', whiteSpace: 'nowrap',
          }}>{t.def.label}</span>
        );
      })}
      {overflow > 0 && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', height: 18,
          padding: '0 6px', borderRadius: 2,
          background: BPI.ink06,
          fontFamily: BPIMono, fontSize: 10, fontWeight: 700,
          color: BPI.ink70, letterSpacing: '0.04em',
        }}>+{overflow}</span>
      )}
    </div>
  );
}

// Variation D — Score + family ticks. Single number + thin family bar.
// Most abstract; useful in ultra-tight contexts (search list, table cell).
function TreatmentScoreBar({ treatments, legacy }) {
  const data = treatments && treatments.length ? treatments
              : legacy ? legacyToTreatments(legacy) : [];
  const groups = groupByFamily(data);
  const present = data.filter(t => STATES[t.state]?.present === true).length;
  const total = data.length;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className="num" style={{
        fontFamily: BPIMono, fontSize: 11, fontWeight: 700, color: BPI.ink,
        letterSpacing: '0.02em',
      }}>{present}<span style={{ color: BPI.ink40 }}>/{total}</span></span>
      <div style={{ display: 'flex', gap: 2 }}>
        {FAMILIES.map(f => {
          const s = familySummary(groups[f.id]);
          const filled = s.presence === 'full' || s.presence === 'partial';
          return (
            <div key={f.id} style={{
              width: 3, height: 10, borderRadius: 1,
              background: filled ? BPI.ink : 'transparent',
              boxShadow: filled ? 'none' : `inset 0 0 0 1px ${BPI.ink20}`,
              opacity: s.presence === 'partial' ? 0.55 : 1,
            }} />
          );
        })}
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// TREATMENT INVENTORY — full detail view, family-grouped.
// Used in the route-detail Interventions tab and on detail surfaces.
// ─────────────────────────────────────────────────────────────
function TreatmentInventory({ treatments = [], scope = 'route' }) {
  const groups = groupByFamily(treatments);
  const visibleFamilies = FAMILIES.filter(f => groups[f.id].length > 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {visibleFamilies.map(f => {
        const items = groups[f.id];
        const s = familySummary(items);
        return (
          <div key={f.id} style={{
            padding: '14px 16px', background: BPI.card, borderRadius: 3,
            boxShadow: `0 0 0 1px ${BPI.rule}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline',
              justifyContent: 'space-between', marginBottom: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-0.005em' }}>
                  {f.label}
                </span>
                <span style={{ fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono,
                  letterSpacing: '0.04em',
                }}>
                  {s.present}/{s.total} in place
                </span>
              </div>
              <PresencePill presence={s.presence} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((t, i) => (
                <TreatmentInventoryRow key={i} t={t} />
              ))}
            </div>
          </div>
        );
      })}
      {visibleFamilies.length === 0 && (
        <div style={{
          padding: '16px 20px', background: BPI.card, borderRadius: 3,
          boxShadow: `0 0 0 1px ${BPI.rule}`,
          fontSize: 12.5, color: BPI.ink55, lineHeight: 1.5,
        }}>
          No bus-priority treatments catalogued at this scope yet.
        </div>
      )}
    </div>
  );
}

function PresencePill({ presence }) {
  const map = {
    full:    { label: 'Fully in place', tone: 'good'    },
    partial: { label: 'Partial',         tone: 'warn'    },
    gap:     { label: 'Source gap',      tone: 'gap'     },
    none:    { label: '—',               tone: 'neutral' },
  };
  const m = map[presence] || map.none;
  const c = toneColors(m.tone);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 7px',
      borderRadius: 2, background: c.bg,
      fontSize: 10.5, fontWeight: 700, color: c.ink,
      fontFamily: BPIMono, letterSpacing: '0.04em',
    }}>{m.label}</span>
  );
}

function TreatmentInventoryRow({ t }) {
  const st = STATES[t.state] || STATES.unknown;
  const ev = t.evaluation ? EVAL_STATES[t.evaluation] : null;
  const c = toneColors(st.tone);
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '14px 1fr auto',
      gap: 10, alignItems: 'baseline',
      padding: '6px 0',
      boxShadow: `inset 0 -1px 0 ${BPI.ink06}`,
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: 4,
        background: st.present ? c.fg : 'transparent',
        boxShadow: st.present ? 'none' : `inset 0 0 0 1.2px ${st.tone === 'gap' ? BPI.warn : BPI.ink20}`,
        marginTop: 4,
      }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: BPI.ink }}>
          {t.def.label}
          {t.coverage !== undefined && t.coverage < 1 && (
            <span className="num" style={{ marginLeft: 8, fontSize: 11, color: BPI.ink55, fontFamily: BPIMono }}>
              {Math.round(t.coverage * 100)}% coverage
            </span>
          )}
          {t.note && (
            <span style={{ marginLeft: 8, fontSize: 11.5, color: BPI.ink55 }}>· {t.note}</span>
          )}
        </div>
        {t.detail && (
          <div style={{ fontSize: 11.5, color: BPI.ink55, marginTop: 2, lineHeight: 1.4 }}>{t.detail}</div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {ev && (
          <span style={{
            fontSize: 9.5, fontFamily: BPIMono, fontWeight: 600,
            color: toneColors(ev.tone).ink,
            background: toneColors(ev.tone).bg,
            padding: '2px 5px', borderRadius: 2, letterSpacing: '0.04em',
          }}>{ev.label}</span>
        )}
        <span style={{
          fontSize: 10, fontFamily: BPIMono, fontWeight: 700,
          color: c.ink, background: c.bg,
          padding: '2px 6px', borderRadius: 2, letterSpacing: '0.06em',
          textTransform: 'uppercase', whiteSpace: 'nowrap',
        }}>{st.short}</span>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// INTERVENTION TIMELINE — dated events, with source-backed flag.
// Re-uses the existing visual but adds an explicit "source" line.
// ─────────────────────────────────────────────────────────────
function InterventionTimeline({ events = [] }) {
  return (
    <div style={{ position: 'relative', paddingLeft: 16 }}>
      <div style={{ position: 'absolute', left: 4, top: 6, bottom: 6, width: 1, background: BPI.rule }} />
      {events.map((e, i) => {
        const tone = e.tone || 'accent';
        const c = toneColors(tone);
        return (
          <div key={i} style={{ position: 'relative', paddingBottom: 18 }}>
            <div style={{
              position: 'absolute', left: -16, top: 5, width: 9, height: 9, borderRadius: 5,
              background: c.fg,
              boxShadow: `0 0 0 2px ${BPI.card}`,
            }} />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span className="num" style={{ fontSize: 11, color: BPI.ink55, fontWeight: 600, fontFamily: BPIMono }}>
                {e.date}
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{e.title}</span>
              {e.kind && (
                <span style={{
                  fontSize: 9.5, fontFamily: BPIMono, fontWeight: 600,
                  color: BPI.ink55, letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  padding: '1px 5px', borderRadius: 2,
                  boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
                }}>{e.kind}</span>
              )}
            </div>
            {e.detail && <div style={{ fontSize: 11.5, color: BPI.ink70, marginTop: 3, lineHeight: 1.45 }}>{e.detail}</div>}
            {e.source && (
              <div style={{ fontSize: 10.5, color: BPI.ink55, marginTop: 4, fontFamily: BPIMono, letterSpacing: '0.02em' }}>
                src · {e.source}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────
Object.assign(window, {
  // taxonomy
  FAMILIES, FAMILY_BY_ID, FAMILY_ORDER, TREATMENTS, STATES, EVAL_STATES,
  // helpers
  toneColors, groupByFamily, headlineFor, familySummary, legacyToTreatments,
  familyHeadline, abbrev,
  // compact display (v1)
  FamilyGlyph, OverflowChip, OverflowPopover, TreatmentLine,
  TreatmentStrip,
  // compact display (v2, glyph-aware)
  TreatmentSlot, TreatmentIconStrip, TreatmentChip,
  TreatmentChipStack, TreatmentIconRow,
  // variations
  FamilyFingerprint, TreatmentPillStack, TreatmentScoreBar,
  // full detail
  TreatmentInventory, PresencePill, TreatmentInventoryRow,
  // timeline
  InterventionTimeline,
});
