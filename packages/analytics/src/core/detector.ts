import type {
  DetectorId,
  FindingCandidate,
  FindingCoverageAudit,
  FindingDetectorSpec,
  FindingEvidenceLink,
} from "@bp/domain";

export type DetectorOutput = {
  candidates: FindingCandidate[];
  evidence: FindingEvidenceLink[];
  coverage: FindingCoverageAudit[];
};

export type AnalyticsDetectorScopeKind = "route" | "segment" | "corridor" | "system";

export type AnalyticsDetectorScope = {
  kind: AnalyticsDetectorScopeKind;
  description: string;
};

export type AnalyticsDetector<TInput> = {
  detectorId: DetectorId;
  version: string;
  spec: FindingDetectorSpec;
  featureGrains: readonly string[];
  scope: AnalyticsDetectorScope;
  run(input: TInput): DetectorOutput;
};
