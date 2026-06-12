import type { ReactNode } from "react";
import { DataAsOf } from "@/components/DataAsOf";
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
 * The judged KPI header (frontend §4.1): five time-aware verdicts fed by the
 * route dossier — peer framing leads, the raw number supports. Each column
 * carries its own `dataAsOf` clock and clicks through to the tab that explains
 * it. Detail-page only; compare keeps the raw-metric strip.
 */

const RELIABILITY_SURFACE = "reliability";
const RIDERSHIP_SURFACE = "ridership";

function fmtPct(pct: number | null): string {
  if (pct === null) return "—";
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function peerHeadline(peerPercentile: number | null): string | null {
  if (peerPercentile === null) return null;
  const fast = peerPercentile >= 50;
  return `${fast ? ">" : "<"}${Math.round(fast ? peerPercentile : 100 - peerPercentile)}%`;
}

function Judged({
  label,
  divider,
  onClick,
  value,
  unit,
  tone = "ink",
  trailing,
  sub,
  dataAsOf,
}: {
  label: string;
  divider: boolean;
  onClick?: (() => void) | undefined;
  value: ReactNode;
  unit?: string | undefined;
  tone?: MetricTone;
  trailing?: ReactNode;
  sub: string;
  dataAsOf: string | null;
}) {
  const body = (
    <>
      <MetricStat value={value} unit={unit} color={metricToneColor[tone]} trailing={trailing} />
      <div className="mt-[3px] text-[11px] text-[var(--bp-color-ink-55)]">{sub}</div>
      <DataAsOf dataAsOf={dataAsOf} className="mt-1" />
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
  const currentSpeedLabel = currentSpeed.toFixed(1);
  const speedPeer = peerHeadline(speed?.peerPercentile ?? null);
  const trendPct = speed?.movement6mPct ?? null;

  const aceActive = posture?.aceActive ?? route.aceStatus === "active";
  const hasLane = (posture?.busLaneMatchedLaneCount ?? 0) > 0 || route.laneCoverage > 0;
  const postureLabel =
    aceActive && hasLane ? "Treated" : aceActive || hasLane ? "Partial" : "Untreated";
  const postureBits = [
    hasLane ? "bus lane" : null,
    aceActive ? `ACE${posture?.aceSince ? ` since ${posture.aceSince.slice(0, 4)}` : ""}` : null,
  ].filter(Boolean);
  const clickTarget = (tab: RouteDetailTabValue) => {
    const target = routeSectionNavigationTarget(sectionRegistry, tab, "evidence");
    return target === null ? undefined : () => onNavigate(target);
  };

  return (
    <MetricColumns>
      <Judged
        label="Condition"
        divider
        onClick={clickTarget("where-when")}
        value={speedPeer ?? currentSpeedLabel}
        unit={speedPeer ? "peers" : "mph"}
        tone={currentSpeed < 6 ? "bad" : "ink"}
        sub={speedPeer ? `${currentSpeedLabel} mph` : "no rank"}
        dataAsOf={speed?.dataAsOf ?? null}
      />
      <Judged
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
        sub="6 mo"
        dataAsOf={speed?.dataAsOf ?? null}
      />
      <Judged
        label="Reliability"
        divider
        onClick={clickTarget("reliability")}
        value={reliabilityKpi.kpiValue}
        tone={reliabilityKpi.kpiTone}
        sub={reliabilityKpi.kpiSub}
        dataAsOf={reliabilityKpi.dataAsOf}
      />
      <Judged
        label="Riders"
        divider
        onClick={clickTarget("riders")}
        value={ridersKpi.kpiValue}
        tone={ridersKpi.kpiTone}
        sub={ridersKpi.kpiSub}
        dataAsOf={ridersKpi.dataAsOf}
      />
      <Judged
        label="Treatment"
        divider={false}
        onClick={clickTarget("treatments")}
        value={postureLabel}
        tone={postureLabel === "Treated" ? "good" : "ink"}
        sub={postureBits.length > 0 ? postureBits.join(" · ") : "none"}
        dataAsOf={posture?.dataAsOf ?? null}
      />
    </MetricColumns>
  );
}
