import * as z from "zod";
import { type StudioRouteInsight, StudioRouteInsightSchema } from "./routes/index.js";

const DetectorReadinessServingRefSchema = z
  .object({
    detectorId: z.string(),
    routeId: z.string(),
    scopeId: z.string(),
    month: z.string(),
    asOfMonth: z.string().nullable(),
    bucket: z.enum(["public_finding_candidate", "route_context"]),
    reviewedFrontendUse: z.string().nullable().optional(),
    evidenceRefPath: z.string().optional(),
    sourceProjectionPath: z.string().optional(),
    readinessReason: z.string().optional(),
    caveats: z.array(z.string()).default([]),
  })
  .passthrough();

const RouteDetectorReadinessSummarySchema = z
  .object({
    routeId: z.string(),
    publicFindingCandidateRefs: z.array(DetectorReadinessServingRefSchema).default([]),
    routeContextRefs: z.array(DetectorReadinessServingRefSchema).default([]),
  })
  .passthrough();

export const DetectorReadinessServingManifestForInsightsSchema = z
  .object({
    artifactKind: z.literal("detector_readiness_serving_manifest"),
    schemaVersion: z.literal(1),
    routes: z.array(RouteDetectorReadinessSummarySchema),
  })
  .passthrough();

export type DetectorReadinessServingManifestForInsights = z.output<
  typeof DetectorReadinessServingManifestForInsightsSchema
>;

type DetectorReadinessServingRef = z.output<typeof DetectorReadinessServingRefSchema>;

export const STUDIO_ROUTE_INSIGHT_DETECTOR_IDS = [
  "source_gap",
  "persistent_speed_hotspot",
  "speed_pace_hotspot",
  "multi_month_speed_peer",
  "observed_reliability",
  "headway_reliability_ewt",
  "bunching_hotspots",
  "rider_weighted_excess_wait",
  "customer_journey_shortfall",
  "travel_time_variability",
  "schedule_mismatch",
  "degradation_trend",
  "positive_deviance",
  "intervention_gap",
  "intervention_event_study",
  "intervention_underperformance",
  "treatment_scope_mismatch",
  "treatment_scope_gap",
  "permit_correlated_slowdown",
  "service_request_context",
  "delay_concentration",
] as const;

// S4.1 serving readiness gate, blocked side: detector ids whose calibration disposition can never
// reach a public bucket. Mirrors the consolidated calibration register
// (data/artifacts/detector-calibration-register.json): superseded, internal_only (candidate-causal
// event study and the internal learning detector), and inventory_blocked experimental detectors.
// Register-consistency is enforced by test.
export const SERVING_BLOCKED_DETECTOR_IDS = [
  "persistent_speed_hotspot",
  "intervention_event_study",
  "positive_deviance",
  "rider_weighted_excess_wait",
] as const;

const CAVEAT_LABELS = new Map<string, string>([
  ["true_customer_impact", "Reviewed as a customer-impact pattern."],
  ["wait_component_driven", "Wait-time evidence is the main contributor."],
  ["in_vehicle_component_driven", "In-vehicle travel-time evidence is the main contributor."],
  ["service_delivery_component_driven", "Service-delivery evidence is the main contributor."],
  ["composite_metric_ambiguous", "Composite metric attribution is not fully separable."],
  ["route_rollup_artifact", "Route-level rollup may hide more specific period or segment detail."],
  ["fit_status:true_uncovered", "Treatment coverage was not confirmed for this segment."],
  ["true_uncovered_join_state", "Geometry/source join indicates an uncovered segment."],
  ["current_confirmed_overlap", "Treatment overlap is confirmed for the current source geometry."],
  ["mismatch_overlap_confirmed", "Treatment overlap is confirmed for this segment."],
  ["geometry_confirm_before_public_use", "Geometry should be rechecked before public wording."],
  ["route_level_bus_lane_evidence", "Treatment evidence is route or corridor scoped."],
  ["route_evidence_on_corridor_but_thin", "Corridor treatment evidence is present but thin."],
  ["all_day_slowness", "Slowness appears across multiple parts of the day."],
  ["dual_lane_type_geometry", "Multiple bus-priority geometry sources overlap this segment."],
  [
    "mom_improved_vs_prior_month",
    "The latest month improved, so trend wording should stay cautious.",
  ],
  ["non_terminal_segment", "Reviewed as not just a terminal or layover artifact."],
  ["not_improving_vs_12mo_median", "Not improving relative to the 12-month median."],
  [
    "overlap_is_strongest_single_match",
    "Treatment overlap is the strongest source match for this segment.",
  ],
  ["strong_observation_support", "Underlying observations support the segment signal."],
  ["negative_history_delta", "Historical comparison supports a worsening pattern."],
  ["negative_residual", "Peer comparison supports underperformance."],
  ["weak_worsening_signal", "Worsening evidence is weak, so this should stay contextual."],
  [
    "moderate_speed_or_history_caveat",
    "Speed or history evidence is moderate rather than decisive.",
  ],
  ["not_terminal", "Reviewed as not just a terminal or layover artifact."],
  ["not_short", "Reviewed as not just a very short segment artifact."],
  ["strong_sample", "Underlying sample size was reviewed as strong."],
  ["genuine_slowness", "Reviewed speed evidence supports a real slow segment."],
  [
    "genuine_not_found_overlap",
    "Reviewed treatment-source evidence did not find confirmed overlap.",
  ],
  ["not_false_positive", "Reviewer did not classify this as a false positive."],
  ["primary_finding", "Reviewed as suitable for a primary finding candidate."],
  ["route_context", "Reviewed as route context rather than a standalone finding."],
]);

function readableCaveat(token: string): string | null {
  if (token.startsWith("second_expansion_bucket:")) return null;
  if (token === "adversarial_reviewed" || token === "light_reviewed") return null;
  if (token === "scope_review_prompt_only") return null;
  return CAVEAT_LABELS.get(token) ?? null;
}

function caveatsForTooltip(refs: readonly DetectorReadinessServingRef[]): string[] {
  return [
    ...new Set(
      refs
        .flatMap((ref) => ref.caveats)
        .map(readableCaveat)
        .filter((value): value is string => value !== null),
    ),
  ].slice(0, 6);
}

function refsForInsight(refs: readonly DetectorReadinessServingRef[]): StudioRouteInsight["refs"] {
  return refs.map((ref) => ({
    ...(ref.evidenceRefPath === undefined ? {} : { evidenceRefPath: ref.evidenceRefPath }),
    ...(ref.sourceProjectionPath === undefined
      ? {}
      : { sourceProjectionPath: ref.sourceProjectionPath }),
  }));
}

function servicePeriods(refs: readonly DetectorReadinessServingRef[]): string {
  const periods = new Set(
    refs.map((ref) => {
      const lower = ref.scopeId.toLowerCase();
      if (lower.includes("off-peak")) return "off-peak";
      if (lower.includes("peak")) return "peak";
      return null;
    }),
  );
  if (periods.has("peak") && periods.has("off-peak")) return "peak and off-peak service";
  if (periods.has("peak")) return "peak service";
  if (periods.has("off-peak")) return "off-peak service";
  return "service";
}

function customerJourneyComponent(refs: readonly DetectorReadinessServingRef[]): string {
  const caveats = new Set(refs.flatMap((ref) => ref.caveats));
  if (caveats.has("wait_component_driven") && caveats.has("in_vehicle_component_driven")) {
    return "with both wait-time and in-vehicle travel-time evidence";
  }
  if (caveats.has("wait_component_driven")) return "mainly on the wait-time side";
  if (caveats.has("in_vehicle_component_driven")) {
    return "mainly on the in-vehicle travel-time side";
  }
  if (caveats.has("service_delivery_component_driven")) {
    return "with service-delivery evidence contributing";
  }
  return "with component attribution still caveated";
}

function monthFor(refs: readonly DetectorReadinessServingRef[]): string | undefined {
  return refs
    .map((ref) => ref.month)
    .sort()
    .at(-1);
}

function asOfMonthFor(refs: readonly DetectorReadinessServingRef[]): string | null | undefined {
  return refs
    .map((ref) => ref.asOfMonth)
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1);
}

function buildCustomerJourneyInsight(input: {
  routeId: string;
  refs: readonly DetectorReadinessServingRef[];
  contextOnly: boolean;
}): StudioRouteInsight | null {
  if (input.refs.length === 0) return null;
  const title = input.contextOnly ? "Customer journey context" : "Customer journey shortfall";
  const period = servicePeriods(input.refs);
  const component = customerJourneyComponent(input.refs);
  const shortText = input.contextOnly
    ? `Customer journey evidence adds context for ${period}, ${component}.`
    : `Customer journey shortfall appears in ${period}, ${component}.`;
  return StudioRouteInsightSchema.parse({
    routeId: input.routeId,
    kind: "customer_journey",
    placement: input.contextOnly ? "chart_annotation" : "overview",
    title,
    shortText,
    severity: input.contextOnly ? "low" : input.refs.length > 1 ? "high" : "medium",
    month: monthFor(input.refs),
    asOfMonth: asOfMonthFor(input.refs),
    scopeId: input.refs.length === 1 ? input.refs[0]?.scopeId : undefined,
    detectorId: "customer_journey_shortfall",
    refs: refsForInsight(input.refs),
    caveatsForTooltip: caveatsForTooltip(input.refs),
  });
}

function treatmentTitle(detectorId: string, contextOnly: boolean): string {
  if (detectorId === "treatment_scope_gap") {
    return contextOnly ? "Treatment coverage context" : "Possible treatment coverage gap";
  }
  return contextOnly ? "Treatment performance context" : "Treatment segment underperformance";
}

function treatmentText(ref: DetectorReadinessServingRef, contextOnly: boolean): string {
  if (ref.detectorId === "treatment_scope_gap") {
    return contextOnly
      ? "A slow segment adds context for treatment coverage, but the evidence is caveated."
      : "This slow segment appears outside the confirmed treatment coverage.";
  }
  return contextOnly
    ? "A treated segment adds performance context, but the evidence is caveated."
    : "Bus-priority treatment overlaps here, but this segment still underperforms.";
}

function segmentTarget(ref: DetectorReadinessServingRef): StudioRouteInsight["target"] {
  const parts = ref.scopeId.split(":");
  const [routeId, month, direction, rawSegmentIndex, fromNodeId, toNodeId] = parts;
  if (
    routeId === undefined ||
    month === undefined ||
    direction === undefined ||
    rawSegmentIndex === undefined ||
    fromNodeId === undefined ||
    toNodeId === undefined
  ) {
    return undefined;
  }

  const segmentIndex = Number(rawSegmentIndex);
  if (!Number.isInteger(segmentIndex) || segmentIndex < 0) {
    return undefined;
  }

  const segmentId = `${routeId}:${month}:${direction}:${segmentIndex}:${fromNodeId}:${toNodeId}`;
  const segmentIds = routeId.endsWith("+")
    ? [segmentId]
    : [segmentId, `${routeId}+:${month}:${direction}:${segmentIndex}:${fromNodeId}:${toNodeId}`];

  return {
    segmentIds,
    direction,
    segmentIndex,
    fromNodeId,
    toNodeId,
  };
}

type GenericDetectorInsightCopy = {
  readonly kind: StudioRouteInsight["kind"];
  readonly placement: StudioRouteInsight["placement"];
  readonly contextPlacement?: StudioRouteInsight["placement"];
  readonly title: string;
  readonly contextTitle?: string;
  readonly shortText: string;
  readonly contextShortText?: string;
  readonly severity: StudioRouteInsight["severity"];
  readonly contextSeverity?: StudioRouteInsight["severity"];
  readonly perRef?: boolean;
  readonly target?: (ref: DetectorReadinessServingRef) => StudioRouteInsight["target"];
};

const GENERIC_DETECTOR_INSIGHT_COPY: Readonly<Record<string, GenericDetectorInsightCopy>> = {
  source_gap: {
    kind: "performance_annotation",
    placement: "chart_annotation",
    title: "Data source gap",
    contextTitle: "Data source context",
    shortText: "A required source was missing, stale, or did not join cleanly for this route.",
    contextShortText: "Source availability adds context for this route-month signal.",
    severity: "low",
    contextSeverity: "low",
  },
  persistent_speed_hotspot: {
    kind: "map_segment",
    placement: "map_segment",
    contextPlacement: "chart_annotation",
    title: "Persistent speed hotspot",
    contextTitle: "Persistent speed context",
    shortText: "A segment on this route has persistent low-speed evidence.",
    contextShortText: "Persistent segment-speed evidence adds context for this route.",
    severity: "medium",
    contextSeverity: "low",
    perRef: true,
    target: segmentTarget,
  },
  speed_pace_hotspot: {
    kind: "map_segment",
    placement: "map_segment",
    contextPlacement: "chart_annotation",
    title: "Segment pace hotspot",
    contextTitle: "Segment pace context",
    shortText: "A segment-daypart runs materially slower than its free-flow pace baseline.",
    contextShortText: "Segment-daypart pace evidence adds context for this route.",
    severity: "medium",
    contextSeverity: "low",
    perRef: true,
    target: segmentTarget,
  },
  multi_month_speed_peer: {
    kind: "performance_annotation",
    placement: "overview",
    contextPlacement: "chart_annotation",
    title: "Multi-month peer speed deficit",
    contextTitle: "Peer speed context",
    shortText: "This route has a multi-month speed pattern below its matched peer median.",
    contextShortText: "Peer speed evidence adds context for this route-month comparison.",
    severity: "medium",
    contextSeverity: "low",
  },
  observed_reliability: {
    kind: "performance_annotation",
    placement: "overview",
    contextPlacement: "chart_annotation",
    title: "Observed reliability risk",
    contextTitle: "Observed reliability context",
    shortText: "Observed headway data shows elevated long-gap or wait reliability risk.",
    contextShortText: "Observed headway data adds reliability context for this route.",
    severity: "medium",
    contextSeverity: "low",
  },
  headway_reliability_ewt: {
    kind: "performance_annotation",
    placement: "chart_annotation",
    title: "Excess wait hotspot",
    contextTitle: "Excess wait context",
    shortText: "Stop-hour headway evidence indicates estimated excess rider wait.",
    contextShortText: "Stop-hour headway evidence adds excess-wait context for this route.",
    severity: "medium",
    contextSeverity: "low",
  },
  bunching_hotspots: {
    kind: "performance_annotation",
    placement: "chart_annotation",
    title: "Bunching or long-gap hotspot",
    contextTitle: "Bunching context",
    shortText: "Stop-hour headway evidence shows elevated bunching or long-gap rates.",
    contextShortText: "Stop-hour headway evidence adds bunching or long-gap context.",
    severity: "medium",
    contextSeverity: "low",
  },
  rider_weighted_excess_wait: {
    kind: "performance_annotation",
    placement: "chart_annotation",
    title: "Rider-weighted excess wait",
    contextTitle: "Rider-weighted wait context",
    shortText: "Excess-wait evidence is weighted by rider exposure for this route.",
    contextShortText: "Rider-weighted wait evidence adds context for this route.",
    severity: "medium",
    contextSeverity: "low",
  },
  travel_time_variability: {
    kind: "performance_annotation",
    placement: "chart_annotation",
    title: "Travel-time variability",
    contextTitle: "Travel-time variability context",
    shortText: "Observed trips show a wide P95-vs-P50 runtime spread for this route.",
    contextShortText: "Runtime-spread evidence adds context for this route.",
    severity: "medium",
    contextSeverity: "low",
  },
  schedule_mismatch: {
    kind: "performance_annotation",
    placement: "chart_annotation",
    title: "Schedule mismatch review",
    contextTitle: "Schedule mismatch context",
    shortText: "Observed runtime differs enough from the schedule to suggest schedule review.",
    contextShortText: "Observed-vs-scheduled runtime evidence adds context for this route.",
    severity: "medium",
    contextSeverity: "low",
  },
  degradation_trend: {
    kind: "timeline_annotation",
    placement: "timeline",
    title: "Degradation trend",
    contextTitle: "Degradation context",
    shortText: "History shows a worsening route metric relative to its comparison baseline.",
    contextShortText: "Historical trend evidence adds context for this route.",
    severity: "medium",
    contextSeverity: "low",
  },
  positive_deviance: {
    kind: "timeline_annotation",
    placement: "timeline",
    title: "Positive deviance",
    contextTitle: "Positive deviance context",
    shortText:
      "This route performs unusually well versus its peer baseline for at least one metric.",
    contextShortText: "Positive peer-comparison evidence adds context for this route.",
    severity: "low",
    contextSeverity: "low",
  },
  intervention_gap: {
    kind: "performance_annotation",
    placement: "overview",
    contextPlacement: "chart_annotation",
    title: "Intervention coverage gap",
    contextTitle: "Intervention coverage context",
    shortText:
      "Route pain is high while current bus-priority treatment evidence is thin or missing.",
    contextShortText: "Treatment-coverage evidence adds context for this route.",
    severity: "medium",
    contextSeverity: "low",
  },
  intervention_event_study: {
    kind: "timeline_annotation",
    placement: "timeline",
    title: "Intervention event-study context",
    contextTitle: "Intervention event-study context",
    shortText: "Event-study evidence is available for a treatment window on this route.",
    contextShortText: "Event-study evidence adds context for this treatment window.",
    severity: "medium",
    contextSeverity: "low",
  },
  intervention_underperformance: {
    kind: "performance_annotation",
    placement: "overview",
    contextPlacement: "chart_annotation",
    title: "Treatment underperformance",
    contextTitle: "Treatment underperformance context",
    shortText:
      "This route still underperforms despite current or evaluated bus-priority treatment evidence.",
    contextShortText: "Treatment-performance evidence adds context for this route.",
    severity: "medium",
    contextSeverity: "low",
  },
  permit_correlated_slowdown: {
    kind: "timeline_annotation",
    placement: "timeline",
    title: "Permit-correlated slowdown context",
    contextTitle: "Permit-correlated slowdown context",
    shortText:
      "Slowdown evidence overlaps permit activity; treat this as context, not a causal claim.",
    contextShortText: "Permit activity overlaps route-month slowdown evidence.",
    severity: "medium",
    contextSeverity: "low",
  },
  service_request_context: {
    kind: "timeline_annotation",
    placement: "timeline",
    title: "Service-request context",
    contextTitle: "Service-request context",
    shortText: "Service-request context overlaps route-month slowdown evidence.",
    contextShortText: "Service-request evidence adds route-month context.",
    severity: "low",
    contextSeverity: "low",
  },
  delay_concentration: {
    kind: "performance_annotation",
    placement: "chart_annotation",
    title: "Delay concentration",
    contextTitle: "Delay concentration context",
    shortText: "Delay is concentrated in a small share of observed segments on this route.",
    contextShortText: "Delay concentration evidence adds context for this route.",
    severity: "medium",
    contextSeverity: "low",
  },
};

function buildTreatmentInsight(input: {
  ref: DetectorReadinessServingRef;
  contextOnly: boolean;
}): StudioRouteInsight | null {
  if (
    input.ref.detectorId !== "treatment_scope_gap" &&
    input.ref.detectorId !== "treatment_scope_mismatch"
  ) {
    return null;
  }
  return StudioRouteInsightSchema.parse({
    routeId: input.ref.routeId,
    kind: "treatment_scope",
    placement: input.contextOnly ? "chart_annotation" : "map_segment",
    title: treatmentTitle(input.ref.detectorId, input.contextOnly),
    shortText: treatmentText(input.ref, input.contextOnly),
    severity: input.contextOnly ? "low" : "medium",
    month: input.ref.month,
    asOfMonth: input.ref.asOfMonth,
    scopeId: input.ref.scopeId,
    target: segmentTarget(input.ref),
    detectorId: input.ref.detectorId,
    refs: refsForInsight([input.ref]),
    caveatsForTooltip: caveatsForTooltip([input.ref]),
  });
}

function buildGenericDetectorInsight(input: {
  readonly routeId: string;
  readonly detectorId: string;
  readonly refs: readonly DetectorReadinessServingRef[];
  readonly contextOnly: boolean;
}): StudioRouteInsight | null {
  const copy = GENERIC_DETECTOR_INSIGHT_COPY[input.detectorId];
  const first = input.refs[0];
  if (copy === undefined || first === undefined) return null;

  return StudioRouteInsightSchema.parse({
    routeId: input.routeId,
    kind: copy.kind,
    placement: input.contextOnly ? (copy.contextPlacement ?? copy.placement) : copy.placement,
    title: input.contextOnly ? (copy.contextTitle ?? copy.title) : copy.title,
    shortText: input.contextOnly ? (copy.contextShortText ?? copy.shortText) : copy.shortText,
    severity: input.contextOnly ? (copy.contextSeverity ?? "low") : copy.severity,
    month: monthFor(input.refs),
    asOfMonth: asOfMonthFor(input.refs),
    scopeId: input.refs.length === 1 ? first.scopeId : undefined,
    target: copy.target?.(first),
    detectorId: input.detectorId,
    refs: refsForInsight(input.refs),
    caveatsForTooltip: caveatsForTooltip(input.refs),
  });
}

function buildGenericDetectorInsights(input: {
  readonly routeId: string;
  readonly refs: readonly DetectorReadinessServingRef[];
  readonly contextOnly: boolean;
}): StudioRouteInsight[] {
  const groupedRefs = new Map<string, DetectorReadinessServingRef[]>();
  const insights: StudioRouteInsight[] = [];

  for (const ref of input.refs) {
    const copy = GENERIC_DETECTOR_INSIGHT_COPY[ref.detectorId];
    if (copy === undefined) continue;

    if (copy.perRef === true) {
      const insight = buildGenericDetectorInsight({
        routeId: input.routeId,
        detectorId: ref.detectorId,
        refs: [ref],
        contextOnly: input.contextOnly,
      });
      if (insight !== null) insights.push(insight);
      continue;
    }

    const refsForDetector = groupedRefs.get(ref.detectorId) ?? [];
    refsForDetector.push(ref);
    groupedRefs.set(ref.detectorId, refsForDetector);
  }

  for (const [detectorId, refs] of groupedRefs) {
    const insight = buildGenericDetectorInsight({
      routeId: input.routeId,
      detectorId,
      refs,
      contextOnly: input.contextOnly,
    });
    if (insight !== null) insights.push(insight);
  }

  return insights;
}

function sortInsights(insights: readonly StudioRouteInsight[]): StudioRouteInsight[] {
  const severityRank = { high: 0, medium: 1, low: 2 };
  const placementRank = { overview: 0, map_segment: 1, chart_annotation: 2, timeline: 3 };
  return [...insights].sort(
    (left, right) =>
      severityRank[left.severity] - severityRank[right.severity] ||
      placementRank[left.placement] - placementRank[right.placement] ||
      left.detectorId.localeCompare(right.detectorId) ||
      (left.scopeId ?? "").localeCompare(right.scopeId ?? ""),
  );
}

export function buildRouteInsightsFromDetectorReadiness(input: {
  readonly manifest: DetectorReadinessServingManifestForInsights;
  readonly routeId: string;
  readonly includeRouteContext?: boolean;
}): StudioRouteInsight[] {
  const route = input.manifest.routes.find((row) => row.routeId === input.routeId);
  if (route === undefined) return [];

  const includeRouteContext = input.includeRouteContext ?? true;
  // S4.1 serving readiness gate: a detector id may only feed public route insights if it is on the
  // studio-insight allowlist. The manifest schema already constrains buckets to
  // public_finding_candidate / route_context; this filter structurally excludes any uncalibrated /
  // unknown detector id that lands in a public bucket from reaching a public surface.
  const allowedDetectorIds = new Set<string>(STUDIO_ROUTE_INSIGHT_DETECTOR_IDS);
  for (const blocked of SERVING_BLOCKED_DETECTOR_IDS) allowedDetectorIds.delete(blocked);
  const publicRefs = route.publicFindingCandidateRefs.filter((ref) =>
    allowedDetectorIds.has(ref.detectorId),
  );
  const contextRefs = (includeRouteContext ? route.routeContextRefs : []).filter((ref) =>
    allowedDetectorIds.has(ref.detectorId),
  );

  const insights: StudioRouteInsight[] = [];
  const publicCustomerJourneyRefs = publicRefs.filter(
    (ref) => ref.detectorId === "customer_journey_shortfall",
  );
  const contextCustomerJourneyRefs = contextRefs.filter(
    (ref) => ref.detectorId === "customer_journey_shortfall",
  );
  const publicCustomerJourney = buildCustomerJourneyInsight({
    routeId: input.routeId,
    refs: publicCustomerJourneyRefs,
    contextOnly: false,
  });
  if (publicCustomerJourney !== null) insights.push(publicCustomerJourney);

  if (publicCustomerJourneyRefs.length === 0) {
    const contextCustomerJourney = buildCustomerJourneyInsight({
      routeId: input.routeId,
      refs: contextCustomerJourneyRefs,
      contextOnly: true,
    });
    if (contextCustomerJourney !== null) insights.push(contextCustomerJourney);
  }

  for (const ref of publicRefs) {
    const treatmentInsight = buildTreatmentInsight({ ref, contextOnly: false });
    if (treatmentInsight !== null) insights.push(treatmentInsight);
  }

  for (const ref of contextRefs) {
    const treatmentInsight = buildTreatmentInsight({ ref, contextOnly: true });
    if (treatmentInsight !== null) insights.push(treatmentInsight);
  }

  insights.push(
    ...buildGenericDetectorInsights({
      routeId: input.routeId,
      refs: publicRefs,
      contextOnly: false,
    }),
  );

  insights.push(
    ...buildGenericDetectorInsights({
      routeId: input.routeId,
      refs: contextRefs,
      contextOnly: true,
    }),
  );

  return sortInsights(insights);
}
