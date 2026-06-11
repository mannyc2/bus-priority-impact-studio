import { describe, expect, test } from "bun:test";
import { curbFrictionTaxonomyAgreementAuditPath } from "../src/artifacts";
import {
  buildCurbFrictionTaxonomyAgreementAudit,
  type CurbFrictionTaxonomyAgreementInputRow,
} from "../src/evaluation";

describe("curb-friction taxonomy agreement audit", () => {
  test("builds an N>=50 hand-check agreement artifact", () => {
    const rows: CurbFrictionTaxonomyAgreementInputRow[] = Array.from(
      { length: 50 },
      (_, index) => ({
        uniqueKey: `311-${String(index + 1).padStart(2, "0")}`,
        complaintType: "Illegal Parking",
        descriptor: index === 49 ? "Blocked Hydrant" : "Double Parked Blocking Traffic",
        expectedCategory: index === 49 ? "blocked_hydrant" : "double_parking",
        actualCategory: index === 49 ? null : "double_parking",
        physicalId: `physical-${index + 1}`,
        routeIds: index === 49 ? ["M15", "M101", "M102", "M103"] : ["M15"],
        routeFanout: index === 49 ? 4 : 1,
        maxOverlapMeters: index === 49 ? 12.5 : 42.5,
        segmentBorough: "Manhattan",
        expectedJoinConfidence: index === 49 ? "medium" : "high",
        actualJoinConfidence: index === 49 ? "low" : "high",
        joinReviewNote:
          index === 49
            ? "Reviewer marked this segment join as ambiguous despite a source match."
            : "Reviewer accepted the segment join.",
        reviewer: "fixture-reviewer",
        reviewedAt: "2026-06-11T00:00:00.000Z",
      }),
    );

    const audit = buildCurbFrictionTaxonomyAgreementAudit({
      rows,
      generatedAt: "2026-06-11T00:00:00.000Z",
    });

    expect(audit).toMatchObject({
      artifactKind: "311_curb_friction_taxonomy_agreement_audit",
      schemaVersion: 1,
      generatedAt: "2026-06-11T00:00:00.000Z",
      minimumSampleSize: 50,
      sampleSize: 50,
      agreementCount: 49,
      agreementRate: 0.98,
      categoryAgreementCount: 49,
      categoryAgreementRate: 0.98,
      joinEvaluableCount: 50,
      joinAgreementCount: 49,
      joinAgreementRate: 0.98,
    });
    expect(audit.rows[49]).toMatchObject({
      uniqueKey: "311-50",
      expectedCategory: "blocked_hydrant",
      actualCategory: null,
      expectedJoinConfidence: "medium",
      actualJoinConfidence: "low",
      categoryAgrees: false,
      joinAgrees: false,
      agrees: false,
    });
  });

  test("rejects undersized hand-check samples", () => {
    expect(() =>
      buildCurbFrictionTaxonomyAgreementAudit({
        rows: [
          {
            uniqueKey: "311-1",
            complaintType: "Illegal Parking",
            descriptor: "Blocked Hydrant",
            expectedCategory: "blocked_hydrant",
            actualCategory: "blocked_hydrant",
          },
        ],
      }),
    ).toThrow("requires at least 50 hand-checked rows");
  });

  test("excludes non-evaluable joins from the join agreement denominator", () => {
    const audit = buildCurbFrictionTaxonomyAgreementAudit({
      minimumSampleSize: 1,
      rows: [
        {
          uniqueKey: "311-1",
          complaintType: "Illegal Parking",
          descriptor: "Posted Parking Sign Violation",
          expectedCategory: null,
          actualCategory: null,
          expectedJoinConfidence: "not_evaluable",
          actualJoinConfidence: "not_evaluable",
        },
      ],
      generatedAt: "2026-06-11T00:00:00.000Z",
    });

    expect(audit).toMatchObject({
      joinEvaluableCount: 0,
      joinAgreementCount: 0,
      joinAgreementRate: null,
    });
    expect(audit.rows[0]?.joinAgrees).toBeNull();
  });

  test("owns the taxonomy agreement audit path", () => {
    expect(curbFrictionTaxonomyAgreementAuditPath("data/artifacts")).toBe(
      "data/artifacts/context-events/311-curb-friction-taxonomy-agreement.json",
    );
  });
});
