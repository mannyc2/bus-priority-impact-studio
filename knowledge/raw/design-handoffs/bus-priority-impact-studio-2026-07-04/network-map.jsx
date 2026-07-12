// network-map.jsx — the maps-first citywide view.
//
// A stylized geographic map of NYC's modeled bus corridors, recolored live
// by time of day. Hover a corridor (or a list row) to read it in the
// persistent detail panel; click to pin it; scrub or play the clock to
// watch the network slow into rush hour. The two slowest corridors pulse.

function nmPath(pts) { return pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ',' + p[1]).join(' '); }
function nmMid(pts) { return pts[Math.floor(pts.length / 2)]; }
function fmtHour(h) {
  const ap = h < 12 || h === 24 ? 'AM' : 'PM';
  let hh = h % 12; if (hh === 0) hh = 12;
  return `${hh}:00 ${ap}`;
}
function hourTag(h) {
  if (h >= 7 && h <= 9) return 'AM peak';
  if (h >= 16 && h <= 19) return 'PM peak';
  if (h >= 10 && h <= 15) return 'Midday';
  if (h < 6 || h > 21) return 'Off-peak';
  return 'Shoulder';
}

// ─────────────────────────────────────────────────────────────
// TimeScrubber — a precise transport control. Play/pause + a timeline
// with hour ticks, shaded AM/PM peak bands, a draggable head and a time
// pill. Shared by both map screens.
// ─────────────────────────────────────────────────────────────
function TimeScrubber({ hour, setHour, playing, setPlaying, accent }) {
  const ac = accent || BPI.ink;
  const lo = 5, hi = 23;
  const pct = (hour - lo) / (hi - lo);
  const pillPct = Math.max(7, Math.min(93, pct * 100));
  const xpc = (h) => `${((h - lo) / (hi - lo)) * 100}%`;
  const labels = [[6, '6a'], [9, '9a'], [12, '12p'], [15, '3p'], [18, '6p'], [21, '9p']];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
      <button onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'} style={{
        flexShrink: 0, width: 40, height: 40, borderRadius: 20, cursor: 'pointer',
        border: playing ? `2px solid ${ac}` : '2px solid transparent', background: ac, color: BPI.paper,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: playing ? `0 0 0 3px color-mix(in oklch, ${ac} 18%, transparent)` : 'none',
        transition: 'box-shadow .2s',
      }}>
        {playing
          ? <svg width="12" height="13" viewBox="0 0 12 13"><rect x="1.5" width="3.2" height="13" rx="1.2" fill="currentColor" /><rect x="7.3" width="3.2" height="13" rx="1.2" fill="currentColor" /></svg>
          : <svg width="13" height="14" viewBox="0 0 13 14"><path d="M1.5 1.4v11.2a1 1 0 0 0 1.52.86l9.2-5.6a1 1 0 0 0 0-1.72l-9.2-5.6A1 1 0 0 0 1.5 1.4Z" fill="currentColor" /></svg>}
      </button>

      <div style={{ flex: 1, minWidth: 0, position: 'relative', height: 46 }}>
        {/* pill */}
        <div style={{
          position: 'absolute', top: 0, left: `${pillPct}%`, transform: 'translateX(-50%)',
          background: BPI.ink, color: BPI.paper, borderRadius: 4, padding: '3px 8px',
          fontFamily: BPIMono, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '0.02em',
          transition: 'left .12s linear', pointerEvents: 'none',
        }}>{fmtHour(hour)}</div>
        {/* rail zone */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 26, height: 7 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 4, background: BPI.ink10 }} />
          {[[7, 9], [16, 19]].map(([a, b], i) => (
            <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: xpc(a), width: `calc(${xpc(b)} - ${xpc(a)})`, background: BPI.warn, opacity: 0.32, borderRadius: 2 }} />
          ))}
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${pct * 100}%`, borderRadius: 4, background: ac, transition: 'width .12s linear' }} />
          {/* hour ticks */}
          {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map((h) => (
            <div key={h} style={{ position: 'absolute', top: 9, left: xpc(h), width: 1, height: h % 3 === (lo % 3) ? 5 : 3, background: BPI.ink20, transform: 'translateX(-0.5px)' }} />
          ))}
          {/* thumb */}
          <div style={{
            position: 'absolute', top: '50%', left: `${pct * 100}%`, width: 16, height: 16, borderRadius: 9,
            transform: 'translate(-50%,-50%)', background: BPI.card, boxShadow: `0 0 0 2.5px ${ac}, 0 1px 3px rgba(22,20,15,.25)`,
            transition: 'left .12s linear', pointerEvents: 'none',
          }} />
        </div>
        {/* labels */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 36, height: 12 }}>
          {labels.map(([h, t]) => (
            <span key={h} style={{ position: 'absolute', left: xpc(h), transform: 'translateX(-50%)', fontSize: 9, color: BPI.ink40, fontFamily: BPIMono }}>{t}</span>
          ))}
        </div>
        {/* drag input */}
        <input type="range" min={lo} max={hi} step={1} value={hour}
          onChange={(e) => { setPlaying(false); setHour(+e.target.value); }}
          style={{ position: 'absolute', left: 0, right: 0, top: 20, width: '100%', height: 20, margin: 0, opacity: 0, cursor: 'pointer' }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// HourCurve — speed across the whole day, with the current hour marked.
// The detail's visual centerpiece; the dot slides as you scrub.
// ─────────────────────────────────────────────────────────────
function HourCurve({ route, hour, width = 312, height = 66 }) {
  const speeds = HOURS.map((h) => hourSpeed(route.mph, h, route.sev));
  const sched = 7.6;
  const lo = Math.min(...speeds, sched) - 0.6;
  const hi = Math.max(...speeds, sched) + 0.6;
  const padL = 4, padR = 4, padT = 8, padB = 14;
  const x = (i) => padL + i * (width - padL - padR) / (HOURS.length - 1);
  const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (height - padT - padB);
  const xh = (h) => x(h - 5);
  const line = speeds.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
  const area = line + ` L${x(HOURS.length - 1)},${height - padB} L${padL},${height - padB} Z`;
  const idx = Math.max(0, Math.min(HOURS.length - 1, hour - 5));
  const nowV = speeds[idx];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: 'block' }}>
      {/* peak bands */}
      {[[7, 9], [16, 19]].map(([a, b], i) => (
        <rect key={i} x={xh(a)} y={padT} width={xh(b) - xh(a)} height={height - padT - padB} fill={BPI.warn} opacity="0.08" />
      ))}
      {/* scheduled */}
      <line x1={padL} x2={width - padR} y1={y(sched)} y2={y(sched)} stroke={BPI.ink40} strokeWidth="1" strokeDasharray="3 2.5" opacity="0.7" />
      <text x={width - padR} y={y(sched) - 3} fontSize="8" fill={BPI.ink40} fontFamily={BPIMono} textAnchor="end">sched 7.6</text>
      {/* area + line */}
      <path d={area} fill={speedToColor(nowV)} opacity="0.1" style={{ transition: 'fill .5s' }} />
      <path d={line} fill="none" stroke={BPI.ink70} strokeWidth="1.6" strokeLinejoin="round" />
      {/* now marker */}
      <line x1={x(idx)} x2={x(idx)} y1={padT - 2} y2={height - padB} stroke={BPI.ink} strokeWidth="1" opacity="0.25" style={{ transition: 'x1 .12s, x2 .12s' }} />
      <circle cx={x(idx)} cy={y(nowV)} r="4.5" fill={speedToColor(nowV)} stroke={BPI.card} strokeWidth="2" style={{ transition: 'cx .12s linear, cy .3s, fill .5s' }} />
      {/* x labels */}
      {[[6, '6a'], [12, '12p'], [18, '6p'], [22, '10p']].map(([h, t]) => (
        <text key={h} x={xh(h)} y={height - 2} fontSize="8" fill={BPI.ink40} fontFamily={BPIMono} textAnchor="middle">{t}</text>
      ))}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// NM_Map — the SVG itself.
// ─────────────────────────────────────────────────────────────
function NM_Map({ hour, hovered, setHovered, selected, setSelected, filter, cur, emphasizeId }) {
  const V = GEO_VIEW;
  const ranked = [...GEO_ROUTES].sort((a, b) => cur[a.id] - cur[b.id]);
  const hotIds = ranked.slice(0, 2).map((r) => r.id);
  const focus = hovered || selected;        // active user focus → dims others
  const activeId = focus || emphasizeId;     // thick stroke + ink chip

  const isDim = (r) => {
    if (filter !== 'All' && r.borough !== filter) return true;
    if (focus && focus !== r.id) return true;
    return false;
  };

  return (
    <svg viewBox={`0 0 ${V.w} ${V.h}`} width="100%" style={{ display: 'block', borderRadius: 6 }}
      onMouseLeave={() => setHovered(null)}
      onClick={(e) => { if (e.target.tagName === 'svg' || e.target.dataset.bg) setSelected(null); }}>
      <defs>
        <linearGradient id="nm-water" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(0.915 0.014 232)" />
          <stop offset="100%" stopColor="oklch(0.885 0.018 236)" />
        </linearGradient>
      </defs>
      <rect data-bg="1" x="0" y="0" width={V.w} height={V.h} fill="url(#nm-water)" />

      {Object.entries(GEO_LAND).map(([k, d]) => (
        <path key={k} data-bg="1" d={d} fill={BPI.card} stroke={BPI.ink20} strokeWidth="1.2" />
      ))}

      {/* water labels + compass */}
      {[
        { t: 'HUDSON RIVER', x: 150, y: 300, r: -90 },
        { t: 'EAST RIVER', x: 548, y: 232, r: 56 },
        { t: 'UPPER BAY', x: 372, y: 664, r: 0 },
        { t: 'LONG ISLAND SOUND', x: 770, y: 150, r: 0 },
      ].map((w, i) => (
        <text key={'w' + i} data-bg="1" x={w.x} y={w.y} fill={BPI.ink20} fontFamily={BPIMono}
          fontSize="10.5" fontWeight="600" letterSpacing="0.18em" textAnchor="middle"
          transform={w.r ? `rotate(${w.r} ${w.x} ${w.y})` : undefined}>{w.t}</text>
      ))}
      <g data-bg="1" transform="translate(58, 60)" opacity="0.5">
        <circle cx="0" cy="0" r="16" fill="none" stroke={BPI.ink40} strokeWidth="1.2" />
        <path d="M0,-11 L4,3 L0,-1 L-4,3 Z" fill={BPI.ink70} />
        <text x="0" y="-19" fontSize="10" fontWeight="700" fill={BPI.ink55} fontFamily={BPIMono} textAnchor="middle">N</text>
      </g>

      {GEO_LABELS.map((l, i) => (
        <text key={i} data-bg="1" x={l.x} y={l.y} fill={BPI.ink40} fontFamily={BPIMono}
          fontSize="12.5" fontWeight="700" letterSpacing="0.22em" textAnchor="middle"
          opacity="0.5" transform={l.rotate ? `rotate(${l.rotate} ${l.x} ${l.y})` : undefined}>
          {l.t.split('\n').map((line, j) => <tspan key={j} x={l.x} dy={j ? 15 : 0}>{line}</tspan>)}
        </text>
      ))}

      {/* casings */}
      {GEO_ROUTES.map((r) => (
        <path key={r.id} d={nmPath(r.pts)} fill="none" stroke={BPI.paper}
          strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"
          opacity={isDim(r) ? 0.25 : 1} style={{ transition: 'opacity .3s' }} />
      ))}

      {/* hotspot pulses */}
      {hotIds.map((id) => {
        const r = GEO_ROUTES.find((x) => x.id === id);
        if (isDim(r)) return null;
        const [mx, my] = nmMid(r.pts);
        return (
          <g key={'hot' + id} style={{ pointerEvents: 'none' }}>
            <circle cx={mx} cy={my} r="11" fill="none" stroke={speedToColor(cur[id])} strokeWidth="2.5" className="nm-pulse" />
            <circle cx={mx} cy={my} r="11" fill="none" stroke={speedToColor(cur[id])} strokeWidth="2.5" className="nm-pulse nm-pulse-2" />
          </g>
        );
      })}

      {/* routes */}
      {GEO_ROUTES.map((r) => {
        const dim = isDim(r);
        const active = activeId === r.id;
        const col = speedToColor(cur[r.id]);
        return (
          <g key={r.id}
            onMouseEnter={() => setHovered(r.id)}
            onClick={() => setSelected(selected === r.id ? null : r.id)}
            style={{ cursor: 'pointer', opacity: dim ? 0.26 : 1, transition: 'opacity .3s' }}>
            <path d={nmPath(r.pts)} fill="none" stroke="transparent" strokeWidth="20" strokeLinecap="round" />
            <path d={nmPath(r.pts)} fill="none" stroke={col}
              strokeWidth={active ? 8 : 5.5} strokeLinecap="round" strokeLinejoin="round"
              style={{ transition: 'stroke .5s, stroke-width .2s' }} />
            {r.pts.map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r={i === 0 || i === r.pts.length - 1 ? 3.6 : 2.2}
                fill={i === 0 || i === r.pts.length - 1 ? BPI.ink : BPI.card}
                stroke={i === 0 || i === r.pts.length - 1 ? BPI.ink : col} strokeWidth="1.4" />
            ))}
            <g transform={`translate(${r.labelAt[0]}, ${r.labelAt[1]})`} style={{ pointerEvents: 'none' }}>
              <rect x={-16} y={-9} width={32} height={17} rx="3.5" fill={active ? BPI.ink : 'rgba(22,20,15,0.78)'} style={{ transition: 'fill .2s' }} />
              <text x={0} y={3} fontSize="10" fontWeight="700" fill="#fff" textAnchor="middle" fontFamily={BPIFonts}>{r.route}</text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// NM_Detail — persistent panel; reflects the hovered/pinned route.
// ─────────────────────────────────────────────────────────────
function NM_Detail({ route, cur, hour, rank, total, pinned, onUnpin }) {
  const v = cur[route.id];
  const col = speedToColor(v);
  const toneColor = route.tone === 'bad' ? BPI.bad : route.tone === 'good' ? BPI.good : BPI.warn;
  const arrow = route.tone === 'bad' ? '↓' : route.tone === 'good' ? '↑' : '→';
  const Cell = ({ label, children }) => (
    <div style={{ flex: 1, padding: '0 14px' }}>
      <div className="eyebrow" style={{ fontSize: 9.5, letterSpacing: '0.04em', marginBottom: 5, color: BPI.ink55 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{children}</div>
    </div>
  );
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 16 }}>
        <RouteBadge route={route.route} sbs={route.sbs} size="lg" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.01em' }}>{route.name}</div>
          <div style={{ fontSize: 11, color: BPI.ink55, fontFamily: BPIMono }}>{route.borough}</div>
        </div>
        {pinned
          ? <button onClick={onUnpin} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', cursor: 'pointer', background: BPI.ink, color: BPI.paper, borderRadius: 3, padding: '4px 8px', fontFamily: BPIMono, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em' }}>PINNED ✕</button>
          : <span style={{ flexShrink: 0, fontFamily: BPIMono, fontSize: 9.5, color: BPI.ink40, letterSpacing: '0.04em' }}>click to pin</span>}
      </div>

      {/* hero */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div className="num" style={{ fontSize: 46, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 0.9, color: col, transition: 'color .5s' }}>{v.toFixed(1)}</div>
          <div>
            <div style={{ fontSize: 13, color: BPI.ink70, fontWeight: 500 }}>mph</div>
            <div style={{ fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono }}>{fmtHour(hour)}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="num" style={{ fontSize: 20, fontWeight: 700, color: rank <= 2 ? BPI.bad : BPI.ink, lineHeight: 1 }}>#{rank}</div>
          <div style={{ fontSize: 9.5, color: BPI.ink55, fontFamily: BPIMono, letterSpacing: '0.04em' }}>of {total} slowest now</div>
        </div>
      </div>

      <HourCurve route={route} hour={hour} />

      {/* stat strip */}
      <div style={{ display: 'flex', alignItems: 'stretch', margin: '14px -14px 0', borderTop: `1px solid ${BPI.rule}`, borderBottom: `1px solid ${BPI.rule}`, padding: '11px 0' }}>
        <Cell label="DAILY RIDERS"><span className="num" style={{ fontSize: 16, fontWeight: 600 }}>{route.riders}</span></Cell>
        <div style={{ width: 1, background: BPI.rule }} />
        <Cell label="12-MONTH">
          <span style={{ fontSize: 12.5, fontWeight: 700, color: toneColor }}>{arrow} {route.status}</span>
          <span style={{ marginLeft: 'auto' }}><Spark data={route.trend} width={56} height={18} color={toneColor} /></span>
        </Cell>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <Button variant="primary" full>Open {route.route} →</Button>
        <Button variant="secondary" full>Add to brief</Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// NM_RankList — always visible; links both ways with the map + detail.
// ─────────────────────────────────────────────────────────────
function NM_RankList({ cur, hour, activeId, onPick, hovered, setHovered }) {
  const ranked = [...GEO_ROUTES].sort((a, b) => cur[a.id] - cur[b.id]);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>Slowest right now</div>
        <div style={{ fontSize: 10, color: BPI.ink55, fontFamily: BPIMono }}>scrub to re-rank →</div>
      </div>
      <div>
        {ranked.map((r, i) => {
          const v = cur[r.id];
          const col = speedToColor(v);
          const active = activeId === r.id;
          return (
            <div key={r.id} onClick={() => onPick(r.id)}
              onMouseEnter={() => setHovered(r.id)} onMouseLeave={() => setHovered(null)}
              style={{
                display: 'grid', gridTemplateColumns: '18px 52px 1fr 46px', gap: 9, alignItems: 'center',
                padding: '7px 9px', margin: '0 -9px', cursor: 'pointer', borderRadius: 4,
                background: active ? BPI.ink06 : 'transparent',
                boxShadow: active ? `inset 2px 0 0 ${BPI.ink}` : 'none',
                transition: 'background .12s',
              }}>
              <span className="num" style={{ fontSize: 10.5, color: BPI.ink40, fontFamily: BPIMono, fontWeight: 700 }}>{String(i + 1).padStart(2, '0')}</span>
              <RouteBadge route={r.route} sbs={r.sbs} size="sm" />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: active ? 600 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                <div style={{ height: 3, marginTop: 4, background: BPI.ink06, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, (v / 9) * 100)}%`, background: col, borderRadius: 2, transition: 'width .5s, background .5s' }} />
                </div>
              </div>
              <div className="num" style={{ fontSize: 14, fontWeight: 700, color: col, textAlign: 'right', transition: 'color .5s' }}>{v.toFixed(1)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RF_NetworkScreen — the maps-first citywide map (its own Map tab).
// ─────────────────────────────────────────────────────────────
function RF_NetworkScreen() {
  const [hour, setHour] = React.useState(17);
  const [playing, setPlaying] = React.useState(false);
  const [hovered, setHovered] = React.useState(null);
  const [selected, setSelected] = React.useState(null);
  const [filter, setFilter] = React.useState('All');

  React.useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setHour((h) => (h >= 23 ? 5 : h + 1)), 850);
    return () => clearInterval(t);
  }, [playing]);

  const cur = React.useMemo(() => {
    const o = {};
    GEO_ROUTES.forEach((r) => { o[r.id] = hourSpeed(r.mph, hour, r.sev); });
    return o;
  }, [hour]);

  const ranked = React.useMemo(() => [...GEO_ROUTES].sort((a, b) => cur[a.id] - cur[b.id]), [cur]);
  const displayedId = hovered || selected || ranked[0].id;
  const displayed = GEO_ROUTES.find((r) => r.id === displayedId);
  const rank = ranked.findIndex((r) => r.id === displayedId) + 1;

  const boroughs = ['All', 'Manhattan', 'Bronx', 'Queens', 'Brooklyn'];

  return (
    <div className="bpi" style={{ width: 1320, minHeight: 1000, display: 'flex', flexDirection: 'column', background: BPI.paper }}>
      <StudioBar active="Map" />

      {/* header */}
      <div style={{ padding: '22px 34px 20px', background: BPI.card, boxShadow: `inset 0 -1px 0 ${BPI.rule}` }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: BPI.accent, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 10 }}>Network map · the city right now</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 30 }}>
          <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.06 }}>Watch the city’s buses slow into rush hour.</div>
          <div style={{ fontSize: 12.5, color: BPI.ink70, lineHeight: 1.5, maxWidth: 380, paddingBottom: 3 }}>
            Every corridor we model, drawn where it runs and colored by speed at the hour on the clock. Hover a line or a row; press play to run the day.
          </div>
        </div>
      </div>

      {/* body */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 392px', gap: 0 }}>
        {/* map column */}
        <div style={{ padding: '18px 22px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* transport toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, background: BPI.card, borderRadius: 8, boxShadow: `0 0 0 1px ${BPI.rule}`, padding: '12px 18px' }}>
            <TimeScrubber hour={hour} setHour={setHour} playing={playing} setPlaying={setPlaying} />
            <div style={{ width: 1, alignSelf: 'stretch', background: BPI.rule, margin: '2px 0' }} />
            <div style={{ flexShrink: 0, width: 150 }}>
              <div className="eyebrow" style={{ fontSize: 9, letterSpacing: '0.08em', marginBottom: 6, color: BPI.ink55 }}>SPEED · MPH</div>
              <div style={{ height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${speedToColor(3.5)}, ${speedToColor(5)}, ${speedToColor(6.5)}, ${speedToColor(8)})` }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 8.5, color: BPI.ink40, fontFamily: BPIMono }}><span>slow</span><span>fast</span></div>
            </div>
          </div>

          {/* filter row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            {boroughs.map((b) => (
              <span key={b} onClick={() => setFilter(b)} className="chip" style={{
                cursor: 'pointer', background: filter === b ? BPI.ink : BPI.ink06, color: filter === b ? BPI.paper : BPI.ink70,
              }}>{b}</span>
            ))}
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono }}>{GEO_ROUTES.length} corridors · {hourTag(hour)}</span>
          </div>

          {/* map */}
          <div style={{ flex: 1, background: 'transparent', borderRadius: 6, boxShadow: `0 0 0 1px ${BPI.rule}` }}>
            <NM_Map hour={hour} hovered={hovered} setHovered={setHovered} selected={selected} setSelected={setSelected} filter={filter} cur={cur} emphasizeId={displayedId} />
          </div>
        </div>

        {/* right panel */}
        <div style={{ background: BPI.card, boxShadow: `inset 1px 0 0 ${BPI.rule}`, padding: '22px 24px', display: 'flex', flexDirection: 'column' }}>
          <NM_Detail route={displayed} cur={cur} hour={hour} rank={rank} total={GEO_ROUTES.length}
            pinned={selected === displayedId} onUnpin={() => setSelected(null)} />
          <div className="rule" style={{ margin: '20px 0 16px' }} />
          <NM_RankList cur={cur} hour={hour} activeId={displayedId} onPick={(id) => setSelected(selected === id ? null : id)} hovered={hovered} setHovered={setHovered} />
        </div>
      </div>

      <StudioFooter sources={['MTA Bus Speeds', 'Hourly Ridership', 'NYC DOT bus lanes', 'ACE program']} />
    </div>
  );
}

if (typeof document !== 'undefined' && !document.getElementById('nm-pulse-styles')) {
  const s = document.createElement('style');
  s.id = 'nm-pulse-styles';
  s.textContent = `
    @keyframes nm-pulse { 0% { transform: scale(0.7); opacity: 0.8; } 70% { opacity: 0; } 100% { transform: scale(2.5); opacity: 0; } }
    .nm-pulse { transform-box: fill-box; transform-origin: center; animation: nm-pulse 2.1s cubic-bezier(.2,.6,.3,1) infinite; }
    .nm-pulse-2 { animation-delay: 1.05s; }
  `;
  document.head.appendChild(s);
}

Object.assign(window, { RF_NetworkScreen, NetworkMap: NM_Map, TimeScrubber, HourCurve, fmtHour, hourTag, nmPath });
