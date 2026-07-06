// route-public.jsx — Route detail · public-facing edition.
//
// The default route page (RF_RouteDetail) is the analyst's workbench:
// six tabs, KPI strip, dense segment table, AI strip, sortable rows.
// Trustworthy but loud. This file is the same M15 SBS material rewritten
// in the FindingDetailAudit voice — a single scrolling page a journalist,
// council aide, or rider could land on cold and read straight through.
//
// Editorial structure mirrors the public finding page so the two read as
// siblings:
//   1. Hero — borough stripe · plain-language headline · lede
//   2. Key numbers — four oversized stats, no chart chrome
//   3. Where the bus slows down — three worst segments as narrative cards
//   4. Speed trend — embedded chart framed as a story, not a tab
//   5. Who rides this bus — prose-led ridership panel
//   6. What's been tried — interventions as a story timeline
//   7. About this corridor — friendly route fact sheet
//   8. How we know this — methods + sources + reviewer trust strip

const RPUB_W = 1320, RPUB_H = 2380;

// ─────────────────────────────────────────────────────────────
// Atoms — editorial set, tuned for a wider scroll page.
// (FindingDetailAudit's atoms live in its file scope; we redeclare here
// with the RPub_ prefix to keep this file self-contained.)
// ─────────────────────────────────────────────────────────────

function RPubBigStat({ value, unit, label, sub, tone }) {
  const color = tone === 'bad' ? BPI.bad : tone === 'good' ? BPI.good : tone === 'warn' ? BPI.warn : BPI.ink;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, lineHeight: 1 }}>
        <span className="num" style={{
          fontSize: 62, fontWeight: 600, letterSpacing: '-0.035em', color,
        }}>{value}</span>
        {unit && (
          <span style={{ fontSize: 22, fontWeight: 500, color: BPI.ink55, letterSpacing: '-0.01em' }}>{unit}</span>
        )}
      </div>
      <div style={{
        fontSize: 14, color: BPI.ink, fontWeight: 600, marginTop: 14,
        letterSpacing: '-0.005em', lineHeight: 1.3, maxWidth: 280,
      }}>{label}</div>
      {sub && (
        <div style={{ fontSize: 12.5, color: BPI.ink55, marginTop: 6, lineHeight: 1.5, maxWidth: 280 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function RPubHeader({ kicker, title, sub }) {
  return (
    <div style={{ marginBottom: 22 }}>
      {kicker && (
        <div style={{
          fontSize: 11, fontWeight: 600, color: BPI.ink55,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          marginBottom: 10,
        }}>{kicker}</div>
      )}
      <div style={{
        fontSize: 26, fontWeight: 600, letterSpacing: '-0.022em',
        lineHeight: 1.15, color: BPI.ink, textWrap: 'balance',
        maxWidth: 820,
      }}>{title}</div>
      {sub && (
        <div style={{
          fontSize: 15, color: BPI.ink70, marginTop: 10,
          lineHeight: 1.55, maxWidth: 720, textWrap: 'pretty',
        }}>{sub}</div>
      )}
    </div>
  );
}

// Segment story card — one slow segment narrated, with a small hour
// severity strip. Replaces the dense sortable table on the analyst page.
function RPubSlowCard({ rank, label, body, mph, sched, riders, hours, accent, where }) {
  return (
    <div style={{
      background: BPI.card, borderRadius: 4,
      boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
      padding: '24px 24px 22px',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="num" style={{
          fontSize: 13, fontWeight: 700, letterSpacing: '0.04em',
          color: accent || BPI.bad, fontFamily: BPIMono,
        }}>0{rank}</span>
        <div style={{ flex: 1, height: 1, background: BPI.rule }} />
        <span style={{ fontSize: 11, color: BPI.ink55, fontFamily: BPIMono, letterSpacing: '0.02em' }}>
          {where}
        </span>
      </div>
      <div style={{
        fontSize: 17, fontWeight: 600, letterSpacing: '-0.015em',
        lineHeight: 1.3, color: BPI.ink, textWrap: 'pretty',
      }}>{label}</div>
      <div style={{
        fontSize: 13, color: BPI.ink70, lineHeight: 1.6, textWrap: 'pretty',
      }}>{body}</div>

      {/* In-card stat row */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16,
        padding: '14px 0 4px',
        boxShadow: `inset 0 1px 0 ${BPI.rule}`,
      }}>
        <div>
          <div style={{ fontSize: 9.5, color: BPI.ink40, letterSpacing: '0.08em', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Now</div>
          <div className="num" style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: BPI.bad, lineHeight: 1 }}>
            {mph.toFixed(1)}<span style={{ fontSize: 11, color: BPI.ink55, marginLeft: 2 }}>mph</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9.5, color: BPI.ink40, letterSpacing: '0.08em', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Scheduled</div>
          <div className="num" style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: BPI.ink70, lineHeight: 1 }}>
            {sched.toFixed(1)}<span style={{ fontSize: 11, color: BPI.ink55, marginLeft: 2 }}>mph</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9.5, color: BPI.ink40, letterSpacing: '0.08em', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Riders / day</div>
          <div className="num" style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: BPI.ink, lineHeight: 1 }}>
            {(riders / 1000).toFixed(1)}<span style={{ fontSize: 11, color: BPI.ink55, marginLeft: 2 }}>K</span>
          </div>
        </div>
      </div>

      {/* Hour-of-day severity strip — slowness mapped across 24 hours */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Slowdown by hour of day</div>
        <HourStrip hours={hours} width={420} height={12} />
        <div style={{
          position: 'relative', height: 16, marginTop: 6,
          fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono,
        }}>
          {[
            { h: 6,  label: '6a' },
            { h: 12, label: 'noon' },
            { h: 18, label: '6p' },
          ].map(({ h, label }) => (
            <React.Fragment key={h}>
              <div style={{
                position: 'absolute', top: 0, left: `${(h / 24) * 100}%`,
                width: 1, height: 3, background: BPI.ink20,
              }} />
              <div style={{
                position: 'absolute', top: 4, left: `${(h / 24) * 100}%`,
                transform: 'translateX(-50%)',
              }}>{label}</div>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function RPubFactItem({ label, value, sub }) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 6 }}>{label}</div>
      <div className="num" style={{
        fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em',
        color: BPI.ink, lineHeight: 1,
      }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 11.5, color: BPI.ink55, marginTop: 6, lineHeight: 1.45 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// Story-mode intervention card — used in horizontal row.
function RPubInterventionCard({ year, title, body, tone }) {
  const color = tone === 'good' ? BPI.good : tone === 'warn' ? BPI.warn : tone === 'bad' ? BPI.bad : BPI.accent;
  const bg    = tone === 'good' ? BPI.goodBg : tone === 'warn' ? BPI.warnBg : tone === 'bad' ? BPI.badBg : BPI.accentBg;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          fontFamily: BPIMono, fontSize: 11, fontWeight: 700,
          color, letterSpacing: '0.04em',
          padding: '3px 8px', background: bg, borderRadius: 2,
        }}>{year}</span>
        <div style={{ flex: 1, height: 1, background: BPI.rule }} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.012em', lineHeight: 1.3 }}>{title}</div>
      <div style={{ fontSize: 12.5, color: BPI.ink70, lineHeight: 1.55, textWrap: 'pretty' }}>{body}</div>
    </div>
  );
}

// 14-month trend chart — same data as the analyst page but with editorial
// event tags and bigger type. Sits inside an editorial section, not a tab.
function RPubSpeedChart({ width = 1108, height = 240 }) {
  const data = [7.9, 7.7, 7.6, 7.4, 7.1, 6.9, 6.8, 6.7, 6.8, 6.9, 6.8, 6.6, 6.4, 6.3];
  const labels = ['Apr 25', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan 26', 'Feb', 'Mar', 'Apr', 'May'];
  const padL = 50, padR = 24, padT = 36, padB = 40;
  const n = data.length;
  const cw = (width - padL - padR) / (n - 1);
  const lo = 5.8, hi = 8.4;
  const yv = (v) => padT + (1 - (v - lo) / (hi - lo)) * (height - padT - padB);
  const pts = data.map((v, i) => [padL + i * cw, yv(v)]);
  const line = pts.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1)).join(' ');
  const area = line + ` L${pts[n - 1][0].toFixed(1)},${height - padB} L${padL},${height - padB} Z`;

  // Scheduled-speed reference line
  const sched = 7.4;

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {/* Y gridlines */}
      {[6.0, 6.5, 7.0, 7.5, 8.0].map(v => (
        <g key={v}>
          <line x1={padL} x2={width - padR} y1={yv(v)} y2={yv(v)} stroke={BPI.rule} />
          <text x={padL - 8} y={yv(v) + 3} fontSize="10" textAnchor="end" fill={BPI.ink55} fontFamily={BPIMono}>{v.toFixed(1)}</text>
        </g>
      ))}
      {/* Scheduled reference */}
      <line x1={padL} x2={width - padR} y1={yv(sched)} y2={yv(sched)}
            stroke={BPI.ink40} strokeDasharray="4 4" strokeWidth="1" />
      <text x={width - padR - 6} y={yv(sched) - 6} fontSize="10.5" textAnchor="end"
            fill={BPI.ink55} fontFamily={BPIMono} fontWeight="600">
        scheduled · 7.4 mph
      </text>

      {/* Area + line */}
      <path d={area} fill={BPI.bad} opacity="0.07" />
      <path d={line} fill="none" stroke={BPI.bad} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />

      {/* Event annotations */}
      {[
        { idx: 7, label: 'ACE all-day enforcement turned on', color: BPI.accent },
        { idx: 9, label: 'Congestion pricing begins',         color: BPI.warn   },
      ].map((ev, i) => {
        const cx = padL + ev.idx * cw;
        return (
          <g key={i}>
            <line x1={cx} x2={cx} y1={padT} y2={height - padB} stroke={ev.color} strokeDasharray="3 3" strokeWidth="1.2" opacity="0.7" />
            <text x={cx + 6} y={padT + 14} fontSize="11" fill={ev.color} fontFamily={BPIFonts} fontWeight="600">
              {ev.label}
            </text>
          </g>
        );
      })}

      {/* X labels */}
      {labels.map((l, i) => i % 2 === 0 && (
        <text key={i} x={padL + i * cw} y={height - padB + 18}
              fontSize="10.5" textAnchor="middle" fill={BPI.ink55} fontFamily={BPIMono}>{l}</text>
      ))}

      {/* Endpoint marker */}
      <circle cx={pts[n - 1][0]} cy={yv(data[n - 1])} r="4.5" fill={BPI.bad} />
      <circle cx={pts[n - 1][0]} cy={yv(data[n - 1])} r="9" fill={BPI.bad} opacity="0.18" />
      <text x={pts[n - 1][0] - 10} y={yv(data[n - 1]) - 12}
            fontSize="13" fontWeight="700" fill={BPI.bad} fontFamily={BPIMono} textAnchor="end">
        6.3 mph · today
      </text>

      {/* Start marker */}
      <circle cx={pts[0][0]} cy={yv(data[0])} r="3" fill={BPI.ink40} />
      <text x={pts[0][0] + 8} y={yv(data[0]) - 6}
            fontSize="10.5" fill={BPI.ink55} fontFamily={BPIMono}>
        7.9 mph · 14 months ago
      </text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Helper: build a 24-element severity array for the segment cards.
// ─────────────────────────────────────────────────────────────
function rpubGenHours(am, mid, pm) {
  const arr = [];
  for (let h = 0; h < 24; h++) {
    let v = 0.08;
    if (h >= 7 && h <= 9) v = am;
    else if (h >= 11 && h <= 14) v = mid;
    else if (h >= 16 && h <= 19) v = pm;
    else if (h >= 6 && h <= 21) v = 0.28;
    arr.push(v + Math.sin(h * 1.7) * 0.04);
  }
  return arr;
}

// ─────────────────────────────────────────────────────────────
// RF_RoutePublic — the public-facing route page (M15 SBS).
// ─────────────────────────────────────────────────────────────
function RF_RoutePublic() {
  const route = {
    route: 'M15', sbs: true,
    borough: 'Manhattan',
    span: 'South Ferry ↔ E 126 St',
    borColor: BPI.bx.manhattan,
    published: 'May 12, 2026',
    reviewer: { name: 'M. Okafor', role: 'Senior Analyst, Bus Priority Studio' },
    headline: 'The M15 has every tool the city uses to speed up buses. It is still the slowest Select Bus route in Manhattan.',
    lede: 'Forty-two thousand riders a day take the M15 Select Bus along 1st and 2nd Avenues. Over the past fourteen months the route has lost more than a mile and a half per hour off its evening-rush speed — a slowdown that puts it on track to be slower than walking pace for the median rider, despite a bus lane on 72% of its mileage, all-day camera enforcement since May 2025, and signal priority at four in ten intersections.',
  };

  return (
    <div className="bpi" style={{
      width: RPUB_W, height: RPUB_H,
      display: 'flex', flexDirection: 'column',
      background: BPI.paper,
    }}>
      <StudioBar active="Routes" breadcrumb={`Routes / ${route.route} ${route.sbs ? 'SBS' : ''}`} />

      <div style={{ flex: 1, overflow: 'auto' }}>

        {/* ── HERO ──────────────────────────────────────────────── */}
        <div style={{ background: BPI.card, boxShadow: `inset 0 -1px 0 ${BPI.rule}` }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '8px 1fr',
            maxWidth: 1180, margin: '0 auto', padding: '64px 36px 56px',
            gap: 36,
          }}>
            <div style={{ background: route.borColor, borderRadius: 2 }} />
            <div>
              {/* Tag row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
                <RouteBadge route={route.route} sbs={route.sbs} size="lg" />
                <span style={{ fontSize: 13, color: BPI.ink55, fontWeight: 500 }}>
                  {route.borough} · {route.span}
                </span>
                <span style={{ width: 4, height: 4, borderRadius: 2, background: BPI.ink20 }} />
                <span style={{ fontSize: 13, color: BPI.ink55 }}>
                  8.4 miles · 33 stops · 1 Av / 2 Av
                </span>
                <span style={{ width: 4, height: 4, borderRadius: 2, background: BPI.ink20 }} />
                <span style={{ fontSize: 13, color: BPI.ink55 }}>
                  Updated {route.published}
                </span>
              </div>

              {/* Headline */}
              <div style={{
                fontSize: 46, fontWeight: 600, letterSpacing: '-0.03em',
                lineHeight: 1.08, color: BPI.ink,
                maxWidth: 1000, textWrap: 'balance', marginBottom: 22,
              }}>
                {route.headline}
              </div>

              {/* Lede */}
              <div style={{
                fontSize: 18, color: BPI.ink70, lineHeight: 1.55,
                maxWidth: 820, textWrap: 'pretty',
              }}>
                {route.lede}
              </div>

              {/* Byline + actions */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 24,
                marginTop: 32, paddingTop: 22,
                boxShadow: `inset 0 1px 0 ${BPI.rule}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 16,
                    background: BPI.ink, color: BPI.paper,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11.5, fontWeight: 600,
                  }}>MO</div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>Reviewed by {route.reviewer.name}</div>
                    <div style={{ fontSize: 11, color: BPI.ink55 }}>{route.reviewer.role}</div>
                  </div>
                </div>
                <div style={{ flex: 1 }} />
                <Button variant="primary" size="md">Start a brief on this route →</Button>
                <Button variant="secondary" size="md">Open analyst view</Button>
              </div>
            </div>
          </div>
        </div>

        {/* ── KEY NUMBERS ───────────────────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 36px 8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 36 }}>
            <RPubBigStat
              value="6.3"
              unit="mph"
              tone="bad"
              label="Current evening-rush speed"
              sub="One mile per hour below what the schedule promises riders at the same hour."
            />
            <RPubBigStat
              value="−1.6"
              unit="mph"
              tone="bad"
              label="Slower than 14 months ago"
              sub="A near-straight decline — about half a mile per hour lost each year."
            />
            <RPubBigStat
              value="42K"
              label="Riders on a typical weekday"
              sub="Third-busiest local bus in the city. Riders skew older, lower-income, and East Side-bound."
            />
            <RPubBigStat
              value="4,310"
              unit="hrs"
              tone="warn"
              label="Rider-hours lost every weekday"
              sub="Time spent on the bus beyond what the schedule promises — about a full work-week per regular rider, per year."
            />
          </div>
        </div>

        {/* ── WHERE THE BUS SLOWS DOWN ──────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '64px 36px 20px' }}>
          <RPubHeader
            kicker="Where the bus slows down"
            title="Three corridors do most of the damage."
            sub="Of the thirteen timepoint segments the M15 runs through, three of them — all on the southern half of the route — account for 53% of the rider-hours riders lose to delay every weekday."
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginTop: 12 }}>
            <RPubSlowCard
              rank={1}
              where="MADISON AV · NB"
              label="Madison Av, 28th to 58th Street"
              body="The slowest 1.5 miles of the entire route. Buses crawl at jogging pace here all afternoon — slower than walking pace for the median rider during the 5 PM rush. The bus lane on this stretch is paint-only; cameras can ticket vehicles, but the lane has no concrete buffer."
              mph={4.2} sched={7.1} riders={18420}
              hours={rpubGenHours(0.7, 0.5, 0.92)}
              accent={BPI.bad}
            />
            <RPubSlowCard
              rank={2}
              where="1 AV · NB"
              label="1st Av, 14th to 34th Street"
              body="Bus lane in place, camera enforcement active — and still 1.3 mph slower than fully-laned segments elsewhere on the route. The slowdown got noticeably worse after enforcement went all-day in May 2025, suggesting whatever's blocking the lane here isn't a vehicle a camera can ticket."
              mph={4.9} sched={7.6} riders={14110}
              hours={rpubGenHours(0.6, 0.5, 0.85)}
              accent={BPI.bad}
            />
            <RPubSlowCard
              rank={3}
              where="2 AV · SB"
              label="2nd Av, 60th to 42nd Street"
              body="The southbound mirror of the corridor's busiest commuter segment. Speeds drop sharply between 4 PM and 7 PM when downtown-bound demand peaks. The lane is concrete-buffered here, but signal priority drops off entirely below 57th Street."
              mph={5.2} sched={7.8} riders={12880}
              hours={rpubGenHours(0.55, 0.6, 0.78)}
              accent={BPI.bad}
            />
          </div>
        </div>

        {/* ── SPEED OVER TIME ───────────────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 36px 20px' }}>
          <RPubHeader
            kicker="The trend"
            title="Slower every month, for fourteen months running."
            sub="Weighted evening-rush speed by month. The line points straight down — the kind of trend that is statistically very unlikely to be noise. Comparable Select Bus corridors reversed this pattern after camera enforcement turned on. The M15 didn't."
          />
          <div style={{
            background: BPI.card, padding: '24px 28px 18px',
            boxShadow: `inset 0 0 0 1px ${BPI.rule}`, borderRadius: 4,
          }}>
            <RPubSpeedChart width={1108} height={240} />
            <div style={{
              marginTop: 14, paddingTop: 14,
              boxShadow: `inset 0 1px 0 ${BPI.rule}`,
              display: 'flex', gap: 28, fontSize: 12, color: BPI.ink70,
              lineHeight: 1.55,
            }}>
              <div style={{ flex: 1, maxWidth: 520 }}>
                In percentile terms, the M15 SBS now sits in the seventh percentile of all New York City SBS routes by evening-rush speed. The route's own scheduled timepoints assume riders are moving at 7.4 mph — about half a mile per hour faster than what we measure today.
              </div>
              <div style={{ width: 1, background: BPI.rule }} />
              <div style={{ flex: 1, maxWidth: 480 }}>
                On six of eight comparable corridors with the same enforcement and lane treatment, automated camera enforcement was followed by a measurable speed gain within sixty days. The M15 is one of two corridors that went the other way after the program turned on.
              </div>
            </div>
          </div>
        </div>

        {/* ── WHO RIDES THIS BUS ────────────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 36px 20px' }}>
          <RPubHeader
            kicker="Who rides this bus"
            title="A workhorse local route, not a tourist line."
          />
          <div style={{
            background: BPI.card, borderRadius: 4,
            boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
            display: 'grid', gridTemplateColumns: '1.4fr 1fr',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '32px 36px' }}>
              <div style={{ fontSize: 14, color: BPI.ink70, lineHeight: 1.7, textWrap: 'pretty', marginBottom: 22 }}>
                The M15 carries about <b style={{ color: BPI.ink }}>42,100 riders</b> on a typical weekday, more than any other local bus in Manhattan. It runs the length of the East Side, from South Ferry to East 126th Street, threading neighborhoods that the Second Avenue Subway has not yet reached — East Harlem, the Upper East Side above 96th, the Lower East Side, and Chinatown.
                <br /><br />
                Compared to the citywide bus rider average, M15 riders are <b style={{ color: BPI.ink }}>older</b>, more likely to be paying with reduced fare, and disproportionately likely to be making a trip the subway cannot replace. The route's three busiest stops are at major hospital and shopping anchors. When the bus slows down, the people most directly affected are not the ones who have a car or a cab as a backup.
              </div>

              {/* Riders mini-stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28 }}>
                <RPubFactItem label="Daily riders" value="42,100" sub="Weekday average · −4.1% YoY" />
                <RPubFactItem label="Reduced-fare share" value="34%" sub="Citywide bus average: 22%" />
                <RPubFactItem label="Median age" value="49" sub="Citywide bus average: 41" />
              </div>
            </div>

            <div style={{
              background: BPI.paperDeep,
              padding: '32px 36px',
              borderLeft: `1px solid ${BPI.rule}`,
              display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Busiest stops</div>
              {[
                { name: 'E 125 St / 1 Av',      brdgs: 4200, note: 'Harlem hospital corridor' },
                { name: 'E 86 St / 1 Av',       brdgs: 3810, note: 'Upper East Side shopping' },
                { name: 'E 14 St / 1 Av',       brdgs: 3120, note: 'L train transfer' },
                { name: 'S Ferry Terminal',     brdgs: 2940, note: 'Staten Island ferry' },
                { name: 'Grand Central (NB)',   brdgs: 2640, note: 'Commuter rail transfer' },
              ].map((s, i, arr) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '1fr 60px', gap: 10, alignItems: 'baseline',
                  paddingBottom: i < arr.length - 1 ? 10 : 0,
                  boxShadow: i < arr.length - 1 ? `inset 0 -1px 0 ${BPI.rule}` : 'none',
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: BPI.ink, marginBottom: 2 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: BPI.ink55 }}>{s.note}</div>
                  </div>
                  <div className="num" style={{ textAlign: 'right', fontSize: 14, fontWeight: 600 }}>
                    {(s.brdgs / 1000).toFixed(1)}K
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── WHAT'S BEEN TRIED ─────────────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 36px 20px' }}>
          <RPubHeader
            kicker="What's been tried"
            title="The city has spent fifteen years building a priority stack on this corridor."
            sub="None of these interventions failed on their own. Each one made the route faster than it would have been without it. But the combined effect has not been enough to keep up with the underlying loss."
          />
          <div style={{
            background: BPI.card, borderRadius: 4,
            boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
            padding: '32px 36px',
            display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 28,
          }}>
            <RPubInterventionCard
              year="2010"
              tone="accent"
              title="M15 SBS launches"
              body="Off-board fare, limited stops, and painted bus lanes on most of the corridor. Speeds rose by roughly two miles per hour over the route's local predecessor."
            />
            <RPubInterventionCard
              year="2019"
              tone="accent"
              title="Camera enforcement, peak hours"
              body="Automated cameras begin ticketing cars blocking the bus lane during rush hour. Violations fell by about 40% in the first year."
            />
            <RPubInterventionCard
              year="2023"
              tone="good"
              title="Concrete lane, 14th to 23rd Street"
              body="The Department of Transportation upgraded the painted lane on the route's lower segment to concrete-buffered. Bus speeds on this segment rose 0.9 mph within ninety days and held."
            />
            <RPubInterventionCard
              year="Jan 2025"
              tone="warn"
              title="Congestion pricing begins"
              body="Manhattan's central business district congestion charge launches. Below 60th Street, the M15 sees a small speed gain — but its overlap with camera enforcement makes the cause hard to attribute cleanly."
            />
            <RPubInterventionCard
              year="May 2025"
              tone="accent"
              title="Camera enforcement, all-day"
              body="The program extends to twenty-four-hour coverage. Violations fall 68% year-over-year route-wide. But on Madison Avenue, weekly violations barely budge — and that segment's speed keeps falling."
            />
          </div>
        </div>

        {/* ── ABOUT THIS CORRIDOR ───────────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 36px 20px' }}>
          <RPubHeader
            kicker="About this corridor"
            title="The M15 SBS, in plain numbers."
          />
          <div style={{
            background: BPI.card, borderRadius: 4,
            boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
            padding: '32px 36px',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 36, marginBottom: 28 }}>
              <RPubFactItem
                label="Route length"
                value="8.4 mi"
                sub="South Ferry ↔ East 126th Street. 33 stops total across both directions."
              />
              <RPubFactItem
                label="Peak frequency"
                value="6–8 min"
                sub="During rush hours. Off-peak headways stretch to 12 minutes."
              />
              <RPubFactItem
                label="Bus lane coverage"
                value="72%"
                sub="Of route mileage. Concrete-buffered on 18% of mileage; painted-only on the rest."
              />
              <RPubFactItem
                label="Camera enforcement"
                value="84%"
                sub="Of route mileage. All-day since May 2025."
              />
            </div>
            <div className="rule" style={{ marginBottom: 28 }} />
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 36 }}>
              <div style={{ flex: 1 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>What this means for a typical rider</div>
                <div style={{ fontSize: 14, color: BPI.ink70, lineHeight: 1.65, maxWidth: 660, textWrap: 'pretty' }}>
                  A weekday round-trip on the M15 SBS now takes about eight minutes longer than it did fourteen months ago. Multiplied across 42,000 daily riders, that adds up to roughly <b style={{ color: BPI.ink }}>470,000 rider-hours of lost time per year</b> — and the curve is still bending the wrong way. For a regular five-day-a-week commuter, the slowdown alone costs about a full work-week of time annually.
                </div>
              </div>
              <div style={{ width: 280, flexShrink: 0 }}>
                <MapThumb width={280} height={150} label="1 av / 2 av · m15 sbs corridor" emphasis={route.borColor} />
                <div style={{ fontSize: 10.5, color: BPI.ink55, marginTop: 6, fontFamily: BPIMono, textAlign: 'right' }}>
                  south ferry ↔ e 126 st
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── HOW WE KNOW THIS — trust strip ────────────────────── */}
        <div style={{
          background: BPI.paperDeep,
          boxShadow: `inset 0 1px 0 ${BPI.rule}`,
          marginTop: 48, padding: '40px 0',
        }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 36px' }}>
            <RPubHeader
              kicker="How we know this"
              title="The data, the review, and the audit trail."
            />
            <div style={{
              display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 28,
            }}>

              {/* Methods */}
              <div>
                <div className="eyebrow" style={{ marginBottom: 12 }}>Methodology</div>
                <div style={{ fontSize: 13, color: BPI.ink70, lineHeight: 1.65, textWrap: 'pretty' }}>
                  Speeds reported here are MTA segment-level bus speeds, which include time spent at stops and traffic lights — the time a rider actually experiences on the bus. We weight each segment by daily ridership when computing route-wide averages, and we restrict the speed-trend chart to evening rush hours (4 PM – 7 PM), when ridership and congestion are both at their highest. Comparable corridors are matched on length, treatment stack, and enforcement-activation date.
                </div>
                <div style={{ marginTop: 14, display: 'flex', gap: 14, alignItems: 'center', fontSize: 12, color: BPI.ink55 }}>
                  <span style={{ color: BPI.accent, fontWeight: 600, cursor: 'pointer' }}>Read full methodology →</span>
                  <span style={{ width: 4, height: 4, borderRadius: 2, background: BPI.ink20 }} />
                  <span style={{ color: BPI.accent, fontWeight: 600, cursor: 'pointer' }}>Download data (CSV)</span>
                </div>
              </div>

              {/* Sources */}
              <div>
                <div className="eyebrow" style={{ marginBottom: 12 }}>Data sources</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { src: 'MTA Bus Speeds',                  sub: 'segment-level, daily aggregates' },
                    { src: 'MTA Hourly Ridership',            sub: 'OMNY + MetroCard aggregate' },
                    { src: 'MTA Automated Camera Enforcement', sub: 'weekly violation counts' },
                    { src: 'MTA GTFS schedule',               sub: 'timepoint definitions, 2026' },
                    { src: 'NYC DOT bus-lane GIS',            sub: 'Q1 2026 lane-type classification' },
                    { src: 'NYC DOT signal-timing log',       sub: 'TSP intersection roster' },
                  ].map((s, i) => (
                    <div key={i} style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                      <div style={{ fontWeight: 500, color: BPI.ink }}>{s.src}</div>
                      <div style={{ color: BPI.ink55, fontSize: 11.5 }}>{s.sub}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Review trail */}
              <div>
                <div className="eyebrow" style={{ marginBottom: 12 }}>Review</div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 18, flexShrink: 0,
                    background: BPI.ink, color: BPI.paper,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 600,
                  }}>MO</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{route.reviewer.name}</div>
                    <div style={{ fontSize: 11, color: BPI.ink55 }}>{route.reviewer.role}</div>
                    <div style={{ fontSize: 11, color: BPI.ink55, marginTop: 2 }}>Approved {route.published}</div>
                  </div>
                </div>
                <div style={{
                  fontSize: 12, color: BPI.ink70, lineHeight: 1.6,
                  padding: 12, background: BPI.card,
                  borderLeft: `3px solid ${BPI.good}`, borderRadius: '0 3px 3px 0',
                  textWrap: 'pretty',
                }}>
                  “Speed-trend chart and segment-level breakdowns match the underlying data. Approve for public use. The Madison Av framing should stay structural — paint vs. concrete — not enforcement-program failure.”
                </div>
                <div style={{
                  marginTop: 14, display: 'flex', alignItems: 'center', gap: 10,
                  fontSize: 11, color: BPI.ink40, fontFamily: BPIMono,
                }}>
                  <span>ROUTE m15_sbs_2026_05</span>
                  <span style={{ color: BPI.ink20 }}>·</span>
                  <span style={{ color: BPI.accent, cursor: 'pointer', fontWeight: 600 }}>View full audit trail →</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '20px 36px 28px',
          maxWidth: 1180, margin: '0 auto',
          fontSize: 11.5, color: BPI.ink55,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span>Bus Priority Impact Studio · A civic data project</span>
          <span style={{ flex: 1 }} />
          <span>Share this page ↗</span>
          <span style={{ color: BPI.ink20 }}>·</span>
          <span>Cite</span>
          <span style={{ color: BPI.ink20 }}>·</span>
          <span>Report an error</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { RF_RoutePublic });
