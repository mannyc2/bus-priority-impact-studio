import { RouteBadge } from "@/components/RouteBadge";
import type { StudioRoute } from "@/studio/api-contract";

export function RouteIdentity({ route }: { route: StudioRoute }) {
  return (
    <div className="flex min-w-0 items-start gap-[18px]">
      <RouteBadge route={route.label} sbs={route.sbs} size="xl" />
      <div className="min-w-0">
        <div className="text-[24px] font-semibold leading-[1.1] tracking-[-0.02em]">
          {route.corridorFull}
        </div>
        <div className="mt-1 text-[13px] text-[var(--bp-color-ink-55)]">
          {route.borough} &middot; {route.termini.north} &harr; {route.termini.south} &middot;{" "}
          {route.miles} mi &middot; {route.stops} stops
        </div>
      </div>
    </div>
  );
}
