// verdict-data.jsx
// Route dossiers for the Verdict-layer exploration. Three postures:
//   m15 — worsening, flagship density (3 insights, trend-shaded story)
//   b44 — treated & improving, standard density (2 insights, before/after)
//   s79 — healthy, sparse density (0 insights → checked-clean report card)
//
// All numbers carry a single clock. The verdict reads from the DOSSIER
// (e.g. 6.4 mph as of 2026-05). Where a release-grain number would
// otherwise appear, it is reconciled with a DataAsOf chip — never two
// unexplained numbers for one metric.
//
// Detector families (shared) — the roster the "checked-clean" state shows.
const DETECTOR_FAMILIES = [
  'Sustained slowdown',
  'Segment persistence',
  'Peak-load mismatch',
  'Treatment regression',
  'Schedule drift',
  'Ridership shock',
];

// ── 36-month speed series (oldest → newest) ───────────────────
const M15_SPEED_36 = [
  8.0,7.9,7.9,7.8,7.7,7.6,7.6,7.5,7.4,7.3,7.2,7.2,
  7.3,7.4,7.3,7.1,7.0,6.9,6.9,6.8,6.9,7.0,6.9,6.8,
  6.8,6.7,6.6,6.6,6.5,6.5,6.4,6.5,6.4,6.4,6.4,6.4,
];
const B44_SPEED_36 = [
  7.6,7.5,7.4,7.4,7.3,7.2,7.2,7.1,7.2,7.4,7.8,8.0,
  8.1,8.2,8.2,8.3,8.4,8.4,8.5,8.5,8.6,8.6,8.7,8.7,
  8.7,8.8,8.8,8.8,8.9,8.8,8.9,8.9,8.9,8.9,8.9,8.9,
];
const S79_SPEED_36 = [
  11.6,11.7,11.6,11.7,11.8,11.7,11.6,11.8,11.9,11.8,11.7,11.8,
  11.9,11.8,11.7,11.8,11.9,11.8,11.7,11.8,11.8,11.9,11.8,11.7,
  11.8,11.9,11.8,11.7,11.8,11.8,11.9,11.8,11.8,11.8,11.8,11.8,
];

// ── persistence strip for the worst-segment insight (24 months, 1=below threshold) ──
const M15_MADISON_PERSIST = [0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1];

// ── hour profiles (24h speed) for peak-mismatch figures ───────
const M15_HOUR = [8.1,8.2,8.3,8.4,8.2,7.6,6.8,5.4,4.9,5.5,5.9,6.0,5.8,5.6,5.4,5.2,4.8,4.2,4.6,5.8,6.5,7.0,7.5,7.8];

// ── carpet (month × hour) excerpt for the story-first composition ──
// rows = 8 recent months (newest at top would be odd; keep oldest→newest), cols = 6 day-parts
const M15_CARPET = {
  months: ['Dec','Jan','Feb','Mar','Apr','May'],
  parts:  ['Early','AM pk','Midday','PM pk','Eve','Late'],
  // mph values; lower = worse
  grid: [
    [7.9, 5.6, 6.0, 4.7, 6.4, 7.6],
    [7.8, 5.4, 5.9, 4.5, 6.3, 7.5],
    [7.8, 5.3, 5.8, 4.4, 6.2, 7.5],
    [7.7, 5.1, 5.7, 4.2, 6.1, 7.4],
    [7.7, 5.0, 5.7, 4.1, 6.0, 7.4],
    [7.6, 4.9, 5.6, 4.0, 6.0, 7.3],
  ],
};

// ── mini-map geometry per route ───────────────────────────────
// Coordinates live in a vb box whose aspect the renderer fits to; routes
// carry enough street context (water band, parallel avenues, cross-street
// ticks) to read as a real basemap excerpt, not a lone ribbon.
const M15_GEOMINI = {
  vb: [300, 300],
  pts: [[152,26],[151,54],[150,82],[148,110],[145,138],[141,166],[135,194],[125,222],[110,248],[94,272]],
  segs: [
    { mph: 7.4, flag: null },
    { mph: 6.8, flag: null },
    { mph: 6.1, flag: null },
    { mph: 4.6, flag: 'bad' },   // Madison Av — worst
    { mph: 5.2, flag: null },
    { mph: 6.4, flag: null },
    { mph: 6.9, flag: null },
    { mph: 7.6, flag: null },
    { mph: 8.1, flag: null },
  ],
  water: 'M254,0 C246,70 266,150 250,300 L300,300 L300,0 Z',
  waterLabel: 'EAST RIVER',
  avenues: [108, 200],   // faint parallel avenue x-positions
  flagLabel: 'MADISON AV',
};
const B44_GEOMINI = {
  vb: [300, 300],
  pts: [[150,24],[151,58],[152,92],[152,128],[151,162],[149,196],[146,230],[142,262],[138,286]],
  segs: [
    { mph: 8.4, flag: null },
    { mph: 8.9, flag: null },
    { mph: 9.8, flag: 'good' },  // Flatbush–Empire — improved
    { mph: 9.2, flag: null },
    { mph: 8.7, flag: null },
    { mph: 8.5, flag: null },
    { mph: 8.6, flag: null },
    { mph: 8.8, flag: null },
  ],
  avenues: [104, 198],
  flagLabel: 'FLATBUSH–EMPIRE',
};
const S79_GEOMINI = {
  vb: [360, 240],
  pts: [[26,44],[74,68],[120,92],[164,114],[206,136],[248,158],[288,180],[322,202]],
  segs: [
    { mph: 12.4, flag: null },
    { mph: 11.8, flag: null },
    { mph: 11.2, flag: null },
    { mph: 12.1, flag: null },
    { mph: 11.9, flag: null },
    { mph: 12.3, flag: null },
    { mph: 11.6, flag: null },
  ],
  water: 'M0,150 C90,158 150,200 360,196 L360,240 L0,240 Z',
  waterLabel: 'LOWER BAY',
  crossAxis: 'diag',
  flagLabel: null,
};

// ── ROUTE DOSSIERS ────────────────────────────────────────────
const VERDICT_ROUTES = {
  m15: {
    id: 'm15',
    badge: { route: 'M15', sbs: true },
    title: '1st Avenue / 2nd Avenue Select Bus Service',
    geo: 'Manhattan · East Harlem ↔ South Ferry · 8.4 mi · 33 stops',
    posture: 'worsening',
    postureLabel: 'Worsening',
    density: 'flagship',
    densityLabel: 'Flagship · evidence-rich',
    spark: M15_SPEED_36,

    // Judged KPI header (single clock per column)
    kpi: {
      condition:   { value: '6.4', unit: 'mph', peer: '7th percentile of NYC SBS', tone: 'bad', asOf: '2026-05', fresh: 'current', tab: 'Where & when' },
      trend:       { pct: '−6.2%', dir: 'down', window: '6-month', tone: 'bad', asOf: '2026-05', fresh: 'current', tab: 'Where & when' },
      reliability: { state: 'building', label: 'On-time grade', note: 'In development', asOf: null, fresh: 'unknown', tab: 'Evidence' },
      riders:      { value: '37.2K', sub: '−4.1% YoY', tone: null, asOf: '2026-04', fresh: 'recent', tab: 'Riders' },
      treatment:   { posture: 'Full stack', sub: 'not holding', chips: ['ACE all-day', 'Lane 72%', 'TSP min'], tone: 'warn', asOf: '2026-03', fresh: 'recent', tab: 'Treatments & history' },
    },

    // The verdict, in one paragraph (posture-worded, single clock)
    lede: 'A fully-treated route that keeps losing ground. The M15 runs at 6.4 mph — 7th percentile citywide — and has slowed in 11 of the last 14 months even with all-day camera enforcement and a concrete lane in place. One untreated stretch, Madison Avenue, carries most of the damage.',

    insights: [
      {
        rank: 1, severity: 'high', tone: 'bad', confidence: 'high',
        claim: 'Madison Avenue (28–58 St) has held below 5 mph for 11 straight months — the route’s slowest segment and its only gap in continuous bus lane.',
        figure: { kind: 'persist', data: M15_MADISON_PERSIST, label: 'below 5 mph · last 24 mo' },
        tab: 'Where & when',
        caveat: 'Timepoint boundaries were redefined in the Aug 2024 GTFS release; the 11-month streak is counted within the current segment definition.',
      },
      {
        rank: 2, severity: 'high', tone: 'bad', confidence: 'medium',
        claim: 'Speed has fallen 1.6 mph over 14 months despite ACE all-day and a concrete-lane upgrade — the treatments in place are not holding the line.',
        figure: { kind: 'spark', data: M15_SPEED_36, label: '36-mo speed · weighted' },
        tab: 'Treatments & history',
        caveat: 'Congestion pricing (Jan 2025) overlaps ACE all-day (May 2025) below 60 St; the two effects are not cleanly separable, so no single cause is asserted.',
      },
      {
        rank: 3, severity: 'medium', tone: 'warn', confidence: 'high',
        claim: 'The PM peak now runs slower than the AM peak and lands at the route’s heaviest load — the worst speeds arrive at the worst hour.',
        figure: { kind: 'hours', data: M15_HOUR, label: 'speed by hour · weekday' },
        tab: 'Where & when',
        caveat: null,
      },
    ],

    story: {
      kind: 'trend-shaded',
      title: 'Fourteen months of decline',
      sub: 'Weighted-average weekday speed, 36 months. The shaded window is the sustained-decline period the detector flagged.',
      data: M15_SPEED_36,
      lo: 5.8, hi: 8.4,
      shadeFrom: 22, shadeTo: 35,     // index range of the decline window
      markers: [{ i: 22, label: 'ACE all-day', tone: 'accent' }, { i: 20, label: 'Cong. pricing', tone: 'warn' }],
      endLabel: '6.4 mph',
    },
    carpet: M15_CARPET,
    geomini: M15_GEOMINI,

    checked: { families: DETECTOR_FAMILIES, asOf: '2026-05', flagsByTab: { 'Where & when': { count: 2, sev: 'high' }, 'Treatments & history': { count: 1, sev: 'high' } } },
    twoClock: { metric: 'corridor speed', dossier: '6.4 mph · as of 2026-05', release: 'live release reads 6.6 mph as of 2026-03' },
  },

  b44: {
    id: 'b44',
    badge: { route: 'B44', sbs: true },
    title: 'Nostrand Avenue / Rogers Avenue Select Bus Service',
    geo: 'Brooklyn · Sheepshead Bay ↔ Williamsburg · 9.3 mi · 28 stops',
    posture: 'treated-improving',
    postureLabel: 'Treated & improving',
    density: 'standard',
    densityLabel: 'Standard',
    spark: B44_SPEED_36,

    kpi: {
      condition:   { value: '8.9', unit: 'mph', peer: '54th percentile of NYC SBS', tone: null, asOf: '2026-05', fresh: 'current', tab: 'Where & when' },
      trend:       { pct: '+7.8%', dir: 'up', window: '6-month', tone: 'good', asOf: '2026-05', fresh: 'current', tab: 'Where & when' },
      reliability: { state: 'building', label: 'On-time grade', note: 'In development', asOf: null, fresh: 'unknown', tab: 'Evidence' },
      riders:      { value: '41.6K', sub: '+2.2% YoY', tone: null, asOf: '2026-04', fresh: 'recent', tab: 'Riders' },
      treatment:   { posture: 'ACE + concrete lane', sub: 'holding', chips: ['ACE all-day', 'Lane 64%'], tone: 'good', asOf: '2026-03', fresh: 'recent', tab: 'Treatments & history' },
    },

    lede: 'One of the few SBS routes moving the right way. Since the concrete lane opened in 2024 the B44 has gained 0.9 mph and held it through four straight quarters, while camera enforcement runs all day. Ridership is rising — the one thing worth watching.',

    insights: [
      {
        rank: 1, severity: 'low', tone: 'good', confidence: 'high',
        claim: 'Speed on the Flatbush–Empire segment has risen 1.3 mph since the concrete lane opened in 2024 and stayed there for four quarters — the clearest sustained gain on the route.',
        figure: { kind: 'beforeafter', before: 8.5, after: 9.8, label: 'segment speed · before / since' },
        tab: 'Treatments & history',
        caveat: 'Descriptive only: the gain coincides with the lane opening; ACE all-day began the same year, so the lane is not credited alone.',
      },
      {
        rank: 2, severity: 'medium', tone: 'warn', confidence: 'medium',
        claim: 'Ridership is climbing faster than speed, and the northern segments are nearing the crowding the M15 hit before its decline — a watch item, not yet a problem.',
        figure: { kind: 'spark', data: B44_SPEED_36, label: '36-mo speed · weighted' },
        tab: 'Riders',
        caveat: 'Forward-looking comparison to a peer route; no degradation has been observed on the B44 itself.',
      },
    ],

    story: {
      kind: 'beforeafter',
      title: 'Before and since the concrete lane',
      sub: 'Weighted-average weekday speed, 36 months. The marker is when the Flatbush–Empire lane opened; wording is descriptive — the gain coincides with, but is not attributed to, the lane alone.',
      data: B44_SPEED_36,
      lo: 7.0, hi: 9.4,
      splitAt: 10,
      markers: [{ i: 10, label: 'Lane opens', tone: 'good' }],
      endLabel: '8.9 mph',
    },
    geomini: B44_GEOMINI,

    checked: { families: DETECTOR_FAMILIES, asOf: '2026-05', flagsByTab: { 'Treatments & history': { count: 1, sev: 'low' }, 'Riders': { count: 1, sev: 'medium' } } },
    twoClock: { metric: 'corridor speed', dossier: '8.9 mph · as of 2026-05', release: 'live release reads 8.8 mph as of 2026-03' },
  },

  s79: {
    id: 's79',
    badge: { route: 'S79', sbs: true },
    title: 'Hylan Boulevard Select Bus Service',
    geo: 'Staten Island · Bay Ridge ↔ Eltingville · 14.2 mi · 22 stops',
    posture: 'healthy',
    postureLabel: 'Healthy',
    density: 'sparse',
    densityLabel: 'Sparse · thin manifest',
    spark: S79_SPEED_36,

    kpi: {
      condition:   { value: '11.8', unit: 'mph', peer: '78th percentile of NYC SBS', tone: 'good', asOf: '2026-05', fresh: 'current', tab: 'Where & when' },
      trend:       { pct: '+0.4%', dir: 'flat', window: '6-month', tone: null, asOf: '2026-05', fresh: 'current', tab: 'Where & when' },
      reliability: { state: 'building', label: 'On-time grade', note: 'In development', asOf: null, fresh: 'unknown', tab: 'Evidence' },
      riders:      { value: '18.9K', sub: '+1.0% YoY', tone: null, asOf: '2026-04', fresh: 'recent', tab: 'Riders' },
      treatment:   { posture: 'ACE + arterial lane', sub: 'adequate', chips: ['ACE all-day', 'Lane 41%'], tone: null, asOf: '2026-03', fresh: 'recent', tab: 'Treatments & history' },
    },

    lede: 'The S79 does what an SBS route is supposed to do. It runs near the front of the citywide pack at 11.8 mph, it has held that speed within a third of a mile per hour for three years, and nothing in this period tripped a detector. Here the absence of a flag is the finding.',

    insights: [],  // zero — the checked-clean report card

    story: {
      kind: 'stable',
      title: 'Three years, held steady',
      sub: 'Weighted-average weekday speed, 36 months. The band marks ±0.3 mph — the route has not left it.',
      data: S79_SPEED_36,
      lo: 10.6, hi: 12.6,
      bandLo: 11.5, bandHi: 12.1,
      endLabel: '11.8 mph',
    },
    geomini: S79_GEOMINI,

    checked: { families: DETECTOR_FAMILIES, asOf: '2026-05', flagsByTab: {} },
    twoClock: { metric: 'corridor speed', dossier: '11.8 mph · as of 2026-05', release: 'live release reads 11.8 mph as of 2026-03' },
  },
};

Object.assign(window, { VERDICT_ROUTES, DETECTOR_FAMILIES });
