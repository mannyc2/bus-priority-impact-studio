export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function mergeThresholds<T extends Record<string, unknown>>(
  defaults: T,
  overrides: Partial<T> | undefined,
): T {
  return {
    ...defaults,
    ...(overrides ?? {}),
  };
}
