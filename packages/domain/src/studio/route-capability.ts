import * as z from "zod";

/**
 * The route capability manifest (frontend §7.1 / hard-cutover C1).
 *
 * Replaces the orphaned `supportLevel` + `surfaceFlags` with one honest, consumed
 * contract: per surface, an explicit state machine plus the depth and freshness of
 * the data behind it. Built by the pipeline as a projection (never computed in the
 * Worker) and read back by key from R2 — the same pattern as the detector readiness
 * serving manifest (see ./route-insights.ts).
 *
 * The `surfaces` map is intentionally string-keyed, not a fixed struct: new coverage
 * inputs (Track B S2.4 materialization coverage, Track D Tier 2 coverage) plug in as
 * new surface keys with zero schema reshape. New needs become reasons/keys, not new
 * top-level states (the seven states are the whole vocabulary — resist inflation).
 */
export const STUDIO_ROUTE_CAPABILITY_MANIFEST_KEY =
  "studio/v2/routes/route-capability-manifest.json";

const MonthSchema = z.string().regex(/^\d{4}-\d{2}$/);

/**
 * The seven surface states. `building` = the producer exists but hasn't finished
 * (e.g. an uncalibrated detector family); `insufficient_data` = not enough input to
 * say anything; `checked_clean` = the detector applied and honestly found nothing;
 * `not_applicable` = the surface does not apply to this route; `blocked` = an upstream
 * dependency failed.
 */
export const RouteSurfaceStateSchema = z.enum([
  "ready",
  "partial",
  "building",
  "insufficient_data",
  "checked_clean",
  "not_applicable",
  "blocked",
]);
export type RouteSurfaceState = z.output<typeof RouteSurfaceStateSchema>;

/** Freshness of a surface's data relative to the release month it was built against. */
export const RouteCapabilityFreshnessSchema = z.enum(["current", "recent", "stale", "unknown"]);
export type RouteCapabilityFreshness = z.output<typeof RouteCapabilityFreshnessSchema>;

/** A `dataAsOf` within this many months of the reference month is "recent"; older is "stale". */
const RECENT_DATA_AS_OF_WINDOW_MONTHS = 3;

/**
 * Freshness of a `dataAsOf` month against a reference month (hard-cutover C4).
 * The single vocabulary shared by the pipeline manifest builder and the UI's
 * `DataAsOf` component, so the freshness states never diverge.
 */
export function freshnessForDataAsOf(
  dataAsOf: string | null,
  referenceMonth: string,
): RouteCapabilityFreshness {
  const parse = (month: string): number | null => {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    return match === null ? null : Number(match[1]) * 12 + Number(match[2]);
  };
  if (dataAsOf === null) return "unknown";
  const dataIdx = parse(dataAsOf);
  const referenceIdx = parse(referenceMonth);
  if (dataIdx === null || referenceIdx === null) return "unknown";
  if (dataIdx >= referenceIdx) return "current";
  return referenceIdx - dataIdx <= RECENT_DATA_AS_OF_WINDOW_MONTHS ? "recent" : "stale";
}

export const RouteSurfaceDepthSchema = z
  .object({
    monthsCovered: z.number().int().nonnegative(),
    grains: z.array(z.string()),
  })
  .strict();
export type RouteSurfaceDepth = z.output<typeof RouteSurfaceDepthSchema>;

export const RouteSurfaceCapabilitySchema = z
  .object({
    state: RouteSurfaceStateSchema,
    reason: z.string().nullable(),
    depth: RouteSurfaceDepthSchema.nullable(),
    /** Latest input month behind this surface (`YYYY-MM`); each surface has its own clock. */
    dataAsOf: MonthSchema.nullable(),
    freshness: RouteCapabilityFreshnessSchema,
  })
  .strict();
export type RouteSurfaceCapability = z.output<typeof RouteSurfaceCapabilitySchema>;

/** The per-route capability block carried on the route index row. */
export const StudioRouteCapabilitySchema = z
  .object({
    overallState: RouteSurfaceStateSchema,
    surfaces: z.record(z.string(), RouteSurfaceCapabilitySchema),
    caveats: z.array(z.string()),
  })
  .strict();
export type StudioRouteCapability = z.output<typeof StudioRouteCapabilitySchema>;

export const RouteCapabilityManifestRowSchema = z
  .object({
    routeId: z.string().min(1),
    overallState: RouteSurfaceStateSchema,
    surfaces: z.record(z.string(), RouteSurfaceCapabilitySchema),
    caveats: z.array(z.string()),
  })
  .strict();
export type RouteCapabilityManifestRow = z.output<typeof RouteCapabilityManifestRowSchema>;

/** The authoritative manifest contract — what the pipeline builder emits and the fixture must satisfy. */
export const RouteCapabilityManifestSchema = z
  .object({
    artifactKind: z.literal("route_capability_manifest"),
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    releaseMonth: MonthSchema,
    routes: z.array(RouteCapabilityManifestRowSchema),
  })
  .strict();
export type RouteCapabilityManifest = z.output<typeof RouteCapabilityManifestSchema>;

/**
 * The light read-schema for the Worker join path. `.passthrough()` (and a passthrough
 * surface value) so forward-compatible additions — new manifest fields, new surface
 * keys, extra per-surface fields — never break a deployed Worker.
 */
const RouteCapabilityManifestRowForIndexSchema = z
  .object({
    routeId: z.string(),
    overallState: RouteSurfaceStateSchema,
    surfaces: z.record(z.string(), RouteSurfaceCapabilitySchema.passthrough()),
    caveats: z.array(z.string()).default([]),
  })
  .passthrough();

export const RouteCapabilityManifestForIndexSchema = z
  .object({
    artifactKind: z.literal("route_capability_manifest"),
    schemaVersion: z.literal(1),
    routes: z.array(RouteCapabilityManifestRowForIndexSchema),
  })
  .passthrough();
export type RouteCapabilityManifestForIndex = z.output<typeof RouteCapabilityManifestForIndexSchema>;
