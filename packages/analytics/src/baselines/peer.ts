import { median } from "../concentration.js";

export type PeerBaselineObservation = {
  scopeId: string;
  value: number | null;
};

export type PeerBaseline = {
  peerCount: number;
  peerMedian: number | null;
  peerScopeIds: string[];
};

export function peerMedianBaseline(observations: readonly PeerBaselineObservation[]): PeerBaseline {
  const usable = observations.filter(
    (observation): observation is { scopeId: string; value: number } =>
      observation.value !== null && Number.isFinite(observation.value),
  );
  return {
    peerCount: usable.length,
    peerMedian: usable.length === 0 ? null : median(usable.map((observation) => observation.value)),
    peerScopeIds: usable.map((observation) => observation.scopeId).sort(),
  };
}
