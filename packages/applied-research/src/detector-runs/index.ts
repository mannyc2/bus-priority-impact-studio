export type { StudyDefinition, StudyRun } from "../core/study";
export {
  DEFAULT_REGISTRY_DETECTOR_STUDY_ID,
  type DetectorStudyMetadata,
  type DetectorStudySourceRows,
  detectorStudyNeedsStopDirectionHourFeatures,
  type RegistryDetectorStudyResult,
  runRegistryDetectorStudy,
} from "./detector-study";
export {
  buildRegistryDetectorRunArtifact,
  type ContractSatisfaction,
  type DetectorOutput,
  detectorFeatureContractSatisfaction,
  type RegistryDetectorRunArtifact,
} from "./run-artifact";
