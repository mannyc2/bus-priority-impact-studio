import { RPubBigStat } from "@/components/route/RoutePublicAtoms";
import { reliabilitySummary } from "@/components/route/reliability-summary";
import { riderImpactSummary } from "@/components/route/rider-impact-summary";
import {
  type RouteDetailSectionValue,
  type RouteSectionRegistry,
  routeSectionNavigationTarget,
} from "@/components/route/section-registry";
import { Spark } from "@/components/Spark";
import type {
  RouteDossierSummaryForDetail,
  StudioRoute,
  StudioRouteCapability,
} from "@/studio/api-contract";

/** The route header KPI strip: five real numbers fed by the route record.
 * Each column scrolls to the section that explains it. */

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

export function RoutePublicKpiStrip({
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
  onNavigate: (section: RouteDetailSectionValue) => void;
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
  const clickTarget = (section: RouteDetailSectionValue) => {
    const target = routeSectionNavigationTarget(sectionRegistry, section, "evidence");
    return target === null ? undefined : () => onNavigate(target);
  };

  return (
    <div className="grid grid-cols-5 gap-5 max-xl:grid-cols-3 max-md:grid-cols-1">
      <RPubBigStat
        label="Speed"
        onClick={clickTarget("where-when")}
        value={currentSpeed > 0 ? currentSpeed.toFixed(1) : "—"}
        unit="mph"
        tone={currentSpeed > 0 && currentSpeed < 6 ? "bad" : "ink"}
        sub={peerSub(speed?.peerPercentile ?? null)}
      />
      <RPubBigStat
        label="Trend"
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
      <RPubBigStat
        label="Excess wait"
        onClick={clickTarget("reliability")}
        value={reliabilityKpi.hasObservedMetrics ? reliabilityKpi.excessWaitLabel : "—"}
        tone={reliabilityKpi.hasObservedMetrics ? reliabilityKpi.kpiTone : "ink"}
        sub={
          reliabilityKpi.hasObservedMetrics
            ? `${reliabilityKpi.longGapLabel} long gaps`
            : "not yet measured"
        }
      />
      <RPubBigStat
        label="Riders"
        onClick={clickTarget("riders")}
        value={route.dailyRiders > 0 ? ridersKpi.kpiValue : "—"}
        tone={ridersKpi.kpiTone}
        sub={route.dailyRiders > 0 ? "daily riders" : "not yet measured"}
      />
      <RPubBigStat
        label="Bus lane"
        onClick={clickTarget("treatments")}
        value={`${route.laneCoverage}%`}
        unit="of route"
        tone={route.laneCoverage > 0 ? "good" : "ink"}
        sub={aceSub}
      />
    </div>
  );
}
