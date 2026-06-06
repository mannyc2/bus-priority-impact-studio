import { describe, expect, test } from "bun:test";
import { buildEvidenceCorpusAudit } from "../src/evaluation";

describe("evidence corpus audit", () => {
  test("summarizes source, feature, detector, and review queue readiness", () => {
    const audit = buildEvidenceCorpusAudit({
      month: "2026-03",
      generatedAt: "2026-04-01T00:00:00.000Z",
      outputPath: "data/artifacts/audits/evidence-corpus-2026-03.json",
      sourceLedger: {
        sources: [
          {
            evidence: {
              primaryEvidenceAllowed: true,
              automaticPromotionAllowed: true,
              detectorEligibility: "automatic_primary",
            },
          },
          {
            evidence: {
              primaryEvidenceAllowed: false,
              automaticPromotionAllowed: false,
              detectorEligibility: "manual_review_primary",
            },
          },
          {
            evidence: {
              primaryEvidenceAllowed: false,
              automaticPromotionAllowed: false,
              detectorEligibility: "context_only",
            },
          },
        ],
      },
      signalFeatures: {
        summary: {
          featureCount: 12,
          contextTouchedFeatureCount: 5,
          contextSourceCount: 2,
        },
      },
      detectorAudit: {
        detectors: [
          { candidateCount: 3, evidenceCount: 4, coverageCount: 9 },
          { candidateCount: 2, evidenceCount: 1, coverageCount: 7 },
        ],
      },
      reviewQueue: {
        totalCandidateCount: 5,
        candidateCount: 5,
        evidenceLinkedCandidateCount: 5,
        unlinkedCandidateCount: 0,
        omittedCandidateCount: 0,
      },
    });

    expect(audit.status).toBe("pass");
    expect(audit.sources).toMatchObject({
      sourceCount: 3,
      primaryEvidenceAllowedCount: 1,
      automaticPromotionAllowedCount: 1,
      manualReviewPrimaryCount: 1,
      contextOnlyCount: 1,
    });
    expect(audit.detectors).toMatchObject({
      detectorCount: 2,
      candidateCount: 5,
      evidenceCount: 5,
      coverageCount: 16,
    });
    expect(audit.gaps).toEqual([]);
  });

  test("fails when prerequisite artifacts are missing and warns on evidence gaps", () => {
    expect(
      buildEvidenceCorpusAudit({
        month: "2026-03",
        generatedAt: "2026-04-01T00:00:00.000Z",
        outputPath: "out.json",
        sourceLedger: null,
        signalFeatures: null,
        detectorAudit: null,
        reviewQueue: null,
      }).status,
    ).toBe("fail");

    const warning = buildEvidenceCorpusAudit({
      month: "2026-03",
      generatedAt: "2026-04-01T00:00:00.000Z",
      outputPath: "out.json",
      sourceLedger: { sources: [{ evidence: { primaryEvidenceAllowed: false } }] },
      signalFeatures: { summary: { contextSourceCount: 0 } },
      detectorAudit: { detectors: [{ candidateCount: 2, evidenceCount: 0, coverageCount: 2 }] },
      reviewQueue: { unlinkedCandidateCount: 1 },
    });

    expect(warning.status).toBe("warn");
    expect(warning.gaps).toEqual([
      "no source is currently eligible for primary evidence",
      "no context source features were materialized",
      "detector candidates have no evidence links",
      "1 review-queue candidates have no evidence links",
    ]);
  });
});
