export type DetectorReadinessBucket =
  | "public_finding_candidate"
  | "route_context"
  | "review_queue"
  | "suppressed";

export type DetectorScopeIdentityInput = {
  readonly detectorId: string;
  readonly scopeId: string;
};

export function detectorScopeIdentityKey(input: DetectorScopeIdentityInput): string {
  return `${input.detectorId}\0${input.scopeId}`;
}

export function emptyDetectorReadinessBucketCounts(): Record<DetectorReadinessBucket, number> {
  return {
    public_finding_candidate: 0,
    route_context: 0,
    review_queue: 0,
    suppressed: 0,
  };
}

export function sortedDetectorBucketRecord(
  map: Map<string, Record<DetectorReadinessBucket, number>>,
): Record<string, Record<DetectorReadinessBucket, number>> {
  return Object.fromEntries(
    [...map.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}
