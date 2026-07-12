// ─────────────────────────────────────────────────────────────
// TREATMENT GLYPHS
//
// SVG primitives for every treatment type. Each glyph is grounded in the
// physical or operational reality of the thing — a road cross-section
// for street-priority treatments, a signal head for signals, a camera
// body for enforcement — instead of abstract dots/bars.
//
// Rules:
//   • 20×20 viewBox. Display at 18–28px.
//   • Single ink color via currentColor. Parent controls tone.
//   • State maps to fill / dash / opacity:
//       active|implemented|pilot   → filled, full ink
//       planned|proposed|future    → outlined, ink55, slight dash
//       source_gap                 → dashed warn outline
//       historical_context|unknown → outlined, ink40
// ─────────────────────────────────────────────────────────────

const GLYPH_SIZE = 20;

// State → drawing attrs. One source of truth.
function glyphStateAttrs(state) {
  const active   = state === 'active' || state === 'implemented' || state === 'pilot';
  const future   = state === 'planned' || state === 'proposed' || state === 'future';
  const gap      = state === 'source_gap';
  const hist     = state === 'historical_context' || state === 'unknown';
  if (gap) {
    return {
      stroke:    BPI.warn,
      fillSolid: 'none',
      fillSoft:  'none',
      dash:      '2 1.5',
      opacity:   1,
    };
  }
  if (future) {
    return {
      stroke:    BPI.ink55,
      fillSolid: 'none',
      fillSoft:  'none',
      dash:      '2.5 1.5',
      opacity:   0.95,
    };
  }
  if (hist) {
    return {
      stroke:    BPI.ink40,
      fillSolid: 'none',
      fillSoft:  'none',
      dash:      undefined,
      opacity:   0.85,
    };
  }
  // active
  return {
    stroke:    'currentColor',
    fillSolid: 'currentColor',
    fillSoft:  'currentColor',
    dash:      undefined,
    opacity:   1,
  };
}

// Wrapper that handles size, color, and state-mapped stroke/fill defaults.
// Children receive { stroke, fill, dash, sw } via context-like prop drilling.
function GlyphFrame({ size = GLYPH_SIZE, state = 'active', tone, children, title }) {
  const a = glyphStateAttrs(state);
  // Tone resolves the ink color for active glyphs. For non-active states,
  // tone is ignored — we want a unified "outlined / dashed" look so a row
  // of mixed-state glyphs reads coherently.
  const inkColor =
    tone === 'good'   ? BPI.good   :
    tone === 'accent' ? BPI.accent :
    tone === 'warn'   ? BPI.warn   :
    BPI.ink;
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      style={{
        display: 'inline-flex',
        color: a.stroke === 'currentColor' ? inkColor : a.stroke,
        opacity: a.opacity,
        lineHeight: 0,
      }}
    >
      <svg
        width={size} height={size}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {typeof children === 'function' ? children(a) : children}
      </svg>
    </span>
  );
}

// Shared sub-primitives ─────────────────────────────────────
// Two horizontal "curbs" — the canvas all street-priority glyphs sit on.
const StreetCurbs = ({ a }) => (
  <>
    <line x1="2"  y1="3"  x2="18" y2="3"  strokeOpacity={0.45} />
    <line x1="2"  y1="17" x2="18" y2="17" strokeOpacity={0.45} />
  </>
);

// A horizontal "lane band" at a given Y position, of given height.
const LaneBand = ({ y, h = 3, a, soft = false }) => (
  <rect
    x="2.5" y={y} width="15" height={h} rx="0.6"
    fill={a.fillSolid === 'none' ? 'none' : 'currentColor'}
    fillOpacity={a.fillSolid === 'none' ? 0 : (soft ? 0.85 : 1)}
    stroke="currentColor"
    strokeDasharray={a.dash}
  />
);

// ── STREET PRIORITY ─────────────────────────────────────────
function G_BusLane(p) {
  return (
    <GlyphFrame {...p} title="Bus lane">
      {a => (<>
        <StreetCurbs a={a} />
        <LaneBand y={13} h={3} a={a} />
      </>)}
    </GlyphFrame>
  );
}
function G_OffsetLane(p) {
  return (
    <GlyphFrame {...p} title="Offset bus lane">
      {a => (<>
        <StreetCurbs a={a} />
        <LaneBand y={9} h={3} a={a} />
        {/* hint of curbside lane (parking) */}
        <line x1="2.5" y1="15" x2="17.5" y2="15" strokeOpacity={0.25} strokeDasharray="1 1.2" />
      </>)}
    </GlyphFrame>
  );
}
function G_Busway(p) {
  return (
    <GlyphFrame {...p} title="Busway">
      {a => (<>
        <StreetCurbs a={a} />
        <LaneBand y={5}  h={4} a={a} />
        <LaneBand y={11} h={4} a={a} />
        {/* center separator */}
        <line x1="2.5" y1="10" x2="17.5" y2="10"
              strokeDasharray={a.dash || '1 1'}
              strokeOpacity={a.fillSolid === 'none' ? 0.6 : 0.55}
              stroke={a.fillSolid === 'none' ? 'currentColor' : '#fff'} />
      </>)}
    </GlyphFrame>
  );
}
function G_BoardingIsland(p) {
  return (
    <GlyphFrame {...p} title="Boarding island">
      {a => (<>
        <StreetCurbs a={a} />
        {/* lane band running through */}
        <LaneBand y={13} h={3} a={a} />
        {/* island in roadway */}
        <rect x="6" y="6" width="8" height="4" rx="1"
              fill={a.fillSolid === 'none' ? 'none' : 'currentColor'}
              stroke="currentColor" strokeDasharray={a.dash} />
      </>)}
    </GlyphFrame>
  );
}
function G_MedianStation(p) {
  return (
    <GlyphFrame {...p} title="Median station">
      {a => (<>
        <StreetCurbs a={a} />
        {/* center median line */}
        <line x1="2.5" y1="10" x2="17.5" y2="10" strokeOpacity={0.5} />
        {/* station rect straddling median */}
        <rect x="7" y="8" width="6" height="4" rx="0.8"
              fill={a.fillSolid === 'none' ? 'none' : 'currentColor'}
              stroke="currentColor" strokeDasharray={a.dash} />
      </>)}
    </GlyphFrame>
  );
}

// ── ENFORCEMENT ─────────────────────────────────────────────
function G_Ace(p) {
  // Fixed camera: body box + lens + mounting pole.
  return (
    <GlyphFrame {...p} title="ACE camera">
      {a => (<>
        {/* pole */}
        <line x1="10" y1="13" x2="10" y2="18" strokeOpacity={0.7} />
        {/* base */}
        <line x1="7" y1="18" x2="13" y2="18" strokeOpacity={0.7} />
        {/* camera body */}
        <rect x="3" y="5" width="11" height="7" rx="1.2"
              fill={a.fillSolid === 'none' ? 'none' : 'currentColor'}
              stroke="currentColor" strokeDasharray={a.dash} />
        {/* lens hood */}
        <rect x="13" y="7" width="3" height="3" rx="0.6"
              fill={a.fillSolid === 'none' ? 'none' : 'currentColor'}
              stroke="currentColor" strokeDasharray={a.dash} />
        {/* lens dot */}
        <circle cx="8.5" cy="8.5" r="1.5"
                fill={a.fillSolid === 'none' ? 'none' : '#fff'}
                fillOpacity={a.fillSolid === 'none' ? 0 : 0.95}
                stroke="currentColor" strokeWidth={a.fillSolid === 'none' ? 1.2 : 0.8} />
      </>)}
    </GlyphFrame>
  );
}
function G_BusMountedCam(p) {
  // Bus profile with a small cam bump on the roof.
  return (
    <GlyphFrame {...p} title="Bus-mounted camera">
      {a => (<>
        {/* bus body */}
        <rect x="2" y="9" width="16" height="6" rx="1.5"
              fill={a.fillSolid === 'none' ? 'none' : 'currentColor'}
              stroke="currentColor" strokeDasharray={a.dash} />
        {/* windows */}
        <line x1="4" y1="11" x2="16" y2="11"
              stroke={a.fillSolid === 'none' ? 'currentColor' : '#fff'}
              strokeOpacity={a.fillSolid === 'none' ? 0.5 : 0.55} />
        {/* camera bump */}
        <rect x="11" y="6" width="3" height="3" rx="0.5"
              fill={a.fillSolid === 'none' ? 'none' : 'currentColor'}
              stroke="currentColor" strokeDasharray={a.dash} />
        {/* wheels */}
        <circle cx="6"  cy="16" r="1.2" fill="currentColor" />
        <circle cx="14" cy="16" r="1.2" fill="currentColor" />
      </>)}
    </GlyphFrame>
  );
}
function G_NYPDEnforcement(p) {
  // Badge shield shape.
  return (
    <GlyphFrame {...p} title="NYPD enforcement">
      {a => (<>
        <path d="M10 3 L16 5 L16 11 Q16 15 10 17 Q4 15 4 11 L4 5 Z"
              fill={a.fillSolid === 'none' ? 'none' : 'currentColor'}
              stroke="currentColor" strokeDasharray={a.dash} />
        <line x1="7" y1="10" x2="13" y2="10"
              stroke={a.fillSolid === 'none' ? 'currentColor' : '#fff'}
              strokeOpacity={a.fillSolid === 'none' ? 0.6 : 0.8} />
      </>)}
    </GlyphFrame>
  );
}

// ── SIGNALS ─────────────────────────────────────────────────
// Signal head: vertical 3-dot stack inside a rounded enclosure.
const SignalHead = ({ a, highlight }) => (
  <>
    <rect x="6" y="2" width="6" height="13" rx="2.2"
          fill={a.fillSolid === 'none' ? 'none' : 'currentColor'}
          stroke="currentColor" strokeDasharray={a.dash} />
    {/* pole */}
    <line x1="9" y1="15" x2="9" y2="18" strokeOpacity={0.6} />
    {/* lights — when active, lights are reverse-cut (white); when outlined, lights are dots */}
    {[4.5, 8, 11.5].map((cy, i) => (
      <circle key={i} cx="9" cy={cy} r="1.1"
              fill={a.fillSolid === 'none'
                ? (highlight === i ? 'currentColor' : 'none')
                : (highlight === i ? '#fff' : 'rgba(255,255,255,0.32)')}
              stroke={a.fillSolid === 'none' ? 'currentColor' : 'none'}
              strokeWidth={1} />
    ))}
  </>
);
function G_TSP(p) {
  return (
    <GlyphFrame {...p} title="TSP">
      {a => <SignalHead a={a} highlight={1} />}
    </GlyphFrame>
  );
}
function G_QueueJump(p) {
  return (
    <GlyphFrame {...p} title="Queue jump">
      {a => (<>
        <SignalHead a={a} highlight={0} />
        {/* arrow shooting right out of the head */}
        <path d="M13 8 L17 8 M15 6 L17 8 L15 10"
              fill="none" stroke="currentColor"
              strokeDasharray={a.dash} strokeWidth={1.4} />
      </>)}
    </GlyphFrame>
  );
}
function G_DedicatedPhase(p) {
  return (
    <GlyphFrame {...p} title="Dedicated bus phase">
      {a => (<>
        <SignalHead a={a} highlight={0} />
        {/* "B" mark — a vertical bar with two notches indicates bus */}
        <text x="9" y="7" textAnchor="middle"
              fontSize="3.5" fontFamily="monospace" fontWeight="700"
              fill={a.fillSolid === 'none' ? 'currentColor' : '#fff'}
              stroke="none">B</text>
      </>)}
    </GlyphFrame>
  );
}
function G_SignalRetiming(p) {
  // Clock face — circle with two short hands.
  return (
    <GlyphFrame {...p} title="Signal retiming">
      {a => (<>
        <circle cx="10" cy="10" r="6.5"
                fill={a.fillSolid === 'none' ? 'none' : 'currentColor'}
                stroke="currentColor" strokeDasharray={a.dash} />
        <line x1="10" y1="10" x2="10" y2="6"
              stroke={a.fillSolid === 'none' ? 'currentColor' : '#fff'}
              strokeWidth={1.2} />
        <line x1="10" y1="10" x2="13" y2="10"
              stroke={a.fillSolid === 'none' ? 'currentColor' : '#fff'}
              strokeWidth={1.2} />
      </>)}
    </GlyphFrame>
  );
}
function G_TurnRestriction(p) {
  // No-turn: arrow with diagonal strike.
  return (
    <GlyphFrame {...p} title="Turn restriction">
      {a => (<>
        <circle cx="10" cy="10" r="7.5"
                fill={a.fillSolid === 'none' ? 'none' : 'currentColor'}
                stroke="currentColor" strokeDasharray={a.dash} />
        {/* turn arrow */}
        <path d="M7 13 L7 10 Q7 7 10 7 L13 7 M11.5 5.5 L13 7 L11.5 8.5"
              fill="none"
              stroke={a.fillSolid === 'none' ? 'currentColor' : '#fff'}
              strokeWidth={1.3} />
        {/* strike */}
        <line x1="4.5" y1="15.5" x2="15.5" y2="4.5"
              stroke={a.fillSolid === 'none' ? 'currentColor' : '#fff'}
              strokeWidth={1.6} />
      </>)}
    </GlyphFrame>
  );
}

// ── STOPS & BOARDING ────────────────────────────────────────
function G_StopConsolidation(p) {
  // Three lollipop stops, middle one struck through.
  return (
    <GlyphFrame {...p} title="Stop consolidation">
      {a => (<>
        {/* baseline */}
        <line x1="2" y1="17" x2="18" y2="17" strokeOpacity={0.45} />
        {/* posts */}
        <line x1="5"  y1="17" x2="5"  y2="9" />
        <line x1="10" y1="17" x2="10" y2="9" strokeOpacity={0.45} />
        <line x1="15" y1="17" x2="15" y2="9" />
        {/* heads */}
        <circle cx="5"  cy="7"  r="2"
                fill={a.fillSolid === 'none' ? 'none' : 'currentColor'}
                stroke="currentColor" strokeDasharray={a.dash} />
        <circle cx="15" cy="7"  r="2"
                fill={a.fillSolid === 'none' ? 'none' : 'currentColor'}
                stroke="currentColor" strokeDasharray={a.dash} />
        <circle cx="10" cy="7"  r="2"
                fill="none" stroke="currentColor" strokeOpacity={0.4} strokeDasharray="1 1" />
        {/* X over middle */}
        <line x1="8"  y1="5"  x2="12" y2="9"  stroke="currentColor" strokeOpacity={0.6} strokeWidth={1.2} />
        <line x1="12" y1="5"  x2="8"  y2="9"  stroke="currentColor" strokeOpacity={0.6} strokeWidth={1.2} />
      </>)}
    </GlyphFrame>
  );
}
function G_BusBulb(p) {
  // Sidewalk with a bulge + a stop pole.
  return (
    <GlyphFrame {...p} title="Bus bulb">
      {a => (<>
        {/* sidewalk with bulb */}
        <path d="M2 14 L6 14 Q7 14 7.5 12 L12.5 12 Q13 14 14 14 L18 14"
              fill={a.fillSolid === 'none' ? 'none' : 'currentColor'}
              stroke="currentColor" strokeDasharray={a.dash} />
        {/* roadway hint */}
        <line x1="2" y1="17" x2="18" y2="17" strokeOpacity={0.3} />
        {/* stop pole */}
        <line x1="10" y1="12" x2="10" y2="5" stroke="currentColor" />
        <circle cx="10" cy="4" r="1.5"
                fill={a.fillSolid === 'none' ? 'none' : 'currentColor'}
                stroke="currentColor" />
      </>)}
    </GlyphFrame>
  );
}
function G_OffBoardFare(p) {
  // Fare kiosk: rectangle with a slot at the top.
  return (
    <GlyphFrame {...p} title="Off-board fare">
      {a => (<>
        <rect x="5" y="4" width="10" height="13" rx="1.2"
              fill={a.fillSolid === 'none' ? 'none' : 'currentColor'}
              stroke="currentColor" strokeDasharray={a.dash} />
        {/* card slot */}
        <line x1="7" y1="7" x2="13" y2="7"
              stroke={a.fillSolid === 'none' ? 'currentColor' : '#fff'}
              strokeWidth={1.4} />
        {/* screen */}
        <rect x="7" y="9" width="6" height="3" rx="0.4"
              fill="none"
              stroke={a.fillSolid === 'none' ? 'currentColor' : '#fff'}
              strokeOpacity={0.85} />
      </>)}
    </GlyphFrame>
  );
}
function G_AllDoor(p) {
  // Bus from side with multiple door slits.
  return (
    <GlyphFrame {...p} title="All-door boarding">
      {a => (<>
        <rect x="2" y="6" width="16" height="9" rx="1.5"
              fill={a.fillSolid === 'none' ? 'none' : 'currentColor'}
              stroke="currentColor" strokeDasharray={a.dash} />
        {/* doors */}
        {[5, 10, 14.5].map((x, i) => (
          <line key={i} x1={x} y1="7.5" x2={x} y2="13.5"
                stroke={a.fillSolid === 'none' ? 'currentColor' : '#fff'}
                strokeWidth={1.2} />
        ))}
        {/* wheels */}
        <circle cx="5"  cy="16" r="1" fill="currentColor" />
        <circle cx="15" cy="16" r="1" fill="currentColor" />
      </>)}
    </GlyphFrame>
  );
}
function G_ShelterRTPI(p) {
  // Shelter: slanted roof + 2 posts + bench.
  return (
    <GlyphFrame {...p} title="Shelter / RTPI">
      {a => (<>
        {/* roof */}
        <path d="M2 7 L18 5 L18 8 L2 9 Z"
              fill={a.fillSolid === 'none' ? 'none' : 'currentColor'}
              stroke="currentColor" strokeDasharray={a.dash} />
        {/* posts */}
        <line x1="4"  y1="9"  x2="4"  y2="17" />
        <line x1="16" y1="8"  x2="16" y2="17" />
        {/* bench */}
        <line x1="5"  y1="14" x2="15" y2="14" strokeOpacity={0.7} />
      </>)}
    </GlyphFrame>
  );
}

// ── SERVICE PATTERN ─────────────────────────────────────────
function G_SBS(p) {
  // Familiar SBS lozenge.
  return (
    <GlyphFrame {...p} title="SBS">
      {a => (<>
        <rect x="2" y="6.5" width="16" height="7" rx="3.5"
              fill={a.fillSolid === 'none' ? 'none' : 'currentColor'}
              stroke="currentColor" strokeDasharray={a.dash} />
        <text x="10" y="12" textAnchor="middle"
              fontSize="5" fontWeight="800" letterSpacing="0.4"
              fontFamily="Helvetica, Arial, sans-serif"
              fill={a.fillSolid === 'none' ? 'currentColor' : '#fff'}
              stroke="none">SBS</text>
      </>)}
    </GlyphFrame>
  );
}
function G_Limited(p) {
  // Skip-stop pattern: 5 dots, 2nd and 4th larger (stops).
  return (
    <GlyphFrame {...p} title="Limited">
      {a => (<>
        <line x1="2" y1="10" x2="18" y2="10" strokeOpacity={0.35} />
        {[3, 6.5, 10, 13.5, 17].map((x, i) => {
          const isStop = i === 0 || i === 2 || i === 4;
          return (
            <circle key={i} cx={x} cy="10" r={isStop ? 1.7 : 0.9}
                    fill={isStop
                      ? (a.fillSolid === 'none' ? 'none' : 'currentColor')
                      : 'currentColor'}
                    fillOpacity={isStop ? 1 : 0.35}
                    stroke="currentColor" strokeWidth={isStop ? 1.2 : 0}
                    strokeDasharray={isStop ? a.dash : undefined} />
          );
        })}
      </>)}
    </GlyphFrame>
  );
}
function G_RouteRestructure(p) {
  // Arrow with a kink.
  return (
    <GlyphFrame {...p} title="Route restructure">
      {a => (<>
        <path d="M3 14 L8 14 Q10 14 10 11 L10 7 L14 7"
              fill="none" stroke="currentColor" strokeDasharray={a.dash} />
        <path d="M12.5 5.5 L14 7 L12.5 8.5"
              fill="none" stroke="currentColor" strokeDasharray={a.dash} />
        {/* faint "old" route */}
        <line x1="3" y1="10" x2="17" y2="10" strokeOpacity={0.25} strokeDasharray="1 1.2" />
      </>)}
    </GlyphFrame>
  );
}

// ── CURB / ACCESS / SAFETY ──────────────────────────────────
function G_Daylighting(p) {
  // Intersection corner with a "clear zone" mark.
  return (
    <GlyphFrame {...p} title="Daylighting">
      {a => (<>
        {/* corner L */}
        <path d="M3 17 L3 9 L17 9"
              fill="none" stroke="currentColor" strokeDasharray={a.dash} strokeWidth={1.6} />
        {/* daylight wedge (filled when active) */}
        <path d="M3 9 L8 9 L8 6 L3 6 Z"
              fill={a.fillSolid === 'none' ? 'none' : 'currentColor'}
              fillOpacity={0.4}
              stroke="currentColor" strokeOpacity={0.6} strokeDasharray="1 1.4" />
        {/* sun rays */}
        <line x1="10" y1="4" x2="10" y2="6" strokeOpacity={0.6} />
        <line x1="12" y1="5" x2="13.5" y2="6.5" strokeOpacity={0.6} />
      </>)}
    </GlyphFrame>
  );
}
function G_HardenedCenter(p) {
  // Vertical centerline with bollards.
  return (
    <GlyphFrame {...p} title="Hardened centerline">
      {a => (<>
        {/* edges */}
        <line x1="3" y1="2" x2="3" y2="18" strokeOpacity={0.4} />
        <line x1="17" y1="2" x2="17" y2="18" strokeOpacity={0.4} />
        {/* center */}
        <line x1="10" y1="2" x2="10" y2="18"
              strokeDasharray={a.dash || '2 1.5'} />
        {/* bollards */}
        {[4, 8, 12, 16].map((cy, i) => (
          <circle key={i} cx="10" cy={cy} r="1.1"
                  fill={a.fillSolid === 'none' ? 'none' : 'currentColor'}
                  stroke="currentColor" />
        ))}
      </>)}
    </GlyphFrame>
  );
}
function G_CurbManagement(p) {
  // Curb with marked regulations.
  return (
    <GlyphFrame {...p} title="Curb management">
      {a => (<>
        <line x1="2" y1="14" x2="18" y2="14" strokeWidth={1.6} />
        {[4, 8, 12, 16].map((x, i) => (
          <line key={i} x1={x} y1="14" x2={x} y2="17"
                stroke="currentColor"
                strokeDasharray={a.dash} />
        ))}
        {/* sign */}
        <rect x="8" y="4" width="4" height="6" rx="0.6"
              fill={a.fillSolid === 'none' ? 'none' : 'currentColor'}
              stroke="currentColor" strokeDasharray={a.dash} />
        <line x1="10" y1="10" x2="10" y2="14" strokeOpacity={0.5} />
      </>)}
    </GlyphFrame>
  );
}
function G_LoadingZone(p) {
  // A delivery truck box on a curb.
  return (
    <GlyphFrame {...p} title="Loading zone">
      {a => (<>
        <line x1="2" y1="17" x2="18" y2="17" strokeOpacity={0.45} />
        {/* truck body */}
        <rect x="3" y="6" width="9" height="9" rx="0.6"
              fill={a.fillSolid === 'none' ? 'none' : 'currentColor'}
              stroke="currentColor" strokeDasharray={a.dash} />
        {/* truck cab */}
        <path d="M12 9 L16 9 L17 12 L17 15 L12 15 Z"
              fill={a.fillSolid === 'none' ? 'none' : 'currentColor'}
              stroke="currentColor" strokeDasharray={a.dash} />
        {/* wheels */}
        <circle cx="6"  cy="16" r="1.1" fill="currentColor" />
        <circle cx="14" cy="16" r="1.1" fill="currentColor" />
      </>)}
    </GlyphFrame>
  );
}

// ── PROGRAM / CAPITAL ───────────────────────────────────────
function G_CapitalMilestone(p) {
  // Flag on a pole.
  return (
    <GlyphFrame {...p} title="Capital milestone">
      {a => (<>
        <line x1="5" y1="3" x2="5" y2="18" />
        <path d="M5 4 L14 4 L12 7 L14 10 L5 10 Z"
              fill={a.fillSolid === 'none' ? 'none' : 'currentColor'}
              stroke="currentColor" strokeDasharray={a.dash} />
        {/* base */}
        <line x1="3" y1="18" x2="7" y2="18" strokeOpacity={0.7} />
      </>)}
    </GlyphFrame>
  );
}
function G_Proposal(p) {
  // Same flag, always rendered with dashed outline regardless of state.
  return (
    <GlyphFrame {...p} title="Proposal" state="proposed">
      {a => (<>
        <line x1="5" y1="3" x2="5" y2="18" strokeOpacity={0.6} />
        <path d="M5 4 L14 4 L12 7 L14 10 L5 10 Z"
              fill="none"
              stroke="currentColor" strokeDasharray="2 1.5" />
        <line x1="3" y1="18" x2="7" y2="18" strokeOpacity={0.5} />
      </>)}
    </GlyphFrame>
  );
}


// ─────────────────────────────────────────────────────────────
// GLYPH REGISTRY
// Maps treatment type → glyph component. Used by TreatmentIcon below
// so callers don't need to import individual G_* components.
// ─────────────────────────────────────────────────────────────
const TREATMENT_GLYPHS = {
  // Street
  bus_lane:           G_BusLane,
  offset_lane:        G_OffsetLane,
  busway:             G_Busway,
  boarding_island:    G_BoardingIsland,
  median_station:     G_MedianStation,
  // Enforcement
  ace:                G_Ace,
  bus_mounted_cam:    G_BusMountedCam,
  nypd_enforcement:   G_NYPDEnforcement,
  // Signals
  tsp:                G_TSP,
  queue_jump:         G_QueueJump,
  dedicated_phase:    G_DedicatedPhase,
  signal_retiming:    G_SignalRetiming,
  turn_restriction:   G_TurnRestriction,
  // Stops & boarding
  stop_consolidation: G_StopConsolidation,
  bus_bulb:           G_BusBulb,
  off_board_fare:     G_OffBoardFare,
  all_door:           G_AllDoor,
  shelter_rtpi:       G_ShelterRTPI,
  // Service
  sbs:                G_SBS,
  limited:            G_Limited,
  route_restructure:  G_RouteRestructure,
  // Curb & safety
  daylighting:        G_Daylighting,
  hardened_center:    G_HardenedCenter,
  curb_management:    G_CurbManagement,
  loading_zone:       G_LoadingZone,
  // Program
  capital_milestone:  G_CapitalMilestone,
  proposal:           G_Proposal,
};

// Drop-in glyph for any treatment type. Falls back to a neutral square
// for unknown types so things never blow up.
function TreatmentIcon({ type, state = 'active', size = 20, tone }) {
  const Glyph = TREATMENT_GLYPHS[type];
  if (!Glyph) {
    return (
      <GlyphFrame size={size} state={state} tone={tone}>
        {a => (
          <rect x="3" y="3" width="14" height="14" rx="1.2"
                fill={a.fillSolid === 'none' ? 'none' : 'currentColor'}
                stroke="currentColor" strokeDasharray={a.dash} />
        )}
      </GlyphFrame>
    );
  }
  return <Glyph size={size} state={state} tone={tone} />;
}

// Exports
Object.assign(window, {
  TreatmentIcon, TREATMENT_GLYPHS, GLYPH_SIZE, glyphStateAttrs,
  // individual glyphs for direct use
  G_BusLane, G_OffsetLane, G_Busway, G_BoardingIsland, G_MedianStation,
  G_Ace, G_BusMountedCam, G_NYPDEnforcement,
  G_TSP, G_QueueJump, G_DedicatedPhase, G_SignalRetiming, G_TurnRestriction,
  G_StopConsolidation, G_BusBulb, G_OffBoardFare, G_AllDoor, G_ShelterRTPI,
  G_SBS, G_Limited, G_RouteRestructure,
  G_Daylighting, G_HardenedCenter, G_CurbManagement, G_LoadingZone,
  G_CapitalMilestone, G_Proposal,
});
