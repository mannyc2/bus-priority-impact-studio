import type { MapBusLaneFeatureCollection } from "@bp/domain/maps";
import { useEffect, useMemo, useState } from "react";
import { FilterChips } from "@/components/FilterChips";
import { HourBars } from "@/components/HourBars";
import { RouteMapLibre } from "@/components/route/RouteMapLibre";
import { averageHourlySpeed } from "@/components/route/route-derived";
import {
  chartHoursFromHourlyProfile,
  hourProfileSource,
  type RouteSpeedHistoryState,
  useRouteHourlyProfile,
  useRouteSegmentsGeo,
  useRouteSpeedHistory,
} from "@/components/route/route-detail-data";
import {
  coverageThroughLabel,
  deltaBarShare,
  directionOptions,
  EXPLORER_COLLAPSED_ROW_COUNT,
  type ExplorerDirection,
  laneReadoutLine,
  latestSlowestWindow,
  rankSegmentsSlowestFirst,
  resolvePinnedSegment,
  visibleSegments,
} from "@/components/route/route-segment-explorer";
import {
  formatMonthLabel,
  type SegmentHistorySeries,
  segmentHistorySeries,
} from "@/components/route/segment-history-data";
import { SectionCard } from "@/components/SectionCard";
import { SourceNote, type SourceNoteEntry } from "@/components/SourceNote";
import { Spark } from "@/components/Spark";
import { fetchMapBusLanes, fetchMapManifest } from "@/studio/api-client";
import type { StudioRouteDetailResponse, StudioSegment } from "@/studio/api-contract";

const SPEED_BAND = (mph: number | null): string =>
  mph === null
    ? "var(--bp-color-ink-40)"
    : mph < 5
      ? "var(--bp-color-bad)"
      : mph < 6.5
        ? "var(--bp-color-warn)"
        : "var(--bp-color-ink)";

type LanesState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; collection: MapBusLaneFeatureCollection }
  | { status: "unavailable" };

/** Published DOT lane geometry, fetched once on first toggle-on. */
function useBusLanes(enabled: boolean): LanesState {
  const [state, setState] = useState<LanesState>({ status: "idle" });

  useEffect(() => {
    if (!enabled || state.status !== "idle") return;
    const controller = new AbortController();
    setState({ status: "loading" });
    fetchMapManifest({ signal: controller.signal })
      .then((manifest) =>
        manifest === null ? null : fetchMapBusLanes(manifest, { signal: controller.signal }),
      )
      .then((load) => {
        if (controller.signal.aborted) return;
        setState(
          load !== null && load.status === "ready"
            ? { status: "ready", collection: load.data }
            : { status: "unavailable" },
        );
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState({ status: "unavailable" });
      });
    return () => controller.abort();
  }, [enabled, state.status]);

  return state;
}

export function SegmentExplorerSection({
  data,
  pinnedSpineId,
  onPinChange,
  mapOnly = false,
}: {
  data: StudioRouteDetailResponse;
  /** Stable spine id from `?segment=`; null when nothing is pinned. */
  pinnedSpineId: string | null;
  onPinChange: (spineId: string | null) => void;
  mapOnly?: boolean;
}) {
  const { route, segments } = data;
  const [direction, setDirection] = useState<ExplorerDirection>("all");
  const [showAll, setShowAll] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  // Segments without a stable spine id pin locally only (no shareable URL).
  const [localPinId, setLocalPinId] = useState<string | null>(null);
  const [showLanes, setShowLanes] = useState(false);

  const speedHistory = useRouteSpeedHistory(route.slug);
  const hourlyProfile = useRouteHourlyProfile(route.slug);
  const geo = useRouteSegmentsGeo(route.routeId);
  const lanes = useBusLanes(showLanes);

  const historySeries = useMemo(
    () => segmentHistorySeries(speedHistory.data, segments),
    [speedHistory.data, segments],
  );

  const urlPinned = resolvePinnedSegment(segments, pinnedSpineId);
  const pinned = urlPinned ?? segments.find((segment) => segment.id === localPinId) ?? null;
  const hovered =
    hoverId === null ? null : (segments.find((segment) => segment.id === hoverId) ?? null);

  const directions = useMemo(() => directionOptions(segments), [segments]);
  const ranked = useMemo(
    () => rankSegmentsSlowestFirst(segments, direction),
    [segments, direction],
  );
  const { rows, expanded } = visibleSegments(ranked, showAll, pinned?.id ?? null);

  // Any route has some lane-proximate segment iff DOT geometry can be near it;
  // 34/350 routes have none — those never see the toggle (comp r3/D12).
  const hasLaneEvidence = route.laneCoverage > 0 || segments.some((s) => s.lane !== "none");

  const pin = (segment: StudioSegment | null) => {
    if (segment === null) {
      setLocalPinId(null);
      onPinChange(null);
      return;
    }
    if (segment.spineSegmentId !== null) {
      setLocalPinId(null);
      onPinChange(segment.spineSegmentId);
    } else {
      setLocalPinId(segment.id);
      onPinChange(null);
    }
  };
  const togglePin = (segment: StudioSegment) => {
    if (pinned?.id === segment.id) pin(null);
    else pin(segment);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && (pinnedSpineId !== null || localPinId !== null)) pin(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onDirectionChange = (next: ExplorerDirection) => {
    // An explicit direction change clears an out-of-direction pin (plan 081
    // step 1); it never snaps the control back.
    if (pinned !== null && next !== "all" && pinned.direction !== next) pin(null);
    setDirection(next);
    setShowAll(false);
  };

  const coverage = coverageThroughLabel(speedHistory.data, hourlyProfile.data);
  const aboutEntries: SourceNoteEntry[] = [
    { label: `${segments.length} timepoint ${segments.length === 1 ? "segment" : "segments"}` },
    ...(speedHistory.status === "ready"
      ? [
          {
            label: `${speedHistory.data.dimensions.months.length} months of segment speed history`,
          },
        ]
      : []),
    {
      label: "Rider-hrs/wkdy = observed-vs-scheduled delay exposure in the current projection.",
      detail: "It colors nothing and controls no rank.",
    },
    ...(showLanes
      ? [
          {
            label: "Painted bus lanes are NYC DOT published centerline geometry.",
            detail: "Street inventory, not proof a segment is treated.",
          },
        ]
      : []),
  ];

  const mapBlock =
    geo.status === "loading" ? (
      <div
        className="animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)] motion-reduce:animate-none"
        style={{ height: 460 }}
        aria-hidden
      />
    ) : geo.status === "ready" ? (
      <RouteMapLibre
        collection={geo.collection}
        context={geo.context}
        route={route}
        segments={segments}
        hoveredSegmentId={hoverId}
        setHoveredSegmentId={setHoverId}
        pinnedSegmentId={pinned?.id ?? null}
        onSegmentSelect={(segmentId) => {
          const segment = segments.find((candidate) => candidate.id === segmentId);
          if (segment !== undefined) togglePin(segment);
        }}
        activeDirection={direction}
        showLanes={showLanes && lanes.status === "ready"}
        busLanes={lanes.status === "ready" ? lanes.collection : null}
      />
    ) : (
      <p className="m-0 px-4 py-6 text-center text-[12.5px] text-[var(--bp-color-ink-55)]">
        Street geometry for this route is not published yet; the segment list below carries the same
        evidence.
      </p>
    );

  return (
    <div className="flex flex-col gap-5">
      <SectionCard
        title="Slowest segments"
        sub={`Ranked slowest first — current all-day${coverage === null ? "" : `, ${coverage}`}`}
        right={
          <div className="flex flex-wrap items-center gap-3">
            <FilterChips
              ariaLabel="Direction"
              value={direction}
              onChange={onDirectionChange}
              options={directions.map((value) => ({
                id: value,
                label: value === "all" ? "All" : value,
              }))}
            />
            {hasLaneEvidence ? (
              <label className="flex cursor-pointer items-center gap-2 rounded-[3px] px-2.5 py-2 text-[12px] font-semibold shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
                <input
                  type="checkbox"
                  checked={showLanes}
                  onChange={(event) => setShowLanes(event.currentTarget.checked)}
                  className="size-3.5 accent-[var(--bp-color-ink)]"
                />
                <span>Painted bus lanes (DOT)</span>
              </label>
            ) : null}
            <SourceNote label="About this data" entries={aboutEntries} />
          </div>
        }
      >
        <div className="grid grid-cols-[minmax(0,1.55fr)_minmax(300px,0.8fr)] items-stretch gap-4 max-xl:grid-cols-1">
          <div className="min-w-0 overflow-hidden rounded-[3px] bg-[var(--bp-color-paper-deep)] shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
            {mapBlock}
            {showLanes && lanes.status === "unavailable" ? (
              <p className="m-0 px-3 py-2 text-[11px] text-[var(--bp-color-ink-55)]">
                Published DOT lane geometry is unavailable right now.
              </p>
            ) : null}
          </div>
          <SegmentReadout
            route={route}
            segments={segments}
            pinned={pinned}
            pinnedIsShareable={urlPinned !== null}
            hovered={hovered}
            historySeries={historySeries}
            historyStatus={speedHistory.status}
            onClear={() => pin(null)}
          />
        </div>

        {mapOnly ? null : (
          <>
            <SegmentTable
              rows={rows}
              pinnedId={pinned?.id ?? null}
              onHover={setHoverId}
              onTogglePin={togglePin}
            />
            {ranked.length > EXPLORER_COLLAPSED_ROW_COUNT ? (
              <button
                type="button"
                onClick={() => setShowAll((value) => !value)}
                className="mt-1 w-full rounded-[3px] px-3 py-2.5 text-[12px] font-semibold text-[var(--bp-color-ink-55)] shadow-[inset_0_0_0_1px_var(--bp-color-rule)] transition-colors hover:text-[var(--bp-color-ink)]"
              >
                {expanded ? "Show fewer segments" : `Show all ${ranked.length} segments`}
              </button>
            ) : null}
          </>
        )}
      </SectionCard>

      {mapOnly ? null : <SpeedByHourCard data={data} />}
    </div>
  );
}

function SegmentReadout({
  route,
  segments,
  pinned,
  pinnedIsShareable,
  hovered,
  historySeries,
  historyStatus,
  onClear,
}: {
  route: StudioRouteDetailResponse["route"];
  segments: readonly StudioSegment[];
  pinned: StudioSegment | null;
  pinnedIsShareable: boolean;
  hovered: StudioSegment | null;
  historySeries: ReturnType<typeof segmentHistorySeries>;
  historyStatus: RouteSpeedHistoryState["status"];
  onClear: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const active = hovered ?? pinned;
  const isPinned = active !== null && active.id === pinned?.id && hovered === null;
  const totalRiderHours = segments.reduce((sum, segment) => sum + segment.riderHours, 0);

  // Fixed slots (comp D10): identical anatomy for overview / preview / pinned.
  const title =
    active === null ? (
      route.label
    ) : (
      <>
        {active.from} <span className="text-[var(--bp-color-ink-40)]">→</span> {active.to}{" "}
        <span className="rounded-[2px] bg-[var(--bp-color-ink-06)] px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-[var(--bp-color-ink-55)]">
          {active.direction}
        </span>
      </>
    );
  const sub = isPinned
    ? "Pinned — Esc or Clear selection to release."
    : active !== null
      ? "Previewing — click to pin."
      : "Pin a segment for its month-by-month speed history.";
  const contextLine =
    active === null
      ? `${segments.length} timepoint segments, all directions`
      : laneReadoutLine(active.lane);

  const mph = active === null ? route.weightedAvgSpeed : active.speedMph;
  const sched = active === null ? route.scheduledMph : active.scheduledMph;
  const delta = sched === null ? null : mph - sched;
  const riderHours = active === null ? route.riderHoursLost : active.riderHours;
  const riderHoursSub =
    active === null
      ? "route total"
      : active.riderHours === 0
        ? "beats its schedule"
        : totalRiderHours > 0
          ? `${Math.round((active.riderHours / totalRiderHours) * 100)}% of route burden`
          : "per weekday";

  const hours = active?.hours ?? averageHourlySeverityAcross(segments);
  const series = active === null ? null : (historySeries.series.get(active.id) ?? null);

  return (
    <aside className="flex min-w-0 flex-col rounded-[3px] bg-[var(--bp-color-paper-deep)] p-4 shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
      <div className="min-h-[38px] text-[14px] font-semibold leading-snug">{title}</div>
      <div className="mt-0.5 min-h-[17px] text-[11.5px] text-[var(--bp-color-ink-55)]">{sub}</div>

      <div className="mt-3.5 grid grid-cols-3 gap-2.5 border-t border-[var(--bp-color-rule)] pt-3">
        <ReadoutStat
          label="Speed"
          value={mph.toFixed(1)}
          valueColor={SPEED_BAND(mph)}
          sub="mph, all-day"
        />
        <ReadoutStat
          label="vs sched"
          value={delta === null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`}
          sub={sched === null ? "no schedule" : `sched ${sched.toFixed(1)}`}
        />
        <ReadoutStat
          label="Rider-hrs"
          value={riderHours === null ? "—" : formatRiderHoursCompact(riderHours)}
          sub={riderHoursSub}
        />
      </div>

      <div className="mt-2 min-h-[17px] text-[11px] text-[var(--bp-color-ink-55)]">
        {contextLine}
      </div>

      <div className="mt-3 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-40)]">
        Severity by hour
      </div>
      <div className="mt-1.5 flex h-[28px] items-end gap-px" title="Taller = slower vs schedule">
        {hours.map((value, hour) => (
          <i
            key={hour}
            className="min-h-[2px] flex-1 rounded-t-[1px]"
            style={{
              height: `${Math.max(6, value * 100)}%`,
              background:
                value > 0.66
                  ? "var(--bp-color-bad)"
                  : value > 0.4
                    ? "var(--bp-color-warn)"
                    : "var(--bp-color-ink-20)",
            }}
          />
        ))}
      </div>
      <div className="mt-0.5 flex justify-between font-mono text-[9.5px] text-[var(--bp-color-ink-40)]">
        <span>12A</span>
        <span>12P</span>
        <span>11P</span>
      </div>

      <div className="mt-3 min-h-[56px]">
        <SegmentSparkline segment={active} series={series} historyStatus={historyStatus} />
      </div>

      <div className="mt-auto flex min-h-[44px] items-center gap-2 pt-3">
        {isPinned && pinned !== null ? (
          <>
            <button
              type="button"
              disabled={!pinnedIsShareable}
              title={
                pinnedIsShareable
                  ? "Copy a shareable link to this segment"
                  : "No stable link for this segment"
              }
              onClick={() => {
                navigator.clipboard?.writeText(window.location.href).catch(() => {});
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1200);
              }}
              className="rounded-[3px] bg-[var(--bp-color-ink)] px-2.5 py-1.5 text-[11.5px] font-semibold text-white disabled:bg-[var(--bp-color-ink-06)] disabled:text-[var(--bp-color-ink-40)]"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
            <button
              type="button"
              onClick={onClear}
              className="rounded-[3px] px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--bp-color-ink-55)] shadow-[inset_0_0_0_1px_var(--bp-color-rule)]"
            >
              Clear ✕
            </button>
          </>
        ) : null}
      </div>
    </aside>
  );
}

function ReadoutStat({
  label,
  value,
  valueColor,
  sub,
}: {
  label: string;
  value: string;
  valueColor?: string;
  sub: string;
}) {
  return (
    <div>
      <div className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-40)]">
        {label}
      </div>
      <div
        className="mt-0.5 font-mono text-[19px] font-semibold leading-tight tabular-nums"
        style={valueColor === undefined ? {} : { color: valueColor }}
      >
        {value}
      </div>
      <div className="mt-0.5 min-h-[15px] text-[10px] leading-tight text-[var(--bp-color-ink-55)]">
        {sub}
      </div>
    </div>
  );
}

function averageHourlySeverityAcross(segments: readonly StudioSegment[]): number[] {
  if (segments.length === 0) return Array.from({ length: 24 }, () => 0);
  return Array.from(
    { length: 24 },
    (_, hour) =>
      segments.reduce((sum, segment) => sum + (segment.hours[hour] ?? 0), 0) / segments.length,
  );
}

function SegmentSparkline({
  segment,
  series,
  historyStatus,
}: {
  segment: StudioSegment | null;
  series: SegmentHistorySeries | null;
  historyStatus: RouteSpeedHistoryState["status"];
}) {
  if (segment === null) return null;
  if (historyStatus === "loading") {
    return (
      <div
        className="h-[36px] w-[220px] animate-pulse rounded-[2px] bg-[var(--bp-color-ink-06)] motion-reduce:animate-none"
        aria-hidden
      />
    );
  }
  const points = series?.speeds.filter((speed): speed is number => speed !== null) ?? [];
  if (series === null || points.length < 2) {
    return (
      <p className="m-0 text-[11px] text-[var(--bp-color-ink-55)]">
        No month history for this segment.
      </p>
    );
  }
  const first = series.months[0];
  const last = series.months.at(-1);
  return (
    <div>
      <div className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-40)]">
        Speed history
      </div>
      <div className="mt-1 flex items-center gap-3">
        <Spark data={points} width={200} height={32} fill />
        {first !== undefined && last !== undefined ? (
          <span className="font-mono text-[10px] text-[var(--bp-color-ink-55)]">
            {formatMonthLabel(first)} – {formatMonthLabel(last)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function SegmentTable({
  rows,
  pinnedId,
  onHover,
  onTogglePin,
}: {
  rows: readonly StudioSegment[];
  pinnedId: string | null;
  onHover: (segmentId: string | null) => void;
  onTogglePin: (segment: StudioSegment) => void;
}) {
  return (
    <div className="mt-4">
      <div className="grid grid-cols-[26px_40px_minmax(0,1fr)_64px_120px_110px] items-center gap-3 px-2 pb-2 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)] shadow-[inset_0_-1px_0_var(--bp-color-rule)] max-md:hidden">
        <span />
        <span />
        <span className="font-sans">Segment</span>
        <span className="text-right">MPH</span>
        <span>vs sched</span>
        <span className="text-right">Rider-hrs/wkdy</span>
      </div>
      {rows.map((segment, index) => {
        const delta =
          segment.scheduledMph === null ? null : segment.speedMph - segment.scheduledMph;
        const pinnedRow = segment.id === pinnedId;
        return (
          <button
            key={segment.id}
            type="button"
            onMouseEnter={() => onHover(segment.id)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(segment.id)}
            onBlur={() => onHover(null)}
            onClick={() => onTogglePin(segment)}
            className={`grid w-full grid-cols-[26px_40px_minmax(0,1fr)_64px_120px_110px] items-center gap-3 px-2 py-3 text-left transition-colors hover:bg-[var(--bp-color-ink-06)] max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-3 max-md:gap-y-1 ${
              pinnedRow
                ? "bg-[var(--bp-color-accent-bg)] shadow-[inset_2px_0_0_var(--bp-color-accent)]"
                : "shadow-[inset_0_-1px_0_var(--bp-color-ink-06)]"
            }`}
          >
            <span className="font-mono text-[10.5px] text-[var(--bp-color-ink-40)] max-md:hidden">
              {index + 1}
            </span>
            <span className="max-md:hidden">
              <span className="rounded-[2px] bg-[var(--bp-color-ink-06)] px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-[var(--bp-color-ink-55)]">
                {segment.direction}
              </span>
            </span>
            <span className="min-w-0 truncate text-[13px] font-medium">
              {segment.from} <span className="text-[var(--bp-color-ink-40)]">→</span> {segment.to}
              <span className="ml-2 hidden rounded-[2px] bg-[var(--bp-color-ink-06)] px-1 py-0.5 font-mono text-[9px] font-bold text-[var(--bp-color-ink-55)] max-md:inline">
                {segment.direction}
              </span>
            </span>
            <span
              className="text-right font-mono text-[13.5px] font-bold tabular-nums"
              style={{ color: SPEED_BAND(segment.speedMph) }}
            >
              {segment.speedMph.toFixed(1)}
            </span>
            <span className="flex items-center gap-2 max-md:hidden">
              <span className="relative h-[5px] w-[64px] overflow-hidden rounded-[2px] bg-[var(--bp-color-ink-06)]">
                <i className="absolute bottom-0 left-1/2 top-0 w-px bg-[var(--bp-color-ink-20)]" />
                {delta !== null ? (
                  <i
                    className="absolute bottom-0 top-0"
                    style={
                      delta < 0
                        ? {
                            right: "50%",
                            width: `${deltaBarShare(delta) * 30}px`,
                            background: "var(--bp-color-bad)",
                          }
                        : {
                            left: "50%",
                            width: `${deltaBarShare(delta) * 30}px`,
                            background: "var(--bp-color-ink-20)",
                          }
                    }
                  />
                ) : null}
              </span>
              <span className="w-[34px] font-mono text-[10.5px] tabular-nums text-[var(--bp-color-ink-55)]">
                {delta === null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`}
              </span>
            </span>
            <span
              className={`text-right font-mono text-[12.5px] tabular-nums ${
                segment.riderHours === 0
                  ? "font-normal text-[var(--bp-color-ink-40)]"
                  : "font-semibold"
              }`}
            >
              {segment.riderHours === 0 ? "0" : formatRiderHoursCompact(segment.riderHours)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function formatRiderHoursCompact(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(Math.round(value));
}

function SpeedByHourCard({ data }: { data: StudioRouteDetailResponse }) {
  const { route, segments } = data;
  const hourlyProfile = useRouteHourlyProfile(route.slug);
  const segmentHourProfile = averageHourlySpeed(route, segments);
  const hourProfile = useMemo(
    () => chartHoursFromHourlyProfile(hourlyProfile.data, segmentHourProfile),
    [hourlyProfile.data, segmentHourProfile],
  );
  const slowestWindow = latestSlowestWindow(hourlyProfile.data);

  return (
    <SectionCard title="Speed by hour" sub={hourProfileSource(hourlyProfile)}>
      {hourProfile === null ? (
        <div className="flex h-[164px] items-center justify-center rounded-[3px] bg-[var(--bp-color-paper-deep)] px-4 text-center text-[12.5px] text-[var(--bp-color-ink-55)]">
          Route hourly profile is not attached yet.
        </div>
      ) : (
        <HourBars
          data={hourProfile}
          {...(route.scheduledMph === null ? {} : { sched: route.scheduledMph })}
          {...(slowestWindow === null ? {} : { marker: slowestWindow })}
          height={164}
          min={Math.max(0, Math.floor(Math.min(...hourProfile) - 1))}
          max={Math.ceil(
            Math.max(...(route.scheduledMph === null ? [] : [route.scheduledMph]), ...hourProfile) +
              1,
          )}
          legend
        />
      )}
    </SectionCard>
  );
}
