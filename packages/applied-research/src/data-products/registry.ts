import { z } from "zod";

const DataProductIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9_.-]+$/);

const SqlIdentifierSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/);

export const DataProductCompletenessStatusSchema = z.enum([
  "complete",
  "partial",
  "missing",
  "stale",
  "waived",
  "blocked",
  "fetching",
]);

export const DataProductKindSchema = z.enum([
  "local_table",
  "artifact_family",
  "detector_feature_artifact",
  "score_vector",
  "serving_projection",
  "release_manifest",
]);

export const DataProductRouteUniverseSchema = z.enum([
  "route_catalog",
  "coverage_source_routes",
  "schedule_source_routes",
  "speed_source_routes",
  "historical_speed_source_routes",
  "ridership_source_routes",
  "speed_ridership_source_routes",
  "observed_headway_routes",
  "observed_reliability_routes",
  "ewt_eligible_routes",
  "public_visible_routes",
]);

export const DataProductLifecycleSchema = z
  .object({
    status: z.enum(["expected", "waived", "blocked", "fetching"]).default("expected"),
    reason: z.string().min(1).optional(),
    gapClass: z
      .enum([
        "upstream_blocked",
        "available_not_fetched",
        "source_absent",
        "derived_not_built",
        "derived_from_available_not_fetched",
        "derived_from_upstream_blocked",
        "planned_blocked",
        "downstream_blocked",
        "fetching",
        "waived",
        "stale",
        "unknown",
      ])
      .optional(),
  })
  .strict();

export const DataProductExpectedUniverseSchema = z
  .object({
    description: z.string().min(1),
    routes: DataProductRouteUniverseSchema.optional(),
    months: z.enum(["release_month", "history_window"]).optional(),
  })
  .strict();

export const DataProductFreshnessPolicySchema = z
  .object({
    cadence: z.enum(["release_month", "historical_window", "run_scoped", "manual", "append_only"]),
    staleAfterDays: z.number().int().positive().optional(),
    note: z.string().min(1).optional(),
  })
  .strict();

const BaseCheckSchema = z
  .object({
    id: DataProductIdSchema,
    label: z.string().min(1),
  })
  .strict();

const MonthTableCoverageCheckSchema = BaseCheckSchema.extend({
  type: z.literal("month_table_coverage"),
  tableName: SqlIdentifierSchema,
  monthColumn: SqlIdentifierSchema,
  routeColumn: SqlIdentifierSchema.optional(),
  expectedMonths: z.literal("history_window"),
  minRowsPerMonth: z.number().int().nonnegative().default(1),
  minRoutesPerMonth: z.number().int().nonnegative().default(0),
}).strict();

const TableRouteCoverageCheckSchema = BaseCheckSchema.extend({
  type: z.literal("table_route_coverage"),
  tableName: SqlIdentifierSchema,
  monthColumn: SqlIdentifierSchema,
  routeColumn: SqlIdentifierSchema,
  runColumn: SqlIdentifierSchema.optional(),
  expectedRoutes: DataProductRouteUniverseSchema,
}).strict();

const TableRowCountCheckSchema = BaseCheckSchema.extend({
  type: z.literal("table_row_count"),
  tableName: SqlIdentifierSchema,
  minRows: z.number().int().nonnegative().default(1),
}).strict();

const SourceYearRouteCoverageCheckSchema = BaseCheckSchema.extend({
  type: z.literal("source_year_route_coverage"),
  tableName: SqlIdentifierSchema,
  sourceYearColumn: SqlIdentifierSchema,
  routeColumn: SqlIdentifierSchema,
  expectedRoutes: DataProductRouteUniverseSchema,
  expectedYears: z.literal("history_window_years"),
  statusTableName: SqlIdentifierSchema.optional(),
  statusSourceYearColumn: SqlIdentifierSchema.optional(),
  statusRouteColumn: SqlIdentifierSchema.optional(),
  statusColumn: SqlIdentifierSchema.optional(),
  statusRowCountColumn: SqlIdentifierSchema.optional(),
  waiverArtifactPathTemplate: z.string().min(1).optional(),
}).strict();

const RouteArtifactCoverageCheckSchema = BaseCheckSchema.extend({
  type: z.literal("route_artifact_coverage"),
  pathTemplate: z.string().min(1),
  expectedRoutes: DataProductRouteUniverseSchema,
}).strict();

const ScoreVectorRoutesCheckSchema = BaseCheckSchema.extend({
  type: z.literal("score_vector_routes"),
  pathTemplate: z.string().min(1),
  expectedRoutes: DataProductRouteUniverseSchema,
}).strict();

const JsonExpectedValueSchema = z
  .object({
    path: z.string().min(1),
    equals: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  })
  .strict();

const JsonArtifactCheckSchema = BaseCheckSchema.extend({
  type: z.literal("json_artifact"),
  pathTemplate: z.string().min(1),
  validateReleaseMonth: z.boolean().optional(),
  validateRunId: z.boolean().optional(),
  requiredJsonValues: z.array(JsonExpectedValueSchema).optional(),
  semantic: z
    .enum([
      "tier2_publishable_ready",
      "detector_gold_set_quality",
      "mta_wiki_bridge_ready_for_review",
      "tier2_full_corpus_materialized_views_ready",
      "tier2_source_disposition_queue_ready",
      "tier2_source_receipt_closure_ready",
    ])
    .optional(),
}).strict();

const FileArtifactCheckSchema = BaseCheckSchema.extend({
  type: z.literal("file_artifact"),
  pathTemplate: z.string().min(1),
}).strict();

const ArtifactGlobCheckSchema = BaseCheckSchema.extend({
  type: z.literal("artifact_glob"),
  rootTemplate: z.string().min(1),
  pattern: z.string().min(1),
  minFiles: z.number().int().nonnegative().default(1),
}).strict();

export const DataProductCheckSchema = z.discriminatedUnion("type", [
  MonthTableCoverageCheckSchema,
  TableRouteCoverageCheckSchema,
  TableRowCountCheckSchema,
  SourceYearRouteCoverageCheckSchema,
  RouteArtifactCoverageCheckSchema,
  ScoreVectorRoutesCheckSchema,
  JsonArtifactCheckSchema,
  FileArtifactCheckSchema,
  ArtifactGlobCheckSchema,
]);

export const DataProductSchema = z
  .object({
    id: DataProductIdSchema,
    label: z.string().min(1),
    kind: DataProductKindSchema,
    owner: z.string().min(1),
    grain: z.string().min(1),
    producerCommand: z.string().min(1),
    expectedUniverse: DataProductExpectedUniverseSchema,
    requiredInputs: z.array(z.string().min(1)),
    downstreamConsumers: z.array(z.string().min(1)),
    freshnessPolicy: DataProductFreshnessPolicySchema,
    lifecycle: DataProductLifecycleSchema.default({ status: "expected" }),
    checks: z.array(DataProductCheckSchema).min(1),
  })
  .strict();

export const DataProductManifestSchema = z
  .object({
    version: z.number().int().positive(),
    products: z.array(DataProductSchema).min(1),
  })
  .strict();

export type DataProductCompletenessStatus = z.output<typeof DataProductCompletenessStatusSchema>;
export type DataProductKind = z.output<typeof DataProductKindSchema>;
export type DataProductRouteUniverse = z.output<typeof DataProductRouteUniverseSchema>;
export type DataProductCheck = z.output<typeof DataProductCheckSchema>;
export type DataProduct = z.output<typeof DataProductSchema>;
export type DataProductManifest = z.output<typeof DataProductManifestSchema>;

export function parseDataProductManifest(input: unknown): DataProductManifest {
  return DataProductManifestSchema.parse(input);
}

export function parseDataProductManifestText(input: string): DataProductManifest {
  return parseDataProductManifest(JSON.parse(input));
}

export const DATA_PRODUCT_MANIFEST: DataProductManifest = DataProductManifestSchema.parse({
  version: 1,
  products: [
    {
      id: "local_route_catalog_release",
      label: "Release route catalog",
      kind: "local_table",
      owner: "tools/pipeline-v2/ingest",
      grain: "route",
      producerCommand: "ingest route-catalog",
      expectedUniverse: {
        description: "The public route catalog that anchors release route universes.",
        routes: "route_catalog",
        months: "release_month",
      },
      requiredInputs: ["source_manifest:current_bus_routes", "source_manifest:current_bus_stops"],
      downstreamConsumers: [
        "route completeness universes",
        "Studio route listing",
        "map route projections",
      ],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "row_count",
          label: "Rows in local_route_catalog",
          type: "table_row_count",
          tableName: "local_route_catalog",
          minRows: 1,
        },
      ],
    },
    {
      id: "local_route_month_coverage_release",
      label: "Route-month source coverage rows",
      kind: "local_table",
      owner: "tools/pipeline-v2/ingest",
      grain: "route x release month",
      producerCommand: "ingest route-coverage",
      expectedUniverse: {
        description:
          "One speed/schedule coverage row for each route with release-month schedule or speed source support.",
        routes: "coverage_source_routes",
        months: "release_month",
      },
      requiredInputs: [
        "local_route_catalog",
        "local_route_segment_speed",
        "local_route_schedule_timepoint",
      ],
      downstreamConsumers: ["route readiness", "route build planning", "source gap findings"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "route_table",
          label: "Route coverage in local_route_month_coverage",
          type: "table_route_coverage",
          tableName: "local_route_month_coverage",
          monthColumn: "month",
          routeColumn: "route_id",
          expectedRoutes: "coverage_source_routes",
        },
      ],
    },
    {
      id: "local_route_readiness_release",
      label: "Route readiness serving rows",
      kind: "serving_projection",
      owner: "tools/pipeline-v2/route",
      grain: "route x release month",
      producerCommand: "route readiness",
      expectedUniverse: {
        description: "One readiness row for each route in the public catalog.",
        routes: "route_catalog",
        months: "release_month",
      },
      requiredInputs: ["local_route_month_coverage", "local_route_catalog"],
      downstreamConsumers: ["route build plan", "Studio route availability labels"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "route_table",
          label: "Route coverage in local_route_readiness",
          type: "table_route_coverage",
          tableName: "local_route_readiness",
          monthColumn: "month",
          routeColumn: "route_id",
          expectedRoutes: "route_catalog",
        },
      ],
    },
    {
      id: "local_route_build_plan_release",
      label: "Route build-plan rows",
      kind: "serving_projection",
      owner: "tools/pipeline-v2/route",
      grain: "route x release month",
      producerCommand: "route build-plan",
      expectedUniverse: {
        description: "One build-plan row for each route in the public catalog.",
        routes: "route_catalog",
        months: "release_month",
      },
      requiredInputs: ["local_route_readiness", "local_route_artifact"],
      downstreamConsumers: ["route batch rebuilds", "publication readiness audits"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "route_table",
          label: "Route coverage in local_route_build_plan",
          type: "table_route_coverage",
          tableName: "local_route_build_plan",
          monthColumn: "month",
          routeColumn: "route_id",
          expectedRoutes: "route_catalog",
        },
      ],
    },
    {
      id: "local_route_month_trends_history",
      label: "Route monthly speed/ridership trend history",
      kind: "local_table",
      owner: "tools/pipeline-v2/ingest",
      grain: "route x month",
      producerCommand: "ingest route-trends; backfill route-ridership-trends",
      expectedUniverse: {
        description: "Route-month trend rows across the historical detector window.",
        routes: "route_catalog",
        months: "history_window",
      },
      requiredInputs: [
        "source_manifest:bus_segment_speeds_2023_2024",
        "source_manifest:bus_segment_speeds_2025",
        "source_manifest:bus_hourly_ridership_2020_2024",
        "source_manifest:bus_hourly_ridership_2025",
      ],
      downstreamConsumers: [
        "analytics corpus profile",
        "route scorecards",
        "degradation trend detectors",
      ],
      freshnessPolicy: { cadence: "historical_window" },
      checks: [
        {
          id: "monthly_table",
          label: "Monthly local_route_month_trend coverage",
          type: "month_table_coverage",
          tableName: "local_route_month_trend",
          monthColumn: "month",
          routeColumn: "route_id",
          expectedMonths: "history_window",
          minRowsPerMonth: 250,
          minRoutesPerMonth: 250,
        },
      ],
    },
    {
      id: "local_route_segment_speed_history",
      label: "Route segment speed history",
      kind: "local_table",
      owner: "tools/pipeline-v2/ingest",
      grain: "route x direction x timepoint-pair x month x day-of-week x hour",
      producerCommand: "ingest route-segment-speeds",
      expectedUniverse: {
        description: "Every month in the historical detector window with enough route coverage.",
        routes: "historical_speed_source_routes",
        months: "history_window",
      },
      requiredInputs: [
        "source_manifest:bus_segment_speeds_2023_2024",
        "source_manifest:bus_segment_speeds_2025",
      ],
      downstreamConsumers: [
        "speed detector baselines",
        "route hotspot scoring",
        "Studio route-detail segment ladders",
      ],
      freshnessPolicy: { cadence: "historical_window" },
      checks: [
        {
          id: "monthly_table",
          label: "Monthly local_route_segment_speed coverage",
          type: "month_table_coverage",
          tableName: "local_route_segment_speed",
          monthColumn: "month",
          routeColumn: "route_id",
          expectedMonths: "history_window",
          minRowsPerMonth: 100_000,
          minRoutesPerMonth: 250,
        },
      ],
    },
    {
      id: "local_route_hourly_ridership_history",
      label: "Route hourly ridership history",
      kind: "local_table",
      owner: "tools/pipeline-v2/ingest",
      grain: "route x month x day-of-week x hour",
      producerCommand: "ingest route-hourly-ridership",
      expectedUniverse: {
        description: "Every month in the historical detector window with enough route coverage.",
        routes: "ridership_source_routes",
        months: "history_window",
      },
      requiredInputs: [
        "source_manifest:bus_hourly_ridership_2020_2024",
        "source_manifest:bus_hourly_ridership_2025",
      ],
      downstreamConsumers: [
        "rider-impact weighting",
        "passenger-load controls",
        "Studio route scorecards",
      ],
      freshnessPolicy: { cadence: "historical_window" },
      checks: [
        {
          id: "monthly_table",
          label: "Monthly local_route_hourly_ridership coverage",
          type: "month_table_coverage",
          tableName: "local_route_hourly_ridership",
          monthColumn: "month",
          routeColumn: "route_id",
          expectedMonths: "history_window",
          minRowsPerMonth: 30_000,
          minRoutesPerMonth: 250,
        },
      ],
    },
    {
      id: "local_intervention_events_release",
      label: "Release intervention event rows",
      kind: "local_table",
      owner: "tools/pipeline-v2/route",
      grain: "intervention event",
      producerCommand: "route intervention-evaluation; docs tier2 promote-interventions",
      expectedUniverse: {
        description:
          "Intervention event rows used to date and type route/corridor treatment comparisons.",
        months: "release_month",
      },
      requiredInputs: [
        "source_manifest:intervention_seed_events",
        "tier2_structured_intervention_extraction_full_corpus",
      ],
      downstreamConsumers: [
        "local_route_intervention_comparison_history",
        "treatment_event_panel_v1",
        "route_treatment_summary_artifact",
      ],
      freshnessPolicy: { cadence: "manual" },
      checks: [
        {
          id: "row_count",
          label: "Rows in local_intervention_event",
          type: "table_row_count",
          tableName: "local_intervention_event",
          minRows: 1,
        },
      ],
    },
    {
      id: "local_route_intervention_comparison_history",
      label: "Route intervention comparison history",
      kind: "local_table",
      owner: "tools/pipeline-v2/route",
      grain: "route x intervention event x release month",
      producerCommand: "route intervention-evaluation",
      expectedUniverse: {
        description: "Every month in the historical detector window with evaluated route panels.",
        routes: "route_catalog",
        months: "history_window",
      },
      requiredInputs: [
        "local_route_segment_speed_history",
        "local_route_hourly_ridership_history",
        "local_intervention_events_release",
      ],
      downstreamConsumers: [
        "intervention association detectors",
        "route briefs",
        "Studio intervention panels",
      ],
      freshnessPolicy: { cadence: "historical_window" },
      checks: [
        {
          id: "monthly_table",
          label: "Monthly local_route_intervention_comparison coverage",
          type: "month_table_coverage",
          tableName: "local_route_intervention_comparison",
          monthColumn: "month",
          routeColumn: "route_id",
          expectedMonths: "history_window",
          minRowsPerMonth: 50,
          minRoutesPerMonth: 25,
        },
      ],
    },
    {
      id: "local_route_schedule_timepoints_release",
      label: "Release-month route schedule timepoints",
      kind: "local_table",
      owner: "tools/pipeline-v2/ingest",
      grain: "route x month x trip x stop sequence",
      producerCommand: "ingest route-schedules",
      expectedUniverse: {
        description:
          "Release-month schedule rows for catalog routes present in the source-year schedule feed.",
        routes: "schedule_source_routes",
        months: "release_month",
      },
      requiredInputs: ["source_manifest:bus_schedules_2023_2026"],
      downstreamConsumers: [
        "planned-service controls",
        "schedule mismatch detectors",
        "stop-direction-hour EWT feature materialization",
      ],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "route_table",
          label: "Route coverage in local_route_schedule_timepoint",
          type: "table_route_coverage",
          tableName: "local_route_schedule_timepoint",
          monthColumn: "month",
          routeColumn: "route_id",
          expectedRoutes: "schedule_source_routes",
        },
      ],
    },
    {
      id: "local_route_schedule_stop_source_backfill",
      label: "Source-year route schedule stop backfill rows",
      kind: "local_table",
      owner: "tools/pipeline-v2/ingest",
      grain: "source year x route x stop schedule row",
      producerCommand: "ingest route-schedules",
      expectedUniverse: {
        description:
          "Source-year schedule rows for current catalog routes across every source year in the historical window; source-absent or lineage-pending routes must be explicit non-complete states.",
        routes: "route_catalog",
        months: "history_window",
      },
      requiredInputs: ["source_manifest:bus_schedules_2023_2026"],
      downstreamConsumers: [
        "local_route_schedule_timepoints_release",
        "planned-service controls",
        "schedule mismatch detectors",
      ],
      freshnessPolicy: { cadence: "historical_window" },
      checks: [
        {
          id: "source_year_routes",
          label: "Source-year x route coverage in local_route_schedule_stop",
          type: "source_year_route_coverage",
          tableName: "local_route_schedule_stop",
          sourceYearColumn: "source_year",
          routeColumn: "route_id",
          expectedRoutes: "route_catalog",
          expectedYears: "history_window_years",
          statusTableName: "local_route_schedule_ingest_status",
          statusSourceYearColumn: "source_year",
          statusRouteColumn: "route_id",
          statusColumn: "status",
          statusRowCountColumn: "row_count",
          waiverArtifactPathTemplate:
            "{artifactRoot}/route-source-reconciliation/{historyStartMonth}_to_{releaseMonth}/route-source-reconciliation.json",
        },
      ],
    },
    {
      id: "local_route_stops_release",
      label: "Release route stop rows",
      kind: "local_table",
      owner: "tools/pipeline-v2/ingest",
      grain: "route x release month x stop x direction",
      producerCommand: "ingest route-catalog",
      expectedUniverse: {
        description: "Route stop rows for every route in the public catalog.",
        routes: "route_catalog",
        months: "release_month",
      },
      requiredInputs: ["source_manifest:current_bus_routes", "source_manifest:current_bus_stops"],
      downstreamConsumers: ["map artifacts", "bus-lane matching", "route brief metrics"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "route_table",
          label: "Route coverage in local_route_stop",
          type: "table_route_coverage",
          tableName: "local_route_stop",
          monthColumn: "month",
          routeColumn: "route_id",
          expectedRoutes: "route_catalog",
        },
      ],
    },
    {
      id: "local_route_reliability_baseline_release",
      label: "Scheduled reliability baseline rows",
      kind: "local_table",
      owner: "tools/pipeline-v2/route",
      grain: "route x release month",
      producerCommand: "route reliability-baseline",
      expectedUniverse: {
        description: "Scheduled headway baseline rows for every route in the public catalog.",
        routes: "route_catalog",
        months: "release_month",
      },
      requiredInputs: ["local_route_schedule_timepoint", "local_route_stop"],
      downstreamConsumers: [
        "observed reliability comparisons",
        "route briefs",
        "schedule mismatch detectors",
      ],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "route_table",
          label: "Route coverage in local_route_reliability_baseline",
          type: "table_route_coverage",
          tableName: "local_route_reliability_baseline",
          monthColumn: "month",
          routeColumn: "route_id",
          expectedRoutes: "route_catalog",
        },
      ],
    },
    {
      id: "local_observed_headway_samples_run",
      label: "Observed GTFS-RT headway samples",
      kind: "local_table",
      owner: "tools/pipeline-v2/build",
      grain: "run x route x direction x stop x observed timestamp",
      producerCommand: "build observed-headways; import bus-observatory-headway-samples",
      expectedUniverse: {
        description: "Observed headway samples for the audited GTFS-RT run.",
        routes: "observed_headway_routes",
        months: "release_month",
      },
      requiredInputs: ["local_gtfs_rt_vehicle_position", "local_gtfs_rt_trip_update"],
      downstreamConsumers: [
        "observed reliability summaries",
        "stop-direction-hour EWT feature materialization",
        "EWT score vectors",
      ],
      freshnessPolicy: { cadence: "run_scoped" },
      checks: [
        {
          id: "row_count",
          label: "Rows in local_observed_headway_sample",
          type: "table_row_count",
          tableName: "local_observed_headway_sample",
          minRows: 1,
        },
      ],
    },
    {
      id: "local_route_observed_reliability_summary_release",
      label: "Observed reliability summary rows",
      kind: "local_table",
      owner: "tools/pipeline-v2/route",
      grain: "route x release month x observed run",
      producerCommand: "route observed-reliability; import bus-observatory-reliability-summary",
      expectedUniverse: {
        description: "Observed reliability summary rows for routes with observed headway support.",
        routes: "observed_headway_routes",
        months: "release_month",
      },
      requiredInputs: ["local_observed_headway_sample", "local_route_reliability_baseline"],
      downstreamConsumers: [
        "evaluation artifacts",
        "route briefs",
        "observed reliability detectors",
        "EWT score vectors",
      ],
      freshnessPolicy: { cadence: "run_scoped" },
      checks: [
        {
          id: "route_table",
          label: "Route coverage in local_route_observed_reliability_summary",
          type: "table_route_coverage",
          tableName: "local_route_observed_reliability_summary",
          monthColumn: "month",
          routeColumn: "route_id",
          runColumn: "run_id",
          expectedRoutes: "observed_headway_routes",
        },
      ],
    },
    {
      id: "stop_direction_hour_ewt_features",
      label: "Stop-direction-hour EWT feature artifacts",
      kind: "detector_feature_artifact",
      owner: "tools/pipeline-v2/build",
      grain: "route x stop x direction x hour",
      producerCommand: "build stop-direction-hour-ewt-features",
      expectedUniverse: {
        description: "Routes with catalog, GTFS static, and observed-headway support.",
        routes: "ewt_eligible_routes",
        months: "release_month",
      },
      requiredInputs: [
        "local_observed_headway_sample",
        "local_gtfs_static_stop_time",
        "local_route_schedule_timepoint",
      ],
      downstreamConsumers: [
        "headway reliability detectors",
        "EWT score vectors",
        "detector readiness packets",
      ],
      freshnessPolicy: { cadence: "run_scoped" },
      checks: [
        {
          id: "route_artifacts",
          label: "Per-route EWT feature JSON files",
          type: "route_artifact_coverage",
          pathTemplate:
            "{artifactRoot}/analytics-stop-direction-hour-ewt/{releaseMonth}/{runId}/{routeId}/stop-direction-hour-ewt-features.json",
          expectedRoutes: "ewt_eligible_routes",
        },
      ],
    },
    {
      id: "ewt_route_month_score_vectors",
      label: "EWT route-month score vectors",
      kind: "score_vector",
      owner: "tools/pipeline-v2/build",
      grain: "route x month score-vector rows",
      producerCommand: "build ewt-score-vectors",
      expectedUniverse: {
        description: "Score vectors for release routes with usable observed reliability support.",
        routes: "observed_reliability_routes",
        months: "history_window",
      },
      requiredInputs: ["stop_direction_hour_ewt_features"],
      downstreamConsumers: [
        "headway detector calibration",
        "near-miss review",
        "Ralph/Codex detector prompt bundles",
      ],
      freshnessPolicy: { cadence: "historical_window" },
      checks: [
        {
          id: "route_vectors",
          label: "Route coverage in EWT score-vector artifact",
          type: "score_vector_routes",
          pathTemplate:
            "{artifactRoot}/analytics-ewt-score-vectors/{historyStartMonth}_to_{releaseMonth}/{releaseMonth}/ewt-route-month-score-vectors.json",
          expectedRoutes: "observed_reliability_routes",
        },
      ],
    },
    {
      id: "local_bus_wait_assessment_history",
      label: "Bus Wait Assessment history",
      kind: "local_table",
      owner: "tools/pipeline-v2/ingest",
      grain: "route x month x day type x trip type x period",
      producerCommand: "ingest bus-wait-assessment",
      expectedUniverse: {
        description: "Bus Wait Assessment rows across the historical detector window.",
        routes: "route_catalog",
        months: "history_window",
      },
      requiredInputs: ["source_manifest:bus_wait_assessment"],
      downstreamConsumers: [
        "analytics corpus profile",
        "reliability context",
        "route evidence caveats",
      ],
      freshnessPolicy: { cadence: "historical_window" },
      checks: [
        {
          id: "monthly_table",
          label: "Monthly local_bus_wait_assessment coverage",
          type: "month_table_coverage",
          tableName: "local_bus_wait_assessment",
          monthColumn: "month",
          routeColumn: "route_id",
          expectedMonths: "history_window",
          minRowsPerMonth: 1_000,
          minRoutesPerMonth: 250,
        },
      ],
    },
    {
      id: "local_bus_customer_journey_metrics_history",
      label: "Bus customer journey metric history",
      kind: "local_table",
      owner: "tools/pipeline-v2/ingest",
      grain: "route x month x trip type x period",
      producerCommand: "ingest bus-customer-journey-metrics",
      expectedUniverse: {
        description: "Customer journey metric rows across the historical detector window.",
        routes: "route_catalog",
        months: "history_window",
      },
      requiredInputs: ["source_manifest:bus_customer_journey_metrics"],
      downstreamConsumers: ["EWT score vectors", "reliability context", "route evidence caveats"],
      freshnessPolicy: { cadence: "historical_window" },
      checks: [
        {
          id: "monthly_table",
          label: "Monthly local_bus_customer_journey_metric coverage",
          type: "month_table_coverage",
          tableName: "local_bus_customer_journey_metric",
          monthColumn: "month",
          routeColumn: "route_id",
          expectedMonths: "history_window",
          minRowsPerMonth: 650,
          minRoutesPerMonth: 250,
        },
      ],
    },
    {
      id: "local_context_event_route_touches_history",
      label: "Context event route-touch history",
      kind: "local_table",
      owner: "tools/pipeline-v2/build",
      grain: "context event x route",
      producerCommand: "build context-event-route-touches",
      expectedUniverse: {
        description: "Route-touch bridge rows derived from geocoded context events.",
        routes: "route_catalog",
        months: "history_window",
      },
      requiredInputs: [
        "local_context_event",
        "local_route_lion_link",
        "local_parking_violation_match",
      ],
      downstreamConsumers: [
        "context detectors",
        "finding review packets",
        "Studio finding caveats",
      ],
      freshnessPolicy: { cadence: "historical_window" },
      checks: [
        {
          id: "row_count",
          label: "Rows in local_context_event_route_touch",
          type: "table_row_count",
          tableName: "local_context_event_route_touch",
          minRows: 1,
        },
      ],
    },
    {
      id: "route_treatment_summary_artifact",
      label: "Route treatment summary artifact",
      kind: "artifact_family",
      owner: "tools/pipeline-v2/studio",
      grain: "route x month x treatment source/segment/source-gap summary",
      producerCommand: "studio route-treatment-summary",
      expectedUniverse: {
        description:
          "Deterministic route treatment, segment overlap, and source-gap summary rows for the release month.",
        routes: "route_catalog",
        months: "release_month",
      },
      requiredInputs: [
        "local_intervention_events_release",
        "local_context_event_route_touches_history",
        "map_base_geojson_artifacts",
        "tier2_structured_intervention_extraction_full_corpus",
      ],
      downstreamConsumers: [
        "intervention_scope_fit_v1",
        "source_gap_model_v1",
        "treatment-scope detectors",
      ],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "summary_json",
          label: "Route treatment summary JSON",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/studio/v2/route-treatment-summary/{releaseMonth}/route-treatment-summary.json",
          validateReleaseMonth: true,
        },
      ],
    },
    {
      id: "local_gtfs_static_bundle_support",
      label: "Static GTFS bundle support tables",
      kind: "local_table",
      owner: "tools/pipeline-v2/ingest",
      grain: "GTFS static bundle x route",
      producerCommand: "ingest gtfs-static-bundles",
      expectedUniverse: {
        description:
          "Current borough and MTA Bus Company GTFS static bundles used for schedule-derived features.",
        months: "release_month",
      },
      requiredInputs: [
        "source_manifest:bus_gtfs_bronx",
        "source_manifest:bus_gtfs_brooklyn",
        "source_manifest:bus_gtfs_manhattan",
        "source_manifest:bus_gtfs_mta_bus_company",
        "source_manifest:bus_gtfs_queens",
        "source_manifest:bus_gtfs_staten_island",
      ],
      downstreamConsumers: [
        "stop-direction-hour EWT features",
        "schedule mismatch detectors",
        "GTFS-backed audit packets",
      ],
      freshnessPolicy: { cadence: "manual" },
      checks: [
        {
          id: "bundles",
          label: "Rows in local_gtfs_static_bundle",
          type: "table_row_count",
          tableName: "local_gtfs_static_bundle",
          minRows: 1,
        },
        {
          id: "routes",
          label: "Rows in local_gtfs_static_route",
          type: "table_row_count",
          tableName: "local_gtfs_static_route",
          minRows: 1,
        },
      ],
    },
    {
      id: "historical_gtfs_static_bundle_snapshots",
      label: "Historical GTFS static bundle snapshots",
      kind: "artifact_family",
      owner: "tools/pipeline-v2/ingest",
      grain: "GTFS static bundle x historical service month",
      producerCommand: "ingest historical-gtfs-static-bundles",
      expectedUniverse: {
        description:
          "Month-addressable historical GTFS static bundles used to prove planned-service facts, schedule shifts, and timeline date validation across the website history window.",
        months: "history_window",
      },
      requiredInputs: ["source_manifest:mta_archived_bus_gtfs_static"],
      downstreamConsumers: [
        "planned_service_baseline_history",
        "scheduled_speed_gap_history",
        "service_change_validation_history",
        "route vitals frequency history",
      ],
      freshnessPolicy: { cadence: "historical_window" },
      lifecycle: {
        status: "blocked",
        gapClass: "upstream_blocked",
        reason:
          "No audited month-by-month historical GTFS static bundle source has been fetched or proven; current GTFS static support is release-window only.",
      },
      checks: [
        {
          id: "historical_bundles",
          label: "Historical GTFS static bundle files",
          type: "artifact_glob",
          rootTemplate: "{repoRoot}/data/raw/gtfs-static/history",
          pattern: "**/*.zip",
          minFiles: 1,
        },
      ],
    },
    {
      id: "planned_service_baseline_history",
      label: "Historical planned-service baseline",
      kind: "serving_projection",
      owner: "tools/pipeline-v2/route",
      grain: "route x month x daypart planned service",
      producerCommand: "build planned-service-baseline-history",
      expectedUniverse: {
        description:
          "Route/month planned-service baseline used for scheduled-speed gaps, reliability schedule baselines, route vitals, and service-change caveats.",
        routes: "route_catalog",
        months: "history_window",
      },
      requiredInputs: [
        "local_route_schedule_stop_source_backfill",
        "historical_gtfs_static_bundle_snapshots",
      ],
      downstreamConsumers: [
        "scheduled-speed gap",
        "Reliability tab schedule baseline",
        "Route vitals frequency/service span",
        "service-change caveats",
      ],
      freshnessPolicy: { cadence: "historical_window" },
      checks: [
        {
          id: "monthly",
          label: "Monthly planned-service baseline coverage",
          type: "month_table_coverage",
          tableName: "local_route_planned_service_baseline",
          monthColumn: "month",
          routeColumn: "route_id",
          expectedMonths: "history_window",
          minRowsPerMonth: 250,
          minRoutesPerMonth: 250,
        },
      ],
    },
    {
      id: "scheduled_speed_gap_history",
      label: "Historical scheduled-speed gap surface",
      kind: "serving_projection",
      owner: "tools/pipeline-v2/route",
      grain: "route x segment x month x daypart scheduled gap",
      producerCommand: "build scheduled-speed-gap-history",
      expectedUniverse: {
        description:
          "Website-facing historical scheduled-speed gap surface. This is the product need, not merely proof that current GTFS rows exist.",
        routes: "speed_source_routes",
        months: "history_window",
      },
      requiredInputs: ["planned_service_baseline_history", "local_route_segment_speed_history"],
      downstreamConsumers: [
        "Slow Segments tab scheduled gap column",
        "Slowest Corridors scheduled-gap ranking",
        "route briefs",
      ],
      freshnessPolicy: { cadence: "historical_window" },
      checks: [
        {
          id: "monthly",
          label: "Monthly scheduled-speed gap coverage",
          type: "month_table_coverage",
          tableName: "local_route_scheduled_speed_gap",
          monthColumn: "month",
          routeColumn: "route_id",
          expectedMonths: "history_window",
          minRowsPerMonth: 250,
          minRoutesPerMonth: 250,
        },
      ],
    },
    {
      id: "service_change_validation_history",
      label: "Historical service-change validation",
      kind: "artifact_family",
      owner: "tools/pipeline-v2/docs/tier2",
      grain: "document event x route x historical service proof",
      producerCommand: "docs tier2 service-change-validation",
      expectedUniverse: {
        description:
          "Validation surface for document-derived route/service-change timeline claims that require historical planned-service or GTFS proof.",
        months: "history_window",
      },
      requiredInputs: [
        "tier2_document_event_route_resolution_v1",
        "historical_gtfs_static_bundle_snapshots",
        "planned_service_baseline_history",
      ],
      downstreamConsumers: [
        "Studio reviewed document timeline projections",
        "route timeline service-change caveats",
        "historical GTFS validation backlog",
      ],
      freshnessPolicy: { cadence: "manual" },
      checks: [
        {
          id: "validation_json",
          label: "Service-change validation JSON",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/service-change-validation/{historyStartMonth}_to_{releaseMonth}/validation.json",
        },
      ],
    },
    {
      id: "raw_historical_route_stop_bundle_snapshots",
      label: "Historical route/stop bundle raw snapshots",
      kind: "artifact_family",
      owner: "tools/pipeline-v2/ingest",
      grain: "Socrata CSV source snapshot",
      producerCommand: "ingest socrata-csv-snapshot",
      expectedUniverse: {
        description:
          "Raw route and stop bundle snapshots used to compare current routing against historical schedule bundles.",
        months: "history_window",
      },
      requiredInputs: [
        "source_manifest:bus_routes_all_bundles",
        "source_manifest:bus_stops_all_bundles",
      ],
      downstreamConsumers: [
        "route redesign series-break handling",
        "historical stop/route geometry comparisons",
      ],
      freshnessPolicy: { cadence: "manual" },
      checks: [
        {
          id: "route_bundles_csv",
          label: "Historical route bundle CSV snapshot",
          type: "artifact_glob",
          rootTemplate: "{repoRoot}/data/raw/socrata-bulk/bus_routes_all_bundles",
          pattern: "rows.csv",
          minFiles: 1,
        },
        {
          id: "stop_bundles_csv",
          label: "Historical stop bundle CSV snapshot",
          type: "artifact_glob",
          rootTemplate: "{repoRoot}/data/raw/socrata-bulk/bus_stops_all_bundles",
          pattern: "rows.csv",
          minFiles: 1,
        },
      ],
    },
    {
      id: "raw_nyc_borough_boundary_snapshot",
      label: "NYC borough boundary raw snapshot",
      kind: "artifact_family",
      owner: "tools/pipeline-v2/ingest",
      grain: "Socrata CSV source snapshot",
      producerCommand: "ingest socrata-csv-snapshot --source nyc_borough_boundaries",
      expectedUniverse: {
        description: "Raw five-borough boundary snapshot for clipping and scope checks.",
        months: "release_month",
      },
      requiredInputs: ["source_manifest:nyc_borough_boundaries"],
      downstreamConsumers: ["map base artifacts", "NYC scope clipping checks"],
      freshnessPolicy: { cadence: "manual" },
      checks: [
        {
          id: "borough_boundaries_csv",
          label: "Borough boundary CSV snapshot",
          type: "artifact_glob",
          rootTemplate: "{repoRoot}/data/raw/socrata-bulk/nyc_borough_boundaries",
          pattern: "rows.csv",
          minFiles: 1,
        },
      ],
    },
    {
      id: "local_ace_enforcement_context_history",
      label: "ACE enforcement context history",
      kind: "local_table",
      owner: "tools/pipeline-v2/ingest",
      grain: "route x enforcement period",
      producerCommand: "ingest ace-routes; ingest ace-violations",
      expectedUniverse: {
        description:
          "ACE route implementation and violation-summary rows used as intervention and enforcement context.",
        months: "history_window",
      },
      requiredInputs: [
        "source_manifest:ace_routes",
        "source_manifest:ace_violations",
        "source_manifest:mta_ace_page",
      ],
      downstreamConsumers: [
        "intervention association detectors",
        "context-correlated disruption detectors",
        "review packets",
      ],
      freshnessPolicy: { cadence: "historical_window" },
      checks: [
        {
          id: "routes",
          label: "Rows in local_ace_route",
          type: "table_row_count",
          tableName: "local_ace_route",
          minRows: 1,
        },
        {
          id: "violations",
          label: "Rows in local_ace_violation_summary",
          type: "table_row_count",
          tableName: "local_ace_violation_summary",
          minRows: 1,
        },
      ],
    },
    {
      id: "local_equity_weather_context_history",
      label: "Equity and weather context history",
      kind: "local_table",
      owner: "tools/pipeline-v2/ingest",
      grain: "tract/day context rows",
      producerCommand: "ingest census-equity-context; ingest weather-observations",
      expectedUniverse: {
        description:
          "Census tract context and NYC weather observations used as detector caveats and controls.",
        months: "history_window",
      },
      requiredInputs: [
        "source_manifest:census_acs5_profile_tracts",
        "source_manifest:noaa_ghcn_daily_nyc",
      ],
      downstreamConsumers: [
        "equity context layers",
        "detector caveats",
        "seasonal/weather sensitivity checks",
      ],
      freshnessPolicy: { cadence: "historical_window" },
      checks: [
        {
          id: "census_context",
          label: "Rows in local_census_tract_equity_context",
          type: "table_row_count",
          tableName: "local_census_tract_equity_context",
          minRows: 1,
        },
        {
          id: "weather",
          label: "Rows in local_weather_observation",
          type: "table_row_count",
          tableName: "local_weather_observation",
          minRows: 1,
        },
      ],
    },
    {
      id: "local_lion_street_reference_history",
      label: "LION street-reference history",
      kind: "local_table",
      owner: "tools/pipeline-v2/ingest",
      grain: "street segment x route link",
      producerCommand: "ingest lion-centerline; build route-lion-links",
      expectedUniverse: {
        description:
          "LION street segments and route links used to spatially join context events to bus routes.",
        routes: "route_catalog",
        months: "history_window",
      },
      requiredInputs: ["source_manifest:nyc_lion_street_centerline"],
      downstreamConsumers: [
        "context event route touches",
        "bus-lane joins",
        "spatial caveats in review packets",
      ],
      freshnessPolicy: { cadence: "historical_window" },
      checks: [
        {
          id: "segments",
          label: "Rows in local_lion_segment",
          type: "table_row_count",
          tableName: "local_lion_segment",
          minRows: 1,
        },
        {
          id: "segment_geom",
          label: "Rows in local_lion_segment_geom",
          type: "table_row_count",
          tableName: "local_lion_segment_geom",
          minRows: 1,
        },
        {
          id: "route_links",
          label: "Rows in local_route_lion_link",
          type: "table_row_count",
          tableName: "local_route_lion_link",
          minRows: 1,
        },
      ],
    },
    {
      id: "local_311_context_history",
      label: "311 bus-relevant context history",
      kind: "local_table",
      owner: "tools/pipeline-v2/ingest",
      grain: "complaint x context event x route touch",
      producerCommand: "ingest 311-service-requests; build context-event-route-touches",
      expectedUniverse: {
        description:
          "Filtered 311 complaint context, explicitly treated as reporting-biased context rather than an operational outcome.",
        routes: "route_catalog",
        months: "history_window",
      },
      requiredInputs: [
        "source_manifest:nyc_311_service_requests_current",
        "source_manifest:nyc_311_service_requests_historical",
      ],
      downstreamConsumers: [
        "context-correlated disruption detectors",
        "review-packet caveats",
        "false-positive analysis",
      ],
      freshnessPolicy: { cadence: "historical_window" },
      checks: [
        {
          id: "requests",
          label: "Rows in local_311_service_request",
          type: "table_row_count",
          tableName: "local_311_service_request",
          minRows: 1,
        },
        {
          id: "context_events",
          label: "Rows in local_context_event",
          type: "table_row_count",
          tableName: "local_context_event",
          minRows: 1,
        },
        {
          id: "route_touches",
          label: "Rows in local_context_event_route_touch",
          type: "table_row_count",
          tableName: "local_context_event_route_touch",
          minRows: 1,
        },
      ],
    },
    {
      id: "local_dot_permit_context_history",
      label: "DOT street-permit context history",
      kind: "local_table",
      owner: "tools/pipeline-v2/ingest",
      grain: "permit x context event x route touch",
      producerCommand: "ingest dot-street-permits; build context-event-route-touches",
      expectedUniverse: {
        description: "Street construction/opening permit context near route segments.",
        routes: "route_catalog",
        months: "history_window",
      },
      requiredInputs: ["source_manifest:nyc_dot_street_construction_permits"],
      downstreamConsumers: [
        "context-correlated disruption detectors",
        "intervention caveats",
        "review packets",
      ],
      freshnessPolicy: { cadence: "historical_window" },
      checks: [
        {
          id: "permits",
          label: "Rows in local_dot_street_permit",
          type: "table_row_count",
          tableName: "local_dot_street_permit",
          minRows: 1,
        },
        {
          id: "route_touches",
          label: "Rows in local_context_event_route_touch",
          type: "table_row_count",
          tableName: "local_context_event_route_touch",
          minRows: 1,
        },
      ],
    },
    {
      id: "local_dot_traffic_speed_context_history",
      label: "DOT traffic-speed context history",
      kind: "local_table",
      owner: "tools/pipeline-v2/ingest",
      grain: "DOT link x observed timestamp",
      producerCommand: "ingest dot-traffic-speeds-history",
      expectedUniverse: {
        description: "NYC DOT roadway speed rows used as congestion context near bus hotspots.",
        months: "history_window",
      },
      requiredInputs: ["source_manifest:nyc_dot_traffic_speeds"],
      downstreamConsumers: [
        "speed hotspot caveats",
        "context-correlated disruption detectors",
        "review packets",
      ],
      freshnessPolicy: { cadence: "historical_window" },
      checks: [
        {
          id: "partitioned_csvs",
          label: "Partitioned DOT traffic-speed CSV snapshots",
          type: "artifact_glob",
          rootTemplate: "{repoRoot}/data/raw/socrata-partitioned/nyc_dot_traffic_speeds",
          pattern: "traffic-speeds-*/chunks/*/rows.csv",
          minFiles: 37,
        },
        {
          id: "traffic_speeds",
          label: "Historical rows in local_dot_traffic_speed",
          type: "table_row_count",
          tableName: "local_dot_traffic_speed",
          minRows: 1000,
        },
      ],
    },
    {
      id: "local_dot_traffic_volume_context_history",
      label: "DOT traffic-volume context history",
      kind: "local_table",
      owner: "tools/pipeline-v2/ingest",
      grain: "street segment x count window",
      producerCommand: "ingest dot-traffic-volumes",
      expectedUniverse: {
        description: "DOT automated traffic-volume counts used as structural traffic context.",
        months: "history_window",
      },
      requiredInputs: ["source_manifest:nyc_dot_traffic_volume_counts"],
      downstreamConsumers: [
        "peer-route baselines",
        "context-correlated disruption detectors",
        "review packets",
      ],
      freshnessPolicy: { cadence: "historical_window" },
      checks: [
        {
          id: "traffic_volumes",
          label: "Rows in local_dot_traffic_volume_count",
          type: "table_row_count",
          tableName: "local_dot_traffic_volume_count",
          minRows: 1,
        },
      ],
    },
    {
      id: "local_parking_violation_context_history",
      label: "Parking violation context history",
      kind: "local_table",
      owner: "tools/pipeline-v2/ingest",
      grain: "violation x matched street/route context",
      producerCommand: "ingest parking-violations",
      expectedUniverse: {
        description:
          "Bus-relevant parking violations and street matches used as blocked-lane/blocked-stop context.",
        routes: "route_catalog",
        months: "history_window",
      },
      requiredInputs: [
        "source_manifest:nyc_parking_violations_current",
        "source_manifest:nyc_parking_violations_fy2023",
        "source_manifest:nyc_parking_violations_fy2024",
        "source_manifest:nyc_parking_violations_fy2025",
      ],
      downstreamConsumers: [
        "context-correlated disruption detectors",
        "intervention enforcement caveats",
        "review packets",
      ],
      freshnessPolicy: { cadence: "historical_window" },
      checks: [
        {
          id: "violations",
          label: "Rows in local_parking_violation",
          type: "table_row_count",
          tableName: "local_parking_violation",
          minRows: 1,
        },
        {
          id: "matches",
          label: "Rows in local_parking_violation_match",
          type: "table_row_count",
          tableName: "local_parking_violation_match",
          minRows: 1,
        },
      ],
    },
    {
      id: "local_collision_context_history",
      label: "NYPD collision context history",
      kind: "local_table",
      owner: "tools/pipeline-v2/ingest",
      grain: "collision x context event x route touch",
      producerCommand: "ingest nypd-collisions; build context-event-route-touches",
      expectedUniverse: {
        description: "Crash-disruption context near bus hotspots and intervention corridors.",
        routes: "route_catalog",
        months: "history_window",
      },
      requiredInputs: ["source_manifest:nypd_motor_vehicle_collisions"],
      downstreamConsumers: [
        "context-correlated disruption detectors",
        "safety caveats",
        "review packets",
      ],
      freshnessPolicy: { cadence: "historical_window" },
      checks: [
        {
          id: "collisions",
          label: "Rows in local_nypd_collision",
          type: "table_row_count",
          tableName: "local_nypd_collision",
          minRows: 1,
        },
        {
          id: "context_events",
          label: "Rows in local_context_event",
          type: "table_row_count",
          tableName: "local_context_event",
          minRows: 1,
        },
      ],
    },
    {
      id: "segment_daypart_history_artifact",
      label: "Segment daypart history feature artifact",
      kind: "detector_feature_artifact",
      owner: "tools/pipeline-v2/build",
      grain: "route x segment x month x daypart",
      producerCommand: "build segment-daypart-history",
      expectedUniverse: {
        description: "Typed segment/daypart history after the fine-grain backfill passes coverage.",
        routes: "route_catalog",
        months: "history_window",
      },
      requiredInputs: ["local_route_segment_speed_history", "analytics_backfill_coverage_audit"],
      downstreamConsumers: [
        "speed detector baselines",
        "travel-time variability detectors",
        "Ralph/Codex detector prompt bundles",
      ],
      freshnessPolicy: { cadence: "historical_window" },
      checks: [
        {
          id: "artifact_file",
          label: "Segment daypart history JSON",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/analytics-feature-history/{historyStartMonth}_to_{releaseMonth}/segment-daypart-history.json",
        },
      ],
    },
    {
      id: "route_hourly_profile_artifact",
      label: "Route hourly profile feature artifact",
      kind: "detector_feature_artifact",
      owner: "tools/pipeline-v2/build",
      grain: "route x month x day-of-week x hour",
      producerCommand: "build route-hourly-profile",
      expectedUniverse: {
        description:
          "Typed route-hourly ridership/profile history after the fine-grain backfill passes coverage.",
        routes: "route_catalog",
        months: "history_window",
      },
      requiredInputs: ["local_route_hourly_ridership_history", "analytics_backfill_coverage_audit"],
      downstreamConsumers: [
        "rider-weighted reliability detectors",
        "passenger-load controls",
        "Ralph/Codex detector prompt bundles",
      ],
      freshnessPolicy: { cadence: "historical_window" },
      checks: [
        {
          id: "artifact_file",
          label: "Route hourly profile JSON",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/analytics-feature-history/{historyStartMonth}_to_{releaseMonth}/route-hourly-profile.json",
        },
      ],
    },
    {
      id: "intervention_panel_artifact",
      label: "Intervention panel feature artifact",
      kind: "detector_feature_artifact",
      owner: "tools/pipeline-v2/build",
      grain: "intervention event x route x month window",
      producerCommand: "build intervention-panel",
      expectedUniverse: {
        description: "Typed intervention panel rows after comparison history passes coverage.",
        routes: "route_catalog",
        months: "history_window",
      },
      requiredInputs: [
        "local_route_intervention_comparison_history",
        "analytics_backfill_coverage_audit",
      ],
      downstreamConsumers: [
        "intervention association detectors",
        "event-study review packets",
        "Ralph/Codex detector prompt bundles",
      ],
      freshnessPolicy: { cadence: "historical_window" },
      checks: [
        {
          id: "artifact_file",
          label: "Intervention panel JSON",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/analytics-feature-history/{historyStartMonth}_to_{releaseMonth}/intervention-panel.json",
        },
      ],
    },
    {
      id: "studio_route_scorecards",
      label: "Studio route scorecard serving rows",
      kind: "serving_projection",
      owner: "tools/pipeline-v2/studio",
      grain: "route x release month",
      producerCommand: "studio release",
      expectedUniverse: {
        description: "One scorecard row for each route in the public route catalog.",
        routes: "route_catalog",
        months: "release_month",
      },
      requiredInputs: ["route brief metrics", "local_route_month_trend"],
      downstreamConsumers: ["GET /api/v1/routes", "Studio route cards"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "route_table",
          label: "Route coverage in local_route_scorecard",
          type: "table_route_coverage",
          tableName: "local_route_scorecard",
          monthColumn: "month",
          routeColumn: "route_id",
          expectedRoutes: "route_catalog",
        },
      ],
    },
    {
      id: "studio_route_brief_summaries",
      label: "Studio route brief summary serving rows",
      kind: "serving_projection",
      owner: "tools/pipeline-v2/studio",
      grain: "route x release month",
      producerCommand: "studio release",
      expectedUniverse: {
        description: "One route brief summary row for each route in the public route catalog.",
        routes: "route_catalog",
        months: "release_month",
      },
      requiredInputs: ["route brief artifacts", "route brief metrics"],
      downstreamConsumers: ["GET /api/v1/studio/routes", "route detail pages"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "route_table",
          label: "Route coverage in local_route_brief_summary",
          type: "table_route_coverage",
          tableName: "local_route_brief_summary",
          monthColumn: "month",
          routeColumn: "route_id",
          expectedRoutes: "route_catalog",
        },
      ],
    },
    {
      id: "studio_route_source_status_rows",
      label: "Studio route source-status serving rows",
      kind: "serving_projection",
      owner: "tools/pipeline-v2/audit",
      grain: "route x release month x source",
      producerCommand: "audit source-coverage",
      expectedUniverse: {
        description: "Source-status rows for each route in the public route catalog.",
        routes: "route_catalog",
        months: "release_month",
      },
      requiredInputs: ["source metadata captures", "local_route_month_coverage"],
      downstreamConsumers: ["Studio route detail source coverage", "source-gap detectors"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "route_table",
          label: "Route coverage in local_route_month_source_status",
          type: "table_route_coverage",
          tableName: "local_route_month_source_status",
          monthColumn: "month",
          routeColumn: "route_id",
          expectedRoutes: "route_catalog",
        },
      ],
    },
    {
      id: "source_month_coverage_matrix",
      label: "Source-month coverage matrix",
      kind: "serving_projection",
      owner: "tools/pipeline-v2/audit",
      grain: "source x month x optional route coverage status",
      producerCommand: "audit data-product-completeness",
      expectedUniverse: {
        description:
          "Public honesty surface that states which source months exist, which are not fetched, and which are blocked before route pages or charts imply coverage.",
        months: "history_window",
      },
      requiredInputs: [
        "local_route_segment_speed_history",
        "local_route_hourly_ridership_history",
        "local_route_schedule_stop_source_backfill",
        "studio_route_source_status_rows",
      ],
      downstreamConsumers: [
        "Data Notes tab",
        "Snapshot 2.0 manifest",
        "route source coverage flags",
      ],
      freshnessPolicy: { cadence: "historical_window" },
      checks: [
        {
          id: "coverage_matrix_json",
          label: "Source-month coverage matrix JSON",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/source-month-coverage/{historyStartMonth}_to_{releaseMonth}/coverage-matrix.json",
        },
      ],
    },
    {
      id: "studio_route_hotspot_summaries",
      label: "Studio route hotspot summary rows",
      kind: "serving_projection",
      owner: "tools/pipeline-v2/route",
      grain: "route x release month",
      producerCommand: "route brief-model",
      expectedUniverse: {
        description: "Hotspot summary rows for each route in the public route catalog.",
        routes: "route_catalog",
        months: "release_month",
      },
      requiredInputs: ["local_route_segment_speed", "local_route_hourly_ridership"],
      downstreamConsumers: ["route briefs", "map route-segment artifacts", "Studio findings"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "route_table",
          label: "Route coverage in local_route_hotspot_summary",
          type: "table_route_coverage",
          tableName: "local_route_hotspot_summary",
          monthColumn: "month",
          routeColumn: "route_id",
          expectedRoutes: "route_catalog",
        },
      ],
    },
    {
      id: "studio_route_peak_windows",
      label: "Studio route peak-window serving rows",
      kind: "serving_projection",
      owner: "tools/pipeline-v2/route",
      grain: "route x release month x window rank",
      producerCommand: "route brief-model",
      expectedUniverse: {
        description:
          "Peak ridership/speed window rows for routes with release-month ridership source support.",
        routes: "ridership_source_routes",
        months: "release_month",
      },
      requiredInputs: ["local_route_hotspot_summary", "local_route_hourly_ridership"],
      downstreamConsumers: ["route briefs", "Studio route detail panels"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "route_table",
          label: "Route coverage in local_route_brief_peak_window",
          type: "table_route_coverage",
          tableName: "local_route_brief_peak_window",
          monthColumn: "month",
          routeColumn: "route_id",
          expectedRoutes: "ridership_source_routes",
        },
      ],
    },
    {
      id: "studio_route_slowest_windows",
      label: "Studio route slowest-window serving rows",
      kind: "serving_projection",
      owner: "tools/pipeline-v2/route",
      grain: "route x release month x window rank",
      producerCommand: "route brief-model",
      expectedUniverse: {
        description:
          "Slowest observed window rows for routes with release-month segment-speed support.",
        routes: "speed_source_routes",
        months: "release_month",
      },
      requiredInputs: ["local_route_hotspot_summary", "local_route_segment_speed"],
      downstreamConsumers: ["route briefs", "Studio route detail panels"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "route_table",
          label: "Route coverage in local_route_brief_slowest_window",
          type: "table_route_coverage",
          tableName: "local_route_brief_slowest_window",
          monthColumn: "month",
          routeColumn: "route_id",
          expectedRoutes: "speed_source_routes",
        },
      ],
    },
    {
      id: "studio_route_comparison_ranks",
      label: "Studio route comparison rank rows",
      kind: "serving_projection",
      owner: "tools/pipeline-v2/route",
      grain: "release month x rank x route",
      producerCommand: "route brief-model",
      expectedUniverse: {
        description: "Comparison ranking rows for routes with release-month segment-speed support.",
        routes: "speed_source_routes",
        months: "release_month",
      },
      requiredInputs: ["local_route_brief_summary"],
      downstreamConsumers: ["GET /api/v1/studio/routes", "route comparison panels"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "route_table",
          label: "Route coverage in local_route_comparison_rank",
          type: "table_route_coverage",
          tableName: "local_route_comparison_rank",
          monthColumn: "month",
          routeColumn: "route_id",
          expectedRoutes: "speed_source_routes",
        },
      ],
    },
    {
      id: "studio_route_speed_history_artifacts",
      label: "Studio route speed-history R2 artifacts",
      kind: "artifact_family",
      owner: "tools/pipeline-v2/studio",
      grain: "route x segment x month x daypart speed-history artifact",
      producerCommand: "studio route-speed-histories",
      expectedUniverse: {
        description:
          "Dense per-route route-speed-history artifacts used by the website carpet/series views.",
        routes: "speed_source_routes",
        months: "history_window",
      },
      requiredInputs: [
        "local_route_segment_speed_history",
        "local_route_schedule_stop_source_backfill",
      ],
      downstreamConsumers: [
        "GET /api/v1/studio/routes/:routeId/speed-history",
        "route speed carpet",
        "compare history panels",
      ],
      freshnessPolicy: { cadence: "historical_window" },
      checks: [
        {
          id: "route_artifacts",
          label: "Route speed-history JSON artifacts",
          type: "route_artifact_coverage",
          pathTemplate: "{artifactRoot}/studio/v2/routes/{routeId}/speed-history.json",
          expectedRoutes: "speed_source_routes",
        },
      ],
    },
    {
      id: "studio_route_speed_history_artifacts_historical_routes",
      label: "Studio route speed-history R2 artifacts for all historical speed routes",
      kind: "artifact_family",
      owner: "tools/pipeline-v2/studio",
      grain: "historical speed route x segment x month x daypart speed-history artifact",
      producerCommand: "studio route-speed-histories",
      expectedUniverse: {
        description:
          "Backfill QA check that every route ever observed in the historical segment-speed corpus has a route-speed-history artifact, including historical routes that are not current release catalog routes.",
        routes: "historical_speed_source_routes",
        months: "history_window",
      },
      requiredInputs: [
        "local_route_segment_speed_history",
        "local_route_schedule_stop_source_backfill",
      ],
      downstreamConsumers: [
        "route speed-history backfill audit",
        "historical route coverage QA",
        "Snapshot 2.0 coverage notes",
      ],
      freshnessPolicy: { cadence: "historical_window" },
      checks: [
        {
          id: "route_artifacts",
          label: "Route speed-history JSON artifacts for historical speed routes",
          type: "route_artifact_coverage",
          pathTemplate: "{artifactRoot}/studio/v2/routes/{routeId}/speed-history.json",
          expectedRoutes: "historical_speed_source_routes",
        },
      ],
    },
    {
      id: "route_speed_history_coverage_index",
      label: "Route speed-history coverage index",
      kind: "serving_projection",
      owner: "tools/pipeline-v2/export",
      grain: "route x release x route-speed-history publication status",
      producerCommand: "export d1",
      expectedUniverse: {
        description:
          "Compact D1/R2 coverage index that lets the app advertise route-speed-history availability without probing R2.",
        routes: "speed_source_routes",
        months: "release_month",
      },
      requiredInputs: ["studio_route_speed_history_artifacts"],
      downstreamConsumers: [
        "Snapshot 2.0 manifest",
        "route list surface flags",
        "deferred route-speed-history loader",
      ],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "route_table",
          label: "Route coverage in local_route_speed_history_coverage",
          type: "table_route_coverage",
          tableName: "local_route_speed_history_coverage",
          monthColumn: "month",
          routeColumn: "route_id",
          expectedRoutes: "speed_source_routes",
        },
      ],
    },
    {
      id: "studio_route_artifact_index",
      label: "Studio route artifact index rows",
      kind: "serving_projection",
      owner: "tools/pipeline-v2/brief",
      grain: "route x release month x artifact",
      producerCommand: "brief artifacts",
      expectedUniverse: {
        description: "Route artifact index rows for public-visible release routes.",
        routes: "public_visible_routes",
        months: "release_month",
      },
      requiredInputs: ["generated_route_briefs"],
      downstreamConsumers: ["D1 serving export", "publish completeness check"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "route_table",
          label: "Route coverage in local_route_artifact",
          type: "table_route_coverage",
          tableName: "local_route_artifact",
          monthColumn: "month",
          routeColumn: "route_id",
          expectedRoutes: "public_visible_routes",
        },
      ],
    },
    {
      id: "studio_corridor_projection_rows",
      label: "Studio corridor serving rows",
      kind: "serving_projection",
      owner: "tools/pipeline-v2/corridor",
      grain: "corridor x release month",
      producerCommand: "corridor model",
      expectedUniverse: {
        description: "Corridor summary rows for generated corridor pages.",
        months: "release_month",
      },
      requiredInputs: ["local_corridor", "local_corridor_route_member", "local_route_hotspot"],
      downstreamConsumers: ["corridor briefs", "D1 serving export", "Studio corridor panels"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "row_count",
          label: "Rows in local_corridor_month_summary",
          type: "table_row_count",
          tableName: "local_corridor_month_summary",
          minRows: 1,
        },
      ],
    },
    {
      id: "route_brief_input_slices",
      label: "Route brief input slice artifacts",
      kind: "artifact_family",
      owner: "tools/pipeline-v2/route",
      grain: "route x release month JSON input slice",
      producerCommand: "route brief-model",
      expectedUniverse: {
        description: "One route brief input slice for each route in the public route catalog.",
        routes: "route_catalog",
        months: "release_month",
      },
      requiredInputs: [
        "local_route_segment_speed",
        "local_route_hourly_ridership",
        "local_route_schedule_timepoint",
      ],
      downstreamConsumers: ["generated_route_briefs", "Studio release projection"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "route_artifacts",
          label: "Per-route route-brief-input JSON files",
          type: "route_artifact_coverage",
          pathTemplate:
            "{artifactRoot}/route-slices/{routeId}-{releaseMonth}/route-brief-input.json",
          expectedRoutes: "route_catalog",
        },
      ],
    },
    {
      id: "generated_route_briefs",
      label: "Generated route brief artifacts",
      kind: "artifact_family",
      owner: "tools/pipeline-v2/brief",
      grain: "route x release month JSON brief",
      producerCommand: "brief artifacts",
      expectedUniverse: {
        description: "One generated brief body for each public-visible release route.",
        routes: "public_visible_routes",
        months: "release_month",
      },
      requiredInputs: ["route brief input slices", "promoted findings"],
      downstreamConsumers: ["Studio route detail", "publish R2 artifacts"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "route_artifacts",
          label: "Per-route brief JSON files",
          type: "route_artifact_coverage",
          pathTemplate: "{artifactRoot}/briefs/routes/{routeId}/{releaseMonth}/brief.json",
          expectedRoutes: "public_visible_routes",
        },
      ],
    },
    {
      id: "map_route_segment_geojsons",
      label: "Map route-segment GeoJSON artifacts",
      kind: "artifact_family",
      owner: "tools/pipeline-v2/map",
      grain: "route x release month GeoJSON",
      producerCommand: "map artifacts",
      expectedUniverse: {
        description: "One route-segment GeoJSON artifact for each public-visible release route.",
        routes: "public_visible_routes",
        months: "release_month",
      },
      requiredInputs: [
        "local_route_segment_speed",
        "local_route_hotspot_summary",
        "current route shape snapshots",
      ],
      downstreamConsumers: ["Studio route maps", "publish R2 artifacts"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "route_artifacts",
          label: "Per-route segment GeoJSON files",
          type: "route_artifact_coverage",
          pathTemplate:
            "{artifactRoot}/map/route-segments/{routeId}/{releaseMonth}/all-day.geojson",
          expectedRoutes: "public_visible_routes",
        },
      ],
    },
    {
      id: "map_base_geojson_artifacts",
      label: "Map base GeoJSON artifacts",
      kind: "artifact_family",
      owner: "tools/pipeline-v2/map",
      grain: "release month map support artifact",
      producerCommand: "map artifacts",
      expectedUniverse: {
        description: "Shared route-shape, stop, bus-lane, and source-snapshot map artifacts.",
        months: "release_month",
      },
      requiredInputs: [
        "source_manifest:current_bus_routes",
        "source_manifest:current_bus_stops",
        "source_manifest:nyc_dot_bus_lanes_local_streets",
      ],
      downstreamConsumers: ["Studio map shell", "publish R2 artifacts"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "source_snapshot",
          label: "Map source snapshot JSON",
          type: "json_artifact",
          pathTemplate: "{artifactRoot}/map/sources/source-snapshot.json",
        },
        {
          id: "route_shapes",
          label: "Current route shapes GeoJSON",
          type: "json_artifact",
          pathTemplate: "{artifactRoot}/map/routes/current-local-limited-sbs.min.geojson",
        },
        {
          id: "timepoint_stops",
          label: "Current timepoint stops GeoJSON",
          type: "json_artifact",
          pathTemplate: "{artifactRoot}/map/stops/current-timepoints.min.geojson",
        },
        {
          id: "bus_lanes",
          label: "Bus lane GeoJSON",
          type: "json_artifact",
          pathTemplate: "{artifactRoot}/map/bus-lanes/local-streets.min.geojson",
        },
      ],
    },
    {
      id: "evaluation_payload_artifacts",
      label: "Evaluation payload artifacts",
      kind: "artifact_family",
      owner: "tools/pipeline-v2/evaluation",
      grain: "release month evaluation JSON",
      producerCommand: "evaluation artifacts",
      expectedUniverse: {
        description:
          "Observed reliability, route-intervention, and corridor-intervention payloads.",
        months: "release_month",
      },
      requiredInputs: [
        "local_route_observed_reliability_summary",
        "local_route_intervention_comparison",
        "local_corridor_intervention_context",
      ],
      downstreamConsumers: ["Studio intervention panels", "publish R2 artifacts"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "observed_reliability",
          label: "Observed reliability evaluation JSON",
          type: "json_artifact",
          pathTemplate: "{artifactRoot}/evaluations/{releaseMonth}/observed-reliability.json",
        },
        {
          id: "route_interventions",
          label: "Route intervention evaluation JSON",
          type: "json_artifact",
          pathTemplate: "{artifactRoot}/evaluations/{releaseMonth}/interventions.json",
        },
        {
          id: "corridor_interventions",
          label: "Corridor intervention evaluation JSON",
          type: "json_artifact",
          pathTemplate: "{artifactRoot}/evaluations/{releaseMonth}/corridor-interventions.json",
        },
      ],
    },
    {
      id: "brief_release_manifest",
      label: "Brief release manifest",
      kind: "release_manifest",
      owner: "tools/pipeline-v2/brief",
      grain: "release month artifact manifest",
      producerCommand: "brief artifacts",
      expectedUniverse: {
        description: "One brief manifest for the release month.",
        months: "release_month",
      },
      requiredInputs: ["generated_route_briefs", "generated corridor briefs"],
      downstreamConsumers: ["publish R2 artifacts", "publish completeness check"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "manifest_file",
          label: "Brief manifest JSON",
          type: "json_artifact",
          pathTemplate: "{artifactRoot}/briefs/{releaseMonth}/manifest.json",
        },
      ],
    },
    {
      id: "map_release_manifest",
      label: "Map release manifest",
      kind: "release_manifest",
      owner: "tools/pipeline-v2/map",
      grain: "release month map artifact manifest",
      producerCommand: "map artifacts",
      expectedUniverse: {
        description: "One map manifest for the release month.",
        months: "release_month",
      },
      requiredInputs: ["route geometry", "segment speed artifacts", "bus lane geometry"],
      downstreamConsumers: ["GET /api/v1/map/manifest", "route maps", "publish R2 artifacts"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "manifest_file",
          label: "Map manifest JSON",
          type: "json_artifact",
          pathTemplate: "{artifactRoot}/map/{releaseMonth}/manifest.json",
        },
      ],
    },
    {
      id: "evaluation_release_manifest",
      label: "Evaluation release manifest",
      kind: "release_manifest",
      owner: "tools/pipeline-v2/evaluation",
      grain: "release month intervention/evaluation manifest",
      producerCommand: "evaluation artifacts",
      expectedUniverse: {
        description: "One evaluation manifest for the release month.",
        months: "release_month",
      },
      requiredInputs: ["local_route_intervention_comparison", "corridor intervention context"],
      downstreamConsumers: ["publish R2 artifacts", "route intervention panels"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "manifest_file",
          label: "Evaluation manifest JSON",
          type: "json_artifact",
          pathTemplate: "{artifactRoot}/evaluations/{releaseMonth}/manifest.json",
        },
      ],
    },
    {
      id: "studio_release_projection_manifest",
      label: "Studio release projection manifest",
      kind: "release_manifest",
      owner: "tools/pipeline-v2/studio",
      grain: "release projection bundle",
      producerCommand: "studio release",
      expectedUniverse: {
        description: "Canonical Studio release payload for the public release month.",
        months: "release_month",
      },
      requiredInputs: ["D1 serving export", "route-slices", "promoted findings"],
      downstreamConsumers: ["public Studio app", "publish R2 artifacts"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "release_json",
          label: "Studio release JSON",
          type: "json_artifact",
          pathTemplate: "{artifactRoot}/studio/v1/release.json",
        },
      ],
    },
    {
      id: "studio_static_projection_indexes",
      label: "Studio static projection indexes",
      kind: "serving_projection",
      owner: "tools/pipeline-v2/studio",
      grain: "release projection index JSON",
      producerCommand: "studio release",
      expectedUniverse: {
        description: "Static route, finding, brief, method, and docs projection indexes.",
        months: "release_month",
      },
      requiredInputs: ["studio_release_projection_manifest"],
      downstreamConsumers: ["public Studio app", "static asset fallback"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "routes",
          label: "Studio routes index JSON",
          type: "json_artifact",
          pathTemplate: "{artifactRoot}/studio/v1/routes.json",
        },
        {
          id: "findings",
          label: "Studio findings index JSON",
          type: "json_artifact",
          pathTemplate: "{artifactRoot}/studio/v1/findings.json",
        },
        {
          id: "briefs",
          label: "Studio briefs index JSON",
          type: "json_artifact",
          pathTemplate: "{artifactRoot}/studio/v1/briefs.json",
        },
        {
          id: "methods",
          label: "Studio methods index JSON",
          type: "json_artifact",
          pathTemplate: "{artifactRoot}/studio/v1/methods.json",
        },
        {
          id: "docs",
          label: "Studio docs index JSON",
          type: "json_artifact",
          pathTemplate: "{artifactRoot}/studio/v1/docs.json",
        },
      ],
    },
    {
      id: "analytics_backfill_coverage_audit",
      label: "Analytics backfill coverage audit",
      kind: "release_manifest",
      owner: "tools/pipeline-v2/audit",
      grain: "historical window coverage JSON",
      producerCommand: "audit analytics-backfill-coverage",
      expectedUniverse: {
        description:
          "Coverage audit for route segment speed, hourly ridership, and intervention comparison backfills.",
        months: "history_window",
      },
      requiredInputs: [
        "local_route_segment_speed_history",
        "local_route_hourly_ridership_history",
        "local_route_intervention_comparison_history",
      ],
      downstreamConsumers: [
        "analytics corpus profile",
        "feature-history materialization",
        "detector readiness",
      ],
      freshnessPolicy: { cadence: "historical_window" },
      checks: [
        {
          id: "coverage_json",
          label: "Analytics backfill coverage JSON",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/analytics-backfill-coverage/{historyStartMonth}_to_{releaseMonth}/coverage.json",
        },
      ],
    },
    {
      id: "analytics_corpus_profile_artifact",
      label: "Analytics corpus profile artifact",
      kind: "release_manifest",
      owner: "tools/pipeline-v2/audit",
      grain: "release month profile JSON",
      producerCommand: "audit analytics-corpus-profile",
      expectedUniverse: {
        description: "Historical corpus profile used before detector and data-product decisions.",
        months: "history_window",
      },
      requiredInputs: [
        "local_route_month_trends_history",
        "local_route_segment_speed_history",
        "local_route_hourly_ridership_history",
        "local_route_observed_reliability_summary_release",
      ],
      downstreamConsumers: [
        "detector readiness",
        "Ralph/Codex detector prompt bundles",
        "backfill acceptance notes",
      ],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "profile_json",
          label: "Analytics corpus profile JSON",
          type: "json_artifact",
          pathTemplate: "{artifactRoot}/analytics-corpus-profile/{releaseMonth}/profile.json",
          validateReleaseMonth: true,
        },
      ],
    },
    {
      id: "bus_observatory_gtfs_rt_availability",
      label: "Bus Observatory GTFS-RT availability artifact",
      kind: "release_manifest",
      owner: "tools/pipeline-v2/check",
      grain: "release month source availability JSON",
      producerCommand: "check bus-observatory-gtfs-rt",
      expectedUniverse: {
        description: "Availability decision artifact for observed GTFS-RT release handoffs.",
        months: "release_month",
      },
      requiredInputs: [
        "source_manifest:bus_time_gtfsrt_alerts",
        "source_manifest:bus_time_gtfsrt_trip_updates",
        "source_manifest:bus_time_gtfsrt_vehicle_positions",
        "Worker GTFS-RT manifests",
        "R2 GTFS-RT raw snapshots",
      ],
      downstreamConsumers: [
        "Bus Observatory backfill",
        "observed reliability imports",
        "Studio current-signal appendix",
      ],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "availability_json",
          label: "Bus Observatory availability JSON",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/source-availability/bus-observatory-gtfs-rt-{releaseMonth}.json",
          validateReleaseMonth: true,
        },
      ],
    },
    {
      id: "d1_serving_export_artifacts",
      label: "D1 serving export artifacts",
      kind: "release_manifest",
      owner: "tools/pipeline-v2/export",
      grain: "release month schema/seed/export summary",
      producerCommand: "export d1",
      expectedUniverse: {
        description: "D1 schema, seed SQL, replay SQLite, and export summary for the release.",
        months: "release_month",
      },
      requiredInputs: [
        "studio_route_scorecards",
        "studio_route_brief_summaries",
        "studio_route_artifact_index",
      ],
      downstreamConsumers: ["verify d1", "studio release", "publish R2 artifacts"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "export_summary",
          label: "D1 export summary JSON",
          type: "json_artifact",
          pathTemplate: "{repoRoot}/data/exports/d1/{releaseMonth}/export-summary.json",
        },
        {
          id: "schema_sql",
          label: "D1 schema SQL",
          type: "file_artifact",
          pathTemplate: "{repoRoot}/data/exports/d1/{releaseMonth}/schema.sql",
        },
        {
          id: "seed_sql",
          label: "D1 seed SQL",
          type: "file_artifact",
          pathTemplate: "{repoRoot}/data/exports/d1/{releaseMonth}/seed.sql",
        },
        {
          id: "serving_sqlite",
          label: "D1 replay SQLite database",
          type: "file_artifact",
          pathTemplate: "{repoRoot}/data/exports/d1/{releaseMonth}/serving.sqlite",
        },
      ],
    },
    {
      id: "d1_serving_verify_artifact",
      label: "D1 serving verification artifact",
      kind: "release_manifest",
      owner: "tools/pipeline-v2/verify",
      grain: "release month D1 replay verification",
      producerCommand: "verify d1",
      expectedUniverse: {
        description: "Verification summary proving the generated D1 seed replays cleanly.",
        months: "release_month",
      },
      requiredInputs: ["d1_serving_export_artifacts"],
      downstreamConsumers: ["publish:serving-release", "release promotion checklist"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "verify_summary",
          label: "D1 verify summary JSON",
          type: "json_artifact",
          pathTemplate: "{repoRoot}/data/exports/d1/{releaseMonth}/verify-summary.json",
        },
      ],
    },
    {
      id: "tier2_ocr_raw_handoff_archives",
      label: "Tier 2 OCR raw handoff archives",
      kind: "artifact_family",
      owner: "tools/pipeline-v2/docs/tier2",
      grain: "external OCR handoff archive",
      producerCommand: "docs:tier2 OCR handoff/import",
      expectedUniverse: {
        description:
          "Raw third-party/OCR handoff archives preserved outside operational logs so the OCR text layer can be re-audited or re-imported.",
      },
      requiredInputs: ["Tier 2 source registry/backlog", "LLM OCR runs"],
      downstreamConsumers: ["tier2_ocr_page_markdown_corpus", "OCR provenance audits"],
      freshnessPolicy: { cadence: "manual" },
      checks: [
        {
          id: "raw_handoff_archives",
          label: "Preserved OCR handoff zip archives",
          type: "artifact_glob",
          rootTemplate: "{repoRoot}/data/raw/third-party/tier2-ocr-handoffs",
          pattern: "**/*.zip",
          minFiles: 2,
        },
      ],
    },
    {
      id: "tier2_ocr_page_markdown_corpus",
      label: "Tier 2 OCR page Markdown corpus",
      kind: "artifact_family",
      owner: "tools/pipeline-v2/docs/tier2",
      grain: "source PDF page Markdown",
      producerCommand: "docs:tier2 ocr-page-markdown",
      expectedUniverse: {
        description:
          "Full Tier 2 document corpus has one OCR Markdown page per rendered PDF page, plus audit/manifests proving page-level coverage. This is text coverage only; it is not the structured extraction layer.",
      },
      requiredInputs: [
        "Tier 2 source registry/backlog",
        "tier2_ocr_raw_handoff_archives",
        "rendered per-page PNGs",
      ],
      downstreamConsumers: [
        "tier2_structured_intervention_extraction_full_corpus",
        "finding evidence corpus",
        "document evidence search",
      ],
      freshnessPolicy: { cadence: "manual" },
      checks: [
        {
          id: "prepare_manifest",
          label: "Full Tier 2 OCR prepare manifest",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/docs/tier2-full-corpus-2026-05-24-pass2/ocr-page-markdown-prepare-v1.json",
        },
        {
          id: "page_markdown_files",
          label: "Full Tier 2 OCR page Markdown files",
          type: "artifact_glob",
          rootTemplate:
            "{artifactRoot}/docs/tier2-full-corpus-2026-05-24-pass2/ocr-page-markdown-pioneer-gemini35-lowhanging-v1",
          pattern: "**/*.md",
          minFiles: 9262,
        },
        {
          id: "page_markdown_audit",
          label: "Full Tier 2 OCR page Markdown audit",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/docs/tier2-ocr-audits/gemini35-lowhanging-v1/ocr-page-markdown-audit.json",
        },
        {
          id: "source_manifests",
          label: "Full Tier 2 OCR per-source manifests",
          type: "artifact_glob",
          rootTemplate: "{artifactRoot}/docs/tier2-ocr-audits/gemini35-lowhanging-v1/manifests",
          pattern: "*.json",
          minFiles: 386,
        },
      ],
    },
    {
      id: "tier2_ocr_preservation_overlay",
      label: "Tier 2 OCR preservation overlay",
      kind: "artifact_family",
      owner: "tools/pipeline-v2/docs/tier2",
      grain: "preserved OCR source reconciliation",
      producerCommand: "docs:tier2 preserve/reconcile older OCR Markdown",
      expectedUniverse: {
        description:
          "Overlay artifacts preserving older valid OCR Markdown and source reconciliation so the full text corpus can reuse rather than discard prior OCR work.",
      },
      requiredInputs: ["older OCR Markdown corpus", "tier2_ocr_page_markdown_corpus"],
      downstreamConsumers: ["tier2_structured_intervention_extraction_full_corpus"],
      freshnessPolicy: { cadence: "manual" },
      checks: [
        {
          id: "preserved_source_registration",
          label: "Preserved source registration",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/docs/tier2-ocr-preservation-20260531/preserved-source-registration.json",
        },
        {
          id: "ocr_reuse_overlay",
          label: "Current full-corpus OCR reuse overlay",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/docs/tier2-ocr-preservation-20260531/current-full-corpus-ocr-reuse-overlay.json",
        },
        {
          id: "older_page_md_reconciliation",
          label: "Older page Markdown source reconciliation",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/docs/tier2-ocr-preservation-20260531/older-page-md-source-reconciliation.json",
        },
      ],
    },
    {
      id: "tier2_structured_intervention_extraction_full_corpus",
      label: "Tier 2 structured intervention extraction from OCR corpus",
      kind: "artifact_family",
      owner: "tools/pipeline-v2/docs/tier2",
      grain: "reviewed document intervention/event records",
      producerCommand: "docs:tier2 extract/promote structured interventions from OCR Markdown",
      expectedUniverse: {
        description:
          "Structured intervention candidates/events extracted from the full OCR Markdown corpus, reviewed, de-duplicated, and promoted into publishable intervention records. This is the known missing layer after OCR text coverage.",
      },
      requiredInputs: ["tier2_ocr_page_markdown_corpus", "tier2_ocr_preservation_overlay"],
      downstreamConsumers: ["Studio intervention timeline", "finding evidence corpus"],
      freshnessPolicy: { cadence: "manual" },
      checks: [
        {
          id: "candidate_bundle_combined",
          label: "Full Tier 2 combined candidate bundle",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/docs/tier2-full-corpus-2026-05-24-pass2/candidate-bundle-combined.json",
        },
        {
          id: "intervention_events_combined",
          label: "Full Tier 2 combined intervention events",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/docs/tier2-full-corpus-2026-05-24-pass2/tier2-intervention-events-combined.json",
        },
        {
          id: "mta_wiki_canonical_bridge_review_queue",
          label: "mta-wiki canonical bridge review queue",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/docs/mta-wiki-tier2-bridge/mta-wiki-intervention-review-queue.json",
          requiredJsonValues: [
            { path: "mtaWikiCanonicalBridge", equals: true },
            { path: "summary.externalCorpus", equals: "mta-wiki" },
            { path: "summary.publicPromotionStatus", equals: "not_ready" },
          ],
          semantic: "mta_wiki_bridge_ready_for_review",
        },
        {
          id: "full_corpus_materialized_research_views",
          label: "Full qv1-qv10 Tier 2 materialized research views",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/docs/agentic-runs-20260604/vocab-materialized-views-full-authority-qv1-qv10-manual-vocab-v1/vocab-materialized-views.json",
          requiredJsonValues: [
            { path: "artifactKind", equals: "bp.tier2_vocab_materialized_views.v1" },
          ],
          semantic: "tier2_full_corpus_materialized_views_ready",
        },
        {
          id: "source_disposition_queue_full_corpus",
          label: "Full qv1-qv10 Tier 2 source disposition queue",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/docs/agentic-runs-20260604/source-disposition-queue-full-authority-qv1-qv10-v1/source-disposition-queue.json",
          requiredJsonValues: [
            { path: "artifactKind", equals: "bp.tier2_source_disposition_queue.v1" },
            { path: "summary.publicPromotionStatus", equals: "not_ready" },
          ],
          semantic: "tier2_source_disposition_queue_ready",
        },
        {
          id: "source_receipt_closure_full_corpus",
          label: "Full qv1-qv10 Tier 2 source receipt closure audit",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/docs/agentic-runs-20260604/source-receipt-closure-full-authority-qv1-qv10-v1/source-receipt-closure-audit.json",
          requiredJsonValues: [
            { path: "artifactKind", equals: "bp.tier2_source_receipt_closure_audit.v1" },
            { path: "summary.publicPromotionStatus", equals: "not_ready" },
          ],
          semantic: "tier2_source_receipt_closure_ready",
        },
        {
          id: "reviewed_intervention_records_full_corpus",
          label: "Full Tier 2 reviewed intervention records",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/docs/tier2-full-corpus-2026-05-24-pass2/intervention-records-corpus-reviewed.json",
        },
        {
          id: "publishable_interventions_full_corpus",
          label: "Full Tier 2 publishable intervention artifact",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/docs/tier2-full-corpus-2026-05-24-pass2/intervention-publishable-v1.json",
          semantic: "tier2_publishable_ready",
        },
      ],
    },
    {
      id: "tier2_document_derived_surfaces_v1",
      label: "Tier 2 document-derived surfaces v1",
      kind: "artifact_family",
      owner: "tools/pipeline-v2/docs/tier2",
      grain: "source-grounded document surface row",
      producerCommand: "docs tier2 derive-surfaces",
      expectedUniverse: {
        description:
          "Normalized research substrate derived from canonical Tier 2 discovery candidates, preserving source/page/block-line evidence, raw candidate payloads, lifecycle states, and typed entities, metric claims, events, tables, claims, context signals, review questions, and relation placeholders.",
      },
      requiredInputs: [
        "tier2_ocr_page_markdown_corpus",
        "document-discovery-normalized-candidates-canonical-v1",
      ],
      downstreamConsumers: [
        "applied_research_pulse_candidate_set",
        "detector review packets",
        "finding evidence corpus",
        "source-gap review queue",
        "Studio reviewed document timeline projections",
      ],
      freshnessPolicy: { cadence: "manual" },
      checks: [
        {
          id: "manifest",
          label: "Document-derived surfaces manifest",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/docs/tier2-full-corpus-2026-05-24-pass2/document-derived-surfaces-v1/manifest.json",
          requiredJsonValues: [
            {
              path: "artifactKind",
              equals: "bp.document_derived_surfaces.v1",
            },
          ],
        },
        {
          id: "surface_files",
          label: "Document-derived surface JSONL files",
          type: "artifact_glob",
          rootTemplate:
            "{artifactRoot}/docs/tier2-full-corpus-2026-05-24-pass2/document-derived-surfaces-v1",
          pattern: "*.jsonl",
          minFiles: 8,
        },
      ],
    },
    {
      id: "tier2_document_event_route_resolution_v1",
      label: "Tier 2 document event route resolution v1",
      kind: "artifact_family",
      owner: "tools/pipeline-v2/docs/tier2",
      grain: "document event surface row with timeline eligibility and route-resolution evidence",
      producerCommand: "docs tier2 event-route-resolution",
      expectedUniverse: {
        description:
          "Deterministic audit over document-derived event surfaces. It gates process/evaluation/context rows away from intervention timelines, resolves route identity through direct event text, single-route source context, and current-GTFS stop-street gazetteer matches, and explicitly marks event-date validation as requiring historical GTFS.",
      },
      requiredInputs: [
        "tier2_document_derived_surfaces_v1",
        "local_route_catalog",
        "local_route_stop",
      ],
      downstreamConsumers: [
        "route-specific Tier 2 review queues",
        "applied_research_pulse_candidate_set",
        "historical GTFS validation backlog",
        "Studio reviewed document timeline projections",
      ],
      freshnessPolicy: { cadence: "manual" },
      checks: [
        {
          id: "route_resolution_artifact",
          label: "Document event route-resolution artifact",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/docs/tier2-full-corpus-2026-05-24-pass2/document-derived-surfaces-v1/document-event-route-resolution-v1.json",
          requiredJsonValues: [
            {
              path: "artifactKind",
              equals: "bp.tier2_document_event_route_resolution.v1",
            },
          ],
        },
      ],
    },
    {
      id: "tier2_route_review_queue_v1",
      label: "Tier 2 route review queue v1",
      kind: "artifact_family",
      owner: "tools/pipeline-v2/docs/tier2",
      grain: "route-specific review queue item derived from document event route resolution",
      producerCommand: "docs tier2 route-review-queue",
      expectedUniverse: {
        description:
          "Reviewer-facing queue that fans route-resolved document intervention candidates into one row per route/event pair. Items preserve route-resolution evidence, source refs, review tasks, decision options, priority bands, and the required historical-GTFS date-validation caveat.",
      },
      requiredInputs: ["tier2_document_event_route_resolution_v1"],
      downstreamConsumers: [
        "route-specific Tier 2 review sessions",
        "historical GTFS validation backlog",
        "Studio reviewed document timeline projections",
        "applied_research_pulse_candidate_set",
      ],
      freshnessPolicy: { cadence: "manual" },
      checks: [
        {
          id: "route_review_queue_artifact",
          label: "Document route review queue artifact",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/docs/tier2-full-corpus-2026-05-24-pass2/document-derived-surfaces-v1/document-route-review-queue-v1.json",
          requiredJsonValues: [
            {
              path: "artifactKind",
              equals: "bp.tier2_route_review_queue.v1",
            },
          ],
        },
      ],
    },
    {
      id: "tier2_docs_pipeline_status",
      label: "Tier 2 docs selected publishable gate",
      kind: "release_manifest",
      owner: "tools/pipeline-v2/docs/tier2",
      grain: "selected docs run publishable gate JSON",
      producerCommand: "docs:tier2 promote-publishable-interventions",
      expectedUniverse: {
        description:
          "Publishable gate artifact for the selected docs run. Historical/deleted pipeline status files are retained as provenance but are not the release gate.",
      },
      requiredInputs: ["selected Tier 2 docs run artifacts", "studio_release_projection_manifest"],
      downstreamConsumers: ["release promotion checklist", "Studio Tier 2 affordance audit"],
      freshnessPolicy: { cadence: "manual" },
      checks: [
        {
          id: "publishable_gate_json",
          label: "Selected Tier 2 publishable gate JSON",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/docs/gap-roadmap-docs-2026-05-25/intervention-publishable-v1.json",
          semantic: "tier2_publishable_ready",
        },
      ],
    },
    {
      id: "applied_research_segment_daypart_panel",
      label: "Applied-research segment daypart panel",
      kind: "artifact_family",
      owner: "packages/applied-research",
      grain: "segment-daypart-month panel",
      producerCommand: "applied-research build segment-daypart-panel",
      expectedUniverse: {
        description:
          "Long-history segment/daypart performance panel used by causal, forecasting, and response-drift studies before any route-month aggregation.",
        months: "history_window",
      },
      requiredInputs: ["segment_daypart_history_artifact", "speed_pace score vectors"],
      downstreamConsumers: [
        "causal_event_study_workbench",
        "continuous_travel_time_forecasting",
        "event_family_response_drift",
      ],
      freshnessPolicy: { cadence: "historical_window" },
      lifecycle: { status: "expected" },
      checks: [
        {
          id: "segment_daypart_panel",
          label: "Segment daypart panel JSON",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/applied-research/{historyStartMonth}_to_{releaseMonth}/{releaseMonth}/segment-daypart-panel.json",
          validateReleaseMonth: true,
        },
      ],
    },
    {
      id: "applied_research_pulse_candidate_set",
      label: "Applied-research pulse candidate set",
      kind: "artifact_family",
      owner: "packages/applied-research",
      grain: "event/intervention candidate",
      producerCommand: "applied-research build pulse-candidates",
      expectedUniverse: {
        description:
          "Candidate event/intervention set that preserves many plausible research hypotheses before selection into a causal design.",
        months: "history_window",
      },
      requiredInputs: [
        "tier2_structured_intervention_extraction_full_corpus",
        "detector candidates",
        "source event registries",
      ],
      downstreamConsumers: ["causal_event_study_workbench", "event_family_response_drift"],
      freshnessPolicy: { cadence: "historical_window" },
      lifecycle: { status: "expected" },
      checks: [
        {
          id: "pulse_candidate_set",
          label: "Pulse candidate set JSON",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/applied-research/{historyStartMonth}_to_{releaseMonth}/{releaseMonth}/pulse-candidate-set.json",
          validateReleaseMonth: true,
        },
      ],
    },
    {
      id: "applied_research_pulse_event_overlap",
      label: "Applied-research pulse event overlap panel",
      kind: "artifact_family",
      owner: "packages/applied-research",
      grain: "event/intervention by route/segment time window",
      producerCommand: "applied-research build pulse-event-overlap",
      expectedUniverse: {
        description:
          "Space-time overlap artifact joining intervention candidates to route, corridor, and segment windows without collapsing the search space too early.",
        months: "history_window",
      },
      requiredInputs: [
        "applied_research_pulse_candidate_set",
        "applied_research_segment_daypart_panel",
      ],
      downstreamConsumers: ["causal_event_study_workbench", "event_family_response_drift"],
      freshnessPolicy: { cadence: "historical_window" },
      lifecycle: { status: "expected" },
      checks: [
        {
          id: "pulse_event_overlap",
          label: "Pulse event overlap panel JSON",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/applied-research/{historyStartMonth}_to_{releaseMonth}/{releaseMonth}/pulse-event-overlap.json",
          validateReleaseMonth: true,
        },
      ],
    },
    {
      id: "applied_research_event_effect_contrast",
      label: "Applied-research event effect contrast artifact",
      kind: "artifact_family",
      owner: "packages/applied-research",
      grain: "intervention-window effect contrast",
      producerCommand: "applied-research build event-effect-contrast",
      expectedUniverse: {
        description:
          "Review-gated contrast artifact for ITS, matched-peer, and synthetic-control summaries with placebo and pre-trend gates.",
        months: "history_window",
      },
      requiredInputs: [
        "applied_research_pulse_event_overlap",
        "applied_research_segment_daypart_panel",
        "tier2_structured_intervention_extraction_full_corpus",
      ],
      downstreamConsumers: ["causal_event_study_workbench", "methodology review packets"],
      freshnessPolicy: { cadence: "historical_window" },
      lifecycle: { status: "expected" },
      checks: [
        {
          id: "event_effect_contrast",
          label: "Event effect contrast JSON",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/applied-research/{historyStartMonth}_to_{releaseMonth}/{releaseMonth}/event-effect-contrast.json",
          validateReleaseMonth: true,
        },
      ],
    },
    {
      id: "applied_research_mechanism_corroboration",
      label: "Applied-research mechanism corroboration artifact",
      kind: "artifact_family",
      owner: "packages/applied-research",
      grain: "intervention-window mechanism evidence",
      producerCommand: "applied-research build mechanism-corroboration",
      expectedUniverse: {
        description:
          "Structured support/counter-evidence layer that distinguishes plausible mechanisms from mere before/after movement.",
        months: "history_window",
      },
      requiredInputs: [
        "applied_research_event_effect_contrast",
        "tier2_structured_intervention_extraction_full_corpus",
        "context source products",
      ],
      downstreamConsumers: ["causal_event_study_workbench", "event_family_response_drift"],
      freshnessPolicy: { cadence: "historical_window" },
      lifecycle: { status: "expected" },
      checks: [
        {
          id: "mechanism_corroboration",
          label: "Mechanism corroboration JSON",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/applied-research/{historyStartMonth}_to_{releaseMonth}/{releaseMonth}/mechanism-corroboration.json",
          validateReleaseMonth: true,
        },
      ],
    },
    {
      id: "applied_research_event_family_effect_panel",
      label: "Applied-research event-family effect panel",
      kind: "artifact_family",
      owner: "packages/applied-research",
      grain: "event-family by time-regime effect panel",
      producerCommand: "applied-research build event-family-effect-panel",
      expectedUniverse: {
        description:
          "Panel of comparable event/intervention families used to test whether response patterns vary across time and street-context regimes.",
        months: "history_window",
      },
      requiredInputs: [
        "applied_research_event_effect_contrast",
        "applied_research_mechanism_corroboration",
      ],
      downstreamConsumers: ["event_family_response_drift"],
      freshnessPolicy: { cadence: "historical_window" },
      lifecycle: { status: "expected" },
      checks: [
        {
          id: "event_family_effect_panel",
          label: "Event-family effect panel JSON",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/applied-research/{historyStartMonth}_to_{releaseMonth}/{releaseMonth}/event-family-effect-panel.json",
          validateReleaseMonth: true,
        },
      ],
    },
    {
      id: "applied_research_event_family_response_drift_study",
      label: "Applied-research event-family response drift study",
      kind: "artifact_family",
      owner: "packages/applied-research",
      grain: "event-family response drift study",
      producerCommand: "applied-research build event-family-response-drift-study",
      expectedUniverse: {
        description:
          "Review-gated study artifact asking whether the same event/intervention family stopped working, changed magnitude, or reversed sign under newer regimes.",
        months: "history_window",
      },
      requiredInputs: [
        "applied_research_event_family_effect_panel",
        "applied_research_segment_daypart_panel",
      ],
      downstreamConsumers: ["research review packets", "strategy planning"],
      freshnessPolicy: { cadence: "historical_window" },
      lifecycle: { status: "expected" },
      checks: [
        {
          id: "response_drift_study",
          label: "Response drift study JSON",
          type: "json_artifact",
          pathTemplate:
            "{artifactRoot}/applied-research/{historyStartMonth}_to_{releaseMonth}/{releaseMonth}/event-family-response-drift-study.json",
          validateReleaseMonth: true,
        },
      ],
    },
    {
      id: "detector_review_promotion_artifacts",
      label: "Detector review and promotion artifacts",
      kind: "artifact_family",
      owner: "tools/pipeline-v2/findings",
      grain: "release month reviewer packet/promotion files",
      producerCommand: "findings ralph/agent-propose plus reviewer promotion pass",
      expectedUniverse: {
        description: "Reviewer packet, queue, and immutable promoted-finding artifacts.",
        months: "release_month",
      },
      requiredInputs: ["detector candidates", "reviewer decisions"],
      downstreamConsumers: ["Studio findings", "route briefs", "detector calibration"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "review_packets",
          label: "Detector review packets JSON",
          type: "json_artifact",
          pathTemplate: "{artifactRoot}/findings/{releaseMonth}/review-packets.json",
        },
        {
          id: "promotion_queue",
          label: "Detector promotion queue JSON",
          type: "json_artifact",
          pathTemplate: "{artifactRoot}/findings/{releaseMonth}/promotion-queue.json",
        },
        {
          id: "promoted_findings",
          label: "Promoted findings JSON",
          type: "json_artifact",
          pathTemplate: "{artifactRoot}/findings/{releaseMonth}/promoted-findings.json",
        },
      ],
    },
    {
      id: "detector_gold_set_artifacts",
      label: "Detector gold-set artifacts",
      kind: "detector_feature_artifact",
      owner: "packages/analytics/calibration",
      grain: "release month detector expectation/evaluation set",
      producerCommand: "build detector-gold-set-evaluation",
      expectedUniverse: {
        description:
          "Gold-set expectations and evaluation summaries for detector threshold calibration.",
        months: "release_month",
      },
      requiredInputs: ["reviewer decision expansion", "detector score vectors"],
      downstreamConsumers: ["detector calibration", "release promotion checklist"],
      freshnessPolicy: { cadence: "manual" },
      checks: [
        {
          id: "gold_set_evaluation",
          label: "Detector gold-set quality evaluation JSON",
          type: "json_artifact",
          pathTemplate: "{artifactRoot}/findings/{releaseMonth}/gold-set-evaluation.json",
          validateReleaseMonth: true,
          semantic: "detector_gold_set_quality",
        },
      ],
    },
    {
      id: "raw_r2_gtfs_rt_mirror_manifests",
      label: "Raw R2 GTFS-RT mirror manifests",
      kind: "artifact_family",
      owner: "packages/studio-api/source-refresh",
      grain: "GTFS-RT feed snapshot manifest",
      producerCommand: "Worker scheduled source refresh to GTFS_RT_RAW R2",
      expectedUniverse: {
        description:
          "Redacted per-snapshot R2 manifests for raw GTFS-RT vehicle-position captures.",
        months: "release_month",
      },
      requiredInputs: [
        "source_manifest:bus_time_gtfsrt_vehicle_positions",
        "MTA Bus Time GTFS-RT vehicle positions",
        "Cloudflare R2 raw bucket",
      ],
      downstreamConsumers: [
        "Bus Observatory handoff proof",
        "observed reliability imports",
        "source refresh health",
      ],
      freshnessPolicy: { cadence: "append_only" },
      checks: [
        {
          id: "vehicle_position_manifests",
          label: "GTFS-RT vehicle-position mirror manifests",
          type: "artifact_glob",
          rootTemplate: "{repoRoot}/data/raw/r2-mirror",
          pattern: "*/gtfs-rt/vehicle_positions/**/*.json",
          minFiles: 1,
        },
      ],
    },
    {
      id: "seo_generated_artifacts",
      label: "Generated SEO artifacts",
      kind: "artifact_family",
      owner: "tools/pipeline-v2/studio",
      grain: "generated web SEO module and sitemap",
      producerCommand: "studio release",
      expectedUniverse: {
        description:
          "Committed SEO manifest module and public sitemap generated from Studio release.",
        months: "release_month",
      },
      requiredInputs: ["studio_release_projection_manifest"],
      downstreamConsumers: ["public web worker SEO", "search crawler discovery"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "seo_manifest_module",
          label: "Generated SEO manifest module",
          type: "file_artifact",
          pathTemplate: "{repoRoot}/apps/web/src/studio/seo-manifest.gen.ts",
        },
        {
          id: "sitemap_xml",
          label: "Generated sitemap XML",
          type: "file_artifact",
          pathTemplate: "{repoRoot}/apps/web/public/sitemap.xml",
        },
      ],
    },
    {
      id: "cloudflare_publish_upload_audit",
      label: "Cloudflare publish upload audit",
      kind: "release_manifest",
      owner: "tools/pipeline-v2/publish",
      grain: "release month R2 upload report",
      producerCommand: "publish r2-artifacts",
      expectedUniverse: {
        description:
          "Idempotent R2 upload report with candidate/upload/skip/fail counts and cost estimate.",
        months: "release_month",
      },
      requiredInputs: [
        "d1_serving_export_artifacts",
        "brief_release_manifest",
        "map_release_manifest",
      ],
      downstreamConsumers: ["release promotion checklist", "Cloudflare operations runbook"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "publish_r2_json",
          label: "Publish R2 upload report JSON",
          type: "json_artifact",
          pathTemplate: "{artifactRoot}/audits/publish-r2-{releaseMonth}.json",
        },
      ],
    },
    {
      id: "publish_completeness_audit",
      label: "Publish completeness audit",
      kind: "release_manifest",
      owner: "tools/pipeline-v2/check",
      grain: "release month publish audit JSON",
      producerCommand: "check-publish-completeness",
      expectedUniverse: {
        description: "R2/D1 artifact-key completeness audit before serving publication.",
        months: "release_month",
      },
      requiredInputs: [
        "brief_release_manifest",
        "evaluation_release_manifest",
        "map_release_manifest",
        "studio_route_artifact_index",
      ],
      downstreamConsumers: ["publish:serving-release", "release promotion checklist"],
      freshnessPolicy: { cadence: "release_month" },
      checks: [
        {
          id: "publish_completeness_json",
          label: "Publish completeness audit JSON",
          type: "json_artifact",
          pathTemplate: "{artifactRoot}/audits/publish-completeness-{releaseMonth}.json",
        },
      ],
    },
  ],
});
