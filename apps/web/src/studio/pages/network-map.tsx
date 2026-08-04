import type {
  MapBusLaneFeatureCollection,
  MapManifestResponse,
  MapRouteSegmentFeatureCollection,
} from "@bp/domain/maps";
import { Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
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
  featureValue,
  filterNetworkFeaturesByBorough,
  formatViewValue,
  insightModel,
  legendModel,
  type NetworkBorough,
  type NetworkEncoding,
  type NetworkView,
  percentileLine,
  periodEligible,
  periodLabel,
  routeSegmentSpineIds,
  slowestWindow,
  sortFeaturesForView,
  speedBandTerm,
  unverifiedBoroughFeatureCount,
  viewEncoding,
} from "@/components/route/network-map-model";
import {
  buildNetworkMapIdentityIndex,
  canonicalizeNetworkMapSearch,
  type NetworkMapCanonicalizationNotice,
  type NetworkMapRouteIdentity,
  type NetworkMapSearch,
  type SegmentValidation,
} from "@/components/route/network-map-search";
import type { RouteGeoContext } from "@/components/route/route-geo-map";
import {
  currentMapBusLaneArtifact,
  fetchMapBusLanes,
  fetchSelectedRouteMapEvidence,
  type NetworkMapFeature,
  type NetworkMapFeatureCollection,
  type SelectedRouteMapEvidence,
} from "@/studio/api-client";
import type { StudioRoute, StudyIndexRow } from "@/studio/api-contract";

const NetworkMapControls = lazy(() =>
  import("@/components/route/NetworkMapChrome").then((module) => ({
    default: module.NetworkMapControls,
  })),
);
const NetworkMapMobileOptions = lazy(() =>
  import("@/components/route/NetworkMapChrome").then((module) => ({
    default: module.NetworkMapMobileOptions,
  })),
);
const NetworkMapBrowse = lazy(() =>
  import("@/components/route/NetworkMapChrome").then((module) => ({
    default: module.NetworkMapBrowse,
  })),
);
const NetworkMapSelected = lazy(() =>
  import("@/components/route/NetworkMapChrome").then((module) => ({
    default: module.NetworkMapSelected,
  })),
);
const NetworkMapMobileSheet = lazy(() =>
  import("@/components/route/NetworkMapChrome").then((module) => ({
    default: module.NetworkMapMobileSheet,
  })),
);
const NetworkMapDataNotes = lazy(() =>
  import("@/components/route/NetworkMapChrome").then((module) => ({
    default: module.NetworkMapDataNotes,
  })),
);

type SelectedEvidenceState =
  | { status: "loading"; requestKey: string | null; routeId: string }
  | {
      status: "ready";
      requestKey: string;
      routeId: string;
      evidence: SelectedRouteMapEvidence;
    }
  | { status: "unavailable"; requestKey: string | null; routeId: string; message: string };

type BusLaneCache = {
  artifactKey: string;
  sha256: string;
  data: MapBusLaneFeatureCollection;
};

type BusLaneError = { artifactKey: string; sha256: string; message: string };

type UrlNotice = { searchKey: string; contextKey: string; message: string };

export function networkMapReleaseKey(manifest: MapManifestResponse): string {
  return JSON.stringify([
    manifest.schemaVersion,
    manifest.releaseId,
    manifest.publishedAt,
    manifest.coverage.start,
    manifest.coverage.end,
  ]);
}

export function selectedRouteEvidenceKey(manifest: MapManifestResponse, routeId: string): string {
  const segmentObjects = manifest.artifacts
    .filter(
      (artifact) =>
        artifact.artifactKind === "map_route_segments_geojson" && artifact.routeId === routeId,
    )
    .map((artifact): [string, string] => [artifact.artifactKey, artifact.sha256])
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify([networkMapReleaseKey(manifest), routeId, segmentObjects]);
}

export function NetworkMapLoadingPage() {
  return (
    <main className="flex h-full min-h-0 flex-col">
      <div className="flex items-baseline gap-3 px-7 py-3 max-md:px-4">
        <div className="h-6 w-44 animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)] motion-reduce:animate-none" />
      </div>
      <div className="min-h-0 flex-1 animate-pulse bg-[var(--bp-color-ink-06)] motion-reduce:animate-none" />
    </main>
  );
}

const NOTE_DISMISSED_KEY = "bp.map.insight.dismissed";

type SearchChangeOptions = { replace: boolean };

type SearchPatch = {
  [Key in keyof NetworkMapSearch]?: NetworkMapSearch[Key] | undefined;
};

function patchSearch(search: NetworkMapSearch, patch: SearchPatch): NetworkMapSearch {
  const next = { ...search };
  for (const key of Object.keys(patch) as Array<keyof NetworkMapSearch>) {
    const value = patch[key];
    if (value === undefined) delete next[key];
    else Object.assign(next, { [key]: value });
  }
  return next;
}

function withoutPin(search: NetworkMapSearch): NetworkMapSearch {
  return patchSearch(search, { route: undefined, segment: undefined });
}

export function networkMapSearchStateKey(search: object): string {
  return JSON.stringify(
    Object.entries(search as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

function noticeMessage(notice: NetworkMapCanonicalizationNotice): string {
  switch (notice) {
    case "unsupported_lens":
      return "That metric is unavailable; the map returned to speed.";
    case "unsupported_period":
      return "That period lacks complete coverage; the map returned to all day.";
    case "unknown_route":
      return "The saved route is not in this mapped release.";
    case "route_outside_borough":
      return "That route does not serve this borough, so its pin was cleared.";
    case "segment_invalid":
      return "The saved segment is unavailable for this route and was removed from the link.";
    case "lanes_unavailable":
      return "NYC DOT bus lanes are unavailable for this release.";
  }
}

function isMobileViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
}

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
  completeFactCount,
  factsStatus,
  search,
  onSearchChange,
}: {
  routes: readonly StudioRoute[];
  network: NetworkMapFeatureCollection | null;
  context: RouteGeoContext | null;
  mapMessage: string | null;
  manifest: MapManifestResponse | null;
  lanesAvailable: boolean;
  coverageEnd: string | null;
  studyIndex: readonly StudyIndexRow[] | null;
  completeFactCount: number;
  factsStatus: "ready" | "unavailable" | "coverage_mismatch";
  search: NetworkMapSearch;
  onSearchChange: (next: NetworkMapSearch, options: SearchChangeOptions) => void;
}) {
  const [browseOpen, setBrowseOpen] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [mobileMode, setMobileMode] = useState<"browse" | "selected">("browse");
  const [dataNotesOpen, setDataNotesOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pointerPreviewRouteId, setPointerPreviewRouteId] = useState<string | null>(null);
  const [focusedPreviewRouteId, setFocusedPreviewRouteId] = useState<string | null>(null);
  const [clickedAnchor, setClickedAnchor] = useState<{
    routeId: string;
    anchor: readonly [number, number];
  } | null>(null);
  const [noteDismissed, setNoteDismissed] = useState(readNoteDismissed);
  const [busLaneCache, setBusLaneCache] = useState<BusLaneCache | null>(null);
  const [lanesError, setLanesError] = useState<BusLaneError | null>(null);
  const [urlNotice, setUrlNotice] = useState<UrlNotice | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<SelectedEvidenceState | null>(null);
  const [selectedAutoFocus, setSelectedAutoFocus] = useState<"desktop" | "mobile" | null>(null);
  const [mobileViewport, setMobileViewport] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const mobileSearchRef = useRef<HTMLInputElement | null>(null);
  const findPillRef = useRef<HTMLButtonElement | null>(null);
  const mobileBrowseButtonRef = useRef<HTMLButtonElement | null>(null);

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

  const delayCoverage = coverageEnd === null ? null : coverageLabel(coverageEnd);
  const releaseCoverage = manifest === null ? null : coverageLabel(manifest.coverage.end);
  const releaseKey = manifest === null ? null : networkMapReleaseKey(manifest);
  const busLaneArtifact = useMemo(
    () => (manifest === null ? null : currentMapBusLaneArtifact(manifest)),
    [manifest],
  );
  const busLanes =
    busLaneArtifact !== null &&
    busLaneCache?.artifactKey === busLaneArtifact.artifactKey &&
    busLaneCache.sha256 === busLaneArtifact.sha256
      ? busLaneCache.data
      : null;
  const activeLanesError =
    busLaneArtifact !== null &&
    lanesError?.artifactKey === busLaneArtifact.artifactKey &&
    lanesError.sha256 === busLaneArtifact.sha256
      ? lanesError.message
      : null;
  const lanesEligible = lanesAvailable && busLaneArtifact !== null;
  const busLaneArtifactRef = useRef(busLaneArtifact);
  busLaneArtifactRef.current = busLaneArtifact;
  const delayEligible = useMemo(
    () => network !== null && delayLensEligible(network.features, delayCoverage),
    [network, delayCoverage],
  );
  const amEligible = useMemo(
    () => network !== null && periodEligible(network.features, "am"),
    [network],
  );
  const pmEligible = useMemo(
    () => network !== null && periodEligible(network.features, "pm"),
    [network],
  );
  const identityRoutes = useMemo<NetworkMapRouteIdentity[]>(() => {
    if (network === null) return [];
    return network.features.flatMap((feature) => {
      const route = routeById.get(feature.properties.routeId);
      return route === undefined
        ? []
        : [
            {
              routeId: feature.properties.routeId,
              slug: route.slug,
              servedBoroughs: feature.properties.servedBoroughs,
            },
          ];
    });
  }, [network, routeById]);
  const identity = useMemo(() => buildNetworkMapIdentityIndex(identityRoutes), [identityRoutes]);
  const rawPinnedRouteId =
    search.route === undefined ? null : (identity.routeIdBySlug.get(search.route) ?? null);
  const selectedEvidenceKey =
    manifest === null || rawPinnedRouteId === null
      ? null
      : selectedRouteEvidenceKey(manifest, rawPinnedRouteId);

  useEffect(() => {
    if (rawPinnedRouteId === null) {
      setSelectedEvidence(null);
      return;
    }
    if (manifest === null) {
      setSelectedEvidence({
        status: "unavailable",
        requestKey: null,
        routeId: rawPinnedRouteId,
        message: "Selected-route evidence is unavailable because the map manifest is missing.",
      });
      return;
    }
    const controller = new AbortController();
    const requestKey = selectedRouteEvidenceKey(manifest, rawPinnedRouteId);
    setSelectedEvidence({
      status: "loading",
      requestKey,
      routeId: rawPinnedRouteId,
    });
    fetchSelectedRouteMapEvidence(manifest, rawPinnedRouteId, { signal: controller.signal })
      .then((evidence) => {
        if (!controller.signal.aborted) {
          setSelectedEvidence({
            status: "ready",
            requestKey,
            routeId: rawPinnedRouteId,
            evidence,
          });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setSelectedEvidence({
          status: "unavailable",
          requestKey,
          routeId: rawPinnedRouteId,
          message:
            error instanceof Error
              ? `Selected-route evidence could not be loaded: ${error.message}`
              : "Selected-route evidence could not be loaded.",
        });
      });
    return () => controller.abort();
  }, [manifest, rawPinnedRouteId]);

  const currentSelectedEvidence =
    selectedEvidence?.routeId === rawPinnedRouteId &&
    selectedEvidence.requestKey === selectedEvidenceKey
      ? selectedEvidence
      : null;

  const segmentValidation = useMemo<SegmentValidation | undefined>(() => {
    if (search.route === undefined || search.segment === undefined) return undefined;
    if (currentSelectedEvidence === null || currentSelectedEvidence.status === "loading") {
      return { status: "pending", routeSlug: search.route };
    }
    if (currentSelectedEvidence.status === "unavailable") {
      return { status: "unavailable", routeSlug: search.route };
    }
    const segmentLoad = currentSelectedEvidence.evidence.segments;
    return segmentLoad.status === "ready"
      ? {
          status: "ready",
          routeSlug: search.route,
          spineIds: routeSegmentSpineIds(segmentLoad.data),
        }
      : { status: "unavailable", routeSlug: search.route };
  }, [search.route, search.segment, currentSelectedEvidence]);

  const canonicalization = useMemo(
    () =>
      canonicalizeNetworkMapSearch(search, {
        routes: identityRoutes,
        eligibility: {
          delayExposure: delayEligible,
          change: false,
          am: amEligible,
          pm: pmEligible,
          lanes: lanesEligible,
        },
        ...(segmentValidation === undefined ? {} : { segmentValidation }),
      }),
    [
      search,
      identityRoutes,
      delayEligible,
      amEligible,
      pmEligible,
      lanesEligible,
      segmentValidation,
    ],
  );
  const effectiveSearch = canonicalization.search;
  const runtimeSearchKey = networkMapSearchStateKey(search);
  const canonicalSearchKey = networkMapSearchStateKey(canonicalization.search);
  const canonicalContextKey = JSON.stringify([
    releaseKey,
    delayEligible,
    amEligible,
    pmEligible,
    lanesEligible,
  ]);
  const activeUrlNotice =
    urlNotice?.searchKey === runtimeSearchKey && urlNotice.contextKey === canonicalContextKey
      ? urlNotice.message
      : null;
  const effectiveSearchRef = useRef(effectiveSearch);
  effectiveSearchRef.current = effectiveSearch;

  useEffect(() => {
    setUrlNotice((current) =>
      current?.searchKey === runtimeSearchKey && current.contextKey === canonicalContextKey
        ? current
        : null,
    );
  }, [canonicalContextKey, runtimeSearchKey]);

  useEffect(() => {
    if (runtimeSearchKey === canonicalSearchKey) return;
    const messages = [...new Set(canonicalization.notices.map(noticeMessage))];
    setUrlNotice(
      messages.length === 0
        ? null
        : {
            searchKey: canonicalSearchKey,
            contextKey: canonicalContextKey,
            message: messages.join(" "),
          },
    );
    onSearchChange(canonicalization.search, { replace: true });
  }, [canonicalContextKey, canonicalSearchKey, canonicalization, onSearchChange, runtimeSearchKey]);

  const view = useMemo<NetworkView>(
    () => ({
      lens: effectiveSearch.lens === "delay-exposure" ? "delay" : "speed",
      period: effectiveSearch.period ?? "all",
      compare: effectiveSearch.compare === true,
    }),
    [effectiveSearch.compare, effectiveSearch.lens, effectiveSearch.period],
  );
  const borough = effectiveSearch.borough as NetworkBorough | undefined;
  const filteredFeatures = useMemo(
    () => (network === null ? [] : filterNetworkFeaturesByBorough(network.features, borough)),
    [network, borough],
  );
  const visibleNetwork = useMemo<NetworkMapFeatureCollection | null>(
    () => (network === null ? null : { ...network, features: filteredFeatures }),
    [network, filteredFeatures],
  );
  const legend = useMemo(
    () => (network === null ? null : legendModel(filteredFeatures, view, delayCoverage ?? "")),
    [network, filteredFeatures, view, delayCoverage],
  );
  const insight = useMemo(
    () => (network === null ? null : insightModel(filteredFeatures, view, delayCoverage ?? "")),
    [network, filteredFeatures, view, delayCoverage],
  );
  const rankedForView = useMemo(
    () => sortFeaturesForView(filteredFeatures, view),
    [filteredFeatures, view],
  );
  const ranked = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rankedForView.filter((feature) => {
      if (needle === "") return true;
      const corridor = routeById.get(feature.properties.routeId)?.corridor ?? "";
      return (
        feature.properties.label.toLowerCase().includes(needle) ||
        corridor.toLowerCase().includes(needle)
      );
    });
  }, [rankedForView, query, routeById]);
  const badges = useMemo<NetworkBadge[]>(() => {
    return badgeFeatures(filteredFeatures, view, 10).flatMap((feature) => {
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
  }, [filteredFeatures, view]);

  const selectedRouteId = canonicalization.routeId;
  const selectedFeature =
    selectedRouteId === null
      ? null
      : (filteredFeatures.find((feature) => feature.properties.routeId === selectedRouteId) ??
        null);
  const selectedRoute = selectedRouteId === null ? null : (routeById.get(selectedRouteId) ?? null);
  const selectedAnchor =
    selectedFeature === null
      ? null
      : clickedAnchor?.routeId === selectedFeature.properties.routeId
        ? clickedAnchor.anchor
        : featureAnchor(selectedFeature);
  const selectedSegments: MapRouteSegmentFeatureCollection | null =
    currentSelectedEvidence?.status === "ready" &&
    currentSelectedEvidence.routeId === selectedRouteId &&
    currentSelectedEvidence.evidence.segments.status === "ready"
      ? currentSelectedEvidence.evidence.segments.data
      : null;

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setMobileViewport(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!mobileViewport) {
      setMobileSheetOpen(false);
    } else if (selectedRouteId !== null) {
      setMobileMode("selected");
      setMobileSheetOpen(true);
    } else {
      setSelectedAutoFocus(null);
    }
  }, [mobileViewport, selectedRouteId]);

  useEffect(() => {
    if (mobileViewport && mobileSheetOpen && mobileMode === "browse") {
      mobileSearchRef.current?.focus();
    }
  }, [mobileMode, mobileSheetOpen, mobileViewport]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || mobileSheetOpen || dataNotesOpen)
        return;
      if (browseOpen) {
        setBrowseOpen(false);
        setPointerPreviewRouteId(null);
        setFocusedPreviewRouteId(null);
        findPillRef.current?.focus();
        return;
      }
      if (selectedRouteId !== null) {
        setClickedAnchor(null);
        setSelectedAutoFocus(null);
        onSearchChange(withoutPin(effectiveSearch), { replace: true });
        requestAnimationFrame(() => findPillRef.current?.focus());
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    selectedRouteId,
    browseOpen,
    effectiveSearch,
    onSearchChange,
    mobileSheetOpen,
    dataNotesOpen,
  ]);

  useEffect(() => {
    if (browseOpen) searchRef.current?.focus();
  }, [browseOpen]);

  useEffect(() => {
    if (
      effectiveSearch.lanes !== true ||
      busLaneArtifact === null ||
      busLanes !== null ||
      manifest === null
    )
      return;
    const controller = new AbortController();
    const requestArtifact = busLaneArtifact;
    setLanesError((current) =>
      current?.artifactKey === requestArtifact.artifactKey &&
      current.sha256 === requestArtifact.sha256
        ? null
        : current,
    );
    fetchMapBusLanes(manifest, { signal: controller.signal })
      .then((load) => {
        if (controller.signal.aborted) return;
        const activeArtifact = busLaneArtifactRef.current;
        if (
          activeArtifact?.artifactKey !== requestArtifact.artifactKey ||
          activeArtifact.sha256 !== requestArtifact.sha256
        )
          return;
        if (load.status === "ready") {
          setBusLaneCache({
            artifactKey: requestArtifact.artifactKey,
            sha256: requestArtifact.sha256,
            data: load.data,
          });
          setLanesError((current) =>
            current?.artifactKey === requestArtifact.artifactKey &&
            current.sha256 === requestArtifact.sha256
              ? null
              : current,
          );
        } else {
          setLanesError({
            artifactKey: requestArtifact.artifactKey,
            sha256: requestArtifact.sha256,
            message: "The bus-lane layer failed to load.",
          });
          onSearchChange(patchSearch(effectiveSearchRef.current, { lanes: undefined }), {
            replace: true,
          });
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        const activeArtifact = busLaneArtifactRef.current;
        if (
          activeArtifact?.artifactKey !== requestArtifact.artifactKey ||
          activeArtifact.sha256 !== requestArtifact.sha256
        )
          return;
        setLanesError({
          artifactKey: requestArtifact.artifactKey,
          sha256: requestArtifact.sha256,
          message: "The bus-lane layer failed to load.",
        });
        onSearchChange(patchSearch(effectiveSearchRef.current, { lanes: undefined }), {
          replace: true,
        });
      });
    return () => controller.abort();
  }, [effectiveSearch.lanes, busLaneArtifact, busLanes, manifest, onSearchChange]);

  const pinRoute = (
    routeId: string,
    anchor: readonly [number, number] | null,
    interaction: "keyboard" | "pointer" = "pointer",
  ) => {
    if (anchor === null) return;
    const slug = identity.slugByRouteId.get(routeId);
    if (slug === undefined) return;
    const mobile = isMobileViewport();
    setBrowseOpen(false);
    setPointerPreviewRouteId(null);
    setFocusedPreviewRouteId(null);
    setSelectedAutoFocus(interaction === "keyboard" ? (mobile ? "mobile" : "desktop") : null);
    setClickedAnchor({ routeId, anchor });
    onSearchChange(patchSearch(effectiveSearch, { route: slug, segment: undefined }), {
      replace: false,
    });
    if (mobile) {
      setMobileMode("selected");
      setMobileSheetOpen(true);
    }
  };

  const clearPin = (restoreFocus = false) => {
    setClickedAnchor(null);
    setSelectedAutoFocus(null);
    onSearchChange(withoutPin(effectiveSearch), { replace: true });
    if (!restoreFocus) return;
    if (isMobileViewport()) {
      setMobileMode("browse");
      setMobileSheetOpen(true);
    } else {
      requestAnimationFrame(() => findPillRef.current?.focus());
    }
  };

  const setMobileSheetState = (open: boolean) => {
    setMobileSheetOpen(open);
    if (!open) {
      setPointerPreviewRouteId(null);
      setFocusedPreviewRouteId(null);
      setSelectedAutoFocus(null);
      requestAnimationFrame(() => mobileBrowseButtonRef.current?.focus());
    }
  };

  const updateView = (next: NetworkView) => {
    onSearchChange(
      patchSearch(effectiveSearch, {
        lens: next.lens === "delay" ? "delay-exposure" : undefined,
        period: next.lens === "speed" && next.period !== "all" ? next.period : undefined,
        compare: next.lens === "speed" && next.period !== "all" && next.compare ? true : undefined,
      }),
      { replace: true },
    );
  };

  const segmentNotice =
    canonicalization.segmentState === "pending"
      ? "Validating the saved segment against this route’s exact identities…"
      : canonicalization.segmentState === "unavailable"
        ? "Segment validation is temporarily unavailable; the shared segment link is preserved."
        : canonicalization.segmentState === "invalid"
          ? "The saved segment is not uniquely available for this route."
          : activeUrlNotice;

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

  const popup: NetworkMapPopupState | null =
    selectedFeature === null || selectedAnchor === null
      ? null
      : {
          anchor: selectedAnchor,
          content: (
            <NetworkMapPopup
              feature={selectedFeature}
              features={network.features}
              route={selectedRoute}
              studies={studiesByRouteId.get(selectedFeature.properties.routeId) ?? []}
              view={view}
              coverage={delayCoverage}
              onClose={() => clearPin()}
            />
          ),
        };
  const encoding = viewEncoding(view);
  const activeEvidence =
    currentSelectedEvidence?.routeId === selectedRouteId
      ? currentSelectedEvidence
      : ({ status: "loading" } as const);
  const selectedRankIndex =
    selectedRouteId === null
      ? -1
      : rankedForView.findIndex((feature) => feature.properties.routeId === selectedRouteId);
  const selectedRank = selectedRankIndex < 0 ? null : selectedRankIndex + 1;
  const mapSummary = `${filteredFeatures.length} routes shown${
    borough === undefined ? " citywide" : ` serving ${borough}`
  }. ${view.lens === "delay" ? "Route-slice rider delay exposure" : "Bus speed"}, ${periodLabel(
    view.period,
  )}.${selectedFeature === null ? " No route selected." : ` ${selectedFeature.properties.label} selected.`}`;

  return (
    <main className="flex h-full min-h-0 flex-col">
      {/*
        The map is the page. A title band that repeated the nav item, restated
        coverage the chrome already carries, and parked a dialog button in dead
        space cost a strip of canvas for nothing. The heading survives for
        assistive technology and SEO; its contents moved into the map chrome.
      */}
      <h1 className="sr-only">Network map</h1>
      {mapMessage === null && activeLanesError === null && activeUrlNotice === null ? null : (
        <p className="m-0 px-7 pb-2 pt-2 text-[12px] text-[var(--bp-color-ink-55)]" role="status">
          {[mapMessage, activeLanesError, activeUrlNotice]
            .filter((message) => message !== null)
            .join(" ")}
        </p>
      )}
      <p id="network-map-summary" className="sr-only" aria-live="polite">
        {mapSummary}
      </p>
      <p id="network-map-route-list-description" className="sr-only">
        Use Find a route or Browse all routes for the complete keyboard-accessible ranked list.
      </p>
      <div className="relative min-h-0 flex-1">
        <NetworkMapLibre
          collection={visibleNetwork ?? network}
          context={context}
          view={view}
          badges={badges}
          busLanes={busLanes}
          showLanes={effectiveSearch.lanes === true && busLanes !== null}
          routeSegments={selectedSegments}
          selectedSegmentId={effectiveSearch.segment ?? null}
          selectedRouteId={selectedRouteId}
          focusedRouteId={focusedPreviewRouteId}
          previewRouteId={pointerPreviewRouteId}
          inspectorOpen={browseOpen || selectedFeature !== null}
          fitCollectionKey={borough ?? "all"}
          onSelectRoute={pinRoute}
          onClearSelection={() => clearPin()}
          popup={popup}
          ariaLabel="NYC bus network decision map"
          ariaDescribedBy="network-map-summary network-map-route-list-description"
        />
        <Suspense
          fallback={
            <p className="absolute left-4 top-4 z-10 m-0 rounded-[3px] bg-[var(--bp-color-card)]/95 px-3 py-2 text-[12px] text-[var(--bp-color-ink-55)] shadow-[0_1px_6px_rgba(0,0,0,0.15)]">
              Loading map controls…
            </p>
          }
        >
          <NetworkMapControls
            view={view}
            delayEligible={delayEligible}
            amEligible={amEligible}
            pmEligible={pmEligible}
            lanesVisible={effectiveSearch.lanes === true}
            lanesAvailable={lanesEligible}
            routeCount={network.features.length}
            coverage={releaseCoverage}
            verifiedRouteCount={completeFactCount}
            browseExpanded={
              browseOpen || (mobileViewport && mobileSheetOpen && mobileMode === "browse")
            }
            desktopBrowseButtonRef={findPillRef}
            mobileBrowseButtonRef={mobileBrowseButtonRef}
            onViewChange={updateView}
            onLanesChange={(visible) =>
              onSearchChange(patchSearch(effectiveSearch, { lanes: visible ? true : undefined }), {
                replace: true,
              })
            }
            onOpenDataNotes={() => setDataNotesOpen(true)}
            onBrowse={() => {
              if (isMobileViewport()) {
                setMobileMode("browse");
                setMobileSheetOpen(true);
              } else {
                setBrowseOpen(true);
              }
            }}
          />
        </Suspense>
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
            {/* Three lines, not one run-on: what the colour means, what the
                numbers are, and what you can do about it. */}
            <b className="block text-[12px] text-[var(--bp-color-ink)]">{insight.lead}</b>
            <span className="mt-0.5 block">{insight.rest}</span>
            <span className="mt-1.5 block text-[var(--bp-color-ink-40)]">{insight.hint}</span>
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
        {browseOpen || selectedFeature !== null ? (
          <div
            role="dialog"
            aria-label={browseOpen ? "Find a route" : "Selected route inspector"}
            className="absolute bottom-4 right-4 top-4 z-20 flex w-[344px] max-w-[calc(100%-32px)] flex-col rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule),0_10px_30px_rgba(16,20,24,0.2)] max-md:hidden"
          >
            <div className="flex items-baseline gap-2 px-3 pb-0.5 pt-2.5">
              <b className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[var(--bp-color-ink-55)]">
                {browseOpen
                  ? encoding === "delay"
                    ? "Most route-slice rider time lost"
                    : encoding === "delta"
                      ? "Biggest peak slowdown"
                      : `Slowest first (${periodLabel(view.period)})`
                  : "Route inspector"}
              </b>
              <span className="text-[10.5px] text-[var(--bp-color-ink-40)]">
                {browseOpen ? `${ranked.length} routes` : "exact selected-route evidence"}
              </span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => {
                  if (browseOpen) setBrowseOpen(false);
                  else clearPin(true);
                  setPointerPreviewRouteId(null);
                  setFocusedPreviewRouteId(null);
                  findPillRef.current?.focus();
                }}
                className="ml-auto self-center rounded-[2px] border-0 bg-transparent px-1.5 py-0.5 text-[13px] text-[var(--bp-color-ink-40)] hover:bg-[var(--bp-color-paper-deep)] hover:text-[var(--bp-color-ink)]"
              >
                ✕
              </button>
            </div>
            <Suspense
              fallback={
                <p className="m-0 p-4 text-[12px] text-[var(--bp-color-ink-55)]" role="status">
                  Loading route panel…
                </p>
              }
            >
              {browseOpen || selectedFeature === null ? (
                <NetworkMapBrowse
                  ranked={ranked}
                  routeById={routeById}
                  view={view}
                  query={query}
                  pinnedRouteId={selectedRouteId}
                  listId="network-map-route-list"
                  searchRef={searchRef}
                  onQueryChange={setQuery}
                  onPointerPreview={setPointerPreviewRouteId}
                  onFocusPreview={setFocusedPreviewRouteId}
                  onPin={(feature, interaction) =>
                    pinRoute(feature.properties.routeId, featureAnchor(feature), interaction)
                  }
                />
              ) : (
                <NetworkMapSelected
                  feature={selectedFeature}
                  route={selectedRoute}
                  view={view}
                  rank={selectedRank}
                  routeCount={filteredFeatures.length}
                  releaseCoverage={releaseCoverage}
                  delayCoverage={delayCoverage}
                  evidence={activeEvidence}
                  selectedSegmentId={effectiveSearch.segment}
                  segmentNotice={segmentNotice}
                  autoFocus={selectedAutoFocus === "desktop"}
                  onSelectSegment={(segment) =>
                    onSearchChange(patchSearch(effectiveSearch, { segment }), { replace: true })
                  }
                  onClear={() => clearPin(true)}
                  onBack={() => setBrowseOpen(true)}
                />
              )}
            </Suspense>
          </div>
        ) : null}
      </div>
      {mobileViewport && mobileSheetOpen ? (
        <Suspense fallback={null}>
          <NetworkMapMobileSheet
            open={mobileSheetOpen}
            onOpenChange={setMobileSheetState}
            title={
              mobileMode === "selected" && selectedFeature !== null
                ? `${selectedFeature.properties.label} route inspector`
                : `Browse all ${filteredFeatures.length} routes`
            }
            description={
              mobileMode === "selected" && selectedFeature !== null
                ? "Review route metrics and exact all-day segment evidence before opening route detail."
                : "Keyboard-accessible ranked alternative to the map canvas."
            }
          >
            <NetworkMapMobileOptions
              view={view}
              delayEligible={delayEligible}
              amEligible={amEligible}
              pmEligible={pmEligible}
              lanesVisible={effectiveSearch.lanes === true}
              lanesAvailable={lanesEligible}
              onViewChange={updateView}
              onLanesChange={(visible) =>
                onSearchChange(
                  patchSearch(effectiveSearch, { lanes: visible ? true : undefined }),
                  { replace: true },
                )
              }
            />
            {mobileMode === "selected" && selectedFeature !== null ? (
              <NetworkMapSelected
                feature={selectedFeature}
                route={selectedRoute}
                view={view}
                rank={selectedRank}
                routeCount={filteredFeatures.length}
                releaseCoverage={releaseCoverage}
                delayCoverage={delayCoverage}
                evidence={activeEvidence}
                selectedSegmentId={effectiveSearch.segment}
                segmentNotice={segmentNotice}
                autoFocus={selectedAutoFocus === "mobile"}
                onSelectSegment={(segment) =>
                  onSearchChange(patchSearch(effectiveSearch, { segment }), { replace: true })
                }
                onClear={() => clearPin(true)}
                onBack={() => setMobileMode("browse")}
              />
            ) : (
              <NetworkMapBrowse
                ranked={ranked}
                routeById={routeById}
                view={view}
                query={query}
                pinnedRouteId={selectedRouteId}
                listId="network-map-route-list-mobile"
                searchRef={mobileSearchRef}
                onQueryChange={setQuery}
                onPointerPreview={setPointerPreviewRouteId}
                onFocusPreview={setFocusedPreviewRouteId}
                onPin={(feature, interaction) =>
                  pinRoute(feature.properties.routeId, featureAnchor(feature), interaction)
                }
              />
            )}
          </NetworkMapMobileSheet>
        </Suspense>
      ) : null}
      {dataNotesOpen ? (
        <Suspense fallback={null}>
          <NetworkMapDataNotes
            open={dataNotesOpen}
            onOpenChange={setDataNotesOpen}
            manifest={manifest}
            view={view}
            coverage={delayCoverage}
            completeFactCount={completeFactCount}
            factsStatus={factsStatus}
            mappedRouteCount={network.features.length}
            visibleRouteCount={filteredFeatures.length}
            unverifiedBoroughCount={unverifiedBoroughFeatureCount(network.features)}
            mapMessage={mapMessage}
          />
        </Suspense>
      ) : null}
    </main>
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
