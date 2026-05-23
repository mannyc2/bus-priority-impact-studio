import type { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type CliOption, numberOption, parseCliOptions } from "../../lib/cli-args.js";
import { writeJson } from "../../lib/json.js";
import { defaultLocalPipelineDbPath, withLocalPipelineDb } from "../../lib/local-db.js";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.js";

type Args = {
  dbPath?: string;
  artifactRoot?: string;
  output?: string;
  maxDetectorCandidateCount?: number;
  minDetectorLocationWeight?: number;
  topFanoutLimit?: number;
  computedAt?: Date;
};

type PromotionTier =
  | "detector_review_candidate"
  | "weighted_release_context"
  | "low_confidence_release_context";

type PromotionPolicy = {
  recommendedDecision: "keep_release_context_only";
  automaticPromotionAllowed: boolean;
  manualPromotionRequirement: string;
  maxDetectorCandidateCount: number;
  minDetectorLocationWeight: number;
  allowedDetectorKinds: readonly string[];
  alwaysContextKinds: readonly string[];
};

type LocationStatRow = {
  location_key: string;
  match_kind: string;
  confidence: string;
  violation_code: number;
  violation_county: string | null;
  street_name: string | null;
  intersecting_street: string | null;
  event_count: number;
  candidate_count: number;
  candidate_rows: number;
  route_count: number;
  max_route_fanout: number;
  min_candidate_weight: number;
  avg_candidate_weight: number;
  max_candidate_weight: number;
  location_weight: number;
};

type LocationStat = {
  locationKey: string;
  matchKind: string;
  confidence: string;
  violationCode: number;
  violationCounty: string | null;
  streetName: string | null;
  intersectingStreet: string | null;
  eventCount: number;
  candidateCount: number;
  candidateRows: number;
  routeCount: number;
  maxRouteFanout: number;
  minCandidateWeight: number;
  avgCandidateWeight: number;
  maxCandidateWeight: number;
  locationWeight: number;
  promotionTier: PromotionTier;
};

type Distribution = {
  min: number;
  avg: number;
  eventWeightedAvg: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
  eventWeightedP50: number;
  eventWeightedP90: number;
};

type TierSummary = {
  groups: number;
  representedEvents: number;
  eventRate: number;
};

export type ParkingCandidateQualityBreakdown = {
  matchKind: string;
  confidence: string;
  groups: number;
  representedEvents: number;
  candidateRows: number;
  candidateCount: Distribution;
  locationWeight: Distribution;
  maxCandidateWeight: Distribution;
  promotionTiers: Record<PromotionTier, TierSummary>;
};

export type ParkingCandidateQualityAudit = {
  artifactKind: "parking_candidate_quality_audit";
  schemaVersion: 1;
  generatedAt: string;
  dbPath: string | null;
  promotionPolicy: PromotionPolicy;
  summary: {
    recommendedDecision: "keep_release_context_only";
    automaticPromotionAllowed: boolean;
    matchedLocationGroups: number;
    representedEvents: number;
    totalCandidateRows: number;
    routeCount: number;
    maxCandidateCount: number;
    p90CandidateCount: number;
    eventWeightedP90CandidateCount: number;
    detectorReviewCandidateGroups: number;
    detectorReviewCandidateEvents: number;
    detectorReviewCandidateEventRate: number;
    weightedReleaseContextGroups: number;
    weightedReleaseContextEvents: number;
    lowConfidenceReleaseContextGroups: number;
    lowConfidenceReleaseContextEvents: number;
    decisionRationale: string;
  };
  byMatchKindConfidence: ParkingCandidateQualityBreakdown[];
  topFanoutGroups: Array<{
    locationKey: string;
    matchKind: string;
    confidence: string;
    eventCount: number;
    candidateCount: number;
    candidateRows: number;
    routeCount: number;
    maxRouteFanout: number;
    locationWeight: number;
    maxCandidateWeight: number;
    violationCode: number;
    violationCounty: string | null;
    streetName: string | null;
    intersectingStreet: string | null;
    promotionTier: PromotionTier;
  }>;
};

type BuildAuditInput = {
  sqlite: Database;
  dbPath?: string | null;
  generatedAt?: string;
  policy?: Partial<
    Pick<PromotionPolicy, "maxDetectorCandidateCount" | "minDetectorLocationWeight">
  >;
  topFanoutLimit?: number;
};

type Result = {
  outputPath: string;
  recommendedDecision: "keep_release_context_only";
  matchedLocationGroups: number;
  representedEvents: number;
  detectorReviewCandidateGroups: number;
  detectorReviewCandidateEvents: number;
  weightedReleaseContextGroups: number;
  lowConfidenceReleaseContextGroups: number;
};

const PROMOTION_TIERS: readonly PromotionTier[] = [
  "detector_review_candidate",
  "weighted_release_context",
  "low_confidence_release_context",
];

const DEFAULT_POLICY: PromotionPolicy = {
  recommendedDecision: "keep_release_context_only",
  automaticPromotionAllowed: false,
  manualPromotionRequirement:
    "Parking may stay in weighted route context, but detector-grade use requires explicit human review of candidate fanout, match weights, and source-specific false positives.",
  maxDetectorCandidateCount: 3,
  minDetectorLocationWeight: 0.8,
  allowedDetectorKinds: [
    "camera_intersection_geoclient",
    "camera_intersection_snap",
    "street_code_house_range",
  ],
  alwaysContextKinds: ["camera_street_corridor"],
};

function parseCliArgs(args: string[]): Args {
  const options: CliOption<Args>[] = [
    {
      flags: ["--db", "--db-path"],
      apply: (output, value) => {
        if (value !== undefined) output.dbPath = fromCliPath(value);
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) output.artifactRoot = fromCliPath(value);
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) output.output = fromCliPath(value);
      },
    },
    numberOption(["--max-detector-candidate-count"], (output, value) => {
      output.maxDetectorCandidateCount = value;
    }),
    numberOption(["--min-detector-location-weight"], (output, value) => {
      output.minDetectorLocationWeight = value;
    }),
    numberOption(["--top-fanout-limit"], (output, value) => {
      output.topFanoutLimit = value;
    }),
  ];

  return parseCliOptions(args, {}, options);
}

export function parkingCandidateQualityAuditPath(artifactRoot: string): string {
  return join(artifactRoot, "context-events", "parking-candidate-quality-audit.json");
}

export function buildParkingCandidateQualityAudit(
  input: BuildAuditInput,
): ParkingCandidateQualityAudit {
  const policy = {
    ...DEFAULT_POLICY,
    ...input.policy,
  };
  const locations = locationStats(input.sqlite).map((location) => ({
    ...location,
    promotionTier: classifyLocation(location, policy),
  }));
  const representedEvents = sum(locations, (location) => location.eventCount);
  const routeCount =
    input.sqlite
      .query<{ n: number }, []>(
        "SELECT count(DISTINCT route_id) AS n FROM local_parking_violation_match",
      )
      .get()?.n ?? 0;
  const candidateCount = distribution(locations, (location) => location.candidateCount);
  const tierSummaries = tierSummary(locations, representedEvents);

  return {
    artifactKind: "parking_candidate_quality_audit",
    schemaVersion: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    dbPath: input.dbPath ?? null,
    promotionPolicy: policy,
    summary: {
      recommendedDecision: policy.recommendedDecision,
      automaticPromotionAllowed: policy.automaticPromotionAllowed,
      matchedLocationGroups: locations.length,
      representedEvents,
      totalCandidateRows: sum(locations, (location) => location.candidateRows),
      routeCount,
      maxCandidateCount: candidateCount.max,
      p90CandidateCount: candidateCount.p90,
      eventWeightedP90CandidateCount: candidateCount.eventWeightedP90,
      detectorReviewCandidateGroups: tierSummaries.detector_review_candidate.groups,
      detectorReviewCandidateEvents: tierSummaries.detector_review_candidate.representedEvents,
      detectorReviewCandidateEventRate: tierSummaries.detector_review_candidate.eventRate,
      weightedReleaseContextGroups: tierSummaries.weighted_release_context.groups,
      weightedReleaseContextEvents: tierSummaries.weighted_release_context.representedEvents,
      lowConfidenceReleaseContextGroups: tierSummaries.low_confidence_release_context.groups,
      lowConfidenceReleaseContextEvents:
        tierSummaries.low_confidence_release_context.representedEvents,
      decisionRationale:
        "Candidate matching materially improves parking route context, but detector-grade evidence remains blocked by default. The audit exposes the small strict-review subset separately from higher-fanout or lower-confidence context matches.",
    },
    byMatchKindConfidence: summarizeByMatchKindConfidence(locations),
    topFanoutGroups: locations
      .toSorted((a, b) => b.candidateCount - a.candidateCount || b.eventCount - a.eventCount)
      .slice(0, input.topFanoutLimit ?? 25)
      .map((location) => ({
        locationKey: location.locationKey,
        matchKind: location.matchKind,
        confidence: location.confidence,
        eventCount: location.eventCount,
        candidateCount: location.candidateCount,
        candidateRows: location.candidateRows,
        routeCount: location.routeCount,
        maxRouteFanout: location.maxRouteFanout,
        locationWeight: rounded(location.locationWeight),
        maxCandidateWeight: rounded(location.maxCandidateWeight),
        violationCode: location.violationCode,
        violationCounty: location.violationCounty,
        streetName: location.streetName,
        intersectingStreet: location.intersectingStreet,
        promotionTier: location.promotionTier,
      })),
  };
}

export async function writeParkingCandidateQualityAudit(args: Args = {}): Promise<Result> {
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const outputPath = args.output ?? parkingCandidateQualityAuditPath(artifactRoot);
  const dbPath = args.dbPath ?? defaultLocalPipelineDbPath();
  const generatedAt = (args.computedAt ?? new Date()).toISOString();

  const audit = await withLocalPipelineDb(dbPath, ({ sqlite, path }) => {
    const input: BuildAuditInput = {
      sqlite,
      dbPath: path,
      generatedAt,
      policy: {
        ...(args.maxDetectorCandidateCount !== undefined
          ? { maxDetectorCandidateCount: args.maxDetectorCandidateCount }
          : {}),
        ...(args.minDetectorLocationWeight !== undefined
          ? { minDetectorLocationWeight: args.minDetectorLocationWeight }
          : {}),
      },
    };
    if (args.topFanoutLimit !== undefined) {
      input.topFanoutLimit = args.topFanoutLimit;
    }
    return buildParkingCandidateQualityAudit(input);
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, audit);

  return {
    outputPath,
    recommendedDecision: audit.summary.recommendedDecision,
    matchedLocationGroups: audit.summary.matchedLocationGroups,
    representedEvents: audit.summary.representedEvents,
    detectorReviewCandidateGroups: audit.summary.detectorReviewCandidateGroups,
    detectorReviewCandidateEvents: audit.summary.detectorReviewCandidateEvents,
    weightedReleaseContextGroups: audit.summary.weightedReleaseContextGroups,
    lowConfidenceReleaseContextGroups: audit.summary.lowConfidenceReleaseContextGroups,
  };
}

function locationStats(sqlite: Database): LocationStat[] {
  return sqlite
    .query<LocationStatRow, []>(
      `SELECT location_key,
              max(match_kind) AS match_kind,
              max(confidence) AS confidence,
              max(violation_code) AS violation_code,
              max(violation_county) AS violation_county,
              max(street_name) AS street_name,
              max(intersecting_street) AS intersecting_street,
              max(event_count) AS event_count,
              max(candidate_count) AS candidate_count,
              count(*) AS candidate_rows,
              count(DISTINCT route_id) AS route_count,
              max(route_fanout) AS max_route_fanout,
              min(match_weight) AS min_candidate_weight,
              avg(match_weight) AS avg_candidate_weight,
              max(match_weight) AS max_candidate_weight,
              sum(match_weight) AS location_weight
         FROM local_parking_violation_match
        GROUP BY location_key
        ORDER BY event_count DESC, location_key`,
    )
    .all()
    .map((row) => ({
      locationKey: row.location_key,
      matchKind: row.match_kind,
      confidence: row.confidence,
      violationCode: row.violation_code,
      violationCounty: row.violation_county,
      streetName: row.street_name,
      intersectingStreet: row.intersecting_street,
      eventCount: row.event_count,
      candidateCount: row.candidate_count,
      candidateRows: row.candidate_rows,
      routeCount: row.route_count,
      maxRouteFanout: row.max_route_fanout,
      minCandidateWeight: row.min_candidate_weight,
      avgCandidateWeight: row.avg_candidate_weight,
      maxCandidateWeight: row.max_candidate_weight,
      locationWeight: row.location_weight,
      promotionTier: "low_confidence_release_context",
    }));
}

function classifyLocation(location: LocationStat, policy: PromotionPolicy): PromotionTier {
  if (location.confidence === "low" || policy.alwaysContextKinds.includes(location.matchKind)) {
    return "low_confidence_release_context";
  }

  if (
    location.confidence === "high" &&
    policy.allowedDetectorKinds.includes(location.matchKind) &&
    location.candidateCount <= policy.maxDetectorCandidateCount &&
    location.locationWeight >= policy.minDetectorLocationWeight
  ) {
    return "detector_review_candidate";
  }

  return "weighted_release_context";
}

function summarizeByMatchKindConfidence(
  locations: readonly LocationStat[],
): ParkingCandidateQualityBreakdown[] {
  const groups = new Map<string, LocationStat[]>();
  for (const location of locations) {
    const key = `${location.matchKind}|${location.confidence}`;
    const existing = groups.get(key) ?? [];
    existing.push(location);
    groups.set(key, existing);
  }

  return Array.from(groups.values())
    .map((items) => {
      const first = items[0];
      if (first === undefined) {
        throw new Error("Cannot summarize empty parking candidate group.");
      }
      const representedEvents = sum(items, (item) => item.eventCount);
      return {
        matchKind: first.matchKind,
        confidence: first.confidence,
        groups: items.length,
        representedEvents,
        candidateRows: sum(items, (item) => item.candidateRows),
        candidateCount: distribution(items, (item) => item.candidateCount),
        locationWeight: distribution(items, (item) => item.locationWeight),
        maxCandidateWeight: distribution(items, (item) => item.maxCandidateWeight),
        promotionTiers: tierSummary(items, representedEvents),
      };
    })
    .toSorted(
      (a, b) =>
        b.representedEvents - a.representedEvents ||
        a.matchKind.localeCompare(b.matchKind) ||
        a.confidence.localeCompare(b.confidence),
    );
}

function tierSummary(
  locations: readonly LocationStat[],
  representedEvents: number,
): Record<PromotionTier, TierSummary> {
  const summary = Object.fromEntries(
    PROMOTION_TIERS.map((tier) => [tier, { groups: 0, representedEvents: 0, eventRate: 0 }]),
  ) as Record<PromotionTier, TierSummary>;

  for (const location of locations) {
    const tier = summary[location.promotionTier];
    tier.groups += 1;
    tier.representedEvents += location.eventCount;
  }

  for (const tier of PROMOTION_TIERS) {
    summary[tier].eventRate =
      representedEvents === 0 ? 0 : rounded(summary[tier].representedEvents / representedEvents);
  }

  return summary;
}

function distribution(
  locations: readonly LocationStat[],
  getValue: (location: LocationStat) => number,
): Distribution {
  const values = locations.map(getValue).toSorted((a, b) => a - b);
  if (values.length === 0) {
    return {
      min: 0,
      avg: 0,
      eventWeightedAvg: 0,
      p50: 0,
      p90: 0,
      p95: 0,
      p99: 0,
      max: 0,
      eventWeightedP50: 0,
      eventWeightedP90: 0,
    };
  }

  return {
    min: rounded(values[0] ?? 0),
    avg: rounded(values.reduce((total, value) => total + value, 0) / values.length),
    eventWeightedAvg: rounded(
      sum(locations, (location) => getValue(location) * location.eventCount) /
        Math.max(
          1,
          sum(locations, (location) => location.eventCount),
        ),
    ),
    p50: rounded(percentile(values, 0.5)),
    p90: rounded(percentile(values, 0.9)),
    p95: rounded(percentile(values, 0.95)),
    p99: rounded(percentile(values, 0.99)),
    max: rounded(values[values.length - 1] ?? 0),
    eventWeightedP50: rounded(weightedPercentile(locations, getValue, 0.5)),
    eventWeightedP90: rounded(weightedPercentile(locations, getValue, 0.9)),
  };
}

function percentile(sortedValues: readonly number[], percentileValue: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0] ?? 0;
  const index = (sortedValues.length - 1) * percentileValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const lowerValue = sortedValues[lower] ?? 0;
  const upperValue = sortedValues[upper] ?? lowerValue;
  return lowerValue + (upperValue - lowerValue) * (index - lower);
}

function weightedPercentile(
  locations: readonly LocationStat[],
  getValue: (location: LocationStat) => number,
  percentileValue: number,
): number {
  const sorted = locations.toSorted((a, b) => getValue(a) - getValue(b));
  const totalWeight = sum(sorted, (location) => location.eventCount);
  if (sorted.length === 0 || totalWeight === 0) return 0;
  const threshold = totalWeight * percentileValue;
  let cumulative = 0;
  for (const location of sorted) {
    cumulative += location.eventCount;
    if (cumulative >= threshold) return getValue(location);
  }
  return getValue(sorted[sorted.length - 1] as LocationStat);
}

function sum<T>(items: readonly T[], getValue: (item: T) => number): number {
  return items.reduce((total, item) => total + getValue(item), 0);
}

function rounded(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(6)) : 0;
}

export async function auditParkingCandidateQualityFromCli(args: string[]): Promise<Result> {
  const result = await writeParkingCandidateQualityAudit(parseCliArgs(args));
  console.log(
    `parking-candidate-quality: decision=${result.recommendedDecision} groups=${result.matchedLocationGroups} events=${result.representedEvents} detector_review_groups=${result.detectorReviewCandidateGroups} detector_review_events=${result.detectorReviewCandidateEvents} audit=${result.outputPath}`,
  );
  return result;
}
