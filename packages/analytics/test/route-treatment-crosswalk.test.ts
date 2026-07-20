import { describe, expect, test } from "bun:test";
import {
  adaptMtaWikiTreatmentSemanticContractV1,
  assertMtaWikiTreatmentSemanticsPublishableV1,
  collectOpenTreatmentVocabulary,
  DOCUMENT_TREATMENT_DISPOSITIONS,
  diffReviewedOpenTreatmentVocabulary,
  legacyRouteTreatmentDisposition,
  type MtaWikiTreatmentSemanticArtifactDispositionV1,
  type MtaWikiTreatmentSemanticArtifactV1,
  type MtaWikiTreatmentVocabularyScopeV1,
  type ReviewedOpenTreatmentDispositionV1,
  reconcileMtaWikiTreatmentSemanticsV1,
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

function semanticArtifact(
  dispositions: readonly MtaWikiTreatmentSemanticArtifactDispositionV1[],
): MtaWikiTreatmentSemanticArtifactV1 {
  return { schema_version: 1, dispositions };
}

function semanticVocabularyScopes(
  dispositions: readonly MtaWikiTreatmentSemanticArtifactDispositionV1[],
): MtaWikiTreatmentVocabularyScopeV1[] {
  return dispositions.flatMap((disposition) =>
    disposition.record_ids.map((recordId) => ({
      rawValue: disposition.raw_treatment_kind,
      recordId,
    })),
  );
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

describe("MTA Wiki treatment semantics v1", () => {
  test("reconciles the rc25 receipt exactly while keeping 1,006 literals blocking", () => {
    const atomicMappings = [
      ["transit_signal_priority", "signal_priority"],
      ["all_door_boarding", "boarding_and_fare"],
      ["automated_bus_lane_enforcement", "enforcement"],
      ["bus_bulb", "street_design"],
      ["bus_lane", "bus_priority_lane"],
      ["busway", "bus_priority_lane"],
      ["neckdown", "street_design"],
      ["off_board_fare_collection", "boarding_and_fare"],
      ["pedestrian_improvement", "street_design"],
      ["queue_jump", "signal_priority"],
      ["signal_retiming", "signal_priority"],
      ["stop_change", "stop_change"],
      ["stop_consolidation", "stop_change"],
      ["stop_relocation", "stop_change"],
      ["turn_restriction", "street_design"],
    ] as const;
    const atomic: MtaWikiTreatmentSemanticArtifactDispositionV1[] = Array.from(
      { length: 27 },
      (_, index) => {
        const mapping = atomicMappings[index % atomicMappings.length] as
          | (typeof atomicMappings)[number]
          | undefined;
        if (mapping === undefined) throw new Error("missing atomic fixture mapping");
        return {
          disposition: "atomic",
          raw_treatment_kind: `atomic raw ${index}`,
          record_ids: Array.from(
            { length: index < 2 ? 25 : 24 },
            (_value, scopeIndex) => `atomic-record-${index}-${scopeIndex}`,
          ),
          canonical_kind: mapping[0],
          family: mapping[1],
        };
      },
    );
    const bundleMembers = [
      {
        raw_treatment_kind: "bus lanes",
        canonical_kind: "bus_lane",
        family: "bus_priority_lane",
      },
      {
        raw_treatment_kind: "curb regulation updates",
        canonical_kind: "curb_regulation",
        family: "curb_management",
      },
      {
        raw_treatment_kind: "wayfinding signs",
        canonical_kind: "wayfinding_sign",
        family: "customer_information",
      },
    ] as const;
    const bundles: MtaWikiTreatmentSemanticArtifactDispositionV1[] = Array.from(
      { length: 5 },
      (_, index) => ({
        disposition: "bundle",
        raw_treatment_kind: `bundle raw ${index}`,
        record_ids: [`bundle-record-${index}`],
        bundle_family: null,
        members: bundleMembers,
      }),
    );
    const unresolved: MtaWikiTreatmentSemanticArtifactDispositionV1[] = Array.from(
      { length: 1_006 },
      (_, index) => ({
        disposition: "unresolved",
        raw_treatment_kind: `unresolved raw ${index}`,
        record_ids: Array.from(
          { length: index < 271 ? 3 : 2 },
          (_value, scopeIndex) => `unresolved-record-${index}-${scopeIndex}`,
        ),
        review_reason: "source-backed canonical semantics have not been reviewed",
      }),
    );
    const dispositions = [...atomic, ...bundles, ...unresolved];
    const artifact = semanticArtifact(dispositions);
    const reconciliation = reconcileMtaWikiTreatmentSemanticsV1({
      artifact,
      vocabularyScopes: semanticVocabularyScopes(dispositions),
    });

    expect(reconciliation.exact).toBe(true);
    expect(reconciliation.publishable).toBe(false);
    expect(reconciliation.summary).toEqual({
      vocabularyLiteralCount: 1_038,
      vocabularyRecordScopeCount: 2_938,
      dispositionCount: 1_038,
      atomicDispositionCount: 27,
      bundleDispositionCount: 5,
      unresolvedDispositionCount: 1_006,
      atomicRecordScopeCount: 650,
      bundleRecordScopeCount: 5,
      unresolvedRecordScopeCount: 2_283,
    });
    expect(reconciliation.blockingUnresolvedScopes).toHaveLength(2_283);
    expect(() =>
      assertMtaWikiTreatmentSemanticsPublishableV1({
        artifact,
        vocabularyScopes: semanticVocabularyScopes(dispositions),
      }),
    ).toThrow("2283 unresolved record scope(s)");
  });

  test("preserves source-backed bundle members and rejects unknown semantic guesses", () => {
    const bundle = semanticArtifact([
      {
        disposition: "bundle",
        raw_treatment_kind: "bus lanes and curb treatments",
        record_ids: ["treatment-bundle"],
        bundle_family: null,
        members: [
          {
            raw_treatment_kind: "bus lanes",
            canonical_kind: "bus_lane",
            family: "bus_priority_lane",
          },
          {
            raw_treatment_kind: "curb regulation updates",
            canonical_kind: "curb_regulation",
            family: "curb_management",
          },
        ],
      },
      {
        disposition: "unresolved",
        raw_treatment_kind: "unreviewed composite",
        record_ids: ["treatment-unresolved"],
        review_reason: "no source-backed atomic or bundle mapping",
      },
    ]);
    const adapted = adaptMtaWikiTreatmentSemanticContractV1(bundle);
    expect(adapted.dispositions[0]).toEqual({
      disposition: "bundle",
      rawValue: "bus lanes and curb treatments",
      recordIds: ["treatment-bundle"],
      bundleFamily: null,
      members: [
        {
          rawValue: "bus lanes",
          canonicalKind: "bus_lane",
          family: "bus_priority_lane",
        },
        {
          rawValue: "curb regulation updates",
          canonicalKind: "curb_regulation",
          family: "curb_management",
        },
      ],
    });
    expect(adapted.dispositions[1]).toEqual({
      disposition: "unresolved",
      rawValue: "unreviewed composite",
      recordIds: ["treatment-unresolved"],
      reviewReason: "no source-backed atomic or bundle mapping",
    });

    expect(() =>
      adaptMtaWikiTreatmentSemanticContractV1(
        semanticArtifact([
          {
            disposition: "atomic",
            raw_treatment_kind: "invented treatment",
            record_ids: ["treatment-invented"],
            canonical_kind: "other_documented",
            family: "other",
          },
        ]),
      ),
    ).toThrow("not in the reviewed v1 producer vocabulary");
    expect(() =>
      adaptMtaWikiTreatmentSemanticContractV1(
        semanticArtifact([
          {
            disposition: "bundle",
            raw_treatment_kind: "invented bundle",
            record_ids: ["treatment-invented-bundle"],
            bundle_family: null,
            members: [
              {
                raw_treatment_kind: "bus lanes",
                canonical_kind: "bus_lane",
                family: "bus_priority_lane",
              },
              {
                raw_treatment_kind: "guessed other",
                canonical_kind: "other_documented",
                family: "other",
              },
            ],
          },
        ]),
      ),
    ).toThrow("not in the reviewed v1 producer vocabulary");
  });

  test("fails exact reconciliation for missing, unknown, stale, and duplicate scopes", () => {
    const dispositions: MtaWikiTreatmentSemanticArtifactDispositionV1[] = [
      {
        disposition: "atomic",
        raw_treatment_kind: "bus lane",
        record_ids: ["record-a"],
        canonical_kind: "bus_lane",
        family: "bus_priority_lane",
      },
      {
        disposition: "atomic",
        raw_treatment_kind: "bus lane",
        record_ids: ["record-a"],
        canonical_kind: "bus_lane",
        family: "bus_priority_lane",
      },
      {
        disposition: "atomic",
        raw_treatment_kind: "queue jump",
        record_ids: ["record-c"],
        canonical_kind: "queue_jump",
        family: "signal_priority",
      },
      {
        disposition: "unresolved",
        raw_treatment_kind: "stale literal",
        record_ids: ["unknown-record"],
        review_reason: "record no longer exists",
      },
    ];
    const reconciliation = reconcileMtaWikiTreatmentSemanticsV1({
      artifact: semanticArtifact(dispositions),
      vocabularyScopes: [
        { rawValue: "bus lane", recordId: "record-a" },
        { rawValue: "bus lane", recordId: "record-a" },
        { rawValue: "queue jump corrected", recordId: "record-c" },
        { rawValue: "missing literal", recordId: "record-missing" },
      ],
    });

    expect(reconciliation.exact).toBe(false);
    expect(reconciliation.publishable).toBe(false);
    expect(reconciliation.missingLiterals).toEqual(["missing literal", "queue jump corrected"]);
    expect(reconciliation.staleLiterals).toEqual(["queue jump", "stale literal"]);
    expect(reconciliation.missingScopes).toEqual([
      { rawValue: "missing literal", recordId: "record-missing" },
      { rawValue: "queue jump corrected", recordId: "record-c" },
    ]);
    expect(reconciliation.unknownScopes).toEqual([
      {
        rawValue: "stale literal",
        recordId: "unknown-record",
        reason: "record_not_in_vocabulary",
      },
    ]);
    expect(reconciliation.staleScopes).toEqual([
      { rawValue: "queue jump", recordId: "record-c", reason: "literal_mismatch" },
    ]);
    expect(reconciliation.duplicateDispositionScopes).toEqual([
      { rawValue: "bus lane", recordId: "record-a", count: 2 },
    ]);
    expect(reconciliation.duplicateVocabularyScopes).toEqual([
      { rawValue: "bus lane", recordId: "record-a", count: 2 },
    ]);
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

  test("keeps rc25 Q27, B57, and B44+ treatment scopes exact without project fan-out", () => {
    const producerScopes = [
      {
        treatmentRecordId: "treatment_q27-holly-kissena-reroute-2025",
        sourceRouteId: "Q27",
      },
      {
        treatmentRecordId: "treatment_b57-stop-removal-2025",
        sourceRouteId: "B57",
      },
      { treatmentRecordId: "treatment_b44-plus-tsp", sourceRouteId: "B44+" },
    ];
    const routeIds = ["Q27", "Q17", "Q26", "B57", "B44", "B44+"];
    const resolved = producerScopes.map((scope) => ({
      treatmentRecordId: scope.treatmentRecordId,
      resolution: resolveExactRouteId({
        rawRouteId: scope.sourceRouteId,
        routeIds,
        sourceNamespace: "mta-wiki/v1-rc25",
        sourceVocabulary: "route_treatment_scopes.source_route_id",
      }),
    }));

    expect(resolved.map((row) => row.resolution)).toEqual([
      { resolution: "resolved", rawRouteId: "Q27", routeId: "Q27" },
      { resolution: "resolved", rawRouteId: "B57", routeId: "B57" },
      { resolution: "resolved", rawRouteId: "B44+", routeId: "B44+" },
    ]);
    expect(
      producerScopes
        .filter((scope) => scope.treatmentRecordId === "treatment_q27-holly-kissena-reroute-2025")
        .map((scope) => scope.sourceRouteId),
    ).toEqual(["Q27"]);
    expect(
      producerScopes
        .filter((scope) => scope.treatmentRecordId === "treatment_b57-stop-removal-2025")
        .map((scope) => scope.sourceRouteId),
    ).toEqual(["B57"]);
  });
});
