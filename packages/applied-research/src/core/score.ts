export type ResearchQualityComponent =
  | "corpusCoverage"
  | "grainFidelity"
  | "evidenceCompleteness"
  | "reproducibility"
  | "claimDiscipline"
  | "reviewerUtility"
  | "noveltyActionability"
  | "elegance"
  | "maintainability";

export type ResearchQualityComponentScores = Partial<Record<ResearchQualityComponent, number | null>>;

export type VetoCap = {
  readonly code: string;
  readonly cap: number;
  readonly reason: string;
};

export type ResearchScoreBreakdown = {
  readonly weightedScore: number | null;
  readonly gatedScore: number | null;
  readonly knownWeight: number;
  readonly missingComponents: readonly ResearchQualityComponent[];
  readonly vetoCaps: readonly VetoCap[];
};

export const RESEARCH_QUALITY_WEIGHTS = {
  corpusCoverage: 120,
  grainFidelity: 120,
  evidenceCompleteness: 130,
  reproducibility: 100,
  claimDiscipline: 120,
  reviewerUtility: 110,
  noveltyActionability: 100,
  elegance: 100,
  maintainability: 100,
} as const satisfies Record<ResearchQualityComponent, number>;

const COMPONENTS = Object.keys(RESEARCH_QUALITY_WEIGHTS) as ResearchQualityComponent[];

function clampScore(score: number): number {
  if (!Number.isFinite(score)) {
    throw new Error(`Research score must be finite: ${score}`);
  }

  return Math.max(0, Math.min(1000, score));
}

export function normalizeComponentScores(
  scores: ResearchQualityComponentScores,
): Record<ResearchQualityComponent, number | null> {
  return Object.fromEntries(
    COMPONENTS.map((component) => {
      const score = scores[component];
      return [component, score === undefined || score === null ? null : clampScore(score)];
    }),
  ) as Record<ResearchQualityComponent, number | null>;
}

export function applyVetoCaps(score: number | null, vetoCaps: readonly VetoCap[]): number | null {
  if (score === null) {
    return null;
  }

  return vetoCaps.reduce((current, veto) => Math.min(current, clampScore(veto.cap)), score);
}

export function combineResearchQualityScore(params: {
  readonly components: ResearchQualityComponentScores;
  readonly vetoCaps?: readonly VetoCap[];
}): ResearchScoreBreakdown {
  const normalized = normalizeComponentScores(params.components);
  let weightedTotal = 0;
  let knownWeight = 0;
  const missingComponents: ResearchQualityComponent[] = [];

  for (const component of COMPONENTS) {
    const score = normalized[component];
    const weight = RESEARCH_QUALITY_WEIGHTS[component];

    if (score === null) {
      missingComponents.push(component);
      continue;
    }

    weightedTotal += score * weight;
    knownWeight += weight;
  }

  const weightedScore = knownWeight === 0 ? null : Math.round((weightedTotal / knownWeight) * 10) / 10;
  const vetoCaps = params.vetoCaps ?? [];

  return {
    weightedScore,
    gatedScore: applyVetoCaps(weightedScore, vetoCaps),
    knownWeight,
    missingComponents,
    vetoCaps,
  };
}
