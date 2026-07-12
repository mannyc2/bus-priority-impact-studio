import type { SegmentDidEstimate } from "./did.ts";
import { weightedAverage } from "./panel.ts";

export type BootstrapInterval = {
  readonly lowerMph: number;
  readonly upperMph: number;
  readonly iterationCount: number;
  readonly seed: number;
};

export function seedFromString(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function percentile(sorted: readonly number[], probability: number): number | null {
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const lowerValue = sorted[lower];
  const upperValue = sorted[upper];
  if (lowerValue === undefined || upperValue === undefined) return null;
  return lowerValue + (upperValue - lowerValue) * (index - lower);
}

export function bootstrapSegmentDid(input: {
  readonly segments: readonly SegmentDidEstimate[];
  readonly eventId: string;
  readonly iterations?: number | undefined;
}): BootstrapInterval | null {
  if (input.segments.length === 0) return null;
  const iterations = input.iterations ?? 1_000;
  const seed = seedFromString(input.eventId);
  const random = mulberry32(seed);
  const estimates: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sample: SegmentDidEstimate[] = [];
    for (let index = 0; index < input.segments.length; index += 1) {
      const selected = input.segments[Math.floor(random() * input.segments.length)];
      if (selected !== undefined) sample.push(selected);
    }
    const estimate = weightedAverage(
      sample.map((segment) => ({ value: segment.effectMph, weight: segment.preTripCount })),
    );
    if (estimate !== null) estimates.push(estimate);
  }
  estimates.sort((left, right) => left - right);
  const lowerMph = percentile(estimates, 0.025);
  const upperMph = percentile(estimates, 0.975);
  return lowerMph === null || upperMph === null
    ? null
    : { lowerMph, upperMph, iterationCount: iterations, seed };
}
