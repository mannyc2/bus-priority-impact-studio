import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { timelineEvidenceRouteSlugs } from "../../src/studio/api-client";
import type {
  StudioRoute,
  StudioRouteEvidenceBundle,
  StudioRouteIndex2Response,
  StudioRouteIndex2Row,
} from "../../src/studio/api-contract";
import {
  InterventionListRow,
  interventionRows,
  interventionTone,
} from "../../src/studio/pages/interventions";

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

function routeIndexRow(input: {
  routeId: string;
  slug: string;
  projectionRefs?: StudioRouteIndex2Row["projectionRefs"];
}): StudioRouteIndex2Row {
  return {
    releaseId: "studio/v2",
    baselineMonth: "2026-03",
    routeId: input.routeId,
    slug: input.slug,
    label: input.routeId.replace("+", " SBS"),
    longName: null,
    borough: "Manhattan",
    routeFamily: "local",
    publicUrl: `/routes/${input.slug}`,
    capability: {
      overallState: "building",
      surfaces: {},
      caveats: [],
    },
    historyCoverage: {
      startMonth: null,
      endMonth: null,
      pointCount: 0,
      speedMonthCount: 0,
      ridershipMonthCount: 0,
    },
    caveats: [],
    projectionRefs: input.projectionRefs ?? [],
    updatedAt: "2026-06-10T00:00:00.000Z",
  };
}

describe("interventions page evidence aggregation", () => {
  test("limits global evidence fetches to routes with timeline projections", () => {
    const routeIndex = {
      schemaVersion: 2,
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseId: "studio/v2",
      baselineMonth: "2026-03",
      dataAsOf: "2026-03",
      routes: [
        routeIndexRow({ routeId: "B99", slug: "b99" }),
        routeIndexRow({
          routeId: "M15+",
          slug: "m15-sbs",
          projectionRefs: [
            {
              id: "route_timeline",
              status: "available",
              schemaVersion: 1,
              grain: "route_evidence",
              storage: "r2",
              path: "/api/v1/studio/routes/m15-sbs/timeline",
              months: null,
            },
          ],
        }),
        routeIndexRow({
          routeId: "B25",
          slug: "b25",
          projectionRefs: [
            {
              id: "route_history_summary",
              status: "available",
              schemaVersion: 1,
              grain: "route_month",
              storage: "d1",
              path: "/api/v1/studio/routes/b25/history",
              months: { start: "2026-03", end: "2026-03" },
            },
          ],
        }),
      ],
      quality: {
        releaseLayer: "baseline_release",
        completenessStatus: "partial_public_monthly_only",
        confidence: "medium",
        caveats: [],
      },
    } satisfies StudioRouteIndex2Response;

    expect(timelineEvidenceRouteSlugs(routeIndex)).toEqual(["m15-sbs"]);
  });

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

  test("renders intervention rows through the shared public card tone system", () => {
    const row = interventionRows([route], [evidence])[0];
    expect(row).toBeDefined();
    if (row === undefined) return;
    const markup = renderToStaticMarkup(createElement(InterventionListRow, { row }));

    expect(interventionTone(row.event)).toBe("warn");
    expect(markup).toContain("Source gap: missing_before_after");
    expect(markup).toContain("MTA-wiki");
    expect(markup).toContain("gap");
    expect(markup).toContain("Open route for context");
  });
});
