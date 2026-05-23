import type { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { detectPermitCorrelatedSlowdowns } from "@bp/analytics";
import {
  type FindingSignalFeaturesArtifact,
  FindingSignalFeaturesArtifactSchema,
  type RouteMonthContextEventFeature,
  RouteMonthContextEventFeatureSchema,
  type RouteMonthSignalFeature,
  RouteMonthSignalFeatureSchema,
} from "@bp/domain";
import { nextIsoMonthStart } from "../../lib/dates.js";
import { writeJson } from "../../lib/json.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";

type SignalFeaturesArgs = {
  year?: number;
  month?: number;
  dbPath?: string;
  artifactRoot?: string;
};

export type SignalFeaturesResult = {
  isoMonth: string;
  featureCount: number;
  detectorCandidateCount: number;
  artifactPath: string;
};

function parseCliArgs(args: string[]): SignalFeaturesArgs {
  return parseMonthDbCliArgs(args, {} as SignalFeaturesArgs, [
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) output.artifactRoot = fromCliPath(value);
      },
    },
  ]);
}

export function signalFeaturesArtifactPath(artifactRoot: string, month: string): string {
  return join(artifactRoot, "findings", month, "signal-features.json");
}

function detectorRunId(month: string, generatedAt: string): string {
  return `permit-correlated-slowdown:${month}:${generatedAt}`;
}

export function buildRouteMonthSignalFeaturesFromSqlite(args: {
  sqlite: Database;
  isoMonth: string;
  year: number;
  month: number;
  generatedAt: string;
}): RouteMonthSignalFeature[] {
  const windowStart = `${args.isoMonth}-01T00:00:00`;
  const windowEnd = nextIsoMonthStart(args.year, args.month);
  const contextRows = args.sqlite
    .query<
      {
        route_id: string;
        source_id: string;
        event_kind: string;
        touched_event_count: number;
        touch_count: number;
        primary_touch_count: number;
        context_touch_count: number;
        high_confidence_touch_count: number;
        match_weight_sum: number;
        average_match_weight: number;
        max_route_fanout: number;
      },
      [string, string]
    >(
      `SELECT route_id,
              source_id,
              event_kind,
              count(DISTINCT event_id) AS touched_event_count,
              count(*) AS touch_count,
              sum(CASE WHEN evidence_role = 'primary' THEN 1 ELSE 0 END) AS primary_touch_count,
              sum(CASE WHEN evidence_role = 'context' THEN 1 ELSE 0 END) AS context_touch_count,
              sum(CASE WHEN match_weight >= 0.8 AND route_fanout <= 3 THEN 1 ELSE 0 END) AS high_confidence_touch_count,
              coalesce(sum(match_weight), 0) AS match_weight_sum,
              coalesce(avg(match_weight), 0) AS average_match_weight,
              coalesce(max(route_fanout), 0) AS max_route_fanout
         FROM local_context_event_route_touch
        WHERE occurred_at >= ?
          AND occurred_at < ?
        GROUP BY route_id, source_id, event_kind
        ORDER BY route_id, source_id, event_kind`,
    )
    .all(windowStart, windowEnd);
  const contextByRoute = new Map<string, RouteMonthContextEventFeature[]>();
  for (const row of contextRows) {
    const feature = RouteMonthContextEventFeatureSchema.parse({
      sourceId: row.source_id,
      eventKind: row.event_kind,
      touchedEventCount: row.touched_event_count,
      touchCount: row.touch_count,
      primaryTouchCount: row.primary_touch_count,
      contextTouchCount: row.context_touch_count,
      highConfidenceTouchCount: row.high_confidence_touch_count,
      matchWeightSum: Number(row.match_weight_sum.toFixed(4)),
      averageMatchWeight: Number(row.average_match_weight.toFixed(4)),
      maxRouteFanout: row.max_route_fanout,
    });
    const existing = contextByRoute.get(row.route_id) ?? [];
    existing.push(feature);
    contextByRoute.set(row.route_id, existing);
  }
  const rows = args.sqlite
    .query<
      {
        route_id: string;
        route_weighted_average_speed_mph: number | null;
        speed_observation_count: number | null;
        hotspot_count: number | null;
        max_hotspot_score: number | null;
        ridership_exposure: number | null;
        permit_touched_event_count: number;
        permit_touch_count: number;
        permit_route_count: number;
        permit_sources: string | null;
      },
      [string, string, string]
    >(
      `WITH speed AS (
         SELECT summary.route_id,
                summary.route_weighted_average_speed_mph,
                summary.observation_count AS speed_observation_count,
                summary.hotspot_count,
                max(coalesce(hotspot.rider_impact_score, hotspot.hotspot_score)) AS max_hotspot_score,
                summary.ridership_exposure
           FROM local_route_hotspot_summary summary
           LEFT JOIN local_route_hotspot hotspot
             ON hotspot.route_id = summary.route_id
            AND hotspot.month = summary.month
          WHERE summary.month = ?
          GROUP BY summary.route_id, summary.month
       ),
       permits AS (
         SELECT route_id,
                count(DISTINCT event_id) AS permit_touched_event_count,
                count(*) AS permit_touch_count,
                count(DISTINCT route_id) AS permit_route_count,
                group_concat(DISTINCT source_id) AS permit_sources
           FROM local_context_event_route_touch
          WHERE event_kind = 'permit'
            AND occurred_at < ?
            AND coalesce(ended_at, occurred_at) >= ?
          GROUP BY route_id
       )
       SELECT catalog.route_id,
              speed.route_weighted_average_speed_mph,
              speed.speed_observation_count,
              speed.hotspot_count,
              speed.max_hotspot_score,
              speed.ridership_exposure,
              coalesce(permits.permit_touched_event_count, 0) AS permit_touched_event_count,
              coalesce(permits.permit_touch_count, 0) AS permit_touch_count,
              coalesce(permits.permit_route_count, 0) AS permit_route_count,
              permits.permit_sources
         FROM local_route_catalog catalog
         LEFT JOIN speed ON speed.route_id = catalog.route_id
         LEFT JOIN permits ON permits.route_id = catalog.route_id
        ORDER BY catalog.route_id`,
    )
    .all(args.isoMonth, windowEnd, windowStart);

  return rows.map((row) => {
    const speedObservationCount = row.speed_observation_count ?? 0;
    const isComputable = speedObservationCount > 0;
    const contextEventCounts = contextByRoute.get(row.route_id) ?? [];
    const contextTouchedEventCount = contextEventCounts.reduce(
      (total, context) => total + context.touchedEventCount,
      0,
    );
    const contextTouchCount = contextEventCounts.reduce(
      (total, context) => total + context.touchCount,
      0,
    );
    const contextPrimaryTouchCount = contextEventCounts.reduce(
      (total, context) => total + context.primaryTouchCount,
      0,
    );
    const contextHighConfidenceTouchCount = contextEventCounts.reduce(
      (total, context) => total + context.highConfidenceTouchCount,
      0,
    );
    return RouteMonthSignalFeatureSchema.parse({
      scope: "route",
      scopeId: row.route_id,
      routeId: row.route_id,
      month: args.isoMonth,
      window: "all_day",
      direction: null,
      routeWeightedAverageSpeedMph: row.route_weighted_average_speed_mph,
      speedObservationCount,
      hotspotCount: row.hotspot_count ?? 0,
      maxHotspotScore: row.max_hotspot_score,
      ridershipExposure: row.ridership_exposure,
      permitTouchedEventCount: row.permit_touched_event_count,
      permitTouchCount: row.permit_touch_count,
      permitRouteCount: row.permit_route_count,
      permitSources: row.permit_sources?.split(",").sort() ?? [],
      contextTouchedEventCount,
      contextTouchCount,
      contextPrimaryTouchCount,
      contextHighConfidenceTouchCount,
      contextEventCounts,
      sampleSupport: speedObservationCount,
      uncertainty: {
        speedObservationCount,
        permitTouchedEventCount: row.permit_touched_event_count,
        contextTouchedEventCount,
        contextHighConfidenceTouchCount,
      },
      provenance: {
        featureComputedAt: args.generatedAt,
        derivationVersion: "route_month_signal_features.v1",
        sourceRefs: [
          `local_route_hotspot_summary:${row.route_id}:${args.isoMonth}`,
          `local_context_event_route_touch:${row.route_id}:permit:${args.isoMonth}`,
          `local_context_event_route_touch:${row.route_id}:all:${args.isoMonth}`,
        ],
      },
      coverage: {
        isComputable,
        skippedReasonCode: isComputable ? null : "missing_speed",
        inputsSeenJson: JSON.stringify({
          speedObservationCount,
          permitTouchedEventCount: row.permit_touched_event_count,
        }),
        inputsExpectedJson: JSON.stringify({
          speedObservationCount: ">0",
          contextEventRouteTouches: "refreshed",
        }),
      },
    });
  });
}

export function buildFindingSignalFeaturesArtifact(args: {
  isoMonth: string;
  generatedAt: string;
  features: readonly RouteMonthSignalFeature[];
}): FindingSignalFeaturesArtifact {
  const detectorPreview = detectPermitCorrelatedSlowdowns({
    detectorRunId: detectorRunId(args.isoMonth, args.generatedAt),
    month: args.isoMonth,
    generatedAt: args.generatedAt,
    features: args.features,
  });
  return FindingSignalFeaturesArtifactSchema.parse({
    artifactKind: "finding_signal_features",
    schemaVersion: 1,
    month: args.isoMonth,
    generatedAt: args.generatedAt,
    featureGrain: {
      scope: ["route"],
      window: ["all_day"],
      direction: "nullable",
    },
    summary: {
      featureCount: args.features.length,
      computableFeatureCount: args.features.filter((feature) => feature.coverage.isComputable)
        .length,
      permitTouchedFeatureCount: args.features.filter(
        (feature) => feature.permitTouchedEventCount > 0,
      ).length,
      contextTouchedFeatureCount: args.features.filter(
        (feature) => feature.contextTouchedEventCount > 0,
      ).length,
      contextSourceCount: new Set(
        args.features.flatMap((feature) =>
          feature.contextEventCounts.map((context) => context.sourceId),
        ),
      ).size,
      detectorCandidateCount: detectorPreview.candidates.length,
    },
    features: args.features,
    detectorPreview,
  });
}

export async function buildSignalFeatures(
  args: SignalFeaturesArgs = {},
): Promise<SignalFeaturesResult> {
  const options = createMonthContext(args);
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const artifactPath = signalFeaturesArtifactPath(artifactRoot, options.isoMonth);
  const generatedAt = new Date().toISOString();
  const features = await withLocalPipelineDb(args.dbPath, (local) =>
    buildRouteMonthSignalFeaturesFromSqlite({
      sqlite: local.sqlite,
      isoMonth: options.isoMonth,
      year: options.year,
      month: options.month,
      generatedAt,
    }),
  );
  const artifact = buildFindingSignalFeaturesArtifact({
    isoMonth: options.isoMonth,
    generatedAt,
    features,
  });

  await mkdir(dirname(artifactPath), { recursive: true });
  await writeJson(artifactPath, artifact);

  return {
    isoMonth: options.isoMonth,
    featureCount: features.length,
    detectorCandidateCount: artifact.detectorPreview.candidates.length,
    artifactPath,
  };
}

export async function buildSignalFeaturesFromCli(args: string[]): Promise<SignalFeaturesResult> {
  const result = await buildSignalFeatures(parseCliArgs(args));
  console.log(
    `signal-features ${result.isoMonth}: features=${result.featureCount} permit_correlated_slowdown=${result.detectorCandidateCount} artifact=${result.artifactPath}`,
  );
  return result;
}
