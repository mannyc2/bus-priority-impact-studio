import { BoroughBadge } from "@/components/BoroughBadge";
import { RouteBadge } from "@/components/RouteBadge";
import { formatCompact } from "@/components/route/route-derived";
import type { RouteDossierSummaryForDetail, StudioRoute } from "@/studio/api-contract";

type HeaderStatTone = "ink" | "good" | "bad";

const statToneColor: Record<HeaderStatTone, string> = {
  ink: "var(--bp-color-ink)",
  good: "var(--bp-color-good)",
  bad: "var(--bp-color-bad)",
};

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-05" -> "May 2026"; anything unparseable returns null. */
function formatMonthLabel(month: string | null): string | null {
  if (month === null) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (match === null) return null;
  const monthName = MONTH_NAMES[Number(match[2]) - 1];
  if (monthName === undefined) return null;
  return `${monthName} ${match[1]}`;
}

/** "8.9 miles, 42 stops" — plain commas, no interpunct chains. */
function routeFactsSentence(route: StudioRoute): string {
  return [route.miles === null ? null : `${route.miles.toFixed(1)} miles`, `${route.stops} stops`]
    .filter((part): part is string => part !== null)
    .join(", ");
}

function formatMovement(pct: number | null): string {
  if (pct === null) return "—";
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

/**
 * Compact, self-evident route header (plan 053). Replaces the five-tile KPI
 * strip + verdict lede: the roundel, the corridor name with its termini and
 * borough, and three real numbers — speed, six-month change, weekday riders.
 * Nothing here is clickable and nothing is fabricated: every value falls back
 * to an em-dash with a plain reason when the route record does not carry it.
 */
export function RouteDetailHeader({
  route,
  dossier,
}: {
  route: StudioRoute;
  dossier: RouteDossierSummaryForDetail | null;
}) {
  const speed = dossier?.speed.current ?? route.weightedAvgSpeed;
  const hasSpeed = speed > 0;
  const speedLabel = hasSpeed ? `${speed.toFixed(1)} mph` : "—";
  const speedMonthLabel = formatMonthLabel(dossier?.speed.dataAsOf ?? null) ?? "observed average";
  const speedTone: HeaderStatTone = hasSpeed && speed < 6 ? "bad" : "ink";

  const movement = dossier?.speed.movement6mPct ?? route.movement6mPct;
  const movementLabel = formatMovement(movement);
  const movementSub = movement === null ? "not enough history" : "vs 6 months ago";
  const movementTone: HeaderStatTone = movement === null ? "ink" : movement < 0 ? "bad" : "good";

  const hasRiders = route.dailyRiders > 0;
  const ridersLabel = hasRiders ? formatCompact(route.dailyRiders) : "—";
  const ridersSub = hasRiders ? "per weekday" : "not yet measured";

  return (
    <header className="bg-[var(--bp-color-card)] px-7 py-5 shadow-[inset_0_-1px_0_var(--bp-color-rule)] max-md:px-4">
      <div className="flex flex-wrap items-start gap-5">
        <RouteBadge
          route={route.label}
          displayLabel={route.displayLabel}
          sbs={route.sbs}
          size="xl"
        />
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[24px] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--bp-color-ink)] max-md:text-[20px]">
            {route.corridorFull || route.corridor}
          </h1>
          <div className="mt-1 text-[13px] text-[var(--bp-color-ink-55)]">
            {route.termini.north} <span aria-hidden>→</span> {route.termini.south}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[var(--bp-color-ink-55)]">
            <BoroughBadge borough={route.borough} />
            <span>{routeFactsSentence(route)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-6 max-md:w-full max-md:justify-start">
          <HeaderStat label="Avg speed" value={speedLabel} sub={speedMonthLabel} tone={speedTone} />
          <HeaderStat
            label="6-mo change"
            value={movementLabel}
            sub={movementSub}
            tone={movementTone}
          />
          <HeaderStat label="Riders" value={ridersLabel} sub={ridersSub} />
        </div>
      </div>
    </header>
  );
}

function HeaderStat({
  label,
  value,
  sub,
  tone = "ink",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: HeaderStatTone;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] font-semibold text-[var(--bp-color-ink-55)]">{label}</div>
      <div
        className="mt-1 font-mono text-[20px] font-semibold leading-none tabular-nums"
        style={{ color: statToneColor[tone] }}
      >
        {value}
      </div>
      <div className="mt-1 text-[11px] leading-[1.3] text-[var(--bp-color-ink-55)]">{sub}</div>
    </div>
  );
}
