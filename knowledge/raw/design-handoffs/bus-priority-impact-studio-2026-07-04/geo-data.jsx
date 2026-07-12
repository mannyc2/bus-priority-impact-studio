// geo-data.jsx — geography + synthesis for the map explorations.
//
// Everything here is STYLIZED, not literal cartography. NYC is drawn as a
// set of soft landmass blobs in the studio's warm-paper palette so a map
// reads as "a transit diagram in our voice," never a Google-Maps tile.
//
// Exposes (on window):
//   GEO        — NYC land paths + viewBox, network route definitions
//   M15_GEO    — the M15 avenue geometry (stop xy, segments, context)
//   speedToColor(mph)        — smooth oklch red→amber→green ramp
//   speedTier(mph)           — 'bad' | 'warn' | 'good'
//   hourSpeed(base, h, sev)  — synthesize speed at hour h
//   corridorAvgAt(h)         — M15 weighted avg speed at hour h
//   HOURS                    — service hours 5..23

// ─────────────────────────────────────────────────────────────
// Speed → color. Five oklch anchors, linearly interpolated in L/C/H.
// Gives a continuous ramp so time-scrubbing tweens smoothly instead of
// snapping between tiers. Tiers (speedTier) still drive discrete labels.
// ─────────────────────────────────────────────────────────────
const SPEED_ANCHORS = [
  [3.3, [0.50, 0.165, 27]],
  [4.6, [0.55, 0.150, 38]],
  [5.6, [0.62, 0.135, 58]],
  [6.6, [0.67, 0.125, 78]],
  [7.8, [0.58, 0.120, 150]],
  [9.5, [0.60, 0.105, 162]],
];
function speedToColor(mph) {
  const a = SPEED_ANCHORS;
  if (mph <= a[0][0]) return `oklch(${a[0][1][0]} ${a[0][1][1]} ${a[0][1][2]})`;
  if (mph >= a[a.length - 1][0]) { const v = a[a.length - 1][1]; return `oklch(${v[0]} ${v[1]} ${v[2]})`; }
  for (let i = 0; i < a.length - 1; i++) {
    const [m0, c0] = a[i], [m1, c1] = a[i + 1];
    if (mph >= m0 && mph <= m1) {
      const t = (mph - m0) / (m1 - m0);
      const L = c0[0] + (c1[0] - c0[0]) * t;
      const C = c0[1] + (c1[1] - c0[1]) * t;
      const H = c0[2] + (c1[2] - c0[2]) * t;
      return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${H.toFixed(1)})`;
    }
  }
  return `oklch(0.6 0.1 80)`;
}
function speedTier(mph) { return mph < 5 ? 'bad' : mph < 6.5 ? 'warn' : 'good'; }

// ─────────────────────────────────────────────────────────────
// Hourly speed synthesis. A weekday curve with AM (~8:15) and PM (~17:30)
// peaks; `sev` (0..1) scales how hard a place collapses at peak — already
// slow corridors crater hardest. Night runs a touch faster than the daily
// base. Returns mph.
// ─────────────────────────────────────────────────────────────
function hourSpeed(base, h, sev = 0.5) {
  const am = Math.exp(-Math.pow(h - 8.2, 2) / 3.0);
  const pm = Math.exp(-Math.pow(h - 17.5, 2) / 4.2);
  const peak = Math.max(am, pm * 1.04);
  const midday = h >= 10.5 && h <= 14.5 ? 0.22 : 0;
  const night = h < 6.5 || h > 21 ? 0.10 : 0;
  const drop = (0.16 + 0.30 * sev) * peak + 0.04 * midday;
  return Math.max(3.0, base * (1 + night - drop));
}
const HOURS = Array.from({ length: 19 }, (_, i) => i + 5); // 5..23

// ─────────────────────────────────────────────────────────────
// STYLIZED NYC GEOGRAPHY — soft blobs. viewBox 1000 × 720.
// Water is the canvas; land sits a tone lighter. The gaps between blobs
// read as the Hudson (west) and East River (east). Not to scale.
// ─────────────────────────────────────────────────────────────
const GEO_VIEW = { w: 1000, h: 720 };

const GEO_LAND = {
  // Manhattan — tilted sliver, the focus; sized to hold three routes.
  manhattan: 'M452,64 C470,104 458,170 444,236 C432,294 416,360 398,424 C383,478 360,540 334,586 C324,602 306,600 300,584 C314,528 336,470 354,410 C370,352 384,288 398,226 C410,168 420,110 428,76 C432,60 446,50 452,64 Z',
  // The Bronx — northern mass, above & east of Manhattan.
  bronx: 'M430,52 C486,20 580,24 672,42 C732,54 786,72 792,108 C796,140 754,156 700,160 C636,165 566,160 512,150 C474,143 448,134 436,116 C428,100 420,66 430,52 Z',
  // Queens — large eastern mass.
  queens: 'M566,236 C648,212 768,208 876,232 C948,248 992,278 986,338 C980,404 934,456 866,488 C800,518 726,520 666,496 C620,478 598,444 592,400 C586,360 580,322 572,296 C566,272 558,252 566,236 Z',
  // Brooklyn — south of Manhattan, reaching SW.
  brooklyn: 'M470,512 C534,484 614,486 690,508 C760,528 806,562 796,610 C786,660 720,696 632,706 C548,716 470,700 432,662 C402,634 410,592 436,560 C452,536 452,524 470,512 Z',
  // Staten Island — SW island.
  si: 'M150,558 C214,538 290,550 322,588 C346,616 334,660 286,686 C234,712 166,708 128,676 C100,652 104,608 130,582 C136,574 142,562 150,558 Z',
};

// Labels placed in the visual centroid of each blob.
const GEO_LABELS = [
  { t: 'THE BRONX', x: 600, y: 98 },
  { t: 'MANHATTAN', x: 374, y: 300, rotate: -62 },
  { t: 'QUEENS', x: 784, y: 360 },
  { t: 'BROOKLYN', x: 600, y: 604 },
  { t: 'STATEN\nISLAND', x: 224, y: 624 },
];

// ─────────────────────────────────────────────────────────────
// NETWORK ROUTES — each is a polyline through its borough(s), carrying the
// public-index data (mph, riders, YoY status) plus a base speed + peak
// severity for hourly recolor. `trend` is the 12-mo spark.
// ─────────────────────────────────────────────────────────────
const dn  = [7.4, 7.3, 7.3, 7.2, 7.1, 7.0, 6.9, 6.8, 6.7, 6.5, 6.4, 6.3];
const dn2 = [6.0, 5.9, 5.8, 5.8, 5.7, 5.6, 5.5, 5.4, 5.3, 5.2, 5.1, 5.1];
const flt = [6.7, 6.7, 6.6, 6.7, 6.7, 6.7, 6.7, 6.6, 6.7, 6.7, 6.7, 6.7];
const up  = [6.4, 6.5, 6.55, 6.6, 6.7, 6.75, 6.8, 6.82, 6.88, 6.9, 6.9, 6.9];
const up2 = [6.3, 6.4, 6.5, 6.55, 6.6, 6.65, 6.7, 6.75, 6.8, 6.85, 6.9, 7.0];

const GEO_ROUTES = [
  { id: 'm15', route: 'M15', sbs: true, borough: 'Manhattan', name: '1 Av / 2 Av',
    mph: 6.3, riders: '42.1K', status: 'Declining', tone: 'bad', trend: dn, sev: 0.95,
    labelAt: [456, 88],
    pts: [[440,96],[430,150],[418,210],[404,272],[388,336],[372,400],[352,462],[332,520],[320,560]] },
  { id: 'm101', route: 'M101', sbs: false, borough: 'Manhattan', name: '3 Av / Lexington Av',
    mph: 6.0, riders: '29.7K', status: 'Declining', tone: 'bad', trend: dn, sev: 0.8,
    labelAt: [322, 522],
    pts: [[424,150],[412,212],[398,276],[384,338],[368,400],[350,458],[334,508]] },
  { id: 'm14', route: 'M14', sbs: true, borough: 'Manhattan', name: '14 St crosstown',
    mph: 7.4, riders: '17.8K', status: 'Improving', tone: 'good', trend: up2, sev: 0.4,
    labelAt: [330, 452],
    pts: [[342,456],[360,448],[378,440],[396,434]] },
  { id: 'bx12', route: 'Bx12', sbs: true, borough: 'Bronx', name: 'Fordham Rd / Pelham',
    mph: 6.9, riders: '41.0K', status: 'Improving', tone: 'good', trend: up, sev: 0.55,
    labelAt: [784, 122],
    pts: [[470,118],[528,112],[590,108],[652,108],[712,114],[762,122]] },
  { id: 'q44', route: 'Q44', sbs: true, borough: 'Queens', name: 'Main St · Flushing — Jamaica',
    mph: 6.4, riders: '26.3K', status: 'Steady', tone: 'warn', trend: flt, sev: 0.6,
    labelAt: [704, 244],
    pts: [[704,252],[710,302],[714,352],[714,402],[706,448],[692,486]] },
  { id: 'q58', route: 'Q58', sbs: false, borough: 'Queens', name: 'Corona — Ridgewood',
    mph: 6.3, riders: '21.5K', status: 'Declining', tone: 'bad', trend: dn, sev: 0.7,
    labelAt: [862, 300],
    pts: [[846,302],[804,332],[762,362],[720,394],[680,430],[646,466]] },
  { id: 'b41', route: 'B41', sbs: false, borough: 'Brooklyn', name: 'Flatbush Av',
    mph: 5.1, riders: '24.8K', status: 'Declining', tone: 'bad', trend: dn2, sev: 0.9,
    labelAt: [668, 668],
    pts: [[470,520],[506,548],[546,576],[588,604],[626,634],[654,664]] },
  { id: 'b46', route: 'B46', sbs: true, borough: 'Brooklyn', name: 'Utica Av',
    mph: 6.7, riders: '38.4K', status: 'Steady', tone: 'warn', trend: flt, sev: 0.5,
    labelAt: [688, 510],
    pts: [[688,520],[694,556],[698,594],[698,632],[692,664]] },
];

// ─────────────────────────────────────────────────────────────
// M15 GEOGRAPHIC CORRIDOR — the avenue drawn N→S as real street geometry.
// Stop xy in a 560 × 760 viewBox. The grid runs straight down the East
// Side, then bends SW below Houston toward South Ferry. Segments map 1:1
// to M15_CORRIDOR_SEGMENTS (read from corridor-map.jsx at runtime, with a
// fallback baked here so this file stands alone).
// ─────────────────────────────────────────────────────────────
const M15_SEGFALLBACK = [
  { from: 'e125', to: 'e116', label: 'East Harlem · 125–116 St', mph: 7.4, sched: 8.4, lane: 'yes', ace: true, tsp: false },
  { from: 'e116', to: 'e96', label: 'East Harlem · 116–96 St', mph: 6.9, sched: 8.0, lane: 'yes', ace: true, tsp: false },
  { from: 'e96', to: 'e79', label: 'Upper East Side · 96–79 St', mph: 5.8, sched: 8.2, lane: 'yes', ace: true, tsp: true },
  { from: 'e79', to: 'e57', label: 'Upper East Side · 79–57 St', mph: 5.2, sched: 7.6, lane: 'yes', ace: true, tsp: false },
  { from: 'e57', to: 'e28', label: 'Madison Av · 58–28 St', mph: 4.2, sched: 7.1, lane: 'partial', ace: false, tsp: false, story: 'top' },
  { from: 'e28', to: 'e14', label: 'Gramercy · 28–14 St', mph: 4.9, sched: 7.6, lane: 'yes', ace: true, tsp: false },
  { from: 'e14', to: 'hous', label: 'East Village · 14–Houston', mph: 5.5, sched: 7.4, lane: 'yes', ace: true, tsp: false },
  { from: 'hous', to: 'grand', label: 'LES · Houston–Grand', mph: 6.4, sched: 7.8, lane: 'yes', ace: true, tsp: false },
  { from: 'grand', to: 'madall', label: 'LES · Grand–Madison/Allen', mph: 6.8, sched: 7.5, lane: 'yes', ace: false, tsp: false },
  { from: 'madall', to: 'sferry', label: 'Lower Manhattan · Allen–S.F.', mph: 7.2, sched: 8.0, lane: 'yes', ace: false, tsp: false },
];

const M15_STOPXY = [
  { id: 'e125',   label: 'E 125 St',        cross: '125', x: 360, y: 64,  terminus: 'north' },
  { id: 'e116',   label: 'E 116 St',        cross: '116', x: 360, y: 128 },
  { id: 'e96',    label: 'E 96 St',         cross: '96',  x: 360, y: 200 },
  { id: 'e79',    label: 'E 79 St',         cross: '79',  x: 360, y: 274 },
  { id: 'e57',    label: 'E 57 St',         cross: '57',  x: 360, y: 350 },
  { id: 'e28',    label: 'E 28 St',         cross: '28',  x: 360, y: 428 },
  { id: 'e14',    label: 'E 14 St',         cross: '14',  x: 360, y: 498 },
  { id: 'hous',   label: 'Houston St',      cross: 'Houston', x: 358, y: 560 },
  { id: 'grand',  label: 'Grand St',        cross: 'Grand',   x: 336, y: 612 },
  { id: 'madall', label: 'Madison / Allen', cross: 'Allen',   x: 300, y: 656 },
  { id: 'sferry', label: 'South Ferry',     cross: 'S. Ferry', x: 244, y: 704, terminus: 'south' },
];

const M15_GEO = {
  view: { w: 560, h: 760 },
  stops: M15_STOPXY,
  segFallback: M15_SEGFALLBACK,
  // Context avenues west of the route (faint vertical guides) + labels.
  avenues: [
    { x: 296, label: '3 Av' },
    { x: 236, label: 'Lex' },
    { x: 176, label: 'Park' },
  ],
  // East River — water blob on the east edge.
  river: 'M438,40 C470,90 452,150 470,220 C486,284 466,340 476,404 C484,452 470,498 452,540 C500,560 540,560 600,560 L600,40 Z',
};

// Weighted avg of the live M15 segments at a given hour (rider-hours weight
// approximated by inverse-speed share; good enough for a readout).
function corridorAvgAt(h) {
  const segs = (typeof M15_CORRIDOR_SEGMENTS !== 'undefined') ? M15_CORRIDOR_SEGMENTS : M15_SEGFALLBACK;
  let num = 0, den = 0;
  segs.forEach((s) => {
    const sev = s.mph < 5 ? 0.95 : s.mph < 6 ? 0.7 : 0.45;
    const v = hourSpeed(s.mph, h, sev);
    const w = (s.rh || 6000);
    num += v * w; den += w;
  });
  return den ? num / den : 0;
}

Object.assign(window, {
  GEO_VIEW, GEO_LAND, GEO_LABELS, GEO_ROUTES,
  M15_GEO,
  speedToColor, speedTier, hourSpeed, corridorAvgAt, HOURS,
});
