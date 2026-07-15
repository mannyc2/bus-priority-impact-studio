import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { speedToColor } from "@/components/route/maplibre-style";
import {
  type MapPeriod,
  type NetworkMapLens,
  NetworkMapLibre,
  type NetworkMapPopupState,
  periodSpeed,
} from "@/components/route/NetworkMapLibre";
import type { RouteGeoContext } from "@/components/route/route-geo-map";
import type { NetworkMapFeature, NetworkMapFeatureCollection } from "@/studio/api-client";
import type { StudioRoute, StudyIndexRow } from "@/studio/api-contract";

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

type NetworkMapSelection = {
  routeId: string;
  anchor: readonly [number, number];
};

export function NetworkMapPage({
  routes,
  network,
  context,
  mapMessage,
  lanesAvailable,
  studyIndex,
}: {
  routes: readonly StudioRoute[];
  network: NetworkMapFeatureCollection | null;
  context: RouteGeoContext | null;
  mapMessage: string | null;
  lanesAvailable: boolean;
  studyIndex: readonly StudyIndexRow[] | null;
}) {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<MapPeriod>("all");
  const [lens, setLens] = useState<NetworkMapLens>("speed");
  const [selection, setSelection] = useState<NetworkMapSelection | null>(null);
  const routeById = useMemo(() => new Map(routes.map((route) => [route.routeId, route])), [routes]);
  const studiesByRouteId = useMemo(() => {
    const grouped = new Map<string, StudyIndexRow[]>();
    for (const row of studyIndex ?? []) {
      const bucket = grouped.get(row.routeId);
      if (bucket === undefined) grouped.set(row.routeId, [row]);
      else bucket.push(row);
    }
    return grouped;
  }, [studyIndex]);

  useEffect(() => {
    if (selection === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelection(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selection]);

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

  const selectedFeature =
    selection === null
      ? null
      : (network.features.find((feature) => feature.properties.routeId === selection.routeId) ??
        null);
  const popup: NetworkMapPopupState | null =
    selection === null || selectedFeature === null
      ? null
      : {
          anchor: selection.anchor,
          content: (
            <NetworkMapPopup
              feature={selectedFeature}
              route={routeById.get(selection.routeId) ?? null}
              studies={studiesByRouteId.get(selection.routeId) ?? []}
              period={period}
              lens={lens}
              onClose={() => setSelection(null)}
            />
          ),
        };

  return (
    <main className="flex h-full min-h-0 flex-col">
      <div className="flex items-baseline gap-3 px-7 py-3 max-md:px-4">
        <h1 className="m-0 text-[18px] font-semibold">Network map</h1>
        <span className="text-[12px] text-[var(--bp-color-ink-55)]">
          {network.features.length} routes, colored by {lensLabel(lens)}. Click a route for details.
        </span>
      </div>
      {mapMessage === null ? null : (
        <p className="m-0 px-7 pb-2 text-[12px] text-[var(--bp-color-ink-55)]" role="status">
          {mapMessage}
        </p>
      )}
      <div className="relative min-h-0 flex-1">
        <NetworkMapLibre
          collection={network}
          context={context}
          period={period}
          lens={lens}
          selectedRouteId={selection?.routeId ?? null}
          onSelectRoute={(routeId, lngLat) => {
            if (lngLat === null) {
              // Static fallback: no anchor to pin a popup to, go to the route.
              const slug = routeById.get(routeId)?.slug;
              if (slug !== undefined) {
                void navigate({ to: "/routes/$routeId", params: { routeId: slug } });
              }
              return;
            }
            setSelection({ routeId, anchor: lngLat });
          }}
          onClearSelection={() => setSelection(null)}
          popup={popup}
        />
        <div className="absolute left-4 top-4 z-10 flex flex-col gap-2">
          <MapToggle
            label="Metric lens"
            value={lens}
            setValue={setLens}
            options={[
              { label: "Speed", value: "speed" },
              { label: "Riders", value: "riders" },
              {
                label: "Lanes",
                value: "lanes",
                disabled: !lanesAvailable,
                disabledReason: "Current bus-lane geometry is unavailable for this release.",
              },
            ]}
          />
          {lens === "speed" ? (
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
          ) : null}
        </div>
        <div className="absolute bottom-6 left-4 z-10">
          <NetworkLegend lens={lens} period={period} />
        </div>
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
  options: ReadonlyArray<{
    label: string;
    value: TValue;
    disabled?: boolean;
    disabledReason?: string;
  }>;
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
            disabled={option.disabled}
            title={option.disabled ? option.disabledReason : undefined}
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
        <div className="mt-1 text-[10.5px] text-[var(--bp-color-ink-55)]">
          Gray means unavailable
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-card)]/95 p-3 text-[10.5px] text-[var(--bp-color-ink-55)] shadow-[0_1px_6px_rgba(0,0,0,0.15)]">
      <div>
        {lens === "riders"
          ? "Darker blue lines carry more daily riders"
          : "Darker green lines have more bus-lane coverage"}
      </div>
      <div className="mt-1">Gray means unavailable</div>
    </div>
  );
}

function NetworkMapPopup({
  feature,
  route,
  studies,
  period,
  lens,
  onClose,
}: {
  feature: NetworkMapFeature;
  route: StudioRoute | null;
  studies: readonly StudyIndexRow[];
  period: MapPeriod;
  lens: NetworkMapLens;
  onClose: () => void;
}) {
  const slug = route?.slug ?? null;
  const place = [feature.properties.borough ?? "Unverified geography", route?.corridor]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" / ");
  const study = routeStudySummary(studies);
  return (
    <div className="w-[264px] p-3 font-sans text-[var(--bp-color-ink)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[18px] font-semibold leading-tight">
            {feature.properties.label}
          </div>
          <div className="mt-0.5 truncate text-[11.5px] text-[var(--bp-color-ink-55)]">{place}</div>
        </div>
        <button
          type="button"
          aria-label="Close route details"
          onClick={onClose}
          className="-mr-1.5 -mt-1.5 rounded-[3px] border-0 bg-transparent px-2 py-1 text-[14px] leading-none text-[var(--bp-color-ink-55)] hover:bg-[var(--bp-color-paper-deep)] hover:text-[var(--bp-color-ink)]"
        >
          ✕
        </button>
      </div>
      <div className="mt-2.5">
        <span className="font-mono text-[22px] font-semibold leading-none tabular-nums">
          {lensValue(feature, period, lens)}
        </span>
        <div className="mt-1 text-[10.5px] text-[var(--bp-color-ink-55)]">
          {lens === "speed" ? `average ${periodLabel(period)} speed` : lensLabel(lens)}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        {popupStats(feature, period, lens).map((stat) => (
          <NetworkMiniStat key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </div>
      {slug === null ? null : (
        <div className="mt-3 flex items-center gap-4 border-t border-[var(--bp-color-rule)] pt-2.5">
          <Link
            to="/routes/$routeId"
            params={{ routeId: slug }}
            className="text-[12.5px] font-semibold text-[var(--bp-color-accent)] no-underline hover:underline"
          >
            Route detail →
          </Link>
          {study.count === 0 ? null : (
            <Link
              to="/routes/$routeId"
              params={{ routeId: slug }}
              search={
                study.eventKey === null
                  ? { tab: "history" as const }
                  : { tab: "history" as const, study: study.eventKey }
              }
              className="text-[12.5px] font-semibold text-[var(--bp-color-accent)] no-underline hover:underline"
            >
              {study.count === 1 ? "Study →" : `Studies (${study.count}) →`}
            </Link>
          )}
        </div>
      )}
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

export function lensValue(
  feature: NetworkMapFeature,
  period: MapPeriod,
  lens: NetworkMapLens,
): string {
  if (lens === "riders") return compactNumber(feature.properties.dailyRiders);
  if (lens === "lanes")
    return feature.properties.laneCoverage === null
      ? "No data"
      : `${Math.round(feature.properties.laneCoverage)}%`;
  const speed = periodSpeed(feature, period).value;
  return speed === null ? "No data" : `${speed.toFixed(1)} mph`;
}

// The popup leads with the active lens value, so the stat row carries the
// remaining three measures.
export function popupStats(
  feature: NetworkMapFeature,
  period: MapPeriod,
  lens: NetworkMapLens,
): Array<{ label: string; value: string }> {
  const stats = [
    { key: "speed", label: "Speed", value: lensValue(feature, period, "speed") },
    { key: "riders", label: "Riders", value: lensValue(feature, period, "riders") },
    { key: "lanes", label: "Lanes", value: lensValue(feature, period, "lanes") },
    {
      key: "delay",
      label: "Delay",
      value:
        feature.properties.riderHoursLost === null
          ? "No data"
          : `${compactNumber(feature.properties.riderHoursLost)} hr`,
    },
  ];
  return stats
    .filter((stat) => stat.key !== lens)
    .map((stat) => ({ label: stat.label, value: stat.value }));
}

export function routeStudySummary(rows: readonly StudyIndexRow[]): {
  count: number;
  eventKey: string | null;
} {
  const first = rows[0];
  return {
    count: rows.length,
    eventKey: rows.length === 1 && first !== undefined ? first.eventKey : null,
  };
}

function compactNumber(value: number | null): string {
  if (value === null) return "No data";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}
