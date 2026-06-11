import { type PromotedFinding, PromotedFindingsArtifactSchema } from "@bp/domain/findings";
import type { ReasoningStep } from "@bp/domain/studio/findings";
import { fromRepoRoot } from "../../lib/paths.ts";
import { readJsonIfExists } from "./_release-geometry.ts";
import type {
  FindingContextAppendixArtifact,
  FindingContextAppendixRoute,
  ReviewQueueArtifact,
  ReviewQueueCandidate,
  StudioFinding,
  StudioRoute,
} from "./_release-types.ts";

function humanizeReason(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function detectorCategory(input: {
  reasonCode: string;
  category: string;
}): StudioFinding["category"] {
  if (input.reasonCode.includes("intervention")) return "Treatment gap";
  if (input.reasonCode.includes("gap") || input.category === "data_quality") {
    return "Anomaly";
  }
  return "Emerging risk";
}

function buildDetectorFinding(candidate: ReviewQueueCandidate, route: StudioRoute): StudioFinding {
  const evidenceCount = candidate.evidenceRefCount ?? candidate.evidenceRefs?.length ?? 0;
  return {
    id: `detector-${candidate.candidateId}`,
    category: detectorCategory(candidate),
    routeSlug: route.slug,
    title: `${route.label}: ${humanizeReason(candidate.reasonCode)}`,
    body: candidate.claimText,
    metric: `${Math.round(candidate.detectorScore)}/100 detector score`,
    confidence: candidate.confidence === "high" ? "high" : "moderate",
    borough: route.borough,
    reasoning: [
      {
        index: 1,
        title: "Detector candidate",
        detail: candidate.claimText,
        source: `local_finding_candidate:${candidate.detectorId}`,
        tone: candidate.severity === "high" ? "warn" : "accent",
      },
      {
        index: 2,
        title: "Evidence links",
        detail: `${evidenceCount} detector evidence reference${evidenceCount === 1 ? "" : "s"} are attached for reviewer validation.`,
        source: "local_finding_evidence_link",
        tone: evidenceCount > 0 ? "accent" : "warn",
      },
    ],
    caveat: {
      id: `finding:${candidate.candidateId}:review-candidate`,
      title: "Detector review candidate",
      body: "This finding is derived from the local detector review queue. It should stay review-gated until the underlying evidence and source eligibility are approved for publication.",
    },
    comparableRoutes: [],
    review: {
      publicationState: "review_candidate",
      reviewState: candidate.reviewState ?? "needs_review",
      source: "detector_review_queue",
      candidateId: candidate.candidateId,
      detectorId: candidate.detectorId,
      claimSafeLabel: candidate.claimSafeLabel ?? "issue_needs_review",
    },
  };
}

function buildPromotedFinding(finding: PromotedFinding, route: StudioRoute): StudioFinding {
  const evidenceCount = finding.approvedEvidenceRefs.length;
  return {
    id: `promoted-${finding.promotedFindingId}`,
    category: detectorCategory(finding),
    routeSlug: route.slug,
    title: `${route.label}: ${humanizeReason(finding.reasonCode)}`,
    body: finding.claimText,
    metric: `${Math.round(finding.sourceCandidate.detectorScore)}/100 detector score`,
    confidence: finding.confidence === "high" ? "high" : "moderate",
    borough: route.borough,
    reasoning: [
      {
        index: 1,
        title: "Promoted detector finding",
        detail: finding.claimText,
        source: `promoted_finding:${finding.promotedFindingId}`,
        tone: finding.severity === "high" ? "warn" : "accent",
      },
      {
        index: 2,
        title: "Approved evidence",
        detail: `${evidenceCount} approved evidence reference${evidenceCount === 1 ? "" : "s"} are attached from reviewer decision ${finding.sourceDecisionId}.`,
        source: `review_decision:${finding.sourceDecisionId}`,
        tone: evidenceCount > 0 ? "accent" : "warn",
      },
      {
        index: 3,
        title: "Detector audit trail",
        detail: `Original candidate ${finding.sourceCandidateId} from ${finding.detectorId}; decision, candidate snapshot, and promoted finding hashes are preserved in review provenance.`,
        source: `local_finding_candidate:${finding.detectorId}`,
        tone: "accent",
      },
    ],
    caveat: {
      id: `finding:${finding.promotedFindingId}:reviewer-approved`,
      title: "Reviewer-approved detector finding",
      body: "This finding was promoted from a detector candidate by reviewer decision. The original candidate id, detector id, decision id, packet id, approved evidence refs, and immutable hashes stay attached for audit.",
    },
    comparableRoutes: [],
    review: {
      publicationState: "reviewed",
      reviewState: "approved",
      source: "promoted_finding",
      candidateId: finding.sourceCandidateId,
      detectorId: finding.detectorId,
      promotedFindingId: finding.promotedFindingId,
      decisionId: finding.sourceDecisionId,
      packetId: finding.sourcePacketId,
      approvedEvidenceRefs: finding.approvedEvidenceRefs,
      reviewRationale: finding.reviewRationale,
      decisionHash: finding.decisionHash,
      candidateSnapshotHash: finding.candidateSnapshotHash,
      promotedFindingHash: finding.promotedFindingHash,
      reviewedAt: finding.reviewedAt,
      reviewer: finding.reviewer,
      claimSafeLabel: finding.sourceCandidate.claimSafeLabel,
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numberField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function percentText(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function numberText(value: number | null, suffix = ""): string {
  return value === null ? "n/a" : `${value.toLocaleString("en-US")}${suffix}`;
}

function routeAppendixReasoningSteps(args: {
  route: StudioRoute;
  weather: unknown;
  appendix: FindingContextAppendixRoute | undefined;
  startIndex: number;
}): ReasoningStep[] {
  const steps: ReasoningStep[] = [];
  const equity = asRecord(args.appendix?.equity);
  if (equity !== null) {
    const band = stringField(equity, "equityPriorityBand") ?? "unscored";
    steps.push({
      index: args.startIndex + steps.length,
      title: "Equity context",
      detail: `${args.route.label} has ${band} equity-priority context: ${percentText(
        numberField(equity, "noVehicleHouseholdShare"),
      )} no-vehicle households, ${percentText(numberField(equity, "povertyRate"))} poverty rate, and ${percentText(
        numberField(equity, "publicTransitCommuterShare"),
      )} public-transit commuter share in the assigned ACS context.`,
      source: "route_equity_context appendix",
      tone: band === "high" || band === "medium" ? "warn" : "accent",
    });
  }

  const weather = asRecord(args.weather);
  if (weather !== null) {
    const rainDays = numberField(weather, "rainDayCount") ?? 0;
    const snowDays = numberField(weather, "snowDayCount") ?? 0;
    const highWindDays = numberField(weather, "highWindDayCount") ?? 0;
    steps.push({
      index: args.startIndex + steps.length,
      title: "Weather normalization",
      detail: `NOAA month context covers ${numberField(weather, "observationDayCount") ?? 0} observed days and ${
        numberField(weather, "stationCount") ?? 0
      } NYC stations. It records ${rainDays} rain days, ${snowDays} snow days, and ${highWindDays} high-wind days; route-level reliability checks use the observed headway weather split when available.`,
      source: "local_weather_observation appendix",
      tone: rainDays > 0 || snowDays > 0 || highWindDays > 0 ? "warn" : "good",
    });
  }

  const weatherReliability = asRecord(args.appendix?.weatherReliability);
  if (weatherReliability !== null) {
    const sampleSupport = stringField(weatherReliability, "sampleSupport") ?? "unknown";
    const interpretation = stringField(weatherReliability, "interpretation") ?? "unknown";
    const controlledSampleSupport =
      stringField(weatherReliability, "controlledWindowSampleSupport") ?? "unknown";
    const controlledInterpretation =
      stringField(weatherReliability, "controlledWindowInterpretation") ?? "unknown";
    const plannedServiceStatus =
      stringField(weatherReliability, "plannedServiceControlStatus") ?? "unknown";
    const plannedServiceMethod =
      stringField(weatherReliability, "plannedServiceBestMatchMethod") ?? "unknown";
    const passengerLoadStatus =
      stringField(weatherReliability, "passengerLoadControlStatus") ?? "unknown";
    const incidentStatus = stringField(weatherReliability, "incidentControlStatus") ?? "unknown";
    steps.push({
      index: args.startIndex + steps.length,
      title: "Observed reliability weather split",
      detail: `${args.route.label} has ${
        numberField(weatherReliability, "weatherImpactedSampleCount") ?? 0
      } observed headway samples on weather-impacted days and ${
        numberField(weatherReliability, "referenceSampleCount") ?? 0
      } on reference days. Long-gap share is ${percentText(
        numberField(weatherReliability, "weatherImpactedLongGapShare"),
      )} on weather days versus ${percentText(
        numberField(weatherReliability, "referenceLongGapShare"),
      )} on reference days; expected-wait delta is ${numberText(
        numberField(weatherReliability, "expectedWaitDeltaMinutes"),
        " min",
      )}. Matched local day/hour/direction/stop windows cover ${
        numberField(weatherReliability, "controlledWindowCount") ?? 0
      } buckets and ${
        numberField(weatherReliability, "controlledReferenceSampleCount") ?? 0
      } reference samples; controlled interpretation: ${controlledInterpretation}. Planned-service control is ${plannedServiceStatus}, with observed-to-scheduled expected-wait ratio ${numberText(
        numberField(weatherReliability, "controlledObservedToScheduledExpectedWaitRatio"),
      )} using ${plannedServiceMethod} schedule matching. Passenger-load control is ${passengerLoadStatus}, with average controlled-window ridership ${numberText(
        numberField(weatherReliability, "controlledPassengerLoadAverageRidership"),
      )}; incident control is ${incidentStatus}, with weather/reference incident-weight delta ${numberText(
        numberField(weatherReliability, "controlledIncidentWeightDelta"),
      )}.`,
      source:
        "local_observed_headway_sample + local_weather_observation + local_route_schedule_timepoint + local_route_hourly_ridership + local_context_event_route_touch appendix",
      tone:
        sampleSupport !== "sufficient_split" ||
        controlledSampleSupport !== "sufficient_split" ||
        plannedServiceStatus === "missing" ||
        passengerLoadStatus === "missing" ||
        incidentStatus === "missing" ||
        interpretation === "weather_conditions_worse" ||
        controlledInterpretation === "weather_conditions_worse"
          ? "warn"
          : "accent",
    });
  }

  const trafficVolume = asRecord(args.appendix?.trafficVolume);
  if (trafficVolume !== null) {
    const lag = numberField(trafficVolume, "lagMonths") ?? 0;
    steps.push({
      index: args.startIndex + steps.length,
      title: "Traffic-volume context",
      detail: `DOT traffic-volume context has ${
        numberField(trafficVolume, "observationCount") ?? 0
      } route-adjacent observations from ${stringField(trafficVolume, "sourceMonth") ?? "unknown month"} with lagMonths=${lag}. Treat it as street-load context, not same-month bus evidence when lagMonths is positive.`,
      source: "local_dot_traffic_volume_count appendix",
      tone: lag > 1 ? "warn" : "accent",
    });
  }

  const currentTrafficSpeed = asRecord(args.appendix?.currentTrafficSpeed);
  if (currentTrafficSpeed !== null) {
    steps.push({
      index: args.startIndex + steps.length,
      title: "Current traffic appendix",
      detail: `DOT realtime traffic-speed context has ${
        numberField(currentTrafficSpeed, "linkSampleCount") ?? 0
      } route-adjacent link samples from ${
        stringField(currentTrafficSpeed, "currentSignalDay") ?? "unknown day"
      } with relation ${
        stringField(currentTrafficSpeed, "temporalRelation") ?? "unknown"
      }. It describes current street conditions, not the historical release month.`,
      source: "local_dot_traffic_speed appendix",
      tone: "accent",
    });
  }

  return steps;
}

export function addFindingContextAppendix(input: {
  findings: readonly StudioFinding[];
  routes: readonly StudioRoute[];
  appendix: FindingContextAppendixArtifact | null;
}): StudioFinding[] {
  if (input.appendix?.artifactKind !== "finding_context_appendix") {
    return [...input.findings];
  }

  const routeBySlug = new Map(input.routes.map((route) => [route.slug, route]));
  const appendixByRoute = new Map(
    (input.appendix.routes ?? []).flatMap((route) =>
      typeof route.routeId === "string" ? [[route.routeId, route] as const] : [],
    ),
  );
  return input.findings.map((finding) => {
    const route = routeBySlug.get(finding.routeSlug);
    if (route === undefined) return finding;
    const steps = routeAppendixReasoningSteps({
      route,
      weather: input.appendix?.weather ?? null,
      appendix: appendixByRoute.get(route.routeId),
      startIndex: finding.reasoning.length + 1,
    });
    if (steps.length === 0) return finding;
    return {
      ...finding,
      reasoning: [...finding.reasoning, ...steps],
    };
  });
}

export async function readPromotedFindingsFromArtifact(input: {
  path: string;
  routes: readonly StudioRoute[];
  limit: number;
  excludedRouteSlugs: ReadonlySet<string>;
}): Promise<StudioFinding[]> {
  const artifact = await readJsonIfExists<unknown>(fromRepoRoot(input.path));
  if (artifact === null) {
    return [];
  }

  const promoted = PromotedFindingsArtifactSchema.parse(artifact);
  const routeById = new Map(input.routes.map((route) => [route.routeId, route]));
  const findings: StudioFinding[] = [];
  for (const finding of promoted.findings) {
    if (findings.length >= input.limit) break;
    if (finding.routeId === null) continue;
    const route = routeById.get(finding.routeId);
    if (route === undefined || input.excludedRouteSlugs.has(route.slug)) continue;
    findings.push(buildPromotedFinding(finding, route));
  }
  return findings;
}

export async function readDetectorFindingsFromReviewQueue(input: {
  path: string;
  routes: readonly StudioRoute[];
  limit: number;
  excludedRouteSlugs: ReadonlySet<string>;
}): Promise<StudioFinding[]> {
  const artifact = await readJsonIfExists<ReviewQueueArtifact>(fromRepoRoot(input.path));
  if (artifact?.artifactKind !== "finding_review_queue" || artifact.candidates === undefined) {
    return [];
  }

  const routeById = new Map(input.routes.map((route) => [route.routeId, route]));
  const usedRouteSlugs = new Set(input.excludedRouteSlugs);
  const findings: StudioFinding[] = [];
  for (const candidate of artifact.candidates) {
    if (findings.length >= input.limit) break;
    if (candidate.routeId === null) continue;
    const route = routeById.get(candidate.routeId);
    if (route === undefined || usedRouteSlugs.has(route.slug)) continue;
    findings.push(buildDetectorFinding(candidate, route));
    usedRouteSlugs.add(route.slug);
  }
  return findings;
}

export function buildReviewedFinding(route: StudioRoute): StudioFinding | null {
  if (route.routeId === "B25") {
    return {
      id: "b25-fulton-corridor-reliability-permits",
      category: "Emerging risk",
      routeSlug: route.slug,
      title: "B25 reliability problems persisted as March street-work context clustered nearby",
      body: "B25 is a reviewed, multi-dataset prioritization finding: persistent long-gap reliability, slow March speed evidence, and substantial DOT permit activity touching the Fulton Street / Downtown Brooklyn route corridor. This is not a causal permit-slowdown claim.",
      metric: "78.18% long-gap share",
      confidence: "high",
      borough: route.borough,
      reasoning: [
        {
          index: 1,
          title: "Persistent reliability",
          detail:
            "Bus Observatory data shows 13,700 March samples, a 78.18% long-gap share, 17.7054 wait reliability ratio, and 83.5272 excess wait minutes. Across 38 recovered Bus Observatory months, B25 averaged 79.46% long-gap share.",
          source: "local_route_observed_reliability_summary",
          tone: "warn",
        },
        {
          index: 2,
          title: "March speed evidence",
          detail:
            "The March route summary shows 6.47 mph weighted average speed, 1,973 speed observations, 31,203 bus trips, 1,177,096 ridership exposure, and 10 hotspot segments.",
          source: "local_route_hotspot_summary",
          tone: "accent",
        },
        {
          index: 3,
          title: "Worst sampled hotspot",
          detail:
            "The strongest B25 hotspot ran eastbound from Tillary St/Cadman Plaza East to Fulton St/Bond St at 4.63 mph, with 96.41% of observed windows classified as slow.",
          source: "local_route_hotspot",
          tone: "warn",
        },
        {
          index: 4,
          title: "Context touches",
          detail:
            "The route had 162 DOT permit touches in March, including 26 permit-record Fulton Street touches across 14 B25-linked physical street segments, plus collision, 311, parking, and ACE context touches.",
          source: "local_context_event_route_touch + local_dot_street_permit",
          tone: "accent",
        },
      ],
      caveat: {
        id: "finding:b25-fulton-priority-context:caveat",
        title: "Prioritization finding, not causality",
        body: "This review confirms route-corridor context, but it does not prove that DOT permits caused the B25 slowdown or touched the exact same physical segments as the worst speed hotspots.",
      },
      comparableRoutes: [],
      review: {
        publicationState: "reviewed",
        reviewState: "approved",
        source: "manual_review",
        candidateId: null,
        detectorId: null,
        claimSafeLabel: "issue_clean",
      },
    };
  }

  if (route.routeId === "BX41") {
    return {
      id: "bx41-webster-reliability-permits",
      category: "Emerging risk",
      routeSlug: route.slug,
      title: "BX41 pairs persistent reliability trouble with Webster Avenue street-work context",
      body: "BX41 is a reviewed, reliability-led prioritization finding: long-gap reliability has been persistently high, March speed evidence shows route hotspots, and Webster Avenue permit touches align with the route-LION bridge. This is still context, not proof of cause.",
      metric: "81.36% long-gap share",
      confidence: "high",
      borough: route.borough,
      reasoning: [
        {
          index: 1,
          title: "Persistent reliability",
          detail:
            "Bus Observatory data shows 5,848 March samples, an 81.36% long-gap share, 17.3109 wait reliability ratio, and 97.8653 excess wait minutes. Across 38 recovered Bus Observatory months, BX41 averaged 82.37% long-gap share.",
          source: "local_route_observed_reliability_summary",
          tone: "warn",
        },
        {
          index: 2,
          title: "March speed evidence",
          detail:
            "The March route summary shows 7.62 mph weighted average speed, 2,049 speed observations, 30,045 bus trips, 947,369 ridership exposure, and 10 hotspot segments.",
          source: "local_route_hotspot_summary",
          tone: "accent",
        },
        {
          index: 3,
          title: "Sample-supported hotspots",
          detail:
            "The strongest sample-supported hotspots include Melrose Av/E 160 St to Melrose Av/E 149 St at 6.15 mph and Webster Av/E 180 St to Webster Av/East Fordham Rd at 6.61 mph.",
          source: "local_route_hotspot",
          tone: "warn",
        },
        {
          index: 4,
          title: "Webster Avenue context",
          detail:
            "The route had 200 DOT permit touches in March. The 62 permit-record Webster Avenue touches span 14 BX41-linked physical street segments, 10 of which are also named WEBSTER AVE in the route-LION bridge.",
          source: "local_context_event_route_touch + local_dot_street_permit",
          tone: "accent",
        },
      ],
      caveat: {
        id: "finding:bx41-webster-reliability-permits:caveat",
        title: "Reliability-led context finding",
        body: "This finding should not say permits caused BX41's reliability problem or speed hotspots. It identifies a high-evidence corridor for manual review and public prioritization.",
      },
      comparableRoutes: [],
      review: {
        publicationState: "reviewed",
        reviewState: "approved",
        source: "manual_review",
        candidateId: null,
        detectorId: null,
        claimSafeLabel: "issue_clean",
      },
    };
  }

  return null;
}
