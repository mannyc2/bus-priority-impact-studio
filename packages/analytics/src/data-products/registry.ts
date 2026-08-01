import { Effect, Schema } from "effect";
import { decodeSchemaStrict } from "../schema-decode.js";

const DataProductIdSchema = Schema.String.check(Schema.isMinLength(1)).check(
  Schema.isPattern(/^[a-z0-9_.-]+$/),
);

const SqlIdentifierSchema = Schema.String.check(Schema.isMinLength(1)).check(
  Schema.isPattern(/^[A-Za-z_][A-Za-z0-9_]*$/),
);

export const DataProductCompletenessStatusSchema = Schema.Literals([
  "complete",
  "partial",
  "missing",
  "stale",
  "waived",
  "blocked",
  "fetching",
]);

export const DataProductKindSchema = Schema.Literals([
  "local_table",
  "artifact_family",
  "serving_projection",
  "release_manifest",
]);

export const DataProductRouteUniverseSchema = Schema.Literals([
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

export const DataProductLifecycleSchema = Schema.Struct({
  status: Schema.Literals(["expected", "waived", "blocked", "fetching"]).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed("expected")),
  ),
  reason: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
  gapClass: Schema.optionalKey(
    Schema.Literals([
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
    ]),
  ),
});

export const DataProductExpectedUniverseSchema = Schema.Struct({
  description: Schema.String.check(Schema.isMinLength(1)),
  routes: Schema.optionalKey(DataProductRouteUniverseSchema),
  months: Schema.optionalKey(Schema.Literals(["latest_month", "history_window"])),
});

export const DataProductFreshnessPolicySchema = Schema.Struct({
  cadence: Schema.Literals([
    "latest_month",
    "historical_window",
    "run_scoped",
    "manual",
    "append_only",
  ]),
  staleAfterDays: Schema.optionalKey(
    Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
  ),
  note: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
});

const BaseCheckSchema = Schema.Struct({
  id: DataProductIdSchema,
  label: Schema.String.check(Schema.isMinLength(1)),
});

const MonthTableCoverageCheckSchema = Schema.Struct({
  ...BaseCheckSchema.fields,
  type: Schema.Literal("month_table_coverage"),
  tableName: SqlIdentifierSchema,
  monthColumn: SqlIdentifierSchema,
  routeColumn: Schema.optionalKey(SqlIdentifierSchema),
  expectedMonths: Schema.Literal("history_window"),
  minRowsPerMonth: Schema.Number.check(Schema.isInt())
    .check(Schema.isGreaterThanOrEqualTo(0))
    .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(1))),
  minRoutesPerMonth: Schema.Number.check(Schema.isInt())
    .check(Schema.isGreaterThanOrEqualTo(0))
    .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(0))),
});

const TableRouteCoverageCheckSchema = Schema.Struct({
  ...BaseCheckSchema.fields,
  type: Schema.Literal("table_route_coverage"),
  tableName: SqlIdentifierSchema,
  monthColumn: SqlIdentifierSchema,
  routeColumn: SqlIdentifierSchema,
  runColumn: Schema.optionalKey(SqlIdentifierSchema),
  expectedRoutes: DataProductRouteUniverseSchema,
});

const TableRowCountCheckSchema = Schema.Struct({
  ...BaseCheckSchema.fields,
  type: Schema.Literal("table_row_count"),
  tableName: SqlIdentifierSchema,
  minRows: Schema.Number.check(Schema.isInt())
    .check(Schema.isGreaterThanOrEqualTo(0))
    .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(1))),
});

const SourceYearRouteCoverageCheckSchema = Schema.Struct({
  ...BaseCheckSchema.fields,
  type: Schema.Literal("source_year_route_coverage"),
  tableName: SqlIdentifierSchema,
  sourceYearColumn: SqlIdentifierSchema,
  routeColumn: SqlIdentifierSchema,
  expectedRoutes: DataProductRouteUniverseSchema,
  expectedYears: Schema.Literal("history_window_years"),
  statusTableName: Schema.optionalKey(SqlIdentifierSchema),
  statusSourceYearColumn: Schema.optionalKey(SqlIdentifierSchema),
  statusRouteColumn: Schema.optionalKey(SqlIdentifierSchema),
  statusColumn: Schema.optionalKey(SqlIdentifierSchema),
  statusRowCountColumn: Schema.optionalKey(SqlIdentifierSchema),
  waiverArtifactPathTemplate: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
});

const RouteArtifactCoverageCheckSchema = Schema.Struct({
  ...BaseCheckSchema.fields,
  type: Schema.Literal("route_artifact_coverage"),
  pathTemplate: Schema.String.check(Schema.isMinLength(1)),
  expectedRoutes: DataProductRouteUniverseSchema,
});

const JsonExpectedValueSchema = Schema.Struct({
  path: Schema.String.check(Schema.isMinLength(1)),
  equals: Schema.Union([Schema.String, Schema.Number, Schema.Boolean, Schema.Null]),
});

const JsonArtifactCheckSchema = Schema.Struct({
  ...BaseCheckSchema.fields,
  type: Schema.Literal("json_artifact"),
  pathTemplate: Schema.String.check(Schema.isMinLength(1)),
  validateReleaseMonth: Schema.optionalKey(Schema.Boolean),
  validateRunId: Schema.optionalKey(Schema.Boolean),
  requiredJsonValues: Schema.optionalKey(Schema.Array(JsonExpectedValueSchema)),
  semantic: Schema.optionalKey(
    Schema.Literals([
      "tier2_publishable_ready",
      "mta_wiki_bridge_ready_for_review",
      "tier2_full_corpus_materialized_views_ready",
      "tier2_source_disposition_queue_ready",
      "tier2_source_receipt_closure_ready",
    ]),
  ),
});

const FileArtifactCheckSchema = Schema.Struct({
  ...BaseCheckSchema.fields,
  type: Schema.Literal("file_artifact"),
  pathTemplate: Schema.String.check(Schema.isMinLength(1)),
});

const ArtifactGlobCheckSchema = Schema.Struct({
  ...BaseCheckSchema.fields,
  type: Schema.Literal("artifact_glob"),
  rootTemplate: Schema.String.check(Schema.isMinLength(1)),
  pattern: Schema.String.check(Schema.isMinLength(1)),
  minFiles: Schema.Number.check(Schema.isInt())
    .check(Schema.isGreaterThanOrEqualTo(0))
    .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(1))),
});

export const DataProductCheckSchema = Schema.Union([
  MonthTableCoverageCheckSchema,
  TableRouteCoverageCheckSchema,
  TableRowCountCheckSchema,
  SourceYearRouteCoverageCheckSchema,
  RouteArtifactCoverageCheckSchema,
  JsonArtifactCheckSchema,
  FileArtifactCheckSchema,
  ArtifactGlobCheckSchema,
]);

export const DataProductSchema = Schema.Struct({
  id: DataProductIdSchema,
  label: Schema.String.check(Schema.isMinLength(1)),
  kind: DataProductKindSchema,
  owner: Schema.String.check(Schema.isMinLength(1)),
  grain: Schema.String.check(Schema.isMinLength(1)),
  producerCommand: Schema.String.check(Schema.isMinLength(1)),
  expectedUniverse: DataProductExpectedUniverseSchema,
  requiredInputs: Schema.Array(Schema.String.check(Schema.isMinLength(1))),
  downstreamConsumers: Schema.Array(Schema.String.check(Schema.isMinLength(1))),
  freshnessPolicy: DataProductFreshnessPolicySchema,
  lifecycle: DataProductLifecycleSchema.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed({ status: "expected" })),
  ),
  checks: Schema.Array(DataProductCheckSchema).check(Schema.isMinLength(1)),
});

export const DataProductManifestSchema = Schema.Struct({
  version: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
  products: Schema.Array(DataProductSchema).check(Schema.isMinLength(1)),
});

export type DataProductCompletenessStatus = typeof DataProductCompletenessStatusSchema.Type;
export type DataProductKind = typeof DataProductKindSchema.Type;
export type DataProductRouteUniverse = typeof DataProductRouteUniverseSchema.Type;
export type DataProductCheck = typeof DataProductCheckSchema.Type;
export type DataProduct = typeof DataProductSchema.Type;
export type DataProductManifest = typeof DataProductManifestSchema.Type;

export const ROUTE_METRIC_HISTORY_DATA_PRODUCT_ID = "local_route_month_trends_history" as const;

export const ROUTE_METRIC_HISTORY_METRICS = {
  route_average_speed_mph: {
    metricId: "route_average_speed_mph",
    sourceField: "average_speed_mph",
    label: "Observed average speed",
    unit: "mph",
  },
  route_monthly_ridership: {
    metricId: "route_monthly_ridership",
    sourceField: "ridership",
    label: "Monthly riders",
    unit: "riders",
  },
} as const;

export function parseDataProductManifest(input: unknown): DataProductManifest {
  return decodeSchemaStrict(DataProductManifestSchema, input);
}

export function parseDataProductManifestText(input: string): DataProductManifest {
  return parseDataProductManifest(JSON.parse(input));
}

export const DATA_PRODUCT_MANIFEST: DataProductManifest = decodeSchemaStrict(
  DataProductManifestSchema,
  {
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
          months: "latest_month",
        },
        requiredInputs: ["source_manifest:current_bus_routes", "source_manifest:current_bus_stops"],
        downstreamConsumers: [
          "route completeness universes",
          "Studio route listing",
          "map route projections",
        ],
        freshnessPolicy: { cadence: "latest_month" },
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
        grain: "route x latest covered month",
        producerCommand: "ingest route-coverage",
        expectedUniverse: {
          description:
            "One speed/schedule coverage row for each route with schedule or speed source support for the latest covered month.",
          routes: "coverage_source_routes",
          months: "latest_month",
        },
        requiredInputs: [
          "local_route_catalog",
          "local_route_segment_speed",
          "local_route_schedule_timepoint",
        ],
        downstreamConsumers: ["route readiness", "route build planning", "source coverage notes"],
        freshnessPolicy: { cadence: "latest_month" },
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
        grain: "route x latest covered month",
        producerCommand: "route readiness",
        expectedUniverse: {
          description: "One readiness row for each route in the public catalog.",
          routes: "route_catalog",
          months: "latest_month",
        },
        requiredInputs: ["local_route_month_coverage", "local_route_catalog"],
        downstreamConsumers: ["route build plan", "Studio route availability labels"],
        freshnessPolicy: { cadence: "latest_month" },
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
        grain: "route x latest covered month",
        producerCommand: "route build-plan",
        expectedUniverse: {
          description: "One build-plan row for each route in the public catalog.",
          routes: "route_catalog",
          months: "latest_month",
        },
        requiredInputs: ["local_route_readiness", "local_route_artifact"],
        downstreamConsumers: ["route batch rebuilds", "publication readiness audits"],
        freshnessPolicy: { cadence: "latest_month" },
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
          description: "Route-month trend rows across the website history window.",
          routes: "route_catalog",
          months: "history_window",
        },
        requiredInputs: [
          "source_manifest:bus_segment_speeds_2023_2024",
          "source_manifest:bus_segment_speeds_2025",
          "source_manifest:bus_hourly_ridership_2020_2024",
          "source_manifest:bus_hourly_ridership_2025",
        ],
        downstreamConsumers: ["route scorecards", "route history charts"],
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
          description: "Every month in the website history window with enough route coverage.",
          routes: "historical_speed_source_routes",
          months: "history_window",
        },
        requiredInputs: [
          "source_manifest:bus_segment_speeds_2023_2024",
          "source_manifest:bus_segment_speeds_2025",
        ],
        downstreamConsumers: ["route hotspot scoring", "Studio route-detail segment ladders"],
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
          description: "Every month in the website history window with enough route coverage.",
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
        producerCommand: "route intervention-evaluation",
        expectedUniverse: {
          description:
            "Intervention event rows used to date and type route/corridor treatment comparisons.",
          months: "latest_month",
        },
        requiredInputs: [
          "source_manifest:intervention_seed_events",
          "source_manifest:ace_routes",
          "mta_wiki_route_evidence_release",
        ],
        downstreamConsumers: ["Studio intervention timelines"],
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
        grain: "route x intervention event x latest covered month",
        producerCommand: "route intervention-evaluation",
        expectedUniverse: {
          description: "Every month in the website history window with evaluated route panels.",
          routes: "route_catalog",
          months: "history_window",
        },
        requiredInputs: [
          "local_route_segment_speed_history",
          "local_route_hourly_ridership_history",
          "local_intervention_events_release",
        ],
        downstreamConsumers: [
          "Studio intervention panels",
          "before/after route summaries",
          "route treatment summary artifacts",
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
        label: "Route schedule timepoints for the latest covered month",
        kind: "local_table",
        owner: "tools/pipeline-v2/ingest",
        grain: "route x month x trip x stop sequence",
        producerCommand: "ingest route-schedules",
        expectedUniverse: {
          description:
            "Schedule rows for catalog routes in the source-year feed covering the latest month.",
          routes: "schedule_source_routes",
          months: "latest_month",
        },
        requiredInputs: ["source_manifest:bus_schedules_2023_2026"],
        downstreamConsumers: [
          "planned-service controls",
          "observed reliability baselines",
          "stop-direction-hour wait feature materialization",
        ],
        freshnessPolicy: { cadence: "latest_month" },
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
          "planned-service controls",
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
        grain: "route x latest covered month x stop x direction",
        producerCommand: "ingest route-catalog",
        expectedUniverse: {
          description: "Route stop rows for every route in the public catalog.",
          routes: "route_catalog",
          months: "latest_month",
        },
        requiredInputs: ["source_manifest:current_bus_routes", "source_manifest:current_bus_stops"],
        downstreamConsumers: ["map artifacts", "bus-lane matching", "route metrics"],
        freshnessPolicy: { cadence: "latest_month" },
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
        grain: "route x latest covered month",
        producerCommand: "route reliability-baseline",
        expectedUniverse: {
          description: "Scheduled headway baseline rows for every route in the public catalog.",
          routes: "route_catalog",
          months: "latest_month",
        },
        requiredInputs: ["local_route_schedule_timepoint", "local_route_stop"],
        downstreamConsumers: [
          "observed reliability comparisons",
          "route reliability panels",
          "schedule comparison notes",
        ],
        freshnessPolicy: { cadence: "latest_month" },
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
          months: "latest_month",
        },
        requiredInputs: ["local_gtfs_rt_vehicle_position", "local_gtfs_rt_trip_update"],
        downstreamConsumers: [
          "observed reliability summaries",
          "stop-direction-hour wait feature materialization",
          "observed reliability panels",
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
        grain: "route x latest covered month x observed run",
        producerCommand: "route observed-reliability; import bus-observatory-reliability-summary",
        expectedUniverse: {
          description:
            "Observed reliability summary rows for routes with observed headway support.",
          routes: "observed_headway_routes",
          months: "latest_month",
        },
        requiredInputs: ["local_observed_headway_sample", "local_route_reliability_baseline"],
        downstreamConsumers: [
          "route reliability panels",
          "observed reliability source notes",
          "wait feature artifacts",
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
        label: "Stop-direction-hour wait feature artifacts",
        kind: "artifact_family",
        owner: "tools/pipeline-v2/build",
        grain: "route x stop x direction x hour",
        producerCommand: "build stop-direction-hour-ewt-features",
        expectedUniverse: {
          description: "Routes with catalog, GTFS static, and observed-headway support.",
          routes: "ewt_eligible_routes",
          months: "latest_month",
        },
        requiredInputs: [
          "local_observed_headway_sample",
          "local_gtfs_static_stop_time",
          "local_route_schedule_timepoint",
        ],
        downstreamConsumers: [
          "observed reliability panels",
          "route wait summaries",
          "source coverage notes",
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
        id: "local_bus_wait_assessment_history",
        label: "Bus Wait Assessment history",
        kind: "local_table",
        owner: "tools/pipeline-v2/ingest",
        grain: "route x month x day type x trip type x period",
        producerCommand: "ingest bus-wait-assessment",
        expectedUniverse: {
          description: "Bus Wait Assessment rows across the website history window.",
          routes: "route_catalog",
          months: "history_window",
        },
        requiredInputs: ["source_manifest:bus_wait_assessment"],
        downstreamConsumers: ["reliability context", "route evidence caveats"],
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
          description: "Customer journey metric rows across the website history window.",
          routes: "route_catalog",
          months: "history_window",
        },
        requiredInputs: ["source_manifest:bus_customer_journey_metrics"],
        downstreamConsumers: ["reliability context", "route evidence caveats"],
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
        id: "mta_wiki_route_evidence_release",
        label: "mta-wiki route evidence release",
        kind: "artifact_family",
        owner: "tools/pipeline-v2/studio",
        grain: "route evidence bundle x route",
        producerCommand: "studio import-mta-wiki-route-evidence",
        expectedUniverse: {
          description:
            "Versioned mta-wiki evidence imported into the Studio route-evidence backend for public route pages.",
          routes: "public_visible_routes",
          months: "latest_month",
        },
        requiredInputs: ["mta-wiki v1 release", "Studio route catalog"],
        downstreamConsumers: [
          "local_intervention_events_release",
          "Studio route evidence panels",
          "route timeline evidence",
        ],
        freshnessPolicy: { cadence: "manual" },
        checks: [
          {
            id: "route_evidence_artifact",
            label: "mta-wiki route evidence artifact",
            type: "json_artifact",
            pathTemplate: "{artifactRoot}/studio/v2/wiki/route-evidence.json",
            requiredJsonValues: [
              {
                path: "artifactKind",
                equals: "bp.studio.route_evidence.v1",
              },
            ],
          },
          {
            id: "route_evidence_index",
            label: "mta-wiki route evidence serving index",
            type: "json_artifact",
            pathTemplate: "{artifactRoot}/studio/v2/wiki/index.json",
            requiredJsonValues: [
              {
                path: "artifactKind",
                equals: "bp.studio.route_evidence_index.v1",
              },
            ],
          },
        ],
      },
      {
        id: "studio_route_intervention_inventory",
        label: "Studio exact-route intervention inventory",
        kind: "artifact_family",
        owner: "tools/pipeline-v2/studio",
        grain: "exact route x source-backed treatment and occurrence",
        producerCommand: "studio export-route-intervention-inventory",
        expectedUniverse: {
          description:
            "One strict, hash-addressed intervention inventory bundle for every projectable current route.",
          routes: "public_visible_routes",
          months: "latest_month",
        },
        requiredInputs: [
          "Studio release payload",
          "Studio intervention corpus",
          "mta_wiki_route_evidence_release",
          "MTA Wiki operational-occurrence manifest-v5 import",
        ],
        downstreamConsumers: ["Studio route History", "intervention discovery"],
        freshnessPolicy: { cadence: "manual" },
        checks: [
          {
            id: "route_inventory_index",
            label: "Exact-route intervention inventory index",
            type: "json_artifact",
            pathTemplate: "{artifactRoot}/studio/v2/interventions/route-inventory-index.json",
            requiredJsonValues: [
              {
                path: "artifactKind",
                equals: "bp.studio.route_intervention_inventory_index.v1",
              },
              { path: "schemaVersion", equals: 1 },
            ],
          },
          {
            id: "route_inventory_bundles",
            label: "Exact-route intervention inventory bundles",
            type: "artifact_glob",
            rootTemplate: "{artifactRoot}/studio/v2/routes",
            pattern: "*/intervention-inventory.json",
            minFiles: 1,
          },
        ],
      },
      {
        id: "studio_intervention_facet_index",
        label: "Studio intervention facet index",
        kind: "artifact_family",
        owner: "tools/pipeline-v2/studio",
        grain: "source treatment or occurrence x exact route",
        producerCommand: "studio export-route-intervention-inventory",
        expectedUniverse: {
          description:
            "Compact citywide treatment and lifecycle facets referencing exact route bundles.",
          routes: "public_visible_routes",
          months: "latest_month",
        },
        requiredInputs: ["studio_route_intervention_inventory"],
        downstreamConsumers: ["intervention discovery"],
        freshnessPolicy: { cadence: "manual" },
        checks: [
          {
            id: "facet_index",
            label: "Studio intervention facet index",
            type: "json_artifact",
            pathTemplate: "{artifactRoot}/studio/v2/interventions/facet-index.json",
            requiredJsonValues: [
              { path: "artifactKind", equals: "bp.studio.intervention_facet_index.v1" },
              { path: "schemaVersion", equals: 1 },
            ],
          },
        ],
      },
      {
        id: "studio_intervention_observation_route_bundles",
        label: "Studio route intervention observation bundles",
        kind: "artifact_family",
        owner: "tools/pipeline-v2/studio",
        grain: "route x implemented intervention event x metric x month",
        producerCommand: "studio export-intervention-observations",
        expectedUniverse: {
          description:
            "Value-blind route observation windows for admitted intervention anchors across the retained history window.",
          routes: "public_visible_routes",
          months: "history_window",
        },
        requiredInputs: ["studio_route_intervention_inventory", "local_route_month_trends_history"],
        downstreamConsumers: ["Studio route intervention observation charts"],
        freshnessPolicy: { cadence: "manual" },
        checks: [
          {
            id: "route_observation_bundles",
            label: "Route intervention observation bundles",
            type: "artifact_glob",
            rootTemplate: "{artifactRoot}/studio/v2/routes",
            pattern: "*/intervention-observations.json",
            minFiles: 1,
          },
        ],
      },
      {
        id: "studio_intervention_observation_index",
        label: "Studio intervention observation index",
        kind: "serving_projection",
        owner: "tools/pipeline-v2/studio",
        grain: "implemented intervention event",
        producerCommand: "studio export-intervention-observations",
        expectedUniverse: {
          description:
            "Compact release index for admitted intervention observation availability and route-bundle discovery.",
          routes: "public_visible_routes",
          months: "history_window",
        },
        requiredInputs: ["studio_intervention_observation_route_bundles"],
        downstreamConsumers: ["Studio intervention discovery", "route deep links"],
        freshnessPolicy: { cadence: "manual" },
        checks: [
          {
            id: "observation_index",
            label: "Studio intervention observation index",
            type: "json_artifact",
            pathTemplate: "{artifactRoot}/studio/v2/interventions/observation-index.json",
            requiredJsonValues: [
              {
                path: "artifactKind",
                equals: "bp.studio.intervention_observation_index.v1",
              },
              { path: "schemaVersion", equals: 1 },
            ],
          },
        ],
      },
      {
        id: "studio_intervention_inventory_reconciliation",
        label: "Studio intervention inventory reconciliation",
        kind: "artifact_family",
        owner: "tools/pipeline-v2/studio",
        grain: "release-wide source and exact-route reconciliation",
        producerCommand: "studio export-route-intervention-inventory",
        expectedUniverse: {
          description:
            "Losslessness, route projection, source availability, vocabulary, relationship, and byte-budget receipt.",
          routes: "public_visible_routes",
          months: "latest_month",
        },
        requiredInputs: ["studio_route_intervention_inventory", "studio_intervention_facet_index"],
        downstreamConsumers: ["publication gate", "operator review"],
        freshnessPolicy: { cadence: "manual" },
        checks: [
          {
            id: "inventory_reconciliation",
            label: "Studio intervention inventory reconciliation",
            type: "json_artifact",
            pathTemplate:
              "{artifactRoot}/studio/v2/interventions/route-inventory-reconciliation.json",
            requiredJsonValues: [
              {
                path: "artifactKind",
                equals: "bp.studio.route_intervention_inventory_reconciliation.v1",
              },
              { path: "schemaVersion", equals: 1 },
            ],
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
          months: "latest_month",
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
          "stop-direction-hour wait features",
          "schedule comparison notes",
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
          "mta-wiki route evidence validation backlog",
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
          "route timeline caveats",
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
          months: "latest_month",
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
        downstreamConsumers: ["intervention context", "route caveats", "data notes"],
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
            "Census tract context and NYC weather observations used as route caveats and controls.",
          months: "history_window",
        },
        requiredInputs: [
          "source_manifest:census_acs5_profile_tracts",
          "source_manifest:noaa_ghcn_daily_nyc",
        ],
        downstreamConsumers: [
          "equity context layers",
          "route caveats",
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
          "spatial caveats in data notes",
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
        downstreamConsumers: ["route context panels", "data notes", "source caveats"],
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
        downstreamConsumers: ["intervention caveats", "data notes"],
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
        downstreamConsumers: ["speed hotspot caveats", "route context panels", "data notes"],
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
        downstreamConsumers: ["peer-route baselines", "route context panels", "data notes"],
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
        downstreamConsumers: ["intervention enforcement caveats", "data notes"],
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
        downstreamConsumers: ["safety caveats", "data notes"],
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
        label: "Segment daypart history artifact",
        kind: "artifact_family",
        owner: "tools/pipeline-v2/build",
        grain: "route x segment x month x daypart",
        producerCommand: "build segment-daypart-history",
        expectedUniverse: {
          description:
            "Typed segment/daypart history after the fine-grain backfill passes coverage.",
          routes: "route_catalog",
          months: "history_window",
        },
        requiredInputs: ["local_route_segment_speed_history"],
        downstreamConsumers: [
          "route speed-history artifacts",
          "slow segment panels",
          "data coverage audits",
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
        label: "Route hourly profile artifact",
        kind: "artifact_family",
        owner: "tools/pipeline-v2/build",
        grain: "route x month x day-of-week x hour",
        producerCommand: "build route-hourly-profile",
        expectedUniverse: {
          description:
            "Typed route-hourly ridership/profile history after the fine-grain backfill passes coverage.",
          routes: "route_catalog",
          months: "history_window",
        },
        requiredInputs: ["local_route_hourly_ridership_history"],
        downstreamConsumers: [
          "route ridership profile panels",
          "passenger-load controls",
          "data coverage audits",
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
        id: "studio_route_scorecards",
        label: "Studio route scorecard serving rows",
        kind: "serving_projection",
        owner: "tools/pipeline-v2/studio",
        grain: "route x latest covered month",
        producerCommand: "studio release",
        expectedUniverse: {
          description: "One scorecard row for each route in the public route catalog.",
          routes: "route_catalog",
          months: "latest_month",
        },
        requiredInputs: ["route metrics", "local_route_month_trend"],
        downstreamConsumers: ["Studio route cards"],
        freshnessPolicy: { cadence: "latest_month" },
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
        label: "Studio route summary serving rows",
        kind: "serving_projection",
        owner: "tools/pipeline-v2/studio",
        grain: "route x latest covered month",
        producerCommand: "studio release",
        expectedUniverse: {
          description: "One route summary row for each route in the public route catalog.",
          routes: "route_catalog",
          months: "latest_month",
        },
        requiredInputs: ["route metrics", "local_route_month_trend"],
        downstreamConsumers: ["GET /api/v1/studio/routes", "route detail pages"],
        freshnessPolicy: { cadence: "latest_month" },
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
        grain: "route x latest covered month x source",
        producerCommand: "audit source-coverage",
        expectedUniverse: {
          description: "Source-status rows for each route in the public route catalog.",
          routes: "route_catalog",
          months: "latest_month",
        },
        requiredInputs: ["source metadata captures", "local_route_month_coverage"],
        downstreamConsumers: ["Studio route detail source coverage", "source coverage notes"],
        freshnessPolicy: { cadence: "latest_month" },
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
        grain: "route x latest covered month",
        producerCommand: "route brief-model",
        expectedUniverse: {
          description: "Hotspot summary rows for each route in the public route catalog.",
          routes: "route_catalog",
          months: "latest_month",
        },
        requiredInputs: ["local_route_segment_speed", "local_route_hourly_ridership"],
        downstreamConsumers: ["route detail panels", "map route-segment artifacts"],
        freshnessPolicy: { cadence: "latest_month" },
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
        grain: "route x latest covered month x window rank",
        producerCommand: "route brief-model",
        expectedUniverse: {
          description:
            "Peak ridership/speed window rows for routes with ridership source support for the latest covered month.",
          routes: "ridership_source_routes",
          months: "latest_month",
        },
        requiredInputs: ["local_route_hotspot_summary", "local_route_hourly_ridership"],
        downstreamConsumers: ["Studio route detail panels"],
        freshnessPolicy: { cadence: "latest_month" },
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
        grain: "route x latest covered month x window rank",
        producerCommand: "route brief-model",
        expectedUniverse: {
          description:
            "Slowest observed window rows for routes with segment-speed support for the latest covered month.",
          routes: "speed_source_routes",
          months: "latest_month",
        },
        requiredInputs: ["local_route_hotspot_summary", "local_route_segment_speed"],
        downstreamConsumers: ["Studio route detail panels"],
        freshnessPolicy: { cadence: "latest_month" },
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
        grain: "latest covered month x rank x route",
        producerCommand: "route brief-model",
        expectedUniverse: {
          description:
            "Comparison ranking rows for routes with segment-speed support for the latest covered month.",
          routes: "speed_source_routes",
          months: "latest_month",
        },
        requiredInputs: ["local_route_brief_summary"],
        downstreamConsumers: ["GET /api/v1/studio/routes", "route peer-context panels"],
        freshnessPolicy: { cadence: "latest_month" },
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
          "route history panels",
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
          months: "latest_month",
        },
        requiredInputs: ["studio_route_speed_history_artifacts"],
        downstreamConsumers: [
          "Snapshot 2.0 manifest",
          "route list surface flags",
          "deferred route-speed-history loader",
        ],
        freshnessPolicy: { cadence: "latest_month" },
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
        owner: "tools/pipeline-v2/studio",
        grain: "route x latest covered month x artifact",
        producerCommand: "export d1",
        expectedUniverse: {
          description: "Route artifact index rows for public-visible release routes.",
          routes: "public_visible_routes",
          months: "latest_month",
        },
        requiredInputs: ["map_route_segment_geojsons"],
        downstreamConsumers: ["D1 serving export", "publish completeness check"],
        freshnessPolicy: { cadence: "latest_month" },
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
        grain: "corridor x latest covered month",
        producerCommand: "corridor model",
        expectedUniverse: {
          description: "Corridor summary rows for generated corridor pages.",
          months: "latest_month",
        },
        requiredInputs: ["local_corridor", "local_corridor_route_member", "local_route_hotspot"],
        downstreamConsumers: ["D1 serving export", "Studio corridor panels"],
        freshnessPolicy: { cadence: "latest_month" },
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
        label: "Route metric input slice artifacts",
        kind: "artifact_family",
        owner: "tools/pipeline-v2/route",
        grain: "route x latest covered month JSON input slice",
        producerCommand: "route brief-model",
        expectedUniverse: {
          description: "One route metric input slice for each route in the public route catalog.",
          routes: "route_catalog",
          months: "latest_month",
        },
        requiredInputs: [
          "local_route_segment_speed",
          "local_route_hourly_ridership",
          "local_route_schedule_timepoint",
        ],
        downstreamConsumers: ["Studio release projection", "route detail panels"],
        freshnessPolicy: { cadence: "latest_month" },
        checks: [
          {
            id: "route_artifacts",
            label: "Per-route route metric input JSON files",
            type: "route_artifact_coverage",
            pathTemplate:
              "{artifactRoot}/route-slices/{routeId}-{releaseMonth}/route-brief-input.json",
            expectedRoutes: "route_catalog",
          },
        ],
      },
      {
        id: "map_route_segment_geojsons",
        label: "Map route-segment GeoJSON artifacts",
        kind: "artifact_family",
        owner: "tools/pipeline-v2/map",
        grain: "route x latest covered month GeoJSON",
        producerCommand: "map artifacts",
        expectedUniverse: {
          description: "One route-segment GeoJSON artifact for each public-visible release route.",
          routes: "public_visible_routes",
          months: "latest_month",
        },
        requiredInputs: [
          "local_route_segment_speed",
          "local_route_hotspot_summary",
          "current route shape snapshots",
        ],
        downstreamConsumers: ["Studio route maps", "publish R2 artifacts"],
        freshnessPolicy: { cadence: "latest_month" },
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
        grain: "latest covered month map support artifact",
        producerCommand: "map artifacts",
        expectedUniverse: {
          description: "Shared route-shape, stop, bus-lane, and source-snapshot map artifacts.",
          months: "latest_month",
        },
        requiredInputs: [
          "source_manifest:current_bus_routes",
          "source_manifest:current_bus_stops",
          "source_manifest:nyc_dot_bus_lanes_local_streets",
        ],
        downstreamConsumers: ["Studio map shell", "publish R2 artifacts"],
        freshnessPolicy: { cadence: "latest_month" },
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
        id: "map_release_manifest",
        label: "Map release manifest",
        kind: "release_manifest",
        owner: "tools/pipeline-v2/map",
        grain: "latest covered month map artifact manifest",
        producerCommand: "map artifacts",
        expectedUniverse: {
          description: "One map manifest for the latest covered month.",
          months: "latest_month",
        },
        requiredInputs: ["route geometry", "segment speed artifacts", "bus lane geometry"],
        downstreamConsumers: ["GET /api/v1/map/manifest", "route maps", "publish R2 artifacts"],
        freshnessPolicy: { cadence: "latest_month" },
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
        id: "studio_release_projection_manifest",
        label: "Studio release projection manifest",
        kind: "release_manifest",
        owner: "tools/pipeline-v2/studio",
        grain: "release projection bundle",
        producerCommand: "studio release",
        expectedUniverse: {
          description: "Canonical Studio release payload for the latest publicly covered month.",
          months: "latest_month",
        },
        requiredInputs: ["D1 serving export", "route-slices"],
        downstreamConsumers: ["public Studio app", "publish R2 artifacts"],
        freshnessPolicy: { cadence: "latest_month" },
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
          description: "Static route, method, docs, map, and intervention projection indexes.",
          months: "latest_month",
        },
        requiredInputs: ["studio_release_projection_manifest"],
        downstreamConsumers: ["public Studio app", "static asset fallback"],
        freshnessPolicy: { cadence: "latest_month" },
        checks: [
          {
            id: "routes",
            label: "Studio routes index JSON",
            type: "json_artifact",
            pathTemplate: "{artifactRoot}/studio/v1/routes.json",
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
        id: "bus_observatory_gtfs_rt_availability",
        label: "Bus Observatory GTFS-RT availability artifact",
        kind: "release_manifest",
        owner: "tools/pipeline-v2/check",
        grain: "latest covered month source availability JSON",
        producerCommand: "check bus-observatory-gtfs-rt",
        expectedUniverse: {
          description: "Availability decision artifact for observed GTFS-RT release handoffs.",
          months: "latest_month",
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
        freshnessPolicy: { cadence: "latest_month" },
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
        grain: "latest covered month schema/seed/export summary",
        producerCommand: "export d1",
        expectedUniverse: {
          description: "D1 schema, seed SQL, replay SQLite, and export summary for the release.",
          months: "latest_month",
        },
        requiredInputs: [
          "studio_route_scorecards",
          "studio_route_brief_summaries",
          "studio_route_artifact_index",
        ],
        downstreamConsumers: ["verify d1", "studio release", "publish R2 artifacts"],
        freshnessPolicy: { cadence: "latest_month" },
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
        grain: "latest covered month D1 replay verification",
        producerCommand: "verify d1",
        expectedUniverse: {
          description: "Verification summary proving the generated D1 seed replays cleanly.",
          months: "latest_month",
        },
        requiredInputs: ["d1_serving_export_artifacts"],
        downstreamConsumers: ["publish:serving-release", "release promotion checklist"],
        freshnessPolicy: { cadence: "latest_month" },
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
        id: "raw_r2_gtfs_rt_mirror_manifests",
        label: "Raw R2 GTFS-RT mirror manifests",
        kind: "artifact_family",
        owner: "packages/studio-api/source-refresh",
        grain: "GTFS-RT feed snapshot manifest",
        producerCommand: "Worker scheduled source refresh to GTFS_RT_RAW R2",
        expectedUniverse: {
          description:
            "Redacted per-snapshot R2 manifests for raw GTFS-RT vehicle-position captures.",
          months: "latest_month",
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
          months: "latest_month",
        },
        requiredInputs: ["studio_release_projection_manifest"],
        downstreamConsumers: ["public web worker SEO", "search crawler discovery"],
        freshnessPolicy: { cadence: "latest_month" },
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
        grain: "latest covered month R2 upload report",
        producerCommand: "publish r2-artifacts",
        expectedUniverse: {
          description:
            "Idempotent R2 upload report with candidate/upload/skip/fail counts and cost estimate.",
          months: "latest_month",
        },
        requiredInputs: [
          "d1_serving_export_artifacts",
          "studio_release_projection_manifest",
          "map_release_manifest",
        ],
        downstreamConsumers: ["release promotion checklist", "Cloudflare operations runbook"],
        freshnessPolicy: { cadence: "latest_month" },
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
        grain: "latest covered month publish audit JSON",
        producerCommand: "check-publish-completeness",
        expectedUniverse: {
          description: "R2/D1 artifact-key completeness audit before serving publication.",
          months: "latest_month",
        },
        requiredInputs: ["map_release_manifest", "studio_route_artifact_index"],
        downstreamConsumers: ["publish:serving-release", "release promotion checklist"],
        freshnessPolicy: { cadence: "latest_month" },
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
  },
);
