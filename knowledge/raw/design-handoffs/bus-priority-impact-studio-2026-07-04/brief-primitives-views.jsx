// brief-primitives-views.jsx — Catalog + sample brief using the new
// primitives in brief-primitives.jsx.
//
//   <BriefPrimitivesCatalog />  — specimen page, every primitive shown
//                                 in isolation with a use note.
//   <RF_BriefRich />            — the M15 brief, re-rendered using the
//                                 new primitives inline in real prose
//                                 so the reader can see how they
//                                 compose.

const BPRIM_W = 1320;

// Shared specimen frame — one row per primitive. Left = title + note,
// right = the rendered specimen at real scale.
function Specimen({ id, name, kind, note, children }) {
  return (
    <div id={id} style={{
      display: 'grid', gridTemplateColumns: '280px 1fr', gap: 36,
      padding: '32px 0',
      boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{
            fontFamily: BPIMono, fontSize: 10.5, fontWeight: 700,
            color: BPI.accent, background: BPI.accentBg,
            padding: '2px 7px', borderRadius: 2, letterSpacing: '0.06em',
          }}>{kind}</span>
        </div>
        <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.015em', color: BPI.ink, marginBottom: 8, fontFamily: BPIMono }}>
          {name}
        </div>
        <div style={{ fontSize: 12.5, color: BPI.ink70, lineHeight: 1.55, textWrap: 'pretty' }}>
          {note}
        </div>
      </div>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Catalog
// ─────────────────────────────────────────────────────────────
function BriefPrimitivesCatalog() {
  // Specimen data
  const madisonSpark = [7.6, 7.4, 7.1, 6.9, 6.8, 6.7, 6.4, 6.2, 6.1, 5.9, 5.8, 5.6, 5.4, 5.2];
  const hourPattern = [
    8.6, 9.1, 9.4, 9.2, 8.8, 8.1, 7.0, 5.8, 4.8, 4.4, 4.9, 5.4,
    5.6, 5.5, 5.4, 5.1, 4.6, 4.2, 4.1, 4.5, 5.8, 6.7, 7.4, 8.2,
  ];
  return (
    <div className="bpi" style={{
      width: BPRIM_W, minHeight: 3000, background: BPI.paper,
      display: 'flex', flexDirection: 'column',
    }}>
      <StudioBar active="Briefs" breadcrumb="Briefs / primitives — v2 specimen" />

      {/* Hero */}
      <div style={{ padding: '56px 64px 36px', background: BPI.card, boxShadow: `inset 0 -1px 0 ${BPI.rule}` }}>
        <div className="eyebrow" style={{ marginBottom: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: BPI.ink55 }}>
          Brief composition · primitives v2
        </div>
        <h1 style={{
          margin: 0, fontSize: 38, fontWeight: 600, letterSpacing: '-0.025em',
          lineHeight: 1.1, color: BPI.ink, maxWidth: 880, textWrap: 'balance',
        }}>
          Things a paragraph can carry.
        </h1>
        <div style={{
          fontSize: 16, color: BPI.ink70, marginTop: 18,
          maxWidth: 760, lineHeight: 1.55, textWrap: 'pretty',
        }}>
          Two layers of new pieces for brief authoring. <b style={{ color: BPI.ink }}>Inline primitives</b> sit
          inside running text and let a sentence carry a route badge, a sparkline, an evidence ID, a metric with
          its delta. <b style={{ color: BPI.ink }}>Embedded primitives</b> break the prose like a figure: segment
          cards, before/after panels, projections, data-lineage panels, AI-surfaced findings. Each one shows up
          below, in isolation, with a note about when to reach for it.
        </div>
        <div style={{ display: 'flex', gap: 24, marginTop: 28, fontSize: 12, fontFamily: BPIMono, color: BPI.ink55 }}>
          <span>14 primitives</span>
          <span style={{ color: BPI.ink20 }}>·</span>
          <span><span style={{ color: BPI.accent, fontWeight: 700 }}>5</span> inline</span>
          <span style={{ color: BPI.ink20 }}>·</span>
          <span><span style={{ color: BPI.accent, fontWeight: 700 }}>9</span> embedded</span>
          <span style={{ color: BPI.ink20 }}>·</span>
          <span>see RF_BriefRich for these in context</span>
        </div>
      </div>

      <div style={{ padding: '24px 64px 64px' }}>

        {/* ── SECTION: INLINE ─────────────────────────────────── */}
        <div style={{ padding: '36px 0 8px' }}>
          <div className="eyebrow" style={{ color: BPI.accent, marginBottom: 8 }}>Layer 1 — inline</div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }}>
            Chips that sit inside a sentence.
          </h2>
          <div style={{ fontSize: 13.5, color: BPI.ink70, marginTop: 8, maxWidth: 680, lineHeight: 1.55 }}>
            These primitives are designed to be used inline within prose. They wrap with the surrounding text,
            stay legible at body type size, and carry one or two data points each — the reader can interrogate
            them on hover without leaving the paragraph.
          </div>
        </div>

        <Specimen
          name="InlineRoute"
          kind="INLINE"
          note="Use when a sentence's subject is a specific route and you want the reader to see both the route identity and the current value attached to it without breaking flow."
        >
          <div style={{ fontSize: 15, lineHeight: 1.8, color: BPI.ink, maxWidth: 720 }}>
            The slowest Manhattan SBS is <InlineRoute route="M15" sbs value="6.3" unit="mph" tone="bad" cite={1} />,
            followed at some distance by <InlineRoute route="M14A" sbs value="7.2" unit="mph" tone="warn" /> and{' '}
            <InlineRoute route="M14D" sbs value="7.4" unit="mph" />. Cohort median is{' '}
            <InlineRoute route="Bx12" sbs value="8.9" unit="mph" tone="good" />.
          </div>
        </Specimen>

        <Specimen
          name="InlineSegment"
          kind="INLINE"
          note="A pointer to a specific named segment of a route. Carries a 14-day sparkline so the reader sees the trend without losing the sentence. Click jumps to the segment in route detail."
        >
          <div style={{ fontSize: 15, lineHeight: 1.8, color: BPI.ink, maxWidth: 720 }}>
            The slowdown is concentrated on{' '}
            <InlineSegment name="Madison Av · 28→58 St" dir="NB" spark={madisonSpark} mph={5.2} cite={5} />,
            with secondary effects on{' '}
            <InlineSegment name="2 Av · 60→42 St" dir="SB" spark={[7.2, 7.0, 6.8, 6.7, 6.7, 6.6, 6.4]} mph={6.4} />.
            The remaining eleven segments show no clear trend.
          </div>
        </Specimen>

        <Specimen
          name="InlineMetric"
          kind="INLINE"
          note="A number with its scale and (optionally) its change. Replaces awkward parenthetical units. Color-coded by tone but kept restrained — the unit and delta are always quieter than the number."
        >
          <div style={{ fontSize: 15, lineHeight: 1.8, color: BPI.ink, maxWidth: 720 }}>
            Weighted speed has fallen to <InlineMetric value="6.3" unit="mph" delta="−1.6" deltaUnit="mph" tone="bad" cite={1} />{' '}
            over fourteen months, while ACE violations on the same window dropped{' '}
            <InlineMetric value="−68" unit="%" tone="good" cite={3} />. Rider-hours of delay grew to{' '}
            <InlineMetric value="4,310" unit="RH/day" delta="+22" deltaUnit="%" tone="warn" />.
          </div>
        </Specimen>

        <Specimen
          name="InlineSource"
          kind="INLINE"
          note="A stable evidence-catalog ID inlined into a sentence. Hover shows the dataset and retrieval timestamp; click opens the catalog. Lets a reader audit a number without breaking the paragraph."
        >
          <div style={{ fontSize: 15, lineHeight: 1.8, color: BPI.ink, maxWidth: 720 }}>
            Segment-level speed data comes from <InlineSource id="EV-1041" src="MTA Bus Speeds, segment-month" retrieved="2026-05-10" />.
            ACE violation series is <InlineSource id="EV-1043" />. The cohort baseline is computed in studio
            projection <InlineSource id="EV-1047" />, with the M14A and Bx12 lane-upgrade evaluations attached as{' '}
            <InlineSource id="EV-1048" /> and <InlineSource id="EV-1049" />.
          </div>
        </Specimen>

        <Specimen
          name="InlineTag"
          kind="INLINE"
          note="A short-form annotation for terms that recur in the brief glossary. Subtle by default; tone-color variants let an author flag the term as definitional, contested, or methodologically loaded."
        >
          <div style={{ fontSize: 15, lineHeight: 1.8, color: BPI.ink, maxWidth: 720 }}>
            We use <InlineTag>observed bus travel speed</InlineTag> throughout, which includes dwell time at stops,
            signal cycles, and traffic. The <InlineTag tone="warn">treatment stack</InlineTag> on a segment is the
            count of priority interventions in place. Speeds below scheduled trigger a{' '}
            <InlineTag tone="warn">delay event</InlineTag>, which we aggregate to{' '}
            <InlineTag tone="good">rider-hours lost</InlineTag>.
          </div>
        </Specimen>

        {/* ── SECTION: EMBEDDED ───────────────────────────────── */}
        <div style={{ padding: '52px 0 8px' }}>
          <div className="eyebrow" style={{ color: BPI.accent, marginBottom: 8 }}>Layer 2 — embedded</div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }}>
            Figures that break the prose.
          </h2>
          <div style={{ fontSize: 13.5, color: BPI.ink70, marginTop: 8, maxWidth: 680, lineHeight: 1.55 }}>
            Each one is a block-level &lt;figure&gt; that interrupts the reading flow the way an image or chart
            would in a newspaper feature. They're self-contained — caption, source, value, and any caveats live
            inside the card — so the surrounding paragraph doesn't have to do the explaining.
          </div>
        </div>

        <Specimen
          name="EmbedSegmentCard"
          kind="EMBED"
          note="Lifts a single segment out of route detail into a brief-sized card. Carries observed vs. scheduled speed, treatment glyphs, a 14-day sparkline, and rider-hour exposure. Use when one segment is the subject of a paragraph."
        >
          <EmbedSegmentCard
            route="M15" sbs dir="NB"
            from="Madison Av / E 28 St"
            to="Madison Av / E 58 St"
            mph={5.2} sched={7.4}
            spark={madisonSpark}
            lane="partial" ace ace tsp={false}
            riderHours={18420}
            note="Slowest 1.5 miles of any Select Bus route in the city. Painted lane only — no concrete buffer."
          />
        </Specimen>

        <Specimen
          name="EmbedBeforeAfter"
          kind="EMBED"
          note="A self-contained intervention figure. Stronger than the bare BeforeAfter primitive because it carries the intervention's name, dates, magnitude of change, and caveat in a single block — readable without context."
        >
          <EmbedBeforeAfter
            intervention="ACE all-day camera enforcement"
            when="rolled out May 2025"
            unit="mph"
            before={{ v: 6.1, label: 'Before (Mar 2025)', sub: 'PM-peak, ACE-monitored segments' }}
            after={{ v: 6.8, label: 'After (Apr 2026)', sub: '11 months post-rollout' }}
            delta="+0.7 mph"
            caveat="Window overlaps Manhattan congestion pricing (Jan 5, 2025). Attribution to ACE alone is not claimed."
            citeBefore={3} citeAfter={3}
          />
        </Specimen>

        <Specimen
          name="EmbedProjection"
          kind="EMBED"
          note="A what-if card. Each row is a scenario with a bar drawn to a common scale; an optional target line shows the gap. Use for the closing 'so what' move in a brief — what would it take to recover the lost ground."
        >
          <EmbedProjection
            title="What would recover the corridor?"
            sub="Modeled gains for the Madison Av segment under three intervention scenarios, against the pre-decline speed of 7.4 mph."
            unit="mph"
            target={7.4}
            scenarios={[
              { label: 'Today', kind: 'current', v: 5.2, sub: 'Painted lane only, no concrete buffer.' },
              { label: 'Concrete-buffered lane (DOT capital plan)', v: 5.8, sub: 'Estimated 0.6 mph gain. Not enough to reach pre-decline.' },
              { label: '+ TSP at every signal on the segment', v: 6.4, sub: 'Compounded gain. Still short by 1.0 mph.' },
              { label: '+ Full Madison Av busway, southern half', v: 7.3, sub: 'Recovers within 0.1 mph of pre-decline. Trades parking, loading, geometry.' },
              { label: 'Pre-decline target', kind: 'target', v: 7.4, sub: '14-month average prior to decline.' },
            ]}
          />
        </Specimen>

        <Specimen
          name="EmbedDataLineage"
          kind="EMBED"
          note="Provenance card. Drops the projection ƒ-of next to a surprising number — the source dataset, the steps to derive the value, the retrieval timestamp, and the row count. Signals the work."
        >
          <EmbedDataLineage
            metric="43% — Madison Av's share of route delay"
            source="MTA Bus Speeds, segment-month aggregate"
            rowCount="2.4M rows"
            retrieved="2026-05-10 09:42 ET"
            steps={[
              { op: "filter", detail: "route = 'M15+SBS' · weekday · Mar 2026" },
              { op: "join",   detail: "MTA Hourly Ridership on segment × hour window" },
              { op: "agg",    detail: "sum of (sched_time − observed_time) × riders per segment-hour" },
              { op: "ratio",  detail: "Madison segment RH-lost / route RH-lost = 18,420 / 42,890 = 0.4295" },
            ]}
          />
        </Specimen>

        <Specimen
          name="EmbedFinding"
          kind="EMBED"
          note="Pulls an AI-surfaced finding from the Findings feed into the brief inline, with the reasoning trail visible. Use sparingly — once or twice in a brief — and only when the finding is the point of the paragraph."
        >
          <EmbedFinding
            route="M15" sbs
            confidence={82}
            title="THE STACK IS NOT WORKING ON MADISON AV"
            claim="The two M15 segments with the densest priority stack are also the segments where speed is falling fastest year-over-year."
            supports={[
              'Both segments have 3 of 3 treatments (lane + ACE + TSP). The route average is 1.4 of 3.',
              'Δspeed Y/Y is −0.9 mph on the densest segments vs −0.4 mph route average.',
              'Pattern holds when restricted to PM-peak hours and to weekday-only windows.',
            ]}
          />
        </Specimen>

        <Specimen
          name="EmbedKeyTakeaways"
          kind="EMBED"
          note="A pull-out box for the three sentences a reader should leave with. Put it at the top of the body section after the deck, or at the end as a recap. Numbered so it reads as scaffolding, not bullet padding."
        >
          <EmbedKeyTakeaways
            title="Three things to leave with"
            items={[
              'The M15 SBS has lost 1.6 mph at evening rush over fourteen months — the steepest decline of any SBS route in NYC.',
              'Three corridor segments — all on the southern half of the route — account for 53% of the rider-hours lost.',
              'The two segments with the deepest treatment stack are slowing fastest. The toolkit is not reaching the cause.',
            ]}
          />
        </Specimen>

        <Specimen
          name="EmbedMentionedRoutes"
          kind="EMBED · RAIL"
          note="A right-rail card for every route the brief mentions. Each row shows a borough-colored badge, the route's short name, a sparkline of recent speed, and the current value with delta. Acts as the brief's quick-jump index."
        >
          <div style={{ maxWidth: 380 }}>
            <EmbedMentionedRoutes
              routes={[
                { route: 'M15',  sbs: true,  name: '1 Av / 2 Av SBS',       borough: 'Manhattan · 8.4 mi · 33 stops', mph: 6.3, delta: -1.6, spark: madisonSpark },
                { route: 'M14A', sbs: true,  name: '14 St crosstown SBS',   borough: 'Manhattan · 2.2 mi',           mph: 7.2, delta: 0.1,  spark: [6.9, 7.0, 7.1, 7.0, 7.2, 7.1, 7.2] },
                { route: 'Bx12', sbs: true,  name: 'Fordham Rd / Pelham',   borough: 'Bronx · 4.1 mi',               mph: 8.9, delta: 0.4,  spark: [8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.9] },
                { route: 'B41',  sbs: false, name: 'Flatbush Av (local)',   borough: 'Brooklyn · 9.2 mi',            mph: 7.1, delta: -0.2, spark: [7.4, 7.3, 7.3, 7.2, 7.2, 7.1, 7.1] },
              ]}
            />
          </div>
        </Specimen>

        <Specimen
          name="EmbedRichSubBrief"
          kind="EMBED"
          note="Multi-column themed card for sub-claims that share a frame. Divided by hairlines, not nested boxes; color-coded only on the labels — the way a printed table of contents marks sections. Use for tri-partite arguments."
        >
          <EmbedRichSubBrief
            title="What's on the M15 corridor, by section"
            sub="The route's priority stack varies by neighborhood. Three sub-claims share one frame."
            columns={[
              {
                label: 'Southern (Ferry → 14 St)',
                color: BPI.good,
                items: [
                  'Concrete-buffered lane the full length.',
                  'ACE enforcement, all-day since May 2025.',
                  'Speed within 0.3 mph of schedule.',
                ],
              },
              {
                label: 'Midtown (14 St → 60 St)',
                color: BPI.bad,
                items: [
                  'Painted lane only on Madison Av.',
                  'ACE patchy; TSP at four of nine signals.',
                  '53% of the route\u2019s rider-hours of delay.',
                ],
              },
              {
                label: 'Upper East (60 St → 126 St)',
                color: BPI.warn,
                items: [
                  'Painted lane plus TSP at every signal.',
                  'ACE enforcement since Aug 2024.',
                  'Speed has been stable for six months.',
                ],
              },
            ]}
          />
        </Specimen>

        <Specimen
          name="EmbedHourFigure"
          kind="EMBED"
          note="A 24-hour pattern figure with a caption. Useful when the time-of-day shape of the data is the point of the paragraph; the scheduled baseline is shown as a dashed accent line so the gap is visible at a glance."
        >
          <EmbedHourFigure
            caption="Madison Av · 28→58 St · NB — weekday mean speed by hour"
            data={hourPattern}
            sched={7.4}
            height={160}
          />
        </Specimen>

        <div style={{ padding: '36px 0', fontSize: 12, color: BPI.ink55, fontFamily: BPIMono, textAlign: 'center' }}>
          End of specimen catalog · 14 primitives · v2
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RF_BriefRich — sample brief reading view using the primitives
// inline in real prose.
// ─────────────────────────────────────────────────────────────
function RF_BriefRich() {
  const madisonSpark = [7.6, 7.4, 7.1, 6.9, 6.8, 6.7, 6.4, 6.2, 6.1, 5.9, 5.8, 5.6, 5.4, 5.2];
  const hourPattern = [
    8.6, 9.1, 9.4, 9.2, 8.8, 8.1, 7.0, 5.8, 4.8, 4.4, 4.9, 5.4,
    5.6, 5.5, 5.4, 5.1, 4.6, 4.2, 4.1, 4.5, 5.8, 6.7, 7.4, 8.2,
  ];
  return (
    <div className="bpi" style={{
      width: BPRIM_W, minHeight: 3400, background: BPI.paper,
      display: 'flex', flexDirection: 'column',
    }}>
      <StudioBar active="Briefs" breadcrumb="Briefs / Brief 023 · v2 reading view" />

      {/* Hero (smaller than the public-facing one — this is the reading view) */}
      <div style={{ padding: '48px 64px 32px', background: BPI.card, boxShadow: `inset 0 -1px 0 ${BPI.rule}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: BPIMono, fontSize: 11, fontWeight: 700,
            color: BPI.paper, background: BPI.ink,
            padding: '4px 9px', borderRadius: 2, letterSpacing: '0.08em',
          }}>BRIEF 023</span>
          <RouteBadge route="M15" sbs size="md" />
          <span style={{ fontSize: 12, color: BPI.ink55 }}>South Ferry ↔ E 126 St · Manhattan</span>
          <span style={{ width: 4, height: 4, borderRadius: 2, background: BPI.ink20 }} />
          <span style={{ fontSize: 12, color: BPI.ink55, fontFamily: BPIMono }}>Published May 12, 2026 · 11 min</span>
        </div>
        <h1 style={{
          margin: 0, fontSize: 42, fontWeight: 600, letterSpacing: '-0.028em',
          lineHeight: 1.08, color: BPI.ink, maxWidth: 980, textWrap: 'balance',
        }}>
          When the priority stack stops working: the M15 SBS, fifteen years in.
        </h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 36, padding: '36px 64px 56px', maxWidth: 1320 }}>

        {/* ── BODY ─────────────────────────────────────── */}
        <article style={{ minWidth: 0 }}>

          {/* Lede */}
          <p style={{
            fontSize: 17, lineHeight: 1.65, color: BPI.ink70,
            textWrap: 'pretty', marginTop: 0,
          }}>
            New York has spent more on the M15 SBS corridor than any other Select Bus route. Bus lanes cover
            three quarters of its mileage; ACE camera enforcement runs around the clock; signal priority is in
            place at four in ten intersections. Over the past fourteen months,{' '}
            <InlineRoute route="M15" sbs value="6.3" unit="mph" tone="bad" cite={1} /> has slowed down anyway —
            faster than any other comparable corridor in the city.
          </p>

          <EmbedKeyTakeaways
            title="Three things to leave with"
            items={[
              'The M15 SBS has lost 1.6 mph at evening rush over fourteen months — the steepest decline of any SBS route in NYC.',
              'Three corridor segments — all on the southern half of the route — account for 53% of the rider-hours lost.',
              'The two segments with the deepest treatment stack are slowing fastest. The toolkit is not reaching the cause.',
            ]}
          />

          <h2 style={{
            margin: '40px 0 14px', fontSize: 22, fontWeight: 600,
            letterSpacing: '-0.018em', color: BPI.ink, textWrap: 'balance',
          }}>
            01 · The slowdown is real and outside the cohort pattern.
          </h2>
          <p style={{ fontSize: 15.5, lineHeight: 1.7, color: BPI.ink70, textWrap: 'pretty', maxWidth: 820 }}>
            Evening-rush weighted speed on the M15 has fallen in thirteen of the last fourteen months. The drop
            totals <InlineMetric value="−1.6" unit="mph" tone="bad" cite={1} />, putting the route at the seventh
            percentile of NYC SBS corridors today. A Mann-Kendall trend test on the route's monthly mean returns
            p&nbsp;&lt;&nbsp;0.002 — the kind of one-direction trajectory you expect from a structural change, not
            random variation. The number is computed from{' '}
            <InlineSource id="EV-1041" src="MTA Bus Speeds, segment-month" retrieved="2026-05-10" />, with the
            cohort context joined in from <InlineSource id="EV-1047" />.
          </p>

          <EmbedDataLineage
            metric="−1.6 mph — M15 SBS evening-rush decline, 14 months"
            source="MTA Bus Speeds, segment-month aggregate"
            rowCount="2.4M rows"
            retrieved="2026-05-10 09:42 ET"
            steps={[
              { op: "filter", detail: "route = 'M15+SBS' · weekday · hour ∈ [16, 19]" },
              { op: "agg",    detail: "weighted mean of segment speeds by rider-hours per segment" },
              { op: "window", detail: "Mar 2025 baseline (7.9 mph) vs Apr 2026 latest (6.3 mph)" },
              { op: "test",   detail: "Mann-Kendall on monthly means · τ = −0.94 · p = 0.0019" },
            ]}
          />

          <p style={{ fontSize: 15.5, lineHeight: 1.7, color: BPI.ink70, textWrap: 'pretty', maxWidth: 820, marginTop: 24 }}>
            Comparable corridors with the same enforcement stack reversed the pattern within sixty days of program
            activation. <InlineRoute route="M14A" sbs value="7.2" unit="mph" /> and{' '}
            <InlineRoute route="Bx12" sbs value="8.9" unit="mph" tone="good" /> both held steady or improved over
            the same window. The M15 is one of two SBS corridors citywide that have continued to fall.
          </p>

          <h2 style={{
            margin: '48px 0 14px', fontSize: 22, fontWeight: 600,
            letterSpacing: '-0.018em', color: BPI.ink, textWrap: 'balance',
          }}>
            02 · Three corridors do most of the damage.
          </h2>
          <p style={{ fontSize: 15.5, lineHeight: 1.7, color: BPI.ink70, textWrap: 'pretty', maxWidth: 820 }}>
            Of the thirteen timepoint-to-timepoint segments the route traverses, three account for{' '}
            <InlineMetric value="53" unit="%" tone="warn" /> of measured rider-hours of delay per weekday. The
            worst of the three is on Madison Avenue, and it is also the slowest 1.5 miles of any Select Bus
            route in the city.
          </p>

          <EmbedSegmentCard
            route="M15" sbs dir="NB"
            from="Madison Av / E 28 St"
            to="Madison Av / E 58 St"
            mph={5.2} sched={7.4}
            spark={madisonSpark}
            lane="partial" ace ace tsp={false}
            riderHours={18420}
            note="Slowest 1.5 miles of any Select Bus route in the city. Painted lane only — no concrete buffer."
          />

          <p style={{ fontSize: 15.5, lineHeight: 1.7, color: BPI.ink70, textWrap: 'pretty', maxWidth: 820, marginTop: 4 }}>
            The hour-by-hour pattern on this segment makes the shape of the problem visible: speeds collapse from
            <InlineSegment name="Madison Av · 28→58 St" dir="NB" spark={madisonSpark} mph={5.2} /> around 9 AM and
            stay below scheduled pace for the full midday-through-evening window — eleven consecutive hours that
            sit at the 90th percentile of slowness route-wide.
          </p>

          <EmbedHourFigure
            caption="Madison Av · 28→58 St · NB — weekday mean speed by hour, vs scheduled"
            data={hourPattern}
            sched={7.4}
            height={160}
          />

          <h2 style={{
            margin: '48px 0 14px', fontSize: 22, fontWeight: 600,
            letterSpacing: '-0.018em', color: BPI.ink, textWrap: 'balance',
          }}>
            03 · Where the toolkit is densest, the slowdown is steepest.
          </h2>
          <p style={{ fontSize: 15.5, lineHeight: 1.7, color: BPI.ink70, textWrap: 'pretty', maxWidth: 820 }}>
            The intuition behind New York's bus-priority program is additive. Every layer —{' '}
            <InlineTag>bus lane</InlineTag>, <InlineTag>ACE enforcement</InlineTag>,{' '}
            <InlineTag>signal priority</InlineTag> — should compound the gain. On the M15 it does not. The two
            segments with the deepest stack of treatments are the segments where speed is falling fastest.
          </p>

          <EmbedFinding
            route="M15" sbs
            confidence={82}
            title="THE STACK IS NOT WORKING ON MADISON AV"
            claim="The two M15 segments with the densest priority stack are also the segments where speed is falling fastest year-over-year."
            supports={[
              'Both segments have 3 of 3 treatments (lane + ACE + TSP). The route average is 1.4 of 3.',
              'Δspeed Y/Y is −0.9 mph on the densest segments vs −0.4 mph route average.',
              'Pattern holds when restricted to PM-peak hours and to weekday-only windows.',
            ]}
          />

          <p style={{ fontSize: 15.5, lineHeight: 1.7, color: BPI.ink70, textWrap: 'pretty', maxWidth: 820, marginTop: 4 }}>
            This is <i>not</i> evidence that any one treatment failed. Each one made the corridor faster than it
            would have been without it. The pattern is consistent with a structural drag — congestion, construction,
            or signal-cycle pressure — that the toolkit was not designed to address.
          </p>

          <EmbedRichSubBrief
            title="What's on the M15 corridor, by section"
            sub="Priority stack varies by neighborhood. Three sub-claims share one frame."
            columns={[
              {
                label: 'Southern (Ferry → 14 St)', color: BPI.good,
                items: [
                  'Concrete-buffered lane the full length.',
                  'ACE enforcement, all-day since May 2025.',
                  'Speed within 0.3 mph of schedule.',
                ],
              },
              {
                label: 'Midtown (14 St → 60 St)', color: BPI.bad,
                items: [
                  'Painted lane only on Madison Av.',
                  'ACE patchy; TSP at four of nine signals.',
                  '53% of route\u2019s rider-hours of delay.',
                ],
              },
              {
                label: 'Upper East (60 St → 126 St)', color: BPI.warn,
                items: [
                  'Painted lane plus TSP at every signal.',
                  'ACE enforcement since Aug 2024.',
                  'Speed has been stable for six months.',
                ],
              },
            ]}
          />

          <h2 style={{
            margin: '48px 0 14px', fontSize: 22, fontWeight: 600,
            letterSpacing: '-0.018em', color: BPI.ink, textWrap: 'balance',
          }}>
            04 · ACE moved violations, but only some of the speed.
          </h2>
          <p style={{ fontSize: 15.5, lineHeight: 1.7, color: BPI.ink70, textWrap: 'pretty', maxWidth: 820 }}>
            The clearest gain we measure is on ACE-monitored segments after the all-day rollout. Violations fell
            <InlineMetric value="−68" unit="%" tone="good" cite={3} /> year-over-year on the enforced windows,
            and PM-peak speed rose modestly. The gain doesn't extend to Madison Avenue, where ACE coverage is
            partial.
          </p>

          <EmbedBeforeAfter
            intervention="ACE all-day camera enforcement"
            when="rolled out May 2025"
            unit="mph"
            before={{ v: 6.1, label: 'Before (Mar 2025)', sub: 'PM-peak, ACE-monitored segments' }}
            after={{ v: 6.8, label: 'After (Apr 2026)', sub: '11 months post-rollout' }}
            delta="+0.7 mph"
            caveat="Window overlaps Manhattan congestion pricing (Jan 5, 2025). Attribution to ACE alone is not claimed."
            citeBefore={3} citeAfter={3}
          />

          <h2 style={{
            margin: '48px 0 14px', fontSize: 22, fontWeight: 600,
            letterSpacing: '-0.018em', color: BPI.ink, textWrap: 'balance',
          }}>
            05 · What it would take to recover.
          </h2>
          <p style={{ fontSize: 15.5, lineHeight: 1.7, color: BPI.ink70, textWrap: 'pretty', maxWidth: 820 }}>
            If we model the gain Madison Av might see from a concrete-buffered upgrade — the most likely next
            intervention given current DOT capital plans — we estimate a recovery of 0.3 to 0.6 mph in the
            affected window. Back to roughly where the route stood a year ago, but not past it.
          </p>

          <EmbedProjection
            title="What would recover the Madison segment?"
            sub="Modeled gains under three intervention scenarios, against the 14-month pre-decline average."
            unit="mph"
            target={7.4}
            scenarios={[
              { label: 'Today', kind: 'current', v: 5.2, sub: 'Painted lane only, no concrete buffer.' },
              { label: 'Concrete-buffered lane (DOT capital plan)', v: 5.8, sub: 'Estimated 0.6 mph gain. Not enough to reach pre-decline.' },
              { label: '+ TSP at every signal on the segment', v: 6.4, sub: 'Compounded gain. Still short by 1.0 mph.' },
              { label: '+ Full Madison Av busway, southern half', v: 7.3, sub: 'Recovers within 0.1 mph of pre-decline. Trades parking, loading, geometry.' },
              { label: 'Pre-decline target', kind: 'target', v: 7.4, sub: '14-month average prior to decline.' },
            ]}
          />

          <p style={{ fontSize: 15.5, lineHeight: 1.7, color: BPI.ink70, textWrap: 'pretty', maxWidth: 820, marginTop: 8 }}>
            The deeper choice is structural: a continuous concrete-buffered lane down the southern half of the
            corridor, paired with TSP at every signal, and the parking, loading, and Vision Zero geometry tradeoffs
            that come with it. The current toolkit cannot reach the cause on its own.
          </p>

        </article>

        {/* ── RAIL ────────────────────────────────────── */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 18, position: 'sticky', top: 24, alignSelf: 'flex-start' }}>
          <EmbedMentionedRoutes
            routes={[
              { route: 'M15',  sbs: true,  name: '1 Av / 2 Av SBS',     borough: 'Manhattan · 8.4 mi', mph: 6.3, delta: -1.6, spark: madisonSpark },
              { route: 'M14A', sbs: true,  name: '14 St crosstown SBS', borough: 'Manhattan · 2.2 mi', mph: 7.2, delta:  0.1, spark: [6.9, 7.0, 7.1, 7.0, 7.2, 7.1, 7.2] },
              { route: 'Bx12', sbs: true,  name: 'Fordham Rd / Pelham', borough: 'Bronx · 4.1 mi',     mph: 8.9, delta:  0.4, spark: [8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.9] },
              { route: 'B41',  sbs: false, name: 'Flatbush Av (local)', borough: 'Brooklyn · 9.2 mi',  mph: 7.1, delta: -0.2, spark: [7.4, 7.3, 7.3, 7.2, 7.2, 7.1, 7.1] },
            ]}
          />
          <div style={{
            background: BPI.card, borderRadius: 4,
            boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
            padding: '16px 18px',
          }}>
            <div className="eyebrow" style={{ marginBottom: 12, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 10 }}>
              Evidence used
            </div>
            {[
              { id: 'EV-1041', src: 'MTA Bus Speeds (segment-month)' },
              { id: 'EV-1043', src: 'MTA ACE violations (segment-week)' },
              { id: 'EV-1044', src: 'NYC DOT bus-lane GIS (Q1 2026)' },
              { id: 'EV-1047', src: 'NYC SBS percentile-of-speed cohort' },
              { id: 'EV-1048', src: 'M14A 2023 lane-upgrade evaluation' },
              { id: 'EV-1049', src: 'Bx12 2022 lane-upgrade evaluation' },
            ].map((e, i, arr) => (
              <div key={e.id} style={{
                display: 'grid', gridTemplateColumns: '52px 1fr', gap: 10, alignItems: 'baseline',
                padding: '8px 0',
                boxShadow: i < arr.length - 1 ? `inset 0 -1px 0 ${BPI.rule}` : 'none',
                fontSize: 11.5,
              }}>
                <span className="num" style={{ fontFamily: BPIMono, color: BPI.accent, fontWeight: 700 }}>{e.id}</span>
                <span style={{ color: BPI.ink70, lineHeight: 1.4 }}>{e.src}</span>
              </div>
            ))}
          </div>
          <div style={{
            background: BPI.paperDeep, borderRadius: 4,
            boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
            padding: '16px 18px',
            fontSize: 11.5, color: BPI.ink70, lineHeight: 1.55,
          }}>
            <div className="eyebrow" style={{ marginBottom: 10, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 10 }}>
              Reviewed by
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 14,
                background: BPI.ink, color: BPI.paper,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 600,
              }}>JB</div>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: BPI.ink }}>Jordan Bellamy</div>
                <div style={{ fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono }}>Editor at Large</div>
              </div>
            </div>
            <div style={{ color: BPI.good, fontSize: 10.5, fontFamily: BPIMono, fontWeight: 700, letterSpacing: '0.08em' }}>
              ✓ APPROVED MAY 12
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

Object.assign(window, { BriefPrimitivesCatalog, RF_BriefRich });
