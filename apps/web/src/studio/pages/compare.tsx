import { useState } from "react";
import { CompareProvider } from "@/components/route/CompareContext";
import { DataNotesCompareSection } from "@/components/route/compare/DataNotesCompareSection";
import { InterventionsCompareSection } from "@/components/route/compare/InterventionsCompareSection";
import { OverviewCompareSection } from "@/components/route/compare/OverviewCompareSection";
import { RidersCompareSection } from "@/components/route/compare/RidersCompareSection";
import { SlowSegmentsCompareSection } from "@/components/route/compare/SlowSegmentsCompareSection";
import { TimelineCompareSection } from "@/components/route/compare/TimelineCompareSection";
import type { CompareSides } from "@/components/route/compare/types";
import {
  ROUTE_DETAIL_TABS,
  RouteDetailShell,
  type RouteDetailTabValue,
} from "@/components/route/RouteDetailShell";
import { RouteCompareHeader } from "@/components/route/RouteHeader";
import { TabsContent } from "@/components/ui/tabs";
import type {
  StudioRoute,
  StudioRouteDetailResponse,
  StudioRouteHistoryResponse,
} from "../api-contract.js";
import { StudioPage } from "../page.js";
import { NotFoundPage } from "./not-found.js";

const ROUTE_COMPARE_TABS = ROUTE_DETAIL_TABS.filter(
  (tab) => tab.value !== "map" && tab.value !== "reliability",
);

export function ComparePage({
  detailA,
  detailB,
  historyA,
  historyB,
  options,
}: {
  detailA: StudioRouteDetailResponse | null;
  detailB: StudioRouteDetailResponse | null;
  historyA: StudioRouteHistoryResponse | null;
  historyB: StudioRouteHistoryResponse | null;
  options: readonly StudioRoute[];
}) {
  if (detailA === null || detailB === null) return <NotFoundPage />;

  // CompareProvider drives the URL-backed selection (swap / per-slot picker) off
  // the two routes; the section content reads the full detail responses below.
  return (
    <CompareProvider a={detailA.route} b={detailB.route} options={options}>
      <CompareView a={detailA} b={detailB} historyA={historyA} historyB={historyB} />
    </CompareProvider>
  );
}

function CompareView(sides: CompareSides) {
  const [activeTab, setActiveTab] = useState<RouteDetailTabValue>("overview");
  return (
    <StudioPage flush>
      <RouteDetailShell
        header={<RouteCompareHeader />}
        tabs={ROUTE_COMPARE_TABS}
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as RouteDetailTabValue)}
      >
        <TabsContent value="overview">
          <OverviewCompareSection {...sides} />
        </TabsContent>
        <TabsContent value="where-when">
          <SlowSegmentsCompareSection {...sides} />
        </TabsContent>
        <TabsContent value="riders">
          <RidersCompareSection {...sides} />
        </TabsContent>
        <TabsContent value="treatments">
          <div className="flex flex-col gap-11">
            <InterventionsCompareSection {...sides} />
            <TimelineCompareSection {...sides} />
          </div>
        </TabsContent>
        <TabsContent value="evidence">
          <DataNotesCompareSection {...sides} />
        </TabsContent>
      </RouteDetailShell>
    </StudioPage>
  );
}
