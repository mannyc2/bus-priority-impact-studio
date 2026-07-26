import { describe, expect, test } from "bun:test";
import {
  confoundedSentence,
  noProductSentence,
  routeChangeChronology,
  tooEarlySentence,
} from "../../src/components/route/route-change-chronology";
import type {
  RouteStudiesArtifact,
  StudioIntervention,
  StudioInterventionLifecycleState,
  StudioInterventionTreatmentFamily,
  StudioInterventionTreatmentKind,
  StudioRouteDetailResponse,
  StudioRouteEvidenceBundle,
  StudioRouteEvidenceMetricClaim,
  StudioRouteEvidenceTimelineEvent,
  StudioRouteInterventionInventoryBundle,
  StudioRouteInterventionTreatment,
} from "../../src/studio/api-contract";
import { isoMonthFixture } from "./schema-fixtures";
import { studyFixture } from "./study-fixture";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function routeFixture(
  over: Partial<StudioRouteDetailResponse["route"]> = {},
): StudioRouteDetailResponse["route"] {
  return {
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
    diagnosis: "Fixture route.",
    spark: [],
    termini: { north: "East Harlem", south: "South Ferry" },
    miles: 8.1,
    stops: 42,
    flags: [],
    peerSlug: null,
    interventions: [],
    movement6mPct: null,
    context12mPct: null,
    ...over,
  };
}

function treatmentFixture(input: {
  id: string;
  kind: StudioInterventionTreatmentKind;
  family: StudioInterventionTreatmentFamily;
  effectiveDate: string | null;
  lifecycleState?: StudioInterventionLifecycleState;
  geographyScope?: StudioRouteInterventionTreatment["geographyScope"];
}): StudioRouteInterventionTreatment {
  return {
    treatmentId: `treatment:v1:${input.id}`,
    sourceNamespace: "reviewed_intervention_corpus",
    sourceRecordId: `record-${input.id}`,
    sourceId: "fixture-source",
    componentCollection: "primary",
    componentPosition: 0,
    rawKind: input.kind,
    rawLabel: null,
    treatmentKind: input.kind,
    treatmentFamily: input.family,
    lifecycleState: input.lifecycleState ?? "implemented",
    statusAsOf: null,
    effectiveDate: input.effectiveDate,
    datePrecision: "month",
    geographyScope: input.geographyScope ?? "route",
    sourceRefs: ["source:fixture"],
    occurrenceIds: [],
    projectIds: [],
  };
}

function inventoryFixture(
  over: Partial<StudioRouteInterventionInventoryBundle> = {},
): StudioRouteInterventionInventoryBundle {
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
    treatments: [],
    occurrences: [],
    currentState: [],
    projectRefs: [],
    sourceGaps: [],
    ...over,
  };
}

function timelineEvent(
  input: Partial<StudioRouteEvidenceTimelineEvent> & { recordId: string },
): StudioRouteEvidenceTimelineEvent {
  return {
    recordKind: "event",
    citationKeys: [],
    eventKind: null,
    eventFamily: "process",
    lifecyclePhase: null,
    title: `Event ${input.recordId}`,
    description: "Documented route event.",
    dateText: null,
    dateNormalized: null,
    datePrecision: null,
    ...input,
  };
}

function evidenceFixture(input: {
  timeline?: StudioRouteEvidenceTimelineEvent[];
  metricClaims?: StudioRouteEvidenceMetricClaim[];
  projects?: StudioRouteEvidenceBundle["projects"];
}): StudioRouteEvidenceBundle {
  const timeline = input.timeline ?? [];
  const projects = input.projects ?? [];
  const metricClaims = input.metricClaims ?? [];
  return {
    routeId: "M15+",
    routeSlug: "m15-sbs",
    wikiRouteRecordId: "route_m15",
    wikiRouteIds: ["M15+"],
    wikiAliases: [],
    coverage: {
      timelineCount: timeline.length,
      interventionCount: 0,
      metricClaimCount: metricClaims.length,
      projectCount: projects.length,
      sourceGapCount: 0,
      citationCount: 1,
    },
    timeline,
    interventions: [],
    metricClaims,
    projects,
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
      },
    ],
  };
}

const NO_ARTIFACTS = { evidence: null, inventory: null, studies: null } as const;

function chronology(input: {
  route?: Partial<StudioRouteDetailResponse["route"]>;
  evidence?: StudioRouteEvidenceBundle | null;
  inventory?: StudioRouteInterventionInventoryBundle | null;
  studies?: RouteStudiesArtifact | null;
  trendMonths?: readonly string[];
}) {
  return routeChangeChronology({
    route: routeFixture(input.route ?? {}),
    evidence: input.evidence ?? null,
    inventory: input.inventory ?? null,
    studies: input.studies ?? null,
    trendMonths: input.trendMonths ?? [],
  });
}

const ACE_EVENT_ID = "ace:B41:ACE:2024-09-16";
const cohort = {
  method: "peer_adjusted_before_after",
  causalInterpretation: "comparison_adjusted_not_causal_proof",
  methodLimitations: ["not_randomized_or_quasi_experimental"],
  routeIds: ["M14A"],
  routeCount: 12,
  preWindow: { from: "2024-07", to: "2024-12", sampleMonths: 6 },
  postWindow: { from: "2025-02", to: "2025-07", sampleMonths: 6 },
  routeSpeedDeltaMph: 0.55,
  comparisonSpeedDeltaMph: 0.14,
  adjustedSpeedDeltaMph: 0.41,
  caveat: "Comparison-adjusted, not causal proof.",
} satisfies NonNullable<StudioIntervention["comparisonCohort"]>;

function studiesFixture(
  over: Partial<RouteStudiesArtifact> = {},
  study = studyFixture(),
): RouteStudiesArtifact {
  return {
    artifactKind: "bp.studio.route_studies.v1",
    schemaVersion: 1,
    analysisMonth: "2026-03",
    routeId: "B41",
    routeSlug: "b41",
    studies: [study],
    ...over,
  };
}

/** 2023-04 through 2026-03, the shipped speed window. */
const TREND_MONTHS = Array.from({ length: 36 }, (_, index) => {
  const month = 4 + index;
  return `${2023 + Math.floor((month - 1) / 12)}-${String(((month - 1) % 12) + 1).padStart(2, "0")}`;
});

// ---------------------------------------------------------------------------
// Standing sentence
// ---------------------------------------------------------------------------

describe("standing sentence", () => {
  test("no treatment known and no inventory says so plainly", () => {
    expect(chronology({}).standing).toEqual({
      sentence: "We have no documented change on this route.",
      chips: [],
    });
  });

  test("a checked-but-empty inventory says what we checked", () => {
    const result = chronology({
      inventory: inventoryFixture({ coverageState: "checked_no_positive_evidence" }),
    });
    expect(result.standing.sentence).toBe(
      "We checked the sources we hold and found no documented change on this route.",
    );
    expect(result.standing.chips).toEqual([]);
  });

  test("treatments compose a sentence with the newest arrival year", () => {
    const result = chronology({
      inventory: inventoryFixture({
        treatments: [
          treatmentFixture({
            id: "a",
            kind: "bus_lane",
            family: "bus_priority_lane",
            effectiveDate: "2013-02",
          }),
          treatmentFixture({
            id: "b",
            kind: "select_bus_service",
            family: "service_package",
            effectiveDate: "2013-06",
          }),
          treatmentFixture({
            id: "c",
            kind: "automated_bus_lane_enforcement",
            family: "enforcement",
            effectiveDate: "2024-05",
          }),
        ],
      }),
    });
    expect(result.standing.sentence).toBe(
      "The M15 SBS has bus lane, select bus service and automated bus lane enforcement. " +
        "The most recent arrived in 2024.",
    );
    expect(result.standing.chips.map((chip) => [chip.label, chip.year])).toEqual([
      ["Bus lane", "2013"],
      ["Select Bus Service", "2013"],
      ["Automated bus lane enforcement", "2024"],
    ]);
    for (const chip of result.standing.chips) {
      expect(chip.anchorId).toStartWith("intervention-");
    }
  });

  test("proposed changes are counted, never described", () => {
    const result = chronology({
      inventory: inventoryFixture({
        treatments: [
          treatmentFixture({
            id: "a",
            kind: "bus_lane",
            family: "bus_priority_lane",
            effectiveDate: "2013-02",
          }),
          treatmentFixture({
            id: "b",
            kind: "busway",
            family: "bus_priority_lane",
            effectiveDate: "2027-01",
            lifecycleState: "proposed",
          }),
        ],
      }),
    });
    expect(result.standing.sentence).toBe(
      "The M15 SBS has bus lane and busway. The most recent arrived in 2027. " +
        "1 further change is proposed.",
    );
  });

  test("more than four treatments render three labels and a count", () => {
    const kinds = [
      ["a", "bus_lane", "bus_priority_lane"],
      ["b", "busway", "bus_priority_lane"],
      ["c", "queue_jump", "signal_priority"],
      ["d", "stop_consolidation", "stop_change"],
      ["e", "bus_bulb", "street_design"],
    ] as const;
    const result = chronology({
      inventory: inventoryFixture({
        treatments: kinds.map(([id, kind, family], index) =>
          treatmentFixture({
            id,
            kind,
            family,
            effectiveDate: `201${index}-01`,
          }),
        ),
      }),
    });
    expect(result.standing.sentence).toBe(
      "The M15 SBS has bus lane, busway, queue jump and 2 more. The most recent arrived in 2014.",
    );
    // Every treatment still gets a chip; only the sentence is capped.
    expect(result.standing.chips).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// Change versus milestone
// ---------------------------------------------------------------------------

describe("change versus milestone", () => {
  test("an implementation event is a change; a meeting and an award are collapsed", () => {
    const result = chronology({
      evidence: evidenceFixture({
        timeline: [
          timelineEvent({
            recordId: "ev_impl",
            eventFamily: "implementation",
            title: "Bus lane opens",
            dateNormalized: "2024-05",
            dateText: "2024-05",
          }),
          timelineEvent({
            recordId: "ev_board",
            eventFamily: "process",
            title: "Community board presentation",
            dateNormalized: "2023-03",
          }),
          timelineEvent({
            recordId: "ev_award",
            eventFamily: "procurement",
            title: "Contract awarded",
            dateNormalized: "2023-09",
          }),
        ],
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
        ],
      }),
      trendMonths: TREND_MONTHS,
    });

    expect(result.changes.map((change) => change.title)).toEqual(["Bus lane opens"]);
    expect(result.collapsed.recordCount).toBe(3);
    expect(result.collapsed.projectCount).toBe(1);
    expect(result.collapsed.rows.map((row) => row.title).sort()).toEqual([
      "Community board presentation",
      "Contract awarded",
      "First Avenue busway",
    ]);
  });

  test("a launch event also counts as a change", () => {
    const result = chronology({
      evidence: evidenceFixture({
        timeline: [
          timelineEvent({
            recordId: "ev_launch",
            eventFamily: "launch",
            title: "Select Bus Service launches",
            dateNormalized: "2013-06",
          }),
        ],
      }),
    });
    expect(result.changes).toHaveLength(1);
    expect(result.collapsed.recordCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Overlap
// ---------------------------------------------------------------------------

describe("overlap", () => {
  const interventions = [
    { year: "2013", title: "Select Bus Service", detail: "Corridor package." },
    { year: "2013-02", title: "Bus lane", detail: "Curbside lane." },
    { year: "2013-03", title: "Turn restrictions", detail: "Left turns removed." },
    { year: "2024-05", title: "Camera enforcement", detail: "Cameras switched on." },
  ] satisfies StudioIntervention[];

  const result = chronology({
    route: { interventions },
    trendMonths: TREND_MONTHS,
  });

  test("three intersecting 2013 changes form one cluster of three", () => {
    const confounded = result.changes.filter((change) => change.evidence.kind === "confounded");
    expect(confounded.map((change) => change.title).sort()).toEqual([
      "Bus lane",
      "Select Bus Service",
      "Turn restrictions",
    ]);
    for (const change of confounded) {
      if (change.evidence.kind !== "confounded") throw new Error("expected confounded");
      expect(change.evidence.overlappingTitles).toHaveLength(2);
      expect(change.evidence.overlappingTitles).not.toContain(change.title);
    }
  });

  test("a change outside the cluster is never confounded", () => {
    const later = result.changes.find((change) => change.title === "Camera enforcement");
    expect(later?.evidence.kind).not.toBe("confounded");
  });

  test("each hatched region reports only the changes actually sharing it", () => {
    // February holds the lane inside the SBS year; March holds the turn
    // restrictions inside it. The three never share a single day, so merging
    // the two regions would claim an overlap that did not happen.
    expect(result.overlaps).toHaveLength(2);
    expect(result.overlaps.map((region) => [region.start, region.end])).toEqual([
      ["2013-02-01", "2013-02-28"],
      ["2013-03-01", "2013-03-31"],
    ]);
    for (const region of result.overlaps) expect(region.changeKeys).toHaveLength(2);
  });

  test("a published study outranks the confounded heuristic", () => {
    const studied = chronology({
      route: {
        routeId: "B41",
        interventions: [
          ...interventions,
          {
            eventId: ACE_EVENT_ID,
            year: "2013-02",
            title: "Studied change",
            detail: "Has a published study.",
          },
        ],
      },
      studies: studiesFixture(),
      trendMonths: TREND_MONTHS,
    });
    const change = studied.changes.find((row) => row.title === "Studied change");
    expect(change?.evidence.kind).toBe("study");
  });

  test("bands pack into as few rows as fit and mark points apart from bars", () => {
    const bandByTitle = new Map(result.bands.map((band) => [band.label, band] as const));
    expect(bandByTitle.get("Select Bus Service")?.shape).toBe("bar");
    expect(bandByTitle.get("Bus lane")?.shape).toBe("point");
    // The year-long SBS band cannot share a row with the months inside it.
    expect(bandByTitle.get("Select Bus Service")?.row).toBe(0);
    expect(bandByTitle.get("Bus lane")?.row).toBeGreaterThan(0);
    expect(result.bands.every((band) => band.start >= 0 && band.end <= 1)).toBe(true);
    expect(new Set(result.bands.map((band) => band.row)).size).toBeLessThanOrEqual(3);
  });

  test("the axis spans the changes and the speed record in six ticks", () => {
    expect(result.axis.ticks).toHaveLength(6);
    expect(result.axis.startYear).toBe(2013);
    expect(result.axis.ticks[0]).toBe("2013");
    expect(Number(result.axis.ticks.at(-1))).toBeGreaterThanOrEqual(2026);
  });
});

// ---------------------------------------------------------------------------
// Evidence selection order
// ---------------------------------------------------------------------------

describe("evidence selection", () => {
  test("a study beats a peer-adjusted cohort on the same change", () => {
    const result = chronology({
      route: {
        routeId: "B41",
        interventions: [
          {
            eventId: ACE_EVENT_ID,
            year: "2024-09",
            title: "Camera enforcement begins",
            detail: "Cameras switched on.",
            comparisonCohort: cohort,
          },
        ],
      },
      studies: studiesFixture(),
      trendMonths: TREND_MONTHS,
    });
    const evidence = result.changes[0]?.evidence;
    expect(evidence?.kind).toBe("study");
    if (evidence?.kind !== "study") throw new Error("expected study");
    expect(evidence.tier).toBe("matched");
  });

  test("a descriptive study keeps its own tier", () => {
    const result = chronology({
      route: {
        routeId: "B41",
        interventions: [
          {
            eventId: ACE_EVENT_ID,
            year: "2024-09",
            title: "Camera enforcement begins",
            detail: "Cameras switched on.",
          },
        ],
      },
      studies: studiesFixture({}, studyFixture({ claimTier: "descriptive" })),
      trendMonths: TREND_MONTHS,
    });
    const evidence = result.changes[0]?.evidence;
    if (evidence?.kind !== "study") throw new Error("expected study");
    expect(evidence.tier).toBe("descriptive");
  });

  test("a cohort alone selects the peer-adjusted state", () => {
    const result = chronology({
      route: {
        interventions: [
          {
            year: "2024-09",
            title: "Camera enforcement begins",
            detail: "Cameras switched on.",
            comparisonCohort: cohort,
          },
        ],
      },
      trendMonths: TREND_MONTHS,
    });
    const evidence = result.changes[0]?.evidence;
    expect(evidence?.kind).toBe("peer_adjusted");
    if (evidence?.kind !== "peer_adjusted") throw new Error("expected peer_adjusted");
    expect(evidence.cohort.caveat).toBe("Comparison-adjusted, not causal proof.");
  });

  test("a recent change with too little record after it is too early to say", () => {
    const result = chronology({
      route: {
        interventions: [
          { year: "2025-12", title: "Bus lane extended", detail: "New block of lane." },
        ],
      },
      trendMonths: TREND_MONTHS,
    });
    const evidence = result.changes[0]?.evidence;
    expect(evidence?.kind).toBe("too_early");
    if (evidence?.kind !== "too_early") throw new Error("expected too_early");
    expect(evidence.monthsSince).toBe(3);
    expect(tooEarlySentence(evidence.monthsSince)).toBe("3 months of data since this change.");
  });

  test("a change before the speed record has nothing to measure it with", () => {
    const result = chronology({
      route: {
        interventions: [{ year: "2013-02", title: "Bus lane", detail: "Curbside lane." }],
      },
      trendMonths: TREND_MONTHS,
    });
    const evidence = result.changes[0]?.evidence;
    expect(evidence?.kind).toBe("no_product");
    if (evidence?.kind !== "no_product") throw new Error("expected no_product");
    expect(evidence.reason).toBe("no_speed_record");
    expect(noProductSentence(evidence.reason, "2023")).toBe(
      "Our speed record starts in 2023, after this change.",
    );
  });

  test("intersection and stop grain reasons come from the typed treatment kind", () => {
    const result = chronology({
      inventory: inventoryFixture({
        treatments: [
          treatmentFixture({
            id: "turn",
            kind: "turn_restriction",
            family: "street_design",
            effectiveDate: "2024-05",
          }),
          treatmentFixture({
            id: "stop",
            kind: "stop_consolidation",
            family: "stop_change",
            effectiveDate: "2024-09",
          }),
        ],
      }),
      // No speed record at all, so grain is the honest reason.
      trendMonths: [],
    });
    const reasons = result.changes.map((change) =>
      change.evidence.kind === "no_product" ? change.evidence.reason : change.evidence.kind,
    );
    expect(reasons.sort()).toEqual(["intersection_grain", "stop_grain"]);
    expect(noProductSentence("intersection_grain", "2023")).toBe(
      "We hold speeds by road segment and by route, not by intersection.",
    );
    expect(noProductSentence("stop_grain", "2023")).toBe(
      "We hold speeds by road segment and by route, not by individual stop.",
    );
  });

  test("a typed treatment scoped below the route says the average would not show it", () => {
    const result = chronology({
      inventory: inventoryFixture({
        treatments: [
          treatmentFixture({
            id: "lane",
            kind: "bus_lane",
            family: "bus_priority_lane",
            effectiveDate: "2024-05",
            geographyScope: "segment",
          }),
        ],
      }),
      trendMonths: [],
    });
    const evidence = result.changes[0]?.evidence;
    if (evidence?.kind !== "no_product") throw new Error("expected no_product");
    expect(evidence.reason).toBe("route_scope_mismatch");
    expect(noProductSentence(evidence.reason, "2023")).toBe(
      "This change covers part of the route, so a route-wide average would not show it.",
    );
  });

  test("an undated change with no measurable grain falls back to not yet specified", () => {
    const result = chronology({
      route: {
        interventions: [{ year: "TBD", title: "Corridor study", detail: "Date not stated." }],
      },
      trendMonths: TREND_MONTHS,
    });
    expect(result.changes).toHaveLength(0);
    const undated = result.undatedChanges[0];
    expect(undated?.evidence).toEqual({ kind: "no_product", reason: "not_yet_specified" });
    expect(noProductSentence("not_yet_specified", "2023")).toBe(
      "We have not yet defined how to measure this kind of change.",
    );
  });

  test("every evidence state is reachable from one route shape", () => {
    const result = chronology({
      route: {
        routeId: "B41",
        interventions: [
          {
            eventId: ACE_EVENT_ID,
            year: "2024-09",
            title: "Camera enforcement begins",
            detail: "Cameras switched on.",
          },
          {
            year: "2024-10",
            title: "Peer-adjusted change",
            detail: "Has a cohort.",
            comparisonCohort: cohort,
          },
          { year: "2013-02", title: "Bus lane", detail: "Curbside lane." },
          { year: "2013", title: "Select Bus Service", detail: "Corridor package." },
          { year: "2025-12", title: "Newest change", detail: "Just landed." },
          { year: "2010-05", title: "Stop spacing widened", detail: "Older than the record." },
        ],
      },
      studies: studiesFixture(),
      trendMonths: TREND_MONTHS,
    });
    expect(new Set(result.changes.map((change) => change.evidence.kind))).toEqual(
      new Set(["study", "peer_adjusted", "confounded", "too_early", "no_product"]),
    );
  });
});

// ---------------------------------------------------------------------------
// Value blindness
// ---------------------------------------------------------------------------

describe("value blindness", () => {
  const estimates = [12.5, -12.5, 0, null] as const;

  test("the same change selects the same state for any estimate", () => {
    const states = estimates.map((effectMph) => {
      const base = studyFixture();
      const variant = { ...base.variants.allDay, effectMph };
      const result = chronology({
        route: {
          routeId: "B41",
          interventions: [
            {
              eventId: ACE_EVENT_ID,
              year: "2024-09",
              title: "Camera enforcement begins",
              detail: "Cameras switched on.",
              comparisonCohort: cohort,
            },
          ],
        },
        studies: studiesFixture(
          {},
          studyFixture({ variants: { allDay: variant, peakHours: variant } }),
        ),
        trendMonths: TREND_MONTHS,
      });
      return result.changes.map((change) => change.evidence.kind);
    });
    expect(states).toEqual([["study"], ["study"], ["study"], ["study"]]);
  });

  test("a cohort's delta never changes the peer-adjusted verdict", () => {
    const deltas = [9.9, -9.9, 0, null];
    const kinds = deltas.map((adjustedSpeedDeltaMph) => {
      const result = chronology({
        route: {
          interventions: [
            {
              year: "2024-09",
              title: "Camera enforcement begins",
              detail: "Cameras switched on.",
              comparisonCohort: { ...cohort, adjustedSpeedDeltaMph },
            },
          ],
        },
        trendMonths: TREND_MONTHS,
      });
      return result.changes[0]?.evidence.kind;
    });
    expect(kinds).toEqual(["peer_adjusted", "peer_adjusted", "peer_adjusted", "peer_adjusted"]);
  });
});

// ---------------------------------------------------------------------------
// Agency claims
// ---------------------------------------------------------------------------

describe("agency claims", () => {
  const claim = {
    recordId: "claim_1",
    recordKind: "metric_claim",
    citationKeys: ["c1"],
    metricName: "weekday_ridership",
    rawValue: "18,600",
    value: 18600,
    unit: "riders",
    period: "first year",
    scope: "route",
    description: null,
  } satisfies StudioRouteEvidenceMetricClaim;

  test("a claim attaches only through a shared citation", () => {
    const result = chronology({
      evidence: evidenceFixture({
        timeline: [
          timelineEvent({
            recordId: "ev_a",
            eventFamily: "implementation",
            title: "Cited change",
            dateNormalized: "2013-06",
            citationKeys: ["c1"],
          }),
          timelineEvent({
            recordId: "ev_b",
            eventFamily: "implementation",
            title: "Uncited change",
            dateNormalized: "2015-06",
            citationKeys: [],
          }),
        ],
        metricClaims: [claim, { ...claim, recordId: "claim_2", citationKeys: ["c9"] }],
      }),
    });
    const cited = result.changes.find((change) => change.title === "Cited change");
    const uncited = result.changes.find((change) => change.title === "Uncited change");
    expect(cited?.agencyClaims).toEqual([
      {
        metricName: "weekday_ridership",
        rawValue: "18,600",
        period: "first year",
        citationKeys: ["c1"],
      },
    ]);
    expect(uncited?.agencyClaims).toEqual([]);
  });

  test("the stated value is carried verbatim, never converted", () => {
    const result = chronology({
      evidence: evidenceFixture({
        timeline: [
          timelineEvent({
            recordId: "ev_a",
            eventFamily: "implementation",
            dateNormalized: "2013-06",
            citationKeys: ["c1"],
          }),
        ],
        metricClaims: [{ ...claim, rawValue: "16,600 to 18,600", value: null, unit: null }],
      }),
    });
    expect(result.changes[0]?.agencyClaims[0]?.rawValue).toBe("16,600 to 18,600");
  });

  test("a claim with no metric name or no stated value is dropped", () => {
    const result = chronology({
      evidence: evidenceFixture({
        timeline: [
          timelineEvent({
            recordId: "ev_a",
            eventFamily: "implementation",
            dateNormalized: "2013-06",
            citationKeys: ["c1"],
          }),
        ],
        metricClaims: [
          { ...claim, metricName: null },
          { ...claim, recordId: "claim_2", rawValue: null },
        ],
      }),
    });
    expect(result.changes[0]?.agencyClaims).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Exact identity and honest absence
// ---------------------------------------------------------------------------

describe("exact identity", () => {
  test("a B44 study never attaches to the B44+ route", () => {
    const shared = {
      eventId: ACE_EVENT_ID,
      year: "2024-09",
      title: "Camera enforcement begins",
      detail: "Cameras switched on.",
    } satisfies StudioIntervention;

    const exact = chronology({
      route: { routeId: "B44", interventions: [shared] },
      studies: studiesFixture(
        { routeId: "B44", routeSlug: "b44" },
        studyFixture({ routeId: "B44" }),
      ),
      trendMonths: TREND_MONTHS,
    });
    expect(exact.changes[0]?.evidence.kind).toBe("study");

    const sibling = chronology({
      route: { routeId: "B44+", interventions: [shared] },
      studies: studiesFixture(
        { routeId: "B44", routeSlug: "b44" },
        studyFixture({ routeId: "B44" }),
      ),
      trendMonths: TREND_MONTHS,
    });
    expect(sibling.changes[0]?.evidence.kind).not.toBe("study");
  });
});

describe("band row cap", () => {
  test("a redesign-shaped route draws a bounded track and defers the rest", () => {
    // 20 records for one implementation date, as the 2025 Queens redesign
    // reaches us: every one is a real change, none can share a band row.
    const result = chronology({
      route: {
        interventions: Array.from({ length: 20 }, (_, index) => ({
          year: "2025-06",
          title: `Redesign component ${index + 1}`,
          detail: "One of many records for one date.",
        })),
      },
      trendMonths: TREND_MONTHS,
    });
    expect(result.changes).toHaveLength(20);
    expect(new Set(result.bands.map((band) => band.row)).size).toBe(8);
    expect(result.bands).toHaveLength(8);
    expect(result.hiddenBandCount).toBe(12);
  });

  test("a route inside the cap hides nothing", () => {
    const result = chronology({
      route: {
        interventions: [
          { year: "2024-06", title: "Bus lane", detail: "Curbside lane." },
          { year: "2025-06", title: "Camera enforcement", detail: "Cameras on." },
        ],
      },
      trendMonths: TREND_MONTHS,
    });
    expect(result.hiddenBandCount).toBe(0);
    expect(result.bands).toHaveLength(2);
  });
});

describe("honest absence", () => {
  test("no inventory, no evidence and no studies still yields a chronology", () => {
    const result = routeChangeChronology({
      route: routeFixture({
        interventions: [
          { year: "2024-06", title: "Bus lane repainted", detail: "Curbside lane refreshed." },
          { year: "2023-05", title: "TSP pilot", detail: "Signal priority pilot began." },
        ],
      }),
      ...NO_ARTIFACTS,
      trendMonths: TREND_MONTHS,
    });
    expect(result.changes.map((change) => change.title)).toEqual([
      "Bus lane repainted",
      "TSP pilot",
    ]);
    expect(result.undatedChanges).toEqual([]);
    expect(result.collapsed.recordCount).toBe(0);
    expect(result.bands).toHaveLength(2);
    expect(result.overlaps).toEqual([]);
    for (const change of result.changes) {
      expect(change.evidence.kind).toBeString();
      expect(change.agencyClaims).toEqual([]);
    }
  });

  test("an entirely empty route produces an empty, non-throwing chronology", () => {
    const result = routeChangeChronology({
      route: routeFixture(),
      ...NO_ARTIFACTS,
      trendMonths: [],
    });
    expect(result.changes).toEqual([]);
    expect(result.bands).toEqual([]);
    expect(result.overlaps).toEqual([]);
    expect(result.collapsed.rows).toEqual([]);
    expect(result.axis.ticks).toEqual([]);
  });
});

describe("display copy", () => {
  test("the confounded sentence names the other changes", () => {
    expect(confoundedSentence(["the bus lane", "the turn restrictions"])).toBe(
      "2 other changes landed on this route at the same time: the bus lane and the turn restrictions.",
    );
    expect(confoundedSentence(["the bus lane"])).toBe(
      "1 other change landed on this route at the same time: the bus lane.",
    );
  });

  test("the confounded sentence names at most three and keeps the true count", () => {
    const many = Array.from({ length: 27 }, (_, index) => `Change ${index + 1}`);
    expect(confoundedSentence(many)).toBe(
      "27 other changes landed on this route at the same time: Change 1, Change 2, Change 3 and 24 more.",
    );
    // Three or fewer are all named; the cap never invents an "and 0 more".
    expect(confoundedSentence(["A", "B", "C"])).toBe(
      "3 other changes landed on this route at the same time: A, B and C.",
    );
  });

  test("the too-early sentence counts months, never an estimate", () => {
    expect(tooEarlySentence(1)).toBe("1 month of data since this change.");
    expect(tooEarlySentence(0)).toBe("0 months of data since this change.");
  });
});
