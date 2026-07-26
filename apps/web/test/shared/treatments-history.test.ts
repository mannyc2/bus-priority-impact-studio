import { beforeAll, describe, expect, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildRouteHistoryLedger,
  filterRouteHistoryLedger,
  groupRouteHistoryLedger,
  historyYearLabel,
} from "../../src/components/route/route-history-ledger";
import { routeInterventionViewModel } from "../../src/components/route/route-intervention-model";
import {
  historyTargetScrollBehavior,
  interventionComparisonCards,
  TreatmentsHistorySection,
} from "../../src/components/route/TreatmentsHistorySection";
import { citationEntries, citationHref } from "../../src/components/SourceNote";
import { validateRouteDetailPageSearch } from "../../src/routes/routes/$routeId";
import type {
  StudioIntervention,
  StudioRouteDetailResponse,
  StudioRouteEvidenceBundle,
  StudioRouteEvidenceTimelineEvent,
  StudioRouteInterventionInventoryBundle,
} from "../../src/studio/api-contract";
import { isoMonthFixture } from "./schema-fixtures";
import { studyFixture } from "./study-fixture";

/** Change-entry headings, in render order. Band labels repeat the same titles
 *  above the entries, so a plain substring search would read the wrong order. */
function entryTitles(markup: string): string[] {
  return [...markup.matchAll(/tracking-\[-0\.01em\]">([^<]*)</gu)].map((match) => match[1] ?? "");
}

async function renderWithRouter(node: ReactNode): Promise<string> {
  const rootRoute = createRootRoute({ component: () => node });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return renderToStaticMarkup(createElement(RouterProvider, { router }));
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

/** A 36-month route speed series, so the context layer and the trend window
 *  have something real to read. */
function dossierFixture(): NonNullable<StudioRouteDetailResponse["dossier"]> {
  const sparkline = Array.from({ length: 36 }, (_, index) => {
    const month = 4 + index;
    return {
      month: `${2023 + Math.floor((month - 1) / 12)}-${String(((month - 1) % 12) + 1).padStart(2, "0")}`,
      value: 7 + (index % 5) * 0.1,
    };
  });
  const metric = {
    current: 7.2,
    movement6mPct: null,
    peerPercentile: null,
    sparkline,
    dataAsOf: "2026-03",
  };
  return {
    artifactKind: "studio_route_dossier_summary",
    schemaVersion: 2,
    generatedAt: "2026-07-01T00:00:00.000Z",
    routeId: "M15+",
    routeSlug: "m15-sbs",
    releaseId: "pub_20260701T000000000Z",
    publishedAt: "2026-07-01T00:00:00.000Z",
    coverage: { start: isoMonthFixture("2023-04"), end: isoMonthFixture("2026-03") },
    dataAsOf: "2026-03",
    speed: metric,
    ridership: metric,
    worstSegment: null,
    treatmentPosture: {
      aceActive: true,
      aceSince: "2024",
      busLaneMatchedLaneCount: 0,
      latestEvents: [],
      dataAsOf: "2026-03",
    },
  };
}

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
        routeDeltaLabel: "+0.55 mph",
        adjustedDeltaLabel: "+0.41 mph",
        caveat: "Comparison-adjusted, not causal proof.",
      },
    ]);
  });

  test("does not merge similarly worded records without a stable relationship ID", () => {
    const rows = buildRouteHistoryLedger({
      interventions: [
        {
          year: "2025-01",
          title: "Bus lane begins",
          detail: "Serving detail.",
          sourceLabel: "Serving",
        },
      ],
      evidence: evidenceBundle([
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
      model: routeInterventionViewModel(null),
    });

    expect(rows.filter((row) => row.title === "Bus lane begins")).toHaveLength(2);
    expect(rows.find((row) => row.recordId === "event_bus_lane_begins")).toEqual(
      expect.objectContaining({ detail: "Wiki detail.", citationKeys: ["c2"] }),
    );
  });

  test("historyYearLabel keeps undated records explicit", () => {
    expect(historyYearLabel("2024-03-01")).toBe("2024");
    expect(historyYearLabel("undated")).toBe("Undated");
    expect(historyYearLabel("circa 2019")).toBe("2019");
  });

  test("duplicate citation keys resolve to a single deduped source entry", () => {
    const bundle = evidenceBundle(largeTimeline);
    const entries = citationEntries(bundle, ["c1", "c1"]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.label).toContain("MTA Board Report");
  });

  test("adds page fragments only to typed PDF citations", () => {
    expect(citationHref({ sourceUrl: "https://example.com/report.pdf", pageNumber: 7 })).toBe(
      "https://example.com/report.pdf#page=7",
    );
    expect(citationHref({ sourceUrl: "https://example.com/report", pageNumber: 7 })).toBe(
      "https://example.com/report",
    );
    expect(citationHref({ sourceUrl: "https://example.com/report.pdf" })).toBe(
      "https://example.com/report.pdf",
    );
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

describe("route history ledger ordering", () => {
  test("pure ledger filtering is typed and keeps undated last", () => {
    const rows = buildRouteHistoryLedger({
      interventions: servingInterventions,
      evidence: evidenceBundle(largeTimeline),
      model: routeInterventionViewModel(null),
    });
    const projects = filterRouteHistoryLedger(rows, { query: "avenue", kind: "project" });
    expect(projects.map((row) => row.kind)).toEqual(["project", "project"]);
    expect(groupRouteHistoryLedger(rows).at(-1)?.year).toBe("Undated");
  });

  test("orders year groups newest-first when a typed date label is not ISO-formatted", () => {
    const rows = buildRouteHistoryLedger({
      interventions: [],
      evidence: evidenceBundle([
        wikiEvent({
          recordId: "free_form_2010",
          dateText: "March 18 and 24, 2010",
        }),
        wikiEvent({
          recordId: "iso_2025",
          dateText: "2025-05-05",
          dateNormalized: "2025-05-05",
        }),
      ]),
      model: routeInterventionViewModel(null),
    }).filter((row) => row.recordId === "free_form_2010" || row.recordId === "iso_2025");

    expect(rows.map((row) => row.recordId)).toEqual(["iso_2025", "free_form_2010"]);
    expect(groupRouteHistoryLedger(rows).map((group) => group.year)).toEqual(["2025", "2010"]);
  });

  test("orders prose dates by interval and keeps a multi-year span in one group", () => {
    const rows = buildRouteHistoryLedger({
      interventions: [
        { year: "TBD", title: "Date to be determined", detail: "Source states no date." },
        {
          year: "Thursday, March 19th at 6:00pm",
          title: "Open house without a year",
          detail: "Meeting notice with no year.",
        },
        { year: "2026-spring", title: "Season record", detail: "Season-precision date." },
        { year: "2026-04", title: "Month record", detail: "Month-precision date." },
        { year: "2013-2014", title: "Multi-year record", detail: "Two-year program span." },
      ],
      evidence: null,
      model: routeInterventionViewModel(null),
    });

    expect(rows.map((row) => row.title)).toEqual([
      "Month record",
      "Season record",
      "Multi-year record",
      "Date to be determined",
      "Open house without a year",
    ]);

    const groups = groupRouteHistoryLedger(rows);
    // "2013–2014" uses an EN DASH and stays a single group.
    expect(groups.map((group) => group.year)).toEqual(["2026", "2013–2014", "Undated"]);
    expect(groups.filter((group) => group.year === "2013–2014")).toHaveLength(1);
    expect(groups[1]?.rows.map((row) => row.title)).toEqual(["Multi-year record"]);
    expect(groups.at(-1)?.rows).toHaveLength(2);
  });
});

describe("TreatmentsHistorySection render", () => {
  const bundle = evidenceBundle(largeTimeline);
  let markup = "";
  beforeAll(async () => {
    markup = await renderWithRouter(
      createElement(TreatmentsHistorySection, { data: routeDetail, evidence: bundle }),
    );
  });

  test("the tab opens with a composed standing sentence, not an inventory", () => {
    expect(markup).toContain("The M15 SBS has bus lane.");
    expect(markup).toContain("See where these run on the map");
    expect(markup).toContain("Browse this exact route in all interventions");
    expect(markup).toContain("route=m15-sbs");
  });

  test("the chronology card states what it is for", () => {
    expect(markup).toContain("What changed, and what changed with it");
    expect(markup).toContain("Each bar is a change, drawn across the period it was being built");
  });

  test("the deleted duplicate surfaces are gone", () => {
    for (const phrase of [
      "Current state",
      "Documented treatments",
      "Before &amp; after",
      "Outcomes",
      "Type: All records",
      "Filter History by record type",
      "No published outcome",
    ]) {
      expect(markup).not.toContain(phrase);
    }
  });

  test("no interpunct reaches the rendered markup", () => {
    expect(markup).not.toContain("·");
    expect(markup).not.toContain("&middot;");
  });

  test("milestones collapse into one disclosure with honest counts", () => {
    // 10 wiki timeline events plus 2 documented projects; the treatments and
    // the three serving interventions are changes and stay out of it.
    expect(markup).toContain("12 further records");
    expect(markup).toContain("community board meetings, contract awards and construction phases");
    expect(markup).toContain("across 2 projects");
    expect(markup).toContain("Show project activity");
  });

  test("dated changes render newest first with their evidence state", () => {
    expect(entryTitles(markup)).toEqual([
      "ACE enforcement begins",
      "Bus lane repainted",
      "TSP pilot",
    ]);
    // Peer-adjusted stays muted and unlinked, and never claims causation.
    expect(markup).toContain("+0.41 mph");
    expect(markup).toContain("Compared with similar routes. Not a controlled result.");
    expect(markup).toContain("Nothing to measure it with");
    expect(markup).toContain("We have not yet defined how to measure this kind of change.");
  });

  test("undated changes are listed, never given a band", () => {
    expect(markup).toContain("changes are recorded without a date");
    expect(markup).toContain("Offset bus lane");
  });

  test("sparse routes keep an honest empty chronology", async () => {
    const sparse = await renderWithRouter(
      createElement(TreatmentsHistorySection, {
        data: { ...routeDetail, route: { ...routeDetail.route, interventions: [] } },
        evidence: null,
      }),
    );
    expect(sparse).toContain("We have no documented change on this route.");
    expect(sparse).toContain("No change on this route carries a date we can place on a timeline.");
    expect(sparse).toContain("No further changes are recorded without a date.");
    expect(sparse).not.toContain("further records");
  });

  test("a checked-but-empty inventory says what was checked", async () => {
    const checkedEmpty = await renderWithRouter(
      createElement(TreatmentsHistorySection, {
        data: { ...routeDetail, route: { ...routeDetail.route, interventions: [] } },
        evidence: null,
        inventory: inventoryBundle({
          coverageState: "checked_no_positive_evidence",
          treatments: [],
          occurrences: [],
        }),
      }),
    );
    expect(checkedEmpty).toContain(
      "We checked the sources we hold and found no documented change on this route.",
    );
  });

  test("typed occurrences keep their anchors so record deep links resolve", async () => {
    const inventory = inventoryBundle();
    const typed = await renderWithRouter(
      createElement(TreatmentsHistorySection, {
        data: routeDetail,
        evidence: bundle,
        inventory,
      }),
    );
    expect(typed).toContain("Busway");
    for (const occurrence of inventory.occurrences) {
      expect(typed).toContain(`intervention-${occurrence.occurrenceId.replaceAll(":", "_3a_")}`);
    }
    expect(typed).toContain("The M15 SBS has busway and bus lane.");
  });

  test("citations render inline with their PDF page anchors intact", async () => {
    const cited = await renderWithRouter(
      createElement(TreatmentsHistorySection, {
        data: { ...routeDetail, route: { ...routeDetail.route, interventions: [] } },
        evidence: {
          ...bundle,
          timeline: [
            wikiEvent({
              recordId: "ev_impl",
              eventFamily: "implementation",
              title: "Bus lane opens",
              dateNormalized: "2024-05",
              citationKeys: ["c3"],
            }),
          ],
          metricClaims: [
            {
              recordId: "claim_1",
              recordKind: "metric_claim",
              citationKeys: ["c3"],
              metricName: "weekday_ridership",
              rawValue: "18,600",
              value: 18600,
              unit: "riders",
              period: "the first year",
              scope: "route",
              description: null,
            },
          ],
          citations: [
            ...bundle.citations,
            {
              key: "c3",
              sourceId: "cb7",
              blockId: "b3",
              evidenceId: "cb7#b3",
              sourcePath: "raw/cb7.jsonl",
              sourceTitle: "Community Board 7 presentation",
              publisher: "NYC DOT",
              pageNumber: 24,
              sourceUrl: "https://example.com/cb7.pdf",
            },
          ],
        },
      }),
    );
    expect(cited).toContain("Recorded in ");
    expect(cited).toContain("https://example.com/cb7.pdf#page=24");
    expect(cited).toContain("Community Board 7 presentation");
    expect(cited).toContain("NYC DOT reported weekday ridership of 18,600 over the first year.");
  });

  test("overlapping changes say so in words, not only in colour", async () => {
    const overlapping = await renderWithRouter(
      createElement(TreatmentsHistorySection, {
        data: {
          ...routeDetail,
          route: {
            ...routeDetail.route,
            interventions: [
              { year: "2013", title: "Select Bus Service", detail: "Corridor package." },
              { year: "2013-02", title: "Bus lane", detail: "Curbside lane." },
              { year: "2013-03", title: "Turn restrictions", detail: "Left turns removed." },
            ],
          },
        },
        evidence: null,
      }),
    );
    expect(overlapping).toContain("Cannot be separated");
    expect(overlapping).toContain(
      "2 other changes landed on this route at the same time: Bus lane and Turn restrictions.",
    );
    expect(overlapping).toContain("changes at once");
    expect(overlapping).toContain("Changes on the M15 SBS from 2013 to 2016");
  });

  test("a recent change with a short record says it is too early", async () => {
    const recent = await renderWithRouter(
      createElement(TreatmentsHistorySection, {
        data: {
          ...routeDetail,
          dossier: dossierFixture(),
          route: {
            ...routeDetail.route,
            interventions: [
              { year: "2026-01", title: "Bus lane extended", detail: "New block of lane." },
            ],
          },
        },
        evidence: null,
      }),
    );
    expect(recent).toContain("Too early to say");
    expect(recent).toContain("months of data since this change.");
    // The context layer draws only when a real monthly series exists.
    expect(recent).toContain("Average speed");
  });

  test("dense milestone ledgers paginate in complete, announced batches", async () => {
    const denseEvidence = evidenceBundle(
      Array.from({ length: 25 }, (_, index) =>
        wikiEvent({
          recordId: `dense_${index}`,
          dateNormalized: `${2025 - index}-01`,
          dateText: `${2025 - index}-01`,
        }),
      ),
    );
    const dense = await renderWithRouter(
      createElement(TreatmentsHistorySection, {
        data: routeDetail,
        evidence: denseEvidence,
        // Targeting a collapsed record opens the disclosure, so its controls render.
        recordKey: "dense_24",
      }),
    );
    expect(dense).toContain("27 further records");
    expect(dense).toContain("Search project activity");
    expect(dense).toContain("left)");
  });
});

describe("study integration", () => {
  const studiedEvent: StudioIntervention = {
    year: "2024-09",
    title: "ACE enforcement begins",
    detail: "Cameras switched on.",
    eventId: "ace:B41:ACE:2024-09-16",
  };
  const rollup = {
    artifactKind: "bp.studio.route_studies.v1",
    schemaVersion: 1,
    analysisMonth: "2026-03",
    routeId: "M15+",
    routeSlug: "m15-sbs",
    studies: [studyFixture({ routeId: "M15+", routeSlug: "m15-sbs" })],
  } as const;
  const studiedRoute = {
    ...routeDetail,
    route: { ...routeDetail.route, interventions: [studiedEvent] },
  } satisfies StudioRouteDetailResponse;

  test("comparison cards join studies by registry event id, never by title", () => {
    const cards = interventionComparisonCards([...servingInterventions], {
      ...rollup,
      studies: [studyFixture()],
    });
    // The ACE fixture carries a cohort but no eventId, so no study attaches.
    expect(cards).toHaveLength(1);
    expect(cards[0]?.study).toBeUndefined();
  });

  test("history deep-link motion honors reduced-motion preferences", () => {
    expect(historyTargetScrollBehavior(false)).toBe("smooth");
    expect(historyTargetScrollBehavior(true)).toBe("auto");
  });

  test("a published matched study renders inside the change it evaluates", async () => {
    const matched = await renderWithRouter(
      createElement(TreatmentsHistorySection, {
        data: studiedRoute,
        evidence: null,
        studies: rollup,
      }),
    );
    expect(matched).toContain("vs controls");
    expect(matched).toContain("Compared with matched control segments.");
    expect(matched).not.toContain("Cannot be separated");
    expect(matched).toContain(`intervention-${"study:study-event-abc".replaceAll(":", "_3a_")}`);
  });

  test("a descriptive study keeps its own tier sentence", async () => {
    const descriptive = await renderWithRouter(
      createElement(TreatmentsHistorySection, {
        data: studiedRoute,
        evidence: null,
        studies: {
          ...rollup,
          studies: [
            studyFixture({
              routeId: "M15+",
              routeSlug: "m15-sbs",
              eventKey: "study-event-descriptive",
              claimTier: "descriptive",
              evaluationLevel: "descriptive_before_after",
              direction: "improved",
            }),
          ],
        },
      }),
    );
    expect(descriptive).toContain("Not a controlled comparison.");
    expect(descriptive).toContain("Before and after this change, without a control comparison.");
  });

  test("the study deep link keeps precedence over a record deep link", async () => {
    const targeted = await renderWithRouter(
      createElement(TreatmentsHistorySection, {
        data: studiedRoute,
        evidence: null,
        studies: rollup,
        studyKey: "study-event-abc",
        recordKey: "ace:B41:ACE:2024-09-16",
      }),
    );
    expect(targeted).toContain("var(--bp-color-accent)");
    expect(
      validateRouteDetailPageSearch({
        tab: "history",
        study: "study-event-abc",
        record: "ace:B41:ACE:2024-09-16",
      }),
    ).toEqual({ tab: "history", study: "study-event-abc" });
  });
});
