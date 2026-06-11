import { describe, expect, test } from "bun:test";
import {
  buildConfidenceDecomposition,
  CONFIDENCE_COMPONENTS,
  summarizeConfidenceComponentCompleteness,
} from "../src/evaluation/confidence-decomposition";

describe("confidence decomposition (S5.2)", () => {
  test("records component fields and collapses to a single published label", () => {
    const decomposition = buildConfidenceDecomposition({
      source_sufficiency: 0.9,
      join_confidence: 0.8,
      temporal_alignment: 0.7,
      metric_stability: 0.8,
      // peer_context / counterfactual_strength / review_readiness omitted by this family.
    });
    expect(decomposition.components.source_sufficiency).toBe(0.9);
    expect(decomposition.components.peer_context).toBeNull();
    expect(decomposition.presentComponentCount).toBe(4);
    // mean of present (0.9+0.8+0.7+0.8)/4 = 0.8 -> single published label "high"
    expect(decomposition.aggregateScore).toBe(0.8);
    expect(decomposition.publishedLabel).toBe("high");
  });

  test("published label stays single-valued across the threshold bands", () => {
    expect(buildConfidenceDecomposition({ source_sufficiency: 0.6 }).publishedLabel).toBe("medium");
    expect(buildConfidenceDecomposition({ source_sufficiency: 0.3 }).publishedLabel).toBe("low");
    expect(buildConfidenceDecomposition({ source_sufficiency: 0.1 }).publishedLabel).toBe(
      "insufficient",
    );
    // No components at all -> insufficient, aggregate null, completeness 0.
    const empty = buildConfidenceDecomposition({});
    expect(empty.aggregateScore).toBeNull();
    expect(empty.publishedLabel).toBe("insufficient");
    expect(empty.componentCompleteness).toBe(0);
  });

  test("clamps out-of-range scores and treats non-finite as absent", () => {
    const decomposition = buildConfidenceDecomposition({
      source_sufficiency: 1.6,
      join_confidence: -0.4,
      temporal_alignment: Number.NaN,
    });
    expect(decomposition.components.source_sufficiency).toBe(1);
    expect(decomposition.components.join_confidence).toBe(0);
    expect(decomposition.components.temporal_alignment).toBeNull();
    expect(decomposition.presentComponentCount).toBe(2);
  });

  test("evaluator reports per-component completeness across packets", () => {
    const packets = [
      buildConfidenceDecomposition({ source_sufficiency: 0.8, join_confidence: 0.7 }),
      buildConfidenceDecomposition({ source_sufficiency: 0.6 }),
      buildConfidenceDecomposition({}),
    ];
    const summary = summarizeConfidenceComponentCompleteness(packets);
    expect(summary.packetCount).toBe(3);
    const sourceRow = summary.byComponent.find((row) => row.component === "source_sufficiency");
    expect(sourceRow).toMatchObject({ presentCount: 2, share: 0.6667 });
    const counterfactualRow = summary.byComponent.find(
      (row) => row.component === "counterfactual_strength",
    );
    expect(counterfactualRow?.presentCount).toBe(0);
    expect(summary.byComponent).toHaveLength(CONFIDENCE_COMPONENTS.length);
    // mean completeness: (2/7 + 1/7 + 0)/3
    expect(summary.meanComponentCompleteness).toBeCloseTo(0.1429, 3);
  });
});
