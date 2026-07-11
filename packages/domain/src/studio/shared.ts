import { Schema } from "effect";

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
