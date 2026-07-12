import { monthIndex } from "./panel.ts";

export type StudyGate = {
  readonly status: "pass" | "fail" | "not_applicable";
  readonly reason: string;
};

export function leastSquaresSlope(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const xMean = (values.length - 1) / 2;
  const yMean = values.reduce((sum, value) => sum + value, 0) / values.length;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < values.length; index += 1) {
    const xDelta = index - xMean;
    numerator += xDelta * ((values[index] ?? 0) - yMean);
    denominator += xDelta * xDelta;
  }
  return denominator === 0 ? null : numerator / denominator;
}

export function preTrendGate(input: {
  readonly monthlyDifferencesMph: readonly number[];
  readonly effectMph: number;
}): StudyGate {
  const slope = leastSquaresSlope(input.monthlyDifferencesMph);
  if (slope === null) {
    return { status: "not_applicable", reason: "Fewer than two pre-window differences exist." };
  }
  const observedChange = Math.abs(slope) * 6;
  const threshold = Math.max(0.5 * Math.abs(input.effectMph), 0.25);
  return observedChange > threshold
    ? {
        status: "fail",
        reason: `Six-month pre-trend change ${observedChange.toFixed(3)} mph exceeds ${threshold.toFixed(3)} mph.`,
      }
    : {
        status: "pass",
        reason: `Six-month pre-trend change ${observedChange.toFixed(3)} mph is within ${threshold.toFixed(3)} mph.`,
      };
}

export function placeboInTimeGate(input: {
  readonly placeboEffectMph: number | null;
  readonly ciLowerMph: number;
  readonly ciUpperMph: number;
}): StudyGate {
  if (input.placeboEffectMph === null) {
    return { status: "not_applicable", reason: "The shifted placebo window lacks enough data." };
  }
  const halfWidth = Math.abs(input.ciUpperMph - input.ciLowerMph) / 2;
  return Math.abs(input.placeboEffectMph) > halfWidth
    ? {
        status: "fail",
        reason: `Placebo effect ${input.placeboEffectMph.toFixed(3)} mph exceeds CI half-width ${halfWidth.toFixed(3)} mph.`,
      }
    : {
        status: "pass",
        reason: `Placebo effect ${input.placeboEffectMph.toFixed(3)} mph is within CI half-width ${halfWidth.toFixed(3)} mph.`,
      };
}

export function minimumSampleGate(treatedSegmentCount: number): StudyGate {
  return treatedSegmentCount >= 5
    ? { status: "pass", reason: `${treatedSegmentCount} treated segments survived all windows.` }
    : {
        status: "fail",
        reason: `${treatedSegmentCount} treated segments survived; at least 5 are required.`,
      };
}

export function controlEligibilityGate(candidateSegmentCount: number): StudyGate {
  return candidateSegmentCount >= 20
    ? {
        status: "pass",
        reason: `${candidateSegmentCount} eligible control segments were available.`,
      }
    : {
        status: "fail",
        reason: `${candidateSegmentCount} eligible control segments were available; at least 20 are required.`,
      };
}

export function congestionPricingOverlapGate(input: {
  readonly postMonths: readonly string[];
  readonly boroughs: readonly string[];
}): StudyGate {
  const overlaps =
    input.boroughs.includes("Manhattan") &&
    input.postMonths.some((month) => monthIndex(month) >= monthIndex("2025-01"));
  return overlaps
    ? {
        status: "fail",
        reason: "The post window overlaps congestion pricing for a Manhattan-serving route.",
      }
    : { status: "pass", reason: "The post window does not meet the congestion-pricing flag." };
}

export function queensRedesignOverlapGate(input: {
  readonly routeId: string;
  readonly windowMonths: readonly string[];
}): StudyGate {
  const overlaps =
    input.routeId.startsWith("Q") &&
    input.windowMonths.some(
      (month) =>
        monthIndex(month) >= monthIndex("2025-06") && monthIndex(month) <= monthIndex("2025-12"),
    );
  return overlaps
    ? { status: "fail", reason: "The study window overlaps the 2025 Queens bus redesign." }
    : { status: "pass", reason: "The study window does not meet the Queens-redesign flag." };
}

export function studyDirection(input: {
  readonly effectMph: number;
  readonly ciLowerMph: number;
  readonly ciUpperMph: number;
}): "improved" | "worsened" | "no_detectable_change" {
  if (input.ciLowerMph <= 0 && input.ciUpperMph >= 0) return "no_detectable_change";
  return input.effectMph > 0 ? "improved" : "worsened";
}
