import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { formatMapHour, hourTag } from "@/components/route/maplibre-style";
import { type NetworkMapLens, NetworkMapLibre } from "@/components/route/NetworkMapLibre";
import type { RouteGeoContext } from "@/components/route/route-geo-map";
import { SectionHeader } from "@/components/SectionHeader";
import { TimeScrubber } from "@/components/TimeScrubber";
import { Badge } from "@/components/ui/badge";
import type { NetworkMapFeature, NetworkMapFeatureCollection } from "@/studio/api-client";
import type { StudioRoute } from "@/studio/api-contract";

export function NetworkMapLoadingPage() {
  return (
    <main className="mx-auto flex max-w-[1440px] flex-col gap-5 px-7 py-6 max-md:px-4">
      <div className="h-10 w-64 animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]" />
      <div className="grid grid-cols-[minmax(0,1.55fr)_minmax(320px,0.8fr)] gap-5 max-xl:grid-cols-1">
        <div className="h-[680px] animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]" />
        <div className="h-[680px] animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]" />
      </div>
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
  const [hour, setHour] = useState(17);
  const [playing, setPlaying] = useState(false);
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
        : [...network.features].sort((left, right) => compareRankedRoutes(left, right, hour, lens)),
    [network, hour, lens],
  );
  const activeRouteId = hoveredRouteId ?? ranked[0]?.properties.routeId ?? null;
  const activeFeature =
    activeRouteId === null
      ? null
      : (network?.features.find((feature) => feature.properties.routeId === activeRouteId) ?? null);

  return (
    <main className="mx-auto flex max-w-[1440px] flex-col gap-5 px-7 py-6 max-md:px-4">
      <SectionHeader
        title="Citywide Network Map"
        sub="Public route speeds on simplified NYC street geometry."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">{network?.features.length ?? 0} routes</Badge>
            <Badge variant="neutral">{formatMapHour(hour)}</Badge>
          </div>
        }
      />
      {network === null ? (
        <div className="rounded-[3px] bg-[var(--bp-color-card)] p-6 text-[13px] text-[var(--bp-color-ink-55)] shadow-[0_0_0_1px_var(--bp-color-rule)]">
          Citywide network geometry is not published for this release.
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1.55fr)_minmax(320px,0.8fr)] gap-5 max-xl:grid-cols-1">
          <div className="min-w-0 rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
            <NetworkMapLibre
              collection={network}
              context={context}
              hour={hour}
              lens={lens}
              hoveredRouteId={hoveredRouteId}
              setHoveredRouteId={setHoveredRouteId}
              selectedRouteId={activeRouteId}
            />
          </div>
          <aside className="min-w-0 rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--bp-color-ink-55)]">
                  {hourTag(hour)}
                </div>
                <div className="mt-1 text-[18px] font-semibold leading-tight">
                  {formatMapHour(hour)}
                </div>
              </div>
              {activeFeature ? (
                <Badge
                  variant={
                    lens === "speed" && routeSpeed(activeFeature, hour) < 5 ? "bad" : "neutral"
                  }
                >
                  {rankValue(activeFeature, hour, lens)}
                </Badge>
              ) : null}
            </div>
            <NetworkLensControl lens={lens} setLens={setLens} />
            <div className="mt-5">
              <TimeScrubber
                hour={hour}
                setHour={setHour}
                playing={playing}
                setPlaying={setPlaying}
                accent="var(--bp-color-accent)"
              />
            </div>
            <NetworkReadout feature={activeFeature} hour={hour} />
            <NetworkRankList
              features={ranked.slice(0, 18)}
              hour={hour}
              lens={lens}
              activeRouteId={activeRouteId}
              routeSlugById={routeSlugById}
              setHoveredRouteId={setHoveredRouteId}
            />
          </aside>
        </div>
      )}
    </main>
  );
}

function NetworkLensControl({
  lens,
  setLens,
}: {
  lens: NetworkMapLens;
  setLens: (lens: NetworkMapLens) => void;
}) {
  const options: Array<{ label: string; value: NetworkMapLens }> = [
    { label: "Speed", value: "speed" },
    { label: "Riders", value: "riders" },
    { label: "Lanes", value: "lanes" },
  ];
  return (
    <fieldset
      className="mt-4 grid grid-cols-3 gap-1 rounded-[3px] border-0 bg-[var(--bp-color-paper-deep)] p-1"
      aria-label="Metric lens"
    >
      {options.map((option) => {
        const active = option.value === lens;
        return (
          <button
            key={option.value}
            type="button"
            className={
              active
                ? "rounded-[3px] border-0 bg-[var(--bp-color-ink)] px-3 py-2 text-[12px] font-semibold text-[var(--bp-color-card)]"
                : "rounded-[3px] border-0 bg-transparent px-3 py-2 text-[12px] font-semibold text-[var(--bp-color-ink-55)] hover:bg-[var(--bp-color-card)] hover:text-[var(--bp-color-ink)]"
            }
            aria-pressed={active}
            onClick={() => setLens(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}

function NetworkReadout({ feature, hour }: { feature: NetworkMapFeature | null; hour: number }) {
  if (feature === null) {
    return (
      <div className="mt-5 border-t border-[var(--bp-color-rule)] pt-4 text-[12.5px] text-[var(--bp-color-ink-55)]">
        No route is selected.
      </div>
    );
  }
  const speed = routeSpeed(feature, hour);
  return (
    <div className="mt-5 border-t border-[var(--bp-color-rule)] pt-4">
      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--bp-color-ink-40)]">
        Focus route
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <div className="text-[28px] font-semibold leading-none">{feature.properties.label}</div>
        <div className="font-mono text-[24px] font-semibold tabular-nums">
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
      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-40)]">
        {label}
      </div>
      <div className="mt-1 truncate font-mono text-[14px] font-semibold text-[var(--bp-color-ink)]">
        {value}
      </div>
    </div>
  );
}

function NetworkRankList({
  features,
  hour,
  lens,
  activeRouteId,
  routeSlugById,
  setHoveredRouteId,
}: {
  features: readonly NetworkMapFeature[];
  hour: number;
  lens: NetworkMapLens;
  activeRouteId: string | null;
  routeSlugById: ReadonlyMap<string, string>;
  setHoveredRouteId: (routeId: string | null) => void;
}) {
  return (
    <div className="mt-5 border-t border-[var(--bp-color-rule)] pt-4">
      <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--bp-color-ink-40)]">
        {rankTitle(lens)}
      </div>
      <div className="flex max-h-[360px] flex-col overflow-y-auto">
        {features.map((feature, index) => {
          const active = feature.properties.routeId === activeRouteId;
          const slug = routeSlugById.get(feature.properties.routeId);
          const className = active
            ? "grid w-full grid-cols-[34px_1fr_auto] items-center gap-3 border-0 bg-transparent px-2 py-2 text-left font-sans no-underline shadow-[inset_3px_0_0_var(--bp-color-ink),inset_0_-1px_0_var(--bp-color-rule)]"
            : "grid w-full grid-cols-[34px_1fr_auto] items-center gap-3 border-0 bg-transparent px-2 py-2 text-left font-sans no-underline shadow-[inset_0_-1px_0_var(--bp-color-rule)] hover:bg-[var(--bp-color-paper-deep)]";
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
                  {rankSubline(feature, hour, lens)}
                </span>
              </span>
              <span className="font-mono text-[13px] font-bold text-[var(--bp-color-ink)]">
                {rankValue(feature, hour, lens)}
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

function routeSpeed(feature: NetworkMapFeature, hour: number): number {
  return feature.properties.hours[hour] ?? feature.properties.currentMph;
}

function compareRankedRoutes(
  left: NetworkMapFeature,
  right: NetworkMapFeature,
  hour: number,
  lens: NetworkMapLens,
): number {
  const delta =
    lens === "riders"
      ? right.properties.dailyRiders - left.properties.dailyRiders
      : lens === "lanes"
        ? left.properties.laneCoverage - right.properties.laneCoverage
        : routeSpeed(left, hour) - routeSpeed(right, hour);
  return delta === 0 ? left.properties.label.localeCompare(right.properties.label) : delta;
}

function rankTitle(lens: NetworkMapLens): string {
  if (lens === "riders") return "Highest ridership";
  if (lens === "lanes") return "Lowest lane coverage";
  return "Slowest routes";
}

function rankValue(feature: NetworkMapFeature, hour: number, lens: NetworkMapLens): string {
  if (lens === "riders") return compactNumber(feature.properties.dailyRiders);
  if (lens === "lanes") return `${Math.round(feature.properties.laneCoverage)}%`;
  return `${routeSpeed(feature, hour).toFixed(1)} mph`;
}

function rankSubline(feature: NetworkMapFeature, hour: number, lens: NetworkMapLens): string {
  if (lens === "speed") {
    return `${feature.properties.borough} / ${compactNumber(feature.properties.dailyRiders)} riders`;
  }
  return `${feature.properties.borough} / ${routeSpeed(feature, hour).toFixed(1)} mph`;
}

function compactNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}
