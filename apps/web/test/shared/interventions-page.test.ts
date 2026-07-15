import { describe, expect, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { timelineEvidenceRouteSlugs } from "../../src/studio/api-client";
import type {
  StudioIntervention,
  StudioInterventionCorpus,
  StudioRoute,
  StudioRouteEvidenceBundle,
  StudioRouteIndex2Response,
  StudioRouteIndex2Row,
} from "../../src/studio/api-contract";
import {
  InterventionsPage,
  interventionRows,
  yearLabel,
} from "../../src/studio/pages/interventions";

// InterventionsPage renders TanStack <Link>s, which need a router context.
async function renderWithRouter(node: ReactNode): Promise<string> {
  const rootRoute = createRootRoute({ component: () => node });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return renderToStaticMarkup(createElement(RouterProvider, { router }));
}

function makeRoute(input: {
  slug: string;
  label: string;
  borough?: string;
  interventions?: StudioIntervention[];
}): StudioRoute {
  return {
    slug: input.slug,
    routeId: input.label.replace(" SBS", "+"),
    label: input.label,
    corridor: "Test Corridor",
    corridorFull: "Test Corridor Full",
    borough: input.borough ?? "Manhattan",
    sbs: input.label.includes("SBS"),
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
    diagnosis: "Test route diagnosis.",
    spark: [7.2, 7.4, 7.1],
    termini: { north: "North End", south: "South End" },
    miles: 8.1,
    stops: 42,
    flags: [],
    peerSlug: null,
    interventions: input.interventions ?? [],
    movement6mPct: null,
    context12mPct: null,
  } satisfies StudioRoute;
}

const evaluatedIntervention: StudioIntervention = {
  eventId: "registry-m15",
  interventionType: "bus_lane_infrastructure",
  year: "2024-06",
  title: "Offset bus lane installed",
  detail: "Curbside lane converted to an offset bus lane.",
  tone: "good",
  comparisonCohort: {
    method: "peer_adjusted",
    causalInterpretation: "peer_adjusted_before_after",
    methodLimitations: [],
    routeIds: ["B44+"],
    routeCount: 3,
    preWindow: { from: "2023-12", to: "2024-05", sampleMonths: 6 },
    postWindow: { from: "2024-07", to: "2024-12", sampleMonths: 6 },
    routeSpeedDeltaMph: 0.4,
    comparisonSpeedDeltaMph: 0.1,
    adjustedSpeedDeltaMph: 0.3,
    caveat: "Descriptive comparison only.",
  },
};

const datedIntervention: StudioIntervention = {
  year: "2022-03",
  title: "Camera enforcement begins",
  detail: "ACE enforcement activated on the corridor.",
  sourceLabel: "MTA press release",
};

const servingRoute = makeRoute({
  slug: "m15-sbs",
  label: "M15 SBS",
  interventions: [evaluatedIntervention, datedIntervention],
});

const wikiRoute = makeRoute({ slug: "b41", label: "B41", borough: "Brooklyn" });
const emptyRoute = makeRoute({ slug: "q10", label: "Q10", borough: "Queens" });

const wikiEvidence = {
  routeId: "B41",
  routeSlug: "b41",
  wikiRouteRecordId: "route_b41",
  wikiRouteIds: ["B41"],
  wikiAliases: [],
  coverage: {
    timelineCount: 1,
    interventionCount: 0,
    metricClaimCount: 0,
    projectCount: 1,
    sourceGapCount: 0,
    citationCount: 1,
  },
  timeline: [
    {
      recordId: "tl_b41_1",
      recordKind: "timeline_event",
      citationKeys: ["source#block", "source#block"],
      eventKind: "bus_lane_opening",
      eventFamily: "street_treatment",
      lifecyclePhase: "implemented",
      title: "Flatbush bus lane opens",
      description: "Painted bus lane on Flatbush Avenue.",
      dateText: "June 2019",
      dateNormalized: "2019-06",
      datePrecision: "month",
    },
  ],
  interventions: [],
  metricClaims: [],
  projects: [
    {
      recordId: "pr_b41_1",
      recordKind: "project",
      citationKeys: ["source#block"],
      projectName: "Flatbush busway study",
      projectFamily: null,
      projectType: null,
      status: "planned",
      description: "Study of a busway conversion.",
      location: "Flatbush Avenue",
      routesServed: ["B41"],
    },
  ],
  sourceGaps: [],
  citations: [
    {
      key: "source#block",
      sourceId: "source",
      blockId: "block",
      evidenceId: "source#block",
      sourcePath: "raw/source.jsonl",
      sourceTitle: "Flatbush Progress Report",
      publisher: "NYC DOT",
    },
  ],
} satisfies StudioRouteEvidenceBundle;

const routes = [servingRoute, wikiRoute, emptyRoute];
const evidence = [wikiEvidence];

const corpus = {
  schemaVersion: 1,
  generatedAt: "2026-07-11T00:00:00.000Z",
  sourceCorpus: {
    path: "data/artifacts/docs/reviewed.json",
    version: 3,
    generatedAt: "2026-05-27T00:00:00.000Z",
    recordCount: 3,
    sha256: "a".repeat(64),
  },
  records: [
    {
      recordId: "corpus-matched",
      routes: ["M15"],
      primaryTreatments: ["bus_lane"],
      customTreatments: [],
      title: "First Avenue — Bus Lane",
      effectiveDate: "2024-06",
      datePrecision: "month",
      recordKind: "implemented",
      statusLatest: "complete",
      corridorStreets: ["First Avenue"],
      evaluableInWindow: true,
      sourceId: "source-matched",
      sourceLabel: "Matched source",
      sourceUrl: "https://example.test/matched",
      caveatCount: 0,
      matchedRegistryEventIds: ["registry-m15"],
    },
    {
      recordId: "corpus-b41",
      routes: ["B41"],
      primaryTreatments: ["busway"],
      customTreatments: [],
      title: "Flatbush Avenue — Busway",
      effectiveDate: "2021-10",
      datePrecision: "month",
      recordKind: "implemented",
      statusLatest: "complete",
      corridorStreets: ["Flatbush Avenue"],
      evaluableInWindow: false,
      sourceId: "source-b41",
      sourceLabel: "B41 source",
      sourceUrl: null,
      caveatCount: 1,
      matchedRegistryEventIds: [],
    },
    {
      recordId: "corpus-network",
      routes: [],
      primaryTreatments: ["reroute"],
      customTreatments: [],
      title: "Queens — Reroute",
      effectiveDate: null,
      datePrecision: null,
      recordKind: "proposed",
      statusLatest: "proposed",
      corridorStreets: ["Queens"],
      evaluableInWindow: false,
      sourceId: "source-network",
      sourceLabel: "Network source",
      sourceUrl: null,
      caveatCount: 0,
      matchedRegistryEventIds: [],
    },
  ],
} satisfies StudioInterventionCorpus;

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
});

describe("interventionRows", () => {
  test("counts serving plus wiki rows and sorts newest first", () => {
    const rows = interventionRows(routes, evidence);
    // 2 serving + 1 wiki timeline + 1 wiki project; the empty route adds none.
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.event.title)).toEqual([
      "Offset bus lane installed",
      "Camera enforcement begins",
      "Flatbush bus lane opens",
      "Flatbush busway study",
    ]);
    expect(rows.every((row) => row.routes.every((route) => route.slug !== "q10"))).toBe(true);
  });

  test("undated project rows never put a status string in the date position", () => {
    const rows = interventionRows(routes, evidence);
    const projectRow = rows.find((row) => row.event.title === "Flatbush busway study");
    expect(projectRow?.event.year).toBe("undated");
    expect(projectRow?.event.kind).toBe("planned");
    expect(yearLabel("undated")).toBe("Undated");
    expect(yearLabel("2024-06")).toBe("2024");
  });

  test("deduplicates exact registry matches, appends corpus citations, and keeps route-less records", () => {
    const rows = interventionRows(routes, evidence, corpus);
    expect(rows).toHaveLength(6);
    expect(rows.filter((row) => row.event.eventId === "registry-m15")).toHaveLength(1);
    expect(rows.find((row) => row.event.eventId === "registry-m15")?.event.sourceEntries).toEqual([
      {
        label: "Matched source",
        href: "https://example.test/matched",
        detail: "source-matched; corpus-matched",
      },
    ]);
    expect(rows.find((row) => row.key === "corpus:corpus-b41")?.routes[0]?.slug).toBe("b41");
    expect(rows.find((row) => row.key === "corpus:corpus-network")?.routes).toEqual([]);
  });
});

describe("InterventionsPage render", () => {
  test("groups by year with Undated last and a delta readout on evaluated rows", async () => {
    const html = await renderWithRouter(createElement(InterventionsPage, { routes, evidence }));

    expect(html).toContain("2024");
    expect(html).toContain("2019");
    expect(html).toContain("Undated");
    expect(html.indexOf("2019")).toBeLessThan(html.indexOf("Undated"));
    // Status renders as a chip, never a group header or date cell.
    expect(html).toContain("planned");
    expect(html).not.toContain(">planned</div>");
    // Evaluated delta readout.
    expect(html).toContain("+0.30 mph");
    expect(html).toContain("3 comparison routes");
    // Citations only via SourceNote popovers.
    expect(html).toContain("Sources (1)");
    // Filter counts in chip labels.
    expect(html).toContain("Evaluated (1)");
    expect(html).toContain("All (4)");
    // The page is structured as a navigable timeline, not a flat table of records.
    expect(html).toContain('aria-label="Network intervention timeline"');
    expect(html).toContain('aria-label="Filter interventions by status"');
    expect(html).toContain('dateTime="2024-06"');
    expect(html).toContain("Newest first");
    // Doctrine: no interpunct, no old editorial hero title.
    expect(html).not.toContain("·");
    expect(html).not.toContain("What changed on the street");
  });

  test("bounds the initial list to 30 rows with a show-more control", async () => {
    const manyInterventions = Array.from(
      { length: 40 },
      (_, index): StudioIntervention => ({
        year: `${2025 - index}-01`,
        title: `Record ${String(index + 1).padStart(2, "0")}`,
        detail: "Programmatic fixture record.",
      }),
    );
    const bigRoute = makeRoute({
      slug: "m15-sbs",
      label: "M15 SBS",
      interventions: manyInterventions,
    });
    const html = await renderWithRouter(
      createElement(InterventionsPage, { routes: [bigRoute], evidence: [] }),
    );

    expect(html).toContain("Record 30");
    expect(html).not.toContain("Record 31");
    expect(html).toContain("Show 10 more (10 left)");
  });
});
