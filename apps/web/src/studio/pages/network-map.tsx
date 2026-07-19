import type { MapBusLaneFeatureCollection, MapManifestResponse } from "@bp/domain/maps";
import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapHourStrip } from "@/components/route/MapHourStrip";
import {
  type NetworkBadge,
  NetworkMapLibre,
  type NetworkMapPopupState,
} from "@/components/route/NetworkMapLibre";
import {
  badgeFeatures,
  compactNumber,
  coverageLabel,
  delayLensEligible,
  featureAnchor,
  featureClass,
  featureValue,
  formatViewValue,
  insightModel,
  legendModel,
  type NetworkEncoding,
  type NetworkView,
  percentileLine,
  periodLabel,
  SPEED_CLASS_COLORS,
  slowestWindow,
  sortFeaturesForView,
  speedBandTerm,
  viewEncoding,
} from "@/components/route/network-map-model";
import type { RouteGeoContext } from "@/components/route/route-geo-map";
import {
  fetchMapBusLanes,
  type NetworkMapFeature,
  type NetworkMapFeatureCollection,
} from "@/studio/api-client";
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

const NOTE_DISMISSED_KEY = "bp.map.insight.dismissed";

function readNoteDismissed(): boolean {
  try {
    return localStorage.getItem(NOTE_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeNoteDismissed(dismissed: boolean): void {
  try {
    if (dismissed) localStorage.setItem(NOTE_DISMISSED_KEY, "1");
    else localStorage.removeItem(NOTE_DISMISSED_KEY);
  } catch {
    // Preference storage is best-effort.
  }
}

export function NetworkMapPage({
  routes,
  network,
  context,
  mapMessage,
  manifest,
  lanesAvailable,
  coverageEnd,
  studyIndex,
}: {
  routes: readonly StudioRoute[];
  network: NetworkMapFeatureCollection | null;
  context: RouteGeoContext | null;
  mapMessage: string | null;
  manifest: MapManifestResponse | null;
  lanesAvailable: boolean;
  coverageEnd: string | null;
  studyIndex: readonly StudyIndexRow[] | null;
}) {
  const [view, setView] = useState<NetworkView>({ lens: "speed", period: "all", compare: false });
  const [panelOpen, setPanelOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<NetworkMapSelection | null>(null);
  const [previewRouteId, setPreviewRouteId] = useState<string | null>(null);
  const [noteDismissed, setNoteDismissed] = useState(readNoteDismissed);
  const [lanesVisible, setLanesVisible] = useState(false);
  const [busLanes, setBusLanes] = useState<MapBusLaneFeatureCollection | null>(null);
  const [lanesError, setLanesError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const findPillRef = useRef<HTMLButtonElement | null>(null);

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

  const coverage = coverageEnd === null ? null : coverageLabel(coverageEnd);
  const delayEligible = useMemo(
    () => network !== null && delayLensEligible(network.features, coverage),
    [network, coverage],
  );
  const legend = useMemo(
    () => (network === null ? null : legendModel(network.features, view, coverage ?? "")),
    [network, view, coverage],
  );
  const insight = useMemo(
    () => (network === null ? null : insightModel(network.features, view, coverage ?? "")),
    [network, view, coverage],
  );
  const ranked = useMemo(() => {
    if (network === null) return [];
    const needle = query.trim().toLowerCase();
    return sortFeaturesForView(network.features, view).filter((feature) => {
      if (needle === "") return true;
      const corridor = routeById.get(feature.properties.routeId)?.corridor ?? "";
      return (
        feature.properties.label.toLowerCase().includes(needle) ||
        corridor.toLowerCase().includes(needle)
      );
    });
  }, [network, view, query, routeById]);
  const badges = useMemo<NetworkBadge[]>(() => {
    if (network === null) return [];
    return badgeFeatures(network.features, view, 10).flatMap((feature) => {
      const anchor = featureAnchor(feature);
      return anchor === null
        ? []
        : [
            {
              routeId: feature.properties.routeId,
              label: feature.properties.label,
              sbs: feature.properties.sbs ?? false,
              lngLat: anchor,
            },
          ];
    });
  }, [network, view]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (selection !== null) {
        setSelection(null);
        return;
      }
      if (panelOpen) {
        setPanelOpen(false);
        setPreviewRouteId(null);
        findPillRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selection, panelOpen]);

  useEffect(() => {
    if (panelOpen) searchRef.current?.focus();
  }, [panelOpen]);

  const toggleLanes = (visible: boolean) => {
    setLanesVisible(visible);
    if (!visible || busLanes !== null || manifest === null) return;
    fetchMapBusLanes(manifest)
      .then((load) => {
        if (load.status === "ready") {
          setBusLanes(load.data);
          setLanesError(null);
        } else {
          setLanesVisible(false);
          setLanesError("The bus-lane layer failed to load.");
        }
      })
      .catch(() => {
        setLanesVisible(false);
        setLanesError("The bus-lane layer failed to load.");
      });
  };

  const pinRoute = (routeId: string, anchor: readonly [number, number] | null) => {
    if (anchor === null) return;
    setPanelOpen(false);
    setPreviewRouteId(null);
    setSelection({ routeId, anchor });
  };

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
              features={network.features}
              route={routeById.get(selection.routeId) ?? null}
              studies={studiesByRouteId.get(selection.routeId) ?? []}
              view={view}
              coverage={coverage}
              onClose={() => setSelection(null)}
            />
          ),
        };
  const encoding = viewEncoding(view);

  return (
    <main className="flex h-full min-h-0 flex-col">
      <div className="flex items-baseline gap-3 px-7 py-3 max-md:px-4">
        <h1 className="m-0 text-[18px] font-semibold">Network map</h1>
        <span className="text-[12px] text-[var(--bp-color-ink-55)]">
          {coverage === null
            ? `${network.features.length} Local, Limited & SBS routes`
            : `Data through ${coverage} — ${network.features.length} Local, Limited & SBS routes`}
        </span>
      </div>
      {mapMessage === null && lanesError === null ? null : (
        <p className="m-0 px-7 pb-2 text-[12px] text-[var(--bp-color-ink-55)]" role="status">
          {[mapMessage, lanesError].filter((message) => message !== null).join(" ")}
        </p>
      )}
      <div className="relative min-h-0 flex-1">
        <NetworkMapLibre
          collection={network}
          context={context}
          view={view}
          badges={badges}
          busLanes={busLanes}
          showLanes={lanesVisible}
          selectedRouteId={previewRouteId ?? selection?.routeId ?? null}
          onSelectRoute={pinRoute}
          onClearSelection={() => setSelection(null)}
          popup={popup}
        />
        <div className="absolute left-4 top-4 z-10 flex flex-col items-start gap-2">
          <button
            ref={findPillRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={panelOpen}
            onClick={() => {
              if (panelOpen) setPreviewRouteId(null);
              setPanelOpen((open) => !open);
            }}
            className="flex items-center gap-2 rounded-[3px] border-0 bg-[var(--bp-color-card)]/95 px-3 py-2 text-[12px] font-semibold text-[var(--bp-color-ink-55)] shadow-[0_1px_6px_rgba(0,0,0,0.15)] hover:text-[var(--bp-color-ink)]"
          >
            <Search size={12} strokeWidth={2.5} aria-hidden className="opacity-50" />
            Find a route
          </button>
          <MapToggle
            label="Metric lens"
            value={view.lens}
            setValue={(lens) =>
              setView((current) => ({
                ...current,
                lens,
                compare: lens === "speed" ? current.compare : false,
              }))
            }
            options={
              delayEligible
                ? [
                    { label: "Speed", value: "speed" },
                    { label: "Rider delay", value: "delay" },
                  ]
                : [{ label: "Speed", value: "speed" }]
            }
          />
          {view.lens === "speed" ? (
            <MapToggle
              label="Time period"
              value={view.period}
              setValue={(period) =>
                setView((current) => ({
                  ...current,
                  period,
                  compare: period === "all" ? false : current.compare,
                }))
              }
              options={[
                { label: "All day", value: "all" },
                { label: "AM peak", value: "am" },
                { label: "PM peak", value: "pm" },
              ]}
            />
          ) : null}
          {view.lens === "speed" && view.period !== "all" ? (
            <MapToggle
              label="Comparison"
              value={view.compare ? "compare" : "absolute"}
              setValue={(value) =>
                setView((current) => ({ ...current, compare: value === "compare" }))
              }
              options={[
                { label: "Absolute", value: "absolute" },
                { label: "Vs all day", value: "compare" },
              ]}
            />
          ) : null}
        </div>
        {insight === null ? null : noteDismissed ? (
          <button
            type="button"
            aria-label="Show map note"
            title="Show map note"
            onClick={() => {
              setNoteDismissed(false);
              writeNoteDismissed(false);
            }}
            className="absolute right-4 top-4 z-10 h-[26px] w-[26px] rounded-full border-0 bg-[var(--bp-color-card)]/95 font-serif text-[13px] font-bold italic text-[var(--bp-color-ink-55)] shadow-[0_1px_6px_rgba(0,0,0,0.15)] hover:text-[var(--bp-color-ink)]"
          >
            i
          </button>
        ) : (
          <div
            role="note"
            className="absolute right-4 top-4 z-10 max-w-[260px] rounded-[3px] bg-[var(--bp-color-card)]/95 p-3 pr-7 text-[11px] leading-normal text-[var(--bp-color-ink-70)] shadow-[0_1px_6px_rgba(0,0,0,0.15)]"
          >
            <b className="text-[var(--bp-color-ink)]">{insight.lead}</b> {insight.rest}
            <button
              type="button"
              aria-label="Dismiss note"
              onClick={() => {
                setNoteDismissed(true);
                writeNoteDismissed(true);
              }}
              className="absolute right-1 top-1 rounded-[2px] border-0 bg-transparent px-1.5 py-0.5 text-[11px] text-[var(--bp-color-ink-40)] hover:bg-[var(--bp-color-paper-deep)] hover:text-[var(--bp-color-ink)]"
            >
              ✕
            </button>
          </div>
        )}
        {legend === null ? null : <LegendStrip legend={legend} />}
        {panelOpen ? (
          <div
            role="dialog"
            aria-label="Find a route"
            className="absolute bottom-4 right-4 top-4 z-20 flex w-[302px] max-w-[calc(100%-32px)] flex-col rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule),0_10px_30px_rgba(16,20,24,0.2)]"
          >
            <div className="flex items-baseline gap-2 px-3 pb-0.5 pt-2.5">
              <b className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[var(--bp-color-ink-55)]">
                {encoding === "delay"
                  ? "Most rider time lost"
                  : encoding === "delta"
                    ? "Biggest peak slowdown"
                    : `Slowest first (${periodLabel(view.period)})`}
              </b>
              <span className="text-[10.5px] text-[var(--bp-color-ink-40)]">
                {ranked.length} routes
              </span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => {
                  setPanelOpen(false);
                  setPreviewRouteId(null);
                  findPillRef.current?.focus();
                }}
                className="ml-auto self-center rounded-[2px] border-0 bg-transparent px-1.5 py-0.5 text-[13px] text-[var(--bp-color-ink-40)] hover:bg-[var(--bp-color-paper-deep)] hover:text-[var(--bp-color-ink)]"
              >
                ✕
              </button>
            </div>
            <div className="relative mx-2.5 mb-2 mt-1.5">
              <Search
                size={12}
                strokeWidth={2.5}
                aria-hidden
                className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-45"
              />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="B41, M15, Q58, corridor"
                aria-label="Find a route"
                className="w-full rounded-[3px] border border-[var(--bp-color-rule)] bg-[var(--bp-color-paper)] py-1.5 pl-7 pr-2.5 text-[12.5px] text-[var(--bp-color-ink)] outline-none placeholder:text-[var(--bp-color-ink-40)] focus:border-[var(--bp-color-accent)]"
              />
            </div>
            <div
              className="min-h-0 flex-1 overflow-y-auto border-t border-[var(--bp-color-ink-06)]"
              role="listbox"
              aria-label="Ranked routes"
            >
              {ranked.map((feature, index) => (
                <RankRow
                  key={feature.properties.routeId}
                  feature={feature}
                  rank={index + 1}
                  view={view}
                  corridor={routeById.get(feature.properties.routeId)?.corridor ?? null}
                  pinned={selection?.routeId === feature.properties.routeId}
                  onPreview={setPreviewRouteId}
                  onPin={() => pinRoute(feature.properties.routeId, featureAnchor(feature))}
                />
              ))}
            </div>
            <label
              className={`flex items-center gap-2 border-t border-[var(--bp-color-rule)] px-3 py-2 text-[11.5px] font-semibold ${lanesAvailable ? "cursor-pointer text-[var(--bp-color-ink-70)]" : "text-[var(--bp-color-ink-40)]"}`}
              title={
                lanesAvailable
                  ? undefined
                  : "Current bus-lane geometry is unavailable for this release."
              }
            >
              <input
                type="checkbox"
                checked={lanesVisible}
                disabled={!lanesAvailable}
                onChange={(event) => toggleLanes(event.target.checked)}
                className="m-0 accent-[var(--bp-color-ink)]"
              />
              DOT bus lanes
              <em className="ml-auto text-[10px] font-normal not-italic text-[var(--bp-color-ink-40)]">
                layer
              </em>
            </label>
          </div>
        ) : null}
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
      className="flex gap-1 rounded-[3px] border-0 bg-[var(--bp-color-card)]/95 p-1 shadow-[0_1px_6px_rgba(0,0,0,0.15)]"
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

function RankRow({
  feature,
  rank,
  view,
  corridor,
  pinned,
  onPreview,
  onPin,
}: {
  feature: NetworkMapFeature;
  rank: number;
  view: NetworkView;
  corridor: string | null;
  pinned: boolean;
  onPreview: (routeId: string | null) => void;
  onPin: () => void;
}) {
  const value = featureValue(feature, view);
  const cls = featureClass(feature, view);
  const encoding = viewEncoding(view);
  const barColor =
    cls === null
      ? "var(--bp-color-ink-20)"
      : encoding === "delay"
        ? ["#9aa2ab", "#9a7ec7", "#65369f", "#38106e"][cls]
        : encoding === "delta"
          ? ["#5b2d8f", "#9b7fc4", "#9aa2ab", "#2f8f83"][cls]
          : SPEED_CLASS_COLORS[cls];
  const barShare =
    value === null
      ? 0
      : encoding === "delay"
        ? Math.min(1, value / 140_000)
        : encoding === "delta"
          ? Math.min(1, Math.abs(value) / 3)
          : Math.min(1, value / 18);
  return (
    <div
      role="option"
      aria-selected={pinned}
      tabIndex={0}
      onMouseEnter={() => onPreview(feature.properties.routeId)}
      onMouseLeave={() => onPreview(null)}
      onFocus={() => onPreview(feature.properties.routeId)}
      onBlur={() => onPreview(null)}
      onClick={onPin}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPin();
        }
      }}
      className={`grid cursor-pointer grid-cols-[20px_46px_1fr_46px] items-center gap-2 border-l-2 px-3 py-1.5 ${
        pinned
          ? "border-[var(--bp-color-accent)] bg-[var(--bp-color-accent-bg)]"
          : "border-transparent hover:border-[var(--bp-color-ink)] hover:bg-[var(--bp-color-paper-deep)]"
      }`}
    >
      <span className="text-right font-mono text-[10.5px] text-[var(--bp-color-ink-40)]">
        {rank}
      </span>
      <RoutePill label={feature.properties.label} sbs={feature.properties.sbs ?? false} />
      <span className="min-w-0">
        <span className="block truncate text-[11.5px] text-[var(--bp-color-ink-70)]">
          {corridor ?? feature.properties.borough ?? ""}
        </span>
        <span className="mt-0.5 block h-[3px] overflow-hidden rounded-[2px] bg-[var(--bp-color-ink-06)]">
          <span
            className="block h-full rounded-[2px]"
            style={{ width: `${Math.round(barShare * 100)}%`, backgroundColor: barColor }}
          />
        </span>
      </span>
      <span className="text-right font-mono text-[11.5px] font-semibold tabular-nums">
        {formatViewValue(feature, view)}
      </span>
    </div>
  );
}

function RoutePill({ label, sbs }: { label: string; sbs: boolean }) {
  return (
    <span
      className={`inline-flex h-[19px] min-w-[34px] items-center justify-center whitespace-nowrap rounded-[3px] px-1.5 text-[10.5px] font-bold text-white ${
        sbs ? "bg-[var(--bp-color-accent)]" : "bg-[var(--bp-color-ink)]"
      }`}
    >
      {label}
    </span>
  );
}

function LegendStrip({ legend }: { legend: NonNullable<ReturnType<typeof legendModel>> }) {
  return (
    <div className="absolute bottom-6 left-4 z-10 flex max-w-[min(620px,calc(100%-32px))] items-center gap-2.5 rounded-[3px] bg-[var(--bp-color-card)]/95 px-3 py-2 shadow-[0_1px_6px_rgba(0,0,0,0.15)]">
      <b className="flex-none text-[10.5px] font-bold text-[var(--bp-color-ink-70)]">
        {legend.title}
        {legend.subtitle === "" ? null : (
          <span className="font-normal text-[var(--bp-color-ink-40)]"> — {legend.subtitle}</span>
        )}
      </b>
      <div className="flex h-5 min-w-[280px] flex-1 gap-[2px]">
        {legend.bands.map((band) => (
          <span
            key={band.key}
            style={{ flexGrow: Math.max(band.count, 1), backgroundColor: band.color }}
            className={`inline-flex items-center justify-center overflow-hidden whitespace-nowrap rounded-[2px] px-[7px] text-[9.5px] font-bold ${
              band.darkText ? "text-[var(--bp-color-ink-70)]" : "text-white"
            }`}
          >
            {band.label} ({band.count})
          </span>
        ))}
        {legend.noDataCount > 0 ? (
          <span className="inline-flex flex-none items-center rounded-[2px] border-[1.5px] border-dashed border-[var(--bp-color-ink-20)] px-[7px] text-[9.5px] font-semibold text-[var(--bp-color-ink-55)]">
            no data ({legend.noDataCount})
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Popup stat rows, spelled out with units and windows. The middle slot
 * complements the hero: a delay hero gets the all-day Speed row and any speed
 * hero gets Delay, so no metric appears twice in one card.
 */
export function popupStatRows(
  feature: NetworkMapFeature,
  coverageShort: string | null,
  encoding: NetworkEncoding,
): Array<{ label: string; value: string; sub: string }> {
  const middle =
    encoding === "delay"
      ? {
          label: "Speed",
          value:
            feature.properties.currentMph === null
              ? "No data"
              : feature.properties.currentMph.toFixed(1),
          sub: "mph, all day",
        }
      : {
          label: "Delay",
          value: compactNumber(feature.properties.riderHoursLost),
          sub: coverageShort === null ? "rider-hours" : `rider-hrs, ${coverageShort}`,
        };
  return [
    {
      label: "Riders",
      value: compactNumber(feature.properties.dailyRiders),
      sub: "per day",
    },
    middle,
    {
      label: "Bus lanes",
      value:
        feature.properties.laneCoverage === null
          ? "No data"
          : `${Math.round(feature.properties.laneCoverage)}%`,
      sub: "of route",
    },
  ];
}

/** "March 2026" -> "Mar 2026" for tight popup sublabels. */
export function shortCoverage(coverage: string | null): string | null {
  if (coverage === null) return null;
  const [month, year] = coverage.split(" ");
  return month === undefined || year === undefined ? coverage : `${month.slice(0, 3)} ${year}`;
}

function NetworkMapPopup({
  feature,
  features,
  route,
  studies,
  view,
  coverage,
  onClose,
}: {
  feature: NetworkMapFeature;
  features: readonly NetworkMapFeature[];
  route: StudioRoute | null;
  studies: readonly StudyIndexRow[];
  view: NetworkView;
  coverage: string | null;
  onClose: () => void;
}) {
  const slug = route?.slug ?? null;
  const study = routeStudySummary(studies);
  const encoding = viewEncoding(view);
  const value = featureValue(feature, view);
  const heroValue = formatViewValue(feature, view);
  const term = encoding === "speed" ? speedBandTerm(value) : null;
  const heroUnit =
    encoding === "delay"
      ? "rider-hours of delay"
      : encoding === "delta"
        ? `mph vs all day (${periodLabel(view.period)})`
        : `mph, ${periodLabel(view.period)}${term === null ? "" : ` — ${term}`}`;
  const pct = percentileLine(feature, features, view);
  const window = slowestWindow(feature.properties.hourlySpeedMph);
  return (
    <div className="w-[264px] p-3 font-sans text-[var(--bp-color-ink)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <RoutePill label={feature.properties.label} sbs={feature.properties.sbs ?? false} />
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-semibold leading-tight">
              {feature.properties.borough ?? "Unverified geography"}
            </div>
            <div className="truncate text-[11px] text-[var(--bp-color-ink-55)]">
              {route?.corridor ?? ""}
            </div>
          </div>
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
      <div className="mt-2.5 flex items-baseline gap-2">
        <span className="font-mono text-[22px] font-bold leading-none tabular-nums">
          {heroValue}
        </span>
        <span className="text-[11px] text-[var(--bp-color-ink-55)]">
          {encoding === "delay" && coverage !== null ? `${heroUnit}, ${coverage}` : heroUnit}
        </span>
      </div>
      {pct === null ? null : (
        <div className="mt-1 text-[11px] text-[var(--bp-color-ink-70)]">
          {pct.pre}
          <b>{pct.strong}</b>
          {pct.post}
        </div>
      )}
      <div className="mt-2.5">
        <MapHourStrip
          hourlySpeedMph={feature.properties.hourlySpeedMph}
          emphasisMaxMph={window === null ? null : window.worstMph + 0.4}
        />
        <div className="mt-0.5 flex justify-between font-mono text-[9.5px] text-[var(--bp-color-ink-40)]">
          <span>12A</span>
          <span>6A</span>
          <span>12P</span>
          <span>6P</span>
          <span>11P</span>
        </div>
        {window === null ? null : (
          <div className="mt-1 text-[10px] text-[var(--bp-color-ink-55)]">
            slowest {window.label}, {window.worstMph.toFixed(1)} mph
          </div>
        )}
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2.5">
        {popupStatRows(feature, shortCoverage(coverage), encoding).map((stat) => (
          <div key={stat.label} className="min-w-0 border-t border-[var(--bp-color-rule)] pt-1.5">
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[var(--bp-color-ink-55)]">
              {stat.label}
            </div>
            <div className="mt-0.5 truncate font-mono text-[13px] font-semibold text-[var(--bp-color-ink)]">
              {stat.value}
            </div>
            <div className="truncate text-[9.5px] text-[var(--bp-color-ink-40)]">{stat.sub}</div>
          </div>
        ))}
      </div>
      {slug === null ? null : (
        <div className="mt-2.5 flex items-center gap-4 border-t border-[var(--bp-color-rule)] pt-2.5">
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
