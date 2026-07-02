import { describe, expect, test } from "bun:test";
import type { StudioRoute, StudioRouteEvidenceBundle } from "../../src/studio/api-contract";
import { interventionRows } from "../../src/studio/pages/interventions";

const route = {
  slug: "m15-sbs",
  routeId: "M15+",
  label: "M15 SBS",
  corridor: "First Avenue / Second Avenue",
  corridorFull: "First Avenue / Second Avenue",
  borough: "Manhattan",
  sbs: true,
  speedMph: 7.2,
  scheduledMph: 8.4,
  weightedAvgSpeed: 7.2,
  speedPercentile: 12,
  dailyRiders: 30_000,
  ridersYoyPct: 0,
  riderHoursLost: 0,
  laneCoverage: 65,
  aceStatus: "active",
  aceSince: "2024",
  tspCoverage: "none",
  reliability: "High attention route",
  observedReliability: null,
  diagnosis: "M15 SBS has slow segments and active treatment evidence.",
  spark: [7.2, 7.4, 7.1],
  termini: { north: "East Harlem", south: "South Ferry" },
  miles: 8.1,
  stops: 42,
  flags: ["ACE active"],
  peerSlug: null,
  interventions: [],
  movement6mPct: null,
  context12mPct: null,
} satisfies StudioRoute;

const evidence = {
  routeId: "M15+",
  routeSlug: "m15-sbs",
  wikiRouteRecordId: "route_m15_sbs",
  wikiRouteIds: ["M15"],
  wikiAliases: ["M15 SBS"],
  coverage: {
    timelineCount: 0,
    interventionCount: 0,
    metricClaimCount: 0,
    projectCount: 0,
    sourceGapCount: 1,
    citationCount: 1,
  },
  timeline: [],
  interventions: [],
  metricClaims: [],
  projects: [],
  sourceGaps: [
    {
      recordId: "gap_m15_before_after",
      recordKind: "source_gap",
      citationKeys: ["source#block"],
      gapKind: "missing_before_after",
      gapText: "Needs before/after source.",
      missingInformation: "Before/after table",
      description: null,
    },
  ],
  citations: [
    {
      key: "source#block",
      sourceId: "source",
      blockId: "block",
      evidenceId: "source#block",
      sourcePath: "raw/source.jsonl",
    },
  ],
} satisfies StudioRouteEvidenceBundle;

describe("interventions page evidence aggregation", () => {
  test("adds wiki source gaps with citations", () => {
    const rows = interventionRows([route], [evidence]);

    expect(rows).toEqual([
      expect.objectContaining({
        route,
        event: expect.objectContaining({
          source: "source_gap",
          citationKeys: ["source#block"],
          title: "Source gap: missing_before_after",
        }),
      }),
    ]);
  });
});
