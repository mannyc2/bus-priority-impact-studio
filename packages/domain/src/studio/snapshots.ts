import * as z from "zod";
import { StudioRouteHistoryCoverageSchema } from "./routes/index.js";
import { StudioQualitySchema } from "./shared.js";

export const STUDIO_MODEL_ARTIFACT_SERVING_PROJECTION_KEY =
  "studio/v2/detectors/model-artifacts.json";

export const StudioSnapshotProjectionSchema = z
  .object({
    resource: z.enum(["routes", "findings", "briefs", "methods", "docs"]),
    path: z.string(),
    itemCount: z.number().int().nonnegative(),
    generatedAt: z.string().nullable(),
  })
  .strict();

export const StudioRouteSupportLevelSchema = z.enum([
  "index_only",
  "summary_ready",
  "artifact_ready",
  "evidence_ready",
]);

export const StudioRouteSurfaceStatusSchema = z.enum([
  "available",
  "partial",
  "missing",
  "none",
  "upstream_blocked",
  "downstream_blocked",
  "not_built",
]);

export const StudioRouteFamilySchema = z.enum([
  "local",
  "limited",
  "select_bus_service",
  "express",
  "shuttle",
  "unknown",
]);

export const StudioSourceMonthStatusSchema = z.enum([
  "available",
  "partial",
  "available_not_fetched",
  "upstream_blocked",
  "downstream_blocked",
  "derived_not_built",
  "source_absent",
]);

export const StudioRouteSurfaceFlagsSchema = z
  .object({
    routePage: StudioRouteSurfaceStatusSchema,
    summary: StudioRouteSurfaceStatusSchema,
    map: StudioRouteSurfaceStatusSchema,
    ladder: StudioRouteSurfaceStatusSchema,
    routeDetailArtifact: StudioRouteSurfaceStatusSchema,
    speedHistory: StudioRouteSurfaceStatusSchema,
    ridershipHistory: StudioRouteSurfaceStatusSchema,
    multiYearHistory: StudioRouteSurfaceStatusSchema,
    scheduleBaseline: StudioRouteSurfaceStatusSchema,
    observedReliability: StudioRouteSurfaceStatusSchema,
    detectorCoverage: StudioRouteSurfaceStatusSchema,
    detectorFindings: StudioRouteSurfaceStatusSchema,
    detectorScoreVectors: StudioRouteSurfaceStatusSchema,
    busLaneLinks: StudioRouteSurfaceStatusSchema,
    interventions: StudioRouteSurfaceStatusSchema,
    findings: StudioRouteSurfaceStatusSchema,
    briefs: StudioRouteSurfaceStatusSchema,
    timeline: StudioRouteSurfaceStatusSchema,
    evidenceCards: StudioRouteSurfaceStatusSchema,
  })
  .strict();

export const StudioProjectionStorageSchema = z.enum(["d1", "r2", "worker", "computed"]);

export const StudioSnapshot2ProjectionRefSchema = z
  .object({
    id: z.string().min(1),
    status: StudioRouteSurfaceStatusSchema,
    schemaVersion: z.number().int().positive(),
    grain: z.string().min(1).nullable(),
    storage: StudioProjectionStorageSchema,
    path: z.string().min(1).nullable(),
    months: z
      .object({
        start: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .nullable(),
        end: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const StudioRouteIndex2RowSchema = z
  .object({
    releaseId: z.string(),
    baselineMonth: z.string().regex(/^\d{4}-\d{2}$/),
    routeId: z.string(),
    slug: z.string(),
    label: z.string(),
    longName: z.string().nullable(),
    borough: z.enum(["Bronx", "Brooklyn", "Manhattan", "Queens", "Staten Island"]),
    routeFamily: StudioRouteFamilySchema,
    publicUrl: z.string(),
    supportLevel: StudioRouteSupportLevelSchema,
    surfaceFlags: StudioRouteSurfaceFlagsSchema,
    historyCoverage: StudioRouteHistoryCoverageSchema,
    caveats: z.array(z.string()),
    projectionRefs: z.array(StudioSnapshot2ProjectionRefSchema),
    updatedAt: z.string(),
  })
  .strict();

export const StudioSourceMonthStateSchema = z
  .object({
    sourceId: z.string().min(1),
    label: z.string().min(1),
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .nullable(),
    status: StudioSourceMonthStatusSchema,
    rowCount: z.number().int().nonnegative().nullable(),
    routeCount: z.number().int().nonnegative().nullable(),
    grain: z.string().min(1).nullable(),
    reason: z.string().nullable(),
    producerCommand: z.string().nullable(),
  })
  .strict();

export const StudioRouteIndex2ResponseSchema = z
  .object({
    schemaVersion: z.literal(2),
    generatedAt: z.string(),
    releaseId: z.string(),
    baselineMonth: z.string().regex(/^\d{4}-\d{2}$/),
    routes: z.array(StudioRouteIndex2RowSchema),
    quality: StudioQualitySchema,
  })
  .strict();

export const StudioSnapshot2Schema = z
  .object({
    schemaVersion: z.literal(2),
    generatedAt: z.string(),
    releaseId: z.string(),
    baselineMonth: z.string().regex(/^\d{4}-\d{2}$/),
    currentSignalMonth: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .nullable(),
    routeUniverse: z
      .object({
        source: z.literal("route_catalog"),
        routeCount: z.number().int().nonnegative(),
        indexedRouteCount: z.number().int().nonnegative(),
        summaryReadyRouteCount: z.number().int().nonnegative(),
        artifactReadyRouteCount: z.number().int().nonnegative(),
        evidenceReadyRouteCount: z.number().int().nonnegative(),
      })
      .strict(),
    sourceMonths: z.array(StudioSourceMonthStateSchema),
    counts: z
      .object({
        routes: z.number().int().nonnegative(),
        routeDetails: z.number().int().nonnegative(),
        routeHistoryRows: z.number().int().nonnegative(),
        routeIndexRows: z.number().int().nonnegative(),
        routeSpeedHistoryCoverageRows: z.number().int().nonnegative(),
        sourceMonthCoverageRows: z.number().int().nonnegative(),
        findings: z.number().int().nonnegative(),
        briefs: z.number().int().nonnegative(),
      })
      .strict(),
    caveats: z.array(z.string()),
    projections: z.array(StudioSnapshot2ProjectionRefSchema),
  })
  .strict();

export const StudioSnapshotResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    releaseId: z.string(),
    projectionPrefix: z.string(),
    releaseKey: z.string(),
    baselineMonth: z.string().nullable(),
    lastBuiltSpeedMonth: z.string().nullable(),
    counts: z
      .object({
        routes: z.number().int().nonnegative(),
        findings: z.number().int().nonnegative(),
        briefs: z.number().int().nonnegative(),
        methods: z.number().int().nonnegative(),
        docsSections: z.number().int().nonnegative(),
        docsEndpoints: z.number().int().nonnegative(),
      })
      .strict(),
    projections: z.array(StudioSnapshotProjectionSchema),
    quality: StudioQualitySchema,
    v2: StudioSnapshot2Schema.optional(),
  })
  .strict();

export type StudioSnapshotProjection = z.output<typeof StudioSnapshotProjectionSchema>;
export type StudioRouteSupportLevel = z.output<typeof StudioRouteSupportLevelSchema>;
export type StudioRouteSurfaceStatus = z.output<typeof StudioRouteSurfaceStatusSchema>;
export type StudioRouteFamily = z.output<typeof StudioRouteFamilySchema>;
export type StudioSourceMonthStatus = z.output<typeof StudioSourceMonthStatusSchema>;
export type StudioRouteSurfaceFlags = z.output<typeof StudioRouteSurfaceFlagsSchema>;
export type StudioSnapshot2ProjectionRef = z.output<typeof StudioSnapshot2ProjectionRefSchema>;
export type StudioRouteIndex2Row = z.output<typeof StudioRouteIndex2RowSchema>;
export type StudioSourceMonthState = z.output<typeof StudioSourceMonthStateSchema>;
export type StudioRouteIndex2Response = z.output<typeof StudioRouteIndex2ResponseSchema>;
export type StudioSnapshot2 = z.output<typeof StudioSnapshot2Schema>;
export type StudioSnapshotResponse = z.output<typeof StudioSnapshotResponseSchema>;
