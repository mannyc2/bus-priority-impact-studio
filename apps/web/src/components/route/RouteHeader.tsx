import type { ReactNode } from "react";
import { RouteIdentity } from "@/components/route/RouteIdentity";
import { RouteMetricStrip } from "@/components/route/RouteMetricStrip";
import type { StudioRoute } from "@/studio/api-contract";

/**
 * Single-route header content (identity + actions + metric strip) for the
 * route-detail page. Rendered inside RouteDetailShell's flush header card.
 */
export function RouteHeader({
  route,
  actions,
  contextLabel,
  metricStrip,
}: {
  route: StudioRoute;
  actions?: ReactNode;
  contextLabel?: string;
  /** Override for the KPI strip — the detail page passes the judged §4.1 strip. */
  metricStrip?: ReactNode;
}) {
  return (
    <>
      <div className="mb-[18px] flex items-start gap-[18px]">
        <div className="min-w-0 flex-1">
          <RouteIdentity route={route} />
          {contextLabel ? (
            <div className="mt-2 text-[11px] text-[var(--bp-color-ink-55)]">{contextLabel}</div>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {metricStrip ?? <RouteMetricStrip route={route} />}
    </>
  );
}
