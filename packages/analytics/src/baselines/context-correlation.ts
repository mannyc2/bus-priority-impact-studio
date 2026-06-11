import { clamp } from "../core/numbers.js";

export type ContextAssociationScoreInput = {
  performanceSignal: number;
  contextVolumeSignal: number;
  contextQualitySignal: number;
  baseScore?: number;
  scoreSpread?: number;
};

export type ContextSupportInput = {
  touchedEventCount: number;
  highConfidenceTouchCount: number;
  averageMatchWeight: number;
};

export type ContextSupportThresholds = {
  minTouchedEventCount: number;
  minHighConfidenceTouchCount: number;
  minAverageMatchWeight: number;
};

export type ContextSupportResult = {
  supported: boolean;
  reasons: string[];
  qualitySignal: number;
};

export function contextAssociationScore(input: ContextAssociationScoreInput): number {
  const baseScore = input.baseScore ?? 55;
  const scoreSpread = input.scoreSpread ?? 45;
  return Math.round(
    baseScore +
      scoreSpread *
        clamp(
          0.5 * clamp(input.performanceSignal, 0, 1) +
            0.3 * clamp(input.contextVolumeSignal, 0, 1) +
            0.2 * clamp(input.contextQualitySignal, 0, 1),
          0,
          1,
        ),
  );
}

export function contextSupport(
  input: ContextSupportInput,
  thresholds: ContextSupportThresholds,
): ContextSupportResult {
  const reasons: string[] = [];
  if (input.touchedEventCount < thresholds.minTouchedEventCount) reasons.push("low_context_volume");
  const highConfidenceSignal =
    thresholds.minHighConfidenceTouchCount <= 0
      ? 1
      : clamp(input.highConfidenceTouchCount / thresholds.minHighConfidenceTouchCount, 0, 1);
  const matchWeightSignal =
    thresholds.minAverageMatchWeight <= 0
      ? 1
      : clamp(input.averageMatchWeight / thresholds.minAverageMatchWeight, 0, 1);
  const hasQuality =
    input.highConfidenceTouchCount >= thresholds.minHighConfidenceTouchCount ||
    input.averageMatchWeight >= thresholds.minAverageMatchWeight;
  if (!hasQuality) reasons.push("weak_context_join_quality");

  return {
    supported: reasons.length === 0,
    reasons,
    qualitySignal: Math.max(highConfidenceSignal, matchWeightSignal),
  };
}

export function contextAssociationCaveats(sourceKind: string): string[] {
  const caveats = [
    "Context association is not causal evidence.",
    "Spatial joins, route fanout, source freshness, and co-timed events must be reviewed.",
  ];
  if (sourceKind === "311") {
    caveats.push("311 volume can reflect reporting propensity and socioeconomic reporting bias.");
  }
  if (sourceKind === "permit") {
    caveats.push("Permit touches may describe broad street-work context unrelated to bus delay.");
  }
  return caveats;
}
