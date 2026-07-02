import { percentile } from "../concentration.js";

export type BootstrapMeanIntervalInput = {
  values: readonly number[];
  resamples: number;
  confidenceLevel: number;
  seed: number;
};

export type BootstrapMeanInterval = {
  estimate: number | null;
  lower: number | null;
  upper: number | null;
  resamples: number;
  confidenceLevel: number;
  seed: number;
};

function finiteValues(values: readonly number[]): number[] {
  return values.filter((value) => Number.isFinite(value));
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function nextRandom(seed: number): [number, number] {
  const nextSeed = (1664525 * seed + 1013904223) >>> 0;
  return [nextSeed, nextSeed / 0x1_0000_0000];
}

function requiredValue(values: readonly number[], index: number): number {
  const value = values[index];
  if (value === undefined) throw new Error(`Missing bootstrap value at index ${index}.`);
  return value;
}

export function bootstrapMeanInterval(input: BootstrapMeanIntervalInput): BootstrapMeanInterval {
  const values = finiteValues(input.values);
  if (values.length === 0 || input.resamples <= 0) {
    return {
      estimate: mean(values),
      lower: null,
      upper: null,
      resamples: input.resamples,
      confidenceLevel: input.confidenceLevel,
      seed: input.seed,
    };
  }

  let seed = input.seed >>> 0;
  const means: number[] = [];
  for (let sampleIndex = 0; sampleIndex < input.resamples; sampleIndex += 1) {
    let sampleTotal = 0;
    for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
      const next = nextRandom(seed);
      seed = next[0];
      sampleTotal += requiredValue(values, Math.floor(next[1] * values.length));
    }
    means.push(sampleTotal / values.length);
  }

  const tail = Math.max(0, Math.min(1, (1 - input.confidenceLevel) / 2));
  return {
    estimate: mean(values),
    lower: percentile(means, tail),
    upper: percentile(means, 1 - tail),
    resamples: input.resamples,
    confidenceLevel: input.confidenceLevel,
    seed: input.seed,
  };
}
