import { type ReactNode, useEffect, useState } from "react";
import { KPISkeleton } from "@/components/KPI";
import { DataNotesSection } from "@/components/route/DataNotesSection";
import { HonestEmptySection } from "@/components/route/HonestEmptySection";
import { OverviewSection } from "@/components/route/OverviewSection";
import { ReliabilitySection } from "@/components/route/ReliabilitySection";
import { RidersSection } from "@/components/route/RidersSection";
import { RouteDetailShell } from "@/components/route/RouteDetailShell";
import { RouteHeader } from "@/components/route/RouteHeader";
import { RouteJudgedKpiStrip } from "@/components/route/RouteJudgedKpiStrip";
import { RouteMapSection } from "@/components/route/RouteMapSection";
import { routeDossierArchetype } from "@/components/route/route-archetype";
import { routeTabBadges } from "@/components/route/route-insight-placement";
import { SlowSegmentsSection } from "@/components/route/SlowSegments";
import {
  ROUTE_DETAIL_TABS,
  type RouteDetailTabValue,
  routeSectionRegistry,
} from "@/components/route/section-registry";
import { TreatmentsHistorySection } from "@/components/route/TreatmentsHistorySection";
import { SegmentRowHeader, SegmentRowSkeleton } from "@/components/SegmentRow";
import { Skeleton } from "@/components/ui/skeleton";
import { TabsContent } from "@/components/ui/tabs";
import { pushRecentRoute } from "@/lib/recent-routes";
import type { StudioRouteDetailResponse } from "../api-contract.js";
import { StudioPage } from "../page.js";
import { NotFoundPage } from "./not-found.js";

function TrackRecentRoute({ slug }: { slug: string }) {
  useEffect(() => {
    pushRecentRoute(slug);
  }, [slug]);
  return null;
}

export function RouteDetailPage({ data }: { data: StudioRouteDetailResponse | null }) {
  if (data === null) return <NotFoundPage />;

  const { route, segments } = data;
  const flagged = segments.find((s) => s.flagged);
  const [activeTab, setActiveTab] = useState<RouteDetailTabValue>("overview");

  const tabBadges = routeTabBadges(data.insights);
  const sectionRegistry = routeSectionRegistry(data.capability, tabBadges);
  const archetype = routeDossierArchetype({ capability: data.capability, dossier: data.dossier });
  const section = (tab: RouteDetailTabValue, render: () => ReactNode) => {
    const presentation = sectionRegistry.presentations[tab];
    if (presentation.mode === "hidden") return null;
    return (
      <TabsContent value={tab}>
        {presentation.mode === "render" ? (
          render()
        ) : (
          <HonestEmptySection state={presentation.state} reason={presentation.reason} />
        )}
      </TabsContent>
    );
  };

  return (
    <StudioPage flush>
      <TrackRecentRoute slug={route.slug} />
      <RouteDetailShell
        header={
          <RouteHeader
            route={route}
            contextLabel={archetype.label}
            metricStrip={
              <RouteJudgedKpiStrip
                route={route}
                dossier={data.dossier}
                capability={data.capability}
                sectionRegistry={sectionRegistry}
                onNavigate={(tab) => setActiveTab(tab)}
              />
            }
          />
        }
        tabs={sectionRegistry.visibleTabs}
        value={
          sectionRegistry.visibleTabs.some((tab) => tab.value === activeTab)
            ? activeTab
            : "overview"
        }
        onValueChange={(value) => setActiveTab(value as RouteDetailTabValue)}
      >
        {section("overview", () => (
          <OverviewSection
            data={data}
            sectionRegistry={sectionRegistry}
            onNavigate={(tab) => setActiveTab(tab)}
          />
        ))}
        {section("map", () => (
          <RouteMapSection data={data} />
        ))}
        {section("where-when", () => (
          <SlowSegmentsSection
            route={route}
            segments={segments}
            insights={data.insights}
            {...(flagged?.id ? { flaggedId: flagged.id } : {})}
            dossier={data.dossier}
          />
        ))}
        {section("reliability", () => (
          <ReliabilitySection data={data} />
        ))}
        {section("riders", () => (
          <RidersSection data={data} />
        ))}
        {section("treatments", () => (
          <TreatmentsHistorySection data={data} />
        ))}
        {section("evidence", () => (
          <DataNotesSection
            data={data}
            sectionRegistry={sectionRegistry}
            onNavigate={(tab) => setActiveTab(tab)}
          />
        ))}
      </RouteDetailShell>
    </StudioPage>
  );
}

export function RouteDetailLoadingPage() {
  return (
    <StudioPage flush>
      <div className="flex h-full min-h-0 flex-col">
        <header className="shrink-0 bg-[var(--bp-color-card)] px-7 pb-[18px] pt-6 shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
          <div className="mb-[18px] flex items-start gap-[18px]">
            <Skeleton className="h-[58px] w-[78px] rounded-[3px]" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-[27px] w-[430px] max-w-full" />
              <Skeleton className="mt-2 h-[14px] w-[520px] max-w-full" />
            </div>
            <div className="flex shrink-0 items-center gap-2 max-md:hidden">
              <Skeleton className="h-[36px] w-[170px] rounded-[3px]" />
              <Skeleton className="h-[36px] w-[126px] rounded-[3px]" />
            </div>
          </div>
          <div className="grid grid-cols-5 gap-6 max-lg:grid-cols-2 max-sm:grid-cols-1">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className={
                  index < 4 ? "border-r border-[var(--bp-color-rule)] pr-5 max-lg:border-r-0" : ""
                }
              >
                <KPISkeleton />
              </div>
            ))}
          </div>
        </header>
        <div className="shrink-0 bg-[var(--bp-color-card)] px-7 shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
          <div className="flex gap-6 py-[10px]">
            {ROUTE_DETAIL_TABS.map((tab) => (
              <Skeleton key={tab.value} className="h-[15px] w-[82px]" />
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-8 py-7">
          <div className="mb-11">
            <div className="mb-4 flex items-end justify-between gap-4 max-md:flex-col max-md:items-start">
              <div>
                <Skeleton className="h-[22px] w-[360px] max-w-full" />
                <Skeleton className="mt-2 h-[13px] w-[520px] max-w-full" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-[26px] w-[70px] rounded-full" />
                <Skeleton className="h-[26px] w-[92px] rounded-full" />
              </div>
            </div>
            <SegmentRowHeader />
            {Array.from({ length: 5 }).map((_, index) => (
              <SegmentRowSkeleton key={index} />
            ))}
          </div>
          <div>
            <Skeleton className="h-[22px] w-[280px]" />
            <Skeleton className="mt-2 h-[13px] w-[520px] max-w-full" />
            <div className="mt-6 grid grid-cols-3 gap-4 max-lg:grid-cols-1">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]"
                >
                  <Skeleton className="h-[14px] w-[140px]" />
                  <Skeleton className="mt-3 h-[10px] w-full" />
                  <Skeleton className="mt-2 h-[10px] w-[80%]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </StudioPage>
  );
}
