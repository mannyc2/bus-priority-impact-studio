import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { buildDetectorCoverageAuditArtifact } from "../src/evaluation";
import { loadDetectorCoverageAuditLocalDbRows } from "../src/local-db";

describe("detector coverage audit", () => {
  test("summarizes candidates, evidence, coverage outcomes, reasons, and top candidates", () => {
    const artifact = buildDetectorCoverageAuditArtifact({
      month: "2026-03",
      generatedAt: "2026-06-01T00:00:00.000Z",
      candidateSummaries: [
        { detector_id: "speed_pace_hotspot", candidate_count: 2 },
        { detector_id: "persistent_speed_hotspot", candidate_count: 1 },
      ],
      evidenceSummaries: [{ detector_id: "speed_pace_hotspot", evidence_count: 4 }],
      coverageSummaries: [
        {
          detector_id: "speed_pace_hotspot",
          outcome: "hit",
          reason_code: null,
          coverage_count: 2,
        },
        {
          detector_id: "speed_pace_hotspot",
          outcome: "skipped_missing_input",
          reason_code: "insufficient_speed_observations",
          coverage_count: 3,
        },
      ],
      candidateReasonSummaries: [
        {
          detector_id: "speed_pace_hotspot",
          reason_code: "slow_pace_hotspot",
          candidate_count: 2,
        },
      ],
      topCandidatesByDetectorId: new Map([
        [
          "speed_pace_hotspot",
          [
            {
              candidate_id: "candidate-1",
              detector_id: "speed_pace_hotspot",
              route_id: "M15",
              scope_kind: "segment",
              scope_id: "M15:0:1",
              reason_code: "slow_pace_hotspot",
              severity: "high",
              confidence: "medium",
              detector_score: 91,
              claim_safe_label: "issue_needs_review",
              claim_text: "Segment is slow.",
            },
          ],
        ],
      ]),
    });

    expect(artifact.detectorCount).toBe(2);
    const speed = artifact.detectors.find(
      (detector) => detector.detectorId === "speed_pace_hotspot",
    );
    expect(speed?.candidateCount).toBe(2);
    expect(speed?.evidenceCount).toBe(4);
    expect(speed?.coverageCount).toBe(5);
    expect(speed?.outcomeCounts).toEqual({ hit: 2, skipped_missing_input: 3 });
    expect(speed?.reasonCounts).toEqual({ insufficient_speed_observations: 3 });
    expect(speed?.candidateReasonCounts).toEqual({ slow_pace_hotspot: 2 });
    expect(speed?.topCandidates[0]?.candidateId).toBe("candidate-1");
  });

  test("loads detector coverage audit summaries from local SQLite", () => {
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE local_finding_candidate (
          candidate_id TEXT PRIMARY KEY,
          detector_id TEXT NOT NULL,
          month TEXT NOT NULL,
          route_id TEXT,
          scope_kind TEXT NOT NULL,
          scope_id TEXT NOT NULL,
          reason_code TEXT NOT NULL,
          severity TEXT NOT NULL,
          confidence TEXT NOT NULL,
          detector_score REAL NOT NULL,
          claim_safe_label TEXT NOT NULL,
          claim_text TEXT NOT NULL
        );
        CREATE TABLE local_finding_evidence_link (
          link_id TEXT PRIMARY KEY,
          candidate_id TEXT NOT NULL
        );
        CREATE TABLE local_finding_coverage_audit (
          audit_id TEXT PRIMARY KEY,
          detector_id TEXT NOT NULL,
          month TEXT NOT NULL,
          outcome TEXT NOT NULL,
          reason_code TEXT
        );
      `);
      sqlite
        .query(
          `
            INSERT INTO local_finding_candidate (
              candidate_id,
              detector_id,
              month,
              route_id,
              scope_kind,
              scope_id,
              reason_code,
              severity,
              confidence,
              detector_score,
              claim_safe_label,
              claim_text
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          "candidate-1",
          "speed_pace_hotspot",
          "2026-03",
          "M15",
          "segment",
          "M15:0:1",
          "slow_pace_hotspot",
          "high",
          "medium",
          91,
          "issue_needs_review",
          "Segment is slow.",
        );
      sqlite
        .query("INSERT INTO local_finding_evidence_link (link_id, candidate_id) VALUES (?, ?)")
        .run("e-1", "candidate-1");
      sqlite
        .query(
          `
            INSERT INTO local_finding_coverage_audit (
              audit_id,
              detector_id,
              month,
              outcome,
              reason_code
            ) VALUES (?, ?, ?, ?, ?)
          `,
        )
        .run(
          "a-1",
          "speed_pace_hotspot",
          "2026-03",
          "skipped_missing_input",
          "insufficient_speed_observations",
        );

      const rows = loadDetectorCoverageAuditLocalDbRows({ sqlite, month: "2026-03" });

      expect(rows.candidateSummaries).toEqual([
        { detector_id: "speed_pace_hotspot", candidate_count: 1 },
      ]);
      expect(rows.evidenceSummaries).toEqual([
        { detector_id: "speed_pace_hotspot", evidence_count: 1 },
      ]);
      expect(rows.coverageSummaries).toEqual([
        {
          detector_id: "speed_pace_hotspot",
          outcome: "skipped_missing_input",
          reason_code: "insufficient_speed_observations",
          coverage_count: 1,
        },
      ]);
      expect(rows.candidateReasonSummaries).toEqual([
        {
          detector_id: "speed_pace_hotspot",
          reason_code: "slow_pace_hotspot",
          candidate_count: 1,
        },
      ]);
      expect(rows.topCandidatesByDetectorId.get("speed_pace_hotspot")?.[0]?.candidate_id).toBe(
        "candidate-1",
      );
    } finally {
      sqlite.close();
    }
  });
});
