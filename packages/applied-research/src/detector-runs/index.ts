export type { StudyDefinition, StudyRun } from "../core/study";
export {
  assembleDetectorStudyInput,
  assembleDetectorStudySourceRows,
  detectorInputFeatureContractSatisfaction,
  detectorInputFeatureResolverSupport,
  listDetectorInputFeatureResolverIds,
  type DetectorInputAssemblyContext,
  type DetectorInputAssemblyResult,
  type DetectorInputResolverSupport,
} from "./detector-input-assembly";
export {
  DEFAULT_REGISTRY_DETECTOR_STUDY_ID,
  type DetectorStudyCatalogRow,
  type DetectorStudyMetadata,
  type DetectorStudySourceRows,
  detectorModelDependencySatisfaction,
  detectorStudyFeatureContractSatisfaction,
  detectorStudyNeedsRouteTreatmentFeatures,
  detectorStudyNeedsStopDirectionHourFeatures,
  listDetectorStudyCatalogRows,
  type RegistryDetectorStudyResult,
  runRegistryDetectorStudy,
} from "./detector-study";
export {
  buildRegistryDetectorRunArtifact,
  type ContractSatisfaction,
  type DataProductDependency,
  type DetectorOutput,
  type DetectorRunCapAccounting,
  type DetectorRunCapInventoryStatus,
  type DetectorRunCapPolicy,
  type DetectorRunCapPolicyMode,
  type DetectorRunCapRouteBreakdown,
  type ModelArtifactDependency,
  type RegistryDetectorRunArtifact,
} from "./run-artifact";
export {
  buildTreatmentDetectorReviewArtifact,
  DEFAULT_TREATMENT_DETECTOR_REVIEW_THRESHOLDS,
  type TreatmentDetectorReviewArtifact,
  type TreatmentDetectorReviewThresholds,
  type TreatmentReviewCandidate,
  type TreatmentReviewCandidateKind,
  type TreatmentReviewSegmentSpeedRow,
  treatmentDetectorReviewMarkdown,
} from "./treatment-review";
