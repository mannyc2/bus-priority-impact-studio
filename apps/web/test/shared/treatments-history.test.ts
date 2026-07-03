import { describe, expect, test } from "bun:test";
import {
  interventionComparisonCards,
  mergedTreatmentTimelineRows,
  treatmentHistoryInsightRows,
  treatmentSourceRows,
} from "../../src/components/route/TreatmentsHistorySection";
import type {
  StudioIntervention,
  StudioRouteEvidenceBundle,
  StudioRouteInsight,
} from "../../src/studio/api-contract";

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

describe("treatments history helpers", () => {
  test("turns promoted intervention comparisons into public cards", () => {
    const cards = interventionComparisonCards([
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
    ] satisfies StudioIntervention[]);

    expect(cards).toEqual([
      {
        title: "ACE enforcement begins",
        year: "2025-01",
        tone: "good",
        routeDeltaLabel: "+0.55 mph",
        adjustedDeltaLabel: "+0.41 mph",
        comparisonLabel: "12 routes",
        windowLabel: "2024-07 to 2024-12 -> 2025-02 to 2025-07",
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

  test("merges wiki timeline rows with citations over matching serving rows", () => {
    const rows = mergedTreatmentTimelineRows(
      [
        {
          year: "2025-01",
          title: "Bus lane begins",
          detail: "Serving detail.",
          sourceLabel: "Serving",
        },
      ],
      {
        routeId: "M14A",
        routeSlug: "m14a-sbs",
        wikiRouteRecordId: "route_m14a",
        wikiRouteIds: ["M14A"],
        wikiAliases: ["M14A SBS"],
        coverage: {
          timelineCount: 1,
          interventionCount: 0,
          metricClaimCount: 0,
          projectCount: 0,
          sourceGapCount: 0,
          citationCount: 1,
        },
        timeline: [
          {
            recordId: "event_bus_lane_begins",
            recordKind: "event",
            citationKeys: ["source#block"],
            eventKind: "serving_intervention",
            eventFamily: "treatment",
            lifecyclePhase: "implemented",
            title: "Bus lane begins",
            description: "Wiki detail.",
            dateText: "2025-01",
            dateNormalized: "2025-01",
            datePrecision: "month",
          },
        ],
        interventions: [],
        metricClaims: [],
        projects: [],
        sourceGaps: [],
        citations: [
          {
            key: "source#block",
            sourceId: "source",
            blockId: "block",
            evidenceId: "source#block",
            sourcePath: "raw/source.jsonl",
          },
        ],
      } satisfies StudioRouteEvidenceBundle,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        source: "wiki",
        detail: "Wiki detail.",
        citationKeys: ["source#block"],
      }),
    );
  });
});
