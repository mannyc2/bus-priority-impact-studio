// States in context — actual screens shown in their loading and empty
// states, so the design system's primitives have a real instance, not
// just a documentation example.

const STW = 1320, STH = 880;

// ─────────────────────────────────────────────────────────────
// Route Detail · loading
//
// The route header is already loaded (lightweight metadata fetched
// alongside the route ID). KPI strip, slow segments, intervention
// timeline, and before/after are all in skeleton.
// ─────────────────────────────────────────────────────────────
function RF_RouteDetail_Loading() {
  return (
    <div className="bpi" style={{ width: STW, height: STH, display: 'flex', flexDirection: 'column' }}>
      <StudioBar active="Routes" breadcrumb="Routes / M15 +SBS · loading…" />

      {/* Route header (already loaded — fast endpoint) */}
      <div style={{ padding: '24px 28px 18px', background: BPI.card, boxShadow: `inset 0 -1px 0 ${BPI.rule}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginBottom: 18 }}>
          <RouteBadge route="M15" sbs size="xl" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              1st Avenue / 2nd Avenue Select Bus Service
            </div>
            <div style={{ fontSize: 13, color: BPI.ink55, marginTop: 4 }}>
              Manhattan · East Harlem ↔ South Ferry · 8.4 mi · 33 stops
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" size="sm">Compare with M15 local</Button>
            <Button variant="primary" size="sm">Generate brief →</Button>
          </div>
        </div>
        {/* KPI strip — skeletons */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 24 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ paddingRight: 18, borderRight: i < 4 ? `1px solid ${BPI.rule}` : 'none' }}>
              <SkeletonKPI />
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs items={['Overview', 'Slow segments', 'Ladder', 'Riders', 'Interventions', 'Methodology']}
        active="Slow segments" padded />

      {/* Body */}
      <div style={{ flex: 1, padding: '28px 32px', overflow: 'auto' }}>

        {/* Slow segments — skeleton table */}
        <div style={{ marginBottom: 44 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <Skeleton w={360} h={20} />
              <div style={{ marginTop: 8 }}><Skeleton w={520} h={12} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Skeleton w={70} h={20} radius={10} />
              <Skeleton w={90} h={20} radius={10} />
            </div>
          </div>
          <SegmentRowHeader />
          {Array.from({ length: 5 }).map((_, i) => <SkeletonSegmentRow key={i} />)}
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 12, height: 12, borderRadius: 6, border: `1.5px solid ${BPI.ink55}`,
              borderTopColor: 'transparent', display: 'inline-block',
              animation: 'bpi-spin 0.7s linear infinite',
            }} />
            <span style={{ fontSize: 11.5, color: BPI.ink55, fontFamily: BPIMono }}>
              Loading 13 timepoint segments for March 2026 · 2,003 observations…
            </span>
          </div>
        </div>

        {/* Intervention timeline */}
        <div style={{ marginBottom: 44 }}>
          <Skeleton w={280} h={20} />
          <div style={{ marginTop: 8 }}><Skeleton w={520} h={12} /></div>
          <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Skeleton w={48} h={12} />
                <div style={{ display: 'flex', alignItems: 'center', height: 22 }}>
                  <Skeleton w={14} h={14} radius={7} />
                </div>
                <Skeleton w={140} h={14} />
                <SkeletonText lines={2} />
              </div>
            ))}
          </div>
        </div>

        {/* Before / after */}
        <div>
          <Skeleton w={360} h={20} />
          <div style={{ marginTop: 8 }}><Skeleton w={420} h={12} /></div>
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{
                padding: 16, background: BPI.card, borderRadius: 3,
                boxShadow: `0 0 0 1px ${BPI.rule}`,
              }}>
                <Skeleton w={140} h={14} />
                <div style={{ marginTop: 6 }}><Skeleton w={80} h={10} /></div>
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Skeleton w="100%" h={8} />
                  <Skeleton w="80%" h={8} />
                </div>
                <div style={{ marginTop: 14 }}><Skeleton w={120} h={18} radius={3} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Hotspots · empty filter set
//
// The full feed chrome stays — header, filter strip, count — but the
// result table is replaced with an opinionated empty state that names
// the threshold and offers two ways to recover.
// ─────────────────────────────────────────────────────────────
function HS_EmptyFilters() {
  return (
    <div className="bpi" style={{ width: STW, height: STH, display: 'flex', flexDirection: 'column' }}>
      <StudioBar active="Hotspots" breadcrumb="Hotspots / current month" />

      {/* Hero band */}
      <div style={{
        padding: '20px 28px 16px', background: BPI.card,
        boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 28 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em' }}>
              The worst-performing bus segments right now
            </div>
            <div style={{ fontSize: 13, color: BPI.ink55, marginTop: 4 }}>
              Ranked by rider-hours lost vs. scheduled timepoint. 13,948 segments scanned · Mar 2026.
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            {['By rider-hours', 'By severity', 'By 14-day decline'].map((t, i) => (
              <span key={t} className="chip" style={i === 0 ? { background: BPI.ink, color: BPI.paper } : {}}>{t}</span>
            ))}
          </div>
        </div>

        {/* Filter strip — values here are why nothing matches */}
        <div style={{
          display: 'flex', gap: 18, marginTop: 18, alignItems: 'center', fontSize: 12.5,
        }}>
          {[
            { lbl: 'Borough', val: 'Staten Island' },
            { lbl: 'Window',  val: 'AM peak' },
            { lbl: 'Treatment', val: 'Full lane + ACE + TSP' },
            { lbl: 'Min riders/day', val: '15,000' },
            { lbl: 'Direction', val: 'Both' },
          ].map((f, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 12px', background: BPI.paper, borderRadius: 3,
              boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
            }}>
              <span style={{ color: BPI.ink55, fontSize: 11 }}>{f.lbl}</span>
              <span style={{ fontWeight: 600 }}>{f.val}</span>
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke={BPI.ink40} strokeWidth="1.4"><path d="M2 3.5L4.5 6 7 3.5" /></svg>
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 11, color: BPI.ink55, fontFamily: BPIMono }}>0 segments match</div>
        </div>
      </div>

      {/* Table head still shown so the user remembers what the columns are */}
      <div style={{
        padding: '10px 28px', background: BPI.paperDeep,
        display: 'grid',
        gridTemplateColumns: '28px 28px 1.5fr 1fr 72px 92px 168px 130px 100px',
        gap: 14, fontSize: 11, color: BPI.ink55, fontWeight: 600,
        boxShadow: `inset 0 -1px 0 ${BPI.rule}`, letterSpacing: '-0.003em',
      }}>
        <span>#</span><span /><span>Segment</span><span>Routes</span>
        <span style={{ textAlign: 'right' }}>mph</span>
        <span style={{ textAlign: 'right' }}>RH/day</span>
        <span>Severity by hour</span>
        <span>14-day speed</span>
        <span style={{ textAlign: 'right' }}>Treatments</span>
      </div>

      {/* The body becomes a properly-shaped empty state */}
      <div style={{
        flex: 1, background: BPI.card,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}>
        <div style={{
          maxWidth: 540, display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 16, textAlign: 'center',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 28, background: BPI.ink06,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: BPI.ink40, fontSize: 28, fontWeight: 400, lineHeight: 1,
          }}>∅</div>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            No segments in Staten Island match these treatment filters.
          </div>
          <div style={{ fontSize: 13.5, color: BPI.ink70, lineHeight: 1.55, maxWidth: 460 }}>
            Staten Island routes don't currently have any segments with the full <i>lane + ACE + TSP</i> treatment trio.
            Either drop one of those filters, or widen the borough to Manhattan or the Bronx
            where most treated segments live.
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <Button variant="primary" size="md">Show all boroughs</Button>
            <Button variant="secondary" size="md">Loosen treatment filter</Button>
            <Button variant="ghost" size="md">Clear all filters</Button>
          </div>

          <div className="rule" style={{ width: '100%', margin: '14px 0 4px' }} />

          <div style={{ width: '100%', textAlign: 'left' }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>What you'd see if you loosened "Treatment"</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { val: '47',  lbl: 'segments with ACE only' },
                { val: '12',  lbl: 'segments with lane + ACE (no TSP)' },
                { val: '6',   lbl: 'segments with concrete lane' },
              ].map((r, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', background: BPI.paper, borderRadius: 3,
                  boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
                }}>
                  <div className="num" style={{
                    fontSize: 18, fontWeight: 600, color: BPI.ink, letterSpacing: '-0.01em',
                    width: 36, textAlign: 'right',
                  }}>{r.val}</div>
                  <div style={{ fontSize: 12.5, color: BPI.ink70 }}>{r.lbl}</div>
                  <div style={{ flex: 1 }} />
                  <button className="bpi" style={{
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    color: BPI.accent, fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                  }}>Apply →</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Small CSS-keyframe inject for the spinner used by the loading state.
if (typeof document !== 'undefined' && !document.getElementById('bpi-spin-styles')) {
  const s = document.createElement('style');
  s.id = 'bpi-spin-styles';
  s.textContent = `@keyframes bpi-spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(s);
}

Object.assign(window, { RF_RouteDetail_Loading, HS_EmptyFilters });
