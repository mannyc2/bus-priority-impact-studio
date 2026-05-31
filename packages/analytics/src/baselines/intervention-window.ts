export type InterventionWindowDelta = {
  preValue: number | null;
  postValue: number | null;
  rawDelta: number | null;
  peerDelta: number | null;
  adjustedDelta: number | null;
};

export function interventionWindowDelta(input: {
  preValue: number | null;
  postValue: number | null;
  peerDelta?: number | null;
}): InterventionWindowDelta {
  const rawDelta =
    input.preValue === null || input.postValue === null ? null : input.postValue - input.preValue;
  return {
    preValue: input.preValue,
    postValue: input.postValue,
    rawDelta,
    peerDelta: input.peerDelta ?? null,
    adjustedDelta:
      rawDelta === null || input.peerDelta === null || input.peerDelta === undefined
        ? null
        : rawDelta - input.peerDelta,
  };
}
