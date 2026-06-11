import { describe, expect, test } from "bun:test";
import { FindingCandidateSchema, FindingCoverageAuditSchema } from "@bp/domain/findings";
import {
  buildRegistryDetectorRunArtifact,
  detectorStudyFeatureContractSatisfaction,
  runRegistryDetectorStudy,
} from "../src/detector-runs";

function detectorRunCandidate(input: {
  readonly candidateId: string;
  readonly detectorId?: string;
  readonly detectorRunId?: string;
  readonly routeId: string | null;
  readonly scopeId: string;
  readonly detectorScore: number;
}) {
  const detectorId = input.detectorId ?? "observed_reliability";
  const detectorRunId = input.detectorRunId ?? `${detectorId}-2026-03-test`;
  return FindingCandidateSchema.parse({
    candidateId: input.candidateId,
    detectorRunId,
    detectorId,
    month: "2026-03",
    routeId: input.routeId,
    physicalId: null,
    scopeKind: "route",
    scopeId: input.scopeId,
    category: "reliability",
    reasonCode: "high_long_gap_share",
    severity: "medium",
    confidence: "medium",
    detectorScore: input.detectorScore,
    claimText: "Route has high observed long-gap reliability risk.",
    claimSafeLabel: "issue_needs_review",
    status: "open",
    reviewState: "unreviewed",
    windowStart: null,
    windowEnd: null,
    createdAt: "2026-06-01T00:00:00.000Z",
  });
}

describe("detector run artifacts", () => {
  test("summarizes detector outputs and feature contract satisfaction", () => {
    const artifact = buildRegistryDetectorRunArtifact({
      detectorId: "speed_pace_hotspot",
      detectorRunId: "speed_pace_hotspot-2026-03-test",
      releaseMonth: "2026-03",
      generatedAt: "2026-06-01T00:00:00.000Z",
      dbPath: null,
      artifactPath: "speed_pace_hotspot-run.json",
      wroteDb: false,
      inputSummary: { featureCount: 1 },
      featureContracts: detectorStudyFeatureContractSatisfaction({
        detectorId: "speed_pace_hotspot",
      }),
      output: {
        candidates: [
          FindingCandidateSchema.parse({
            candidateId: "c1",
            detectorRunId: "speed_pace_hotspot-2026-03-test",
            detectorId: "speed_pace_hotspot",
            month: "2026-03",
            routeId: "M15",
            physicalId: null,
            scopeKind: "segment",
            scopeId: "seg-1",
            category: "speed",
            reasonCode: "slow_segment",
            severity: "medium",
            confidence: "medium",
            detectorScore: 75,
            claimText: "Segment is slow.",
            claimSafeLabel: "issue_needs_review",
            status: "open",
            reviewState: "unreviewed",
            windowStart: null,
            windowEnd: null,
            createdAt: "2026-06-01T00:00:00.000Z",
          }),
        ],
        evidence: [],
        coverage: [
          FindingCoverageAuditSchema.parse({
            auditId: "a1",
            detectorRunId: "speed_pace_hotspot-2026-03-test",
            detectorId: "speed_pace_hotspot",
            month: "2026-03",
            scopeKind: "segment",
            scopeId: "seg-1",
            outcome: "hit",
            reasonCode: null,
            reason: null,
            inputsSeenJson: JSON.stringify({ routeId: "M15", sampleCount: 20 }),
            inputsExpectedJson: JSON.stringify({ minSampleCount: 15 }),
            createdAt: "2026-06-01T00:00:00.000Z",
          }),
        ],
      },
    });

    expect(artifact.outputSummary).toMatchObject({
      candidateCount: 1,
      hitCount: 1,
      cleanNoHitCount: 0,
    });
    expect(artifact.dataProductDependencies.length).toBeGreaterThan(0);
    expect(artifact.modelDependencies).toContainEqual(
      expect.objectContaining({
        modelId: "segment_daypart_residuals_v1",
        status: "not_checked",
      }),
    );
    expect(artifact.featureContracts.map((contract) => contract.status)).toContain("resolved");
    expect(artifact.candidateSamples[0]?.candidateId).toBe("c1");
    expect(artifact.candidateSamples[0]?.detectorScore).toBe(75);
  });

  test("honors an explicit candidate sample limit for calibration reruns", () => {
    const candidates = Array.from({ length: 3 }, (_, index) =>
      FindingCandidateSchema.parse({
        candidateId: `c${index + 1}`,
        detectorRunId: "speed_pace_hotspot-2026-03-test",
        detectorId: "speed_pace_hotspot",
        month: "2026-03",
        routeId: "M15",
        physicalId: null,
        scopeKind: "segment",
        scopeId: `seg-${index + 1}`,
        category: "speed",
        reasonCode: "slow_segment",
        severity: "medium",
        confidence: "medium",
        detectorScore: 75 - index,
        claimText: "Segment is slow.",
        claimSafeLabel: "issue_needs_review",
        status: "open",
        reviewState: "unreviewed",
        windowStart: null,
        windowEnd: null,
        createdAt: "2026-06-01T00:00:00.000Z",
      }),
    );

    const artifact = buildRegistryDetectorRunArtifact({
      detectorId: "speed_pace_hotspot",
      detectorRunId: "speed_pace_hotspot-2026-03-test",
      releaseMonth: "2026-03",
      generatedAt: "2026-06-01T00:00:00.000Z",
      dbPath: null,
      artifactPath: "speed_pace_hotspot-run.json",
      wroteDb: false,
      inputSummary: { featureCount: candidates.length },
      output: { candidates, evidence: [], coverage: [] },
      featureContracts: detectorStudyFeatureContractSatisfaction({
        detectorId: "speed_pace_hotspot",
      }),
      candidateSampleLimit: 2,
    });

    expect(artifact.outputSummary.candidateCount).toBe(3);
    expect(artifact.candidateSamples.map((candidate) => candidate.candidateId)).toEqual([
      "c1",
      "c2",
    ]);
  });

  test("records global high-limit cap accounting by borough and route", () => {
    const candidates = [
      detectorRunCandidate({
        candidateId: "c-m15",
        routeId: "M15",
        scopeId: "M15",
        detectorScore: 95,
      }),
      detectorRunCandidate({
        candidateId: "c-b41",
        routeId: "B41",
        scopeId: "B41",
        detectorScore: 90,
      }),
      detectorRunCandidate({
        candidateId: "c-s53",
        routeId: "S53",
        scopeId: "S53",
        detectorScore: 80,
      }),
      detectorRunCandidate({
        candidateId: "c-m14",
        routeId: "M14",
        scopeId: "M14",
        detectorScore: 70,
      }),
    ];

    const artifact = buildRegistryDetectorRunArtifact({
      detectorId: "observed_reliability",
      detectorRunId: "observed_reliability-2026-03-test",
      releaseMonth: "2026-03",
      generatedAt: "2026-06-01T00:00:00.000Z",
      dbPath: null,
      artifactPath: "observed_reliability-run.json",
      wroteDb: false,
      inputSummary: { routeCount: candidates.length },
      output: { candidates, evidence: [], coverage: [] },
      featureContracts: detectorStudyFeatureContractSatisfaction({
        detectorId: "observed_reliability",
      }),
      capPolicy: {
        mode: "global_candidate_limit",
        productionCandidateLimit: 2,
        runCandidateLimit: 4,
        reason: "High-limit no-write inventory run: run cap 4 exceeds production cap 2.",
      },
    });

    expect(artifact.capAccounting).toMatchObject({
      mode: "global_candidate_limit",
      status: "high_limit_inventory",
      productionCandidateLimit: 2,
      runCandidateLimit: 4,
      qualifyingCandidateCount: 4,
      emittedWithinProductionCapCount: 2,
      cappedOutCount: 2,
      cappedOutByBoroughPrefix: { M: 1, S: 1 },
      cappedOutByRouteId: { M14: 1, S53: 1 },
    });
    expect(
      artifact.capAccounting.routeBreakdown.find((route) => route.routeId === "M14"),
    ).toMatchObject({
      boroughPrefix: "M",
      qualifyingCandidateCount: 1,
      emittedWithinProductionCapCount: 0,
      cappedOutCount: 1,
    });
  });

  test("records per-route cap accounting for route-scoped caps", () => {
    const candidates = [
      detectorRunCandidate({
        candidateId: "c-b1-a",
        detectorId: "persistent_speed_hotspot",
        detectorRunId: "persistent_speed_hotspot-2026-03-test",
        routeId: "B1",
        scopeId: "B1:seg-a",
        detectorScore: 95,
      }),
      detectorRunCandidate({
        candidateId: "c-b1-b",
        detectorId: "persistent_speed_hotspot",
        detectorRunId: "persistent_speed_hotspot-2026-03-test",
        routeId: "B1",
        scopeId: "B1:seg-b",
        detectorScore: 90,
      }),
      detectorRunCandidate({
        candidateId: "c-q5-a",
        detectorId: "persistent_speed_hotspot",
        detectorRunId: "persistent_speed_hotspot-2026-03-test",
        routeId: "Q5",
        scopeId: "Q5:seg-a",
        detectorScore: 94,
      }),
      detectorRunCandidate({
        candidateId: "c-q5-b",
        detectorId: "persistent_speed_hotspot",
        detectorRunId: "persistent_speed_hotspot-2026-03-test",
        routeId: "Q5",
        scopeId: "Q5:seg-b",
        detectorScore: 82,
      }),
      detectorRunCandidate({
        candidateId: "c-q5-c",
        detectorId: "persistent_speed_hotspot",
        detectorRunId: "persistent_speed_hotspot-2026-03-test",
        routeId: "Q5",
        scopeId: "Q5:seg-c",
        detectorScore: 70,
      }),
    ];

    const artifact = buildRegistryDetectorRunArtifact({
      detectorId: "persistent_speed_hotspot",
      detectorRunId: "persistent_speed_hotspot-2026-03-test",
      releaseMonth: "2026-03",
      generatedAt: "2026-06-01T00:00:00.000Z",
      dbPath: null,
      artifactPath: "persistent_speed_hotspot-run.json",
      wroteDb: false,
      inputSummary: { routeCount: 2 },
      output: { candidates, evidence: [], coverage: [] },
      featureContracts: detectorStudyFeatureContractSatisfaction({
        detectorId: "persistent_speed_hotspot",
      }),
      capPolicy: {
        mode: "per_route_candidate_limit",
        productionCandidateLimit: 1,
        runCandidateLimit: 3,
        reason: "High-limit no-write inventory run: run cap 3 exceeds production cap 1.",
      },
    });

    expect(artifact.capAccounting).toMatchObject({
      mode: "per_route_candidate_limit",
      status: "high_limit_inventory",
      qualifyingCandidateCount: 5,
      emittedWithinProductionCapCount: 2,
      cappedOutCount: 3,
      cappedOutByBoroughPrefix: { B: 1, Q: 2 },
      cappedOutByRouteId: { B1: 1, Q5: 2 },
    });
  });

  test("registry run artifacts expose observed-reliability 100-vs-220 cap distribution", () => {
    const routes = Array.from({ length: 220 }, (_, index) => ({
      routeId: `B${String(index + 1).padStart(3, "0")}`,
      reliabilityStatus: "observed" as const,
      sampleCount: 1000,
      minSampleThreshold: 100,
      observedLongGapShare: 0.8,
      waitReliabilityRatio: 10,
      excessWaitMinutes: 20,
      scheduledBaselineHeadwaySampleCount: 20,
      busWaitAssessmentTripCount: 20,
      busWaitAssessment: 0.5,
    }));

    const { artifact, output } = runRegistryDetectorStudy({
      metadata: {
        detectorId: "observed_reliability",
        detectorRunId: "observed_reliability-2026-03-high-limit",
        releaseMonth: "2026-03",
        historyStartMonth: "2023-04",
        generatedAt: "2026-06-07T00:00:00.000Z",
        dbPath: null,
        artifactPath: "observed_reliability-run.json",
        wroteDb: false,
        candidateLimit: 220,
      },
      rows: {
        observedReliabilityRoutes: routes,
      },
    });

    expect(output.candidates).toHaveLength(220);
    expect(artifact.capAccounting).toMatchObject({
      mode: "global_candidate_limit",
      status: "high_limit_inventory",
      productionCandidateLimit: 100,
      runCandidateLimit: 220,
      qualifyingCandidateCount: 220,
      emittedWithinProductionCapCount: 100,
      cappedOutCount: 120,
      cappedOutByBoroughPrefix: { B: 120 },
    });
    expect(Object.values(artifact.capAccounting.cappedOutByRouteId)).toHaveLength(120);
    expect(
      Object.values(artifact.capAccounting.cappedOutByRouteId).every((count) => count === 1),
    ).toBe(true);
  });

  test("runs rider-weighted EWT from reliability exposure panel rows", () => {
    const { artifact, output } = runRegistryDetectorStudy({
      metadata: {
        detectorId: "rider_weighted_excess_wait",
        detectorRunId: "rider_weighted_excess_wait-2026-03-test",
        releaseMonth: "2026-03",
        historyStartMonth: "2023-04",
        generatedAt: "2026-06-07T00:00:00.000Z",
        dbPath: null,
        artifactPath: "rider_weighted_excess_wait-run.json",
        wroteDb: false,
      },
      rows: {
        reliabilityExposurePanelRows: [
          {
            routeId: "M15",
            stopId: "s1",
            stopName: "Stop 1",
            direction: "N",
            serviceDate: "2026-03:Weekday",
            localHour: 8,
            timezone: "America/New_York",
            panelKey: "M15:N:s1:2026-03:Weekday:08",
            excessWaitTimeMinutes: 5,
            boardings: 50,
            riderDelayMinutes: 250,
            boardingsSource: "route_hourly_ridership_stop_hour_proxy",
            ridershipSnapshotId: "local_route_hourly_ridership:2026-03:Weekday",
            ewtDetectorVersion: "headway_reliability_ewt@1.0.0",
            ewtCoverageStatus: "complete",
            ewtSampleStatus: "supported",
            ewtObservedPairCount: 12,
            ridershipCoverageStatus: "partial",
            ridershipSampleStatus: "supported",
            riderExposureSupported: true,
            reliabilitySupported: true,
          },
        ],
      },
    });

    expect(output.candidates).toHaveLength(1);
    expect(artifact.inputSummary).toMatchObject({
      sourceKind: "rider_weighted_excess_wait_from_reliability_exposure_panel_v1",
      panelRowCount: 1,
      featureCount: 1,
      featureWithRiderDelayCount: 1,
    });
  });

  test("runs source-gap detector from source-gap model rows", () => {
    const { artifact, output } = runRegistryDetectorStudy({
      metadata: {
        detectorId: "source_gap",
        detectorRunId: "source_gap-2026-03-test",
        releaseMonth: "2026-03",
        historyStartMonth: "2023-04",
        generatedAt: "2026-06-07T00:00:00.000Z",
        dbPath: null,
        artifactPath: "source_gap-run.json",
        wroteDb: false,
      },
      rows: {
        sourceGapModelRows: [
          {
            routeId: "M15",
            month: "2026-03",
            treatmentType: "transit_signal_priority",
            gapKind: "current_inventory_missing",
            sourceGapCount: 1,
            blocksClaims: ["coverage"],
            sourceRefs: ["source_gap:tsp_current_route_intersection_inventory"],
            publicStatements: ["Current TSP inventory missing from public sources."],
          },
        ],
      },
    });

    expect(output.candidates).toHaveLength(1);
    expect(`${output.candidates[0]?.reasonCode}`).toBe("tsp_current_inventory_missing");
    expect(artifact.inputSummary).toMatchObject({
      sourceKind: "source_gap_from_source_gap_model_v1",
      featureCount: 1,
      sourceGapModelRowCount: 1,
      sourceGapModelSourceGapCount: 1,
    });
    expect(artifact.modelDependencies).toContainEqual(
      expect.objectContaining({
        modelId: "source_gap_model_v1",
        status: "available",
        rowCount: 1,
      }),
    );
  });

  test("does not rebuild source-gap model rows when the model artifact dependency is missing", () => {
    const { artifact, output } = runRegistryDetectorStudy({
      metadata: {
        detectorId: "source_gap",
        detectorRunId: "source_gap-2026-03-test",
        releaseMonth: "2026-03",
        historyStartMonth: "2023-04",
        generatedAt: "2026-06-07T00:00:00.000Z",
        dbPath: null,
        artifactPath: "source_gap-run.json",
        wroteDb: false,
      },
      rows: {
        routeTreatmentSourceGapFeatures: [
          {
            routeId: "M15",
            month: "2026-03",
            treatmentType: "transit_signal_priority",
            gapKind: "current_inventory_missing",
            sourceRefs: ["tsp:source-gap"],
            publicStatement: "Current route-level TSP inventory is not published.",
            blocksClaims: ["tsp_absence"],
          },
        ],
      },
    });

    expect(output.candidates).toHaveLength(0);
    expect(output.coverage[0]).toMatchObject({
      outcome: "skipped_missing_input",
      reasonCode: "missing_model_artifact",
      scopeKind: "system",
      scopeId: "model_dependencies",
    });
    expect(artifact.inputSummary).toMatchObject({
      sourceKind: "blocked_missing_model_artifacts",
      featureCount: 0,
      missingModelArtifacts: ["source_gap_model_v1"],
    });
    expect(artifact.modelDependencies).toContainEqual(
      expect.objectContaining({
        modelId: "source_gap_model_v1",
        status: "missing",
      }),
    );
  });

  test("runs intervention-gap detector from source-gap model rows", () => {
    const { artifact, output } = runRegistryDetectorStudy({
      metadata: {
        detectorId: "intervention_gap",
        detectorRunId: "intervention_gap-2026-03-test",
        releaseMonth: "2026-03",
        historyStartMonth: "2023-04",
        generatedAt: "2026-06-07T00:00:00.000Z",
        dbPath: null,
        artifactPath: "intervention_gap-run.json",
        wroteDb: false,
      },
      rows: {
        routePainRows: [
          {
            route_id: "M57",
            month: "2026-03",
            route_score: 2,
            public_visible: 1,
            public_visibility_reason: "public",
            average_speed_mph: 5.1,
            hotspot_count: 10,
            reliability_status: "observed",
            min_sample_threshold: 30,
            sample_count: 200,
            observed_long_gap_share: 0.7,
            excess_wait_minutes: 40,
            wait_reliability_ratio: 12,
          },
        ],
        routeTreatmentFeatures: [],
        sourceGapModelRows: [
          {
            routeId: "M57",
            month: "2026-03",
            treatmentType: "transit_signal_priority",
            gapKind: "current_inventory_missing",
            sourceGapCount: 1,
            blocksClaims: ["tsp_absence"],
            sourceRefs: ["source_gap:tsp_current_route_intersection_inventory"],
            publicStatements: ["Current TSP route/intersection inventory is not published."],
          },
        ],
      },
    });

    expect(output.candidates).toHaveLength(1);
    expect(`${output.candidates[0]?.reasonCode}`).toBe("intervention_gap");
    expect(artifact.inputSummary).toMatchObject({
      sourceKind: "intervention_gap_from_source_gap_model_v1",
      featureCount: 1,
      sourceGapModelRowCount: 1,
      sourceGapModelSourceGapCount: 1,
      thinSourceGapRouteCount: 1,
    });
  });

  test("runs intervention event study from treatment event panel rows", () => {
    const { artifact, output } = runRegistryDetectorStudy({
      metadata: {
        detectorId: "intervention_event_study",
        detectorRunId: "intervention_event_study-2026-03-test",
        releaseMonth: "2026-03",
        historyStartMonth: "2023-04",
        generatedAt: "2026-06-07T00:00:00.000Z",
        dbPath: null,
        artifactPath: "intervention_event_study-run.json",
        wroteDb: false,
      },
      rows: {
        treatmentEventPanelRows: [
          {
            eventId: "event-1",
            interventionType: "bus_lane",
            treatedScopeKind: "route",
            treatedScopeId: "M15",
            interventionDate: "2025-01-15",
            preWindowStart: "2024-01",
            preWindowEnd: "2024-12",
            postWindowStart: "2025-02",
            postWindowEnd: "2026-03",
            controlScopeIds: ["M1", "M2", "M3"],
            controlEligibilityStatus: "eligible",
            preTrendStatus: "not_tested",
            placeboStatus: "not_tested",
            placeboInTimeStatus: "not_tested",
            placeboInSpaceStatus: "not_tested",
            autocorrelationStatus: "not_tested",
            methodDivergenceStatus: "not_tested",
            eventStudyEstimate: 1.5,
            eventStudyConfidenceIntervalLow: null,
            eventStudyConfidenceIntervalHigh: null,
            segmentedRegressionLevelChange: null,
            segmentedRegressionSlopeChange: null,
            matchedPeerDelta: 1.5,
            syntheticControlGap: null,
            quality: {
              coverageStatus: "complete",
              observedCount: 1,
              expectedCount: 1,
              coverageShare: 1,
              freshnessStatus: "not_expected",
              sampleCount: 1,
              minSampleCount: 1,
              sampleStatus: "supported",
            },
          },
        ],
      },
    });

    expect(output.candidates).toHaveLength(1);
    expect(artifact.inputSummary).toMatchObject({
      sourceKind: "intervention_panel_from_treatment_event_panel_v1",
      featureCount: 1,
      treatmentEventPanelSummary: { panelRowCount: 1 },
    });
  });

  test("counts deferred_not_in_scope coverage distinctly from clean_no_hit (S2.5)", () => {
    const coverageRow = (scopeId: string, outcome: string) =>
      FindingCoverageAuditSchema.parse({
        auditId: `audit-${scopeId}`,
        detectorRunId: "speed_pace_hotspot-2026-03-test",
        detectorId: "speed_pace_hotspot",
        month: "2026-03",
        scopeKind: "segment",
        scopeId,
        outcome,
        reasonCode: null,
        reason: null,
        inputsSeenJson: JSON.stringify({ routeId: "M15" }),
        inputsExpectedJson: JSON.stringify({}),
        createdAt: "2026-06-01T00:00:00.000Z",
      });

    const artifact = buildRegistryDetectorRunArtifact({
      detectorId: "speed_pace_hotspot",
      detectorRunId: "speed_pace_hotspot-2026-03-test",
      releaseMonth: "2026-03",
      generatedAt: "2026-06-01T00:00:00.000Z",
      dbPath: null,
      artifactPath: "speed_pace_hotspot-run.json",
      wroteDb: false,
      inputSummary: { featureCount: 3 },
      featureContracts: detectorStudyFeatureContractSatisfaction({
        detectorId: "speed_pace_hotspot",
      }),
      output: {
        candidates: [],
        evidence: [],
        coverage: [
          coverageRow("seg-clean", "clean_no_hit"),
          coverageRow("seg-deferred", "deferred_not_in_scope"),
          coverageRow("seg-skipped", "skipped_missing_input"),
        ],
      },
    });

    // The deferred state is its own bucket — it does not blend into clean_no_hit or skipped.
    expect(artifact.outputSummary).toMatchObject({
      coverageCount: 3,
      cleanNoHitCount: 1,
      deferredNotInScopeCount: 1,
      skippedCount: 1,
    });
  });
});
