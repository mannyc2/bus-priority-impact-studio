import { describe, expect, test } from "bun:test";
import {
  collectOpenTreatmentVocabulary,
  DOCUMENT_TREATMENT_DISPOSITIONS,
  diffReviewedOpenTreatmentVocabulary,
  legacyRouteTreatmentDisposition,
  type ReviewedOpenTreatmentDispositionV1,
  resolveExactRouteId,
  resolveExactRouteIdentity,
  reviewedOpenTreatmentDisposition,
} from "@bp/analytics/interventions";
import type { StudioRouteIdentityPresentation } from "@bp/domain/studio";

function route(routeId: string): StudioRouteIdentityPresentation {
  return {
    routeId,
    routeFamilyId: routeId.replace(/\+$/u, ""),
    displayLabel: routeId,
    officialLongName: null,
    designationLiterals: [routeId],
    serviceModes: routeId.endsWith("+") ? ["sbs"] : ["local"],
    routeTypes: routeId.endsWith("+") ? ["SBS"] : ["Local"],
    tripTypes: [1],
  };
}

describe("route treatment crosswalk", () => {
  test("maps every closed document treatment through the binding table", () => {
    expect(DOCUMENT_TREATMENT_DISPOSITIONS).toEqual({
      bus_lane: {
        disposition: "mapped",
        treatmentKind: "bus_lane",
        treatmentFamily: "bus_priority_lane",
      },
      busway: {
        disposition: "mapped",
        treatmentKind: "busway",
        treatmentFamily: "bus_priority_lane",
      },
      transit_signal_priority: {
        disposition: "mapped",
        treatmentKind: "transit_signal_priority",
        treatmentFamily: "signal_priority",
      },
      queue_jump: {
        disposition: "mapped",
        treatmentKind: "queue_jump",
        treatmentFamily: "signal_priority",
      },
      stop_consolidation: {
        disposition: "mapped",
        treatmentKind: "stop_consolidation",
        treatmentFamily: "stop_change",
      },
      stop_relocation: {
        disposition: "mapped",
        treatmentKind: "stop_relocation",
        treatmentFamily: "stop_change",
      },
      bus_bulb: {
        disposition: "mapped",
        treatmentKind: "bus_bulb",
        treatmentFamily: "street_design",
      },
      neckdown: {
        disposition: "mapped",
        treatmentKind: "neckdown",
        treatmentFamily: "street_design",
      },
      red_paint: {
        disposition: "mapped",
        treatmentKind: "red_paint",
        treatmentFamily: "bus_priority_lane",
      },
      off_board_fare_collection: {
        disposition: "mapped",
        treatmentKind: "off_board_fare_collection",
        treatmentFamily: "boarding_and_fare",
      },
      all_door_boarding: {
        disposition: "mapped",
        treatmentKind: "all_door_boarding",
        treatmentFamily: "boarding_and_fare",
      },
      ace: {
        disposition: "mapped",
        treatmentKind: "automated_bus_lane_enforcement",
        treatmentFamily: "enforcement",
      },
      able: {
        disposition: "mapped",
        treatmentKind: "automated_bus_lane_enforcement",
        treatmentFamily: "enforcement",
      },
      reroute: {
        disposition: "mapped",
        treatmentKind: "route_redesign",
        treatmentFamily: "service_change",
      },
      pedestrian_improvement: {
        disposition: "mapped",
        treatmentKind: "pedestrian_improvement",
        treatmentFamily: "street_design",
      },
      signal_retiming: {
        disposition: "mapped",
        treatmentKind: "signal_retiming",
        treatmentFamily: "signal_priority",
      },
    });
  });

  test("requires an explicit reviewed disposition for open and legacy custom values", () => {
    expect(reviewedOpenTreatmentDisposition("frequency_increase")).toMatchObject({
      disposition: "mapped",
      treatmentKind: "frequency_change",
      treatmentFamily: "service_change",
    });
    expect(reviewedOpenTreatmentDisposition("new uncertain literal")).toEqual({
      disposition: "unmapped_review_required",
      rawValue: "new uncertain literal",
      reason: "unreviewed_open_value",
    });
    expect(legacyRouteTreatmentDisposition({ treatmentType: "custom_treatment" })).toEqual({
      disposition: "unmapped_review_required",
      rawValue: "",
      reason: "bare_custom_treatment",
    });
  });

  test("collects exact literals with per-source counts and reports missing and stale reviews", () => {
    const input = {
      reviewedCorpusCustomTreatments: ["busway_pilot", "unknown_compound", "busway_pilot"],
      wikiRouteEvidenceLiterals: ["turn_ban"],
      wikiOperationalOccurrenceLiterals: ["unknown_compound"],
      localRegistryRawInterventionTypes: ["turn_ban"],
    };
    expect(collectOpenTreatmentVocabulary(input)).toEqual([
      {
        rawValue: "busway_pilot",
        sourceCounts: {
          reviewed_corpus_custom: 2,
          wiki_route_evidence: 0,
          wiki_operational_occurrence: 0,
          local_registry: 0,
        },
        totalCount: 2,
      },
      {
        rawValue: "turn_ban",
        sourceCounts: {
          reviewed_corpus_custom: 0,
          wiki_route_evidence: 1,
          wiki_operational_occurrence: 0,
          local_registry: 1,
        },
        totalCount: 2,
      },
      {
        rawValue: "unknown_compound",
        sourceCounts: {
          reviewed_corpus_custom: 1,
          wiki_route_evidence: 0,
          wiki_operational_occurrence: 1,
          local_registry: 0,
        },
        totalCount: 2,
      },
    ]);
    const diff = diffReviewedOpenTreatmentVocabulary(input);
    expect(diff.exact).toBe(false);
    expect(diff.missing.map((row) => row.rawValue)).toEqual(["unknown_compound"]);
    expect(diff.extra.length).toBeGreaterThan(0);
  });

  test("accepts exact key-set equality including an explicit other_documented decision", () => {
    const table: ReviewedOpenTreatmentDispositionV1[] = [
      {
        rawValue: "reviewed unique treatment",
        disposition: "other_documented",
        treatmentKind: "other_documented",
        treatmentFamily: "other",
        reviewedLabel: "Reviewed unique treatment",
      },
    ];
    const diff = diffReviewedOpenTreatmentVocabulary(
      { reviewedCorpusCustomTreatments: ["reviewed unique treatment"] },
      table,
    );
    expect(diff.exact).toBe(true);
    expect(diff.missing).toEqual([]);
    expect(diff.extra).toEqual([]);
  });
});

describe("exact route treatment resolution", () => {
  test("keeps B44/B44+ and Q6/Q06 distinct", () => {
    const routes = [route("B44"), route("B44+"), route("Q6"), route("Q06")];
    for (const expected of ["B44", "B44+", "Q6", "Q06"]) {
      const resolution = resolveExactRouteIdentity({
        rawRouteId: expected,
        routes,
        sourceNamespace: "fixture",
        sourceVocabulary: "source_route_id",
      });
      expect(resolution.resolution).toBe("resolved");
      if (resolution.resolution === "resolved") expect(resolution.route.routeId).toBe(expected);
    }
  });

  test("does not manufacture suffixes, casing, padding, or neighboring identities", () => {
    const routeIds = ["B44+", "Q06", "SIM1"];
    for (const rawRouteId of ["B44", "b44+", "Q6", "SIM1X", " B44+"]) {
      const resolution = resolveExactRouteId({
        rawRouteId,
        routeIds,
        sourceNamespace: "fixture",
        sourceVocabulary: "source_route_id",
      });
      expect(resolution).toEqual({
        resolution: "unresolved",
        reconciliation: {
          sourceNamespace: "fixture",
          sourceVocabulary: "source_route_id",
          rawRouteId,
          reason: "exact_route_not_found",
        },
      });
    }
  });
});
