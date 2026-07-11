import { Schema } from "effect";

// Real-user web-vitals beacon payload. Shared by the Worker (decode/validate the POST body)
// and the browser reporter (compile-time shape of the beacon) so both sides stay on one contract.
export const RumReportSchema = Schema.Struct({
  path: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(512)),
  ttfb: Schema.optional(
    Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).check(
      Schema.isLessThanOrEqualTo(120_000),
    ),
  ),
  fcp: Schema.optional(
    Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).check(
      Schema.isLessThanOrEqualTo(120_000),
    ),
  ),
  lcp: Schema.optional(
    Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).check(
      Schema.isLessThanOrEqualTo(120_000),
    ),
  ),
  cls: Schema.optional(
    Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).check(Schema.isLessThanOrEqualTo(10)),
  ),
  nav: Schema.optional(Schema.Literals(["navigate", "reload", "back_forward", "prerender"])),
});

export type RumReport = typeof RumReportSchema.Type;
