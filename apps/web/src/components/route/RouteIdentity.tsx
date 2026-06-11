import { RouteBadge } from "@/components/RouteBadge";
import type { StudioRoute } from "@/studio/api-contract";

type RouteIdentitySize = "md" | "lg";

// Two sizes over one layout: "lg" reproduces the single-route detail header
// (xl badge, 24px title); "md" is the slightly smaller, responsive size used
// when two identities share the compare header. Both keep the full meta line -
// the point is to stop deleting metadata in compare.
const identityConfig = {
  lg: { badge: "xl", gap: "gap-[18px]", title: "text-[24px]", meta: "text-[13px]" },
  md: { badge: "lg", gap: "gap-[14px]", title: "text-[17px] xl:text-[19px]", meta: "text-[12px]" },
} as const;

export function RouteIdentity({
  route,
  size = "lg",
}: {
  route: StudioRoute;
  size?: RouteIdentitySize;
}) {
  const cfg = identityConfig[size];
  return (
    <div className={`flex min-w-0 items-start ${cfg.gap}`}>
      <RouteBadge route={route.label} sbs={route.sbs} size={cfg.badge} />
      <div className="min-w-0">
        <div className={`font-semibold leading-[1.1] tracking-[-0.02em] ${cfg.title}`}>
          {route.corridorFull}
        </div>
        <div className={`mt-1 text-[var(--bp-color-ink-55)] ${cfg.meta}`}>
          {route.borough} &middot; {route.termini.north} &harr; {route.termini.south} &middot;{" "}
          {route.miles} mi &middot; {route.stops} stops
        </div>
      </div>
    </div>
  );
}
