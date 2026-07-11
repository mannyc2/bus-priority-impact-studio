import { Effect, Schema } from "effect";

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

const MonthSchema = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/));

/**
 * The seven surface states. `building` = the producer exists but hasn't finished
 * (e.g. an uncalibrated detector family); `insufficient_data` = not enough input to
 * say anything; `checked_clean` = the detector applied and honestly found nothing;
 * `not_applicable` = the surface does not apply to this route; `blocked` = an upstream
 * dependency failed.
 */
export const RouteSurfaceStateSchema = Schema.Literals([
  "ready",
  "partial",
  "building",
  "insufficient_data",
  "checked_clean",
  "not_applicable",
  "blocked",
]);
export type RouteSurfaceState = typeof RouteSurfaceStateSchema.Type;

/** Freshness of a surface's data relative to the release month it was built against. */
export const RouteCapabilityFreshnessSchema = Schema.Literals([
  "current",
  "recent",
  "stale",
  "unknown",
]);
export type RouteCapabilityFreshness = typeof RouteCapabilityFreshnessSchema.Type;

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

export const RouteSurfaceDepthSchema = Schema.Struct({
  monthsCovered: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  grains: Schema.Array(Schema.String),
});
export type RouteSurfaceDepth = typeof RouteSurfaceDepthSchema.Type;

export const RouteSurfaceCapabilitySchema = Schema.Struct({
  state: RouteSurfaceStateSchema,
  reason: Schema.NullOr(Schema.String),
  depth: Schema.NullOr(RouteSurfaceDepthSchema),
  /** Latest input month behind this surface (`YYYY-MM`); each surface has its own clock. */
  dataAsOf: Schema.NullOr(MonthSchema),
  freshness: RouteCapabilityFreshnessSchema,
});
export type RouteSurfaceCapability = typeof RouteSurfaceCapabilitySchema.Type;

/** The per-route capability block carried on the route index row. */
export const StudioRouteCapabilitySchema = Schema.Struct({
  overallState: RouteSurfaceStateSchema,
  surfaces: Schema.Record(Schema.String, RouteSurfaceCapabilitySchema),
  caveats: Schema.Array(Schema.String),
});
export type StudioRouteCapability = typeof StudioRouteCapabilitySchema.Type;

export const RouteCapabilityManifestRowSchema = Schema.Struct({
  routeId: Schema.String.check(Schema.isMinLength(1)),
  overallState: RouteSurfaceStateSchema,
  surfaces: Schema.Record(Schema.String, RouteSurfaceCapabilitySchema),
  caveats: Schema.Array(Schema.String),
});
export type RouteCapabilityManifestRow = typeof RouteCapabilityManifestRowSchema.Type;

/** The authoritative manifest contract — what the pipeline builder emits and the fixture must satisfy. */
export const RouteCapabilityManifestSchema = Schema.Struct({
  artifactKind: Schema.Literal("route_capability_manifest"),
  schemaVersion: Schema.Literal(1),
  generatedAt: Schema.String,
  releaseMonth: MonthSchema,
  routes: Schema.Array(RouteCapabilityManifestRowSchema),
});
export type RouteCapabilityManifest = typeof RouteCapabilityManifestSchema.Type;

/**
 * The light read-schema for the Worker join path. `.passthrough()` (and a passthrough
 * surface value) so forward-compatible additions — new manifest fields, new surface
 * keys, extra per-surface fields — never break a deployed Worker.
 */
const RouteCapabilityManifestRowForIndexSchema = Schema.Struct({
  routeId: Schema.String,
  overallState: RouteSurfaceStateSchema,
  surfaces: Schema.Record(Schema.String, RouteSurfaceCapabilitySchema),
  caveats: Schema.Array(Schema.String).pipe(Schema.withDecodingDefaultType(Effect.succeed([]))),
});

export const RouteCapabilityManifestForIndexSchema = Schema.Struct({
  artifactKind: Schema.Literal("route_capability_manifest"),
  schemaVersion: Schema.Literal(1),
  routes: Schema.Array(RouteCapabilityManifestRowForIndexSchema),
});
export type RouteCapabilityManifestForIndex = typeof RouteCapabilityManifestForIndexSchema.Type;
