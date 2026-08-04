import type { MapRouteSegmentFeature, MapRouteSegmentFeatureCollection } from "@bp/domain/maps";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Search } from "lucide-react";
import { memo, type RefObject, useEffect, useId, useRef } from "react";
import {
  featureClass,
  featureValue,
  formatViewValue,
  type NetworkEncoding,
  type NetworkView,
  periodLabel,
  SPEED_CLASS_COLORS,
  viewEncoding,
} from "@/components/route/network-map-model";
import { Button, buttonVariants } from "@/components/ui/button";
import type { NetworkMapFeature, SelectedRouteMapEvidence } from "@/studio/api-client";
import type { StudioRoute } from "@/studio/api-contract";

export type SelectedEvidenceState =
  | { status: "loading" }
  | { status: "ready"; evidence: SelectedRouteMapEvidence }
  | { status: "unavailable"; message: string };

type RouteExplorerSearch = { tab: "segments" } | { tab: "segments"; segment: string };

/**
 * Preserve a network selection only when current route evidence proves it is
 * one unique stable-spine match. Pending, unavailable, unmatched, and
 * ambiguous selections open the route explorer without a durable pin.
 */
export function routeExplorerSearchForSelection(
  selectedSegmentId: string | undefined,
  collection: MapRouteSegmentFeatureCollection | null,
): RouteExplorerSearch {
  if (selectedSegmentId === undefined || collection === null) return { tab: "segments" };

  let matches = 0;
  for (const feature of collection.features) {
    if (
      feature.properties.spineJoinStatus === "matched" &&
      feature.properties.spineSegmentId === selectedSegmentId
    ) {
      matches += 1;
      if (matches > 1) return { tab: "segments" };
    }
  }

  return matches === 1 ? { tab: "segments", segment: selectedSegmentId } : { tab: "segments" };
}

export function slowestCurrentSegments(
  collection: MapRouteSegmentFeatureCollection,
  count = 3,
): Array<{ feature: MapRouteSegmentFeature; durableSpineId: string | null }> {
  const spineCounts = new Map<string, number>();
  for (const feature of collection.features) {
    const spineId = feature.properties.spineSegmentId;
    if (feature.properties.spineJoinStatus === "matched" && spineId !== null) {
      spineCounts.set(spineId, (spineCounts.get(spineId) ?? 0) + 1);
    }
  }
  return collection.features
    .filter((feature) => feature.properties.hourOfDay === null)
    .sort((left, right) => {
      const leftSpeed = left.properties.averageSpeedMph;
      const rightSpeed = right.properties.averageSpeedMph;
      if (leftSpeed === null && rightSpeed === null) return left.id.localeCompare(right.id);
      if (leftSpeed === null) return 1;
      if (rightSpeed === null) return -1;
      return leftSpeed - rightSpeed || left.id.localeCompare(right.id);
    })
    .slice(0, count)
    .map((feature) => {
      const spineId = feature.properties.spineSegmentId;
      return {
        feature,
        durableSpineId:
          spineId !== null &&
          feature.properties.spineJoinStatus === "matched" &&
          spineCounts.get(spineId) === 1
            ? spineId
            : null,
      };
    });
}

function RoutePill({ label, sbs }: { label: string; sbs: boolean }) {
  return (
    <span
      className={`inline-flex h-[22px] min-w-[38px] items-center justify-center whitespace-nowrap rounded-[3px] px-1.5 text-[11px] font-bold text-white ${
        sbs ? "bg-[var(--bp-color-accent)]" : "bg-[var(--bp-color-ink)]"
      }`}
    >
      {label}
    </span>
  );
}

function routeValueUnit(view: NetworkView): string {
  const encoding: NetworkEncoding = viewEncoding(view);
  if (encoding === "delay") return "rider-hours of route-slice delay exposure";
  if (encoding === "delta") return `mph vs all day, ${periodLabel(view.period)}`;
  return `mph, ${periodLabel(view.period)}`;
}

/**
 * Memoised: previewing a row used to re-render all ~350 of them, because a
 * pointer moving down the list writes React state on every row it crosses.
 */
const RankedRouteRow = memo(function RankedRouteRow({
  feature,
  rank,
  view,
  route,
  pinned,
  onPointerPreview,
  onFocusPreview,
  onPin,
}: {
  feature: NetworkMapFeature;
  rank: number;
  view: NetworkView;
  route: StudioRoute | null;
  pinned: boolean;
  onPointerPreview: (routeId: string | null) => void;
  onFocusPreview: (routeId: string | null) => void;
  onPin: (interaction: "keyboard" | "pointer") => void;
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
  const served =
    feature.properties.servedBoroughs.length === 0
      ? "served boroughs unverified"
      : feature.properties.servedBoroughs.join(", ");
  return (
    <div
      role="option"
      aria-selected={pinned}
      tabIndex={0}
      onPointerEnter={() => onPointerPreview(feature.properties.routeId)}
      onPointerLeave={() => onPointerPreview(null)}
      onFocus={() => onFocusPreview(feature.properties.routeId)}
      onBlur={() => onFocusPreview(null)}
      onClick={() => onPin("pointer")}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPin("keyboard");
        }
      }}
      className={`grid min-h-11 cursor-pointer grid-cols-[24px_48px_1fr_56px] items-center gap-2 border-l-2 px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--bp-color-accent)] ${
        pinned
          ? "border-[var(--bp-color-accent)] bg-[var(--bp-color-accent-bg)]"
          : "border-transparent hover:border-[var(--bp-color-ink)] hover:bg-[var(--bp-color-paper-deep)]"
      }`}
    >
      <span className="text-right font-mono text-[10.5px] text-[var(--bp-color-ink-55)]">
        {rank}
      </span>
      <RoutePill label={feature.properties.label} sbs={feature.properties.sbs ?? false} />
      <span className="min-w-0">
        <span className="block truncate text-[11.5px] font-medium text-[var(--bp-color-ink-70)]">
          {route?.corridor ?? "Corridor unavailable"}
        </span>
        <span className="block truncate text-[10.5px] text-[var(--bp-color-ink-55)]">
          Serving {served}. {routeValueUnit(view)}
        </span>
        <span className="mt-1 block h-[3px] overflow-hidden rounded-[2px] bg-[var(--bp-color-ink-06)]">
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
});

export function NetworkMapBrowse({
  ranked,
  routeById,
  view,
  query,
  pinnedRouteId,
  listId,
  searchRef,
  onQueryChange,
  onPointerPreview,
  onFocusPreview,
  onPin,
}: {
  ranked: readonly NetworkMapFeature[];
  routeById: ReadonlyMap<string, StudioRoute>;
  view: NetworkView;
  query: string;
  pinnedRouteId: string | null;
  listId?: string;
  searchRef?: RefObject<HTMLInputElement | null>;
  onQueryChange: (query: string) => void;
  onPointerPreview: (routeId: string | null) => void;
  onFocusPreview: (routeId: string | null) => void;
  onPin: (feature: NetworkMapFeature, interaction: "keyboard" | "pointer") => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative mx-3 mb-2">
        <Search
          size={13}
          strokeWidth={2.5}
          aria-hidden
          className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50"
        />
        <input
          ref={searchRef}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="B41, M15, Q58, corridor"
          aria-label="Find a route"
          className="h-9 w-full rounded-[3px] border border-[var(--bp-color-rule)] bg-[var(--bp-color-paper)] pl-8 pr-2.5 text-[12.5px] text-[var(--bp-color-ink)] outline-none placeholder:text-[var(--bp-color-ink-40)] focus:border-[var(--bp-color-accent)] focus:ring-2 focus:ring-[var(--bp-color-accent-bg)]"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-[var(--bp-color-ink-06)]">
        <div id={listId} role="listbox" aria-label="Ranked routes">
          {ranked.length === 0 ? (
            <p className="m-0 px-4 py-6 text-[12px] text-[var(--bp-color-ink-55)]">
              No routes match this search and served-borough filter.
            </p>
          ) : (
            ranked.map((feature, index) => (
              <RankedRouteRow
                key={feature.properties.routeId}
                feature={feature}
                rank={index + 1}
                route={routeById.get(feature.properties.routeId) ?? null}
                view={view}
                pinned={pinnedRouteId === feature.properties.routeId}
                onPointerPreview={onPointerPreview}
                onFocusPreview={onFocusPreview}
                onPin={(interaction) => onPin(feature, interaction)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function segmentLoadMessage(evidence: SelectedRouteMapEvidence): string | null {
  const { segments } = evidence;
  if (segments.status === "ready") return null;
  if (segments.status === "unavailable") return segments.reason;
  if (segments.status === "integrity_mismatch")
    return "Segment geometry failed SHA-256 integrity verification.";
  if (segments.status === "invalid_contract") return "Segment geometry failed its data contract.";
  if (segments.status === "request_failed") return "Segment geometry could not be loaded.";
  return "Segment geometry is not published for this route.";
}

export function NetworkMapSelected({
  feature,
  route,
  view,
  rank,
  routeCount,
  releaseCoverage,
  delayCoverage,
  evidence,
  selectedSegmentId,
  segmentNotice,
  onSelectSegment,
  onClear,
  onBack,
  autoFocus = false,
}: {
  feature: NetworkMapFeature;
  route: StudioRoute | null;
  view: NetworkView;
  rank: number | null;
  routeCount: number;
  releaseCoverage: string | null;
  delayCoverage: string | null;
  evidence: SelectedEvidenceState;
  selectedSegmentId: string | undefined;
  segmentNotice: string | null;
  onSelectSegment: (segmentId: string | undefined) => void;
  onClear: () => void;
  onBack: () => void;
  autoFocus?: boolean;
}) {
  const instanceId = useId();
  const summaryId = `${instanceId}-route-summary`;
  const segmentContextId = `${instanceId}-segment-context`;
  const focusRef = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    if (autoFocus) focusRef.current?.focus();
  }, [autoFocus, feature.properties.routeId]);
  const segmentRows =
    evidence.status === "ready" && evidence.evidence.segments.status === "ready"
      ? slowestCurrentSegments(evidence.evidence.segments.data)
      : [];
  const routeExplorerSearch = routeExplorerSearchForSelection(
    selectedSegmentId,
    evidence.status === "ready" && evidence.evidence.segments.status === "ready"
      ? evidence.evidence.segments.data
      : null,
  );
  const routeDetailMessage =
    evidence.status === "ready" && evidence.evidence.routeDetail.status !== "ready"
      ? evidence.evidence.routeDetail.reason
      : null;
  const segmentsMessage =
    evidence.status === "loading"
      ? "Loading exact route detail and segment evidence…"
      : evidence.status === "unavailable"
        ? evidence.message
        : segmentLoadMessage(evidence.evidence);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start gap-2 border-b border-[var(--bp-color-rule)] px-4 pb-3">
        <RoutePill label={feature.properties.label} sbs={feature.properties.sbs ?? false} />
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-[13px] font-semibold text-[var(--bp-color-ink)]">
            {route?.corridor ?? "Route corridor unavailable"}
          </p>
          <p className="m-0 mt-0.5 text-[11px] text-[var(--bp-color-ink-55)]">
            {feature.properties.servedBoroughs.length === 0
              ? "Served boroughs unverified"
              : feature.properties.servedBoroughs.join(", ")}
          </p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 p-4">
          <section aria-labelledby={summaryId}>
            <p
              ref={focusRef}
              id={summaryId}
              tabIndex={-1}
              className="m-0 font-mono text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--bp-color-ink-55)]"
            >
              Selected route
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <strong className="font-mono text-[24px] tabular-nums">
                {formatViewValue(feature, view)}
              </strong>
              <span className="text-[11px] text-[var(--bp-color-ink-55)]">
                {routeValueUnit(view)}
              </span>
            </div>
            <p className="m-0 mt-1 text-[11px] text-[var(--bp-color-ink-70)]">
              {rank === null
                ? "Not ranked for this view."
                : `Rank ${rank} of ${routeCount} visible routes.`}
              {delayCoverage === null ? "" : ` Delay facts cover through ${delayCoverage}.`}
            </p>
          </section>

          <section aria-labelledby={segmentContextId}>
            <h3 id={segmentContextId} className="m-0 text-[12px] font-semibold">
              Current all-day segment context
              {releaseCoverage === null ? "" : ` — ${releaseCoverage}`}
            </h3>
            <p className="m-0 mt-1 text-[10.5px] leading-normal text-[var(--bp-color-ink-55)]">
              Ranked only by published all-day segment speed. Aligned segment rider-hour delay is
              not published, so no segment delay value is inferred from the route-level metric.
            </p>
            {routeDetailMessage === null ? null : (
              <p className="m-0 mt-2 text-[11px] text-[var(--bp-color-ink-55)]">
                Route detail unavailable: {routeDetailMessage}
              </p>
            )}
            {segmentsMessage === null ? null : (
              <p className="m-0 mt-2 text-[11px] text-[var(--bp-color-ink-55)]" role="status">
                {segmentsMessage}
              </p>
            )}
            {segmentNotice === null ? null : (
              <p className="m-0 mt-2 text-[11px] text-[var(--bp-color-ink-55)]" role="status">
                {segmentNotice}
              </p>
            )}
            {segmentRows.length === 0 ? null : (
              <ol className="m-0 mt-2 list-none space-y-1 p-0">
                {segmentRows.map(({ feature: segment, durableSpineId }, index) => {
                  const selected = durableSpineId !== null && durableSpineId === selectedSegmentId;
                  return (
                    <li key={segment.id}>
                      <button
                        type="button"
                        disabled={durableSpineId === null}
                        aria-pressed={selected}
                        onClick={() =>
                          onSelectSegment(selected ? undefined : (durableSpineId ?? undefined))
                        }
                        className={`w-full rounded-[3px] border px-2.5 py-2 text-left text-[11px] ${
                          selected
                            ? "border-[var(--bp-color-accent)] bg-[var(--bp-color-accent-bg)]"
                            : "border-[var(--bp-color-rule)] bg-transparent"
                        } disabled:cursor-not-allowed disabled:opacity-65`}
                      >
                        <span className="block font-semibold text-[var(--bp-color-ink)]">
                          {index + 1}. {segment.properties.startStopName ?? "Unknown start"} →{" "}
                          {segment.properties.endStopName ?? "Unknown end"}
                        </span>
                        <span className="mt-0.5 block text-[var(--bp-color-ink-55)]">
                          {segment.properties.averageSpeedMph === null
                            ? "Speed unavailable"
                            : `${segment.properties.averageSpeedMph.toFixed(1)} mph`}
                          {durableSpineId === null ? ". Stable selection unavailable" : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--bp-color-rule)] p-3">
        <Button type="button" size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft data-icon="inline-start" aria-hidden />
          Browse routes
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClear}>
          Clear pin
        </Button>
        {route === null ? null : (
          <Link
            to="/routes/$routeId"
            params={{ routeId: route.slug }}
            search={routeExplorerSearch}
            className={buttonVariants({ size: "sm", variant: "primary", className: "ml-auto" })}
          >
            Open route
          </Link>
        )}
      </div>
    </div>
  );
}
