import type { ResearchGrain } from "./grain";
import type { ResearchInputSnapshot, StudyArtifactKind } from "./ports";
import type { ResearchScoreBreakdown } from "./score";
import type { HistoryWindow, IsoMonthString } from "./windows";

export type StudyMethodKind = "detector" | "causal" | "forecast" | "evaluation" | "audit";

export type StudyDefinition = {
  readonly id: string;
  readonly purpose: string;
  readonly methodKind: StudyMethodKind;
  readonly releaseMonth: IsoMonthString;
  readonly historyWindow: HistoryWindow;
  readonly requiredGrains: readonly ResearchGrain[];
  readonly outputArtifacts: readonly StudyArtifactKind[];
};

export type StudyRun = {
  readonly definition: StudyDefinition;
  readonly inputSnapshot: ResearchInputSnapshot;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly score: ResearchScoreBreakdown | null;
  readonly residualRisks: readonly string[];
};

export function createStudyDefinition(definition: StudyDefinition): StudyDefinition {
  if (definition.id.trim() === "") {
    throw new Error("Study definition id is required");
  }
  if (definition.purpose.trim() === "") {
    throw new Error("Study definition purpose is required");
  }
  if (definition.requiredGrains.length === 0) {
    throw new Error("Study definition must declare at least one required grain");
  }
  if (definition.outputArtifacts.length === 0) {
    throw new Error("Study definition must declare at least one output artifact");
  }

  return definition;
}

export function createStudyRun(run: StudyRun): StudyRun {
  if (run.inputSnapshot.snapshotId.trim() === "") {
    throw new Error("Study run input snapshot id is required");
  }

  return run;
}
