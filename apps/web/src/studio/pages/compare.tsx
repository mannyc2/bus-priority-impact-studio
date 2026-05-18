import {
  BeforeAfter,
  ChartFrame,
  KPI,
  RouteBadge,
  Spark,
} from "../../design-system/primitives.js";
import { Badge } from "@/components/ui/badge";
import { StudioHero, StudioPage, StudioPanel } from "../page.js";
import { getStudioRoute, type StudioRoute } from "../sample-data.js";
import { NotFoundPage } from "./not-found.js";

export function ComparePage({ a = "m15-sbs", b = "bx12-sbs" }: { a?: string; b?: string }) {
  const routeA = getStudioRoute(a);
  const routeB = getStudioRoute(b);
  if (!routeA || !routeB) return <NotFoundPage />;

  return (
    <StudioPage>
      <StudioHero
        label="Compare"
        title={`${routeA.label} SBS vs ${routeB.label} SBS`}
        body="A positive-control comparison keeps the argument honest: same structure on both sides, one route under examination and one peer route that exposes the gap."
      />
      <div className="mb-5 grid grid-cols-[1fr_auto_1fr] items-center gap-5 max-md:grid-cols-1">
        <RouteCompareHeader route={routeA} />
        <div className="font-mono text-[11px] font-bold text-[var(--bp-color-ink-40)] max-md:hidden">
          VS
        </div>
        <RouteCompareHeader route={routeB} />
      </div>
      <div className="mb-5 grid grid-cols-5 gap-3 max-xl:grid-cols-3 max-md:grid-cols-1">
        <KPI
          label="Speed delta"
          value={(routeB.speedMph - routeA.speedMph).toFixed(1)}
          unit="mph"
          tone="bad"
          sub="peer advantage"
        />
        <KPI
          label="Lost RH delta"
          value={(routeA.riderHoursLost - routeB.riderHoursLost).toLocaleString()}
          tone="bad"
          sub="weekday spread"
        />
        <KPI
          label="Lane spread"
          value={routeB.laneCoverage - routeA.laneCoverage}
          unit="pt"
          tone="warn"
          sub="coverage gap"
        />
        <KPI label="Route under review" value={routeA.label} tone="accent" sub={routeA.borough} />
        <KPI label="Control" value={routeB.label} tone="good" sub={routeB.borough} />
      </div>
      <div className="grid grid-cols-2 gap-5 max-lg:grid-cols-1">
        <ChartFrame title="Hourly speed shape" source="MTA segment speeds">
          <div className="flex h-[180px] items-center justify-center">
            <Spark
              data={routeA.spark}
              width={360}
              height={110}
              baseline={routeA.scheduledMph}
              color="var(--bp-color-bad)"
              fill
            />
          </div>
        </ChartFrame>
        <ChartFrame title="Peer route shape" source="MTA segment speeds">
          <div className="flex h-[180px] items-center justify-center">
            <Spark
              data={routeB.spark}
              width={360}
              height={110}
              baseline={routeB.scheduledMph}
              color="var(--bp-color-good)"
              fill
            />
          </div>
        </ChartFrame>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-5 max-lg:grid-cols-1">
        <StudioPanel>
          <div className="mb-3 text-[13px] font-semibold">{routeA.label} intervention scenario</div>
          <BeforeAfter before={routeA.speedMph} after={routeA.speedMph + 1.4} max={10} />
        </StudioPanel>
        <StudioPanel>
          <div className="mb-3 text-[13px] font-semibold">Takeaway</div>
          <p className="m-0 text-[13px] leading-6 text-[var(--bp-color-ink-70)]">
            The comparison supports a narrow claim: the weaker treatment stack explains more of the
            gap than route length alone.
          </p>
        </StudioPanel>
      </div>
    </StudioPage>
  );
}

function RouteCompareHeader({ route }: { route: StudioRoute }) {
  return (
    <StudioPanel>
      <div className="mb-3 flex items-center justify-between gap-3">
        <RouteBadge route={route.label} sbs={route.sbs} size="lg" />
        <Badge variant={route.speedMph < 5 ? "bad" : "good"}>{route.speedMph.toFixed(1)} mph</Badge>
      </div>
      <div className="text-[14px] font-semibold">{route.corridor}</div>
      <div className="mt-1 text-[12px] text-[var(--bp-color-ink-55)]">{route.diagnosis}</div>
    </StudioPanel>
  );
}
