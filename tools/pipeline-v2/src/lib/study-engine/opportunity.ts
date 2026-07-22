import type { StudyTreatmentFamily } from "@bp/domain/studio/study";

export const OPPORTUNITY_MIN_GATED_STUDIES = 3;

export type OpportunityTransferStudy = {
  readonly eventKey: string;
  readonly candidateId: string;
  readonly routeId: string;
  readonly treatmentFamily: StudyTreatmentFamily;
  readonly effectPercent: number;
  readonly sourceOccurrenceIds: readonly string[];
};

export type OpportunityTransfer = {
  readonly treatmentFamily: StudyTreatmentFamily;
  readonly effectPercent: number;
  readonly effectFraction: number;
  readonly studyCount: number;
  readonly distinctEventRouteCount: number;
  readonly studies: readonly OpportunityTransferStudy[];
};

export type OpportunityBenchmarkSegment = {
  readonly borough: string;
  readonly lengthMiles: number;
  readonly speedMph: number;
};

export type OpportunityScoreInput = {
  readonly riderExposure: number;
  readonly timeLostPerRiderMinutes: number;
  readonly transferredEffectFraction: number;
};

export type OpportunityRankable = OpportunityScoreInput & {
  readonly routeId: string;
  readonly segmentId: string;
  readonly treatmentFamily: StudyTreatmentFamily;
};

export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error("Median requires at least one value");
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error("Median requires finite values");
  }
  const sorted = [...values].toSorted((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const right = sorted[middle];
  if (right === undefined) throw new Error("Median input disappeared after sorting");
  if (sorted.length % 2 === 1) return right;
  const left = sorted[middle - 1];
  if (left === undefined) throw new Error("Median pair is incomplete");
  return (left + right) / 2;
}

export function buildOpportunityTransfers(
  studies: readonly OpportunityTransferStudy[],
  minimumStudyCount = OPPORTUNITY_MIN_GATED_STUDIES,
): {
  readonly eligible: readonly OpportunityTransfer[];
  readonly insufficientEvidenceFamilies: readonly {
    treatmentFamily: StudyTreatmentFamily;
    studyCount: number;
    distinctEventRouteCount: number;
  }[];
} {
  const byFamily = new Map<StudyTreatmentFamily, OpportunityTransferStudy[]>();
  for (const study of studies) {
    if (!Number.isFinite(study.effectPercent)) {
      throw new Error(`Non-finite all-day effect for ${study.eventKey}`);
    }
    const familyStudies = byFamily.get(study.treatmentFamily) ?? [];
    familyStudies.push(study);
    byFamily.set(study.treatmentFamily, familyStudies);
  }

  const eligible: OpportunityTransfer[] = [];
  const insufficientEvidenceFamilies: Array<{
    treatmentFamily: StudyTreatmentFamily;
    studyCount: number;
    distinctEventRouteCount: number;
  }> = [];
  for (const [treatmentFamily, unsorted] of [...byFamily.entries()].toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const familyStudies = unsorted.toSorted(
      (left, right) =>
        left.eventKey.localeCompare(right.eventKey) || left.routeId.localeCompare(right.routeId),
    );
    const distinctEventRouteCount = new Set(
      familyStudies.map((study) => `${study.eventKey}|${study.routeId}`),
    ).size;
    if (distinctEventRouteCount !== familyStudies.length) {
      throw new Error(`Duplicate event-route transfer study in ${treatmentFamily}`);
    }
    if (familyStudies.length < minimumStudyCount) {
      insufficientEvidenceFamilies.push({
        treatmentFamily,
        studyCount: familyStudies.length,
        distinctEventRouteCount,
      });
      continue;
    }
    const effectPercent = median(familyStudies.map((study) => study.effectPercent));
    eligible.push({
      treatmentFamily,
      effectPercent,
      effectFraction: effectPercent / 100,
      studyCount: familyStudies.length,
      distinctEventRouteCount,
      studies: familyStudies,
    });
  }
  return { eligible, insufficientEvidenceFamilies };
}

/** Fixed bins make "comparable length" deterministic across monthly cuts. */
export function comparableLengthBand(lengthMiles: number): string {
  if (!Number.isFinite(lengthMiles) || lengthMiles <= 0) {
    throw new Error("Comparable-length bands require a positive finite length");
  }
  if (lengthMiles <= 0.25) return "0-0.25mi";
  if (lengthMiles <= 0.5) return "0.25-0.5mi";
  if (lengthMiles <= 1) return "0.5-1mi";
  return "1mi-plus";
}

/** Nearest-rank p75 is deterministic and always returns an observed speed. */
export function percentile75(values: readonly number[]): number {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("p75 requires positive finite speeds");
  }
  const sorted = [...values].toSorted((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * 0.75) - 1);
  const value = sorted[index];
  if (value === undefined) throw new Error("p75 input disappeared after sorting");
  return value;
}

export function buildBoroughLengthBenchmarks(
  segments: readonly OpportunityBenchmarkSegment[],
): ReadonlyMap<string, number> {
  const groups = new Map<string, number[]>();
  for (const segment of segments) {
    if (!Number.isFinite(segment.speedMph) || segment.speedMph <= 0) continue;
    const key = `${segment.borough}|${comparableLengthBand(segment.lengthMiles)}`;
    const values = groups.get(key) ?? [];
    values.push(segment.speedMph);
    groups.set(key, values);
  }
  return new Map(
    [...groups.entries()]
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, values]) => [key, percentile75(values)]),
  );
}

export function segmentTimeLostPerRiderMinutes(input: {
  readonly lengthMiles: number;
  readonly observedSpeedMph: number;
  readonly benchmarkSpeedMph: number;
}): number {
  for (const [label, value] of Object.entries(input)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${label} must be positive and finite`);
    }
  }
  const observedMinutes = (input.lengthMiles / input.observedSpeedMph) * 60;
  const benchmarkMinutes = (input.lengthMiles / input.benchmarkSpeedMph) * 60;
  return Math.max(0, observedMinutes - benchmarkMinutes);
}

/**
 * Public ridership is route-grain. Allocate it by each segment's share of summed
 * observed route trip-time; this is exposure, not a stop-level boarding estimate.
 */
export function apportionRouteRidershipByTripTime(input: {
  readonly routeRidership: number;
  readonly segments: readonly { readonly segmentId: string; readonly tripTimeMinutes: number }[];
}): ReadonlyMap<string, number> {
  if (!Number.isFinite(input.routeRidership) || input.routeRidership < 0) {
    throw new Error("Route ridership must be finite and non-negative");
  }
  const seen = new Set<string>();
  let totalTripTime = 0;
  for (const segment of input.segments) {
    if (seen.has(segment.segmentId)) throw new Error(`Duplicate segment ${segment.segmentId}`);
    seen.add(segment.segmentId);
    if (!Number.isFinite(segment.tripTimeMinutes) || segment.tripTimeMinutes <= 0) {
      throw new Error(`Segment ${segment.segmentId} has invalid trip time`);
    }
    totalTripTime += segment.tripTimeMinutes;
  }
  if (input.segments.length === 0) return new Map();
  if (!Number.isFinite(totalTripTime) || totalTripTime <= 0) {
    throw new Error("Route trip-time denominator must be positive and finite");
  }
  return new Map(
    input.segments.map((segment) => [
      segment.segmentId,
      input.routeRidership * (segment.tripTimeMinutes / totalTripTime),
    ]),
  );
}

export function opportunityScore(input: OpportunityScoreInput): number {
  if (
    !Number.isFinite(input.riderExposure) ||
    input.riderExposure < 0 ||
    !Number.isFinite(input.timeLostPerRiderMinutes) ||
    input.timeLostPerRiderMinutes < 0 ||
    !Number.isFinite(input.transferredEffectFraction)
  ) {
    throw new Error("Opportunity score components must be finite and non-negative where bounded");
  }
  const score =
    input.riderExposure * input.timeLostPerRiderMinutes * input.transferredEffectFraction;
  if (!Number.isFinite(score)) throw new Error("Opportunity score is non-finite");
  return score;
}

export function rankOpportunities<T extends OpportunityRankable>(
  candidates: readonly T[],
): readonly (T & { readonly score: number })[] {
  return candidates
    .map((candidate) => ({ ...candidate, score: opportunityScore(candidate) }))
    .toSorted(
      (left, right) =>
        right.score - left.score ||
        left.routeId.localeCompare(right.routeId) ||
        left.segmentId.localeCompare(right.segmentId) ||
        left.treatmentFamily.localeCompare(right.treatmentFamily),
    );
}
