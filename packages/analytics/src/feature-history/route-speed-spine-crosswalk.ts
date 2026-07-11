import type { RouteSpeedSpineArtifact } from "./route-speed-spine.js";

export type ObservedRouteSegmentSourceKey = {
  routeId: string;
  month: string;
  direction: string;
  stopOrder: number;
  fromStopId: string | null;
  toStopId: string | null;
};

export type RouteSegmentSourceKey = {
  routeId: string;
  month: string;
  direction: string;
  stopOrder: number;
  fromStopId: string;
  toStopId: string;
};

export type ClassifiedRouteSegmentSourceKey =
  | { status: "keyed"; key: RouteSegmentSourceKey }
  | {
      status: "unkeyable_missing_stop_pair";
      observed: ObservedRouteSegmentSourceKey;
    };

export type RouteSpeedSpineCrosswalk = ReadonlyMap<string, string>;

export type RouteSpeedSpineCrosswalkMatch =
  | { status: "matched"; studioSegmentId: string; spineSegmentId: string }
  | { status: "unmatched"; studioSegmentId: string };

function normalizedText(value: string): string {
  return value.trim();
}

function normalizedStopId(value: string | null): string | null {
  if (value === null) return null;
  const normalized = normalizedText(value);
  return normalized.length === 0 ? null : normalized;
}

export function classifyRouteSegmentSourceKey(
  observed: ObservedRouteSegmentSourceKey,
): ClassifiedRouteSegmentSourceKey {
  const normalized = {
    routeId: normalizedText(observed.routeId).toUpperCase(),
    month: normalizedText(observed.month),
    direction: normalizedText(observed.direction),
    stopOrder: observed.stopOrder,
    fromStopId: normalizedStopId(observed.fromStopId),
    toStopId: normalizedStopId(observed.toStopId),
  } satisfies ObservedRouteSegmentSourceKey;

  if (normalized.fromStopId === null || normalized.toStopId === null) {
    return { status: "unkeyable_missing_stop_pair", observed: normalized };
  }
  return {
    status: "keyed",
    key: {
      ...normalized,
      fromStopId: normalized.fromStopId,
      toStopId: normalized.toStopId,
    },
  };
}

function assertSerializable(key: RouteSegmentSourceKey): void {
  const values = [
    key.routeId,
    key.month,
    key.direction,
    String(key.stopOrder),
    key.fromStopId,
    key.toStopId,
  ];
  if (!Number.isFinite(key.stopOrder) || values.some((value) => value.length === 0)) {
    throw new Error("A route segment source key contains an empty or invalid component.");
  }
  if (values.some((value) => value.includes(":"))) {
    throw new Error("A route segment source key component contains the reserved ':' delimiter.");
  }
}

export function serializeSourceSegmentId(key: RouteSegmentSourceKey): string {
  assertSerializable(key);
  return [key.direction, key.stopOrder, key.fromStopId, key.toStopId].join(":");
}

export function serializeStudioSegmentId(key: RouteSegmentSourceKey): string {
  assertSerializable(key);
  return [key.routeId, key.month, serializeSourceSegmentId(key)].join(":");
}

export function buildRouteSpeedSpineCrosswalk(
  artifact: Pick<RouteSpeedSpineArtifact, "routeId" | "segments">,
): RouteSpeedSpineCrosswalk {
  const crosswalk = new Map<string, string>();
  for (const segment of artifact.segments) {
    if (segment.raw.sourceKeys === undefined) {
      throw new Error(
        `Route speed spine ${artifact.routeId} segment ${segment.segmentId} has no exact source-key aliases; rebuild the spine artifact.`,
      );
    }
    for (const classified of segment.raw.sourceKeys) {
      if (classified.status !== "keyed") continue;
      const studioSegmentId = serializeStudioSegmentId(classified.key);
      const existing = crosswalk.get(studioSegmentId);
      if (existing !== undefined && existing !== segment.segmentId) {
        throw new Error(
          `Ambiguous route speed spine alias ${studioSegmentId}: ${existing} and ${segment.segmentId}.`,
        );
      }
      crosswalk.set(studioSegmentId, segment.segmentId);
    }
  }
  return crosswalk;
}

export function matchRouteSpeedSpineSegment(
  crosswalk: RouteSpeedSpineCrosswalk,
  key: RouteSegmentSourceKey,
): RouteSpeedSpineCrosswalkMatch {
  const studioSegmentId = serializeStudioSegmentId(key);
  const spineSegmentId = crosswalk.get(studioSegmentId);
  return spineSegmentId === undefined
    ? { status: "unmatched", studioSegmentId }
    : { status: "matched", studioSegmentId, spineSegmentId };
}
