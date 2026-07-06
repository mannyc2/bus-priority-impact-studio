import * as z from "../schema-compat.js";

// Real-user web-vitals beacon payload. Shared by the Worker (decode/validate the POST body)
// and the browser reporter (compile-time shape of the beacon) so both sides stay on one contract.
export const RumReportSchema = z
  .object({
    path: z.string().min(1).max(512),
    ttfb: z.number().min(0).max(120_000).optional(),
    fcp: z.number().min(0).max(120_000).optional(),
    lcp: z.number().min(0).max(120_000).optional(),
    cls: z.number().min(0).max(10).optional(),
    nav: z.enum(["navigate", "reload", "back_forward", "prerender"]).optional(),
  })
  .strict();

export type RumReport = z.output<typeof RumReportSchema>;
