import type { StudioRoute, StudioSegment } from "./routes/index.js";

export const StudioFieldProvenanceKind = [
  "observed",
  "derived",
  "proxy",
  "template",
  "prototype",
] as const;

export type StudioFieldProvenanceKindValue = (typeof StudioFieldProvenanceKind)[number];

export type StudioFieldProvenance = {
  kind: StudioFieldProvenanceKindValue;
  source: string;
  note: string;
};

export const studioRouteFieldProvenance = {
  slug: {
    kind: "derived",
    source: "route catalog",
    note: "Canonical Studio route slug derived from public route identity.",
  },
  routeId: {
    kind: "observed",
    source: "MTA route catalog",
    note: "Canonical MTA route ID.",
  },
  routeSchemaVersion: {
    kind: "derived",
    source: "public route contract",
    note: "Version tag for the rich identity and presentation route shape.",
  },
  label: {
    kind: "derived",
    source: "route catalog",
    note: "Display label normalized from route ID/name.",
  },
  routeFamilyId: {
    kind: "derived",
    source: "official route identity contract",
    note: "Grouping context only; never an exact service identity.",
  },
  displayLabel: {
    kind: "observed",
    source: "official route identity contract",
    note: "Verbatim official display label with source precedence.",
  },
  officialLongName: {
    kind: "observed",
    source: "official route identity contract",
    note: "Verbatim official long name when available.",
  },
  designationLiterals: {
    kind: "observed",
    source: "official Current Bus Routes artifact",
    note: "All preserved official service designation literals.",
  },
  serviceModes: {
    kind: "derived",
    source: "versioned route identity policy",
    note: "Plural normalized modes mapped from official literals.",
  },
  routeTypes: {
    kind: "observed",
    source: "official route identity inputs",
    note: "Preserved official route type values.",
  },
  tripTypes: {
    kind: "observed",
    source: "official route identity inputs",
    note: "Preserved official trip type values.",
  },
  corridor: {
    kind: "derived",
    source: "route catalog",
    note: "Short corridor label for scanning UI.",
  },
  corridorFull: {
    kind: "derived",
    source: "route catalog",
    note: "Longer route/corridor display label.",
  },
  borough: {
    kind: "derived",
    source: "route catalog",
    note: "Route borough grouping from serving catalog context.",
  },
  sbs: {
    kind: "derived",
    source: "official service modes",
    note: "Compatibility flag derived only from serviceModes containing sbs.",
  },
  speedMph: {
    kind: "observed",
    source: "D1 route_brief_summary.average_speed_mph",
    note: "Observed monthly route speed in the generated release month.",
  },
  scheduledMph: {
    kind: "derived",
    source: "route-brief schedule comparison",
    note: "Schedule-implied speed over current route-slice segments.",
  },
  weightedAvgSpeed: {
    kind: "observed",
    source: "D1 route_brief_summary.average_speed_mph",
    note: "Observed route speed used by detail charts.",
  },
  speedPercentile: {
    kind: "derived",
    source: "public route observed-speed cohort",
    note: "Empirical percentile over public Studio routes, not a causal score.",
  },
  dailyRiders: {
    kind: "derived",
    source: "monthly ridership trend rows",
    note: "Monthly boardings divided by days in the analysis month.",
  },
  ridersYoyPct: {
    kind: "derived",
    source: "monthly ridership trend rows",
    note: "Same-month prior-year comparison when available; null otherwise.",
  },
  riderHoursLost: {
    kind: "derived",
    source: "route-brief schedule/ridership exposure",
    note: "Positive observed-vs-scheduled delay exposure over current route-slice segments.",
  },
  laneCoverage: {
    kind: "derived",
    source: "MTA route shape + NYC DOT bus-lane geometry",
    note: "Route-shape proximity overlap, not legal lane mileage or operating-hour coverage.",
  },
  aceStatus: {
    kind: "proxy",
    source: "ACE route-month coverage",
    note: "Route-level ACE status, not segment-level enforcement geography.",
  },
  aceSince: {
    kind: "proxy",
    source: "ACE route-month coverage",
    note: "Route-level ACE timing when present.",
  },
  tspCoverage: {
    kind: "proxy",
    source: "captured NYC DOT TSP status snapshot",
    note: "Route-level TSP coverage label; not segment-level signal-timing evidence.",
  },
  reliability: {
    kind: "derived",
    source: "Studio route score",
    note: "Studio attention-band label from the internal route score; not an official reliability grade.",
  },
  observedReliability: {
    kind: "observed",
    source: "observed reliability summary",
    note: "Monthly observed reliability payload and provenance.",
  },
  diagnosis: {
    kind: "derived",
    source: "Studio release builder",
    note: "Short plain-language summary of the route's current attention drivers.",
  },
  spark: {
    kind: "observed",
    source: "D1 route_month_trend.average_speed_mph",
    note: "Observed monthly speed values for the route.",
  },
  termini: {
    kind: "derived",
    source: "MTA route shapes/stops",
    note: "North/south terminus labels from longest in-effect route shape and nearest timepoint stops.",
  },
  miles: {
    kind: "derived",
    source: "MTA route shapes",
    note: "Route-shape length converted to miles when geometry is available.",
  },
  stops: {
    kind: "derived",
    source: "MTA route stops",
    note: "Serving stop/timepoint count for display context.",
  },
  flags: {
    kind: "derived",
    source: "Studio release builder",
    note: "Display flags computed from route metrics and source caveats.",
  },
  peerSlug: {
    kind: "derived",
    source: "public route observed-speed cohort",
    note: "Descriptive peer route pointer, not a causal control.",
  },
  interventions: {
    kind: "observed",
    source: "reviewed intervention source events",
    note: "Only source-backed promoted intervention events are surfaced.",
  },
  movement6mPct: {
    kind: "derived",
    source: "route_month_trend speed series",
    note: "Percent speed change vs exactly 6 months before the latest speed month (§16-D3).",
  },
  context12mPct: {
    kind: "derived",
    source: "route_month_trend speed series",
    note: "Percent speed change vs exactly 12 months before the latest speed month (§16-D3).",
  },
} satisfies Record<keyof StudioRoute, StudioFieldProvenance>;

export const studioSegmentFieldProvenance = {
  id: {
    kind: "derived",
    source: "route-brief segment artifact",
    note: "Stable segment identifier from route/timepoint slice.",
  },
  spineSegmentId: {
    kind: "derived",
    source: "route speed spine crosswalk",
    note: "Stable geographic spine identity when the exact current segment has a verified match.",
  },
  spineJoinStatus: {
    kind: "derived",
    source: "route speed spine crosswalk",
    note: "Explicit readiness of the current segment's stable geographic join.",
  },
  routeSlug: {
    kind: "derived",
    source: "route catalog",
    note: "Canonical Studio route slug for the segment.",
  },
  direction: {
    kind: "derived",
    source: "route-brief segment artifact",
    note: "Direction bucket from route segment construction.",
  },
  from: {
    kind: "derived",
    source: "MTA stops/timepoints",
    note: "Segment start label from source stops/timepoints.",
  },
  to: {
    kind: "derived",
    source: "MTA stops/timepoints",
    note: "Segment end label from source stops/timepoints.",
  },
  speedMph: {
    kind: "observed",
    source: "route-slice segment speed observations",
    note: "Observed segment speed for the release month.",
  },
  scheduledMph: {
    kind: "derived",
    source: "route-slice schedule comparison",
    note: "Schedule-implied segment speed; missing evidence fails release generation.",
  },
  riderHours: {
    kind: "derived",
    source: "route-slice schedule/ridership exposure",
    note: "Positive observed-vs-scheduled delay exposure for the route-slice segment.",
  },
  lane: {
    kind: "derived",
    source: "MTA route shape + NYC DOT bus-lane geometry",
    note: "Segment proximity category, not legal lane inventory.",
  },
  ace: {
    kind: "proxy",
    source: "ACE route-month coverage",
    note: "Route-level ACE status applied to segment until corridor geography is promoted.",
  },
  tsp: {
    kind: "proxy",
    source: "captured NYC DOT TSP status snapshot",
    note: "Segment-level TSP presence flag; route-level status applied until corridor geography is promoted.",
  },
  hours: {
    kind: "observed",
    source: "route-slice segment speed observations",
    note: "Twenty-four observed slow-window bins for the visible segment.",
  },
  miles: {
    kind: "derived",
    source: "MTA route shape",
    note: "Segment distance from route geometry when available.",
  },
  timepoints: {
    kind: "derived",
    source: "MTA stops/timepoints",
    note: "Timepoint count in the visible segment.",
  },
  flagged: {
    kind: "derived",
    source: "Studio release builder",
    note: "Display flag computed from segment severity and source caveats.",
  },
  aiNote: {
    kind: "derived",
    source: "segment evidence synthesis",
    note: "Optional sparse public segment note derived from speed and delay-exposure anomaly thresholds; public notes carry one sourced claim only.",
  },
  suggestedSeeds: {
    kind: "derived",
    source: "Studio annotate workspace",
    note: "Optional reviewer-facing seed prompts for segment annotation.",
  },
} satisfies Record<keyof StudioSegment, StudioFieldProvenance>;
