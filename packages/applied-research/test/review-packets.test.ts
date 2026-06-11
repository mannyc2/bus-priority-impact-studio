import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { ANALYTICS_DETECTOR_REGISTRY } from "@bp/analytics/registry";
import {
  DetectorIdSchema,
  type FindingCandidate,
  FindingCandidateSchema,
  type FindingCoverageAudit,
  FindingCoverageAuditSchema,
  type FindingEvidenceLink,
  FindingEvidenceLinkSchema,
} from "@bp/domain/findings";
import { loadReviewPacketLocalDbRows } from "../src/local-db";
import { buildReviewPacketArtifacts } from "../src/review-packets";

const generatedAt = "2026-06-01T00:00:00.000Z";
const month = "2026-03";

function candidate(input: {
  candidateId: string;
  detectorId: string;
  detectorRunId: string;
  scopeKind: "route" | "segment" | "corridor" | "system";
  scopeId: string;
  routeId: string | null;
  category: "reliability" | "speed" | "intervention" | "data_quality" | "context";
  detectorScore: number;
  reasonCode: string;
}): FindingCandidate {
  return FindingCandidateSchema.parse({
    candidateId: input.candidateId,
    detectorId: input.detectorId,
    detectorRunId: input.detectorRunId,
    month,
    scopeKind: input.scopeKind,
    scopeId: input.scopeId,
    routeId: input.routeId,
    physicalId: null,
    category: input.category,
    severity: "high",
    confidence: "medium",
    detectorScore: input.detectorScore,
    reasonCode: input.reasonCode,
    claimSafeLabel: "issue_needs_review",
    claimText: `${input.detectorId} candidate for ${input.scopeId}.`,
    status: "open",
    reviewState: "needs_review",
    windowStart: "2026-03-01T00:00:00.000Z",
    windowEnd: "2026-03-31T23:59:59.000Z",
    createdAt: generatedAt,
  });
}

function evidence(input: {
  linkId: string;
  candidateId: string;
  role:
    | "primary"
    | "counter_evidence"
    | "context"
    | "official_context"
    | "caveat"
    | "missing_data"
    | "coverage_audit";
  kind?:
    | "metric"
    | "context_event"
    | "source_row"
    | "missing_data"
    | "source_doc"
    | "coverage_audit";
}): FindingEvidenceLink {
  return FindingEvidenceLinkSchema.parse({
    linkId: input.linkId,
    candidateId: input.candidateId,
    evidenceKind: input.kind ?? "metric",
    evidenceRole: input.role,
    evidenceRef: JSON.stringify({ linkId: input.linkId, role: input.role }),
    evidenceWeight: 1,
    note: null,
  });
}

function coverage(input: {
  auditId: string;
  detectorRunId: string;
  detectorId: string;
  scopeKind: "route" | "segment" | "corridor" | "system";
  scopeId: string;
  outcome?: "hit" | "clean_no_hit" | "skipped_missing_input" | "skipped_failed_join" | "source_lag";
}): FindingCoverageAudit {
  return FindingCoverageAuditSchema.parse({
    auditId: input.auditId,
    detectorRunId: input.detectorRunId,
    detectorId: input.detectorId,
    month,
    scopeKind: input.scopeKind,
    scopeId: input.scopeId,
    outcome: input.outcome ?? "hit",
    reasonCode: "persistent_low_speed",
    reason: null,
    inputsSeenJson: "{}",
    inputsExpectedJson: "{}",
    createdAt: generatedAt,
  });
}

function build(input: {
  candidates: FindingCandidate[];
  evidenceLinks: FindingEvidenceLink[];
  coverageRows: FindingCoverageAudit[];
  existingPacketIdsByCandidateId?: ReadonlyMap<string, string>;
}) {
  return buildReviewPacketArtifacts({
    month,
    generatedAt,
    detectorSpecsArtifactPath: "data/artifacts/findings/detector-specs.json",
    reviewPacketsArtifactPath: "data/artifacts/findings/2026-03/review-packets.json",
    promotionQueueArtifactPath: "data/artifacts/findings/2026-03/promotion-queue.json",
    coverageArtifactPath: "data/artifacts/findings/2026-03/review-packet-coverage.json",
    candidates: input.candidates,
    evidenceLinks: input.evidenceLinks,
    coverageRows: input.coverageRows,
    ...(input.existingPacketIdsByCandidateId === undefined
      ? {}
      : { existingPacketIdsByCandidateId: input.existingPacketIdsByCandidateId }),
  });
}

describe("review packet artifacts", () => {
  test("builds packets and queues for multiple detector families", () => {
    const persistent = candidate({
      candidateId: "c-persistent",
      detectorId: "persistent_speed_hotspot",
      detectorRunId: "persistent_speed_hotspot-2026-03-test",
      scopeKind: "segment",
      scopeId: "M15:0:s1:s2",
      routeId: "M15",
      category: "speed",
      detectorScore: 88,
      reasonCode: "persistent_low_speed",
    });
    const speedPace = candidate({
      candidateId: "c-speed-pace",
      detectorId: "speed_pace_hotspot",
      detectorRunId: "speed_pace_hotspot-2026-03-test",
      scopeKind: "segment",
      scopeId: "M14:1:s4:s5",
      routeId: "M14",
      category: "speed",
      detectorScore: 91,
      reasonCode: "slow_pace_hotspot",
    });

    const artifacts = build({
      candidates: [persistent, speedPace],
      evidenceLinks: [
        evidence({ linkId: "e1", candidateId: persistent.candidateId, role: "primary" }),
        evidence({ linkId: "e2", candidateId: persistent.candidateId, role: "counter_evidence" }),
        evidence({ linkId: "e3", candidateId: speedPace.candidateId, role: "primary" }),
        evidence({ linkId: "e4", candidateId: speedPace.candidateId, role: "counter_evidence" }),
      ],
      coverageRows: [
        coverage({
          auditId: "a1",
          detectorRunId: persistent.detectorRunId,
          detectorId: persistent.detectorId,
          scopeKind: persistent.scopeKind,
          scopeId: persistent.scopeId,
        }),
        coverage({
          auditId: "a2",
          detectorRunId: speedPace.detectorRunId,
          detectorId: speedPace.detectorId,
          scopeKind: speedPace.scopeKind,
          scopeId: speedPace.scopeId,
        }),
      ],
      existingPacketIdsByCandidateId: new Map([[persistent.candidateId, "old-packet-id"]]),
    });

    expect(artifacts.detectorSpecs.detectorCount).toBe(ANALYTICS_DETECTOR_REGISTRY.length);
    expect(artifacts.reviewPackets.packetCount).toBe(2);
    expect(
      artifacts.reviewPackets.summary.detectorCounts[DetectorIdSchema.parse("speed_pace_hotspot")],
    ).toBe(1);
    const persistentPacket = artifacts.reviewPackets.packets.find(
      (packet) => packet.candidate.candidateId === persistent.candidateId,
    );
    expect(persistentPacket?.packetId).toBe("old-packet-id");
    expect(persistentPacket?.reviewContext?.summary).toContain("persistent_speed_hotspot");
    expect(artifacts.promotionQueue.summary.readyForReviewCount).toBe(2);
    expect(artifacts.reviewQueue.totalCandidateCount).toBe(2);
    expect(artifacts.reviewQueue.candidates[0]?.evidenceRefCount).toBe(2);
    expect(
      artifacts.coverage.detectors.find((detector) => detector.detectorId === "speed_pace_hotspot")
        ?.status,
    ).toBe("complete");
  });

  test("marks partial packets when counter-evidence or coverage is missing", () => {
    const observed = candidate({
      candidateId: "c-observed",
      detectorId: "observed_reliability",
      detectorRunId: "observed_reliability-2026-03-test",
      scopeKind: "route",
      scopeId: "M15",
      routeId: "M15",
      category: "reliability",
      detectorScore: 77,
      reasonCode: "high_long_gap_share",
    });

    const artifacts = build({
      candidates: [observed],
      evidenceLinks: [
        evidence({ linkId: "e1", candidateId: observed.candidateId, role: "primary" }),
      ],
      coverageRows: [],
    });

    expect(artifacts.reviewPackets.summary.candidatesWithoutCounterEvidence).toBe(1);
    expect(artifacts.promotionQueue.summary.blockedCount).toBe(1);
    const observedCoverage = artifacts.coverage.detectors.find(
      (detector) => detector.detectorId === "observed_reliability",
    );
    expect(observedCoverage?.status).toBe("partial");
    expect(observedCoverage?.packetsWithoutCounterEvidence).toBe(1);
    expect(observedCoverage?.packetsWithoutCoverage).toBe(1);
  });

  test("waives counter-evidence for source_gap data-quality packets", () => {
    const sourceGap = candidate({
      candidateId: "c-source-gap",
      detectorId: "source_gap",
      detectorRunId: "source_gap-2026-03-test",
      scopeKind: "route",
      scopeId: "M15",
      routeId: "M15",
      category: "data_quality",
      detectorScore: 90,
      reasonCode: "missing_speed",
    });

    const artifacts = build({
      candidates: [sourceGap],
      evidenceLinks: [
        evidence({
          linkId: "e1",
          candidateId: sourceGap.candidateId,
          role: "missing_data",
          kind: "missing_data",
        }),
      ],
      coverageRows: [
        coverage({
          auditId: "a1",
          detectorRunId: sourceGap.detectorRunId,
          detectorId: sourceGap.detectorId,
          scopeKind: sourceGap.scopeKind,
          scopeId: sourceGap.scopeId,
          outcome: "hit",
        }),
      ],
    });

    const gapCoverage = artifacts.coverage.detectors.find(
      (detector) => detector.detectorId === "source_gap",
    );
    expect(gapCoverage?.status).toBe("complete");
    expect(gapCoverage?.packetsWithoutCounterEvidence).toBe(0);
  });

  test("adds treatment-scope reviewer context from parsed evidence objects", () => {
    const treatment = candidate({
      candidateId: "c-treatment-scope",
      detectorId: "treatment_scope_mismatch",
      detectorRunId: "treatment_scope_mismatch-2026-03-test",
      scopeKind: "segment",
      scopeId: "M96:2026-03:W:10:401965:903004",
      routeId: "M96",
      category: "intervention",
      detectorScore: 90,
      reasonCode: "bus_lane_slow_segment",
    });

    const artifacts = build({
      candidates: [treatment],
      evidenceLinks: [
        FindingEvidenceLinkSchema.parse({
          linkId: "e-primary",
          candidateId: treatment.candidateId,
          evidenceKind: "metric",
          evidenceRole: "primary",
          evidenceRef: JSON.stringify({
            routeId: "M96",
            averageSpeedMph: 4.9,
            observationCount: 90,
            busTripCount: 300,
            overlapShare: 0.7,
            matchMethod: "route_shape_overlap",
            treatmentStatus: "current_confirmed",
            treatmentSourceRefs: ["bus-lane-segment:M96"],
          }),
          evidenceWeight: 1,
          note: null,
        }),
        FindingEvidenceLinkSchema.parse({
          linkId: "e-context",
          candidateId: treatment.candidateId,
          evidenceKind: "metric",
          evidenceRole: "context",
          evidenceRef: JSON.stringify({
            slowestDaypart: "am_peak",
            slowestDaypartAverageSpeedMph: 4.3,
            routePeerContext: {
              speedRankAscending: 1,
              segmentCount: 20,
              medianSegmentSpeedMph: 7.2,
              slownessPercentile: 1,
            },
            networkPeerContext: {
              speedRankAscending: 100,
              segmentCount: 4000,
              medianSegmentSpeedMph: 8.1,
              slownessPercentile: 0.98,
            },
          }),
          evidenceWeight: 0.8,
          note: null,
        }),
        evidence({
          linkId: "e-counter",
          candidateId: treatment.candidateId,
          role: "counter_evidence",
        }),
        // S5.4: agency-record evidence the publication wording depends on -> official_context,
        // split out from generic associational context.
        evidence({
          linkId: "e-official",
          candidateId: treatment.candidateId,
          role: "official_context",
          kind: "source_doc",
        }),
      ],
      coverageRows: [
        coverage({
          auditId: "a-treatment",
          detectorRunId: treatment.detectorRunId,
          detectorId: treatment.detectorId,
          scopeKind: treatment.scopeKind,
          scopeId: treatment.scopeId,
        }),
      ],
    });

    const packet = artifacts.reviewPackets.packets[0];
    // S5.4: official_context is its own partition, distinct from generic context.
    expect(packet?.evidence.officialContext.map((link) => link.linkId)).toEqual(["e-official"]);
    expect(packet?.evidence.context.some((link) => link.linkId === "e-official")).toBe(false);
    expect(packet?.evidenceObjects.officialContext).toHaveLength(1);
    expect(packet?.reviewContext?.summary).toContain("bus-lane overlap plus 4.9 mph");
    expect(packet?.reviewContext?.evidenceHighlights).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Route peer context: 1/20 slowest"),
        expect.stringContaining("Slowest daypart: am_peak"),
      ]),
    );
  });
});

describe("review packet local DB rows", () => {
  test("loads candidate, evidence, and coverage rows for one release month", () => {
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE local_finding_candidate (
          candidate_id TEXT PRIMARY KEY,
          detector_id TEXT NOT NULL,
          detector_run_id TEXT NOT NULL,
          month TEXT NOT NULL,
          scope_kind TEXT NOT NULL,
          scope_id TEXT NOT NULL,
          route_id TEXT,
          physical_id TEXT,
          category TEXT NOT NULL,
          severity TEXT NOT NULL,
          confidence TEXT NOT NULL,
          detector_score REAL NOT NULL,
          reason_code TEXT NOT NULL,
          claim_safe_label TEXT NOT NULL,
          claim_text TEXT NOT NULL,
          status TEXT NOT NULL,
          review_state TEXT NOT NULL,
          window_start TEXT,
          window_end TEXT,
          created_at TEXT NOT NULL
        );
        CREATE TABLE local_finding_evidence_link (
          link_id TEXT PRIMARY KEY,
          candidate_id TEXT NOT NULL,
          evidence_kind TEXT NOT NULL,
          evidence_role TEXT NOT NULL,
          evidence_ref TEXT NOT NULL,
          evidence_weight REAL,
          note TEXT
        );
        CREATE TABLE local_finding_coverage_audit (
          audit_id TEXT PRIMARY KEY,
          detector_run_id TEXT NOT NULL,
          detector_id TEXT NOT NULL,
          month TEXT NOT NULL,
          scope_kind TEXT NOT NULL,
          scope_id TEXT NOT NULL,
          outcome TEXT NOT NULL,
          reason_code TEXT,
          reason TEXT,
          inputs_seen_json TEXT,
          inputs_expected_json TEXT,
          created_at TEXT NOT NULL
        );
      `);
      sqlite
        .query(
          `
            INSERT INTO local_finding_candidate (
              candidate_id,
              detector_id,
              detector_run_id,
              month,
              scope_kind,
              scope_id,
              route_id,
              physical_id,
              category,
              severity,
              confidence,
              detector_score,
              reason_code,
              claim_safe_label,
              claim_text,
              status,
              review_state,
              window_start,
              window_end,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          "c-speed",
          "speed_pace_hotspot",
          "speed_pace_hotspot-2026-03-test",
          "2026-03",
          "segment",
          "M15:0:s1:s2",
          "M15",
          null,
          "speed",
          "high",
          "medium",
          91,
          "slow_pace_hotspot",
          "issue_needs_review",
          "M15 segment is slower than peer pace.",
          "open",
          "needs_review",
          "2026-03-01T00:00:00.000Z",
          "2026-03-31T23:59:59.000Z",
          generatedAt,
        );
      sqlite
        .query(
          `
            INSERT INTO local_finding_evidence_link (
              link_id,
              candidate_id,
              evidence_kind,
              evidence_role,
              evidence_ref,
              evidence_weight,
              note
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run("e-speed", "c-speed", "metric", "primary", '{"metric":"pace"}', 1, null);
      sqlite
        .query(
          `
            INSERT INTO local_finding_coverage_audit (
              audit_id,
              detector_run_id,
              detector_id,
              month,
              scope_kind,
              scope_id,
              outcome,
              reason_code,
              reason,
              inputs_seen_json,
              inputs_expected_json,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          "a-speed",
          "speed_pace_hotspot-2026-03-test",
          "speed_pace_hotspot",
          "2026-03",
          "segment",
          "M15:0:s1:s2",
          "hit",
          "slow_pace_hotspot",
          null,
          "{}",
          "{}",
          generatedAt,
        );

      const rows = loadReviewPacketLocalDbRows({ sqlite, month: "2026-03" });

      expect(rows.candidates).toHaveLength(1);
      expect(rows.candidates[0]?.candidateId).toBe("c-speed");
      expect(rows.candidates[0]?.detectorScore).toBe(91);
      expect(rows.evidenceLinks).toHaveLength(1);
      expect(rows.evidenceLinks[0]?.candidateId).toBe("c-speed");
      expect(rows.coverageRows).toHaveLength(1);
      expect(`${rows.coverageRows[0]?.outcome}`).toBe("hit");
    } finally {
      sqlite.close();
    }
  });
});
