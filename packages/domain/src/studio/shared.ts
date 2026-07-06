import * as z from "../schema-compat.js";

export const StudioQualitySchema = z
  .object({
    releaseLayer: z.enum([
      "baseline_release",
      "observed_release",
      "current_signal",
      "pending_publication",
    ]),
    completenessStatus: z.enum([
      "complete",
      "partial_public_monthly_only",
      "missing_realtime",
      "insufficient_samples",
      "source_lag_expected",
      "unavailable",
    ]),
    confidence: z.enum(["high", "medium", "low"]),
    caveats: z.array(z.string()),
  })
  .strict();

export const ComparableRouteSchema = z
  .object({
    slug: z.string(),
    label: z.string(),
    sbs: z.boolean(),
    outcome: z.enum(["reversed", "flat", "declining"]),
    delta: z.string(),
    detail: z.string(),
  })
  .strict();

export type StudioQuality = z.output<typeof StudioQualitySchema>;
export type ComparableRoute = z.output<typeof ComparableRouteSchema>;
