import { describe, expect, test } from "bun:test";
import type { RouteSpeedSpineArtifact } from "@bp/analytics/feature-history";
import type { OperationalOccurrenceMemberExtentRowV1 } from "@bp/domain/documents/operational-occurrence";
import {
  type Plan042BusLaneIdentityVerdictRow,
  Plan042BusLaneIdentityVerdictRowSchema,
  type Plan042MemberGrainRow,
  Plan042OutcomeRelevanceRegistrySchema,
} from "@bp/domain/studio/member-grain-outcomes";
import {
  classifyExtentBinding,
  searchExtentBoundaries,
  searchLineageBoundary,
  validateIdentityVerdictRows,
  validateMemberGrainRows,
} from "../../src/lib/plan042-member-grain.ts";
import { decodeSchemaStrict } from "../../src/lib/schema-decode.ts";

function identityVerdict(
  verdict: Plan042BusLaneIdentityVerdictRow["verdict"],
): Plan042BusLaneIdentityVerdictRow {
  return {
    schema_version: 1,
    contract_id: "bus-lane-identity-verdict-v1",
    verdict_id: `identity-verdict:${verdict}`,
    candidate_id: `candidate:${verdict}`,
    gtfs_route_id: "Q1",
    implementation_date: "2025-06-30",
    date_precision: "day",
    verdict,
    occurrence_id: verdict === "occurrence_created" ? "occurrence:created" : null,
    dossier_receipts: ["dossier:1"],
    decision_id: "decision:1",
    acquisition_receipt_ids: ["acquisition:1"],
    canonical_candidate_id: verdict === "superseded_duplicate" ? "candidate:canonical" : null,
    authorizes_study: false,
    authorizes_cross_product: false,
  };
}

function extent(identifiers: readonly string[]): OperationalOccurrenceMemberExtentRowV1 {
  return {
    schema_version: 1,
    contract_id: "operational-occurrence-member-extent-v1",
    extent_id: "member-extent:test",
    occurrence_id: "occurrence:test",
    occurrence_review_decision_id: "occurrence-review:test",
    route_record_id: "route:test",
    gtfs_route_id: "Q1",
    treatment_record_id: "treatment:test",
    treatment_family: "bus_lane",
    extent: "bounded_segment",
    components: [
      {
        component_kind: "segment",
        identity_namespace: "source_literal_v1",
        identifiers: [...identifiers],
        description: "Exact typed fixture endpoints.",
      },
    ],
    evidence_bindings: [],
    missing_roles: [],
    decision_id: "member-extent-review:test",
    rationale: "Fixture.",
    authorizes_study: false,
    authorizes_cross_product: false,
  };
}

function spine(ambiguous = false): RouteSpeedSpineArtifact {
  const nodeRows: [string, string[]][] = [
    ["node-a", ["100"]],
    ["node-b", ["200"]],
    ["node-c", ["300"]],
    ...(ambiguous ? [["node-d", ["250"]] as [string, string[]]] : []),
  ];
  const nodes = nodeRows.map(([nodeId, sourceStopIds], index) => ({
    nodeId,
    stableKey: nodeId,
    label: nodeId,
    latitude: 40 + index / 100,
    longitude: -73 - index / 100,
    observationCount: 1,
    months: ["2026-05"],
    sourceStopIds: [...sourceStopIds],
    sourceStopNames: [nodeId],
    maxSourceSeparationMeters: 0,
  }));
  const segment = (
    segmentId: string,
    displayOrder: number,
    fromNodeId: string,
    toNodeId: string,
    fromStopId: string,
    toStopId: string,
  ) => ({
    segmentId,
    direction: "N",
    displayOrder,
    fromNodeId,
    toNodeId,
    label: segmentId,
    months: ["2026-05"],
    monthCount: 1,
    sourceRowCount: 1,
    busTripCount: 1,
    averageRoadDistanceMiles: 1,
    averageSpeedMph: 10,
    stopOrder: {
      min: displayOrder,
      median: displayOrder,
      max: displayOrder,
      values: [displayOrder],
      changed: false,
    },
    raw: {
      rawSegmentKeyCount: 1,
      rawStopPairCount: 2,
      // The duplicate proves repeated raw evidence does not create a second path.
      sourceStopPairs: [0, 1].map(() => ({
        fromStopId,
        fromStopName: fromStopId,
        toStopId,
        toStopName: toStopId,
        stopOrders: [displayOrder],
        months: ["2026-05"],
        sourceRowCount: 1,
      })),
    },
  });
  return {
    artifactKind: "studio_route_speed_spine",
    schemaVersion: 1,
    generatedAt: "2026-06-01T00:00:00Z",
    routeId: "Q1",
    routeSlug: "q1",
    source: {
      table: "local_route_segment_speed",
      dbPath: "fixture.sqlite",
      startMonth: "2026-05",
      endMonth: "2026-05",
      toleranceMeters: 110,
      artifactPath: "fixture/speed-spine.json",
    },
    summary: {
      monthCount: 1,
      sourceRowCount: 2,
      busTripCount: 2,
      nodeCount: nodes.length,
      spineSegmentCount: ambiguous ? 4 : 2,
      rawSegmentKeyCount: 2,
      rawStopPairCount: 4,
      monthsWithRawKeyDriftCount: 0,
      monthsWithPartialSpineCoverageCount: 0,
      mergedNodeCount: 0,
      segmentWithRawVariantCount: 0,
      issueCount: 0,
    },
    nodes,
    segments: [
      segment("segment-a-b", 0, "node-a", "node-b", "100", "200"),
      segment("segment-b-c", 1, "node-b", "node-c", "200", "300"),
      ...(ambiguous
        ? [
            segment("segment-a-d", 2, "node-a", "node-d", "100", "250"),
            segment("segment-d-c", 3, "node-d", "node-c", "250", "300"),
          ]
        : []),
    ],
    monthCoverage: [],
    validation: { status: "pass", issues: [] },
  };
}

describe("Plan 042 strict producer contracts", () => {
  test("accepts all six typed identity verdict classes and enforces their semantics", () => {
    const verdicts = [
      "binding_absent_after_search",
      "confirmed_out_of_window",
      "occurrence_created",
      "refuted_no_traversal",
      "refuted_wrong_route_attribution",
      "superseded_duplicate",
    ] as const;
    for (const verdict of verdicts) {
      expect(() => validateIdentityVerdictRows([identityVerdict(verdict)])).not.toThrow();
    }
    expect(() =>
      validateIdentityVerdictRows([
        { ...identityVerdict("occurrence_created"), occurrence_id: null },
      ]),
    ).toThrow("invalid occurrence_created");
    expect(() =>
      validateIdentityVerdictRows([
        {
          ...identityVerdict("binding_absent_after_search"),
          occurrence_id: "occurrence:inferred",
        },
      ]),
    ).toThrow("terminal negative verdict carries positive identity");
  });

  test("rejects excess producer fields", () => {
    expect(() =>
      decodeSchemaStrict(Plan042BusLaneIdentityVerdictRowSchema, {
        ...identityVerdict("binding_absent_after_search"),
        undeclared: true,
      }),
    ).toThrow();
  });

  test("preserves ordered lineage boundary pairs while shared stops remain sorted", () => {
    const memberExtent = extent(["100", "900"]);
    const grain: Plan042MemberGrainRow = {
      schema_version: 1,
      contract_id: "operational-occurrence-member-grain-v1",
      grain_id: "member-grain:test",
      extent_id: memberExtent.extent_id,
      occurrence_id: memberExtent.occurrence_id,
      route_record_id: memberExtent.route_record_id,
      gtfs_route_id: memberExtent.gtfs_route_id,
      treatment_record_id: memberExtent.treatment_record_id,
      member_extent_decision_id: memberExtent.decision_id,
      service_scope: { kind: "all_service" },
      lineage_segments: [
        {
          predecessor_gtfs_route_id: "Q0",
          successor_gtfs_route_id: "Q1",
          direction: "0",
          boundary_stop_ids: ["900", "100"],
          shared_stop_ids: ["100", "900"],
        },
      ],
      evidence_bindings: [],
      decision_id: "member-grain-review:test",
      terminal_disposition: "resolved",
      receipt_ids: ["receipt:test"],
      authorizes_study: false,
      authorizes_cross_product: false,
    };
    expect(() => validateMemberGrainRows([grain], [memberExtent])).not.toThrow();
    const firstLineageSegment = grain.lineage_segments[0];
    if (firstLineageSegment === undefined) throw new Error("Missing lineage fixture");
    expect(() =>
      validateMemberGrainRows(
        [
          {
            ...grain,
            lineage_segments: [{ ...firstLineageSegment, boundary_stop_ids: ["100", "100"] }],
          },
        ],
        [memberExtent],
      ),
    ).toThrow("ordered lineage boundary stops must be distinct");
  });
});

describe("Plan 042 exact ordered spine searches", () => {
  test("does not infer ordered endpoints from sorted source literals", () => {
    const result = searchExtentBoundaries(extent(["100", "300"]), spine());
    expect(result.candidateBoundaryPairs).toEqual([]);
    expect(result.orderedMatches).toEqual([]);
    expect(
      classifyExtentBinding({
        spineReadiness: "series_ready",
        search: result,
      }),
    ).toBe("missing_endpoint_stop_id_equivalence");
  });

  test("binds a unique multi-segment path and normalizes duplicate junction evidence", () => {
    const result = searchExtentBoundaries(extent(["100", "300"]), spine(), [["100", "300"]]);
    expect(result.orderedMatches).toHaveLength(1);
    expect(result.orderedMatches[0]?.segmentIds).toEqual(["segment-a-b", "segment-b-c"]);
    expect(result.allCandidatePairsResolveUniquely).toBe(true);
    expect(result.ambiguousCandidatePairCount).toBe(0);
    expect(result.coverageShare).toBe(1);
  });

  test("preserves orientation and detects a genuinely ambiguous branch", () => {
    expect(
      searchExtentBoundaries(extent(["300", "100"]), spine(), [["300", "100"]]).orderedMatches,
    ).toHaveLength(0);
    const ambiguous = searchExtentBoundaries(extent(["100", "300"]), spine(true), [["100", "300"]]);
    expect(ambiguous.orderedMatches).toHaveLength(2);
    expect(ambiguous.ambiguousCandidatePairCount).toBe(1);
  });

  test("uses the same node-normalized ordered search for old/new lineage", () => {
    const result = searchLineageBoundary({
      spine: {
        routeId: "Q1",
        readiness: "series_ready",
        path: "studio/v2/routes/q1/speed-spine.json",
        bytes: 1,
        sha256: "a".repeat(64),
        artifact: spine(),
      },
      side: "successor",
      boundaryStopIds: ["100", "300"],
    });
    expect(result.result).toBe("ordered_unique");
    expect(result.matched_segment_ids).toEqual(["segment-a-b", "segment-b-c"]);
    expect(result.ordered_orientation_match_count).toBe(1);
  });

  test("classifies every declared bounded-extent disposition fail-closed", () => {
    const exact = searchExtentBoundaries(extent(["100", "300"]), spine(), [["100", "300"]]);
    expect(
      classifyExtentBinding({
        spineReadiness: "series_ready",
        search: exact,
      }),
    ).toBe("bound_exact");
    expect(
      classifyExtentBinding({
        spineReadiness: "needs_pattern_review",
        search: exact,
      }),
    ).toBe("spine_not_ready");
    expect(
      classifyExtentBinding({
        spineReadiness: "series_ready",
        search: { ...exact, matchedNodeCount: 1 },
      }),
    ).toBe("endpoints_not_on_spine");
    expect(
      classifyExtentBinding({
        spineReadiness: "series_ready",
        search: searchExtentBoundaries(extent(["100", "300"]), spine(true), [["100", "300"]]),
      }),
    ).toBe("ambiguous_join");
    expect(
      classifyExtentBinding({
        spineReadiness: "series_ready",
        search: { ...exact, coverageShare: 0.5 },
      }),
    ).toBe("partial_coverage_below_floor");
    expect(
      classifyExtentBinding({
        spineReadiness: "series_ready",
        search: { ...exact, allCandidatePairsResolveUniquely: false },
      }),
    ).toBe("missing_endpoint_stop_id_equivalence");
  });

  test("classifies each lineage search result without guessing direction or endpoints", () => {
    const pinned = (readiness: "series_ready" | "needs_pattern_review", artifact = spine()) =>
      ({
        routeId: "Q1",
        readiness,
        path: "studio/v2/routes/q1/speed-spine.json",
        bytes: 1,
        sha256: "a".repeat(64),
        artifact,
      }) as const;
    expect(
      searchLineageBoundary({
        spine: pinned("needs_pattern_review"),
        side: "predecessor",
        boundaryStopIds: ["100", "300"],
      }).result,
    ).toBe("spine_not_ready");
    expect(
      searchLineageBoundary({
        spine: pinned("series_ready"),
        side: "predecessor",
        boundaryStopIds: ["100", "999"],
      }).result,
    ).toBe("endpoint_missing");
    expect(
      searchLineageBoundary({
        spine: pinned("series_ready"),
        side: "predecessor",
        boundaryStopIds: ["300", "100"],
      }).result,
    ).toBe("orientation_absent");
    expect(
      searchLineageBoundary({
        spine: pinned("series_ready", spine(true)),
        side: "predecessor",
        boundaryStopIds: ["100", "300"],
      }).result,
    ).toBe("orientation_ambiguous");
  });
});

describe("Plan 042 outcome relevance registry contract", () => {
  test("rejects invented product ids, resolver typos, and excess fields", () => {
    const base = {
      treatment_family: "automated_bus_lane_enforcement",
      member_shapes: ["route_wide"],
      disposition: "supported",
      product_ids: ["local_route_month_trends_history"],
      product_bindings: [
        {
          product_id: "local_route_month_trends_history",
          feature_grain: "route_metric_history",
          resolver_id: "sqlite.local_route_month_trend.history.v1",
        },
      ],
      source_dataset_ids: [],
      grain: "route_month",
      resolver: "exact_route_registry_or_reviewed_route_wide_member",
      claim_ceiling: "descriptive_observation",
      unlock_evidence: [],
    };
    const registry = (entry: unknown) => ({
      artifact_kind: "bp.plan042.outcome-relevance-registry.v1",
      schema_version: 1,
      upstream_registry_validation: {
        registry_id: "intervention-evidence-registry-v1",
        canonical_treatment_kind_count: 18,
        validation: "passed",
      },
      stop_set_authorization: {
        authorization_id: "mta-wiki-owner-2026-07-22-all-closure-plans",
        scope: "internal_analyst_stop_set_admission",
        recorded_decision:
          "versioned_analyst_grain_allowed_only_with_candidate_coverage_and_reviewed_stop_id_lineage",
        current_result: "blocked_missing_pinned_stop_grain_coverage",
      },
      entries: [entry],
      authority: { authorizes_study: false, authorizes_public_serving: false },
    });
    expect(() =>
      decodeSchemaStrict(Plan042OutcomeRelevanceRegistrySchema, registry(base)),
    ).not.toThrow();
    expect(() =>
      decodeSchemaStrict(
        Plan042OutcomeRelevanceRegistrySchema,
        registry({ ...base, product_ids: ["route-month-speed-v1"] }),
      ),
    ).toThrow();
    expect(() =>
      decodeSchemaStrict(
        Plan042OutcomeRelevanceRegistrySchema,
        registry({
          ...base,
          product_bindings: [
            {
              ...base.product_bindings[0],
              resolver_id: "sqlite.local_route_month_trend.history.typo",
            },
          ],
        }),
      ),
    ).toThrow();
    expect(() =>
      decodeSchemaStrict(Plan042OutcomeRelevanceRegistrySchema, {
        ...registry(base),
        excess: true,
      }),
    ).toThrow();
  });
});
