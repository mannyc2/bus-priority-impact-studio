import {
  buildLatticeOpportunityBundles,
  LATTICE_REVIEW_BUNDLE_METHOD_ID,
  type LatticeOpportunityBundle,
  type LatticeOpportunityInterventionStatus,
  type LatticeOpportunityRouteAssessment,
  type LatticeOpportunityRouteInput,
  type LatticeOpportunityScoringComponents,
} from "@bp/analytics";

export type ReviewPacketArtifact = {
  packets?: ReviewPacket[];
};

type ReviewPacket = {
  candidate?: PacketCandidate;
  evidenceObjects?: {
    primary?: unknown[];
    context?: unknown[];
    counterEvidence?: unknown[];
    caveats?: unknown[];
    missingData?: unknown[];
    coverageAudit?: unknown[];
  };
};

type PacketCandidate = {
  candidateId?: unknown;
  detectorId?: unknown;
  routeId?: unknown;
  scopeId?: unknown;
  category?: unknown;
  detectorScore?: unknown;
  reasonCode?: unknown;
  claimText?: unknown;
};

export type SignalFeaturesArtifact = {
  features?: SignalFeature[];
};

type SignalFeature = {
  routeId?: unknown;
  scopeId?: unknown;
  month?: unknown;
  maxHotspotScore?: unknown;
  permitTouchedEventCount?: unknown;
  contextTouchedEventCount?: unknown;
  contextHighConfidenceTouchCount?: unknown;
  contextEventCounts?: Array<{
    sourceId?: unknown;
    eventKind?: unknown;
    touchedEventCount?: unknown;
    highConfidenceTouchCount?: unknown;
    matchWeightSum?: unknown;
  }>;
};

type RouteSourceSummary = {
  detectorScores: Record<string, number>;
  detectorCounts: Record<string, number>;
  candidateIds: Record<string, string[]>;
  notes: string[];
};

export type LatticeOpportunityPreviewRow = {
  routeId: string;
  reviewScore: number;
  opportunityKinds: string[];
  scoringComponents: LatticeOpportunityScoringComponents | null;
  claimText: string;
  sourceDetectorScores: Record<string, number>;
  sourceCandidateIds: Record<string, string[]>;
};

export type LatticeOpportunityPreviewArtifact = {
  artifactKind: "lattice_review_bundle_preview";
  schemaVersion: 1;
  generatedAt: string;
  month: string;
  bundleRunId: string;
  sourceArtifacts: {
    reviewPackets: string;
    signalFeatures: string;
  };
  note: string;
  summary: {
    routeInputCount: number;
    routeWithSourceSignalCount: number;
    bundleCount: number;
    assessmentCount: number;
    bundleAssessmentCount: number;
    cleanAssessmentCount: number;
    abstainedAssessmentCount: number;
    opportunityKindCounts: Record<string, number>;
  };
  routeInputs: LatticeOpportunityRouteInput[];
  previewRows: LatticeOpportunityPreviewRow[];
  bundles: LatticeOpportunityBundle[];
  assessments: LatticeOpportunityRouteAssessment[];
};

type BuildRouteInputsInput = {
  reviewPackets: ReviewPacketArtifact | null;
  signalFeatures: SignalFeaturesArtifact | null;
};

type BuildRouteInputsOutput = {
  routes: LatticeOpportunityRouteInput[];
  routeSources: Record<string, RouteSourceSummary>;
};

type BuildPreviewInput = {
  month: string;
  generatedAt: string;
  bundleRunId: string;
  sourceArtifacts: LatticeOpportunityPreviewArtifact["sourceArtifacts"];
  reviewPackets: ReviewPacketArtifact | null;
  signalFeatures: SignalFeaturesArtifact | null;
};

const SPEED_DETECTORS = new Set([
  "persistent_speed_hotspot",
  "speed_pace_hotspot",
  "delay_concentration",
  "multi_month_speed_peer",
  "degradation_trend",
]);

const RELIABILITY_DETECTORS = new Set([
  "observed_reliability",
  "headway_reliability_ewt",
  "bunching_hotspots",
  "rider_weighted_excess_wait",
]);

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function maxNullable(values: readonly (number | null | undefined)[]): number | null {
  const numeric = values.filter((value): value is number => typeof value === "number");
  return numeric.length === 0 ? null : Math.max(...numeric);
}

function scaledEventScore(value: number | null | undefined): number | null {
  if (value === null || value === undefined || value <= 0) return null;
  return Math.round(Math.min(88, 20 + Math.log1p(value) * 8));
}

function typedObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function evidenceObjects(packet: ReviewPacket): unknown[] {
  const objects = packet.evidenceObjects;
  if (objects === undefined) return [];
  return [
    ...(objects.primary ?? []),
    ...(objects.context ?? []),
    ...(objects.counterEvidence ?? []),
    ...(objects.caveats ?? []),
    ...(objects.missingData ?? []),
    ...(objects.coverageAudit ?? []),
  ];
}

function ensureSource(routeSources: Map<string, RouteSourceSummary>, routeId: string) {
  let source = routeSources.get(routeId);
  if (source === undefined) {
    source = {
      detectorScores: {},
      detectorCounts: {},
      candidateIds: {},
      notes: [],
    };
    routeSources.set(routeId, source);
  }
  return source;
}

function maxDetectorScore(source: RouteSourceSummary, detectorId: string): number | null {
  return source.detectorScores[detectorId] ?? null;
}

function pushUnique(values: string[], value: string) {
  if (!values.includes(value)) values.push(value);
}

function addCandidateSource(
  routeSources: Map<string, RouteSourceSummary>,
  candidate: PacketCandidate,
) {
  const routeId = text(candidate.routeId);
  const detectorId = text(candidate.detectorId);
  if (routeId === null || detectorId === null) return;

  const source = ensureSource(routeSources, routeId);
  const score = numberValue(candidate.detectorScore);
  if (score !== null) {
    source.detectorScores[detectorId] = Math.max(source.detectorScores[detectorId] ?? 0, score);
  }
  source.detectorCounts[detectorId] = (source.detectorCounts[detectorId] ?? 0) + 1;

  const candidateId = text(candidate.candidateId);
  if (candidateId !== null) {
    source.candidateIds[detectorId] ??= [];
    pushUnique(source.candidateIds[detectorId], candidateId);
  }
}

function eventKindScore(feature: SignalFeature, eventKinds: readonly string[]): number | null {
  const counts = feature.contextEventCounts ?? [];
  const score = counts
    .filter((event) => {
      const eventKind = text(event.eventKind);
      return eventKind !== null && eventKinds.includes(eventKind);
    })
    .reduce((sum, event) => {
      const touched = numberValue(event.touchedEventCount) ?? 0;
      const highConfidence = numberValue(event.highConfidenceTouchCount) ?? 0;
      const weighted = numberValue(event.matchWeightSum) ?? 0;
      return sum + Math.max(touched, highConfidence * 2, weighted);
    }, 0);
  return scaledEventScore(score);
}

function addSignalFeature(
  routeSources: Map<string, RouteSourceSummary>,
  featureScores: Map<string, Partial<LatticeOpportunityRouteInput>>,
  feature: SignalFeature,
) {
  const routeId = text(feature.routeId) ?? text(feature.scopeId);
  if (routeId === null) return;

  const permitScore = maxNullable([
    scaledEventScore(numberValue(feature.permitTouchedEventCount)),
    eventKindScore(feature, ["permit"]),
  ]);
  const serviceRequestScore = maxNullable([
    eventKindScore(feature, ["311_complaint"]),
    scaledEventScore(numberValue(feature.contextHighConfidenceTouchCount)),
  ]);
  const hotspotScore = numberValue(feature.maxHotspotScore);

  const existing = featureScores.get(routeId) ?? {};
  featureScores.set(routeId, {
    ...existing,
    speedPainScore: maxNullable([existing.speedPainScore, hotspotScore]),
    permitContextScore: maxNullable([existing.permitContextScore, permitScore]),
    serviceRequestContextScore: maxNullable([
      existing.serviceRequestContextScore,
      serviceRequestScore,
    ]),
  });

  const source = ensureSource(routeSources, routeId);
  if (permitScore !== null) source.detectorScores["signal_feature_permit_context"] = permitScore;
  if (serviceRequestScore !== null) {
    source.detectorScores["signal_feature_service_request_context"] = serviceRequestScore;
  }
  if (hotspotScore !== null) source.detectorScores["signal_feature_speed_hotspot"] = hotspotScore;
}

function interventionStatusPriority(status: LatticeOpportunityInterventionStatus): number {
  if (status === "dated_or_evaluated") return 4;
  if (status === "future_only") return 3;
  if (status === "thin_source_gap") return 2;
  return 1;
}

function strongestInterventionStatus(
  current: LatticeOpportunityInterventionStatus,
  next: LatticeOpportunityInterventionStatus,
): LatticeOpportunityInterventionStatus {
  return interventionStatusPriority(next) > interventionStatusPriority(current) ? next : current;
}

function interventionStatusFromPacket(
  candidate: PacketCandidate,
  objects: readonly unknown[],
): LatticeOpportunityInterventionStatus | null {
  const detectorId = text(candidate.detectorId);
  const reasonCode = text(candidate.reasonCode);
  if (detectorId === "intervention_event_study" || detectorId === "intervention_underperformance") {
    return "dated_or_evaluated";
  }
  for (const rawObject of objects) {
    const object = typedObject(rawObject);
    const status = text(object?.["interventionEvidenceStatus"]);
    if (
      status === "absent" ||
      status === "thin_source_gap" ||
      status === "future_only" ||
      status === "dated_or_evaluated"
    ) {
      return status;
    }
  }
  return reasonCode === "source_gap" ? "thin_source_gap" : null;
}

function updateInterventionShape(
  route: LatticeOpportunityRouteInput,
  candidate: PacketCandidate,
  objects: readonly unknown[],
) {
  const detectorId = text(candidate.detectorId);
  const score = numberValue(candidate.detectorScore);
  const status = interventionStatusFromPacket(candidate, objects);
  if (status !== null) {
    route.interventionEvidenceStatus = strongestInterventionStatus(
      route.interventionEvidenceStatus,
      status,
    );
  }

  if (detectorId === "intervention_underperformance") {
    route.interventionUnderperformanceScore = maxNullable([
      route.interventionUnderperformanceScore,
      score,
    ]);
  }
  if (detectorId === "positive_deviance") {
    route.positiveDevianceScore = maxNullable([route.positiveDevianceScore, score]);
    route.interventionEvidenceStatus = strongestInterventionStatus(
      route.interventionEvidenceStatus,
      "dated_or_evaluated",
    );
  }

  for (const rawObject of objects) {
    const object = typedObject(rawObject);
    const eventId = text(object?.["eventId"]) ?? text(object?.["selectedEventId"]);
    const interventionType = text(object?.["interventionType"]);
    if (eventId?.startsWith("ace:") || interventionType === "automated_bus_lane_enforcement") {
      route.aceStatus = "active";
    }
    if (eventId?.startsWith("bus-lane:") || interventionType === "bus_lane_infrastructure") {
      route.busLaneStatus = "present";
    }
  }
}

function routeInputFromSource(
  routeId: string,
  source: RouteSourceSummary,
  featureScores: Partial<LatticeOpportunityRouteInput>,
): LatticeOpportunityRouteInput {
  return {
    routeId,
    speedPainScore: maxNullable([
      featureScores.speedPainScore,
      ...[...SPEED_DETECTORS].map((detectorId) => maxDetectorScore(source, detectorId)),
    ]),
    reliabilityPainScore: maxNullable(
      [...RELIABILITY_DETECTORS].map((detectorId) => maxDetectorScore(source, detectorId)),
    ),
    interventionEvidenceStatus: "absent",
    busLaneStatus: "unknown",
    aceStatus: "unknown",
    permitContextScore: maxNullable([
      featureScores.permitContextScore,
      maxDetectorScore(source, "permit_correlated_slowdown"),
    ]),
    serviceRequestContextScore: maxNullable([
      featureScores.serviceRequestContextScore,
      maxDetectorScore(source, "service_request_context"),
    ]),
    scheduleMismatchScore: maxDetectorScore(source, "schedule_mismatch"),
    travelTimeVariabilityScore: maxDetectorScore(source, "travel_time_variability"),
    bunchingHotspotScore: maxDetectorScore(source, "bunching_hotspots"),
    riderWeightedExcessWaitScore: maxNullable([
      maxDetectorScore(source, "rider_weighted_excess_wait"),
      maxDetectorScore(source, "headway_reliability_ewt"),
    ]),
    interventionUnderperformanceScore: maxDetectorScore(source, "intervention_underperformance"),
    positiveDevianceScore: maxDetectorScore(source, "positive_deviance"),
  };
}

export function buildLatticeOpportunityRouteInputs(
  input: BuildRouteInputsInput,
): BuildRouteInputsOutput {
  const routeSources = new Map<string, RouteSourceSummary>();
  const featureScores = new Map<string, Partial<LatticeOpportunityRouteInput>>();
  const packets = input.reviewPackets?.packets ?? [];

  for (const packet of packets) {
    if (packet.candidate !== undefined) addCandidateSource(routeSources, packet.candidate);
  }
  for (const feature of input.signalFeatures?.features ?? []) {
    addSignalFeature(routeSources, featureScores, feature);
  }

  const routesById = new Map<string, LatticeOpportunityRouteInput>();
  const routeIds = new Set([...routeSources.keys(), ...featureScores.keys()]);
  for (const routeId of routeIds) {
    const source = ensureSource(routeSources, routeId);
    routesById.set(
      routeId,
      routeInputFromSource(routeId, source, featureScores.get(routeId) ?? {}),
    );
  }

  for (const packet of packets) {
    const candidate = packet.candidate;
    if (candidate === undefined) continue;
    const routeId = text(candidate.routeId);
    if (routeId === null) continue;
    const route = routesById.get(routeId);
    if (route === undefined) continue;
    updateInterventionShape(route, candidate, evidenceObjects(packet));
  }

  return {
    routes: [...routesById.values()].sort((left, right) =>
      left.routeId.localeCompare(right.routeId),
    ),
    routeSources: Object.fromEntries(
      [...routeSources.entries()].sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}

function countAssessments(
  assessments: readonly LatticeOpportunityRouteAssessment[],
  outcome: LatticeOpportunityRouteAssessment["outcome"],
) {
  return assessments.filter((row) => row.outcome === outcome).length;
}

function countOpportunityKinds(
  rows: readonly LatticeOpportunityPreviewRow[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    for (const kind of row.opportunityKinds) counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(
      ([leftKind, leftCount], [rightKind, rightCount]) =>
        rightCount - leftCount || leftKind.localeCompare(rightKind),
    ),
  );
}

export function buildLatticeOpportunityPreviewArtifact(
  input: BuildPreviewInput,
): LatticeOpportunityPreviewArtifact {
  const { routes, routeSources } = buildLatticeOpportunityRouteInputs(input);
  const output = buildLatticeOpportunityBundles({
    bundleRunId: input.bundleRunId,
    month: input.month,
    generatedAt: input.generatedAt,
    routes,
  });

  const previewRows = output.bundles
    .map((bundle) => {
      const source = routeSources[bundle.routeId] ?? {
        detectorScores: {},
        detectorCounts: {},
        candidateIds: {},
        notes: [],
      };
      return {
        routeId: bundle.routeId,
        reviewScore: bundle.reviewScore,
        opportunityKinds: bundle.opportunityKinds,
        scoringComponents: bundle.scoringComponents,
        claimText: bundle.claimText,
        sourceDetectorScores: source.detectorScores,
        sourceCandidateIds: source.candidateIds,
      };
    })
    .sort(
      (left, right) =>
        right.reviewScore - left.reviewScore || left.routeId.localeCompare(right.routeId),
    );

  return {
    artifactKind: "lattice_review_bundle_preview",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    month: input.month,
    bundleRunId: input.bundleRunId,
    sourceArtifacts: input.sourceArtifacts,
    note: "Experimental local-only review bundle. Results are not promoted, published, or surfaced in Studio; use the route packets to judge whether the archetype is useful.",
    summary: {
      routeInputCount: routes.length,
      routeWithSourceSignalCount: routes.filter((route) =>
        [
          route.speedPainScore,
          route.reliabilityPainScore,
          route.scheduleMismatchScore,
          route.travelTimeVariabilityScore,
          route.bunchingHotspotScore,
          route.riderWeightedExcessWaitScore,
          route.interventionUnderperformanceScore,
          route.positiveDevianceScore,
        ].some((value) => value !== null && value !== undefined),
      ).length,
      bundleCount: output.bundles.length,
      assessmentCount: output.assessments.length,
      bundleAssessmentCount: countAssessments(output.assessments, "bundle"),
      cleanAssessmentCount: countAssessments(output.assessments, "clean_no_bundle"),
      abstainedAssessmentCount: countAssessments(output.assessments, "abstained"),
      opportunityKindCounts: countOpportunityKinds(previewRows),
    },
    routeInputs: routes,
    previewRows,
    bundles: output.bundles,
    assessments: output.assessments,
  };
}

function markdownTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function sourceScoreSummary(scores: Record<string, number>): string {
  return Object.entries(scores)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 6)
    .map(([detectorId, score]) => `${detectorId} ${Math.round(score)}`)
    .join("; ");
}

function scoreFactorSummary(components: LatticeOpportunityScoringComponents | null): string {
  if (components === null) return "";
  const orderedKeys: Array<keyof LatticeOpportunityScoringComponents> = [
    "rawKindScore",
    "speedPainScore",
    "reliabilityPainScore",
    "contextScore",
    "reliabilityShapeScore",
    "scheduleMismatchScore",
    "treatmentSignalScore",
    "specificityScore",
    "ambiguityPenalty",
    "sourceThinnessPenalty",
  ];
  return orderedKeys
    .flatMap((key) => {
      const value = components[key];
      return value === undefined || value === null ? [] : [`${key} ${Math.round(value)}`];
    })
    .join("; ");
}

export function renderLatticeOpportunityPreviewMarkdown(
  artifact: LatticeOpportunityPreviewArtifact,
): string {
  const rows = artifact.previewRows.slice(0, 75);
  const opportunityKindRows = Object.entries(artifact.summary.opportunityKindCounts);
  const lines = [
    `# Lattice Review Bundles (${artifact.month})`,
    "",
    artifact.note,
    "",
    "## Summary",
    "",
    `- Routes evaluated: ${artifact.summary.routeInputCount}`,
    `- Routes with source signals: ${artifact.summary.routeWithSourceSignalCount}`,
    `- Review bundles: ${artifact.summary.bundleCount}`,
    `- Assessments: ${artifact.summary.bundleAssessmentCount} bundled, ${artifact.summary.cleanAssessmentCount} clean, ${artifact.summary.abstainedAssessmentCount} abstained`,
    "",
    "## Opportunity Mix",
    "",
    "| Opportunity | Routes |",
    "| --- | ---: |",
    ...opportunityKindRows.map(([kind, count]) => `| ${markdownTableCell(kind)} | ${count} |`),
    "",
    "## Top Review Bundles",
    "",
    "| Route | Score | Score factors | Opportunity | Source signals | Claim |",
    "| --- | ---: | --- | --- | --- | --- |",
  ];

  if (rows.length === 0) {
    lines.push("| n/a | n/a | n/a | n/a | n/a | No lattice review bundles emitted. |");
  } else {
    for (const row of rows) {
      lines.push(
        `| ${[
          markdownTableCell(row.routeId),
          String(Math.round(row.reviewScore)),
          markdownTableCell(scoreFactorSummary(row.scoringComponents)),
          markdownTableCell(row.opportunityKinds.join(", ")),
          markdownTableCell(sourceScoreSummary(row.sourceDetectorScores)),
          markdownTableCell(row.claimText),
        ].join(" | ")} |`,
      );
    }
  }

  lines.push(
    "",
    "## Review Guidance",
    "",
    "- Treat these as review leads, not causal claims or recommendations.",
    "- Check the source candidate IDs in the JSON before judging whether a route really has a useful MTA opportunity.",
    "- Bus-lane and ACE status are only inferred from existing intervention packets in this preview; missing packet evidence remains unknown.",
    "",
  );

  return `${lines.join("\n")}\n`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderLatticeOpportunityPreviewHtml(
  artifact: LatticeOpportunityPreviewArtifact,
): string {
  const kindRows = Object.entries(artifact.summary.opportunityKindCounts)
    .map(
      ([kind, count]) => `<tr><td>${escapeHtml(kind)}</td><td class="numeric">${count}</td></tr>`,
    )
    .join("\n");
  const previewRows = artifact.previewRows
    .slice(0, 200)
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.routeId)}</td><td class="numeric">${Math.round(
          row.reviewScore,
        )}</td><td>${escapeHtml(scoreFactorSummary(row.scoringComponents))}</td><td>${escapeHtml(
          row.opportunityKinds.join(", "),
        )}</td><td>${escapeHtml(
          sourceScoreSummary(row.sourceDetectorScores),
        )}</td><td>${escapeHtml(row.claimText)}</td></tr>`,
    )
    .join("\n");

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>Lattice Review Bundles (${escapeHtml(artifact.month)})</title>`,
    "<style>body{font-family:system-ui,sans-serif;line-height:1.5;margin:32px;max-width:1440px;color:#1b1b1b}table{border-collapse:collapse;width:100%;font-size:14px;margin:16px 0 28px}td,th{border:1px solid #ddd;padding:7px;vertical-align:top}th{background:#f4f4f4;text-align:left}.numeric{text-align:right;white-space:nowrap}.note{max-width:920px;color:#444}.summary{display:flex;gap:18px;flex-wrap:wrap;margin:18px 0}.pill{border:1px solid #ddd;padding:8px 10px;background:#fafafa}.pill strong{display:block;font-size:18px}</style>",
    "</head>",
    "<body>",
    `<h1>Lattice Review Bundles (${escapeHtml(artifact.month)})</h1>`,
    `<p class="note">${escapeHtml(artifact.note)}</p>`,
    '<div class="summary">',
    `<div class="pill"><strong>${artifact.summary.routeInputCount}</strong>routes evaluated</div>`,
    `<div class="pill"><strong>${artifact.summary.bundleCount}</strong>review bundles</div>`,
    `<div class="pill"><strong>${artifact.summary.abstainedAssessmentCount}</strong>abstained</div>`,
    `<div class="pill"><strong>${artifact.summary.routeWithSourceSignalCount}</strong>routes with source signals</div>`,
    "</div>",
    "<h2>Opportunity Mix</h2>",
    "<table><thead><tr><th>Opportunity</th><th>Routes</th></tr></thead><tbody>",
    kindRows,
    "</tbody></table>",
    "<h2>Review Bundles</h2>",
    "<table><thead><tr><th>Route</th><th>Score</th><th>Score factors</th><th>Opportunity</th><th>Source signals</th><th>Claim</th></tr></thead><tbody>",
    previewRows,
    "</tbody></table>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

export function latticeOpportunityPreviewBundleRunId(month: string): string {
  return `${LATTICE_REVIEW_BUNDLE_METHOD_ID}-${month}-preview`;
}
