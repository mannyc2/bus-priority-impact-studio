import { describe, expect, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  comparisonCardsSubLine,
  historyTargetScrollBehavior,
  interventionComparisonCards,
  mergedTreatmentTimelineRows,
  TreatmentsHistorySection,
  timelineDisplayRows,
  timelineYearLabel,
  treatmentHistoryInsightRows,
  treatmentSourceRows,
} from "../../src/components/route/TreatmentsHistorySection";
import { citationEntries } from "../../src/components/SourceNote";
import { validateRouteDetailPageSearch } from "../../src/routes/routes/$routeId";
import type {
  StudioIntervention,
  StudioRouteDetailResponse,
  StudioRouteEvidenceBundle,
  StudioRouteEvidenceTimelineEvent,
  StudioRouteInsight,
  StudioRouteInterventionInventoryBundle,
} from "../../src/studio/api-contract";
import { isoMonthFixture } from "./schema-fixtures";
import { studyFixture } from "./study-fixture";

async function renderWithRouter(node: ReactNode): Promise<string> {
  const rootRoute = createRootRoute({ component: () => node });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return renderToStaticMarkup(createElement(RouterProvider, { router }));
}

function insight(input: Partial<StudioRouteInsight> = {}): StudioRouteInsight {
  const fixture: StudioRouteInsight = {
    routeId: "M14A",
    detectorId: "fixture_detector",
    title: "Fixture insight",
    shortText: "Fixture text.",
    severity: "medium",
    kind: "performance_annotation",
    placement: "overview",
    refs: [],
  };
  return { ...fixture, ...input, routeId: input.routeId ?? fixture.routeId };
}

const servingInterventions = [
  {
    year: "2025-01",
    title: "ACE enforcement begins",
    detail: "Peer-adjusted speed change +0.41 mph using 12 comparison routes.",
    sourceLabel: "ACE",
    sourceDetail: "Structured intervention source",
    comparisonCohort: {
      method: "peer_adjusted_before_after",
      causalInterpretation: "comparison_adjusted_not_causal_proof",
      methodLimitations: ["not_randomized_or_quasi_experimental"],
      routeIds: ["M14A", "M14D"],
      routeCount: 12,
      preWindow: { from: "2024-07", to: "2024-12", sampleMonths: 6 },
      postWindow: { from: "2025-02", to: "2025-07", sampleMonths: 6 },
      routeSpeedDeltaMph: 0.55,
      comparisonSpeedDeltaMph: 0.14,
      adjustedSpeedDeltaMph: 0.41,
      caveat: "Comparison-adjusted, not causal proof.",
    },
  },
  {
    year: "2024-06",
    title: "Bus lane repainted",
    detail: "Curbside lane refreshed.",
    sourceLabel: "NYC DOT",
  },
  {
    year: "2023-05",
    title: "TSP pilot",
    detail: "Signal priority pilot began.",
  },
] satisfies StudioIntervention[];

function wikiEvent(
  input: Partial<StudioRouteEvidenceTimelineEvent> & { recordId: string },
): StudioRouteEvidenceTimelineEvent {
  return {
    recordKind: "event",
    citationKeys: ["c2"],
    eventKind: "bus_lane_change",
    eventFamily: "treatment",
    lifecyclePhase: "implemented",
    title: `Event ${input.recordId}`,
    description: "Wiki-derived route evidence.",
    dateText: null,
    dateNormalized: null,
    datePrecision: null,
    ...input,
  };
}

function evidenceBundle(timeline: StudioRouteEvidenceTimelineEvent[]): StudioRouteEvidenceBundle {
  return {
    routeId: "M15+",
    routeSlug: "m15-sbs",
    wikiRouteRecordId: "route_m15",
    wikiRouteIds: ["M15+"],
    wikiAliases: ["M15 SBS"],
    coverage: {
      timelineCount: timeline.length,
      interventionCount: 3,
      metricClaimCount: 0,
      projectCount: 2,
      sourceGapCount: 0,
      citationCount: 2,
    },
    timeline,
    interventions: [
      {
        recordId: "int_1",
        recordKind: "intervention",
        citationKeys: ["c1", "c1"],
        treatmentKind: "bus_lane",
        treatmentFamily: "lanes",
        title: "Offset bus lane",
        description: "Offset lane on First Avenue.",
        locations: [],
        projectRecordIds: [],
      },
      {
        recordId: "int_2",
        recordKind: "intervention",
        citationKeys: ["c2"],
        treatmentKind: "camera_enforcement",
        treatmentFamily: null,
        title: "ABLE cameras",
        description: null,
        locations: ["First Ave"],
        projectRecordIds: [],
      },
      {
        recordId: "int_3",
        recordKind: "intervention",
        citationKeys: [],
        treatmentKind: null,
        treatmentFamily: null,
        title: null,
        description: null,
        locations: [],
        projectRecordIds: [],
      },
    ],
    metricClaims: [],
    projects: [
      {
        recordId: "proj_1",
        recordKind: "project",
        citationKeys: ["c1"],
        projectName: "First Avenue busway",
        projectFamily: null,
        projectType: "busway",
        status: "planned",
        description: "Busway study.",
        location: null,
        routesServed: ["M15+"],
      },
      {
        recordId: "proj_2",
        recordKind: "project",
        citationKeys: ["c2"],
        projectName: null,
        projectFamily: null,
        projectType: null,
        status: null,
        description: null,
        location: "Second Avenue",
        routesServed: [],
      },
    ],
    sourceGaps: [],
    citations: [
      {
        key: "c1",
        sourceId: "mta-board",
        blockId: "b1",
        evidenceId: "mta-board#b1",
        sourcePath: "raw/mta-board.jsonl",
        sourceTitle: "MTA Board Report",
        publisher: "MTA",
        publishedDate: "2024",
        sourceUrl: "https://example.com/board",
      },
      {
        key: "c2",
        sourceId: "dot-release",
        blockId: "b2",
        evidenceId: "dot-release#b2",
        sourcePath: "raw/dot-release.jsonl",
        sourceTitle: "DOT Press Release",
      },
    ],
  };
}

const largeTimeline: StudioRouteEvidenceTimelineEvent[] = [
  wikiEvent({
    recordId: "ev_2024",
    dateNormalized: "2024-03",
    dateText: "2024-03",
    citationKeys: ["c1", "c1"],
  }),
  ...["2022", "2021", "2020", "2019", "2018", "2017", "2016"].map((year) =>
    wikiEvent({ recordId: `ev_${year}`, dateNormalized: `${year}-01`, dateText: `${year}-01` }),
  ),
  wikiEvent({ recordId: "ev_nodate_a" }),
  wikiEvent({ recordId: "ev_nodate_b" }),
];

const routeDetail = {
  schemaVersion: 3,
  generatedAt: "2026-07-01T00:00:00.000Z",
  releaseId: "pub_20260701T000000000Z",
  publishedAt: "2026-07-01T00:00:00.000Z",
  coverage: { start: isoMonthFixture("2023-04"), end: isoMonthFixture("2026-03") },
  route: {
    slug: "m15-sbs",
    routeId: "M15+",
    label: "M15 SBS",
    corridor: "First / Second",
    corridorFull: "First Avenue / Second Avenue",
    borough: "Manhattan",
    sbs: true,
    speedMph: 7.2,
    scheduledMph: 8.4,
    weightedAvgSpeed: 7.2,
    speedPercentile: 12,
    dailyRiders: 30000,
    ridersYoyPct: 2.1,
    riderHoursLost: 6200,
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
    interventions: servingInterventions,
    movement6mPct: null,
    context12mPct: null,
  },
  segments: [],
  artifactRefs: [],
  insights: [],
  peakWindows: [],
  slowestWindows: [],
  reliabilitySamples: [],
  capability: null,
  dossier: null,
  equityContext: null,
  quality: {
    releaseLayer: "published_release",
    completenessStatus: "partial_public_speed_only",
    confidence: "medium",
    caveats: [],
  },
} satisfies StudioRouteDetailResponse;

function inventoryBundle(
  overrides: Partial<StudioRouteInterventionInventoryBundle> = {},
): StudioRouteInterventionInventoryBundle {
  const treatmentId = "treatment:v1:000000000000000000000001";
  const occurrenceIds = [
    "occurrence:v1:000000000000000000000001",
    "occurrence:v1:000000000000000000000002",
  ];
  return {
    artifactKind: "bp.studio.route_intervention_inventory_bundle.v1",
    schemaVersion: 1,
    releaseId: "pub_20260718T180527000Z",
    publishedAt: "2026-07-18T18:05:27.000Z",
    coverage: { start: null, end: isoMonthFixture("2026-03") },
    route: {
      routeId: "M15+",
      routeFamilyId: "M15",
      displayLabel: "M15 SBS",
      officialLongName: null,
      designationLiterals: ["route_type:SBS"],
      serviceModes: ["sbs"],
      routeTypes: ["SBS"],
      tripTypes: ["14"],
    },
    routeSlug: "m15-sbs",
    coverageState: "available",
    sourceStates: [],
    treatments: [
      {
        treatmentId,
        sourceNamespace: "reviewed_intervention_corpus",
        sourceRecordId: "record-busway",
        sourceId: "fixture-source",
        componentCollection: "primary",
        componentPosition: 0,
        rawKind: "busway",
        rawLabel: null,
        treatmentKind: "busway",
        treatmentFamily: "bus_priority_lane",
        lifecycleState: "implemented",
        statusAsOf: null,
        effectiveDate: "2024-06",
        datePrecision: "month",
        geographyScope: "route",
        sourceRefs: ["source:fixture"],
        occurrenceIds,
        projectIds: [],
      },
    ],
    occurrences: occurrenceIds.map((occurrenceId, index) => ({
      occurrenceId,
      sourceNamespace: "operational_occurrences",
      sourceOccurrenceId: `source-${index}`,
      sourceId: "fixture-source",
      producerPhaseOrPosition: String(index),
      routeId: "M15+",
      treatmentIds: [treatmentId],
      lifecycleState: "implemented" as const,
      phase: index === 0 ? "pilot" : "permanent",
      rawStatus: "implemented",
      program: "Typed busway program",
      effectiveDate: index === 0 ? "2023-06" : "2024-06",
      datePrecision: "month" as const,
      geographyScope: "route" as const,
      sourceRefs: ["source:fixture"],
      projectIds: [],
      wikiOccurrenceId: null,
      registryLineage: null,
    })),
    currentState: [],
    projectRefs: [],
    sourceGaps: [],
    ...overrides,
  };
}

describe("treatments history helpers", () => {
  test("turns promoted intervention comparisons into public cards", () => {
    const cards = interventionComparisonCards(servingInterventions);

    expect(cards).toEqual([
      {
        title: "ACE enforcement begins",
        year: "2025-01",
        tone: "good",
        routeDeltaLabel: "+0.55 mph",
        adjustedDeltaLabel: "+0.41 mph",
        comparisonLabel: "12 routes",
        windowLabel: "2024-07 to 2024-12 → 2025-02 to 2025-07",
        caveat: "Comparison-adjusted, not causal proof.",
      },
    ]);
  });

  test("deduplicates source-labeled treatment rows", () => {
    const rows = treatmentSourceRows([
      {
        year: "2025",
        title: "Bus lane opening evidence",
        detail: "Documented intervention.",
        sourceLabel: "NYC DOT",
        sourceDetail: "Structured intervention source",
      },
      {
        year: "2025",
        title: "Bus lane opening evidence",
        detail: "Documented intervention.",
        sourceLabel: "NYC DOT",
        sourceDetail: "Structured intervention source",
      },
      {
        year: "2026",
        title: "No source label",
        detail: "Not listed.",
      },
    ] satisfies StudioIntervention[]);

    expect(rows).toEqual([
      {
        key: "NYC DOT:Structured intervention source",
        label: "NYC DOT",
        detail: "Structured intervention source",
        year: "2025",
      },
    ]);
  });

  test("selects sorted timeline-placement insights for the treatment section", () => {
    const rows = treatmentHistoryInsightRows([
      insight({ detectorId: "other", placement: "overview", severity: "high", scopeId: "skip" }),
      insight({
        detectorId: "treatment_scope_gap",
        placement: "timeline",
        severity: "medium",
        scopeId: "treatment",
      }),
      insight({
        detectorId: "timeline_event",
        placement: "timeline",
        severity: "high",
        scopeId: "timeline",
      }),
      insight({
        detectorId: "timeline_annotation",
        kind: "timeline_annotation",
        placement: "overview",
        severity: "low",
        scopeId: "skip-kind",
      }),
    ]);

    expect(rows.map((row) => row.scopeId)).toEqual(["timeline", "treatment"]);
  });

  test("does not merge similarly worded timeline rows without a stable relationship ID", () => {
    const rows = mergedTreatmentTimelineRows(
      [
        {
          year: "2025-01",
          title: "Bus lane begins",
          detail: "Serving detail.",
          sourceLabel: "Serving",
        },
      ],
      evidenceBundle([
        wikiEvent({
          recordId: "event_bus_lane_begins",
          eventKind: "serving_intervention",
          title: "Bus lane begins",
          description: "Wiki detail.",
          dateText: "2025-01",
          dateNormalized: "2025-01",
          datePrecision: "month",
          citationKeys: ["c2"],
        }),
      ]),
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.source)).toEqual(["serving", "wiki"]);
    expect(rows[1]).toEqual(
      expect.objectContaining({ detail: "Wiki detail.", citationKeys: ["c2"] }),
    );
  });

  test("timelineYearLabel never leaks a truncated year", () => {
    expect(timelineYearLabel("2024-03-01")).toBe("2024");
    expect(timelineYearLabel("undated")).toBe("Undated");
    expect(timelineYearLabel("circa 2019")).toBe("2019");
  });

  test("duplicate citation keys resolve to a single deduped source entry", () => {
    const bundle = evidenceBundle(largeTimeline);
    const entries = citationEntries(bundle, ["c1", "c1"]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.label).toContain("MTA Board Report");
  });

  test("History URL validation bounds targets and gives study precedence over record", () => {
    expect(
      validateRouteDetailPageSearch({
        tab: "history",
        study: "  study:event:1  ",
        record: "occurrence:v1:ignored",
      }),
    ).toEqual({ tab: "history", study: "study:event:1" });
    expect(
      validateRouteDetailPageSearch({ tab: "history", record: " occurrence:v1:kept " }),
    ).toEqual({ tab: "history", record: "occurrence:v1:kept" });
    expect(
      validateRouteDetailPageSearch({ tab: "overview", record: "occurrence:v1:ignored" }),
    ).toEqual({});
    expect(validateRouteDetailPageSearch({ tab: "history", record: "x".repeat(161) })).toEqual({
      tab: "history",
    });
  });
});

describe("TreatmentsHistorySection render", () => {
  const bundle = evidenceBundle(largeTimeline);
  const markup = renderToStaticMarkup(
    createElement(TreatmentsHistorySection, { data: routeDetail, evidence: bundle }),
  );

  test("bounds the timeline to 10 rows with a show-all toggle", () => {
    const rows = timelineDisplayRows(mergedTreatmentTimelineRows(servingInterventions, bundle));
    expect(rows.length).toBeGreaterThanOrEqual(12);
    const eleventh = rows[10];
    expect(eleventh).toBeDefined();
    if (eleventh) expect(markup).not.toContain(eleventh.title);
    expect(markup).toContain(`Show all ${rows.length} records`);
  });

  test("groups the timeline by year with dated groups first", () => {
    expect(markup).toContain("2024");
    expect(markup).toContain("2018");
  });

  test("renders undated rows as Undated, never unda, when visible", () => {
    const short = renderToStaticMarkup(
      createElement(TreatmentsHistorySection, {
        data: routeDetail,
        evidence: evidenceBundle([
          wikiEvent({ recordId: "ev_2024", dateNormalized: "2024-03", dateText: "2024-03" }),
          wikiEvent({ recordId: "ev_nodate_a" }),
        ]),
      }),
    );
    expect(short).toContain("Undated");
    expect(short).not.toContain("unda");
    expect(short.indexOf("Undated")).toBeGreaterThan(short.indexOf("2024"));
  });

  test("meta-metrics and old headers are gone", () => {
    for (const phrase of [
      "unda",
      "Families",
      "with source labels",
      "Document refs",
      "Dated history",
      "Use before reading speed",
      "Wiki treatments",
      "In the record",
      "·",
    ]) {
      expect(markup).not.toContain(phrase);
    }
  });

  test("evaluations keep real deltas and use an arrow window label", () => {
    expect(markup).toContain("+0.41 mph");
    expect(markup).toContain("+0.55 mph");
    expect(markup).toContain("→");
    expect(markup).not.toContain("-&gt;");
  });

  test("related projects remain separate from typed treatments and render source notes", () => {
    expect(markup).toContain("Related projects");
    expect(markup).not.toContain("Offset bus lane");
    expect(markup).toContain("First Avenue busway");
    expect(markup).toContain("Sources (");
  });

  test("renders every typed occurrence with stable anchors and exact ledger back-links", async () => {
    const inventory = inventoryBundle();
    const typed = await renderWithRouter(
      createElement(TreatmentsHistorySection, {
        data: routeDetail,
        evidence: bundle,
        inventory,
      }),
    );

    expect(typed).toContain("Busway");
    for (const treatment of inventory.treatments) {
      expect(typed).toContain(`intervention-${treatment.treatmentId.replaceAll(":", "_3a_")}`);
    }
    for (const occurrence of inventory.occurrences) {
      expect(typed).toContain(`intervention-${occurrence.occurrenceId.replaceAll(":", "_3a_")}`);
    }
    expect(typed).toContain("Browse this route in all interventions");
    expect(typed).toContain("route=m15-sbs");
    expect(typed).toContain("family=bus_priority_lane");
  });

  test("renders partial and checked-empty coverage as distinct text", async () => {
    const partial = await renderWithRouter(
      createElement(TreatmentsHistorySection, {
        data: routeDetail,
        evidence: null,
        inventory: inventoryBundle({ coverageState: "partial" }),
      }),
    );
    expect(partial).toContain("Treatment inventory coverage is partial; known records are shown.");

    const checkedEmpty = await renderWithRouter(
      createElement(TreatmentsHistorySection, {
        data: routeDetail,
        evidence: null,
        inventory: inventoryBundle({
          coverageState: "checked_no_positive_evidence",
          treatments: [],
          occurrences: [],
        }),
      }),
    );
    expect(checkedEmpty).toContain("No positive treatment evidence was found in checked sources.");
    expect(checkedEmpty).not.toContain("No interventions");
  });
});

describe("study integration", () => {
  const studiedEventBase = servingInterventions[0];
  if (studiedEventBase === undefined) throw new Error("serving intervention fixture is empty");
  const studiedEvent: StudioIntervention = {
    ...studiedEventBase,
    eventId: "ace:B41:ACE:2024-09-16",
  };
  const rollup = {
    artifactKind: "bp.studio.route_studies.v1",
    schemaVersion: 1,
    analysisMonth: "2026-03",
    routeId: "B41",
    routeSlug: "b41",
    studies: [studyFixture()],
  } as const;

  test("comparison cards join studies by registry event id, never by title", () => {
    const cards = interventionComparisonCards([studiedEvent, ...servingInterventions], rollup);
    expect(cards[0]?.study?.eventKey).toBe("study-event-abc");
    // The same title without an eventId stays unstudied.
    expect(cards[1]?.study).toBeUndefined();
    expect(comparisonCardsSubLine(cards)).toBe("2 evaluations, 1 with matched-segment study.");
    expect(comparisonCardsSubLine(interventionComparisonCards(servingInterventions))).toBe(
      "1 promoted comparison windows.",
    );
    expect(comparisonCardsSubLine([])).toBe("Comparison windows promoted by the pipeline.");
  });

  test("history deep-link motion honors reduced-motion preferences", () => {
    expect(historyTargetScrollBehavior(false)).toBe("smooth");
    expect(historyTargetScrollBehavior(true)).toBe("auto");
  });
});
