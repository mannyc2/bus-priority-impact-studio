export type RuntimeDeviation = {
  ratio: number | null;
  signedPercent: number | null;
};

export function bufferIndex(
  observedRuntimeP50Minutes: number | null,
  observedRuntimeP95Minutes: number | null,
): number | null {
  if (observedRuntimeP50Minutes === null || observedRuntimeP95Minutes === null) return null;
  if (!Number.isFinite(observedRuntimeP50Minutes) || observedRuntimeP50Minutes <= 0) return null;
  if (!Number.isFinite(observedRuntimeP95Minutes)) return null;
  if (observedRuntimeP95Minutes < observedRuntimeP50Minutes) return null;
  return (observedRuntimeP95Minutes - observedRuntimeP50Minutes) / observedRuntimeP50Minutes;
}

export function runtimeDeviation(
  observedRuntimeMinutes: number | null,
  scheduledRuntimeMinutes: number | null,
): RuntimeDeviation {
  if (
    observedRuntimeMinutes === null ||
    scheduledRuntimeMinutes === null ||
    !Number.isFinite(observedRuntimeMinutes) ||
    !Number.isFinite(scheduledRuntimeMinutes) ||
    scheduledRuntimeMinutes <= 0
  ) {
    return { ratio: null, signedPercent: null };
  }

  const ratio = observedRuntimeMinutes / scheduledRuntimeMinutes;
  return { ratio, signedPercent: ratio - 1 };
}

export function paceSlownessIndex(
  medianPaceMinutesPerMile: number | null,
  freeFlowPaceMinutesPerMile: number | null,
): number | null {
  if (medianPaceMinutesPerMile === null || freeFlowPaceMinutesPerMile === null) return null;
  if (!Number.isFinite(medianPaceMinutesPerMile) || !Number.isFinite(freeFlowPaceMinutesPerMile)) {
    return null;
  }
  if (medianPaceMinutesPerMile < 0 || freeFlowPaceMinutesPerMile <= 0) return null;
  return medianPaceMinutesPerMile / freeFlowPaceMinutesPerMile;
}

export function positiveDelayComponent(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.max(0, value);
}
