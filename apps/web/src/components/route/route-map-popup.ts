import { laneReadoutLine, segmentCarriesLaneTag } from "@/components/route/route-segment-explorer";
import type { StudioSegment } from "@/studio/api-contract";

/** Pure content model for the route map's one click surface (plan 126 step 1,
 * the ruling Plan 125 recorded for the network map). The popup is the only
 * place a clicked segment is described, so its lines live here and are tested
 * without a map runtime. */

const DIRECTION_NAMES: Record<string, string> = {
  NB: "Northbound",
  SB: "Southbound",
  EB: "Eastbound",
  WB: "Westbound",
};

/** Served direction codes are the display fallback: an unmapped code is shown
 * as-is rather than guessed at. */
export function segmentDirectionName(direction: string): string {
  return DIRECTION_NAMES[direction] ?? direction;
}

export type RouteMapPopupModel = {
  title: string;
  directionName: string;
  speedValue: string;
  speedUnit: string;
  rankLine: string | null;
  laneLine: string;
  laneTagged: boolean;
};

export function routeMapPopupModel(input: {
  segment: Pick<StudioSegment, "from" | "to" | "direction" | "lane">;
  speedMph: number | null;
  periodLabel: string;
  /** Position in the active ranking, or null when the segment is unranked. */
  rank: number | null;
  rankedCount: number;
}): RouteMapPopupModel {
  return {
    title: `${input.segment.from} → ${input.segment.to}`,
    directionName: segmentDirectionName(input.segment.direction),
    speedValue: input.speedMph === null ? "—" : input.speedMph.toFixed(1),
    speedUnit:
      input.speedMph === null ? `no speed data, ${input.periodLabel}` : `mph, ${input.periodLabel}`,
    rankLine:
      input.rank === null || input.rankedCount === 0
        ? null
        : `#${input.rank} slowest of ${input.rankedCount}`,
    laneLine: laneReadoutLine(input.segment.lane),
    laneTagged: segmentCarriesLaneTag(input.segment.lane),
  };
}

/** Midpoint of the served geometry: the popup anchors to the segment it
 * describes, never to the pointer. */
export function routeSegmentAnchor(
  collection: {
    features: ReadonlyArray<{
      properties: { studioSegmentId: string };
      geometry: { coordinates: ReadonlyArray<readonly [number, number]> };
    }>;
  },
  studioSegmentId: string,
): readonly [number, number] | null {
  const feature = collection.features.find(
    (candidate) => candidate.properties.studioSegmentId === studioSegmentId,
  );
  if (feature === undefined) return null;
  const midpoint =
    feature.geometry.coordinates[Math.floor(feature.geometry.coordinates.length / 2)];
  return midpoint === undefined ? null : [midpoint[0], midpoint[1]];
}
