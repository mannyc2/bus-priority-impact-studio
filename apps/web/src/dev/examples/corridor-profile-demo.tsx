import { CorridorProfile } from "@/components/CorridorProfile";
import { getStudioRoute, routeSegments } from "@/studio/sample-data";

// Drives the route-Overview corridor profile from the richest local fixture
// (m15-sbs, 7 timepoint segments) so the spatial chart can be dogfooded without
// the studio API. This is the same component rendered under "The corridor" on
// the route detail page.
export function CorridorProfileDemo() {
  const route = getStudioRoute("m15-sbs");
  const segments = routeSegments("m15-sbs");
  if (!route) return null;
  const slowest = [...segments].sort((a, b) => b.riderHours - a.riderHours)[0];

  return (
    <div>
      <div className="mb-3">
        <div className="text-sm font-semibold tracking-[-0.005em]">The corridor</div>
        <div className="mt-[3px] max-w-[760px] text-[12px] text-[var(--bp-color-ink-55)]">
          Observed weekday bus speed across visible timepoint segments. The dashed line is scheduled
          speed; the rails show the segment-varying treatments available in this release.
        </div>
      </div>
      <div className="rounded-[3px] bg-[var(--bp-color-card)] px-5 py-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
        <CorridorProfile route={route} segments={segments} highlightId={slowest?.id} />
      </div>
    </div>
  );
}
