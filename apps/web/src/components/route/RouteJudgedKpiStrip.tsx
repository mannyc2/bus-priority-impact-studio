import type { ReactNode } from "react";
import {
  MetricColumn,
  MetricColumns,
  MetricStat,
  metricToneColor,
} from "@/components/route/MetricColumns";
import { reliabilitySummary } from "@/components/route/reliability-summary";
import { riderImpactSummary } from "@/components/route/rider-impact-summary";
import {
  type RouteDetailTabValue,
  type RouteSectionRegistry,
  routeSectionNavigationTarget,
} from "@/components/route/section-registry";
import { Spark } from "@/components/Spark";
import type {
  RouteDossierSummaryForDetail,
  StudioRoute,
  StudioRouteCapability,
} from "@/studio/api-contract";
import type { MetricTone } from "@/studio/metric-model";

/**
 * The route header KPI strip: five real numbers fed by the route dossier.
 * Each column clicks through to the tab that explains it. Detail-page only;
 * compare keeps the raw-metric strip.
 */

const RELIABILITY_SURFACE = "reliability";
const RIDERSHIP_SURFACE = "ridership";

function fmtPct(pct: number | null): string {
  if (pct === null) return "—";
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function peerSub(peerPercentile: number | null): string {
  if (peerPercentile === null) return "observed average";
  if (peerPercentile >= 50) {
    return `faster than ${Math.round(peerPercentile)}% of peers`;
  }
  return `slower than ${Math.round(100 - peerPercentile)}% of peers`;
}

function Kpi({
  label,
  divider,
  onClick,
  value,
  unit,
  tone = "ink",
  trailing,
  sub,
}: {
  label: string;
  divider: boolean;
  onClick?: (() => void) | undefined;
  value: ReactNode;
  unit?: string | undefined;
  tone?: MetricTone;
  trailing?: ReactNode;
  sub: string;
}) {
  const body = (
    <>
      <MetricStat value={value} unit={unit} color={metricToneColor[tone]} trailing={trailing} />
      <div className="mt-[3px] text-[11px] text-[var(--bp-color-ink-55)]">{sub}</div>
    </>
  );
  return (
    <MetricColumn label={label} divider={divider}>
      {onClick ? (
        <button type="button" onClick={onClick} className="block w-full cursor-pointer text-left">
          {body}
        </button>
      ) : (
        body
      )}
    </MetricColumn>
  );
}

export function RouteJudgedKpiStrip({
  route,
  dossier,
  capability,
  sectionRegistry,
  onNavigate,
}: {
  route: StudioRoute;
  dossier: RouteDossierSummaryForDetail | null;
  capability: StudioRouteCapability | null;
  sectionRegistry: Pick<RouteSectionRegistry, "presentations">;
  onNavigate: (tab: RouteDetailTabValue) => void;
}) {
  const speed = dossier?.speed ?? null;
  const posture = dossier?.treatmentPosture ?? null;
  const reliability = capability?.surfaces[RELIABILITY_SURFACE] ?? null;
  const reliabilityKpi = reliabilitySummary({
    observed: route.observedReliability,
    capability: reliability,
  });
  const ridersKpi = riderImpactSummary({
    route,
    dossier,
    capability: capability?.surfaces[RIDERSHIP_SURFACE] ?? null,
  });

  const currentSpeed = speed?.current ?? route.weightedAvgSpeed;
  const trendPct = speed?.movement6mPct ?? null;

  const aceActive = posture?.aceActive ?? route.aceStatus === "active";
  const aceSub = aceActive
    ? `ACE${posture?.aceSince ? ` since ${posture.aceSince.slice(0, 4)}` : " active"}`
    : "no camera enforcement";
  const clickTarget = (tab: RouteDetailTabValue) => {
    const target = routeSectionNavigationTarget(sectionRegistry, tab, "evidence");
    return target === null ? undefined : () => onNavigate(target);
  };

  return (
    <MetricColumns>
      <Kpi
        label="Speed"
        divider
        onClick={clickTarget("where-when")}
        value={currentSpeed > 0 ? currentSpeed.toFixed(1) : "—"}
        unit="mph"
        tone={currentSpeed > 0 && currentSpeed < 6 ? "bad" : "ink"}
        sub={peerSub(speed?.peerPercentile ?? null)}
      />
      <Kpi
        label="Trend"
        divider
        onClick={clickTarget("where-when")}
        value={fmtPct(trendPct)}
        tone={trendPct === null ? "ink" : trendPct < 0 ? "bad" : "good"}
        trailing={
          speed && speed.sparkline.length > 1 ? (
            <Spark
              data={speed.sparkline.slice(-12).map((point) => point.value ?? 0)}
              width={68}
              height={20}
              color="var(--bp-color-ink-55)"
            />
          ) : undefined
        }
        sub="past 6 months"
      />
      <Kpi
        label="Excess wait"
        divider
        onClick={clickTarget("reliability")}
        value={reliabilityKpi.hasObservedMetrics ? reliabilityKpi.excessWaitLabel : "—"}
        tone={reliabilityKpi.hasObservedMetrics ? reliabilityKpi.kpiTone : "ink"}
        sub={
          reliabilityKpi.hasObservedMetrics
            ? `${reliabilityKpi.longGapLabel} long gaps`
            : "not yet measured"
        }
      />
      <Kpi
        label="Riders"
        divider
        onClick={clickTarget("riders")}
        value={route.dailyRiders > 0 ? ridersKpi.kpiValue : "—"}
        tone={ridersKpi.kpiTone}
        sub={route.dailyRiders > 0 ? "daily riders" : "not yet measured"}
      />
      <Kpi
        label="Bus lane"
        divider={false}
        onClick={clickTarget("treatments")}
        value={`${route.laneCoverage}%`}
        unit="of route"
        tone={route.laneCoverage > 0 ? "good" : "ink"}
        sub={aceSub}
      />
    </MetricColumns>
  );
}
