// corridor-map.jsx — a stylized SVG map of a bus corridor.
//
// Not a real geographic map. NYC's avenues are linear enough — the M15
// runs the East Side from East Harlem to South Ferry — that a single
// horizontal track gives the reader a real sense of "where on the route
// is the problem."
//
// Full mode draws speed as a SPEED PROFILE: a thin line over the corridor
// (fast = calm green, slow = warm red), the area beneath softly filled,
// the slow zones glowing behind, and the scheduled timepoint drawn as a
// dashed reference so the gap reads as lost time. Stop labels sit above;
// three light coverage rails (Lane / ACE / TSP) sit below. These three are
// the segment-varying treatments — the full inventory lives in the
// "What's in place" panel, not here.
//
// Two display modes:
//   • full   — for the Overview tab.
//   • mini   — for inline use in segment rows. ~150×24.

// ─────────────────────────────────────────────────────────────
// M15 corridor data — stop list NORTH → SOUTH.
// ─────────────────────────────────────────────────────────────
const M15_STOPS = [
  { id: 'e125',   label: 'E 125 St',       short: '125',     terminus: 'north' },
  { id: 'e116',   label: 'E 116 St',       short: '116' },
  { id: 'e96',    label: 'E 96 St',        short: '96'  },
  { id: 'e79',    label: 'E 79 St',        short: '79'  },
  { id: 'e57',    label: 'E 57 St',        short: '57'  },
  { id: 'e28',    label: 'E 28 St',        short: '28'  },
  { id: 'e14',    label: 'E 14 St',        short: '14'  },
  { id: 'hous',   label: 'Houston St',     short: 'Houston' },
  { id: 'grand',  label: 'Grand St',       short: 'Grand'   },
  { id: 'madall', label: 'Madison / Allen', short: 'Mad/Allen' },
  { id: 'sferry', label: 'South Ferry',    short: 'S. Ferry', terminus: 'south' },
];

const M15_CORRIDOR_SEGMENTS = [
  { i: 0, from: 'e125',   to: 'e116',  label: 'East Harlem · 125–116 St',     mph: 7.4, sched: 8.4, rh: 4200,  lane: 'yes',     ace: true,  tsp: false },
  { i: 1, from: 'e116',   to: 'e96',   label: 'East Harlem · 116–96 St',      mph: 6.9, sched: 8.0, rh: 5100,  lane: 'yes',     ace: true,  tsp: false },
  { i: 2, from: 'e96',    to: 'e79',   label: 'Upper East Side · 96–79 St',   mph: 5.8, sched: 8.2, rh: 9640,  lane: 'yes',     ace: true,  tsp: true  },
  { i: 3, from: 'e79',    to: 'e57',   label: 'Upper East Side · 79–57 St',   mph: 5.2, sched: 7.6, rh: 10800, lane: 'yes',     ace: true,  tsp: false },
  { i: 4, from: 'e57',    to: 'e28',   label: 'Madison Av · 58–28 St',        mph: 4.2, sched: 7.1, rh: 18420, lane: 'partial', ace: false, tsp: false, story: 'top' },
  { i: 5, from: 'e28',    to: 'e14',   label: 'Gramercy · 28–14 St',          mph: 4.9, sched: 7.6, rh: 14110, lane: 'yes',     ace: true,  tsp: false },
  { i: 6, from: 'e14',    to: 'hous',  label: 'East Village · 14–Houston',    mph: 5.5, sched: 7.4, rh: 8210,  lane: 'yes',     ace: true,  tsp: false },
  { i: 7, from: 'hous',   to: 'grand', label: 'LES · Houston–Grand',          mph: 6.4, sched: 7.8, rh: 6420,  lane: 'yes',     ace: true,  tsp: false },
  { i: 8, from: 'grand',  to: 'madall',label: 'LES · Grand–Madison/Allen',    mph: 6.8, sched: 7.5, rh: 5800,  lane: 'yes',     ace: true,  tsp: false },
  { i: 9, from: 'madall', to: 'sferry',label: 'Lower Manhattan · Allen–S.F.', mph: 7.2, sched: 8.0, rh: 4900,  lane: 'yes',     ace: false, tsp: false },
];

// Profile tier color — fast reads calm green, slow reads warm. (The
// studio's speedColor() uses ink for fast; on a corridor profile that
// reads heavy, so the map uses its own friendlier scale.)
function profileTier(mph) {
  return mph < 5 ? BPI.bad : mph < 6.5 ? BPI.warn : BPI.good;
}
function speedColor(mph) {
  return mph < 5 ? BPI.bad : mph < 6.5 ? BPI.warn : BPI.ink;
}
function laneColor(state) {
  return state === 'yes' ? BPI.good : state === 'partial' ? BPI.warn : state === 'minimal' ? BPI.warn : BPI.ink20;
}

// ─────────────────────────────────────────────────────────────
// Manhattan inset — kept for reuse; full CorridorMap no longer renders it.
// ─────────────────────────────────────────────────────────────
function ManhattanInset({ width = 56, height = 110, highlight = BPI.bad }) {
  const outline = 'M28,2 L34,5 L36,12 L39,22 L40,34 L41,46 L40,58 L38,68 L34,76 L31,82 L28,88 L25,92 L22,96 L24,102 L26,106 L24,108 L20,106 L18,100 L16,92 L18,86 L20,80 L19,72 L17,62 L17,52 L18,42 L19,32 L21,22 L23,12 L25,6 Z';
  const route = 'M37,15 L38,28 L38,42 L37,56 L34,70 L29,82 L25,92 L23,98';
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <path d={outline} fill={BPI.paperDeep} stroke={BPI.ink20} strokeWidth="1" />
      <path d={route} fill="none" stroke={highlight} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={37} cy={15} r="2.4" fill={BPI.ink} />
      <circle cx={23} cy={98} r="2.4" fill={BPI.ink} />
      <text x={4} y={10} fontSize="6.5" fontFamily={BPIMono} fill={BPI.ink55} fontWeight="600" letterSpacing="0.06em">N</text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// CorridorRail — one light coverage rail under the profile. Present =
// solid rounded line, partial = dashed, absent = faint dotted. A
// right-hand summary names total coverage.
// ─────────────────────────────────────────────────────────────
function CorridorRail({ segments, y, segW, trackLeft, labelX, label, kind, summary }) {
  return (
    <g>
      <text x={labelX} y={y + 3} fontSize="8.5" fontFamily={BPIMono} fontWeight="700"
        fill={BPI.ink40} textAnchor="end" letterSpacing="0.1em">{label}</text>
      {segments.map((s, i) => {
        const x = trackLeft + i * segW;
        const x1 = x + 4, x2 = x + segW - 4;
        let present = false, color = BPI.good, partial = false;
        if (kind === 'lane') {
          present = s.lane === 'yes' || s.lane === 'partial';
          partial = s.lane === 'partial';
          color = partial ? BPI.warn : BPI.good;
        } else if (kind === 'ace') { present = s.ace; color = BPI.accent; }
        else if (kind === 'tsp') { present = s.tsp; color = BPI.good; }
        return present ? (
          <line key={i} x1={x1} y1={y} x2={x2} y2={y} stroke={color} strokeWidth="4"
            strokeLinecap="round" strokeDasharray={partial ? '6 4' : undefined} opacity={partial ? 0.8 : 1} />
        ) : (
          <line key={i} x1={x1} y1={y} x2={x2} y2={y} stroke={BPI.ink20} strokeWidth="1.5"
            strokeLinecap="round" strokeDasharray="1.5 4" />
        );
      })}
      {summary && (
        <text x={trackLeft + segments.length * segW + 6} y={y + 3} fontSize="9"
          fontFamily={BPIMono} fill={BPI.ink55} textAnchor="start">{summary}</text>
      )}
    </g>
  );
}

// ─────────────────────────────────────────────────────────────
// CorridorMap — full map. Speed profile (N left → S right) with stop
// labels above and coverage rails below.
// ─────────────────────────────────────────────────────────────
function CorridorMap({
  segments = M15_CORRIDOR_SEGMENTS,
  stops = M15_STOPS,
  width = 1200,
  height = 326,
  highlightI = null,
  showLegend = true,
  showStopLabels = true,
  routeLabel = 'M15 +SBS · East Side corridor',
  benchmark = null,   // { value, label, color } — a horizontal reference
                      // line laid over the profile (e.g. a peer route's avg)
}) {
  const padL = 60, padR = 102;
  const trackLeft = padL;
  const trackRight = width - padR;
  const trackW = trackRight - trackLeft;
  const segW = trackW / segments.length;
  const stopX = (i) => trackLeft + i * segW;
  const segCx = (i) => trackLeft + i * segW + segW / 2;

  const stopLabY = showLegend ? 78 : 34;
  const pTop = stopLabY + 18;
  const pBot = pTop + 120;
  const pH = pBot - pTop;
  const laneY = pBot + 34;
  const aceY = laneY + 22;
  const tspY = aceY + 20;
  const railLabelX = padL - 10;

  const lo = 3.2, hi = 9.0;
  const yOf = (v) => pBot - ((v - lo) / (hi - lo)) * pH;
  // Stepped corridor geometry — each segment is a horizontal run at its
  // own speed height; vertical connectors step between them so the route
  // reads as a strip map with elevation, not a chart curve.
  const bx = (i) => stopX(i);
  const speeds = segments.map((s) => s.mph);
  const scheds = segments.map((s) => s.sched);
  const stair = (vals) => {
    let d = `M${bx(0).toFixed(1)},${yOf(vals[0]).toFixed(1)}`;
    for (let i = 0; i < vals.length; i++) {
      d += ` L${bx(i + 1).toFixed(1)},${yOf(vals[i]).toFixed(1)}`;
      if (i < vals.length - 1) d += ` L${bx(i + 1).toFixed(1)},${yOf(vals[i + 1]).toFixed(1)}`;
    }
    return d;
  };
  const areaStair = `${stair(speeds)} L${bx(segments.length).toFixed(1)},${pBot} L${bx(0).toFixed(1)},${pBot} Z`;
  const schedStair = stair(scheds);
  // Station node y: terminus sits on its segment, interior stops sit at the
  // step between the two segments they join.
  const nodeY = (i) => i === 0 ? yOf(speeds[0])
    : i === stops.length - 1 ? yOf(speeds[speeds.length - 1])
    : (yOf(speeds[i - 1]) + yOf(speeds[i])) / 2;

  const laneCount = segments.filter((s) => s.lane === 'yes').length;
  const lanePartial = segments.filter((s) => s.lane === 'partial').length;
  const aceCount = segments.filter((s) => s.ace).length;
  const tspCount = segments.filter((s) => s.tsp).length;
  const pct = (n) => Math.round((n / segments.length) * 100);

  return (
    <svg width={width} height={height} style={{ display: 'block' }} fontFamily={BPIFonts}>
      <defs>
        <linearGradient id="cm-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={BPI.ink} stopOpacity="0.10" />
          <stop offset="100%" stopColor={BPI.ink} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* ── LEGEND ───────────────────────────────────────────── */}
      {showLegend && (
        <g>
          <text x={padL} y={20} fontSize="10" fontFamily={BPIMono} fill={BPI.ink55} fontWeight="700" letterSpacing="0.1em">
            CORRIDOR · WEEKDAY SPEED · MAR 2026
          </text>
          <g transform={`translate(${padL}, 36)`}>
            <circle cx={4} cy={4} r={4} fill={BPI.good} />
            <text x={14} y={7.5} fontSize="10" fill={BPI.ink70}>&gt; 6.5</text>
            <circle cx={62} cy={4} r={4} fill={BPI.warn} />
            <text x={72} y={7.5} fontSize="10" fill={BPI.ink70}>5–6.5</text>
            <circle cx={120} cy={4} r={4} fill={BPI.bad} />
            <text x={130} y={7.5} fontSize="10" fill={BPI.ink70}>&lt; 5 mph</text>
            <line x1={196} y1={4} x2={224} y2={4} stroke={BPI.ink40} strokeWidth="1.4" strokeDasharray="4 3" />
            <text x={230} y={7.5} fontSize="10" fill={BPI.ink70}>scheduled timepoint</text>
          </g>
        </g>
      )}

      {/* ── DIRECTION ────────────────────────────────────────── */}
      <text x={padL} y={stopLabY - 16} fontSize="9" fontFamily={BPIMono} fill={BPI.ink40} fontWeight="700" letterSpacing="0.08em">↑ NORTH · East Harlem</text>
      <text x={trackRight} y={stopLabY - 16} fontSize="9" fontFamily={BPIMono} fill={BPI.ink40} fontWeight="700" letterSpacing="0.08em" textAnchor="end">South Ferry · SOUTH ↓</text>

      {/* ── SLOW-ZONE SHADING (behind profile) ───────────────── */}
      {segments.map((s, i) => {
        if (s.mph >= 6.5) return null;
        const tone = s.mph < 5 ? BPI.bad : BPI.warn;
        return (
          <rect key={i} x={stopX(i)} y={pTop} width={segW} height={pH}
            fill={tone} opacity={s.mph < 5 ? 0.1 : 0.055} />
        );
      })}

      {/* ── STOP LABELS ──────────────────────────────────────── */}
      {showStopLabels && stops.map((s, i) => {
        const x = stopX(i);
        const isTerm = s.terminus;
        return (
          <g key={s.id}>
            <text x={x} y={stopLabY} fontSize={isTerm ? 10.5 : 9.5} fontWeight={isTerm ? 700 : 500}
              fill={isTerm ? BPI.ink : BPI.ink55}
              textAnchor={i === 0 ? 'start' : i === stops.length - 1 ? 'end' : 'middle'} letterSpacing="-0.005em">{s.short}</text>
            <line x1={x} y1={stopLabY + 5} x2={x} y2={nodeY(i) - 5} stroke={BPI.ink} strokeOpacity="0.1" strokeWidth="1" />
          </g>
        );
      })}

      {/* ── CORRIDOR ROUTE LINE (stepped, segment-colored) ───── */}
      <path d={areaStair} fill="url(#cm-area)" />
      <path d={schedStair} fill="none" stroke={BPI.ink40} strokeWidth="1.3" strokeDasharray="4 3" opacity="0.8" />
      {/* vertical step connectors */}
      {segments.slice(0, -1).map((s, i) => (
        <line key={`c${i}`} x1={bx(i + 1)} y1={yOf(speeds[i])} x2={bx(i + 1)} y2={yOf(speeds[i + 1])}
          stroke={BPI.ink} strokeOpacity="0.22" strokeWidth="2" />
      ))}
      {/* segment runs — the colored route */}
      {segments.map((s, i) => {
        const isWorst = s.story === 'top';
        return (
          <line key={`r${i}`} x1={bx(i) + 1.5} y1={yOf(s.mph)} x2={bx(i + 1) - 1.5} y2={yOf(s.mph)}
            stroke={profileTier(s.mph)} strokeWidth={isWorst ? 6 : 5} strokeLinecap="round" />
        );
      })}
      {/* mph labels per segment */}
      {segments.map((s, i) => {
        const isWorst = s.story === 'top';
        return (
          <text key={`l${i}`} x={segCx(i)} y={yOf(s.mph) - 10} fontSize={isWorst ? 12 : 10.5}
            fontWeight={isWorst ? 700 : 600} fill={profileTier(s.mph)} textAnchor="middle"
            style={{ fontVariantNumeric: 'tabular-nums' }}>{s.mph.toFixed(1)}</text>
        );
      })}
      {/* station nodes on the route */}
      {stops.map((s, i) => {
        const isTerm = s.terminus;
        return (
          <circle key={`n${i}`} cx={stopX(i)} cy={nodeY(i)} r={isTerm ? 4.5 : 3}
            fill={isTerm ? BPI.ink : BPI.card} stroke={BPI.ink} strokeWidth={isTerm ? 0 : 1.5} />
        );
      })}
      {/* benchmark — peer-route reference line laid over the profile */}
      {benchmark && (
        <g>
          <line x1={trackLeft} x2={trackRight} y1={yOf(benchmark.value)} y2={yOf(benchmark.value)}
            stroke={benchmark.color} strokeWidth="1.6" strokeDasharray="2 3" opacity="0.95" />
          <g transform={`translate(${trackRight + 6}, ${yOf(benchmark.value)})`}>
            <text x={0} y={-3} fontSize="9.5" fontFamily={BPIMono} fontWeight="700" fill={benchmark.color}>{benchmark.value.toFixed(2)}</text>
            <text x={0} y={9} fontSize="8" fontFamily={BPIMono} fill={benchmark.color} opacity="0.85">{benchmark.label}</text>
          </g>
        </g>
      )}
      {/* highlight ring */}
      {highlightI != null && (
        <circle cx={segCx(highlightI)} cy={yOf(speeds[highlightI])} r={10} fill="none" stroke={BPI.accent} strokeWidth="1.6" />
      )}
      {/* worst-zone callout — labels the shaded slow column */}
      {(() => {
        const wi = segments.findIndex((s) => s.story === 'top');
        if (wi < 0) return null;
        return (
          <g transform={`translate(${segCx(wi)}, ${pTop - 3})`}>
            <rect x={-52} y={-15} width={104} height={15} rx={2} fill={BPI.bad} />
            <text x={0} y={-4} fontSize="8.5" fontFamily={BPIMono} fontWeight="700" fill="#fff" textAnchor="middle" letterSpacing="0.08em">WORST · MADISON AV</text>
          </g>
        );
      })()}

      {/* ── COVERAGE RAILS ───────────────────────────────────── */}
      <text x={railLabelX} y={pBot + 16} fontSize="8.5" fontFamily={BPIMono} fill={BPI.ink40} textAnchor="end" letterSpacing="0.08em" fontWeight="700">PRIORITY</text>
      <text x={trackLeft} y={pBot + 16} fontSize="9.5" fontFamily={BPIMono} fill={BPI.ink55}>Where the three segment-varying treatments are in place</text>
      <CorridorRail segments={segments} y={laneY} segW={segW} trackLeft={trackLeft} labelX={railLabelX}
        label="LANE" kind="lane" summary={`${pct(laneCount)}% full${lanePartial ? ` · ${lanePartial} partial` : ''}`} />
      <CorridorRail segments={segments} y={aceY} segW={segW} trackLeft={trackLeft} labelX={railLabelX}
        label="ACE" kind="ace" summary={`${pct(aceCount)}%`} />
      <CorridorRail segments={segments} y={tspY} segW={segW} trackLeft={trackLeft} labelX={railLabelX}
        label="TSP" kind="tsp" summary={`${pct(tspCount)}%`} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// CorridorMapMini — thin one-line version for inline use in segment rows.
// ─────────────────────────────────────────────────────────────
function CorridorMapMini({ segments = M15_CORRIDOR_SEGMENTS, highlightI = null, width = 160, height = 22 }) {
  const padX = 4;
  const trackW = width - padX * 2;
  const segW = trackW / segments.length;
  const trackY = height / 2;
  const trackH = 10;
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <rect x={padX} y={trackY - trackH / 2} width={trackW} height={trackH} fill={BPI.ink06} rx={1.5} />
      {segments.map((s, i) => {
        const x = padX + i * segW;
        const dim = highlightI != null && highlightI !== i;
        return (
          <rect key={i} x={x + 0.5} y={trackY - trackH / 2} width={segW - 1} height={trackH}
            fill={speedColor(s.mph)} opacity={dim ? 0.28 : 1} rx={1} />
        );
      })}
      {highlightI != null && (
        <rect x={padX + highlightI * segW - 0.5} y={trackY - trackH / 2 - 2} width={segW + 1} height={trackH + 4}
          fill="none" stroke={BPI.accent} strokeWidth="1.5" rx={1.5} />
      )}
      <circle cx={padX} cy={trackY} r={2.5} fill={BPI.ink} />
      <circle cx={padX + trackW} cy={trackY} r={2.5} fill={BPI.ink} />
    </svg>
  );
}

Object.assign(window, {
  CorridorMap, CorridorMapMini, ManhattanInset, CorridorRail,
  M15_CORRIDOR_SEGMENTS, M15_STOPS,
});
