import { Schema } from "effect";
import { IsoMonthSchema } from "../primitives/index.js";

const canonicalPublishedAtPattern =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/;
const releaseIdPattern = /^pub_\d{8}T\d{9}Z$/;

function isCanonicalPublishedAt(value: string): boolean {
  if (!canonicalPublishedAtPattern.test(value)) {
    return false;
  }
  const instant = new Date(value);
  return Number.isFinite(instant.getTime()) && instant.toISOString() === value;
}

export const CanonicalPublishedAtSchema = Schema.String.check(
  Schema.makeFilter((value) =>
    isCanonicalPublishedAt(value)
      ? []
      : [
          {
            path: [],
            issue:
              "Published timestamps must use canonical UTC ISO form with millisecond precision.",
          },
        ],
  ),
);

export const ReleaseIdSchema = Schema.String.check(Schema.isPattern(releaseIdPattern));

export const CoverageWindowSchema = Schema.Struct({
  start: Schema.NullOr(IsoMonthSchema),
  end: IsoMonthSchema,
}).check(
  Schema.makeFilter((coverage) =>
    coverage.start === null || coverage.start <= coverage.end
      ? []
      : [
          {
            path: ["start"],
            issue: "Coverage start cannot be later than coverage end.",
          },
        ],
  ),
);

export function releaseIdFromPublishedAt(publishedAt: string): string {
  if (!isCanonicalPublishedAt(publishedAt)) {
    throw new Error("publishedAt must use canonical UTC ISO form (YYYY-MM-DDTHH:mm:ss.sssZ).");
  }
  return `pub_${publishedAt.replaceAll("-", "").replaceAll(":", "").replace(".", "")}`;
}

function releaseIdMatchesPublishedAt(releaseId: string, publishedAt: string): boolean {
  try {
    return releaseId === releaseIdFromPublishedAt(publishedAt);
  } catch {
    return false;
  }
}

export const ReleaseIdentitySchema = Schema.Struct({
  releaseId: ReleaseIdSchema,
  publishedAt: CanonicalPublishedAtSchema,
  coverage: CoverageWindowSchema,
}).check(
  Schema.makeFilter((identity) =>
    releaseIdMatchesPublishedAt(identity.releaseId, identity.publishedAt)
      ? []
      : [
          {
            path: ["releaseId"],
            issue: "Release ID must be derived from the canonical publication timestamp.",
          },
        ],
  ),
);

export const StudioQualitySchema = Schema.Struct({
  releaseLayer: Schema.Literals([
    "baseline_release",
    "observed_release",
    "current_signal",
    "pending_publication",
  ]),
  completenessStatus: Schema.Literals([
    "complete",
    "partial_public_monthly_only",
    "missing_realtime",
    "insufficient_samples",
    "source_lag_expected",
    "unavailable",
  ]),
  confidence: Schema.Literals(["high", "medium", "low"]),
  caveats: Schema.Array(Schema.String),
});

export const ComparableRouteSchema = Schema.Struct({
  slug: Schema.String,
  label: Schema.String,
  sbs: Schema.Boolean,
  outcome: Schema.Literals(["reversed", "flat", "declining"]),
  delta: Schema.String,
  detail: Schema.String,
});

export type StudioQuality = typeof StudioQualitySchema.Type;
export type ComparableRoute = typeof ComparableRouteSchema.Type;
export type CanonicalPublishedAt = typeof CanonicalPublishedAtSchema.Type;
export type ReleaseId = typeof ReleaseIdSchema.Type;
export type CoverageWindow = typeof CoverageWindowSchema.Type;
export type ReleaseIdentity = typeof ReleaseIdentitySchema.Type;
