// methods-public.jsx — Methods · public-facing edition.
//
// The site\u2019s "how we know what we know" page. Public-facing in tone:
// readable by a civic reader, comprehensive enough to be cited. Built
// from the Public-Facing Data Catalog\u2019s status taxonomy — every
// metric we publish has a row here with grain, source, and a status
// chip (Use now / Add with API work / Source gap / etc.).

const MPUB_W = 1320, MPUB_H = 2520;

// ─────────────────────────────────────────────────────────────
// Status taxonomy — drives the color and label of the status chip.
// ─────────────────────────────────────────────────────────────
const STATUS_META = {
  use_now: {
    label: 'Use now',
    color: BPI.good,
    bg: BPI.goodBg,
    desc: 'Currently served by the studio\u2019s public API and reflected on every page that needs it.',
  },
  api_work: {
    label: 'Needs API work',
    color: BPI.accent,
    bg: BPI.accentBg,
    desc: 'Data exists; not yet exposed everywhere it could be.',
  },
  pipeline: {
    label: 'Pipeline only',
    color: BPI.warn,
    bg: BPI.warnBg,
    desc: 'Local pipeline produces this; not yet promoted to public serving.',
  },
  source_gap: {
    label: 'Source gap',
    color: BPI.bad,
    bg: BPI.badBg,
    desc: 'Product need is real; no adequate public source yet.',
  },
};

// ─────────────────────────────────────────────────────────────
// Atoms
// ─────────────────────────────────────────────────────────────

function MPubHeader({ kicker, title, sub }) {
  return (
    <div style={{ marginBottom: 22 }}>
      {kicker && (
        <div style={{ fontSize: 11, fontWeight: 600, color: BPI.ink55, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>{kicker}</div>
      )}
      <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.022em', lineHeight: 1.15, color: BPI.ink, textWrap: 'balance', maxWidth: 820 }}>{title}</div>
      {sub && (
        <div style={{ fontSize: 15, color: BPI.ink70, marginTop: 10, lineHeight: 1.55, maxWidth: 760, textWrap: 'pretty' }}>{sub}</div>
      )}
    </div>
  );
}

function MPubStatusChip({ status, size = 'md' }) {
  const m = STATUS_META[status];
  const fs = size === 'sm' ? 9.5 : 10.5;
  const py = size === 'sm' ? 2 : 3;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: fs, fontWeight: 700, letterSpacing: '0.06em',
      textTransform: 'uppercase', color: m.color,
      background: m.bg, padding: `${py}px 7px`, borderRadius: 2,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: 3, background: m.color }} />
      {m.label}
    </span>
  );
}

// Big metric definition card — the first-class explanation of one metric.
function MPubMetricCard({ metric, status, grain, source, plainEnglish, wording, beware }) {
  return (
    <article style={{
      background: BPI.card, borderRadius: 4,
      boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
      padding: '28px 30px', display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 19, fontWeight: 600, letterSpacing: '-0.015em', color: BPI.ink, flex: 1, minWidth: 0 }}>{metric}</h3>
        <MPubStatusChip status={status} />
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: '120px 1fr', gap: 14,
        fontSize: 12, color: BPI.ink70,
      }}>
        <span style={{ color: BPI.ink40, fontFamily: BPIMono, letterSpacing: '0.06em', fontWeight: 700, textTransform: 'uppercase' }}>Grain</span>
        <span style={{ fontFamily: BPIMono, color: BPI.ink }}>{grain}</span>
        <span style={{ color: BPI.ink40, fontFamily: BPIMono, letterSpacing: '0.06em', fontWeight: 700, textTransform: 'uppercase' }}>Source</span>
        <span style={{ color: BPI.ink70 }}>{source}</span>
      </div>
      <div style={{ fontSize: 13.5, color: BPI.ink70, lineHeight: 1.7, textWrap: 'pretty' }}>{plainEnglish}</div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
        marginTop: 4, paddingTop: 14,
        boxShadow: `inset 0 1px 0 ${BPI.rule}`,
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: BPI.good, textTransform: 'uppercase', marginBottom: 6 }}>
            ✓ We call it
          </div>
          <div style={{ fontSize: 12.5, color: BPI.ink, lineHeight: 1.55, fontWeight: 500 }}>{wording.use}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: BPI.bad, textTransform: 'uppercase', marginBottom: 6 }}>
            ✕ Not
          </div>
          <div style={{ fontSize: 12.5, color: BPI.ink70, lineHeight: 1.55 }}>{wording.avoid}</div>
        </div>
      </div>
      {beware && (
        <div style={{
          background: BPI.warnBg, color: BPI.warn,
          padding: '10px 14px', borderRadius: 3,
          borderLeft: `3px solid ${BPI.warn}`,
          fontSize: 12, lineHeight: 1.55, color: BPI.ink70,
        }}>
          <span style={{ fontWeight: 700, color: BPI.warn, marginRight: 6 }}>⚠ Caveat</span>
          {beware}
        </div>
      )}
    </article>
  );
}

// Status legend
function MPubLegend() {
  return (
    <div style={{
      background: BPI.card, borderRadius: 4,
      boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
      padding: '24px 26px',
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 28,
    }}>
      {Object.entries(STATUS_META).map(([k, m]) => (
        <div key={k}>
          <MPubStatusChip status={k} />
          <div style={{ fontSize: 12, color: BPI.ink70, marginTop: 10, lineHeight: 1.5 }}>{m.desc}</div>
        </div>
      ))}
    </div>
  );
}

// Dataset row — one row in the dataset catalog table.
function MPubDatasetRow({ name, grain, cadence, status, rows, src }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1.5fr 1.2fr 110px 130px 110px 100px',
      gap: 14, alignItems: 'baseline',
      padding: '14px 22px',
      boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
      cursor: 'pointer',
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: BPI.ink, marginBottom: 2 }}>{name}</div>
        <div style={{ fontSize: 10.5, color: BPI.ink55, fontFamily: BPIMono }}>{src}</div>
      </div>
      <span style={{ fontSize: 11.5, color: BPI.ink70, fontFamily: BPIMono }}>{grain}</span>
      <span style={{ fontSize: 11.5, color: BPI.ink70, fontFamily: BPIMono }}>{cadence}</span>
      <MPubStatusChip status={status} size="sm" />
      <span className="num" style={{ fontSize: 11.5, color: BPI.ink70, fontFamily: BPIMono, textAlign: 'right' }}>{rows}</span>
      <span style={{ fontSize: 12, color: BPI.accent, fontWeight: 600, textAlign: 'right' }}>Open →</span>
    </div>
  );
}

// Source gap row — the "what we don\u2019t have" table.
function MPubGapRow({ gap, why, proxy }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1.6fr 1fr',
      gap: 22, alignItems: 'flex-start',
      padding: '20px 0',
      boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: BPI.ink, marginBottom: 6 }}>{gap}</div>
        <MPubStatusChip status="source_gap" size="sm" />
      </div>
      <div style={{ fontSize: 13, color: BPI.ink70, lineHeight: 1.65, textWrap: 'pretty' }}>{why}</div>
      <div style={{
        fontSize: 12.5, color: BPI.ink70, lineHeight: 1.55,
        padding: '10px 14px', background: BPI.paperDeep, borderRadius: 3,
        borderLeft: `3px solid ${BPI.accent}`,
      }}>
        <span style={{ fontFamily: BPIMono, fontSize: 9.5, color: BPI.accent, letterSpacing: '0.08em', fontWeight: 700, textTransform: 'uppercase', marginRight: 6 }}>Our proxy</span>
        {proxy}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RF_MethodsPublic
// ─────────────────────────────────────────────────────────────
function RF_MethodsPublic() {
  return (
    <div className="bpi" style={{
      width: MPUB_W, height: MPUB_H,
      display: 'flex', flexDirection: 'column',
      background: BPI.paper,
    }}>
      <StudioBar breadcrumb="About / Methods & data" />

      <div style={{ flex: 1, overflow: 'auto' }}>

        {/* ── HERO ───────────────────────────────────────────────── */}
        <div style={{ background: BPI.card, boxShadow: `inset 0 -1px 0 ${BPI.rule}` }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '64px 36px 48px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: BPI.accent, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 18 }}>
              Methods & data
            </div>
            <h1 style={{
              margin: 0,
              fontSize: 48, fontWeight: 600, letterSpacing: '-0.03em',
              lineHeight: 1.05, color: BPI.ink,
              maxWidth: 1000, textWrap: 'balance', marginBottom: 22,
            }}>
              What we measure, what we don\u2019t, and how to tell the difference.
            </h1>
            <div style={{ fontSize: 18, color: BPI.ink70, lineHeight: 1.55, maxWidth: 880, textWrap: 'pretty' }}>
              Every number on this site comes from a public dataset. The page below names each one, explains the grain it sits at, and labels how far it has been promoted into the studio\u2019s serving layer. Where the data we want doesn\u2019t exist yet, we say so — and we publish the proxy we use in its place.
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 18, marginTop: 32,
              paddingTop: 22, boxShadow: `inset 0 1px 0 ${BPI.rule}`,
            }}>
              <span style={{ fontSize: 12.5, color: BPI.ink55, fontFamily: BPIMono }}>
                Last reviewed by A. Chen (Data Engineer) · 2026-05-12
              </span>
              <span style={{ flex: 1 }} />
              <Button variant="secondary" size="md">View OpenAPI schema ↗</Button>
              <Button variant="secondary" size="md">Bulk data download (CSV)</Button>
              <Button variant="primary" size="md">Citation guide →</Button>
            </div>
          </div>
        </div>

        {/* ── DATA STATUS LEGEND ─────────────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 36px 8px' }}>
          <MPubHeader
            kicker="How we label everything"
            title="Four labels, applied to every field we publish."
            sub="Most pages on the site show a quiet status chip next to any number that isn\u2019t fully promoted. The labels mean the same thing wherever they appear."
          />
          <MPubLegend />
        </div>

        {/* ── KEY METRICS ────────────────────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 36px 12px' }}>
          <MPubHeader
            kicker="The metrics that appear on most pages"
            title="Six measures we publish, in plain English."
            sub="These six metrics carry almost every claim we make. Each card explains what the measure is, where it comes from, and — just as important — what it should and shouldn\u2019t be called."
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18 }}>

            <MPubMetricCard
              metric="Observed average speed"
              status="use_now"
              grain="route-month · segment-month/hour"
              source="MTA Bus Speeds (segment-level), studio route-slice projections"
              plainEnglish="The speed a rider experiences on the bus — distance over wall-clock time, including the time the bus spends stopped at red lights or boarding passengers. Aggregated to route level, segments are weighted by ridership."
              wording={{
                use: '“Observed average speed,” “PM-peak speed,” “evening-rush weighted speed.”',
                avoid: '“Weighted average speed” without qualification, unless the weighting is explicit.',
              }}
            />

            <MPubMetricCard
              metric="Scheduled comparison speed"
              status="use_now"
              grain="route-slice · segment-window"
              source="MTA GTFS schedule + route-slice schedule comparisons"
              plainEnglish="What the printed schedule promises the bus will do, segment by segment. We derive it from timepoint-to-timepoint travel times in the published GTFS feed, then align it with the observed-speed windows for an apples-to-apples comparison."
              wording={{
                use: '“Scheduled,” “what the schedule promises,” “timepoint pace.”',
                avoid: '“Service truth,” which implies a stop-to-stop guarantee we don\u2019t have.',
              }}
              beware="The schedule is comparable to observed speeds at the timepoint segments it defines — not at every stop-to-stop pair on the route."
            />

            <MPubMetricCard
              metric="Rider-hours of delay"
              status="use_now"
              grain="segment-window · hour"
              source="Observed-vs-scheduled delta × MTA Hourly Ridership"
              plainEnglish="The total time riders spend on a segment beyond what the schedule promised them. Computed as the speed gap times the time a typical rider spends on that segment, multiplied by the riders on the bus at that hour."
              wording={{
                use: '“Rider-hours of delay,” “route-slice delay exposure.”',
                avoid: '“Segment boardings” or “stop loads” — these aren\u2019t the same thing and the underlying data isn\u2019t available.',
              }}
              beware="The denominator is route/hour ridership, not segment/hour. Be careful interpreting tiny segments."
            />

            <MPubMetricCard
              metric="DOT bus-lane overlap"
              status="use_now"
              grain="route · segment"
              source="NYC DOT bus-lane GIS joined to MTA route shape"
              plainEnglish="The share of a route\u2019s shape that has a bus lane of any type on the underlying street segment. We do this with a geometric overlay between the DOT bus-lane GIS and the MTA route shape, so the number reflects route-shape geometry, not audited lane miles."
              wording={{
                use: '“DOT route-shape lane overlap,” “bus lane coverage.”',
                avoid: '“Audited bus-lane mileage,” “official regulatory lane mileage.”',
              }}
            />

            <MPubMetricCard
              metric="TSP coverage (signal priority)"
              status="api_work"
              grain="route · intersection"
              source="NYC DOT 2017 TSP status snapshot"
              plainEnglish="Where transit signal priority is installed on a route. We use the most recent comprehensive public source we have, the NYC DOT 2017 TSP roster, joined back to current route geometry. We flag every published TSP claim with the snapshot date and an explicit caveat."
              wording={{
                use: '“2017 TSP status snapshot,” “signal priority at N intersections (2017).”',
                avoid: '“Current TSP coverage” without the date qualifier.',
              }}
              beware="Source is dated. A current authoritative TSP feed is a known source gap; see below."
            />

            <MPubMetricCard
              metric="ACE coverage and violations"
              status="use_now"
              grain="route · route-month"
              source="MTA Automated Camera Enforcement program data"
              plainEnglish="Whether automated camera enforcement is active on a route, and how many violations the program records on a weekly basis. Route-level coverage and weekly totals are reliable; per-segment violation attribution is partial."
              wording={{
                use: '“ACE active since (date),” “violations route-wide,” “ACE all-day since (date).”',
                avoid: '“Violations per segment” without segment-level data.',
              }}
              beware="Per-segment attribution exists only for the routes where the ACE program publishes geocoded ticket locations."
            />
          </div>
        </div>

        {/* ── PROCESS ────────────────────────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '64px 36px 12px' }}>
          <MPubHeader
            kicker="From source to page"
            title="How we get from a raw dataset to a number you can read."
            sub="The pipeline is deliberately short. Most of the transformation work is in joining, aligning, and labeling — not in modeling. Anywhere we apply a non-trivial transform, we name it and link to the projection that produced it."
          />
          <div style={{
            background: BPI.card, borderRadius: 4,
            boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
            padding: '32px 36px',
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) 36px repeat(0, 1fr)',
            gap: 0, alignItems: 'flex-start',
          }}>
            {[
              { n: '01', t: 'Ingest', body: 'Pull from MTA Open Data, NYC Open Data, NYC DOT GIS. Verified on retrieval against expected schema and row count.' },
              { n: '02', t: 'Align', body: 'Join sources to a stable route × segment × month grain. Borough labels, route IDs, and shape geometries normalized.' },
              { n: '03', t: 'Project', body: 'Build the route-slice, route-month, segment-month artifacts the site reads from. Every transform tagged with a method ID.' },
              { n: '04', t: 'Serve', body: 'Promote to the studio API. Every public field carries a status label and a link back to its source row.' },
            ].map((s, i, arr) => (
              <React.Fragment key={s.n}>
                <div>
                  <div style={{
                    fontFamily: BPIMono, fontSize: 12, fontWeight: 700,
                    color: BPI.accent, letterSpacing: '0.06em',
                    padding: '4px 10px', background: BPI.accentBg, borderRadius: 2,
                    display: 'inline-block', marginBottom: 14,
                  }}>{s.n}</div>
                  <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.012em', color: BPI.ink, marginBottom: 8 }}>{s.t}</div>
                  <div style={{ fontSize: 12.5, color: BPI.ink70, lineHeight: 1.6, textWrap: 'pretty', paddingRight: 18 }}>{s.body}</div>
                </div>
                {i < arr.length - 1 && (
                  <div style={{ paddingTop: 18, color: BPI.ink20, fontSize: 22, textAlign: 'center', display: 'none' }}>→</div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* ── DATASETS USED ──────────────────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '64px 36px 16px' }}>
          <MPubHeader
            kicker="The data underneath"
            title="Every public dataset the studio ingests, with its current promotion status."
            sub="Click through any row to see the dataset card, the underlying source URL, and a sample of the projection we generate from it. Row counts shown are from the most recent ingest."
          />
          <div style={{
            background: BPI.card, borderRadius: 4,
            boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1.5fr 1.2fr 110px 130px 110px 100px',
              gap: 14, padding: '12px 22px',
              background: BPI.paperDeep,
              boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
              fontSize: 9.5, color: BPI.ink55, letterSpacing: '0.08em',
              fontWeight: 700, textTransform: 'uppercase',
            }}>
              <span>Dataset</span>
              <span>Grain</span>
              <span>Cadence</span>
              <span>Status</span>
              <span style={{ textAlign: 'right' }}>Rows (last ingest)</span>
              <span />
            </div>

            <MPubDatasetRow name="MTA Bus Speeds" grain="segment-day"          cadence="weekly"  status="use_now"    rows="14.2M"  src="data.cityofnewyork.us · MTA · since 2015" />
            <MPubDatasetRow name="MTA Hourly Ridership" grain="route-hour"     cadence="weekly"  status="use_now"    rows="6.1M"   src="data.ny.gov · MTA OMNY + MetroCard" />
            <MPubDatasetRow name="MTA ACE Program data" grain="route-day"      cadence="weekly"  status="use_now"    rows="382K"   src="MTA Bus Automated Camera Enforcement" />
            <MPubDatasetRow name="MTA GTFS schedule" grain="trip · stop_time"  cadence="weekly"  status="use_now"    rows="1.9M"   src="MTA Developer Resources" />
            <MPubDatasetRow name="MTA Current Bus Routes and Stops" grain="route · shape · stop" cadence="weekly" status="use_now" rows="22.4K"  src="MTA · GIS layer" />
            <MPubDatasetRow name="NYC DOT Bus Lanes (GIS)" grain="street segment" cadence="quarterly" status="use_now" rows="3,840" src="NYC DOT · Bus Lanes Local Streets" />
            <MPubDatasetRow name="NYC DOT TSP Status (2017)" grain="route · intersection" cadence="snapshot" status="api_work" rows="1,210" src="NYC DOT · 2017 snapshot · dated" />
            <MPubDatasetRow name="MTA Bus Wait Assessment" grain="route-month" cadence="monthly" status="pipeline" rows="4,610"  src="MTA performance spine" />
            <MPubDatasetRow name="NYC 311 bus-relevant complaints" grain="event" cadence="daily"  status="pipeline" rows="98K"    src="NYC 311 · route-touch joined" />
            <MPubDatasetRow name="NYC DOT permits & street openings" grain="permit" cadence="daily" status="pipeline" rows="61K"  src="NYC DOT · permits feed" />
            <MPubDatasetRow name="NOAA GHCN-Daily weather" grain="station-day" cadence="daily"   status="pipeline" rows="8.4K"   src="NOAA · LaGuardia / JFK / Central Park" />
            <MPubDatasetRow name="Stop-level boardings (local/SBS)" grain="stop-day" cadence="—" status="source_gap" rows="—"     src="No adequate public source yet" />
            <MPubDatasetRow name="Current authoritative TSP feed" grain="intersection · live" cadence="—" status="source_gap" rows="—" src="No public source · 2017 snapshot is the latest" />
          </div>
          <div style={{ marginTop: 14, fontSize: 11.5, color: BPI.ink55, display: 'flex', alignItems: 'center', gap: 14 }}>
            <span>Showing 13 of 13 public-facing datasets</span>
            <span style={{ color: BPI.ink20 }}>·</span>
            <span style={{ color: BPI.accent, fontWeight: 600, cursor: 'pointer' }}>Download dataset catalog (CSV)</span>
            <span style={{ color: BPI.ink20 }}>·</span>
            <span style={{ color: BPI.accent, fontWeight: 600, cursor: 'pointer' }}>Source registry (full)</span>
          </div>
        </div>

        {/* ── SOURCE GAPS ────────────────────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '64px 36px 16px' }}>
          <MPubHeader
            kicker="What we don\u2019t have"
            title="Source gaps that affect what the site can claim."
            sub="There are facts about New York City bus service that we cannot honestly assert with current public data. We catalog them here so readers can see what\u2019s missing — and so we don\u2019t patch the gap with a number that looks like an answer but isn\u2019t."
          />
          <div style={{
            background: BPI.card, borderRadius: 4,
            boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
            padding: '8px 28px 28px',
          }}>
            <MPubGapRow
              gap="Stop-level boardings (local & SBS)"
              why="The MTA does not publish per-stop boarding counts for most local and SBS routes. The closest public series we have is hourly route-level ridership, which tells us how many people are on the bus at a given hour — but not where they got on or off."
              proxy="Route/hour boardings multiplied by the share of route time a segment occupies, used to compute rider-hours of delay. We never present this as a stop-level boarding figure."
            />
            <MPubGapRow
              gap="Per-segment ACE violations"
              why="ACE publishes route-level violation totals reliably; geographic attribution to specific segments is partial — only some routes have geocoded ticket records public. For most routes, segment-level violation counts cannot be supported."
              proxy="Route-level violation totals only, plus segment-level analysis only on routes where geocoded data exists. Flagged explicitly on each page."
            />
            <MPubGapRow
              gap="Current authoritative TSP feed"
              why="There is no public live feed of which NYC intersections currently have transit signal priority installed and active. The 2017 DOT snapshot is the most recent comprehensive source."
              proxy="We use the 2017 snapshot, dated explicitly on every page that shows TSP. We do not infer current installations from the snapshot."
            />
            <MPubGapRow
              gap="Causal evaluation of any single intervention"
              why="The studio does not run controlled experiments. We can describe what happened on one corridor after an intervention; we can compare to peer corridors. Neither is a causal proof of effect."
              proxy="Descriptive before/after windows, peer-adjusted comparisons with named matching method, and explicit “comparison-adjusted, not causal proof” language."
            />
          </div>
        </div>

        {/* ── EDITORIAL STANDARDS ────────────────────────────────── */}
        <div style={{ background: BPI.ink, color: BPI.paper, marginTop: 64 }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '64px 36px 56px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(244,241,234,.55)', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 14 }}>
              How we write about what we measure
            </div>
            <div style={{
              fontSize: 38, fontWeight: 600, letterSpacing: '-0.025em',
              lineHeight: 1.1, color: BPI.paper,
              textWrap: 'balance', maxWidth: 900, marginBottom: 36,
            }}>
              The most honest thing a methodology page can do is tell you what we will not say, and why.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 36 }}>
              {[
                { t: 'We name the data, not the politics.',
                  b: 'When the data points to a structural cause we describe it structurally — “painted vs. concrete lane,” “gap in TSP coverage” — not “enforcement program failure” or “DOT did the wrong thing.” The data does not authorize political claims, only structural ones.' },
                { t: 'We label provenance everywhere.',
                  b: 'Every metric carries the source of its number. When the source is dated or partial, the label says so. When a number comes from a third-party recovery rather than a first-party MTA collection, that is in the label too.' },
                { t: 'We never replace missing data with sample data.',
                  b: 'Where a number cannot be computed, the page renders an unavailable state and explains what would be required to publish it. We do not paint in numbers, even small ones, with fixtures or placeholders.' },
                { t: 'We describe peers; we do not control for them.',
                  b: 'Peer comparisons on this site are descriptive — matched on length, treatment stack, ridership. They are not causal controls. We say so wherever a peer comparison appears.' },
              ].map((row, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '32px 1fr', gap: 16,
                  paddingBottom: 24, boxShadow: 'inset 0 -1px 0 rgba(244,241,234,.12)',
                }}>
                  <div style={{
                    fontFamily: BPIMono, fontSize: 12, fontWeight: 700,
                    color: 'rgba(244,241,234,.5)', letterSpacing: '0.06em',
                    paddingTop: 4,
                  }}>0{i + 1}</div>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 600, color: BPI.paper, letterSpacing: '-0.012em', marginBottom: 8 }}>{row.t}</div>
                    <div style={{ fontSize: 13, color: 'rgba(244,241,234,.72)', lineHeight: 1.65, textWrap: 'pretty' }}>{row.b}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── API & DEVELOPER ROW ────────────────────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 36px 12px' }}>
          <MPubHeader
            kicker="For developers and researchers"
            title="The studio API and the public artifacts that back it."
            sub="The site is a thin reader over a public read API. Everything you see on a page can be fetched as a typed resource against the schemas below. Heavy artifacts — maps, brief bundles, evidence packets — live in the artifact plane and have stable IDs."
          />
          <div style={{
            background: BPI.card, borderRadius: 4,
            boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
            padding: '24px 28px',
            display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 28,
          }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: BPI.ink55, textTransform: 'uppercase', marginBottom: 10 }}>
                Studio resources
              </div>
              <div style={{ fontFamily: BPIMono, fontSize: 12, color: BPI.ink, lineHeight: 1.9 }}>
                <div>GET <span style={{ color: BPI.accent }}>/api/v1/studio/routes</span></div>
                <div>GET <span style={{ color: BPI.accent }}>/api/v1/studio/routes/:slug</span></div>
                <div>GET <span style={{ color: BPI.accent }}>/api/v1/studio/findings</span></div>
                <div>GET <span style={{ color: BPI.accent }}>/api/v1/studio/briefs/:id</span></div>
                <div>GET <span style={{ color: BPI.accent }}>/api/v1/studio/data/evidence/:id</span></div>
                <div>GET <span style={{ color: BPI.accent }}>/api/v1/studio/methods</span></div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: BPI.ink55, textTransform: 'uppercase', marginBottom: 10 }}>
                Schemas & docs
              </div>
              <div style={{ fontSize: 12.5, color: BPI.ink70, lineHeight: 1.9 }}>
                <div><span style={{ color: BPI.accent, fontWeight: 600, cursor: 'pointer' }}>OpenAPI 3.1 spec →</span></div>
                <div><span style={{ color: BPI.accent, fontWeight: 600, cursor: 'pointer' }}>Zod schemas (packages/domain)</span></div>
                <div><span style={{ color: BPI.accent, fontWeight: 600, cursor: 'pointer' }}>Endpoint changelog</span></div>
                <div><span style={{ color: BPI.accent, fontWeight: 600, cursor: 'pointer' }}>Release facts &amp; freshness</span></div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: BPI.ink55, textTransform: 'uppercase', marginBottom: 10 }}>
                Citing this data
              </div>
              <div style={{ fontSize: 12.5, color: BPI.ink70, lineHeight: 1.65, textWrap: 'pretty' }}>
                Studio data is licensed CC&nbsp;BY 4.0. Source datasets carry their own licenses; the MTA and NYC DOT publish theirs as public-domain or open-data terms. A suggested citation block appears at the top of every brief\u2019s &quot;Cite&quot; menu.
              </div>
            </div>
          </div>
        </div>

        {/* ── DATA FRESHNESS / CHANGELOG STRIP ───────────────────── */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 36px 12px' }}>
          <div style={{
            background: BPI.paperDeep, borderRadius: 4,
            padding: '20px 24px',
            boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 28,
          }}>
            {[
              { l: 'Baseline release month', v: '2026-04', s: 'Apr 2026 release set' },
              { l: 'Current signal month',   v: '2026-05', s: 'Latest non-baseline observed window' },
              { l: 'Routes covered',         v: '327',     s: 'All MTA local + SBS' },
              { l: 'Source refs in catalog', v: '184',     s: 'Across 13 public datasets' },
            ].map((k) => (
              <div key={k.l}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: BPI.ink55, textTransform: 'uppercase', marginBottom: 8 }}>{k.l}</div>
                <div className="num" style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', color: BPI.ink, lineHeight: 1 }}>{k.v}</div>
                <div style={{ fontSize: 11.5, color: BPI.ink55, marginTop: 6, lineHeight: 1.4 }}>{k.s}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '32px 36px 32px',
          maxWidth: 1180, margin: '0 auto',
          fontSize: 11.5, color: BPI.ink55,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span>Bus Priority Impact Studio · Methods page is CC&nbsp;BY 4.0</span>
          <span style={{ flex: 1 }} />
          <span style={{ width: 6, height: 6, borderRadius: 3, background: BPI.good }} />
          <span>All systems operational · last ingest 2026-05-12</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { RF_MethodsPublic });
