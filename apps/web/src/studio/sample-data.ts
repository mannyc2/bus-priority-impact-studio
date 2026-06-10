import type {
  StudioBrief,
  StudioDocsEndpoint,
  StudioDocsSection,
  StudioFinding,
  StudioMethodDataset,
  StudioQuality,
  StudioReleasePayload,
  StudioRoute,
  StudioSegment,
} from "./api-contract.js";
import { StudioReleasePayloadSchema } from "./api-contract.js";

export type StudioVersion = {
  briefId: string;
  v: string;
  date: string;
  author: string;
  summary: string;
  claimsCount: number;
  citesCount: number;
  caveatsCount: number;
};

export type StudioCommentReply = { author: string; initials: string; ago: string; body: string };

export type StudioComment = {
  id: string;
  briefId: string;
  claimN: number;
  kind: "comment" | "change-requested";
  author: string;
  initials: string;
  ago: string;
  on: string;
  body: string;
  resolved?: boolean;
  replies?: StudioCommentReply[];
};

export type StudioMethodsNote = {
  id: string;
  section: "Datasets" | "Caveats" | "Glossary" | "Computed metrics" | "Qualitative sources";
  title: string;
  body: string;
};

export const studioRoutes: StudioRoute[] = [
  {
    slug: "m15-sbs",
    routeId: "M15+",
    label: "M15",
    corridor: "1 Av / 2 Av and Madison corridor",
    corridorFull: "1st Avenue / 2nd Avenue Select Bus Service",
    borough: "Manhattan",
    sbs: true,
    speedMph: 4.2,
    scheduledMph: 7.1,
    weightedAvgSpeed: 6.74,
    speedPercentile: 7,
    dailyRiders: 37200,
    ridersYoyPct: -4.1,
    riderHoursLost: 4310,
    laneCoverage: 72,
    aceStatus: "active",
    aceSince: "Nov 2019",
    tspCoverage: "partial",
    reliability: "Worst SBS route in Manhattan",
    observedReliability: {
      month: "2026-03",
      runId: "bus-observatory-2026-03",
      source: "third_party_recovered",
      releaseLayer: "observed_release",
      reliabilityStatus: "observed",
      sampleCount: 2829,
      medianObservedHeadwayMinutes: 15.7,
      p90ObservedHeadwayMinutes: 66.5,
      observedBunchingShare: 0.11,
      observedLongGapShare: 0.41,
      excessWaitMinutes: null,
      caveats: [
        "Observed reliability is recovered from the third-party Bus Observatory archive, not official MTA historical replay.",
      ],
    },
    diagnosis:
      "Full treatment stack on 72% of route, yet PM-peak speed has declined 0.6 mph over 14 months. Madison Av shows no correlated violation reduction.",
    spark: [6.8, 6.2, 5.4, 4.8, 4.2, 4.5, 5.1],
    termini: { north: "E 125 St - East Harlem", south: "South Ferry - Lower Manhattan" },
    miles: 8.4,
    stops: 33,
    flags: ["ACE active", "Bus lane", "TSP partial"],
    peerSlug: "m15-local",
    movement6mPct: null,
    context12mPct: null,
    interventions: [
      {
        year: "2010",
        title: "SBS launches",
        detail: "Off-board fare collection, all-door boarding.",
      },
      {
        year: "2019",
        title: "ACE enforcement begins",
        detail: "Camera-based bus-lane enforcement activated.",
      },
      {
        year: "2023",
        title: "Bus lane redesign",
        detail: "E 23 St -> E 14 St corridor restriped, new transit-only signals.",
      },
      {
        year: "2025",
        title: "ACE all-day rollout",
        detail: "Enforcement extends from peak to all-day operations.",
      },
      {
        year: "2025",
        title: "Congestion pricing introduced",
        detail: "CBD tolling launches Jan 2025; overlaps ACE expansion.",
      },
    ],
  },
  {
    slug: "bx12-sbs",
    routeId: "Bx12+",
    label: "Bx12",
    corridor: "Fordham Road / Pelham Parkway",
    corridorFull: "Fordham Rd / Pelham Pkwy Select Bus Service",
    borough: "Bronx",
    sbs: true,
    speedMph: 8.6,
    scheduledMph: 8.1,
    weightedAvgSpeed: 8.61,
    speedPercentile: 62,
    dailyRiders: 39400,
    ridersYoyPct: 1.8,
    riderHoursLost: 1860,
    laneCoverage: 94,
    aceStatus: "active",
    aceSince: "Mar 2020",
    tspCoverage: "yes",
    reliability: "Positive control route",
    observedReliability: null,
    diagnosis:
      "A fuller treatment stack with concrete lanes and TSP makes Bx12 a useful peer benchmark for slower SBS corridors.",
    spark: [7.4, 7.8, 8.1, 8.6, 8.4, 8.7, 8.6],
    termini: { north: "Inwood - 207 St", south: "Pelham Bay Park" },
    miles: 7.9,
    stops: 29,
    flags: ["ACE active", "Concrete lane", "TSP active"],
    peerSlug: "m15-sbs",
    movement6mPct: null,
    context12mPct: null,
    interventions: [
      {
        year: "2013",
        title: "SBS launches",
        detail: "Fordham Rd corridor selected for fast bus pilot.",
      },
      {
        year: "2020",
        title: "ACE enforcement begins",
        detail: "Camera coverage starts on Fordham Rd.",
      },
      {
        year: "2022",
        title: "Concrete lane upgrade",
        detail: "4 miles of painted lane upgraded to concrete curb-protected.",
      },
      {
        year: "2023",
        title: "TSP installed",
        detail: "Transit signal priority on Bronx P (Pelham Parkway) corridor.",
      },
      {
        year: "2025",
        title: "ACE all-day rollout",
        detail: "All-day enforcement window starts May 2025.",
      },
    ],
  },
  {
    slug: "m101",
    routeId: "M101",
    label: "M101",
    corridor: "3 Av / Lexington Av",
    corridorFull: "3rd Avenue / Lexington Avenue Local",
    borough: "Manhattan",
    sbs: false,
    speedMph: 5.0,
    scheduledMph: 6.8,
    weightedAvgSpeed: 5.4,
    speedPercentile: 18,
    dailyRiders: 18900,
    ridersYoyPct: -1.2,
    riderHoursLost: 10120,
    laneCoverage: 38,
    aceStatus: "none",
    aceSince: null,
    tspCoverage: "partial",
    reliability: "Treatment edge case",
    observedReliability: null,
    diagnosis:
      "The northbound delay begins near the edge of the dedicated-lane network, making it a useful treatment-gap example.",
    spark: [6.4, 6.1, 5.8, 5.3, 5.0, 5.1, 5.0],
    termini: { north: "E 125 St - Harlem", south: "E 14 St - Union Sq" },
    miles: 6.1,
    stops: 38,
    flags: ["Bus lane partial"],
    peerSlug: "m15-sbs",
    movement6mPct: null,
    context12mPct: null,
    interventions: [
      {
        year: "2018",
        title: "Bus lane painted",
        detail: "Painted lane installed E 14 -> E 96 St.",
      },
      {
        year: "2024",
        title: "Lane gap study",
        detail: "DOT flagged the E 96 -> 125 corridor for capital review.",
      },
    ],
  },
  {
    slug: "b41",
    routeId: "B41",
    label: "B41",
    corridor: "Flatbush Avenue",
    corridorFull: "Flatbush Avenue Local",
    borough: "Brooklyn",
    sbs: false,
    speedMph: 5.6,
    scheduledMph: 7.0,
    weightedAvgSpeed: 5.9,
    speedPercentile: 22,
    dailyRiders: 21800,
    ridersYoyPct: -3.4,
    riderHoursLost: 9720,
    laneCoverage: 24,
    aceStatus: "none",
    aceSince: null,
    tspCoverage: "none",
    reliability: "Counter-pattern",
    observedReliability: null,
    diagnosis:
      "Speed is declining even while ridership softens, pointing away from boarding demand as the main explanation.",
    spark: [6.9, 6.5, 6.1, 5.8, 5.7, 5.6, 5.6],
    termini: { north: "Downtown Brooklyn", south: "Kings Plaza" },
    miles: 7.4,
    stops: 36,
    flags: ["Lane minimal"],
    peerSlug: "b46-sbs",
    movement6mPct: null,
    context12mPct: null,
    interventions: [
      {
        year: "2021",
        title: "Bus stop consolidation",
        detail: "Stop spacing increased on Flatbush Av south.",
      },
    ],
  },
  {
    slug: "b46-sbs",
    routeId: "B46+",
    label: "B46",
    corridor: "Utica Avenue",
    corridorFull: "Utica Avenue Select Bus Service",
    borough: "Brooklyn",
    sbs: true,
    speedMph: 5.1,
    scheduledMph: 6.9,
    weightedAvgSpeed: 5.7,
    speedPercentile: 16,
    dailyRiders: 28100,
    ridersYoyPct: -2.0,
    riderHoursLost: 12180,
    laneCoverage: 33,
    aceStatus: "active",
    aceSince: "Jul 2021",
    tspCoverage: "none",
    reliability: "Split-corridor risk",
    observedReliability: null,
    diagnosis:
      "Speeds improved south of the congestion boundary while northern segments continued to deteriorate.",
    spark: [6.1, 5.9, 5.7, 5.3, 5.0, 5.2, 5.1],
    termini: { north: "Williamsburg Bridge Plaza", south: "Kings Plaza" },
    miles: 8.0,
    stops: 31,
    flags: ["ACE active", "Lane partial"],
    peerSlug: "bx12-sbs",
    movement6mPct: null,
    context12mPct: null,
    interventions: [
      { year: "2016", title: "SBS launches", detail: "Utica corridor selected for fast bus." },
      { year: "2021", title: "ACE begins", detail: "Camera enforcement active on Utica Av." },
      {
        year: "2025",
        title: "Congestion pricing",
        detail: "CBD tolling launches; northbound trip patterns shift.",
      },
    ],
  },
  {
    slug: "q58",
    routeId: "Q58",
    label: "Q58",
    corridor: "Myrtle / Ridgewood",
    corridorFull: "Myrtle Avenue Local",
    borough: "Queens/Brooklyn",
    sbs: false,
    speedMph: 6.2,
    scheduledMph: 7.3,
    weightedAvgSpeed: 6.3,
    speedPercentile: 31,
    dailyRiders: 16400,
    ridersYoyPct: -0.4,
    riderHoursLost: 8210,
    laneCoverage: 12,
    aceStatus: "none",
    aceSince: null,
    tspCoverage: "none",
    reliability: "No intervention scheduled",
    observedReliability: null,
    diagnosis:
      "A steady three-year decline has not yet produced a matching bus priority intervention plan.",
    spark: [7.1, 6.8, 6.7, 6.5, 6.3, 6.2, 6.2],
    termini: { north: "Flushing - Main St", south: "Ridgewood Terminal" },
    miles: 9.6,
    stops: 47,
    flags: ["No bus lane", "No ACE"],
    peerSlug: "bx12-sbs",
    movement6mPct: null,
    context12mPct: null,
    interventions: [],
  },
  {
    slug: "m14a-sbs",
    routeId: "M14A+",
    label: "M14A",
    corridor: "14 St Crosstown / Av A",
    corridorFull: "14 St Crosstown / Avenue A Select Bus Service",
    borough: "Manhattan",
    sbs: true,
    speedMph: 7.4,
    scheduledMph: 7.8,
    weightedAvgSpeed: 7.5,
    speedPercentile: 58,
    dailyRiders: 17800,
    ridersYoyPct: 3.2,
    riderHoursLost: 2640,
    laneCoverage: 88,
    aceStatus: "active",
    aceSince: "May 2023",
    tspCoverage: "partial",
    reliability: "Reversed declining trend",
    observedReliability: null,
    diagnosis:
      "Busway design + ACE produced a 0.8 mph PM-peak gain over 14 months. Comparable benchmark for ACE-effective corridors.",
    spark: [6.5, 6.7, 6.9, 7.1, 7.3, 7.4, 7.4],
    termini: { north: "Av A / E 14 St", south: "Chelsea Piers / W 14 St" },
    miles: 2.4,
    stops: 14,
    flags: ["Busway", "ACE active"],
    peerSlug: "m14d-sbs",
    movement6mPct: null,
    context12mPct: null,
    interventions: [
      {
        year: "2019",
        title: "Busway launches",
        detail: "14 St becomes through-traffic restricted.",
      },
      {
        year: "2023",
        title: "ACE begins",
        detail: "Camera enforcement formalizes busway compliance.",
      },
    ],
  },
  {
    slug: "m14d-sbs",
    routeId: "M14D+",
    label: "M14D",
    corridor: "14 St Crosstown / Av D",
    corridorFull: "14 St Crosstown / Avenue D Select Bus Service",
    borough: "Manhattan",
    sbs: true,
    speedMph: 7.2,
    scheduledMph: 7.6,
    weightedAvgSpeed: 7.3,
    speedPercentile: 52,
    dailyRiders: 9800,
    ridersYoyPct: 2.1,
    riderHoursLost: 2210,
    laneCoverage: 88,
    aceStatus: "active",
    aceSince: "May 2023",
    tspCoverage: "partial",
    reliability: "Same busway, weaker effect",
    observedReliability: null,
    diagnosis: "Shares the 14 St busway with M14A. Slightly lower frequency masks per-rider gains.",
    spark: [6.7, 6.8, 6.9, 7.0, 7.1, 7.2, 7.2],
    termini: { north: "Av D / E 14 St", south: "Chelsea Piers / W 14 St" },
    miles: 2.4,
    stops: 14,
    flags: ["Busway", "ACE active"],
    peerSlug: "m14a-sbs",
    movement6mPct: null,
    context12mPct: null,
    interventions: [
      {
        year: "2019",
        title: "Busway launches",
        detail: "14 St becomes through-traffic restricted.",
      },
      {
        year: "2023",
        title: "ACE begins",
        detail: "Camera enforcement formalizes busway compliance.",
      },
    ],
  },
];

export const studioSegments: StudioSegment[] = [
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
    miles: 1.5,
    timepoints: 4,
    flagged: true,
    aiNote:
      "Bus lane on this segment is painted on the southern third only. ACE enforcement does not extend to Madison Av. The treatment gap aligns exactly with the slow window.",
    suggestedSeeds: [
      "This segment accounts for 43% of route delay",
      "Buses run slower than walking pace 11 hours/day",
      "Bus lane coverage is incomplete on this corridor",
      "ACE enforcement does not extend to Madison Av",
    ],
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
    miles: 1.0,
    timepoints: 3,
  },
  {
    id: "first-86-96-nb",
    routeSlug: "m15-sbs",
    direction: "NB",
    from: "E 86 St",
    to: "E 96 St",
    speedMph: 5.8,
    scheduledMph: 7.1,
    riderHours: 4180,
    lane: "yes",
    ace: true,
    tsp: false,
    hours: [0.1, 0.14, 0.22, 0.4, 0.55, 0.5, 0.42, 0.34, 0.26, 0.2, 0.16, 0.12],
    miles: 0.5,
    timepoints: 2,
  },
  {
    id: "second-60-42-sb",
    routeSlug: "m15-sbs",
    direction: "SB",
    from: "E 60 St",
    to: "E 42 St",
    speedMph: 5.3,
    scheduledMph: 7.0,
    riderHours: 6240,
    lane: "yes",
    ace: true,
    tsp: false,
    hours: [0.08, 0.12, 0.22, 0.42, 0.6, 0.56, 0.46, 0.36, 0.28, 0.22, 0.18, 0.14],
    miles: 0.9,
    timepoints: 3,
  },
  {
    id: "second-23-14-sb",
    routeSlug: "m15-sbs",
    direction: "SB",
    from: "E 23 St",
    to: "E 14 St",
    speedMph: 6.3,
    scheduledMph: 7.2,
    riderHours: 3870,
    lane: "yes",
    ace: true,
    tsp: false,
    hours: [0.06, 0.08, 0.16, 0.32, 0.46, 0.42, 0.36, 0.3, 0.24, 0.18, 0.14, 0.1],
    miles: 0.5,
    timepoints: 2,
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
    miles: 1.2,
    timepoints: 4,
  },
  {
    id: "pelham-bx-bay-eb",
    routeSlug: "bx12-sbs",
    direction: "EB",
    from: "Pelham Pkwy",
    to: "Bay Plaza",
    speedMph: 9.2,
    scheduledMph: 8.4,
    riderHours: 1640,
    lane: "yes",
    ace: true,
    tsp: true,
    hours: [0.05, 0.08, 0.12, 0.18, 0.22, 0.2, 0.18, 0.14, 0.1, 0.08, 0.06, 0.04],
    miles: 1.8,
    timepoints: 3,
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
    miles: 1.4,
    timepoints: 4,
    flagged: true,
    aiNote:
      "The painted bus lane terminates at E 96 St. No ACE coverage above that point. The slowest segments begin exactly at the lane edge.",
    suggestedSeeds: [
      "The bus lane ends where the slowness starts",
      "No ACE coverage above E 96 St",
      "Speed deteriorates only on the un-treated stretch",
    ],
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
    miles: 2.2,
    timepoints: 5,
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
    miles: 1.8,
    timepoints: 5,
    flagged: true,
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
    miles: 1.4,
    timepoints: 3,
  },
];

export const studioFindings: StudioFinding[] = [
  {
    id: "m15-full-treatment-still-declining",
    category: "Anomaly",
    routeSlug: "m15-sbs",
    title: "Full treatment stack, still declining",
    body: "M15 SBS has bus lanes, ACE enforcement, and signal priority across 72% of the East Side corridor, yet PM-peak speed declined 0.6 mph over the past 14 months.",
    metric: "-0.6 mph",
    confidence: "high",
    borough: "Manhattan",
    reasoning: [
      {
        index: 1,
        title: "Observed behavior",
        detail:
          "M15 SBS PM-peak speed: 6.2 mph (Mar 2026 median). Route-wide 14-month trend: -0.6 mph.",
        source: "MTA Bus Speeds - segment-level - Mar 2026",
        tone: "accent",
      },
      {
        index: 2,
        title: "Treatment inventory",
        detail:
          "Bus lane (72% of route), ACE (active since Nov 2019, extended to all-day May 2025), TSP (partial).",
        source: "NYC DOT bus lane GIS - MTA ACE program record",
        tone: "accent",
      },
      {
        index: 3,
        title: "Expected behavior",
        detail:
          "Routes with this treatment stack typically stabilize or improve within 60 days of full enforcement. 6 of 8 comparable routes did so.",
        source: "Internal comparison - 8 SBS routes, 2019-2026",
        tone: "accent",
      },
      {
        index: 4,
        title: "Gap identified",
        detail:
          "Madison Av segment (E 28-58 St) shows no correlated violation reduction despite adjacent ACE coverage. Lane is painted-only on the southern third.",
        source: "MTA ACE violations - NYC DOT lane type classification",
        tone: "warn",
      },
      {
        index: 5,
        title: "Conclusion",
        detail:
          "Structural lane-blockage on Madison Av is the most consistent explanation (4/8 comparable anomalies). Signal timing lag is second (2/8).",
        source: "Pattern match across anomaly library - May 2026",
        tone: "accent",
      },
    ],
    caveat: {
      title: "What this finding cannot tell you",
      body: "The congestion pricing launch (Jan 2025) coincides with part of the observation window. This finding controls for ACE-segment-specific data only - route-wide congestion effects are not disaggregated here. Use the route view to inspect individual segment trends.",
    },
    comparableRoutes: [
      {
        slug: "m14a-sbs",
        label: "M14A",
        sbs: true,
        outcome: "reversed",
        delta: "+0.8 mph",
        detail: "ACE activated May 2023",
      },
      {
        slug: "m14d-sbs",
        label: "M14D",
        sbs: true,
        outcome: "reversed",
        delta: "+0.5 mph",
        detail: "ACE activated May 2023",
      },
      {
        slug: "b46-sbs",
        label: "B46",
        sbs: true,
        outcome: "reversed",
        delta: "+0.3 mph",
        detail: "ACE + TSP together",
      },
      {
        slug: "q58",
        label: "Q58",
        sbs: false,
        outcome: "declining",
        delta: "-0.4 mph",
        detail: "18 months, no intervention",
      },
    ],
  },
  {
    id: "b41-counter-pattern",
    category: "Anomaly",
    routeSlug: "b41",
    title: "Speed declining alongside ridership - counter-pattern",
    body: "B41 speed is declining even as ridership softens, which rules out boarding-time pressure as the explanation. The remaining candidates are signal timing, lane blockage, and traffic mix.",
    metric: "down both",
    confidence: "moderate",
    borough: "Brooklyn",
    reasoning: [
      {
        index: 1,
        title: "Observed behavior",
        detail: "B41 speed: -1.3 mph (24 months). Ridership: -3.4% YoY.",
        source: "MTA Bus Speeds + ridership exports",
        tone: "accent",
      },
      {
        index: 2,
        title: "Treatment inventory",
        detail: "Painted lane on 24% of route. No ACE. No TSP.",
        source: "NYC DOT bus lane GIS",
        tone: "accent",
      },
      {
        index: 3,
        title: "Expected behavior",
        detail:
          "Speed declines paired with ridership growth usually point to boarding-time saturation. That pattern is absent here.",
        source: "Internal cohort analysis",
        tone: "accent",
      },
      {
        index: 4,
        title: "Gap identified",
        detail:
          "No correlated growth signal. Slowdown candidates narrow to signal timing, lane blockage, and through-traffic mix.",
        source: "Inferred from elimination",
        tone: "warn",
      },
      {
        index: 5,
        title: "Conclusion",
        detail: "Recommend a corridor-level lane blockage study; ACE pilot candidate.",
        source: "Anomaly library",
        tone: "accent",
      },
    ],
    caveat: {
      title: "Confidence is moderate, not high",
      body: "No direct measurement of lane blockage exists on Flatbush Av below Prospect Park. The conclusion is inferred from ruling out other candidates.",
    },
    comparableRoutes: [
      {
        slug: "b46-sbs",
        label: "B46",
        sbs: true,
        outcome: "flat",
        delta: "0.0 mph",
        detail: "Comparable corridor, weaker decline",
      },
    ],
  },
  {
    id: "bx12-ace-unchanged-violations",
    category: "Treatment gap",
    routeSlug: "bx12-sbs",
    title: "ACE active 18 months, violations unchanged",
    body: "Bx12 ACE coverage has been active for 18 months, but recorded violations on Fordham Rd are within 2% of pre-rollout. Either compliance is high or detection coverage is thin.",
    metric: "+2%",
    confidence: "high",
    borough: "Bronx",
    reasoning: [
      {
        index: 1,
        title: "Observed behavior",
        detail: "Bx12 violation count: +2% vs. pre-ACE baseline.",
        source: "MTA ACE program record",
        tone: "accent",
      },
      {
        index: 2,
        title: "Treatment inventory",
        detail: "ACE on 94% of route. Concrete lane on 4 miles.",
        source: "NYC DOT",
        tone: "accent",
      },
      {
        index: 3,
        title: "Expected behavior",
        detail: "Comparable concrete-lane corridors saw 30-60% violation drop post-ACE.",
        source: "Comparison cohort",
        tone: "accent",
      },
      {
        index: 4,
        title: "Gap identified",
        detail:
          "Either real compliance is already high (success), or camera placement leaves gaps (instrumentation failure).",
        source: "Camera placement audit",
        tone: "warn",
      },
      {
        index: 5,
        title: "Conclusion",
        detail: "Worth a camera-placement audit before claiming ACE success on this route.",
        source: "Anomaly library",
        tone: "accent",
      },
    ],
    caveat: {
      title: "Two equally plausible readings",
      body: "This finding flags an unusual data shape; it does not adjudicate between high-compliance and low-detection. The route view is the right place to inspect raw violation density.",
    },
    comparableRoutes: [],
  },
  {
    id: "m101-lane-ends-slowness-begins",
    category: "Treatment gap",
    routeSlug: "m101",
    title: "Bus lane ends exactly where the slowness begins",
    body: "On M101, the 3 Av bus lane terminates at E 96 St. The slowest northbound segments begin at exactly the same point, with no scheduled ACE or TSP backstop.",
    metric: "38%",
    confidence: "high",
    borough: "Manhattan",
    reasoning: [
      {
        index: 1,
        title: "Observed behavior",
        detail:
          "M101 northbound speed drops from 6.6 mph (with lane) to 4.4 mph (without) at E 96 St.",
        source: "MTA Bus Speeds - segment level",
        tone: "accent",
      },
      {
        index: 2,
        title: "Treatment inventory",
        detail: "Painted bus lane on 38% of route. No ACE. TSP partial.",
        source: "NYC DOT bus lane GIS",
        tone: "accent",
      },
      {
        index: 3,
        title: "Expected behavior",
        detail:
          "Speed continuity is the norm even at lane edges where through-traffic patterns are stable.",
        source: "Comparable lane-edge studies",
        tone: "accent",
      },
      {
        index: 4,
        title: "Gap identified",
        detail: "The lane gap aligns exactly with the slow window. No ACE backstop above the gap.",
        source: "GIS overlay",
        tone: "warn",
      },
      {
        index: 5,
        title: "Conclusion",
        detail:
          "M101 is a clean treatment-gap case for extending the painted lane northbound. Strong brief candidate.",
        source: "Anomaly library",
        tone: "accent",
      },
    ],
    caveat: {
      title: "Capital plan dependency",
      body: "DOT has no concrete-lane upgrade scheduled in the FY26-28 capital plan for this corridor. Any intervention requires a budget action, not just a paint refresh.",
    },
    comparableRoutes: [
      {
        slug: "m14a-sbs",
        label: "M14A",
        sbs: true,
        outcome: "reversed",
        delta: "+0.8 mph",
        detail: "Filled comparable gap with busway",
      },
    ],
  },
  {
    id: "b46-split-corridor",
    category: "Emerging risk",
    routeSlug: "b46-sbs",
    title: "Congestion pricing creating a split-corridor effect",
    body: "Since CBD congestion pricing launched, B46 SBS shows improving speeds south of Eastern Pkwy and worsening speeds north of it. The route is splitting in two under one operating plan.",
    metric: "-0.4 mph",
    confidence: "moderate",
    borough: "Brooklyn",
    reasoning: [
      {
        index: 1,
        title: "Observed behavior",
        detail: "B46 NB: -0.4 mph (Jan 2025 -> Mar 2026). B46 SB south of Eastern Pkwy: +0.2 mph.",
        source: "MTA Bus Speeds + congestion-pricing onset date",
        tone: "accent",
      },
      {
        index: 2,
        title: "Treatment inventory",
        detail: "ACE active full route. Painted lane partial. No TSP.",
        source: "NYC DOT",
        tone: "accent",
      },
      {
        index: 3,
        title: "Expected behavior",
        detail: "Congestion pricing should help downtown-adjacent corridors uniformly.",
        source: "Pre-pricing model",
        tone: "accent",
      },
      {
        index: 4,
        title: "Gap identified",
        detail:
          "The split correlates spatially with the congestion zone boundary, not with treatment changes.",
        source: "Spatial join with CBD zone",
        tone: "warn",
      },
      {
        index: 5,
        title: "Conclusion",
        detail:
          "B46 may need a split operating plan; recommend a brief that explicitly proposes corridor segmentation.",
        source: "Anomaly library",
        tone: "accent",
      },
    ],
    caveat: {
      title: "Moderate confidence",
      body: "The split signal is consistent across 4 of 5 months but the post-pricing window is short. Recommend re-running this in Q4 2026.",
    },
    comparableRoutes: [],
  },
  {
    id: "q58-three-year-decline",
    category: "Emerging risk",
    routeSlug: "q58",
    title: "Three-year decline, no intervention scheduled",
    body: "Q58 is deteriorating steadily and is on pace to enter the bottom decile of local routes by Q3 2026 without a matching capital plan.",
    metric: "Q3 2026",
    confidence: "moderate",
    borough: "Queens/Brooklyn",
    reasoning: [
      {
        index: 1,
        title: "Observed behavior",
        detail: "Q58: -0.9 mph over 3 years. Decile rank trajectory: 38 -> 22 -> 12.",
        source: "MTA Bus Speeds - long horizon",
        tone: "accent",
      },
      {
        index: 2,
        title: "Treatment inventory",
        detail: "No bus lane. No ACE. No TSP.",
        source: "NYC DOT",
        tone: "accent",
      },
      {
        index: 3,
        title: "Expected behavior",
        detail:
          "Routes with this trajectory typically receive a treatment proposal within 24 months.",
        source: "Capital-plan history",
        tone: "accent",
      },
      {
        index: 4,
        title: "Gap identified",
        detail: "No bus-priority proposal exists in the public capital plan through FY28.",
        source: "DOT capital plan FY26-28",
        tone: "warn",
      },
      {
        index: 5,
        title: "Conclusion",
        detail:
          "Q58 belongs on a watchlist; recommend a brief that prioritizes this corridor in the next capital-plan cycle.",
        source: "Anomaly library",
        tone: "accent",
      },
    ],
    caveat: {
      title: "Decline is real; cause is mixed",
      body: "Some of the decline reflects a real underlying slowdown; some reflects route restructuring in 2023. The brief should disaggregate the two.",
    },
    comparableRoutes: [],
  },
];

export const studioBriefs: StudioBrief[] = [
  {
    id: "m15-madison-corridor",
    routeSlug: "m15-sbs",
    title: "The Madison corridor problem",
    status: "In review",
    version: "v0.4",
    generated: "2026-05-12",
    authors: ["C. Pherson", "J. Lim"],
    citationCount: 23,
    summary:
      "A cited route brief showing how one 1.5 mile corridor accounts for a large share of observed rider delay.",
    dek: "Across March 2026, the M15 SBS ran at 6.74 mph weighted average - slower than every other Manhattan SBS route. A single corridor, Madison Avenue between 28th and 58th Streets, accounted for 18,420 rider-hours of delay per weekday - roughly 43% of the route's total measured lost time.",
    kpis: [
      {
        label: "Weighted avg speed",
        value: "6.74",
        unit: "mph",
        sub: "7th percentile of NYC SBS routes",
        tone: "warn",
      },
      { label: "Worst-segment riders/day", value: "18.4K", sub: "rider-hours lost", tone: "bad" },
      { label: "ACE violations Y/Y", value: "-68%", sub: "enforcement effect", tone: "good" },
    ],
    sections: [
      {
        title: "The slow corridor",
        sub: "Madison Av / E 28 St - Madison Av / E 58 St (northbound)",
        body: [
          "On this 1.5-mile stretch, M15 SBS buses average 4.2 mph - slower than walking pace for the median rider, and well below the corridor's own scheduled timepoint expectation of 7.1 mph. The slowest hours are 16:00-19:00, when severity exceeds the route's 90th percentile for 11 consecutive hour-blocks.",
          "The segment is currently a painted bus lane only on the southern third (E 28-38 St). DOT has no concrete-lane upgrade scheduled in the FY26-28 capital plan.",
        ],
        callout: {
          variant: "warn",
          title: 'What "speed" means here.',
          body: "MTA segment speeds reflect real rider experience - they include dwell time, traffic, signals, and stops. Read as observed bus travel speed, not pure traffic speed. Bus-lane installs raise this number; route restructurings can lower it without buses being slower.",
        },
        figure: { kind: "map", label: "Madison Av - 28->58 St - NB" },
      },
      {
        title: "What's been tried, and what we can defend saying",
        body: [
          "ACE all-day enforcement rolled out in May 2025, coinciding with the introduction of CBD congestion pricing in January 2025. Across the M15 corridor, PM-peak speed rose 0.7 mph in the 60 days after the ACE rollout - but we cannot cleanly attribute that change to ACE alone given the overlapping pricing change.",
          "On segments where neither intervention applies, the gain is not observed. That's the defensible claim: the combined ACE + pricing context produced the gain, not ACE alone.",
        ],
      },
    ],
    claims: [
      {
        n: 1,
        title: "M15 SBS is the slowest SBS route in Manhattan",
        strength: 5,
        evidenceIds: ["e-m15-speed-percentile", "e-m15-weighted-speed"],
        caveatIds: ["c-observed-speed"],
      },
      {
        n: 2,
        title: "A single corridor accounts for 43% of measured delay",
        body: "A 1.5-mile stretch of Madison Avenue (E 28 St -> E 58 St, NB) accounts for 43% of the M15 SBS's total measured rider-hour delay.",
        strength: 4,
        evidenceIds: [
          "e-madison-rh-share",
          "e-segment-rh-chart",
          "e-madison-rh-day",
          "e-m1-pilot-windowing",
        ],
        caveatIds: ["c-observed-speed", "c-single-month"],
        state: "editing",
      },
      {
        n: 3,
        title: "ACE rollout coincides with +0.7 mph PM-peak gain",
        strength: 3,
        evidenceIds: ["e-ace-before-after", "e-violations-yoy"],
        caveatIds: ["c-attribution-overlap"],
      },
      {
        n: 4,
        title: "Treatment gap on Madison Av",
        strength: 2,
        evidenceIds: ["e-lane-geometry"],
        caveatIds: [],
        state: "weak",
      },
    ],
    evidence: [
      {
        id: "e-m15-speed-percentile",
        kind: "number",
        title: "7th percentile - M15 weighted speed",
        detail: "Among NYC SBS routes, Mar 2026 baseline.",
      },
      {
        id: "e-m15-weighted-speed",
        kind: "number",
        title: "6.74 mph weighted avg speed",
        detail: "M15 SBS, Mar 2026 weekday median.",
      },
      {
        id: "e-madison-rh-share",
        kind: "number",
        title: "43% - Madison share of route delay",
        detail: "Computed: 18,420 / 42,890 RH per day - M1 pilot.",
      },
      {
        id: "e-segment-rh-chart",
        kind: "chart",
        title: "Rider-hours by segment, Mar 2026",
        detail: "MTA Bus Speeds - weekday median, n = 2,003.",
      },
      {
        id: "e-madison-rh-day",
        kind: "number",
        title: "18,420 rider-hours / day - Madison segment",
        detail: "M1 pilot - 168 ridership windows.",
      },
      {
        id: "e-m1-pilot-windowing",
        kind: "source",
        title: "M15 SBS Wiki - Madison corridor analysis",
        detail: "Project wiki, methodology section.",
      },
      {
        id: "e-ace-before-after",
        kind: "chart",
        title: "Before/after - ACE all-day rollout",
        detail: "60-day windows, ACE-enforced segments only.",
      },
      {
        id: "e-violations-yoy",
        kind: "number",
        title: "-68% ACE violations Y/Y",
        detail: "MTA ACE program record.",
      },
      {
        id: "e-lane-geometry",
        kind: "chart",
        title: "DOT bus-lane geometry - Madison Av",
        detail: "NYC DOT bus lane GIS, painted-vs-concrete classification.",
      },
    ],
    caveats: [
      {
        title: '"Speed" includes rider experience',
        body: 'MTA segment speeds reflect dwell time, traffic, signals, and stops. The brief uses the phrase "observed bus travel speed" wherever this metric appears.',
      },
      {
        title: "Single-month window",
        body: "Numbers are drawn from the March 2026 pilot. Comparable Feb 2026 numbers exist but were not used; a multi-month baseline is planned for v0.5.",
      },
      {
        title: "Attribution overlap",
        body: "The 2025 ACE all-day rollout coincided with the introduction of CBD congestion pricing. We do not claim ACE alone produced the speed gain.",
      },
    ],
  },
  {
    id: "bx12-positive-control",
    routeSlug: "bx12-sbs",
    title: "Bx12 SBS as positive control",
    status: "Published",
    version: "v1.0",
    generated: "2026-04-22",
    authors: ["S. Rivera"],
    citationCount: 31,
    summary:
      "A peer route brief explaining what a stronger SBS treatment stack can make visible in comparison.",
    dek: "Bx12 SBS carries more daily riders than M15 SBS, runs 1.87 mph faster on average, and loses 57% fewer rider-hours per day. The difference is not corridor demographics; it is treatment intensity.",
    kpis: [
      {
        label: "Weighted avg speed",
        value: "8.61",
        unit: "mph",
        sub: "62nd percentile",
        tone: "good",
      },
      { label: "Lane coverage", value: "94%", sub: "concrete on 4 miles", tone: "good" },
      { label: "Rider-hours lost/day", value: "1,860", sub: "57% lower than M15", tone: "good" },
    ],
    sections: [
      {
        title: "Why Bx12 is a useful peer",
        body: [
          "Bx12 SBS and M15 SBS carry comparable daily ridership (39.4K vs 37.2K) but Bx12 has 22 points more bus-lane coverage, including 4 miles of concrete (curb-protected) lane, and signal priority on the Pelham Parkway corridor.",
          'Treating Bx12 as a positive control - what "working as designed" looks like - lets us identify the treatment stack we should be measuring against rather than just "better than yesterday".',
        ],
      },
    ],
    claims: [
      {
        n: 1,
        title: "Lane coverage and enforcement are materially higher than on the comparison route.",
        strength: 5,
        evidenceIds: [],
        caveatIds: [],
      },
      {
        n: 2,
        title: "Rider-hour losses concentrate in fewer blocks.",
        strength: 5,
        evidenceIds: [],
        caveatIds: [],
      },
    ],
    evidence: [],
    caveats: [],
  },
];

export const studioVersions: StudioVersion[] = [
  {
    briefId: "m15-madison-corridor",
    v: "v0.4",
    date: "May 12",
    author: "C. Pherson",
    summary: "Madison-corridor framing tightened; added before/after rider-hours figure.",
    claimsCount: 4,
    citesCount: 23,
    caveatsCount: 3,
  },
  {
    briefId: "m15-madison-corridor",
    v: "v0.3",
    date: "May 8",
    author: "J. Lim",
    summary: "Added the treatment-gap claim (later flagged weak).",
    claimsCount: 4,
    citesCount: 19,
    caveatsCount: 2,
  },
  {
    briefId: "m15-madison-corridor",
    v: "v0.2",
    date: "Apr 30",
    author: "C. Pherson",
    summary: "Pulled the TSP claim; evidence base was too thin.",
    claimsCount: 3,
    citesCount: 16,
    caveatsCount: 2,
  },
  {
    briefId: "m15-madison-corridor",
    v: "v0.1",
    date: "Apr 24",
    author: "C. Pherson",
    summary: "Initial draft from Madison-corridor hotspot.",
    claimsCount: 4,
    citesCount: 11,
    caveatsCount: 1,
  },
];

export const studioComments: StudioComment[] = [
  {
    id: "c-cp-treatment-gap",
    briefId: "m15-madison-corridor",
    claimN: 2,
    kind: "change-requested",
    author: "C. Pherson",
    initials: "CP",
    ago: "2 hours ago",
    on: "treatment gap",
    body: 'The phrase "treatment gap" is doing a lot of work here. Can we be specific about which treatment is missing - bus lane, ACE, or both - and quantify the gap?',
    replies: [
      {
        author: "J. Lim",
        initials: "JL",
        ago: "1 hour ago",
        body: "Good catch. Madison Av is missing both, but the lane gap is the more measurable one. I'll split this into two sub-claims.",
      },
    ],
  },
  {
    id: "c-sr-figure-1",
    briefId: "m15-madison-corridor",
    claimN: 2,
    kind: "comment",
    author: "S. Rivera",
    initials: "SR",
    ago: "4 hours ago",
    on: "Figure 1",
    body: "The PM peak severity here is much sharper than the AM peak. Worth calling that out in the body - could affect intervention timing.",
  },
  {
    id: "c-sr-style",
    briefId: "m15-madison-corridor",
    claimN: 2,
    kind: "comment",
    author: "S. Rivera",
    initials: "SR",
    ago: "4 hours ago",
    on: "Madison Avenue",
    body: 'Should we say "Madison Avenue" or "Madison Av" consistently? Style guide says "Avenue" in body, "Av" in labels.',
    resolved: true,
  },
];

export const studioMethodsNotes: StudioMethodsNote[] = [
  {
    id: "ace-program",
    section: "Datasets",
    title: "ACE program - methodology and scope",
    body: "How the ACE coverage flag is derived, including handling of partial-day enforcement periods.",
  },
  {
    id: "observed-speed",
    section: "Caveats",
    title: "Speed includes rider experience",
    body: 'Why we use "observed bus travel speed" instead of "speed" throughout the studio.',
  },
  {
    id: "cbd-overlap",
    section: "Caveats",
    title: "Congestion pricing overlap with ACE all-day",
    body: "Why M15 numbers below 60th St in 2025+ can't cleanly attribute speed gains to enforcement.",
  },
];

export const studioMethodDatasets: StudioMethodDataset[] = [
  {
    name: "Bus segment speeds",
    publisher: "MTA Open Data",
    grain: "route x direction x timepoint pair x hour",
    cadence: "monthly",
  },
  {
    name: "Hourly ridership",
    publisher: "MTA Open Data",
    grain: "stop x hour",
    cadence: "weekly",
  },
  {
    name: "Schedule timepoints",
    publisher: "MTA GTFS",
    grain: "route x trip x timepoint pair",
    cadence: "GTFS publish",
  },
  {
    name: "ACE program and violations",
    publisher: "MTA Open Data",
    grain: "route x segment x date",
    cadence: "monthly",
  },
  {
    name: "Local-street bus lanes",
    publisher: "NYC DOT",
    grain: "lane segment",
    cadence: "quarterly",
  },
  {
    name: "Route shapes and stops",
    publisher: "MTA GTFS",
    grain: "shape / stop",
    cadence: "GTFS publish",
  },
];

export const studioDocsSections: StudioDocsSection[] = [
  {
    title: "Quickstart",
    body: ["Start with a route, inspect the evidence, then generate a draft brief."],
    code: "curl /api/v1/studio/routes/m15-sbs\ncurl /api/v1/studio/briefs/m15-madison-corridor",
  },
  {
    title: "API reference",
    body: ["Studio pages consume route-first `/api/v1/studio/*` contracts only."],
  },
  {
    title: "CLI preview",
    body: ["The CLI should be generated from the same TypeScript contracts as the API docs."],
    code: "bpi routes get M15+ --json\nbpi findings list --json\nbpi briefs generate m15-madison-corridor --json",
  },
  {
    title: "Agent notes",
    body: [
      "Use `get`, never `info`. Always support `--json`. Make local vs remote execution explicit before mutating a draft.",
    ],
  },
  {
    title: "Data credits",
    body: [
      "TODO: MTA Open Data, MTA GTFS, MTA Bus Time, NYC DOT bus lanes, and project wiki methodology notes.",
    ],
  },
  {
    title: "Changelog",
    body: [
      "2026-05-18: route-first Studio planning started. The website, API, and future CLI now share one implementation plan.",
    ],
  },
];

export const studioDocsEndpoints: StudioDocsEndpoint[] = [
  {
    method: "GET",
    path: "/api/v1/studio/routes",
    body: "List route cards for search and the home attention ranking.",
  },
  {
    method: "GET",
    path: "/api/v1/studio/routes/:routeId",
    body: "Fetch route detail, diagnosis, KPIs, segments, and intervention evidence.",
  },
  {
    method: "GET",
    path: "/api/v1/studio/routes/:routeId/ladder",
    body: "Fetch the ordered route ladder and segment evidence.",
  },
  {
    method: "GET",
    path: "/api/v1/studio/compare?a=&b=",
    body: "Compare two route-first Studio payloads by canonical route slug.",
  },
  {
    method: "GET",
    path: "/api/v1/studio/briefs/:briefId/history",
    body: "Fetch version history and review context for a Studio brief.",
  },
  {
    method: "GET",
    path: "/api/openapi.json",
    body: "Fetch the generated OpenAPI document for Studio read and draft-authoring contracts.",
  },
  {
    method: "PATCH",
    path: "/api/v1/studio/briefs/:briefId/draft",
    body: "Update operator-scoped draft metadata; requires a Studio session and Idempotency-Key.",
  },
  {
    method: "POST",
    path: "/api/v1/studio/briefs/:briefId/draft/generate",
    body: "Queue a Cloudflare Think / Workers AI generation run that stores a proposal for approval.",
  },
  {
    method: "POST",
    path: "/api/v1/studio/briefs/:briefId/draft/agent-runs",
    body: "Start an authoring agent run against the current draft version and content hash.",
  },
  {
    method: "POST",
    path: "/api/v1/studio/briefs/:briefId/draft/agent-runs/:runId/propose-edit",
    body: "Submit structured agent edit operations; invalid output returns repair feedback instead of mutating the draft.",
  },
  {
    method: "GET",
    path: "/api/v1/studio/briefs/:briefId/draft/proposals/:proposalId",
    body: "Fetch an agent proposal for preview and human approval.",
  },
  {
    method: "POST",
    path: "/api/v1/studio/briefs/:briefId/draft/proposals/:proposalId/apply",
    body: "Apply all or selected approved proposal operations and create a draft version snapshot.",
  },
  {
    method: "POST",
    path: "/api/v1/studio/briefs/:briefId/draft/proposals/:proposalId/reject",
    body: "Reject an agent proposal without mutating accepted draft content.",
  },
  {
    method: "GET",
    path: "/api/v1/studio/briefs/:briefId/draft/versions",
    body: "List restoreable draft version milestones.",
  },
  {
    method: "POST",
    path: "/api/v1/studio/briefs/:briefId/draft/versions/:versionId/restore",
    body: "Restore a D1-backed draft version snapshot as a new draft version.",
  },
  {
    method: "POST",
    path: "/api/v1/studio/briefs/:briefId/draft/claims",
    body: "Add a claim to the operator-scoped draft.",
  },
  {
    method: "PATCH/DELETE",
    path: "/api/v1/studio/briefs/:briefId/draft/claims/:claimN",
    body: "Edit or remove a draft claim by one-based claim number.",
  },
  {
    method: "POST",
    path: "/api/v1/studio/briefs/:briefId/draft/validate",
    body: "Refresh deterministic validation for a draft before review or publication.",
  },
  {
    method: "POST",
    path: "/api/v1/studio/briefs/:briefId/draft/review",
    body: "Request review for a draft and append a review comment.",
  },
  {
    method: "POST",
    path: "/api/v1/studio/briefs/:briefId/draft/publish",
    body: "Mark a draft as a publish candidate.",
  },
  {
    method: "POST",
    path: "/api/v1/studio/briefs/:briefId/draft/retract",
    body: "Retract a draft publish candidate without mutating the public release.",
  },
  {
    method: "GET",
    path: "/api/v1/studio/briefs/:briefId/draft/publish-candidate-export",
    body: "Fetch the publish-candidate export payload for release review.",
  },
];

export const studioReleaseQuality: StudioQuality = {
  releaseLayer: "baseline_release",
  completenessStatus: "complete",
  confidence: "medium",
  caveats: [
    "Studio pages consume RESTful /api/v1/studio/* resources backed by versioned serving projections.",
  ],
};

export const studioReleaseSeed: StudioReleasePayload = StudioReleasePayloadSchema.parse({
  schemaVersion: 1,
  generatedAt: "2026-05-18T00:00:00.000Z",
  quality: studioReleaseQuality,
  routes: studioRoutes,
  segments: studioSegments,
  routeArtifacts: [],
  findings: studioFindings,
  briefs: studioBriefs,
  versions: studioVersions,
  comments: studioComments,
  methods: studioMethodDatasets,
  docsSections: studioDocsSections,
  docsEndpoints: studioDocsEndpoints,
});

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

export function routeSegments(slug: string): StudioSegment[] {
  return studioSegments.filter((segment) => segment.routeSlug === slug);
}

export function briefVersions(briefId: string): StudioVersion[] {
  return studioVersions.filter((v) => v.briefId === briefId);
}

export function briefComments(briefId: string): StudioComment[] {
  return studioComments.filter((c) => c.briefId === briefId);
}
