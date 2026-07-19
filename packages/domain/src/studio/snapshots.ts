import { Schema } from "effect";
import { StudioRouteCapabilitySchema } from "./route-capability.js";
import {
  assertStudioRouteIdentityPresentation,
  StudioRouteIdentityPresentationSchema,
} from "./route-presentation.js";
import { StudioRouteHistoryCoverageSchema } from "./routes/index.js";
import { StudioQualitySchema } from "./shared.js";

export const STUDIO_MODEL_ARTIFACT_SERVING_PROJECTION_KEY =
  "studio/v2/detectors/model-artifacts.json";

export const STUDIO_ROUTE_DETECTOR_READINESS_MANIFEST_KEY =
  "studio/v2/detectors/route-detector-readiness-manifest.json";

export const StudioSnapshotProjectionSchema = Schema.Struct({
  resource: Schema.Literals(["routes", "methods", "docs"]),
  path: Schema.String,
  itemCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  generatedAt: Schema.NullOr(Schema.String),
});

export const StudioRouteSurfaceStatusSchema = Schema.Literals([
  "available",
  "partial",
  "missing",
  "none",
  "upstream_blocked",
  "downstream_blocked",
  "not_built",
]);

export const StudioRouteFamilySchema = Schema.Literals([
  "local",
  "limited",
  "select_bus_service",
  "express",
  "shuttle",
  "unknown",
]);

export const StudioSourceMonthStatusSchema = Schema.Literals([
  "available",
  "partial",
  "available_not_fetched",
  "upstream_blocked",
  "downstream_blocked",
  "derived_not_built",
  "source_absent",
]);

export const StudioProjectionStorageSchema = Schema.Literals(["d1", "r2", "worker", "computed"]);

export const StudioSnapshot2ProjectionRefSchema = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1)),
  status: StudioRouteSurfaceStatusSchema,
  schemaVersion: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
  grain: Schema.NullOr(Schema.String.check(Schema.isMinLength(1))),
  storage: StudioProjectionStorageSchema,
  path: Schema.NullOr(Schema.String.check(Schema.isMinLength(1))),
  months: Schema.NullOr(
    Schema.Struct({
      start: Schema.NullOr(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/))),
      end: Schema.NullOr(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/))),
    }),
  ),
});

export const StudioRouteIndex2RowSchema = Schema.Struct({
  releaseId: Schema.String,
  baselineMonth: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/)),
  routeId: Schema.String,
  slug: Schema.String,
  label: Schema.String,
  longName: Schema.NullOr(Schema.String),
  borough: Schema.Literals(["Bronx", "Brooklyn", "Manhattan", "Queens", "Staten Island"]),
  routeFamily: StudioRouteFamilySchema,
  publicUrl: Schema.String,
  capability: StudioRouteCapabilitySchema,
  historyCoverage: StudioRouteHistoryCoverageSchema,
  caveats: Schema.Array(Schema.String),
  projectionRefs: Schema.Array(StudioSnapshot2ProjectionRefSchema),
  updatedAt: Schema.String,
});

export const StudioRouteIndex3RowSchema = Schema.Struct({
  ...StudioRouteIndex2RowSchema.fields,
  ...StudioRouteIdentityPresentationSchema.fields,
  routeSchemaVersion: Schema.Literal(2),
}).check(
  Schema.makeFilter((row) => {
    try {
      assertStudioRouteIdentityPresentation(row as Readonly<Record<string, unknown>>);
      return [];
    } catch (error) {
      return [
        {
          path: [],
          issue: error instanceof Error ? error.message : "Invalid exact route identity.",
        },
      ];
    }
  }),
);

export const StudioSourceMonthStateSchema = Schema.Struct({
  sourceId: Schema.String.check(Schema.isMinLength(1)),
  label: Schema.String.check(Schema.isMinLength(1)),
  month: Schema.NullOr(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/))),
  status: StudioSourceMonthStatusSchema,
  rowCount: Schema.NullOr(
    Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  ),
  routeCount: Schema.NullOr(
    Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  ),
  grain: Schema.NullOr(Schema.String.check(Schema.isMinLength(1))),
  reason: Schema.NullOr(Schema.String),
  producerCommand: Schema.NullOr(Schema.String),
});

export const StudioRouteIndex2ResponseSchema = Schema.Struct({
  schemaVersion: Schema.Literal(2),
  generatedAt: Schema.String,
  releaseId: Schema.String,
  /** Serving month the index was built from (provenance; resolved internally, never from env — C3). */
  baselineMonth: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/)),
  /** Latest data month behind the index — the user-facing freshness label (C3). */
  dataAsOf: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/)),
  routes: Schema.Array(StudioRouteIndex2RowSchema),
  quality: StudioQualitySchema,
});
export const StudioRouteIndex3ResponseSchema = Schema.Struct({
  ...StudioRouteIndex2ResponseSchema.fields,
  schemaVersion: Schema.Literal(3),
  routes: Schema.Array(StudioRouteIndex3RowSchema),
});

export const StudioSnapshot2Schema = Schema.Struct({
  schemaVersion: Schema.Literal(2),
  generatedAt: Schema.String,
  releaseId: Schema.String,
  baselineMonth: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/)),
  currentSignalMonth: Schema.NullOr(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/))),
  routeUniverse: Schema.Struct({
    source: Schema.Literal("route_catalog"),
    routeCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    indexedRouteCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    summaryReadyRouteCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    artifactReadyRouteCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    evidenceReadyRouteCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
  }),
  sourceMonths: Schema.Array(StudioSourceMonthStateSchema),
  counts: Schema.Struct({
    routes: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    routeDetails: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    routeHistoryRows: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    routeIndexRows: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    routeSpeedHistoryCoverageRows: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    sourceMonthCoverageRows: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
  }),
  caveats: Schema.Array(Schema.String),
  projections: Schema.Array(StudioSnapshot2ProjectionRefSchema),
});

export const StudioSnapshotResponseSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  generatedAt: Schema.String,
  releaseId: Schema.String,
  projectionPrefix: Schema.String,
  releaseKey: Schema.String,
  baselineMonth: Schema.NullOr(Schema.String),
  lastBuiltSpeedMonth: Schema.NullOr(Schema.String),
  counts: Schema.Struct({
    routes: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    methods: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    docsSections: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    docsEndpoints: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  }),
  projections: Schema.Array(StudioSnapshotProjectionSchema),
  quality: StudioQualitySchema,
  v2: Schema.optional(StudioSnapshot2Schema),
});

export type StudioSnapshotProjection = typeof StudioSnapshotProjectionSchema.Type;
export type StudioRouteSurfaceStatus = typeof StudioRouteSurfaceStatusSchema.Type;
export type StudioRouteFamily = typeof StudioRouteFamilySchema.Type;
export type StudioSourceMonthStatus = typeof StudioSourceMonthStatusSchema.Type;
export type StudioSnapshot2ProjectionRef = typeof StudioSnapshot2ProjectionRefSchema.Type;
export type StudioRouteIndex2Row = typeof StudioRouteIndex2RowSchema.Type;
export type StudioSourceMonthState = typeof StudioSourceMonthStateSchema.Type;
export type StudioRouteIndex2Response = typeof StudioRouteIndex2ResponseSchema.Type;
export type StudioRouteIndex3Row = typeof StudioRouteIndex3RowSchema.Type;
export type StudioSnapshot2 = typeof StudioSnapshot2Schema.Type;
export type StudioSnapshotResponse = typeof StudioSnapshotResponseSchema.Type;
export type StudioRouteIndex3Response = typeof StudioRouteIndex3ResponseSchema.Type;
