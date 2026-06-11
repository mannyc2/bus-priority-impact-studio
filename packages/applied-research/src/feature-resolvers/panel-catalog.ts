import {
  DECOUPLING_QUADRANTS_V1_ID,
  decouplingQuadrantsPanelSpecV1,
  ROUTE_DECOUPLING_PANEL_V1_ID,
} from "./decoupling-quadrants";
import {
  INTERVENTION_SCOPE_FIT_PANEL_V1_ID,
  INTERVENTION_SCOPE_FIT_V1_ID,
  interventionScopeFitPanelSpecV1,
} from "./intervention-scope-fit";
import type { PanelSpec } from "./panel-spec";
import {
  PULSE_FINGERPRINT_V1_ID,
  pulseFingerprintPanelSpecV1,
  ROUTE_HOUR_OF_WEEK_PULSE_PANEL_V1_ID,
} from "./pulse-fingerprint";
import {
  RELIABILITY_EXPOSURE_PANEL_V1_ID,
  reliabilityExposurePanelSpecV1,
} from "./reliability-exposure-panel";
import {
  ROUTE_MONTH_PEER_PANEL_V1_ID,
  ROUTE_PEER_RESIDUALS_V1_ID,
  routePeerResidualPanelSpecV1,
} from "./route-peer-residuals";
import {
  SEGMENT_DAYPART_PANEL_V1_ID,
  SEGMENT_DAYPART_RESIDUALS_V1_ID,
  segmentDaypartPanelSpecV1,
} from "./segment-daypart-residuals";
import {
  SEGMENT_MONTH_PANEL_V1_ID,
  SEGMENT_SPEED_RESIDUALS_V1_ID,
  segmentMonthPanelSpecV1,
} from "./segment-month-panel";
import {
  SOURCE_GAP_MODEL_V1_ID,
  SOURCE_GAP_PANEL_V1_ID,
  sourceGapModelPanelSpecV1,
} from "./source-gap-model";
import { TREATMENT_EVENT_PANEL_V1_ID, treatmentEventPanelSpecV1 } from "./treatment-event-panel";

export type BuiltInPanelModelSpecV1 = {
  readonly modelArtifactId: string;
  readonly panelId: string;
  readonly label: string;
  readonly spec: PanelSpec;
};

export type BuiltInPanelSpecDefaults = {
  readonly historyStartMonth?: string;
  readonly releaseMonth?: string;
  readonly runId?: string;
  readonly minObservationCount?: number;
  readonly minHistoryMonths?: number;
  readonly minCellHistoryMonths?: number;
  readonly minReleaseTripCount?: number;
  readonly minCoveredOverlapShare?: number;
  readonly minPartialOverlapShare?: number;
};

export const BUILT_IN_MODEL_ARTIFACT_IDS_V1 = [
  SEGMENT_SPEED_RESIDUALS_V1_ID,
  SEGMENT_DAYPART_RESIDUALS_V1_ID,
  ROUTE_PEER_RESIDUALS_V1_ID,
  RELIABILITY_EXPOSURE_PANEL_V1_ID,
  INTERVENTION_SCOPE_FIT_V1_ID,
  SOURCE_GAP_MODEL_V1_ID,
  TREATMENT_EVENT_PANEL_V1_ID,
  PULSE_FINGERPRINT_V1_ID,
  DECOUPLING_QUADRANTS_V1_ID,
] as const;

export function builtInPanelModelSpecsV1(
  input: BuiltInPanelSpecDefaults = {},
): readonly BuiltInPanelModelSpecV1[] {
  const historyStartMonth = input.historyStartMonth ?? "2023-04";
  const releaseMonth = input.releaseMonth ?? "2026-03";
  const runId = input.runId ?? `bus-observatory-${releaseMonth}`;
  const minObservationCount = input.minObservationCount ?? 10;
  const minHistoryMonths = input.minHistoryMonths ?? 12;
  const minCellHistoryMonths = input.minCellHistoryMonths ?? 12;
  const minReleaseTripCount = input.minReleaseTripCount ?? 20;
  const minCoveredOverlapShare = input.minCoveredOverlapShare ?? 0.2;
  const minPartialOverlapShare = input.minPartialOverlapShare ?? 0.05;

  return [
    {
      modelArtifactId: SEGMENT_SPEED_RESIDUALS_V1_ID,
      panelId: SEGMENT_MONTH_PANEL_V1_ID,
      label: "Segment speed residuals",
      spec: segmentMonthPanelSpecV1({
        panelId: SEGMENT_MONTH_PANEL_V1_ID,
        startMonth: historyStartMonth,
        endMonth: releaseMonth,
        minObservationCount,
      }),
    },
    {
      modelArtifactId: SEGMENT_DAYPART_RESIDUALS_V1_ID,
      panelId: SEGMENT_DAYPART_PANEL_V1_ID,
      label: "Segment daypart residuals",
      spec: segmentDaypartPanelSpecV1({
        panelId: SEGMENT_DAYPART_PANEL_V1_ID,
        startMonth: historyStartMonth,
        endMonth: releaseMonth,
        minObservationCount,
      }),
    },
    {
      modelArtifactId: ROUTE_PEER_RESIDUALS_V1_ID,
      panelId: ROUTE_MONTH_PEER_PANEL_V1_ID,
      label: "Route peer residuals",
      spec: routePeerResidualPanelSpecV1({
        panelId: ROUTE_MONTH_PEER_PANEL_V1_ID,
        startMonth: historyStartMonth,
        endMonth: releaseMonth,
        minObservationCount,
        minHistoryMonths,
      }),
    },
    {
      modelArtifactId: RELIABILITY_EXPOSURE_PANEL_V1_ID,
      panelId: RELIABILITY_EXPOSURE_PANEL_V1_ID,
      label: "Reliability exposure panel",
      spec: reliabilityExposurePanelSpecV1({
        panelId: RELIABILITY_EXPOSURE_PANEL_V1_ID,
        releaseMonth,
        runId,
      }),
    },
    {
      modelArtifactId: INTERVENTION_SCOPE_FIT_V1_ID,
      panelId: INTERVENTION_SCOPE_FIT_PANEL_V1_ID,
      label: "Intervention scope fit",
      spec: interventionScopeFitPanelSpecV1({
        panelId: INTERVENTION_SCOPE_FIT_PANEL_V1_ID,
        month: releaseMonth,
        minCoveredOverlapShare,
        minPartialOverlapShare,
      }),
    },
    {
      modelArtifactId: SOURCE_GAP_MODEL_V1_ID,
      panelId: SOURCE_GAP_PANEL_V1_ID,
      label: "Source gap model",
      spec: sourceGapModelPanelSpecV1({
        panelId: SOURCE_GAP_PANEL_V1_ID,
        month: releaseMonth,
      }),
    },
    {
      modelArtifactId: TREATMENT_EVENT_PANEL_V1_ID,
      panelId: TREATMENT_EVENT_PANEL_V1_ID,
      label: "Treatment event panel",
      spec: treatmentEventPanelSpecV1({
        panelId: TREATMENT_EVENT_PANEL_V1_ID,
        historyStartMonth,
        releaseMonth,
      }),
    },
    {
      modelArtifactId: PULSE_FINGERPRINT_V1_ID,
      panelId: ROUTE_HOUR_OF_WEEK_PULSE_PANEL_V1_ID,
      label: "Pulse fingerprint",
      spec: pulseFingerprintPanelSpecV1({
        panelId: ROUTE_HOUR_OF_WEEK_PULSE_PANEL_V1_ID,
        historyStartMonth,
        releaseMonth,
        minCellHistoryMonths,
        minReleaseTripCount,
      }),
    },
    {
      modelArtifactId: DECOUPLING_QUADRANTS_V1_ID,
      panelId: ROUTE_DECOUPLING_PANEL_V1_ID,
      label: "Decoupling quadrants",
      spec: decouplingQuadrantsPanelSpecV1({
        panelId: ROUTE_DECOUPLING_PANEL_V1_ID,
        historyStartMonth,
        releaseMonth,
        minHistoryMonths,
      }),
    },
  ];
}
