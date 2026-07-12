import { type BootstrapInterval, bootstrapSegmentDid } from "./bootstrap.ts";
import {
  estimateMatchedDid,
  type MatchedDidEstimate,
  monthlyMatchedDifferences,
  monthlyMatchedSeries,
} from "./did.ts";
import {
  congestionPricingOverlapGate,
  controlEligibilityGate,
  minimumSampleGate,
  placeboInTimeGate,
  preTrendGate,
  queensRedesignOverlapGate,
  type StudyGate,
  studyDirection,
} from "./gates.ts";
import { type MatchedStudySegment, matchStudyControls } from "./matching.ts";
import {
  eligibleSegmentSeries,
  isoMonthFromIndex,
  monthIndex,
  type StudyPanelCell,
  segmentSeries,
  studyWindowMonths,
} from "./panel.ts";

export type StudyEstimatorVariant = {
  readonly estimate: MatchedDidEstimate | null;
  readonly confidenceInterval: BootstrapInterval | null;
  readonly matchedSegmentCount: number;
  readonly eligibleControlSegmentCount: number;
  readonly dropped: {
    readonly insufficientWindow: number;
    readonly insufficientControls: number;
  };
  readonly monthlySeries: ReturnType<typeof monthlyMatchedSeries>;
};

export type StudyEstimatorResult = {
  readonly allDay: StudyEstimatorVariant;
  readonly peakHours: StudyEstimatorVariant;
  readonly gates: {
    readonly preTrend: StudyGate;
    readonly placeboInTime: StudyGate;
    readonly minSample: StudyGate;
    readonly controlEligibility: StudyGate;
    readonly congestionPricingOverlap: StudyGate;
    readonly redesignOverlap: StudyGate;
  };
  readonly evaluationLevel: "segment_matched_did" | "descriptive_before_after";
  readonly claimTier: "gated_estimate" | "descriptive";
  readonly direction: "improved" | "worsened" | "no_detectable_change" | "not_estimable";
  readonly placeboEffectMph: number | null;
  readonly sensitivityEstimates: {
    readonly congestionPricing: StudySensitivityResult | null;
    readonly queensRedesign: StudySensitivityResult | null;
  };
};

export type StudySensitivityResult = {
  readonly reason: string;
  readonly excludedMonths: readonly string[];
  readonly variant: StudyEstimatorVariant;
};

function estimateVariant(input: {
  readonly cells: readonly StudyPanelCell[];
  readonly treatedSegmentIds: ReadonlySet<string>;
  readonly treatedRouteId: string;
  readonly excludedControlRouteIds: ReadonlySet<string>;
  readonly preMonths: readonly string[];
  readonly postMonths: readonly string[];
  readonly eventId: string;
  readonly excludedMonths?: ReadonlySet<string> | undefined;
}): { variant: StudyEstimatorVariant; matches: readonly MatchedStudySegment[] } {
  const cells =
    input.excludedMonths === undefined
      ? input.cells
      : input.cells.filter((cell) => !input.excludedMonths?.has(cell.month));
  const eligibility = eligibleSegmentSeries({
    series: segmentSeries(cells),
    preMonths: new Set(input.preMonths),
    postMonths: new Set(input.postMonths),
  });
  const treated = eligibility.eligible.filter(
    (segment) =>
      segment.routeId === input.treatedRouteId &&
      input.treatedSegmentIds.has(segment.spineSegmentId),
  );
  const treatedBoroughs = new Set(treated.map((segment) => segment.borough));
  const candidates = eligibility.eligible.filter(
    (segment) =>
      segment.routeId !== input.treatedRouteId &&
      !input.excludedControlRouteIds.has(segment.routeId) &&
      treatedBoroughs.has(segment.borough),
  );
  const matching = matchStudyControls({ treated, candidates });
  const estimate = estimateMatchedDid({
    matches: matching.matches,
    preMonths: new Set(input.preMonths),
    postMonths: new Set(input.postMonths),
  });
  const confidenceInterval =
    estimate === null
      ? null
      : bootstrapSegmentDid({ segments: estimate.perSegment, eventId: input.eventId });
  return {
    matches: matching.matches,
    variant: {
      estimate,
      confidenceInterval,
      matchedSegmentCount: matching.matches.length,
      eligibleControlSegmentCount: candidates.length,
      dropped: {
        insufficientWindow: eligibility.droppedInsufficientWindowCount,
        insufficientControls: matching.droppedInsufficientControlsCount,
      },
      monthlySeries: monthlyMatchedSeries(
        matching.matches,
        [...input.preMonths, ...input.postMonths].toSorted(),
      ),
    },
  };
}

export function estimateStudy(input: {
  readonly eventId: string;
  readonly routeId: string;
  readonly implementationMonth: string;
  readonly analysisMonth: string;
  readonly boroughs: readonly string[];
  readonly cells: readonly StudyPanelCell[];
  readonly peakCells?: readonly StudyPanelCell[] | undefined;
  readonly treatedSegmentIds: ReadonlySet<string>;
  readonly excludedControlRouteIds: ReadonlySet<string>;
}): StudyEstimatorResult {
  const windows = studyWindowMonths({
    implementationMonth: input.implementationMonth,
    analysisMonth: input.analysisMonth,
  });
  const current = estimateVariant({
    cells: input.cells,
    treatedSegmentIds: input.treatedSegmentIds,
    treatedRouteId: input.routeId,
    excludedControlRouteIds: input.excludedControlRouteIds,
    preMonths: windows.preMonths,
    postMonths: windows.postMonths,
    eventId: input.eventId,
  });
  const peak = estimateVariant({
    cells: input.peakCells ?? input.cells,
    treatedSegmentIds: input.treatedSegmentIds,
    treatedRouteId: input.routeId,
    excludedControlRouteIds: input.excludedControlRouteIds,
    preMonths: windows.preMonths,
    postMonths: windows.postMonths,
    eventId: `${input.eventId}:peak`,
  });
  const placeboImplementationMonth = isoMonthFromIndex(monthIndex(input.implementationMonth) - 12);
  const placeboWindows = studyWindowMonths({
    implementationMonth: placeboImplementationMonth,
    analysisMonth: input.analysisMonth,
  });
  const placebo =
    placeboWindows.preMonths.length < 4 || placeboWindows.postMonths.length < 4
      ? null
      : estimateVariant({
          cells: input.cells,
          treatedSegmentIds: input.treatedSegmentIds,
          treatedRouteId: input.routeId,
          excludedControlRouteIds: input.excludedControlRouteIds,
          preMonths: placeboWindows.preMonths,
          postMonths: placeboWindows.postMonths,
          eventId: `${input.eventId}:placebo`,
        }).variant.estimate;
  const estimate = current.variant.estimate;
  const confidenceInterval = current.variant.confidenceInterval;
  const preDifferences = monthlyMatchedDifferences(current.matches, windows.preMonths).map(
    (row) => row.differenceMph,
  );
  const gates: StudyEstimatorResult["gates"] = {
    preTrend:
      estimate === null
        ? { status: "not_applicable", reason: "No matched estimate is available." }
        : preTrendGate({ monthlyDifferencesMph: preDifferences, effectMph: estimate.effectMph }),
    placeboInTime:
      confidenceInterval === null
        ? { status: "not_applicable", reason: "No confidence interval is available." }
        : placeboInTimeGate({
            placeboEffectMph: placebo?.effectMph ?? null,
            ciLowerMph: confidenceInterval.lowerMph,
            ciUpperMph: confidenceInterval.upperMph,
          }),
    minSample: minimumSampleGate(current.variant.matchedSegmentCount),
    controlEligibility: controlEligibilityGate(current.variant.eligibleControlSegmentCount),
    congestionPricingOverlap: congestionPricingOverlapGate({
      postMonths: windows.postMonths,
      boroughs: input.boroughs,
    }),
    redesignOverlap: queensRedesignOverlapGate({
      routeId: input.routeId,
      windowMonths: windows.allMonths,
    }),
  };
  const hardGateFailed = [
    gates.preTrend,
    gates.placeboInTime,
    gates.minSample,
    gates.controlEligibility,
  ].some((gate) => gate.status === "fail");
  const congestionExcludedMonths = windows.allMonths.filter(
    (month) => monthIndex(month) >= monthIndex("2025-01"),
  );
  const redesignExcludedMonths = windows.allMonths.filter(
    (month) =>
      monthIndex(month) >= monthIndex("2025-06") && monthIndex(month) <= monthIndex("2025-12"),
  );
  const sensitivity = (
    reason: string,
    excludedMonths: readonly string[],
    suffix: string,
  ): StudySensitivityResult => ({
    reason,
    excludedMonths,
    variant: estimateVariant({
      cells: input.cells,
      treatedSegmentIds: input.treatedSegmentIds,
      treatedRouteId: input.routeId,
      excludedControlRouteIds: input.excludedControlRouteIds,
      preMonths: windows.preMonths,
      postMonths: windows.postMonths,
      eventId: `${input.eventId}:${suffix}`,
      excludedMonths: new Set(excludedMonths),
    }).variant,
  });
  return {
    allDay: current.variant,
    peakHours: peak.variant,
    gates,
    evaluationLevel: hardGateFailed ? "descriptive_before_after" : "segment_matched_did",
    claimTier: hardGateFailed ? "descriptive" : "gated_estimate",
    direction:
      estimate === null || confidenceInterval === null
        ? "not_estimable"
        : studyDirection({
            effectMph: estimate.effectMph,
            ciLowerMph: confidenceInterval.lowerMph,
            ciUpperMph: confidenceInterval.upperMph,
          }),
    placeboEffectMph: placebo?.effectMph ?? null,
    sensitivityEstimates: {
      congestionPricing:
        gates.congestionPricingOverlap.status === "fail"
          ? sensitivity(
              "Excludes months from 2025-01 onward because the route and post window overlap congestion pricing.",
              congestionExcludedMonths,
              "without-congestion-pricing-overlap",
            )
          : null,
      queensRedesign:
        gates.redesignOverlap.status === "fail"
          ? sensitivity(
              "Excludes 2025-06 through 2025-12 because the Queens redesign may change route patterns.",
              redesignExcludedMonths,
              "without-queens-redesign-overlap",
            )
          : null,
    },
  };
}
