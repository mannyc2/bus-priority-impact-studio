import type { ResearchGrain } from "./grain";
import type { IsoMonthString } from "./windows";

export type StudyArtifactKind =
  | "research-study-manifest"
  | "detector-run-artifact"
  | "review-packet-bundle"
  | "detector-score-vectors"
  | "detector-evaluation"
  | "causal-panel"
  | "intervention-association-study"
  | "forecast-backtest";

export type ArtifactManifestEntry = {
  readonly artifactKind: StudyArtifactKind;
  readonly artifactId: string;
  readonly pathHint: string | null;
  readonly grain: ResearchGrain | null;
  readonly month: IsoMonthString | null;
};

export type ResearchInputSnapshot = {
  readonly snapshotId: string;
  readonly createdAt: string;
  readonly products: readonly string[];
  readonly artifactRefs: readonly ArtifactManifestEntry[];
};

export type ResearchPort<TInput, TOutput> = {
  readonly id: string;
  readonly load: (input: TInput) => Promise<TOutput>;
};
