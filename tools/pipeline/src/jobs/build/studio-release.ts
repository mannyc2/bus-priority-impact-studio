import { Database } from "bun:sqlite";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  listRouteArtifacts,
  listRouteBriefSummaries,
  listRouteObservedReliabilitySummaries,
  listRouteReadiness,
  type RouteArtifactRow,
  type RouteBriefSummary,
  type RouteObservedReliabilitySummary,
  type RouteReadiness,
} from "@bp/db";
import { createBunSqliteServingDb } from "@bp/db/d1/bun-sqlite";
import {
  buildStudioBriefEvidenceProjection,
  buildStudioBriefHistoryProjection,
  buildStudioBriefProjection,
  buildStudioBriefsProjection,
  buildStudioDocsProjection,
  buildStudioFindingProjection,
  buildStudioFindingsProjection,
  buildStudioMethodsProjection,
  buildStudioRouteLadderProjection,
  buildStudioRouteProjection,
  buildStudioRoutesProjection,
  type ReasoningStep,
  type StudioBrief,
  type StudioFinding,
  type StudioFindingReview,
  type StudioMethodDataset,
  type StudioObservedReliability,
  type StudioReleasePayload,
  StudioReleasePayloadSchema,
  type StudioRoute,
  type StudioRouteArtifactRef,
  type StudioSegment,
} from "@bp/domain";
import { fromRepoRoot } from "../../source-manifest.js";

const defaultMonth = "2026-03";
const defaultOutputPath = "data/artifacts/studio/v1/release.json";
const defaultSchemaPath = "data/exports/d1/2026-03/schema.sql";
const defaultSeedPath = "data/exports/d1/2026-03/seed.sql";
const defaultRouteLimit = 12;
const defaultFindingLimit = 50;
const canonicalRouteIds = [
  "M15+",
  "BX12+",
  "B25",
  "BX41",
  "M101",
  "B41",
  "B46+",
  "Q58",
  "M14A+",
  "M14D+",
];

type ReleaseProfile = "demo" | "full";

type CliOptions = {
  month: string;
  outputPath: string;
  schemaPath: string;
  seedPath: string;
  routeLimit: number;
  findingLimit: number;
  reviewQueuePath: string;
  profile: ReleaseProfile;
};

type ReviewQueueCandidate = {
  candidateId: string;
  detectorId: string;
  routeId: string | null;
  reasonCode: string;
  category: string;
  severity: string;
  confidence: string;
  detectorScore: number;
  claimSafeLabel?: StudioFindingReview["claimSafeLabel"];
  claimText: string;
  reviewState?: StudioFindingReview["reviewState"];
  evidenceRefCount?: number;
  evidenceRefs?: string[];
};

type ReviewQueueArtifact = {
  artifactKind?: string;
  candidates?: ReviewQueueCandidate[];
};

type RouteBriefInputArtifact = {
  metrics?: {
    routeScore?: number;
    averageSpeedMph?: number;
    hotspotCount?: number;
    totalRidership?: number;
  };
  interventionStatus?: {
    aceActiveDuringAnalysisPeriod?: boolean;
    aceViolationCount?: number;
    busLaneMatchedLaneCount?: number;
  };
  topSegments?: Array<{
    segmentId: string;
    direction: string;
    from?: string;
    to?: string;
    weightedAverageSpeedMph?: number;
    weightedAverageTravelTimeMinutes?: number;
    averageRoadDistanceMiles?: number;
    slowWindowPercent?: number;
    ridershipExposure?: number;
    hotspotScore?: number;
  }>;
  caveats?: string[];
};

function readFlag(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing value for ${name}.`);
  }

  return value;
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function parseProfile(value: string | undefined): ReleaseProfile {
  if (value === undefined || value === "full") return "full";
  if (value === "demo") return "demo";
  throw new Error(`--profile must be "demo" or "full" (got "${value}")`);
}

function parseOptions(args: readonly string[]): CliOptions {
  const month = readFlag(args, "--month") ?? defaultMonth;
  return {
    month,
    outputPath: readFlag(args, "--output") ?? defaultOutputPath,
    schemaPath: readFlag(args, "--schema") ?? defaultSchemaPath,
    seedPath: readFlag(args, "--seed") ?? defaultSeedPath,
    routeLimit: parsePositiveInteger(readFlag(args, "--limit"), defaultRouteLimit, "--limit"),
    findingLimit: parsePositiveInteger(
      readFlag(args, "--finding-limit"),
      defaultFindingLimit,
      "--finding-limit",
    ),
    reviewQueuePath:
      readFlag(args, "--review-queue") ??
      join("data/artifacts/findings", month, "review-queue.json"),
    profile: parseProfile(readFlag(args, "--profile")),
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJsonIfExists<T>(path: string): Promise<T | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return null;
  }

  return (await file.json()) as T;
}

async function createServingDbFromExport(schemaPath: string, seedPath: string) {
  const sqlite = new Database(":memory:");
  sqlite.exec(await readFile(schemaPath, "utf8"));
  sqlite.exec(await readFile(seedPath, "utf8"));

  return {
    sqlite,
    db: createBunSqliteServingDb(sqlite),
  };
}

function routeIdToSlug(routeId: string): string {
  return routeId
    .toLowerCase()
    .replace(/\+/g, "-sbs")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function routeLabel(readiness: RouteReadiness): string {
  return readiness.routeShortName.replace("-SBS", "");
}

function routeBorough(routeId: string): string {
  const upper = routeId.toUpperCase();
  if (upper.startsWith("BX")) {
    return "Bronx";
  }
  if (upper.startsWith("B")) {
    return "Brooklyn";
  }
  if (upper.startsWith("Q")) {
    return "Queens";
  }
  if (upper.startsWith("S")) {
    return "Staten Island";
  }
  return "Manhattan";
}

function routeDirection(value: string | undefined): StudioSegment["direction"] {
  if (value === "N") {
    return "NB";
  }
  if (value === "S") {
    return "SB";
  }
  if (value === "E") {
    return "EB";
  }
  if (value === "W") {
    return "WB";
  }
  return "NB";
}

function laneCoverage(summary: RouteBriefSummary, readiness: RouteReadiness): number {
  if (readiness.stopCount === 0) {
    return 0;
  }

  return Math.min(100, Math.round((summary.busLaneMatchedLaneCount / readiness.stopCount) * 100));
}

function speedPercentile(routeScore: number): number {
  return Math.max(1, Math.min(99, 101 - routeScore));
}

function qualityCaveats(month: string): string[] {
  return [
    `Studio projections are generated from the ${month} D1 serving export and generated route/brief artifacts.`,
    "Realtime reliability is included only where the serving export contains observed reliability rows.",
    "Narrative text is deterministic copy generated from public serving metrics, not an official agency grade.",
  ];
}

async function routeBriefInput(
  routeId: string,
  month: string,
): Promise<RouteBriefInputArtifact | null> {
  const slug = routeId.toLowerCase();
  const path = fromRepoRoot(`data/artifacts/route-slices/${slug}-${month}/route-brief-input.json`);
  return readJsonIfExists<RouteBriefInputArtifact>(path);
}

function buildSegments(
  routeSlug: string,
  routeId: string,
  artifact: RouteBriefInputArtifact | null,
): StudioSegment[] {
  return (artifact?.topSegments ?? []).slice(0, 8).map((segment, index) => ({
    id: segment.segmentId,
    routeSlug,
    direction: routeDirection(segment.direction),
    from: segment.from ?? `Segment ${index + 1}`,
    to: segment.to ?? "Next timepoint",
    speedMph: Number((segment.weightedAverageSpeedMph ?? 0).toFixed(1)),
    scheduledMph: Number(((segment.weightedAverageSpeedMph ?? 0) * 1.18).toFixed(1)),
    riderHours: Math.round((segment.ridershipExposure ?? 0) / 100),
    lane: (segment.hotspotScore ?? 0) > 30 ? "partial" : "minimal",
    ace:
      routeId.includes("+") &&
      (artifact?.interventionStatus?.aceActiveDuringAnalysisPeriod ?? false),
    tsp: false,
    hours: Array.from({ length: 12 }, (_, hour) =>
      Math.max(0, Math.min(5, Math.round(((segment.slowWindowPercent ?? 0) / 20 + hour / 12) % 6))),
    ),
    miles: segment.averageRoadDistanceMiles,
    flagged: (segment.slowWindowPercent ?? 0) >= 60,
    aiNote: `${routeId} slows to ${Number((segment.weightedAverageSpeedMph ?? 0).toFixed(1))} mph between ${segment.from ?? "the prior stop"} and ${segment.to ?? "the next stop"}.`,
    suggestedSeeds: ["Check lane continuity", "Compare scheduled vs observed speed"],
  }));
}

function buildObservedReliability(
  row: RouteObservedReliabilitySummary | undefined,
): StudioObservedReliability | null {
  if (row === undefined) return null;
  const source: StudioObservedReliability["source"] = row.runId.startsWith("bus-observatory-")
    ? "third_party_recovered"
    : "official_self_collected";
  const caveats =
    source === "third_party_recovered"
      ? [
          "Observed reliability is recovered from the third-party Bus Observatory archive, not official MTA historical replay.",
          "Monthly public speed evidence remains official MTA Open Data; realtime evidence has separate provenance.",
        ]
      : ["Observed reliability comes from self-collected MTA Bus Time GTFS-RT snapshots."];
  if (row.reliabilityStatus === "insufficient_gtfs_rt_samples") {
    caveats.push(
      `Sample count (${row.sampleCount}) is below the minimum threshold (${row.minSampleThreshold}); headway statistics are not reported.`,
    );
  }
  return {
    month: row.month,
    runId: row.runId,
    source,
    releaseLayer: "observed_release",
    reliabilityStatus: row.reliabilityStatus,
    sampleCount: row.sampleCount,
    medianObservedHeadwayMinutes: row.medianObservedHeadwayMinutes,
    p90ObservedHeadwayMinutes: row.p90ObservedHeadwayMinutes,
    observedBunchingShare: row.observedBunchingShare,
    observedLongGapShare: row.observedLongGapShare,
    excessWaitMinutes: row.excessWaitMinutes,
    caveats,
  };
}

function buildRouteArtifactRef(row: RouteArtifactRow): StudioRouteArtifactRef {
  return {
    routeId: row.route_id,
    month: row.month,
    name: row.artifact_name,
    key: row.artifact_key,
    contentType: row.content_type,
    byteLength: row.byte_length,
    sha256: row.sha256,
  };
}

function buildRoute(
  readiness: RouteReadiness,
  summary: RouteBriefSummary,
  artifact: RouteBriefInputArtifact | null,
  peerSlug: string | null,
  observed: RouteObservedReliabilitySummary | undefined,
): StudioRoute {
  const slug = routeIdToSlug(readiness.routeId);
  const speedMph = Number((summary.averageSpeedMph || readiness.averageSpeedMph || 0).toFixed(1));
  const scheduledMph = Number((speedMph * 1.18).toFixed(1));
  const coverage = laneCoverage(summary, readiness);

  return {
    slug,
    routeId: readiness.routeId,
    label: routeLabel(readiness),
    corridor: readiness.routeLongName ?? readiness.routeShortName,
    corridorFull: readiness.routeLongName ?? readiness.routeShortName,
    borough: routeBorough(readiness.routeId),
    sbs: readiness.routeId.includes("+") || readiness.routeShortName.includes("SBS"),
    speedMph,
    scheduledMph,
    weightedAvgSpeed: speedMph,
    speedPercentile: speedPercentile(summary.routeScore),
    dailyRiders: Math.round(summary.totalRidership / 30),
    ridersYoyPct: 0,
    riderHoursLost: Math.round(
      (artifact?.topSegments ?? []).reduce(
        (total, segment) => total + (segment.ridershipExposure ?? 0) / 100,
        0,
      ),
    ),
    laneCoverage: coverage,
    aceStatus: summary.aceActive ? "active" : "none",
    aceSince: summary.aceActive ? "Serving export" : null,
    tspCoverage: "none",
    reliability:
      summary.routeScore >= 70
        ? "High attention route"
        : summary.routeScore >= 40
          ? "Watch list route"
          : "Lower-risk route",
    observedReliability: buildObservedReliability(observed),
    diagnosis: `${readiness.routeShortName} has a route score of ${summary.routeScore}, ${summary.hotspotCount} slow segment hotspots, ${speedMph} mph observed speed, and ${coverage}% lane coverage in the ${summary.month} serving export.`,
    spark: [0.92, 0.96, 1, 0.98, 1.02, 0.99, 1].map((factor) =>
      Number((speedMph * factor).toFixed(1)),
    ),
    termini: {
      north: readiness.routeLongName?.split(" - ")[0] ?? readiness.routeShortName,
      south: readiness.routeLongName?.split(" - ")[1] ?? "Terminal",
    },
    miles: Number(Math.max(1, readiness.shapeCount * 1.2).toFixed(1)),
    stops: readiness.stopCount,
    flags: [
      summary.aceActive ? "ACE active" : "ACE inactive",
      coverage > 0 ? "Bus lane matched" : "No matched bus lane",
      readiness.readinessStatus,
    ],
    peerSlug,
    interventions: [
      {
        year: summary.month.slice(0, 4),
        title: "Serving export generated",
        detail: `D1 route score, speed, ridership, and treatment rows for ${summary.month}.`,
      },
      ...(summary.aceActive
        ? [
            {
              year: summary.month.slice(0, 4),
              title: "ACE evidence present",
              detail: `${summary.aceViolationCount.toLocaleString("en-US")} ACE violations matched in serving data.`,
              tone: "warn" as const,
            },
          ]
        : []),
    ],
  };
}

function buildFinding(route: StudioRoute, segment: StudioSegment | undefined): StudioFinding {
  const canonical =
    route.slug === "m15-sbs"
      ? {
          id: "m15-full-treatment-still-declining",
          title: "Full treatment stack, still declining",
          body: `${route.label} has a full-treatment profile but still shows ${route.speedMph.toFixed(1)} mph observed speed in the serving release.`,
        }
      : route.slug === "bx12-sbs"
        ? {
            id: "bx12-ace-unchanged-violations",
            title: "ACE active with unchanged violations",
            body: `${route.label} is a positive-control SBS corridor with active treatment evidence and ${route.speedMph.toFixed(1)} mph observed speed.`,
          }
        : null;
  const reasoning: ReasoningStep[] = [
    {
      index: 1,
      title: "Route score",
      detail: `${route.label} is ranked with ${route.speedMph} mph observed speed and ${route.riderHoursLost.toLocaleString("en-US")} rider-hours of modeled delay exposure.`,
      source: "D1 route_brief_summary + route-slice artifact",
      tone: "accent",
    },
    {
      index: 2,
      title: "Treatment context",
      detail: `${route.laneCoverage}% bus-lane match and ${route.aceStatus === "active" ? "active" : "no"} ACE evidence are present in the serving projection.`,
      source: "D1 intervention/treatment serving tables",
      tone: route.aceStatus === "active" ? "warn" : "accent",
    },
  ];

  if (segment !== undefined) {
    reasoning.push({
      index: 3,
      title: "Slow segment",
      detail: `${segment.from} to ${segment.to} is one of the route's highest-scoring slow segments.`,
      source: "route-brief-input artifact",
      tone: "warn",
    });
  }

  return {
    id: canonical?.id ?? `finding-${route.slug}`,
    category: route.laneCoverage > 40 ? "Anomaly" : "Treatment gap",
    routeSlug: route.slug,
    title:
      canonical?.title ?? `${route.label} needs attention in the ${route.borough} serving release`,
    body:
      canonical?.body ??
      (segment === undefined
        ? `${route.label} has enough serving data for a route-level review, but no segment artifact was available for the current release.`
        : `${route.label} combines low observed speed with a flagged segment between ${segment.from} and ${segment.to}.`),
    metric: `${route.speedMph} mph observed speed`,
    confidence: route.speedPercentile <= 40 ? "high" : "moderate",
    borough: route.borough,
    reasoning,
    caveat: {
      title: "Generated finding",
      body: "This finding is generated deterministically from serving projections and should be reviewed before publication.",
    },
    comparableRoutes: [],
    review: {
      publicationState: "generated_candidate",
      reviewState: "unreviewed",
      source: "route_score_fallback",
      candidateId: null,
      detectorId: null,
      claimSafeLabel: "issue_needs_review",
    },
  };
}

function humanizeReason(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function detectorCategory(candidate: ReviewQueueCandidate): StudioFinding["category"] {
  if (candidate.reasonCode.includes("intervention")) return "Treatment gap";
  if (candidate.reasonCode.includes("gap") || candidate.category === "data_quality") {
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

async function readDetectorFindingsFromReviewQueue(input: {
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

function generatedFindingScore(route: StudioRoute, segment: StudioSegment | undefined): number {
  let score = 0;
  if (route.speedPercentile <= 10) score += 40;
  else if (route.speedPercentile <= 25) score += 28;
  else if (route.speedPercentile <= 40) score += 16;

  if (route.riderHoursLost >= 10_000) score += 30;
  else if (route.riderHoursLost >= 5_000) score += 20;
  else if (route.riderHoursLost >= 1_000) score += 8;

  const longGapShare = route.observedReliability?.observedLongGapShare ?? null;
  if (longGapShare !== null && longGapShare >= 0.7) score += 25;
  else if (longGapShare !== null && longGapShare >= 0.5) score += 18;
  else if (longGapShare !== null && longGapShare >= 0.35) score += 10;

  if (route.laneCoverage < 20 && route.speedPercentile <= 40) score += 15;
  if (segment?.flagged === true) score += 10;
  return score;
}

function selectGeneratedFindings(input: {
  routes: readonly StudioRoute[];
  segments: readonly StudioSegment[];
  reviewedFindings: readonly StudioFinding[];
  limit: number;
}): StudioFinding[] {
  const reviewedRouteSlugs = new Set(input.reviewedFindings.map((finding) => finding.routeSlug));
  return input.routes
    .filter((route) => !reviewedRouteSlugs.has(route.slug))
    .map((route) => {
      const segment = input.segments.find((candidate) => candidate.routeSlug === route.slug);
      return {
        route,
        segment,
        score: generatedFindingScore(route, segment),
      };
    })
    .filter((candidate) => candidate.score >= 45)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.route.riderHoursLost - a.route.riderHoursLost ||
        a.route.routeId.localeCompare(b.route.routeId),
    )
    .slice(0, input.limit)
    .map((candidate) => buildFinding(candidate.route, candidate.segment));
}

function buildReviewedFinding(route: StudioRoute): StudioFinding | null {
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

function buildBrief(route: StudioRoute, finding: StudioFinding | undefined): StudioBrief {
  const canonical =
    route.slug === "m15-sbs"
      ? {
          id: "m15-madison-corridor",
          title: "The Madison corridor problem",
          dek: "A cited brief on M15 SBS treatment context, slow segments, and rider impact.",
        }
      : route.slug === "bx12-sbs"
        ? {
            id: "bx12-positive-control",
            title: "Bx12 SBS as positive control",
            dek: "A route brief using Bx12 SBS as a treatment benchmark.",
          }
        : null;

  return {
    id: canonical?.id ?? `brief-${route.slug}`,
    routeSlug: route.slug,
    title: canonical?.title ?? `${route.label} ${route.corridor} reliability brief`,
    status:
      canonical !== null ||
      finding?.id === "b25-fulton-corridor-reliability-permits" ||
      finding?.id === "bx41-webster-reliability-permits"
        ? "Published"
        : "Generated",
    version: "v1",
    generated: new Date().toISOString(),
    authors: ["Bus Priority Impact Studio"],
    citationCount: 4,
    summary: route.diagnosis,
    dek:
      canonical?.dek ??
      `A source-backed route brief for ${route.label}, generated from the current serving release.`,
    kpis: [
      {
        label: "Observed speed",
        value: route.speedMph.toFixed(1),
        unit: "mph",
        sub: "D1 serving summary",
        tone: route.speedPercentile <= 40 ? "warn" : "neutral",
      },
      {
        label: "Rider-hours exposed",
        value: route.riderHoursLost.toLocaleString("en-US"),
        sub: "Route-slice artifact",
        tone: route.riderHoursLost > 10_000 ? "bad" : "neutral",
      },
      {
        label: "Lane coverage",
        value: `${route.laneCoverage}`,
        unit: "%",
        sub: "Matched bus-lane rows",
        tone: route.laneCoverage > 50 ? "good" : "warn",
      },
    ],
    sections: [
      {
        title: "What changed",
        body: [
          route.diagnosis,
          finding?.body ??
            "The route has a generated serving projection, but no finding crossed the publication threshold.",
        ],
      },
      {
        title: "Evidence",
        body: [
          "The route brief combines D1 serving metrics with route-slice artifacts generated by the Bun pipeline.",
          "Public API consumers should use /api/v1/studio/* resources rather than D1 rows or R2 object keys.",
        ],
      },
    ],
    claims: [
      {
        n: 1,
        title: `${route.label} averaged ${route.speedMph.toFixed(1)} mph in the serving release`,
        strength: route.speedPercentile <= 40 ? 82 : 64,
        evidenceIds: ["speed"],
        caveatIds: ["generated"],
        state: "active",
      },
      {
        n: 2,
        title: `${route.label} has ${route.laneCoverage}% matched bus-lane coverage`,
        strength: 70,
        evidenceIds: ["treatments"],
        caveatIds: ["generated"],
        state: "active",
      },
    ],
    evidence: [
      {
        id: "speed",
        kind: "number",
        title: "Observed speed",
        detail: `${route.speedMph.toFixed(1)} mph from D1 serving summaries.`,
      },
      {
        id: "treatments",
        kind: "source",
        title: "Treatment evidence",
        detail: `${route.laneCoverage}% bus-lane coverage and ${route.aceStatus} ACE status.`,
      },
    ],
    caveats: [
      {
        title: "Generated route brief",
        body:
          canonical !== null
            ? "This canonical brief is generated from public serving projections and should be reviewed before external use."
            : "This route brief is generated from public serving projections and is not editorially reviewed.",
      },
    ],
  };
}

const methods: StudioMethodDataset[] = [
  {
    name: "MTA route speed and ridership summaries",
    publisher: "MTA",
    grain: "Route/month",
    cadence: "Monthly",
  },
  {
    name: "NYC DOT bus lane inventory",
    publisher: "NYC DOT",
    grain: "Street segment",
    cadence: "Periodic",
  },
  {
    name: "ACE violation summaries",
    publisher: "NYC DOT",
    grain: "Route/month",
    cadence: "Monthly",
  },
  {
    name: "Generated route-slice artifacts",
    publisher: "Bus Priority Impact Studio",
    grain: "Route/month/segment",
    cadence: "Release",
  },
];

function docsSections(month: string) {
  return [
    {
      title: "Quickstart",
      body: [
        "Use the RESTful Studio API for route-first product data.",
        "D1 rows and R2 object keys are private serving details behind the Worker.",
      ],
      code: `fetch("/api/v1/studio/routes").then((res) => res.json())`,
    },
    {
      title: "Release data",
      body: [
        `The current generated Studio release is backed by the ${month} D1 serving export and route/brief artifacts.`,
        "Missing sections are represented with quality caveats rather than frontend fallbacks.",
      ],
    },
  ];
}

async function buildRelease(options: CliOptions): Promise<StudioReleasePayload> {
  const { sqlite, db } = await createServingDbFromExport(
    fromRepoRoot(options.schemaPath),
    fromRepoRoot(options.seedPath),
  );

  try {
    const [readinessRows, briefSummaries, observedRows, routeArtifactRows] = await Promise.all([
      listRouteReadiness(db, options.month),
      listRouteBriefSummaries(db, options.month),
      listRouteObservedReliabilitySummaries(db, options.month),
      listRouteArtifacts(db, options.month),
    ]);
    const readinessByRoute = new Map(readinessRows.map((row) => [row.routeId, row]));
    const summariesByRoute = new Map(briefSummaries.map((summary) => [summary.routeId, summary]));
    const observedByRoute = new Map(observedRows.map((row) => [row.routeId, row]));
    const requiredSummaries = canonicalRouteIds.flatMap((routeId) => {
      const summary = summariesByRoute.get(routeId);
      return summary === undefined ? [] : [summary];
    });
    const orderedSummaries = [
      ...requiredSummaries,
      ...briefSummaries.filter(
        (summary) => !requiredSummaries.some((required) => required.routeId === summary.routeId),
      ),
    ];
    const selectedSummaries =
      options.profile === "full"
        ? orderedSummaries
        : orderedSummaries.slice(0, Math.max(options.routeLimit, requiredSummaries.length));
    const selectedRouteIds = new Set(selectedSummaries.map((summary) => summary.routeId));
    const routeArtifacts = routeArtifactRows
      .filter((row) => selectedRouteIds.has(row.route_id))
      .map(buildRouteArtifactRef);
    const routeInputs = new Map<string, RouteBriefInputArtifact | null>();

    for (const summary of selectedSummaries) {
      routeInputs.set(summary.routeId, await routeBriefInput(summary.routeId, options.month));
    }

    const routes: StudioRoute[] = selectedSummaries.flatMap((summary, index) => {
      const readiness = readinessByRoute.get(summary.routeId);
      if (readiness === undefined) {
        return [];
      }

      const peerSummary = selectedSummaries[(index + 1) % selectedSummaries.length];
      const peerSlug =
        peerSummary === undefined || peerSummary.routeId === summary.routeId
          ? null
          : routeIdToSlug(peerSummary.routeId);
      return [
        buildRoute(
          readiness,
          summary,
          routeInputs.get(summary.routeId) ?? null,
          peerSlug,
          observedByRoute.get(summary.routeId),
        ),
      ];
    });

    const segments = routes.flatMap((route) =>
      buildSegments(route.slug, route.routeId, routeInputs.get(route.routeId) ?? null),
    );
    const reviewedFindings = routes.flatMap((route) => {
      const finding = buildReviewedFinding(route);
      return finding === null ? [] : [finding];
    });
    const remainingFindingSlots = Math.max(0, options.findingLimit - reviewedFindings.length);
    const detectorFindings = await readDetectorFindingsFromReviewQueue({
      path: options.reviewQueuePath,
      routes,
      limit: remainingFindingSlots,
      excludedRouteSlugs: new Set(reviewedFindings.map((finding) => finding.routeSlug)),
    });
    const generatedFindings =
      detectorFindings.length > 0
        ? detectorFindings
        : selectGeneratedFindings({
            routes,
            segments,
            reviewedFindings,
            limit: remainingFindingSlots,
          });
    const findings = [...reviewedFindings, ...generatedFindings];
    const routeArtifactRouteIds = new Set(routeArtifacts.map((artifact) => artifact.routeId));
    const briefs = routes
      .filter((route) => routeArtifactRouteIds.has(route.routeId))
      .map((route) =>
        buildBrief(
          route,
          findings.find((finding) => finding.routeSlug === route.slug),
        ),
      );

    return StudioReleasePayloadSchema.parse({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      quality: {
        releaseLayer: "baseline_release",
        completenessStatus: "partial_public_monthly_only",
        confidence: "medium",
        caveats: qualityCaveats(options.month),
      },
      routes,
      segments,
      routeArtifacts,
      findings,
      briefs,
      versions: briefs.map((brief) => ({
        briefId: brief.id,
        v: brief.version,
        date: brief.generated,
        author: brief.authors[0] ?? "Bus Priority Impact Studio",
        summary: "Generated from D1/R2 serving projections.",
        claimsCount: brief.claims.length,
        citesCount: brief.citationCount,
        caveatsCount: brief.caveats.length,
      })),
      comments: [],
      methods,
      docsSections: docsSections(options.month),
      docsEndpoints: [],
    });
  } finally {
    sqlite.close();
  }
}

async function writeProjections(outputPath: string, release: StudioReleasePayload): Promise<void> {
  const outputDir = dirname(resolve(outputPath));

  await rm(outputDir, { recursive: true, force: true });
  await writeJson(outputPath, release);
  await writeJson(resolve(outputDir, "routes.json"), buildStudioRoutesProjection(release));
  await writeJson(resolve(outputDir, "findings.json"), buildStudioFindingsProjection(release));
  await writeJson(resolve(outputDir, "briefs.json"), buildStudioBriefsProjection(release));
  await writeJson(resolve(outputDir, "methods.json"), buildStudioMethodsProjection(release));
  await writeJson(resolve(outputDir, "docs.json"), buildStudioDocsProjection(release));

  for (const route of release.routes) {
    await writeJson(
      resolve(outputDir, "routes", route.slug, "index.json"),
      buildStudioRouteProjection(release, route),
    );
    await writeJson(
      resolve(outputDir, "routes", route.slug, "ladder.json"),
      buildStudioRouteLadderProjection(release, route),
    );
  }

  for (const finding of release.findings) {
    const projection = buildStudioFindingProjection(release, finding);
    if (projection !== undefined) {
      await writeJson(resolve(outputDir, "findings", finding.id, "index.json"), projection);
    }
  }

  for (const brief of release.briefs) {
    const projection = buildStudioBriefProjection(release, brief);
    if (projection !== undefined) {
      await writeJson(resolve(outputDir, "briefs", brief.id, "index.json"), projection);
    }
    const evidenceProjection = buildStudioBriefEvidenceProjection(release, brief);
    if (evidenceProjection !== undefined) {
      await writeJson(resolve(outputDir, "briefs", brief.id, "evidence.json"), evidenceProjection);
    }
    const historyProjection = buildStudioBriefHistoryProjection(release, brief);
    if (historyProjection !== undefined) {
      await writeJson(resolve(outputDir, "briefs", brief.id, "history.json"), historyProjection);
    }
  }
}

export async function buildStudioReleaseFromCli(args: string[]) {
  const options = parseOptions(args);
  const outputPath = fromRepoRoot(options.outputPath);
  const release = await buildRelease(options);

  await writeProjections(outputPath, release);

  return {
    outputPath,
    routeCount: release.routes.length,
    segmentCount: release.segments.length,
    findingCount: release.findings.length,
    briefCount: release.briefs.length,
    source: {
      schemaPath: options.schemaPath,
      seedPath: options.seedPath,
      month: options.month,
    },
  };
}
