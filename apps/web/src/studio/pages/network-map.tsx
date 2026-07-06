import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { speedToColor } from "@/components/route/maplibre-style";
import {
  type MapPeriod,
  type NetworkMapLens,
  NetworkMapLibre,
  periodSpeed,
} from "@/components/route/NetworkMapLibre";
import type { RouteGeoContext } from "@/components/route/route-geo-map";
import { Badge } from "@/components/ui/badge";
import type { NetworkMapFeature, NetworkMapFeatureCollection } from "@/studio/api-client";
import type { StudioRoute } from "@/studio/api-contract";

export function NetworkMapLoadingPage() {
  return (
    <main className="flex h-full min-h-0 flex-col">
      <div className="flex items-baseline gap-3 px-7 py-3 max-md:px-4">
        <div className="h-6 w-44 animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]" />
      </div>
      <div className="min-h-0 flex-1 animate-pulse bg-[var(--bp-color-ink-06)]" />
    </main>
  );
}

export function NetworkMapPage({
  routes,
  network,
  context,
}: {
  routes: readonly StudioRoute[];
  network: NetworkMapFeatureCollection | null;
  context: RouteGeoContext | null;
}) {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<MapPeriod>("all");
  const [lens, setLens] = useState<NetworkMapLens>("speed");
  const [hoveredRouteId, setHoveredRouteId] = useState<string | null>(null);
  const routeSlugById = useMemo(
    () => new Map(routes.map((route) => [route.routeId, route.slug])),
    [routes],
  );
  const ranked = useMemo(
    () =>
      network === null
        ? []
        : [...network.features].sort((left, right) =>
            compareRankedRoutes(left, right, period, lens),
          ),
    [network, period, lens],
  );
  const activeRouteId = hoveredRouteId ?? ranked[0]?.properties.routeId ?? null;
  const activeFeature =
    activeRouteId === null
      ? null
      : (network?.features.find((feature) => feature.properties.routeId === activeRouteId) ?? null);

  if (network === null) {
    return (
      <main className="mx-auto flex max-w-[1440px] flex-col gap-5 px-7 py-6 max-md:px-4">
        <h1 className="m-0 text-[18px] font-semibold">Network map</h1>
        <div className="rounded-[3px] bg-[var(--bp-color-card)] p-6 text-[13px] text-[var(--bp-color-ink-55)] shadow-[0_0_0_1px_var(--bp-color-rule)]">
          Citywide network geometry is not published for this release.
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col">
      <div className="flex items-baseline gap-3 px-7 py-3 max-md:px-4">
        <h1 className="m-0 text-[18px] font-semibold">Network map</h1>
        <span className="text-[12px] text-[var(--bp-color-ink-55)]">
          {network.features.length} routes, colored by {lensLabel(lens)}.
        </span>
      </div>
      <div className="relative min-h-0 flex-1">
        <NetworkMapLibre
          collection={network}
          context={context}
          period={period}
          lens={lens}
          hoveredRouteId={hoveredRouteId}
          setHoveredRouteId={setHoveredRouteId}
          selectedRouteId={activeRouteId}
          onSelectRoute={(routeId) => {
            const slug = routeSlugById.get(routeId);
            if (slug !== undefined) {
              void navigate({ to: "/routes/$routeId", params: { routeId: slug } });
            }
          }}
        />
        <div className="absolute left-4 top-4 z-10 flex flex-col gap-2">
          <MapToggle
            label="Metric lens"
            value={lens}
            setValue={setLens}
            options={[
              { label: "Speed", value: "speed" },
              { label: "Riders", value: "riders" },
              { label: "Lanes", value: "lanes" },
            ]}
          />
          <MapToggle
            label="Time period"
            value={period}
            setValue={setPeriod}
            options={[
              { label: "All day", value: "all" },
              { label: "AM peak", value: "am" },
              { label: "PM peak", value: "pm" },
            ]}
          />
        </div>
        <div className="absolute bottom-6 left-4 z-10">
          <NetworkLegend lens={lens} period={period} />
        </div>
        <aside className="absolute right-4 top-4 z-10 flex max-h-[calc(100%-2rem)] w-[300px] flex-col overflow-hidden rounded-[3px] bg-[var(--bp-color-card)]/95 p-3 shadow-[0_1px_6px_rgba(0,0,0,0.15)] max-md:hidden">
          <NetworkReadout feature={activeFeature} period={period} lens={lens} />
          <NetworkRankList
            features={ranked.slice(0, 10)}
            period={period}
            lens={lens}
            activeRouteId={activeRouteId}
            routeSlugById={routeSlugById}
            setHoveredRouteId={setHoveredRouteId}
          />
        </aside>
      </div>
    </main>
  );
}

function MapToggle<TValue extends string>({
  label,
  value,
  setValue,
  options,
}: {
  label: string;
  value: TValue;
  setValue: (value: TValue) => void;
  options: ReadonlyArray<{ label: string; value: TValue }>;
}) {
  return (
    <fieldset
      className="grid grid-cols-3 gap-1 rounded-[3px] border-0 bg-[var(--bp-color-card)]/95 p-1 shadow-[0_1px_6px_rgba(0,0,0,0.15)]"
      aria-label={label}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={
              active
                ? "rounded-[3px] border-0 bg-[var(--bp-color-ink)] px-3 py-1.5 text-[12px] font-semibold text-[var(--bp-color-card)]"
                : "rounded-[3px] border-0 bg-transparent px-3 py-1.5 text-[12px] font-semibold text-[var(--bp-color-ink-55)] hover:bg-[var(--bp-color-paper-deep)] hover:text-[var(--bp-color-ink)]"
            }
            aria-pressed={active}
            onClick={() => setValue(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}

const LEGEND_SPEEDS = [3, 5, 7, 9, 11] as const;

function NetworkLegend({ lens, period }: { lens: NetworkMapLens; period: MapPeriod }) {
  if (lens === "speed") {
    return (
      <div className="rounded-[3px] bg-[var(--bp-color-card)]/95 p-3 shadow-[0_1px_6px_rgba(0,0,0,0.15)]">
        <div className="flex items-end gap-2">
          {LEGEND_SPEEDS.map((speed, index) => (
            <div key={speed} className="flex flex-col items-center gap-1">
              <span
                className="h-1.5 w-8 rounded-full"
                style={{ backgroundColor: speedToColor(speed) }}
              />
              <span className="text-[10px] font-semibold tabular-nums text-[var(--bp-color-ink-55)]">
                {index === LEGEND_SPEEDS.length - 1 ? `${speed}+ mph` : speed}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-1.5 text-[10.5px] text-[var(--bp-color-ink-55)]">
          average {periodLabel(period)} speed
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-card)]/95 p-3 shadow-[0_1px_6px_rgba(0,0,0,0.15)] text-[10.5px] text-[var(--bp-color-ink-55)]">
      {lens === "riders"
        ? "darker blue lines carry more daily riders"
        : "darker green lines have more bus-lane coverage"}
    </div>
  );
}

function NetworkReadout({
  feature,
  period,
  lens,
}: {
  feature: NetworkMapFeature | null;
  period: MapPeriod;
  lens: NetworkMapLens;
}) {
  if (feature === null) {
    return <div className="text-[12.5px] text-[var(--bp-color-ink-55)]">No route is selected.</div>;
  }
  const speed = periodSpeed(feature, period);
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10.5px] font-semibold text-[var(--bp-color-ink-55)]">Focus route</div>
        <Badge variant={lens === "speed" && speed < 5 ? "bad" : "neutral"}>
          {rankValue(feature, period, lens)}
        </Badge>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <div className="text-[24px] font-semibold leading-none">{feature.properties.label}</div>
        <div className="font-mono text-[20px] font-semibold tabular-nums">
          {speed.toFixed(1)}
          <span className="ml-1 text-[11px] text-[var(--bp-color-ink-55)]">mph</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-[11.5px] text-[var(--bp-color-ink-55)]">
        <NetworkMiniStat label="Riders" value={compactNumber(feature.properties.dailyRiders)} />
        <NetworkMiniStat label="Lanes" value={`${feature.properties.laneCoverage}%`} />
        <NetworkMiniStat label="Hotspots" value={String(feature.properties.hotspotCount)} />
      </div>
    </div>
  );
}

function NetworkMiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-t border-[var(--bp-color-rule)] pt-2">
      <div className="text-[10.5px] font-semibold text-[var(--bp-color-ink-55)]">{label}</div>
      <div className="mt-1 truncate font-mono text-[14px] font-semibold text-[var(--bp-color-ink)]">
        {value}
      </div>
    </div>
  );
}

function NetworkRankList({
  features,
  period,
  lens,
  activeRouteId,
  routeSlugById,
  setHoveredRouteId,
}: {
  features: readonly NetworkMapFeature[];
  period: MapPeriod;
  lens: NetworkMapLens;
  activeRouteId: string | null;
  routeSlugById: ReadonlyMap<string, string>;
  setHoveredRouteId: (routeId: string | null) => void;
}) {
  return (
    <div className="mt-4 flex min-h-0 flex-col border-t border-[var(--bp-color-rule)] pt-3">
      <div className="mb-2 text-[10.5px] font-semibold text-[var(--bp-color-ink-55)]">
        {rankTitle(lens)}
      </div>
      <div className="flex min-h-0 flex-col overflow-y-auto">
        {features.map((feature, index) => {
          const active = feature.properties.routeId === activeRouteId;
          const slug = routeSlugById.get(feature.properties.routeId);
          const className = active
            ? "grid w-full grid-cols-[28px_1fr_auto] items-center gap-2 border-0 bg-transparent px-2 py-1.5 text-left font-sans no-underline shadow-[inset_3px_0_0_var(--bp-color-ink),inset_0_-1px_0_var(--bp-color-rule)]"
            : "grid w-full grid-cols-[28px_1fr_auto] items-center gap-2 border-0 bg-transparent px-2 py-1.5 text-left font-sans no-underline shadow-[inset_0_-1px_0_var(--bp-color-rule)] hover:bg-[var(--bp-color-paper-deep)]";
          const content = (
            <>
              <span className="font-mono text-[11px] font-bold text-[var(--bp-color-ink-40)]">
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-[var(--bp-color-ink)]">
                  {feature.properties.label}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-[var(--bp-color-ink-55)]">
                  {rankSubline(feature, period, lens)}
                </span>
              </span>
              <span className="font-mono text-[13px] font-bold text-[var(--bp-color-ink)]">
                {rankValue(feature, period, lens)}
              </span>
            </>
          );
          if (slug === undefined) {
            return (
              <button
                key={feature.properties.routeId}
                type="button"
                className={className}
                onMouseEnter={() => setHoveredRouteId(feature.properties.routeId)}
                onMouseLeave={() => setHoveredRouteId(null)}
              >
                {content}
              </button>
            );
          }
          return (
            <Link
              key={feature.properties.routeId}
              to="/routes/$routeId"
              params={{ routeId: slug }}
              className={className}
              onMouseEnter={() => setHoveredRouteId(feature.properties.routeId)}
              onMouseLeave={() => setHoveredRouteId(null)}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function lensLabel(lens: NetworkMapLens): string {
  if (lens === "riders") return "daily riders";
  if (lens === "lanes") return "bus-lane coverage";
  return "average speed";
}

export function periodLabel(period: MapPeriod): string {
  if (period === "am") return "AM peak";
  if (period === "pm") return "PM peak";
  return "all-day";
}

export function compareRankedRoutes(
  left: NetworkMapFeature,
  right: NetworkMapFeature,
  period: MapPeriod,
  lens: NetworkMapLens,
): number {
  const delta =
    lens === "riders"
      ? right.properties.dailyRiders - left.properties.dailyRiders
      : lens === "lanes"
        ? left.properties.laneCoverage - right.properties.laneCoverage
        : periodSpeed(left, period) - periodSpeed(right, period);
  return delta === 0 ? left.properties.label.localeCompare(right.properties.label) : delta;
}

export function rankTitle(lens: NetworkMapLens): string {
  if (lens === "riders") return "Highest ridership";
  if (lens === "lanes") return "Lowest lane coverage";
  return "Slowest routes";
}

export function rankValue(
  feature: NetworkMapFeature,
  period: MapPeriod,
  lens: NetworkMapLens,
): string {
  if (lens === "riders") return compactNumber(feature.properties.dailyRiders);
  if (lens === "lanes") return `${Math.round(feature.properties.laneCoverage)}%`;
  return `${periodSpeed(feature, period).toFixed(1)} mph`;
}

export function rankSubline(
  feature: NetworkMapFeature,
  period: MapPeriod,
  lens: NetworkMapLens,
): string {
  if (lens === "speed") {
    return `${feature.properties.borough} / ${compactNumber(feature.properties.dailyRiders)} riders`;
  }
  return `${feature.properties.borough} / ${periodSpeed(feature, period).toFixed(1)} mph`;
}

function compactNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}
