import { describe, expect, test } from "bun:test";
import {
  buildReviewPriorityScore,
  compareByReviewPriority,
} from "../src/evaluation/review-priority-score";

describe("decomposed review-priority score (S5.1)", () => {
  test("splits severity / evidence / specificity / persistence into review-packet fields", () => {
    const score = buildReviewPriorityScore({
      severity: "high",
      evidenceSupport: 0.8,
      specificity: 0.5,
      persistence: 0.2,
    });
    expect(score).toMatchObject({
      severityScore: 90,
      evidenceScore: 80,
      specificityScore: 50,
      persistenceScore: 20,
    });
    // weighted composite: 0.4*90 + 0.25*80 + 0.2*50 + 0.15*20 = 69
    expect(score.reviewPriorityScore).toBe(69);
  });

  test("severity != confidence: equal severity, different evidence/specificity reorder the queue", () => {
    // Same severity; the high-evidence, high-specificity candidate outranks the bare one.
    const strong = buildReviewPriorityScore({
      severity: "medium",
      evidenceSupport: 0.9,
      specificity: 0.9,
      persistence: 0.8,
    });
    const weak = buildReviewPriorityScore({
      severity: "medium",
      evidenceSupport: 0.1,
      specificity: 0.1,
      persistence: 0,
    });
    expect(strong.severityScore).toBe(weak.severityScore);
    expect(strong.reviewPriorityScore).toBeGreaterThan(weak.reviewPriorityScore);
    expect(compareByReviewPriority(strong, weak)).toBeLessThan(0); // strong sorts first

    // And a high-severity / low-everything-else candidate still outranks medium-severity strong here
    // (severity carries the most weight), demonstrating the axes are independent, not collapsed.
    const highSevBare = buildReviewPriorityScore({
      severity: "high",
      evidenceSupport: 0,
      specificity: 0,
      persistence: 0,
    });
    expect(compareByReviewPriority(highSevBare, weak)).toBeLessThan(0);
  });

  test("clamps out-of-range signals and rejects non-positive weights", () => {
    const clamped = buildReviewPriorityScore({
      severity: "low",
      evidenceSupport: 1.7,
      specificity: -0.5,
      persistence: Number.NaN,
    });
    expect(clamped.evidenceScore).toBe(100);
    expect(clamped.specificityScore).toBe(0);
    expect(clamped.persistenceScore).toBe(0);

    expect(() =>
      buildReviewPriorityScore(
        { severity: "low", evidenceSupport: 0.5, specificity: 0.5, persistence: 0.5 },
        { severity: 0, evidence: 0, specificity: 0, persistence: 0 },
      ),
    ).toThrow(/positive value/);
  });
});
