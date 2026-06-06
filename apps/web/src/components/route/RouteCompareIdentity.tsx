import type { ReactNode } from "react";
import { RouteIdentity } from "@/components/route/RouteIdentity";
import type { StudioRoute } from "@/studio/api-contract";

/**
 * Two-route identity for the compare header. The analog of RouteCompareMetricStrip
 * for route names: both routes render through the same RouteIdentity primitive at
 * the same size with their full metadata, separated by a "vs" - no shrinking one
 * route or dropping its termini/stops. Stacks vertically on narrow widths.
 *
 * `actionA` / `actionB` are optional slots placed at the top-right of each
 * identity - the seam for a per-route "change" picker, kept out of the
 * presentational identity itself.
 */
export function RouteCompareIdentity({
  a,
  b,
  actionA,
  actionB,
}: {
  a: StudioRoute;
  b: StudioRoute;
  actionA?: ReactNode;
  actionB?: ReactNode;
}) {
  // Reserve the action lane on BOTH columns when either side has one, so the two
  // identity columns stay equal width and a long route name ("...Select Bus
  // Service") wraps at the same point left and right. Without this the picker
  // narrows only route B's column, dropping "Service" onto a second line and
  // pushing its badge/meta out of alignment with route A.
  const reserveAction = actionA != null || actionB != null;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-5 max-md:grid-cols-1 max-md:gap-3">
      <IdentitySide route={a} action={actionA} reserveAction={reserveAction} />
      <span className="self-center font-mono text-[12px] font-medium text-[var(--bp-color-ink-40)]">
        vs
      </span>
      <IdentitySide route={b} action={actionB} reserveAction={reserveAction} />
    </div>
  );
}

// min-w-0 on the column root lets the 1fr grid track shrink below the identity's
// intrinsic width so the title/meta wrap instead of overflowing the card. The
// fixed-width action lane (rendered on both sides for symmetry) holds the picker
// on one side and equal empty space on the other.
function IdentitySide({
  route,
  action,
  reserveAction,
}: {
  route: StudioRoute;
  action?: ReactNode;
  reserveAction: boolean;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <div className="min-w-0 flex-1">
        {/* lg matches the single route-detail header (xl badge, 24px title, full
            meta) so navigating detail -> compare doesn't resize the route you
            were just looking at. */}
        <RouteIdentity route={route} size="lg" />
      </div>
      {reserveAction ? <div className="flex w-[76px] shrink-0 justify-end">{action}</div> : null}
    </div>
  );
}
