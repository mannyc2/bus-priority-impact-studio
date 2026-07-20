import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { DataNotesSection } from "@/components/route/DataNotesSection";
import { HonestEmptySection } from "@/components/route/HonestEmptySection";
import { OverviewSection } from "@/components/route/OverviewSection";
import { ReliabilitySection } from "@/components/route/ReliabilitySection";
import { RidersSection } from "@/components/route/RidersSection";
import { RouteDetailHeader } from "@/components/route/RouteDetailHeader";
import { RouteDetailShell } from "@/components/route/RouteDetailShell";
import { routeSectionBadges } from "@/components/route/route-insight-placement";
import type { RouteDetailSearch } from "@/components/route/route-segment-explorer";
import { SegmentExplorerSection } from "@/components/route/SegmentExplorer";
import {
  type RouteDetailSectionValue,
  type RouteDetailTabValue,
  routeTabForSection,
  routeTabRegistry,
} from "@/components/route/section-registry";
import { TreatmentsHistorySection } from "@/components/route/TreatmentsHistorySection";
import { Skeleton } from "@/components/ui/skeleton";
import { pushRecentRoute } from "@/lib/recent-routes";
import type {
  RouteStudiesArtifact,
  StudioRouteDetailResponse,
  StudioRouteEvidenceBundle,
  StudioRouteInterventionInventoryBundle,
} from "../api-contract.js";
import { StudioPage } from "../page.js";
import { NotFoundPage } from "./not-found.js";

function TrackRecentRoute({ slug }: { slug: string }) {
  useEffect(() => {
    pushRecentRoute(slug);
  }, [slug]);
  return null;
}

export function RouteDetailPage({
  data,
  evidence,
  inventory,
  studies = null,
  search,
}: {
  data: StudioRouteDetailResponse | null;
  evidence: StudioRouteEvidenceBundle | null;
  inventory: StudioRouteInterventionInventoryBundle | null;
  studies?: RouteStudiesArtifact | null;
  search: RouteDetailSearch & { record?: string };
}) {
  const navigate = useNavigate();

  if (data === null) return <NotFoundPage />;

  const { route } = data;

  const tabRegistry = routeTabRegistry(data.capability, routeSectionBadges(data.insights));
  const requestedTab: RouteDetailTabValue = search.tab ?? "overview";
  // Unknown or hidden tab downgrades to Overview (always visible).
  const activeTab: RouteDetailTabValue = tabRegistry.visibleTabs.some(
    (candidate) => candidate.value === requestedTab,
  )
    ? requestedTab
    : "overview";

  const onTabChange = (next: RouteDetailTabValue) => {
    navigate({
      to: "/routes/$routeId",
      params: { routeId: route.slug },
      // Overview is the default view (no query param); other tabs are shareable.
      search: next === "overview" ? {} : { tab: next },
      replace: true,
    });
  };
  // The section-targeted `onNavigate` callbacks now switch tabs instead of
  // scrolling; `evidence`-targeted insights map to no tab (always-present).
  const navigateToTab = (sectionValue: RouteDetailSectionValue) => {
    const target = routeTabForSection(sectionValue);
    if (target !== null) onTabChange(target);
  };

  const section = (sectionValue: RouteDetailSectionValue, render: () => ReactNode) => {
    const presentation = tabRegistry.sectionRegistry.presentations[sectionValue];
    if (presentation.mode === "hidden") return null;
    return (
      <section className="mb-8 last:mb-0">
        {presentation.mode === "render" ? (
          render()
        ) : (
          <HonestEmptySection state={presentation.state} reason={presentation.reason} />
        )}
      </section>
    );
  };

  let panel: ReactNode;
  switch (activeTab) {
    case "overview":
      panel = <OverviewSection data={data} inventory={inventory} onNavigate={navigateToTab} />;
      break;
    case "segments": {
      // One linked explorer owns list + map (plan 081/comp r4). The `map`
      // section renders a map-only explorer just when the ranked list can't
      // (its speed-history surface is empty but geometry is ready), so both
      // capability gates keep meaning something.
      const onSearchChange = (nextSearch: RouteDetailSearch, replace: boolean) => {
        navigate({
          to: "/routes/$routeId",
          params: { routeId: route.slug },
          search: nextSearch,
          replace,
        });
      };
      const whereWhenRenders =
        tabRegistry.sectionRegistry.presentations["where-when"].mode === "render";
      panel = (
        <>
          {section("where-when", () => (
            <SegmentExplorerSection data={data} search={search} onSearchChange={onSearchChange} />
          ))}
          {whereWhenRenders
            ? null
            : section("map", () => (
                <SegmentExplorerSection
                  data={data}
                  search={search}
                  onSearchChange={onSearchChange}
                  mapOnly
                />
              ))}
        </>
      );
      break;
    }
    case "riders":
      panel = (
        <>
          {section("riders", () => (
            <RidersSection
              data={data}
              onOpenSegment={(spineId) => {
                navigate({
                  to: "/routes/$routeId",
                  params: { routeId: route.slug },
                  search:
                    spineId === null ? { tab: "segments" } : { tab: "segments", segment: spineId },
                });
              }}
            />
          ))}
          {section("reliability", () => (
            <ReliabilitySection data={data} />
          ))}
        </>
      );
      break;
    case "history":
      panel = section("treatments", () => (
        <TreatmentsHistorySection
          data={data}
          evidence={evidence}
          inventory={inventory}
          studies={studies}
          studyKey={search.study}
          recordKey={search.record}
        />
      ));
      break;
  }

  return (
    <StudioPage flush>
      <TrackRecentRoute slug={route.slug} />
      <RouteDetailShell
        header={<RouteDetailHeader route={route} dossier={data.dossier} />}
        tabs={tabRegistry.visibleTabs}
        activeTab={activeTab}
        onTabChange={onTabChange}
        aboutData={
          <DataNotesSection
            data={data}
            evidence={evidence}
            sectionRegistry={tabRegistry.sectionRegistry}
            onNavigate={navigateToTab}
          />
        }
      >
        {panel}
      </RouteDetailShell>
    </StudioPage>
  );
}

export function RouteDetailLoadingPage() {
  return (
    <StudioPage flush>
      <div className="h-full min-h-0 overflow-auto">
        <header className="bg-[var(--bp-color-card)] px-7 py-5 shadow-[inset_0_-1px_0_var(--bp-color-rule)] max-md:px-4">
          <div className="flex flex-wrap items-start gap-5">
            <Skeleton className="h-9 w-[100px] rounded-[4px]" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-[26px] w-[360px] max-w-full" />
              <Skeleton className="mt-2 h-[14px] w-[240px] max-w-full" />
              <Skeleton className="mt-2 h-[18px] w-[180px]" />
            </div>
            <div className="flex shrink-0 items-start gap-6 max-md:w-full max-md:justify-start">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="space-y-2">
                  <Skeleton className="h-[11px] w-[64px]" />
                  <Skeleton className="h-[20px] w-[72px]" />
                  <Skeleton className="h-[11px] w-[80px]" />
                </div>
              ))}
            </div>
          </div>
        </header>
        <div className="sticky top-0 z-10 bg-[var(--bp-color-card)] px-7 shadow-[inset_0_-1px_0_var(--bp-color-rule)] max-md:px-4">
          <div className="flex gap-6 py-[10px]">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-[15px] w-[110px]" />
            ))}
          </div>
        </div>
        <div className="px-8 py-8 max-md:px-4">
          <Skeleton className="h-[220px] w-full rounded-[3px]" />
        </div>
      </div>
    </StudioPage>
  );
}
