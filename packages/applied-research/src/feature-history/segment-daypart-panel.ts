import type { PanelManifest } from "../feature-resolvers/panel-spec";
import {
  type SegmentDaypartPanelSpec,
  segmentDaypartPanelSpecV1,
} from "../feature-resolvers/segment-daypart-residuals";
import type { SegmentDaypartHistoryRow } from "../local-db/segment-daypart-history-rows";

export type SegmentDaypartPanelEligibilityStatus =
  | "eligible"
  | "missing_speed"
  | "low_observation_count"
  | "zero_traversal_count";

export type SegmentDaypartPanelRow = {
  readonly routeId: string;
  readonly month: string;
  readonly segmentId: string;
  readonly directionId: string;
  readonly daypart: string;
  readonly observationCount: number;
  readonly traversalCount: number;
  readonly averageSpeedMph: number | null;
  readonly averageTravelTimeMinutes: number | null;
  readonly averageRoadDistanceMiles: number | null;
  readonly eligibilityStatus: SegmentDaypartPanelEligibilityStatus;
};

export type SegmentDaypartPanelArtifact = {
  readonly artifactKind: "applied_research_segment_daypart_panel";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly dbPath: string;
  readonly artifactPath: string;
  readonly panelSpec: SegmentDaypartPanelSpec;
  readonly panelManifest: PanelManifest;
  readonly window: {
    readonly startMonth: string;
    readonly endMonth: string;
    readonly monthCount: number;
  };
  readonly summary: {
    readonly panelRowCount: number;
    readonly eligiblePanelRowCount: number;
    readonly releaseMonthRowCount: number;
    readonly routeCount: number;
    readonly segmentCount: number;
    readonly daypartCount: number;
    readonly traversalCount: number;
  };
  readonly rows: readonly SegmentDaypartPanelRow[];
};

function eligibilityStatus(
  row: SegmentDaypartHistoryRow,
  spec: SegmentDaypartPanelSpec,
): SegmentDaypartPanelEligibilityStatus {
  if (row.average_speed_mph === null) return "missing_speed";
  if (row.observation_count < spec.minObservationCount) return "low_observation_count";
  if (row.traversal_count <= 0) return "zero_traversal_count";
  return "eligible";
}

function toPanelRow(
  row: SegmentDaypartHistoryRow,
  spec: SegmentDaypartPanelSpec,
): SegmentDaypartPanelRow {
  return {
    routeId: row.route_id,
    month: row.month,
    segmentId: row.segment_id,
    directionId: row.direction,
    daypart: row.daypart,
    observationCount: row.observation_count,
    traversalCount: row.traversal_count,
    averageSpeedMph: row.average_speed_mph,
    averageTravelTimeMinutes: row.average_travel_time_minutes,
    averageRoadDistanceMiles: row.average_road_distance_miles,
    eligibilityStatus: eligibilityStatus(row, spec),
  };
}

function buildPanelManifest(input: {
  readonly rows: readonly SegmentDaypartPanelRow[];
  readonly spec: SegmentDaypartPanelSpec;
  readonly generatedAt: string;
  readonly dbPath: string;
}): PanelManifest {
  const eligibleRows = input.rows.filter((row) => row.eligibilityStatus === "eligible");
  return {
    panelId: input.spec.panelId,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    spec: segmentDaypartPanelSpecV1(input.spec),
    inputRefs: [
      {
        refKind: "local_table",
        refId: "local_route_segment_speed",
        role: "primary_daypart_speed_panel_source",
        path: input.dbPath,
      },
    ],
    summary: {
      sourceRowCount: input.rows.length,
      supportedRowCount: eligibleRows.length,
      panelRowCount: input.rows.length,
      routeCount: new Set(input.rows.map((row) => row.routeId)).size,
      entityCount: new Set(input.rows.map((row) => row.segmentId)).size,
      monthCount: new Set(input.rows.map((row) => row.month)).size,
    },
    limitations: [
      "Dayparts are fixed hour buckets and do not model school, event, or holiday calendars.",
      "Segment identity is route/direction/timepoint-pair based and is not yet a route-shape-version-proof linear reference.",
      "This panel is a research substrate; causal and forecasting studies must apply their own validation gates before public claims.",
    ],
  };
}

export function buildSegmentDaypartPanelArtifact(input: {
  readonly rows: readonly SegmentDaypartHistoryRow[];
  readonly spec: SegmentDaypartPanelSpec;
  readonly releaseMonth: string;
  readonly generatedAt: string;
  readonly dbPath: string;
  readonly artifactPath: string;
}): SegmentDaypartPanelArtifact {
  const rows = input.rows
    .filter((row) => row.month >= input.spec.startMonth && row.month <= input.spec.endMonth)
    .filter((row) => input.spec.routeId === undefined || row.route_id === input.spec.routeId)
    .map((row) => toPanelRow(row, input.spec));
  const eligibleRows = rows.filter((row) => row.eligibilityStatus === "eligible");
  const releaseRows = rows.filter((row) => row.month === input.releaseMonth);

  return {
    artifactKind: "applied_research_segment_daypart_panel",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    dbPath: input.dbPath,
    artifactPath: input.artifactPath,
    panelSpec: input.spec,
    panelManifest: buildPanelManifest({
      rows,
      spec: input.spec,
      generatedAt: input.generatedAt,
      dbPath: input.dbPath,
    }),
    window: {
      startMonth: input.spec.startMonth,
      endMonth: input.spec.endMonth,
      monthCount: new Set(rows.map((row) => row.month)).size,
    },
    summary: {
      panelRowCount: rows.length,
      eligiblePanelRowCount: eligibleRows.length,
      releaseMonthRowCount: releaseRows.length,
      routeCount: new Set(rows.map((row) => row.routeId)).size,
      segmentCount: new Set(rows.map((row) => row.segmentId)).size,
      daypartCount: new Set(rows.map((row) => row.daypart)).size,
      traversalCount: rows.reduce((total, row) => total + row.traversalCount, 0),
    },
    rows,
  };
}
