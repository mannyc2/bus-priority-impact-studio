// ─────────────────────────────────────────────────────────────
// INTERVENTIONS · REFACTOR
//
// Exploration board for the new two-layer model. Sections:
//   • Glyph specimens — every treatment glyph, all states
//   • Compact display v2 — three glyph-based variations
//   • Compact display v1 (legacy) — abstract bars/dots, kept for compare
//   • Full detail — TreatmentInventory + InterventionTimeline
//   • Taxonomy — families, treatments, states, scopes
//
// Lives on the design canvas; once the team picks the compact direction,
// the corresponding component becomes the canonical SegmentRow signal block.
// ─────────────────────────────────────────────────────────────

// ── SAMPLE DATA ─────────────────────────────────────────────
// M15 SBS — illustrative. Sources are not asserted in the model.
const SAMPLE_M15_TREATMENTS = [
  // Street priority
  { type: 'bus_lane',           state: 'active', coverage: 0.72, note: 'mixed paint + concrete' },
  { type: 'offset_lane',        state: 'active', coverage: 0.18, note: 'lower corridor only' },
  // Enforcement
  { type: 'ace',                state: 'active', detail: '24-hour since May 2025', evaluation: 'evaluated' },
  { type: 'bus_mounted_cam',    state: 'pilot', detail: 'fleet rollout in progress' },
  // Signals
  { type: 'tsp',                state: 'active', coverage: 0.05, detail: 'E 86–96 St only' },
  { type: 'queue_jump',         state: 'proposed', detail: '2027 capital request' },
  // Stops & boarding
  { type: 'off_board_fare',     state: 'active' },
  { type: 'all_door',           state: 'active' },
  { type: 'stop_consolidation', state: 'active', detail: '~28% fewer stops vs M15 local' },
  { type: 'bus_bulb',           state: 'active', coverage: 0.4 },
  // Service pattern
  { type: 'sbs',                state: 'active' },
  // Curb & safety
  { type: 'daylighting',        state: 'planned', detail: '12 intersections, FY27' },
  // Program
  { type: 'capital_milestone',  state: 'planned', detail: 'concrete-lane extension 23→34 St' },
];

const SAMPLE_MADISON_TREATMENTS = [
  { type: 'bus_lane', state: 'active', coverage: 0.33, note: 'painted, 28–38 St only' },
  { type: 'ace',      state: 'active', note: 'adjacent corridor only' },
];

const SAMPLE_GAP_TREATMENTS = [
  { type: 'bus_lane', state: 'active', coverage: 0.9 },
  { type: 'ace',      state: 'active' },
  { type: 'tsp',      state: 'source_gap', detail: 'no current inventory from NYCDOT' },
];

const SAMPLE_HEAVY_TREATMENTS = [
  { type: 'offset_lane',        state: 'active', coverage: 1.0 },
  { type: 'ace',                state: 'active' },
  { type: 'tsp',                state: 'active', coverage: 0.8 },
  { type: 'queue_jump',         state: 'active' },
  { type: 'bus_bulb',           state: 'active', coverage: 0.6 },
  { type: 'off_board_fare',     state: 'active' },
  { type: 'all_door',           state: 'active' },
  { type: 'sbs',                state: 'active' },
  { type: 'daylighting',        state: 'active' },
  { type: 'hardened_center',    state: 'active' },
];

// M15 intervention timeline (dated, source-backed)
const SAMPLE_M15_INTERVENTIONS = [
  { date: 'Oct 2010', title: 'M15 SBS launch',           kind: 'sbs_launch',                  detail: 'Off-board fare, all-door boarding, limited stops, painted lanes most of corridor.', tone: 'accent', source: 'MTA service change' },
  { date: 'Nov 2019', title: 'ACE begins · peak only',    kind: 'ace_scope_change',           detail: 'Camera enforcement on bus-lane segments at peak hours. Violations ~−40% in year 1.',  tone: 'accent', source: 'MTA ACE program' },
  { date: 'Aug 2023', title: 'Concrete lane · 14→23 St',  kind: 'bus_lane_infrastructure',    detail: 'NYC DOT upgrade. Segment speed +0.9 mph within 90 days.',                            tone: 'good',   source: 'NYCDOT capital ledger' },
  { date: 'Jan 2025', title: 'Congestion pricing',         kind: 'capital_project_milestone', detail: 'CBD-wide effect. Attribution with ACE not clean for this corridor.',                  tone: 'warn',   source: 'MTA / NYSDOT' },
  { date: 'May 2025', title: 'ACE all-day rollout',        kind: 'ace_scope_change',          detail: 'Enforcement extended 24/7. Violations −68% YoY. Madison Av speed unchanged.',         tone: 'accent', source: 'MTA ACE program' },
  { date: '2026',     title: 'Concrete lane · 23→34 St',   kind: 'bus_lane_infrastructure',   detail: 'Planned in current capital plan. No construction window committed.',                  tone: 'warn',   source: 'NYCDOT capital plan FY26–28' },
];

const SAMPLE_HOURS_HEAVY  = [0.45, 0.62, 0.78, 0.85, 0.72, 0.55, 0.40];
const SAMPLE_HOURS_LIGHT  = [0.25, 0.38, 0.45, 0.50, 0.42, 0.30, 0.20];


// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function INT_Page({ eyebrow, title, sub, children }) {
  return (
    <div className="bpi" style={{ width: 1320, padding: 32, background: BPI.paper }}>
      <div style={{ marginBottom: 24 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>{eyebrow}</div>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.2 }}>{title}</div>
        {sub && (
          <div style={{ fontSize: 13, color: BPI.ink70, marginTop: 6, maxWidth: 760, lineHeight: 1.5 }}>{sub}</div>
        )}
      </div>
      {children}
    </div>
  );
}

function INT_Variant({ label, sub, children }) {
  return (
    <div style={{
      padding: '16px 18px', background: BPI.card, borderRadius: 3,
      boxShadow: `0 0 0 1px ${BPI.rule}`,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '-0.005em' }}>{label}</div>
        <div style={{ fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono, letterSpacing: '0.04em' }}>{sub}</div>
      </div>
      {children}
    </div>
  );
}

function MockSegRow({ from, to, mph, sched, rh, hours, children, accent, tall }) {
  const sev = mph < 5 ? BPI.bad : mph < 6 ? BPI.warn : BPI.ink;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 76px 84px 168px minmax(180px, auto)',
      gap: 18, alignItems: 'center',
      padding: tall ? '16px 14px' : '12px 14px',
      background: accent ? BPI.accentBg : 'transparent',
      boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
    }}>
      <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
        <DirIndicator dir="NB" />
        <span style={{ fontSize: 13.5, fontWeight: 500 }}>
          {from} <span style={{ color: BPI.ink40 }}>→</span> {to}
        </span>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="num" style={{ fontSize: 15, fontWeight: 600, color: sev, lineHeight: 1 }}>{mph.toFixed(1)}</div>
        <div className="num" style={{ fontSize: 9.5, color: BPI.ink55 }}>vs {sched.toFixed(1)} sch</div>
      </div>
      <div className="num" style={{ fontSize: 13, textAlign: 'right', fontWeight: 500 }}>
        {rh.toLocaleString()}
      </div>
      <HourStrip hours={hours} />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{children}</div>
    </div>
  );
}

function MockHeader() {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 76px 84px 168px minmax(180px, auto)',
      gap: 18, padding: '0 14px 8px',
      fontSize: 10, color: BPI.ink55, letterSpacing: '0.08em',
      textTransform: 'uppercase', fontWeight: 700,
    }}>
      <span>Segment</span>
      <span style={{ textAlign: 'right' }}>MPH / sch</span>
      <span style={{ textAlign: 'right' }}>RH / day</span>
      <span>Severity by hour</span>
      <span style={{ textAlign: 'right' }}>Treatments</span>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// Section A — Glyph specimens
// Every glyph in the library, at scale, with state variants.
// ─────────────────────────────────────────────────────────────
function INT_GlyphSpecimens() {
  const families = FAMILIES.map(fam => ({
    ...fam,
    items: Object.entries(TREATMENTS)
      .filter(([_, t]) => t.family === fam.id)
      .map(([type, def]) => ({ type, def })),
  })).filter(f => f.items.length > 0);

  return (
    <INT_Page
      eyebrow="Interventions refactor · Primitives"
      title="A glyph per treatment, not bars and dots."
      sub="Each treatment carries its own distinct visual identity, grounded in what the thing actually is — road cross-sections for lane treatments, signal heads for signals, camera bodies for enforcement, lollipops for stops. State (active / planned / source gap) is encoded by fill, dash, and opacity, so a row of mixed-state glyphs still reads as a coherent system."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {families.map(fam => (
          <div key={fam.id} style={{
            padding: '18px 22px', background: BPI.card, borderRadius: 3,
            boxShadow: `0 0 0 1px ${BPI.rule}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.005em' }}>{fam.label}</div>
              <div style={{ fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono, letterSpacing: '0.04em' }}>
                family · {fam.id}
              </div>
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 12,
            }}>
              {fam.items.map(({ type, def }) => (
                <div key={type} style={{
                  display: 'flex', flexDirection: 'column', gap: 8,
                  padding: '12px 12px', borderRadius: 2,
                  background: BPI.paper,
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: 44, background: BPI.cardRaised, borderRadius: 2,
                    boxShadow: `inset 0 0 0 1px ${BPI.ink06}`,
                  }}>
                    <TreatmentIcon type={type} state="active" size={32} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.2 }}>{def.label}</div>
                    <div style={{ fontSize: 9.5, color: BPI.ink40, fontFamily: BPIMono, marginTop: 2 }}>{type}</div>
                  </div>
                  {/* State variants at 18px */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4, borderTop: `1px solid ${BPI.ink06}` }}>
                    {['active', 'planned', 'source_gap'].map(s => (
                      <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <TreatmentIcon type={type} state={s} size={18} />
                        <span style={{ fontSize: 8.5, color: BPI.ink40, fontFamily: BPIMono, letterSpacing: '0.04em' }}>
                          {s === 'source_gap' ? 'gap' : s}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* State legend */}
      <div style={{
        marginTop: 20,
        padding: '14px 18px', background: BPI.paperDeep, borderRadius: 3,
        fontSize: 12, color: BPI.ink70, lineHeight: 1.55,
        display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <span style={{ fontFamily: BPIMono, fontWeight: 700, color: BPI.ink, letterSpacing: '0.04em' }}>
          STATE LEGEND ·
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TreatmentIcon type="bus_lane" state="active" size={20} />
          <span><strong>active</strong> · filled ink</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TreatmentIcon type="bus_lane" state="planned" size={20} />
          <span><strong>planned</strong> · outlined, dashed</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TreatmentIcon type="bus_lane" state="source_gap" size={20} />
          <span><strong>source gap</strong> · warn dash</span>
        </div>
      </div>
    </INT_Page>
  );
}


// ─────────────────────────────────────────────────────────────
// Section B — Compact display v2 (glyph-based)
// ─────────────────────────────────────────────────────────────
function INT_CompactV2() {
  return (
    <INT_Page
      eyebrow="Interventions refactor · Compact display v2"
      title="Three visible signals, then +N — with real glyphs."
      sub={
        <>
          Same structural rule: <strong>Street priority · Enforcement · Signals</strong> claim the three visible slots,
          everything else folds into a <span className="mono">+N</span> chip. The glyph in each slot is the
          headline treatment's actual glyph, so the segment reads <em>offset lane · ACE · TSP</em> not
          <em> bar · dot · dot</em>. Three layout variations on top of the same data.
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* E1 — Icon trio (replaces A) */}
        <INT_Variant
          label="E1 · Icon trio + overflow"
          sub="canonical compact — closest in shape to today's row"
        >
          <div style={{ fontSize: 11.5, color: BPI.ink70, lineHeight: 1.5, maxWidth: 820 }}>
            Three glyphs in fixed family order with a small caption underneath. Drops the bar/dot abstraction in
            favor of the treatment's own visual identity. This is the recommended replacement for the existing
            three-glyph triad on every analyst surface.
          </div>
          <div style={{ background: BPI.paper, borderRadius: 3, boxShadow: `inset 0 0 0 1px ${BPI.rule}` }}>
            <MockHeader />
            <MockSegRow from="E 28 St" to="E 58 St" mph={4.2} sched={7.1} rh={18420} hours={SAMPLE_HOURS_HEAVY} accent tall>
              <TreatmentIconStrip treatments={SAMPLE_MADISON_TREATMENTS} />
            </MockSegRow>
            <MockSegRow from="E 60 St" to="E 86 St" mph={5.4} sched={7.8} rh={11820} hours={SAMPLE_HOURS_HEAVY} tall>
              <TreatmentIconStrip treatments={SAMPLE_M15_TREATMENTS} />
            </MockSegRow>
            <MockSegRow from="125 St"  to="138 St"  mph={6.8} sched={8.2} rh={8120}  hours={SAMPLE_HOURS_LIGHT} tall>
              <TreatmentIconStrip treatments={SAMPLE_GAP_TREATMENTS} />
            </MockSegRow>
            <MockSegRow from="14 St"   to="23 St"   mph={7.4} sched={8.0} rh={9610}  hours={SAMPLE_HOURS_LIGHT} tall>
              <TreatmentIconStrip treatments={SAMPLE_HEAVY_TREATMENTS} />
            </MockSegRow>
          </div>
        </INT_Variant>

        {/* E2 — Glyph + label chips */}
        <INT_Variant
          label="E2 · Glyph + label chips"
          sub="best for public-facing surfaces and cards"
        >
          <div style={{ fontSize: 11.5, color: BPI.ink70, lineHeight: 1.5, maxWidth: 820 }}>
            Each present treatment becomes a small pill with its glyph on the left and full label on the right.
            No acronym ambiguity; states render as filled / outlined / dashed pills. Wraps cleanly when room is
            tight; the <span className="mono">+N</span> chip absorbs the overflow.
          </div>
          <div style={{ background: BPI.paper, borderRadius: 3, boxShadow: `inset 0 0 0 1px ${BPI.rule}` }}>
            <MockHeader />
            <MockSegRow from="E 28 St" to="E 58 St" mph={4.2} sched={7.1} rh={18420} hours={SAMPLE_HOURS_HEAVY} accent tall>
              <TreatmentChipStack treatments={SAMPLE_MADISON_TREATMENTS} max={4} align="flex-end" />
            </MockSegRow>
            <MockSegRow from="E 60 St" to="E 86 St" mph={5.4} sched={7.8} rh={11820} hours={SAMPLE_HOURS_HEAVY} tall>
              <TreatmentChipStack treatments={SAMPLE_M15_TREATMENTS} max={4} align="flex-end" />
            </MockSegRow>
            <MockSegRow from="125 St"  to="138 St"  mph={6.8} sched={8.2} rh={8120}  hours={SAMPLE_HOURS_LIGHT} tall>
              <TreatmentChipStack treatments={SAMPLE_GAP_TREATMENTS} max={4} align="flex-end" />
            </MockSegRow>
            <MockSegRow from="14 St"   to="23 St"   mph={7.4} sched={8.0} rh={9610}  hours={SAMPLE_HOURS_LIGHT} tall>
              <TreatmentChipStack treatments={SAMPLE_HEAVY_TREATMENTS} max={4} align="flex-end" />
            </MockSegRow>
          </div>
        </INT_Variant>

        {/* E3 — Icon-only row (densest) */}
        <INT_Variant
          label="E3 · Icons only, no labels"
          sub="densest — for ultra-tight rows; hover for label"
        >
          <div style={{ fontSize: 11.5, color: BPI.ink70, lineHeight: 1.5, maxWidth: 820 }}>
            All present treatments as glyphs, no captions. Most visually scannable when comparing many segments
            in one column. Relies on glyph recognition; cap at six visible icons with <span className="mono">+N</span>
            for the rest.
          </div>
          <div style={{ background: BPI.paper, borderRadius: 3, boxShadow: `inset 0 0 0 1px ${BPI.rule}` }}>
            <MockHeader />
            <MockSegRow from="E 28 St" to="E 58 St" mph={4.2} sched={7.1} rh={18420} hours={SAMPLE_HOURS_HEAVY} accent>
              <TreatmentIconRow treatments={SAMPLE_MADISON_TREATMENTS} max={6} />
            </MockSegRow>
            <MockSegRow from="E 60 St" to="E 86 St" mph={5.4} sched={7.8} rh={11820} hours={SAMPLE_HOURS_HEAVY}>
              <TreatmentIconRow treatments={SAMPLE_M15_TREATMENTS} max={6} />
            </MockSegRow>
            <MockSegRow from="125 St"  to="138 St"  mph={6.8} sched={8.2} rh={8120}  hours={SAMPLE_HOURS_LIGHT}>
              <TreatmentIconRow treatments={SAMPLE_GAP_TREATMENTS} max={6} />
            </MockSegRow>
            <MockSegRow from="14 St"   to="23 St"   mph={7.4} sched={8.0} rh={9610}  hours={SAMPLE_HOURS_LIGHT}>
              <TreatmentIconRow treatments={SAMPLE_HEAVY_TREATMENTS} max={6} />
            </MockSegRow>
          </div>
        </INT_Variant>

        <div style={{
          padding: '14px 18px', background: BPI.paperDeep, borderRadius: 3,
          fontSize: 12, color: BPI.ink70, lineHeight: 1.55,
        }}>
          <span style={{ fontFamily: BPIMono, fontWeight: 700, color: BPI.ink, letterSpacing: '0.04em' }}>
            RECOMMENDATION ·
          </span>{' '}
          <strong>E1</strong> as the new default analyst row — keeps the existing layout and slot model intact
          but every glyph is recognizable. <strong>E2</strong> on public-facing screens where horizontal room
          and named labels matter. <strong>E3</strong> for very tight contexts (search results, ladder rungs).
        </div>
      </div>
    </INT_Page>
  );
}


// ─────────────────────────────────────────────────────────────
// Section C — Compact display v1 (legacy bars/dots) for comparison
// ─────────────────────────────────────────────────────────────
function INT_CompactV1Legacy() {
  return (
    <INT_Page
      eyebrow="Interventions refactor · Reference"
      title="The bars/dots version — kept for comparison."
      sub="Same data, same row layout, same +N rule. Use this to A/B against v2."
    >
      <div style={{ background: BPI.card, borderRadius: 3, boxShadow: `0 0 0 1px ${BPI.rule}` }}>
        <MockHeader />
        <MockSegRow from="E 28 St" to="E 58 St" mph={4.2} sched={7.1} rh={18420} hours={SAMPLE_HOURS_HEAVY} accent>
          <TreatmentStrip treatments={SAMPLE_MADISON_TREATMENTS} />
        </MockSegRow>
        <MockSegRow from="E 60 St" to="E 86 St" mph={5.4} sched={7.8} rh={11820} hours={SAMPLE_HOURS_HEAVY}>
          <TreatmentStrip treatments={SAMPLE_M15_TREATMENTS} />
        </MockSegRow>
        <MockSegRow from="125 St"  to="138 St"  mph={6.8} sched={8.2} rh={8120}  hours={SAMPLE_HOURS_LIGHT}>
          <TreatmentStrip treatments={SAMPLE_GAP_TREATMENTS} />
        </MockSegRow>
        <MockSegRow from="14 St"   to="23 St"   mph={7.4} sched={8.0} rh={9610}  hours={SAMPLE_HOURS_LIGHT}>
          <TreatmentStrip treatments={SAMPLE_HEAVY_TREATMENTS} />
        </MockSegRow>
      </div>
    </INT_Page>
  );
}


// ─────────────────────────────────────────────────────────────
// Section D — Full detail (TreatmentInventory + Timeline)
// ─────────────────────────────────────────────────────────────
function INT_FullDetail() {
  return (
    <INT_Page
      eyebrow="Interventions refactor · Full detail"
      title="Family-grouped inventory + dated intervention timeline."
      sub="On the full route / segment detail surface, we drop the three-card grid. Treatments are listed by family with explicit state and evaluation labels; the timeline shows dated, source-backed milestones — separate axis from “what's there today.”"
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 24 }}>
        <div>
          <H title="Current treatments"
             sub="M15 SBS — grouped by family. State labels are explicit."
             right={<TreatmentIconStrip treatments={SAMPLE_M15_TREATMENTS} align="flex-end" />} />
          <TreatmentInventory treatments={SAMPLE_M15_TREATMENTS} scope="route" />
        </div>
        <div>
          <H title="Intervention history" sub="Dated, source-backed events. Separate axis from current state." />
          <div style={{ padding: '18px 22px', background: BPI.card, borderRadius: 3, boxShadow: `0 0 0 1px ${BPI.rule}` }}>
            <InterventionTimeline events={SAMPLE_M15_INTERVENTIONS} />
          </div>

          <div style={{ marginTop: 20 }}>
            <H title="Source gaps" sub="What we don't have, named explicitly." />
            <div style={{
              padding: '14px 18px', background: BPI.card, borderRadius: 3,
              boxShadow: `0 0 0 1px ${BPI.rule}`,
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              {[
                { name: 'Per-segment ACE violation counts', body: 'Aggregated only to route-level. Segment-level attribution not possible from current feed.' },
                { name: 'Current TSP inventory',             body: 'No live NYCDOT inventory of TSP-equipped intersections; treatment marked source_gap where applicable.' },
                { name: 'Stop-level boardings',              body: 'Hourly ridership is route × hour, not stop × hour. Stop figures are modeled.' },
              ].map((g, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 6, height: 6, borderRadius: 3, background: BPI.warn, marginTop: 7, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{g.name}</div>
                    <div style={{ fontSize: 11.5, color: BPI.ink70, marginTop: 2, lineHeight: 1.45 }}>{g.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </INT_Page>
  );
}


// ─────────────────────────────────────────────────────────────
// Section E — Taxonomy (families, treatments, states, scopes)
// ─────────────────────────────────────────────────────────────
function INT_Taxonomy() {
  return (
    <INT_Page
      eyebrow="Interventions refactor · Taxonomy"
      title="The full catalog, on one page."
      sub="Seven families, conservative state model. Compact UI uses the public label; detail drawers keep the exact source-system label where it differs."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18 }}>
        {FAMILIES.map(fam => {
          const items = Object.entries(TREATMENTS).filter(([_, t]) => t.family === fam.id);
          return (
            <div key={fam.id} style={{
              padding: '16px 18px', background: BPI.card, borderRadius: 3,
              boxShadow: `0 0 0 1px ${BPI.rule}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.005em' }}>{fam.label}</div>
                <div style={{ fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono, letterSpacing: '0.04em' }}>
                  family · {fam.id}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {items.map(([key, t]) => (
                  <div key={key} style={{
                    display: 'grid', gridTemplateColumns: '24px 1fr auto',
                    gap: 10, alignItems: 'center',
                    padding: '4px 0',
                    boxShadow: `inset 0 -1px 0 ${BPI.ink06}`,
                  }}>
                    <TreatmentIcon type={key} state="active" size={20} />
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 500 }}>{t.label}</span>
                      <span className="mono" style={{ fontSize: 10, color: BPI.ink40 }}>{key}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {t.scopes.map(s => (
                        <span key={s} style={{
                          fontSize: 9.5, fontFamily: BPIMono, color: BPI.ink55,
                          padding: '1px 5px', borderRadius: 2,
                          boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
                          letterSpacing: '0.04em', textTransform: 'uppercase',
                        }}>{s}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* State legend */}
      <div style={{ marginTop: 24 }}>
        <H title="States" sub="The presence vocabulary used by every treatment." />
        <div style={{
          padding: '16px 18px', background: BPI.card, borderRadius: 3,
          boxShadow: `0 0 0 1px ${BPI.rule}`,
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
        }}>
          {Object.entries(STATES).map(([key, st]) => {
            const c = toneColors(st.tone);
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 9, height: 9, borderRadius: 5,
                  background: st.present ? c.fg : 'transparent',
                  boxShadow: st.present
                    ? 'none'
                    : `inset 0 0 0 1.2px ${st.tone === 'gap' ? BPI.warn : BPI.ink20}`,
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{st.label}</div>
                  <div style={{ fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono }}>{key}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Evaluation legend */}
      <div style={{ marginTop: 20 }}>
        <H title="Evaluation states" sub="A separate axis — independent of presence." />
        <div style={{
          padding: '16px 18px', background: BPI.card, borderRadius: 3,
          boxShadow: `0 0 0 1px ${BPI.rule}`,
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
        }}>
          {Object.entries(EVAL_STATES).map(([key, ev]) => {
            const c = toneColors(ev.tone);
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  fontSize: 9.5, fontFamily: BPIMono, fontWeight: 700,
                  color: c.ink, background: c.bg,
                  padding: '2px 6px', borderRadius: 2, letterSpacing: '0.04em',
                  flexShrink: 0,
                }}>{ev.label}</span>
                <span style={{ fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono }}>{key}</span>
              </div>
            );
          })}
        </div>
      </div>
    </INT_Page>
  );
}


// Legacy alias — keep the old export so index.html doesn't break.
const INT_CompactVariations = INT_CompactV1Legacy;


// ─────────────────────────────────────────────────────────────
// Section F — Badge specimens
// Every treatment as a typographic badge. No drawings, no SVG shapes —
// just a code in a rounded rect, like a route bullet.
// ─────────────────────────────────────────────────────────────
function INT_BadgeSpecimens() {
  const families = FAMILIES.map(fam => ({
    ...fam,
    items: Object.entries(TREATMENTS)
      .filter(([_, t]) => t.family === fam.id)
      .map(([type, def]) => ({ type, def })),
  })).filter(f => f.items.length > 0);

  return (
    <INT_Page
      eyebrow="Interventions refactor · Badge primitives"
      title="Codes, not illustrations."
      sub={
        <>
          Every treatment renders as a small typographic badge — same visual class as our route bullets.
          A 2–3 character monospace mark in a rounded rect; state encoded by fill / dash / border.
          Tabular numerals lock width so a row of badges aligns into a grid automatically.
        </>
      }
    >
      {/* Size scale */}
      <div style={{
        padding: '16px 22px', background: BPI.card, borderRadius: 3,
        boxShadow: `0 0 0 1px ${BPI.rule}`, marginBottom: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 11.5, color: BPI.ink55, fontFamily: BPIMono, letterSpacing: '0.06em', fontWeight: 700, textTransform: 'uppercase' }}>
            Size scale
          </div>
          {['xs', 'sm', 'md', 'lg'].map(sz => (
            <div key={sz} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <TreatmentBadge type="bus_lane" size={sz} />
              <TreatmentBadge type="ace"      size={sz} />
              <TreatmentBadge type="tsp"      size={sz} />
              <TreatmentBadge type="shelter_rtpi" size={sz} />
              <span style={{ marginLeft: 4, fontSize: 10, color: BPI.ink55, fontFamily: BPIMono, letterSpacing: '0.04em' }}>{sz}</span>
            </div>
          ))}
        </div>
      </div>

      {/* All badges by family */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {families.map(fam => (
          <div key={fam.id} style={{
            padding: '16px 22px', background: BPI.card, borderRadius: 3,
            boxShadow: `0 0 0 1px ${BPI.rule}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.005em' }}>{fam.label}</div>
              <div style={{ fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono, letterSpacing: '0.04em' }}>
                family · {fam.id}
              </div>
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 12,
            }}>
              {fam.items.map(({ type, def }) => (
                <div key={type} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px', borderRadius: 2, background: BPI.paper,
                }}>
                  <TreatmentBadge type={type} size="md" />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>{def.label}</div>
                    <div style={{ fontSize: 9.5, color: BPI.ink40, fontFamily: BPIMono, marginTop: 2 }}>{type}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* State variants — show one treatment in every state */}
      <div style={{ marginTop: 18 }}>
        <H title="State variants" sub="Each badge across the full state vocabulary." />
        <div style={{
          padding: '18px 22px', background: BPI.card, borderRadius: 3,
          boxShadow: `0 0 0 1px ${BPI.rule}`,
        }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '120px repeat(8, 1fr)',
            gap: 14, alignItems: 'center',
          }}>
            <div />
            {['active', 'pilot', 'planned', 'proposed', 'future', 'historical_context', 'source_gap', 'unknown'].map(s => (
              <div key={s} style={{ fontSize: 10, color: BPI.ink55, fontFamily: BPIMono,
                letterSpacing: '0.04em', textTransform: 'uppercase', textAlign: 'center',
              }}>{s === 'historical_context' ? 'hist.' : s === 'source_gap' ? 'src gap' : s}</div>
            ))}
            {[
              { type: 'bus_lane',       label: 'Bus lane' },
              { type: 'ace',            label: 'ACE' },
              { type: 'tsp',            label: 'TSP' },
              { type: 'queue_jump',     label: 'Queue jump' },
              { type: 'stop_consolidation', label: 'Stop consolid.' },
              { type: 'capital_milestone',  label: 'Capital m.' },
            ].map(row => (
              <React.Fragment key={row.type}>
                <div style={{ fontSize: 12, fontWeight: 500 }}>{row.label}</div>
                {['active', 'pilot', 'planned', 'proposed', 'future', 'historical_context', 'source_gap', 'unknown'].map(s => (
                  <div key={s} style={{ display: 'flex', justifyContent: 'center' }}>
                    <TreatmentBadge type={row.type} state={s} size="md" />
                  </div>
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Family tone — optional accent coloring */}
      <div style={{ marginTop: 18 }}>
        <H title="Family tone (optional)"
           sub="Default is ink. Enforcement uses accent, Curb uses warn — pull on this if a row needs to read 'enforcement is the missing piece' at a glance." />
        <div style={{
          padding: '16px 22px', background: BPI.card, borderRadius: 3,
          boxShadow: `0 0 0 1px ${BPI.rule}`,
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TreatmentBadge type="bus_lane" tone="family" />
            <span style={{ fontSize: 11.5, color: BPI.ink70 }}>street · ink</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TreatmentBadge type="ace" tone="family" />
            <span style={{ fontSize: 11.5, color: BPI.ink70 }}>enf · accent</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TreatmentBadge type="tsp" tone="family" />
            <span style={{ fontSize: 11.5, color: BPI.ink70 }}>sig · ink</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TreatmentBadge type="daylighting" tone="family" />
            <span style={{ fontSize: 11.5, color: BPI.ink70 }}>curb · warn</span>
          </div>
        </div>
      </div>
    </INT_Page>
  );
}


// ─────────────────────────────────────────────────────────────
// Section G — Compact display v3 (badge-based)
// ─────────────────────────────────────────────────────────────
function INT_CompactV3() {
  return (
    <INT_Page
      eyebrow="Interventions refactor · Compact display v3"
      title="Three visible signals, then +N — with code badges."
      sub={
        <>
          Same structural rule as v2: <strong>Street · Enforcement · Signals</strong> in three slots, plus a <span className="mono">+N</span> chip
          for overflow. The slot now holds a typographic badge instead of a drawing. Three layout variations on the same data.
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* G1 — Family-slotted badges */}
        <INT_Variant
          label="G1 · Badge slots + family caption"
          sub="recommended canonical row — drops the bar/dot strip"
        >
          <div style={{ fontSize: 11.5, color: BPI.ink70, lineHeight: 1.5, maxWidth: 820 }}>
            Three badges in fixed family order, with the family short name underneath. Headline treatment per
            family. Empty family slots are dashed placeholder marks, so the row keeps its rhythm and you can tell
            "Enforcement is missing" at a glance.
          </div>
          <div style={{ background: BPI.paper, borderRadius: 3, boxShadow: `inset 0 0 0 1px ${BPI.rule}` }}>
            <MockHeader />
            <MockSegRow from="E 28 St" to="E 58 St" mph={4.2} sched={7.1} rh={18420} hours={SAMPLE_HOURS_HEAVY} accent tall>
              <TreatmentBadgeStrip treatments={SAMPLE_MADISON_TREATMENTS} />
            </MockSegRow>
            <MockSegRow from="E 60 St" to="E 86 St" mph={5.4} sched={7.8} rh={11820} hours={SAMPLE_HOURS_HEAVY} tall>
              <TreatmentBadgeStrip treatments={SAMPLE_M15_TREATMENTS} />
            </MockSegRow>
            <MockSegRow from="125 St"  to="138 St"  mph={6.8} sched={8.2} rh={8120}  hours={SAMPLE_HOURS_LIGHT} tall>
              <TreatmentBadgeStrip treatments={SAMPLE_GAP_TREATMENTS} />
            </MockSegRow>
            <MockSegRow from="14 St"   to="23 St"   mph={7.4} sched={8.0} rh={9610}  hours={SAMPLE_HOURS_LIGHT} tall>
              <TreatmentBadgeStrip treatments={SAMPLE_HEAVY_TREATMENTS} />
            </MockSegRow>
          </div>
        </INT_Variant>

        {/* G2 — Badge row, all present */}
        <INT_Variant
          label="G2 · Badge row · all present treatments"
          sub="enumerate everything that's installed, sorted by family"
        >
          <div style={{ fontSize: 11.5, color: BPI.ink70, lineHeight: 1.5, maxWidth: 820 }}>
            Every present treatment as its own badge, in family order. Caps at six visible with{' '}
            <span className="mono">+N</span> overflow. Densest reading; useful when the user needs to compare full
            treatment stacks across rows.
          </div>
          <div style={{ background: BPI.paper, borderRadius: 3, boxShadow: `inset 0 0 0 1px ${BPI.rule}` }}>
            <MockHeader />
            <MockSegRow from="E 28 St" to="E 58 St" mph={4.2} sched={7.1} rh={18420} hours={SAMPLE_HOURS_HEAVY} accent>
              <TreatmentBadgeRow treatments={SAMPLE_MADISON_TREATMENTS} max={6} />
            </MockSegRow>
            <MockSegRow from="E 60 St" to="E 86 St" mph={5.4} sched={7.8} rh={11820} hours={SAMPLE_HOURS_HEAVY}>
              <TreatmentBadgeRow treatments={SAMPLE_M15_TREATMENTS} max={6} />
            </MockSegRow>
            <MockSegRow from="125 St"  to="138 St"  mph={6.8} sched={8.2} rh={8120}  hours={SAMPLE_HOURS_LIGHT}>
              <TreatmentBadgeRow treatments={SAMPLE_GAP_TREATMENTS} max={6} />
            </MockSegRow>
            <MockSegRow from="14 St"   to="23 St"   mph={7.4} sched={8.0} rh={9610}  hours={SAMPLE_HOURS_LIGHT}>
              <TreatmentBadgeRow treatments={SAMPLE_HEAVY_TREATMENTS} max={6} />
            </MockSegRow>
          </div>
        </INT_Variant>

        {/* G3 — Badge + label chip */}
        <INT_Variant
          label="G3 · Badge + label combo"
          sub="public-facing layouts and cards"
        >
          <div style={{ fontSize: 11.5, color: BPI.ink70, lineHeight: 1.5, maxWidth: 820 }}>
            Each treatment appears as <span className="mono">[BADGE] Label</span> — most information per row.
            Best on screens where horizontal room exists. Useful in route overview cards, brief evidence rails,
            public route detail pages.
          </div>
          <div style={{
            background: BPI.paper, borderRadius: 3, boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
            padding: '18px 22px',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 18, alignItems: 'center', paddingBottom: 12 }}>
              <div>
                <DirIndicator dir="NB" />
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>Madison · 28→58 St</div>
                <div style={{ fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono, letterSpacing: '0.04em' }}>top hotspot</div>
              </div>
              <TreatmentBadgeChipStack treatments={SAMPLE_MADISON_TREATMENTS} max={4} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 18, alignItems: 'center', padding: '12px 0', borderTop: `1px solid ${BPI.ink06}` }}>
              <div>
                <DirIndicator dir="NB" />
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>M15 · 60→86 St</div>
                <div style={{ fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono, letterSpacing: '0.04em' }}>typical</div>
              </div>
              <TreatmentBadgeChipStack treatments={SAMPLE_M15_TREATMENTS} max={4} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 18, alignItems: 'center', padding: '12px 0 0', borderTop: `1px solid ${BPI.ink06}` }}>
              <div>
                <DirIndicator dir="NB" />
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>14 → 23 St</div>
                <div style={{ fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono, letterSpacing: '0.04em' }}>fully treated</div>
              </div>
              <TreatmentBadgeChipStack treatments={SAMPLE_HEAVY_TREATMENTS} max={4} />
            </div>
          </div>
        </INT_Variant>

        <div style={{
          padding: '14px 18px', background: BPI.paperDeep, borderRadius: 3,
          fontSize: 12, color: BPI.ink70, lineHeight: 1.55,
        }}>
          <span style={{ fontFamily: BPIMono, fontWeight: 700, color: BPI.ink, letterSpacing: '0.04em' }}>
            RECOMMENDATION ·
          </span>{' '}
          <strong>G1</strong> as the new default analyst row (slot model intact, codes replace drawings).
          <strong> G3</strong> on public-facing surfaces and brief cards. <strong>G2</strong> for power-user
          views where the full treatment stack must be visible at once.
        </div>
      </div>
    </INT_Page>
  );
}

Object.assign(window, {
  INT_GlyphSpecimens, INT_CompactV2, INT_CompactV1Legacy,
  INT_BadgeSpecimens, INT_CompactV3,
  INT_CompactVariations, INT_FullDetail, INT_Taxonomy,
  SAMPLE_M15_TREATMENTS, SAMPLE_MADISON_TREATMENTS, SAMPLE_GAP_TREATMENTS,
  SAMPLE_HEAVY_TREATMENTS, SAMPLE_M15_INTERVENTIONS,
});
