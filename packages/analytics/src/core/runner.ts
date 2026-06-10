import type { AnalyticsDetector, DetectorOutput } from "./detector.js";

export type FeatureResolutionStatus =
  | "resolved"
  | "satisfied_by_feature_quality"
  | "unsupported";

export type FeatureContractSatisfaction = {
  readonly featureGrain: string;
  readonly resolverId: string;
  readonly status: FeatureResolutionStatus;
  readonly reason: string;
};

export type FeatureResolverScope = {
  readonly kind: "route" | "segment" | "corridor" | "system";
  readonly scopeId: string | null;
};

export type AnalyticsDetectorRunContext = {
  readonly detectorRunId: string;
  readonly month: string;
  readonly generatedAt: string;
  readonly scope?: FeatureResolverScope;
};

export type FeatureResolverRequest<TInput> = {
  readonly detector: AnalyticsDetector<TInput>;
  readonly featureGrains: readonly string[];
  readonly context: AnalyticsDetectorRunContext;
};

export type FeatureResolverResult<TInput> = {
  readonly detectorInput: TInput;
  readonly inputSummary?: Record<string, unknown>;
  readonly featureContracts: readonly FeatureContractSatisfaction[];
};

export type FeatureResolver<TInput = unknown> = {
  readonly resolverId: string;
  resolve(request: FeatureResolverRequest<TInput>): FeatureResolverResult<TInput>;
};

export type AnalyticsDetectorRunResult = {
  readonly output: DetectorOutput;
  readonly inputSummary: Record<string, unknown>;
  readonly featureContracts: FeatureContractSatisfaction[];
};

export function runAnalyticsDetector<TInput>(input: {
  readonly detector: AnalyticsDetector<TInput>;
  readonly resolver: FeatureResolver<TInput>;
  readonly context: AnalyticsDetectorRunContext;
}): AnalyticsDetectorRunResult {
  const resolved = input.resolver.resolve({
    detector: input.detector,
    featureGrains: input.detector.featureGrains,
    context: input.context,
  });
  const reportedGrains = new Set(
    resolved.featureContracts.map((contract) => contract.featureGrain)
  );
  const missingGrains = input.detector.featureGrains.filter(
    (featureGrain) => !reportedGrains.has(featureGrain)
  );
  if (missingGrains.length > 0) {
    throw new Error(
      `Feature resolver ${input.resolver.resolverId} did not report satisfaction for detector ${input.detector.detectorId} grain(s): ${missingGrains.join(", ")}`
    );
  }

  return {
    output: input.detector.run(resolved.detectorInput),
    inputSummary: resolved.inputSummary ?? {},
    featureContracts: [...resolved.featureContracts],
  };
}
