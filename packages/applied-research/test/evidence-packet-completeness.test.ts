import { describe, expect, test } from "bun:test";
import { buildEvidencePacketCompleteness } from "../src/evaluation/evidence-packet-completeness";

describe("evidence-packet completeness (S5.3)", () => {
  test("reports per-family maturity, bare hits, and section shares", () => {
    const candidates = [
      // mature: primary + counter-evidence
      { candidateId: "c1", detectorId: "schedule_mismatch" },
      // bare hit: primary only -> not mature
      { candidateId: "c2", detectorId: "schedule_mismatch" },
      // primary + missing-evidence (no counter) -> not mature, not a bare hit
      { candidateId: "c3", detectorId: "source_gap" },
    ];
    const evidence = [
      { candidateId: "c1", evidenceRole: "primary" },
      { candidateId: "c1", evidenceRole: "counter_evidence" },
      { candidateId: "c2", evidenceRole: "primary" },
      { candidateId: "c3", evidenceRole: "missing_data" },
    ];

    const report = buildEvidencePacketCompleteness({
      generatedAt: "2026-06-10T00:00:00.000Z",
      candidates,
      evidence,
    });

    expect(report.summary).toMatchObject({
      candidateCount: 3,
      withPrimaryCount: 2,
      withCounterEvidenceCount: 1,
      withMissingEvidenceCount: 1,
      matureCount: 1,
      bareHitCount: 1,
    });
    expect(report.summary.matureShare).toBeCloseTo(1 / 3, 4);

    const byDetector = new Map(report.byDetector.map((family) => [family.detectorId, family]));
    expect(byDetector.get("schedule_mismatch")).toMatchObject({
      candidateCount: 2,
      matureCount: 1,
      bareHitCount: 1,
      counterEvidenceShare: 0.5,
    });
    expect(byDetector.get("source_gap")).toMatchObject({
      candidateCount: 1,
      matureCount: 0,
      bareHitCount: 0,
      withMissingEvidenceCount: 1,
    });
    // thresholds are reported, not enforced.
    expect(report.thresholds.minCounterEvidenceShare).toBe(0.9);
  });

  test("empty input yields zeroed shares (no division by zero)", () => {
    const report = buildEvidencePacketCompleteness({
      generatedAt: "2026-06-10T00:00:00.000Z",
      candidates: [],
      evidence: [],
    });
    expect(report.summary).toMatchObject({
      candidateCount: 0,
      matureShare: 0,
      counterEvidenceShare: 0,
    });
    expect(report.byDetector).toEqual([]);
  });
});
