import {
  type CorpusProfile,
  type CorpusProfileObservation,
  summarizeCorpusProfile,
} from "@bp/analytics/corpus";

export type AnalyticsCorpusProfileArtifact = CorpusProfile & {
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  doctrine: {
    releaseMonthUse: string;
    historicalCorpusUse: string;
  };
};

export type BuildAnalyticsCorpusProfileInput = {
  releaseMonth: string;
  historyStartMonth: string;
  observations: readonly CorpusProfileObservation[];
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  minHistoricalMonths?: number;
};

export function buildAnalyticsCorpusProfile(
  input: BuildAnalyticsCorpusProfileInput,
): AnalyticsCorpusProfileArtifact {
  const profile = summarizeCorpusProfile({
    releaseMonth: input.releaseMonth,
    historyStartMonth: input.historyStartMonth,
    observations: input.observations,
    ...(input.minHistoricalMonths === undefined
      ? {}
      : { minHistoricalMonths: input.minHistoricalMonths }),
  });

  return {
    ...profile,
    generatedAt: input.generatedAt,
    dbPath: input.dbPath,
    artifactPath: input.artifactPath,
    doctrine: {
      releaseMonthUse:
        "Use the release month as the public serving snapshot and current evidence scope.",
      historicalCorpusUse:
        "Use the historical window for baselines, calibration, trend context, false-positive analysis, and detector idea generation.",
    },
  };
}
