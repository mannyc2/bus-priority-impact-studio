import type { StudioRoute } from "@/studio/api-contract";

/**
 * The two neutral series colors used for every A-vs-B overlay on the compare
 * page. Defined once so charts, legends, and the header stay in lockstep. Not
 * good/bad green/red - which route is "better" flips per metric - so the line
 * style (A solid, B dashed) carries the distinction too.
 */
export const COMPARE_SERIES = {
  a: "var(--bp-color-series-a)",
  b: "var(--bp-color-series-b)",
} as const;

/** Display label for a route in a compare legend/tooltip, e.g. "Bx12 SBS". */
export function seriesLabel(route: StudioRoute): string {
  return `${route.label}${route.sbs ? " SBS" : ""}`;
}
