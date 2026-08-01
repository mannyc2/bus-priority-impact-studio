import type { StudioRoute, StudioRouteInsight } from "@/studio/api-contract";
import { stableInsightSort } from "./route-insight-placement";

type MetricTone = "ink" | "good" | "bad";

type ObservedReliability = NonNullable<StudioRoute["observedReliability"]>;

export type ReliabilitySummary = {
  kpiTone: MetricTone;
  statusLabel: string;
  statusDetail: string;
  sampleLabel: string;
  sampleDetail: string;
  medianHeadwayLabel: string;
  p90HeadwayLabel: string;
  bunchingLabel: string;
  longGapLabel: string;
  excessWaitLabel: string;
  caveat: string;
};

const RELIABILITY_DETECTOR_IDS = new Set([
  "observed_reliability",
  "headway_reliability_ewt",
  "bunching_hotspots",
]);

export function reliabilitySummary({
  observed,
}: {
  observed: ObservedReliability;
}): ReliabilitySummary {
  const observedMetrics = observed.reliabilityStatus === "observed";
  const provenanceLabel =
    observed.source === "third_party_recovered"
      ? "third-party recovered GTFS-RT"
      : "self-collected GTFS-RT";

  return {
    kpiTone: reliabilityTone(observed),
    statusLabel: observedMetrics ? "Published" : "Insufficient samples",
    statusDetail: observedMetrics
      ? "Route-level observed reliability is published."
      : "Sample count is below the reporting threshold.",
    sampleLabel: observed.sampleCount.toLocaleString("en-US"),
    sampleDetail: `${observed.month}, ${provenanceLabel}`,
    medianHeadwayLabel: minutes(observed.medianObservedHeadwayMinutes),
    p90HeadwayLabel: minutes(observed.p90ObservedHeadwayMinutes),
    bunchingLabel: share(observed.observedBunchingShare),
    longGapLabel: share(observed.observedLongGapShare),
    excessWaitLabel: minutes(observed.excessWaitMinutes),
    caveat:
      observed.caveats[0] ??
      "Observed reliability carries separate provenance from official monthly speed evidence.",
  };
}

export function reliabilityInsightRows(
  insights: readonly StudioRouteInsight[],
): StudioRouteInsight[] {
  return insights
    .filter(
      (insight) =>
        RELIABILITY_DETECTOR_IDS.has(insight.detectorId) ||
        insight.title.toLowerCase().includes("reliability"),
    )
    .sort(stableInsightSort)
    .slice(0, 3);
}

function reliabilityTone(observed: ObservedReliability): MetricTone {
  if (observed.reliabilityStatus !== "observed") return "ink";
  if ((observed.observedLongGapShare ?? 0) >= 0.3) return "bad";
  if ((observed.excessWaitMinutes ?? 0) >= 5) return "bad";
  return "ink";
}

function minutes(value: number | null): string {
  return value === null ? "n/a" : `${value.toFixed(1)} min`;
}

function share(value: number | null): string {
  return value === null ? "n/a" : `${Math.round(value * 100)}%`;
}
