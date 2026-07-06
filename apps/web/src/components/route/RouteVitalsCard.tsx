import type { StudioRouteDetailResponse, StudioSegment } from "@/studio/api-contract";

// The serving artifact stores reliability as an internal triage band
// ("Studio lower-attention band"); show a plain label instead.
function reliabilityLabel(value: string): string {
  if (value.includes("high-attention")) return "High attention";
  if (value.includes("watch")) return "Watch";
  if (value.includes("lower-attention")) return "Lower attention";
  return value;
}

export function RouteVitalsCard({
  route,
  segments,
}: {
  route: StudioRouteDetailResponse["route"];
  segments: readonly StudioSegment[];
}) {
  const rows: Array<readonly [string, string]> = [
    ["Borough", route.borough],
    ...(route.miles === null ? [] : ([["Length", `${route.miles} mi`]] as const)),
    ["Stops", String(route.stops)],
    ["Service type", route.sbs ? "Select Bus Service" : "Local"],
    ["Reliability", reliabilityLabel(route.reliability)],
    ["Visible segments", String(segments.length)],
  ];

  return (
    <div className="rounded-[3px] bg-[var(--bp-color-card)] px-4 py-1 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex items-baseline justify-between gap-4 py-3 shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none"
        >
          <span className="text-[12.5px] text-[var(--bp-color-ink-55)]">{label}</span>
          <span className="text-right text-[13px] font-semibold text-[var(--bp-color-ink)]">
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}
