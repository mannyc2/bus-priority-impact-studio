export type { StudyDefinition, StudyRun } from "../core/study";
export {
  assembleDetectorStudySourceRows,
  type DetectorInputAssemblyContext,
} from "./detector-input-assembly";
export {
  DEFAULT_REGISTRY_DETECTOR_STUDY_ID,
  type DetectorStudyMetadata,
  type DetectorStudySourceRows,
  detectorModelDependencySatisfaction,
  detectorStudyNeedsRouteTreatmentFeatures,
  detectorStudyNeedsStopDirectionHourFeatures,
  type RegistryDetectorStudyResult,
  runRegistryDetectorStudy,
} from "./detector-study";
export {
  buildRegistryDetectorRunArtifact,
  type ContractSatisfaction,
  type DataProductDependency,
  type DetectorOutput,
  detectorFeatureContractSatisfaction,
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
