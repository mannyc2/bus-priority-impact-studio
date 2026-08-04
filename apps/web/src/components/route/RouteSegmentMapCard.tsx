import type { MapBusLaneFeatureCollection, MapManifestResponse } from "@bp/domain/maps";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { CorridorMap } from "@/components/CorridorMap";
import { FilterChips } from "@/components/FilterChips";
import { BUS_LANE_COLOR } from "@/components/route/network-map-model";
import { RouteMapLibre, type RouteMapPopupState } from "@/components/route/RouteMapLibre";
import {
  busLaneChangeAnchor,
  routeChangeChronology,
} from "@/components/route/route-change-chronology";
import { dossierSpeedPoints } from "@/components/route/route-derived";
import { useRouteSegmentsGeo } from "@/components/route/route-detail-data";
import { routeMapPopupModel, routeSegmentAnchor } from "@/components/route/route-map-popup";
import {
  canonicalizeRouteDetailSearch,
  directionOptions,
  type ExplorerDirection,
  type RouteDetailSearch,
  rankSegmentsSlowestFirst,
  resolvePinnedSegment,
  routeDetailSearchEquals,
} from "@/components/route/route-segment-explorer";
import { useRouteFactEvidence } from "@/components/route/use-route-fact-evidence";
import { SectionCard } from "@/components/SectionCard";
import { Button } from "@/components/ui/button";
import { currentMapBusLaneArtifact, fetchMapBusLanes, fetchMapManifest } from "@/studio/api-client";
import type {
  RouteStudiesArtifact,
  StudioRouteDetailResponse,
  StudioRouteEvidenceBundle,
  StudioRouteInterventionInventoryBundle,
  StudioSegment,
} from "@/studio/api-contract";

const CURRENT_PERIOD_LABEL = "current all day";

type LanesState =
  | { eligibility: "pending"; status: "idle"; reason: null; collection: null }
  | { eligibility: "ready"; status: "idle" | "loading"; reason: null; collection: null }
  | {
      eligibility: "ready";
      status: "ready";
      reason: null;
      collection: MapBusLaneFeatureCollection;
    }
  | { eligibility: "unavailable"; status: "unavailable"; reason: string; collection: null };

/** Check the manifest immediately, then fetch the verified DOT geometry only
 * after opt-in. The unavailable reason is evidence, not a failed spatial join. */
function useBusLanes(enabled: boolean): LanesState {
  const [manifest, setManifest] = useState<
    | { status: "pending" }
    | { status: "ready"; data: MapManifestResponse }
    | { status: "unavailable"; reason: string }
  >({ status: "pending" });
  const [collection, setCollection] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ready"; data: MapBusLaneFeatureCollection }
    | { status: "unavailable"; reason: string }
  >({ status: "idle" });
  const laneLoadStarted = useRef(false);
  const laneCollectionStatus = useRef(collection.status);
  laneCollectionStatus.current = collection.status;

  useEffect(() => {
    const controller = new AbortController();
    fetchMapManifest({ signal: controller.signal })
      .then((loaded) => {
        if (controller.signal.aborted) return;
        if (loaded === null) {
          setManifest({ status: "unavailable", reason: "Map manifest is unavailable." });
          return;
        }
        if (currentMapBusLaneArtifact(loaded) === null) {
          const layer = loaded.layers.find((candidate) => candidate.layerId === "bus_lanes");
          setManifest({
            status: "unavailable",
            reason:
              layer === undefined
                ? "The published bus-lane layer is not declared."
                : `The published bus-lane layer is ${layer.readiness.replaceAll("_", " ")}.`,
          });
          return;
        }
        setManifest({ status: "ready", data: loaded });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setManifest({ status: "unavailable", reason: "Map manifest could not be loaded." });
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (
      !enabled ||
      manifest.status !== "ready" ||
      laneLoadStarted.current ||
      laneCollectionStatus.current === "ready" ||
      laneCollectionStatus.current === "unavailable"
    )
      return;
    laneLoadStarted.current = true;
    const controller = new AbortController();
    setCollection({ status: "loading" });
    fetchMapBusLanes(manifest.data, { signal: controller.signal })
      .then((load) => {
        if (controller.signal.aborted) return;
        setCollection(
          load.status === "ready"
            ? { status: "ready", data: load.data }
            : {
                status: "unavailable",
                reason:
                  load.status === "unavailable"
                    ? load.reason
                    : "Published DOT lane geometry failed its verified artifact check.",
              },
        );
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setCollection({ status: "unavailable", reason: "Published DOT lane geometry failed." });
      });
    return () => {
      controller.abort();
      laneLoadStarted.current = false;
    };
  }, [enabled, manifest]);

  if (manifest.status === "pending") {
    return { eligibility: "pending", status: "idle", reason: null, collection: null };
  }
  if (manifest.status === "unavailable") {
    return {
      eligibility: "unavailable",
      status: "unavailable",
      reason: manifest.reason,
      collection: null,
    };
  }
  if (collection.status === "unavailable") {
    return {
      eligibility: "unavailable",
      status: "unavailable",
      reason: collection.reason,
      collection: null,
    };
  }
  if (collection.status === "ready") {
    return {
      eligibility: "ready",
      status: "ready",
      reason: null,
      collection: collection.data,
    };
  }
  return {
    eligibility: "ready",
    status: collection.status,
    reason: null,
    collection: null,
  };
}

/**
 * The route page's ONE map (plan 126, operator direction 2026-08-02). It used
 * to be a static SVG on Overview plus a real interactive map on Slow segments —
 * the same segment speeds as two styled modules. The interactive map won and
 * moved here; the Slow-segments tab kept the ranked list it is actually for.
 *
 * One click surface: clicking a segment anchors a popup to it (the ruling Plan
 * 125 recorded for the network map). There is no readout rail.
 */
export function RouteSegmentMapCard({
  data,
  search,
  onSearchChange,
  evidence = null,
  inventory = null,
  studies = null,
}: {
  data: StudioRouteDetailResponse;
  search: RouteDetailSearch;
  onSearchChange: (search: RouteDetailSearch, replace: boolean) => void;
  evidence?: StudioRouteEvidenceBundle | null;
  inventory?: StudioRouteInterventionInventoryBundle | null;
  studies?: RouteStudiesArtifact | null;
}) {
  const { route, segments } = data;
  const [hoverId, setHoverId] = useState<string | null>(null);
  // Segments without a stable spine id pin locally only (no shareable URL).
  const [localPinId, setLocalPinId] = useState<string | null>(null);
  const mapFrameRef = useRef<HTMLDivElement | null>(null);
  const geo = useRouteSegmentsGeo(route.routeId);
  const routeFact = useRouteFactEvidence(data);

  // Same chronology History renders, so the legend never opens an anchor that
  // surface does not mint.
  const laneChangeAnchor = useMemo(() => {
    const speedPoints = dossierSpeedPoints(data.dossier);
    return busLaneChangeAnchor(
      routeChangeChronology({
        route,
        evidence,
        inventory,
        studies,
        trendMonths: speedPoints.flatMap((point) => (point.value === null ? [] : [point.month])),
      }),
    );
  }, [route, evidence, inventory, studies, data.dossier]);

  const routeLaneEligibility =
    routeFact.status === "pending"
      ? "pending"
      : routeFact.status === "available" &&
          routeFact.fact.provenance.lane.status === "available" &&
          (routeFact.fact.provenance.lane.valuePct ?? 0) > 0
        ? "ready"
        : "unavailable";
  const lanes = useBusLanes(search.lanes === true && routeLaneEligibility === "ready");
  const laneValidation =
    routeLaneEligibility === "unavailable" || lanes.eligibility === "unavailable"
      ? "unavailable"
      : routeLaneEligibility === "pending" || lanes.eligibility === "pending"
        ? "pending"
        : "ready";

  /* The map shows current all-day speed only; the saved historical period
     belongs to the ranked list, which is where its controls live. */
  const canonical = canonicalizeRouteDetailSearch(search, {
    segments,
    history: { status: "pending" },
    lanes: laneValidation,
  });
  const mapSearch = canonical.search;
  const direction: ExplorerDirection = mapSearch.direction ?? "all";
  const showLanes = mapSearch.lanes === true;

  useEffect(() => {
    if (!routeDetailSearchEquals(search, mapSearch)) onSearchChange(mapSearch, true);
  }, [mapSearch, onSearchChange, search]);

  const displaySpeeds = useMemo(
    () => new Map(segments.map((segment) => [segment.id, segment.speedMph])),
    [segments],
  );
  const directions = useMemo(() => directionOptions(segments), [segments]);
  const ranked = useMemo(
    () =>
      rankSegmentsSlowestFirst(
        segments.map((segment, index) => ({
          id: segment.id,
          direction: segment.direction,
          speedMph: segment.speedMph,
          displayOrder: index,
          spineSegmentId: segment.spineSegmentId,
        })),
        direction,
      ),
    [direction, segments],
  );

  const urlPinned = resolvePinnedSegment(segments, mapSearch.segment ?? null);
  const pinned = urlPinned ?? segments.find((segment) => segment.id === localPinId) ?? null;

  const pin = (segment: StudioSegment | null) => {
    const nextSearch = { ...mapSearch };
    if (segment === null || segment.spineSegmentId === null) {
      setLocalPinId(segment === null ? null : segment.id);
      delete nextSearch.segment;
    } else {
      setLocalPinId(null);
      nextSearch.segment = segment.spineSegmentId;
    }
    onSearchChange(nextSearch, false);
  };
  const clearPin = (restoreFocus = false) => {
    /* Clicking the basemap with nothing pinned must not push a history entry
       for a state that did not change. */
    if (mapSearch.segment === undefined && localPinId === null) return;
    pin(null);
    if (restoreFocus) requestAnimationFrame(() => mapFrameRef.current?.focus());
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || (mapSearch.segment === undefined && localPinId === null))
        return;
      setLocalPinId(null);
      const nextSearch = { ...mapSearch };
      delete nextSearch.segment;
      onSearchChange(nextSearch, false);
      requestAnimationFrame(() => mapFrameRef.current?.focus());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mapSearch, localPinId, onSearchChange]);

  const onDirectionChange = (next: ExplorerDirection) => {
    const nextSearch = { ...mapSearch };
    delete nextSearch.segment;
    if (next === "all") delete nextSearch.direction;
    else nextSearch.direction = next;
    setLocalPinId(null);
    onSearchChange(nextSearch, true);
  };

  const onLanesChange = (enabled: boolean) => {
    const nextSearch = { ...mapSearch };
    if (enabled) nextSearch.lanes = true;
    else delete nextSearch.lanes;
    onSearchChange(nextSearch, true);
  };

  const rankIndex = pinned === null ? -1 : ranked.findIndex((row) => row.id === pinned.id);
  const popup: RouteMapPopupState | null =
    pinned === null || geo.status !== "ready"
      ? null
      : (() => {
          const anchor = routeSegmentAnchor(geo.collection, pinned.id);
          if (anchor === null) return null;
          return {
            anchor,
            content: (
              <RouteSegmentPopup
                segment={pinned}
                routeSlug={route.slug}
                rank={rankIndex < 0 ? null : rankIndex + 1}
                rankedCount={ranked.length}
                laneChangeAnchor={laneChangeAnchor}
                onClose={() => clearPin(true)}
              />
            ),
          };
        })();

  const hasLaneEvidence = routeLaneEligibility === "ready";
  /* Switching tabs through the search state, not the section callback, so the
     direction and overlay the visitor just set survive the trip to the list. */
  const exploreSegments = () => onSearchChange({ ...mapSearch, tab: "segments" }, false);

  return (
    <SectionCard
      title="Route map"
      sub="Observed speed by segment."
      right={
        <div className="flex flex-wrap items-center gap-2.5">
          {directions.length > 1 ? (
            <FilterChips
              ariaLabel="Direction"
              value={direction}
              onChange={onDirectionChange}
              options={directions.map((value) => ({
                id: value,
                label: value === "all" ? "All" : value,
              }))}
            />
          ) : null}
          {hasLaneEvidence && lanes.eligibility !== "unavailable" ? (
            <label className="flex cursor-pointer items-center gap-2 rounded-[3px] px-2.5 py-2 text-[12px] font-semibold shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
              <input
                type="checkbox"
                checked={showLanes}
                disabled={lanes.eligibility === "pending"}
                onChange={(event) => onLanesChange(event.currentTarget.checked)}
                className="size-3.5 accent-[var(--bp-color-ink)]"
              />
              <span>Painted bus lanes (DOT)</span>
            </label>
          ) : null}
          <Button type="button" size="sm" variant="secondary" onClick={exploreSegments}>
            Explore route segments
          </Button>
        </div>
      }
      bodyClassName="flex min-w-0 flex-1 flex-col"
    >
      <div
        ref={mapFrameRef}
        tabIndex={-1}
        className="min-w-0 overflow-hidden rounded-[3px] bg-[var(--bp-color-paper-deep)] shadow-[inset_0_0_0_1px_var(--bp-color-rule)]"
      >
        {geo.status === "loading" ? (
          <div
            className="h-[380px] animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)] motion-reduce:animate-none max-md:h-[320px]"
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
              if (segment === undefined) return;
              if (pinned?.id === segment.id) clearPin();
              else pin(segment);
            }}
            onClearSelection={() => clearPin()}
            activeDirection={direction}
            displaySpeeds={displaySpeeds}
            showLanes={showLanes && lanes.status === "ready"}
            busLanes={lanes.collection}
            popup={popup}
            compact
          />
        ) : (
          /* No published geometry: the schematic corridor makes no geographic
             claim, and the ranked list carries the same evidence. */
          <div className="p-3">
            <CorridorMap route={route} segments={segments} mode="mini" />
            <p className="m-0 mt-2 text-[11px] text-[var(--bp-color-ink-55)]">
              {geo.reason} This schematic shows segment order, not geography.
            </p>
          </div>
        )}
        <SegmentSpeedLegend
          showLanes={showLanes}
          routeSlug={route.slug}
          laneChangeAnchor={laneChangeAnchor}
        />
        {lanes.status === "unavailable" && hasLaneEvidence ? (
          <p className="m-0 px-3 pb-2 text-[11px] text-[var(--bp-color-ink-55)]">{lanes.reason}</p>
        ) : null}
      </div>
    </SectionCard>
  );
}

function RouteSegmentPopup({
  segment,
  routeSlug,
  rank,
  rankedCount,
  laneChangeAnchor,
  onClose,
}: {
  segment: StudioSegment;
  routeSlug: string;
  rank: number | null;
  rankedCount: number;
  laneChangeAnchor: string | null;
  onClose: () => void;
}) {
  const model = routeMapPopupModel({
    segment,
    speedMph: segment.speedMph,
    periodLabel: CURRENT_PERIOD_LABEL,
    rank,
    rankedCount,
  });

  return (
    <div className="w-[248px] p-3 font-sans text-[var(--bp-color-ink)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold leading-tight">{model.title}</div>
          <div className="mt-0.5 text-[11px] text-[var(--bp-color-ink-55)]">
            {model.directionName}
          </div>
        </div>
        <button
          type="button"
          aria-label="Close segment details"
          onClick={onClose}
          className="-mr-1.5 -mt-1.5 rounded-[3px] border-0 bg-transparent px-2 py-1 text-[14px] leading-none text-[var(--bp-color-ink-55)] hover:bg-[var(--bp-color-paper-deep)] hover:text-[var(--bp-color-ink)]"
        >
          ✕
        </button>
      </div>
      <div className="mt-2.5 flex items-baseline gap-2">
        <span className="font-mono text-[22px] font-bold leading-none tabular-nums">
          {model.speedValue}
        </span>
        <span className="text-[11px] text-[var(--bp-color-ink-55)]">{model.speedUnit}</span>
      </div>
      {model.rankLine === null ? null : (
        <div className="mt-1 text-[11px] text-[var(--bp-color-ink-70)]">{model.rankLine}</div>
      )}
      <div className="mt-2 text-[11px] leading-normal text-[var(--bp-color-ink-55)]">
        {model.laneLine}
        {model.laneTagged && laneChangeAnchor !== null ? (
          <>
            {" "}
            <Link
              to="/routes/$routeId"
              params={{ routeId: routeSlug }}
              search={{ tab: "history" as const, record: laneChangeAnchor }}
              className="text-[var(--bp-color-accent)] no-underline"
            >
              What changed
            </Link>
          </>
        ) : null}
      </div>
      <div className="mt-2.5 border-t border-[var(--bp-color-rule)] pt-2.5">
        <Link
          to="/routes/$routeId"
          params={{ routeId: routeSlug }}
          search={
            segment.spineSegmentId === null
              ? { tab: "segments" as const }
              : { tab: "segments" as const, segment: segment.spineSegmentId }
          }
          className="text-[12.5px] font-semibold text-[var(--bp-color-accent)] no-underline hover:underline"
        >
          See in segment list →
        </Link>
      </div>
    </div>
  );
}

function SegmentSpeedLegend({
  showLanes,
  routeSlug,
  laneChangeAnchor,
}: {
  showLanes: boolean;
  routeSlug: string;
  laneChangeAnchor: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 font-mono text-[9.5px] text-[var(--bp-color-ink-55)]">
      <span className="font-sans font-semibold text-[var(--bp-color-ink-70)]">
        {CURRENT_PERIOD_LABEL}
      </span>
      {[
        ["under 5 mph", "var(--bp-color-bad)"],
        ["5–6.5 mph", "var(--bp-color-warn)"],
        ["over 6.5 mph", "var(--bp-color-good)"],
      ].map(([label, color]) => (
        <span key={label} className="inline-flex items-center gap-1">
          <i className="h-[3px] w-4" style={{ background: color }} aria-hidden />
          {label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <i
          className="h-[5px] w-4 border-y border-dashed border-[var(--bp-color-ink-40)]"
          aria-hidden
        />
        no data
      </span>
      {showLanes ? (
        <span className="inline-flex items-center gap-1">
          <i className="h-[4px] w-4" style={{ background: BUS_LANE_COLOR }} aria-hidden />
          NYC DOT published bus-lane geometry
          {laneChangeAnchor === null ? null : (
            <Link
              to="/routes/$routeId"
              params={{ routeId: routeSlug }}
              search={{ tab: "history" as const, record: laneChangeAnchor }}
              className="text-[var(--bp-color-accent)] no-underline"
            >
              What changed
            </Link>
          )}
        </span>
      ) : null}
    </div>
  );
}
