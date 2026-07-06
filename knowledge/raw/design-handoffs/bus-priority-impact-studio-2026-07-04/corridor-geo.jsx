// corridor-geo.jsx — the geographic route-detail map.
//
// The M15 drawn as real East-Side street geometry (avenue running N→S, the
// grid bending toward South Ferry below Houston, the East River to the
// east). Three things make it "maps-first" and alive:
//   • segments recolor live by time of day (shared TimeScrubber + play)
//   • hovering a segment links the geo map ↔ the speed-profile strip
//   • priority layers (bus lane / ACE / TSP) toggle on and off over the map
//
// Sits where the static CorridorMap profile sits today, on Overview.

const CG_SEGS = (typeof M15_CORRIDOR_SEGMENTS !== 'undefined') ? M15_CORRIDOR_SEGMENTS : M15_GEO.segFallback;
const CG_STOPS = M15_GEO.stops;

function cgSev(mph) { return mph < 5 ? 0.95 : mph < 6 ? 0.7 : 0.45; }

// ─────────────────────────────────────────────────────────────
// CG_Map — the geographic SVG.
// ─────────────────────────────────────────────────────────────
function CG_Map({ segSpeeds, hovered, setHovered, layers }) {
  const V = M15_GEO.view;
  const stops = CG_STOPS;
  const segMidX = (i) => (stops[i].x + stops[i + 1].x) / 2;
  const segMidY = (i) => (stops[i].y + stops[i + 1].y) / 2;
  const worstI = CG_SEGS.findIndex((s) => s.story === 'top');

  return (
    <svg viewBox={`0 0 ${V.w} ${V.h}`} width="100%" style={{ display: 'block' }}
      onMouseLeave={() => setHovered(null)}>
      <defs>
        <linearGradient id="cg-water" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(0.915 0.014 232)" />
          <stop offset="100%" stopColor="oklch(0.885 0.018 236)" />
        </linearGradient>
      </defs>

      {/* land + river */}
      <rect x="0" y="0" width={V.w} height={V.h} fill={BPI.card} />
      <path d={M15_GEO.river} fill="url(#cg-water)" />
      <text x={520} y={300} fill={BPI.ink20} fontFamily={BPIMono} fontSize="11" fontWeight="600"
        letterSpacing="0.2em" textAnchor="middle" transform="rotate(90 520 300)">EAST RIVER</text>

      {/* context avenues (faint), gridded portion only */}
      {M15_GEO.avenues.map((a, i) => (
        <g key={i}>
          <line x1={a.x} y1={48} x2={a.x} y2={556} stroke={BPI.ink} strokeOpacity="0.07" strokeWidth="1.5" />
          <text x={a.x} y={40} fill={BPI.ink40} fontFamily={BPIMono} fontSize="9" textAnchor="middle" letterSpacing="0.04em">{a.label}</text>
        </g>
      ))}
      <text x={388} y={40} fill={BPI.ink55} fontFamily={BPIMono} fontSize="9" fontWeight="700" textAnchor="middle" letterSpacing="0.04em">1/2 Av</text>

      {/* cross-street ticks + labels (west of avenue) */}
      {stops.map((s, i) => (
        <g key={s.id}>
          <line x1={s.x - 46} y1={s.y} x2={s.x - 7} y2={s.y} stroke={BPI.ink} strokeOpacity="0.10" strokeWidth="1" />
          <text x={s.x - 52} y={s.y + 3.5} fill={s.terminus ? BPI.ink : BPI.ink55} fontFamily={BPIMono}
            fontSize={s.terminus ? 10.5 : 9.5} fontWeight={s.terminus ? 700 : 500} textAnchor="end">{s.cross}</text>
        </g>
      ))}

      {/* direction labels */}
      <text x={stops[0].x + 16} y={stops[0].y - 16} fill={BPI.ink55} fontFamily={BPIMono} fontSize="9.5" fontWeight="700" letterSpacing="0.06em">↑ NORTH · East Harlem</text>
      <text x={stops[stops.length - 1].x - 4} y={stops[stops.length - 1].y + 26} fill={BPI.ink55} fontFamily={BPIMono} fontSize="9.5" fontWeight="700" letterSpacing="0.06em" textAnchor="middle">South Ferry · SOUTH ↓</text>

      {/* route casing */}
      <path d={stops.map((s, i) => (i ? 'L' : 'M') + s.x + ',' + s.y).join(' ')}
        fill="none" stroke={BPI.paper} strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />

      {/* worst-segment glow */}
      {worstI >= 0 && (
        <line x1={stops[worstI].x} y1={stops[worstI].y} x2={stops[worstI + 1].x} y2={stops[worstI + 1].y}
          stroke={BPI.bad} strokeWidth="20" strokeLinecap="round" opacity="0.16" />
      )}

      {/* bus-lane layer — offset casing east of the route */}
      {layers.lane && CG_SEGS.map((seg, i) => {
        if (seg.lane === 'no') return null;
        const partial = seg.lane === 'partial';
        return (
          <line key={'ln' + i} x1={stops[i].x + 9} y1={stops[i].y} x2={stops[i + 1].x + 9} y2={stops[i + 1].y}
            stroke={partial ? BPI.warn : BPI.good} strokeWidth="3" strokeLinecap="round"
            strokeDasharray={partial ? '5 4' : undefined} opacity="0.9" />
        );
      })}

      {/* route segments — colored by hourly speed */}
      {CG_SEGS.map((seg, i) => {
        const active = hovered === i;
        const col = speedToColor(segSpeeds[i]);
        return (
          <g key={i} onMouseEnter={() => setHovered(i)} style={{ cursor: 'pointer' }}>
            <line x1={stops[i].x} y1={stops[i].y} x2={stops[i + 1].x} y2={stops[i + 1].y}
              stroke="transparent" strokeWidth="22" strokeLinecap="round" />
            <line x1={stops[i].x} y1={stops[i].y} x2={stops[i + 1].x} y2={stops[i + 1].y}
              stroke={col} strokeWidth={active ? 10 : seg.story === 'top' ? 8 : 7} strokeLinecap="round"
              style={{ transition: 'stroke .5s, stroke-width .18s' }}
              opacity={hovered != null && !active ? 0.5 : 1} />
            {/* mph label east of midpoint */}
            <text x={segMidX(i) + 20} y={segMidY(i) + 3.5} fontSize={active || seg.story === 'top' ? 12 : 10.5}
              fontWeight={active || seg.story === 'top' ? 700 : 600} fill={col} textAnchor="start"
              style={{ fontVariantNumeric: 'tabular-nums', transition: 'fill .5s' }}>{segSpeeds[i].toFixed(1)}</text>
          </g>
        );
      })}

      {/* ACE + TSP markers */}
      {CG_SEGS.map((seg, i) => {
        const mx = segMidX(i) - 22, my = segMidY(i);
        return (
          <g key={'mk' + i} style={{ pointerEvents: 'none' }}>
            {layers.ace && seg.ace && (
              <g transform={`translate(${mx}, ${my})`}>
                <rect x={-7} y={-5} width={14} height={10} rx="2" fill={BPI.accent} />
                <circle cx={0} cy={0} r="2.4" fill="#fff" />
              </g>
            )}
            {layers.tsp && seg.tsp && (
              <g transform={`translate(${mx - (layers.ace && seg.ace ? 18 : 0)}, ${my})`}>
                <rect x={-5} y={-7} width={10} height={14} rx="2.5" fill={BPI.good} />
                <circle cx={0} cy={-3} r="1.7" fill="#fff" />
                <circle cx={0} cy={3} r="1.7" fill="#fff" opacity="0.5" />
              </g>
            )}
          </g>
        );
      })}

      {/* stops */}
      {stops.map((s, i) => (
        <circle key={s.id} cx={s.x} cy={s.y} r={s.terminus ? 5 : 3.2}
          fill={s.terminus ? BPI.ink : BPI.card} stroke={s.terminus ? BPI.ink : BPI.ink70} strokeWidth="1.6" />
      ))}

      {/* worst callout */}
      {worstI >= 0 && (
        <g transform={`translate(${segMidX(worstI) + 56}, ${segMidY(worstI)})`} style={{ pointerEvents: 'none' }}>
          <rect x={0} y={-9} width={104} height={18} rx="3" fill={BPI.bad} />
          <text x={9} y={3.5} fontSize="9" fontFamily={BPIMono} fontWeight="700" fill="#fff" letterSpacing="0.06em">WORST · MADISON</text>
        </g>
      )}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// CG_Profile — the linked speed-profile strip. Same data, the studio's
// original abstraction; hovering here drives the map and vice versa.
// ─────────────────────────────────────────────────────────────
function CG_Profile({ segSpeeds, hovered, setHovered }) {
  const W = 700, H = 132, padL = 8, padR = 8, padT = 16, padB = 30;
  const n = CG_SEGS.length;
  const segW = (W - padL - padR) / n;
  const lo = 3, hi = 9.5;
  const yOf = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} onMouseLeave={() => setHovered(null)}>
      {/* gridlines */}
      {[4, 6, 8].map((v) => (
        <g key={v}>
          <line x1={padL} x2={W - padR} y1={yOf(v)} y2={yOf(v)} stroke={BPI.rule} />
          <text x={W - padR} y={yOf(v) - 3} fontSize="8.5" fill={BPI.ink40} fontFamily={BPIMono} textAnchor="end">{v}</text>
        </g>
      ))}
      {/* scheduled reference */}
      {CG_SEGS.map((seg, i) => (
        <line key={'s' + i} x1={padL + i * segW + 2} x2={padL + (i + 1) * segW - 2} y1={yOf(seg.sched)} y2={yOf(seg.sched)}
          stroke={BPI.ink40} strokeWidth="1.2" strokeDasharray="3 2.5" opacity="0.7" />
      ))}
      {/* segment bars */}
      {CG_SEGS.map((seg, i) => {
        const active = hovered === i;
        const col = speedToColor(segSpeeds[i]);
        const x = padL + i * segW;
        const y = yOf(segSpeeds[i]);
        return (
          <g key={i} onMouseEnter={() => setHovered(i)} style={{ cursor: 'pointer' }}>
            <rect x={x} y={padT} width={segW} height={H - padT - padB} fill={active ? BPI.ink06 : 'transparent'} />
            <rect x={x + 2} y={y} width={segW - 4} height={yOf(lo) - y} fill={col} rx="1.5"
              opacity={hovered != null && !active ? 0.5 : 1} style={{ transition: 'fill .5s, opacity .2s' }} />
            <text x={x + segW / 2} y={y - 4} fontSize={active ? 10.5 : 9} fontWeight={active ? 700 : 600}
              fill={col} textAnchor="middle" style={{ fontVariantNumeric: 'tabular-nums', transition: 'fill .5s' }}>{segSpeeds[i].toFixed(1)}</text>
            <text x={x + segW / 2} y={H - 16} fontSize="8" fill={BPI.ink55} fontFamily={BPIMono} textAnchor="middle">{CG_STOPS[i].cross}</text>
          </g>
        );
      })}
      <text x={W - padR} y={H - 4} fontSize="8" fill={BPI.ink40} fontFamily={BPIMono} textAnchor="end">S. Ferry</text>
      <text x={padL} y={H - 4} fontSize="8" fill={BPI.ink40} fontFamily={BPIMono}>↑N  dashed = scheduled</text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// CG_LayerToggle
// ─────────────────────────────────────────────────────────────
function CG_LayerToggle({ on, onClick, color, swatch, label, sub }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px',
      border: `1px solid ${on ? color : BPI.ink20}`, borderRadius: 4, cursor: 'pointer',
      background: on ? `color-mix(in oklch, ${color} 9%, ${BPI.card})` : BPI.card,
      fontFamily: 'inherit', textAlign: 'left', transition: 'border-color .15s, background .15s',
    }}>
      <span style={{ flexShrink: 0 }}>{swatch}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: on ? BPI.ink : BPI.ink55 }}>{label}</span>
        <span style={{ display: 'block', fontSize: 9.5, color: BPI.ink40, fontFamily: BPIMono }}>{sub}</span>
      </span>
      <span style={{
        flexShrink: 0, width: 26, height: 15, borderRadius: 8, position: 'relative',
        background: on ? color : BPI.ink20, transition: 'background .15s',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: on ? 13 : 2, width: 11, height: 11, borderRadius: 6,
          background: '#fff', transition: 'left .15s',
        }} />
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// CG_Readout — segment detail (hovered) or corridor summary (default).
// ─────────────────────────────────────────────────────────────
function CG_Readout({ hovered, hour, segSpeeds }) {
  if (hovered == null) {
    const avg = corridorAvgAt(hour);
    const worstI = CG_SEGS.findIndex((s) => s.story === 'top');
    return (
      <div>
        <div style={{ fontSize: 11.5, color: BPI.ink55, marginBottom: 12, lineHeight: 1.5 }}>
          Hover any segment — on the map or the strip — to read it. The two views are the same data: where it is, and how slow it gets.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 4, background: BPI.bad, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0,
          }}>!</div>
          <div style={{ fontSize: 12.5, color: BPI.ink70, lineHeight: 1.5 }}>
            <b style={{ color: BPI.ink }}>Madison Av, 28–58 St</b> is the worst stretch — the only segment without a continuous bus lane, and 43% of the route’s rider-hour delay. At {fmtHour(hour)} it runs <b style={{ color: speedToColor(segSpeeds[worstI]) }}>{segSpeeds[worstI].toFixed(1)} mph</b>.
          </div>
        </div>
      </div>
    );
  }
  const seg = CG_SEGS[hovered];
  const v = segSpeeds[hovered];
  const col = speedToColor(v);
  const gap = (seg.sched - v);
  const present = [
    seg.lane === 'yes' ? { t: 'Bus lane', c: BPI.good } : seg.lane === 'partial' ? { t: 'Bus lane · partial', c: BPI.warn } : null,
    seg.ace ? { t: 'ACE cameras', c: BPI.accent } : null,
    seg.tsp ? { t: 'Signal priority', c: BPI.good } : null,
  ].filter(Boolean);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 9.5, color: BPI.ink55, fontFamily: BPIMono, letterSpacing: '0.06em', marginBottom: 3 }}>{(seg.dir || 'NB')} · SEGMENT</div>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.2 }}>{seg.label}</div>
        </div>
        {seg.story === 'top' && <span className="chip bad" style={{ flexShrink: 0, fontWeight: 700 }}>WORST</span>}
      </div>
      {/* hero */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
          <div className="num" style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 0.9, color: col, transition: 'color .5s' }}>{v.toFixed(1)}</div>
          <div>
            <div style={{ fontSize: 12, color: BPI.ink70, fontWeight: 500 }}>mph</div>
            <div style={{ fontSize: 10, color: BPI.ink55, fontFamily: BPIMono }}>{fmtHour(hour)}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="num" style={{ fontSize: 18, fontWeight: 700, color: gap > 1.5 ? BPI.bad : BPI.ink, lineHeight: 1 }}>−{gap.toFixed(1)}</div>
          <div style={{ fontSize: 9.5, color: BPI.ink55, fontFamily: BPIMono, letterSpacing: '0.04em' }}>vs {seg.sched.toFixed(1)} sched</div>
        </div>
      </div>
      {/* inline stat strip */}
      <div style={{ display: 'flex', borderTop: `1px solid ${BPI.rule}`, borderBottom: `1px solid ${BPI.rule}`, padding: '10px 0', marginBottom: 14 }}>
        <div style={{ flex: 1, paddingRight: 12 }}>
          <div className="eyebrow" style={{ fontSize: 9.5, marginBottom: 4, color: BPI.ink55 }}>RIDERS / DAY</div>
          <span className="num" style={{ fontSize: 16, fontWeight: 600 }}>{seg.rh.toLocaleString()}</span>
        </div>
        <div style={{ width: 1, background: BPI.rule }} />
        <div style={{ flex: 1, paddingLeft: 12 }}>
          <div className="eyebrow" style={{ fontSize: 9.5, marginBottom: 4, color: BPI.ink55 }}>SHARE OF ROUTE DELAY</div>
          <span className="num" style={{ fontSize: 16, fontWeight: 600, color: seg.story === 'top' ? BPI.bad : BPI.ink }}>{seg.story === 'top' ? '43%' : `${Math.max(3, Math.round(seg.rh / 1100))}%`}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: present.length ? 0 : 0 }}>
        <span style={{ fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono, marginRight: 2 }}>In place:</span>
        {present.length ? present.map((p, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 600, color: p.c, background: `color-mix(in oklch, ${p.c} 12%, ${BPI.card})`, padding: '3px 8px', borderRadius: 3 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: p.c }} />{p.t}
          </span>
        )) : <span style={{ fontSize: 10.5, color: BPI.ink40 }}>no segment-varying priority</span>}
      </div>
      {seg.aiNote && (
        <div style={{ marginTop: 12, padding: '10px 12px', background: BPI.accentBg, borderRadius: 4, fontSize: 11.5, color: BPI.ink70, lineHeight: 1.5 }}>
          <span style={{ color: BPI.accent, fontWeight: 700, fontFamily: BPIMono, fontSize: 9.5, letterSpacing: '0.06em' }}>◆ AI · </span>{seg.aiNote}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RF_CorridorGeoScreen — route-detail Overview, maps-first.
// ─────────────────────────────────────────────────────────────
function RF_CorridorGeoScreen() {
  const [hour, setHour] = React.useState(17);
  const [playing, setPlaying] = React.useState(false);
  const [hovered, setHovered] = React.useState(null);
  const [layers, setLayers] = React.useState({ lane: true, ace: false, tsp: false });

  React.useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setHour((h) => (h >= 23 ? 5 : h + 1)), 850);
    return () => clearInterval(t);
  }, [playing]);

  const segSpeeds = React.useMemo(
    () => CG_SEGS.map((s) => hourSpeed(s.mph, hour, cgSev(s.mph))),
    [hour]
  );
  const avg = corridorAvgAt(hour);
  const toggle = (k) => setLayers((l) => ({ ...l, [k]: !l[k] }));

  return (
    <div className="bpi" style={{ width: 1320, minHeight: 1000, display: 'flex', flexDirection: 'column', background: BPI.paper }}>
      <StudioBar active="Routes" breadcrumb="Routes / M15 +SBS" />

      {/* route header */}
      <div style={{ padding: '20px 28px 0', background: BPI.card, boxShadow: `inset 0 -1px 0 ${BPI.rule}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
          <RouteBadge route="M15" sbs size="xl" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.1 }}>1st Avenue / 2nd Avenue Select Bus Service</div>
            <div style={{ fontSize: 12.5, color: BPI.ink55, marginTop: 4 }}>Manhattan · East Harlem ↔ South Ferry · 8.4 mi · 33 stops</div>
          </div>
          <Button variant="primary">Generate brief →</Button>
        </div>
        <div style={{ display: 'flex', gap: 22, fontSize: 12.5 }}>
          {['Overview', 'Map', 'Slow segments', 'Riders', 'Interventions', 'Timeline'].map((t) => (
            <span key={t} style={{
              padding: '10px 0', color: t === 'Map' ? BPI.ink : BPI.ink55, fontWeight: t === 'Map' ? 600 : 400,
              boxShadow: t === 'Map' ? `inset 0 -2px 0 ${BPI.ink}` : 'none', cursor: 'pointer',
            }}>{t}</span>
          ))}
        </div>
      </div>

      {/* body */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '512px 1fr', gap: 0 }}>
        {/* map column */}
        <div style={{ padding: '20px 20px 24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>The corridor, on the street</div>
            <span style={{ fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono }}>NB · weekday</span>
          </div>
          <div style={{ background: BPI.card, borderRadius: 6, boxShadow: `0 0 0 1px ${BPI.rule}`, padding: '8px 10px' }}>
            <CG_Map segSpeeds={segSpeeds} hovered={hovered} setHovered={setHovered} layers={layers} />
          </div>
        </div>

        {/* right column */}
        <div style={{ padding: '20px 28px 24px 20px', display: 'flex', flexDirection: 'column', gap: 16, borderLeft: `1px solid ${BPI.rule}`, background: BPI.card }}>
          {/* time + avg */}
          <div>
            <TimeScrubber hour={hour} setHour={setHour} playing={playing} setPlaying={setPlaying} />
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginTop: 16 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 5 }}>Corridor average · {fmtHour(hour)}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                  <div className="num" style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1, color: speedToColor(avg), transition: 'color .5s' }}>{avg.toFixed(1)}</div>
                  <div style={{ fontSize: 12, color: BPI.ink55 }}>mph</div>
                </div>
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ textAlign: 'right', fontSize: 11, color: BPI.ink55, lineHeight: 1.5, maxWidth: 200 }}>
                Scheduled timepoint is <b style={{ color: BPI.ink }}>7.6 mph</b>. At {hourTag(hour).toLowerCase()} the gap is the lost time riders feel.
              </div>
            </div>
          </div>

          {/* layers */}
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Priority layers — toggle onto the map</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <CG_LayerToggle on={layers.lane} onClick={() => toggle('lane')} color={BPI.good} label="Bus lane"
                sub="solid=full · dashed=partial"
                swatch={<svg width="20" height="14"><line x1="3" y1="7" x2="17" y2="7" stroke={BPI.good} strokeWidth="3" strokeLinecap="round" /></svg>} />
              <CG_LayerToggle on={layers.ace} onClick={() => toggle('ace')} color={BPI.accent} label="ACE cameras"
                sub="enforcement"
                swatch={<svg width="20" height="14"><rect x="3" y="2" width="14" height="10" rx="2" fill={BPI.accent} /><circle cx="10" cy="7" r="2.4" fill="#fff" /></svg>} />
              <CG_LayerToggle on={layers.tsp} onClick={() => toggle('tsp')} color={BPI.good} label="Signal priority"
                sub="TSP"
                swatch={<svg width="20" height="14"><rect x="5" y="0" width="10" height="14" rx="2.5" fill={BPI.good} /><circle cx="10" cy="4" r="1.8" fill="#fff" /><circle cx="10" cy="10" r="1.8" fill="#fff" opacity="0.5" /></svg>} />
            </div>
          </div>

          {/* linked profile */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Speed profile <span style={{ color: BPI.ink55, fontWeight: 400 }}>· linked to the map</span></div>
              <span style={{ fontSize: 10, color: BPI.ink40, fontFamily: BPIMono }}>N → S</span>
            </div>
            <div style={{ background: BPI.paper, borderRadius: 5, boxShadow: `inset 0 0 0 1px ${BPI.rule}`, padding: '6px 8px' }}>
              <CG_Profile segSpeeds={segSpeeds} hovered={hovered} setHovered={setHovered} />
            </div>
          </div>

          {/* readout */}
          <div style={{ background: BPI.paper, borderRadius: 5, boxShadow: `inset 0 0 0 1px ${BPI.rule}`, padding: '16px 18px', minHeight: 132 }}>
            <CG_Readout hovered={hovered} hour={hour} segSpeeds={segSpeeds} />
          </div>

          <div style={{ flex: 1 }} />

          {/* corridor KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, borderTop: `1px solid ${BPI.rule}`, paddingTop: 14 }}>
            {[
              { lbl: 'Weighted avg speed', val: '6.74', unit: 'mph', sub: '7th pct of NYC SBS' },
              { lbl: 'Daily riders', val: '37.2K', sub: '−4.1% YoY' },
              { lbl: 'Rider-hrs lost / day', val: '4,310', sub: 'vs scheduled', tone: 'bad' },
            ].map((k, i) => (
              <div key={i} style={{ paddingRight: 16, borderRight: i < 2 ? `1px solid ${BPI.rule}` : 'none' }}>
                <div className="eyebrow" style={{ marginBottom: 5, fontSize: 10.5 }}>{k.lbl}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                  <div className="num" style={{ fontSize: 21, fontWeight: 600, letterSpacing: '-0.02em', color: k.tone === 'bad' ? BPI.bad : BPI.ink, lineHeight: 1 }}>{k.val}</div>
                  {k.unit && <div style={{ fontSize: 10, color: BPI.ink55 }}>{k.unit}</div>}
                </div>
                <div style={{ fontSize: 10, color: BPI.ink55, marginTop: 3 }}>{k.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <StudioFooter sources={['MTA Bus Speeds', 'Hourly Ridership', 'NYC DOT bus lanes', 'ACE program']} />
    </div>
  );
}

Object.assign(window, { RF_CorridorGeoScreen, CorridorGeoMap: CG_Map });
