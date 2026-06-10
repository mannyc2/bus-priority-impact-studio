// Confidence decomposition (S5.2 in docs/research/backend-goal-finish-detectors.md).
//
// Confidence is not a single rhetorical certainty — it decomposes into independent component axes.
// This pure helper records the component fields (review-packet only; a family supplies the components
// it can support and omits the rest) and collapses them to a single published label so the public
// surface stays single-valued. The evaluator can report component completeness (how many of the seven
// axes a family actually populates) as a maturity signal.

export type ConfidenceComponent =
  | "source_sufficiency"
  | "join_confidence"
  | "temporal_alignment"
  | "metric_stability"
  | "peer_context"
  | "counterfactual_strength"
  | "review_readiness";

export const CONFIDENCE_COMPONENTS: readonly ConfidenceComponent[] = [
  "source_sufficiency",
  "join_confidence",
  "temporal_alignment",
  "metric_stability",
  "peer_context",
  "counterfactual_strength",
  "review_readiness",
];

export type ConfidenceComponentScores = Partial<Record<ConfidenceComponent, number>>;

export type ConfidenceLabel = "insufficient" | "low" | "medium" | "high";

export type ConfidenceDecomposition = {
  readonly components: Record<ConfidenceComponent, number | null>;
  readonly presentComponentCount: number;
  readonly componentCompleteness: number;
  readonly aggregateScore: number | null;
  // Single-valued label for the public surface (confidence is not exposed component-by-component).
  readonly publishedLabel: ConfidenceLabel;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round4(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

function labelFor(aggregateScore: number | null): ConfidenceLabel {
  if (aggregateScore === null) return "insufficient";
  if (aggregateScore >= 0.75) return "high";
  if (aggregateScore >= 0.5) return "medium";
  if (aggregateScore >= 0.25) return "low";
  return "insufficient";
}

export function buildConfidenceDecomposition(
  scores: ConfidenceComponentScores,
): ConfidenceDecomposition {
  const components = {} as Record<ConfidenceComponent, number | null>;
  const present: number[] = [];
  for (const component of CONFIDENCE_COMPONENTS) {
    const raw = scores[component];
    if (raw === undefined || raw === null || !Number.isFinite(raw)) {
      components[component] = null;
      continue;
    }
    const value = round4(clamp01(raw));
    components[component] = value;
    present.push(value);
  }

  const aggregateScore =
    present.length === 0
      ? null
      : round4(present.reduce((total, value) => total + value, 0) / present.length);

  return {
    components,
    presentComponentCount: present.length,
    componentCompleteness: round4(present.length / CONFIDENCE_COMPONENTS.length),
    aggregateScore,
    publishedLabel: labelFor(aggregateScore),
  };
}

export type ConfidenceComponentCompletenessRow = {
  readonly component: ConfidenceComponent;
  readonly presentCount: number;
  readonly share: number;
};

/**
 * Evaluator helper: across a set of decomposed packets, report how often each confidence component is
 * actually populated — the S5.2 "component completeness" maturity signal.
 */
export function summarizeConfidenceComponentCompleteness(
  decompositions: readonly ConfidenceDecomposition[],
): {
  readonly packetCount: number;
  readonly byComponent: readonly ConfidenceComponentCompletenessRow[];
  readonly meanComponentCompleteness: number;
} {
  const presentByComponent = new Map<ConfidenceComponent, number>();
  for (const component of CONFIDENCE_COMPONENTS) presentByComponent.set(component, 0);
  for (const decomposition of decompositions) {
    for (const component of CONFIDENCE_COMPONENTS) {
      if (decomposition.components[component] !== null) {
        presentByComponent.set(component, (presentByComponent.get(component) ?? 0) + 1);
      }
    }
  }
  const packetCount = decompositions.length;
  const byComponent = CONFIDENCE_COMPONENTS.map((component) => {
    const presentCount = presentByComponent.get(component) ?? 0;
    return {
      component,
      presentCount,
      share: packetCount === 0 ? 0 : round4(presentCount / packetCount),
    };
  });
  const meanComponentCompleteness =
    packetCount === 0
      ? 0
      : round4(
          decompositions.reduce((total, d) => total + d.componentCompleteness, 0) / packetCount,
        );
  return { packetCount, byComponent, meanComponentCompleteness };
}
