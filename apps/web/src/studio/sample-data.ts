export type StudioRoute = {
  slug: string;
  routeId: string;
  label: string;
  corridor: string;
  borough: string;
  sbs: boolean;
  speedMph: number;
  scheduledMph: number;
  riderHoursLost: number;
  laneCoverage: number;
  reliability: string;
  diagnosis: string;
  spark: readonly number[];
};

export type StudioSegment = {
  id: string;
  routeSlug: string;
  direction: "NB" | "SB" | "EB" | "WB";
  from: string;
  to: string;
  speedMph: number;
  scheduledMph: number;
  riderHours: number;
  lane: "yes" | "partial" | "minimal" | "none";
  ace: boolean;
  tsp: boolean;
  hours: readonly number[];
};

export type StudioFinding = {
  id: string;
  category: "Anomaly" | "Treatment gap" | "Emerging risk";
  routeSlug: string;
  title: string;
  body: string;
  metric: string;
  confidence: "high" | "moderate";
};

export type StudioBrief = {
  id: string;
  routeSlug: string;
  title: string;
  status: "Published" | "Draft" | "In review";
  summary: string;
  claims: readonly string[];
};

export const studioRoutes: readonly StudioRoute[] = [
  {
    slug: "m15-sbs",
    routeId: "M15+",
    label: "M15",
    corridor: "1 Av / 2 Av and Madison corridor",
    borough: "Manhattan",
    sbs: true,
    speedMph: 4.2,
    scheduledMph: 7.1,
    riderHoursLost: 18420,
    laneCoverage: 38,
    reliability: "Worst SBS route in Manhattan",
    diagnosis:
      "Madison Avenue carries a large share of route delay while sitting outside the route's strongest treatment stack.",
    spark: [6.8, 6.2, 5.4, 4.8, 4.2, 4.5, 5.1],
  },
  {
    slug: "bx12-sbs",
    routeId: "Bx12+",
    label: "Bx12",
    corridor: "Fordham Road / Pelham Parkway",
    borough: "Bronx",
    sbs: true,
    speedMph: 8.6,
    scheduledMph: 8.1,
    riderHoursLost: 4310,
    laneCoverage: 72,
    reliability: "Positive control route",
    diagnosis:
      "A fuller treatment stack makes this route useful as a peer benchmark for slower SBS corridors.",
    spark: [7.4, 7.8, 8.1, 8.6, 8.4, 8.7, 8.6],
  },
  {
    slug: "m101",
    routeId: "M101",
    label: "M101",
    corridor: "3 Av / Lexington Av",
    borough: "Manhattan",
    sbs: false,
    speedMph: 5.0,
    scheduledMph: 6.8,
    riderHoursLost: 10120,
    laneCoverage: 38,
    reliability: "Treatment edge case",
    diagnosis:
      "The northbound delay begins near the edge of the dedicated-lane network, making it a useful treatment-gap example.",
    spark: [6.4, 6.1, 5.8, 5.3, 5.0, 5.1, 5.0],
  },
  {
    slug: "b41",
    routeId: "B41",
    label: "B41",
    corridor: "Flatbush Avenue",
    borough: "Brooklyn",
    sbs: false,
    speedMph: 5.6,
    scheduledMph: 7.0,
    riderHoursLost: 9720,
    laneCoverage: 24,
    reliability: "Counter-pattern",
    diagnosis:
      "Speed is declining even while ridership softens, pointing away from boarding demand as the main explanation.",
    spark: [6.9, 6.5, 6.1, 5.8, 5.7, 5.6, 5.6],
  },
  {
    slug: "b46-sbs",
    routeId: "B46+",
    label: "B46",
    corridor: "Utica Avenue",
    borough: "Brooklyn",
    sbs: true,
    speedMph: 5.1,
    scheduledMph: 6.9,
    riderHoursLost: 12180,
    laneCoverage: 33,
    reliability: "Split-corridor risk",
    diagnosis:
      "Speeds improved south of the congestion boundary while northern segments continued to deteriorate.",
    spark: [6.1, 5.9, 5.7, 5.3, 5.0, 5.2, 5.1],
  },
  {
    slug: "q58",
    routeId: "Q58",
    label: "Q58",
    corridor: "Myrtle / Ridgewood",
    borough: "Queens/Brooklyn",
    sbs: false,
    speedMph: 6.2,
    scheduledMph: 7.3,
    riderHoursLost: 8210,
    laneCoverage: 12,
    reliability: "No intervention scheduled",
    diagnosis:
      "A steady three-year decline has not yet produced a matching bus priority intervention plan.",
    spark: [7.1, 6.8, 6.7, 6.5, 6.3, 6.2, 6.2],
  },
];

export const studioSegments: readonly StudioSegment[] = [
  {
    id: "madison-28-58-nb",
    routeSlug: "m15-sbs",
    direction: "NB",
    from: "E 28 St",
    to: "E 58 St",
    speedMph: 4.2,
    scheduledMph: 7.1,
    riderHours: 18420,
    lane: "partial",
    ace: false,
    tsp: true,
    hours: [0.12, 0.18, 0.32, 0.62, 0.8, 0.86, 0.74, 0.48, 0.3, 0.22, 0.18, 0.14],
  },
  {
    id: "first-14-34-sb",
    routeSlug: "m15-sbs",
    direction: "SB",
    from: "E 34 St",
    to: "E 14 St",
    speedMph: 6.1,
    scheduledMph: 7.3,
    riderHours: 7310,
    lane: "yes",
    ace: true,
    tsp: true,
    hours: [0.08, 0.1, 0.18, 0.35, 0.5, 0.44, 0.38, 0.32, 0.28, 0.2, 0.16, 0.1],
  },
  {
    id: "fordham-webster-jerome-eb",
    routeSlug: "bx12-sbs",
    direction: "EB",
    from: "Webster Av",
    to: "Jerome Av",
    speedMph: 8.6,
    scheduledMph: 8.0,
    riderHours: 2140,
    lane: "yes",
    ace: true,
    tsp: true,
    hours: [0.06, 0.1, 0.16, 0.22, 0.3, 0.28, 0.24, 0.18, 0.14, 0.1, 0.08, 0.06],
  },
  {
    id: "third-96-125-nb",
    routeSlug: "m101",
    direction: "NB",
    from: "E 96 St",
    to: "E 125 St",
    speedMph: 5.0,
    scheduledMph: 6.8,
    riderHours: 10120,
    lane: "partial",
    ace: false,
    tsp: true,
    hours: [0.1, 0.14, 0.2, 0.4, 0.7, 0.78, 0.66, 0.44, 0.28, 0.18, 0.12, 0.1],
  },
  {
    id: "flatbush-prospect-kings-sb",
    routeSlug: "b41",
    direction: "SB",
    from: "Prospect Park",
    to: "Kings Hwy",
    speedMph: 5.6,
    scheduledMph: 7.0,
    riderHours: 9720,
    lane: "minimal",
    ace: false,
    tsp: false,
    hours: [0.08, 0.12, 0.2, 0.38, 0.58, 0.62, 0.52, 0.36, 0.24, 0.16, 0.12, 0.08],
  },
  {
    id: "utica-dekalb-eastern-nb",
    routeSlug: "b46-sbs",
    direction: "NB",
    from: "DeKalb Av",
    to: "Eastern Pkwy",
    speedMph: 5.1,
    scheduledMph: 6.9,
    riderHours: 12180,
    lane: "partial",
    ace: true,
    tsp: false,
    hours: [0.1, 0.16, 0.28, 0.48, 0.7, 0.72, 0.64, 0.42, 0.3, 0.2, 0.14, 0.1],
  },
  {
    id: "myrtle-freshpond-ridgewood-eb",
    routeSlug: "q58",
    direction: "EB",
    from: "Fresh Pond Rd",
    to: "Ridgewood Terminal",
    speedMph: 6.2,
    scheduledMph: 7.3,
    riderHours: 8210,
    lane: "none",
    ace: false,
    tsp: false,
    hours: [0.06, 0.1, 0.18, 0.32, 0.46, 0.5, 0.44, 0.3, 0.2, 0.14, 0.1, 0.06],
  },
];

export const studioFindings: readonly StudioFinding[] = [
  {
    id: "full-treatment-still-declining",
    category: "Anomaly",
    routeSlug: "m15-sbs",
    title: "Full treatment stack, still declining",
    body: "M15 SBS has bus lanes, ACE enforcement, and signal priority across much of the East Side corridor, yet PM-peak speed declined over the past 14 months.",
    metric: "-0.6 mph PM-peak trend",
    confidence: "high",
  },
  {
    id: "bus-lane-ends-where-slowness-begins",
    category: "Treatment gap",
    routeSlug: "m101",
    title: "Bus lane ends exactly where the slowness begins",
    body: "The 3 Av bus lane terminates at the same edge where the slowest northbound segments begin, with no scheduled ACE or TSP backstop.",
    metric: "38% lane coverage",
    confidence: "high",
  },
  {
    id: "q58-three-year-decline",
    category: "Emerging risk",
    routeSlug: "q58",
    title: "Three-year decline, no intervention scheduled",
    body: "Q58 is deteriorating steadily and is on pace to enter the bottom decile of local routes without a matching capital plan.",
    metric: "Q3 2026 projected bottom decile",
    confidence: "moderate",
  },
];

export const studioBriefs: readonly StudioBrief[] = [
  {
    id: "m15-madison-corridor",
    routeSlug: "m15-sbs",
    title: "M15 SBS: the Madison gap",
    status: "Published",
    summary:
      "A cited route brief showing how one 1.5 mile corridor accounts for a large share of observed rider delay.",
    claims: [
      "Madison Avenue accounts for 43% of the route's measured rider-hour delay.",
      "Treatment coverage stops before the worst segment begins.",
      "The caveat is attribution: congestion pricing overlaps with ACE timing.",
    ],
  },
  {
    id: "bx12-positive-control",
    routeSlug: "bx12-sbs",
    title: "Bx12 SBS as positive control",
    status: "In review",
    summary:
      "A peer route brief explaining what a stronger SBS treatment stack can make visible in comparison.",
    claims: [
      "Lane coverage and enforcement are materially higher than on the comparison route.",
      "Rider-hour losses concentrate in fewer blocks.",
    ],
  },
];

const routesBySlug = new Map(studioRoutes.map((route) => [route.slug, route]));
const findingsById = new Map(studioFindings.map((finding) => [finding.id, finding]));
const briefsById = new Map(studioBriefs.map((brief) => [brief.id, brief]));

export function getStudioRoute(slug: string | undefined): StudioRoute | undefined {
  return routesBySlug.get(slug ?? "");
}

export function getStudioFinding(id: string | undefined): StudioFinding | undefined {
  return findingsById.get(id ?? "");
}

export function getStudioBrief(id: string | undefined): StudioBrief | undefined {
  return briefsById.get(id ?? "");
}

export function routeSegments(slug: string): readonly StudioSegment[] {
  return studioSegments.filter((segment) => segment.routeSlug === slug);
}
