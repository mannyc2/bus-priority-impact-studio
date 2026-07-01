import { CorridorProfile } from "@/components/CorridorProfile";
import type { StudioRoute, StudioSegment } from "@/studio/api-contract";

const route = {
  slug: "m15-sbs",
  routeId: "M15+",
  label: "M15",
  corridor: "First / Second Av",
  corridorFull: "First / Second Av",
  borough: "Manhattan",
  sbs: true,
  speedMph: 6.4,
  scheduledMph: 7.2,
  weightedAvgSpeed: 6.4,
  speedPercentile: 22,
  dailyRiders: 42000,
  ridersYoyPct: 1.2,
  riderHoursLost: 1200,
  laneCoverage: 72,
  aceStatus: "active",
  aceSince: "2024-01",
  tspCoverage: "partial",
  reliability: "Observed",
  observedReliability: null,
  diagnosis: "Route fixture.",
  spark: [6.8, 6.7, 6.4],
  termini: { north: "E 126 St", south: "South Ferry" },
  miles: 8.1,
  stops: 42,
  flags: [],
  peerSlug: null,
  interventions: [],
  movement6mPct: null,
  context12mPct: null,
} satisfies StudioRoute;

const segments = [
  {
    id: "madison-28-58-nb",
    routeSlug: route.slug,
    direction: "NB",
    from: "E 28 St",
    to: "E 58 St",
    speedMph: 4.8,
    scheduledMph: 7.2,
    riderHours: 420,
    lane: "partial",
    ace: true,
    tsp: false,
    hours: [6.1, 6.0, 5.8, 5.1, 4.9, 4.8],
    miles: 1.5,
    timepoints: 6,
    flagged: true,
  },
  {
    id: "first-14-34-sb",
    routeSlug: route.slug,
    direction: "SB",
    from: "E 34 St",
    to: "E 14 St",
    speedMph: 6.2,
    scheduledMph: 7.2,
    riderHours: 210,
    lane: "yes",
    ace: true,
    tsp: true,
    hours: [7.0, 6.8, 6.4, 6.2, 6.1, 6.3],
    miles: 1.1,
    timepoints: 4,
  },
] satisfies StudioSegment[];

// Drives the route-Overview corridor profile from the richest local fixture
// (m15-sbs, 7 timepoint segments) so the spatial chart can be dogfooded without
// the studio API. This is the same component rendered under "The corridor" on
// the route detail page.
export function CorridorProfileDemo() {
  const slowest = [...segments].sort((a, b) => b.riderHours - a.riderHours)[0];

  return (
    <div>
      <div className="mb-3">
        <div className="text-sm font-semibold tracking-[-0.005em]">The corridor</div>
        <div className="mt-[3px] max-w-[760px] text-[12px] text-[var(--bp-color-ink-55)]">
          Observed weekday bus speed across visible timepoint segments. The dashed line is scheduled
          speed; the rails show the segment-varying treatments available in this release.
        </div>
      </div>
      <div className="rounded-[3px] bg-[var(--bp-color-card)] px-5 py-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
        <CorridorProfile route={route} segments={segments} highlightId={slowest?.id} />
      </div>
    </div>
  );
}
