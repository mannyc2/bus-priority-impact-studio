import { RouteBadge } from "@/components/RouteBadge";
import type { StudioRoute } from "@/studio/api-contract";

/**
 * Small labeled tag (series-color dot + badge + corridor) used to head each
 * route's panel in the side-by-side parts of the compare sections, so a column
 * is unambiguously route A or B and matches its overlay line color.
 */
export function CompareRouteTag({ route, color }: { route: StudioRoute; color: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-[12px]">
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
      <RouteBadge route={route.label} sbs={route.sbs} size="sm" />
      <span className="truncate font-semibold">{route.corridor}</span>
    </span>
  );
}
