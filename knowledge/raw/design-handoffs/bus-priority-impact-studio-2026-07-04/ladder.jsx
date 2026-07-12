// Route Ladder — a vertical subway-diagram-style visualization of a single
// route's segments. Reads as a route map with performance data baked in:
//   • Vertical spine of timepoint stops, connected with treatment-colored
//     edges (so the route's bus-lane coverage is visible at a glance).
//   • Speed bar on the LEFT (length = mph, color = severity tier).
//     A small accent tick on each bar shows the scheduled timepoint pace
//     for that segment, so the gap = underperformance.
//   • Treatment glyphs beside the node (LANE / ACE / TSP).
//   • Ridership bar on the RIGHT (length = rider-hours/day, neutral fill).
//
// Interactive: click a segment to select it (right rail updates); hover to
// focus a segment (others dim); click a date on the time scrubber to
// see the route at that point in time (key dates marked).
//
// This is the screen that answers "where on this route are things bad?"
// in one glance, instead of forcing the user to read a table.

const LW = 1320, LH = 880;

const M15_SEGMENTS = [
  // Ordered NORTH (top) → SOUTH (bottom) for natural reading.
  { i: 0, label: 'E 125 St ↔ E 116 St',         mph: 7.4, sched: 8.4, rh: 4200,  lane: 'yes',     ace: true,  tsp: false },
  { i: 1, label: 'E 116 St ↔ E 96 St',          mph: 6.9, sched: 8.0, rh: 5100,  lane: 'yes',     ace: true,  tsp: false },
  { i: 2, label: 'E 96 St ↔ E 79 St',           mph: 5.8, sched: 8.2, rh: 9640,  lane: 'yes',     ace: true,  tsp: true  },
  { i: 3, label: 'E 79 St ↔ E 57 St',           mph: 5.2, sched: 7.6, rh: 10800, lane: 'yes',     ace: true,  tsp: false },
  { i: 4, label: 'Madison Av · E 58 ↔ E 28',    mph: 4.2, sched: 7.1, rh: 18420, lane: 'partial', ace: false, tsp: false, story: 'top' },
  { i: 5, label: 'E 28 St ↔ E 14 St',           mph: 4.9, sched: 7.6, rh: 14110, lane: 'yes',     ace: true,  tsp: false },
  { i: 6, label: 'E 14 St ↔ Houston St',        mph: 5.5, sched: 7.4, rh: 8210,  lane: 'yes',     ace: true,  tsp: false },
  { i: 7, label: 'Houston St ↔ Grand St',       mph: 6.4, sched: 7.8, rh: 6420,  lane: 'yes',     ace: true,  tsp: false },
  { i: 8, label: 'Grand St ↔ Madison / Allen',  mph: 6.8, sched: 7.5, rh: 5800,  lane: 'yes',     ace: true,  tsp: false },
  { i: 9, label: 'Madison / Allen ↔ S. Ferry',  mph: 7.2, sched: 8.0, rh: 4900,  lane: 'yes',     ace: false, tsp: false },
];

const M15_TIME_EVENTS = [
  { date: '2019-11', label: 'ACE begins' },
  { date: '2023-04', label: 'Bus lane: 23→14 St' },
  { date: '2025-01', label: 'Congestion pricing' },
  { date: '2025-05', label: 'ACE all-day' },
];

// Max ranges for bar scaling — kept stable across hover/select so widths
// don't reflow when state changes.
const MAX_MPH = 9;
const MAX_RH = 20000;

// ─────────────────────────────────────────────────────────────
// MiniGlyph — compact LANE / ACE / TSP indicators sized for inline use
// next to each ladder node.
// ─────────────────────────────────────────────────────────────
function MiniLane({ state }) {
  const count = state === 'yes' ? 3 : state === 'partial' ? 2 : state === 'minimal' ? 1 : 0;
  const color = state === 'yes' ? BPI.good : state === 'partial' ? BPI.warn : BPI.ink20;
  return (
    <div style={{ display: 'flex', gap: 1.5, height: 9, alignItems: 'center' }}>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} style={{
          width: 3, height: 9, borderRadius: 1,
          background: i < count ? color : 'transparent',
          boxShadow: i < count ? 'none' : `inset 0 0 0 1px ${BPI.ink20}`,
        }} />
      ))}
    </div>
  );
}
function MiniDot({ on, tone = 'good' }) {
  const color = tone === 'good' ? BPI.good : BPI.accent;
  return (
    <div style={{
      width: 9, height: 9, borderRadius: 5,
      background: on ? color : 'transparent',
      boxShadow: on ? 'none' : `inset 0 0 0 1px ${BPI.ink20}`,
    }} />
  );
}

// ─────────────────────────────────────────────────────────────
// A single segment row in the ladder.
// ─────────────────────────────────────────────────────────────
function SegmentBar({ seg, selected, dimmed, isFirst, isLast, onClick, onMouseEnter, onMouseLeave, blind, blindRevealed, isGuess }) {
  const showSpeed = !blind || blindRevealed;
  const speedW = showSpeed ? (seg.mph / MAX_MPH) * 130 : 0;
  const schedX = (seg.sched / MAX_MPH) * 130;
  const rhW = (seg.rh / MAX_RH) * 100;
  const severity = seg.mph < 5 ? BPI.bad : seg.mph < 6.5 ? BPI.warn : BPI.ink40;
  // Color the spine edge by the lane state — that's the visual story
  // of the route's bus-lane continuity.
  const spineColor = seg.lane === 'yes' ? BPI.good
    : seg.lane === 'partial' ? BPI.warn
    : seg.lane === 'minimal' ? BPI.warn : BPI.ink20;
  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        display: 'grid',
        gridTemplateColumns: '36px 132px 36px 60px 220px 100px 44px',
        gap: 6, alignItems: 'center', height: 58,
        opacity: dimmed ? 0.34 : 1,
        cursor: 'pointer',
        transition: 'opacity .15s ease, background .12s ease, box-shadow .12s ease',
        background: selected ? BPI.accentBg : 'transparent',
        boxShadow: selected ? `inset 0 0 0 1.5px ${BPI.accent}` : 'inset 0 0 0 0 transparent',
        borderRadius: 3, padding: '0 6px',
        position: 'relative',
      }}>
      {/* mph number — hidden in blind mode until revealed */}
      <div className="num" style={{
        textAlign: 'right', fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em',
        color: showSpeed ? (selected ? BPI.ink : severity) : BPI.ink20, lineHeight: 1,
        transition: 'color .4s ease',
        userSelect: 'none',
      }}>{showSpeed ? seg.mph.toFixed(1) : '?'}</div>

      {/* speed bar lane */}
      <div style={{ position: 'relative', height: 14 }}>
        {/* faint full-range track */}
        <div style={{ position: 'absolute', right: 0, top: 5, width: 132, height: 4, background: BPI.ink06, borderRadius: 1 }} />
        {/* actual speed bar — animates in from 0 on reveal */}
        <div style={{
          position: 'absolute', right: 0, top: 2, height: 10, width: speedW,
          background: showSpeed ? severity : 'transparent', borderRadius: 1,
          transition: blindRevealed ? 'width .65s cubic-bezier(.4,.2,.1,1)' : 'none',
        }} />
        {/* scheduled tick — hidden in blind mode */}
        {showSpeed && <div style={{
          position: 'absolute', right: schedX - 1, top: -2, height: 18, width: 2,
          background: BPI.accent, opacity: 0.85,
        }} />}
        {/* tiny "sched" label, shown only on selected row */}
        {selected && (
          <div style={{
            position: 'absolute', right: schedX, top: 18,
            transform: 'translateX(50%)',
            fontSize: 9, color: BPI.accent, fontFamily: BPIMono, fontWeight: 600,
            whiteSpace: 'nowrap',
          }}>sched {seg.sched.toFixed(1)}</div>
        )}
      </div>

      {/* node column with spine */}
      <div style={{ position: 'relative', height: '100%' }}>
        <div style={{
          position: 'absolute', left: '50%',
          top: isFirst ? '50%' : 0,
          bottom: isLast ? '50%' : 0,
          width: 4, background: spineColor, transform: 'translateX(-50%)',
          borderRadius: 2,
        }} />
        <div style={{
          position: 'absolute', left: '50%', top: '50%',
          transform: `translate(-50%, -50%) scale(${selected ? 1 : 1})`,
          width: selected ? 16 : 12, height: selected ? 16 : 12, borderRadius: 8,
          background: selected ? BPI.accent : BPI.card,
          boxShadow: selected
            ? `0 0 0 3px ${BPI.paper}, 0 0 0 5px ${BPI.accent}, 0 0 0 9px ${BPI.accentBg}`
            : `0 0 0 2.5px ${BPI.ink}`,
          transition: 'all .18s cubic-bezier(.4,.2,.1,1)',
          zIndex: 2,
        }} />
        {/* Story flag — suppressed while guessing */}
        {seg.story === 'top' && !selected && !blind && (
          <div style={{
            position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
            width: 26, height: 26, borderRadius: 13,
            boxShadow: `0 0 0 1px ${BPI.bad}`,
            animation: 'bpi-pulse 1.8s ease-in-out infinite',
          }} />
        )}
        {/* Guess outcome ring — correct=green, off=warn */}
        {isGuess && blindRevealed && (
          <div style={{
            position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
            width: 30, height: 30, borderRadius: 15, pointerEvents: 'none',
            boxShadow: `0 0 0 2.5px ${seg.i === 4 ? BPI.good : BPI.warn}`,
            animation: 'bpi-fade-in .3s ease-out',
          }} />
        )}
      </div>

      {/* treatments */}
      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        <MiniLane state={seg.lane} />
        <MiniDot on={seg.ace} tone="accent" />
        <MiniDot on={seg.tsp} tone="good" />
      </div>

      {/* segment name */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 12.5, fontWeight: selected ? 600 : 500,
          color: selected ? BPI.ink : BPI.ink70,
          letterSpacing: '-0.005em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{seg.label}</div>
        {seg.story === 'top' && (
          <div style={{
            fontSize: 9.5, color: BPI.bad, fontWeight: 700,
            letterSpacing: '0.06em', marginTop: 1,
          }}>↑ TOP RIDER-IMPACT</div>
        )}
      </div>

      {/* ridership bar */}
      <div style={{ position: 'relative', height: 10 }}>
        <div style={{ position: 'absolute', left: 0, top: 3, width: 100, height: 4, background: BPI.ink06, borderRadius: 1 }} />
        <div style={{
          position: 'absolute', left: 0, top: 0, height: 10, width: rhW,
          background: selected ? BPI.ink : BPI.ink40, borderRadius: 1,
          transition: 'width .35s cubic-bezier(.4,.2,.1,1)',
        }} />
      </div>

      {/* rh number */}
      <div className="num" style={{
        textAlign: 'left', fontSize: 11, fontWeight: 600,
        color: BPI.ink70, lineHeight: 1, paddingLeft: 4,
      }}>{(seg.rh / 1000).toFixed(1)}K</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Terminus cap rendered above the first and below the last segment.
// ─────────────────────────────────────────────────────────────
function Terminus({ label, position }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '36px 132px 36px 60px 220px 100px 44px',
      gap: 6, alignItems: 'center', height: 36, padding: '0 6px',
    }}>
      <div />
      <div style={{
        textAlign: 'right', fontSize: 10.5, color: BPI.ink55,
        fontWeight: 600, fontFamily: BPIFonts, letterSpacing: '-0.002em',
      }}>{position === 'NORTH' ? 'north terminus' : 'south terminus'}</div>
      <div style={{ position: 'relative', height: '100%' }}>
        <div style={{
          position: 'absolute', left: '50%', width: 4,
          top: position === 'NORTH' ? '50%' : 0,
          bottom: position === 'NORTH' ? 0 : '50%',
          background: BPI.ink, transform: 'translateX(-50%)', borderRadius: 2,
        }} />
        <div style={{
          position: 'absolute', left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 14, height: 14, borderRadius: 7,
          background: BPI.ink, border: `2.5px solid ${BPI.paper}`,
          boxShadow: `0 0 0 2.5px ${BPI.ink}`,
        }} />
      </div>
      <div />
      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.005em', gridColumn: 'span 3' }}>{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Right rail — detail panel for whatever segment is selected. Cross-fades
// when selection changes (handled by key={index} re-render).
// ─────────────────────────────────────────────────────────────
function SelectedDetail({ seg }) {
  const trend = [
    7.1, 6.9, 6.7, 6.4, 6.0, 5.5, 5.0, 4.7, 4.5, 4.3, 4.3, 4.2, 4.2, 4.2,
  ];
  const hours = Array.from({ length: 24 }, (_, h) => {
    if (h >= 7 && h <= 9) return 0.7;
    if (h >= 11 && h <= 14) return 0.5;
    if (h >= 16 && h <= 19) return 0.9;
    if (h >= 6 && h <= 21) return 0.3;
    return 0.1;
  });
  return (
    <div key={seg.i} style={{
      padding: 22, height: '100%',
      display: 'flex', flexDirection: 'column', gap: 16,
      overflow: 'auto', background: BPI.paper,
      animation: 'bpi-fade-in .25s ease-out',
    }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Selected segment</div>
        <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.2 }}>
          {seg.label}
        </div>
        <div style={{ fontSize: 11, color: BPI.ink55, fontFamily: BPIMono, marginTop: 4 }}>
          NB · Mar 2026 · weekday median
        </div>
      </div>

      {/* Big metric + sparkline */}
      <div style={{
        padding: 14, background: BPI.card, borderRadius: 3,
        boxShadow: `0 0 0 1px ${BPI.rule}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <div className="num" style={{
            fontSize: 38, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1,
            color: seg.mph < 5 ? BPI.bad : seg.mph < 6.5 ? BPI.warn : BPI.ink,
          }}>{seg.mph.toFixed(1)}</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>mph weekday avg</div>
            <div className="num" style={{ fontSize: 10.5, color: BPI.ink55, marginTop: 2 }}>
              vs <span style={{ color: BPI.accent, fontWeight: 600 }}>{seg.sched.toFixed(1)}</span> scheduled
              {' · '}
              <span style={{ color: BPI.bad, fontWeight: 600 }}>
                −{(seg.sched - seg.mph).toFixed(1)}
              </span>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <Spark data={trend} width={300} height={36} color={BPI.bad} fill baseline={seg.sched} />
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 9.5, color: BPI.ink55, fontFamily: BPIMono, marginTop: 4,
          }}>
            <span>14 days ago</span>
            <span>today</span>
          </div>
        </div>
      </div>

      {/* Hour strip */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Severity by hour</div>
        <HourStrip hours={hours} width={300} height={18} />
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: 9.5, color: BPI.ink55, fontFamily: BPIMono, marginTop: 4,
        }}>
          <span>0</span><span>6</span><span>12</span><span>18</span><span>24</span>
        </div>
      </div>

      {/* Treatments + ridership */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ padding: 12, background: BPI.card, borderRadius: 3, boxShadow: `0 0 0 1px ${BPI.rule}` }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Treatments</div>
          <TreatmentRow lane={seg.lane} ace={seg.ace} tsp={seg.tsp} align="flex-start" />
        </div>
        <div style={{ padding: 12, background: BPI.card, borderRadius: 3, boxShadow: `0 0 0 1px ${BPI.rule}` }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Rider-hours / day</div>
          <div className="num" style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: seg.rh > 15000 ? BPI.bad : BPI.ink, lineHeight: 1 }}>
            {seg.rh.toLocaleString()}
          </div>
          <div style={{ fontSize: 10, color: BPI.ink55, marginTop: 4 }}>
            {seg.rh > 15000 ? 'top decile route-wide' : seg.rh > 10000 ? 'top quartile route-wide' : 'mid-range'}
          </div>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Button variant="primary" size="md" full>Send to brief →</Button>
        <Button variant="secondary" size="sm" full>Compare similar segments</Button>
        <Button variant="ghost" size="sm" full>Open hour-by-hour breakdown</Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Left rail — story tooltip + legend + filter recap.
// ─────────────────────────────────────────────────────────────
function LeftRail({ selectedI, segments, blindMode, blindRevealed, blindGuess, onToggleBlind, onReset }) {
  const selected = segments[selectedI];
  return (
    <div style={{
      padding: 22, background: BPI.paper,
      boxShadow: `inset -1px 0 0 ${BPI.rule}`,
      display: 'flex', flexDirection: 'column', gap: 22,
      overflow: 'auto',
    }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>What you're looking at</div>
        <div style={{ fontSize: 12.5, color: BPI.ink70, lineHeight: 1.55 }}>
          M15 SBS as a vertical ladder — north at the top, south at the bottom. The spine is colored
          by bus-lane continuity. <span style={{ color: BPI.bad, fontWeight: 600 }}>Click any segment</span> to focus.
        </div>
      </div>

      <div className="rule" />

      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Legend</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 11.5, color: BPI.ink70 }}>
          <LegendRow swatch={<div style={{ width: 32, height: 6, background: BPI.bad, borderRadius: 1 }} />} label="< 5.0 mph" sub="below pedestrian pace" />
          <LegendRow swatch={<div style={{ width: 32, height: 6, background: BPI.warn, borderRadius: 1 }} />} label="5.0 – 6.5 mph" sub="slow" />
          <LegendRow swatch={<div style={{ width: 32, height: 6, background: BPI.ink40, borderRadius: 1 }} />} label="> 6.5 mph" sub="nominal" />
          <LegendRow swatch={<div style={{ width: 6, height: 18, background: BPI.accent }} />} label="Scheduled" sub="timepoint pace" />
        </div>
      </div>

      <div className="rule" />

      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Spine = lane coverage</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11.5, color: BPI.ink70 }}>
          <LegendRow swatch={<div style={{ width: 22, height: 22, background: BPI.good, borderRadius: 2 }} />} label="Full lane" sub="" />
          <LegendRow swatch={<div style={{ width: 22, height: 22, background: BPI.warn, borderRadius: 2 }} />} label="Partial" sub="" />
          <LegendRow swatch={<div style={{ width: 22, height: 22, background: BPI.ink20, borderRadius: 2 }} />} label="None" sub="" />
        </div>
      </div>

      <div className="rule" />

      <div>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Story</div>
        <div style={{ fontSize: 12, color: BPI.ink70, lineHeight: 1.6 }}>
          One segment <b style={{ color: BPI.bad }}>breaks the pattern</b>: Madison Av · E 28–58 St.
          It's the only spine break in the route's bus-lane coverage,
          and it carries the highest rider-hour delay of any segment.
        </div>
      </div>

      <div className="rule" />

      {/* ── Analyst challenge ─────────────────────────────────────────
          Predict-then-reveal: hide speed data, make the analyst commit
          to a guess based on treatments + name alone, then reveal.
          Inspired by the HeadVis "peekaboo" interaction pattern:
          withhold the answer, require a commitment, score the guess.
      ──────────────────────────────────────────────────────────── */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Analyst challenge</div>
        {!blindMode ? (
          <>
            <div style={{ fontSize: 11.5, color: BPI.ink70, lineHeight: 1.55, marginBottom: 10 }}>
              Can you read the worst corridor from treatments alone — before seeing the speed numbers?
            </div>
            <button onClick={onToggleBlind} className="bpi" style={{
              width: '100%', padding: '9px 12px', background: BPI.ink, color: BPI.paper,
              border: 'none', borderRadius: 3, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>Hide speeds — guess first</span>
              <span style={{ opacity: 0.55 }}>→</span>
            </button>
          </>
        ) : !blindRevealed ? (
          <div style={{
            padding: '12px 14px', background: BPI.accentBg, borderRadius: 3,
            fontSize: 12, color: BPI.accent, lineHeight: 1.6, fontWeight: 500,
          }}>
            Which segment has the highest rider-hour delay?
            <br /><b style={{ fontWeight: 700 }}>Click a segment to commit your guess.</b>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {blindGuess === 4 ? (
              <div style={{
                padding: '12px 14px', background: BPI.goodBg, borderRadius: 3,
                fontSize: 12, color: BPI.good, lineHeight: 1.55,
              }}>
                <b>✓ Correct.</b> Madison Av / E 28–58 St — 18,420 rider-hours/day lost. The treatment gap is the tell: it's the only spine break in bus-lane coverage.
              </div>
            ) : (
              <div style={{
                padding: '12px 14px', background: BPI.warnBg, borderRadius: 3,
                fontSize: 12, color: BPI.warn, lineHeight: 1.55,
              }}>
                <b>Not quite.</b> You picked <b style={{ color: BPI.ink }}>{segments[blindGuess] ? segments[blindGuess].label.split('↔')[0].trim() : '—'}</b>.
                <br />The worst by rider-hours is <b style={{ color: BPI.ink }}>Madison Av · E 28–58 St</b> — the only spine break in bus-lane coverage.
              </div>
            )}
            <button onClick={onReset} className="bpi" style={{
              padding: '7px 10px', background: 'transparent',
              border: `1px solid ${BPI.rule}`, borderRadius: 3,
              fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit',
              color: BPI.ink70, textAlign: 'left',
            }}>Reset challenge</button>
          </div>
        )}
      </div>
    </div>
  );
}
function LegendRow({ swatch, label, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {swatch}
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 500, color: BPI.ink }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: BPI.ink55 }}>{sub}</div>}
      </div>
    </div>
  );
}

// (Old bottom TimeScrubber removed — replaced by TimeWindowPill in the
// view-switcher row. See the function further down this file.)


// ─────────────────────────────────────────────────────────────
// LadderTabContent — the interactive ladder body.
// Used by RF_Ladder (standalone) and RF_RouteDetail (Ladder tab).
// No StudioBar, no route header — just the 3-column grid.
// ─────────────────────────────────────────────────────────────
function LadderTabContent() {
  const [selectedI, setSelectedI] = React.useState(4);
  const [hoveredI, setHoveredI] = React.useState(null);
  const [monthI, setMonthI] = React.useState(9);
  const [blindMode, setBlindMode] = React.useState(false);
  const [blindGuess, setBlindGuess] = React.useState(null);
  const [blindRevealed, setBlindRevealed] = React.useState(false);

  const toggleBlind = () => { setBlindMode(true); setBlindGuess(null); setBlindRevealed(false); };
  const resetBlind  = () => { setBlindMode(false); setBlindGuess(null); setBlindRevealed(false); };
  const handleSegClick = (i) => {
    if (blindMode && !blindRevealed) {
      setBlindGuess(i);
      setTimeout(() => setBlindRevealed(true), 260);
    } else if (!blindMode) {
      setSelectedI(i);
    }
  };

  React.useEffect(() => {
    if (document.getElementById('bpi-ladder-styles')) return;
    const s = document.createElement('style');
    s.id = 'bpi-ladder-styles';
    s.textContent = `
      @keyframes bpi-pulse {
        0%, 100% { opacity: 0.4; transform: translate(-50%, -50%) scale(1); }
        50%      { opacity: 0; transform: translate(-50%, -50%) scale(1.6); }
      }
      @keyframes bpi-fade-in {
        from { opacity: 0; transform: translateY(4px); }
        to   { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(s);
  }, []);

  const selected = M15_SEGMENTS[selectedI];

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '240px 1fr 360px' }}>
      <LeftRail selectedI={selectedI} segments={M15_SEGMENTS}
        blindMode={blindMode} blindRevealed={blindRevealed} blindGuess={blindGuess}
        onToggleBlind={toggleBlind} onReset={resetBlind} />

      {/* Center — ladder */}
      <div style={{ padding: '16px 28px 14px', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
        {/* Time window pill floats right above column headers */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
          <TimeWindowPill value={monthI} onChange={setMonthI} />
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '36px 132px 36px 60px 220px 100px 44px',
          gap: 6, padding: '0 6px 10px',
          fontSize: 11, color: BPI.ink55, fontWeight: 600,
          boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
          marginBottom: 4, letterSpacing: '-0.003em',
        }}>
          <span /><span style={{ textAlign: 'right' }}>Observed speed</span>
          <span /><span>Treatments</span><span>Segment</span>
          <span>Rider-hours / day</span><span />
        </div>

        <Terminus label="E 125 St — East Harlem" position="NORTH" />
        {M15_SEGMENTS.map((s, i) => (
          <SegmentBar key={s.i} seg={s}
            selected={!blindMode && i === selectedI}
            dimmed={!blindMode && hoveredI != null && hoveredI !== i}
            isFirst={false} isLast={false}
            onClick={() => handleSegClick(i)}
            onMouseEnter={() => { if (!blindMode) setHoveredI(i); }}
            onMouseLeave={() => setHoveredI(null)}
            blind={blindMode} blindRevealed={blindRevealed} isGuess={blindGuess === i} />
        ))}
        <Terminus label="South Ferry — Lower Manhattan" position="SOUTH" />

        <div style={{
          marginTop: 14, padding: '10px 12px', background: BPI.ink06,
          fontSize: 11, color: BPI.ink70, borderRadius: 3,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontFamily: BPIMono, color: BPI.ink55 }}>tip</span>
          <span>Click any segment to focus. Use the time window picker to see the route at a past month.</span>
        </div>
      </div>

      {/* Right panel */}
      {blindMode && !blindRevealed ? (
        <div style={{
          padding: 28, background: BPI.paper,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 16, textAlign: 'center',
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: 26, background: BPI.accentBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, color: BPI.accent, fontWeight: 700,
          }}>?</div>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>Your call</div>
          <div style={{ fontSize: 12, color: BPI.ink55, lineHeight: 1.6, maxWidth: 240 }}>
            Treatments and segment names visible. Speed data hidden.
            Click a segment to commit your guess.
          </div>
        </div>
      ) : (
        <SelectedDetail seg={blindGuess != null ? M15_SEGMENTS[blindGuess] : selected} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RF_Ladder — standalone screen. Uses LadderTabContent as body.
// ─────────────────────────────────────────────────────────────
function RF_Ladder() {
  return (
    <div className="bpi" style={{ width: LW, height: LH, display: 'flex', flexDirection: 'column' }}>
      <StudioBar active="Routes" breadcrumb="Routes / M15 +SBS · ladder view" />
      <RouteHeaderCompact />
      <div style={{
        padding: '0 28px', background: BPI.card,
        boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
        display: 'flex', alignItems: 'center', gap: 24, fontSize: 12.5,
      }}>
        {['Overview', 'Slow segments', 'Ladder', 'Riders', 'Interventions', 'Data notes'].map((t) => (
          <span key={t} style={{
            padding: '12px 0', color: t === 'Ladder' ? BPI.ink : BPI.ink55,
            fontWeight: t === 'Ladder' ? 600 : 400,
            boxShadow: t === 'Ladder' ? `inset 0 -2px 0 ${BPI.ink}` : 'none',
            cursor: 'pointer',
          }}>{t}</span>
        ))}
      </div>
      <LadderTabContent />
    </div>
  );
}

// Compact time-window selector that lives in the view-switcher row.
// Click → popover with the last 12 months + intervention markers. Replaces
// the older oversized bottom scrubber.
function TimeWindowPill({ value = 9, onChange }) {
  const months = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];
  const years  = [ 2025,  2025,  2025,  2025,  2025,  2025,  2025,  2026,  2026,  2026,  2026,  2026 ];
  const events = { 4: 'ACE all-day', 7: 'Congestion pricing' };
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button className="bpi" onClick={() => setOpen((o) => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 12px', background: BPI.paper, border: `1px solid ${BPI.rule}`,
        borderRadius: 3, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
        fontFamily: 'inherit', color: BPI.ink,
      }}>
        <span style={{ color: BPI.ink55, fontSize: 11 }}>Window</span>
        <span>{months[value]} {years[value]}</span>
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke={BPI.ink40} strokeWidth="1.4"><path d="M2 3.5L4.5 6 7 3.5" /></svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 20,
          background: BPI.card, borderRadius: 4, padding: 10, minWidth: 280,
          boxShadow: `0 8px 28px rgba(0,0,0,.15), 0 0 0 1px ${BPI.rule}`,
        }}>
          <div style={{ fontSize: 11, color: BPI.ink55, marginBottom: 8, padding: '0 4px' }}>
            12-month window
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
            {months.map((m, i) => (
              <button key={i} onClick={() => { onChange && onChange(i); setOpen(false); }}
                className="bpi" style={{
                  padding: '8px 4px', background: i === value ? BPI.ink : 'transparent',
                  color: i === value ? BPI.paper : BPI.ink70, border: 'none',
                  borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit',
                  position: 'relative',
                }}>
                {m}
                {events[i] && (
                  <span style={{
                    position: 'absolute', top: 1, right: 2, width: 5, height: 5,
                    borderRadius: 3, background: BPI.accent,
                  }} />
                )}
              </button>
            ))}
          </div>
          {Object.keys(events).length > 0 && (
            <div style={{
              marginTop: 10, padding: '8px 4px 0', fontSize: 10.5, color: BPI.ink55,
              boxShadow: `inset 0 1px 0 ${BPI.rule}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: 3, background: BPI.accent }} />
                <span>marks intervention months</span>
              </div>
              {Object.entries(events).map(([i, label]) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                  <span>{label}</span>
                  <span style={{ fontFamily: BPIMono, color: BPI.ink70 }}>{months[i]} {years[i]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { RF_Ladder, LadderTabContent });
