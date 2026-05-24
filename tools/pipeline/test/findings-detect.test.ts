import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { auditFindingsBacktest } from "../src/jobs/audit/findings-backtest.js";
import { buildFindings } from "../src/jobs/build/findings.js";
import { buildPromotedFindings } from "../src/jobs/build/promoted-findings.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const dbPath = fromRepoRoot(join("data/working/test-findings-detect/pipeline.sqlite"));
const artifactRoot = fromRepoRoot(join("data/working/test-findings-detect/artifacts"));

type SqlValue = string | number | null;

async function resetDb(): Promise<void> {
  await rm(dirname(dbPath), { recursive: true, force: true });
}

function insertRow(sqlite: Database, table: string, row: Record<string, SqlValue>) {
  const columns = Object.keys(row);
  sqlite
    .query(
      `INSERT INTO ${table} (${columns.join(", ")})
       VALUES (${columns.map(() => "?").join(", ")})`,
    )
    .run(...columns.map((column) => row[column] ?? null));
}

function seedRoute(
  sqlite: Database,
  routeId: string,
  over: {
    shapeCount?: number;
    stopCount?: number;
  } = {},
) {
  insertRow(sqlite, "local_route_catalog", {
    route_id: routeId,
    route_short_name: routeId,
    route_long_name: null,
    shape_count: over.shapeCount ?? 2,
    stop_count: over.stopCount ?? 20,
    timepoint_stop_count: 5,
    latitude_min: null,
    latitude_max: null,
    longitude_min: null,
    longitude_max: null,
  });
}

function seedScheduledBaseline(
  sqlite: Database,
  routeId: string,
  month: string,
  headwaySampleCount = 500,
) {
  insertRow(sqlite, "local_route_reliability_baseline", {
    route_id: routeId,
    month,
    reliability_status: "scheduled",
    scheduled_timepoint_count: 20,
    stop_headway_group_count: 10,
    headway_sample_count: headwaySampleCount,
    median_scheduled_headway_minutes: 10,
    p90_scheduled_headway_minutes: 15,
    max_scheduled_headway_minutes: 20,
    scheduled_short_headway_share: 0.1,
    scheduled_long_gap_share: 0.05,
  });
}

function seedRouteTrend(sqlite: Database, routeId: string, month: string, averageSpeedMph: number) {
  insertRow(sqlite, "local_route_month_trend", {
    route_id: routeId,
    month,
    speed_observation_count: 500,
    speed_bus_trip_count: 200,
    average_speed_mph: averageSpeedMph,
    ridership: null,
    transfers: null,
    has_speed_trend: 1,
    has_ridership_trend: 0,
  });
}

afterEach(async () => {
  await resetDb();
});

describe("findings:detect orchestrator", () => {
  test("emits clean_no_hit for fully covered route and missing-data candidates for an uncovered route", async () => {
    await resetDb();
    const local = await openLocalPipelineDb(dbPath);
    const month = "2026-03";
    try {
      seedRoute(local.sqlite, "M1");
      seedRoute(local.sqlite, "B46");

      // M1: fully covered.
      insertRow(local.sqlite, "local_route_month_coverage", {
        route_id: "M1",
        month,
        speed_observation_count: 500,
        speed_bus_trip_count: 200,
        average_speed_mph: 7.8,
        schedule_timepoint_count: 25,
        has_speed_data: 1,
        has_schedule_data: 1,
      });
      insertRow(local.sqlite, "local_route_lion_link", {
        route_id: "M1",
        physical_id: "p1",
        overlap_meters: 100,
        buffer_meters: 25,
        match_kind: "buffered_intersection",
        street_name: "1 Ave",
        borough: "Manhattan",
        computed_at: "2026-05-01T00:00:00.000Z",
      });
      insertRow(local.sqlite, "local_route_observed_reliability_summary", {
        route_id: "M1",
        month,
        run_id: "test-run",
        reliability_status: "observed",
        min_sample_threshold: 100,
        sample_count: 1200,
        stop_count: 20,
        direction_count: 2,
        average_observed_headway_minutes: 14,
        median_observed_headway_minutes: 10,
        p90_observed_headway_minutes: 24,
        max_observed_headway_minutes: 45,
        scheduled_median_headway_minutes: 10,
        bunching_threshold_minutes: 5,
        long_gap_threshold_minutes: 20,
        observed_bunching_share: 0.1,
        observed_long_gap_share: 0.35,
        expected_wait_minutes: 12,
        scheduled_expected_wait_minutes: 5,
        excess_wait_minutes: 7,
        wait_reliability_ratio: 2.4,
      });
      seedScheduledBaseline(local.sqlite, "M1", month);
      insertRow(local.sqlite, "local_bus_wait_assessment", {
        month,
        route_id: "M1",
        borough: "Manhattan",
        day_type: 1,
        trip_type: "Local",
        period: "All Day",
        trips_passing_wait: 620,
        scheduled_trips: 1000,
        wait_assessment: 0.62,
      });
      insertRow(local.sqlite, "local_route_hotspot_summary", {
        route_id: "M1",
        month,
        generated_at: "2026-05-01T00:00:00.000Z",
        route_weighted_average_speed_mph: 7.8,
        observation_count: 500,
        bus_trip_count: 200,
        ridership_weighted: 1,
        ridership_window_count: 12,
        ridership_matched_observation_count: 480,
        ridership_exposure: 1200,
        segment_count: 1,
        hotspot_count: 1,
      });
      insertRow(local.sqlite, "local_route_hotspot", {
        route_id: "M1",
        month,
        hotspot_rank: 1,
        segment_id: "M1:0:1",
        direction: "Northbound",
        stop_order: 1,
        timepoint_stop_id: "m1-a",
        timepoint_stop_name: "South Ferry",
        next_timepoint_stop_id: "m1-b",
        next_timepoint_stop_name: "Houston St",
        observation_count: 80,
        bus_trip_count: 160,
        weighted_average_speed_mph: 5.2,
        weighted_average_travel_time_minutes: 8.5,
        average_road_distance_miles: 0.7,
        slow_window_share: 0.9,
        speed_severity: 0.35,
        hotspot_score: 82,
        ridership_exposure: 1200,
        transfer_exposure: null,
        rider_delay_index: 420,
        rider_impact_share: 1,
        rider_weighted_speed_severity: 0.35,
        rider_weighted_slow_window_share: 0.9,
        rider_impact_score: 88,
      });
      for (const trend of [
        ["2026-01", 5.2],
        ["2026-02", 5.4],
        [month, 5.1],
      ] as const) {
        seedRouteTrend(local.sqlite, "M1", trend[0], trend[1]);
        for (let index = 0; index < 10; index += 1) {
          seedRouteTrend(local.sqlite, `M${index + 2}`, trend[0], 7.2 + index / 10);
        }
      }

      insertRow(local.sqlite, "local_context_event", {
        event_id: "joined-alert-1",
        source_id: "mta_alerts",
        source_row_id: "alert-1",
        event_kind: "service_alert",
        occurred_at: "2026-03-12T08:00:00.000Z",
        ended_at: null,
        physical_id: null,
        lat: null,
        lng: null,
        route_id: "M1",
        payload_json: "{}",
        ingested_at: "2026-05-01T00:00:00.000Z",
      });
      insertRow(local.sqlite, "local_context_event_route_touch", {
        event_id: "joined-alert-1",
        route_id: "M1",
        source_id: "mta_alerts",
        event_kind: "service_alert",
        occurred_at: "2026-03-12T08:00:00.000Z",
        ended_at: null,
        physical_id: null,
        touch_kind: "direct_route",
        evidence_role: "primary",
        overlap_meters: null,
        buffer_meters: null,
        route_fanout: 1,
        match_weight: 1,
        computed_at: "2026-05-01T00:00:00.000Z",
      });
      for (let i = 2; i <= 60; i += 1) {
        insertRow(local.sqlite, "local_context_event", {
          event_id: `joined-alert-${i}`,
          source_id: "mta_alerts",
          source_row_id: `alert-${i}`,
          event_kind: "service_alert",
          occurred_at: "2026-03-12T08:00:00.000Z",
          ended_at: null,
          physical_id: null,
          lat: null,
          lng: null,
          route_id: "M1",
          payload_json: "{}",
          ingested_at: "2026-05-01T00:00:00.000Z",
        });
        insertRow(local.sqlite, "local_context_event_route_touch", {
          event_id: `joined-alert-${i}`,
          route_id: "M1",
          source_id: "mta_alerts",
          event_kind: "service_alert",
          occurred_at: "2026-03-12T08:00:00.000Z",
          ended_at: null,
          physical_id: null,
          touch_kind: "direct_route",
          evidence_role: "primary",
          overlap_meters: null,
          buffer_meters: null,
          route_fanout: 1,
          match_weight: 1,
          computed_at: "2026-05-01T00:00:00.000Z",
        });
      }
      for (let i = 0; i < 60; i += 1) {
        insertRow(local.sqlite, "local_context_event", {
          event_id: `orphan-parking-${i}`,
          source_id: "nyc_parking_violations_current",
          source_row_id: `parking-${i}`,
          event_kind: "parking_violation",
          occurred_at: "2026-03-12T08:00:00.000Z",
          ended_at: null,
          physical_id: "missing-physical",
          lat: null,
          lng: null,
          route_id: null,
          payload_json: "{}",
          ingested_at: "2026-05-19T00:00:00.000Z",
        });
      }
      insertRow(local.sqlite, "local_intervention_event", {
        event_id: "m1-bus-lane-placeholder",
        route_id: "M1",
        intervention_type: "bus_lane_infrastructure",
        source_id: "nyc_dot_bus_lanes_local_streets",
        program: "NYC DOT Bus Lanes",
        implementation_date: "2026-03-01T00:00:00.000Z",
        implementation_month: "2026-03",
        event_status: "source_gap",
        description: "Fixture bus-lane row with placeholder implementation date.",
      });

      // B46: no speed coverage row, no LION link, no observed summary.
      // Should produce four route candidates, including missing scheduled baseline.
    } finally {
      local.sqlite.close();
    }

    const result = await buildFindings({ year: 2026, month: 3, dbPath, artifactRoot });

    expect(result.detectorCounts).toHaveLength(8);
    expect(result.detectorCounts[0]?.detectorId).toBe("source_gap");
    expect(result.detectorCounts[0]?.coverageCount).toBe(13);
    expect(result.detectorCounts[0]?.hits).toBe(2);
    expect(result.detectorCounts[0]?.cleanNoHits).toBe(3);
    expect(result.detectorCounts[0]?.candidateCount).toBe(6);
    expect(result.detectorCounts[1]).toMatchObject({
      detectorId: "persistent_speed_hotspot",
      coverageCount: 2,
      hits: 1,
      cleanNoHits: 0,
      candidateCount: 1,
    });
    expect(result.detectorCounts[2]).toMatchObject({
      detectorId: "multi_month_speed_peer",
      coverageCount: 2,
      hits: 1,
      cleanNoHits: 0,
      candidateCount: 1,
    });
    expect(result.detectorCounts[3]).toMatchObject({
      detectorId: "observed_reliability",
      coverageCount: 2,
      hits: 1,
      cleanNoHits: 0,
      candidateCount: 1,
    });
    expect(result.detectorCounts[4]).toMatchObject({
      detectorId: "intervention_gap",
      coverageCount: 2,
      hits: 1,
      cleanNoHits: 0,
      candidateCount: 1,
    });
    expect(result.detectorCounts[5]).toMatchObject({
      detectorId: "intervention_underperformance",
      coverageCount: 2,
      hits: 0,
      cleanNoHits: 0,
      candidateCount: 0,
    });
    expect(result.detectorCounts[6]).toMatchObject({
      detectorId: "permit_correlated_slowdown",
      coverageCount: 2,
      hits: 0,
      cleanNoHits: 1,
      candidateCount: 0,
    });
    expect(result.detectorCounts[7]).toMatchObject({
      detectorId: "service_request_context",
      coverageCount: 2,
      hits: 0,
      cleanNoHits: 1,
      candidateCount: 0,
    });
    expect(result.auditArtifactPath).toBe(
      join(artifactRoot, "findings", month, "detector-coverage-audit.json"),
    );
    expect(result.detectorSpecsArtifactPath).toBe(
      join(artifactRoot, "findings", "detector-specs.json"),
    );
    expect(result.reviewQueueArtifactPath).toBe(
      join(artifactRoot, "findings", month, "review-queue.json"),
    );
    expect(result.reviewPacketsArtifactPath).toBe(
      join(artifactRoot, "findings", month, "review-packets.json"),
    );
    expect(result.promotionQueueArtifactPath).toBe(
      join(artifactRoot, "findings", month, "promotion-queue.json"),
    );
    expect(result.signalFeaturesArtifactPath).toBe(
      join(artifactRoot, "findings", month, "signal-features.json"),
    );
    const auditArtifact = JSON.parse(await Bun.file(result.auditArtifactPath).text()) as {
      artifactKind: string;
      detectorCount: number;
      detectors: Array<{
        detectorId: string;
        candidateCount: number;
        outcomeCounts: Record<string, number>;
        topCandidates: unknown[];
      }>;
    };
    expect(auditArtifact.artifactKind).toBe("finding_detector_coverage_audit");
    expect(auditArtifact.detectorCount).toBe(8);
    expect(auditArtifact.detectors.map((detector) => detector.detectorId)).toEqual([
      "source_gap",
      "persistent_speed_hotspot",
      "multi_month_speed_peer",
      "observed_reliability",
      "intervention_gap",
      "intervention_underperformance",
      "permit_correlated_slowdown",
      "service_request_context",
    ]);
    expect(
      auditArtifact.detectors.find((detector) => detector.detectorId === "intervention_gap")
        ?.candidateCount,
    ).toBe(1);
    const reviewQueue = JSON.parse(await Bun.file(result.reviewQueueArtifactPath).text()) as {
      artifactKind: string;
      totalCandidateCount: number;
      candidateCount: number;
      omittedCandidateCount: number;
      evidenceLinkedCandidateCount: number;
      unlinkedCandidateCount: number;
      totalDetectorCounts: Record<string, number>;
      detectorCounts: Record<string, number>;
      routeGroupCount: number;
      summary: {
        totalPriorityBandCounts: Record<string, number>;
        surfacedPriorityBandCounts: Record<string, number>;
        omittedPriorityBandCounts: Record<string, number>;
        surfacedCategoryCounts: Record<string, number>;
        routePriorityBandCounts: Record<string, number>;
        multiDetectorRouteCount: number;
        criticalRouteGroupCount: number;
        capExhaustedPriorityBands: string[];
      };
      health: {
        status: string;
        issues: Array<{
          severity: string;
          code: string;
          count: number;
        }>;
      };
      agentReview: {
        reviewMode: string;
        month: string;
        intendedReviewers: string[];
        instructions: string[];
        outputSchema: {
          detectorAction: string;
          confidence: string;
        };
        health: {
          status: string;
        };
        routePackets: Array<{
          routeId: string;
          candidateIds: string[];
          task: string;
        }>;
        candidatePackets: Array<{
          candidateId: string;
          reviewRank: number;
          detectorId: string;
          routeId: string | null;
          evidenceRefs: string[];
          evidenceObjects: unknown[];
          validationChecks: string[];
          claim: {
            safeLabel: string;
            text: string;
          };
          priority: {
            band: string;
            signals: string[];
          };
          detectorGuidance: {
            detectorKind: string;
            validateAs: string;
            defaultThresholds: Record<string, unknown>;
            keyEvidenceFields: Record<string, string>;
            commonFollowUps: string[];
          };
          derivedMetricWarnings: string[];
        }>;
      };
      routeGroups: Array<{
        routeRank: number;
        routeId: string;
        candidateCount: number;
        detectorIds: string[];
        reasonCodes: string[];
        topReviewPriority: number;
        topReviewPriorityBand: string;
        hasMultiDetectorSignal: boolean;
        evidenceRefCount: number;
        topCandidateIds: string[];
      }>;
      candidates: Array<{
        reviewRank: number;
        detectorId: string;
        routeId: string | null;
        reviewPriority: number;
        reviewPriorityBand: string;
        category: string;
        reviewSignals: string[];
        evidenceRefs: string[];
        evidenceRefCount: number;
      }>;
    };
    expect(reviewQueue.artifactKind).toBe("finding_review_queue");
    expect(reviewQueue.totalCandidateCount).toBe(10);
    expect(reviewQueue.candidateCount).toBe(10);
    expect(reviewQueue.omittedCandidateCount).toBe(0);
    expect(reviewQueue.evidenceLinkedCandidateCount).toBe(10);
    expect(reviewQueue.unlinkedCandidateCount).toBe(0);
    expect(reviewQueue.totalDetectorCounts).toEqual({
      intervention_gap: 1,
      multi_month_speed_peer: 1,
      observed_reliability: 1,
      persistent_speed_hotspot: 1,
      source_gap: 6,
    });
    expect(reviewQueue.detectorCounts).toEqual({
      intervention_gap: 1,
      multi_month_speed_peer: 1,
      observed_reliability: 1,
      persistent_speed_hotspot: 1,
      source_gap: 6,
    });
    expect(
      Object.values(reviewQueue.summary.totalPriorityBandCounts).reduce(
        (total, count) => total + count,
        0,
      ),
    ).toBe(reviewQueue.totalCandidateCount);
    expect(
      Object.values(reviewQueue.summary.surfacedPriorityBandCounts).reduce(
        (total, count) => total + count,
        0,
      ),
    ).toBe(reviewQueue.candidateCount);
    expect(
      Object.values(reviewQueue.summary.omittedPriorityBandCounts).reduce(
        (total, count) => total + count,
        0,
      ),
    ).toBe(reviewQueue.omittedCandidateCount);
    expect(reviewQueue.summary.capExhaustedPriorityBands).toEqual([]);
    expect(reviewQueue.health).toEqual({
      status: "ok",
      issues: [],
    });
    expect(reviewQueue.agentReview.reviewMode).toBe("agent_detector_audit");
    expect(reviewQueue.agentReview.month).toBe(month);
    expect(reviewQueue.agentReview.intendedReviewers).toEqual(["codex", "claude"]);
    expect(reviewQueue.agentReview.instructions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Audit why the detector emitted"),
        expect.stringContaining("Use evidenceObjects first"),
        expect.stringContaining("Keep the output structured"),
      ]),
    );
    expect(reviewQueue.agentReview.outputSchema.detectorAction).toContain("keep");
    expect(reviewQueue.agentReview.outputSchema.detectorAction).toContain("enrich");
    expect(reviewQueue.agentReview.health.status).toBe(reviewQueue.health.status);
    expect(reviewQueue.agentReview.candidatePackets).toHaveLength(reviewQueue.candidateCount);
    expect(reviewQueue.agentReview.routePackets).toHaveLength(reviewQueue.routeGroupCount);
    expect(
      reviewQueue.agentReview.candidatePackets.every(
        (packet) =>
          packet.evidenceRefs.length > 0 &&
          packet.evidenceObjects.length === packet.evidenceRefs.length &&
          packet.detectorGuidance.validateAs.length > 0 &&
          Object.keys(packet.detectorGuidance.keyEvidenceFields).length > 0 &&
          packet.validationChecks.some((check) => check.includes("detector inputs")) &&
          packet.validationChecks.some((check) => check.includes("Return one detector action")),
      ),
    ).toBe(true);
    expect(
      reviewQueue.agentReview.candidatePackets.find(
        (packet) => packet.detectorId === "persistent_speed_hotspot",
      )?.detectorGuidance.keyEvidenceFields,
    ).toHaveProperty("weightedAverageSpeedMph");
    expect(
      reviewQueue.agentReview.candidatePackets.find(
        (packet) => packet.detectorId === "intervention_gap",
      )?.detectorGuidance.commonFollowUps,
    ).toEqual(expect.arrayContaining([expect.stringContaining("underlying intervention")]));
    const interventionGapPacket = reviewQueue.agentReview.candidatePackets.find(
      (packet) => packet.detectorId === "intervention_gap",
    );
    const interventionGapSpeedField =
      Object.entries(interventionGapPacket?.detectorGuidance.keyEvidenceFields ?? {}).find(
        ([field]) => field === "speedPainScore",
      )?.[1] ?? "";
    expect(interventionGapSpeedField).toContain("Derived");
    expect(interventionGapPacket?.derivedMetricWarnings).toEqual(
      expect.arrayContaining([expect.stringContaining("derived detector score")]),
    );
    expect(
      Object.values(reviewQueue.summary.surfacedCategoryCounts).reduce(
        (total, count) => total + count,
        0,
      ),
    ).toBe(reviewQueue.candidateCount);
    expect(reviewQueue.summary.surfacedCategoryCounts).toMatchObject({
      data_quality: 6,
      high_long_gap_share: 1,
      intervention_gap: 1,
      multi_month_peer_speed_deficit: 1,
      persistent_low_speed: 1,
    });
    expect(reviewQueue.routeGroupCount).toBe(2);
    expect(reviewQueue.summary.multiDetectorRouteCount).toBe(1);
    expect(reviewQueue.summary.criticalRouteGroupCount).toBe(1);
    expect(reviewQueue.summary.routePriorityBandCounts).toEqual({ critical: 1, high: 1 });
    expect(reviewQueue.routeGroups.find((group) => group.routeId === "B46")).toMatchObject({
      routeRank: 1,
      candidateCount: 4,
      detectorIds: ["source_gap"],
      hasMultiDetectorSignal: false,
      topReviewPriorityBand: "critical",
      evidenceRefCount: 4,
    });
    expect(reviewQueue.routeGroups.find((group) => group.routeId === "M1")).toMatchObject({
      candidateCount: 5,
      detectorIds: [
        "intervention_gap",
        "multi_month_speed_peer",
        "observed_reliability",
        "persistent_speed_hotspot",
        "source_gap",
      ],
      hasMultiDetectorSignal: true,
      evidenceRefCount: 14,
    });
    expect(
      reviewQueue.routeGroups.every(
        (group) => group.topCandidateIds.length > 0 && group.topCandidateIds.length <= 5,
      ),
    ).toBe(true);
    expect(reviewQueue.candidates[0]).toEqual(
      expect.objectContaining({
        reviewRank: 1,
        detectorId: "source_gap",
        routeId: "B46",
        reviewPriorityBand: "critical",
        reviewSignals: expect.arrayContaining(["source_gap:missing_speed", "high_severity"]),
      }),
    );
    expect(reviewQueue.candidates.every((candidate) => candidate.evidenceRefs.length > 0)).toBe(
      true,
    );
    expect(
      reviewQueue.candidates.every(
        (candidate) => candidate.evidenceRefCount === candidate.evidenceRefs.length,
      ),
    ).toBe(true);
    const detectorSpecs = JSON.parse(await Bun.file(result.detectorSpecsArtifactPath).text()) as {
      artifactKind: string;
      detectorCount: number;
      detectors: Array<{ detectorId: string; counterEvidenceRequired: string[] }>;
    };
    expect(detectorSpecs.artifactKind).toBe("finding_detector_specs");
    expect(detectorSpecs.detectorCount).toBe(8);
    expect(
      detectorSpecs.detectors.find((detector) => detector.detectorId === "service_request_context")
        ?.counterEvidenceRequired,
    ).toEqual(expect.arrayContaining([expect.stringContaining("Reporting bias")]));

    const reviewPackets = JSON.parse(await Bun.file(result.reviewPacketsArtifactPath).text()) as {
      artifactKind: string;
      packetCount: number;
      summary: {
        candidatesWithoutCounterEvidence: number;
        candidatesWithoutCoverage: number;
        detectorCounts: Record<string, number>;
      };
      packets: Array<{
        candidate: { candidateId: string; detectorId: string };
        evidence: {
          primary: Array<{ linkId: string; evidenceRef: string }>;
          counterEvidence: unknown[];
        };
        packetCompleteness: { hasCounterEvidence: boolean; hasCoverageAudit: boolean };
        promotionBlockers: string[];
      }>;
    };
    expect(reviewPackets.artifactKind).toBe("finding_review_packets");
    expect(reviewPackets.packetCount).toBe(10);
    expect(reviewPackets.summary.detectorCounts).toMatchObject({
      multi_month_speed_peer: 1,
      persistent_speed_hotspot: 1,
      source_gap: 6,
    });
    expect(reviewPackets.summary.candidatesWithoutCounterEvidence).toBe(6);
    expect(reviewPackets.summary.candidatesWithoutCoverage).toBe(0);
    const hotspotPacket = reviewPackets.packets.find(
      (packet) => packet.candidate.detectorId === "persistent_speed_hotspot",
    );
    expect(hotspotPacket?.packetCompleteness.hasCounterEvidence).toBe(true);
    expect(hotspotPacket?.packetCompleteness.hasCoverageAudit).toBe(true);
    expect(hotspotPacket?.evidence.counterEvidence).toHaveLength(1);
    expect(hotspotPacket?.promotionBlockers).toEqual([]);
    const promotionQueue = JSON.parse(await Bun.file(result.promotionQueueArtifactPath).text()) as {
      artifactKind: string;
      candidateCount: number;
      summary: {
        readyForReviewCount: number;
        blockedCount: number;
        readinessCounts: Record<string, number>;
        recommendedNextActionCounts: Record<string, number>;
        detectorCounts: Record<string, number>;
      };
      reviewerDecisionOptions: Array<{ decision: string; meaning: string }>;
      outputSchema: { decision: string; rationale: string };
      candidates: Array<{
        candidate: { detectorId: string; candidateId: string };
        readiness: string;
        recommendedNextAction: string;
        evidenceSummary: { primaryCount: number; counterEvidenceCount: number };
        promotionBlockers: string[];
      }>;
    };
    expect(promotionQueue.artifactKind).toBe("finding_promotion_queue");
    expect(promotionQueue.candidateCount).toBe(reviewPackets.packetCount);
    expect(promotionQueue.summary.detectorCounts).toMatchObject({
      multi_month_speed_peer: 1,
      persistent_speed_hotspot: 1,
      source_gap: 6,
    });
    expect(promotionQueue.summary.readyForReviewCount).toBeGreaterThan(0);
    expect(promotionQueue.summary.blockedCount).toBe(6);
    expect(promotionQueue.summary.recommendedNextActionCounts).toMatchObject({
      keep_as_data_quality: 6,
      enrich_before_promotion: 1,
    });
    expect(promotionQueue.reviewerDecisionOptions.map((row) => row.decision)).toEqual(
      expect.arrayContaining(["approve", "defer", "reject", "downgrade_to_context"]),
    );
    expect(promotionQueue.outputSchema.decision).toContain("approve_with_revisions");
    expect(
      promotionQueue.candidates.find(
        (candidate) => candidate.candidate.detectorId === "multi_month_speed_peer",
      ),
    ).toMatchObject({
      readiness: "needs_enrichment",
      evidenceSummary: {
        primaryCount: 1,
        counterEvidenceCount: 1,
      },
      promotionBlockers: [],
    });
    const peerPromotionCandidate = promotionQueue.candidates.find(
      (candidate) => candidate.candidate.detectorId === "multi_month_speed_peer",
    );
    const approvedEvidenceRef = hotspotPacket?.evidence.primary[0]?.linkId;
    if (
      hotspotPacket === undefined ||
      peerPromotionCandidate === undefined ||
      approvedEvidenceRef === undefined
    ) {
      throw new Error("Fixture should produce hotspot and peer promotion candidates");
    }
    const reviewerDecisionsInputPath = join(artifactRoot, "fixture-review-decisions.json");
    await Bun.write(
      reviewerDecisionsInputPath,
      JSON.stringify(
        {
          decisions: [
            {
              candidateId: hotspotPacket.candidate.candidateId,
              decision: "approve",
              revisedClaimText: null,
              rationale: "Primary hotspot evidence supports a segment-scoped descriptive claim.",
              evidenceRefsApproved: [approvedEvidenceRef],
              reviewer: "fixture-reviewer",
              reviewedAt: "2026-05-24T00:00:00.000Z",
            },
            {
              candidateId: peerPromotionCandidate.candidate.candidateId,
              decision: "defer",
              revisedClaimText: null,
              rationale: "Peer-speed claim needs calibrated matched-peer review first.",
              evidenceRefsApproved: [],
              reviewer: "fixture-reviewer",
              reviewedAt: "2026-05-24T00:10:00.000Z",
            },
          ],
        },
        null,
        2,
      ),
    );
    const promotedResult = await buildPromotedFindings({
      year: 2026,
      month: 3,
      dbPath,
      artifactRoot,
      decisionsPath: reviewerDecisionsInputPath,
    });
    expect(promotedResult).toMatchObject({
      decisionCount: 2,
      promotedFindingCount: 1,
      reviewDecisionsArtifactPath: join(artifactRoot, "findings", month, "review-decisions.json"),
      promotedFindingsArtifactPath: join(artifactRoot, "findings", month, "promoted-findings.json"),
    });
    const reviewDecisionsArtifact = JSON.parse(
      await Bun.file(promotedResult.reviewDecisionsArtifactPath).text(),
    ) as {
      summary: {
        decisionCounts: Record<string, number>;
        promotedDecisionCount: number;
        nonPromotedDecisionCount: number;
      };
    };
    expect(reviewDecisionsArtifact.summary.decisionCounts).toMatchObject({
      approve: 1,
      defer: 1,
    });
    expect(reviewDecisionsArtifact.summary.promotedDecisionCount).toBe(1);
    expect(reviewDecisionsArtifact.summary.nonPromotedDecisionCount).toBe(1);
    const promotedFindingsArtifact = JSON.parse(
      await Bun.file(promotedResult.promotedFindingsArtifactPath).text(),
    ) as {
      promotedFindingCount: number;
      findings: Array<{
        sourceCandidateId: string;
        approvedEvidenceRefs: string[];
        decisionHash: string;
        candidateSnapshotHash: string;
        promotedFindingHash: string;
      }>;
    };
    expect(promotedFindingsArtifact.promotedFindingCount).toBe(1);
    expect(promotedFindingsArtifact.findings[0]).toMatchObject({
      sourceCandidateId: hotspotPacket.candidate.candidateId,
      approvedEvidenceRefs: [approvedEvidenceRef],
    });
    expect(promotedFindingsArtifact.findings[0]?.decisionHash).toHaveLength(64);
    expect(promotedFindingsArtifact.findings[0]?.candidateSnapshotHash).toHaveLength(64);
    expect(promotedFindingsArtifact.findings[0]?.promotedFindingHash).toHaveLength(64);
    const goldSetPath = join(artifactRoot, "fixture-gold-set.json");
    await Bun.write(
      goldSetPath,
      JSON.stringify(
        {
          expectations: [
            {
              expectationId: "m1-hotspot-counter-evidence",
              routeId: "M1",
              detectorId: "persistent_speed_hotspot",
              reasonCode: "persistent_low_speed",
              expectCounterEvidence: true,
              minimumConfidence: "medium",
            },
          ],
        },
        null,
        2,
      ),
    );
    const backtest = await auditFindingsBacktest({
      year: 2026,
      month: 3,
      dbPath,
      artifactRoot,
      goldSetPath,
    });
    expect(backtest).toMatchObject({
      status: "pass",
      expectationCount: 1,
      matchedExpectationCount: 1,
      missingExpectationCount: 0,
      unexpectedMatchCount: 0,
      confidenceMissCount: 0,
      artifactPath: join(artifactRoot, "findings", month, "backtest.json"),
    });
    const backtestArtifact = JSON.parse(await Bun.file(backtest.artifactPath).text()) as {
      confidenceCalibration: {
        reviewDecisionCount: number;
        approvedDecisionCount: number;
        byDetectorConfidence: Array<{
          detectorId: string;
          confidence: string;
          reviewedCandidateCount: number;
          approvedDecisionCount: number;
          approvalRate: number | null;
        }>;
      };
    };
    expect(backtestArtifact.confidenceCalibration.reviewDecisionCount).toBe(2);
    expect(backtestArtifact.confidenceCalibration.approvedDecisionCount).toBe(1);
    expect(backtestArtifact.confidenceCalibration.byDetectorConfidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          detectorId: "persistent_speed_hotspot",
          confidence: "high",
          reviewedCandidateCount: 1,
          approvedDecisionCount: 1,
          approvalRate: 1,
        }),
      ]),
    );
    const cappedResult = await buildFindings({
      year: 2026,
      month: 3,
      dbPath,
      artifactRoot,
      reviewQueueLimit: 0,
    });
    const cappedReviewQueue = JSON.parse(
      await Bun.file(cappedResult.reviewQueueArtifactPath).text(),
    ) as {
      queueLimit: number;
      totalCandidateCount: number;
      candidateCount: number;
      omittedCandidateCount: number;
      summary: {
        omittedPriorityBandCounts: Record<string, number>;
        capExhaustedPriorityBands: string[];
      };
      health: {
        status: string;
        issues: Array<{
          severity: string;
          code: string;
          count: number;
        }>;
      };
    };
    expect(cappedReviewQueue.queueLimit).toBe(0);
    expect(cappedReviewQueue.candidateCount).toBe(0);
    expect(cappedReviewQueue.omittedCandidateCount).toBe(cappedReviewQueue.totalCandidateCount);
    expect(cappedReviewQueue.summary.capExhaustedPriorityBands).toContain("critical");
    const cappedCriticalOmittedCount =
      Object.entries(cappedReviewQueue.summary.omittedPriorityBandCounts).find(
        ([band]) => band === "critical",
      )?.[1] ?? 0;
    expect(cappedReviewQueue.health.status).toBe("attention_required");
    expect(cappedReviewQueue.health.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "warning",
          code: "empty_review_queue",
        }),
        expect.objectContaining({
          severity: "warning",
          code: "critical_candidates_omitted",
          count: cappedCriticalOmittedCount,
        }),
      ]),
    );

    const sqlite = new Database(dbPath, { readonly: true });
    try {
      const candidates = sqlite
        .query<
          {
            route_id: string | null;
            scope_kind: string;
            reason_code: string;
            severity: string;
            claim_safe_label: string;
          },
          []
        >(
          `SELECT route_id, scope_kind, reason_code, severity, claim_safe_label
             FROM local_finding_candidate
            WHERE detector_id = 'source_gap'
            ORDER BY scope_kind, coalesce(route_id, ''), reason_code`,
        )
        .all();
      expect(candidates.map((c) => c.reason_code).sort()).toEqual([
        "bus_lane_date_gap",
        "failed_context_join",
        "insufficient_gtfs_rt_samples",
        "missing_geometry",
        "missing_scheduled_baseline",
        "missing_speed",
      ]);
      expect(
        candidates
          .filter((c) => c.reason_code !== "bus_lane_date_gap" && c.scope_kind === "route")
          .every((c) => c.route_id === "B46"),
      ).toBe(true);
      expect(candidates.find((c) => c.reason_code === "bus_lane_date_gap")?.route_id).toBe("M1");
      expect(candidates.every((c) => c.claim_safe_label === "insufficient_evidence")).toBe(true);
      const hotspotCandidates = sqlite
        .query<
          {
            route_id: string | null;
            scope_kind: string;
            scope_id: string;
            reason_code: string;
            claim_safe_label: string;
          },
          []
        >(
          `SELECT route_id, scope_kind, scope_id, reason_code, claim_safe_label
             FROM local_finding_candidate
            WHERE detector_id = 'persistent_speed_hotspot'`,
        )
        .all();
      expect(hotspotCandidates).toEqual([
        {
          route_id: "M1",
          scope_kind: "segment",
          scope_id: "M1:0:1",
          reason_code: "persistent_low_speed",
          claim_safe_label: "issue_needs_review",
        },
      ]);

      const audits = sqlite
        .query<{ scope_kind: string; scope_id: string; outcome: string }, []>(
          `SELECT scope_kind, scope_id, outcome
             FROM local_finding_coverage_audit
            WHERE detector_id = 'source_gap'
            ORDER BY scope_kind, scope_id`,
        )
        .all();
      expect(audits).toEqual([
        { scope_kind: "route", scope_id: "B46", outcome: "hit" },
        { scope_kind: "route", scope_id: "M1", outcome: "clean_no_hit" },
        {
          scope_kind: "system",
          scope_id: "context_join:mta_alerts",
          outcome: "clean_no_hit",
        },
        {
          scope_kind: "system",
          scope_id: "context_join:nyc_parking_violations_current",
          outcome: "hit",
        },
        {
          scope_kind: "system",
          scope_id: "source_lag:nyc_311_service_requests_current",
          outcome: "skipped_missing_input",
        },
        {
          scope_kind: "system",
          scope_id: "source_lag:nyc_311_service_requests_historical",
          outcome: "skipped_missing_input",
        },
        {
          scope_kind: "system",
          scope_id: "source_lag:nyc_dot_automated_traffic_volume_counts",
          outcome: "skipped_missing_input",
        },
        {
          scope_kind: "system",
          scope_id: "source_lag:nyc_dot_real_time_traffic_speeds",
          outcome: "skipped_missing_input",
        },
        {
          scope_kind: "system",
          scope_id: "source_lag:nyc_dot_street_construction_permits",
          outcome: "skipped_missing_input",
        },
        {
          scope_kind: "system",
          scope_id: "source_lag:nyc_dot_street_opening_permits",
          outcome: "skipped_missing_input",
        },
        {
          scope_kind: "system",
          scope_id: "source_lag:nyc_mta_ace_violations",
          outcome: "skipped_missing_input",
        },
        {
          scope_kind: "system",
          scope_id: "source_lag:nyc_parking_violations_current",
          outcome: "clean_no_hit",
        },
        {
          scope_kind: "system",
          scope_id: "source_lag:nypd_motor_vehicle_collisions",
          outcome: "skipped_missing_input",
        },
      ]);

      const evidence = sqlite
        .query<{ evidence_kind: string; evidence_role: string }, []>(
          `SELECT evidence_kind, evidence_role
             FROM local_finding_evidence_link
            WHERE candidate_id IN (
              SELECT candidate_id
                FROM local_finding_candidate
               WHERE detector_id = 'source_gap'
            )`,
        )
        .all();
      expect(evidence).toHaveLength(7);
      expect(evidence.filter((e) => e.evidence_kind === "missing_data")).toHaveLength(5);
      expect(evidence.filter((e) => e.evidence_kind === "context_event")).toHaveLength(1);
      expect(evidence.filter((e) => e.evidence_role === "coverage_audit")).toHaveLength(1);
      const hotspotEvidence = sqlite
        .query<{ evidence_kind: string; evidence_role: string }, []>(
          `SELECT evidence_kind, evidence_role
             FROM local_finding_evidence_link
            WHERE candidate_id IN (
              SELECT candidate_id
                FROM local_finding_candidate
               WHERE detector_id = 'persistent_speed_hotspot'
            )`,
        )
        .all();
      expect(hotspotEvidence).toHaveLength(3);
      expect(hotspotEvidence).toEqual(
        expect.arrayContaining([
          { evidence_kind: "metric", evidence_role: "primary" },
          { evidence_kind: "metric", evidence_role: "counter_evidence" },
          { evidence_kind: "context_event", evidence_role: "context" },
        ]),
      );
      const reliabilityCandidates = sqlite
        .query<
          {
            route_id: string | null;
            scope_kind: string;
            reason_code: string;
            claim_safe_label: string;
          },
          []
        >(
          `SELECT route_id, scope_kind, reason_code, claim_safe_label
             FROM local_finding_candidate
            WHERE detector_id = 'observed_reliability'`,
        )
        .all();
      expect(reliabilityCandidates).toEqual([
        {
          route_id: "M1",
          scope_kind: "route",
          reason_code: "high_long_gap_share",
          claim_safe_label: "issue_needs_review",
        },
      ]);
      const interventionGapCandidates = sqlite
        .query<
          {
            route_id: string | null;
            scope_kind: string;
            reason_code: string;
            claim_safe_label: string;
          },
          []
        >(
          `SELECT route_id, scope_kind, reason_code, claim_safe_label
             FROM local_finding_candidate
            WHERE detector_id = 'intervention_gap'`,
        )
        .all();
      expect(interventionGapCandidates).toEqual([
        {
          route_id: "M1",
          scope_kind: "route",
          reason_code: "intervention_gap",
          claim_safe_label: "issue_needs_review",
        },
      ]);
    } finally {
      sqlite.close();
    }
  });

  test("re-running replaces prior candidates idempotently", async () => {
    await resetDb();
    const local = await openLocalPipelineDb(dbPath);
    try {
      seedRoute(local.sqlite, "Q70");
      // Missing speed + geometry + GTFS-RT samples + scheduled baseline = 4 candidates.
    } finally {
      local.sqlite.close();
    }

    const first = await buildFindings({ year: 2026, month: 3, dbPath, artifactRoot });
    const second = await buildFindings({ year: 2026, month: 3, dbPath, artifactRoot });

    expect(first.detectorCounts[0]?.candidateCount).toBe(4);
    expect(second.detectorCounts[0]?.candidateCount).toBe(4);

    const sqlite = new Database(dbPath, { readonly: true });
    try {
      const candidates = sqlite
        .query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM local_finding_candidate`)
        .get();
      expect(candidates?.n).toBe(4);
      const evidence = sqlite
        .query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM local_finding_evidence_link`)
        .get();
      expect(evidence?.n).toBe(4);
      const audits = sqlite
        .query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM local_finding_coverage_audit`)
        .get();
      expect(audits?.n).toBe(17);
    } finally {
      sqlite.close();
    }
  });
});
