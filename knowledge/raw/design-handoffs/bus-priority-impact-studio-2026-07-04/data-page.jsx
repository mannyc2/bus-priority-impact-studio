// Data — the studio's reference page for all underlying datasets, the
// methodology behind the computed metrics, the caveat library, and the
// glossary. Accessed via the "Methods" nav item in StudioBar.
//
// This is where the studio's intellectual honesty lives. Every number
// shown elsewhere in the product traces back to one of the datasets
// catalogued here.

const DPW = 1320, DPH = 880;

const DATASETS = [
  {
    name: 'Bus segment speeds',
    desc: 'Median observed speed between adjacent timepoints, computed by MTA from real-time bus position data. Includes dwell, traffic, signals, and stops.',
    rows: '18.94M',
    period: 'Jan 2023 – May 2026',
    grain: 'route × direction × timepoint pair × hour',
    cadence: 'monthly',
    publisher: 'MTA Open Data',
    schemaKeys: ['route_id', 'direction', 'tp_a', 'tp_b', 'hour', 'mph', 'n_obs'],
    methods: 'segment-speeds',
    citeCount: 14,
  },
  {
    name: 'Hourly ridership',
    desc: 'Boardings per hour per stop across the NYC bus network. Pre-2025 and post-2025 are merged via a stop-id alignment table.',
    rows: '562.31M',
    period: 'Jan 2020 – May 2026',
    grain: 'stop × hour',
    cadence: 'weekly',
    publisher: 'MTA Open Data',
    schemaKeys: ['stop_id', 'datetime', 'boardings'],
    methods: 'ridership-alignment',
    citeCount: 9,
  },
  {
    name: 'Schedule timepoints',
    desc: 'Scheduled travel time between timepoints. Used as the baseline against which observed speeds are measured. Drawn from the latest GTFS.',
    rows: '8.94M',
    period: '2026 schedule',
    grain: 'route × trip × timepoint pair',
    cadence: 'each GTFS publish (~quarterly)',
    publisher: 'MTA GTFS',
    schemaKeys: ['route_id', 'trip_id', 'tp_a', 'tp_b', 'sched_seconds'],
    methods: 'gtfs-import',
    citeCount: 6,
  },
  {
    name: 'ACE program & violations',
    desc: 'Routes covered by Automated Camera Enforcement and the violations recorded by those cameras, by date and segment.',
    rows: '5.25M',
    period: 'Jul 2019 – May 2026',
    grain: 'route × segment × date',
    cadence: 'monthly',
    publisher: 'MTA Open Data',
    schemaKeys: ['route_id', 'segment_id', 'date', 'violations', 'program_status'],
    methods: 'ace-coverage',
    citeCount: 11,
  },
  {
    name: 'Local-street bus lanes',
    desc: 'Geometry of all designated bus-lane segments on NYC local streets, plus install date and lane type (painted / concrete).',
    rows: '4,068',
    period: 'as of Mar 2026',
    grain: 'lane segment',
    cadence: 'quarterly',
    publisher: 'NYC DOT',
    schemaKeys: ['segment_id', 'street', 'from_st', 'to_st', 'install_date', 'lane_type'],
    methods: 'lane-overlap',
    citeCount: 8,
  },
  {
    name: 'Route shapes & stops',
    desc: 'Current route geometry (1,640 shapes) and stop locations (23,048 stops). Used to spatially join speeds, ridership, and DOT lanes.',
    rows: '24,688',
    period: 'as of Apr 2026',
    grain: 'shape / stop',
    cadence: 'each GTFS publish',
    publisher: 'MTA GTFS',
    schemaKeys: ['shape_id / stop_id', 'lat', 'lon', 'sequence'],
    methods: 'spatial-join',
    citeCount: 3,
  },
];

const QUAL_SOURCES = [
  { name: 'MTA Open Data blog — "How we compute segment speeds"', kind: 'methodology', note: 'Defines what the speed metric does and does not include.' },
  { name: 'MTA Open Data Developer documentation',                  kind: 'methodology', note: 'API reference + schema dictionaries.' },
  { name: 'ACE program pages (mta.info)',                           kind: 'program',     note: 'Program scope, eligibility, and rollout history.' },
  { name: 'ACE quarterly press releases',                           kind: 'program',     note: 'Cited only for installation dates, not for performance claims.' },
  { name: 'NYC DOT Bus Priority Streets',                           kind: 'program',     note: 'Bus lane installation history.' },
  { name: 'Project wiki — caveats and design',                      kind: 'internal',    note: 'Captures decisions, caveats, and what we chose not to compute.' },
];

const CAVEATS = [
  { name: '"Speed" includes rider experience', body: 'MTA segment speeds reflect dwell time, traffic, signals, and stops. Use the phrase "observed bus travel speed" whenever this number appears in a brief.', scope: 'product-wide' },
  { name: 'M15 timepoint definitions changed Aug 2024', body: 'Pre/post comparisons on the M15 require segment alignment. Numbers earlier than Aug 2024 are not directly comparable to current segments without reprojection.', scope: 'M15 specifically' },
  { name: 'Congestion pricing overlap with ACE all-day', body: 'CBD congestion pricing went into effect Jan 2025; ACE all-day enforcement followed in May 2025. Within Manhattan below 60th St, attribution between the two is not clean.', scope: 'Manhattan, 2025+' },
  { name: 'Weekday-only assumption',                    body: 'Most metrics are filtered to weekdays. Weekend speeds and ridership are catalogued but rarely surfaced.', scope: 'product-wide' },
  { name: 'Single-month windows',                       body: 'Briefs frequently quote a single 30-day window. Multi-month rolling baselines exist but are not the default; expansion is planned in v0.5.', scope: 'product-wide' },
];

const METRICS = [
  { name: 'Weighted avg route speed', expr: 'Σ (segment_mph × segment_rider_hours) / Σ rider_hours', note: 'Always rider-weighted, never simple mean of segments.' },
  { name: 'Rider-hours lost / day',   expr: 'Σ ((sched_time − observed_time) × hourly_ridership)',     note: 'Per segment, per hour, then summed.' },
  { name: 'Severity score',           expr: 'Percentile rank of segment\'s rider-hours lost within its route',  note: '0–100; updated nightly.' },
  { name: 'Bus-lane coverage %',      expr: 'sum(lane_length) / route_length',                        note: 'Lane-type weighting: concrete = 1.0, painted = 0.7.' },
  { name: 'Top-decile flag',          expr: 'route in top 10% by rider-weighted route delay',         note: 'Used by the "Routes needing attention" home list.' },
];

// ─────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────
function DataPage() {
  const [tab, setTab] = React.useState('Datasets');
  return (
    <div className="bpi" style={{ width: DPW, height: DPH, display: 'flex', flexDirection: 'column' }}>
      <StudioBar active="Methods" />

      {/* Hero */}
      <div style={{
        padding: '28px 32px 22px', background: BPI.card,
        boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
        display: 'flex', alignItems: 'flex-end', gap: 28,
      }}>
        <div style={{ maxWidth: 720 }}>
          <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.1 }}>
            Where the numbers come from
          </div>
          <div style={{ fontSize: 14, color: BPI.ink70, marginTop: 8, lineHeight: 1.55 }}>
            Every metric the studio shows is derived from one of the public datasets catalogued below.
            This page is the one place to read what each source is, how it was joined to the others,
            and what caveats apply to anything computed from it.
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ fontSize: 11, color: BPI.ink55, fontFamily: BPIMono }}>last refreshed</div>
          <div className="num" style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>
            2026-05-12 · 03:14&nbsp;UTC
          </div>
          <div style={{ fontSize: 11, color: BPI.good, fontFamily: BPIMono, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: BPI.good }} />
            all 6 datasets current
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        padding: '0 32px', background: BPI.card,
        boxShadow: `inset 0 -1px 0 ${BPI.rule}`,
        display: 'flex', alignItems: 'center', gap: 24, fontSize: 12.5,
      }}>
        {['Datasets', 'Qualitative sources', 'Computed metrics', 'Caveats library', 'Glossary'].map((t) => (
          <span key={t} onClick={() => setTab(t)} style={{
            padding: '12px 0', color: t === tab ? BPI.ink : BPI.ink55,
            fontWeight: t === tab ? 600 : 400,
            boxShadow: t === tab ? `inset 0 -2px 0 ${BPI.ink}` : 'none',
            cursor: 'pointer',
          }}>{t}</span>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: BPI.ink55, fontFamily: BPIMono }}>v0.4 of methodology · last revised Apr 28, 2026</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
        {tab === 'Datasets' && <DatasetsTab />}
        {tab === 'Qualitative sources' && <QualitativeTab />}
        {tab === 'Computed metrics' && <MetricsTab />}
        {tab === 'Caveats library' && <CaveatsTab />}
        {tab === 'Glossary' && <GlossaryTab />}
      </div>
    </div>
  );
}

function DatasetsTab() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18 }}>
      {DATASETS.map((d, i) => (
        <div key={i} style={{
          background: BPI.card, borderRadius: 4,
          boxShadow: `0 0 0 1px ${BPI.rule}`,
          padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.2 }}>
                {d.name}
              </div>
              <div style={{ fontSize: 11.5, color: BPI.ink55, marginTop: 3, fontFamily: BPIMono }}>
                {d.publisher}
              </div>
            </div>
            <span className="chip" style={{ fontSize: 10 }}>cited {d.citeCount}×</span>
          </div>
          <div style={{ fontSize: 12.5, color: BPI.ink70, lineHeight: 1.55 }}>{d.desc}</div>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: 4, fontSize: 11, color: BPI.ink70,
            background: BPI.paper, padding: '10px 12px', borderRadius: 3,
          }}>
            <Field k="rows"     v={<span className="num" style={{ fontWeight: 600 }}>{d.rows}</span>} />
            <Field k="period"   v={d.period} />
            <Field k="grain"    v={d.grain} />
            <Field k="cadence"  v={d.cadence} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {d.schemaKeys.map((k) => (
              <span key={k} style={{
                fontFamily: BPIMono, fontSize: 10, padding: '2px 7px',
                background: BPI.ink06, color: BPI.ink70, borderRadius: 2,
              }}>{k}</span>
            ))}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            paddingTop: 8, boxShadow: `inset 0 1px 0 ${BPI.rule}`,
          }}>
            <button className="bpi" style={{
              fontFamily: 'inherit', background: 'transparent', border: 'none', cursor: 'pointer',
              color: BPI.accent, fontSize: 12, fontWeight: 600, padding: 0,
            }}>Methodology note →</button>
            <span style={{ color: BPI.ink20 }}>·</span>
            <button className="bpi" style={{
              fontFamily: 'inherit', background: 'transparent', border: 'none', cursor: 'pointer',
              color: BPI.ink70, fontSize: 12, padding: 0,
            }}>Schema</button>
            <span style={{ color: BPI.ink20 }}>·</span>
            <button className="bpi" style={{
              fontFamily: 'inherit', background: 'transparent', border: 'none', cursor: 'pointer',
              color: BPI.ink70, fontSize: 12, padding: 0,
            }}>Download CSV</button>
          </div>
        </div>
      ))}
    </div>
  );
}
function Field({ k, v }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
      <div style={{ color: BPI.ink40, minWidth: 56 }}>{k}</div>
      <div style={{ color: BPI.ink, flex: 1 }}>{v}</div>
    </div>
  );
}

function QualitativeTab() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
      {QUAL_SOURCES.map((s, i) => (
        <div key={i} style={{
          padding: '14px 18px', background: BPI.card, borderRadius: 3,
          boxShadow: `0 0 0 1px ${BPI.rule}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
            <span className="chip" style={{ fontSize: 10 }}>{s.kind}</span>
            <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-0.005em' }}>{s.name}</div>
          </div>
          <div style={{ fontSize: 12, color: BPI.ink70, lineHeight: 1.5, marginLeft: 64 }}>{s.note}</div>
        </div>
      ))}
    </div>
  );
}

function MetricsTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {METRICS.map((m, i) => (
        <div key={i} style={{
          padding: '16px 20px', background: BPI.card, borderRadius: 3,
          boxShadow: `0 0 0 1px ${BPI.rule}`,
          display: 'grid', gridTemplateColumns: '240px 1fr 1fr', gap: 20, alignItems: 'center',
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.005em' }}>{m.name}</div>
          <div style={{
            fontFamily: BPIMono, fontSize: 12, color: BPI.ink70,
            background: BPI.paper, padding: '8px 12px', borderRadius: 3,
            boxShadow: `inset 0 0 0 1px ${BPI.rule}`,
          }}>{m.expr}</div>
          <div style={{ fontSize: 12, color: BPI.ink70, lineHeight: 1.5 }}>{m.note}</div>
        </div>
      ))}
    </div>
  );
}

function CaveatsTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {CAVEATS.map((c, i) => (
        <div key={i} style={{
          padding: '14px 18px', background: BPI.card, borderRadius: 3,
          boxShadow: `0 0 0 1px ${BPI.rule}`,
          display: 'flex', gap: 14, alignItems: 'flex-start',
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: 3,
            background: BPI.warn, marginTop: 8, flexShrink: 0,
          }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.005em' }}>{c.name}</div>
              <span className="chip" style={{ fontSize: 10 }}>scope · {c.scope}</span>
            </div>
            <div style={{ fontSize: 12.5, color: BPI.ink70, lineHeight: 1.55, marginTop: 6 }}>{c.body}</div>
          </div>
          <button className="bpi" style={{
            fontFamily: 'inherit', background: 'transparent', border: `1px solid ${BPI.ink20}`,
            borderRadius: 3, padding: '6px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer',
          }}>Apply to brief</button>
        </div>
      ))}
    </div>
  );
}

function GlossaryTab() {
  const terms = [
    ['Observed bus travel speed', 'The median speed of buses between two timepoints, including dwell, traffic, signals, and stops. Not "traffic speed."'],
    ['Timepoint segment',         'The interval between two scheduled timepoints along a route. The grain at which speed data is published.'],
    ['Rider-hour',                'One rider × one hour of travel. The product\'s preferred unit for severity, because it weights delay by who is affected.'],
    ['ACE',                       'Automated Camera Enforcement — MTA program installing cameras on buses to ticket bus-lane violators.'],
    ['SBS',                       'Select Bus Service — limited-stop branded service with off-board fare collection and (usually) dedicated lanes.'],
    ['TSP',                       'Transit Signal Priority — traffic signals that detect approaching buses and hold green or shorten red.'],
    ['Slow-window share',         'Percentage of operational hours in which a segment\'s speed falls below its scheduled timepoint pace.'],
  ];
  return (
    <div style={{
      background: BPI.card, borderRadius: 3, boxShadow: `0 0 0 1px ${BPI.rule}`,
      padding: '6px 22px',
    }}>
      {terms.map(([term, def], i) => (
        <div key={term} style={{
          display: 'grid', gridTemplateColumns: '220px 1fr',
          gap: 24, padding: '14px 0',
          boxShadow: i < terms.length - 1 ? `inset 0 -1px 0 ${BPI.rule}` : 'none',
        }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{term}</div>
          <div style={{ fontSize: 12.5, color: BPI.ink70, lineHeight: 1.55 }}>{def}</div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { DataPage });
