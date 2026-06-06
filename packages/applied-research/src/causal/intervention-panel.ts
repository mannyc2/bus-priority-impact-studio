import type { InterventionComparisonRow } from "../local-db/intervention-panel-rows";

export type InterventionPanelArtifact = {
  readonly artifactKind: "intervention_panel";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly dbPath: string;
  readonly artifactPath: string;
  readonly window: {
    readonly startMonth: string;
    readonly endMonth: string;
  };
  readonly summary: {
    readonly panelRowCount: number;
    readonly routeCount: number;
    readonly eventCount: number;
    readonly claimStrength: "associational_screening_only";
  };
  readonly panels: readonly InterventionPanelRow[];
};

export type InterventionPanelRow = {
  readonly eventId: string;
  readonly routeId: string;
  readonly month: string;
  readonly interventionType: string;
  readonly sourceId: string;
  readonly evaluationLevel: string;
  readonly comparisonStatus: string;
  readonly preWindow: {
    readonly startMonth: string | null;
    readonly endMonth: string | null;
  };
  readonly postWindow: {
    readonly startMonth: string | null;
    readonly endMonth: string | null;
  };
  readonly comparisonRouteCount: number;
  readonly comparisonRouteIds: readonly string[];
  readonly speedDeltaMph: number | null;
  readonly adjustedSpeedDeltaMph: number | null;
  readonly ridershipDelta: number | null;
  readonly adjustedRidershipDelta: number | null;
  readonly caveat: string;
};

export function buildInterventionPanelArtifact(input: {
  readonly rows: readonly InterventionComparisonRow[];
  readonly startMonth: string;
  readonly endMonth: string;
  readonly generatedAt: string;
  readonly dbPath: string;
  readonly artifactPath: string;
}): InterventionPanelArtifact {
  const routeIds = new Set(input.rows.map((row) => row.route_id));
  const eventIds = new Set(input.rows.map((row) => row.event_id));

  return {
    artifactKind: "intervention_panel",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    dbPath: input.dbPath,
    artifactPath: input.artifactPath,
    window: { startMonth: input.startMonth, endMonth: input.endMonth },
    summary: {
      panelRowCount: input.rows.length,
      routeCount: routeIds.size,
      eventCount: eventIds.size,
      claimStrength: "associational_screening_only",
    },
    panels: input.rows.map((row) => ({
      eventId: row.event_id,
      routeId: row.route_id,
      month: row.month,
      interventionType: row.intervention_type,
      sourceId: row.source_id,
      evaluationLevel: row.evaluation_level,
      comparisonStatus: row.comparison_status,
      preWindow: { startMonth: row.pre_start_month, endMonth: row.pre_end_month },
      postWindow: { startMonth: row.post_start_month, endMonth: row.post_end_month },
      comparisonRouteCount: row.comparison_route_count,
      comparisonRouteIds:
        row.comparison_route_ids === null || row.comparison_route_ids.length === 0
          ? []
          : row.comparison_route_ids
              .split(",")
              .map((id) => id.trim())
              .filter(Boolean),
      speedDeltaMph: row.speed_delta_mph,
      adjustedSpeedDeltaMph: row.adjusted_speed_delta_mph,
      ridershipDelta: row.ridership_delta,
      adjustedRidershipDelta: row.adjusted_ridership_delta,
      caveat: row.caveat,
    })),
  };
}
