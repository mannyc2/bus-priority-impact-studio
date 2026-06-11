import type { Database } from "bun:sqlite";
import { SPEED_PACE_HOTSPOT_DETECTOR_ID } from "@bp/analytics";
import {
  RICHER_GRAIN_DETECTOR_IDS,
  type RicherCandidateRow,
  ROUTE_MONTH_BASELINE_DETECTOR_IDS,
  type RouteMonthCleanNoHitRow,
  SPEED_PACE_ROUTE_MONTH_BASELINE_DETECTOR_ID,
  type SpeedPaceRouteCoverageRow,
  type SpeedPaceShadowCandidateRow,
} from "../evaluation";

export type SpeedPaceShadowAuditLocalDbQuery = {
  readonly sqlite: Database;
  readonly month: string;
};

export type SpeedPaceShadowAuditLocalDbRows = {
  readonly cleanNoHitRows: SpeedPaceRouteCoverageRow[];
  readonly speedPaceCandidateRows: SpeedPaceShadowCandidateRow[];
};

export type RouteMonthShadowAuditLocalDbQuery = {
  readonly sqlite: Database;
  readonly month: string;
};

export type RouteMonthShadowAuditLocalDbRows = {
  readonly cleanNoHitRows: RouteMonthCleanNoHitRow[];
  readonly richerCandidateRows: RicherCandidateRow[];
};

function placeholders(values: readonly unknown[]): string {
  return values.map(() => "?").join(", ");
}

export function loadSpeedPaceShadowAuditLocalDbRows(
  input: SpeedPaceShadowAuditLocalDbQuery,
): SpeedPaceShadowAuditLocalDbRows {
  return {
    cleanNoHitRows: input.sqlite
      .query(
        `
          SELECT c.scope_id, NULL AS route_id, c.outcome
          FROM local_finding_coverage_audit c
          WHERE c.month = ?
            AND c.detector_id = ?
            AND c.scope_kind = 'route'
            AND c.outcome = 'clean_no_hit'
        `,
      )
      .all(input.month, SPEED_PACE_ROUTE_MONTH_BASELINE_DETECTOR_ID) as SpeedPaceRouteCoverageRow[],
    speedPaceCandidateRows: input.sqlite
      .query(
        `
          SELECT route_id, candidate_id, scope_id, detector_score, claim_text
          FROM local_finding_candidate
          WHERE month = ?
            AND detector_id = ?
          ORDER BY detector_score DESC, route_id, scope_id
        `,
      )
      .all(input.month, SPEED_PACE_HOTSPOT_DETECTOR_ID) as SpeedPaceShadowCandidateRow[],
  };
}

export function loadRouteMonthShadowAuditLocalDbRows(
  input: RouteMonthShadowAuditLocalDbQuery,
): RouteMonthShadowAuditLocalDbRows {
  return {
    cleanNoHitRows: input.sqlite
      .query(
        `
          SELECT detector_id, scope_id AS route_id
          FROM local_finding_coverage_audit
          WHERE month = ?
            AND detector_id IN (${placeholders(ROUTE_MONTH_BASELINE_DETECTOR_IDS)})
            AND scope_kind = 'route'
            AND outcome = 'clean_no_hit'
          ORDER BY detector_id, scope_id
        `,
      )
      .all(input.month, ...ROUTE_MONTH_BASELINE_DETECTOR_IDS) as RouteMonthCleanNoHitRow[],
    richerCandidateRows: input.sqlite
      .query(
        `
          SELECT detector_id, route_id, candidate_id, scope_kind, scope_id, reason_code, detector_score, claim_text
          FROM local_finding_candidate
          WHERE month = ?
            AND detector_id IN (${placeholders(RICHER_GRAIN_DETECTOR_IDS)})
            AND route_id IS NOT NULL
          ORDER BY detector_score DESC, detector_id, route_id, scope_id
        `,
      )
      .all(input.month, ...RICHER_GRAIN_DETECTOR_IDS) as RicherCandidateRow[],
  };
}
