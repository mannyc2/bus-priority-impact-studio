import { describe, expect, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { validateInterventionsSearch } from "../../src/routes/interventions";
import { timelineEvidenceRouteSlugs } from "../../src/studio/api-client";
import type {
  StudioIntervention,
  StudioInterventionCorpus,
  StudioInterventionFacetIndex,
  StudioRoute,
  StudioRouteEvidenceBundle,
  StudioRouteIndex3Response,
  StudioRouteIndex3Row,
  StudyIndexArtifact,
} from "../../src/studio/api-contract";
import {
  compactInterventionsSearch,
  filterInterventionRows,
  InterventionsPage,
  interventionMatchAnnouncement,
  interventionRows,
  interventionsPaginationResetKey,
  planGroups,
  recordTargetForRoute,
  studyRegisterLabel,
  yearDistribution,
  yearLabel,
} from "../../src/studio/pages/interventions";
import { isoMonthFixture } from "./schema-fixtures";

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

test("intervention filter announcements use singular grammar", () => {
  expect(interventionMatchAnnouncement(1)).toBe(
    "1 intervention record matches the current filters.",
  );
  expect(interventionMatchAnnouncement(2)).toBe(
    "2 intervention records match the current filters.",
  );
});

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

const publishedStudies = {
  artifactKind: "bp.studio.segment_study_index.v1",
  schemaVersion: 1,
  analysisMonth: isoMonthFixture("2026-05"),
  reviewCutId: "study-review-cut-v1:5298f37aac8780666c742f7d",
  studies: [
    {
      eventKey: "study-event-v2:test-m15",
      routeId: "M15+",
      routeSlug: "m15-sbs",
      treatmentFamily: "automated_bus_lane_enforcement",
      implementationMonth: isoMonthFixture("2024-06"),
      effectMph: 0.22,
      confidenceInterval: {
        lowerMph: 0.06,
        upperMph: 0.39,
        iterationCount: 1_000,
        seed: 7,
      },
      evaluationLevel: "segment_matched_did",
      claimTier: "gated_estimate",
      direction: "improved",
    },
  ],
} satisfies StudyIndexArtifact;

const studiedRoute = makeRoute({
  slug: "m15-sbs",
  label: "M15 SBS",
  interventions: [
    {
      ...evaluatedIntervention,
      eventId: "ace:M15+:ACE:2024-06-01",
      title: "ACE camera enforcement begins",
    },
  ],
});

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
      primaryTreatments: [],
      customTreatments: ["Limited-to-local conversion"],
      title: "Flatbush Avenue service project",
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

const facetIndex = {
  artifactKind: "bp.studio.intervention_facet_index.v1",
  schemaVersion: 1,
  releaseId: "pub_20260720T120000000Z",
  publishedAt: "2026-07-20T12:00:00.000Z",
  coverage: { start: isoMonthFixture("2023-04"), end: isoMonthFixture("2026-06") },
  summary: { rowCount: 4, routeCount: 2, treatmentCount: 4, occurrenceCount: 2 },
  rows: [
    {
      facetId: "facet-registry-m15",
      sourceNamespace: "local_registry",
      sourceRecordId: "registry-m15",
      sourceOccurrenceId: "registry-m15",
      occurrenceId: "occurrence:v1:000000000000000000000001",
      routeId: "M15+",
      routeSlug: "m15-sbs",
      treatmentIds: ["treatment:v1:000000000000000000000001"],
      treatmentKinds: ["bus_lane"],
      treatmentFamilies: ["bus_priority_lane"],
      lifecycleState: "implemented",
      effectiveDate: "2024-06",
      datePrecision: "month",
      projectIds: [],
      bundleKey: "studio/interventions/routes/m15-sbs.json",
    },
    {
      facetId: "facet-wiki-b41",
      sourceNamespace: "route_evidence",
      sourceRecordId: "tl_b41_1",
      sourceOccurrenceId: "tl_b41_1",
      occurrenceId: "occurrence:v1:000000000000000000000002",
      routeId: "B41",
      routeSlug: "b41",
      treatmentIds: ["treatment:v1:000000000000000000000002"],
      treatmentKinds: ["bus_lane"],
      treatmentFamilies: ["bus_priority_lane"],
      lifecycleState: "implemented",
      effectiveDate: "2019-06",
      datePrecision: "month",
      projectIds: [],
      bundleKey: "studio/interventions/routes/b41.json",
    },
    {
      facetId: "facet-project-b41",
      sourceNamespace: "route_evidence",
      sourceRecordId: "pr_b41_1",
      sourceOccurrenceId: null,
      occurrenceId: null,
      routeId: "B41",
      routeSlug: "b41",
      treatmentIds: ["treatment:v1:000000000000000000000003"],
      treatmentKinds: ["busway"],
      treatmentFamilies: ["bus_priority_lane"],
      lifecycleState: "planned",
      effectiveDate: null,
      datePrecision: "unknown",
      projectIds: ["pr_b41_1"],
      bundleKey: "studio/interventions/routes/b41.json",
    },
    {
      facetId: "facet-corpus-b41",
      sourceNamespace: "reviewed_intervention_corpus",
      sourceRecordId: "corpus-b41",
      sourceOccurrenceId: null,
      occurrenceId: null,
      routeId: "B41",
      routeSlug: "b41",
      treatmentIds: ["treatment:v1:000000000000000000000004"],
      treatmentKinds: ["other_documented"],
      treatmentFamilies: ["other"],
      lifecycleState: "implemented",
      effectiveDate: "2021-10",
      datePrecision: "month",
      projectIds: [],
      bundleKey: "studio/interventions/routes/b41.json",
    },
  ],
} satisfies StudioInterventionFacetIndex;

function routeIndexRow(input: {
  routeId: string;
  slug: string;
  projectionRefs?: StudioRouteIndex3Row["projectionRefs"];
}): StudioRouteIndex3Row {
  const sbs = input.routeId.endsWith("+");
  const displayLabel = sbs ? input.routeId.replace("+", " SBS") : input.routeId;
  return {
    releaseId: "pub_20260610T000000000Z",
    publishedAt: "2026-06-10T00:00:00.000Z",
    coverage: { start: isoMonthFixture("2023-04"), end: isoMonthFixture("2026-03") },
    routeId: input.routeId,
    slug: input.slug,
    label: displayLabel,
    routeSchemaVersion: 2,
    routeFamilyId: sbs ? input.routeId.slice(0, -1) : input.routeId,
    displayLabel,
    officialLongName: null,
    designationLiterals: sbs
      ? ["route_type:SBS", "trip_type:14"]
      : ["route_type:Local", "trip_type:1"],
    serviceModes: sbs ? ["sbs"] : ["local"],
    routeTypes: sbs ? ["SBS"] : ["Local"],
    tripTypes: sbs ? ["14"] : ["1"],
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
      schemaVersion: 3,
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseId: "pub_20260610T000000000Z",
      publishedAt: "2026-06-10T00:00:00.000Z",
      coverage: { start: isoMonthFixture("2023-04"), end: isoMonthFixture("2026-03") },
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
        releaseLayer: "published_release",
        completenessStatus: "partial_public_speed_only",
        confidence: "medium",
        caveats: [],
      },
    } satisfies StudioRouteIndex3Response;

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

  test("derives honest year bins and source-plan groups from the current rows", () => {
    const rows = interventionRows(routes, evidence, corpus, facetIndex);
    const documented = filterInterventionRows(rows, {}, { facetIndexAvailable: true });
    const planned = filterInterventionRows(
      rows,
      { view: "planned" },
      { facetIndexAvailable: true },
    );

    expect(yearDistribution(documented)).toEqual([
      { label: "2019", count: 1 },
      { label: "2021", count: 1 },
      { label: "2022", count: 1 },
      { label: "2024", count: 1 },
    ]);
    expect(planGroups(planned).map((group) => [group.label, group.count])).toEqual([
      ["Flatbush Progress Report", 1],
      ["Network source", 1],
    ]);
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

  test("joins corpus records by exact case-sensitive service identity without route-family collapse", () => {
    const template = corpus.records[1];
    if (template === undefined) throw new Error("corpus fixture needs a record template");
    const exactCorpus = {
      ...corpus,
      records: [
        {
          ...template,
          recordId: "corpus-b44-plus",
          routes: ["B44+"],
          title: "B44+ exact service intervention",
        },
        {
          ...template,
          recordId: "corpus-b44-label-only",
          routes: ["B44-SBS"],
          title: "B44 display-label-only intervention",
        },
      ],
    } satisfies StudioInterventionCorpus;
    const exactRoutes = [
      makeRoute({ slug: "b44", label: "B44", borough: "Brooklyn" }),
      makeRoute({ slug: "b44-sbs", label: "B44 SBS", borough: "Brooklyn" }),
    ];

    const rows = interventionRows(exactRoutes, [], exactCorpus);
    expect(rows.find((row) => row.key === "corpus:corpus-b44-plus")?.routes).toMatchObject([
      { routeId: "B44+", slug: "b44-sbs" },
    ]);
    expect(rows.find((row) => row.key === "corpus:corpus-b44-label-only")?.routes).toEqual([]);
  });

  test("composes typed family, lifecycle, exact-route, and text filters without prose classification", () => {
    const rows = interventionRows(routes, evidence, corpus, facetIndex);

    expect(
      filterInterventionRows(rows, { family: "other" }, { facetIndexAvailable: true }).map(
        (row) => row.key,
      ),
    ).toEqual(["corpus:corpus-b41"]);
    expect(
      filterInterventionRows(rows, { status: "future" }, { facetIndexAvailable: true }).map(
        (row) => row.key,
      ),
    ).toEqual(expect.arrayContaining(["b41:wiki-project:pr_b41_1", "corpus:corpus-network"]));
    expect(
      filterInterventionRows(
        rows,
        { route: "b41", q: "flatbush" },
        {
          facetIndexAvailable: true,
        },
      ).every((row) => row.routes.some((route) => route.slug === "b41")),
    ).toBe(true);

    const withoutFacets = interventionRows(routes, evidence, corpus, null);
    const withoutFacetDocumented = filterInterventionRows(
      withoutFacets,
      { family: "other" },
      {
        facetIndexAvailable: false,
      },
    );
    const withoutFacetPlanned = filterInterventionRows(
      withoutFacets,
      { family: "other", view: "planned" },
      { facetIndexAvailable: false },
    );
    expect(withoutFacetDocumented).toHaveLength(4);
    expect(withoutFacetPlanned).toHaveLength(2);
    expect(withoutFacetDocumented.length + withoutFacetPlanned.length).toBe(withoutFacets.length);
  });

  test("chooses the exact route occurrence target from stable facet relationships", () => {
    const rows = interventionRows(routes, evidence, corpus, facetIndex);
    const row = rows.find((candidate) => candidate.key === "b41:wiki-timeline:tl_b41_1");
    expect(row).toBeDefined();
    if (row === undefined) return;
    expect(recordTargetForRoute(row, "b41")).toBe("occurrence:v1:000000000000000000000002");
  });
});

describe("interventions URL contract", () => {
  test("trims bounded values, omits defaults, and rejects invalid values", () => {
    expect(
      validateInterventionsSearch({
        status: "all",
        borough: "All boroughs",
        family: "all",
        route: "  b44-sbs  ",
        q: "  busway  ",
      }),
    ).toEqual({ route: "b44-sbs", q: "busway" });
    expect(
      validateInterventionsSearch({
        status: "invented",
        borough: "Atlantis",
        family: "not-a-family",
        route: "x".repeat(97),
        q: `bad${String.fromCharCode(1)}`,
      }),
    ).toEqual({});
    expect(
      compactInterventionsSearch({
        status: "all",
        borough: "All boroughs",
        family: "all",
        route: " b41 ",
        q: " lane ",
      }),
    ).toEqual({ route: "b41", q: "lane" });
    expect(validateInterventionsSearch({ view: "documented", studied: "true" })).toEqual({
      studied: true,
    });
    expect(validateInterventionsSearch({ view: "planned", studied: true })).toEqual({
      view: "planned",
      studied: true,
    });
    expect(validateInterventionsSearch({ view: "invented", studied: "yes" })).toEqual({});
    expect(validateInterventionsSearch({ status: "evaluated" })).toEqual({ studied: true });
    expect(validateInterventionsSearch({ status: "future" })).toEqual({ view: "planned" });
    expect(validateInterventionsSearch({ status: "source-gap" })).toEqual({
      status: "source-gap",
    });
  });

  test("every validated filter dimension changes the pagination reset key", () => {
    const baseline = interventionsPaginationResetKey({});
    for (const search of [
      { status: "future" as const },
      { borough: "Brooklyn" as const },
      { family: "bus_priority_lane" as const },
      { route: "b41" },
      { q: "lane" },
      { view: "planned" as const },
      { studied: true as const },
    ]) {
      expect(interventionsPaginationResetKey(search)).not.toBe(baseline);
    }
  });
});

describe("InterventionsPage render", () => {
  test("renders the approved text hero, two tabs, dynamic histogram, and documented ledger", async () => {
    const html = await renderWithRouter(createElement(InterventionsPage, { routes, evidence }));

    expect(html).toContain("What the city built for buses — and what it changed.");
    expect(html).toContain(
      "Every documented bus lane, busway, camera corridor, and service change",
    );
    expect(html).toContain("2024");
    expect(html).toContain("2019");
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Intervention record status"');
    expect(html).toContain('for="intervention-studied"');
    expect(html).toContain('aria-label="Intervention records by year:');
    expect(html).toContain("Documented");
    expect(html).toContain("Planned");
    expect(html).toContain("Network ledger");
    // Existing route comparison stays visibly descriptive and unlinked.
    expect(html).toContain("+0.30 mph");
    expect(html).toContain("peer-adjusted");
    expect(html).not.toContain("View study");
    // Citations only via SourceNote popovers.
    expect(html).toContain("Sources (1)");
    expect(html).toContain('aria-label="Network intervention ledger"');
    expect(html).toContain('dateTime="2024-06"');
    expect(html).not.toContain("bus lane infrastructure");
    // Doctrine: no interpunct and no rejected forest plot / Studied tab.
    expect(html).not.toContain("·");
    expect(html).not.toContain("forest plot");
    expect(html).not.toContain('role="tab">Studied');
  });

  test("groups the planned partition by structured source plan and keeps meaningful status", async () => {
    const html = await renderWithRouter(
      createElement(InterventionsPage, {
        routes,
        evidence,
        corpus,
        facetIndex,
        search: { view: "planned" },
      }),
    );

    expect(html).toContain("Flatbush Progress Report");
    expect(html).toContain("Network source");
    expect(html).toContain("Planned");
    expect(html).toContain("proposed");
    expect(html).not.toContain("Offset bus lane installed");
  });

  test("uses the published index for studied filtering and compact register labels", async () => {
    const html = await renderWithRouter(
      createElement(InterventionsPage, {
        routes: [studiedRoute],
        evidence: [],
        studiesIndex: publishedStudies,
        search: { studied: true },
      }),
    );

    expect(html).toContain("1 documented, 0 planned, 1 studied");
    expect(html).toContain("+0.22 mph");
    expect(html).toContain("95% CI +0.06 to +0.39");
    expect(html).toContain("matched-segment study →");
    expect(html).not.toContain("View study");
    const publishedStudy = publishedStudies.studies[0];
    if (publishedStudy === undefined) throw new Error("published study fixture is required");
    expect(studyRegisterLabel({ ...publishedStudy, claimTier: "descriptive" })).toBe(
      "descriptive study",
    );
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

  test("keeps documented records without dates as honest route rollups", async () => {
    const undatedRoute = makeRoute({
      slug: "b41",
      label: "B41",
      borough: "Brooklyn",
      interventions: [
        {
          year: "undated",
          title: "Documented treatment without a defensible date",
          detail: "Source confirms the treatment but not its implementation date.",
        },
      ],
    });
    const html = await renderWithRouter(
      createElement(InterventionsPage, { routes: [undatedRoute], evidence: [] }),
    );

    expect(html).toContain('aria-label="Undated intervention rollups"');
    expect(html).toContain("Records without a defensible date: 1");
    expect(html).toContain("Route History →");
  });

  test("renders typed controls, custom treatments, and durable exact-route History links", async () => {
    const html = await renderWithRouter(
      createElement(InterventionsPage, {
        routes,
        evidence,
        corpus,
        facetIndex,
        search: { route: "b41", family: "other" },
      }),
    );

    expect(html).toContain("Kind:");
    expect(html).toContain("Search records");
    expect(html).toContain("Limited-to-local conversion");
    expect(html).toContain("/routes/b41?");
    expect(html).toContain("tab=history");
    expect(html).toContain("record=treatment%3Av1%3A000000000000000000000004");
    expect(html).toContain('aria-live="polite"');
  });

  test("keeps records visible without facets and explains unknown exact routes", async () => {
    const missingFacets = await renderWithRouter(
      createElement(InterventionsPage, { routes, evidence, corpus, facetIndex: null }),
    );
    expect(missingFacets).toContain(
      "Typed family filters are unavailable; all known records remain visible.",
    );
    expect(missingFacets).toContain("Flatbush Avenue service project");

    const unmatched = await renderWithRouter(
      createElement(InterventionsPage, {
        routes,
        evidence,
        facetIndex,
        search: { route: "b44-sbs" },
      }),
    );
    expect(unmatched).toContain("Route not found");
    expect(unmatched).toContain("Clear route filter");
  });
});
