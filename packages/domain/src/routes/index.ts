import * as z from "zod";
import { IsoMonthSchema, RouteIdSchema, SourceCitationSchema } from "../primitives/index.js";
import { registerProjectSchema } from "../schema-registry.js";

const schemaVersion = 1;

export const RouteCoverageStatusSchema = registerProjectSchema(
  z.enum(["full", "no_observed_speed"]),
  {
    id: "bp.route_coverage_status",
    title: "Route Coverage Status",
    description:
      "Whether a route scorecard is backed by observed speed data for the analysis month.",
    stability: "draft",
  },
);

export type RouteCoverageStatus = z.output<typeof RouteCoverageStatusSchema>;

export const RouteScorecardSchema = registerProjectSchema(
  z
    .object({
      schemaVersion: z.literal(schemaVersion),
      routeId: RouteIdSchema,
      month: IsoMonthSchema,
      routeScore: z.number().min(0).max(100),
      coverageStatus: RouteCoverageStatusSchema,
      averageSpeedMph: z.number().nonnegative(),
      hotspotCount: z.number().int().nonnegative(),
      citations: z.array(SourceCitationSchema).min(1),
    })
    .strict()
    .readonly(),
  {
    id: "bp.route_scorecard.v1",
    title: "Route Scorecard",
    description: "Compact read model served by the public app for one route and month.",
    stability: "draft",
  },
);

export type RouteScorecard = z.output<typeof RouteScorecardSchema>;

export const ReleaseLayerSchema = registerProjectSchema(
  z.enum(["baseline_release", "current_signal", "pending_publication", "observed_release"]),
  {
    id: "bp.release_layer",
    title: "Release Layer",
    description: "Completeness-aware layer used by the public API to label data freshness.",
    stability: "draft",
  },
);

export type ReleaseLayer = z.output<typeof ReleaseLayerSchema>;

export const CompletenessStatusSchema = registerProjectSchema(
  z.enum([
    "complete",
    "partial_realtime_only",
    "partial_public_monthly_only",
    "missing_speed",
    "missing_realtime",
    "insufficient_samples",
    "source_lag_expected",
  ]),
  {
    id: "bp.completeness_status",
    title: "Completeness Status",
    description: "Machine-readable status describing what can be claimed for a metric or release.",
    stability: "draft",
  },
);

export type CompletenessStatus = z.output<typeof CompletenessStatusSchema>;

export const ApiDataQualitySchema = registerProjectSchema(
  z
    .object({
      releaseLayer: ReleaseLayerSchema,
      completenessStatus: CompletenessStatusSchema,
      confidence: z.enum(["high", "medium", "low"]),
      caveats: z.array(z.string().min(1)),
    })
    .strict()
    .readonly(),
  {
    id: "bp.api_data_quality.v1",
    title: "API Data Quality",
    description: "Public API quality envelope for source cadence, completeness, and caveats.",
    stability: "draft",
  },
);

export type ApiDataQuality = z.output<typeof ApiDataQualitySchema>;

export const ReleaseStatusResponseSchema = registerProjectSchema(
  z
    .object({
      schemaVersion: z.literal(schemaVersion),
      generatedAt: z.iso.datetime(),
      baselineMonth: IsoMonthSchema,
      currentSignalMonth: IsoMonthSchema.nullable(),
      canonicalMonthlyRelease: z
        .object({
          month: IsoMonthSchema,
          status: z.enum(["pass", "fail", "missing"]),
          routeCount: z.number().int().nonnegative(),
          artifactCount: z.number().int().nonnegative(),
          issueCount: z.number().int().nonnegative(),
        })
        .strict(),
      observedRealtimeEvidence: z
        .object({
          runId: z.string().min(1).nullable(),
          source: z.enum(["official_self_collected", "third_party_recovered", "none"]),
          observedRouteCount: z.number().int().nonnegative(),
          insufficientRouteCount: z.number().int().nonnegative(),
          sampleCount: z.number().int().nonnegative(),
          routeCoverageShare: z.number().min(0).max(1),
        })
        .strict(),
      currentObservedSignal: z
        .object({
          month: IsoMonthSchema,
          runId: z.string().min(1).nullable(),
          source: z.enum(["official_self_collected", "third_party_recovered", "none"]),
          releaseLayer: z.literal("current_signal"),
          routeCount: z.number().int().nonnegative(),
          observedRouteCount: z.number().int().nonnegative(),
          insufficientRouteCount: z.number().int().nonnegative(),
          sampleCount: z.number().int().nonnegative(),
          caveats: z.array(z.string().min(1)).readonly(),
        })
        .strict()
        .nullable(),
      quality: ApiDataQualitySchema,
    })
    .strict()
    .readonly(),
  {
    id: "bp.release_status_response.v1",
    title: "Release Status Response",
    description: "Public API response describing the active release month and data provenance.",
    stability: "draft",
  },
);

export type ReleaseStatusResponse = z.output<typeof ReleaseStatusResponseSchema>;

export const RouteCardSchema = registerProjectSchema(
  z
    .object({
      routeId: RouteIdSchema,
      shortName: z.string().min(1),
      month: IsoMonthSchema,
      rank: z.number().int().positive(),
      routeScore: z.number().min(0).max(100),
      averageSpeedMph: z.number().nonnegative(),
      hotspotCount: z.number().int().nonnegative(),
      totalRidership: z.number().nonnegative(),
      aceActive: z.boolean(),
      busLaneMatchedLaneCount: z.number().int().nonnegative(),
      observedBunchingShare: z.number().min(0).max(1).nullable(),
      observedLongGapShare: z.number().min(0).max(1).nullable(),
      reliabilityStatus: z.enum(["observed", "insufficient_gtfs_rt_samples"]).nullable(),
      sampleCount: z.number().int().nonnegative(),
      quality: ApiDataQualitySchema,
    })
    .strict()
    .readonly(),
  {
    id: "bp.route_card.v1",
    title: "Route Card",
    description: "Compact public route card for ranked lists, search, and hotspot panels.",
    stability: "draft",
  },
);

export type RouteCard = z.output<typeof RouteCardSchema>;

export const RouteListResponseSchema = registerProjectSchema(
  z
    .object({
      schemaVersion: z.literal(schemaVersion),
      generatedAt: z.iso.datetime(),
      baselineMonth: IsoMonthSchema,
      routes: z.array(RouteCardSchema),
      quality: ApiDataQualitySchema,
    })
    .strict()
    .readonly(),
  {
    id: "bp.route_list_response.v1",
    title: "Route List Response",
    description: "Public API response for compact route cards in the active release month.",
    stability: "draft",
  },
);

export type RouteListResponse = z.output<typeof RouteListResponseSchema>;

export const RouteArtifactRefSchema = registerProjectSchema(
  z
    .object({
      name: z.string().min(1),
      key: z.string().min(1),
      contentType: z.string().min(1),
      byteLength: z.number().int().nonnegative(),
      sha256: z.string().length(64),
    })
    .strict()
    .readonly(),
  {
    id: "bp.route_artifact_ref.v1",
    title: "Route Artifact Reference",
    description: "Reference to a generated route artifact stored outside the compact D1 payload.",
    stability: "draft",
  },
);

export type RouteArtifactRef = z.output<typeof RouteArtifactRefSchema>;

export const RouteProfileResponseSchema = registerProjectSchema(
  z
    .object({
      schemaVersion: z.literal(schemaVersion),
      generatedAt: z.iso.datetime(),
      baselineMonth: IsoMonthSchema,
      route: RouteCardSchema,
      peakRidership: z
        .object({
          dayOfWeek: z.string().min(1),
          hourOfDay: z.number().int().min(0).max(23),
          ridership: z.number().nonnegative().nullable(),
          transfers: z.number().nonnegative().nullable(),
          weightedAverageSpeedMph: z.number().nonnegative().nullable(),
        })
        .strict()
        .nullable(),
      slowestWindow: z
        .object({
          dayOfWeek: z.string().min(1),
          hourOfDay: z.number().int().min(0).max(23),
          observationCount: z.number().int().nonnegative().nullable(),
          busTripCount: z.number().int().nonnegative().nullable(),
          weightedAverageSpeedMph: z.number().nonnegative().nullable(),
          slowObservationShare: z.number().min(0).max(1).nullable(),
        })
        .strict()
        .nullable(),
      observedReliability: z
        .object({
          runId: z.string().min(1),
          reliabilityStatus: z.enum(["observed", "insufficient_gtfs_rt_samples"]),
          sampleCount: z.number().int().nonnegative(),
          medianObservedHeadwayMinutes: z.number().nonnegative().nullable(),
          p90ObservedHeadwayMinutes: z.number().nonnegative().nullable(),
          observedBunchingShare: z.number().min(0).max(1).nullable(),
          observedLongGapShare: z.number().min(0).max(1).nullable(),
          excessWaitMinutes: z.number().nullable(),
        })
        .strict()
        .nullable(),
      artifacts: z.array(RouteArtifactRefSchema),
      quality: ApiDataQualitySchema,
    })
    .strict()
    .readonly(),
  {
    id: "bp.route_profile_response.v1",
    title: "Route Profile Response",
    description: "Public API response for one route profile panel in the active release month.",
    stability: "draft",
  },
);

export type RouteProfileResponse = z.output<typeof RouteProfileResponseSchema>;

export const HotspotCardSchema = registerProjectSchema(
  z
    .object({
      corridorId: z.string().min(1),
      corridorName: z.string().min(1),
      routeId: RouteIdSchema,
      month: IsoMonthSchema,
      rank: z.number().int().positive(),
      routeHotspotRank: z.number().int().positive(),
      fromStopName: z.string().min(1),
      toStopName: z.string().min(1),
      averageSpeedMph: z.number().nonnegative(),
      hotspotScore: z.number().int().nonnegative(),
      riderImpactScore: z.number().int().nonnegative().nullable(),
      quality: ApiDataQualitySchema,
    })
    .strict()
    .readonly(),
  {
    id: "bp.hotspot_card.v1",
    title: "Hotspot Card",
    description: "Compact precomputed hotspot card for triage lists and map sheets.",
    stability: "draft",
  },
);

export type HotspotCard = z.output<typeof HotspotCardSchema>;

export const HotspotListResponseSchema = registerProjectSchema(
  z
    .object({
      schemaVersion: z.literal(schemaVersion),
      generatedAt: z.iso.datetime(),
      baselineMonth: IsoMonthSchema,
      hotspots: z.array(HotspotCardSchema),
      quality: ApiDataQualitySchema,
    })
    .strict()
    .readonly(),
  {
    id: "bp.hotspot_list_response.v1",
    title: "Hotspot List Response",
    description: "Public API response for ranked precomputed hotspot cards.",
    stability: "draft",
  },
);

export type HotspotListResponse = z.output<typeof HotspotListResponseSchema>;

export const RouteCompareResponseSchema = registerProjectSchema(
  z
    .object({
      schemaVersion: z.literal(schemaVersion),
      generatedAt: z.iso.datetime(),
      baselineMonth: IsoMonthSchema,
      routes: z.tuple([RouteCardSchema, RouteCardSchema]),
      deltas: z
        .object({
          routeScore: z.number(),
          averageSpeedMph: z.number(),
          totalRidership: z.number(),
          observedBunchingShare: z.number().nullable(),
          observedLongGapShare: z.number().nullable(),
        })
        .strict(),
      quality: ApiDataQualitySchema,
    })
    .strict()
    .readonly(),
  {
    id: "bp.route_compare_response.v1",
    title: "Route Compare Response",
    description: "Public API response for a two-route comparison panel.",
    stability: "draft",
  },
);

export type RouteCompareResponse = z.output<typeof RouteCompareResponseSchema>;

export const HealthResponseSchema = registerProjectSchema(
  z
    .object({
      ok: z.literal(true),
      service: z.literal("bus-priority-impact-studio"),
      checkedAt: z.iso.datetime(),
    })
    .strict()
    .readonly(),
  {
    id: "bp.health_response.v1",
    title: "Health Response",
    description: "Worker health-check response contract.",
    stability: "stable",
  },
);

export type HealthResponse = z.output<typeof HealthResponseSchema>;
