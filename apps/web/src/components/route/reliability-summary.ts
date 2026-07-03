import type {
  RouteSurfaceCapability,
  StudioRoute,
  StudioRouteInsight,
} from "@/studio/api-contract";
import type { MetricTone } from "@/studio/metric-model";
import { stableInsightSort } from "./route-insight-placement";

type ObservedReliability = StudioRoute["observedReliability"];

export type ReliabilitySummary = {
  kpiValue: string;
  kpiSub: string;
  kpiTone: MetricTone;
  sectionSubtitle: string;
  statusLabel: string;
  statusDetail: string;
  sampleLabel: string;
  sampleDetail: string;
  medianHeadwayLabel: string;
  p90HeadwayLabel: string;
  bunchingLabel: string;
  longGapLabel: string;
  excessWaitLabel: string;
  provenanceLabel: string;
  caveat: string;
  dataAsOf: string | null;
  hasObservedMetrics: boolean;
};

const RELIABILITY_DETECTOR_IDS = new Set([
  "observed_reliability",
  "headway_reliability_ewt",
  "bunching_hotspots",
]);

export function reliabilitySummary({
  observed,
  capability,
}: {
  observed: ObservedReliability;
  capability: RouteSurfaceCapability | null;
}): ReliabilitySummary {
  if (observed === null) {
    const state = capability?.state ?? "building";
    const reason = capability?.reason ?? "Wait reliability is not attached.";
    return {
      kpiValue: state === "building" ? "Building" : "Not published",
      kpiSub: reason,
      kpiTone: "ink",
      sectionSubtitle: reason,
      statusLabel: state.replaceAll("_", " "),
      statusDetail: "No reliability payload.",
      sampleLabel: "n/a",
      sampleDetail: "sample coverage not published",
      medianHeadwayLabel: "n/a",
      p90HeadwayLabel: "n/a",
      bunchingLabel: "n/a",
      longGapLabel: "n/a",
      excessWaitLabel: "n/a",
      provenanceLabel: "not published",
      caveat: reason,
      dataAsOf: capability?.dataAsOf ?? null,
      hasObservedMetrics: false,
    };
  }

  const observedMetrics = observed.reliabilityStatus === "observed";
  const longGap = share(observed.observedLongGapShare);
  const bunching = share(observed.observedBunchingShare);
  const sampleLabel = observed.sampleCount.toLocaleString("en-US");
  const provenanceLabel =
    observed.source === "third_party_recovered"
      ? "third-party recovered GTFS-RT"
      : "self-collected GTFS-RT";
  const statusLabel = observedMetrics ? "Published" : "Insufficient samples";
  const kpiSub = observedMetrics
    ? `${longGap} long gaps · ${sampleLabel} samples`
    : `${sampleLabel} samples; headway stats withheld`;

  return {
    kpiValue: observedMetrics ? minutes(observed.excessWaitMinutes) : "Low sample",
    kpiSub,
    kpiTone: reliabilityTone(observed),
    sectionSubtitle: observedMetrics
      ? "Observed headway samples, bunching, long gaps, and excess wait from the reliability layer."
      : "The reliability layer ran, but this route did not meet the sample threshold for headway statistics.",
    statusLabel,
    statusDetail: observedMetrics
      ? "Route-level observed reliability row is published."
      : "Sample count is below the reporting threshold.",
    sampleLabel,
    sampleDetail: `${observed.month} · ${provenanceLabel}`,
    medianHeadwayLabel: minutes(observed.medianObservedHeadwayMinutes),
    p90HeadwayLabel: minutes(observed.p90ObservedHeadwayMinutes),
    bunchingLabel: bunching,
    longGapLabel: longGap,
    excessWaitLabel: minutes(observed.excessWaitMinutes),
    provenanceLabel,
    caveat:
      observed.caveats[0] ??
      "Observed reliability carries separate provenance from official monthly speed evidence.",
    dataAsOf: observed.month,
    hasObservedMetrics: observedMetrics,
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
  if (observed === null || observed.reliabilityStatus !== "observed") return "ink";
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
