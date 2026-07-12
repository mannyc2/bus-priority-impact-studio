import type { RouteId, SourceCitation } from "@bp/domain/primitives";
import {
  type RouteCoverageStatus,
  type RouteScorecard,
  RouteScorecardSchema,
} from "@bp/domain/routes";
import { decodeSchemaStrict } from "./schema-decode.js";

export type RouteScoreInput = {
  routeId: RouteId;
  month: string;
  coverageStatus: RouteCoverageStatus;
  averageSpeedMph: number;
  hotspotCount: number;
  citations: SourceCitation[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function calculateRouteScore(input: RouteScoreInput): RouteScorecard {
  const speedScore = clamp((input.averageSpeedMph / 12) * 100, 0, 100);
  const hotspotPenalty = clamp(input.hotspotCount * 5, 0, 40);
  const routeScore = Math.round(clamp(speedScore - hotspotPenalty, 0, 100));

  return decodeSchemaStrict(RouteScorecardSchema, {
    schemaVersion: 1,
    routeId: input.routeId,
    month: input.month,
    routeScore,
    coverageStatus: input.coverageStatus,
    averageSpeedMph: input.averageSpeedMph,
    hotspotCount: input.hotspotCount,
    citations: input.citations,
  });
}
