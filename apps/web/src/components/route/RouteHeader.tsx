import type { ReactNode } from "react";
import { useCompare } from "@/components/route/CompareContext";
import { RouteCompareIdentity } from "@/components/route/RouteCompareIdentity";
import { RouteCompareMetricStrip } from "@/components/route/RouteCompareMetricStrip";
import { RouteIdentity } from "@/components/route/RouteIdentity";
import { RouteMetricStrip } from "@/components/route/RouteMetricStrip";
import { RoutePicker } from "@/components/route/RoutePicker";
import type { StudioRoute } from "@/studio/api-contract";

/**
 * Single-route header content (identity + actions + metric strip) for the
 * route-detail page. Rendered inside RouteDetailShell's flush header card.
 * `actions` is the page-owned slot for the right-side buttons (compare / brief).
 */
export function RouteHeader({
  route,
  actions,
  metricStrip,
}: {
  route: StudioRoute;
  actions?: ReactNode;
  /** Override for the KPI strip — the detail page passes the judged §4.1 strip. */
  metricStrip?: ReactNode;
}) {
  return (
    <>
      <div className="mb-[18px] flex items-start gap-[18px]">
        <div className="min-w-0 flex-1">
          <RouteIdentity route={route} size="lg" />
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {metricStrip ?? <RouteMetricStrip route={route} />}
    </>
  );
}

/**
 * Two-route "vs" header content for the compare page - the explicit sibling of
 * RouteHeader (no mode flag). Same flush header card, but the identity and
 * metric strip render both routes inline, and the comparison route carries the
 * per-slot RoutePicker. Reads the selection from CompareContext, so it must sit
 * under a CompareProvider.
 */
export function RouteCompareHeader() {
  const { a, b } = useCompare();
  return (
    <>
      <div className="mb-[18px]">
        <RouteCompareIdentity a={a} b={b} actionB={<RoutePicker slot="b" />} />
      </div>
      <RouteCompareMetricStrip a={a} b={b} />
    </>
  );
}
